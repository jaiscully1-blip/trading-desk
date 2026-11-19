// Dark-pool block levels and phantom prints for the chart (see shared/prints.ts for the rules). Refreshes every 15 minutes.
import { useEffect, useState } from 'react';
import type { Print, PrintLevel } from '../../shared/prints';

export interface PrintsData {
  levels?: PrintLevel[]; phantoms?: Print[]; top?: Print[]; needsKey?: boolean; error?: string; asOf?: number; source?: string;
  sessions?: { day: string; blocks: number; coverage: { premarket: boolean; afterHours: boolean; regularMin: number; regularTotal: number } }[];
}

export function usePrints(sym: string, on: boolean): PrintsData | null {
  const [d, setD] = useState<PrintsData | null>(null);
  useEffect(() => {
    setD(null);
    if (!on) return;
    let stop = false;
    const go = () => fetch(`/api/research?fn=prints&symbol=${encodeURIComponent(sym)}`).then((r) => r.json()).then((j: PrintsData) => { if (!stop) setD(j); }).catch(() => {});
    go();
    const id = setInterval(go, 15 * 60_000);
    return () => { stop = true; clearInterval(id); };
  }, [sym, on]);
  return d;
}
