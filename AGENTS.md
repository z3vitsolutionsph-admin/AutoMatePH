# Agent Operating Procedures

## Blueprint Maintenance
Whenever you make changes to the app's structural architecture, tech stack, directory layout, UI logic, Firebase data models, or core features, you **MUST** simultaneously update `APP_BLUEPRINT.md` (and `firebase-blueprint.json` if data schemas have changed) to reflect those updates. 

This ensures that the `APP_BLUEPRINT.md` acts as a continuously updated living document for the application.

---

## 1. Engineering Principles & Operating Guidelines

### A. Full-Stack Separation of Concerns
1. **Root Entry Point (`server.ts`)**:
   - `server.ts` must remain a lean, high-level orchestration entry point.
   - Do not bloat `server.ts` with domain route implementations, raw SQL/JSON handlers, or inlined business logic.
   - All REST routing resides in modular domain subrouters in `server/routes/`.
   - WebSocket connection handling and event dispatching reside in `server/websocket.ts`.
   - Database operations and schema persistence reside in `server/db.ts`.

2. **Repository & Directory Hygiene**:
   - **No Redundant Lockfiles**: The project strictly uses `npm` (`package.json` and `package-lock.json`). Do not create or commit `bun.lock`, `pnpm-lock.yaml`, or `yarn.lock`.
   - **No Orphaned Scratchpads**: Do not leave one-off spec or temporary notes (e.g., `security_spec.md`) at root. All architectural and security specifications must be maintained canonically inside `APP_BLUEPRINT.md`.
   - **Build Artifacts Excluded**: The `dist/` directory is generated on `npm run build` and must remain listed in `.gitignore`.

### B. Backend Architecture & Data Invariants
1. **Self-Healing Persistence**:
   - The database file is located at `data/db.json`.
   - `server/db.ts` must ensure directory existence (`this.ensureDataDir()`) both during initialization and before disk writes in `persistSync()`.
   - If the `data/` directory or `db.json` is missing, the system must self-heal by reconstituting the folder and seeding default data without crashing.

2. **Atomic Inventory & Transaction Coupling**:
   - POS sales (`/api/pos/checkout`) and offline reconciliations (`/api/pos/sync-offline`) must verify stock levels and deduct inventory atomically.
   - For every sale, three events must be committed and broadcast simultaneously:
     1. Inventory stock decrement on `products`.
     2. New immutable sales record on `transactions`.
     3. Audit trail entry on `activityLogs`.

3. **Inbound Delivery Automation**:
   - Receiving a Purchase Order (`/api/purchaseOrders/:id/receive`) must update PO status to `DELIVERED`, increment stock for all contained product line items, record an audit event, and broadcast updates to all connected POS terminals in real time.

4. **Realtime WebSocket Protocol**:
   - The server maintains a WebSocket server on `/ws`.
   - Upon connection, the server sends a full database snapshot (`{ type: 'init', snapshot }`).
   - Every state change triggers a broadcast (`{ type: 'sync', collection, action, data, id }`).
   - Heartbeat ping/pong intervals (25 seconds) prevent connection drops across proxies and load balancers.

### C. Frontend Architecture & Design System Guidelines
1. **Dark Industrial Glassmorphism**:
   - Canvas background: `#0A0C10` (obsidian black).
   - Glass Panels: `.glass-panel` (`rgba(20, 18, 16, 0.65)` backdrop blur 20px, border `rgba(255, 255, 255, 0.08)`).
   - Glass Cards: `.glass-card` (`rgba(26, 22, 20, 0.52)` backdrop blur 16px).
   - Glass Modals: `.glass-modal` (`rgba(18, 16, 14, 0.88)` backdrop blur 28px).
   - Accent Colors: `#FF6F00` (tactile industrial amber) for primary actions, `#1D9E75` (emerald pulse) for online/success indicators.

2. **White Screen Bug Prevention**:
   - **Guarded Dynamic Imports**: Service worker registration must never block React DOM hydration.
   - **Safe UUID Fallback**: Always check for `typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'` before calling `crypto.randomUUID()`. Provide a timestamp/random fallback for restricted iframe sandboxes.
   - **Graceful ProtectedRoute Loading**: Never return `null` or a blank screen on auth loading. Render the glassmorphic loading shell while evaluating credentials.
   - **Session Fallbacks**: Default to safe unauthenticated state if localStorage contains malformed session JSON.

---

## 2. Verification Protocol

Before completing any task, an agent MUST execute the following verification steps:
1. **Type & Syntax Validation**: Execute `lint_applet` (`tsc --noEmit`). Must complete with 0 errors.
2. **Production Asset Build**: Execute `compile_applet` (`vite build`). Must compile successfully.
3. **Runtime Server Health**: Ensure dev server is responsive on port 3000 and verify `/api/health`.
4. **Living Blueprint Update**: Keep `APP_BLUEPRINT.md` up to date with any newly added components, endpoints, or data models.
