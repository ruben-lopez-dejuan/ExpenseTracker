import Storage from 'expo-sqlite/kv-store';

import { supabase } from './supabase';

export type OfflineEntity =
  | 'categories'
  | 'expenses'
  | 'incomes'
  | 'budgets'
  | 'recurring_transactions';

type OfflineOperation = {
  id: string;
  userId: string;
  entity: OfflineEntity;
  recordId: string;
  action: 'upsert' | 'delete';
  payload?: Record<string, unknown>;
  isNew?: boolean;
  createdAt: number;
};

const CACHE_PREFIX = 'expense-tracker.offline-cache.v1';
const QUEUE_KEY = 'expense-tracker.offline-queue.v1';
const listeners = new Set<() => void>();
let queueMutationPromise: Promise<void> = Promise.resolve();
let flushPromise: { userId: string; promise: Promise<SyncResult> } | null = null;

export type SyncResult = {
  synced: number;
  pending: number;
  error: unknown | null;
};

function cacheKey(userId: string, entity: OfflineEntity) {
  return `${CACHE_PREFIX}.${userId}.${entity}`;
}

function operationId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isRetryableSyncError(error: any) {
  if (!error) return false;
  if (error.code) return false;
  const message = String(error.message ?? error).toLowerCase();
  return message.includes('network') || message.includes('fetch') || message.includes('timeout');
}

export function createOfflineId() {
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function readQueue() {
  const stored = await Storage.getItem(QUEUE_KEY);
  if (!stored) return [] as OfflineOperation[];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed as OfflineOperation[] : [];
  } catch {
    return [] as OfflineOperation[];
  }
}

async function writeQueue(queue: OfflineOperation[]) {
  await Storage.setItem(QUEUE_KEY, JSON.stringify(queue));
  listeners.forEach((listener) => listener());
}

function withQueueLock<T>(task: () => Promise<T>) {
  const result = queueMutationPromise.then(task);
  queueMutationPromise = result.then(() => undefined, () => undefined);
  return result;
}

async function readStableQueue() {
  await queueMutationPromise;
  return readQueue();
}

function mutateQueue(update: (queue: OfflineOperation[]) => OfflineOperation[]) {
  return withQueueLock(async () => {
    const queue = await readQueue();
    await writeQueue(update(queue));
  });
}

export async function readOfflineCache<T>(userId: string, entity: OfflineEntity) {
  const stored = await Storage.getItem(cacheKey(userId, entity));
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed as T[] : null;
  } catch {
    return null;
  }
}

export async function writeOfflineCache(
  userId: string,
  entity: OfflineEntity,
  rows: unknown[]
) {
  await Storage.setItem(cacheKey(userId, entity), JSON.stringify(rows));
}

export async function queueOfflineUpsert(
  userId: string,
  entity: OfflineEntity,
  recordId: string,
  payload: Record<string, unknown>,
  isNew = false
) {
  await mutateQueue((queue) => {
    const previous = queue.find(
      (item) => item.userId === userId && item.entity === entity && item.recordId === recordId
    );
    const next = queue.filter(
      (item) => !(item.userId === userId && item.entity === entity && item.recordId === recordId)
    );
    next.push({
      id: operationId(),
      userId,
      entity,
      recordId,
      action: 'upsert',
      payload,
      isNew: previous?.action === 'upsert' ? previous.isNew : isNew,
      createdAt: previous?.createdAt ?? Date.now(),
    });
    return next;
  });
}

export async function queueOfflineDelete(
  userId: string,
  entity: OfflineEntity,
  recordId: string
) {
  await mutateQueue((queue) => {
    const previous = queue.find(
      (item) => item.userId === userId && item.entity === entity && item.recordId === recordId
    );
    const next = queue.filter(
      (item) => !(item.userId === userId && item.entity === entity && item.recordId === recordId)
    );
    if (!(previous?.action === 'upsert' && previous.isNew)) {
      next.push({
        id: operationId(),
        userId,
        entity,
        recordId,
        action: 'delete',
        createdAt: previous?.createdAt ?? Date.now(),
      });
    }
    return next;
  });
}

export async function pendingOfflineCount(userId?: string | null) {
  const queue = await readStableQueue();
  return userId ? queue.filter((item) => item.userId === userId).length : queue.length;
}

export function subscribeOfflineQueue(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function performOperation(operation: OfflineOperation) {
  if (operation.action === 'delete') {
    return supabase
      .from(operation.entity)
      .delete()
      .eq('id', operation.recordId)
      .eq('user_id', operation.userId);
  }
  return supabase
    .from(operation.entity)
    .upsert(operation.payload ?? {}, { onConflict: 'id' });
}

export async function flushOfflineOperations(userId: string): Promise<SyncResult> {
  if (flushPromise) {
    if (flushPromise.userId === userId) return flushPromise.promise;
    await flushPromise.promise;
    return flushOfflineOperations(userId);
  }

  const promise = (async () => {
    const initialQueue = await readStableQueue();
    const operations = initialQueue
      .filter((item) => item.userId === userId)
      .sort((a, b) => a.createdAt - b.createdAt);
    let synced = 0;
    let error: unknown | null = null;

    for (const operation of operations) {
      const step = await withQueueLock(async () => {
        const currentQueue = await readQueue();
        const currentOperation = currentQueue.find((item) => item.id === operation.id);
        if (!currentOperation) return { skipped: true, error: null as unknown | null };

        try {
          const result = await performOperation(currentOperation);
          if (result.error) return { skipped: false, error: result.error as unknown };
          await writeQueue(currentQueue.filter((item) => item.id !== currentOperation.id));
          return { skipped: false, error: null as unknown | null };
        } catch (caught) {
          return { skipped: false, error: caught };
        }
      });

      if (step.error) {
        error = step.error;
        break;
      }
      if (!step.skipped) synced += 1;
    }

    const remaining = await readStableQueue();
    return {
      synced,
      pending: remaining.filter((item) => item.userId === userId).length,
      error,
    };
  })();

  flushPromise = { userId, promise };
  try {
    return await promise;
  } finally {
    if (flushPromise?.promise === promise) flushPromise = null;
  }
}
