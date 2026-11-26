// Header market zone: SPY, QQQ and IWM as compact chips (price and change).
// Prices: during the regular session the desk's live quotes (all four always quoted); otherwise, and as a fallback, the
// pulse feed's official close (Yahoo, ~15 min delayed); the lines
// and breadth only show with live data (breadth from the TradingView screener). Nothing made up in demo mode.
import { useEffect, useState } from 'react';
import type { Quote } from '../types';
import { FlashNum } from './common';
import { px, pct, tone } from '../lib/format';

interface Row { sym: string; last: number; chgPct: number; spark: number[] }
interface Pulse { rows: Row[]; breadth: { up: number; down: number; flat: number; total: number } | null; asOf: number; source: string }
const SYMS = ['SPY', 'QQQ', 'IWM']; // compact: symbol, price, change (Jai's choice 2026-11-26; no lines or breadth in the header)


export function MarketChips({ live, quotes, onSelect, open = true }: { live: boolean; quotes: Record<string, Quote>; onSelect: (s: string) => void; open?: boolean }) {
  const [d, setD] = useState<Pulse | null>(null);
  useEffect(() => {
    if (!live) { setD(null); return; }
    let stop = false;
    const go = () => fetch('/api/research?fn=pulse').then((r) => (r.ok ? r.json() : null)).then((j) => { if (!stop && j) setD(j); }).catch(() => {});
    go();
    const t = setInterval(() => { if (!document.hidden) go(); }, 60_000);
    return () => { stop = true; clearInterval(t); };
  }, [live]);
  return (
    <div className="mp-cell" title={d ? d.source : undefined}>
      {SYMS.map((s) => {
        const q = quotes[s], p = d?.rows.find((r) => r.sym === s);
        // market shut: the official close (pulse) for all four, not one venue's last trade (IEX's 3:59:59 print differs by cents)
        const useLive = q && Number.isFinite(q.last) && Number.isFinite(q.chgPct) && (open || !p);
        const last = useLive ? q.last : p?.last, chg = useLive ? q.chgPct : p?.chgPct;
        if (last == null || chg == null) return null;
        return (
          <button key={s} className="mc-chip" onClick={() => onSelect(s)} title={`${s}: open on the desk`}>
            <span className="mc-sym">{s}</span>
            <FlashNum v={last}>{px(last)}</FlashNum>
            <span className={`num ${tone(chg)}`}>{pct(chg)}</span>
          </button>
        );
      })}
    </div>
  );
}
