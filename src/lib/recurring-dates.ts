import type { RecurringFrequency } from '../context/finance-context';

export const MAX_RECURRING_CATCH_UP = 500;

export class RecurringCatchUpLimitError extends Error {
  constructor(limit: number) {
    super(`Recurring catch-up exceeded the safety limit of ${limit} occurrences`);
    this.name = 'RecurringCatchUpLimitError';
  }
}

export function advanceRecurringDate(date: Date, frequency: RecurringFrequency) {
  const next = new Date(date);

  if (frequency === 'weekly') {
    next.setDate(next.getDate() + 7);
  }

  if (frequency === 'monthly') {
    const day = next.getDate();
    const wasLastDay = day === new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(wasLastDay ? lastDay : Math.min(day, lastDay));
  }

  if (frequency === 'yearly') {
    const month = next.getMonth();
    const day = next.getDate();
    const wasLastDay = day === new Date(next.getFullYear(), month + 1, 0).getDate();
    next.setDate(1);
    next.setFullYear(next.getFullYear() + 1);
    next.setMonth(month);
    const lastDay = new Date(next.getFullYear(), month + 1, 0).getDate();
    next.setDate(wasLastDay ? lastDay : Math.min(day, lastDay));
  }

  return next;
}

export function recurringDatesBetween(
  firstDate: Date,
  frequency: RecurringFrequency,
  rangeStart: Date,
  rangeEnd: Date
) {
  const dates: Date[] = [];
  let current = new Date(firstDate);
  let guard = 0;

  while (current < rangeStart && guard < 1500) {
    current = advanceRecurringDate(current, frequency);
    guard += 1;
  }

  while (current < rangeEnd && guard < 1500) {
    dates.push(new Date(current));
    current = advanceRecurringDate(current, frequency);
    guard += 1;
  }

  return dates;
}

export function collectDueRecurringDates(
  firstDate: Date,
  frequency: RecurringFrequency,
  throughDate: Date,
  limit = MAX_RECURRING_CATCH_UP,
  endDate?: Date | null
) {
  const dates: Date[] = [];
  let current = new Date(firstDate);
  const effectiveEnd = endDate && endDate.getTime() < throughDate.getTime()
    ? endDate
    : throughDate;

  while (current.getTime() <= effectiveEnd.getTime()) {
    if (dates.length >= limit) throw new RecurringCatchUpLimitError(limit);
    dates.push(new Date(current));
    const next = advanceRecurringDate(current, frequency);
    if (next.getTime() <= current.getTime()) {
      throw new Error('Recurring date did not advance');
    }
    current = next;
  }

  return { dates, nextDate: current };
}

export function planRecurringCatchUp(
  firstDate: Date,
  frequency: RecurringFrequency,
  throughDate: Date,
  existingDateKeys: ReadonlySet<string>,
  dateKey: (date: Date) => string,
  limit = MAX_RECURRING_CATCH_UP,
  endDate?: Date | null
) {
  const { dates, nextDate } = collectDueRecurringDates(
    firstDate,
    frequency,
    throughDate,
    limit,
    endDate
  );
  return {
    dates,
    missingDates: dates.filter((date) => !existingDateKeys.has(dateKey(date))),
    nextDate,
  };
}
