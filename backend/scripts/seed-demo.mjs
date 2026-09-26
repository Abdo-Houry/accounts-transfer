/**
 * Demo data for a sales walkthrough.
 *
 * Everything is created through the **HTTP API**, never by inserting rows: the
 * whole point of the system is that balances are derived from a double-entry
 * ledger, so demo data has to travel the same path a real operation does. A
 * seeded row written straight into the database would look fine on screen and
 * then fail the reconciliation screen in front of the audience.
 *
 * The one direct database write is the back-dating pass at the end, which only
 * shifts timestamps so the dashboard and reports show a month of history. It
 * shifts the operation and its journal entry by the same offset, so the books
 * stay consistent.
 *
 * Usage (backend/):
 *   node scripts/seed-demo.mjs
 *
 * Safe to run against a freshly migrated + seeded database. Re-running it adds
 * another batch rather than duplicating identities - reset the database first
 * if you want a clean set.
 */

import { Client } from 'pg';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reads the backend `.env` so the script uses the same credentials the running
 * API does. Hard-coding them here would silently drift the moment anyone edits
 * `.env` - which is exactly what happened the first time this was run.
 */
function loadEnv() {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env');
  const values = {};
  try {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match) values[match[1]] = match[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {
    console.warn('No .env found next to the script - falling back to defaults.');
  }
  return { ...values, ...process.env };
}

const env = loadEnv();

const BASE = env.DEMO_API ?? `http://localhost:${env.PORT ?? 4000}${env.API_PREFIX ?? '/api/v1'}`;
const ADMIN_USER = env.SEED_ADMIN_USERNAME ?? 'admin';
const ADMIN_PASS = env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';

const DB = {
  host: env.DB_HOST ?? 'localhost',
  port: Number(env.DB_PORT ?? 5432),
  database: env.DB_DATABASE ?? 'remittance_office',
  user: env.DB_USERNAME ?? 'postgres',
  password: env.DB_PASSWORD ?? 'postgres',
};

let token = null;

async function api(method, path, body) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Language': 'ar',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, body: json };
}

/** Creates, or returns the existing record when the identity is already taken. */
async function ensure(label, create, find) {
  const created = await create();
  if (created.ok) return created.body.data;

  const existing = find ? await find() : null;
  if (existing) return existing;

  console.warn(`  ! could not create ${label}: ${created.body.message ?? created.status}`);
  return null;
}

/** The one password meant to be handed out - the read-only browsing account. */
const DEMO_PASSWORD = 'Demo-View-2026!';

/** Collected so the summary can print each account's own password once. */
let createdStaff = [];

/** Newest N operations per table keep today's date, so the daily view is alive. */
const TODAYS_ROWS = 6;

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const between = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// --------------------------------------------------------------- the data

const CUSTOMERS = [
  { fullName: 'أحمد خليل الحموي', phone: '+963944210337', country: 'سوريا', city: 'حلب' },
  { fullName: 'محمد عبد الرحمن', phone: '+963933118902', country: 'سوريا', city: 'دمشق' },
  { fullName: 'سمر يوسف الحلبي', phone: '+963991447615', country: 'سوريا', city: 'حلب' },
  { fullName: 'خالد إبراهيم نجار', phone: '+963955802174', country: 'سوريا', city: 'حمص' },
  { fullName: 'ليلى مصطفى العلي', phone: '+963988336421', country: 'سوريا', city: 'اللاذقية' },
  { fullName: 'عمر صلاح الدين', phone: '+905324471180', country: 'تركيا', city: 'إسطنبول' },
  { fullName: 'Mehmet Yilmaz', phone: '+905352197744', country: 'تركيا', city: 'أنقرة' },
  { fullName: 'Ayse Demir', phone: '+905436602318', country: 'تركيا', city: 'إزمير' },
  { fullName: 'رنا سليم القاسم', phone: '+963966771508', country: 'سوريا', city: 'طرطوس' },
  { fullName: 'فادي جورج حداد', phone: '+963936559240', country: 'سوريا', city: 'دمشق' },
  { fullName: 'نور الدين بكري', phone: '+905318840972', country: 'تركيا', city: 'غازي عنتاب' },
  { fullName: 'هيثم وليد شاهين', phone: '+963947302866', country: 'سوريا', city: 'دير الزور' },
];

