// Hover card for any ticker on the desk: rest the pointer on a ticker chip, a watchlist row or a symbol button for a moment and a
// small card shows its price, day change, 30-day trend line and relative strength. Nothing to wire per component: it listens for
// hovers on the existing ticker elements. Click still does what it always did (chart, company page...).
import { useEffect, useRef, useState } from 'react';
import type { Quote } from '../types';
import { pct, px, tone } from '../lib/format';
import { Spark } from './common';

const SEL = '[data-sym], .sym-chip, .wl-row, .wl-sym, .msg-sym, .dx-row, .dx-wrow, .am-ix';
const SYM = /^[A-Z][A-Z0-9.\-]{0,9}$/;
function symOf(el: HTMLElement): string | null {
  const s = (el.dataset.sym || el.querySelector<HTMLElement>('.wl-sym, .dx-sym, b')?.textContent || el.textContent || '').trim().split(/\s/)[0].toUpperCase();
  return SYM.test(s) ? s : null;
}

export default function HoverCard({ quotes, names }: { quotes: Record<string, Quote>; names: Record<string, string> }) {
  const [card, setCard] = useState<{ sym: string; x: number; y: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const over = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (matchMedia('(hover: none)').matches) return; // touch screens: no hover
    const hide = () => { clearTimeout(timer.current); over.current = null; setCard(null); };
    const onOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement | null)?.closest?.(SEL) as HTMLElement | null;
      if (el === over.current) return;
      clearTimeout(timer.current);
      over.current = el;
      if (!el || el.closest('.hc, .cmd, .scrim')) { setCard(null); return; }
      const sym = symOf(el);
      if (!sym) { setCard(null); return; }
      timer.current = setTimeout(() => {
        const r = el.getBoundingClientRect();
        const x = Math.min(window.innerWidth - 250, Math.max(8, r.left));
        const y = r.bottom + 160 > window.innerHeight ? r.top - 150 : r.bottom + 6;
        setCard({ sym, x, y });
      }, 420);
    };
    document.addEventListener('mouseover', onOver);
    window.addEventListener('scroll', hide, true);
    document.addEventListener('mousedown', hide);
    document.addEventListener('keydown', hide);
    return () => { document.removeEventListener('mouseover', onOver); window.removeEventListener('scroll', hide, true); document.removeEventListener('mousedown', hide); document.removeEventListener('keydown', hide); clearTimeout(timer.current); };
  }, []);
  if (!card) return null;
  const q = quotes[card.sym];
  const name = q?.name && q.name !== card.sym ? q.name : names[card.sym];
  if (!q && !name) return null;
  const has = q && Number.isFinite(q.last);
  return (
    <div className="hc" style={{ left: card.x, top: card.y }} role="tooltip">
      <div className="hc-h"><b className="num">{card.sym}</b><span className="hc-n">{name ?? ''}</span></div>
      {has ? (
        <div className="hc-px">
          <span className="num hc-last">{px(q!.last)}</span>
          {Number.isFinite(q!.chgPct) && <span className={`num ${tone(q!.chgPct)}`}>{pct(q!.chgPct, 2)}</span>}
          {q!.spark && q!.spark.length > 2 && <Spark v={q!.spark} w={92} h={26} />}
        </div>
      ) : q?.spark && q.spark.length > 2 ? (
        <div className="hc-px">
          <span className="num hc-last">{px(q.spark[q.spark.length - 1])}</span><span className="small muted">last close</span>
          <Spark v={q.spark} w={92} h={26} />
        </div>
      ) : <p className="small muted">No quote loaded for this ticker yet.</p>}
      <div className="hc-f small muted">
        {q && Number.isFinite(q.rsRank) && <span>RS rank {q.rsRank}</span>}
        {q?.spark && q.spark.length > 2 && <span>30-day trend</span>}
        <span>click to open</span>
      </div>
    </div>
  );
}
