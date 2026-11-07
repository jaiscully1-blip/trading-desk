// Polymarket events (public Gamma API) -> the odds the crowd is paying for, per question.
export interface PmMarket { q: string; outcomes: { name: string; p: number }[]; vol24: number }
export interface PmEvent { title: string; url: string; vol24: number; ends: string | null; markets: PmMarket[] }

const arr = (v: unknown): string[] => { if (Array.isArray(v)) return v.map(String); try { const j = JSON.parse(String(v ?? '[]')); return Array.isArray(j) ? j.map(String) : []; } catch { return []; } };

export function parsePolymarketEvents(j: any): PmEvent[] {
  if (!Array.isArray(j)) throw new Error(String(j?.error ?? 'unexpected Polymarket response'));
  return j.filter((e) => e && !e.closed).map((e) => {
    const markets: PmMarket[] = (Array.isArray(e.markets) ? e.markets : [])
      .filter((m: any) => !m.closed)
      .map((m: any) => {
        const names = arr(m.outcomes), prices = arr(m.outcomePrices).map(Number);
        return { q: String(m.groupItemTitle || m.question || ''), outcomes: names.map((n, i) => ({ name: n, p: prices[i] })).filter((o) => Number.isFinite(o.p)), vol24: Number(m.volume24hr) || 0 };
      })
      .filter((m: PmMarket) => m.q && m.outcomes.length)
      .sort((a: PmMarket, b: PmMarket) => b.vol24 - a.vol24 || (b.outcomes[0]?.p ?? 0) - (a.outcomes[0]?.p ?? 0));
    return { title: String(e.title ?? ''), url: `https://polymarket.com/event/${e.slug}`, vol24: Number(e.volume24hr) || 0, ends: e.endDate ? String(e.endDate).slice(0, 10) : null, markets: markets.slice(0, 4) };
  }).filter((e) => e.title && e.markets.length);
}
