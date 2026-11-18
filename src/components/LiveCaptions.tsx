// Live earnings call captions: play the company's webcast out loud and Chrome's built-in speech recognition writes
// what it hears, line by line, stamped with the time into the call and the clock time. Free; uses the microphone,
// and Chrome sends the audio to Google's speech service to transcribe. Lines can be searched, saved to research or copied.
import { useEffect, useRef, useState } from 'react';
import { addResearch } from '../lib/research';
import { openExplain } from './InfoDrawer';

type Line = { at: number; sec: number; text: string };
const WATCH = /\b(guidance|raise[sd]?|rais(?:ing)|lower(?:ed|ing)?|cut|beat|miss(?:ed)?|record|margin|outlook|headwinds?|tailwinds?|demand|backlog|buyback|repurchase|dividend|layoffs?|restructur\w*|AI)\b/i;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const et = (t: number) => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'America/New_York' });

export function LiveCaptions({ sym, name }: { sym: string; name?: string }) {
  const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition : null;
  const [on, setOn] = useState(false), [lines, setLines] = useState<Line[]>([]), [interim, setInterim] = useState(''), [err, setErr] = useState('');
  const [q, setQ] = useState(''), [saved, setSaved] = useState(false);
  const rec = useRef<any>(null), t0 = useRef(0), want = useRef(false), box = useRef<HTMLDivElement>(null);
  useEffect(() => () => { want.current = false; rec.current?.stop(); }, []);
  useEffect(() => { const b = box.current; if (b && !q) b.scrollTop = b.scrollHeight; }, [lines, interim, q]);
  const start = () => {
    if (!SR) return;
    setErr(''); want.current = true; if (!t0.current) t0.current = Date.now();
    const r = new SR(); r.continuous = true; r.interimResults = true; r.lang = 'en-US';
    r.onresult = (e: any) => {
      let tmp = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const txt = String(e.results[i][0].transcript).trim();
        if (e.results[i].isFinal) { if (txt) { const now = Date.now(); setLines((ls) => [...ls, { at: now, sec: (now - t0.current) / 1000, text: txt }]); } } else tmp += txt + ' ';
      }
      setInterim(tmp.trim());
    };
    r.onerror = (e: any) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { want.current = false; setErr('Microphone access was blocked. Allow the microphone for this site in Chrome, then press Start again.'); setOn(false); } };
    r.onend = () => { if (want.current) { try { r.start(); } catch { /* already restarting */ } } else setOn(false); }; // Chrome stops after silence: restart
    rec.current = r; r.start(); setOn(true);
  };
  const stop = () => { want.current = false; rec.current?.stop(); setOn(false); setInterim(''); };
  const text = () => lines.map((l) => `[${mmss(l.sec)} · ${et(l.at)} ET] ${l.text}`).join('\n');
  const shown = q ? lines.filter((l) => l.text.toLowerCase().includes(q.toLowerCase())) : lines;
  if (!SR) return <p className="small hw-pad">Live captions need Chrome or Edge (they use the browser’s built-in speech recognition). Safari and Firefox don’t support it here.</p>;
  return (
    <div className="lc">
      <div className="lc-bar">
        {on ? <button className="btn" onClick={stop}>■ Stop listening</button> : <button className="btn primary" onClick={start}>● {lines.length ? 'Resume' : 'Start'} live captions</button>}
        <a className="btn" href={`https://www.google.com/search?q=${encodeURIComponent(`${name || sym} earnings call webcast investor relations`)}`} target="_blank" rel="noreferrer noopener">Find the webcast ↗</a>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search what's been said" aria-label="Search captions" />
        {lines.length > 0 && <><button className="chip sm" onClick={() => { addResearch({ sym, title: `${sym} earnings call, live captions (${new Date().toLocaleDateString()})`, body: text(), src: 'Live captions on the desk (Chrome speech recognition; may mishear names and numbers)', kind: 'Transcript' }); setSaved(true); }} disabled={saved}>{saved ? '✓ Saved to research' : 'Save all to research'}</button>
          <button className="chip sm" onClick={() => navigator.clipboard?.writeText(text()).catch(() => {})}>Copy</button></>}
        {on && <span className="lc-live">● LIVE</span>}
      </div>
      {err && <p className="small down">{err}</p>}
      <p className="small muted">1. Open the company’s webcast and play it out loud. 2. Press Start and allow the microphone. Chrome writes what it hears; Chrome sends the audio to Google’s speech service to do it. Names and numbers can be misheard: check the official transcript or press release before acting on anything. Words like guidance, margin and buyback are highlighted.</p>
      <div className="lc-list" ref={box}>
        {shown.map((l, i) => <button key={i} className={`lc-line ${WATCH.test(l.text) ? 'hot' : ''}`} onClick={() => openExplain({ kind: 'Call line', title: `${sym} at ${mmss(l.sec)} into the call`, sub: `${et(l.at)} ET`, what: `“${l.text}”`, sym, src: 'Live captions (Chrome speech recognition)' })}><span className="lc-t num">{mmss(l.sec)}</span><span>{l.text}</span></button>)}
        {interim && !q && <div className="lc-line interim"><span className="lc-t num">…</span><span>{interim}</span></div>}
        {!lines.length && !interim && <p className="small muted">Nothing heard yet.</p>}
      </div>
    </div>
  );
}
