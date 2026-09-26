/**
 * Concurrency probes.
 *
 * Two properties a remittance system must hold under real counter load:
 *   1. the same transfer cannot be paid out twice by two simultaneous requests;
 *   2. simultaneous withdrawals cannot together overdraw a cash box.
 *
 * Both are enforced by row locks inside the posting engine, not by an
 * application-level check, so the only honest way to test them is to fire the
 * requests at the same instant.
 */

import { API_BASE, ADMIN } from './lib/config.mjs';

const BASE = API_BASE;
let token = null;

async function api(method, path, body) {
  const response = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Accept-Language': 'en',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  -> ${detail}` : ''}`);
}

async function boxBalance(boxId, currencyId) {
  const balances = (await api('GET', `/cash-boxes/${boxId}/balances`)).body.data;
  return Number(balances.find((b) => b.currencyId === currencyId)?.balance ?? 0);
}

const run = async () => {
  token = (await api('POST', '/auth/login', ADMIN)).body.data.accessToken;

  const currencies = (await api('GET', '/currencies')).body.data;
  const byCode = Object.fromEntries(currencies.map((c) => [c.code, c]));
  const main = (await api('GET', '/cash-boxes')).body.data[0];

  // --------------------------------------------- 1. double payout under race
  const transfer = (
    await api('POST', '/transfers', {
      senderName: 'Race Sender',
      senderPhone: '+963991000333',
      beneficiaryName: 'Race Beneficiary',
      beneficiaryPhone: '+905331119999',
      beneficiaryCountry: 'Turkey',
      beneficiaryCity: 'Izmir',
      currencyId: byCode.USD.id,
      amount: '100',
      cashBoxId: main.id,
    })
  ).body.data;
  await api('POST', `/transfers/${transfer.id}/send`, {});

  const usdBefore = await boxBalance(main.id, byCode.USD.id);

  const attempts = await Promise.all(
    Array.from({ length: 6 }, () =>
      api('POST', `/transfers/${transfer.id}/receive`, { payoutCashBoxId: main.id }),
    ),
  );
  const succeeded = attempts.filter((a) => a.status === 200).length;
  const usdAfter = await boxBalance(main.id, byCode.USD.id);

  check(
    'exactly one of six simultaneous payouts succeeds',
    succeeded === 1,
    `${succeeded} succeeded, statuses ${attempts.map((a) => a.status).join('/')}`,
  );
  check(
    'the box paid out exactly once',
    usdBefore - usdAfter === 100,
    `${usdBefore} -> ${usdAfter} (expected -100)`,
  );

  // ----------------------------------- 2. concurrent withdrawals vs balance
  const box = (
    await api('POST', '/cash-boxes', {
      code: `RACE${Date.now().toString().slice(-6)}`,
      nameAr: 'صندوق اختبار التزامن',
      nameEn: 'Race test box',
      nameTr: 'Yaris testi kasasi',
    })
  ).body.data;

  await api('POST', `/cash-boxes/${box.id}/opening-balance`, {
    currencyId: byCode.USD.id,
    amount: '1000',
  });

  // Ten simultaneous payments of 200 against a balance of 1,000: at most five
  // may succeed, and the balance must never go below zero.
  const payments = await Promise.all(
    Array.from({ length: 10 }, (_, index) =>
      api('POST', '/vouchers/payment', {
        amount: '200',
        currencyId: byCode.USD.id,
        cashBoxId: box.id,
        category: 'EXPENSE',
        reason: `Concurrent withdrawal ${index + 1}`,
      }),
    ),
  );
  const paid = payments.filter((p) => p.status === 201).length;
  const refused = payments.filter((p) => p.body?.code === 'INSUFFICIENT_FUNDS').length;
  const finalBalance = await boxBalance(box.id, byCode.USD.id);

  check(
    'no more withdrawals succeed than the box can fund',
    paid <= 5 && paid * 200 + finalBalance === 1000,
    `${paid} paid, ${refused} refused, balance ${finalBalance}`,
  );
  check('balance never went negative', finalBalance >= 0, `final ${finalBalance}`);

  const reconciliation = await api('GET', `/cash-boxes/${box.id}/reconciliation`);
  check(
    'race-tested box still reconciles against the ledger',
    reconciliation.body.data?.balanced === true,
    reconciliation.body.message,
  );

  // ------------------------------------------------ 3. global book integrity
  const trial = (await api('GET', '/ledger/trial-balance')).body.data;
  const totals = new Map();
  for (const row of trial) {
    const current = totals.get(row.currencyCode) ?? { debit: 0, credit: 0 };
    current.debit += Number(row.debit);
    current.credit += Number(row.credit);
    totals.set(row.currencyCode, current);
  }
  for (const [code, value] of totals) {
    check(
      `book still balances in ${code} after the races`,
      Math.abs(value.debit - value.credit) < 1e-6,
      `${value.debit} vs ${value.credit}`,
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) process.exit(1);
};

run().catch((error) => {
  console.error('Concurrency probe crashed:', error);
  process.exit(1);
});
