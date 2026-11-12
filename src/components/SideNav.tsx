// Left side menu: every page is always visible, in five colour-coded groups, each with an icon, a plain name and its one-key shortcut.
// Below ~1000px wide it turns into an icon rail (same colours, names in tooltips). The group colour also tints the page's panel headers.
import type { ReactNode } from 'react';

export type Page = 'morning' | 'home' | 'messages' | 'desk' | 'patterns' | 'company' | 'scanner' | 'map' | 'flows' | 'smart' | 'etfs' | 'gamma' | 'odds' | 'journal' | 'calendar' | 'status' | 'distress' | 'mtf';
export type GroupId = 'today' | 'charts' | 'scan' | 'flow' | 'journal';

/** 24x24 stroke paths (own drawings, simple shapes) */
const ICON: Record<Page | 'account', string> = {
  morning: 'M12 3v3 M5.6 7.6l1.8 1.8 M18.4 7.6l-1.8 1.8 M3 16h18 M7 16a5 5 0 0 1 10 0 M8 20h8',
  home: 'M4 11l8-7 8 7 M6 10v10h12V10 M10 20v-6h4v6',
  messages: 'M4 5h16v11H9l-5 4z',
  desk: 'M7 4v3 M7 15v4 M5 7h4v8H5z M17 6v3 M17 17v3 M15 9h4v8h-4z',
  patterns: 'M3 17l5-6 4 4 5-8 4 5',
  mtf: 'M3 3h8v8H3z M13 3h8v8h-8z M3 13h8v8H3z M13 13h8v8h-8z M5 9l2-3 2 2 M15 9l2-2 2 1 M5 19l2-2 2 1 M15 19l2-3 2 2',
  company: 'M5 20V6l7-3 7 3v14 M3 20h18 M9 9h2 M13 9h2 M9 13h2 M13 13h2 M10 20v-3h4v3',
  scanner: 'M12 12m-9 0a9 9 0 1 0 18 0 9 9 0 1 0-18 0 M12 12l6-5 M12 12m-4 0a4 4 0 1 0 8 0 4 4 0 1 0-8 0',
  flows: 'M4 12a8 8 0 0 1 13.7-5.6L20 9 M20 4v5h-5 M20 12a8 8 0 0 1-13.7 5.6L4 15 M4 20v-5h5',
  etfs: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  smart: 'M3 10l9-6 9 6 M5 10v8 M9 10v8 M15 10v8 M19 10v8 M3 21h18',
  gamma: 'M3 12h4l3-8 4 16 3-8h4',
  map: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18',
  odds: 'M19 5L5 19 M7 8m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M17 16m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0',
  calendar: 'M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4',
  journal: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z M5 17a3 3 0 0 1 3-3h11',
  distress: 'M12 3l9 16H3z M12 9v5 M12 17h.01',
  status: 'M4 5h16v6H4z M4 13h16v6H4z M8 8h.01 M8 16h.01 M12 8h4 M12 16h4',
  account: 'M12 12m-4 0a4 4 0 1 0 8 0 4 4 0 1 0-8 0 M4 21a8 8 0 0 1 16 0',
};
const Icon = ({ id }: { id: Page | 'account' }): ReactNode => (
  <svg className="nv-ic" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICON[id]} /></svg>
);

