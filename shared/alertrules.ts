// Price alerts on any ticker: above / below a price, up or down a % on the day, relative volume. Checked on every quote
// refresh; a match makes a sound and a pop-up inside the desk (no phone alerts). Pure functions (tested).

export type AlertKind = 'above' | 'below' | 'chgUp' | 'chgDown' | 'rvol';
export interface PriceAlert { id: string; sym: string; kind: AlertKind; value: number; note?: string; repeat?: boolean; active: boolean; created: number; firedAt?: number; firedPx?: number }
export const KIND_LABEL: Record<AlertKind, string> = { above: 'price at or above', below: 'price at or below', chgUp: 'up on the day by', chgDown: 'down on the day by', rvol: 'relative volume at least' };
export const unit = (k: AlertKind) => (k === 'chgUp' || k === 'chgDown' ? '%' : k === 'rvol' ? '×' : '$');

export interface QuoteLike { last: number; chgPct: number; rvol?: number }
/** Is the condition met by this quote? */
export function hit(a: PriceAlert, q: QuoteLike | undefined): boolean {
  if (!q || !Number.isFinite(q.last)) return false;
  switch (a.kind) {
    case 'above': return q.last >= a.value;
    case 'below': return q.last <= a.value;
    case 'chgUp': return Number.isFinite(q.chgPct) && q.chgPct >= a.value;
    case 'chgDown': return Number.isFinite(q.chgPct) && q.chgPct <= -Math.abs(a.value);
    case 'rvol': return q.rvol != null && Number.isFinite(q.rvol) && q.rvol >= a.value;
  }
}

/**
 * Check every active alert. One-time alerts switch off when they fire. Repeating alerts fire again only after the
 * condition has been false for a check (re-arm), so a price sitting above the line doesn't ring every refresh.
 */
export function checkAlerts(alerts: PriceAlert[], quotes: Record<string, QuoteLike>, armed: Set<string>, now: number): { next: PriceAlert[]; fired: PriceAlert[] } {
  const fired: PriceAlert[] = [];
  const next = alerts.map((a) => {
    if (!a.active) return a;
    const q = quotes[a.sym];
    const on = hit(a, q);
    if (!on) { armed.add(a.id); return a; }
    if (a.repeat && !armed.has(a.id)) return a; // still above the line since the last ring
    armed.delete(a.id);
    const f = { ...a, firedAt: now, firedPx: q!.last, active: !!a.repeat };
    fired.push(f);
    return f;
  });
  return { next, fired };
}

/** How far the quote is from triggering, in words ("$2.10 away (1.2%)"). */
export function distance(a: PriceAlert, q: QuoteLike | undefined): string {
  if (!q || !Number.isFinite(q.last)) return 'no quote yet';
  if (a.kind === 'above' || a.kind === 'below') { const d = a.value - q.last; const met = a.kind === 'above' ? d <= 0 : d >= 0; return met ? 'met' : `$${Math.abs(d).toFixed(2)} away (${Math.abs((d / q.last) * 100).toFixed(1)}%)`; }
  if (a.kind === 'rvol') return q.rvol != null && Number.isFinite(q.rvol) ? `now ${q.rvol.toFixed(1)}×` : 'no volume read yet';
  return Number.isFinite(q.chgPct) ? `now ${q.chgPct >= 0 ? '+' : ''}${q.chgPct.toFixed(1)}%` : '';
}

export const describeAlert = (a: PriceAlert) => `${a.sym} ${KIND_LABEL[a.kind]} ${unit(a.kind) === '$' ? `$${a.value}` : `${a.value}${unit(a.kind)}`}`;