const DESTINATIONS = [
  { country: 'تركيا', city: 'إسطنبول' },
  { country: 'تركيا', city: 'أنقرة' },
  { country: 'تركيا', city: 'غازي عنتاب' },
  { country: 'سوريا', city: 'حلب' },
  { country: 'سوريا', city: 'دمشق' },
  { country: 'لبنان', city: 'بيروت' },
  { country: 'الأردن', city: 'عمّان' },
  { country: 'مصر', city: 'القاهرة' },
];

const BENEFICIARIES = [
  'سارة أحمد الخطيب', 'يوسف منير عبد الله', 'مريم سامي درويش', 'باسل نبيل الأحمد',
  'هدى كمال الرفاعي', 'طارق أسعد زيدان', 'Emine Kaya', 'Burak Sahin',
  'جمال فؤاد المصري', 'ريم عادل الحسن', 'وليد ماهر قاسم', 'نادية رامي سعيد',
];

const CORRESPONDENTS = [
  {
    code: 'IST',
    nameAr: 'مكتب الأمانة للحوالات - إسطنبول',
    nameEn: 'Al-Amana Exchange - Istanbul',
    nameTr: 'Al-Amana Havale - Istanbul',
    country: 'تركيا',
    city: 'إسطنبول',
    phone: '+902122478890',
    contactPerson: 'أنس قره داغ',
  },
  {
    code: 'BEY',
    nameAr: 'شركة الأرز للصرافة - بيروت',
    nameEn: 'Cedar Exchange - Beirut',
    nameTr: 'Sedir Doviz - Beyrut',
    country: 'لبنان',
    city: 'بيروت',
    phone: '+9611345720',
    contactPerson: 'جورج مخايل',
  },
  {
    code: 'CAI',
    nameAr: 'مكتب النيل للتحويلات - القاهرة',
    nameEn: 'Nile Transfers - Cairo',
    nameTr: 'Nil Havale - Kahire',
    country: 'مصر',
    city: 'القاهرة',
    phone: '+20225774410',
    contactPerson: 'شريف الجندي',
  },
  {
    code: 'AMM',
    nameAr: 'مؤسسة البتراء المالية - عمّان',
    nameEn: 'Petra Financial - Amman',
    nameTr: 'Petra Finans - Amman',
    country: 'الأردن',
    city: 'عمّان',
    phone: '+96264612230',
    contactPerson: 'ماهر الزعبي',
  },
];

const EXPENSES = [
  { category: 'RENT', reason: 'إيجار المكتب - شهري' },
  { category: 'SALARY', reason: 'رواتب الموظفين' },
  { category: 'UTILITY', reason: 'فاتورة كهرباء واتصالات' },
  { category: 'EXPENSE', reason: 'مصاريف قرطاسية وتشغيل' },
];

// ------------------------------------------------------------------- main

