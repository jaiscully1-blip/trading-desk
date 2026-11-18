// A card that flips over to show its details. The face showing decides the card's height, so short fronts stay short;
// a flipped card widens to two columns so longer lessons have room. Click, Enter or Space flips it; on the back, the
// Back button, a click on the title bar, or Escape flips it back.
import { useState, type ReactNode } from 'react';

export function FlipCard({ front, back, tag, title, wide = true }: { front: ReactNode; back: ReactNode; tag?: string; title?: ReactNode; wide?: boolean }) {
  const [on, setOn] = useState(false);
  const flip = () => setOn((x) => !x);
  return (
    <div className={`fc ${on ? 'on' : ''} ${on && wide ? 'wide' : ''}`}>
      <div className="fc-in">
        <div className="fc-face fc-front" role="button" tabIndex={on ? -1 : 0} aria-expanded={on} onClick={flip} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } }}>
          {tag && <span className="fc-tag">{tag}</span>}
          {front}
          <span className="fc-hint">Tap to flip ↻</span>
        </div>
        <div className="fc-face fc-back" aria-hidden={!on} onKeyDown={(e) => { if (e.key === 'Escape') setOn(false); }}>
          <div className="fc-bar" onClick={() => setOn(false)} title="Flip back">
            <h4>{title}</h4>
            <button type="button" className="fc-close" onClick={(e) => { e.stopPropagation(); setOn(false); }} aria-label="Flip back">↺ Back</button>
          </div>
          {on && back}
        </div>
      </div>
    </div>
  );
}
