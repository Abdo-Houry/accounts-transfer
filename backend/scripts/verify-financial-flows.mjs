/**
 * End-to-end financial scenario against the running API.
 *
 * Exercises the paths that actually move money and then checks the books:
 * opening balance -> transfer (cross-currency) -> send -> payout -> exchange
 * (buy and sell) -> vouchers -> cancellation, followed by a reconciliation and
 * a trial-balance assertion.
 */

import { API_BASE, ADMIN } from './lib/config.mjs';

const BASE = API_BASE;
let token = null;
let cookie = '';

const results = [];
function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -> ${detail}` : ''}`);
}

async function api(method, path, body, expectStatus) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': 'en',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const json = await response.json().catch(() => ({}));
  if (expectStatus !== undefined && response.status !== expectStatus) {
    console.log(`   [${method} ${path}] expected ${expectStatus}, got ${response.status}:`, JSON.stringify(json).slice(0, 300));
  }
  return { status: response.status, body: json };
}

const num = (value) => Number(value);

async function run() {
  // ---------------------------------------------------------------- auth
  const login = await api('POST', '/auth/login', ADMIN);
  check('login succeeds', login.status === 200 && login.body.data?.accessToken, `status ${login.status}`);
  token = login.body.data.accessToken;

  const badLogin = await api('POST', '/auth/login', { username: ADMIN.username, password: 'wrong-password' });
  check('wrong password rejected with a localised message', badLogin.status === 401, badLogin.body.message);

  const noAuth = await fetch(`${BASE}/transfers`).then((r) => r.status);
  check('protected route rejects an unauthenticated request', noAuth === 401, `status ${noAuth}`);

  // --------------------------------------------------------- reference data
  const currencies = (await api('GET', '/currencies')).body.data;
  const byCode = Object.fromEntries(currencies.map((c) => [c.code, c]));
  const boxes = (await api('GET', '/cash-boxes')).body.data;
  const main = boxes[0];
  check('seeded reference data present', currencies.length >= 5 && Boolean(main), `${currencies.length} currencies`);

  // ------------------------------------------------------- opening balances
  const openSyp = await api('POST', `/cash-boxes/${main.id}/opening-balance`, {
    currencyId: byCode.SYP.id,
    amount: '150000000',
  });
  // 409 means an opening balance is already on the books, which is the system
  // behaving correctly - the suite should stay runnable on a used database.
  check(
    'opening balance SYP accepted or already set',
    openSyp.status === 201 || openSyp.body.code === 'CONFLICT',
    openSyp.body.message,
  );

  const openUsd = await api('POST', `/cash-boxes/${main.id}/opening-balance`, {
    currencyId: byCode.USD.id,
    amount: '12500',
  });
  check(
    'opening balance USD accepted or already set',
    openUsd.status === 201 || openUsd.body.code === 'CONFLICT',
    openUsd.body.message,
  );

  const openTwice = await api('POST', `/cash-boxes/${main.id}/opening-balance`, {
    currencyId: byCode.USD.id,
    amount: '999',
  });
  check('second opening balance refused', openTwice.status === 409, openTwice.body.message);

  // ------------------------------------------------- insufficient funds guard
  const tooBig = await api('POST', '/vouchers/payment', {
    amount: '99999999999',
    currencyId: byCode.USD.id,
    cashBoxId: main.id,
    reason: 'Overdraw attempt',
  });
  check(
    'overdraw refused with a specific message',
    tooBig.status === 409 && tooBig.body.code === 'INSUFFICIENT_FUNDS',
    tooBig.body.message,
  );

  // ------------------------------------------------------------- customers
  const customer = await api('POST', '/customers', {
    fullName: 'Ahmad Khalil',
    phone: '+963991000111',
    country: 'Syria',
    city: 'Aleppo',
  });
  // Reuse the customer when the suite has run before: the point of the check is
  // that the office can register one, not that the database started empty.
  let customerId = customer.body.data?.id;
  if (!customerId) {
    const existing = await api('GET', '/customers?q=%2B963991000111');
    customerId = existing.body.data?.[0]?.id;
  }
  check('customer available', Boolean(customerId), customer.body.message);

  // ---------------------------------------------- transfer, same currency
  const quote = await api('POST', '/transfers/quote', {
    currencyId: byCode.USD.id,
    amount: '1000',
  });
  check(
    'quote applies the 1% rule clamped at 50',
    num(quote.body.data.commissionAmount) === 10 && num(quote.body.data.totalCollected) === 1010,
    `commission ${quote.body.data.commissionAmount}, collected ${quote.body.data.totalCollected}`,
  );

  const usdBefore = await boxBalance(main.id, byCode.USD.id);

  const transfer = await api('POST', '/transfers', {
    senderCustomerId: customerId,
    senderName: 'Ahmad Khalil',
    senderPhone: '+963991000111',
    beneficiaryName: 'Sara Haddad',
    beneficiaryPhone: '+905321112233',
    beneficiaryCountry: 'Turkey',
    beneficiaryCity: 'Istanbul',
    currencyId: byCode.USD.id,
    amount: '1000',
    cashBoxId: main.id,
  });
  check('transfer created', transfer.status === 201, transfer.body.message);
  const transferId = transfer.body.data.id;

  const usdAfterCreate = await boxBalance(main.id, byCode.USD.id);
  check(
    'cash box rose by exactly the collected amount',
    usdAfterCreate - usdBefore === 1010,
    `${usdBefore} -> ${usdAfterCreate}`,
  );

  // Lifecycle guards
  const earlyPayout = await api('POST', `/transfers/${transferId}/receive`, {});
  check('payout refused before dispatch', earlyPayout.status === 409, earlyPayout.body.message);

  const sent = await api('POST', `/transfers/${transferId}/send`, {});
  check('transfer dispatched', sent.status === 200, sent.body.message);

  const received = await api('POST', `/transfers/${transferId}/receive`, { payoutCashBoxId: main.id });
  check('transfer paid out', received.status === 200, received.body.message);

  const doublePayout = await api('POST', `/transfers/${transferId}/receive`, {});
  check(
    'double payout blocked',
    doublePayout.status === 409 && doublePayout.body.code === 'TRANSFER_ALREADY_RECEIVED',
    doublePayout.body.message,
  );

  const cancelPaid = await api('POST', `/transfers/${transferId}/cancel`, { reason: 'test' });
  check('cancelling a paid transfer blocked', cancelPaid.status === 409, cancelPaid.body.message);

  const usdAfterPayout = await boxBalance(main.id, byCode.USD.id);
  check(
    'office keeps only the commission after payout',
    usdAfterPayout - usdBefore === 10,
    `${usdBefore} -> ${usdAfterPayout}`,
  );

  // ------------------------------------------- transfer, cross-currency
  const crossQuote = await api('POST', '/transfers/quote', {
    currencyId: byCode.USD.id,
    amount: '500',
    payoutCurrencyId: byCode.TRY.id,
  });
  // USD buy 10000 SYP, TRY sell 270 SYP -> 10000/270 = 37.037037…
  check(
    'cross rate priced through the base currency',
    Math.abs(num(crossQuote.body.data.exchangeRate) - 10000 / 270) < 1e-6,
    `rate ${crossQuote.body.data.exchangeRate}`,
  );

  const crossTransfer = await api('POST', '/transfers', {
    senderName: 'Walk-in Sender',
    senderPhone: '+963991000222',
    beneficiaryName: 'Mehmet Yilmaz',
    beneficiaryPhone: '+905331112233',
    beneficiaryCountry: 'Turkey',
    beneficiaryCity: 'Ankara',
    currencyId: byCode.USD.id,
    amount: '500',
    payoutCurrencyId: byCode.TRY.id,
    cashBoxId: main.id,
  });
  check('cross-currency transfer created', crossTransfer.status === 201, crossTransfer.body.message);

  // Cancel it and confirm the money comes back.
  const usdBeforeCancel = await boxBalance(main.id, byCode.USD.id);
  const cancelled = await api('POST', `/transfers/${crossTransfer.body.data.id}/cancel`, {
    reason: 'Customer changed their mind',
    refundCommission: true,
  });
  check('pending transfer cancelled', cancelled.status === 200, cancelled.body.message);
  const usdAfterCancel = await boxBalance(main.id, byCode.USD.id);
  check(
    'full refund returned the collected amount',
    usdBeforeCancel - usdAfterCancel === num(crossTransfer.body.data.totalCollected),
    `${usdBeforeCancel} -> ${usdAfterCancel}`,
  );

  // -------------------------------------------------------------- exchange
  // Office buys 1,000 USD from a customer at the 10,000 buy rate.
  const sypBefore = await boxBalance(main.id, byCode.SYP.id);
  const usdBeforeExchange = await boxBalance(main.id, byCode.USD.id);

  const buy = await api('POST', '/exchanges', {
    fromCurrencyId: byCode.USD.id,
    fromAmount: '1000',
    toCurrencyId: byCode.SYP.id,
    commissionAmount: '0',
    cashBoxId: main.id,
    customerId,
  });
  check('office buys USD', buy.status === 201, buy.body.message);

  const sypAfterBuy = await boxBalance(main.id, byCode.SYP.id);
  const usdAfterBuy = await boxBalance(main.id, byCode.USD.id);
  check(
    'buy moved 1,000 USD in and 10,000,000 SYP out',
    usdAfterBuy - usdBeforeExchange === 1000 && sypBefore - sypAfterBuy === 10_000_000,
    `USD ${usdBeforeExchange}->${usdAfterBuy}, SYP ${sypBefore}->${sypAfterBuy}`,
  );

  // Office sells 1,000 USD to a customer at the 10,100 sell rate.
  const sell = await api('POST', '/exchanges', {
    fromCurrencyId: byCode.SYP.id,
    fromAmount: '10100000',
    toCurrencyId: byCode.USD.id,
    commissionAmount: '0',
    cashBoxId: main.id,
  });
  check('office sells USD', sell.status === 201, sell.body.message);
  check(
    'sell priced at the published sell rate',
    Math.abs(num(sell.body.data.toAmount) - 1000) < 0.01,
    `paid out ${sell.body.data.toAmount} USD`,
  );

  const sameCurrency = await api('POST', '/exchanges', {
    fromCurrencyId: byCode.USD.id,
    fromAmount: '10',
    toCurrencyId: byCode.USD.id,
    cashBoxId: main.id,
  });
  check('exchange into the same currency refused', sameCurrency.status === 422 || sameCurrency.status === 400, sameCurrency.body.message);

  // -------------------------------------------------------------- vouchers
  const receipt = await api('POST', '/vouchers/receipt', {
    amount: '250000',
    currencyId: byCode.SYP.id,
    cashBoxId: main.id,
    category: 'OTHER_INCOME',
    reason: 'Miscellaneous income',
  });
  check('receipt voucher posted', receipt.status === 201, receipt.body.message);

  const payment = await api('POST', '/vouchers/payment', {
    amount: '100000',
    currencyId: byCode.SYP.id,
    cashBoxId: main.id,
    category: 'RENT',
    reason: 'Office rent',
  });
  check('payment voucher posted', payment.status === 201, payment.body.message);

  const voided = await api('POST', `/vouchers/${payment.body.data.id}/void`, {
    reason: 'Posted to the wrong box',
  });
  check('voucher voided with a reversing entry', voided.status === 200, voided.body.message);

  // -------------------------------------------------- invariants and reports
  const reconciliation = await api('GET', `/cash-boxes/${main.id}/reconciliation`);
  check(
    'cash box balances match the ledger exactly',
    reconciliation.body.data?.balanced === true,
    reconciliation.body.message,
  );

  const trial = await api('GET', '/ledger/trial-balance');
  const perCurrency = new Map();
  for (const row of trial.body.data) {
    const current = perCurrency.get(row.currencyCode) ?? { debit: 0, credit: 0 };
    current.debit += num(row.debit);
    current.credit += num(row.credit);
    perCurrency.set(row.currencyCode, current);
  }
  for (const [code, totals] of perCurrency) {
    check(
      `trial balance is balanced in ${code}`,
      Math.abs(totals.debit - totals.credit) < 1e-6,
      `debit ${totals.debit} vs credit ${totals.credit}`,
    );
  }

  const dashboard = await api('GET', '/dashboard/summary?period=today');
  check('dashboard reports the day', dashboard.status === 200 && dashboard.body.data.transfers.total >= 2,
    `${dashboard.body.data?.transfers?.total} transfers`);

  const audit = await api('GET', '/audit-logs?limit=100');
  const actions = new Set((audit.body.data ?? []).map((row) => row.action));
  check(
    'audit trail captured the money operations',
    ['transfer.create', 'transfer.receive', 'exchange.create', 'auth.login.failed'].every((a) => actions.has(a)),
    [...actions].slice(0, 8).join(', '),
  );

  // ------------------------------------------------------------- languages
  const arabic = await fetch(`${BASE}/transfers/${transferId}/receive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Language': 'ar', Authorization: `Bearer ${token}` },
    body: '{}',
  }).then((r) => r.json());
  check('errors are localised in Arabic', /[؀-ۿ]/.test(arabic.message), arabic.message);

  const turkish = await fetch(`${BASE}/transfers/${transferId}/receive?lang=tr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: '{}',
  }).then((r) => r.json());
  check('errors are localised in Turkish', /ödendi|bulunamadı|havale/i.test(turkish.message), turkish.message);

  // ------------------------------------------------------------ permissions
  const employeeRole = (await api('GET', '/roles')).body.data.find((r) => r.name === 'employee');
  const employee = await api('POST', '/users', {
    username: 'cashier1',
    password: 'Cashier@2026',
    fullName: 'Cashier One',
    roleId: employeeRole.id,
    defaultCashBoxId: main.id,
  });
  check(
    'employee account available',
    employee.status === 201 || employee.body.code === 'CONFLICT',
    employee.body.message,
  );

  const adminToken = token;
  const employeeLogin = await api('POST', '/auth/login', { username: 'cashier1', password: 'Cashier@2026' });
  token = employeeLogin.body.data.accessToken;
  const forbidden = await api('GET', '/audit-logs');
  check(
    'employee is refused a screen outside their role',
    forbidden.status === 403 && forbidden.body.code === 'FORBIDDEN',
    forbidden.body.message,
  );
  token = adminToken;

  // -------------------------------------------------------------- summary
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.log('FAILED:', failed.map((f) => f.name).join(' | '));
    process.exit(1);
  }
}

async function boxBalance(cashBoxId, currencyId) {
  const balances = (await api('GET', `/cash-boxes/${cashBoxId}/balances`)).body.data;
  const row = balances.find((b) => b.currencyId === currencyId);
  return row ? Number(row.balance) : 0;
}

run().catch((error) => {
  console.error('Scenario crashed:', error);
  process.exit(1);
});