async function run() {
  console.log('Signing in…');
  const login = await api('POST', '/auth/login', { username: ADMIN_USER, password: ADMIN_PASS });
  if (!login.ok) throw new Error(`Login failed: ${login.body.message ?? login.status}`);
  token = login.body.data.accessToken;

  const currencies = (await api('GET', '/currencies')).body.data;
  const cur = Object.fromEntries(currencies.map((c) => [c.code, c]));

  // ----------------------------------------------------------- cash boxes
  console.log('Cash boxes…');
  let boxes = (await api('GET', '/cash-boxes')).body.data;

  const branch = await ensure(
    'branch cash box',
    () =>
      api('POST', '/cash-boxes', {
        code: 'ALEPPO',
        nameAr: 'صندوق فرع حلب',
        nameEn: 'Aleppo branch box',
        nameTr: 'Halep sube kasasi',
        branch: 'حلب - الجميلية',
      }),
    async () => (await api('GET', '/cash-boxes')).body.data.find((b) => b.code === 'ALEPPO'),
  );

  boxes = (await api('GET', '/cash-boxes')).body.data;
  const main = boxes.find((b) => b.code === 'MAIN') ?? boxes[0];
  const aleppo = branch ?? main;

  // Opening balances: what was already in the drawer on day one. Posted as a
  // real journal entry (DR cash / CR equity), not written into a balance field.
  console.log('Opening balances…');
  const openings = [
    [main.id, cur.SYP.id, '650000000'],
    [main.id, cur.USD.id, '32000'],
    [main.id, cur.TRY.id, '95000'],
    [main.id, cur.EUR.id, '11000'],
    [aleppo.id, cur.SYP.id, '180000000'],
    [aleppo.id, cur.USD.id, '9000'],
  ];
  for (const [boxId, currencyId, amount] of openings) {
    const result = await api('POST', `/cash-boxes/${boxId}/opening-balance`, {
      currencyId,
      amount,
      note: 'رصيد افتتاحي عند بدء التشغيل',
    });
    if (!result.ok && result.body.code !== 'CONFLICT') {
      console.warn(`  ! opening balance: ${result.body.message}`);
    }
  }

  // -------------------------------------------------------------- staff
  console.log('Staff and a read-only demo account…');
  const roles = (await api('GET', '/roles')).body.data;
  const managerRole = roles.find((r) => r.name === 'manager');
  const employeeRole = roles.find((r) => r.name === 'employee');

  /**
   * A browse-only role for the shared demo link: every read screen is visible,
   * nothing can be created or changed. This is what makes it safe to hand the
   * URL to someone you have not met.
   */
  const demoRole = await ensure(
    'demo role',
    () =>
      api('POST', '/roles', {
        name: 'demo',
        description: 'حساب عرض - اطّلاع فقط دون أي صلاحية تعديل',
        permissionCodes: [
          'dashboard.view',
          'report.operational',
          'report.financial',
          'customer.read',
          'currency.read',
          'cashbox.read',
          'transfer.read',
          'exchange.read',
          'voucher.read',
          'commission.read',
          'correspondent.read',
          'ledger.read',
          'audit.read',
          'user.read',
          'role.read',
        ],
      }),
    async () => (await api('GET', '/roles')).body.data.find((r) => r.name === 'demo'),
  );

  const staff = [
    { username: 'manager', fullName: 'سامر ناصر الدين', roleId: managerRole?.id, box: main.id },
    { username: 'cashier.main', fullName: 'رامي عبد القادر', roleId: employeeRole?.id, box: main.id },
    { username: 'cashier.aleppo', fullName: 'لمى حسن الشامي', roleId: employeeRole?.id, box: aleppo.id },
    { username: 'demo', fullName: 'حساب العرض', roleId: demoRole?.id, box: main.id },
  ];

  /**
   * Each account gets its own password.
   *
   * One shared password across the seeded staff would quietly defeat the
   * read-only demo account: hand out `demo`'s credentials and the recipient can
   * try the same password on `manager` and get write access. Only the demo
   * account has a fixed, shareable password; the rest are random and printed
   * once for the operator.
   */
  const randomPassword = () =>
    `Op-${Math.random().toString(36).slice(2, 8)}-${Math.floor(1000 + Math.random() * 9000)}#`;

  for (const person of staff) {
    if (!person.roleId) continue;
    person.password = person.username === 'demo' ? DEMO_PASSWORD : randomPassword();

    const result = await api('POST', '/users', {
      username: person.username,
      password: person.password,
      fullName: person.fullName,
      roleId: person.roleId,
      defaultCashBoxId: person.box,
      language: 'ar',
    });
    if (!result.ok && result.body.code !== 'CONFLICT') {
      console.warn(`  ! user ${person.username}: ${result.body.message}`);
    }
  }
  createdStaff = staff.filter((person) => person.password);

  // ------------------------------------------------------- correspondents
  // Partner offices abroad. Each one carries its own ledger account, so a
  // transfer routed through a partner shows up on the positions board as a
  // balance owed to or from them rather than as cash leaving a drawer.
  console.log('Correspondents…');
  const correspondents = [];
  for (const partner of CORRESPONDENTS) {
    const record = await ensure(
      `correspondent ${partner.code}`,
      () => api('POST', '/correspondents', partner),
      async () => (await api('GET', '/correspondents')).body.data?.find((c) => c.code === partner.code),
    );
    if (record) correspondents.push(record);
  }
  console.log(`  ${correspondents.length} correspondents`);

  // ----------------------------------------------------------- customers
  console.log('Customers…');
  const customers = [];
  for (const person of CUSTOMERS) {
    const record = await ensure(
      `customer ${person.fullName}`,
      () => api('POST', '/customers', person),
      async () => (await api('GET', `/customers?q=${encodeURIComponent(person.phone)}`)).body.data[0],
    );
    if (record) customers.push(record);
  }
  console.log(`  ${customers.length} customers`);

  // ----------------------------------------------------------- transfers
  console.log('Transfers…');
  const transfers = [];

  for (let index = 0; index < 26; index += 1) {
    const sender = pick(customers);
    const destination = pick(DESTINATIONS);
    const box = index % 4 === 0 ? aleppo : main;

    // A realistic mix: mostly USD, some TRY, and a few cross-currency deals
    // where the sender pays USD and the beneficiary is paid in TRY.
    const roll = Math.random();
    const payIn = roll < 0.6 ? cur.USD : roll < 0.8 ? cur.TRY : cur.EUR;
    const crossCurrency = Math.random() < 0.3;

    // Roughly a third go out through a partner office abroad instead of being
    // paid from one of our own drawers - that is what fills the correspondent
    // positions board and gives each partner a running current account.
    const partner = correspondents.length > 0 && Math.random() < 0.35 ? pick(correspondents) : null;

    const payload = {
      senderCustomerId: sender.id,
      senderName: sender.fullName,
      senderPhone: sender.phone,
      beneficiaryName: pick(BENEFICIARIES),
      beneficiaryPhone: `+9053${between(10000000, 99999999)}`,
      beneficiaryCountry: partner ? partner.country ?? destination.country : destination.country,
      beneficiaryCity: partner ? partner.city ?? destination.city : destination.city,
      currencyId: payIn.id,
      amount: String(between(2, 40) * 50),
      cashBoxId: box.id,
      ...(partner ? { payoutCorrespondentId: partner.id } : {}),
      ...(crossCurrency && payIn.code !== 'TRY' ? { payoutCurrencyId: cur.TRY.id } : {}),
    };

    const result = await api('POST', '/transfers', payload);
    if (!result.ok) {
      console.warn(`  ! transfer: ${result.body.message}`);
      continue;
    }
    transfers.push({ ...result.body.data, box, partner });
  }

  // Walk them through the lifecycle so the demo shows every status, and so the
  // ledger carries real payout and reversal entries rather than only creations.
  let sent = 0;
  let received = 0;
  let cancelled = 0;

  for (const [index, transfer] of transfers.entries()) {
    if (index % 7 === 3) continue; // stays PENDING

    if (index % 9 === 5) {
      const result = await api('POST', `/transfers/${transfer.id}/cancel`, {
        reason: 'تراجع المرسل عن الحوالة قبل الإرسال',
        refundCommission: true,
      });
      if (result.ok) cancelled += 1;
      continue;
    }

    const dispatch = await api('POST', `/transfers/${transfer.id}/send`, {});
    if (!dispatch.ok) continue;
    sent += 1;

    if (index % 3 !== 2) {
      // A transfer already routed to a partner keeps that route; only the ones
      // we pay ourselves need a box named at payout time.
      const payout = await api('POST', `/transfers/${transfer.id}/receive`, {
        ...(transfer.partner ? {} : { payoutCashBoxId: transfer.box.id }),
      });
      if (payout.ok) {
        received += 1;
        sent -= 1;
      }
    }
  }
  console.log(`  ${transfers.length} transfers (${received} paid, ${sent} in transit, ${cancelled} cancelled)`);

  // ----------------------------------------------------------- exchanges
  console.log('Currency exchange…');
  let exchanges = 0;

  for (let index = 0; index < 16; index += 1) {
    const officeBuys = Math.random() < 0.55;
    const foreign = pick([cur.USD, cur.EUR, cur.TRY]);
    const box = index % 5 === 0 ? aleppo : main;
    const customer = Math.random() < 0.6 ? pick(customers) : null;

    const payload = officeBuys
      ? {
          fromCurrencyId: foreign.id,
          fromAmount: String(between(1, 9) * 100),
          toCurrencyId: cur.SYP.id,
        }
      : {
          fromCurrencyId: cur.SYP.id,
          fromAmount: String(between(2, 9) * 500_000),
          toCurrencyId: foreign.id,
        };

    const result = await api('POST', '/exchanges', {
      ...payload,
      cashBoxId: box.id,
      ...(customer ? { customerId: customer.id } : { customerName: 'زبون عابر' }),
    });
    if (result.ok) exchanges += 1;
    else console.warn(`  ! exchange: ${result.body.message}`);
  }
  console.log(`  ${exchanges} exchange deals`);

  // ------------------------------------------------------------ vouchers
  console.log('Vouchers…');
  let vouchers = 0;

  for (const expense of EXPENSES) {
    const result = await api('POST', '/vouchers/payment', {
      amount: String(between(2, 12) * 500_000),
      currencyId: cur.SYP.id,
      cashBoxId: main.id,
      category: expense.category,
      reason: expense.reason,
    });
    if (result.ok) vouchers += 1;
    else console.warn(`  ! voucher: ${result.body.message}`);
  }

  for (let index = 0; index < 5; index += 1) {
    const customer = pick(customers);
    const result = await api('POST', '/vouchers/receipt', {
      amount: String(between(1, 9) * 250_000),
      currencyId: cur.SYP.id,
      cashBoxId: index % 2 === 0 ? main.id : aleppo.id,
      customerId: customer.id,
      category: 'CUSTOMER_SETTLEMENT',
      reason: 'تسوية حساب عميل',
    });
    if (result.ok) vouchers += 1;
    else console.warn(`  ! voucher: ${result.body.message}`);
  }
  console.log(`  ${vouchers} vouchers`);

  // ---------------------------------------------------------- back-dating
  console.log('Spreading the history over the last 30 days…');
  await backdate();

  // ------------------------------------------------------------ the proof
  console.log('\nChecking the books…');
  for (const box of [main, aleppo]) {
    const reconciliation = await api('GET', `/cash-boxes/${box.id}/reconciliation`);
    const balanced = reconciliation.body.data?.balanced;
    console.log(`  ${balanced ? 'OK  ' : 'FAIL'} ${box.code} reconciles with the ledger`);
  }

  const trial = (await api('GET', '/ledger/trial-balance')).body.data;
  const totals = new Map();
  for (const row of trial) {
    const current = totals.get(row.currencyCode) ?? { debit: 0, credit: 0 };
    current.debit += Number(row.debit);
    current.credit += Number(row.credit);
    totals.set(row.currencyCode, current);
  }
  for (const [code, value] of totals) {
    const balanced = Math.abs(value.debit - value.credit) < 1e-6;
    console.log(`  ${balanced ? 'OK  ' : 'FAIL'} trial balance balances in ${code}`);
  }

  console.log('\nDemo data ready. Accounts:');
  console.log('  admin'.padEnd(20) + ADMIN_PASS + '   (full access)');
  for (const person of createdStaff) {
    const note = person.username === 'demo' ? '   (read-only - safe to share)' : '';
    console.log(`  ${person.username}`.padEnd(20) + person.password + note);
  }
}

