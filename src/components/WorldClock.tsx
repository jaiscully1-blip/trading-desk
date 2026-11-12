// Top-bar clock: New York time with seconds; hover or click to see the other big markets' local times and whether they're
// open. Only this small component ticks every second, so the rest of the desk doesn't redraw.
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MARKETS, sessionState } from '../../shared/sessions';
import { useTick } from '../lib/useTick';

const t = (ms: number, tz: string) => new Date(ms).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', second: '2-digit' });

export function WorldClock({ nyClosed, onOpen }: { nyClosed: boolean; onOpen: () => void }) {
  const now = useTick(1000);
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hover || pinned;
  const btn = useRef<HTMLButtonElement>(null);
  // the top bar clips overflow (and its blur traps fixed elements), so the list is rendered on the page body, under the button
  const r = open ? btn.current?.getBoundingClientRect() : undefined;
  return (
    <div className="wc" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button ref={btn} className="wc-btn num" onClick={() => setPinned((p) => !p)} aria-expanded={open} title="World clocks">{t(now, 'America/New_York')} <span className="tick-l">ET</span></button>
      {open && createPortal(
        <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} className="wc-pop" role="dialog" aria-label="World clocks" style={r ? { top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) } : undefined}>
          {MARKETS.map((m) => {
            const s = sessionState(m, now, m.id === 'ny' && nyClosed);
            return (
              <div key={m.id} className={`wc-row ${s.status}`}>
                <span className="wc-dot" aria-hidden="true" />
                <span className="wc-name">{m.name.toUpperCase()}</span>
                <span className="num wc-t">{t(now, m.tz)}</span>
                <span className="small muted wc-s">{s.status === 'open' ? 'open' : s.status === 'lunch' ? 'lunch' : 'closed'}</span>
              </div>
            );
          })}
          <button className="link small wc-more" onClick={() => { setPinned(false); setHover(false); onOpen(); }}>Open the world map</button>
        </div>, document.body,
      )}
    </div>
  );
}
