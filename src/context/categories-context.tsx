import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

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

export type Category = {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  createdAt: Date;
};

type CategoryInput = {
  name: string;
  description: string;
  icon: string;
  color: string;
};

type CategoriesContextType = {
  categories: Category[];
  loading: boolean;
  hydrated: boolean;
  addCategory: (name: string, description: string, icon?: string, color?: string) => Promise<void>;
  updateCategory: (id: string, input: CategoryInput) => Promise<void>;
  deleteCategory: (id: string) => Promise<void>;
  getCategoryById: (id: string | null) => Category | undefined;
};

const CategoriesContext = createContext<CategoriesContextType | undefined>(undefined);

const defaultCategories = [
  { name: 'Compra', description: 'Supermercado, alimentación y productos habituales para casa.', icon: 'basket-outline', color: '#22C55E' },
  { name: 'Caprichos', description: 'Comidas, compras y pequeños gastos fuera de la rutina.', icon: 'sparkles-outline', color: '#F97316' },
  { name: 'Ocio', description: 'Actividades y gastos destinados principalmente al entretenimiento.', icon: 'game-controller-outline', color: '#8B5CF6' },
];

function mapCategory(row: any): Category {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    icon: row.icon ?? 'pricetag-outline',
    color: row.color ?? '#6366F1',
    createdAt: new Date(row.created_at),
  };
}

function categoryRow(category: Category, userId: string) {
  return {
    id: category.id,
    user_id: userId,
    name: category.name,
    description: category.description,
    icon: category.icon,
    color: category.color,
    created_at: category.createdAt.toISOString(),
  };
}

export function CategoriesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { status } = useConnectivity();
  const { syncVersion } = useOfflineSync();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const hydratedUserIdRef = useRef<string | null>(null);

  const loadCategories = useCallback(async () => {
    if (!user) {
      setCategories([]);
      hydratedUserIdRef.current = null;
      setHydrated(true);
      return;
    }
    setLoading(true);
    let hasCache = false;
    try {
      const cached = await readOfflineCache<any>(user.id, 'categories');
      if (cached) {
        setCategories(cached.map(mapCategory));
        hydratedUserIdRef.current = user.id;
        setHydrated(true);
        hasCache = true;
      }
      if (status !== 'online') return;

      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      if (error) throw error;

      let rows = data ?? [];
      if (rows.length === 0) {
        const seeded = defaultCategories.map((category) => ({
          id: createOfflineId(), user_id: user.id, ...category,
        }));
        const result = await supabase.from('categories').insert(seeded).select();
        if (result.error) throw result.error;
        rows = result.data ?? [];
      }
      setCategories(rows.map(mapCategory));
      hydratedUserIdRef.current = user.id;
      await writeOfflineCache(user.id, 'categories', rows);
    } catch (error) {
      if (!hasCache) console.warn('No se pudieron cargar las categorías:', error);
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
    setCategories([]);
  }, [user?.id]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    if (!user || !hydrated || hydratedUserIdRef.current !== user.id) return;
    void writeOfflineCache(user.id, 'categories', categories.map((item) => categoryRow(item, user.id)));
  }, [categories, hydrated, user?.id]);

  async function addCategory(
    name: string,
    description: string,
    icon = 'pricetag-outline',
    color = '#6366F1'
  ) {
    if (!user) throw new Error('User is not authenticated');
    const local: Category = {
      id: createOfflineId(),
      name: name.trim(),
      description: description.trim(),
      icon,
      color,
      createdAt: new Date(),
    };
    const payload = categoryRow(local, user.id);
    setCategories((current) => [...current, local]);

    if (status === 'online') {
      const { data, error } = await supabase.from('categories').upsert(payload).select().single();
      if (!error) {
        setCategories((current) => current.map((item) => item.id === local.id ? mapCategory(data) : item));
        return;
      }
      if (!isRetryableSyncError(error)) {
        setCategories((current) => current.filter((item) => item.id !== local.id));
        throw error;
      }
    }
    try {
      await queueOfflineUpsert(user.id, 'categories', local.id, payload, true);
    } catch (error) {
      setCategories((current) => current.filter((item) => item.id !== local.id));
      throw error;
    }
  }

  async function updateCategory(id: string, input: CategoryInput) {
    if (!user) throw new Error('User is not authenticated');
    const existing = categories.find((item) => item.id === id);
    if (!existing) return;
    const updated: Category = {
      ...existing,
      name: input.name.trim(),
      description: input.description.trim(),
      icon: input.icon,
      color: input.color,
    };
    const payload = categoryRow(updated, user.id);
    setCategories((current) => current.map((item) => item.id === id ? updated : item));

    if (status === 'online') {
      const { data, error } = await supabase.from('categories').upsert(payload).select().single();
      if (!error) {
        setCategories((current) => current.map((item) => item.id === id ? mapCategory(data) : item));
        return;
      }
      if (!isRetryableSyncError(error)) {
        setCategories((current) => current.map((item) => item.id === id ? existing : item));
        throw error;
      }
    }
    try {
      await queueOfflineUpsert(user.id, 'categories', id, payload);
    } catch (error) {
      setCategories((current) => current.map((item) => item.id === id ? existing : item));
      throw error;
    }
  }

  async function deleteCategory(id: string) {
    if (!user) throw new Error('User is not authenticated');
    const existing = categories.find((item) => item.id === id);
    setCategories((current) => current.filter((item) => item.id !== id));
    if (status === 'online') {
      const { error } = await supabase.from('categories').delete().eq('id', id).eq('user_id', user.id);
      if (!error) return;
      if (!isRetryableSyncError(error)) {
        if (existing) setCategories((current) => [...current, existing]
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()));
        throw error;
      }
    }
    try {
      await queueOfflineDelete(user.id, 'categories', id);
    } catch (error) {
      if (existing) setCategories((current) => [...current, existing]
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()));
      throw error;
    }
  }

  function getCategoryById(id: string | null) {
    return id ? categories.find((category) => category.id === id) : undefined;
  }

  return (
    <CategoriesContext.Provider value={{
      categories, loading, hydrated, addCategory, updateCategory, deleteCategory, getCategoryById,
    }}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories() {
  const context = useContext(CategoriesContext);
  if (!context) throw new Error('useCategories must be used inside CategoriesProvider');
  return context;
}
