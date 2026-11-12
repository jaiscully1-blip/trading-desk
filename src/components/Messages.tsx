// Messages: earnings, results, Fed / White House releases and economic releases as a chat-style stream, plus a live
// player for whichever finance, world-news or government YouTube channels are streaming (pick one; the choice is remembered).
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FeedItem } from '../../shared/feed';
import type { FeedState } from '../data/feed';
import type { CalendarState } from '../data/news';
import { useDesk } from '../lib/deskctx';
import { CoName, Seg, Star } from './common';
import { et, etToUtc } from '../lib/clock';
import { usePersisted } from '../lib/store';
import { keywordHits } from '../../shared/catalysts';
import { MacroClock } from './MacroClock';
import { MyLinks } from './MyLinks';
import { LivePlayer, type VMode } from './LivePlayer';

type Filter = 'all' | 'earn' | 'cat' | 'gov' | 'mine';
const CAT = ['catalyst', 'stake', 'insider', 'wire', 'fund'];
const LABEL: Record<FeedItem['kind'], string> = { filing: 'FILED', earnings: 'EARNINGS', result: 'RESULT', fed: 'FED', whitehouse: 'WHITE HOUSE', econ: 'ECONOMY', live: 'LIVE', catalyst: '8-K', stake: 'STAKE', insider: 'INSIDER', wire: 'PRESS', fund: '13F' };

