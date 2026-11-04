import { useState, type ReactNode } from 'react';
import type { Board, Headline, JournalDraft, Quote, RightTab } from '../types';
import { DEMO_ACCOUNT, DEMO_AT } from '../lib/demo';
import { etTime } from '../lib/clock';
import { px, usd } from '../lib/format';
import { usePersisted } from '../lib/store';
import { Fresh, PanelHead } from './common';

export type NewsFilter = 'all' | 'watchlist' | 'macro';
const TABS: { id: RightTab; label: string; key: string }[] = [
  { id: 'news', label: 'News', key: 'N' },
  { id: 'scanner', label: 'Scanner', key: 'S' },
  { id: 'journal', label: 'Quick Journal', key: 'Q' },
  { id: 'risk', label: 'Risk', key: 'R' },
];

export function RightRail(props: {
  tab: RightTab;
  onTab: (t: RightTab) => void;
  quotes: Record<string, Quote>;
  boards: Record<string, Board>;
  headlines: Headline[];
  sel: string;
  onSelect: (s: string) => void;
  addSym: (s: string) => void;
  newsFilter: NewsFilter;
  setNewsFilter: (f: NewsFilter) => void;
  scanner: ReactNode;
  onPopout?: () => void;
}) {
  const { tab, onTab } = props;
  return (
    <section className="panel rr">
      <PanelHead
        title={
          <div className="tabs" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => onTab(t.id)} title={`${t.label} (${t.key})`}>
                {t.label}
              </button>
            ))}
          </div>
        }
        onPopout={props.onPopout}
      />
      <div className="rr-body">
        {tab === 'news' && <NewsTab {...props} />}
        {tab === 'scanner' && props.scanner}
        {tab === 'journal' && <QuickJournal sym={props.sel} quotes={props.quotes} />}
        {tab === 'risk' && <RiskTab q={props.quotes[props.sel]} />}
      </div>
    </section>
  );
}

function Chips<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o.id} className={`chip ${value === o.id ? 'on' : ''}`} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NewsTab({ headlines, boards, newsFilter, setNewsFilter, onSelect }: Parameters<typeof RightRail>[0]) {
  const list = headlines.filter((h) =>
    newsFilter === 'all' ? true : newsFilter === 'macro' ? h.macro : h.syms.some((s) => boards[s]),
  );
  return (
    <>
      <div className="rr-tools">
        <Chips<NewsFilter> value={newsFilter} onChange={setNewsFilter} options={[{ id: 'all', label: 'All' }, { id: 'watchlist', label: 'My watchlist' }, { id: 'macro', label: 'Macro' }]} />
        <Fresh kind="demo" at={DEMO_AT} src="Sample headlines (Milestone 5 wires Finnhub, GDELT and RSS)" />
      </div>
      <ul className="news">
        {list.map((h) => (
          <li key={h.id}>
            <span className="num muted">{etTime(h.t)}</span>
            <span className="news-t">{h.title}</span>
            <span className="news-m">
              {h.syms.map((s) => (
                <button key={s} className="sym-chip" onClick={() => onSelect(s)}>{s}</button>
              ))}
              {h.macro && <span className="tag">Macro</span>}
              <span className="muted small">{h.src}</span>
            </span>
          </li>
        ))}
        {!list.length && <li className="muted">No headlines for this filter.</li>}
      </ul>
    </>
  );
}

