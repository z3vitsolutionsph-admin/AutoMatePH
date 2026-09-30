import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

export interface DatabaseSchema {
  products: any[];
  suppliers: any[];
  transactions: any[];
  activityLogs: any[];
  purchaseOrders: any[];
  promotions: any[];
  users: any[];
}

const defaultSeedData: DatabaseSchema = {
  users: [
    {
      id: 'usr-admin-1',
      email: 'z3vitsolutions.ph@gmail.com',
      name: 'System Administrator',
      role: 'SUPER_ADMIN',
      password: 'password123',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'usr-mgr-1',
      email: 'manager@automate.ph',
      name: 'Maria Santos',
      role: 'STORE_MANAGER',
      password: 'password123',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'usr-cashier-1',
      email: 'cashier@automate.ph',
      name: 'Juan Dela Cruz',
      role: 'CASHIER',
      password: 'password123',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'usr-clerk-1',
      email: 'clerk@automate.ph',
      name: 'Ramon Garcia',
      role: 'INVENTORY_CLERK',
      password: 'password123',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  ],
  suppliers: [
    {
      id: 'sup-1',
      name: 'Metro Wholesale Logistics',
      contact: '+63 917 123 4567',
      address: 'North Harbor Distribution Complex, Tondo, Manila',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sup-2',
      name: 'Universal Robina Direct Trade',
      contact: '+63 920 987 6543',
      address: 'Ortigas East Logistics Center, Pasig City',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'sup-3',
      name: 'San Miguel Distribution Hub',
      contact: '+63 918 555 1234',
      address: 'San Miguel Complex, Mandaluyong City',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  ],
  products: [
    {
      id: 'prod-1',
      barcode: '4800016644812',
      name: 'San Miguel Pale Pilsen 330ml Can',
      category: 'Beverages',
      price: 55,
      cost: 42,
      stock: 64,
      minStock: 20,
      description: 'Classic Philippine brewed lager beer 330ml.',
      supplierId: 'sup-3',
      imageUrl: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'prod-2',
      barcode: '4800016053331',
      name: 'C2 Cool & Clean Green Tea 500ml',
      category: 'Beverages',
      price: 35,
      cost: 25,
      stock: 48,
      minStock: 18,
      description: 'Refreshing ready-to-drink brewed green tea with apple flavor.',
      supplierId: 'sup-2',
      imageUrl: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'prod-3',
      barcode: '4800016021026',
      name: 'Piattos Cheese Potato Crisps 85g',
      category: 'Snacks',
      price: 42,
      cost: 31,
      stock: 36,
      minStock: 15,
      description: 'Hexagonal shaped potato chips bursting with rich cheddar cheese flavor.',
      supplierId: 'sup-2',
      imageUrl: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'prod-4',
      barcode: '4800016012017',
      name: 'Chippy Barbecue Corn Chips 110g',
      category: 'Snacks',
      price: 38,
      cost: 28,
      stock: 52,
      minStock: 20,
      description: 'Crispy crunchy corn chips seasoned with smoky barbecue spice.',
      supplierId: 'sup-2',
      imageUrl: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'prod-5',
      barcode: '4800011111012',
      name: 'Silver Swan Special Soy Sauce 1L',
      category: 'Groceries',
      price: 68,
      cost: 52,
      stock: 24,
      minStock: 12,
      description: 'High-grade naturally fermented Philippine soy sauce.',
      supplierId: 'sup-1',
      imageUrl: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'prod-6',
      barcode: '4800012222013',
      name: 'Datu Puti Spiced Vinegar 1L',
      category: 'Groceries',
      price: 58,
      cost: 44,
      stock: 18,
      minStock: 10,
      description: 'Cane vinegar blended with fresh local spices and chili peppers.',
      supplierId: 'sup-1',
      imageUrl: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'prod-7',
      barcode: '4807770270014',
      name: 'Lucky Me Pancit Canton Kalamansi 60g',
      category: 'Groceries',
      price: 18,
      cost: 13,
      stock: 110,
      minStock: 40,
      description: 'Instant stir-fried noodles seasoned with tangy calamansi citrus.',
      supplierId: 'sup-1',
      imageUrl: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'prod-8',
      barcode: '4902430751213',
      name: 'Safeguard Pure White Bar Soap 130g',
      category: 'Personal Care',
      price: 48,
      cost: 36,
      stock: 8,
      minStock: 15,
      description: 'Antibacterial body wash and cleanser bar soap with original scent.',
      supplierId: 'sup-1',
      imageUrl: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'prod-9',
      barcode: '8850006321456',
      name: 'Colgate Total Clean Mint Toothpaste 150g',
      category: 'Personal Care',
      price: 128,
      cost: 96,
      stock: 5,
      minStock: 12,
      description: 'Complete 12-hour antibacterial defense fluoride toothpaste.',
      supplierId: 'sup-1',
      imageUrl: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'prod-10',
      barcode: '4800038101010',
      name: 'Gardenia Classic White Bread 600g',
      category: 'Bakery',
      price: 86,
      cost: 68,
      stock: 25,
      minStock: 10,
      description: 'Freshly baked soft enriched white sandwich bread.',
      supplierId: 'sup-1',
      imageUrl: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  ],
  promotions: [
    {
      id: 'promo-1',
      code: 'WELCOME10',
      name: 'New Customer 10% Discount',
      type: 'PERCENTAGE',
      value: 10,
      targetType: 'ORDER',
      targetIds: [],
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'promo-2',
      code: 'SAVEP50',
      name: '₱50 Off Bulk Grocery Orders',
      type: 'FIXED',
      value: 50,
      targetType: 'ORDER',
      targetIds: [],
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'promo-3',
      code: 'SNACK15',
      name: '15% Off All Snacks',
      type: 'PERCENTAGE',
      value: 15,
      targetType: 'CATEGORY',
      targetIds: ['Snacks'],
      startDate: '2026-01-01',
      endDate: '2026-12-31',
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  ],
  purchaseOrders: [
    {
      id: 'po-1001',
      supplierId: 'sup-2',
      supplierName: 'Universal Robina Direct Trade',
      supplierContact: '+63 920 987 6543',
      orderDate: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0],
      expectedDeliveryDate: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0],
      items: [
        { productId: 'prod-2', productName: 'C2 Cool & Clean Green Tea 500ml', quantity: 50, cost: 25 },
        { productId: 'prod-3', productName: 'Piattos Cheese Potato Crisps 85g', quantity: 40, cost: 31 },
      ],
      status: 'PENDING',
      totalAmount: 2490,
      createdBy: 'usr-mgr-1',
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
    {
      id: 'po-1002',
      supplierId: 'sup-1',
      supplierName: 'Metro Wholesale Logistics',
      supplierContact: '+63 917 123 4567',
      orderDate: new Date(Date.now() - 86400000 * 6).toISOString().split('T')[0],
      expectedDeliveryDate: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0],
      items: [
        { productId: 'prod-7', productName: 'Lucky Me Pancit Canton Kalamansi 60g', quantity: 100, cost: 13 },
        { productId: 'prod-10', productName: 'Gardenia Classic White Bread 600g', quantity: 30, cost: 68 },
      ],
      status: 'DELIVERED',
      totalAmount: 3340,
      createdBy: 'usr-admin-1',
      createdAt: new Date(Date.now() - 86400000 * 6).toISOString(),
      updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    }
  ],
  transactions: [
    {
      id: 'tx-1001',
      totalAmount: 180,
      subtotalAmount: 180,
      discountAmount: 0,
      promoApplied: null,
      paymentMethod: 'CASH',
      cashierId: 'usr-cashier-1',
      items: [
        { productId: 'prod-1', name: 'San Miguel Pale Pilsen 330ml Can', quantity: 2, unitPrice: 55, subtotal: 110 },
        { productId: 'prod-2', name: 'C2 Cool & Clean Green Tea 500ml', quantity: 2, unitPrice: 35, subtotal: 70 },
      ],
      status: 'COMPLETED',
      cashReceived: 200,
      change: 20,
      createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
    },
    {
      id: 'tx-1002',
      totalAmount: 166,
      subtotalAmount: 166,
      discountAmount: 0,
      promoApplied: null,
      paymentMethod: 'E_WALLET',
      cashierId: 'usr-cashier-1',
      items: [
        { productId: 'prod-3', name: 'Piattos Cheese Potato Crisps 85g', quantity: 2, unitPrice: 42, subtotal: 84 },
        { productId: 'prod-4', name: 'Chippy Barbecue Corn Chips 110g', quantity: 1, unitPrice: 38, subtotal: 38 },
        { productId: 'prod-8', name: 'Safeguard Pure White Bar Soap 130g', quantity: 1, unitPrice: 44, subtotal: 44 },
      ],
      status: 'COMPLETED',
      cashReceived: 166,
      change: 0,
      createdAt: new Date(Date.now() - 3600000 * 1).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 1).toISOString(),
    }
  ],
  activityLogs: [
    {
      id: 'log-1',
      type: 'INBOUND_DELIVERY',
      userId: 'usr-admin-1',
      details: 'Initial system bootstrap and core inventory catalog imported.',
      timestamp: new Date(Date.now() - 86400000 * 7).toISOString(),
    },
    {
      id: 'log-2',
      type: 'PURCHASE_ORDER',
      userId: 'usr-admin-1',
      details: 'Received and finalized Inbound Delivery for PO-1002 (130 items received).',
      timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
    {
      id: 'log-3',
      type: 'SALE',
      userId: 'usr-cashier-1',
      details: 'Completed SALE for ₱180.00 (4 items) via CASH.',
      timestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
    },
    {
      id: 'log-4',
      type: 'SALE',
      userId: 'usr-cashier-1',
      details: 'Completed SALE for ₱166.00 (4 items) via E_WALLET.',
      timestamp: new Date(Date.now() - 3600000 * 1).toISOString(),
    }
  ]
};

class DatabaseManager {
  private db: DatabaseSchema;
  private saveTimeout: NodeJS.Timeout | null = null;

  constructor() {
    this.ensureDataDir();
    this.db = this.loadDatabase();
  }

  private ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  }

  private loadDatabase(): DatabaseSchema {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        // Merge with any missing collections
        return {
          products: parsed.products || defaultSeedData.products,
          suppliers: parsed.suppliers || defaultSeedData.suppliers,
          transactions: parsed.transactions || defaultSeedData.transactions,
          activityLogs: parsed.activityLogs || defaultSeedData.activityLogs,
          purchaseOrders: parsed.purchaseOrders || defaultSeedData.purchaseOrders,
          promotions: parsed.promotions || defaultSeedData.promotions,
          users: parsed.users || defaultSeedData.users,
        };
      }
    } catch (err) {
      console.error('Error loading database file, initializing with seeds:', err);
    }
    
    // Save initial seed
    this.persistSync(defaultSeedData);
    return JSON.parse(JSON.stringify(defaultSeedData));
  }

  private persistSync(data: DatabaseSchema) {
    try {
      this.ensureDataDir();
      const tempPath = `${DB_FILE}.tmp.${Date.now()}`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('Failed to write database to disk:', err);
    }
  }

  public schedulePersist() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.persistSync(this.db);
      this.saveTimeout = null;
    }, 100);
  }

  public getSnapshot(): DatabaseSchema {
    return JSON.parse(JSON.stringify(this.db));
  }

  public getCollection<T = any>(name: keyof DatabaseSchema): T[] {
    const col = this.db[name];
    return col ? JSON.parse(JSON.stringify(col)) : [];
  }

  public getDocument(collectionName: keyof DatabaseSchema, id: string) {
    const col = this.db[collectionName] || [];
    const doc = col.find((item: any) => item.id === id);
    return doc ? JSON.parse(JSON.stringify(doc)) : null;
  }

  public insertDocument(collectionName: keyof DatabaseSchema, data: any) {
    if (!this.db[collectionName]) {
      this.db[collectionName] = [];
    }
    const doc = {
      ...data,
      id: data.id || `${collectionName.slice(0, 3)}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt || new Date().toISOString(),
    };
    this.db[collectionName].push(doc);
    this.schedulePersist();
    return doc;
  }

  public updateDocument(collectionName: keyof DatabaseSchema, id: string, updates: any) {
    const col = this.db[collectionName] || [];
    const index = col.findIndex((item: any) => item.id === id);
    if (index === -1) {
      return null;
    }
    const updated = {
      ...col[index],
      ...updates,
      id, // Preserve id
      updatedAt: new Date().toISOString(),
    };
    col[index] = updated;
    this.schedulePersist();
    return updated;
  }

  public setDocument(collectionName: keyof DatabaseSchema, id: string, data: any) {
    const col = this.db[collectionName] || [];
    const index = col.findIndex((item: any) => item.id === id);
    const existing = index !== -1 ? col[index] : {};
    const doc = {
      ...existing,
      ...data,
      id,
      createdAt: existing.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (index !== -1) {
      col[index] = doc;
    } else {
      col.push(doc);
    }
    this.schedulePersist();
    return doc;
  }

  public deleteDocument(collectionName: keyof DatabaseSchema, id: string) {
    const col = this.db[collectionName] || [];
    const index = col.findIndex((item: any) => item.id === id);
    if (index === -1) {
      return false;
    }
    col.splice(index, 1);
    this.schedulePersist();
    return true;
  }

  public clearCollection(collectionName: keyof DatabaseSchema) {
    this.db[collectionName] = [];
    this.schedulePersist();
    return true;
  }
}

export const serverDb = new DatabaseManager();
