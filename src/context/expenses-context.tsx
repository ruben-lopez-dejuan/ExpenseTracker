import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { CurrencyCode, useAppSettings } from './app-settings-context';
import { useAuth } from './auth-context';
import { useConnectivity } from './connectivity-context';
import { useOfflineSync } from './offline-sync-context';
import {
  createOfflineId,
  isRetryableSyncError,
  queueOfflineDelete,
  queueOfflineUpsert,
  readOfflineCache,
  writeOfflineCache,
} from '../lib/offline-storage';
import { supabase } from '../lib/supabase';
import { sumConvertedAmounts } from '../lib/currency';

export type ExpenseStatus = 'completed' | 'planned';
export type ExpenseSource = 'manual' | 'text' | 'voice' | 'recurring';

export type Expense = {
  id: string;
  description: string;
  amount: number;
  currency: CurrencyCode;
  categoryId: string;
  transactionDate: Date;
  status: ExpenseStatus;
  source: ExpenseSource;
  recurringId: string | null;
  createdAt: Date;
};

export type ExpenseInput = {
  description: string;
  amount: number;
  currency?: CurrencyCode;
  categoryId: string;
  transactionDate?: Date;
  status?: ExpenseStatus;
  source?: ExpenseSource;
};

type ExpensesContextType = {
  expenses: Expense[];
  loading: boolean;
  hydrated: boolean;
  addExpense: (expense: ExpenseInput) => Promise<void>;
  updateExpense: (id: string, expense: ExpenseInput) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  refreshExpenses: () => Promise<void>;
  total: number | null;
};

const ExpensesContext = createContext<ExpensesContextType | undefined>(undefined);

function mapExpense(row: any): Expense {
  return {
    id: row.id,
    description: row.description ?? '',
    amount: Number(row.amount),
    currency: (row.currency ?? 'EUR') as CurrencyCode,
    categoryId: row.category_id,
    transactionDate: new Date(row.transaction_date),
    status: row.status as ExpenseStatus,
    source: row.source as ExpenseSource,
    recurringId: row.recurring_id ?? null,
    createdAt: new Date(row.created_at),
  };
}

function expenseRow(expense: Expense, userId: string) {
  return {
    id: expense.id,
    user_id: userId,
    category_id: expense.categoryId,
    description: expense.description,
    amount: expense.amount,
    currency: expense.currency,
    transaction_date: expense.transactionDate.toISOString(),
    status: expense.status,
    source: expense.source,
    recurring_id: expense.recurringId,
    created_at: expense.createdAt.toISOString(),
  };
}

