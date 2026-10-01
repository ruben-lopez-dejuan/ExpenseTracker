import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';

import { useAuth } from './auth-context';
import { parseLocalDateOnly, toLocalDateOnly } from '../lib/date-only';
import { supabase } from '../lib/supabase';

export type SummaryPeriod =
  | 'day'
  | 'week'
  | 'month'
  | 'year'
  | 'custom';

type PreferencesContextType = {
  summaryPeriod: SummaryPeriod;
  customStartDate: Date | null;
  customEndDate: Date | null;
  loading: boolean;

  setSummaryPeriod: (
    period: SummaryPeriod
  ) => Promise<void>;

  setCustomPeriod: (
    start: Date,
    end: Date
  ) => Promise<void>;
};

const PreferencesContext =
  createContext<PreferencesContextType | undefined>(
    undefined
  );

export function PreferencesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();

  const [summaryPeriod, setSummaryPeriodState] =
    useState<SummaryPeriod>('month');

  const [customStartDate, setCustomStartDate] =
    useState<Date | null>(null);

  const [customEndDate, setCustomEndDate] =
    useState<Date | null>(null);

  const [loading, setLoading] =
    useState(false);

  useEffect(() => {
    if (!user) {
      setSummaryPeriodState('month');
      setCustomStartDate(null);
      setCustomEndDate(null);
      return;
    }

    void loadPreferences();
  }, [user?.id]);

  async function loadPreferences() {
    if (!user) {
      return;
    }

    try {
      setLoading(true);

      const { data, error } =
        await supabase
          .from('user_preferences')
          .select(
            'summary_period, custom_start_date, custom_end_date'
          )
          .eq('user_id', user.id)
          .maybeSingle();

      if (error) {
        throw error;
      }

      if (data?.summary_period) {
        setSummaryPeriodState(
          data.summary_period as SummaryPeriod
        );
      }

      if (data?.custom_start_date) {
        setCustomStartDate(parseLocalDateOnly(data.custom_start_date));
      }

      if (data?.custom_end_date) {
        setCustomEndDate(parseLocalDateOnly(data.custom_end_date));
      }
    } finally {
      setLoading(false);
    }
  }

  async function setSummaryPeriod(
    period: SummaryPeriod
  ) {
    if (!user) {
      return;
    }

    setSummaryPeriodState(period);

    await supabase
      .from('user_preferences')
      .upsert({
        user_id: user.id,
        summary_period: period,
        updated_at: new Date().toISOString(),
      });
  }

  async function setCustomPeriod(
    start: Date,
    end: Date
  ) {
    if (!user) {
      return;
    }

    setCustomStartDate(start);
    setCustomEndDate(end);
    setSummaryPeriodState('custom');

    const { error } =
      await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          summary_period: 'custom',
          custom_start_date: toLocalDateOnly(start),
          custom_end_date: toLocalDateOnly(end),
          updated_at: new Date().toISOString(),
        });

    if (error) {
      throw error;
    }
  }

  return (
    <PreferencesContext.Provider
      value={{
        summaryPeriod,
        customStartDate,
        customEndDate,
        loading,
        setSummaryPeriod,
        setCustomPeriod,
      }}
    >
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context =
    useContext(PreferencesContext);

  if (!context) {
    throw new Error(
      'usePreferences must be used inside PreferencesProvider'
    );
  }

  return context;
}
