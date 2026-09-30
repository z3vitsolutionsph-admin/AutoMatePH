# AutoMatePH Application Blueprint

This file serves as the canonical source of truth for the AutoMatePH project architecture, data models, features, and technical specifications. **This file is continuously updated whenever systemic changes, new features, or structural modifications are made to the application.**

---

## 1. System Overview & Platform Identity
- **Application Name**: AutoMatePH
- **Category**: Enterprise Core POS & Inventory Management Platform
- **Target Market**: Modern Philippine Retailers, Convenience Stores, Boutiques, and Supermarkets
- **Primary Currency**: Philippine Peso (₱ / PHP)
- **Key Tenets**:
  1. Low-latency POS ring-up with continuous barcode scanner ingestion.
  2. Server-authoritative real-time synchronization over persistent WebSockets.
  3. Zero-loss offline resilience powered by IndexedDB (Dexie) transaction queues.
  4. Real-time multi-terminal inventory deduction and inbound purchase order automation.
  5. Executive analytics with Recharts revenue trends visualization.
  6. Conversational store intelligence powered by Google Gemini 2.5 Flash.

---

## 2. Technical Stack Specification

### Core Frameworks & Runtime
- **Backend Runtime**: Node.js v22 with TypeScript (`tsx`)
- **Backend Web Server**: Express 4.x mounted on native Node HTTP Server
- **Frontend Framework**: React 19 SPA (Single Page Application)
- **Build Tooling**: Vite 6 with `@vitejs/plugin-react`
- **Realtime Engine**: Native WebSockets (`ws` library) on endpoint path `/ws`
- **Primary Data Store**: Disk-backed journaled JSON store with atomic temp-file swapping (`server/db.ts` -> `data/db.json`)
- **Client Offline Storage**: Dexie v4 (IndexedDB) with reactive hooks (`src/lib/db.ts`)

### UI, Styling & Visualization
- **CSS Framework**: Tailwind CSS v4 with custom Industrial Glassmorphic tokens
- **UI Primitives**: `@base-ui/react` unstyled accessible primitives
- **Icons**: Lucide React
- **Animations**: `motion/react` (Framer Motion)
- **Chart Engine**: `recharts` v3 (AreaChart, BarChart, PieChart, ResponsiveContainer)
- **Printing**: `react-to-print` for POS thermal receipt dispatch
- **Barcode & QR Generation**: `react-barcode`, `qrcode.react`, `jspdf`, `html2canvas`
- **Barcode Scanning**: `@zxing/library` for real-time camera video stream barcode decoding
- **Image Processing**: `browser-image-compression` and `react-image-crop` for product photography cataloging
- **AI Intelligence**: `@google/genai` (Gemini 2.5 Flash & Gemini 2.5 Flash Image)

---

## 3. Directory Layout & Module Organization

