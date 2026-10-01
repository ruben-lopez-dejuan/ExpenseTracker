export type StoredExchangeRate = {
  rate: number;
  date: string;
  fetchedAt: number;
};

export const MAX_CACHED_RATE_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function isUsableExchangeRate(
  value: StoredExchangeRate | null | undefined,
  now = Date.now()
) {
  const age = value ? now - value.fetchedAt : Number.POSITIVE_INFINITY;
  return Boolean(
    value &&
    Number.isFinite(value.rate) &&
    value.rate > 0 &&
    Number.isFinite(value.fetchedAt) &&
    age >= 0 &&
    age <= MAX_CACHED_RATE_AGE_MS
  );
}

export function convertCurrencyAmount(
  amount: number,
  sameCurrency: boolean,
  rate: number | null | undefined
) {
  if (sameCurrency) return amount;
  if (!Number.isFinite(rate) || (rate ?? 0) <= 0) return null;
  return amount * (rate as number);
}

export function sumConvertedAmounts<T>(
  items: T[],
  convert: (item: T) => number | null
) {
  let total = 0;
  for (const item of items) {
    const value = convert(item);
    if (value === null || !Number.isFinite(value)) return null;
    total += value;
  }
  return total;
}
