import Storage from 'expo-sqlite/kv-store';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Appearance } from 'react-native';

import {
  AppLanguage,
  LANGUAGE_LOCALES,
  LanguagePreference,
  TranslationKey,
  resolveLanguage,
  translate,
} from '../lib/i18n';
import { toLocalDateOnly } from '../lib/date-only';

export const CURRENCIES = [
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'USD', name: 'Dólar estadounidense', symbol: '$' },
  { code: 'GBP', name: 'Libra esterlina', symbol: '£' },
  { code: 'CHF', name: 'Franco suizo', symbol: 'CHF' },
  { code: 'JPY', name: 'Yen japonés', symbol: '¥' },
  { code: 'CAD', name: 'Dólar canadiense', symbol: 'CA$' },
  { code: 'AUD', name: 'Dólar australiano', symbol: 'A$' },
  { code: 'CNY', name: 'Yuan chino', symbol: 'CN¥' },
  { code: 'INR', name: 'Rupia india', symbol: '₹' },
  { code: 'MXN', name: 'Peso mexicano', symbol: 'MX$' },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]['code'];
export type ThemeMode = 'light' | 'dark';
export type PlannedExecutionMode = 'automatic' | 'manual';

type ExchangeRate = {
  rate: number;
  date: string;
  fetchedAt: number;
};

type RateStatus = 'idle' | 'loading' | 'ready' | 'error';

type AppSettingsContextValue = {
  inputCurrency: CurrencyCode;
  displayCurrency: CurrencyCode;
  themeMode: ThemeMode;
  languagePreference: LanguagePreference;
  language: AppLanguage;
  locale: string;
  plannedExecutionMode: PlannedExecutionMode;
  isDark: boolean;
  hydrated: boolean;
  rates: Record<string, ExchangeRate>;
  rateStatus: RateStatus;
  setInputCurrency: (currency: CurrencyCode) => void;
  setDisplayCurrency: (currency: CurrencyCode) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setLanguagePreference: (language: LanguagePreference) => void;
  setPlannedExecutionMode: (mode: PlannedExecutionMode) => void;
  t: (key: TranslationKey) => string;
  refreshRates: (
    sourceCurrencies?: CurrencyCode[],
    force?: boolean
  ) => Promise<boolean>;
  convertAmount: (
    amount: number,
    sourceCurrency?: CurrencyCode
  ) => number;
  formatMoney: (
    amount: number,
    sourceCurrency?: CurrencyCode
  ) => string;
  getRate: (sourceCurrency?: CurrencyCode) => ExchangeRate | null;
};

const STORAGE_KEY = 'expense-tracker.app-settings.v1';
const RATE_CACHE_MS = 12 * 60 * 60 * 1000;
const RATE_API = 'https://api.frankfurter.dev/v2/rate';

const AppSettingsContext =
  createContext<AppSettingsContextValue | null>(null);

function isCurrencyCode(value: unknown): value is CurrencyCode {
  return CURRENCIES.some((currency) => currency.code === value);
}

function rateKey(source: CurrencyCode, target: CurrencyCode) {
  return `${source}_${target}`;
}

export function currencyInfo(code: CurrencyCode) {
  return CURRENCIES.find((currency) => currency.code === code)!;
}

export function currencyName(code: CurrencyCode, language: AppLanguage) {
  const names: Record<AppLanguage, Record<CurrencyCode, string>> = {
    es: { EUR: 'Euro', USD: 'Dólar estadounidense', GBP: 'Libra esterlina', CHF: 'Franco suizo', JPY: 'Yen japonés', CAD: 'Dólar canadiense', AUD: 'Dólar australiano', CNY: 'Yuan chino', INR: 'Rupia india', MXN: 'Peso mexicano' },
    en: { EUR: 'Euro', USD: 'US dollar', GBP: 'British pound', CHF: 'Swiss franc', JPY: 'Japanese yen', CAD: 'Canadian dollar', AUD: 'Australian dollar', CNY: 'Chinese yuan', INR: 'Indian rupee', MXN: 'Mexican peso' },
    fr: { EUR: 'Euro', USD: 'Dollar américain', GBP: 'Livre sterling', CHF: 'Franc suisse', JPY: 'Yen japonais', CAD: 'Dollar canadien', AUD: 'Dollar australien', CNY: 'Yuan chinois', INR: 'Roupie indienne', MXN: 'Peso mexicain' },
  };
  return names[language][code];
}

