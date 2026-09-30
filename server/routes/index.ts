import { Router, Request, Response } from 'express';
import { WebSocketServer } from 'ws';
import { serverDb } from '../db.js';
import { BroadcastFunction } from '../types.js';
import { createCollectionsRouter } from './collections.js';
import { createPosRouter } from './pos.js';
import { createPurchaseOrdersRouter } from './purchaseOrders.js';
import { createAuthRouter } from './auth.js';
import { createActivityLogsRouter } from './activityLogs.js';
import { createAiRouter } from './ai.js';

export function createApiRouter(broadcast: BroadcastFunction, wss: WebSocketServer): Router {
  const router = Router();

  // Health check
  router.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      connections: wss.clients.size,
      time: new Date().toISOString(),
    });
  });

  // Get full snapshot for sync
  router.get('/sync/snapshot', (req: Request, res: Response) => {
    res.json(serverDb.getSnapshot());
  });

  // Domain routers
  router.use('/collections', createCollectionsRouter(broadcast));
  router.use('/pos', createPosRouter(broadcast));
  router.use('/purchaseOrders', createPurchaseOrdersRouter(broadcast));
  router.use('/auth', createAuthRouter(broadcast));
  router.use('/activityLogs', createActivityLogsRouter(broadcast));
  router.use('/ai', createAiRouter());

  return router;
}
