import type { MacroResult, Quote } from '../types';
import { DEMO_MACRO } from '../lib/demo';
import { pct, tone } from '../lib/format';
import { Fresh, Q, type QKind } from './common';

/** VIX, put/call, Fear & Greed, yield curve, 10Y, oil, dollar, and the SPY daily move implied by VIX. */
export function FearStrip({ macro, quotes, live }: { macro: MacroResult | null; quotes: Record<string, Quote>; live: boolean }) {
  const spy = quotes.SPY?.last;
  const vix = live ? macro?.vix?.value : DEMO_MACRO.vix;
  const em = vix && spy ? (spy * vix) / 100 / Math.sqrt(252) : null;
  const bp = (x: number | undefined | null) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${(x * 100).toFixed(0)}bp`);
  const uso = quotes.USO, uup = quotes.UUP;
  // anything without a value is left out entirely (see the desk guide for how to switch each one on)
  const Item = ({ l, v, sub, cls, title, q, qs }: { l: string; v: string; sub?: string; cls?: string; title?: string; q: QKind; qs?: string }) => (v === '—' || v === 'n/a' ? null :
    <span className="fs-i" title={title}><Q k={live ? q : 'demo'} src={qs} /><span className="tick-l">{l}</span> <span className={`num ${cls ?? ''}`}>{v}</span>{sub && <span className="num small muted"> {sub}</span>}</span>
  );
  return (
    <div className="fear">
      <Item q="eod" qs="FRED VIXCLS, daily close" l="VIX" v={vix ? vix.toFixed(2) : '—'} title={live ? `FRED VIXCLS close ${macro?.vix?.date ?? ''}` : undefined} />
      <Item q="calc" qs="SPY x VIX / √252" l="SPY exp. move" v={em ? `±$${em.toFixed(2)}` : '—'} sub={em && spy ? `±${((em / spy) * 100).toFixed(2)}%` : undefined} title="One standard deviation daily move implied by VIX: SPY × VIX / √252" />
      <Item q="delayed" qs="Alpha Vantage option chain, refreshed every 2 hours" l="P/C (SPY)" v={live ? (macro?.putCall ? macro.putCall.ratio.toFixed(2) : '—') : '0.98'} cls={(live ? macro?.putCall?.ratio ?? 0 : 0.98) >= 1 ? 'down' : ''} title="Full-chain put/call ratio. ≥1.0 leans fearful, ≤0.6 leans greedy (Alpha Vantage, refreshed every 2h)" />
      {(() => {
        const fg = live ? macro?.fearGreed : { score: 41, label: 'Fear', parts: [], date: '' };
        if (!fg) return null;
        const tip = `Desk Fear & Greed: our own blend of free data, not CNN's index.\n${fg.parts.map((p) => `${p.label}: ${p.score} (${p.detail})`).join('\n')}${fg.date ? `\nAs of ${fg.date} close` : ''}`;
        return <Item q="calc" qs="the desk's own blend of free data, not CNN's index" l="Fear & Greed" v={String(fg.score)} sub={fg.label} cls={fg.score < 45 ? 'down' : fg.score > 55 ? 'up' : ''} title={tip} />;
      })()}
      <Item q="eod" qs="FRED T10Y2Y" l="2s10s" v={live ? bp(macro?.t10y2y ? macro.t10y2y.value / 100 : null) : '+52bp'} cls={live && (macro?.t10y2y?.value ?? 0) < 0 ? 'down' : ''} title="10-year minus 2-year Treasury (FRED). Negative = inverted" />
      <Item q="eod" qs="FRED T10Y3M" l="3m10y" v={live ? bp(macro?.t10y3m ? macro.t10y3m.value / 100 : null) : '+38bp'} cls={live && (macro?.t10y3m?.value ?? 0) < 0 ? 'down' : ''} title="10-year minus 3-month Treasury (FRED)" />
      <Item q="eod" qs="FRED DGS10" l="10Y" v={live ? (macro?.tnx ? `${macro.tnx.value.toFixed(2)}%` : '—') : `${DEMO_MACRO.tnx.toFixed(2)}%`} />
      <Item q="live" qs="USO quote" l="Oil (USO)" v={uso && Number.isFinite(uso.last) ? uso.last.toFixed(2) : '—'} sub={uso ? pct(uso.chgPct, 1) : undefined} cls={tone(uso?.chgPct ?? 0)} title="USO oil ETF as a live proxy" />
      <Item q="live" qs="UUP quote" l="Dollar (UUP)" v={uup && Number.isFinite(uup.last) ? uup.last.toFixed(2) : '—'} sub={uup ? pct(uup.chgPct, 1) : undefined} cls={tone(uup?.chgPct ?? 0)} title="UUP dollar ETF as a live proxy" />
      <span className="fs-badges">
        {live ? <><Fresh kind="eod" src="VIX, 10Y, curve: FRED end of day" /><Fresh kind="live" src="Oil/dollar ETF quotes, SPY" /></> : <Fresh kind="demo" />}
      </span>
    </div>
  );
}
