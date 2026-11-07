// Small "what is this?" card for any ticker: fund objective, or company profile + Wikipedia summary.
import { useEffect, useRef } from 'react';
import { useTickerInfo } from '../data/info';
import type { DataMode } from '../data/live';
import { Star } from './common';

const money = (v?: number | null) => (v == null ? null : v >= 1e12 ? `$${(v / 1e12).toFixed(2)}T` : v >= 1e9 ? `$${(v / 1e9).toFixed(1)}B` : `$${(v / 1e6).toFixed(0)}M`);
const KIND: Record<string, string> = { index: 'Index fund', sector: 'Sector fund', industry: 'Industry fund', country: 'Country fund', bond: 'Bond fund', commodity: 'Commodity fund', crypto: 'Crypto', leveraged: 'Leveraged / inverse', volatility: 'Volatility product', income: 'Income fund' };

export default function TickerInfo({ sym, at, mode, onClose, onChart, onCompany }: { sym: string; at: { x: number; y: number }; mode: DataMode; onClose: () => void; onChart: (s: string) => void; onCompany: (s: string) => void }) {
  const { data, loading, error } = useTickerInfo(sym, mode);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    window.addEventListener('keydown', key); setTimeout(() => window.addEventListener('mousedown', down), 0);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('mousedown', down); };
  }, [onClose]);
  const W = 340, left = Math.min(Math.max(8, at.x - 20), window.innerWidth - W - 8), top = at.y + 300 > window.innerHeight ? Math.max(8, at.y - 310) : at.y + 12;
  const what = data?.what ? (data.what.length > 520 ? `${data.what.slice(0, 520).replace(/\s\S*$/, '')}…` : data.what) : null;
  return (
    <div ref={ref} className="tinfo" style={{ left, top, width: W }} role="dialog" aria-label={`About ${sym}`}>
      <div className="tinfo-h"><Star sym={sym} /><b className="tinfo-sym">{sym}</b><span className="tinfo-n">{data?.name ?? ''}</span><button className="ping-x" onClick={onClose} aria-label="Close">×</button></div>
      <div className="tinfo-tags">
        {data?.type === 'fund' && <span className="tag">{KIND[data.fundKind ?? ''] ?? 'Fund'}</span>}
        {data?.index && <span className="tag">{data.index}</span>}
        {data?.sector && <span className="tag">{data.sector}</span>}
      </div>
      <p className="tinfo-what">{what ?? (loading ? 'Looking it up…' : error ?? 'No description found.')}</p>
      <div className="kv tinfo-kv">
        {data?.industry && <><span>Industry</span><b>{data.industry}</b></>}
        {data?.hq && <><span>Headquarters</span><b>{data.hq}</b></>}
        {money(data?.marketCap) && <><span>Market cap</span><b className="num">{money(data?.marketCap)}</b></>}
      </div>
      <div className="tinfo-btns">
        <button className="btn primary" onClick={() => { onChart(sym); onClose(); }}>Chart</button>
        {data?.type !== 'fund' && <button className="btn" onClick={() => { onCompany(sym); onClose(); }}>Company page & supply chain</button>}
        {data?.wiki?.url && <a className="btn" href={data.wiki.url} target="_blank" rel="noreferrer noopener">Wikipedia ↗</a>}
      </div>
      <p className="note">{data?.type === 'fund' ? 'From the fund’s stated objective.' : data?.wiki ? `Summary: Wikipedia (“${data.wiki.title}”).` : ''}</p>
    </div>
  );
}
