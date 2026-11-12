// Essays: write about a stock in a full-width editor; research slides out from the right (chart, news in a range, fundamentals,
// earnings, holdings, peers, sources, AI outline and fact check). A range picked on the chart drops in as a live citation:
// hover it later and the chart lights that range up again. Saved per account on this device.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DataMode } from '../data/live';
import { usePersisted } from '../lib/store';
import { EssayChart, PIN_COLORS, fetchRange, type Pin } from './EssayChart';
import { citeText, factLines, fmtDay, rangeStats, ymd, type DayBar, type RangeStats } from '../../shared/essay';
import { TearSheet } from './TearSheet';
import { TranscriptView } from './Transcript';
import { InsiderW } from './MoreWidgets';
import { useSnapshot } from '../data/apis';
import { COMPANIES } from '../../shared/data/companies';

interface Src { id: string; kind: 'news' | 'filing' | 'data'; title: string; url?: string; src?: string; t?: number }
interface Essay { id: string; title: string; sym: string; html: string; pins: Pin[]; sources: Src[]; created: number; updated: number }
type Tab = 'chart' | 'news' | 'fund' | 'earn' | 'hold' | 'peers' | 'sources' | 'ai';
const TABS: { id: Tab; label: string }[] = [
  { id: 'chart', label: 'Chart' }, { id: 'news', label: 'News' }, { id: 'fund', label: 'Fundamentals' }, { id: 'earn', label: 'Earnings' },
  { id: 'hold', label: 'Holdings' }, { id: 'peers', label: 'Peers' }, { id: 'sources', label: 'Sources' }, { id: 'ai', label: 'AI' },
];
const uid = () => Math.random().toString(36).slice(2, 10);
const SYM_RE = /^[A-Z][A-Z0-9.\-]{0,9}$/;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Keep only plain writing tags, safe links and our citation chips. */
function clean(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const OK = new Set(['P', 'DIV', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE', 'SPAN', 'A']);
  const walk = (n: Element) => {
    for (const c of [...n.children]) {
      if (!OK.has(c.tagName)) { c.replaceWith(...[...c.childNodes]); continue; }
      for (const a of [...c.attributes]) {
        const keep = (c.tagName === 'SPAN' && (a.name === 'class' && a.value === 'cite' || a.name.startsWith('data-') || a.name === 'contenteditable' || a.name === 'style' && /^--c:#[0-9a-f]{6};?$/i.test(a.value)))
          || (c.tagName === 'A' && (a.name === 'href' && /^https?:\/\//i.test(a.value) || a.name === 'class' && a.value === 'src-link'));
        if (!keep) c.removeAttribute(a.name);
      }
      if (c.tagName === 'A') { c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noreferrer noopener'); }
      walk(c);
    }
  };
  walk(doc.body.firstElementChild!);
  return doc.body.firstElementChild!.innerHTML;
}

function useBars(sym: string) {
  const [st, setSt] = useState<{ bars: DayBar[]; name: string; error?: string; loading: boolean }>({ bars: [], name: '', loading: false });
  useEffect(() => {
    if (!SYM_RE.test(sym)) { setSt({ bars: [], name: '', loading: false }); return; }
    let stop = false;
    setSt((s) => ({ ...s, loading: true, error: undefined }));
    fetch(`/api/research?fn=bars&symbol=${encodeURIComponent(sym)}&tf=1d`).then(async (r) => {
      const j = await r.json();
      if (stop) return;
      setSt(r.ok ? { bars: j.bars ?? [], name: j.name ?? '', loading: false } : { bars: [], name: '', loading: false, error: j.error ?? `HTTP ${r.status}` });
    }).catch((e) => { if (!stop) setSt({ bars: [], name: '', loading: false, error: String(e) }); });
    return () => { stop = true; };
  }, [sym]);
  return st;
}

export default function EssayPage({ mode, onChart }: { mode: DataMode; onChart: (s: string) => void }) {
  const [essays, setEssays] = usePersisted<Essay[]>('essays', []);
  const [activeId, setActiveId] = usePersisted<string>('essayActive', '');
  const [drawer, setDrawer] = usePersisted<boolean>('essayDrawer', true);
  const [tab, setTab] = usePersisted<Tab>('essayTab', 'chart');
  const [focus, setFocus] = useState<{ from: number; to: number; color?: string } | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [transcript, setTranscript] = useState(false);
  const ed = useRef<HTMLDivElement>(null);
  const lastRange = useRef<Range | null>(null);
  const active = essays.find((e) => e.id === activeId) ?? essays[0] ?? null;
  const patch = useCallback((p: Partial<Essay>) => { if (!active) return; setEssays((xs) => xs.map((e) => (e.id === active.id ? { ...e, ...p, updated: Date.now() } : e))); setSaved(Date.now()); }, [active, setEssays]);
  const [symDraft, setSymDraft] = useState(active?.sym ?? '');
  useEffect(() => setSymDraft(active?.sym ?? ''), [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const sym = active?.sym ?? '';
  const { bars, name, error: barsErr, loading } = useBars(sym);
  const { bars: spy } = useBars(sym && sym !== 'SPY' ? 'SPY' : '');

  const create = () => {
    const e: Essay = { id: uid(), title: '', sym: active?.sym || 'NVDA', html: '', pins: [], sources: [], created: Date.now(), updated: Date.now() };
    setEssays((xs) => [e, ...xs]); setActiveId(e.id);
  };
  useEffect(() => { if (!essays.length) create(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // load the essay's text into the editor when switching essays (typing never re-renders it, so the caret stays put)
  useEffect(() => { if (ed.current && active) ed.current.innerHTML = clean(active.html); }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveT = useRef<ReturnType<typeof setTimeout>>(undefined);
  const onInput = () => { clearTimeout(saveT.current); saveT.current = setTimeout(() => { if (ed.current) patch({ html: clean(ed.current.innerHTML) }); }, 400); };
  const keepCaret = () => { const s = window.getSelection(); if (s && s.rangeCount && ed.current?.contains(s.anchorNode)) lastRange.current = s.getRangeAt(0).cloneRange(); };

  /** Put HTML where the caret was (or at the end), then save. */
  const insertHtml = (html: string) => {
    const box = ed.current;
    if (!box) return;
    box.focus();
    const s = window.getSelection();
    if (lastRange.current && box.contains(lastRange.current.startContainer)) { s?.removeAllRanges(); s?.addRange(lastRange.current); }
    else { const r = document.createRange(); r.selectNodeContents(box); r.collapse(false); s?.removeAllRanges(); s?.addRange(r); }
    document.execCommand('insertHTML', false, html);
    keepCaret();
    patch({ html: clean(box.innerHTML) });
  };
  const cmd = (c: string, v?: string) => { ed.current?.focus(); if (lastRange.current) { const s = window.getSelection(); s?.removeAllRanges(); s?.addRange(lastRange.current); } document.execCommand(c, false, v); keepCaret(); onInput(); };

  const insertRange = (st: RangeStats, color?: string, pinId?: string) => {
    const c = color ?? PIN_COLORS[0];
    insertHtml(`<span class="cite" contenteditable="false" data-sym="${esc(sym)}" data-from="${st.from}" data-to="${st.to}"${pinId ? ` data-pin="${pinId}"` : ''} style="--c:${c}">${esc(citeText(sym, st))}</span>&nbsp;`);
    addSource({ kind: 'data', title: `${sym} daily prices ${ymd(st.from)} to ${ymd(st.to)}`, src: 'Yahoo Finance (unofficial, end of day)' });
  };
  const addSource = (s: Omit<Src, 'id'>) => { if (!active) return; if (active.sources.some((x) => x.title === s.title && x.url === s.url)) return; patch({ sources: [...active.sources, { ...s, id: uid() }] }); };
  const onSource = (s: { kind: 'news' | 'filing'; title: string; url: string; src: string; t: number }, insert: boolean) => {
    addSource(s);
    if (insert) insertHtml(`<a class="src-link" href="${esc(s.url)}">${esc(s.title)}</a> (${esc(s.src)}, ${new Date(s.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})&nbsp;`);
  };
  const pin = (st: RangeStats, color: string) => { if (!active) return; patch({ pins: [...active.pins, { id: uid(), from: st.from, to: st.to, color, label: citeText(sym, st) }] }); };

  // citation chips in the essay: hover lights the range on the chart, click opens the chart on it
  const citeAt = (t: EventTarget | null) => (t as HTMLElement | null)?.closest?.('.cite') as HTMLElement | null;
  const onOver = (e: React.MouseEvent) => { const c = citeAt(e.target); if (c) setFocus({ from: +c.dataset.from!, to: +c.dataset.to!, color: c.style.getPropertyValue('--c') || undefined }); };
  const onOut = (e: React.MouseEvent) => { if (citeAt(e.target) && !citeAt(e.relatedTarget)) setFocus(null); };
  const onClickEd = (e: React.MouseEvent) => { const c = citeAt(e.target); if (c) { setDrawer(true); setTab('chart'); setFocus({ from: +c.dataset.from!, to: +c.dataset.to!, color: c.style.getPropertyValue('--c') || undefined }); } };

  const text = () => ed.current?.innerText ?? '';
  const words = (active?.html ?? '').replace(/<[^>]+>/g, ' ').trim().split(/\s+/).filter(Boolean).length;
  const cites = useMemo(() => {
    const d = new DOMParser().parseFromString(`<div>${active?.html ?? ''}</div>`, 'text/html');
    return [...d.querySelectorAll('.cite')].map((c) => ({ from: +((c as HTMLElement).dataset.from ?? 0), to: +((c as HTMLElement).dataset.to ?? 0), text: c.textContent ?? '' }));
  }, [active?.html]);
  const facts = useMemo(() => {
    const idx = new Map(bars.map((b, i) => [ymd(b.time), i]));
    const ranges = [...cites, ...(active?.pins ?? [])];
    return [...new Set(ranges.map((r) => { const a = idx.get(ymd(r.from)), b = idx.get(ymd(r.to)); const st = a != null && b != null ? rangeStats(bars, a, b, spy) : null; return st ? factLines(sym, st) : ''; }).filter(Boolean))];
  }, [cites, active?.pins, bars, spy, sym]);

  if (!active) return null;
  return (
    <div className={`page es ${drawer ? 'drawer-on' : ''}`}>
      <div className="es-main">
        <div className="es-bar">
          <select value={active.id} onChange={(e) => setActiveId(e.target.value)} aria-label="Your essays" className="es-pick">
            {essays.map((e) => <option key={e.id} value={e.id}>{e.title || 'Untitled'}{e.sym ? ` · ${e.sym}` : ''}</option>)}
          </select>
          <button className="btn" onClick={create}>New essay</button>
          <form className="es-sym" onSubmit={(e) => { e.preventDefault(); const s = symDraft.trim().toUpperCase(); if (SYM_RE.test(s)) patch({ sym: s }); }}>
            <input value={symDraft} onChange={(e) => setSymDraft(e.target.value.toUpperCase())} onBlur={() => { const s = symDraft.trim().toUpperCase(); if (SYM_RE.test(s) && s !== sym) patch({ sym: s }); }} placeholder="Ticker" aria-label="Essay ticker" maxLength={10} />
          </form>
          {name && <span className="small muted es-name">{name}</span>}
          <span className="es-sp" />
          <span className="small muted">{words} words{saved ? ' · saved' : ''}</span>
          <button className="btn" onClick={() => { if (confirm(`Delete "${active.title || 'Untitled'}"? This can't be undone.`)) { const rest = essays.filter((e) => e.id !== active.id); setEssays(rest); setActiveId(rest[0]?.id ?? ''); } }} title="Delete this essay">Delete</button>
          <button className={`btn ${drawer ? 'on' : 'primary'}`} onClick={() => setDrawer(!drawer)} aria-expanded={drawer}>{drawer ? 'Research ›' : '‹ Research'}</button>
        </div>
        <div className="es-doc">
          <input className="es-title" value={active.title} onChange={(e) => patch({ title: e.target.value })} placeholder="Title your essay" aria-label="Essay title" />
          <div className="es-tools" role="toolbar" aria-label="Formatting">
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('formatBlock', 'h2')} title="Heading">H2</button>
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('formatBlock', 'h3')} title="Subheading">H3</button>
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('formatBlock', 'p')} title="Paragraph">¶</button>
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('bold')} title="Bold (Cmd B)"><b>B</b></button>
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('italic')} title="Italic (Cmd I)"><i>I</i></button>
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('insertUnorderedList')} title="Bullet list">• List</button>
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => cmd('formatBlock', 'blockquote')} title="Quote">“ Quote</button>
            <span className="es-tip small muted">Pick a range on the chart and click Insert to cite it. Hover a citation to see it on the chart.</span>
          </div>
          <div ref={ed} className="es-ed" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-label="Essay text" data-ph="Start writing. What happened to this stock, why, and what would change your mind?"
            onInput={onInput} onKeyUp={keepCaret} onMouseUp={keepCaret} onBlur={keepCaret} onMouseOver={onOver} onMouseOut={onOut} onClick={onClickEd} />
        </div>
      </div>

      {drawer && (
        <aside className="es-drawer" aria-label="Research">
          <div className="es-tabs" role="tablist">{TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}{t.id === 'sources' && active.sources.length ? ` ${active.sources.length}` : ''}</button>)}</div>
          <div className="es-pane">
            {!sym && <p className="small muted">Type a ticker at the top to load research.</p>}
            {sym && tab === 'chart' && (
              <>
                {loading && !bars.length && <p className="small muted">Loading {sym}…</p>}
                {barsErr && !bars.length && <p className="small down">{barsErr}</p>}
                {bars.length > 0 && <EssayChart sym={sym} name={name} bars={bars} spy={spy} pins={active.pins} focus={focus} onInsert={insertRange} onPin={pin} onSource={onSource} />}
                {active.pins.length > 0 && (
                  <div className="es-pins"><h5>Pinned ranges</h5>{active.pins.map((p) => (
                    <div key={p.id} className="es-pinrow">
                      <button className="link" onClick={() => setFocus({ from: p.from, to: p.to, color: p.color })}><i style={{ background: p.color }} />{p.label}</button>
                      <button className="hw-btn" onClick={() => { const a = bars.findIndex((b) => ymd(b.time) === ymd(p.from)), b = bars.findIndex((x) => ymd(x.time) === ymd(p.to)); const st = a >= 0 && b >= 0 ? rangeStats(bars, a, b, spy) : null; if (st) insertRange(st, p.color, p.id); }} title="Insert into essay">＋</button>
                      <button className="hw-btn" onClick={() => patch({ pins: active.pins.filter((x) => x.id !== p.id) })} aria-label="Remove pin">×</button>
                    </div>
                  ))}</div>
                )}
                <p className="note">Daily prices from Yahoo Finance (unofficial, end of day). Headlines from Google News search; filings from SEC EDGAR.</p>
              </>
            )}
            {sym && tab === 'news' && <RangeNewsTab sym={sym} name={name} focus={focus} onSource={onSource} />}
            {sym && tab === 'fund' && <TearSheet sym={sym} mode={mode} />}
            {sym && tab === 'earn' && <EarningsTab sym={sym} bars={bars} onFocus={(f) => { setTab('chart'); setFocus(f); }} onTranscript={() => setTranscript(true)} />}
            {sym && tab === 'hold' && (
              <>
                <InsiderW d={{ mode, sel: sym } as never} cfg={{ sym }} set={() => {}} />
                <p className="note">Insider buys and sells from SEC Form 4. Big funds' holdings (13F) are on the Institutional Holdings page, by fund.</p>
              </>
            )}
            {sym && tab === 'peers' && <PeersTab sym={sym} mode={mode} onChart={onChart} />}
            {tab === 'sources' && (
              <>
                {!active.sources.length && <p className="small muted">Sources you cite (ranges, headlines, filings) collect here.</p>}
                <ol className="es-src">{active.sources.map((s) => <li key={s.id}>{s.url ? <a href={s.url} target="_blank" rel="noreferrer noopener">{s.title}</a> : s.title}{s.src ? <span className="small muted"> · {s.src}</span> : null}<button className="hw-btn" onClick={() => patch({ sources: active.sources.filter((x) => x.id !== s.id) })} aria-label="Remove source">×</button></li>)}</ol>
                {active.sources.length > 0 && <button className="btn sm" onClick={() => insertHtml(`<h3>Sources</h3><ol>${active.sources.map((s) => `<li>${s.url ? `<a class="src-link" href="${esc(s.url)}">${esc(s.title)}</a>` : esc(s.title)}${s.src ? ` (${esc(s.src)})` : ''}</li>`).join('')}</ol>`)}>Insert the source list at the caret</button>}
              </>
            )}
            {sym && tab === 'ai' && <AiTab sym={sym} title={active.title} text={text} facts={facts} />}
          </div>
        </aside>
      )}
      {transcript && sym && <TranscriptView sym={sym} onClose={() => setTranscript(false)} />}
    </div>
  );
}

function RangeNewsTab({ sym, name, focus, onSource }: { sym: string; name: string; focus: { from: number; to: number } | null; onSource: (s: { kind: 'news' | 'filing'; title: string; url: string; src: string; t: number }, insert: boolean) => void }) {
  const now = Math.floor(Date.now() / 1000);
  const [win, setWin] = useState<{ from: number; to: number }>(focus ?? { from: now - 30 * 86400, to: now });
  useEffect(() => { if (focus) setWin(focus); }, [focus]);
  const [d, setD] = useState<Awaited<ReturnType<typeof fetchRange>> | null>(null);
  useEffect(() => { setD(null); let stop = false; fetchRange(sym, win.from, win.to, name).then((r) => { if (!stop) setD(r); }); return () => { stop = true; }; }, [sym, win.from, win.to, name]);
  const setDays = (n: number) => setWin({ from: now - n * 86400, to: now });
  return (
    <>
      <div className="es-win"><b>{fmtDay(win.from)} → {fmtDay(win.to)}</b><span className="es-sp" />{[7, 30, 90].map((n) => <button key={n} className="chip sm" onClick={() => setDays(n)}>{n}d</button>)}</div>
      <p className="small muted">Pick a range on the chart (or hover a citation) to see what was said then.</p>
      {!d && <p className="small muted">Loading…</p>}
      {d?.filings.length ? <><h5>Filings</h5><ul className="es-news">{d.filings.map((f, i) => <li key={i}><span className="num small muted">{f.date}</span> <a href={f.url} target="_blank" rel="noreferrer noopener">{f.earnings ? 'Earnings (8-K 2.02)' : f.form}</a> <button className="link small" onClick={() => onSource({ kind: 'filing', title: `${sym} ${f.form}${f.earnings ? ' (earnings)' : ''} filed ${f.date}`, url: f.url, src: 'SEC EDGAR', t: Date.parse(f.date) }, true)}>cite</button></li>)}</ul></> : null}
      {d && <><h5>Headlines ({d.news.length})</h5>{!d.news.length && <p className="small muted">{d.error ?? 'None found.'}</p>}<ul className="es-news">{d.news.map((n, i) => (
        <li key={i}><span className="num small muted">{new Date(n.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span> <a href={n.url} target="_blank" rel="noreferrer noopener">{n.title}</a> <span className="small muted">{n.src}</span> <button className="link small" onClick={() => onSource({ kind: 'news', title: n.title, url: n.url, src: n.src, t: n.t }, true)}>cite</button> <button className="link small" onClick={() => onSource({ kind: 'news', title: n.title, url: n.url, src: n.src, t: n.t }, false)}>save</button></li>
      ))}</ul></>}
    </>
  );
}

function EarningsTab({ sym, bars, onFocus, onTranscript }: { sym: string; bars: DayBar[]; onFocus: (f: { from: number; to: number; color?: string }) => void; onTranscript: () => void }) {
  const now = Math.floor(Date.now() / 1000);
  const [d, setD] = useState<Awaited<ReturnType<typeof fetchRange>> | null>(null);
  useEffect(() => { let stop = false; fetchRange(sym, now - 730 * 86400, now).then((r) => { if (!stop) setD(r); }); return () => { stop = true; }; }, [sym]); // eslint-disable-line react-hooks/exhaustive-deps
  const reports = (d?.filings ?? []).filter((f) => f.earnings || f.form === '10-Q' || f.form === '10-K');
  const reaction = (date: string) => {
    const i = bars.findIndex((b) => ymd(b.time) >= date);
    if (i < 1) return null;
    const j = Math.min(bars.length - 1, i + 2);
    return { from: bars[i].time, to: bars[j].time, chg: (bars[j].close / bars[i - 1].close - 1) * 100 };
  };
  return (
    <>
      <button className="btn sm" onClick={onTranscript}>Open the latest earnings call transcript</button>
      <h5>Reports in the last two years</h5>
      {!d && <p className="small muted">Loading SEC filings…</p>}
      {d && !reports.length && <p className="small muted">{d.error ?? 'No earnings filings found (funds and foreign companies may not file 8-Ks).'}</p>}
      <ul className="es-news">{reports.map((f, i) => { const r = f.earnings ? reaction(f.date) : null; return (
        <li key={i}><span className="num small muted">{f.date}</span> <a href={f.url} target="_blank" rel="noreferrer noopener">{f.earnings ? 'Earnings release' : f.form}</a>
          {r && <button className="link small" onClick={() => onFocus({ from: r.from, to: r.to, color: '#5cc8f5' })} title="Show the 3 days from the report on the chart"> 3-day move <b className={r.chg >= 0 ? 'up' : 'down'}>{r.chg >= 0 ? '+' : ''}{r.chg.toFixed(1)}%</b></button>}</li>
      ); })}</ul>
      <p className="note">Earnings releases are 8-K filings with item 2.02 (SEC EDGAR). The 3-day move runs from the close before the report.</p>
    </>
  );
}

function PeersTab({ sym, mode, onChart }: { sym: string; mode: DataMode; onChart: (s: string) => void }) {
  const [peers, setPeers] = useState<{ sym: string; name: string }[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => { setPeers(null); setErr(''); let stop = false; fetch(`/api/research?fn=company&symbol=${encodeURIComponent(sym)}&quick=1`).then(async (r) => { const j = await r.json(); if (!stop) { if (r.ok) setPeers(j.peers ?? []); else setErr(j.error ?? `HTTP ${r.status}`); } }).catch((e) => !stop && setErr(String(e))); return () => { stop = true; }; }, [sym]);
  const snap = useSnapshot(mode.kind === 'live').data?.snap ?? {};
  // Finnhub's peer list when it answers; otherwise S&P 500 / Nasdaq-100 companies in the same sub-industry (then sector)
  const me = COMPANIES.find((c) => c[0] === sym);
  const local = me ? [...COMPANIES.filter((c) => c[0] !== sym && c[3] === me[3]), ...COMPANIES.filter((c) => c[0] !== sym && c[3] !== me[3] && c[2] === me[2])].slice(0, 10).map((c) => ({ sym: c[0], name: c[1] })) : [];
  const list = peers?.length ? peers : local;
  const rows = [{ sym, name: me?.[1] ?? 'this company' }, ...list].slice(0, 12);
  return (
    <>
      {!peers && !err && <p className="small muted">Loading peers…</p>}
      {err && <p className="small down">{err}</p>}
      {(peers || err) && rows.length > 1 && (
        <table className="es-peers"><thead><tr><th>Ticker</th><th>Name</th><th className="r">Today</th><th className="r">Market cap</th></tr></thead><tbody>
          {rows.map((p) => { const q = snap[p.sym]; return (
            <tr key={p.sym} className={p.sym === sym ? 'me' : ''}><td><button className="link" onClick={() => onChart(p.sym)}><b>{p.sym}</b></button></td><td className="small">{p.name}</td>
              <td className={`r num ${(q?.c ?? 0) >= 0 ? 'up' : 'down'}`}>{q ? `${q.c >= 0 ? '+' : ''}${q.c.toFixed(2)}%` : '—'}</td><td className="r num">{q?.mc ? `$${(q.mc / 1e9).toFixed(0)}B` : '—'}</td></tr>
          ); })}
        </tbody></table>
      )}
      <p className="note">{peers?.length ? 'Peers from Finnhub (same industry).' : `Peers: S&P 500 / Nasdaq-100 companies in the same industry${me ? ` (${me[3]})` : ''}.`} Today's move and size from the TradingView screener, about 15 min delayed.</p>
    </>
  );
}

function AiTab({ sym, title, text, facts }: { sym: string; title: string; text: () => string; facts: string[] }) {
  const [busy, setBusy] = useState<'' | 'outline' | 'check'>('');
  const [out, setOut] = useState<any>(null);
  const [err, setErr] = useState('');
  const run = async (mode: 'outline' | 'check') => {
    setBusy(mode); setErr(''); setOut(null);
    try {
      const r = await fetch('/api/research?fn=essayai', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode, sym, title, text: text(), facts }) });
      const j = await r.json();
      if (!r.ok) setErr(j.error ?? `HTTP ${r.status}`); else setOut(j);
    } catch (e) { setErr(String(e)); }
    setBusy('');
  };
  return (
    <>
      <div className="es-ai-btns">
        <button className="btn primary" disabled={!!busy} onClick={() => run('outline')}>{busy === 'outline' ? 'Thinking…' : 'Suggest an outline'}</button>
        <button className="btn" disabled={!!busy} onClick={() => run('check')}>{busy === 'check' ? 'Checking…' : 'Fact-check my numbers'}</button>
      </div>
      <p className="small muted">Uses your draft and the {facts.length} range{facts.length === 1 ? '' : 's'} you cited or pinned (real daily prices). Gemini, free tier: it can be wrong, and it never says what to trade.</p>
      {err && <p className="small down">{err}</p>}
      {out?.mode === 'outline' && (
        <div className="es-ai">
          {out.sections.map((s: any, i: number) => <div key={i}><h5>{i + 1}. {s.heading}</h5><ul>{s.points.map((p: string, j: number) => <li key={j}>{p}</li>)}</ul></div>)}
          {out.questions.length > 0 && <><h5>Questions a reader will ask</h5><ul>{out.questions.map((q: string, i: number) => <li key={i}>{q}</li>)}</ul></>}
          {out.missing.length > 0 && <><h5>Data that would make it stronger</h5><ul>{out.missing.map((q: string, i: number) => <li key={i}>{q}</li>)}</ul></>}
        </div>
      )}
      {out?.mode === 'check' && (
        <div className="es-ai">
          {!out.claims.length && <p className="small muted">No numbers or dates to check yet.</p>}
          {out.claims.map((c: any, i: number) => <div key={i} className={`es-claim ${c.verdict}`}><span className="es-v">{c.verdict === 'matches' ? '✓ matches' : c.verdict === 'wrong' ? '✗ check this' : '? not covered'}</span><q>{c.quote}</q><span className="small muted">{c.note}</span></div>)}
        </div>
      )}
    </>
  );
}