export function ExpensesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { status } = useConnectivity();
  const { syncVersion } = useOfflineSync();
  const { inputCurrency, displayCurrency, convertAmount, refreshRates } = useAppSettings();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const hydratedUserIdRef = useRef<string | null>(null);

  const loadExpenses = useCallback(async () => {
    if (!user) {
      setExpenses([]);
      hydratedUserIdRef.current = null;
      setHydrated(true);
      return;
    }
    setLoading(true);
    let hasCache = false;
    try {
      const cached = await readOfflineCache<any>(user.id, 'expenses');
      if (cached) {
        setExpenses(cached.map(mapExpense));
        hydratedUserIdRef.current = user.id;
        setHydrated(true);
        hasCache = true;
      }
      if (status !== 'online') return;
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .eq('user_id', user.id)
        .order('transaction_date', { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      setExpenses(rows.map(mapExpense));
      hydratedUserIdRef.current = user.id;
      await writeOfflineCache(user.id, 'expenses', rows);
    } catch (error) {
      if (!hasCache) console.warn('No se pudieron cargar los gastos:', error);
    } finally {
      if (hasCache || status !== 'checking') {
        hydratedUserIdRef.current = user.id;
        setHydrated(true);
      }
      setLoading(false);
    }
  }, [status, syncVersion, user?.id]);

  useEffect(() => {
    hydratedUserIdRef.current = null;
    setHydrated(false);
    setExpenses([]);
  }, [user?.id]);

  useEffect(() => {
    void loadExpenses();
  }, [loadExpenses]);

  useEffect(() => {
    if (!user || !hydrated || hydratedUserIdRef.current !== user.id) return;
    void writeOfflineCache(user.id, 'expenses', expenses.map((item) => expenseRow(item, user.id)));
  }, [expenses, hydrated, user?.id]);

  useEffect(() => {
    const currencies = Array.from(new Set(expenses.map((expense) => expense.currency)));
    if (currencies.length > 0) void refreshRates(currencies);
  }, [displayCurrency, expenses]);

  async function addExpense({
    description,
    amount,
    currency = inputCurrency,
    categoryId,
    transactionDate = new Date(),
    status: expenseStatus = 'completed',
    source = 'manual',
  }: ExpenseInput) {
    if (!user) throw new Error('User is not authenticated');
    const local: Expense = {
      id: createOfflineId(), description: description.trim(), amount, currency, categoryId,
      transactionDate, status: expenseStatus, source, recurringId: null, createdAt: new Date(),
    };
    const payload = expenseRow(local, user.id);
    setExpenses((current) => [local, ...current]);
    if (status === 'online') {
      const { data, error } = await supabase.from('expenses').upsert(payload).select().single();
      if (!error) {
        setExpenses((current) => current.map((item) => item.id === local.id ? mapExpense(data) : item));
        return;
      }
      if (!isRetryableSyncError(error)) {
        setExpenses((current) => current.filter((item) => item.id !== local.id));
        throw error;
      }
    }
    try {
      await queueOfflineUpsert(user.id, 'expenses', local.id, payload, true);
    } catch (error) {
      setExpenses((current) => current.filter((item) => item.id !== local.id));
      throw error;
    }
  }

  async function updateExpense(id: string, {
    description,
    amount,
    currency = inputCurrency,
    categoryId,
    transactionDate = new Date(),
    status: expenseStatus = 'completed',
    source = 'manual',
  }: ExpenseInput) {
    if (!user) throw new Error('User is not authenticated');
    const existing = expenses.find((item) => item.id === id);
    if (!existing) return;
    const updated: Expense = {
      ...existing, description: description.trim(), amount, currency, categoryId,
      transactionDate, status: expenseStatus, source,
    };
    const payload = expenseRow(updated, user.id);
    setExpenses((current) => current.map((item) => item.id === id ? updated : item)
      .sort((a, b) => b.transactionDate.getTime() - a.transactionDate.getTime()));
    if (status === 'online') {
      const { data, error } = await supabase.from('expenses').upsert(payload).select().single();
      if (!error) {
        setExpenses((current) => current.map((item) => item.id === id ? mapExpense(data) : item)
          .sort((a, b) => b.transactionDate.getTime() - a.transactionDate.getTime()));
        return;
      }
      if (!isRetryableSyncError(error)) {
        setExpenses((current) => current.map((item) => item.id === id ? existing : item)
          .sort((a, b) => b.transactionDate.getTime() - a.transactionDate.getTime()));
        throw error;
      }
    }
    try {
      await queueOfflineUpsert(user.id, 'expenses', id, payload);
    } catch (error) {
      setExpenses((current) => current.map((item) => item.id === id ? existing : item)
        .sort((a, b) => b.transactionDate.getTime() - a.transactionDate.getTime()));
      throw error;
    }
  }

  async function deleteExpense(id: string) {
    if (!user) throw new Error('User is not authenticated');
    const existing = expenses.find((item) => item.id === id);
    setExpenses((current) => current.filter((item) => item.id !== id));
    if (status === 'online') {
      const { error } = await supabase.from('expenses').delete().eq('id', id).eq('user_id', user.id);
      if (!error) return;
      if (!isRetryableSyncError(error)) {
        if (existing) setExpenses((current) => [...current, existing]
          .sort((a, b) => b.transactionDate.getTime() - a.transactionDate.getTime()));
        throw error;
      }
    }
    try {
      await queueOfflineDelete(user.id, 'expenses', id);
    } catch (error) {
      if (existing) setExpenses((current) => [...current, existing]
        .sort((a, b) => b.transactionDate.getTime() - a.transactionDate.getTime()));
      throw error;
    }
  }

  const total = useMemo(
    () => sumConvertedAmounts(
      expenses.filter((expense) => expense.status === 'completed'),
      (expense) => convertAmount(expense.amount, expense.currency)
    ),
    [convertAmount, expenses]
  );

  return (
    <ExpensesContext.Provider value={{
      expenses, loading, hydrated, addExpense, updateExpense, deleteExpense,
      refreshExpenses: loadExpenses, total,
    }}>
      {children}
    </ExpensesContext.Provider>
  );
}

export function useExpenses() {
  const context = useContext(ExpensesContext);
  if (!context) throw new Error('useExpenses must be used inside ExpensesProvider');
  return context;
}
