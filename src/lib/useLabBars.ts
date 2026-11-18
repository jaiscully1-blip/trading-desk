// Real bars for the Learn lessons: 60 days of 5-minute bars and ~3 years of daily bars for one ticker (Yahoo, delayed).
import { useEffect, useState } from 'react';
import type { Bar } from '../../shared/types';

export function useLabBars(sym: string, on = true) {
  const [st, setSt] = useState<{ m5: Bar[]; d: Bar[]; err?: string; loading: boolean }>({ m5: [], d: [], loading: true });
  useEffect(() => {
    if (!on) return;
    let stop = false; setSt({ m5: [], d: [], loading: true });
    Promise.all([fetch(`/api/research?fn=bars&symbol=${sym}&tf=5m&long=1`).then((r) => r.json()), fetch(`/api/candles?symbol=${sym}&tf=D`).then((r) => r.json())])
      .then(([a, b]) => { if (!stop) setSt({ m5: a.bars ?? [], d: b.bars ?? [], err: a.error ?? b.error, loading: false }); })
      .catch((e) => { if (!stop) setSt({ m5: [], d: [], err: String(e), loading: false }); });
    return () => { stop = true; };
  }, [sym, on]);
  return st;
}
