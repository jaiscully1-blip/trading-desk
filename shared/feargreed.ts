// Desk Fear & Greed: our own 0-100 blend from free data. NOT CNN's index (CNN has no free API).
// 0 = extreme fear, 100 = extreme greed. Each part is scored 0-100, the score is their average.
export interface FgPart { id: string; label: string; score: number; detail: string }
export interface FearGreed { score: number; label: string; parts: FgPart[]; date: string }

const clamp = (x: number) => Math.max(0, Math.min(100, x));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
export const fgLabel = (s: number) => (s < 25 ? 'Extreme fear' : s < 45 ? 'Fear' : s <= 55 ? 'Neutral' : s <= 75 ? 'Greed' : 'Extreme greed');

/** series = oldest -> newest daily values */
export function fearGreed(inp: { vix?: number[]; spx?: number[]; hy?: number[]; putCall?: number | null; date: string }): FearGreed | null {
  const parts: FgPart[] = [];
  const v = inp.vix ?? [];
  if (v.length >= 50) {
    const avg = mean(v.slice(-50)), r = v.at(-1)! / avg;
    parts.push({ id: 'vix', label: 'Volatility', score: clamp(50 - (r - 1) * 250), detail: `VIX ${v.at(-1)!.toFixed(1)} vs ${avg.toFixed(1)} 50-day average` });
  }
  const s = inp.spx ?? [];
  if (s.length >= 125) {
    const ma = mean(s.slice(-125)), d = s.at(-1)! / ma - 1;
    parts.push({ id: 'mom', label: 'Momentum', score: clamp(50 + d * 500), detail: `S&P 500 ${(d * 100).toFixed(1)}% vs its 125-day average` });
  }
  const h = inp.hy ?? [];
  if (h.length >= 60) {
    const now = h.at(-1)!, yr = h.slice(-252), below = yr.filter((x) => x < now).length / yr.length;
    parts.push({ id: 'junk', label: 'Junk bond demand', score: clamp(100 - below * 100), detail: `High-yield spread ${now.toFixed(2)}%, wider than ${Math.round(below * 100)}% of the past year` });
  }
  if (inp.putCall != null && Number.isFinite(inp.putCall)) {
    parts.push({ id: 'pc', label: 'Put/call', score: clamp(100 - ((inp.putCall - 0.6) / 0.6) * 100), detail: `SPY put/call ${inp.putCall.toFixed(2)} (0.6 greedy … 1.2 fearful)` });
  }
  if (parts.length < 2) return null;
  const score = Math.round(mean(parts.map((p) => p.score)));
  return { score, label: fgLabel(score), parts: parts.map((p) => ({ ...p, score: Math.round(p.score) })), date: inp.date };
}
