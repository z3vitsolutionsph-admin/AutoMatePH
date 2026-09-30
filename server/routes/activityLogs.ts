import { Router, Request, Response } from 'express';
import { serverDb } from '../db.js';
import { BroadcastFunction } from '../types.js';

export function createActivityLogsRouter(broadcast: BroadcastFunction): Router {
  const router = Router();

  // Clear Activity Logs (Admin only)
  router.post('/clear', (req: Request, res: Response) => {
    serverDb.clearCollection('activityLogs');
    broadcast({
      type: 'sync',
      collection: 'activityLogs',
      action: 'batch',
      data: [],
    });
    res.json({ success: true });
  });

  return router;
}
