// Local AI settings (setup steps, status, which model does which job) and a "Summarize with local AI" button.
// Answers are labeled as model output; the desk never trades on them.
import { useEffect, useRef, useState } from 'react';
import { ROLE_LABEL, askLocal, listModels, setAiCfg, useAiCfg, type AiRole } from '../lib/localai';
import { Q } from './common';

const SITE = typeof location !== 'undefined' ? location.origin : '';
export function LocalAISettings() {
  const cfg = useAiCfg();
  const [st, setSt] = useState<{ models: { name: string; size: number }[] } | { error: string } | null>(null);
  const check = () => { setSt(null); listModels(cfg.url).then(setSt); };
  useEffect(check, [cfg.url]); // eslint-disable-line react-hooks/exhaustive-deps
  const models = st && 'models' in st ? st.models : [];
  const up = !!st && 'models' in st;
  // First connect: pick sensible defaults so the jobs work without setup (news -> a gemma model, math -> a qwen model, else the first installed). Only fills empty slots.
  useEffect(() => {
    if (!models.length || (cfg.models.news && cfg.models.math)) return;
    const pick = (re: RegExp) => (models.find((m) => re.test(m.name)) ?? models[0]).name;
    setAiCfg({ ...cfg, models: { news: cfg.models.news || pick(/gemma/i), math: cfg.models.math || pick(/qwen/i) } });
  }, [models.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section className="panel lai">
      <div className="gx-h"><b>Local AI (Ollama)</b><span className="small muted">free, runs on your Mac, nothing leaves it</span><button className="btn" onClick={check}>Check again</button></div>
      <p className="small gx-pad">{!st ? 'Checking…' : 'error' in st ? <span className="down">{st.error}</span> : <span className="up">Connected: {models.length} model{models.length === 1 ? '' : 's'} installed.</span>}</p>
      <details className="lai-setup" open={!up}><summary className="small gx-pad">Setup steps{up ? " (done)" : ""}</summary>
      <ol className="small lai-steps">
        <li>Install Ollama from <a href="https://ollama.com/download" target="_blank" rel="noreferrer">ollama.com/download</a> and open it.</li>
        <li>Download a small model in Terminal (fits a 16 GB Mac): <code>ollama pull gemma3:4b</code> for news, <code>ollama pull qwen3:8b</code> for math. Check exact names on <a href="https://ollama.com/library" target="_blank" rel="noreferrer">ollama.com/library</a>.</li>
        <li>To use it from the live site, allow this site in Terminal, then quit and reopen Ollama: <code>launchctl setenv OLLAMA_ORIGINS "{SITE}"</code></li>
        <li>Pick a model for each job below. Use Chrome: Safari blocks a secure site from talking to your own computer.</li>
      </ol></details>
      <div className="lai-roles">
        <label className="small">Ollama address <input value={cfg.url} onChange={(e) => setAiCfg({ ...cfg, url: e.target.value })} /></label>
        {(Object.keys(ROLE_LABEL) as AiRole[]).map((r) => (
          <label key={r} className="small">{ROLE_LABEL[r]}
            <select value={cfg.models[r]} onChange={(e) => setAiCfg({ ...cfg, models: { ...cfg.models, [r]: e.target.value } })}>
              <option value="">— none —</option>
              {models.map((m) => <option key={m.name} value={m.name}>{m.name} ({(m.size / 1e9).toFixed(1)} GB)</option>)}
            </select>
          </label>
        ))}
      </div>
      <p className="note small gx-pad">On a 16 GB Mac, models up to about 8 billion parameters (roughly 5 GB) run smoothly; 14B is slow, and the 24–27B ones need about 32 GB. Local models can be wrong: everything they write is marked as model output, and the desk never acts on it.</p>
    </section>
  );
}

const SYS = 'You summarize financial news for a day trader. Use only the text given. 3 short bullet points, plain words, then one line "What to verify:" naming the number or source to check. If the text has no data, say so. Never give buy/sell advice.';
export function AskLocal({ title, text, src }: { title: string; text: string; src: string }) {
  const cfg = useAiCfg();
  const [out, setOut] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const ab = useRef<AbortController | null>(null);
  useEffect(() => () => ab.current?.abort(), []);
  if (!cfg.models.news) return <p className="small muted">Local AI: pick a model on the AI page to summarize here (free, on your Mac).</p>;
  const go = () => { ab.current?.abort(); ab.current = new AbortController(); setBusy(true); setErr(''); setOut('');
    askLocal('news', SYS, `Source: ${src}\nHeadline: ${title}\nText: ${text || '(no text, headline only)'}`, setOut, ab.current.signal).catch((e) => setErr(String(e.message ?? e))).finally(() => setBusy(false)); };
  return (
    <div className="lai-ask">
      <button className="btn" onClick={go} disabled={busy}>{busy ? 'Thinking…' : `🤖 Summarize with ${cfg.models.news}`}</button>
      {err && <p className="small down">{err}</p>}
      {out && <div className="lai-out"><Q k="model" src={`local model ${cfg.models.news} via Ollama (can be wrong)`} /><pre>{out}</pre></div>}
    </div>
  );
}
