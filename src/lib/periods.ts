export type CalendarPeriod = 'day' | 'week' | 'month' | 'year' | 'custom';

export function startOfLocalDay(date: Date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function addLocalDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function getCalendarPeriodRange(
  period: CalendarPeriod,
  anchor: Date,
  customStart?: Date | null,
  customEnd?: Date | null
) {
  if (period === 'custom' && customStart && customEnd) {
    return {
      start: startOfLocalDay(customStart),
      end: addLocalDays(startOfLocalDay(customEnd), 1),
    };
  }

  const naturalPeriod = period === 'custom' ? 'month' : period;
  let start = startOfLocalDay(anchor);
  let end = new Date(start);

  if (naturalPeriod === 'day') end = addLocalDays(start, 1);
  if (naturalPeriod === 'week') {
    const day = start.getDay();
    start = addLocalDays(start, day === 0 ? -6 : 1 - day);
    end = addLocalDays(start, 7);
  }
  if (naturalPeriod === 'month') {
    start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
  }
  if (naturalPeriod === 'year') {
    start = new Date(anchor.getFullYear(), 0, 1);
    end = new Date(anchor.getFullYear() + 1, 0, 1);
  }

  return { start, end };
}
