// Poker desk: every trade is a bet. Claims (fundamental / technical / news, each with evidence and source), the bet board
// (historical equity vs pot odds -> raise / call / fold), the article reader, and Spotify / X embeds.
import { useEffect, useMemo, useState } from 'react';
import type { Bar } from '../types';
import { consensus, fundamentalClaims, newsClaims, technicalClaims, type Cat, type Claim, type Lean } from '../../shared/claims';
import { bestBet, type BetOdds } from '../../shared/edge';
import { sentimentWords } from '../../shared/news';
import { useSeries, type DataMode } from '../data/live';
import { useHistNews } from '../data/company';
import { useDesk, type Article } from '../lib/deskctx';
import { makeCandles } from '../lib/demo';
import { px } from '../lib/format';
import { CoName, Star, Q } from './common';
import type { HomeData } from './HomeWidgets';

type Cfg = Record<string, any>;
interface P { d: HomeData; cfg: Cfg; set: (c: Cfg) => void }
const CAT: Record<Cat, string> = { fundamental: 'Financials', technical: 'Technicals', news: 'News' };

export function Pill({ lean }: { lean: Lean }) {
  return <span className={`pill ${lean === 'bullish' ? 'bull' : lean === 'bearish' ? 'bear' : 'mixed'}`}>{lean === 'no data' ? 'NO DATA' : lean.toUpperCase()}</span>;
}

/* ---------------- claims ---------------- */
interface Fund { metric: Record<string, number | null> | null; recs: any[]; errors: Record<string, string>; source: string }
function useFundamentals(sym: string, mode: DataMode): Fund | null {
  const [f, setF] = useState<Fund | null>(null);
  useEffect(() => {
    if (mode.kind === 'demo') { setF({ metric: { revenueGrowthTTMYoy: 18, netProfitMarginTTM: 21, 'totalDebt/totalEquityQuarterly': 0.4, peTTM: 34 }, recs: [{ period: 'sample', strongBuy: 12, buy: 18, hold: 8, sell: 1, strongSell: 0 }], errors: {}, source: 'Sample financials (demo)' }); return; }
    if (mode.kind !== 'live') return;
    let stop = false;
    setF(null);
    fetch(`/api/research?fn=fundamentals&symbol=${sym}`).then((r) => r.json()).then((j) => !stop && setF(j)).catch(() => {});
    return () => { stop = true; };
  }, [sym, mode.kind]);
  return f;
}

