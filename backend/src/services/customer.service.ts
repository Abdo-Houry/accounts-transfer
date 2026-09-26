import type { EntityManager } from 'typeorm';
import { AppDataSource } from '../config/data-source';
import { ACCOUNT_CODES } from '../config/accounts';
import { runningBalance, type StatementLine } from './correspondent.service';
import { Customer } from '../entities/customer.entity';
import { CurrencyExchange } from '../entities/currency-exchange.entity';
import { LedgerEntry } from '../entities/ledger-entry.entity';
import { Transfer } from '../entities/transfer.entity';
import { Voucher } from '../entities/voucher.entity';
import { CustomerStatus } from '../types/enums';
import type { Paginated, RequestContext } from '../types/common';
import { ApiError } from '../utils/api-error';
import { money } from '../utils/money';
import { normalizePagination, paginate, safeSort, safeSortOrder } from '../utils/pagination';
import { nextCustomerNumber } from '../utils/sequence';
import { AuditService, AUDIT_ACTIONS } from './audit.service';

export interface CreateCustomerInput {
  fullName: string;
  phone: string;
  altPhone?: string;
  nationalId?: string;
  country?: string;
  city?: string;
  address?: string;
  notes?: string;
}

export type UpdateCustomerInput = Partial<CreateCustomerInput>;

export interface CustomerListQuery {
  page?: number;
  limit?: number;
  q?: string;
  status?: CustomerStatus;
  sortBy?: string;
  sortOrder?: string;
}

export interface CustomerBalanceRow {
  currencyId: string;
  currencyCode: string;
  decimalPlaces: number;
  /** Movement on the customer control accounts, over the whole history. */
  debit: string;
  credit: string;
  /** Positive: the office owes the customer. Negative: the customer owes the office. */
  net: string;
}

export interface CustomerStatement {
  customer: Customer;
  transfersSent: Transfer[];
  transfersReceived: Transfer[];
  exchanges: CurrencyExchange[];
  vouchers: Voucher[];
  balances: CustomerBalanceRow[];
}

const SORTABLE = ['createdAt', 'fullName', 'customerNo'] as const;

export class CustomerService {
  static async list(query: CustomerListQuery): Promise<Paginated<Customer>> {
    const { page, limit, skip, take } = normalizePagination(query);
    const sortBy = safeSort(query.sortBy, SORTABLE, 'createdAt');
    const sortOrder = safeSortOrder(query.sortOrder);

    const builder = AppDataSource.getRepository(Customer)
      .createQueryBuilder('customer')
      .orderBy(`customer.${sortBy}`, sortOrder)
      .skip(skip)
      .take(take);

    if (query.status) builder.andWhere('customer.status = :status', { status: query.status });
    if (query.q) {
      const term = `%${query.q.trim()}%`;
      builder.andWhere(
        '(customer.full_name ILIKE :term OR customer.phone ILIKE :term OR customer.alt_phone ILIKE :term OR customer.customer_no ILIKE :term OR customer.national_id ILIKE :term)',
        { term },
      );
    }

    const [items, total] = await builder.getManyAndCount();
    return paginate(items, page, limit, total);
  }

  static async findByIdOrThrow(manager: EntityManager, id: string): Promise<Customer> {
    const customer = await manager.getRepository(Customer).findOne({ where: { id } });
    if (!customer) throw ApiError.notFound('customer.notFound');
    return customer;
  }

  /** Loads a customer and refuses blocked ones - used before booking anything. */
  static async requireActive(manager: EntityManager, id: string): Promise<Customer> {
    const customer = await CustomerService.findByIdOrThrow(manager, id);
    if (customer.status === CustomerStatus.BLOCKED) {
      throw ApiError.conflict('customer.blocked', { name: customer.fullName });
    }
    return customer;
  }

