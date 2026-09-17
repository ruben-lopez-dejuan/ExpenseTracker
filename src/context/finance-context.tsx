import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { CurrencyCode, useAppSettings } from './app-settings-context';
import { useAuth } from './auth-context';
import { useConnectivity } from './connectivity-context';
import { useExpenses } from './expenses-context';
import { useOfflineSync } from './offline-sync-context';
import {
  createOfflineId,
  isRetryableSyncError,
  OfflineEntity,
  queueOfflineDelete,
  queueOfflineUpsert,
  readOfflineCache,
  writeOfflineCache,
} from '../lib/offline-storage';
import { supabase } from '../lib/supabase';
import { advanceRecurringDate } from '../lib/recurring-dates';

export type IncomeStatus = 'completed' | 'planned';
export type RecurringKind = 'expense' | 'income';
export type RecurringFrequency = 'weekly' | 'monthly' | 'yearly';

export type Income = {
  id: string;
  description: string;
  amount: number;
  currency: CurrencyCode;
  transactionDate: Date;
  status: IncomeStatus;
  source: 'manual' | 'recurring';
  recurringId: string | null;
  createdAt: Date;
};

export type Budget = {
  id: string;
  categoryId: string | null;
  amount: number;
  currency: CurrencyCode;
  monthStart: Date;
};

export type RecurringTransaction = {
  id: string;
  kind: RecurringKind;
  categoryId: string | null;
  description: string;
  amount: number;
  currency: CurrencyCode;
  frequency: RecurringFrequency;
  nextRunDate: Date;
  active: boolean;
};

export type IncomeInput = Omit<Income, 'id' | 'createdAt' | 'source' | 'recurringId'> & {
  source?: Income['source'];
};

export type BudgetInput = Omit<Budget, 'id'>;
export type RecurringInput = Omit<RecurringTransaction, 'id'>;

type FinanceContextValue = {
  incomes: Income[];
  budgets: Budget[];
  recurring: RecurringTransaction[];
  loading: boolean;
  hydrated: boolean;
  setupRequired: boolean;
  addIncome: (input: IncomeInput) => Promise<void>;
  updateIncome: (id: string, input: IncomeInput) => Promise<void>;
  deleteIncome: (id: string) => Promise<void>;
  saveBudget: (input: BudgetInput) => Promise<void>;
  updateBudget: (id: string, input: BudgetInput) => Promise<void>;
  deleteBudget: (id: string) => Promise<void>;
  addRecurring: (input: RecurringInput) => Promise<void>;
  updateRecurring: (id: string, input: RecurringInput) => Promise<void>;
  toggleRecurring: (id: string, active: boolean) => Promise<void>;
  deleteRecurring: (id: string) => Promise<void>;
  completePlannedMovement: (
    kind: RecurringKind,
    id: string,
    recurringId?: string | null
  ) => Promise<void>;
  refreshFinance: () => Promise<void>;
};

const FinanceContext = createContext<FinanceContextValue | null>(null);

function mapIncome(row: any): Income {
  return {
    id: row.id,
    description: row.description ?? '',
    amount: Number(row.amount),
    currency: (row.currency ?? 'EUR') as CurrencyCode,
    transactionDate: new Date(row.transaction_date),
    status: row.status as IncomeStatus,
    source: row.source as Income['source'],
    recurringId: row.recurring_id ?? null,
    createdAt: new Date(row.created_at),
  };
}

function mapBudget(row: any): Budget {
  return {
    id: row.id,
    categoryId: row.category_id,
    amount: Number(row.amount),
    currency: (row.currency ?? 'EUR') as CurrencyCode,
    monthStart: new Date(`${row.month_start}T12:00:00`),
  };
}

function mapRecurring(row: any): RecurringTransaction {
  return {
    id: row.id,
    kind: row.kind as RecurringKind,
    categoryId: row.category_id,
    description: row.description ?? '',
    amount: Number(row.amount),
    currency: (row.currency ?? 'EUR') as CurrencyCode,
    frequency: row.frequency as RecurringFrequency,
    nextRunDate: new Date(`${row.next_run_date}T12:00:00`),
    active: Boolean(row.active),
  };
}

