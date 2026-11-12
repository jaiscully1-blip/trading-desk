// Company page: what they do, main products, and a clickable supply chain (suppliers -> company -> customers, competitors below).
// Click any company with a ticker to re-center the diagram on it. Facts come from the latest 10-K, read by free Gemini.
import { TearSheet } from './TearSheet';
import { QuantPanel } from './QuantRead';
import { Fragment, useState, type ReactNode } from 'react';
import type { ChainLink } from '../../shared/company';
import { useCompany } from '../data/company';
import type { DataMode } from '../data/live';
import { useDesk } from '../lib/deskctx';
import { Star, Q } from './common';
import { offlineInfo } from '../data/info';
import { CompanySearch } from './CompanySearch';

const W = 960, H = 600, CX = W / 2, CY = 270, NW = 200, NH = 42, CW = 168;
const cut = (s: string, n = 24) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const money = (v?: number) => (v == null ? '—' : v >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`);

type Side = 'sup' | 'cus' | 'comp';
interface Node { key: string; side: Side; link: ChainLink; x: number; y: number }

function layout(sup: ChainLink[], cus: ChainLink[], comp: ChainLink[]): Node[] {
  const col = (xs: ChainLink[], side: Side, x: number): Node[] => {
    const n = Math.min(xs.length, 7), top = CY - ((n - 1) * 56) / 2;
    return xs.slice(0, 7).map((l, i) => ({ key: `${side}:${l.name}`, side, link: l, x, y: top + i * 56 }));
  };
  const row = comp.slice(0, 4), gap = W / (row.length + 1);
  return [...col(sup, 'sup', 120), ...col(cus, 'cus', W - 120), ...row.map((l, i) => ({ key: `comp:${l.name}`, side: 'comp' as Side, link: l, x: gap * (i + 1), y: H - 50 }))];
}

function Diagram({ sym, name, sup, cus, comp, onOpen, empty }: { sym: string; name: string; sup: ChainLink[]; cus: ChainLink[]; comp: ChainLink[]; onOpen: (s: string) => void; empty: string }) {
  const [hov, setHov] = useState<string | null>(null);
  const nodes = layout(sup, cus, comp);
  const edge = (n: Node) => {
    if (n.side === 'comp') return `M${n.x},${n.y - NH / 2} C${n.x},${CY + 90} ${CX},${CY + 90} ${CX},${CY + NH / 2 + 4}`;
    const x0 = n.side === 'sup' ? n.x + NW / 2 : CX + 110, x1 = n.side === 'sup' ? CX - 110 : n.x - NW / 2;
    const y0 = n.side === 'sup' ? n.y : CY, y1 = n.side === 'sup' ? CY : n.y;
    return `M${x0},${y0} C${(x0 + x1) / 2},${y0} ${(x0 + x1) / 2},${y1} ${x1},${y1}`;
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="sc-svg" role="img" aria-label={`Supply chain for ${name}`}>
      <defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className="sc-arrow" /></marker></defs>
      <text x={120} y={24} className="sc-col">SUPPLIERS → </text>
      <text x={W - 120} y={24} className="sc-col">→ CUSTOMERS</text>
      {comp.length > 0 && <text x={CX} y={H - 92} className="sc-col">COMPETITORS</text>}
      {nodes.map((n) => <path key={`e:${n.key}`} d={edge(n)} className={`sc-edge ${n.side} ${hov === n.key ? 'hot' : ''}`} markerEnd={n.side === 'comp' ? undefined : 'url(#arr)'} />)}
      {nodes.map((n) => {
        const label = n.side === 'comp' ? '' : (n.link.share || n.link.what || '');
        // label sits just outside the box, on its own row, so labels never stack on each other
        const ex = n.side === 'sup' ? n.x + NW / 2 + 8 : n.x - NW / 2 - 8;
        return label ? <text key={`l:${n.key}`} x={ex} y={n.y - 6} textAnchor={n.side === 'sup' ? 'start' : 'end'} className={`sc-elabel ${hov === n.key ? 'hot' : ''}`}>{cut(label, 22)}</text> : null;
      })}
      <g className="sc-center"><rect x={CX - 110} y={CY - 30} width={220} height={60} rx={8} /><text x={CX} y={CY - 4} className="sc-c1">{sym}</text><text x={CX} y={CY + 16} className="sc-c2">{cut(name, 28)}</text></g>
      {nodes.map((n) => {
        const go = n.link.sym ? () => onOpen(n.link.sym!) : undefined;
        return (
          <g key={n.key} className={`sc-node ${n.side} ${go ? 'link' : 'nolink'} ${hov === n.key ? 'hot' : ''}`} onMouseEnter={() => setHov(n.key)} onMouseLeave={() => setHov(null)}
            onClick={go} role={go ? 'button' : undefined} tabIndex={go ? 0 : undefined} onKeyDown={(e) => { if (go && (e.key === 'Enter' || e.key === ' ')) go(); }}>
            <title>{`${n.link.name}${n.link.category ? ' (a kind of buyer or supplier named in the report, not a company)' : n.link.sym ? ` (${n.link.sym})` : ' (not US-listed or not matched to a ticker)'}${n.link.what ? ` · ${n.link.what}` : ''}${n.link.share ? ` · ${n.link.share}` : ''}`}</title>
            <rect x={n.x - (n.side === 'comp' ? CW : NW) / 2} y={n.y - NH / 2} width={n.side === 'comp' ? CW : NW} height={NH} rx={6} />
            <text x={n.x} y={n.y - 3} className="sc-n1">{cut(n.link.name, n.side === 'comp' ? 20 : 24)}</text>
            <text x={n.x} y={n.y + 13} className="sc-n2">{n.link.category ? 'in the report\u2019s words' : n.link.sym ?? 'private / unlisted'}</text>
          </g>
        );
      })}
      {!sup.length && !cus.length && <text x={CX} y={CY + 70} className="sc-empty">{empty}</text>}
    </svg>
  );
}

function Links({ title, xs, onOpen }: { title: string; xs: ChainLink[]; onOpen: (s: string) => void }) {
  if (!xs.length) return null;
  return (
    <div className="co-links"><h4>{title}</h4>
      <ul>{xs.map((x) => <li key={x.name}>{x.sym ? <button className="link" onClick={() => onOpen(x.sym!)}>{x.name} <span className="num muted">{x.sym}</span></button> : <span>{x.name}</span>}{x.share && <span className="tag">{x.share}</span>}{x.what && <span className="muted small"> · {x.what}</span>}</li>)}</ul>
    </div>
  );
}

function Peers({ named, peers, onOpen }: { named: ChainLink[]; peers: ChainLink[]; onOpen: (s: string) => void }) {
  const { openInfo } = useDesk();
  const card = (c: ChainLink, kind: 'named' | 'peer') => {
    const o = c.sym ? offlineInfo(c.sym) : null;
    return (
      <div key={`${kind}:${c.sym ?? c.name}`} className={`peer ${c.sym ? 'link' : 'nolink'}`} onClick={() => c.sym && onOpen(c.sym)} role={c.sym ? 'button' : undefined} tabIndex={c.sym ? 0 : undefined}
        onKeyDown={(e) => { if (c.sym && (e.key === 'Enter' || e.key === ' ')) onOpen(c.sym); }} title={c.sym ? `Re-center on ${c.name}` : 'Not US-listed or not matched to a ticker'}>
        <div className="peer-h"><b className="peer-sym">{c.sym ?? '—'}</b>{c.sym && <button className="peer-i" onClick={(e) => { e.stopPropagation(); openInfo(c.sym!, { x: e.clientX, y: e.clientY }); }} aria-label={`What is ${c.name}?`} title="What is it?">i</button>}</div>
        <div className="peer-n">{c.name}</div>
        <div className="peer-s">{o?.industry ?? (c.what && c.what !== 'same-industry peer' ? c.what : kind === 'named' ? 'named in the 10-K' : 'same industry')}</div>
      </div>
    );
  };
  if (!named.length && !peers.length) return null;
  return (
    <div className="peers">
      {named.length > 0 && <><h4>Competitors <span className="muted small">· named in the company’s own 10-K</span></h4><div className="peer-grid">{named.map((c) => card(c, 'named'))}</div></>}
      {peers.length > 0 && <><h4>Peers <span className="muted small">· same industry (Finnhub)</span></h4><div className="peer-grid">{peers.map((c) => card(c, 'peer'))}</div></>}
    </div>
  );
}

export default function CompanyPage({ sym, mode, onOpen, onChart, onPatterns }: { sym: string; mode: DataMode; onOpen: (s: string) => void; onChart: (s: string) => void; onPatterns: (s: string) => void }) {
  const { names } = useDesk();
  const [trail, setTrail] = useState<string[]>([]);
  const { data, loading, error, reading, retry } = useCompany(sym, names[sym] ?? sym, mode);
  const go = (s: string) => { if (s !== sym) { setTrail((t) => [...t.slice(-6), sym]); onOpen(s); } };
  const back = () => { const p = trail.at(-1); if (p) { setTrail((t) => t.slice(0, -1)); onOpen(p); } };
  const f = data?.facts;
  const name = data?.name ?? names[sym] ?? sym;
  const named: ChainLink[] = f?.competitors ?? [];
  const peerOnly: ChainLink[] = (data?.peers ?? []).filter((p) => p.sym !== sym && !named.some((c) => c.sym === p.sym)).map((p) => ({ name: p.name, sym: p.sym, what: 'same-industry peer' }));
  const comp: ChainLink[] = [...named, ...peerOnly];
  // When the report names no customer or supplier companies, show who it says they are (for example "consumers") as one labelled box.
  const cat = (text?: string): ChainLink[] => (text ? [{ name: text.length > 46 ? `${text.slice(0, 45)}…` : text, what: text, category: true }] : []);
  const sup: ChainLink[] = f?.suppliers.length ? f.suppliers : cat(f?.supplyBase);
  const cus: ChainLink[] = f?.customers.length ? f.customers : cat(f?.customerBase);
  const aiErr = data?.errors?.gemini ?? data?.errors?.filing;
  // one honest line for why the map is empty, instead of the same sentence for four different situations
  const emptyWhy = reading || data?.pending ? 'Reading the annual report… (about 20 to 40 seconds the first time)'
    : aiErr ? 'The free AI reader is busy or failed, so nothing was extracted. See below.'
    : data && !data.filing ? 'No SEC annual report to read (foreign or non-SEC filer)'
    : data && !data.gemini ? 'Add a free GEMINI_API_KEY in Vercel to read suppliers and customers from the 10-K'
    : f ? 'The annual report names no supplier or customer companies' : 'No suppliers or customers named yet';
  const q = data?.quotes;
  const ab = data?.about;
  const pctOf = (s?: string) => { const m = s?.match(/(\d+(\.\d+)?)\s*%/); return m ? +m[1] : null; };
  return (
    <div className="page co-page">
      <section className="panel co">
        <div className="phead co-head">
          {trail.length > 0 && <button className="btn" onClick={back} title={`Back to ${trail.at(-1)}`}>← {trail.at(-1)}</button>}
          <Star sym={sym} size="md" />
          <span className="co-sym">{sym}</span><span className="co-name">{name}</span>
          {data?.demo && <span className="fresh fresh-demo">DEMO DATA</span>}
          <CompanySearch mode={mode} onOpen={go} current={sym} />
          <span className="phead-ctl">
            <button className="btn" onClick={() => onPatterns(sym)}>Patterns</button>
            <button className="btn primary" onClick={() => onChart(sym)}>Open on desk</button>
          </span>
        </div>
        {loading && <p className="co-pad muted">Loading {sym}…</p>}
        {data?.pending && <p className="co-pad co-pending small">Reading {sym}’s latest annual report for products, suppliers and customers… the first time takes 20–40 s, then it’s instant.</p>}
        {error && <p className="co-pad down">Couldn’t load {sym}: {error}</p>}
        {data && (
          <div className="co-grid">
            <aside className="co-side">
              <div className="kv co-kv">
                {(() => {
                  const web = ab?.web ?? data.profile?.web;
                  const rows: [string, ReactNode, string?][] = [
                    ['Sector', ab?.sector], ['Industry', ab?.industry ?? data.profile?.industry], ['Exchange', ab?.exchange ?? data.profile?.exchange],
                    ['Market cap', (ab?.marketCap ?? data.profile?.marketCap) != null ? money(ab?.marketCap ?? data.profile?.marketCap) : null, ab?.capNote ?? undefined],
                    ['Headquarters', ab?.hq ?? data.profile?.country], ['Fiscal year ends', ab?.fiscalYearEnd],
                    ['Website', web ? <a href={web} target="_blank" rel="noreferrer noopener">{web.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a> : null],
                  ];
                  return rows.filter(([, v]) => v != null && v !== '').map(([k, v, t]) => <Fragment key={k}><span>{k}</span><b title={t}>{v}</b></Fragment>);
                })()}
              </div>
              <TearSheet sym={sym} mode={mode} />
              <h4><Q k="calc" src="a year of daily closes, scored on the desk" />Quant read <span className="muted small">bullish or bearish, and why</span></h4>
              <QuantPanel sym={sym} mode={mode} compact />
              <h4><Q k={f?.summary ? 'model' : 'unofficial'} src={f?.summary ? 'AI read of the company’s 10-K (check the filing)' : 'Wikipedia summary'} />What they do</h4>
              <p className="co-sum">{f?.summary || data.wiki?.extract || 'No description available.'}</p>
              {!f?.summary && data.wiki && <p className="small muted">From Wikipedia: <a href={data.wiki.url} target="_blank" rel="noreferrer noopener">{data.wiki.title}</a></p>}
              {f && f.products.length > 0 && <><h4><Q k="model" src="AI read of the company’s 10-K (check the filing)" />Main products{f.fiscalYear ? ` (FY ${f.fiscalYear})` : ''}</h4>
                <ul className="co-prod">{f.products.map((p) => { const v = pctOf(p.share); return (
                  <li key={p.name}><div className="co-prod-h"><span>{p.name}</span><span className="num muted">{p.share ?? ''}</span></div>{v != null && <div className="co-bar"><div style={{ width: `${Math.min(100, v)}%` }} /></div>}{p.note && <div className="small muted">{p.note}</div>}</li>
                ); })}</ul></>}
              <p className="note">
                {data.filing ? <>Source: {data.filing.form} filed {data.filing.date}{data.filing.url && <> · <a href={data.filing.url} target="_blank" rel="noreferrer noopener">read it on SEC.gov</a></>}. </> : 'No SEC annual report found (foreign or non-SEC filer). '}
                {f ? `Products, suppliers and customers were read from that report by ${data.model ?? 'Gemini'} (free tier), using only what the report states; tickers are matched to SEC’s list. AI reading can miss or misname things, so check the filing before acting.` : data.gemini ? '' : 'Add a free GEMINI_API_KEY in Vercel to fill products, suppliers and customers from the 10-K. '}
                {Object.keys(data.errors).length > 0 && <span className="down"> Issues: {Object.entries(data.errors).map(([k, v]) => `${k}: ${v}`).join(' · ')}</span>}
              </p>
            </aside>
            <div className="co-main">
              {(() => { const top = [...(f?.products ?? [])].map((p) => ({ p, v: pctOf(p.share) })).filter((x) => x.v != null).sort((a, b) => b.v! - a.v!)[0]; return top ? (
                <p className="co-top">Biggest revenue line: <b>{top.p.name}</b> <span className="num">{top.p.share}</span>{f && f.products.length > 1 ? <span className="muted small"> · suppliers and customers below are for the whole company, as the 10-K lists them (10-Ks rarely split them by product)</span> : null}</p>) : null; })()}
              <Diagram sym={sym} name={name} sup={sup} cus={cus} comp={comp} onOpen={go} empty={emptyWhy} />
              {aiErr && !reading && (
                <p className="small co-ai-fail"><b>The AI read did not finish</b> ({aiErr.slice(0, 90)}). The free Gemini tier is often briefly overloaded. <button className="btn sm" onClick={retry}>Try again</button></p>
              )}
              {f && !f.customers.length && f.customerBase && <p className="small co-base"><b>Customers:</b> {f.customerBase}. <span className="muted">The report names no customer companies, so there is nothing to click on that side.</span></p>}
              {f && !f.suppliers.length && f.supplyBase && <p className="small co-base"><b>Suppliers:</b> {f.supplyBase}. <span className="muted">The report names no supplier companies.</span></p>}
              {q && (q.customers.length > 0 || q.suppliers.length > 0) && (!f || (!f.customers.length && !f.suppliers.length)) && (
                <div className="co-quotes">
                  <div className="co-quotes-h">From the annual report, word for word <span className="tag" title="Sentences picked by keyword from the 10-K. No AI, nothing added.">KEYWORD MATCH, NOT AI</span></div>
                  {q.customers.map((x, i) => <blockquote key={`c${i}`}><span className="muted small">Customers</span>{x}</blockquote>)}
                  {q.suppliers.map((x, i) => <blockquote key={`s${i}`}><span className="muted small">Suppliers</span>{x}</blockquote>)}
                </div>
              )}
              <p className="small muted co-hint">Click any company with a ticker to re-center on it. Gray boxes are private, foreign-only or unmatched names. Arrows show which way products flow.</p>
              <div className="co-lists">
                <Links title="Suppliers" xs={f?.suppliers ?? []} onOpen={go} />
                <Links title="Customers" xs={f?.customers ?? []} onOpen={go} />
              </div>
              <Peers named={named} peers={peerOnly} onOpen={go} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
