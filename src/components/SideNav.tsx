// Left side menu: one full-screen page per section, each with a single-key shortcut.
export type Page = 'morning' | 'home' | 'messages' | 'desk' | 'patterns' | 'company' | 'scanner' | 'map' | 'flows' | 'smart' | 'etfs' | 'odds' | 'journal' | 'calendar';

const PAGES: { id: Page; label: string; key: string }[] = [
  { id: 'morning', label: 'MORNING', key: 'W' },
  { id: 'home', label: 'HOME', key: 'H' },
  { id: 'messages', label: 'MESSAGES', key: 'E' },
  { id: 'desk', label: 'DESK', key: 'D' },
  { id: 'patterns', label: 'PATTERNS', key: 'X' },
  { id: 'company', label: 'COMPANY', key: 'O' },
  { id: 'scanner', label: 'SCANNER', key: 'S' },
  { id: 'map', label: 'WORLD MAP', key: 'M' },
  { id: 'flows', label: 'ROTATION', key: 'G' },
  { id: 'etfs', label: 'ETFS & SECTORS', key: 'U' },
  { id: 'smart', label: 'SMART MONEY', key: 'I' },
  { id: 'odds', label: 'ECON ODDS', key: 'Y' },
  { id: 'calendar', label: 'CALENDARS', key: 'C' },
  { id: 'journal', label: 'JOURNAL', key: '⇧J' },
];

export function SideNav({ compact, page, onPage, onCmd, onHelp, onAccount }: { compact?: boolean; page: Page; onPage: (p: Page) => void; onCmd: () => void; onHelp: () => void; onAccount: () => void }) {
  return (
    <nav className={`nav ${compact ? 'compact' : ''}`} aria-label="Pages">
      <div className="nav-brand">{compact ? 'D>' : 'DESK>_'}</div>
      {PAGES.map((p) => (
        <button key={p.id} className={`nav-item ${page === p.id ? 'on' : ''}`} aria-current={page === p.id ? 'page' : undefined} onClick={() => onPage(p.id)} title={`${p.label} (${p.key})`} aria-label={p.label}>
          <span className="nav-l">{p.label}</span><span className="kbd">{p.key}</span>
        </button>
      ))}
      <div className="nav-sep" />
      <button className="nav-item" onClick={onAccount} title="ACCOUNT (A)" aria-label="Account"><span className="nav-l">ACCOUNT</span><span className="kbd">A</span></button>
      <div className="nav-foot">
        <button className="nav-mini" onClick={onCmd} title="Search tickers and commands (⌘K / Ctrl K)" aria-label="Search">⌕</button>
        <button className="nav-mini" onClick={onHelp} title="Keyboard shortcuts (?) · hold Alt / ⌥ to see every key" aria-label="Keyboard shortcuts">?</button>
      </div>
    </nav>
  );
}
