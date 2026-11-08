import type { ReactNode } from 'react';
import { useDesk } from '../lib/deskctx';
import type { Board, Quote, RightTab } from '../types';
import type { NewsState } from '../data/news';
import { etTime } from '../lib/clock';
import { Fresh, PanelHead, LeanDot } from './common';

export type NewsFilter = 'all' | 'watchlist' | 'macro';
const TABS: { id: RightTab; label: string; key: string }[] = [
  { id: 'news', label: 'News', key: 'N' },
  { id: 'scanner', label: 'Scanner', key: 'S' },
  { id: 'journal', label: 'Journal', key: 'Q' },
  { id: 'risk', label: 'Risk', key: 'R' },
  { id: 'calendar', label: 'Calendars', key: 'C' },
];

export function RightRail(props: {
  tab: RightTab;
  onTab: (t: RightTab) => void;
  quotes: Record<string, Quote>;
  boards: Record<string, Board>;
  news: NewsState;
  sel: string;
  onSelect: (s: string) => void;
  addSym: (s: string) => void;
  newsFilter: NewsFilter;
  setNewsFilter: (f: NewsFilter) => void;
  scanner: ReactNode;
  journal: ReactNode;
  risk: ReactNode;
  calendar: ReactNode;
  onPopout?: () => void;
}) {
  const { tab, onTab } = props;
  return (
    <section className="panel rr">
      <PanelHead
        title={
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => onTab(t.id)} title={`${t.id === 'journal' ? 'Quick Journal' : t.label} (${t.key})`} data-key={t.key}>
                {t.label}
              </button>
            ))}
          </div>
        }
        onPopout={props.onPopout}
      />
      <div className="rr-body">
        {tab === 'news' && <NewsTab {...props} />}
        {tab === 'scanner' && props.scanner}
        {tab === 'journal' && props.journal}
        {tab === 'risk' && props.risk}
        {tab === 'calendar' && props.calendar}
      </div>
    </section>
  );
}

function Chips<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o.id} className={`chip ${value === o.id ? 'on' : ''}`} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

const DOT = { 1: 'up', 0: 'muted', [-1]: 'down' } as const;

function NewsTab({ news, boards, newsFilter, setNewsFilter, onSelect }: Parameters<typeof RightRail>[0]) {
  const { openArticle } = useDesk();
  const list = news.items.filter((h) =>
    newsFilter === 'all' ? true : newsFilter === 'macro' ? h.macro : h.syms.some((s) => boards[s]),
  );
  return (
    <>
      <div className="rr-tools">
        <Chips<NewsFilter> value={newsFilter} onChange={setNewsFilter} options={[{ id: 'all', label: 'All' }, { id: 'watchlist', label: 'My watchlist' }, { id: 'macro', label: 'Macro' }]} />
        <Fresh kind={news.freshness} at={news.asOf || undefined} src={news.sources.map((s) => `${s.name}: ${s.ok ? s.count : 'failed'}`).join(', ')} />
      </div>
      <ul className="news">
        {list.map((h) => (
          <li key={h.id}>
            <span className="num muted" title={new Date(h.t).toLocaleString()}>{etTime(h.t)}</span>
            <span className="news-t">
              <span className={`sent ${DOT[h.sentiment]}`} title={`Keyword sentiment: ${h.sentiment > 0 ? 'bullish' : h.sentiment < 0 ? 'bearish' : 'neutral'} (rough)`}>●</span>{' '}
              <button className="link-plain news-hl" onClick={() => openArticle({ title: h.title, url: h.url, src: h.src, t: h.t, syms: h.syms, sentiment: h.sentiment })} title="Open the article reader">{h.title}</button>
            </span>
            <span className="news-m">
              {h.syms.map((s) => (
                <button key={s} className="sym-chip" onClick={() => onSelect(s)}>{s}</button>
              ))}
              {h.macro && <span className="tag">Macro</span>}
              <span className="muted small">{h.src}</span><LeanDot lean={(h as { lean?: import('../../shared/bias').Lean }).lean} />
            </span>
          </li>
        ))}
        {!list.length && <li className="muted">No headlines for this filter.</li>}
      </ul>
      {news.sources.length > 0 && (
        <p className="note">Sources: {news.sources.map((s) => <span key={s.name} className={s.ok ? '' : 'down'} title={s.error}>{s.name} {s.ok ? s.count : '✗'} · </span>)}Sentiment dots are keyword-based (rough).</p>
      )}
    </>
  );
}

