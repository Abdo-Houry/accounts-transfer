import 'reflect-metadata';
import bcrypt from 'bcrypt';
import type { EntityManager } from 'typeorm';
import { AppDataSource, initializeDataSource } from '../../config/data-source';
import { env } from '../../config/env';
import { ACCOUNT_SEEDS, ACCOUNT_CODES, cashAccountCode } from '../../config/accounts';
import {
  ALL_PERMISSIONS,
  PERMISSION_CATALOGUE,
  ROLE_PRESETS,
  SYSTEM_ROLES,
  type SystemRoleName,
} from '../../config/permissions';
import { Account } from '../../entities/account.entity';
import { CashBox } from '../../entities/cash-box.entity';
import { CommissionRule } from '../../entities/commission-rule.entity';
import { Currency } from '../../entities/currency.entity';
import { ExchangeRate } from '../../entities/exchange-rate.entity';
import { Permission } from '../../entities/permission.entity';
import { Role } from '../../entities/role.entity';
import { User } from '../../entities/user.entity';
import {
  AccountType,
  CashBoxStatus,
  CommissionMethod,
  CommissionOperation,
  EntryDirection,
  Language,
  UserStatus,
} from '../../types/enums';
import { logger } from '../../utils/logger';

/**
 * Idempotent seeder.
 *
 * Safe to run repeatedly: every step upserts by natural key, so re-running it
 * after adding a permission or a currency tops the database up instead of
 * duplicating or wiping anything. It never touches operational data.
 */

interface CurrencySeed {
  code: string;
  nameAr: string;
  nameEn: string;
  nameTr: string;
  symbol: string;
  decimalPlaces: number;
  sortOrder: number;
  /** Indicative opening board, only applied when no rate exists yet. */
  buyRate?: string;
  sellRate?: string;
}

const CURRENCIES: CurrencySeed[] = [
  { code: 'SYP', nameAr: 'ليرة سورية', nameEn: 'Syrian Pound', nameTr: 'Suriye Lirasi', symbol: 'ل.س', decimalPlaces: 0, sortOrder: 1 },
  { code: 'USD', nameAr: 'دولار أمريكي', nameEn: 'US Dollar', nameTr: 'ABD Dolari', symbol: '$', decimalPlaces: 2, sortOrder: 2, buyRate: '10000', sellRate: '10100' },
  { code: 'EUR', nameAr: 'يورو', nameEn: 'Euro', nameTr: 'Euro', symbol: '€', decimalPlaces: 2, sortOrder: 3, buyRate: '11500', sellRate: '11700' },
  { code: 'TRY', nameAr: 'ليرة تركية', nameEn: 'Turkish Lira', nameTr: 'Turk Lirasi', symbol: '₺', decimalPlaces: 2, sortOrder: 4, buyRate: '250', sellRate: '270' },
  { code: 'GBP', nameAr: 'جنيه إسترليني', nameEn: 'British Pound', nameTr: 'Ingiliz Sterlini', symbol: '£', decimalPlaces: 2, sortOrder: 5, buyRate: '13200', sellRate: '13500' },
];

async function seedPermissions(manager: EntityManager): Promise<Map<string, Permission>> {
  const repository = manager.getRepository(Permission);
  const existing = await repository.find();
  const byCode = new Map(existing.map((permission) => [permission.code, permission]));

  const toInsert = PERMISSION_CATALOGUE.filter((entry) => !byCode.has(entry.code)).map((entry) =>
    repository.create({
      code: entry.code,
      module: entry.module,
      description: entry.description,
    }),
  );

  if (toInsert.length > 0) {
    const saved = await repository.save(toInsert);
    for (const permission of saved) byCode.set(permission.code, permission);
    logger.info(`Seeded ${saved.length} permission(s)`);
  }

  return byCode;
}

