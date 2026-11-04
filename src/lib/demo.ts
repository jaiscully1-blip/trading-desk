// DEMO DATA ONLY. Everything in this file is generated. Every panel that renders it
// shows a "DEMO DATA" badge. Milestone 2 replaces it with provider adapters.
import type { Bar, Board, Headline, Quote, TF } from '../types';
import { et, lastSessionDates } from './clock';

export const DEMO_AT = Date.now();
const DAY_SEED = Math.floor(DEMO_AT / 86_400_000);

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());

const UNIVERSE: [string, string, number][] = [
  ['SPY', 'SPDR S&P 500 ETF', 580], ['QQQ', 'Invesco QQQ Trust', 505],
  ['NVDA', 'NVIDIA', 142], ['AMD', 'Advanced Micro Devices', 158], ['TSLA', 'Tesla', 248],
  ['PLTR', 'Palantir', 42], ['META', 'Meta Platforms', 590], ['AAPL', 'Apple', 228],
  ['MSFT', 'Microsoft', 418], ['AMZN', 'Amazon', 192], ['AVGO', 'Broadcom', 172],
  ['COIN', 'Coinbase', 205], ['MSTR', 'Strategy', 235], ['HOOD', 'Robinhood', 27],
  ['SOFI', 'SoFi Technologies', 11], ['RKLB', 'Rocket Lab', 12], ['IONQ', 'IonQ', 17],
  ['CRWD', 'CrowdStrike', 285], ['SHOP', 'Shopify', 80], ['ANET', 'Arista Networks', 390],
  ['ARM', 'Arm Holdings', 145], ['MU', 'Micron', 102], ['NFLX', 'Netflix', 760],
  ['UBER', 'Uber', 74], ['SMCI', 'Super Micro Computer', 34], ['CELH', 'Celsius', 29],
];
export const INDEXES = ['SPY', 'QQQ'];

export function makeQuotes(): Record<string, Quote> {
  const out: Record<string, Quote> = {};
  for (const [sym, name, base] of UNIVERSE) {
    const r = rng(hash(sym) + DAY_SEED);
    const idx = INDEXES.includes(sym);
    const last = +(base * (0.85 + r() * 0.3)).toFixed(2);
    const chgPct = idx ? (r() - 0.45) * 2 : (r() - 0.4) * 11;
    const gapPct = idx ? (r() - 0.45) * 1.2 : (r() - 0.35) * 10;
    const rvol = idx ? 0.8 + r() * 0.6 : 0.5 + r() * r() * 5;
    const rs5 = idx ? 0 : (r() - 0.4) * 12;
    const rs20 = idx ? 0 : (r() - 0.4) * 25;
    const rs60 = idx ? 0 : (r() - 0.4) * 45;
    const flags: string[] = [];
    if (!idx) {
      if (rs20 > 5) flags.push('>20D');
      if (rs60 > 10) flags.push('>50D');
      if (r() > 0.75) flags.push('52W hi');
      if (gapPct > 3 && rvol > 2) flags.push('Gap&Go');
    }
    out[sym] = {
      sym, name, last, chgPct, gapPct, rvol, rs5, rs20, rs60, rsRank: 50, flags,
      pmVol: Math.floor(r() * r() * (idx ? 9e6 : 4e6)),
    };
  }
  // RS rank: percentile of a weighted 5/20/60-day RS-vs-SPY composite
  const names = Object.values(out).filter((q) => !INDEXES.includes(q.sym));
  const comp = (q: Quote) => 0.5 * q.rs5 + 0.3 * q.rs20 + 0.2 * q.rs60;
  names.sort((a, b) => comp(a) - comp(b));
  names.forEach((q, i) => (q.rsRank = Math.max(1, Math.round(((i + 1) / names.length) * 99))));
  return out;
}

export function defaultBoards(q: Record<string, Quote>): Record<string, Board> {
  const ranked = Object.values(q)
    .filter((x) => !INDEXES.includes(x.sym))
    .sort((a, b) => b.rsRank - a.rsRank);
  const b: Record<string, Board> = {};
  ranked.slice(0, 6).forEach((x) => (b[x.sym] = 'setups'));
  ranked.slice(6, 14).forEach((x) => (b[x.sym] = 'watching'));
  ranked.slice(-4).forEach((x) => (b[x.sym] = 'avoid'));
  return b; // the rest stay off-list so the scanner has something to add
}

const SLOTS_1H = [570, 630, 690, 750, 810, 870, 930];
const SLOTS_5M = Array.from({ length: 78 }, (_, i) => 570 + i * 5);

