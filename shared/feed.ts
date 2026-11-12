// Messages feed: earnings results as companies file them (SEC 8-K item 2.02), estimates vs actuals, Fed and White House
// releases, and live-stream detection. Pure parsers (tested); fetching lives in /api.

export type FeedKind = 'filing' | 'earnings' | 'result' | 'fed' | 'whitehouse' | 'econ' | 'live' | 'catalyst' | 'stake' | 'insider' | 'wire' | 'fund';
export interface FeedItem { id: string; t: number; kind: FeedKind; sym?: string; title: string; text?: string; url?: string; tone?: 'up' | 'down' }

/** EDGAR "getcurrent" Atom feed -> 8-K filings that include Item 2.02 (Results of Operations), with CIK. */
export function parseEdgar8k(xml: string): { cik: number; company: string; t: number; url: string; items: string[] }[] {
  const out: { cik: number; company: string; t: number; url: string; items: string[] }[] = [];
  for (const b of xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? []) {
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(b)?.[1] ?? '';
    const m = /^\s*8-K(?:\/A)?\s*-\s*(.+?)\s*\((\d{4,10})\)/i.exec(title.replace(/&amp;/g, '&'));
    if (!m) continue;
    const summary = (/<summary[^>]*>([\s\S]*?)<\/summary>/i.exec(b)?.[1] ?? '').replace(/&lt;|&gt;|<[^>]+>/g, ' ');
    const items = [...summary.matchAll(/\b(\d\.\d{2})\b/g)].map((x) => x[1]);
    const url = /<link[^>]*href="([^"]+)"/i.exec(b)?.[1] ?? '';
    const t = Date.parse(/<updated>([^<]+)<\/updated>/i.exec(b)?.[1] ?? '');
    if (Number.isFinite(t)) out.push({ cik: Number(m[2]), company: m[1], t, url, items });
  }
  return out;
}

/** YouTube "@handle/live" page -> the live video id, or null when the channel isn't live right now. */
export function parseYoutubeLive(html: string): string | null {
  if (!/"isLive(?:Now|Content)"\s*:\s*true/.test(html)) return null;
  return /<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/.exec(html)?.[1] ?? /"videoId":"([\w-]{11})"/.exec(html)?.[1] ?? null;
}

const when = (h: string) => (h === 'bmo' ? 'before the open' : h === 'amc' ? 'after the close' : '');
export interface EarnRowLike { sym: string; date: string; hour: string; epsEst: number | null; epsAct: number | null; revEst: number | null; revAct: number | null }
const big = (v: number) => (Math.abs(v) >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(0)}M` : `$${v.toFixed(0)}`);
/** Earnings rows -> messages: "reports today" with estimates, then "beat / missed" once actuals post. */
export function earningsMessages(rows: EarnRowLike[], today: string, nowMs: number): FeedItem[] {
  const out: FeedItem[] = [];
  const dayMs = (d: string, h: string) => Date.parse(`${d}T${h === 'amc' ? '20:05' : h === 'bmo' ? '11:00' : '13:00'}:00Z`);
  for (const r of rows) {
    if (r.epsAct != null) {
      const v = r.epsEst != null ? (r.epsAct > r.epsEst ? 'beat' : r.epsAct < r.epsEst ? 'missed' : 'matched') : 'reported';
      const rev = r.revAct != null ? ` Revenue ${big(r.revAct)}${r.revEst != null ? ` vs ${big(r.revEst)} est` : ''}.` : '';
      out.push({ id: `res:${r.sym}:${r.date}`, t: Math.min(nowMs, dayMs(r.date, r.hour) + 30 * 60_000), kind: 'result', sym: r.sym, tone: v === 'beat' ? 'up' : v === 'missed' ? 'down' : undefined,
        title: `${r.sym} ${v} on EPS`, text: `EPS ${r.epsAct.toFixed(2)}${r.epsEst != null ? ` vs ${r.epsEst.toFixed(2)} expected` : ''}.${rev} (Finnhub, delayed)` });
    } else if (r.date === today) {
      out.push({ id: `cal:${r.sym}:${r.date}`, t: Date.parse(`${today}T12:00:00Z`), kind: 'earnings', sym: r.sym,
        title: `${r.sym} reports today${when(r.hour) ? ` ${when(r.hour)}` : ''}`, text: [r.epsEst != null && `EPS est ${r.epsEst.toFixed(2)}`, r.revEst != null && `revenue est ${big(r.revEst)}`].filter(Boolean).join(' · ') || undefined });
    }
  }
  return out;
}

/** Large caps that always count for the feed, beside your own tickers (Nasdaq-100 heavyweights + big S&P names; edit freely). */
export const BIG_CAPS = ('AAPL MSFT NVDA AMZN GOOGL GOOG META AVGO TSLA BRK.B LLY JPM V UNH XOM MA COST HD PG JNJ WMT NFLX ORCL BAC CRM ABBV KO CVX MRK AMD PEP ADBE ' +
  'TMO LIN CSCO ACN MCD WFC ABT DIS INTU QCOM TXN DHR CAT PM GE IBM AMGN VZ NOW ISRG AMAT GS UBER SPGI PFE CMCSA RTX NEE T LOW HON UNP BKNG AXP ' +
  'PGR SYK BLK ELV TJX COP MS VRTX ETN PLD C LRCX BSX MU ADI SCHW REGN PANW KLAC SBUX MDT CB ANET ADP LMT GILD MMC BMY SO DE FI CI INTC SNPS CDNS ' +
  'MELI PYPL CRWD MRVL ABNB ORLY CTAS FTNT WDAY DASH PLTR SHOP COIN HOOD ARM SMCI TEAM DDOG ZS MSTR').split(' ');
