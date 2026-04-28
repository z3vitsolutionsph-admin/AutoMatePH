import Dexie, { type Table } from 'dexie';

export interface OfflineTransaction {
  id?: number;
  syncId: string;
  transactionData: any;
  status: 'pending' | 'synced' | 'failed';
  createdAt: string;
}

export class POSDatabase extends Dexie {
  transactions!: Table<OfflineTransaction>;

  constructor() {
    super('posDatabase');
    this.version(1).stores({
      transactions: '++id, syncId, status, createdAt'
    });
  }
}

export const dbLocal = new POSDatabase();
