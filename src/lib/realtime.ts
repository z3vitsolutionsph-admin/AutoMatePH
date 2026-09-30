import { useState, useEffect, useCallback } from 'react';
import { dbLocal } from './db';

export type CollectionName = 
  | 'products' 
  | 'suppliers' 
  | 'transactions' 
  | 'activityLogs' 
  | 'purchaseOrders' 
  | 'promotions' 
  | 'users';

export type SyncState = 'online' | 'syncing' | 'offline';

export interface SyncStatusInfo {
  status: SyncState;
  label: 'Online' | 'Syncing' | 'Offline';
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedAt: Date | null;
  triggerManualSync: () => Promise<{ synced: number; failed: number }>;
}

type Listener = (data: any[]) => void;
type StatusListener = (status: 'connected' | 'connecting' | 'disconnected') => void;
type SyncStatusListener = (info: SyncStatusInfo) => void;

class RealtimeClient {
  private ws: WebSocket | null = null;
  private cache: Record<string, any[]> = {
    products: [],
    suppliers: [],
    transactions: [],
    activityLogs: [],
    purchaseOrders: [],
    promotions: [],
    users: [],
  };
  private listeners: Map<string, Set<Listener>> = new Map();
  private statusListeners: Set<StatusListener> = new Set();
  private syncListeners: Set<SyncStatusListener> = new Set();
  
  public status: 'connected' | 'connecting' | 'disconnected' = 'connecting';
  public isSyncing: boolean = false;
  public pendingCount: number = 0;
  public lastSyncedAt: Date | null = typeof window !== 'undefined' ? new Date() : null;
  