```
├── server.ts                  # Clean Express & Vite middleware entry point (~65 lines)
├── server/                    # Modular enterprise backend architecture
│   ├── db.ts                  # Disk-backed atomic JSON database engine with auto-healing seed data
│   ├── types.ts               # Server types (RealtimeMessage, BroadcastFunction)
│   ├── websocket.ts           # WebSocketServer lifecycle, heartbeat keep-alive, and broadcast engine
│   └── routes/                # Modular domain route handlers
│       ├── index.ts           # Central API router aggregator (/api, /health, /sync/snapshot)
│       ├── collections.ts     # Generic CRUD collection endpoints with real-time broadcasting
│       ├── pos.ts             # Atomic POS checkout & offline batch sync endpoints
│       ├── purchaseOrders.ts  # Inbound delivery status & automated stock replenishment
│       ├── auth.ts            # Authentication, login, registration, and RBAC user management
│       ├── activityLogs.ts    # Audit logs and administrative log purge
│       └── ai.ts              # Server-side Gemini 2.5 Flash assistant & product generation
├── data/
│   └── db.json                # Authoritative JSON persistent database (auto-reconstituted on boot)
├── src/                       # Frontend SPA (React 19 + TypeScript)
│   ├── components/            # Reusable UI widgets & business components
│   │   ├── ui/                # Base-UI / Tailwind glassmorphic primitives (alert-dialog, badge, button, card, dialog, input, label, sonner, table, tabs)
│   │   ├── Layout.tsx         # Responsive dashboard shell & header navigation
│   │   ├── RevenueTrendsChart.tsx # Recharts daily/weekly/hourly sales & volume analytics
│   │   ├── ServiceWorkerStatusIndicator.tsx # PWA Service Worker Online/Offline status & cache telemetry
│   │   ├── SyncStatusIndicator.tsx# Live WebSocket connectivity & offline queue telemetry popover
│   │   ├── TerminalChat.tsx   # Foresight AI assistant terminal drawer
│   │   ├── PurchaseOrders.tsx # Inbound delivery & supply chain manager
│   │   └── ErrorBoundary.tsx  # React root error boundary
│   ├── contexts/
│   │   └── AuthContext.tsx    # Role-based authentication & session state
│   ├── hooks/
│   │   └── useDebounce.ts     # Debounced input hook for instant search
│   ├── lib/
│   │   ├── db.ts              # Client-side Dexie IndexedDB offline storage
│   │   ├── realtime.ts        # Client-side WebSocket reactive synchronization
│   │   ├── utils.ts           # Currency formatting, CN helper, barcode utilities
│   │   └── utils.test.ts      # Automated unit tests for utilities
│   ├── pages/                 # Full-page application views
│   │   ├── Dashboard.tsx      # Executive overview & revenue trend analytics
│   │   ├── POS.tsx            # High-speed point of sale terminal
│   │   ├── Inventory.tsx      # Catalog management, stock controls, and QR/barcodes
│   │   ├── Promotions.tsx     # Discounts, vouchers, and BOGO engine
│   │   ├── Reports.tsx        # Financial, inventory turnover, and sales analytics
│   │   ├── ActivityLog.tsx    # Immutable system audit trail
│   │   ├── UserManagement.tsx # Staff RBAC and credential management
│   │   └── Login.tsx          # Staff sign-in portal
│   ├── App.tsx                # App routing & protected route wrappers
│   ├── index.css              # Global styles, Glassmorphism design tokens
│   └── main.tsx               # Client entry point
```

---

## 4. Database Schema & Data Models

The system maintains 7 core collections persistently stored in `data/db.json` and mirrored in client memory via WebSockets:

### A. Product (`products`)
```typescript
interface Product {
  id: string;               // e.g., 'prod-1'
  barcode: string;          // EAN-13, UPC, or custom barcode string
  name: string;             // Product display name
  category: string;         // Category classification (e.g. 'Beverages', 'Snacks', 'Canned Goods')
  price: number;            // Selling retail price in PHP (₱)
  cost: number;             // Wholesale cost in PHP (₱)
  stock: number;            // Available physical inventory count
  minStock: number;         // Low stock alert threshold
  description?: string;     // Product summary description
  supplierId?: string;      // Associated vendor ID
  imageUrl?: string;        // Base64 or URL product photography
  createdAt: string;        // ISO 8601 timestamp
  updatedAt: string;        // ISO 8601 timestamp
}
```

### B. Transaction (`transactions`)
```typescript
interface TransactionItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
}

interface Transaction {
  id: string;               // e.g., 'tx-1727680000000-abc123'
  totalAmount: number;      // Final payable amount in PHP (₱)
  subtotalAmount: number;   // Pre-discount total in PHP (₱)
  discountAmount: number;   // Calculated discount in PHP (₱)
  promoApplied?: string;    // Voucher code or promotion name
  paymentMethod: 'CASH' | 'CARD' | 'E-WALLET';
  cashierId: string;        // Staff user ID who rung the sale
  items: TransactionItem[]; // Line items sold
  status: 'COMPLETED' | 'VOIDED';
  cashReceived?: number;    // Cash tendered by customer
  change?: number;          // Cash returned to customer
  isOfflineSync?: boolean;  // Flagged if rung during network disconnect
  createdAt: string;        // ISO 8601 timestamp
  updatedAt: string;        // ISO 8601 timestamp
}
```

