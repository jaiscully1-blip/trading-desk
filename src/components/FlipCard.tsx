// A card that flips over to show its details. The face showing decides the card's height, so short fronts stay short;
// a flipped card widens to two columns so longer lessons have room. Click, Enter or Space flips it.
import { useState, type ReactNode } from 'react';

export function FlipCard({ front, back, tag, wide = true }: { front: ReactNode; back: ReactNode; tag?: string; wide?: boolean }) {
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
        <div className="fc-face fc-back" aria-hidden={!on}>
          <button className="fc-close" onClick={flip} aria-label="Flip back">↺ Back</button>
          {on && back}
        </div>
      </div>
    </div>
  );
}
