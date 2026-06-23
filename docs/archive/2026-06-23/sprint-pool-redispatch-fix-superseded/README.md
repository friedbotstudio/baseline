# Superseded — sprint-pool-redispatch-fix

The narrow two-function fix (watcher dedup + yield-resolution) was superseded by the broker transport (`sprint-pool-broker-transport`), which removes the watch loop entirely. The yield-resolution fix was preserved inside the broker; the edge-trigger dedup was dropped as moot. Kept for reference.
