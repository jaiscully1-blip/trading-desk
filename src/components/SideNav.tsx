// Left side menu: every page is always visible, in five colour-coded groups, each with an icon, a plain name and its one-key shortcut.
// Below ~1000px wide it turns into an icon rail (same colours, names in tooltips). The group colour also tints the page's panel headers.
import { isMuted, msToNextOpen, muteLabel, setMute, useMute } from '../lib/mute';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { downloadDesk, exportDesk, importDesk, parseDeskFile, type DeskFile } from '../lib/deskfile';
import { currentAccount, initials, isOwner, leave, makeOwner, verifyDeskPassword } from '../lib/accounts';

export type Page = 'morning' | 'home' | 'messages' | 'desk' | 'patterns' | 'company' | 'scanner' | 'map' | 'flows' | 'smart' | 'etfs' | 'gamma' | 'odds' | 'journal' | 'calendar' | 'status' | 'distress' | 'insiders' | 'credit' | 'mtf' | 'global' | 'news' | 'essay' | 'tesla' | 'altdata' | 'realecon' | 'plumbing' | 'policy' | 'learn' | 'crypto' | 'quant' | 'cmap' | 'weekly' | 'ai' | 'patents' | 'agencies';
export type GroupId = 'today' | 'charts' | 'scan' | 'flow' | 'alt' | 'sys' | 'journal';

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
  learn: 'M3 7l9-4 9 4-9 4z M7 9v5c0 1.7 2.2 3 5 3s5-1.3 5-3V9 M21 7v6',
  essay: 'M4 20h4L19 9l-4-4L4 16z M13.5 6.5l4 4 M4 20h16',
  policy: 'M4 21h16 M6 18V10 M10 18V10 M14 18V10 M18 18V10 M3 8l9-5 9 5z',
  crypto: 'M9 5v14 M13 5v14 M7 8h7a3 3 0 0 1 0 6H7 M7 14h8a3 3 0 0 1 0 6H7 M7 8V5 M7 20v-1',
  plumbing: 'M4 20h16 M6 20v-6 M10.5 20v-9 M15 20v-4 M19 3v8 M16.5 8.5 19 11l2.5-2.5',
  realecon: 'M2 17l5-5 4 3 7-8 M14 7h4v4 M3 21h18',
  cmap: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15',
  weekly: 'M4 5h16v15H4z M4 9h16 M8 3v4 M16 3v4 M7 13h2 M11 13h2 M15 13h2 M7 16h2',
  ai: 'M12 3v3 M12 18v3 M3 12h3 M18 12h3 M7 7l2 2 M15 15l2 2 M17 7l-2 2 M9 15l-2 2 M9 9h6v6H9z',
  agencies: 'M3 21h18 M5 21V10 M9 21V10 M15 21V10 M19 21V10 M2 9l10-6 10 6z M12 6.5h.01',
  patents: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z',
  altdata: 'M4 19V9 M10 19V5 M16 19v-7 M22 19H2',
  quant: 'M5 17l4-5 4 3 6-8 M5 7h.01 M9 5h.01 M17 15h.01 M20 19H4V4',
  tesla: 'M3 13l2-5h14l2 5v5H3z M3 13h18 M7 18v2 M17 18v2 M7 15.5h.01 M17 15.5h.01',
  distress: 'M12 3l9 16H3z M12 9v5 M12 17h.01',
  credit: 'M3 17l5-6 4 3 5-8 4 4 M3 21h18',
  insiders: 'M12 11a4 4 0 100-8 4 4 0 000 8 M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7',
  news: 'M4 5h13v14H6a2 2 0 0 1-2-2z M17 9h3v8a2 2 0 0 1-2 2 M7 9h7 M7 12h7 M7 15h4',
  global: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M7 8h4l1 3-3 2v3 M15 5l-1 4 3 2 3-1',
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
  scanner: { label: 'Scanner', hint: 'setups, gappers, RS rank', key: 'S' }, flows: { label: 'Rotation', hint: 'sector and theme rotation', key: 'G' }, etfs: { label: 'ETFs and sectors', hint: 'heatmap and holdings', key: 'U' }, smart: { label: '13F Tracker', hint: '13F, ARK, Congress', key: 'I' },
  gamma: { label: 'Gamma and IV', hint: 'dealer gamma, volatility', key: 'V' }, map: { label: 'World map', hint: 'news hotspots, conflicts, shipping', key: 'M' }, odds: { label: 'Econ odds', hint: 'Fed, recession, CPI bets', key: 'Y' }, calendar: { label: 'Calendars', hint: 'economy, earnings, IPOs, Fed', key: 'C' },
  journal: { label: 'Journal', hint: 'trades, rules, review', key: '⇧J' },
  policy: { label: 'Macro & Policy', hint: 'earnings scoreboard, tariffs, policy odds by sector', key: '⇧O' },
  crypto: { label: 'BTC / ETH', hint: 'live Bitcoin and Ethereum charts; crypto trades 24/7', key: '' },
  plumbing: { label: 'Shorts & Supply', hint: 'who is shorting, borrow cost, dark-pool share, failed deliveries, unusual options; buybacks, dilution, lockups, index changes, mergers', key: '⇧P' },
  weekly: { label: 'Weekly review', hint: 'your week: check-ins vs results, rules that cost money', key: '' },
  cmap: { label: 'World Monitor', hint: 'agency feeds, US drought and disaster map, world map, agency directory', key: '' },
  realecon: { label: 'Real Economy', hint: 'air traffic, CEO jets, rail, power, fuel, freight, weather', key: '⇧E' },
  ai: { label: 'AI & Models', hint: 'local models on this Mac (Ollama and others), Claude, Kronos and bots: what is running', key: '' },
  agencies: { label: 'Agencies', hint: 'BIS, ECB, Bank of England, Fed, FSB, OCC and more: newest publications, keyword notes, summaries', key: '' },
  patents: { label: 'Patents & Tech', hint: 'company patents, theme radar across every sector, watchlist patent trend', key: '' },
  altdata: { label: 'Alt Data', hint: 'hiring, app ranks, interest, GitHub, players, social, prices', key: '⇧A' },
  tesla: { label: 'Lots', hint: 'registrations, satellite lot fullness, inventory', key: '⇧T' },
  quant: { label: 'Quant Lab', hint: 'find what moves a stock: factors, earnings, Amazon review tone', key: '' },
  learn: { label: 'Learn', hint: 'free practice: probability, Figgie, estimation, puzzles, how exchanges work', key: '' },
  essay: { label: 'Essays', hint: 'write up a stock with a linked chart, news and data', key: '⇧W' },
  mtf: { label: 'Multi-timeframe', hint: '4 linked charts: 3m, 15m, 1h, daily', key: '⇧M' },
  credit: { label: 'Credit market', hint: 'spreads, yield curve, stress, bond ETFs', key: '' },
  insiders: { label: 'Insiders & funds', hint: 'insider buys and sells, short volume, 13F big-fund holdings', key: '' },
  distress: { label: 'Distress', hint: 'weak companies, turnarounds, sector stress', key: '⇧R' },
  news: { label: 'News', hint: 'top stories, search, news by ticker', key: '⇧N' },
  global: { label: 'Global → US', hint: 'world markets and news, and how they carry into US stocks', key: '⇧G' },
  status: { label: 'Data status', hint: 'which data sources are working or limited', key: '⇧B' },
};
export const NAV_GROUPS: { id: GroupId; label: string; pages: Page[] }[] = [
  { id: 'today', label: 'Today', pages: ['morning', 'home', 'news', 'messages', 'calendar'] },
  { id: 'charts', label: 'Charts', pages: ['desk', 'mtf', 'patterns', 'company', 'crypto'] },
  { id: 'scan', label: 'Scan', pages: ['scanner', 'flows', 'etfs', 'insiders', 'plumbing', 'credit', 'distress'] },
  { id: 'flow', label: 'Flow and risk', pages: ['global', 'policy', 'gamma', 'cmap', 'agencies'] },
  { id: 'alt', label: 'Alt data', pages: ['altdata', 'patents', 'quant', 'tesla', 'realecon'] },
  { id: 'sys', label: 'Data & AI', pages: ['status', 'ai'] },
  { id: 'journal', label: 'Journal', pages: ['journal', 'weekly', 'essay', 'learn'] },
];
export const pageGroup = (p: Page): GroupId => NAV_GROUPS.find((g) => g.pages.includes(p))?.id ?? 'today';

