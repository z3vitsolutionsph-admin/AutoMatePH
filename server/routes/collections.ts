import { Router, Request, Response } from 'express';
import { serverDb, DatabaseSchema } from '../db.js';
import { BroadcastFunction } from '../types.js';

export function createCollectionsRouter(broadcast: BroadcastFunction): Router {
  const router = Router();

  router.get('/:name', (req: Request, res: Response) => {
    const name = req.params.name as keyof DatabaseSchema;
    const items = serverDb.getCollection(name);
    res.json(items);
  });

  router.get('/:name/:id', (req: Request, res: Response) => {
    const name = req.params.name as keyof DatabaseSchema;
    const item = serverDb.getDocument(name, req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  });

  router.post('/:name', (req: Request, res: Response) => {
    const name = req.params.name as keyof DatabaseSchema;
    const doc = serverDb.insertDocument(name, req.body);
    
    // Real-time broadcast
    broadcast({
      type: 'sync',
      collection: name,
      action: 'create',
      data: doc,
    });

    res.status(201).json(doc);
  });

  router.put('/:name/:id', (req: Request, res: Response) => {
    const name = req.params.name as keyof DatabaseSchema;
    const doc = serverDb.updateDocument(name, req.params.id, req.body);
    if (!doc) return res.status(404).json({ error: 'Not found' });

    // Real-time broadcast
    broadcast({
      type: 'sync',
      collection: name,
      action: 'update',
      data: doc,
      id: req.params.id,
    });

    res.json(doc);
  });

  router.delete('/:name/:id', (req: Request, res: Response) => {
    const name = req.params.name as keyof DatabaseSchema;
    const success = serverDb.deleteDocument(name, req.params.id);
    if (!success) return res.status(404).json({ error: 'Not found' });

    // Real-time broadcast
    broadcast({
      type: 'sync',
      collection: name,
      action: 'delete',
      id: req.params.id,
    });

    res.json({ success: true, id: req.params.id });
  });

  return router;
}