export function Messages({ feed, cal, nowMs, onChart, compact = false }: { feed: FeedState | null; cal: CalendarState | null; nowMs: number; onChart: (s: string) => void; compact?: boolean }) {
  const { stars, openArticle, alertWords = [], setAlertWords } = useDesk();
  const [word, setWord] = useState('');
  const addWord = () => { const w = word.trim(); if (w && setAlertWords && !alertWords.some((x) => x.toLowerCase() === w.toLowerCase())) setAlertWords([...alertWords, w].slice(0, 30)); setWord(''); };
  const [f, setF] = useState<Filter>('all');
  const [watch, setWatch] = useState<string | null>(null);
  const [chan, setChan] = usePersisted<string>('liveChan', 'Bloomberg TV');
  // live video size, remembered separately for the page and the home widget: off hides the player (and stops loading it)
  const [vsizeRaw, setVsize] = usePersisted<VMode>(compact ? 'liveSizeWidget' : 'liveSize', compact ? 's' : 'm');
  // the home widget keeps it simple (off / S / M / L); the page also has mini, half screen and floating
  const vsize: VMode = compact && !['off', 's', 'm', 'l'].includes(vsizeRaw) ? 's' : vsizeRaw;
  const slot = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const e0 = et(nowMs);
  const today = `${e0.y}-${String(e0.mo).padStart(2, '0')}-${String(e0.d).padStart(2, '0')}`;
  // scheduled economic releases today become messages at their release time
  const econ: FeedItem[] = useMemo(() => (cal?.econ ?? []).filter((e) => e.date === today).map((e) => {
    const [h, m] = e.time.split(':').map(Number);
    const t = Number.isFinite(h) ? etToUtc(e0.y, e0.mo, e0.d, h, m || 0) : NaN;
    return { id: `econ:${e.key}:${e.date}`, t: Number.isFinite(t) ? t : nowMs, kind: 'econ' as const, title: `${e.label} ${t > nowMs ? `at ${e.time} ET (upcoming)` : `released at ${e.time} ET`}`, text: e.note };
  }), [cal, today, nowMs]);
  const all = useMemo(() => [...(feed?.items ?? []), ...econ].sort((a, b) => a.t - b.t), [feed, econ]);
  const lives = all.filter((x) => x.kind === 'live');
  const shown = all.filter((x) => x.kind !== 'live' && f !== 'mine' && (f === 'all' || (f === 'earn' ? ['filing', 'earnings', 'result'].includes(x.kind) : f === 'cat' ? CAT.includes(x.kind) : ['fed', 'whitehouse', 'econ'].includes(x.kind))));
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [shown.length, f]);
  const vid = (u?: string) => u?.match(/v=([\w-]{11})/)?.[1];
  const active = (watch && lives.some((l) => vid(l.url) === watch) ? watch : null) ?? vid(lives.find((l) => l.text === chan)?.url) ?? vid(lives[0]?.url) ?? null;
  const hitsOf = (m: FeedItem) => (alertWords.length ? keywordHits(m, alertWords) : []);
  let lastDay = '';
  const split = !compact && vsize === 'split' && !!active;
  const liveTitle = lives.find((l) => vid(l.url) === active)?.text ?? 'Live';
  const MODES: { id: VMode; label: string; hint: string }[] = compact
    ? [{ id: 'off', label: 'Off', hint: 'Hide the live video' }, { id: 's', label: 'S', hint: 'Small' }, { id: 'm', label: 'M', hint: 'Medium' }, { id: 'l', label: 'L', hint: 'Large' }]
    : [{ id: 'off', label: 'Off', hint: 'Hide the live video' }, { id: 'mini', label: '–', hint: 'Minimize to a small bar (keeps playing)' }, { id: 's', label: 'S', hint: 'Small, in the page' }, { id: 'm', label: 'M', hint: 'Medium, in the page' }, { id: 'l', label: 'L', hint: 'Large, in the page' }, { id: 'split', label: '◧ Half', hint: 'Video on the right half of the screen, messages on the left' }, { id: 'float', label: '⧉ Float', hint: 'Floating window: drag it anywhere, resize from its corner' }];
  return (
    <div className={`msgs ${compact ? 'compact' : ''} ${split ? 'split' : ''}`}>
     <div className="msgs-col">
      <div className="msgs-bar">
        <Seg value={f} onChange={setF} options={[{ id: 'all', label: 'All' }, { id: 'earn', label: 'Earnings' }, { id: 'cat', label: 'Filings & press' }, { id: 'gov', label: 'Fed · Gov · Econ' }, { id: 'mine', label: 'My links' }]} />
        {lives.length > 0 && <div className="live-chips">{lives.map((l) => <button key={l.id} className={`live-chip ${vid(l.url) === active && vsize !== 'off' ? 'on' : ''}`} onClick={() => { setWatch(vid(l.url) ?? null); setChan(l.text ?? ''); if (vsize === 'off') setVsize(compact ? 's' : 'm'); }}>● {l.text}</button>)}</div>}
        {lives.length > 0 && (
          <div className="vid-size" role="group" aria-label="Live video size">
            <span className="small muted">Video</span>
            {MODES.map((z) => <button key={z.id} className={`chip sm ${vsize === z.id ? 'on' : ''}`} onClick={() => setVsize(z.id)} aria-pressed={vsize === z.id} title={z.hint}>{z.label}</button>)}
          </div>
        )}
        {feed?.demo && <span className="fresh fresh-demo">DEMO DATA</span>}
      </div>
      <MacroClock cal={cal} compact={compact} max={compact ? 4 : 8} />
      {setAlertWords && (
        <div className="kw-bar">
          <span className="small muted" title="A new message that contains one of these words plays a sound and shows a ping, on any page. Words match whole words in any case; a ticker (NVDA or $NVDA) also matches messages about that stock.">🔔 Alert words</span>
          {alertWords.map((w) => <span key={w} className="chip sm on kw-chip">{w}<button aria-label={`Remove ${w}`} onClick={() => setAlertWords(alertWords.filter((x) => x !== w))}>×</button></span>)}
          <input className="kw-in" value={word} placeholder={alertWords.length ? 'add…' : 'e.g. acquisition, FDA, buyback, NVDA'} onChange={(e) => setWord(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addWord(); }} onBlur={addWord} maxLength={40} />
        </div>
      )}
      {active && compact && vsize !== 'off' && (
        <div className={`msgs-live vs-${vsize}`}>
          <iframe src={`https://www.youtube-nocookie.com/embed/${active}?autoplay=0`} title="Live stream" allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
        </div>
      )}
      {active && !compact && ['s', 'm', 'l'].includes(vsize) && <div className={`msgs-live vs-${vsize}`}><div className="msgs-slot" ref={slot} /></div>}
      {f === 'mine' ? <MyLinks onChart={onChart} /> : <div className="msgs-list" ref={box}>
        {!shown.length && <p className="muted small msgs-empty">{feed ? 'No messages yet today.' : 'Loading…'}</p>}
        {shown.map((m) => {
          const ed = et(m.t), day = `${ed.y}-${String(ed.mo).padStart(2, '0')}-${String(ed.d).padStart(2, '0')}`;
          const sep = day !== lastDay ? <div className="msgs-day" key={`d:${day}`}>{new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })}</div> : null;
          lastDay = day;
          return [sep, (
            <div key={m.id} className={`msg k-${m.kind} ${m.tone ?? ''} ${m.sym && stars.includes(m.sym) ? 'starred' : ''} ${hitsOf(m).length ? 'hit' : ''}`}>
              <div className="msg-h">
                <span className="msg-k">{LABEL[m.kind]}</span>
                {m.sym && <><Star sym={m.sym} /><button className="msg-sym" onClick={() => onChart(m.sym!)}>{m.sym}</button><CoName sym={m.sym} /></>}
                {hitsOf(m).length > 0 && <span className="kw-hit" title="Matches your alert words">🔔 {hitsOf(m).join(', ')}</span>}
                <span className="msg-t num">{new Date(m.t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}</span>
              </div>
              <div className="msg-b">{m.url && m.kind !== 'live' ? <button className="link hw-headline" onClick={() => openArticle({ title: m.title, url: m.url, src: ['filing', 'catalyst', 'stake', 'insider'].includes(m.kind) ? 'SEC EDGAR' : m.text ?? m.kind, t: m.t, summary: m.text, syms: m.sym ? [m.sym] : [] })}>{m.title}</button> : m.title}</div>
              {m.text && <div className="msg-x small muted">{m.text}</div>}
            </div>
          )];
        })}
      </div>}
      {!compact && <p className="note msgs-note">Earnings results appear the moment a company files its 8-K (Item 2.02) with the SEC, usually within minutes of the press release. Beat/miss numbers come from Finnhub and lag by minutes to hours. Other 8-K events (deals, executive changes, layoffs, delisting notices), 13D / 13G stakes and insider buys and sells (Form 4) come straight from SEC EDGAR for your tickers and the big caps (every 13D on any listed company); press releases come from the PR Newswire and Business Wire RSS feeds and only show when they name a US-listed ticker. Fed and White House items come from their official RSS feeds; live video plays from the official YouTube channels of finance networks (Bloomberg, Yahoo Finance, CNBC, Schwab, Fox Business, Reuters), world news (Sky, Al Jazeera, DW, France 24, NBC, ABC, CBS, LiveNOW, Euronews) and the White House, Fed and C-SPAN, whenever they are streaming; channels are checked every 3 minutes and the one you pick is remembered. Covers your watchlist, starred and scanner tickers plus about 120 large caps.</p>}
     </div>
      {split && (
        <aside className="msgs-vside" aria-label="Live video">
          <div className="msgs-slot" ref={slot} />
          <div className="msgs-vchans">{lives.map((l) => <button key={l.id} className={`live-chip ${vid(l.url) === active ? 'on' : ''}`} onClick={() => { setWatch(vid(l.url) ?? null); setChan(l.text ?? ''); }}>● {l.text}</button>)}</div>
        </aside>
      )}
      {active && !compact && vsize !== 'off' && <LivePlayer vid={active} title={liveTitle} mode={vsize} setMode={setVsize} slot={slot} />}
    </div>
  );
}
