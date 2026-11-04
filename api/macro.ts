// GET /api/macro -> VIX and 10-year yield, end of day from FRED (free).
import type { MacroResult } from '../shared/types';
import { fredLatest } from './_lib/adapters';
import { cached, json } from './_lib/core';

export async function GET(): Promise<Response> {
  try {
    const { val } = await cached<MacroResult>('macro', 3 * 3600, async () => {
      const [vix, tnx] = await Promise.allSettled([fredLatest('VIXCLS'), fredLatest('DGS10')]);
      if (vix.status === 'rejected' && tnx.status === 'rejected') throw vix.reason;
      return {
        vix: vix.status === 'fulfilled' ? vix.value : null,
        tnx: tnx.status === 'fulfilled' ? tnx.value : null,
        source: 'FRED (VIXCLS, DGS10)',
        freshness: 'eod',
        asOf: Date.now(),
      };
    });
    return json(val, { sMaxAge: 3 * 3600 });
  } catch (e) {
    return json({ error: (e as Error).message }, { status: 503 });
  }
}
