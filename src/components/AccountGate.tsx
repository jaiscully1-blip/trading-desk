// Full-page account screen: pick an account and type its PIN, or make a new account (name, color, 4-6 digit PIN).
// Shown only when nobody is signed in on this device; once in, the desk remembers the account until you switch.
import { useEffect, useRef, useState } from 'react';
import { COLORS, PIN_RE, checkPin, createAccount, enter, gateNext, hasLegacyDesk, initials, listAccounts, lockedFor, makeOwner, validName, verifyDeskPassword, type Account } from '../lib/accounts';

const Badge = ({ a, size = 44 }: { a: Pick<Account, 'name' | 'color'>; size?: number }) => (
  <span className="ag-badge" style={{ background: a.color, width: size, height: size, fontSize: size * 0.38 }} aria-hidden="true">{initials(a.name)}</span>
);

function PinInput({ value, onChange, label, autoFocus }: { value: string; onChange: (v: string) => void; label: string; autoFocus?: boolean }) {
  return (
    <input className="ag-pin" type="password" inputMode="numeric" pattern="\d*" maxLength={6} autoComplete="off" value={value} autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} aria-label={label} placeholder="••••" />
  );
}

function Pick({ onNew }: { onNew: () => void }) {
  const accts = listAccounts();
  const [sel, setSel] = useState<Account | null>(accts.length === 1 ? accts[0] : null);
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0);
  const lock = sel ? lockedFor(sel.id) : 0;
  useEffect(() => { if (!lock) return; const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, [lock]);

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sel || busy) return;
    setBusy(true);
    const r = await checkPin(sel.id, pin);
    setBusy(false);
    if (r === 'ok') return enter(sel.id);
    setPin('');
    setMsg(r === 'locked' ? 'Too many wrong tries. Wait a minute, then try again.' : 'Wrong PIN.');
  };

  return (
    <>
      <h1>Who's trading?</h1>
      <p className="muted">Pick your account. You stay signed in on this device until you switch.</p>
      <div className="ag-list" role="list">
        {accts.map((a) => (
          <button key={a.id} role="listitem" className={`ag-acct ${sel?.id === a.id ? 'on' : ''}`} onClick={() => { setSel(a); setPin(''); setMsg(''); }} aria-pressed={sel?.id === a.id}>
            <Badge a={a} /><span className="ag-n">{a.name}</span>{a.owner && <span className="ag-tag">owner</span>}
          </button>
        ))}
        <button className="ag-acct ag-new" onClick={onNew}><span className="ag-badge ag-plus" aria-hidden="true">+</span><span className="ag-n">New account</span></button>
      </div>
      {sel && (
        <form className="ag-form" onSubmit={go}>
          <label className="ag-l">PIN for {sel.name}</label>
          <PinInput value={pin} onChange={(v) => { setPin(v); setMsg(''); }} label={`PIN for ${sel.name}`} autoFocus />
          {lock > 0 ? <p className="down small">Locked for {Math.ceil(lock / 1000)}s after too many wrong tries.</p> : msg && <p className="down small" role="alert">{msg}</p>}
          <button className="btn primary ag-go" type="submit" disabled={!PIN_RE.test(pin) || busy || lock > 0}>{busy ? 'Checking…' : 'Open my desk'}</button>
        </form>
      )}
    </>
  );
}

function Create({ onBack }: { onBack?: () => void }) {
  const legacy = hasLegacyDesk();
  const used = new Set(listAccounts().map((a) => a.color));
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS.find((c) => !used.has(c)) ?? COLORS[0]);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [ownerOpen, setOwnerOpen] = useState(false);
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { nameRef.current?.focus(); }, []);

  const nameErr = name.trim() ? validName(name) : null;
  const pinErr = pin && !PIN_RE.test(pin) ? 'Use 4 to 6 digits.' : pin2 && pin2 !== pin ? "The PINs don't match." : null;
  const ready = !!name.trim() && !nameErr && PIN_RE.test(pin) && pin === pin2 && (!ownerOpen || pw.length > 0);

  const go = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true); setMsg('');
    try {
      let owner = false;
      if (ownerOpen) {
        owner = await verifyDeskPassword(pw);
        if (!owner) { setBusy(false); setMsg('That desk password was not accepted. Fix it, or close "Desk owner" to make a regular account.'); return; }
      }
      const a = await createAccount({ name, color, pin, owner });
      if (owner) makeOwner(a, pw);
      enter(a.id);
    } catch (err) { setBusy(false); setMsg((err as Error).message); }
  };

  return (
    <>
      {onBack && <button className="btn sm ag-back" onClick={onBack}>← Accounts</button>}
      <h1>{legacy ? 'Set up your account' : 'New trading desk'}</h1>
      <p className="muted">{legacy
        ? 'This browser already has a desk. It becomes your account, with everything kept as it is. Pick a name and a PIN.'
        : 'A fresh desk with its own layout, watchlists, journal and alerts, saved on this device. No email or login, just a PIN.'}</p>
      <form className="ag-form" onSubmit={go}>
        <label className="ag-l" htmlFor="ag-name">Name</label>
        <input id="ag-name" ref={nameRef} className="ag-text" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marcus" autoComplete="off" />
        {nameErr && <p className="down small">{nameErr}</p>}

        <span className="ag-l">Color</span>
        <div className="ag-colors" role="radiogroup" aria-label="Account color">
          {COLORS.map((c) => <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={`Color ${c}`} className={`ag-sw ${color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />)}
          <span className="ag-preview"><Badge a={{ name: name || '?', color }} size={36} /><span>{name.trim() || 'Your name'}</span></span>
        </div>

        <div className="ag-pins">
          <div><label className="ag-l">PIN (4–6 digits)</label><PinInput value={pin} onChange={setPin} label="PIN" /></div>
          <div><label className="ag-l">Type it again</label><PinInput value={pin2} onChange={setPin2} label="Confirm PIN" /></div>
        </div>
        {pinErr && <p className="down small">{pinErr}</p>}

        <button type="button" className="ag-owner-t" onClick={() => setOwnerOpen((o) => !o)} aria-expanded={ownerOpen}>{ownerOpen ? '▾' : '▸'} Desk owner</button>
        {ownerOpen && (
          <div className="ag-owner">
            <p className="small muted">Only for the owner. The desk password opens the private panels (Webull account, order ticket, Discord bots). Other accounts never see them.</p>
            <input className="ag-text" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Desk password" aria-label="Desk password" autoComplete="current-password" />
          </div>
        )}

        {msg && <p className="down small" role="alert">{msg}</p>}
        <button className="btn primary ag-go" type="submit" disabled={!ready || busy}>{busy ? 'Setting up…' : legacy ? 'Save and open my desk' : 'Create my desk'}</button>
        <p className="small faint">The PIN keeps accounts apart on this device. It is not a bank-grade lock: anyone who can use this browser could read its storage.</p>
      </form>
    </>
  );
}

export function AccountGate() {
  const has = listAccounts().length > 0;
  const [mode, setMode] = useState<'pick' | 'new'>(!has ? 'new' : gateNext());
  return (
    <main className="ag">
      <div className="ag-card">
        <div className="ag-brand"><img className="nv-logo nv-logo-img" src="/logo.jpg" alt="" width="34" height="34" /><b>Trade Desk</b></div>
        {mode === 'new' || !has ? <Create onBack={has ? () => setMode('pick') : undefined} /> : <Pick onNew={() => setMode('new')} />}
      </div>
    </main>
  );
}
