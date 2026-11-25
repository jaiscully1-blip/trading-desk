// AI page: every AI model or bot the desk uses or can reach, in one place. Local models on this Mac (Ollama and other local apps),
// server-side bots (Claude, Discord) and the Kronos forecast model. Status only; the desk never trades on model output.
import { useEffect, useState } from 'react';
import { LocalAISettings } from './LocalAI';
import { OTHER_LOCAL, ollamaLive, probeOpenAi, useAiCfg, type OllamaLive } from '../lib/localai';
import { useApi } from '../data/apis';
import type { DataMode } from '../data/live';
import type { KronosFile } from '../../shared/kronos';
import { Fresh } from './common';

const gb = (n: number) => `${(n / 1e9).toFixed(1)} GB`;
const day = (s: string) => (s ? new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const Pill = ({ ok, text }: { ok: boolean | null; text: string }) => <span className={`ds-pill ${ok == null ? 'idle' : ok ? 'ok' : 'error'}`}><i />{text}</span>;

function Local() {
  const cfg = useAiCfg();
  const [o, setO] = useState<OllamaLive | { error: string } | null>(null);
  const [others, setOthers] = useState<Record<string, { models: string[] } | { error: string }>>({});
  const [n, setN] = useState(0);
  useEffect(() => {
    setO(null); setOthers({});
    ollamaLive(cfg.url).then(setO);
    OTHER_LOCAL.forEach((s) => probeOpenAi(s.url).then((r) => setOthers((p) => ({ ...p, [s.id]: r }))));
  }, [cfg.url, n]);
  const ok = o && 'models' in o ? o : null;
  return (
    <section className="panel">
      <div className="gx-h"><b>On this Mac</b><span className="small muted">free, private, nothing leaves your computer</span><Fresh kind="live" src="Ollama and other local apps on this Mac, checked just now" /><button className="btn" onClick={() => setN(n + 1)}>Refresh</button></div>
      <div className="ai-grid gx-pad">
        <div className="ai-card">
          <h4>Ollama {o == null ? <Pill ok={null} text="Checking…" /> : <Pill ok={!!ok} text={ok ? `Running${ok.version ? ` v${ok.version}` : ''}` : 'Not reachable'} />}</h4>
          {o && 'error' in o && <p className="small down">{o.error}</p>}
          {ok && (
            <>
              <p className="small muted">{ok.models.length} installed · {ok.running.length ? `${ok.running.length} loaded in memory now` : 'none loaded in memory (loads when first used, unloads after about 5 minutes idle)'}</p>
              <div className="ai-t">
                <div className="ai-r ai-h"><span>Model</span><span>Size</span><span>Parameters</span><span>Quantization</span><span>Installed</span><span>Now</span></div>
                {ok.models.map((m) => {
                  const run = ok.running.find((r) => r.name === m.name);
                  return (
                    <div key={m.name} className="ai-r"><span><b>{m.name}</b>{m.family && <span className="small muted"> {m.family}</span>}</span><span className="num">{gb(m.size)}</span><span className="num">{m.params}</span><span className="num">{m.quant}</span><span className="small muted">{day(m.modified)}</span>
                      <span>{run ? <span className="ds-pill ok"><i />Loaded{run.size ? ` · ${gb(run.size)}${run.vram >= run.size ? ' on GPU' : ''}` : ''}</span> : <span className="small muted">idle</span>}</span></div>
                  );
                })}
              </div>
            </>
          )}
        </div>
        <div className="ai-card">
          <h4>Other local apps</h4>
          <p className="small muted">Checked on their usual ports. If one is running but shows "not running", turn on its local server and allow browser access (CORS).</p>
          <div className="ai-t">
            {OTHER_LOCAL.map((s) => {
              const r = others[s.id];
              const up = r && 'models' in r ? r : null;
              return (
                <div key={s.id} className="ai-r ai-o"><span><b>{s.label}</b> <span className="small muted">{s.url.replace('http://', '')}</span></span>
                  <span>{r == null ? <Pill ok={null} text="Checking…" /> : <Pill ok={!!up} text={up ? `Running · ${up.models.length} model${up.models.length === 1 ? '' : 's'}` : 'Not running'} />}</span>
                  <span className="small muted">{up ? up.models.slice(0, 4).join(', ') + (up.models.length > 4 ? ` +${up.models.length - 4}` : '') : s.tip}</span></div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function Bots({ mode }: { mode: DataMode }) {
  const live = mode.kind === 'live';
  const priv = live ? mode.health.private : undefined;
  const k = useApi<{ file?: KronosFile; error?: string }>(live ? '/api/research?fn=kronos' : null, 30 * 60_000, 15 * 60_000);
  const f = k.data?.file;
  const rows: { name: string; what: string; ok: boolean | null; state: string; note: string }[] = [
    { name: 'Claude (Anthropic API)', what: 'Desk research and write-ups; the only paid piece, billed per token', ok: live ? !!priv?.claude : null, state: !live ? 'Desk offline' : priv?.claude ? 'Key set on the server' : 'No key set', note: 'The key lives only on the server (Vercel), never in the browser. Spend is yours to watch in the Anthropic console.' },
    { name: 'Kronos (forecast model)', what: 'Open-source candlestick model: 5-day forecast range for a few tickers (MODEL FORECAST, not advice)', ok: live ? !!f : null, state: !live ? 'Desk offline' : f ? `Last run ${day(f.generatedAt)}` : k.data?.error === 'not-run-yet' ? 'Not run yet' : k.loading ? 'Checking…' : 'No forecast file', note: f ? `${f.model.name} · ${f.forecasts.length} tickers · ${f.samples} samples per forecast. Runs after each weekday close on GitHub.` : 'Runs on GitHub Actions after each weekday close.' },
    { name: 'Discord bot', what: 'Reads your Discord channels into the desk (read only)', ok: live ? !!priv?.discord : null, state: !live ? 'Desk offline' : priv?.discord ? 'Token set on the server' : 'Not set up', note: 'Information only: it does not trade.' },
  ];
  return (
    <section className="panel">
      <div className="gx-h"><b>Bots and hosted models</b><span className="small muted">run on servers, not your Mac</span><Fresh kind={live ? 'live' : 'delayed'} src="desk server health check and Kronos file" /></div>
      <div className="ai-t gx-pad">
        <div className="ai-r ai-b ai-h"><span>Bot</span><span>Status</span><span>What it does</span></div>
        {rows.map((r) => (
          <div key={r.name} className="ai-r ai-b"><span><b>{r.name}</b></span><span><Pill ok={r.ok} text={r.state} /></span><span className="small">{r.what}<br /><span className="muted">{r.note}</span></span></div>
        ))}
      </div>
      <p className="note small gx-pad">Rule: no AI model or bot places trades on this desk. Only you can send an order, through the ticket with its preview and PIN. Everything a model writes is labeled as model output and can be wrong.</p>
    </section>
  );
}

export default function AiPage({ mode }: { mode: DataMode }) {
  return (
    <div className="ai-page">
      <Local />
      <LocalAISettings />
      <Bots mode={mode} />
    </div>
  );
}