  static async create(context: RequestContext, input: CreateCustomerInput): Promise<Customer> {
    return AppDataSource.transaction(async (manager) => {
      const phone = input.phone.trim();
      const duplicate = await manager.getRepository(Customer).findOne({ where: { phone } });
      if (duplicate) {
        throw ApiError.conflict('customer.phoneTaken', { phone, name: duplicate.fullName });
      }

      const customer = manager.create(Customer, {
        customerNo: await nextCustomerNumber(manager),
        fullName: input.fullName.trim(),
        phone,
        altPhone: input.altPhone?.trim() || null,
        nationalId: input.nationalId?.trim() || null,
        country: input.country ?? null,
        city: input.city ?? null,
        address: input.address ?? null,
        notes: input.notes ?? null,
        status: CustomerStatus.ACTIVE,
        createdById: context.userId,
      });
      await manager.save(Customer, customer);

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.CUSTOMER_CREATED,
        entityType: 'customer',
        entityId: customer.id,
        after: { customerNo: customer.customerNo, fullName: customer.fullName, phone },
        description: `Customer ${customer.customerNo} created`,
        descriptionKey: 'audit.desc.customerCreated',
        descriptionParams: { no: customer.customerNo },
      });

      return customer;
    });
  }

  static async update(
    context: RequestContext,
    id: string,
    input: UpdateCustomerInput,
  ): Promise<Customer> {
    return AppDataSource.transaction(async (manager) => {
      const customer = await CustomerService.findByIdOrThrow(manager, id);
      const before = { ...customer };

      if (input.phone && input.phone.trim() !== customer.phone) {
        const duplicate = await manager
          .getRepository(Customer)
          .findOne({ where: { phone: input.phone.trim() } });
        if (duplicate && duplicate.id !== customer.id) {
          throw ApiError.conflict('customer.phoneTaken', {
            phone: input.phone,
            name: duplicate.fullName,
          });
        }
      }

      Object.assign(customer, {
        fullName: input.fullName?.trim() ?? customer.fullName,
        phone: input.phone?.trim() ?? customer.phone,
        altPhone: input.altPhone !== undefined ? input.altPhone || null : customer.altPhone,
        nationalId: input.nationalId !== undefined ? input.nationalId || null : customer.nationalId,
        country: input.country ?? customer.country,
        city: input.city ?? customer.city,
        address: input.address ?? customer.address,
        notes: input.notes ?? customer.notes,
      });
      await manager.save(Customer, customer);

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.CUSTOMER_UPDATED,
        entityType: 'customer',
        entityId: customer.id,
        before,
        after: { ...customer },
        description: `Customer ${customer.customerNo} updated`,
        descriptionKey: 'audit.desc.customerUpdated',
        descriptionParams: { no: customer.customerNo },
      });

      return customer;
    });
  }

  static async setStatus(
    context: RequestContext,
    id: string,
    status: CustomerStatus,
  ): Promise<Customer> {
    return AppDataSource.transaction(async (manager) => {
      const customer = await CustomerService.findByIdOrThrow(manager, id);
      const before = customer.status;
      customer.status = status;
      await manager.save(Customer, customer);

      await AuditService.recordInTransaction(manager, AuditService.actorFromContext(context), {
        action: AUDIT_ACTIONS.CUSTOMER_UPDATED,
        entityType: 'customer',
        entityId: customer.id,
        before: { status: before },
        after: { status },
        description: `Customer ${customer.customerNo} status -> ${status}`,
        descriptionKey: 'audit.desc.customerStatus',
        descriptionParams: { no: customer.customerNo, status },
      });

      return customer;
    });
  }

  /**
   * Everything the office has ever done with this customer, plus the net
   * position per currency taken straight from the ledger (so it agrees with the
   * books rather than with a separately maintained figure).
   */
  static async statement(id: string, limit = 50): Promise<CustomerStatement> {
    const customer = await CustomerService.findByIdOrThrow(AppDataSource.manager, id);

    const [transfersSent, transfersReceived, exchanges, vouchers] = await Promise.all([
      AppDataSource.getRepository(Transfer).find({
        where: { senderCustomerId: id },
        relations: { currency: true, payoutCurrency: true, cashBox: true },
        order: { createdAt: 'DESC' },
        take: limit,
      }),
      AppDataSource.getRepository(Transfer).find({
        where: { beneficiaryCustomerId: id },
        relations: { currency: true, payoutCurrency: true, cashBox: true },
        order: { createdAt: 'DESC' },
        take: limit,
      }),
      AppDataSource.getRepository(CurrencyExchange).find({
        where: { customerId: id },
        relations: { fromCurrency: true, toCurrency: true, cashBox: true },
        order: { createdAt: 'DESC' },
        take: limit,
      }),
      AppDataSource.getRepository(Voucher).find({
        where: { customerId: id },
        relations: { currency: true, cashBox: true },
        order: { createdAt: 'DESC' },
        take: limit,
      }),
    ]);

    /*
     * A customer's balance is the balance of the customer control accounts and
     * nothing else.
     *
     * Summing every entry that merely *mentions* the customer looks equivalent
     * and is not: both legs of a settlement voucher carry the customer id - the
     * cash that came over the counter and the payable it settled - so the two
     * cancel and every customer reported a balance of exactly zero. Restricting
     * it to 1100/2100 asks the question the statement is actually asking:
     * what does this office owe them, or they owe this office.
     */
    const rows: Array<{ currency_id: string; code: string; decimal_places: number; debit: string; credit: string }> =
      await AppDataSource.query(
        `SELECT e.currency_id,
                c.code,
                c.decimal_places,
                COALESCE(SUM(CASE WHEN e.direction = 'DEBIT'  THEN e.amount ELSE 0 END), 0)::text AS debit,
                COALESCE(SUM(CASE WHEN e.direction = 'CREDIT' THEN e.amount ELSE 0 END), 0)::text AS credit
           FROM ledger_entries e
           JOIN currencies c ON c.id = e.currency_id
           JOIN accounts   a ON a.id = e.account_id
          WHERE e.customer_id = $1
            AND a.code IN ($2, $3)
          GROUP BY e.currency_id, c.code, c.decimal_places
          ORDER BY c.code`,
        [id, ACCOUNT_CODES.CUSTOMER_RECEIVABLE, ACCOUNT_CODES.CUSTOMER_PAYABLE],
      );

    return {
      customer,
      transfersSent,
      transfersReceived,
      exchanges,
      vouchers,
      balances: rows.map((row) => ({
        currencyId: row.currency_id,
        currencyCode: row.code,
        decimalPlaces: row.decimal_places,
        debit: money(row.debit).toString(),
        credit: money(row.credit).toString(),
        // Positive: the office owes the customer. Negative: they owe the office.
        net: money(row.credit).sub(money(row.debit)).toString(),
      })),
    };
  }

  /**
   * Account statement: the customer's own account movement, oldest first, with
   * the balance it left behind after each line.
   *
   * Restricted to the customer control accounts for the same reason the balance
   * is - the cash leg of a voucher belongs to the office's box, not to the
   * customer's account, and including it makes the running balance meaningless.
   */
  static async accountStatement(
    id: string,
    options: { currencyId?: string; from?: Date; to?: Date; limit?: number } = {},
  ): Promise<StatementLine[]> {
    await CustomerService.findByIdOrThrow(AppDataSource.manager, id);

    const builder = AppDataSource.getRepository(LedgerEntry)
      .createQueryBuilder('entry')
      .innerJoinAndSelect('entry.transaction', 'transaction')
      .innerJoinAndSelect('entry.currency', 'currency')
      .innerJoin('entry.account', 'account')
      .where('entry.customer_id = :id', { id })
      .andWhere('account.code IN (:...codes)', {
        codes: [ACCOUNT_CODES.CUSTOMER_RECEIVABLE, ACCOUNT_CODES.CUSTOMER_PAYABLE],
      })
      .orderBy('transaction.occurredAt', 'ASC')
      .addOrderBy('entry.lineNo', 'ASC')
      .take(options.limit ?? 500);

    if (options.currencyId) {
      builder.andWhere('entry.currency_id = :currencyId', { currencyId: options.currencyId });
    }
    if (options.from) builder.andWhere('transaction.occurred_at >= :from', { from: options.from });
    if (options.to) builder.andWhere('transaction.occurred_at <= :to', { to: options.to });

    // A customer account is a liability of the office, so a *credit* is what
    // increases what they are owed; the shared helper runs debit-positive, and
    // the sign is flipped here so the column reads the way a customer expects.
    return runningBalance(await builder.getMany(), 'CREDIT');
  }

  /** Recent ledger movement attributed to a customer. */
  static async ledger(id: string, page = 1, limit = 25): Promise<Paginated<LedgerEntry>> {
    const pagination = normalizePagination({ page, limit });
    const [items, total] = await AppDataSource.getRepository(LedgerEntry)
      .createQueryBuilder('entry')
      .innerJoinAndSelect('entry.transaction', 'transaction')
      .innerJoinAndSelect('entry.currency', 'currency')
      .leftJoinAndSelect('entry.account', 'account')
      .where('entry.customer_id = :id', { id })
      .orderBy('transaction.occurredAt', 'DESC')
      .skip(pagination.skip)
      .take(pagination.take)
      .getManyAndCount();

    return paginate(items, pagination.page, pagination.limit, total);
  }
}
