import { config } from '../config.js';
/**
 * Tiered refresh scheduler.
 *
 * Upstream sets no ETag or Last-Modified, so conditional requests are
 * impossible. Instead: poll the two tiny endpoints often, pull the ~5 MB corpus
 * only when a probe says something changed, with a slow full refresh as a
 * safety net for changes no probe can see (a player being renamed, say).
 *
 * Steady-state upstream cost is roughly 1.5 KB/minute plus one 5 MB fetch/hour,
 * regardless of how much traffic we serve.
 */
export function startScheduler(store) {
    const timers = [];
    const every = (intervalMs, task, label) => {
        const timer = setInterval(() => {
            task().catch((error) => {
                console.warn(`[scheduler] ${label} failed: ${String(error)}`);
            });
        }, intervalMs);
        // Never keep the process alive purely to run a timer.
        timer.unref();
        timers.push(timer);
    };
    every(config.refresh.directoryProbeIntervalMs, () => store.probeDirectory(), 'directory probe');
    every(config.refresh.manifestProbeIntervalMs, () => store.probeManifest(), 'manifest probe');
    every(config.refresh.fullIntervalMs, () => store.refresh(), 'full refresh');
    console.log(`[scheduler] directory probe ${config.refresh.directoryProbeIntervalMs}ms, ` +
        `manifest probe ${config.refresh.manifestProbeIntervalMs}ms, ` +
        `full refresh ${config.refresh.fullIntervalMs}ms`);
    return () => {
        for (const timer of timers)
            clearInterval(timer);
    };
}
//# sourceMappingURL=scheduler.js.map