// Screen-size scaling is now handled by a single global `zoom: var(--s)` on #root
// (see App.css). These helpers are kept as identity passthroughs so existing
// call sites keep working without double-scaling. --s drives the global zoom only.
export const scale = 1;

// Identity — global zoom already scales every pixel; do not scale again here.
export const sc = (n: number): number => n;
