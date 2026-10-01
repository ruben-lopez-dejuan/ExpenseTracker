import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_CACHED_RATE_AGE_MS,
  convertCurrencyAmount,
  isUsableExchangeRate,
  sumConvertedAmounts,
} from '../src/lib/currency.ts';
import { parseLocalDateOnly, toLocalDateOnly } from '../src/lib/date-only.ts';
import { getCalendarPeriodRange } from '../src/lib/periods.ts';
import {
  RecurringCatchUpLimitError,
  collectDueRecurringDates,
  planRecurringCatchUp,
} from '../src/lib/recurring-dates.ts';

process.env.TZ = 'Europe/Madrid';

const keys = (dates) => dates.map(toLocalDateOnly);

test('date-only values preserve the local calendar day around DST changes', () => {
  const dates = [
    new Date(2026, 9, 1, 0, 0),
    new Date(2026, 2, 31, 0, 0),
    new Date(2026, 2, 29, 0, 0),
    new Date(2026, 9, 25, 0, 0),
  ];

  assert.deepEqual(keys(dates), [
    '2026-10-01',
    '2026-03-31',
    '2026-03-29',
    '2026-10-25',
  ]);

  for (const date of dates) {
    assert.equal(toLocalDateOnly(parseLocalDateOnly(toLocalDateOnly(date))), toLocalDateOnly(date));
  }
});

test('calendar periods use local, end-exclusive boundaries', () => {
  const anchor = new Date(2026, 9, 14, 12, 0);
  const rangeKeys = (period) => {
    const range = getCalendarPeriodRange(period, anchor);
    return [toLocalDateOnly(range.start), toLocalDateOnly(range.end)];
  };

  assert.deepEqual(rangeKeys('day'), ['2026-10-14', '2026-10-15']);
  assert.deepEqual(rangeKeys('week'), ['2026-10-12', '2026-10-19']);
  assert.deepEqual(rangeKeys('month'), ['2026-10-01', '2026-11-01']);
  assert.deepEqual(rangeKeys('year'), ['2026-01-01', '2027-01-01']);

  const custom = getCalendarPeriodRange(
    'custom',
    anchor,
    new Date(2026, 2, 31),
    new Date(2026, 9, 1)
  );
  assert.deepEqual(keys([custom.start, custom.end]), ['2026-03-31', '2026-10-02']);
});

test('recurring catch-up generates one or every overdue monthly occurrence', () => {
  const one = collectDueRecurringDates(
    new Date(2026, 3, 1),
    'monthly',
    new Date(2026, 3, 15)
  );
  assert.deepEqual(keys(one.dates), ['2026-04-01']);
  assert.equal(toLocalDateOnly(one.nextDate), '2026-05-01');

  const several = collectDueRecurringDates(
    new Date(2026, 1, 1),
    'monthly',
    new Date(2026, 3, 15)
  );
  assert.deepEqual(keys(several.dates), ['2026-02-01', '2026-03-01', '2026-04-01']);
  assert.equal(toLocalDateOnly(several.nextDate), '2026-05-01');
});

test('weekly, month-end and leap-year recurrence dates stay calendar safe', () => {
  const weekly = collectDueRecurringDates(
    new Date(2026, 2, 2),
    'weekly',
    new Date(2026, 2, 23)
  );
  assert.deepEqual(keys(weekly.dates), [
    '2026-03-02',
    '2026-03-09',
    '2026-03-16',
    '2026-03-23',
  ]);

  const monthEnd = collectDueRecurringDates(
    new Date(2026, 0, 31),
    'monthly',
    new Date(2026, 3, 30)
  );
  assert.deepEqual(keys(monthEnd.dates), [
    '2026-01-31',
    '2026-02-28',
    '2026-03-31',
    '2026-04-30',
  ]);

  const leapYear = collectDueRecurringDates(
    new Date(2024, 1, 29),
    'yearly',
    new Date(2028, 1, 29)
  );
  assert.deepEqual(keys(leapYear.dates), [
    '2024-02-29',
    '2025-02-28',
    '2026-02-28',
    '2027-02-28',
    '2028-02-29',
  ]);
});

test('recurring planning respects end dates, skips duplicates and has a safety limit', () => {
  const plan = planRecurringCatchUp(
    new Date(2026, 0, 31),
    'monthly',
    new Date(2026, 4, 31),
    new Set(['2026-02-28']),
    toLocalDateOnly,
    500,
    new Date(2026, 2, 31)
  );

  assert.deepEqual(keys(plan.dates), ['2026-01-31', '2026-02-28', '2026-03-31']);
  assert.deepEqual(keys(plan.missingDates), ['2026-01-31', '2026-03-31']);
  assert.equal(toLocalDateOnly(plan.nextDate), '2026-04-30');

  assert.throws(
    () =>
      collectDueRecurringDates(
        new Date(2020, 0, 1),
        'weekly',
        new Date(2026, 0, 1),
        2
      ),
    RecurringCatchUpLimitError
  );
});

test('currency conversion rejects unknown or stale rates', () => {
  const now = Date.now();
  const fresh = { rate: 0.92, date: '2026-10-01', fetchedAt: now - 60_000 };
  const stale = {
    rate: 0.92,
    date: '2026-09-01',
    fetchedAt: now - MAX_CACHED_RATE_AGE_MS - 1,
  };

  assert.equal(convertCurrencyAmount(100, true, null), 100);
  assert.equal(convertCurrencyAmount(100, false, 0.92), 92);
  assert.equal(convertCurrencyAmount(100, false, null), null);
  assert.equal(isUsableExchangeRate(fresh, now), true);
  assert.equal(isUsableExchangeRate(stale, now), false);
});

test('financial aggregates remain correct and fail closed when a rate is missing', () => {
  const rates = { EUR: 1, USD: 0.9 };
  const convertToEur = (item) =>
    convertCurrencyAmount(item.amount, item.currency === 'EUR', rates[item.currency]);
  const expenses = [
    { amount: 50, currency: 'EUR' },
    { amount: 100, currency: 'USD' },
  ];
  const incomes = [{ amount: 500, currency: 'EUR' }];

  const expenseTotal = sumConvertedAmounts(expenses, convertToEur);
  const incomeTotal = sumConvertedAmounts(incomes, convertToEur);

  assert.equal(expenseTotal, 140);
  assert.equal(incomeTotal, 500);
  assert.equal(incomeTotal - expenseTotal, 360);
  assert.equal(expenseTotal / 200, 0.7);
  assert.equal(
    sumConvertedAmounts([...expenses, { amount: 10, currency: 'GBP' }], convertToEur),
    null
  );
});
