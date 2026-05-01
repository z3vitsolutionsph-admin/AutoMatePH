# Optimization Rationale: Offline Transaction Sync

## Current Issue
The current offline synchronization logic in `src/pages/POS.tsx` follows an N+1 pattern:
1. It iterates through all pending transactions.
2. For each transaction, it calls `addDoc` (Firestore), which initiates a network request.
3. For each transaction, it calls `dbLocal.transactions.update` (Dexie/IndexedDB), which initiates a local I/O operation.

This leads to:
- High network latency due to sequential round-trips.
- Increased overhead on the local database due to multiple individual transactions.

## Proposed Optimization
1. **Firestore writeBatch**: Use `writeBatch` to group up to 500 `set` operations into a single atomic write. This reduces the number of network requests from N to N/500.
2. **Dexie bulkUpdate**: Use `bulkUpdate` to update the status of all successfully synced transactions in a single IndexedDB transaction. This significantly reduces disk I/O overhead.

## Expected Impact
- **Reduced Sync Time**: Synchronizing 100 transactions will take roughly the time of one batch operation instead of 100 sequential operations.
- **Improved Reliability**: Atomic batches ensure that either all transactions in a batch are synced or none (though in this case we are creating new docs, so it's mostly about efficiency).
- **Lower Resource Usage**: Fewer network requests and database transactions reduce CPU and battery consumption on mobile devices.

# Optimization Rationale: N+1 Query in Checkout Process

## Current Issue
The online checkout logic in `src/pages/POS.tsx` currently performs multiple sequential Firestore operations:
1. One `addDoc` to create the transaction.
2. Multiple `updateDoc` calls in a loop (one for each item in the cart) to update product stock.
3. One `addDoc` to log the activity.

For a cart with `N` items, this results in `N + 2` sequential network round-trips. This causes a noticeable delay in the checkout process, especially on slower connections or with larger carts.

## Proposed Optimization
Refactor the logic to use a Firestore `writeBatch`. This allows us to bundle the transaction creation, all stock updates, and the activity log into a single atomic operation.

## Expected Impact
- **Performance**: Reduces the number of network round-trips from `N + 2` to exactly 1.
- **Atomicity**: Ensures that either the entire checkout process succeeds (transaction created, stocks updated, activity logged) or none of it does, preventing partial state updates.
- **User Experience**: Makes the "Confirm Transaction" action feel significantly faster and more responsive.
