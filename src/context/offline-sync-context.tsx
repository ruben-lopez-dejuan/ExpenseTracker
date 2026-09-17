import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from './auth-context';
import { useConnectivity } from './connectivity-context';
import {
  flushOfflineOperations,
  pendingOfflineCount,
  subscribeOfflineQueue,
} from '../lib/offline-storage';

type OfflineSyncContextValue = {
  pendingCount: number;
  syncing: boolean;
  syncVersion: number;
  syncNow: () => Promise<void>;
};

const OfflineSyncContext = createContext<OfflineSyncContextValue | null>(null);

export function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { status } = useConnectivity();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncVersion, setSyncVersion] = useState(0);
  const syncingRef = useRef(false);

  const refreshPendingCount = useCallback(async () => {
    setPendingCount(await pendingOfflineCount(user?.id));
  }, [user?.id]);

  const syncNow = useCallback(async () => {
    if (!user || status !== 'online' || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const result = await flushOfflineOperations(user.id);
      setPendingCount(result.pending);
      if (result.synced > 0) setSyncVersion((current) => current + 1);
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [status, user]);

  useEffect(() => {
    void refreshPendingCount();
    return subscribeOfflineQueue(() => void refreshPendingCount());
  }, [refreshPendingCount]);

  useEffect(() => {
    if (status === 'online') void syncNow();
  }, [status, syncNow, user?.id]);

  useEffect(() => {
    if (status !== 'online' || pendingCount === 0) return;
    const timer = setTimeout(() => void syncNow(), 15000);
    return () => clearTimeout(timer);
  }, [pendingCount, status, syncNow]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncNow();
    });
    return () => subscription.remove();
  }, [syncNow]);

  const value = useMemo(
    () => ({ pendingCount, syncing, syncVersion, syncNow }),
    [pendingCount, syncing, syncVersion, syncNow]
  );
  return <OfflineSyncContext.Provider value={value}>{children}</OfflineSyncContext.Provider>;
}

export function useOfflineSync() {
  const context = useContext(OfflineSyncContext);
  if (!context) throw new Error('useOfflineSync must be used inside OfflineSyncProvider');
  return context;
}