function incomeRow(item: Income, userId: string) {
  return {
    id: item.id, user_id: userId, description: item.description, amount: item.amount,
    currency: item.currency, transaction_date: item.transactionDate.toISOString(),
    status: item.status, source: item.source, recurring_id: item.recurringId,
    created_at: item.createdAt.toISOString(),
  };
}

function budgetRow(item: Budget, userId: string) {
  return {
    id: item.id, user_id: userId, category_id: item.categoryId, amount: item.amount,
    currency: item.currency, month_start: dateOnly(item.monthStart),
  };
}

function recurringRow(item: RecurringTransaction, userId: string) {
  return {
    id: item.id, user_id: userId, kind: item.kind, category_id: item.categoryId,
    description: item.description, amount: item.amount, currency: item.currency,
    frequency: item.frequency, next_run_date: dateOnly(item.nextRunDate), active: item.active,
  };
}

function dateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isMissingPlanningSchema(error: any) {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

function isStaleRecurringReference(error: any) {
  return (
    error?.code === '23503' &&
    String(error?.message ?? '').includes('recurring_id')
  );
}

export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { status: connectivityStatus } = useConnectivity();
  const { syncVersion } = useOfflineSync();
  const { hydrated: settingsHydrated, inputCurrency, plannedExecutionMode, refreshRates } = useAppSettings();
  const { expenses, updateExpense, deleteExpense, refreshExpenses } = useExpenses();
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [setupRequired, setSetupRequired] = useState(false);
  const refreshRunningRef = useRef(false);
  const hydratedUserIdRef = useRef<string | null>(null);

  const generateDueOccurrences = useCallback(
    async (rules: RecurringTransaction[]) => {
      if (!user || !settingsHydrated || connectivityStatus !== 'online') return false;
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      const horizon = new Date();
      horizon.setDate(horizon.getDate() + 31);
      horizon.setHours(23, 59, 59, 999);
      let expensesChanged = false;
      let incomesChanged = false;

      for (const rule of rules.filter((item) => item.active)) {
        const targetTable = rule.kind === 'expense' ? 'expenses' : 'incomes';
        const { data: pending, error: pendingError } = await supabase
          .from(targetTable)
          .select('id, transaction_date')
          .eq('recurring_id', rule.id)
          .eq('status', 'planned')
          .limit(1);
        if (pendingError) throw pendingError;
        const pendingOccurrence = pending?.[0];
        let occurrenceDate = new Date(rule.nextRunDate);
        if (pendingOccurrence) {
          const pendingDate = new Date(pendingOccurrence.transaction_date);
          if (pendingDate.getTime() > today.getTime()) {
            if (dateOnly(pendingDate) !== dateOnly(rule.nextRunDate)) {
              const { error: alignError } = await supabase
                .from('recurring_transactions')
                .update({ next_run_date: dateOnly(pendingDate) })
                .eq('id', rule.id)
                .eq('user_id', user.id);
              if (alignError) throw alignError;
            }
            continue;
          }
          if (plannedExecutionMode === 'manual') {
            continue;
          }
          const { error: completeError } = await supabase
            .from(targetTable)
            .update({ status: 'completed' })
            .eq('id', pendingOccurrence.id)
            .eq('user_id', user.id);
          if (completeError) throw completeError;
          if (rule.kind === 'expense') expensesChanged = true;
          else incomesChanged = true;

          occurrenceDate = rule.nextRunDate.getTime() > pendingDate.getTime()
            ? new Date(rule.nextRunDate)
            : advanceRecurringDate(pendingDate, rule.frequency);
          while (occurrenceDate.getTime() <= today.getTime()) {
            occurrenceDate = advanceRecurringDate(occurrenceDate, rule.frequency);
          }

          const { error: advanceError } = await supabase
            .from('recurring_transactions')
            .update({ next_run_date: dateOnly(occurrenceDate) })
            .eq('id', rule.id)
            .eq('user_id', user.id);
          if (advanceError) throw advanceError;
        } else if (
          plannedExecutionMode === 'automatic' &&
          occurrenceDate.getTime() <= today.getTime()
        ) {
          const completed = {
            user_id: user.id,
            description: rule.description.trim(),
            amount: rule.amount,
            currency: rule.currency,
            transaction_date: occurrenceDate.toISOString(),
            status: 'completed',
            source: 'recurring',
            recurring_id: rule.id,
          };
          if (rule.kind === 'expense' && rule.categoryId) {
            const { error } = await supabase
              .from('expenses')
              .insert({ ...completed, category_id: rule.categoryId });
            if (error) {
              if (isStaleRecurringReference(error)) continue;
              if (error.code !== '23505') throw error;
            } else {
              expensesChanged = true;
            }
          } else if (rule.kind === 'income') {
            const { error } = await supabase.from('incomes').insert(completed);
            if (error) {
              if (isStaleRecurringReference(error)) continue;
              if (error.code !== '23505') throw error;
            } else {
              incomesChanged = true;
            }
          }

          do {
            occurrenceDate = advanceRecurringDate(occurrenceDate, rule.frequency);
          } while (occurrenceDate.getTime() <= today.getTime());

          const { error: advanceError } = await supabase
            .from('recurring_transactions')
            .update({ next_run_date: dateOnly(occurrenceDate) })
            .eq('id', rule.id)
            .eq('user_id', user.id);
          if (advanceError) throw advanceError;
        }

        if (occurrenceDate.getTime() > horizon.getTime()) continue;

        const common = {
          user_id: user.id,
          description: rule.description.trim(),
          amount: rule.amount,
          currency: rule.currency,
          transaction_date: occurrenceDate.toISOString(),
          status: 'planned',
          source: 'recurring',
          recurring_id: rule.id,
        };

        if (rule.kind === 'expense' && rule.categoryId) {
          const { error } = await supabase
            .from('expenses')
            .insert({ ...common, category_id: rule.categoryId });
          if (error) {
            if (isStaleRecurringReference(error)) continue;
            if (error.code !== '23505') throw error;
          } else {
            expensesChanged = true;
          }
        }

        if (rule.kind === 'income') {
          const { error } = await supabase.from('incomes').insert(common);
          if (error) {
            if (isStaleRecurringReference(error)) continue;
            if (error.code !== '23505') throw error;
          } else {
            incomesChanged = true;
          }
        }
      }

      if (expensesChanged) await refreshExpenses();
      return incomesChanged;
    },
    [connectivityStatus, plannedExecutionMode, refreshExpenses, settingsHydrated, user]
  );

  const completeDueStandaloneMovements = useCallback(async () => {
    if (!user || !settingsHydrated || plannedExecutionMode !== 'automatic' || connectivityStatus !== 'online') return;
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const [expenseResult, incomeResult] = await Promise.all([
      supabase
        .from('expenses')
        .update({ status: 'completed' })
        .eq('user_id', user.id)
        .eq('status', 'planned')
        .is('recurring_id', null)
        .lte('transaction_date', endOfToday.toISOString()),
      supabase
        .from('incomes')
        .update({ status: 'completed' })
        .eq('user_id', user.id)
        .eq('status', 'planned')
        .is('recurring_id', null)
        .lte('transaction_date', endOfToday.toISOString()),
    ]);
    if (expenseResult.error) throw expenseResult.error;
    if (incomeResult.error) throw incomeResult.error;
    await refreshExpenses();
  }, [connectivityStatus, plannedExecutionMode, refreshExpenses, settingsHydrated, user]);

  const refreshFinance = useCallback(async () => {
    if (!user) {
      setIncomes([]);
      setBudgets([]);
      setRecurring([]);
      hydratedUserIdRef.current = null;
      setHydrated(true);
      return;
    }
    if (refreshRunningRef.current) return;
    refreshRunningRef.current = true;
    setLoading(true);
    let hasCache = false;

    try {
      const [cachedIncomes, cachedBudgets, cachedRecurring] = await Promise.all([
        readOfflineCache<any>(user.id, 'incomes'),
        readOfflineCache<any>(user.id, 'budgets'),
        readOfflineCache<any>(user.id, 'recurring_transactions'),
      ]);
      if (cachedIncomes) setIncomes(cachedIncomes.map(mapIncome));
      if (cachedBudgets) setBudgets(cachedBudgets.map(mapBudget));
      if (cachedRecurring) setRecurring(cachedRecurring.map(mapRecurring));
      hasCache = Boolean(cachedIncomes || cachedBudgets || cachedRecurring);
      if (hasCache) {
        hydratedUserIdRef.current = user.id;
        setHydrated(true);
      }
      if (connectivityStatus !== 'online') return;

      await completeDueStandaloneMovements();
      const [incomeResult, budgetResult, recurringResult] = await Promise.all([
        supabase.from('incomes').select('*').eq('user_id', user.id).order('transaction_date', { ascending: false }),
        supabase.from('budgets').select('*').eq('user_id', user.id).order('month_start', { ascending: false }),
        supabase.from('recurring_transactions').select('*').eq('user_id', user.id).order('next_run_date'),
      ]);
      const error = incomeResult.error ?? budgetResult.error ?? recurringResult.error;
      if (error) {
        if (isMissingPlanningSchema(error)) {
          setSetupRequired(true);
          return;
        }
        throw error;
      }

      setSetupRequired(false);
      const incomeRows = incomeResult.data ?? [];
      const budgetRows = budgetResult.data ?? [];
      const recurringRows = recurringResult.data ?? [];
      const mappedRules = recurringRows.map(mapRecurring);
      setIncomes(incomeRows.map(mapIncome));
      setBudgets(budgetRows.map(mapBudget));
      setRecurring(mappedRules);
      hydratedUserIdRef.current = user.id;
      await Promise.all([
        writeOfflineCache(user.id, 'incomes', incomeRows),
        writeOfflineCache(user.id, 'budgets', budgetRows),
        writeOfflineCache(user.id, 'recurring_transactions', recurringRows),
      ]);

      const incomesChanged = await generateDueOccurrences(mappedRules);
      if (incomesChanged) {
        const refreshed = await supabase.from('incomes').select('*').eq('user_id', user.id).order('transaction_date', { ascending: false });
        if (!refreshed.error) {
          setIncomes((refreshed.data ?? []).map(mapIncome));
          await writeOfflineCache(user.id, 'incomes', refreshed.data ?? []);
        }
      }
      const rulesRefreshed = await supabase.from('recurring_transactions').select('*').eq('user_id', user.id).order('next_run_date');
      if (!rulesRefreshed.error) {
        setRecurring((rulesRefreshed.data ?? []).map(mapRecurring));
        await writeOfflineCache(user.id, 'recurring_transactions', rulesRefreshed.data ?? []);
      }
    } catch (error) {
      if (!hasCache) console.warn('No se pudieron cargar los datos de planificación:', error);
    } finally {
      refreshRunningRef.current = false;
      if (hasCache || connectivityStatus !== 'checking') {
        hydratedUserIdRef.current = user.id;
        setHydrated(true);
      }
      setLoading(false);
    }
  }, [completeDueStandaloneMovements, connectivityStatus, generateDueOccurrences, syncVersion, user?.id]);

  useEffect(() => {
    hydratedUserIdRef.current = null;
    setHydrated(false);
    setIncomes([]);
    setBudgets([]);
    setRecurring([]);
  }, [user?.id]);

  useEffect(() => {
    void refreshFinance();
  }, [refreshFinance]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshFinance();
    });
    return () => subscription.remove();
  }, [refreshFinance]);

  useEffect(() => {
    if (!user || !hydrated || hydratedUserIdRef.current !== user.id) return;
    void Promise.all([
      writeOfflineCache(user.id, 'incomes', incomes.map((item) => incomeRow(item, user.id))),
      writeOfflineCache(user.id, 'budgets', budgets.map((item) => budgetRow(item, user.id))),
      writeOfflineCache(user.id, 'recurring_transactions', recurring.map((item) => recurringRow(item, user.id))),
    ]);
  }, [budgets, hydrated, incomes, recurring, user?.id]);

  useEffect(() => {
    const currencies = [...incomes, ...budgets, ...recurring].map((item) => item.currency);
    if (currencies.length > 0) void refreshRates(currencies);
  }, [incomes, budgets, recurring]);

  async function persistUpsert(
    entity: OfflineEntity,
    recordId: string,
    payload: Record<string, unknown>,
    isNew = false
  ) {
    if (!user) throw new Error('User is not authenticated');
    if (connectivityStatus === 'online') {
      const result = await supabase.from(entity).upsert(payload, { onConflict: 'id' }).select().single();
      if (!result.error) return result.data;
      if (!isRetryableSyncError(result.error)) throw result.error;
    }
    await queueOfflineUpsert(user.id, entity, recordId, payload, isNew);
    return null;
  }

  async function persistDelete(entity: OfflineEntity, recordId: string) {
    if (!user) throw new Error('User is not authenticated');
    if (connectivityStatus === 'online') {
      const result = await supabase.from(entity).delete().eq('id', recordId).eq('user_id', user.id);
      if (!result.error) return;
      if (!isRetryableSyncError(result.error)) throw result.error;
    }
    await queueOfflineDelete(user.id, entity, recordId);
  }

  async function addIncome(input: IncomeInput) {
    if (!user) throw new Error('User is not authenticated');
    const local: Income = {
      id: createOfflineId(), description: input.description.trim(), amount: input.amount,
      currency: input.currency ?? inputCurrency, transactionDate: input.transactionDate,
      status: input.status, source: input.source ?? 'manual', recurringId: null, createdAt: new Date(),
    };
    const data = await persistUpsert('incomes', local.id, incomeRow(local, user.id), true);
    const saved = data ? mapIncome(data) : local;
    setIncomes((current) => [saved, ...current]);
  }

  async function deleteIncome(id: string) {
    if (!user) return;
    await persistDelete('incomes', id);
    setIncomes((current) => current.filter((item) => item.id !== id));
  }

  async function updateIncome(id: string, input: IncomeInput) {
    if (!user) throw new Error('User is not authenticated');
    const existing = incomes.find((item) => item.id === id);
    if (!existing) return;
    const updated: Income = {
      ...existing, description: input.description.trim(), amount: input.amount,
      currency: input.currency ?? inputCurrency, transactionDate: input.transactionDate,
      status: input.status, source: input.source ?? existing.source,
    };
    const data = await persistUpsert('incomes', id, incomeRow(updated, user.id));
    const saved = data ? mapIncome(data) : updated;
    setIncomes((current) => current.map((item) => item.id === id ? saved : item)
      .sort((a, b) => b.transactionDate.getTime() - a.transactionDate.getTime()));
  }

  async function saveBudget(input: BudgetInput) {
    if (!user) throw new Error('User is not authenticated');
    const existing = budgets.find(
      (item) => item.categoryId === input.categoryId && dateOnly(item.monthStart) === dateOnly(input.monthStart)
    );
    if (existing) return updateBudget(existing.id, input);
    const local: Budget = { id: createOfflineId(), ...input, monthStart: new Date(input.monthStart) };
    const data = await persistUpsert('budgets', local.id, budgetRow(local, user.id), true);
    const saved = data ? mapBudget(data) : local;
    setBudgets((current) => [saved, ...current]);
  }

  async function updateBudget(id: string, input: BudgetInput) {
    if (!user) throw new Error('User is not authenticated');
    const existing = budgets.find((item) => item.id === id);
    if (!existing) return;
    const updated: Budget = { id, ...input, monthStart: new Date(input.monthStart) };
    const data = await persistUpsert('budgets', id, budgetRow(updated, user.id));
    const saved = data ? mapBudget(data) : updated;
    setBudgets((current) => [saved, ...current.filter((item) => item.id !== id)]
      .sort((a, b) => b.monthStart.getTime() - a.monthStart.getTime()));
  }

  async function deleteBudget(id: string) {
    if (!user) return;
    await persistDelete('budgets', id);
    setBudgets((current) => current.filter((item) => item.id !== id));
  }

  async function addRecurring(input: RecurringInput) {
    if (!user) throw new Error('User is not authenticated');
    const local: RecurringTransaction = { id: createOfflineId(), ...input, nextRunDate: new Date(input.nextRunDate) };
    const data = await persistUpsert('recurring_transactions', local.id, recurringRow(local, user.id), true);
    const saved = data ? mapRecurring(data) : local;
    setRecurring((current) => [...current, saved]
      .sort((a, b) => a.nextRunDate.getTime() - b.nextRunDate.getTime()));
    if (connectivityStatus === 'online') await refreshFinance();
  }

  async function toggleRecurring(id: string, active: boolean) {
    if (!user) return;
    const existing = recurring.find((item) => item.id === id);
    if (!existing) return;
    const updated = { ...existing, active };
    const data = await persistUpsert('recurring_transactions', id, recurringRow(updated, user.id));
    const saved = data ? mapRecurring(data) : updated;
    setRecurring((current) => current.map((item) => item.id === id ? saved : item));
    if (!active) {
      const plannedExpenses = expenses.filter((item) => item.recurringId === id && item.status === 'planned');
      const plannedIncomes = incomes.filter((item) => item.recurringId === id && item.status === 'planned');
      await Promise.all([
        ...plannedExpenses.map((item) => deleteExpense(item.id)),
        ...plannedIncomes.map((item) => deleteIncome(item.id)),
      ]);
    } else if (connectivityStatus === 'online') {
      await refreshFinance();
    }
  }

  async function updateRecurring(id: string, input: RecurringInput) {
    if (!user) throw new Error('User is not authenticated');
    const updated: RecurringTransaction = { id, ...input, nextRunDate: new Date(input.nextRunDate) };
    const data = await persistUpsert('recurring_transactions', id, recurringRow(updated, user.id));
    const saved = data ? mapRecurring(data) : updated;
    setRecurring((current) => current.map((item) => item.id === id ? saved : item));
    const plannedExpenses = expenses.filter((item) => item.recurringId === id && item.status === 'planned');
    const plannedIncomes = incomes.filter((item) => item.recurringId === id && item.status === 'planned');
    await Promise.all([
      ...plannedExpenses.map((item) => deleteExpense(item.id)),
      ...plannedIncomes.map((item) => deleteIncome(item.id)),
    ]);
    if (connectivityStatus === 'online') await refreshFinance();
  }

  async function deleteRecurring(id: string) {
    if (!user) return;
    const plannedExpenses = expenses.filter((item) => item.recurringId === id && item.status === 'planned');
    const plannedIncomes = incomes.filter((item) => item.recurringId === id && item.status === 'planned');
    await Promise.all([
      ...plannedExpenses.map((item) => deleteExpense(item.id)),
      ...plannedIncomes.map((item) => deleteIncome(item.id)),
    ]);
    await persistDelete('recurring_transactions', id);
    setRecurring((current) => current.filter((item) => item.id !== id));
  }

  async function completePlannedMovement(
    kind: RecurringKind,
    id: string,
    recurringId?: string | null
  ) {
    if (!user) throw new Error('User is not authenticated');
    let movementDate = new Date();
    if (kind === 'expense') {
      const item = expenses.find((expense) => expense.id === id);
      if (!item) return;
      movementDate = item.transactionDate;
      await updateExpense(id, {
        description: item.description, amount: item.amount, currency: item.currency,
        categoryId: item.categoryId, transactionDate: item.transactionDate,
        status: 'completed', source: item.source,
      });
    } else {
      const item = incomes.find((income) => income.id === id);
      if (!item) return;
      movementDate = item.transactionDate;
      await updateIncome(id, {
        description: item.description, amount: item.amount, currency: item.currency,
        transactionDate: item.transactionDate, status: 'completed', source: item.source,
      });
    }

    if (recurringId) {
      const rule = recurring.find((item) => item.id === recurringId);
      if (rule) {
        let nextDate = advanceRecurringDate(movementDate, rule.frequency);
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        while (nextDate.getTime() <= today.getTime()) nextDate = advanceRecurringDate(nextDate, rule.frequency);
        const updated = { ...rule, nextRunDate: nextDate };
        const data = await persistUpsert('recurring_transactions', recurringId, recurringRow(updated, user.id));
        const saved = data ? mapRecurring(data) : updated;
        setRecurring((current) => current.map((item) => item.id === recurringId ? saved : item));
      }
    }
    if (connectivityStatus === 'online') await refreshFinance();
  }

  const value = useMemo(() => ({
    incomes, budgets, recurring, loading, hydrated, setupRequired,
    addIncome, updateIncome, deleteIncome, saveBudget, updateBudget, deleteBudget,
    addRecurring, updateRecurring, toggleRecurring, deleteRecurring,
    completePlannedMovement, refreshFinance,
  }), [incomes, budgets, recurring, loading, hydrated, setupRequired, refreshFinance]);

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const context = useContext(FinanceContext);
  if (!context) throw new Error('useFinance must be used inside FinanceProvider');
  return context;
}