export function ClaimsW({ d, cfg, set }: P) {
  const sym: string = cfg.sym ?? d.sel ?? 'SPY';
  const { openArticle } = useDesk();
  const daily = useSeries(sym, 'D', d.mode, d.demoLast(sym));
  const fund = useFundamentals(sym, d.mode);
  const now = useMemo(() => Date.now(), [sym]); // eslint-disable-line react-hooks/exhaustive-deps
  const hist = useHistNews(sym, now - 14 * 86400_000, now, d.mode, true);
  const [open, setOpen] = useState<Cat | null>(cfg.open ?? 'news');
  const claims: Claim[] = useMemo(() => {
    const live = d.news.items.filter((n) => n.syms.includes(sym)).map((n) => ({ title: n.title, src: n.src, url: n.url, t: n.t, summary: n.summary }));
    const seen = new Set<string>();
    const heads = [...live, ...hist.items.map((h) => ({ title: h.title, src: h.src, url: h.url, t: h.t, summary: (h as any).summary }))].filter((h) => { const k = h.title.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => b.t - a.t).slice(0, 60);
    return [...technicalClaims(daily.bars), ...(fund?.metric || fund?.recs?.length ? fundamentalClaims(fund.metric ?? {}, fund.recs ?? [], fund.source) : []), ...newsClaims(heads)];
  }, [daily.bars, fund, d.news.items, hist.items, sym]);
  const c = consensus(claims);
  const newsSrc = [...new Set(claims.filter((x) => x.cat === 'news').map((x) => x.source))];
  return (
    <div className="hw-col cl">
      <div className="hw-bar">
        <input className="hw-ticker" value={sym} onChange={(e) => set({ ...cfg, sym: e.target.value.toUpperCase() })} aria-label="Ticker" />
        <CoName sym={sym} />
        <span className="cl-overall"><Q k="calc" src="rule-based reads of financials, technicals and headlines, scored on the desk" />Consensus <Pill lean={c.overall} /></span>
      </div>
      <div className="cl-cats">
        {(['fundamental', 'technical', 'news'] as Cat[]).map((k) => {
          const cs = claims.filter((x) => x.cat === k);
          return (
            <button key={k} className={`cl-cat ${open === k ? 'on' : ''}`} onClick={() => { setOpen(open === k ? null : k); set({ ...cfg, open: open === k ? null : k }); }}>
              <span>{CAT[k]}</span><Pill lean={c.by[k]} /><span className="muted small num">{cs.filter((x) => x.side === 'bull').length}▲ {cs.filter((x) => x.side === 'bear').length}▼</span>
            </button>
          );
        })}
      </div>
      <div className="cl-list">
        {open && claims.filter((x) => x.cat === open).map((x, i) => (
          <div key={i} className="cl-claim">
            <span className={`pill sm ${x.side === 'bull' ? 'bull' : 'bear'}`}>{x.side === 'bull' ? 'BULLISH' : 'BEARISH'}</span>
            <div className="cl-txt">
              {x.cat === 'news' ? <button className="link cl-head" onClick={() => openArticle({ title: x.text, url: x.url, src: x.source, t: x.t ?? Date.now(), summary: x.summary, syms: [sym], sentiment: x.side === 'bull' ? 1 : -1 })}>{x.text}</button> : <b>{x.text}</b>}
              <div className="small muted">{x.evidence} · {x.source}{x.t ? ` · ${new Date(x.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</div>
            </div>
          </div>
        ))}
        {open && !claims.some((x) => x.cat === open) && <p className="small muted hw-pad">{open === 'fundamental' && fund?.errors && Object.keys(fund.errors).length ? `No financials: ${Object.values(fund.errors).join(' · ')}` : 'Nothing clearly bullish or bearish here.'}</p>}
      </div>
      <p className="note hw-pad">Rules on data only, no AI text. Technicals: daily bars. Financials: {fund?.source ?? 'Finnhub'}. News: the headline’s own words{newsSrc.length ? ` (from ${newsSrc.slice(0, 5).join(', ')}${newsSrc.length > 5 ? '…' : ''})` : ''}. Consensus: each of the three votes once.</p>
    </div>
  );
}

/* ---------------- bet board ---------------- */
const dailyCache = new Map<string, { at: number; bars: Bar[] }>();
export function useDailyMany(syms: string[], mode: DataMode): Record<string, Bar[]> {
  const [by, setBy] = useState<Record<string, Bar[]>>({});
  const key = syms.join(',');
  useEffect(() => {
    if (mode.kind === 'demo') { setBy(Object.fromEntries(syms.map((s) => [s, makeCandles(s, 'D', 100)]))); return; }
    if (mode.kind !== 'live') return;
    let stop = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let k = 0;
    for (const s of syms) {
      const c = dailyCache.get(s);
      if (c && Date.now() - c.at < 3 * 3600_000) { setBy((x) => ({ ...x, [s]: c.bars })); continue; }
      timers.push(setTimeout(async () => {
        try { const r = await fetch(`/api/candles?symbol=${s}&tf=D`); const j = await r.json(); if (r.ok) { dailyCache.set(s, { at: Date.now(), bars: j.bars }); if (!stop) setBy((x) => ({ ...x, [s]: j.bars })); } } catch { /* skip */ }
      }, k++ * 8500)); // Twelve Data free: ~7 requests a minute
    }
    return () => { stop = true; timers.forEach(clearTimeout); };
  }, [key, mode.kind]); // eslint-disable-line react-hooks/exhaustive-deps
  return by;
}
const CALL: Record<BetOdds['call'], string> = { raise: 'RAISE', call: 'CALL', fold: 'FOLD', 'too few hands': 'NO READ' };
export function BetsW({ d, cfg, set }: P) {
  const { stars } = useDesk();
  const rrv: number = cfg.rr ?? 2;
  const syms = useMemo(() => [...new Set([...stars, ...Object.values(d.quotes).filter((q) => Number.isFinite(q.rsRank)).sort((a, b) => b.rsRank - a.rsRank).map((q) => q.sym)])].filter((s) => !['USO', 'UUP'].includes(s)).slice(0, 14), [stars, d.quotes]);
  const bars = useDailyMany(syms, d.mode);
  const rank = (o: BetOdds | null) => (!o ? -99 : o.call === 'too few hands' ? -50 + o.evR : o.evR);
  const rows = syms.map((s) => ({ s, o: bars[s] ? bestBet(bars[s], rrv) : null })).sort((a, b) => rank(b.o) - rank(a.o));
  return (
    <div className="hw-col">
      <div className="hw-bar">
        <span className="small muted">Target</span>
        {[1.5, 2, 3].map((r) => <button key={r} className={`chip sm ${rrv === r ? 'on' : ''}`} onClick={() => set({ ...cfg, rr: r })}>{r}R</button>)}
        <span className="small muted bets-legend"><Q k="calc" src="win rates from past daily bars; pot odds from your R target" />equity vs pot odds</span>
      </div>
      <div className="bets grow">
        <div className="bets-h"><span>Hand</span><span>Bet</span><span title="How often this stock hit the target before the stop, from the same trend state">Equity</span><span title="Win rate needed to break even at this reward:risk">Pot odds</span><span title="Average result per bet, in units of risk">EV</span><span title="Half Kelly: share of the account to risk">Size</span><span>Call</span></div>
        {rows.map(({ s, o }) => (
          <div key={s} className={`bets-r k-${o?.call.replace(/ /g, '') ?? 'loading'}`} onClick={() => d.onChart(s)} title={o ? `${o.n} past hands in this state: ${o.state}. Entry ${px(o.entry)}, stop ${px(o.stop)}, target ${px(o.target)}. Cautious equity (90% low) ${o.lowPct.toFixed(0)}%.` : 'Loading history…'}>
            <span className="bets-sym"><Star sym={s} /><b>{s}</b></span>
            <span className="small">{o ? o.side.toUpperCase() : '…'}</span>
            <span className="num">{o ? `${o.winPct.toFixed(0)}%` : ''}</span>
            <span className="num muted">{o ? `${o.requiredPct.toFixed(0)}%` : ''}</span>
            <span className={`num ${o && o.evR > 0 ? 'up' : 'down'}`}>{o ? `${o.evR >= 0 ? '+' : ''}${o.evR.toFixed(2)}R` : ''}</span>
            <span className="num muted">{o && o.halfKellyPct > 0 ? `${Math.min(o.halfKellyPct, 5).toFixed(1)}%` : '—'}</span>
            <span className={`call c-${o?.call.replace(/ /g, '') ?? ''}`}>{o ? CALL[o.call] : ''}</span>
          </div>
        ))}
      </div>
      <p className="note hw-pad">Each row replays every past day the stock was in today’s trend state: enter at the close, stop 1.5× ATR, target {rrv}× the risk, 20 days max. Equity = how often the target hit first. RAISE only when even the cautious estimate beats the pot odds and EV &gt; +0.25R; FOLD when EV ≤ 0. Size is half Kelly, capped at 5%. History is not a promise; these are odds, not picks.</p>
    </div>
  );
}

/* ---------------- article reader (floating) ---------------- */
export function ReaderOverlay({ a, onClose, mode }: { a: Article; onClose: () => void; mode: DataMode }) {
  const [frame, setFrame] = useState<'idle' | 'checking' | 'ok' | 'blocked'>('idle');
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  useEffect(() => setFrame('idle'), [a.url]);
  const w = sentimentWords(a.title);
  const tryFrame = async () => {
    if (!a.url) return;
    if (mode.kind !== 'live') { setFrame('blocked'); return; }
    setFrame('checking');
    try { const j = await (await fetch(`/api/research?fn=frame&url=${encodeURIComponent(a.url)}`)).json(); setFrame(j.embeddable ? 'ok' : 'blocked'); } catch { setFrame('blocked'); }
  };
  let host = '';
  try { host = a.url ? new URL(a.url).hostname.replace(/^www\./, '') : ''; } catch { /* bad url */ }
  return (
    <div className="reader-scrim" onMouseDown={onClose}>
      <article className={`reader ${frame === 'ok' ? 'wide' : ''}`} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Article">
        <div className="reader-h">
          <span className="small muted">{a.src}{host && host !== a.src ? ` · ${host}` : ''} · {new Date(a.t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET</span>
          <button className="icon-btn reader-x" onClick={onClose} aria-label="Close article (Esc)" title="Close (Esc)">×</button>
        </div>
        <h3>{a.title}</h3>
        <div className="reader-tags">
          {w.bull.length > w.bear.length ? <span className="pill bull">BULLISH</span> : w.bear.length > w.bull.length ? <span className="pill bear">BEARISH</span> : <span className="pill mixed">NEUTRAL</span>}
          {(w.bull.length > 0 || w.bear.length > 0) && <span className="small muted">from the headline’s words: {[...w.bull.map((x) => `+${x}`), ...w.bear.map((x) => `−${x}`)].join(', ')}</span>}
          {(a.syms ?? []).map((s) => <span key={s} className="sym-chip">{s}</span>)}
        </div>
        {frame === 'ok' && a.url ? <iframe className="reader-frame" src={a.url} title={a.title} sandbox="allow-scripts allow-same-origin allow-popups" referrerPolicy="no-referrer" /> : (
          <>
            <p className="reader-sum">{a.summary || 'This feed didn’t include a summary. Open the full article at the publisher.'}</p>
            {a.summary && <p className="small muted">Summary as published by {a.src}.</p>}
          </>
        )}
        {frame === 'blocked' && <p className="small warn-txt">{host || 'This site'} doesn’t allow being shown inside other sites, so it opens in a new tab.</p>}
        <div className="reader-actions">
          {a.url && <a className="btn primary" href={a.url} target="_blank" rel="noreferrer noopener">Read the full article ↗</a>}
          {a.url && frame === 'idle' && <button className="btn" onClick={tryFrame}>Try to show it here</button>}
          {frame === 'checking' && <span className="small muted">Checking…</span>}
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </article>
    </div>
  );
}

/* ---------------- Spotify + X embeds ---------------- */
export function SpotifyW({ cfg, set }: P) {
  const url: string = cfg.url ?? 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M';
  const m = /open\.spotify\.com\/(?:intl-\w+\/)?(playlist|album|track|episode|show|artist)\/([A-Za-z0-9]+)/.exec(url);
  const [draft, setDraft] = useState(url);
  return (
    <div className="hw-col">
      <form className="hw-bar" onSubmit={(e) => { e.preventDefault(); set({ ...cfg, url: draft.trim() }); }}>
        <input className="br-url" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Paste a Spotify playlist, album, track or podcast link" aria-label="Spotify link" />
        <button className="btn" type="submit">Load</button>
      </form>
      {m ? <iframe className="sp-frame" src={`https://open.spotify.com/embed/${m[1]}/${m[2]}?theme=0`} title="Spotify" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy" />
        : <p className="small down hw-pad">That isn’t a Spotify link (open.spotify.com/…).</p>}
      <p className="note hw-pad">Spotify’s official embed: full songs when you’re logged in to Spotify in this browser, 30-second previews otherwise. No API key needed.</p>
    </div>
  );
}

export function XW({ d, cfg, set }: P) {
  const url: string = cfg.url ?? '';
  const [draft, setDraft] = useState(url);
  const [st, setSt] = useState<{ html?: string; error?: string } | null>(null);
  const box = useMemo(() => ({ id: `x${Math.random().toString(36).slice(2, 8)}` }), []);
  useEffect(() => {
    setSt(null);
    if (!url) return;
    if (d.mode.kind !== 'live') { setSt({ error: 'X embeds load on the live desk (the preview can’t reach X).' }); return; }
    fetch(`/api/research?fn=x&url=${encodeURIComponent(url)}`).then((r) => r.json()).then((j) => setSt(j.html ? { html: j.html } : { error: j.error ?? 'No embed' })).catch((e) => setSt({ error: String(e) }));
  }, [url, d.mode.kind]);
  useEffect(() => {
    if (!st?.html) return;
    const w = window as any;
    const run = () => w.twttr?.widgets?.load(document.getElementById(box.id));
    if (w.twttr?.widgets) run();
    else if (!document.getElementById('x-widgets-js')) { const s = document.createElement('script'); s.id = 'x-widgets-js'; s.async = true; s.src = 'https://platform.twitter.com/widgets.js'; s.onload = run; document.body.appendChild(s); }
    else setTimeout(run, 800);
  }, [st?.html, box.id]);
  return (
    <div className="hw-col">
      <form className="hw-bar" onSubmit={(e) => { e.preventDefault(); set({ ...cfg, url: draft.trim() }); }}>
        <input className="br-url" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Paste an x.com post (or profile) link" aria-label="X link" />
        <button className="btn" type="submit">Load</button>
      </form>
      <div className="hw-scroll x-box" id={box.id}>
        {st?.html ? <div dangerouslySetInnerHTML={{ __html: st.html }} /> : st?.error ? <p className="small muted hw-pad">{st.error}{url && <> · <a href={url} target="_blank" rel="noreferrer noopener">Open on X ↗</a></>}</p> : <p className="small muted hw-pad">{url ? 'Loading…' : 'X’s official embed works for single posts. Profile timelines are hit-or-miss since X limited them; if one won’t load, use the link.'}</p>}
      </div>
    </div>
  );
}
