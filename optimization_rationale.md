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
