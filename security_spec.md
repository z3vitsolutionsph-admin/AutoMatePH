# Phase 0: Payload-First Security TDD

## 1. Data Invariants
- A user must have a valid role (SUPER_ADMIN, STORE_MANAGER, CASHIER).
- User Profiles cannot be modified to elevate privileges by the user themselves. Only SUPER_ADMIN can elevate privileges.
- Products can only be modified by SUPER_ADMIN or STORE_MANAGER.
- Transactions can be created by CASHIER, STORE_MANAGER, or SUPER_ADMIN.
- Transactions cannot be modified once they are essentially COMPLETED or VOIDED terminal states.
- ActivityLogs are immutable and append-only.

## 2. The "Dirty Dozen" Payloads
1. **Identity Spoofing**: Attempt to update `role` on own user profile to "SUPER_ADMIN".
2. **Missing Field**: Create a Product without a `price`.
3. **Type Mismatch**: Create a Product with `stock` as a String instead of a Number.
4. **Unbounded List**: Create a Transaction with > 1000 items (DoS).
5. **Ghost Field**: Create a Transaction with an unmapped field `isRefunded: true`.
6. **Orphaned Write**: Create a Transaction with a `cashierId` that does not exist in the database.
7. **Terminal State Break**: Update a `COMPLETED` Transaction to `VOIDED`.
8. **PII Blanket Read**: A CASHIER attempts to `list` all user profiles to harvest emails and PINs.
9. **Timestamp Spoofing**: Create a Transaction with `createdAt` as tomorrow.
10. **ID Poisoning**: Query or create a Product with a 1.5MB ID string.
11. **Negative Stock**: Update Product stock to a negative number.
12. **Silent Invalidation**: Edit immutable ActivityLog.

## 3. Test Runner
(Will be implemented in `firestore.rules.test.ts` if a test environment is available)
