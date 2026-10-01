import { isRunningInExpoGo } from 'expo';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  deleteE5Assets,
  E5AssetState,
  installE5Assets,
  isE5Installed,
  subscribeE5AssetState,
} from '../lib/expense-intelligence/e5-assets';
import { setE5ClassifierEnabled } from '../lib/expense-intelligence/category-classifier';

export type E5Status = 'expo-go' | 'checking' | 'not-installed' | 'downloading' | 'loading' | 'ready' | 'error';

type E5ModelContextValue = {
  status: E5Status;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  errorMessage: string | null;
  download: () => Promise<void>;
  remove: () => Promise<void>;
  retry: () => Promise<void>;
};

const E5ModelContext = createContext<E5ModelContextValue | null>(null);

export function E5ModelProvider({ children }: { children: React.ReactNode }) {
  const expoGo = isRunningInExpoGo();
  const [status, setStatus] = useState<E5Status>(expoGo ? 'expo-go' : 'checking');
  const [assetState, setAssetState] = useState<E5AssetState>({
    phase: 'idle', progress: 0, downloadedBytes: 0, totalBytes: 0,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => subscribeE5AssetState(setAssetState), []);

  const loadInstalledModel = useCallback(async () => {
    if (expoGo) {
      setE5ClassifierEnabled(false);
      setStatus('expo-go');
      return;
    }
    setStatus('checking');
    setErrorMessage(null);
    try {
      if (!(await isE5Installed())) {
        setE5ClassifierEnabled(false);
        setStatus('not-installed');
        return;
      }
      setStatus('loading');
      const { initializeE5 } = await import('../lib/expense-intelligence/e5-engine');
      await initializeE5();
      setE5ClassifierEnabled(true);
      setStatus('ready');
    } catch (error) {
      setE5ClassifierEnabled(false);
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo iniciar el modelo local.');
      setStatus('error');
    }
  }, [expoGo]);

  useEffect(() => { void loadInstalledModel(); }, [loadInstalledModel]);

  const download = useCallback(async () => {
    if (expoGo) return;
    setErrorMessage(null);
    setStatus('downloading');
    try {
      await installE5Assets();
      setStatus('loading');
      const { initializeE5 } = await import('../lib/expense-intelligence/e5-engine');
      await initializeE5();
      setE5ClassifierEnabled(true);
      setStatus('ready');
    } catch (error) {
      setE5ClassifierEnabled(false);
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo descargar el modelo local.');
      setStatus('error');
    }
  }, [expoGo]);

  const remove = useCallback(async () => {
    setE5ClassifierEnabled(false);
    await deleteE5Assets();
    setErrorMessage(null);
    setStatus(expoGo ? 'expo-go' : 'not-installed');
  }, [expoGo]);

  const value = useMemo(() => ({
    status,
    progress: assetState.progress,
    downloadedBytes: assetState.downloadedBytes,
    totalBytes: assetState.totalBytes,
    errorMessage,
    download,
    remove,
    retry: loadInstalledModel,
  }), [assetState, download, errorMessage, loadInstalledModel, remove, status]);

  return <E5ModelContext.Provider value={value}>{children}</E5ModelContext.Provider>;
}

export function useE5Model() {
  const context = useContext(E5ModelContext);
  if (!context) throw new Error('useE5Model must be used inside E5ModelProvider');
  return context;
}
