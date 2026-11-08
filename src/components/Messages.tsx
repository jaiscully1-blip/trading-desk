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

type Filter = 'all' | 'earn' | 'gov';
const LABEL: Record<FeedItem['kind'], string> = { filing: 'FILED', earnings: 'EARNINGS', result: 'RESULT', fed: 'FED', whitehouse: 'WHITE HOUSE', econ: 'ECONOMY', live: 'LIVE' };

export function Messages({ feed, cal, nowMs, onChart, compact = false }: { feed: FeedState | null; cal: CalendarState | null; nowMs: number; onChart: (s: string) => void; compact?: boolean }) {
  const { stars, openArticle } = useDesk();
  const [f, setF] = useState<Filter>('all');
  const [watch, setWatch] = useState<string | null>(null);
  const [chan, setChan] = usePersisted<string>('liveChan', 'Bloomberg TV');
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
  const shown = all.filter((x) => x.kind !== 'live' && (f === 'all' || (f === 'earn' ? ['filing', 'earnings', 'result'].includes(x.kind) : ['fed', 'whitehouse', 'econ'].includes(x.kind))));
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [shown.length, f]);
  const vid = (u?: string) => u?.match(/v=([\w-]{11})/)?.[1];
  const active = (watch && lives.some((l) => vid(l.url) === watch) ? watch : null) ?? vid(lives.find((l) => l.text === chan)?.url) ?? vid(lives[0]?.url) ?? null;
  let lastDay = '';
  return (
    <div className={`msgs ${compact ? 'compact' : ''}`}>
      <div className="msgs-bar">
        <Seg value={f} onChange={setF} options={[{ id: 'all', label: 'All' }, { id: 'earn', label: 'Earnings' }, { id: 'gov', label: 'Fed · Gov · Econ' }]} />
        {lives.length > 0 && <div className="live-chips">{lives.map((l) => <button key={l.id} className={`live-chip ${vid(l.url) === active ? 'on' : ''}`} onClick={() => { setWatch(vid(l.url) ?? null); setChan(l.text ?? ''); }}>● {l.text}</button>)}</div>}
        {feed?.demo && <span className="fresh fresh-demo">DEMO DATA</span>}
      </div>
      {active && (
        <div className="msgs-live">
          <iframe src={`https://www.youtube-nocookie.com/embed/${active}?autoplay=0`} title="Live stream" allow="encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
        </div>
      )}
      <div className="msgs-list" ref={box}>
        {!shown.length && <p className="muted small msgs-empty">{feed ? 'No messages yet today.' : 'Loading…'}</p>}
        {shown.map((m) => {
          const ed = et(m.t), day = `${ed.y}-${String(ed.mo).padStart(2, '0')}-${String(ed.d).padStart(2, '0')}`;
          const sep = day !== lastDay ? <div className="msgs-day" key={`d:${day}`}>{new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })}</div> : null;
          lastDay = day;
          return [sep, (
            <div key={m.id} className={`msg k-${m.kind} ${m.tone ?? ''} ${m.sym && stars.includes(m.sym) ? 'starred' : ''}`}>
              <div className="msg-h">
                <span className="msg-k">{LABEL[m.kind]}</span>
                {m.sym && <><Star sym={m.sym} /><button className="msg-sym" onClick={() => onChart(m.sym!)}>{m.sym}</button><CoName sym={m.sym} /></>}
                <span className="msg-t num">{new Date(m.t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}</span>
              </div>
              <div className="msg-b">{m.url && m.kind !== 'live' ? <button className="link hw-headline" onClick={() => openArticle({ title: m.title, url: m.url, src: m.kind === 'filing' ? 'SEC EDGAR' : m.text ?? m.kind, t: m.t, summary: m.text, syms: m.sym ? [m.sym] : [] })}>{m.title}</button> : m.title}</div>
              {m.text && <div className="msg-x small muted">{m.text}</div>}
            </div>
          )];
        })}
      </div>
      {!compact && <p className="note msgs-note">Earnings results appear the moment a company files its 8-K (Item 2.02) with the SEC, usually within minutes of the press release. Beat/miss numbers come from Finnhub and lag by minutes to hours. Fed and White House items come from their official RSS feeds; live video plays from the official YouTube channels of finance networks (Bloomberg, Yahoo Finance, CNBC, Schwab, Fox Business, Reuters), world news (Sky, Al Jazeera, DW, France 24, NBC, ABC, CBS, LiveNOW, Euronews) and the White House, Fed and C-SPAN, whenever they are streaming; channels are checked every 3 minutes and the one you pick is remembered. Covers your watchlist, starred and scanner tickers plus about 120 large caps.</p>}
    </div>
  );
}