/** Who is signed in, and switching / making accounts. Stays signed in until you pick one of these. */
function AccountMenu({ compact }: { compact?: boolean }) {
  const a = currentAccount();
  const mute = useMute();
  const muted = mute != null && isMuted();
  const [open, setOpen] = useState(false);
  const [unlock, setUnlock] = useState(false);
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [pending, setPending] = useState<DeskFile | null>(null);
  const [fileMsg, setFileMsg] = useState('');
  const fileIn = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: 0, bottom: 0 });
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node) && !menu.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', off); window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', off); window.removeEventListener('keydown', esc); };
  }, [open]);
  if (!a) return null;
  const pick = async (f: File | undefined) => {
    if (!f) return;
    try { setPending(parseDeskFile(await f.text())); setFileMsg(''); } catch (e) { setFileMsg((e as Error).message); }
  };
  const tryUnlock = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg('Checking…');
    if (await verifyDeskPassword(pw)) { makeOwner(a, pw); location.reload(); } else setMsg('Not accepted.');
  };
  return (
    <div className="nv-who" ref={box}>
      <button className="nv-item nv-user" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPos({ left: r.left, bottom: window.innerHeight - r.top + 6 }); setOpen((o) => !o); }} aria-expanded={open} aria-haspopup="menu" title={`Signed in as ${a.name}. Switch or make an account.`}>
        <span className="ag-badge" style={{ background: a.color, width: 20, height: 20, fontSize: 9 }} aria-hidden="true">{initials(a.name)}</span>
        {!compact && <span className="nv-l">{a.name}</span>}
        {muted && <span className="nv-muted" role="img" aria-label="Notifications muted" title="Notifications muted">🔕</span>}
      </button>
      {open && createPortal(
        <div className="nv-menu" role="menu" ref={menu} style={{ left: pos.left, bottom: pos.bottom }}>
          <div className="nv-mute" role="group" aria-label="Notifications">
            {muted ? (
              <>
                <span className="small">🔕 Notifications muted {muteLabel(mute)}</span>
                <button role="menuitem" className="chip sm on" onClick={() => setMute(null)}>Turn notifications back on</button>
              </>
            ) : (
              <>
                <span className="small muted">Mute notifications (sound and pop-ups)</span>
                <div className="nv-mute-b">
                  <button role="menuitem" className="chip sm" onClick={() => setMute({ until: Date.now() + 3600_000 })}>1 hour</button>
                  <button role="menuitem" className="chip sm" onClick={() => setMute({ until: Date.now() + msToNextOpen() })}>Until tomorrow's open</button>
                  <button role="menuitem" className="chip sm" onClick={() => setMute({ until: 'manual' })}>Until I turn it on</button>
                </div>
              </>
            )}
          </div>
          <div className="nv-menu-sep" />
          <div className="nv-menu-h"><b>{a.name}</b><span className="small muted">{isOwner() ? 'Owner account' : 'Desk account'} · this device</span></div>
          <button role="menuitem" onClick={() => leave('pick')}>Switch account</button>
          <button role="menuitem" onClick={() => leave('new')}>New account</button>
          <div className="nv-menu-sep" />
          <button role="menuitem" onClick={async () => { setFileMsg('Packing…'); downloadDesk(await exportDesk()); setFileMsg('Saved to your Downloads. Load it on the other link or device.'); }} title="Your layout, watchlists, journal, alerts and notes in one file (no desk password)">Download my desk</button>
          <button role="menuitem" onClick={() => fileIn.current?.click()} title="Bring in a desk you downloaded on another link, browser or computer">Load a desk file…</button>
          <input ref={fileIn} type="file" accept="application/json,.json" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
          {pending && (
            <div className="nv-confirm">
              <span className="small">Replace this desk with {pending.name ? `${pending.name}'s` : 'the'} desk from {pending.from || 'another link'} ({new Date(pending.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})? Your PIN stays the same.</span>
              <span className="nv-confirm-b"><button className="btn sm primary" onClick={async () => { await importDesk(pending); location.reload(); }}>Replace</button><button className="btn sm" onClick={() => setPending(null)}>Cancel</button></span>
            </div>
          )}
          {fileMsg && <span className="small muted nv-filemsg">{fileMsg}</span>}
          {!isOwner() && (unlock
            ? <form className="nv-unlock" onSubmit={tryUnlock}><input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Desk password" aria-label="Desk password" autoFocus /><button className="btn sm primary" type="submit" disabled={!pw}>Unlock</button>{msg && <span className="small muted">{msg}</span>}</form>
            : <button role="menuitem" className="muted" onClick={() => setUnlock(true)}>Desk owner? Unlock private panels</button>)}
        </div>, document.body,
      )}
    </div>
  );
}

