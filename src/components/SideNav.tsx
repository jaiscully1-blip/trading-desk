// Left side menu: one full-screen page per section, each with a single-key shortcut. Pages sit in five groups that fold
// (the group holding the page you are on always stays open; the open / closed choice is remembered).
import { usePersisted } from '../lib/store';

export type Page = 'morning' | 'home' | 'messages' | 'desk' | 'patterns' | 'company' | 'scanner' | 'map' | 'flows' | 'smart' | 'etfs' | 'gamma' | 'odds' | 'journal' | 'calendar' | 'strategies';

const P: Record<Page, { label: string; key: string }> = {
  morning: { label: 'MORNING', key: 'W' }, home: { label: 'HOME', key: 'H' }, messages: { label: 'MESSAGES', key: 'E' },
  desk: { label: 'DESK', key: 'D' }, patterns: { label: 'PATTERNS', key: 'X' }, company: { label: 'COMPANY', key: 'O' },
  scanner: { label: 'SCANNER', key: 'S' }, flows: { label: 'ROTATION', key: 'G' }, etfs: { label: 'ETFS & SECTORS', key: 'U' }, smart: { label: 'SMART MONEY', key: 'I' },
  gamma: { label: 'GAMMA & IV', key: 'V' }, map: { label: 'WORLD MAP', key: 'M' }, odds: { label: 'ECON ODDS', key: 'Y' }, calendar: { label: 'CALENDARS', key: 'C' },
  strategies: { label: 'STRATEGIES', key: '⇧L' },
  journal: { label: 'JOURNAL', key: '⇧J' },
};
export const NAV_GROUPS: { id: string; label: string; pages: Page[] }[] = [
  { id: 'today', label: 'TODAY', pages: ['morning', 'home', 'messages'] },
  { id: 'charts', label: 'CHARTS', pages: ['desk', 'patterns', 'company', 'strategies'] },
  { id: 'scan', label: 'SCAN', pages: ['scanner', 'flows', 'etfs', 'smart'] },
  { id: 'flow', label: 'FLOW AND RISK', pages: ['gamma', 'map', 'odds', 'calendar'] },
  { id: 'journal', label: 'JOURNAL', pages: ['journal'] },
];

export function SideNav({ compact, page, onPage, onCmd, onHelp, onAccount }: { compact?: boolean; page: Page; onPage: (p: Page) => void; onCmd: () => void; onHelp: () => void; onAccount: () => void }) {
  const [folded, setFolded] = usePersisted<string[]>('navFolded', ['scan', 'flow']);
  const item = (id: Page) => {
    const p = P[id];
    return (
      <button key={id} className={`nav-item ${page === id ? 'on' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => onPage(id)} title={`${p.label} (${p.key})`} aria-label={p.label}>
        <span className="nav-l">{p.label}</span><span className="kbd">{p.key}</span>
      </button>
    );
  };
  return (
    <nav className={`nav ${compact ? 'compact' : ''}`} aria-label="Pages">
      <div className="nav-brand">{compact ? 'D>' : 'DESK>_'}</div>
      {NAV_GROUPS.map((g) => {
        const holds = g.pages.includes(page);
        const shut = !compact && g.pages.length > 1 && folded.includes(g.id) && !holds;
        return (
          <div key={g.id} className="nav-group">
            {compact ? <div className="nav-sep" /> : g.pages.length > 1
              ? <button className="nav-gh" onClick={() => setFolded(folded.includes(g.id) ? folded.filter((x) => x !== g.id) : [...folded, g.id])} aria-expanded={!shut} title={shut ? 'Show these pages' : 'Fold these pages away'}><span>{g.label}</span><span aria-hidden="true">{shut ? '▸' : '▾'}</span></button>
              : <div className="nav-gh static"><span>{g.label}</span></div>}
            {!shut && g.pages.map(item)}
          </div>
        );
      })}
      <div className="nav-sep" />
      <button className="nav-item" onClick={onAccount} title="ACCOUNT (A)" aria-label="Account"><span className="nav-l">ACCOUNT</span><span className="kbd">A</span></button>
      <div className="nav-foot">
        <button className="nav-mini" onClick={onCmd} title="Search tickers and commands (⌘K / Ctrl K)" aria-label="Search">⌕</button>
        <button className="nav-mini" onClick={onHelp} title="Keyboard shortcuts (?) · hold Alt / ⌥ to see every key" aria-label="Keyboard shortcuts">?</button>
      </div>
    </nav>
  );
}
