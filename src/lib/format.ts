const ok = (n: number) => Number.isFinite(n);
export const px = (n: number) => (ok(n) ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—');
export const pct = (n: number, dp = 2) => (ok(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(dp)}%` : '—');
export const pts = (n: number) => (ok(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(2)}` : '—');
export const usd = (n: number, dp = 0) =>
  ok(n) ? `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}` : '—';
/** signed dollars, whole numbers; anything that rounds to zero is plain "$0" (never "-$0" or "+$0") */
export const sUsd = (n: number) => { if (!ok(n)) return '—'; const r = Math.round(Math.abs(n)); return r === 0 ? '$0' : `${n > 0 ? '+' : '-'}$${r.toLocaleString('en-US')}`; };
export const big = (n: number) => (!ok(n) ? '—' : n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : `${n}`);
export const tone = (n: number) => (n > 0 ? 'up' : n < 0 ? 'down' : '');
