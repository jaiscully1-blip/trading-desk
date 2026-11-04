// NYSE holidays and early closes. Source: "NYSE Group Announces 2026, 2027 and 2028 Holiday and Early Closings Calendar"
// (Business Wire, Dec 23 2025). The live market-status feed (/api/market-status) can add unscheduled closures on top.

export const NYSE_HOLIDAYS: Record<string, string> = {
  '2026-01-01': "New Year's Day", '2026-01-19': 'Martin Luther King, Jr. Day', '2026-02-16': "Washington's Birthday", '2026-04-03': 'Good Friday',
  '2026-05-25': 'Memorial Day', '2026-06-19': 'Juneteenth', '2026-07-03': 'Independence Day (observed)', '2026-09-07': 'Labor Day',
  '2026-11-26': 'Thanksgiving Day', '2026-12-25': 'Christmas Day',
  '2027-01-01': "New Year's Day", '2027-01-18': 'Martin Luther King, Jr. Day', '2027-02-15': "Washington's Birthday", '2027-03-26': 'Good Friday',
  '2027-05-31': 'Memorial Day', '2027-06-18': 'Juneteenth (observed)', '2027-07-05': 'Independence Day (observed)', '2027-09-06': 'Labor Day',
  '2027-11-25': 'Thanksgiving Day', '2027-12-24': 'Christmas Day (observed)',
  '2028-01-17': 'Martin Luther King, Jr. Day', '2028-02-21': "Washington's Birthday", '2028-04-14': 'Good Friday', '2028-05-29': 'Memorial Day',
  '2028-06-19': 'Juneteenth', '2028-07-04': 'Independence Day', '2028-09-04': 'Labor Day', '2028-11-23': 'Thanksgiving Day', '2028-12-25': 'Christmas Day',
};

/** Early closes at 1:00 PM ET (seconds of day). */
export const NYSE_EARLY: Record<string, { close: number; name: string }> = {
  '2026-11-27': { close: 13 * 3600, name: 'Day after Thanksgiving' },
  '2026-12-24': { close: 13 * 3600, name: 'Christmas Eve' },
  '2027-11-26': { close: 13 * 3600, name: 'Day after Thanksgiving' },
  '2028-07-03': { close: 13 * 3600, name: 'Day before Independence Day' },
  '2028-11-24': { close: 13 * 3600, name: 'Day after Thanksgiving' },
};

export interface MarketCalendar {
  holidays: Record<string, string>;
  early: Record<string, { close: number; name: string }>;
  /** from the live feed: market reported closed today outside the published calendar */
  unscheduled: Record<string, string>;
}

let cal: MarketCalendar = { holidays: { ...NYSE_HOLIDAYS }, early: { ...NYSE_EARLY }, unscheduled: {} };

export function getMarketCalendar(): MarketCalendar { return cal; }
/** Merge feed data on top of the published calendar (never removes a published holiday). */
export function setMarketCalendar(extra: Partial<MarketCalendar>) {
  cal = {
    holidays: { ...NYSE_HOLIDAYS, ...extra.holidays },
    early: { ...NYSE_EARLY, ...extra.early },
    unscheduled: { ...extra.unscheduled },
  };
}
export function resetMarketCalendar() { cal = { holidays: { ...NYSE_HOLIDAYS }, early: { ...NYSE_EARLY }, unscheduled: {} }; }

export const ymdKey = (y: number, mo: number, d: number) => `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export const holidayName = (key: string) => cal.holidays[key] ?? cal.unscheduled[key] ?? null;
export const closeSodFor = (key: string) => cal.early[key]?.close ?? 16 * 3600;
export function isTradingDay(y: number, mo: number, d: number) {
  const wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  return wd >= 1 && wd <= 5 && !holidayName(ymdKey(y, mo, d));
}
