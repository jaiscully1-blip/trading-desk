// Sector rotation page: who is beating the S&P 500, who is lagging, which way each is turning, and how much risk
// the market is willing to take. Built from daily closes; "money moving in" is read from relative performance.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { FlowsState } from '../data/world';
import { GROUP_LABEL, WINDOWS, type Quadrant, type RotGroup, type RotRow } from '../../shared/rotation';
import { COMPANIES } from '../../shared/data/companies';
import { usePersisted } from '../lib/store';
import { useDesk } from '../lib/deskctx';
import { Fresh } from './common';

const QLABEL: Record<Quadrant, string> = { leading: 'Leading', weakening: 'Weakening', lagging: 'Lagging', improving: 'Improving' };
const QHELP: Record<Quadrant, string> = { leading: 'beating SPY and still gaining', weakening: 'beating SPY but losing steam', lagging: 'behind SPY and still slipping', improving: 'behind SPY but turning up' };
const sp = (v: number | null | undefined, dp = 1) => (v == null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(dp)}`);
const cell = (v: number | null) => {
  if (v == null) return {};
  const a = Math.min(1, Math.abs(v) / 6) * 0.55 + 0.06;
  return { background: `color-mix(in srgb, var(${v >= 0 ? '--up' : '--down'}) ${Math.round(a * 100)}%, transparent)` };
};

function RiskCard({ risk }: { risk: FlowsState['risk'] }) {
  if (!risk) return null;
  const state = risk.score >= 65 ? 'Risk-on' : risk.score <= 35 ? 'Risk-off' : 'Neutral';
  const W = 300, H = 56, lo = Math.min(0, ...risk.line.map((p) => p.v)), hi = Math.max(0, ...risk.line.map((p) => p.v));
  const x = (i: number) => (i / Math.max(1, risk.line.length - 1)) * W, y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * H;
  return (
    <section className="rot-risk">
      <div className="rot-risk-n">
        <span className="rot-k">Risk appetite</span>
        <b className={risk.score >= 65 ? 'up' : risk.score <= 35 ? 'down' : ''}>{state}</b>
        <span className="rot-bar" title="0 = most defensive of the past year, 100 = most risk-on"><i style={{ left: `${risk.score}%` }} /></span>
        <span className="small muted">{risk.score}/100 · {risk.rising ? 'rising' : 'falling'} this week · offense {sp(risk.spread20)} pts vs defense over 20 days</span>
      </div>
      <div className="rot-line-w"><span className="small muted">Offense minus defense, last 3 months</span>
      <svg viewBox={`0 0 ${W} ${H}`} className="rot-line" role="img" aria-label="Offense minus defense, last 3 months">
        <line x1={0} x2={W} y1={y(0)} y2={y(0)} className="mc-zero" />
        <path d={`M${risk.line.map((p, i) => `${x(i)},${y(p.v)}`).join(' L')}`} className="mc-mid" />
      </svg></div>
      <p className="note">Offense: {risk.offense.join(', ')}. Defense: {risk.defense.join(', ')}. The score ranks today’s 20-day gap between them against the past year (100 = most risk-on).</p>
    </section>
  );
}

function RotMap({ rows, sel, onSel }: { rows: RotRow[]; sel: string | null; onSel: (s: string) => void }) {
  const pts = rows.filter((r) => r.x != null && r.y != null);
  // scale to where the tickers are now; older tail points that fall outside are clipped at the edge
  const span = Math.max(1.5, ...pts.map((r) => Math.abs(r.x! - 100)), ...pts.map((r) => Math.abs(r.y! - 100))) * 1.25;
  const W = 520, H = 420, sx = (v: number) => W / 2 + ((v - 100) / span) * (W / 2 - 10), sy = (v: number) => H / 2 - ((v - 100) / span) * (H / 2 - 10);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="rot-map" role="img" aria-label="Rotation map">
      <defs><clipPath id="rotclip"><rect x={0} y={0} width={W} height={H} /></clipPath></defs>
      <rect x={W / 2} y={0} width={W / 2} height={H / 2} className="q-lead" /><rect x={W / 2} y={H / 2} width={W / 2} height={H / 2} className="q-weak" />
      <rect x={0} y={H / 2} width={W / 2} height={H / 2} className="q-lag" /><rect x={0} y={0} width={W / 2} height={H / 2} className="q-imp" />
      <line x1={W / 2} x2={W / 2} y1={0} y2={H} className="q-axis" /><line x1={0} x2={W} y1={H / 2} y2={H / 2} className="q-axis" />
      <text x={W - 8} y={16} className="q-l lead" textAnchor="end">LEADING</text><text x={W - 8} y={H - 8} className="q-l weak" textAnchor="end">WEAKENING</text>
      <text x={8} y={H - 8} className="q-l lag">LAGGING</text><text x={8} y={16} className="q-l imp">IMPROVING</text>
      <g clipPath="url(#rotclip)">{pts.filter((r) => r.sym === sel).map((r) => r.tail.length > 0 && <path key={`t${r.sym}`} className={`rot-tail ${r.quadrant} ${sel && sel !== r.sym ? 'dim' : ''}`} d={`M${[...r.tail, { x: r.x!, y: r.y! }].map((p) => `${sx(p.x)},${sy(p.y)}`).join(' L')}`} />)}</g>
      {pts.map((r) => (
        <g key={r.sym} className={`rot-pt ${r.quadrant} ${sel === r.sym ? 'sel' : ''} ${sel && sel !== r.sym ? 'dim' : ''}`} onClick={() => onSel(r.sym)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onSel(r.sym); }}>
          <circle cx={sx(r.x!)} cy={sy(r.y!)} r={sel === r.sym ? 7 : 5} />
          <text x={sx(r.x!) + 8} y={sy(r.y!) + 4}>{r.sym}</text>
          <title>{`${r.sym} · ${r.label}: ${QLABEL[r.quadrant!]} (${QHELP[r.quadrant!]})`}</title>
        </g>
      ))}
      <text x={W / 2 + 4} y={H - 22} className="mc-lab">← behind SPY · ahead of SPY →</text>
      {!sel && <text x={W / 2 + 4} y={H - 36} className="mc-lab">click a dot for its 5-week trail</text>}
    </svg>
  );
}

function Drill({ row, onChart }: { row: RotRow; onChart: (s: string) => void }) {
  const { openInfo } = useDesk();
  const members = useMemo(() => (row.gics ? COMPANIES.filter((c) => c[2] === row.gics).map((c) => ({ sym: c[0], name: c[1] })) : []), [row.gics]);
  const [q, setQ] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(0);
  useEffect(() => {
    setQ({}); setLoaded(0);
    if (!members.length) return;
    let stop = false;
    (async () => {
      // 40 at a time (the quote endpoint's limit), spaced so Finnhub's free 60/minute isn't exceeded
      for (let i = 0; i < members.length && !stop; i += 40) {
        if (i) await new Promise((r) => setTimeout(r, 45_000));
        try {
          const r = await fetch(`/api/quotes?symbols=${members.slice(i, i + 40).map((m) => m.sym).join(',')}`);
          const j = await r.json();
          if (!stop && Array.isArray(j.quotes)) setQ((x) => ({ ...x, ...Object.fromEntries(j.quotes.filter((z: { chgPct: number }) => Number.isFinite(z.chgPct)).map((z: { symbol: string; chgPct: number }) => [z.symbol, z.chgPct])) }));
        } catch { /* skip */ }
        if (!stop) setLoaded(Math.min(members.length, i + 40));
      }
    })();
    return () => { stop = true; };
  }, [members]);
  const ranked = members.filter((m) => q[m.sym] != null).sort((a, b) => q[b.sym] - q[a.sym]);
  const Row = ({ m }: { m: { sym: string; name: string } }) => (
    <button className="rot-mv" onClick={() => onChart(m.sym)} onContextMenu={(e) => { e.preventDefault(); openInfo(m.sym, { x: e.clientX, y: e.clientY }); }} title={`${m.name}: open chart (right-click: what is it?)`}>
      <b>{m.sym}</b><span className="muted">{m.name}</span><span className={`num ${q[m.sym] >= 0 ? 'up' : 'down'}`}>{sp(q[m.sym], 2)}%</span>
    </button>
  );
  return (
    <section className="rot-drill">
      <div className="rot-drill-h">
        <b>{row.sym}</b><span>{row.label}</span>
        {row.quadrant && <span className={`tag q-${row.quadrant}`}>{QLABEL[row.quadrant]}: {QHELP[row.quadrant]}</span>}
        <button className="btn sm" onClick={() => onChart(row.sym)}>Chart {row.sym}</button>
        <button className="btn sm" onClick={(e) => openInfo(row.sym, { x: e.clientX, y: e.clientY })}>What is it?</button>
      </div>
      {members.length > 0 ? (
        <>
          <div className="small muted">Today’s biggest moves among its {members.length} S&P 500 members{loaded < members.length ? ` (loaded ${loaded}/${members.length}…)` : ''}</div>
          {ranked.length > 0 && <div className="rot-mvs"><div><h5>Up most</h5>{ranked.slice(0, 6).map((m) => <Row key={m.sym} m={m} />)}</div><div><h5>Down most</h5>{ranked.slice(-6).reverse().map((m) => <Row key={m.sym} m={m} />)}</div></div>}
        </>
      ) : <p className="small muted">Not an S&P sector, so there’s no member list here. Open its chart for the detail.</p>}
    </section>
  );
}

export default function Rotation({ data, onSelect, extra }: { data: FlowsState | null; onSelect: (s: string) => void; extra?: ReactNode }) {
  const [groups, setGroups] = usePersisted<RotGroup[]>('rotGroups', ['sector']);
  const [sortW, setSortW] = usePersisted<number>('rotSort', 20);
  const [sel, setSel] = useState<string | null>(null);
  const shown = (data?.rows ?? []).filter((r) => groups.includes(r.group));
  const sorted = [...shown].sort((a, b) => (b.rel[sortW] ?? -1e9) - (a.rel[sortW] ?? -1e9));
  const selRow = sorted.find((r) => r.sym === sel) ?? null;
  const toggle = (g: RotGroup) => setGroups((xs) => (xs.includes(g) ? (xs.length > 1 ? xs.filter((x) => x !== g) : xs) : [...xs, g]));
  const counts = (['leading', 'improving', 'weakening', 'lagging'] as Quadrant[]).map((qq) => [qq, shown.filter((r) => r.quadrant === qq).map((r) => r.sym)] as const);
  return (
    <div className="overlay" role="dialog" aria-label="Sector rotation">
      <div className="overlay-in rot">
        <div className="phead">
          <div className="phead-title">Sector rotation&nbsp;<span className="muted small">vs the S&P 500{data?.asOfDay ? ` · ${data.asOfDay} close` : ''}</span></div>
          <div className="phead-ctl">
            {extra}
            {data && <Fresh kind={data.freshness} at={data.asOf} src={`Daily closes: ${data.sources.join(', ')}`} />}
          </div>
        </div>
        {!data && <p className="hw-pad muted">Loading…</p>}
        {data && (
          <div className="rot-body">
            <RiskCard risk={data.risk} />
            <div className="rot-groups">{(Object.keys(GROUP_LABEL) as RotGroup[]).map((g) => <button key={g} className={`chip sm ${groups.includes(g) ? 'on' : ''}`} onClick={() => toggle(g)}>{GROUP_LABEL[g]}</button>)}</div>
            <div className="rot-grid">
              <section className="rot-left">
                <RotMap rows={shown} sel={sel} onSel={(s) => setSel((x) => (x === s ? null : s))} />
                <div className="rot-qs">{counts.map(([qq, syms]) => <div key={qq} className={`rot-q q-${qq}`}><b>{QLABEL[qq]}</b> <span className="muted small">{QHELP[qq]}</span><div className="small">{syms.join(' · ') || '—'}</div></div>)}</div>
              </section>
              <section className="rot-right">
                <table className="rot-tbl">
                  <thead><tr><th>Ticker</th>{WINDOWS.map((w) => <th key={w} className={`num ${sortW === w ? 'on' : ''}`} onClick={() => setSortW(w)} title={`Sort by ${w}-day performance vs SPY`}>{w}D</th>)}<th className="num" title="Today's volume vs its 20-day average">Vol</th></tr></thead>
                  <tbody>
                    {sorted.map((r) => (
                      <tr key={r.sym} className={sel === r.sym ? 'sel' : ''} onClick={() => setSel((x) => (x === r.sym ? null : r.sym))}>
                        <td><b>{r.sym}</b> <span className="muted small">{r.label}</span></td>
                        {WINDOWS.map((w) => <td key={w} className="num" style={cell(r.rel[w])} title={`${r.sym} ${sp(r.ret[w], 2)}% over ${w} day(s); SPY ${sp((r.ret[w] ?? 0) - (r.rel[w] ?? 0), 2)}%`}>{sp(r.rel[w])}</td>)}
                        <td className={`num ${r.vol != null && r.vol >= 1.5 ? 'warn-txt' : 'muted'}`}>{r.vol != null ? `${r.vol.toFixed(1)}x` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="note">Cells = % points ahead of (green) or behind (red) SPY over that many trading days. Click a column to sort, a row for detail.</p>
                {selRow && <Drill row={selRow} onChart={onSelect} />}
              </section>
            </div>
            {data.pending.length > 0 && <p className="small warn-txt hw-pad">Couldn’t load {data.pending.join(', ')} this time; they’ll appear on the next refresh.</p>}
            <p className="note hw-pad">Rotation map: across = each ticker’s strength vs SPY compared with its own 50-day average (right of center = gaining on SPY); up = whether that strength is speeding up over the last 10 days. Click a dot to see its trail over the last 5 weeks. Built from daily closes; it reads money “moving in” from relative performance, not from actual fund-flow data.</p>
          </div>
        )}
      </div>
    </div>
  );
}