  private reconnectAttempts = 0;
  private reconnectTimer: any = null;
  private isInitialFetched = false;
  private heartbeatInterval: any = null;
  private pendingCheckInterval: any = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.init();
    }
  }

  public getSyncStatus(): SyncStatusInfo {
    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    let status: SyncState = 'online';

    if (!isOnline || this.status === 'disconnected') {
      status = 'offline';
    } else if (this.isSyncing || this.status === 'connecting') {
      status = 'syncing';
    } else {
      status = 'online';
    }

    const labelMap: Record<SyncState, 'Online' | 'Syncing' | 'Offline'> = {
      online: 'Online',
      syncing: 'Syncing',
      offline: 'Offline',
    };

    return {
      status,
      label: labelMap[status],
      isOnline,
      isSyncing: this.isSyncing,
      pendingCount: this.pendingCount,
      lastSyncedAt: this.lastSyncedAt,
      triggerManualSync: () => this.syncOfflineQueue(),
    };
  }

  public notifySyncStatus() {
    const current = this.getSyncStatus();
    this.syncListeners.forEach((cb) => {
      try {
        cb(current);
      } catch (err) {
        console.error('Error in sync status listener:', err);
      }
    });
  }

  public setSyncing(val: boolean) {
    if (this.isSyncing !== val) {
      this.isSyncing = val;
      if (!val) {
        this.lastSyncedAt = new Date();
      }
      this.notifySyncStatus();
    }
  }

  public async refreshPendingCount(): Promise<number> {
    try {
      if (typeof window !== 'undefined' && dbLocal?.transactions) {
        const count = await dbLocal.transactions.where('status').equals('pending').count();
        if (this.pendingCount !== count) {
          this.pendingCount = count;
          this.notifySyncStatus();
        }
        return count;
      }
    } catch (e) {
      // Ignore
    }
    return 0;
  }

  private setStatus(newStatus: 'connected' | 'connecting' | 'disconnected') {
    if (this.status !== newStatus) {
      this.status = newStatus;
      this.statusListeners.forEach((cb) => cb(newStatus));
      this.notifySyncStatus();
    }
  }

  private async fetchInitialData() {
    try {
      this.setSyncing(true);
      const res = await fetch('/api/sync/snapshot');
      if (res.ok) {
        const snapshot = await res.json();
        Object.keys(snapshot).forEach((col) => {
          this.cache[col] = snapshot[col] || [];
          this.notify(col);
        });
        this.isInitialFetched = true;
        this.lastSyncedAt = new Date();
      }
    } catch (err) {
      console.warn('Initial REST sync fallback attempt:', err);
    } finally {
      this.setSyncing(false);
    }
  }

  private init() {
    this.fetchInitialData();
    this.connectWebSocket();
    this.refreshPendingCount();

    // Listen for online / offline window events
    window.addEventListener('online', () => {
      this.notifySyncStatus();
      this.fetchInitialData();
      this.syncOfflineQueue();
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.connectWebSocket();
      }
    });

    window.addEventListener('offline', () => {
      this.setStatus('disconnected');
      this.notifySyncStatus();
      this.refreshPendingCount();
    });

    // Check pending offline transactions periodically
    if (this.pendingCheckInterval) clearInterval(this.pendingCheckInterval);
    this.pendingCheckInterval = setInterval(() => {
      this.refreshPendingCount();
    }, 8000);
  }

  private connectWebSocket() {
    if (typeof window === 'undefined') return;

    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }

    this.setStatus('connecting');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.setStatus('connected');
        this.reconnectAttempts = 0;
        this.lastSyncedAt = new Date();
        this.syncOfflineQueue();
        
        // Start ping heartbeat
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 20000);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleRealtimeMessage(msg);
          this.lastSyncedAt = new Date();
          this.notifySyncStatus();
        } catch (err) {
          console.error('Error parsing WS message:', err);
        }
      };

      this.ws.onclose = () => {
        this.setStatus('disconnected');
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.warn('Realtime WS encounter:', err);
        this.ws?.close();
      };
    } catch (err) {
      this.setStatus('disconnected');
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000);
    this.reconnectTimer = setTimeout(() => {
      this.connectWebSocket();
      this.fetchInitialData();
      this.syncOfflineQueue();
    }, delay);
  }

  private handleRealtimeMessage(msg: any) {
    if (!msg || !msg.type) return;

    if (msg.type === 'init' && msg.snapshot) {
      Object.keys(msg.snapshot).forEach((col) => {
        this.cache[col] = msg.snapshot[col] || [];
        this.notify(col);
      });
      return;
    }

    if (msg.type === 'sync' && msg.collection) {
      const col = msg.collection;
      if (!this.cache[col]) this.cache[col] = [];

      if (msg.action === 'create' && msg.data) {
        // Prevent duplicate
        const exists = this.cache[col].some((item) => item.id === msg.data.id);
        if (!exists) {
          this.cache[col] = [msg.data, ...this.cache[col]];
        } else {
          this.cache[col] = this.cache[col].map((item) => (item.id === msg.data.id ? msg.data : item));
        }
      } else if (msg.action === 'update' && msg.data) {
        let found = false;
        this.cache[col] = this.cache[col].map((item) => {
          if (item.id === msg.data.id) {
            found = true;
            return msg.data;
          }
          return item;
        });
        if (!found) {
          this.cache[col] = [msg.data, ...this.cache[col]];
        }
      } else if (msg.action === 'delete' && msg.id) {
        this.cache[col] = this.cache[col].filter((item) => item.id !== msg.id);
      } else if (msg.action === 'batch') {
        this.cache[col] = msg.data || [];
      }

      this.notify(col);
    }
  }

  private notify(collectionName: string) {
    const list = this.cache[collectionName] || [];
    const subscribers = this.listeners.get(collectionName);
    if (subscribers) {
      subscribers.forEach((cb) => cb([...list]));
    }
  }

  public subscribe(collectionName: string, listener: Listener): () => void {
    if (!this.listeners.has(collectionName)) {
      this.listeners.set(collectionName, new Set());
    }
    this.listeners.get(collectionName)!.add(listener);

    // Initial emission if cache has items
    if (this.cache[collectionName]) {
      listener([...this.cache[collectionName]]);
    }

    return () => {
      this.listeners.get(collectionName)?.delete(listener);
    };
  }

  public onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  public onSyncStatusChange(listener: SyncStatusListener): () => void {
    this.syncListeners.add(listener);
    listener(this.getSyncStatus());
    this.refreshPendingCount();
    return () => {
      this.syncListeners.delete(listener);
    };
  }

  public getCache(collectionName: string) {
    return [...(this.cache[collectionName] || [])];
  }

  // --- REST mutations with optimistic cache & WS broadcast triggers ---

  public async getDocs(collectionName: string): Promise<any[]> {
    if (this.cache[collectionName] && this.cache[collectionName].length > 0) {
      return [...this.cache[collectionName]];
    }
    const res = await fetch(`/api/collections/${collectionName}`);
    if (!res.ok) throw new Error(`Failed to fetch ${collectionName}`);
    const data = await res.json();
    this.cache[collectionName] = data;
    this.notify(collectionName);
    this.lastSyncedAt = new Date();
    this.notifySyncStatus();
    return data;
  }

  public async getDoc(collectionName: string, id: string): Promise<any | null> {
    const cached = (this.cache[collectionName] || []).find((i) => i.id === id);
    if (cached) return cached;
    const res = await fetch(`/api/collections/${collectionName}/${id}`);
    if (!res.ok) return null;
    return await res.json();
  }

  public async addDoc(collectionName: string, data: any): Promise<any> {
    this.setSyncing(true);
    try {
      const res = await fetch(`/api/collections/${collectionName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Failed to create in ${collectionName}`);
      }
      const created = await res.json();
      this.handleRealtimeMessage({
        type: 'sync',
        collection: collectionName,
        action: 'create',
        data: created,
      });
      this.lastSyncedAt = new Date();
      return created;
    } finally {
      this.setSyncing(false);
    }
  }

  public async updateDoc(collectionName: string, id: string, updates: any): Promise<any> {
    this.setSyncing(true);
    try {
      const res = await fetch(`/api/collections/${collectionName}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Failed to update in ${collectionName}`);
      }
      const updated = await res.json();
      this.handleRealtimeMessage({
        type: 'sync',
        collection: collectionName,
        action: 'update',
        data: updated,
      });
      this.lastSyncedAt = new Date();
      return updated;
    } finally {
      this.setSyncing(false);
    }
  }

  public async setDoc(collectionName: string, id: string, data: any): Promise<any> {
    return this.updateDoc(collectionName, id, data).catch(() => {
      return this.addDoc(collectionName, { ...data, id });
    });
  }

  public async deleteDoc(collectionName: string, id: string): Promise<boolean> {
    this.setSyncing(true);
    try {
      const res = await fetch(`/api/collections/${collectionName}/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || `Failed to delete from ${collectionName}`);
      }
      this.handleRealtimeMessage({
        type: 'sync',
        collection: collectionName,
        action: 'delete',
        id,
      });
      this.lastSyncedAt = new Date();
      return true;
    } finally {
      this.setSyncing(false);
    }
  }

  public async checkoutPOS(transactionData: any): Promise<any> {
    this.setSyncing(true);
    try {
      const res = await fetch('/api/pos/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transactionData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to process POS checkout');
      }
      this.lastSyncedAt = new Date();
      return await res.json();
    } finally {
      this.setSyncing(false);
    }
  }

  public async syncOfflineTxs(offlineTransactions: any[]): Promise<any> {
    const res = await fetch('/api/pos/sync-offline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: offlineTransactions }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Offline sync failed');
    }
    return await res.json();
  }

  public async syncOfflineQueue(): Promise<{ synced: number; failed: number }> {
    if (typeof window === 'undefined') return { synced: 0, failed: 0 };
    const isOnline = navigator.onLine && this.status !== 'disconnected';
    if (!isOnline) {
      await this.refreshPendingCount();
      return { synced: 0, failed: 0 };
    }

    this.setSyncing(true);
    try {
      const pendingTxs = await dbLocal.transactions.where('status').equals('pending').toArray();
      if (pendingTxs.length === 0) {
        this.lastSyncedAt = new Date();
        await this.refreshPendingCount();
        return { synced: 0, failed: 0 };
      }

      const res = await this.syncOfflineTxs(pendingTxs);
      let synced = 0;
      let failed = 0;

      if (res.results && Array.isArray(res.results)) {
        for (const item of res.results) {
          if (item.status === 'synced') {
            const matched = pendingTxs.find((t) => (t.syncId || t.id) === item.syncId);
            if (matched && matched.id) {
              await dbLocal.transactions.update(matched.id, { status: 'synced' });
              synced++;
            }
          } else {
            failed++;
          }
        }
      }

      await this.fetchInitialData();
      this.lastSyncedAt = new Date();
      return { synced, failed };
    } catch (err) {
      console.warn('Queue sync error:', err);
      return { synced: 0, failed: 0 };
    } finally {
      await this.refreshPendingCount();
      this.setSyncing(false);
    }
  }

  public async receivePurchaseOrder(poId: string, userId: string): Promise<any> {
    this.setSyncing(true);
    try {
      const res = await fetch(`/api/purchaseOrders/${poId}/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to receive purchase order');
      }
      this.lastSyncedAt = new Date();
      return await res.json();
    } finally {
      this.setSyncing(false);
    }
  }

  public async clearActivityLogs(): Promise<boolean> {
    this.setSyncing(true);
    try {
      const res = await fetch('/api/activityLogs/clear', {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to clear activity logs');
      this.cache['activityLogs'] = [];
      this.notify('activityLogs');
      this.lastSyncedAt = new Date();
      return true;
    } finally {
      this.setSyncing(false);
    }
  }
}

export const realtime = new RealtimeClient();

// -------------------------------------------------------------
// React Hooks
// -------------------------------------------------------------
export function useRealtimeCollection<T = any>(
  collectionName: CollectionName | string,
  filterFn?: (item: T) => boolean,
  sortFn?: (a: T, b: T) => number
) {
  const [data, setData] = useState<T[]>(() => {
    let initial = (realtime.getCache(collectionName) as T[]) || [];
    if (filterFn) initial = initial.filter(filterFn);
    if (sortFn) initial = [...initial].sort(sortFn);
    return initial;
  });
  const [loading, setLoading] = useState(data.length === 0);

  useEffect(() => {
    const unsubscribe = realtime.subscribe(collectionName, (raw) => {
      let filtered = raw as T[];
      if (filterFn) filtered = filtered.filter(filterFn);
      if (sortFn) filtered = [...filtered].sort(sortFn);
      setData(filtered);
      setLoading(false);
    });

    return unsubscribe;
  }, [collectionName, filterFn, sortFn]);

  return { data, loading };
}

export function useRealtimeStatus() {
  const [status, setStatus] = useState<'connected' | 'connecting' | 'disconnected'>(realtime.status);

  useEffect(() => {
    return realtime.onStatusChange(setStatus);
  }, []);

  return status;
}

export function useSyncStatus(): SyncStatusInfo {
  const [syncInfo, setSyncInfo] = useState<SyncStatusInfo>(() => realtime.getSyncStatus());

  useEffect(() => {
    return realtime.onSyncStatusChange(setSyncInfo);
  }, []);

  return syncInfo;
}

// -------------------------------------------------------------
// Drop-in compatibility exports for seamless code modernization
// -------------------------------------------------------------
export function collection(dbDummy: any, collectionName: string) {
  return { collectionName };
}

function generateSafeId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function doc(dbDummyOrCol: any, colOrId?: string, id?: string) {
  if (id) {
    return { collectionName: colOrId, id };
  }
  if (typeof dbDummyOrCol === 'object' && dbDummyOrCol?.collectionName) {
    return { collectionName: dbDummyOrCol.collectionName, id: colOrId || generateSafeId() };
  }
  return { collectionName: dbDummyOrCol, id: colOrId || generateSafeId() };
}

export function serverTimestamp() {
  return new Date().toISOString();
}

export function query(colRef: any, ...ops: any[]) {
  return { ...colRef, ops };
}

export function orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
  return { type: 'orderBy', field, direction };
}

