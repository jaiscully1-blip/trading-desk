// Search box on the Company page: type a ticker or a company name ("rocket", "nvda", "coca cola"). Suggestions come instantly from
// the built-in S&P 500 + Nasdaq-100 list, and from SEC's list of every US-listed filer when the desk is live. Enter opens the top one.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DataMode } from '../data/live';
import { searchCompanies, type CoHit } from '../../shared/companySearch';

const SYM = /^[A-Z][A-Z0-9.\-]{0,9}$/;
let localList: CoHit[] | null = null;

export function CompanySearch({ mode, onOpen, current }: { mode: DataMode; onOpen: (s: string) => void; current: string }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [list, setList] = useState<CoHit[] | null>(localList);
  const [remote, setRemote] = useState<CoHit[]>([]);
  const box = useRef<HTMLInputElement>(null);

  // the company list lives in its own file; load it the first time the box is used
  const ensure = () => { if (!localList) void import('../../shared/data/companies').then((m) => { localList = m.COMPANIES.map((c) => ({ sym: c[0], name: c[1], note: c[3] || c[2] })); setList(localList); }); };

  // SEC's full list for anything outside the built-in one (live only, debounced)
  useEffect(() => {
    const t = q.trim();
    if (mode.kind !== 'live' || t.length < 2) { setRemote([]); return; }
    const ctl = new AbortController();
    const id = setTimeout(() => { fetch(`/api/research?fn=lookup&q=${encodeURIComponent(t)}`, { signal: ctl.signal }).then((r) => r.json()).then((j) => setRemote(Array.isArray(j.hits) ? j.hits : [])).catch(() => {}); }, 250);
    return () => { clearTimeout(id); ctl.abort(); };
  }, [q, mode.kind]);

  const hits = useMemo(() => {
    const t = q.trim();
    if (!t) return [];
    // one ranking over both lists (the built-in entries keep their sector note when a ticker is in both)
    const by = new Map<string, CoHit>();
    for (const h of remote) by.set(h.sym, h);
    for (const h of list ?? []) by.set(h.sym, h);
    return searchCompanies(t, [...by.values()], 10);
  }, [q, list, remote]);

  const pick = (s: string) => { onOpen(s); setQ(''); setOpen(false); box.current?.blur(); };
  const enter = () => {
    const h = hits[i];
    if (h) return pick(h.sym);
    const up = q.trim().toUpperCase();
    if (SYM.test(up)) pick(up); // any valid ticker, even one not in either list
  };

  return (
    <div className="co-search" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false); }}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M11 11m-6 0a6 6 0 1 0 12 0 6 6 0 1 0-12 0 M20 20l-4-4" /></svg>
      <input
        ref={box} value={q} placeholder={`Search a company or ticker (now: ${current})`} aria-label="Search companies"
        onFocus={() => { ensure(); setOpen(true); }}
        onChange={(e) => { setQ(e.target.value); setI(0); setOpen(true); ensure(); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(hits.length - 1, x + 1)); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); enter(); }
          else if (e.key === 'Escape') { setQ(''); setOpen(false); box.current?.blur(); }
          e.stopPropagation(); // typing here never triggers the desk's one-key shortcuts
        }}
      />
      {open && q.trim() && (
        <ul className="co-search-list" role="listbox">
          {hits.map((h, k) => (
            <li key={h.sym} role="option" aria-selected={k === i} className={k === i ? 'on' : ''} onMouseEnter={() => setI(k)} onMouseDown={(e) => { e.preventDefault(); pick(h.sym); }}>
              <b className="num">{h.sym}</b><span>{h.name}</span>{h.note && <em className="small muted">{h.note}</em>}
            </li>
          ))}
          {!hits.length && <li className="muted small co-search-none">{SYM.test(q.trim().toUpperCase()) ? `Enter opens ${q.trim().toUpperCase()}` : list ? 'No match. Try a ticker or another spelling.' : 'Loading the company list…'}</li>}
        </ul>
      )}
    </div>
  );
}
