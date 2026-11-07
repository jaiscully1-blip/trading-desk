// Left side menu: one full-screen page per section, each with a single-key shortcut.
export type Page = 'desk' | 'scanner' | 'map' | 'flows' | 'journal' | 'calendar';

const PAGES: { id: Page; label: string; key: string }[] = [
  { id: 'desk', label: 'DESK', key: 'D' },
  { id: 'scanner', label: 'SCANNER', key: 'S' },
  { id: 'map', label: 'WORLD MAP', key: 'M' },
  { id: 'flows', label: 'MONEY FLOW', key: 'G' },
  { id: 'calendar', label: 'CALENDARS', key: 'C' },
  { id: 'journal', label: 'JOURNAL', key: '⇧J' },
];

export function SideNav({ page, onPage, onCmd, onHelp, onAccount }: { page: Page; onPage: (p: Page) => void; onCmd: () => void; onHelp: () => void; onAccount: () => void }) {
  return (
    <nav className="nav" aria-label="Pages">
      <div className="nav-brand">DESK&gt;_</div>
      {PAGES.map((p) => (
        <button key={p.id} className={`nav-item ${page === p.id ? 'on' : ''}`} aria-current={page === p.id ? 'page' : undefined} onClick={() => onPage(p.id)}>
          <span className="nav-l">{p.label}</span><span className="kbd">{p.key}</span>
        </button>
      ))}
      <div className="nav-sep" />
      <button className="nav-item" onClick={onAccount}><span className="nav-l">ACCOUNT</span><span className="kbd">A</span></button>
      <div className="nav-foot">
        <button onClick={onCmd}>Search / commands <span className="kbd">Ctrl K</span></button>
        <button onClick={onHelp}>Shortcuts <span className="kbd">?</span></button>
      </div>
    </nav>
  );
}
