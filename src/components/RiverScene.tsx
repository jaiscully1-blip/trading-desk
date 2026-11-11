// Riverfront background: a dusk river (original drawing, Tampa-inspired minarets, no logos) behind the whole desk.
// Boats cross the full width at three depths (far ones small, slow and hazy; near ones big and quick), each with a
// V wake, a rippled reflection and hull / sail shading. The SVG is inlined so "still" can pause it; it loads in its own chunk.
// Moving parts are CSS transforms only. It pauses while the tab is hidden and never moves for reduced-motion users.
import { useEffect, useState } from 'react';
import svg from '../assets/river.svg?raw';

export default function RiverScene({ still }: { still: boolean }) {
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);
  useEffect(() => {
    const on = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return <div className={`river-bg ${still || hidden ? 'still' : ''}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;
}