export function limit(count: number) {
  return { type: 'limit', count };
}

export function where(field: string, op: string, val: any) {
  return { type: 'where', field, op, val };
}

export async function getDocs(queryOrCol: any) {
  const colName = queryOrCol.collectionName;
  const items = await realtime.getDocs(colName);
  return {
    size: items.length,
    empty: items.length === 0,
    docs: items.map((item) => ({
      id: item.id,
      data: () => item,
      exists: () => true,
    })),
    forEach: (callback: (doc: any) => void) => {
      items.forEach((item) => {
        callback({
          id: item.id,
          data: () => item,
          exists: () => true,
        });
      });
    },
  };
}

export async function getDoc(docRef: any) {
  const item = await realtime.getDoc(docRef.collectionName, docRef.id);
  return {
    id: docRef.id,
    exists: () => !!item,
    data: () => item,
  };
}

export function onSnapshot(
  target: any,
  onNext: (snapshot: any) => void,
  onError?: (error: any) => void
) {
  const colName = target.collectionName;
  if (!colName) {
    const docId = target.id;
    const unsub = realtime.subscribe(target.collectionName || 'users', (items) => {
      const item = items.find((i) => i.id === docId);
      onNext({
        id: docId,
        exists: () => !!item,
        data: () => item,
      });
    });
    return unsub;
  }

  const unsub = realtime.subscribe(colName, (items) => {
    let result = [...items];
    if (target.ops) {
      target.ops.forEach((op: any) => {
        if (op.type === 'orderBy') {
          result.sort((a, b) => {
            const valA = a[op.field];
            const valB = b[op.field];
            if (valA < valB) return op.direction === 'desc' ? 1 : -1;
            if (valA > valB) return op.direction === 'desc' ? -1 : 1;
            return 0;
          });
        } else if (op.type === 'limit') {
          result = result.slice(0, op.count);
        }
      });
    }

    onNext({
      size: result.length,
      empty: result.length === 0,
      docs: result.map((item) => ({
        id: item.id,
        data: () => item,
        exists: () => true,
      })),
      docChanges: () => [],
      forEach: (callback: (doc: any) => void) => {
        result.forEach((item) => {
          callback({
            id: item.id,
            data: () => item,
            exists: () => true,
          });
        });
      },
    });
  });

  return unsub;
}

