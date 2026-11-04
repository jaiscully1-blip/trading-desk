import type { ReactNode } from 'react';
import type { Board, Headline, Quote, RightTab } from '../types';
import { DEMO_AT } from '../lib/demo';
import { etTime } from '../lib/clock';
import { Fresh, PanelHead } from './common';

export type NewsFilter = 'all' | 'watchlist' | 'macro';
const TABS: { id: RightTab; label: string; key: string }[] = [
  { id: 'news', label: 'News', key: 'N' },
  { id: 'scanner', label: 'Scanner', key: 'S' },
  { id: 'journal', label: 'Quick Journal', key: 'Q' },
  { id: 'risk', label: 'Risk', key: 'R' },
];

export function RightRail(props: {
  tab: RightTab;
  onTab: (t: RightTab) => void;
  quotes: Record<string, Quote>;
  boards: Record<string, Board>;
  headlines: Headline[];
  sel: string;
  onSelect: (s: string) => void;
  addSym: (s: string) => void;
  newsFilter: NewsFilter;
  setNewsFilter: (f: NewsFilter) => void;
  scanner: ReactNode;
  journal: ReactNode;
  risk: ReactNode;
  onPopout?: () => void;
}) {
  const { tab, onTab } = props;
  return (
    <section className="panel rr">
      <PanelHead
        title={
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => onTab(t.id)} title={`${t.label} (${t.key})`}>
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

function NewsTab({ headlines, boards, newsFilter, setNewsFilter, onSelect }: Parameters<typeof RightRail>[0]) {
  const list = headlines.filter((h) =>
    newsFilter === 'all' ? true : newsFilter === 'macro' ? h.macro : h.syms.some((s) => boards[s]),
  );
  return (
    <>
      <div className="rr-tools">
        <Chips<NewsFilter> value={newsFilter} onChange={setNewsFilter} options={[{ id: 'all', label: 'All' }, { id: 'watchlist', label: 'My watchlist' }, { id: 'macro', label: 'Macro' }]} />
        <Fresh kind="demo" at={DEMO_AT} src="Sample headlines (Milestone 5 wires Finnhub, GDELT and RSS)" />
      </div>
      <ul className="news">
        {list.map((h) => (
          <li key={h.id}>
            <span className="num muted">{etTime(h.t)}</span>
            <span className="news-t">{h.title}</span>
            <span className="news-m">
              {h.syms.map((s) => (
                <button key={s} className="sym-chip" onClick={() => onSelect(s)}>{s}</button>
              ))}
              {h.macro && <span className="tag">Macro</span>}
              <span className="muted small">{h.src}</span>
            </span>
          </li>
        ))}
        {!list.length && <li className="muted">No headlines for this filter.</li>}
      </ul>
    </>
  );
}

