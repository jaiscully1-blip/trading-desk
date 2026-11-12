// A local clock for the few things that show seconds (clock widgets, countdowns). The app-wide clock ticks every 15 s so the
// whole desk doesn't redraw every second; anything that needs seconds ticks on its own and redraws only itself.
import { useEffect, useState } from 'react';

export function useTick(ms = 1000): number {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setN(Date.now()), ms); return () => clearInterval(id); }, [ms]);
  return n;
}