export function formatCurrencyAmount(
  amount: number,
  currency: CurrencyCode,
  locale = 'es-ES'
) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
}

export function AppSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const systemLanguage = resolveLanguage(
    Intl.DateTimeFormat().resolvedOptions().locale
  );
  const [inputCurrency, setInputCurrencyState] =
    useState<CurrencyCode>('EUR');
  const [displayCurrency, setDisplayCurrencyState] =
    useState<CurrencyCode>('EUR');
  const [themeMode, setThemeModeState] =
    useState<ThemeMode>('light');
  const [languagePreference, setLanguagePreferenceState] =
    useState<LanguagePreference>('system');
  const [plannedExecutionMode, setPlannedExecutionModeState] =
    useState<PlannedExecutionMode>('automatic');
  const [rates, setRates] = useState<Record<string, ExchangeRate>>({});
  const [rateStatus, setRateStatus] = useState<RateStatus>('idle');
  const [hydrated, setHydrated] = useState(false);
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    void Storage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!stored) return;
        const parsed = JSON.parse(stored) as {
          inputCurrency?: unknown;
          displayCurrency?: unknown;
          themeMode?: unknown;
          languagePreference?: unknown;
          plannedExecutionMode?: unknown;
          rates?: Record<string, ExchangeRate>;
        };

        if (isCurrencyCode(parsed.inputCurrency)) {
          setInputCurrencyState(parsed.inputCurrency);
        }
        if (isCurrencyCode(parsed.displayCurrency)) {
          setDisplayCurrencyState(parsed.displayCurrency);
        }
        if (parsed.themeMode === 'light' || parsed.themeMode === 'dark') {
          setThemeModeState(parsed.themeMode);
        }
        if (
          parsed.languagePreference === 'system' ||
          parsed.languagePreference === 'es' ||
          parsed.languagePreference === 'en' ||
          parsed.languagePreference === 'fr'
        ) {
          setLanguagePreferenceState(parsed.languagePreference);
        }
        if (
          parsed.plannedExecutionMode === 'automatic' ||
          parsed.plannedExecutionMode === 'manual'
        ) {
          setPlannedExecutionModeState(parsed.plannedExecutionMode);
        }
        if (parsed.rates && typeof parsed.rates === 'object') {
          setRates(parsed.rates);
        }
      })
      .catch((error) => {
        console.warn('No se pudieron cargar los ajustes locales:', error);
      })
      .finally(() => setHydrated(true));
  }, []);

  useEffect(() => {
    Appearance.setColorScheme(themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (!hydrated) return;
    void Storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        inputCurrency,
        displayCurrency,
        themeMode,
        languagePreference,
        plannedExecutionMode,
        rates,
      })
    ).catch((error) => {
      console.warn('No se pudieron guardar los ajustes locales:', error);
    });
  }, [
    displayCurrency,
    hydrated,
    inputCurrency,
    languagePreference,
    plannedExecutionMode,
    rates,
    themeMode,
  ]);

  const language =
    languagePreference === 'system' ? systemLanguage : languagePreference;
  const locale = LANGUAGE_LOCALES[language];
  const t = useCallback(
    (key: TranslationKey) => translate(language, key),
    [language]
  );

  const refreshRates = useCallback(
    async (
      sourceCurrencies: CurrencyCode[] = [inputCurrency],
      force = false
    ) => {
      const sources = Array.from(new Set(sourceCurrencies));
      const requests = sources
        .filter((source) => source !== displayCurrency)
        .filter((source) => {
          const key = rateKey(source, displayCurrency);
          const cached = rates[key];
          return (
            !inFlight.current.has(key) &&
            (force || !cached || Date.now() - cached.fetchedAt > RATE_CACHE_MS)
          );
        });

      if (requests.length === 0) {
        setRateStatus('ready');
        return true;
      }

      setRateStatus('loading');
      requests.forEach((source) =>
        inFlight.current.add(rateKey(source, displayCurrency))
      );

      try {
        const results = await Promise.all(
          requests.map(async (source) => {
            const response = await fetch(
              `${RATE_API}/${source}/${displayCurrency}`
            );
            if (!response.ok) {
              throw new Error(`Cambio ${source}/${displayCurrency}: ${response.status}`);
            }

            const data = (await response.json()) as {
              rate?: number;
              date?: string;
            };
            if (!Number.isFinite(data.rate)) {
              throw new Error(`Tipo de cambio ${source}/${displayCurrency} inválido`);
            }

            return {
              key: rateKey(source, displayCurrency),
              value: {
                rate: data.rate as number,
                date: data.date ?? toLocalDateOnly(new Date()),
                fetchedAt: Date.now(),
              },
            };
          })
        );

        setRates((current) => {
          const next = { ...current };
          results.forEach(({ key, value }) => {
            next[key] = value;
          });
          return next;
        });
        setRateStatus('ready');
        return true;
      } catch (error) {
        console.warn('No se pudo actualizar el tipo de cambio:', error);
        setRateStatus('error');
        return false;
      } finally {
        requests.forEach((source) =>
          inFlight.current.delete(rateKey(source, displayCurrency))
        );
      }
    },
    [displayCurrency, inputCurrency, rates]
  );

  useEffect(() => {
    if (hydrated) void refreshRates([inputCurrency]);
  }, [displayCurrency, hydrated, inputCurrency]);

  const getRate = useCallback(
    (sourceCurrency: CurrencyCode = inputCurrency) => {
      if (sourceCurrency === displayCurrency) {
        return {
          rate: 1,
          date: toLocalDateOnly(new Date()),
          fetchedAt: Date.now(),
        };
      }
      return rates[rateKey(sourceCurrency, displayCurrency)] ?? null;
    },
    [displayCurrency, inputCurrency, rates]
  );

  const convertAmount = useCallback(
    (amount: number, sourceCurrency: CurrencyCode = inputCurrency) => {
      if (sourceCurrency === displayCurrency) return amount;
      return amount * (getRate(sourceCurrency)?.rate ?? 1);
    },
    [displayCurrency, getRate, inputCurrency]
  );

  const formatMoney = useCallback(
    (amount: number, sourceCurrency: CurrencyCode = inputCurrency) => {
      const hasConversion =
        sourceCurrency === displayCurrency || getRate(sourceCurrency) !== null;
      const currency = hasConversion ? displayCurrency : sourceCurrency;
      const value = hasConversion
        ? convertAmount(amount, sourceCurrency)
        : amount;

      return formatCurrencyAmount(value, currency, locale);
    },
    [convertAmount, displayCurrency, getRate, inputCurrency, locale]
  );

  const value = useMemo<AppSettingsContextValue>(
    () => ({
      inputCurrency,
      displayCurrency,
      themeMode,
      languagePreference,
      language,
      locale,
      plannedExecutionMode,
      isDark: themeMode === 'dark',
      hydrated,
      rates,
      rateStatus,
      setInputCurrency: setInputCurrencyState,
      setDisplayCurrency: setDisplayCurrencyState,
      setThemeMode: setThemeModeState,
      setLanguagePreference: setLanguagePreferenceState,
      setPlannedExecutionMode: setPlannedExecutionModeState,
      t,
      refreshRates,
      convertAmount,
      formatMoney,
      getRate,
    }),
    [
      convertAmount,
      displayCurrency,
      formatMoney,
      getRate,
      hydrated,
      inputCurrency,
      language,
      languagePreference,
      locale,
      plannedExecutionMode,
      rateStatus,
      rates,
      refreshRates,
      themeMode,
      t,
    ]
  );

  return (
    <AppSettingsContext.Provider value={value}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export function useAppSettings() {
  const context = useContext(AppSettingsContext);
  if (!context) {
    throw new Error('useAppSettings debe usarse dentro de AppSettingsProvider');
  }
  return context;
}
