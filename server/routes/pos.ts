import { Router, Request, Response } from 'express';
import { serverDb } from '../db.js';
import { BroadcastFunction } from '../types.js';

export function createPosRouter(broadcast: BroadcastFunction): Router {
  const router = Router();

  // Atomic POS Checkout transaction endpoint
  router.post('/checkout', (req: Request, res: Response) => {
    try {
      const {
        items,
        totalAmount,
        subtotalAmount,
        discountAmount,
        promoApplied,
        paymentMethod,
        cashierId,
        cashReceived,
        change,
      } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Cart is empty' });
      }

      const products = serverDb.getCollection('products');

      // 1. Verify stock availability
      for (const item of items) {
        const prod = products.find((p: any) => p.id === item.productId);
        if (!prod) {
          return res.status(400).json({ error: `Product "${item.name || item.productId}" does not exist` });
        }
        if (prod.stock < item.quantity) {
          return res.status(400).json({
            error: `Insufficient stock for ${prod.name}. Available: ${prod.stock}, Requested: ${item.quantity}`,
          });
        }
      }

      // 2. Decrement stocks atomically
      const updatedProducts: any[] = [];
      for (const item of items) {
        const prod = products.find((p: any) => p.id === item.productId);
        const newStock = Math.max(0, prod.stock - item.quantity);
        const updated = serverDb.updateDocument('products', prod.id, { stock: newStock });
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

      // 3. Create transaction record
      const tx = serverDb.insertDocument('transactions', {
        totalAmount,
        subtotalAmount,
        discountAmount: discountAmount || 0,
        promoApplied: promoApplied || null,
        paymentMethod: paymentMethod || 'CASH',
        cashierId: cashierId || 'UNKNOWN',
        items,
        status: 'COMPLETED',
        cashReceived: cashReceived ?? totalAmount,
        change: change ?? 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      broadcast({
        type: 'sync',
        collection: 'transactions',
        action: 'create',
        data: tx,
      });

      // 4. Create Activity Log
      const log = serverDb.insertDocument('activityLogs', {
        type: 'SALE',
        userId: cashierId || 'UNKNOWN',
        details: `Completed SALE for ₱${Number(totalAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })} (${items.length} items) via ${paymentMethod || 'CASH'}.`,
        timestamp: new Date().toISOString(),
      });

      broadcast({
        type: 'sync',
        collection: 'activityLogs',
        action: 'create',
        data: log,
      });

      res.status(201).json({
        success: true,
        transaction: tx,
        updatedProducts,
      });
    } catch (error: any) {
      console.error('POS Checkout error:', error);
      res.status(500).json({ error: error.message || 'Internal server error processing transaction' });
    }
  });

  // Offline synchronization batch endpoint
  router.post('/sync-offline', (req: Request, res: Response) => {
    try {
      const { transactions: offlineTxs } = req.body;
      if (!offlineTxs || !Array.isArray(offlineTxs)) {
        return res.status(400).json({ error: 'transactions array is required' });
      }

      const results = [];
      for (const tx of offlineTxs) {
        const items = tx.transactionData?.items || tx.items || [];
        // Decrement stock
        for (const item of items) {
          const prod = serverDb.getDocument('products', item.productId);
          if (prod) {
            const newStock = Math.max(0, prod.stock - item.quantity);
            const updated = serverDb.updateDocument('products', prod.id, { stock: newStock });
            if (updated) {
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

        // Insert transaction
        const savedTx = serverDb.insertDocument('transactions', {
          ...tx.transactionData,
          isOfflineSync: true,
          createdAt: tx.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        broadcast({
          type: 'sync',
          collection: 'transactions',
          action: 'create',
          data: savedTx,
        });

        // Insert Activity Log
        const log = serverDb.insertDocument('activityLogs', {
          type: 'SALE',
          userId: savedTx.cashierId || 'UNKNOWN',
          details: `Synced offline SALE for ₱${Number(savedTx.totalAmount).toLocaleString('en-US', { minimumFractionDigits: 2 })} (${items.length} items)`,
          timestamp: new Date().toISOString(),
        });

        broadcast({
          type: 'sync',
          collection: 'activityLogs',
          action: 'create',
          data: log,
        });

        results.push({ syncId: tx.syncId || tx.id, status: 'synced', transactionId: savedTx.id });
      }

      res.json({ success: true, results });
    } catch (error: any) {
      console.error('Offline sync error:', error);
      res.status(500).json({ error: error.message || 'Offline sync failed' });
    }
  });

  return router;
}