### C. Purchase Order (`purchaseOrders`)
```typescript
interface PurchaseOrderItem {
  productId: string;
  name: string;
  quantity: number;
  cost: number;
}

interface PurchaseOrder {
  id: string;               // e.g., 'po-1'
  supplierId: string;       // Supplier entity ID
  supplierName: string;     // Supplier display name
  items: PurchaseOrderItem[];
  totalCost: number;        // Sum of all items cost
  status: 'PENDING' | 'DELIVERED' | 'CANCELLED';
  expectedDate?: string;    // Expected arrival date
  receivedDate?: string;    // Delivery timestamp
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
```

### D. Promotion (`promotions`)
```typescript
interface Promotion {
  id: string;               // e.g., 'promo-1'
  code: string;             // Promo code (e.g. 'SUMMER20')
  name: string;             // Promotion title
  type: 'PERCENTAGE' | 'FIXED' | 'BOGO';
  value: number;            // Percentage discount (e.g., 20 for 20%) or Fixed PHP amount
  minSpend?: number;        // Minimum transaction total to qualify
  startDate: string;        // Validity start date
  endDate: string;          // Expiration date
  isActive: boolean;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}
```

### E. Supplier (`suppliers`)
```typescript
interface Supplier {
  id: string;               // e.g., 'sup-1'
  name: string;             // Company name
  contact: string;          // Phone / mobile number
  address: string;          // Distribution hub / office address
  createdAt: string;
  updatedAt: string;
}
```

### F. User Account (`users`)
```typescript
interface User {
  id: string;               // e.g., 'usr-admin-1'
  email: string;            // Login credential email
  name: string;             // Full name
  role: 'SUPER_ADMIN' | 'STORE_MANAGER' | 'CASHIER' | 'INVENTORY_CLERK';
  password?: string;        // Auth password (stripped in API responses)
  isActive: boolean;        // Deactivation toggle
  createdAt: string;
  updatedAt: string;
}
```

### G. Activity Log (`activityLogs`)
```typescript
interface ActivityLog {
  id: string;               // e.g., 'act-1'
  type: 'SALE' | 'STOCK_ADJUSTMENT' | 'PURCHASE_ORDER' | 'USER_ACTION';
  userId: string;           // Responsible user or Cashier ID
  details: string;          // Human-readable audit text
  timestamp: string;        // ISO 8601 timestamp
}
```

---

## 5. API & Realtime Protocols

### REST API Endpoints (`/api/*`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health check with active WebSocket connection count |
| `GET` | `/api/sync/snapshot` | Returns complete database state for initial client hydration |
| `GET` | `/api/collections/:name` | Retrieves all records in a collection (`products`, `suppliers`, etc.) |
| `GET` | `/api/collections/:name/:id` | Retrieves a specific document by ID |
| `POST` | `/api/collections/:name` | Creates a document and broadcasts real-time `create` event |
| `PUT` | `/api/collections/:name/:id` | Updates a document and broadcasts real-time `update` event |
| `DELETE` | `/api/collections/:name/:id` | Deletes a document and broadcasts real-time `delete` event |
| `POST` | `/api/pos/checkout` | Atomic checkout: verifies stock, decrements inventory, creates transaction, writes activity log, and broadcasts mutations |
| `POST` | `/api/pos/sync-offline` | Batch sync: flushes queued offline sales, adjusts inventory, and emits broadcasts |
| `POST` | `/api/purchaseOrders/:id/receive` | Receives inbound PO: changes status to `DELIVERED`, auto-increments product stock, logs delivery audit event |
| `POST` | `/api/auth/login` | Authenticates email & password, bootstraps admin if required, returns user object & JWT token |
| `POST` | `/api/auth/register` | Self-registration endpoint |
| `GET` | `/api/auth/users` | Lists all users with passwords securely sanitized |
| `POST` | `/api/auth/users` | Admin creation of new staff accounts |
| `PUT` | `/api/auth/users/:id` | Admin update of staff profile, roles, or active status |
| `DELETE` | `/api/auth/users/:id` | Admin deletion of staff accounts |
| `POST` | `/api/activityLogs/clear` | Purges audit logs and emits `batch` empty event to all clients |
| `POST` | `/api/ai/chat` | Foresight AI Assistant chat using Gemini 2.5 Flash with live store telemetry context |
| `POST` | `/api/ai/description` | Generates short, engaging catalog product descriptions using Gemini |
| `POST` | `/api/ai/product-image` | Generates studio product photography using Gemini 2.5 Flash Image |

