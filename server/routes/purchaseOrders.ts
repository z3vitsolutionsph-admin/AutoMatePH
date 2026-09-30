import { Router, Request, Response } from 'express';
import { serverDb } from '../db.js';
import { BroadcastFunction } from '../types.js';

export function createPurchaseOrdersRouter(broadcast: BroadcastFunction): Router {
  const router = Router();

  // Receive Purchase Order (auto stock increment)
  router.post('/:id/receive', (req: Request, res: Response) => {
    const po = serverDb.getDocument('purchaseOrders', req.params.id);
    if (!po) return res.status(404).json({ error: 'Purchase Order not found' });
    if (po.status === 'DELIVERED') {
      return res.status(400).json({ error: 'Purchase order is already delivered' });
    }

    // Update PO status
    const updatedPO = serverDb.updateDocument('purchaseOrders', po.id, {
      status: 'DELIVERED',
      updatedAt: new Date().toISOString(),
    });

    // Increment stock for each item
    const updatedProducts = [];
    if (po.items && Array.isArray(po.items)) {
      for (const item of po.items) {
        const prod = serverDb.getDocument('products', item.productId);
        if (prod) {
          const newStock = (prod.stock || 0) + Number(item.quantity || 0);
          const updated = serverDb.updateDocument('products', prod.id, {
            stock: newStock,
            cost: item.cost ? Number(item.cost) : prod.cost,
          });
          if (updated) {
            updatedProducts.push(updated);
            broadcast({
              type: 'sync',
              collection: 'products',
              action: 'update',
              data: updated,
              id: updated.id,
            });
          }
        }
      }
    }

    // Activity Log
    const log = serverDb.insertDocument('activityLogs', {
      type: 'PURCHASE_ORDER',
      userId: req.body.userId || 'Admin',
      details: `Received and finalized Inbound Delivery for PO ${po.id} from ${po.supplierName}. Stock updated.`,
      timestamp: new Date().toISOString(),
    });

    broadcast({
      type: 'sync',
      collection: 'purchaseOrders',
      action: 'update',
      data: updatedPO,
      id: po.id,
    });

    broadcast({
      type: 'sync',
      collection: 'activityLogs',
      action: 'create',
      data: log,
    });

    res.json({ success: true, purchaseOrder: updatedPO, updatedProducts });
  });

  return router;
}
