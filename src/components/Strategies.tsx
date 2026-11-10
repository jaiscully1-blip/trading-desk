// Strategy library (⇧L): reference cards by family, with a free-data verdict and a launch button. Not advice.
// Reference only: it holds no market data, so there is nothing to label live or delayed.
import { useState } from 'react';
import { FAMILIES, FREE_LABEL, SOURCE, STRATEGIES, TODO_EDGE_CHECK, filterStrategies, type Family, type Launch } from '../../shared/strategyLibrary';

export function Strategies({ onLaunch }: { onLaunch: (l: Launch) => void }) {
  const [fam, setFam] = useState<Family | 'all'>('all');
  const [onlyFree, setOnlyFree] = useState(false);
  const shown = filterStrategies(STRATEGIES, fam, onlyFree);
  const fams = fam === 'all' ? FAMILIES : FAMILIES.filter((f) => f.id === fam);
  return (
    <section className="panel strat-page">
      <div className="phead">
        <div className="phead-title">Strategy library</div>
        <div className="phead-ctl">
          <span className="muted small">{shown.length} of {STRATEGIES.length} ideas</span>
        </div>
      </div>
      <div className="strat-body">
        <p className="note strat-warn">A reference and launch pad, not advice and not a signal list. A backtest is not proof: results change with the period, the costs and the exit rule. Ideas are written in our own words; family list inspired by <a href={SOURCE.url} target="_blank" rel="noreferrer noopener">{SOURCE.title}</a> ({SOURCE.authors}).</p>
        <div className="fb-row strat-filters">
          <button className={`chip sm ${fam === 'all' ? 'on' : ''}`} onClick={() => setFam('all')}>All</button>
          {FAMILIES.map((f) => <button key={f.id} className={`chip sm ${fam === f.id ? 'on' : ''}`} onClick={() => setFam(f.id)}>{f.label}</button>)}
          <label className="small strat-free"><input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} /> Works on free data</label>
        </div>
        {fams.map((f) => {
          const cards = shown.filter((s) => s.family === f.id);
          if (!cards.length) return null;
          return (
            <div key={f.id} className="strat-fam">
              <h3>{f.label}</h3><p className="muted small">{f.blurb}</p>
              <div className="strat-grid">
                {cards.map((s) => (
                  <article key={s.id} className="strat-card">
                    <div className="strat-top"><b>{s.name}</b><span className={`tag strat-${s.free}`}>{FREE_LABEL[s.free]}</span></div>
                    <p>{s.idea}</p>
                    <dl>
                      <dt>Needs</dt><dd>{s.needs}</dd>
                      <dt>Free data</dt><dd>{s.freeNote}</dd>
                      {s.uses.length > 0 && <><dt>Desk numbers</dt><dd>{s.uses.join(' · ')}</dd></>}
                      <dt>Options view</dt><dd>{s.optionsNote}</dd>
                    </dl>
                    {s.launch && <button className="btn" onClick={() => onLaunch(s.launch!)}>{s.launch.label}</button>}
                  </article>
                ))}
              </div>
            </div>
          );
        })}
        {!shown.length && <p className="muted small">No ideas match. Turn off a filter.</p>}
        <p className="note">{TODO_EDGE_CHECK}</p>
      </div>
    </section>
  );
}