/**
 * Shifts each operation and its journal entry back by the same number of days.
 *
 * Both sides move together on purpose: the dashboard groups transfers by
 * `created_at` while commission income is grouped by the journal entry's
 * `occurred_at`, so shifting only one would make the two disagree on screen.
 */
async function backdate() {
  const client = new Client(DB);
  await client.connect();

  try {
    for (const table of ['transfers', 'currency_exchanges', 'vouchers']) {
      const timestamps = {
        transfers: ['created_at', 'updated_at', 'sent_at', 'received_at', 'cancelled_at'],
        currency_exchanges: ['created_at', 'updated_at', 'reversed_at'],
        vouchers: ['created_at', 'updated_at', 'voided_at'],
      }[table];

      const rows = (await client.query(`SELECT id FROM ${table} ORDER BY created_at`)).rows;
      if (rows.length === 0) continue;

      for (const [index, row] of rows.entries()) {
        // The newest handful stay on today so the daily dashboard - which is
        // what opens first - shows a plausible working day instead of zeros.
        // Everything older fans out across the previous four weeks.
        const remaining = rows.length - 1 - index;
        const spread = Math.max(1, rows.length - TODAYS_ROWS);
        const daysAgo =
          remaining < TODAYS_ROWS
            ? 0
            : Math.round(((remaining - TODAYS_ROWS) / spread) * 28);

        if (daysAgo === 0) continue;
        const shift = `${daysAgo} days`;

        const sets = timestamps.map((column) => `${column} = ${column} - INTERVAL '${shift}'`);
        await client.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $1`, [row.id]);

        // The journal entries that this operation produced move with it.
        await client.query(
          `UPDATE financial_transactions
              SET occurred_at = occurred_at - INTERVAL '${shift}',
                  created_at  = created_at  - INTERVAL '${shift}'
            WHERE source_id = $1`,
          [row.id],
        );
        await client.query(
          `UPDATE ledger_entries
              SET created_at = created_at - INTERVAL '${shift}'
            WHERE transaction_id IN (SELECT id FROM financial_transactions WHERE source_id = $1)`,
          [row.id],
        );
      }
    }
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('Demo seeding failed:', error.message);
  process.exit(1);
});
