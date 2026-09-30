import { WebSocket } from 'ws';
import { DatabaseSchema } from './db.js';

export interface RealtimeMessage {
  type: string;
  collection?: keyof DatabaseSchema | string;
  action?: 'create' | 'update' | 'delete' | 'batch';
  data?: any;
  id?: string;
  timestamp?: string;
  snapshot?: any;
}

export type BroadcastFunction = (msg: RealtimeMessage, excludeClient?: WebSocket) => void;