export function SideNav({ compact, page, onPage, onCmd, onHelp, onAccount, onCalm, dataState }: { compact?: boolean; page: Page; onPage: (p: Page) => void; onCmd: () => void; onHelp: () => void; onAccount: () => void; onCalm?: () => void; dataState?: 'live' | 'demo' | 'checking' }) {
  return (
    <nav className={`nv ${compact ? 'compact' : ''}`} aria-label="Pages">
      <div className="nv-brand"><img className="nv-logo nv-logo-img" src="/logo.jpg" alt="" width="34" height="34" />{!compact && <span className="nv-name">Trade Desk</span>}</div>
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
        <AccountMenu compact={compact} />
        <button className="nv-item nv-acct" onClick={onAccount} title="Account (A): balance, risk limits, settings" aria-label="Account" data-key="A"><Icon id="account" />{!compact && <><span className="nv-l">Account</span><span className="nv-key">A</span></>}</button>
        {onCalm && <button className="nv-mini" onClick={onCalm} title="Calm mode: hide everything except the 9:30 and 4:00 price checks" aria-label="Calm mode">☾</button>}
        <button className="nv-mini" onClick={onHelp} title="Keyboard shortcuts (?). Hold Alt / Option to see every key." aria-label="Keyboard shortcuts">?</button>
      </div>
    </nav>
  );
}

export const NAV_ICON = ICON;