export async function addDoc(colRef: any, data: any) {
  const doc = await realtime.addDoc(colRef.collectionName, data);
  return { id: doc.id };
}

export async function updateDoc(docRef: any, data: any) {
  await realtime.updateDoc(docRef.collectionName, docRef.id, data);
  return true;
}

export async function setDoc(docRef: any, data: any) {
  await realtime.setDoc(docRef.collectionName, docRef.id, data);
  return true;
}

export async function deleteDoc(docRef: any) {
  await realtime.deleteDoc(docRef.collectionName, docRef.id);
  return true;
}

export function writeBatch(dummyDb?: any) {
  const ops: Array<() => Promise<any>> = [];
  return {
    set: (docRef: any, data: any) => {
      ops.push(() => realtime.setDoc(docRef.collectionName, docRef.id, data));
    },
    update: (docRef: any, data: any) => {
      ops.push(() => realtime.updateDoc(docRef.collectionName, docRef.id, data));
    },
    delete: (docRef: any) => {
      ops.push(() => realtime.deleteDoc(docRef.collectionName, docRef.id));
    },
    commit: async () => {
      for (const op of ops) {
        await op();
      }
      return true;
    },
  };
}

export async function runTransaction(dummyDb: any, updateFunction: (transaction: any) => Promise<any>) {
  const transactionObject = {
    get: async (docRef: any) => {
      const item = await realtime.getDoc(docRef.collectionName, docRef.id);
      return {
        id: docRef.id,
        exists: () => !!item,
        data: () => item,
      };
    },
    set: (docRef: any, data: any) => {
      return realtime.setDoc(docRef.collectionName, docRef.id, data);
    },
    update: (docRef: any, data: any) => {
      return realtime.updateDoc(docRef.collectionName, docRef.id, data);
    },
    delete: (docRef: any) => {
      return realtime.deleteDoc(docRef.collectionName, docRef.id);
    },
  };

  return await updateFunction(transactionObject);
}

export function increment(delta: number) {
  return delta;
}

export const db = {};
export const auth = {
  get currentUser() {
    const raw = localStorage.getItem('automate_user');
    if (!raw) return null;
    try {
      const u = JSON.parse(raw);
      return {
        uid: u.id || u.uid,
        email: u.email,
        displayName: u.name,
      };
    } catch {
      return null;
    }
  },
};
export const storage = {};
