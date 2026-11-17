// Benner cycle card (Samuel Benner, 1875), "Periods When to Make Money": years marked A (panics), B (good times, high prices, "sell")
// and C (hard times, low prices, "buy"). Dates are read from the widely shared card. This is FOLKLORE, not a forecast: the dates were
// fitted after the fact, and real panics (1987, 2008, 2020) fall outside them. For curiosity only. Nothing here can trade.
export type Kind = 'A' | 'B' | 'C';
export const A_YEARS = [1927, 1945, 1965, 1981, 1999, 2019, 2035, 2053];
export const B_YEARS = [1926, 1935, 1945, 1953, 1962, 1972, 1980, 1989, 1999, 2007, 2016, 2026, 2034, 2043, 2053];
export const C_YEARS = [1924, 1931, 1942, 1951, 1958, 1969, 1978, 1985, 1996, 2005, 2012, 2023, 2032, 2039, 2050, 2059];
export const KIND_TEXT: Record<Kind, { name: string; says: string }> = {
  A: { name: 'Panic year', says: 'The card marks this as a year when panics have occurred and “will occur again.”' },
  B: { name: 'Good times', says: 'The card calls these years of good times and high prices, “the time to sell stocks and values of all kinds.”' },
  C: { name: 'Hard times', says: 'The card calls these years of hard times and low prices, a good time to buy and hold until the boom reaches the good years.' },
};
export interface Mark { year: number; kind: Kind }
export const MARKS: Mark[] = [...A_YEARS.map((year) => ({ year, kind: 'A' as Kind })), ...B_YEARS.map((year) => ({ year, kind: 'B' as Kind })), ...C_YEARS.map((year) => ({ year, kind: 'C' as Kind }))].sort((a, b) => a.year - b.year || a.kind.localeCompare(b.kind));

export interface Status {
  year: number; kinds: Kind[]; last: Mark | null; next: Mark[]; phase: 'rising' | 'falling' | 'unknown'; phaseText: string; yearsToNext: number | null;
}
/** Where a year sits on the card: its own marks, the last B or C before it, and the next marks after it. */
export function status(year: number): Status {
  const kinds = MARKS.filter((m) => m.year === year).map((m) => m.kind);
  const bc = MARKS.filter((m) => m.kind !== 'A' && m.year <= year);
  const last = bc[bc.length - 1] ?? null;
  const next = MARKS.filter((m) => m.year > year).slice(0, 4);
  const phase = !last ? 'unknown' : last.kind === 'C' ? 'rising' : 'falling';
  // the phase is the stretch AFTER the last C (prices rise toward the good years) or after the last B (prices fall toward hard times)
  const phaseText = !last ? '' : last.kind === 'C' ? `Rising stretch: since the ${last.year} “buy” year, the card has prices climbing toward the next good-times year.` : `Falling stretch: since the ${last.year} “sell” year, the card has prices sliding toward the next hard-times year.`;
  return { year, kinds, last, next, phase, phaseText, yearsToNext: next[0] ? next[0].year - year : null };
}