### Realtime WebSocket Protocol (`/ws`)
1. **Connection Lifecycle**:
   - Clients connect via `ws://${host}/ws` (or `wss://` over TLS).
   - Upon connection, server immediately sends `{ type: 'init', snapshot: { ... } }`.
   - Keep-alive heartbeat: ping/pong every 25 seconds ensures persistent connection.
2. **Event Payload Schema**:
   ```typescript
   interface RealtimeMessage {
     type: 'init' | 'sync' | 'ping' | 'pong';
     collection?: string;
     action?: 'create' | 'update' | 'delete' | 'batch';
     data?: any;
     id?: string;
     timestamp?: string;
     snapshot?: any;
   }
   ```
3. **Client-Side Reactive Synchronization (`src/lib/realtime.ts`)**:
   - Replaces Firebase Firestore with native WebSockets.
   - Emulates familiar query, subscription, and document snapshot APIs (`onSnapshot`, `doc`, `collection`, `addDoc`, `updateDoc`, `deleteDoc`).
   - Maintains an in-memory client database cache updated instantly upon receiving broadcast messages.

---

## 6. Offline-First Resilience Architecture

1. **Local Transaction Buffering (`src/lib/db.ts`)**:
   - When network connectivity is lost (`navigator.onLine === false` or WebSocket disconnect), POS transactions continue ringing up without delay.
   - Transactions are committed to client-side IndexedDB via Dexie (`offlineTransactions` table).
2. **Auto-Reconciliation Worker**:
   - The system listens for `window.addEventListener('online')` and WebSocket reconnect events.
   - Once reconnected, pending offline transactions are batched to `/api/pos/sync-offline`.
   - The server validates stock, commits transactions, updates inventory, and broadcasts changes across the network.
3. **Telemetry & Visual Feedback**:
   - **Service Worker Status Indicator (`ServiceWorkerStatusIndicator.tsx`)**:
     - Monitors browser network connectivity (`navigator.onLine`) and PWA Service Worker lifecycle (registering, active, updating).
     - Renders an 'Online' / 'Offline' status indicator in the top header with a pulsing status beacon.
     - Interactive popover surfaces Workbox precaching status (`globPatterns` from `vite.config.ts`), PWA registration details, in-app installation action (`beforeinstallprompt`), and a "Check Updates" trigger (`registration.update()`).
   - **Synchronization Status Indicator (`SyncStatusIndicator.tsx`)**:
     - Displays real-time indicator in dashboard header:
       - **Online**: Emerald pulse beacon (`#1D9E75`)
       - **Syncing**: Amber spinning radar (`#FF6F00`)
       - **Offline**: Amber/crimson disconnected beacon with count of queued offline sales.
     - Interactive popover provides transport metadata, last synced timestamp, and manual "Sync Now" trigger.

---

## 7. UI/UX Design System & Glassmorphism Guidelines

### Theme Palette & Dark Industrial Tokens
- **Canvas Background**: `#0A0C10` (obsidian space black)
- **Surface Elevation**: `#141210` (deep charcoal industrial surface)
- **Card Background**: `#1A1614` (elevated container)
- **Primary Accent**: `#FF6F00` (luminous tactile amber/orange)
- **Success / Online**: `#1D9E75` (emerald pulse green)
- **Danger / Low Stock**: `#E74C3C` (vibrant warning crimson)
- **Monospace Secondary**: `#8E857E` (technical warm grey)
- **Primary Typography**: `#FAF7F2` (crisp warm white)

### Glassmorphic Utility Classes (`src/index.css`)
- `.glass-panel`: Translucent background `rgba(20, 18, 16, 0.65)` with `backdrop-filter: blur(20px) saturate(190%)` and subtle specular top highlight.
- `.glass-card`: Translucent card `rgba(26, 22, 20, 0.52)` with `backdrop-filter: blur(16px)` and specular border `rgba(255, 255, 255, 0.08)`.
- `.glass-modal`: Modal backdrop `rgba(18, 16, 14, 0.88)` with `backdrop-filter: blur(28px) saturate(210%)` and soft shadow `rgba(0, 0, 0, 0.7)`.
- `.glass-input`: Focus-reactive translucent input container `rgba(10, 12, 16, 0.65)` with amber border focus glow.

