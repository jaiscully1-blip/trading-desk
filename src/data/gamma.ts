import { useEffect, useState } from 'react';

/** Dealer-gamma levels for one symbol (Cboe delayed ~15 min). Shared by the chart and the regime badge so one fetch serves both. */
export interface GammaLv { callWall: number | null; putWall: number | null; flip: number | null; regime: 'positive' | 'negative' | null; asOf: number }
const memo = new Map<string, { at: number; p: Promise<GammaLv | null> }>();
function fetchGamma(sym: string): Promise<GammaLv | null> {
  const c = memo.get(sym);
  if (c && Date.now() - c.at < 5 * 60_000) return c.p;
  const p = fetch(`/api/research?fn=gamma&symbol=${sym}`).then((r) => r.json()).then((j): GammaLv | null => j?.gexWeek
    ? { callWall: j.gexWeek.callWall ?? null, putWall: j.gexWeek.putWall ?? null, flip: j.gexWeek.flip ?? null, regime: j.gex?.regime === 'positive' || j.gex?.regime === 'negative' ? j.gex.regime : null, asOf: j.asOf }
    : null).catch(() => null);
  memo.set(sym, { at: Date.now(), p });
  return p;
}
export function useGammaLv(sym: string, on: boolean): GammaLv | null {
  const [g, setG] = useState<GammaLv | null>(null);
  useEffect(() => {
    setG(null);
    if (!on) return;
    let stop = false;
    const go = () => fetchGamma(sym).then((x) => { if (!stop && x) setG(x); });
    go();
    const id = setInterval(go, 15 * 60_000);
    return () => { stop = true; clearInterval(id); };
  }, [sym, on]);
  return g;
}