const P: Record<Page, { label: string; hint: string; key: string }> = {
  morning: { label: 'Morning plan', hint: 'premarket movers, setups, events', key: 'W' }, home: { label: 'Home', hint: 'your widgets and workspaces', key: 'H' },
  messages: { label: 'Messages', hint: 'earnings, Fed, White House, live', key: 'E' },
  desk: { label: 'Desk', hint: 'chart, levels, watchlist, journal', key: 'D' }, patterns: { label: 'Patterns', hint: 'chart patterns and drawing tools', key: 'X' }, company: { label: 'Company', hint: 'filings, quant read, peers', key: 'O' },
  scanner: { label: 'Scanner', hint: 'setups, gappers, RS rank', key: 'S' }, flows: { label: 'Rotation', hint: 'sector and theme rotation', key: 'G' }, etfs: { label: 'ETFs and sectors', hint: 'heatmap and holdings', key: 'U' }, smart: { label: 'Smart money', hint: '13F, ARK, Congress', key: 'I' },
  gamma: { label: 'Gamma and IV', hint: 'dealer gamma, volatility', key: 'V' }, map: { label: 'World map', hint: 'news hotspots, conflicts, shipping', key: 'M' }, odds: { label: 'Econ odds', hint: 'Fed, recession, CPI bets', key: 'Y' }, calendar: { label: 'Calendars', hint: 'economy, earnings, IPOs, Fed', key: 'C' },
  journal: { label: 'Journal', hint: 'trades, rules, review', key: '⇧J' },
  mtf: { label: 'Multi-timeframe', hint: '4 linked charts: 3m, 15m, 1h, daily', key: '⇧M' },
  distress: { label: 'Distress', hint: 'weak companies, turnarounds, sector stress', key: '⇧R' },
  status: { label: 'Data status', hint: 'which data sources are working or limited', key: '⇧B' },
};
export const NAV_GROUPS: { id: GroupId; label: string; pages: Page[] }[] = [
  { id: 'today', label: 'Today', pages: ['morning', 'home', 'messages', 'calendar'] },
  { id: 'charts', label: 'Charts', pages: ['desk', 'mtf', 'patterns', 'company'] },
  { id: 'scan', label: 'Scan', pages: ['scanner', 'flows', 'etfs', 'smart', 'distress'] },
  { id: 'flow', label: 'Flow and risk', pages: ['gamma', 'map', 'odds', 'status'] },
  { id: 'journal', label: 'Journal', pages: ['journal'] },
];
export const pageGroup = (p: Page): GroupId => NAV_GROUPS.find((g) => g.pages.includes(p))?.id ?? 'today';

export function SideNav({ compact, page, onPage, onCmd, onHelp, onAccount, dataState }: { compact?: boolean; page: Page; onPage: (p: Page) => void; onCmd: () => void; onHelp: () => void; onAccount: () => void; dataState?: 'live' | 'demo' | 'checking' }) {
  return (
    <nav className={`nv ${compact ? 'compact' : ''}`} aria-label="Pages">
      <div className="nv-brand"><span className="nv-logo">D</span>{!compact && <span className="nv-name">Desk</span>}</div>
      <button className="nv-search" onClick={onCmd} title="Search tickers, pages and commands (Cmd K / Ctrl K)" aria-label="Search">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M11 11m-6 0a6 6 0 1 0 12 0 6 6 0 1 0-12 0 M20 20l-4-4" /></svg>
        {!compact && <><span>Search</span><span className="nv-key">⌘K</span></>}
      </button>
      <div className="nv-scroll">
        {NAV_GROUPS.map((g) => (
          <div key={g.id} className={`nv-group g-${g.id}`}>
            {compact ? <div className="nv-rule" /> : <div className="nv-gh">{g.label}</div>}
            {g.pages.map((id) => (
              <button key={id} className={`nv-item ${page === id ? 'on' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => onPage(id)} title={`${P[id].label} (${P[id].key}): ${P[id].hint}`} aria-label={P[id].label} data-key={P[id].key}>
                <Icon id={id} />
                {id === 'status' && dataState && <i className={`nv-dot ${dataState}`} title={dataState === 'live' ? 'Live data connected' : dataState === 'demo' ? 'Demo data: no live keys' : 'Checking the data connection'} />}
                {!compact && <><span className="nv-l">{P[id].label}</span><span className="nv-key">{P[id].key}</span></>}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="nv-foot">
        <button className="nv-item nv-acct" onClick={onAccount} title="Account (A): balance, risk limits, settings" aria-label="Account" data-key="A"><Icon id="account" />{!compact && <><span className="nv-l">Account</span><span className="nv-key">A</span></>}</button>
        <button className="nv-mini" onClick={onHelp} title="Keyboard shortcuts (?). Hold Alt / Option to see every key." aria-label="Keyboard shortcuts">?</button>
      </div>
    </nav>
  );
}