export function makeCandles(sym: string, tf: TF, last: number): Bar[] {
  const r = rng(hash(sym + tf) + DAY_SEED);
  const idx = INDEXES.includes(sym);
  const days = lastSessionDates(tf === 'D' ? 260 : tf === '1H' ? 45 : 5);
  const slots = tf === 'D' ? [0] : tf === '1H' ? SLOTS_1H : SLOTS_5M;
  const vol = (tf === 'D' ? 0.022 : tf === '1H' ? 0.0075 : 0.0024) * (idx ? 0.45 : 1);
  const drift = (tf === 'D' ? 0.0009 : 0.00012) * (idx ? 0.5 : 1);
  const baseVol = idx ? 6e7 : 2.5e7;

  // "now" in ET wall clock, encoded like the bars, to stop today's intraday bars at the current time
  const e = et();
  const nowEnc = Date.UTC(e.y, e.mo - 1, e.d, e.h, e.mi) / 1000;

  const bars: Bar[] = [];
  let p = 100;
  for (const d of days) {
    for (const m of slots) {
      const time = tf === 'D' ? Date.UTC(d.y, d.mo - 1, d.d) / 1000 : Date.UTC(d.y, d.mo - 1, d.d, Math.floor(m / 60), m % 60) / 1000;
      if (tf !== 'D' && time > nowEnc) continue;
      const open = p * (1 + gauss(r) * vol * 0.25);
      const close = open * (1 + gauss(r) * vol + drift);
      const high = Math.max(open, close) * (1 + r() * vol * 0.7);
      const low = Math.min(open, close) * (1 - r() * vol * 0.7);
      const u = tf === '5m' ? 1 + 2.2 * Math.pow((m - 570) / 390 - 0.5, 2) * 4 : 1; // intraday U-shape
      const volume = Math.round((baseVol / (tf === 'D' ? 1 : slots.length)) * (0.5 + r()) * u);
      bars.push({ time, open, high, low, close, volume });
      p = close;
    }
  }
  if (!bars.length) return bars;
  const k = last / bars[bars.length - 1].close;
  for (const b of bars) {
    b.open = +(b.open * k).toFixed(2);
    b.high = +(b.high * k).toFixed(2);
    b.low = +(b.low * k).toFixed(2);
    b.close = +(b.close * k).toFixed(2);
  }
  return bars;
}

const SYM_T = [
  '{s} extends move as volume runs well above average',
  '{s} raises full-year outlook; shares active in early trade',
  'Analyst lifts {s} price target, cites demand trends',
  '{s} slips after sector peer warns on margins',
  '{s} unveils new product line at investor day',
  'Options activity builds in {s} ahead of earnings',
  '{s} added to index rebalance list',
  '{s} files shelf registration; stock under pressure',
  '{s} signs multi-year supply agreement',
];
const MACRO_T = [
  'Treasury yields edge higher ahead of jobs data',
  'Fed official says policy is "well positioned"',
  'Oil climbs on supply concerns',
  'Dollar firms against major peers',
  'Weekly jobless claims in focus for rate path',
  'Asian markets mixed overnight; Europe opens higher',
  'Bitcoin trades through the weekend in a tight range',
];

export function makeHeadlines(syms: string[]): Headline[] {
  const r = rng(DAY_SEED * 7 + 3);
  const out: Headline[] = [];
  for (let i = 0; i < 44; i++) {
    const macro = r() < 0.3;
    const s = syms[Math.floor(r() * syms.length)];
    const tpl = macro ? MACRO_T[Math.floor(r() * MACRO_T.length)] : SYM_T[Math.floor(r() * SYM_T.length)];
    out.push({
      id: `h${i}`,
      t: DEMO_AT - Math.floor(r() * 20 * 3600_000),
      src: 'Demo feed',
      title: tpl.replace('{s}', s),
      syms: macro ? [] : [s],
      macro,
    });
  }
  return out.sort((a, b) => b.t - a.t);
}

export const DEMO_MACRO = (() => {
  const r = rng(DAY_SEED + 99);
  return { vix: 14 + r() * 8, vixChg: (r() - 0.5) * 8, tnx: 4 + r() * 0.6, tnxChg: (r() - 0.5) * 0.08 };
})();

export const DEMO_ACCOUNT = (() => {
  const r = rng(DAY_SEED + 42);
  const start = 25_000;
  const days = lastSessionDates(60);
  let eq = start;
  const daily = days.map((d) => {
    const pnl = Math.round((r() - 0.42) * 600);
    eq += pnl;
    return { time: Date.UTC(d.y, d.mo - 1, d.d) / 1000, date: d, pnl, equity: eq };
  });
  const today = daily[daily.length - 1];
  return {
    start,
    equity: eq,
    todayPnl: today.pnl,
    rToday: +(today.pnl / 250).toFixed(2), // 1R = $250 in the demo
    riskUsedPct: 0.6,
    maxDailyLossPct: 2,
    lockout: 'Clear' as 'Clear' | 'Cooldown' | 'Locked',
    daily,
  };
})();

export const DEMO_ALERTS = [
  { t: DEMO_AT - 6 * 60_000, text: 'SPY touched premarket high' },
  { t: DEMO_AT - 22 * 60_000, text: 'QQQ broke opening-range low' },
  { t: DEMO_AT - 48 * 60_000, text: 'Top RS name crossed above 20-day average' },
];