---

## 8. Core Features & Business Logic

### 1. Dashboard & Revenue Trends Visualization (`RevenueTrendsChart.tsx`)
- **Multi-Horizon Timeframes**:
  - **Daily Mode**: 7-day, 14-day, and 30-day views.
  - **Weekly Mode**: 4-week, 8-week, and 12-week aggregations.
  - **Hourly Mode**: 24-hour intraday distribution.
- **Executive KPIs**:
  - Period Total Revenue (₱)
  - Run Rate (average daily or weekly revenue)
  - Peak Sales Benchmark (highest date and sales figure)
  - Period Growth Rate (% change vs previous equivalent window)
  - Order Count and Average Order Value (AOV)
- **Visualization Modes**:
  - Recharts `AreaChart` with vertical gradient fill.
  - Recharts `BarChart` with rounded corner columns.
  - Toggle between Revenue (₱) and Sales Volume (order count).
  - Reference benchmark line displaying period average.

### 2. Point of Sale Terminal (`POS.tsx`)
- Barcode scanner integration supporting hardware USB/Bluetooth barcode guns and camera stream scanning via `@zxing/library`.
- Fast product search with fuzzy matching.
- Real-time stock availability validation prevents selling out-of-stock items.
- Multiple payment methods: Cash (with auto change calculation), Card, and E-Wallet (GCash, Maya).
- Promotion voucher code redemption.
- Receipt generation and printing via `react-to-print`.
- Full offline ring-up queue support.

### 3. Inventory Management (`Inventory.tsx`)
- Complete product CRUD with barcode, cost, price, stock, category, and minimum stock threshold.
- Low-stock badge indicators and stock valuation summaries (Retail value, Cost value, Gross margin).
- Image upload, crop, and automatic compression.
- Export inventory catalog to CSV.
- Barcode and QR code sticker generation with formatted PDF export via `jspdf`.

### 4. Inbound Purchase Orders (`PurchaseOrders.tsx`)
- Purchase order creation linked to vendor registry.
- Workflow management: `PENDING`, `DELIVERED`, `CANCELLED`.
- One-click delivery receipt: automates stock increment across all items and generates an immutable audit log.

### 5. Foresight AI Assistant Terminal (`TerminalChat.tsx`)
- Floating drawer accessible via header button or `F4` shortcut.
- Powered by server-side Gemini 2.5 Flash via `/api/ai/chat`.
- Context-aware: server injects live store snapshot (product count, low stock items, sales volume) into system instructions.
- Returns formatted Markdown tables and advice tailored to Philippine retail operations.

### 6. Staff & Access Control (`UserManagement.tsx`)
- Tiered Role-Based Access Control:
  - `SUPER_ADMIN`: Full systemic privileges, user management, and log purge.
  - `STORE_MANAGER`: Inventory management, purchase orders, pricing, and reports.
  - `CASHIER`: POS sales, receipt printing, and catalog lookup.
  - `INVENTORY_CLERK`: Stock adjustments, purchase orders, and receiving.
- Account creation, password reset, role reassignment, and account deactivation.

---

## 9. Frontend Resilience & White Screen Prevention

To guarantee high availability and prevent browser white screens across development and production:
1. **Guarded Service Worker Registration (`src/main.tsx`)**: Dynamic PWA register imports are guarded with try/catch and environment checks to prevent Vite development servers from returning HTML 200 responses for `.js` modules.
2. **Safe UUID Fallback**: Polyfill fallback everywhere `crypto.randomUUID()` is called, ensuring compatibility with non-HTTPS origins and restrictive iframe sandboxes.
3. **Resilient Protected Routes (`src/App.tsx`)**: Replaced blank `null` returns during auth loading with an accessible glassmorphic loading shell.
4. **Session Integrity**: Hardened `AuthContext.tsx` to handle corrupted or malformed localStorage keys gracefully without crashing the React root tree.