export function QuickJournal({ sym, quotes }: { sym: string; quotes: Record<string, Quote> }) {
  const [drafts, setDrafts] = usePersisted<JournalDraft[]>('journalDrafts', []);
  const blank = () => ({ sym, side: 'long' as const, entry: '', stop: '', target: '', size: '', setup: '', thesis: '' });
  const [f, setF] = useState<ReturnType<typeof blank>>(blank);
  const entry = +f.entry, stop = +f.stop, target = +f.target, size = +f.size;
  const riskPer = entry && stop ? Math.abs(entry - stop) : 0;
  const rTarget = riskPer && target ? Math.abs(target - entry) / riskPer : 0;
  const wrongSide = entry && stop && (f.side === 'long' ? stop >= entry : stop <= entry);
  const valid = f.sym && entry > 0 && stop > 0 && size > 0 && !wrongSide;
  const set = (k: keyof ReturnType<typeof blank>) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: k === 'sym' ? e.target.value.toUpperCase() : e.target.value }));

  return (
    <div className="qj">
      <div className="rr-tools">
        <span className="muted small">Drafts only. The pre-trade checklist gate and full log land in Milestone 4.</span>
      </div>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          setDrafts((d) => [{ id: crypto.randomUUID(), created: Date.now(), sym: f.sym, side: f.side, entry, stop, target, size, setup: f.setup, thesis: f.thesis }, ...d].slice(0, 200));
          setF(blank());
        }}
      >
        <label>Ticker<input value={f.sym} onChange={set('sym')} placeholder={sym} /></label>
        <label>Side
          <select value={f.side} onChange={set('side')}><option value="long">Long</option><option value="short">Short</option></select>
        </label>
        <label>Entry<input inputMode="decimal" value={f.entry} onChange={set('entry')} placeholder={quotes[f.sym] ? px(quotes[f.sym].last) : ''} /></label>
        <label>Stop<input inputMode="decimal" value={f.stop} onChange={set('stop')} /></label>
        <label>Target<input inputMode="decimal" value={f.target} onChange={set('target')} /></label>
        <label>Size (sh)<input inputMode="numeric" value={f.size} onChange={set('size')} /></label>
        <label className="span2">Setup tag<input value={f.setup} onChange={set('setup')} placeholder="e.g. ORB, bull flag, gap-and-go" /></label>
        <label className="span2">Thesis<textarea rows={2} value={f.thesis} onChange={set('thesis')} /></label>
        <div className="span2 qj-calc">
          <span>Risk <b className="num">{riskPer && size ? usd(riskPer * size) : '—'}</b></span>
          <span>Target <b className="num">{rTarget ? `${rTarget.toFixed(2)}R` : '—'}</b></span>
          {wrongSide ? <span className="down small">Stop is on the wrong side of entry</span> : null}
          <button className="btn primary" disabled={!valid}>Save draft</button>
        </div>
      </form>
      {drafts.length > 0 && (
        <ul className="drafts">
          {drafts.slice(0, 6).map((d) => (
            <li key={d.id}>
              <span className="num muted">{etTime(d.created)}</span>
              <b>{d.sym}</b>
              <span className={d.side === 'long' ? 'up' : 'down'}>{d.side}</span>
              <span className="num">{px(d.entry)} / {px(d.stop)}</span>
              <span className="num">{d.size}sh</span>
              <button className="wl-x" onClick={() => setDrafts((x) => x.filter((y) => y.id !== d.id))} aria-label="Delete draft">×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RiskTab({ q }: { q?: Quote }) {
  const a = DEMO_ACCOUNT;
  const [riskPct, setRiskPct] = usePersisted('riskPct', '0.5');
  const [entry, setEntry] = useState('');
  const [stop, setStop] = useState('');
  const e = +entry || q?.last || 0;
  const s = +stop;
  const per = e && s ? Math.abs(e - s) : 0;
  const dollars = (a.equity * (+riskPct || 0)) / 100;
  const shares = per ? Math.floor(dollars / per) : 0;
  const notional = shares * e;
  const usedOfMax = (a.riskUsedPct / a.maxDailyLossPct) * 100;
  return (
    <div className="risk">
      <h4>Position size</h4>
      <div className="form">
        <label>Account <input value={usd(a.equity)} readOnly title="Demo equity until the journal drives it (M4)" /></label>
        <label>Risk %<input inputMode="decimal" value={riskPct} onChange={(x) => setRiskPct(x.target.value)} /></label>
        <label>Entry<input inputMode="decimal" value={entry} onChange={(x) => setEntry(x.target.value)} placeholder={q ? px(q.last) : ''} /></label>
        <label>Stop<input inputMode="decimal" value={stop} onChange={(x) => setStop(x.target.value)} /></label>
      </div>
      <div className="kv">
        <span>Risk $</span><b className="num">{usd(dollars)}</b>
        <span>Shares</span><b className="num">{shares || '—'}</b>
        <span>Position</span><b className="num">{notional ? usd(notional) : '—'}</b>
        <span>% of equity</span><b className="num">{notional ? `${((notional / a.equity) * 100).toFixed(1)}%` : '—'}</b>
      </div>
      <h4>Guardrails <Fresh kind="demo" /></h4>
      <div className="meter" title="Daily loss used vs. max">
        <div className="meter-fill" style={{ width: `${Math.min(100, usedOfMax)}%` }} />
      </div>
      <div className="kv">
        <span>Daily loss used</span><b className="num">{a.riskUsedPct.toFixed(1)}% of {a.maxDailyLossPct}%</b>
        <span>Loss streak</span><b className="num">0</b>
        <span>Cooldown</span><b>Not active</b>
        <span>Lockout</span><b className={a.lockout === 'Clear' ? 'up' : 'down'}>{a.lockout}</b>
      </div>
      <p className="note">The calculator above is live math. Lockout, cooldown, heat meter and the violation log are enforced from the journal in Milestone 4.</p>
    </div>
  );
}
