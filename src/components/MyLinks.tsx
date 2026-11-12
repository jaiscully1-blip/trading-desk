// "My links" in Messages: paste an article or YouTube link; the desk reads it and explains, in plain English, how it could
// affect stocks, the market, money, the economy, politics and government. Saved per account on this device.
// AI-written (Gemini free tier), labeled as such; describes possible effects only, never trade instructions.
import { useState } from 'react';
import { usePersisted } from '../lib/store';
import { AREA_LABEL, type Dir, type LinkRead, type Tone } from '../../shared/linkread';

interface Item { id: string; url: string; addedAt: number; status: 'reading' | 'done' | 'error'; read?: LinkRead; error?: string; transcriptOpen?: boolean }
const DAILY = 25;
const today = () => new Date().toLocaleDateString('en-CA');
const TONE: Record<Tone, string> = { positive: 'up', negative: 'down', mixed: 'warn', neutral: 'muted' };
const DIR: Record<Dir, { c: string; t: string }> = { up: { c: 'up', t: '▲' }, down: { c: 'down', t: '▼' }, mixed: { c: 'warn', t: '◆' }, unclear: { c: 'muted', t: '?' } };
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

async function analyze(url: string, transcript?: string): Promise<LinkRead> {
  const r = await fetch('/api/research?fn=linkread', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, transcript }) });
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j as LinkRead;
}

export function MyLinks({ onChart }: { onChart: (s: string) => void }) {
  const [items, setItems] = usePersisted<Item[]>('myLinks', []);
  const [used, setUsed] = usePersisted<{ day: string; n: number }>('myLinksUsed', { day: '', n: 0 });
  const [url, setUrl] = useState('');
  const [msg, setMsg] = useState('');
  const [paste, setPaste] = useState<Record<string, string>>({});
  const left = DAILY - (used.day === today() ? used.n : 0);
  const patch = (id: string, p: Partial<Item>) => setItems((a) => a.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const run = async (it: Item, transcript?: string) => {
    if (left <= 0) { setMsg(`Daily limit reached (${DAILY} links per account). It resets tomorrow.`); return; }
    setUsed((u) => ({ day: today(), n: (u.day === today() ? u.n : 0) + 1 }));
    patch(it.id, { status: 'reading', error: undefined });
    try { const read = await analyze(it.url, transcript); patch(it.id, { status: 'done', read, transcriptOpen: false }); }
    catch (e) { patch(it.id, { status: 'error', error: (e as Error).message }); }
  };
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const u = url.trim();
    if (!/^https?:\/\/\S+$/i.test(u)) { setMsg('Paste a full link that starts with https://'); return; }
    if (items.some((x) => x.url === u)) { setMsg('That link is already in your list.'); return; }
    const it: Item = { id: Math.random().toString(36).slice(2, 9), url: u, addedAt: Date.now(), status: 'reading' };
    setItems((a) => [it, ...a].slice(0, 200));
    setUrl(''); setMsg('');
    void run(it);
  };

  return (
    <div className="ml">
      <form className="ml-add" onSubmit={add}>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a news article or YouTube link…" aria-label="Article or YouTube link" spellCheck={false} />
        <button className="btn primary" type="submit" disabled={!url.trim()}>Read it</button>
        <span className="small muted">{left} left today</span>
      </form>
      {msg && <p className="small down ml-msg" role="alert">{msg}</p>}
      {!items.length && <p className="small muted ml-empty">Add articles and videos you find. The desk explains what each one says and how it could move stocks, rates and the dollar, the economy, politics and government. Written by AI (Gemini, free tier): it can be wrong, it is not advice, and it never says what to trade.</p>}
      <div className="ml-list">
        {items.map((it) => {
          const r = it.read, a = r?.analysis;
          return (
            <article key={it.id} className={`ml-card ${it.status}`}>
              <header className="ml-h">
                <span className="msg-k">{r?.kind === 'youtube' || /youtu\.?be/.test(it.url) ? 'VIDEO' : 'ARTICLE'}</span>
                <a className="ml-t" href={it.url} target="_blank" rel="noreferrer noopener">{r?.title || host(it.url)}</a>
                <span className="small muted">{r?.source ?? host(it.url)}{r?.published ? ` · ${new Date(r.published).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</span>
                <span className="ml-acts">
                  {it.status !== 'reading' && <button className="hw-btn" onClick={() => run(it, paste[it.id])} title="Read it again">↻</button>}
                  <button className="hw-btn" onClick={() => setItems((x) => x.filter((y) => y.id !== it.id))} title="Remove" aria-label="Remove link">×</button>
                </span>
              </header>
              {it.status === 'reading' && <p className="small muted">Reading… (up to half a minute)</p>}
              {it.status === 'error' && <p className="small down">{it.error}</p>}
              {a && (
                <>
                  <div className="ml-tags">
                    <span className="chip sm" title="How sure the AI is, given what it could read">confidence: {a.confidence}</span>
                    <span className="chip sm" title="How long the effect could last">{a.timeframe}</span>
                    {a.opinion && <span className="chip sm warn">opinion / promo</span>}
                    {r!.kind === 'youtube' && <span className="chip sm">{r!.transcript === 'none' ? 'no transcript: title + description only' : r!.transcript === 'pasted' ? 'your pasted transcript' : 'captions read'}</span>}
                  </div>
                  <p className="ml-sum">{a.summary}</p>
                  {a.effects.length > 0 && <div className="ml-fx">{a.effects.map((e) => (
                    <div key={e.area} className="ml-fx-row"><span className={`ml-area ${TONE[e.tone]}`}>{AREA_LABEL[e.area]}</span><span className="small">{e.text}</span></div>
                  ))}</div>}
                  {(a.tickers.length > 0 || a.sectors.length > 0) && (
                    <div className="ml-syms">
                      {a.tickers.map((t) => <button key={t.sym} className={`ml-sym ${DIR[t.effect].c}`} onClick={() => onChart(t.sym)} title={`${t.why} · open the chart`}>{DIR[t.effect].t} {t.sym}</button>)}
                      {a.sectors.map((s) => <span key={s.name} className={`ml-sec ${DIR[s.effect].c}`} title={s.why}>{DIR[s.effect].t} {s.name}</span>)}
                    </div>
                  )}
                  {a.keyPoints.length > 0 && <ul className="ml-kp small">{a.keyPoints.map((k, i) => <li key={i}>{k}</li>)}</ul>}
                  {a.watch.length > 0 && <p className="small"><b>Watch:</b> {a.watch.join(' · ')}</p>}
                  {a.caveats && <p className="small muted">{a.caveats}</p>}
                  <p className="tiny faint">AI summary ({r!.model}, read {new Date(r!.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}). Possible effects, not predictions. Not financial advice.</p>
                </>
              )}
              {r?.kind === 'youtube' && r.transcript === 'none' && (
                it.transcriptOpen
                  ? <div className="ml-tr">
                      <p className="small muted">YouTube didn't share the captions. On the video page: <b>…more</b> under the title, then <b>Show transcript</b>. Copy it and paste it here.</p>
                      <textarea value={paste[it.id] ?? ''} onChange={(e) => setPaste((p) => ({ ...p, [it.id]: e.target.value }))} rows={4} placeholder="Paste the transcript…" aria-label="Video transcript" />
                      <button className="btn sm primary" disabled={(paste[it.id] ?? '').trim().length < 100} onClick={() => run(it, paste[it.id])}>Read with transcript</button>
                    </div>
                  : <button className="btn sm" onClick={() => patch(it.id, { transcriptOpen: true })}>Add the transcript for a fuller read</button>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
