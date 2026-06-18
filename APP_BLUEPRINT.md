# AutoMatePH Application Blueprint

This file serves as the canonical source of truth for the AutoMatePH project architecture, data models, features, and technical details. **This file must be updated every time systemic changes, new features, or structural modifications are made to the application.**

## Technical Stack
- **Frontend Framework**: React 18+ with Vite
- **Language**: TypeScript
- **Styling**: Tailwind CSS, shadcn/ui components
- **Icons**: Lucide React
- **Animations**: motion/react (Framer Motion)
- **Database/Backend**: Firebase Firestore, Firebase Authentication
- **Special Integrations**: 
  - `@zxing/library` for Barcode Scanning
  - `html2canvas` & `jspdf` for QR code PDF generation
  - `react-to-print` for printing functionality
  - `recharts` for Dashboard charts
  - `@google/genai` (Gemini 2.5 Flash) via Backend Proxy for Foresight AI Terminal

## Backend Architecture (AI Proxy)
- **Framework**: Express (Node.js)
- **Endpoint**: `POST /api/chat`
- **Purpose**: Securely handles Gemini AI requests to prevent API key exposure in the frontend.
- **Environment**: Requires `GEMINI_API_KEY` set in the server environment.

## Core Features
1. **Dashboard**: 
   - Real-time gross sales tracking.
   - Low stock item alerts.
   - Recent activity feed.
   - Sales trends visualizations (Recharts).
   - Basic Stock Forecasting (Velocity-based estimation of stock-out dates and reorder quantity).
2. **Point of Sale (POS)**:
   - Barcode scanning for fast checkout.
   - Manual search fallback.
   - Cart management, discount processing.
   - Cash/Card/E-Wallet payment processing.
   - Integration with printing receipts.
3. **Inventory Management**:
   - CRUD for tracking products (Name, Barcode, Stock, Price, Cost, Category, MinStock).
   - Real-time stock status monitoring.
   - Export Inventory to CSV.
   - Generate, Print, and Download QR/Barcode formats (Sticker PDFs).
   - **Purchase Orders**: track purchase orders, integrate with stock levels upon delivery.
4. **Activity Logs**:
   - Audit trail for `STOCK_ADJUSTMENT`, `SALE`, and `INBOUND_DELIVERY`.
   - Table to monitor staff actions and system events.
5. **Foresight Terminal (AI Assistant)**:
   - Floating context-aware AI window using Gemini.
   - Has access to real-time inventory metrics, stock alerts, and recent transaction logs.
   - Formats output beautifully in Markdown.

## Database Entities (Firestore Blueprint)

### Users (`/users/{userId}`)
- **email** (string): Authentication tied to Firebase Auth.
- **name** (string): Full name of the employee.
- **role** (string): `SUPER_ADMIN`, `STORE_MANAGER`, `CASHIER`.
- **pin** (string): 4-6 digit quick login PIN (optional feature).
- **isActive** (boolean): Soft delete flag.

### Products (`/products/{productId}`)
- **barcode** (string): Unique identifier for scanning.
- **name** (string): Product label.
- **description** (string): Detailed notes.
- **price** (number): Retail price.
- **cost** (number): Wholesale cost.
- **stock** (number): Current physical count.
- **minStock** (number): Threshold for low stock alert.
- **category** (string): Organizational tag.
- **locationId** (string): Aisle/Shelf reference.
- **supplierId** (string): ID of the linked Supplier.

### Suppliers (`/suppliers/{supplierId}`)
- **name** (string): Name of the supplier company or individual.
- **contact** (string): Phone number or email.
- **address** (string): Physical address.
- **createdAt** (string): ISO string or Firebase Timestamp.
- **updatedAt** (string): ISO string or Firebase Timestamp.

### Transactions (`/transactions/{transactionId}`)
- **totalAmount** (number): Total money exchanged.
- **paymentMethod** (string): `CASH`, `CARD`, `E_WALLET`.
- **cashierId** (string): User ID who processed it.
- **items** (array): Snapshot of products sold `{ productId, name, price, quantity, barcode }`.
- **status** (string): `COMPLETED`, `VOIDED`.

### ActivityLog (`/activityLogs/{logId}`)
- **type** (string): `STOCK_ADJUSTMENT`, `SALE`, `INBOUND_DELIVERY`, `PURCHASE_ORDER`.
- **userId** (string): The user who triggered the action.
- **details** (string): Contextual string explaining the event.
- **timestamp** (string): ISO string or Firebase Timestamp.

### PurchaseOrder (`/purchaseOrders/{orderId}`)
- **supplierName** (string): Name of the supplier.
- **supplierContact** (string): Optional contact detailing.
- **orderDate** (string): Date when the order was made.
- **expectedDeliveryDate** (string): Expected arrival date.
- **items** (array): Snapshot of ordered products `{ productId, productName, quantity, cost }`.
- **status** (string): `PENDING`, `DELIVERED`, `CANCELLED`.
- **totalAmount** (number): Total cost of the order.
- **createdBy** (string): User ID of the creator.

### Promotion (`/promotions/{promotionId}`)
- **code** (string): Custom or auto-generated coupon code.
- **name** (string): Promotion name.
- **type** (string): `PERCENTAGE`, `FIXED`, `BOGO`.
- **value** (number): Amount to discount.
- **targetType** (string): `ORDER`, `PRODUCT`, `CATEGORY`.
- **targetIds** (array): List of target strings (product IDs or categories).
- **startDate** (string): ISO string or Firebase Timestamp.
- **endDate** (string): ISO string or Firebase Timestamp.
- **active** (boolean): Is promotion currently active.

## File Structure Guidelines
- `/src/pages`: Feature-based React pages (`Dashboard.tsx`, `POS.tsx`, `Inventory.tsx`, `ActivityLog.tsx`).
- `/src/components`: Reusable UI (`Layout.tsx`, `TerminalChat.tsx`).
- `/src/components/ui`: Shadcn atomic components.
- `/src/contexts`: Global state providers (`AuthContext.tsx`).
- `/src/lib`: Utilities (`utils.ts`, `firestore-error.ts`).

## Rules for AI Agents
Whenever you modify files, add collections, alter schemas, or introduce entirely new feature sets, **you must update this file simultaneously** to retain accuracy.
