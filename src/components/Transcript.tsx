// Earnings call transcript viewer: prepared remarks and Q&A, speaker by speaker, with a search box and Alpha Vantage's
// per-turn sentiment (their model, −1 to 1). Also the "Earnings calls" list: today's and tomorrow's calls with the usual
// time, a search link for the company's webcast, and the transcript once it is out (usually the next day).
import { useEffect, useMemo, useState } from 'react';
import type { Transcript as T, Turn } from '../../shared/transcript';
import { qaStart, usualCallTime } from '../../shared/transcript';
import type { EarnItem } from '../../shared/eventsCal';
import { Q } from './common';

interface TrData extends T { summary: { prepared: number | null; answers: number | null; analystsTone: number | null; analysts: { name: string; firm: string }[]; words: number; turns: number }; source: string }

const tone = (v: number | null) => (v == null ? 'muted' : v >= 0.2 ? 'up' : v <= -0.2 ? 'down' : 'muted');
const toneTxt = (v: number | null) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}`);

export function TranscriptView({ sym, onClose }: { sym: string; onClose: () => void }) {
  const [d, setD] = useState<TrData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [part, setPart] = useState<'all' | 'prepared' | 'qa'>('all');
  useEffect(() => {
    let stop = false;
    fetch(`/api/research?fn=transcript&symbol=${encodeURIComponent(sym)}`).then(async (r) => { const j = await r.json(); if (!stop) { if (r.ok) setD(j); else setErr(j.error ?? `HTTP ${r.status}`); } }).catch((e) => !stop && setErr(String(e)));
    return () => { stop = true; };
  }, [sym]);
  const turns = useMemo(() => {
    if (!d) return [] as (Turn & { i: number })[];
    const qa = qaStart(d);
    const re = q.trim() ? new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;
    return d.turns.map((t, i) => ({ ...t, i })).filter((t) => (part === 'all' || (part === 'prepared' ? t.i < qa : t.i >= qa)) && (!re || re.test(t.text) || re.test(t.speaker)));
  }, [d, q, part]);
  const mark = (text: string) => {
    if (!q.trim()) return text;
    const parts = text.split(new RegExp(`(${q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'));
    return parts.map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p));
  };
  return (
    <div className="overlay co-modal" role="dialog" aria-label={`${sym} earnings call transcript`} onClick={onClose}>
      <div className="trv" onClick={(e) => e.stopPropagation()}>
        <div className="trv-h">
          <b>{sym} earnings call{d ? ` · ${d.quarter}` : ''}</b>
          <Q k="model" src="Alpha Vantage transcript; sentiment per turn is their model (−1 negative to +1 positive), not ours" />
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        {err && <p className="small hw-pad">{/ALPHAVANTAGE/.test(err) ? 'Transcripts need the free ALPHAVANTAGE_API_KEY in Vercel.' : err}</p>}
        {!d && !err && <p className="small muted hw-pad">Loading the transcript… (uses one of the desk's 25 free Alpha Vantage calls a day the first time)</p>}
        {d && (
          <>
            <div className="trv-sum small">
              <span>Tone, prepared remarks <b className={tone(d.summary.prepared)}>{toneTxt(d.summary.prepared)}</b></span>
              <span>answers to analysts <b className={tone(d.summary.answers)}>{toneTxt(d.summary.answers)}</b></span>
              <span>analysts' questions <b className={tone(d.summary.analystsTone)}>{toneTxt(d.summary.analystsTone)}</b></span>
              <span className="muted">{d.summary.turns} turns · {d.summary.words.toLocaleString('en-US')} words</span>
            </div>
            {d.summary.analysts.length > 0 && <div className="trv-an small muted">Analysts: {d.summary.analysts.map((a) => `${a.name}${a.firm ? ` (${a.firm})` : ''}`).join(' · ')}</div>}
            <div className="trv-bar">
              <div className="chips">{(['all', 'prepared', 'qa'] as const).map((p) => <button key={p} className={`chip sm ${part === p ? 'on' : ''}`} onClick={() => setPart(p)}>{p === 'all' ? 'Whole call' : p === 'prepared' ? 'Prepared remarks' : 'Q&A'}</button>)}</div>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the call (guidance, margin, AI…)" aria-label="Search the transcript" />
              {q && <span className="small muted">{turns.length} turns</span>}
            </div>
            <div className="trv-list">
              {turns.map((t) => (
                <div key={t.i} className={`trv-turn r-${t.role}`}>
                  <div className="trv-sp"><b>{t.speaker}</b> <span className="small muted">{t.title}</span>{t.sentiment != null && t.role !== 'operator' && <span className={`small num ${tone(t.sentiment)}`} title="Sentiment of this turn (Alpha Vantage model)"> {toneTxt(t.sentiment)}</span>}</div>
                  <p>{mark(t.text)}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Today's (and tomorrow's) earnings calls: usual time, a webcast search link, and the transcript button. */
export function CallsList({ earnings, days, mySyms, onSelect }: { earnings: EarnItem[]; days: string[]; mySyms: Set<string>; onSelect: (s: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const sorted = [...days].sort();
  const prev = sorted.filter((x) => x < today).pop(), next = sorted.find((x) => x > today);
  const show = [prev, today, next].filter((x): x is string => !!x);
  const label = (x: string) => (x === today ? 'Today' : x < today ? 'Yesterday (transcripts arrive)' : 'Next session');
  return (
    <div className="ei-list">
      {show.map((day) => {
        const rows = earnings.filter((e) => e.date === day).sort((a, b) => Number(mySyms.has(b.sym)) - Number(mySyms.has(a.sym)) || (b.mcap ?? 0) - (a.mcap ?? 0)).slice(0, 30);
        return (
          <div key={day}>
            <div className="ei-sec">{label(day)} <span className="muted">{new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })}</span></div>
            {rows.map((r) => (
              <div key={day + r.sym} className="ei-row cl-row">
                <button className={`wl-sym ${mySyms.has(r.sym) ? 'mine' : ''}`} onClick={() => onSelect(r.sym)}>{r.sym}</button>
                <span className="ei-name small muted">{r.name}</span>
                <span className="small">{usualCallTime(r.when)}</span>
                <a className="small" href={`https://www.google.com/search?q=${encodeURIComponent(`${r.name || r.sym} earnings call webcast`)}`} target="_blank" rel="noreferrer noopener" title="Companies host their own webcasts on their investor-relations site">Webcast ↗</a>
                <button className="link small" onClick={() => setOpen(r.sym)} disabled={day > today}>Transcript</button>
              </div>
            ))}
            {!rows.length && <p className="muted small hw-pad">None on the calendar.</p>}
          </div>
        );
      })}
      <p className="note">There is no free feed of live call audio, so "Webcast" searches for the company's own investor-relations page. Transcripts usually appear within a day of the call (Alpha Vantage, free key, 25 a day for the whole desk).</p>
      {open && <TranscriptView sym={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