async function seedRoles(
  manager: EntityManager,
  permissions: Map<string, Permission>,
): Promise<Map<string, Role>> {
  const repository = manager.getRepository(Role);
  const result = new Map<string, Role>();

  for (const name of Object.values(SYSTEM_ROLES) as SystemRoleName[]) {
    let role = await repository.findOne({ where: { name }, relations: { permissions: true } });

    if (!role) {
      role = repository.create({
        name,
        description: `System role: ${name}`,
        isSystem: true,
        permissions: [],
      });
      logger.info(`Creating system role "${name}"`);
    }

    // Grant any newly introduced permission, but never take one away - an
    // administrator may deliberately have narrowed a role.
    const current = new Set((role.permissions ?? []).map((permission) => permission.code));
    const missing = ROLE_PRESETS[name].filter((code) => !current.has(code));

    if (missing.length > 0 || !role.id) {
      role.permissions = [
        ...(role.permissions ?? []),
        ...missing.map((code) => permissions.get(code)).filter((p): p is Permission => Boolean(p)),
      ];
      role.isSystem = true;
      await repository.save(role);
      if (missing.length > 0) logger.info(`Role "${name}": granted ${missing.length} new permission(s)`);
    }

    result.set(name, role);
  }

  return result;
}

async function seedAdmin(manager: EntityManager, roles: Map<string, Role>): Promise<User> {
  const repository = manager.getRepository(User);
  const username = env.SEED_ADMIN_USERNAME.toLowerCase();

  const existing = await repository.findOne({ where: { username } });
  if (existing) return existing;

  const admin = repository.create({
    username,
    fullName: env.SEED_ADMIN_FULLNAME,
    email: null,
    passwordHash: await bcrypt.hash(env.SEED_ADMIN_PASSWORD, env.BCRYPT_ROUNDS),
    roleId: roles.get(SYSTEM_ROLES.ADMIN)!.id,
    language: env.DEFAULT_LANGUAGE as Language,
    status: UserStatus.ACTIVE,
    tokenVersion: 0,
  });
  await repository.save(admin);

  logger.warn(
    `Administrator "${username}" created with the seed password. Change it immediately after the first sign-in.`,
  );
  return admin;
}

async function seedCurrencies(manager: EntityManager): Promise<Map<string, Currency>> {
  const repository = manager.getRepository(Currency);
  const result = new Map<string, Currency>();

  for (const seed of CURRENCIES) {
    let currency = await repository.findOne({ where: { code: seed.code } });
    if (!currency) {
      currency = repository.create({
        code: seed.code,
        nameAr: seed.nameAr,
        nameEn: seed.nameEn,
        nameTr: seed.nameTr,
        symbol: seed.symbol,
        decimalPlaces: seed.decimalPlaces,
        sortOrder: seed.sortOrder,
        isBase: seed.code === env.BASE_CURRENCY,
        isActive: true,
      });
      await repository.save(currency);
      logger.info(`Seeded currency ${seed.code}`);
    }
    result.set(seed.code, currency);
  }

  // Exactly one base currency, matching BASE_CURRENCY.
  const base = result.get(env.BASE_CURRENCY);
  if (!base) {
    throw new Error(`BASE_CURRENCY ${env.BASE_CURRENCY} is not part of the seeded currency list`);
  }
  if (!base.isBase) {
    await repository.update({ isBase: true }, { isBase: false });
    base.isBase = true;
    await repository.save(base);
  }

  return result;
}

async function seedAccounts(manager: EntityManager): Promise<void> {
  const repository = manager.getRepository(Account);

  for (const seed of ACCOUNT_SEEDS) {
    const existing = await repository.findOne({ where: { code: seed.code } });
    if (existing) continue;

    const parent = seed.parentCode
      ? await repository.findOne({ where: { code: seed.parentCode } })
      : null;

    await repository.save(
      repository.create({
        code: seed.code,
        nameAr: seed.nameAr,
        nameEn: seed.nameEn,
        nameTr: seed.nameTr,
        type: seed.type,
        normalBalance: seed.normalBalance,
        parentId: parent?.id ?? null,
        isSystem: true,
        isActive: true,
      }),
    );
    logger.info(`Seeded account ${seed.code}`);
  }
}

