export const px = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (n: number, dp = 2) => `${n >= 0 ? '+' : ''}${n.toFixed(dp)}%`;
export const usd = (n: number, dp = 0) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;
export const sUsd = (n: number) => `${n >= 0 ? '+' : '-'}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
export const big = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : `${n}`);
export const tone = (n: number) => (n > 0 ? 'up' : n < 0 ? 'down' : '');
