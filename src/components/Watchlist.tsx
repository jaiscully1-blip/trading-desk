import { useState } from 'react';
import type { Board, Quote } from '../types';
import { DEMO_AT, INDEXES } from '../lib/demo';
import { pct, px, tone } from '../lib/format';
import { Fresh, PanelHead } from './common';

export const BOARDS: { id: Board; label: string }[] = [
  { id: 'setups', label: 'Setups' },
  { id: 'watching', label: 'Watching' },
  { id: 'avoid', label: 'Avoid' },
];

/** Watchlist in display order: boards top-to-bottom, each sorted by RS rank. */
export function orderedWatchlist(quotes: Record<string, Quote>, boards: Record<string, Board>) {
  return BOARDS.flatMap((b) =>
    Object.keys(boards)
      .filter((s) => boards[s] === b.id && quotes[s])
      .sort((x, y) => quotes[y].rsRank - quotes[x].rsRank),
  );
}

function Row({ q, sel, onSelect, draggable = true, onRemove }: { q: Quote; sel: boolean; onSelect: () => void; draggable?: boolean; onRemove?: () => void }) {
  return (
    <div
      className={`wl-row ${sel ? 'sel' : ''}`}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', q.sym);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={onSelect}
      role="button"
      tabIndex={-1}
    >
      <span className="wl-sym">{q.sym}</span>
      <span className="num wl-px">{px(q.last)}</span>
      <span className={`num wl-chg ${tone(q.chgPct)}`}>{pct(q.chgPct, 1)}</span>
      <span className="num wl-rs" title="Relative strength rank vs SPY (5/20/60d)">
        {INDEXES.includes(q.sym) ? '—' : q.rsRank}
      </span>
      {onRemove && (
        <button className="wl-x" onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Remove from watchlist" aria-label={`Remove ${q.sym}`}>
          ×
        </button>
      )}
    </div>
  );
}

export function Watchlist({
  quotes,
  boards,
  setBoard,
  removeSym,
  sel,
  onSelect,
  onPopout,
  compact,
}: {
  quotes: Record<string, Quote>;
  boards: Record<string, Board>;
  setBoard: (sym: string, b: Board) => void;
  removeSym: (sym: string) => void;
  sel: string;
  onSelect: (s: string) => void;
  onPopout?: () => void;
  compact?: boolean;
}) {
  const [over, setOver] = useState<Board | null>(null);
  return (
    <section className="panel wl">
      <PanelHead title="Watchlist" badge={<Fresh kind="demo" at={DEMO_AT} />} onPopout={onPopout}>
      </PanelHead>
      <div className="wl-head">
        <span>Sym</span><span>Last</span><span>Chg</span><span title="Relative strength rank vs SPY (5/20/60d). Boards sort by this.">RS</span>
      </div>
      <div className="wl-body">
        <div className="wl-board idx">
          {INDEXES.map((s) => (
            <Row key={s} q={quotes[s]} sel={sel === s} onSelect={() => onSelect(s)} draggable={false} />
          ))}
        </div>
        {BOARDS.map((b) => {
          const syms = Object.keys(boards)
            .filter((s) => boards[s] === b.id && quotes[s])
            .sort((x, y) => quotes[y].rsRank - quotes[x].rsRank);
          return (
            <div
              key={b.id}
              className={`wl-board ${over === b.id ? 'drop' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setOver(b.id); }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                const s = e.dataTransfer.getData('text/plain');
                if (s) setBoard(s, b.id);
                setOver(null);
              }}
            >
              <div className={`wl-board-h board-${b.id}`}>
                {b.label} <span className="muted">{syms.length}</span>
              </div>
              {syms.map((s) => (
                <Row key={s} q={quotes[s]} sel={sel === s} onSelect={() => onSelect(s)} draggable={!compact} onRemove={compact ? undefined : () => removeSym(s)} />
              ))}
              {!syms.length && <div className="wl-empty">Drag tickers here</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