/** The office needs at least one box, and every box needs its cash account. */
async function seedMainCashBox(manager: EntityManager): Promise<CashBox> {
  const boxRepository = manager.getRepository(CashBox);
  const accountRepository = manager.getRepository(Account);

  let box = await boxRepository.findOne({ where: { code: 'MAIN' } });
  if (!box) {
    box = boxRepository.create({
      code: 'MAIN',
      nameAr: 'الصندوق الرئيسي',
      nameEn: 'Main cash box',
      nameTr: 'Ana kasa',
      branch: null,
      status: CashBoxStatus.ACTIVE,
      allowsNegative: false,
      description: 'Default cash box created by the seeder',
    });
    await boxRepository.save(box);
    logger.info('Seeded cash box MAIN');
  }

  const code = cashAccountCode(box.code);
  const account = await accountRepository.findOne({ where: { code } });
  if (!account) {
    const parent = await accountRepository.findOne({ where: { code: ACCOUNT_CODES.CASH } });
    await accountRepository.save(
      accountRepository.create({
        code,
        nameAr: `نقدية - ${box.nameAr}`,
        nameEn: `Cash - ${box.nameEn}`,
        nameTr: `Kasa - ${box.nameTr}`,
        type: AccountType.ASSET,
        normalBalance: EntryDirection.DEBIT,
        parentId: parent?.id ?? null,
        cashBoxId: box.id,
        isSystem: true,
        isActive: true,
      }),
    );
    logger.info(`Seeded cash account ${code}`);
  }

  return box;
}

/**
 * Indicative opening board. Only written when a currency has no rate at all, so
 * a real board published by the office is never overwritten by a re-run.
 */
async function seedRates(
  manager: EntityManager,
  currencies: Map<string, Currency>,
  admin: User,
): Promise<void> {
  const repository = manager.getRepository(ExchangeRate);

  for (const seed of CURRENCIES) {
    if (!seed.buyRate || !seed.sellRate) continue;

    const currency = currencies.get(seed.code);
    if (!currency || currency.isBase) continue;

    const existing = await repository.findOne({ where: { currencyId: currency.id } });
    if (existing) continue;

    await repository.save(
      repository.create({
        currencyId: currency.id,
        buyRate: seed.buyRate,
        sellRate: seed.sellRate,
        effectiveFrom: new Date(),
        effectiveTo: null,
        isActive: true,
        previousRateId: null,
        createdById: admin.id,
        note: 'Seeded opening rate - replace with the real board',
      }),
    );
    logger.info(`Seeded rate for ${seed.code}: ${seed.buyRate} / ${seed.sellRate}`);
  }
}

/** A sensible starting fee schedule; fully editable from the UI afterwards. */
async function seedCommissionRules(manager: EntityManager): Promise<void> {
  const repository = manager.getRepository(CommissionRule);
  if ((await repository.count()) > 0) return;

  await repository.save([
    repository.create({
      name: 'Transfer - 1% (min 2, max 50)',
      operation: CommissionOperation.TRANSFER,
      currencyId: null,
      method: CommissionMethod.PERCENT,
      percent: '1',
      minAmount: '2',
      maxAmount: '50',
      priority: 10,
      isActive: true,
    }),
    repository.create({
      name: 'Exchange - 0.25%',
      operation: CommissionOperation.EXCHANGE,
      currencyId: null,
      method: CommissionMethod.PERCENT,
      percent: '0.25',
      priority: 10,
      isActive: true,
    }),
  ]);
  logger.info('Seeded default commission rules');
}

/**
 * Runs the whole base seed. Exported so a host without shell access can have
 * the deploy itself call it - see SEED_ON_BOOT.
 *
 * `closeWhenDone` is false when the server calls this, because the server still
 * needs the connection this would otherwise tear down.
 */
export async function seedBaseData(closeWhenDone = true): Promise<void> {
  await initializeDataSource();

  await AppDataSource.transaction(async (manager) => {
    const permissions = await seedPermissions(manager);
    const roles = await seedRoles(manager, permissions);
    const admin = await seedAdmin(manager, roles);
    const currencies = await seedCurrencies(manager);
    await seedAccounts(manager);
    await seedMainCashBox(manager);
    await seedRates(manager, currencies, admin);
    await seedCommissionRules(manager);
  });

  logger.info('Seeding complete', { permissions: ALL_PERMISSIONS.length });
  if (closeWhenDone) await AppDataSource.destroy();
}

if (require.main === module) {
  seedBaseData().catch(async (error) => {
    logger.error('Seeding failed', { error });
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
    process.exit(1);
  });
}
