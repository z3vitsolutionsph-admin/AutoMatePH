## 2025-05-15 - [Optimization: Inventory Selection State]
**Learning:** Using an array for multi-selection state in a table results in O(N*M) rendering complexity due to repeated `.includes()` calls in the render loop. As N (total items) and M (selected items) grow, this causes noticeable UI lag.
**Action:** Always use a `Set<string>` for selection IDs to achieve O(1) lookup per row, ensuring O(N) total rendering complexity regardless of how many items are selected.
