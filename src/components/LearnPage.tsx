// Learn: a few free outside resources for practising trading thinking (probability, market making, estimation, how
// exchanges work). Links only: nothing is fetched or stored, and none of it is advice.
const LINKS: { group: string; items: { title: string; by: string; kind: string; url: string; why: string }[] }[] = [
  {
    group: 'Read first',
    items: [
      { title: 'Probability & Markets', by: 'Jane Street', kind: 'PDF', url: 'https://www.janestreet.com/static/pdfs/trading-interview.pdf', why: 'Expected value, odds and making markets: the thinking behind sizing a trade by risk instead of by feel.' },
      { title: 'How to Build an Exchange', by: 'Jane Street', kind: 'Talk', url: 'https://blog.janestreet.com/how-to-build-an-exchange/', why: 'What happens to an order after you send it: queues, matching, latency and why prices jump.' },
    ],
  },
  {
    group: 'Practise',
    items: [
      { title: 'Figgie', by: 'Jane Street', kind: 'Game', url: 'https://www.figgie.com/play', why: 'A card game built to teach trading. Quote bids and offers, read the table, watch your P&L. Plays in the browser.' },
      { title: 'How to play Figgie', by: 'Jane Street', kind: 'Video', url: 'https://www.figgie.com/how-to-play.html', why: 'Rules in a few minutes, then how strong players use information.' },
      { title: 'Estimathon rules', by: 'Estimathon (UC Berkeley copy)', kind: 'PDF', url: 'https://math.berkeley.edu/~moorxu/2020ARML/files/EstimathonRules.pdf', why: 'Practise giving ranges that are tight and still right: the same skill as setting a target and a stop.' },
    ],
  },
  {
    group: 'Puzzles',
    items: [
      { title: "This month's puzzle", by: 'Jane Street', kind: 'Puzzle', url: 'https://www.janestreet.com/puzzles/current-puzzle/', why: 'A new maths and logic puzzle each month. Slow, careful reasoning.' },
      { title: 'Puzzle archive', by: 'Jane Street', kind: 'Puzzle', url: 'https://www.janestreet.com/puzzles/archive/', why: 'Every past puzzle with its official solution: try it, then read how they solved it.' },
    ],
  },
];

export default function LearnPage() {
  return (
    <div className="page ad">
      <div className="ad-top"><h2>Learn</h2><span className="small muted">Free outside resources for practising trading thinking. Links open the original site in a new tab. Learning material, not advice.</span></div>
      <div className="ad-grid">
        {LINKS.map((g) => (
          <section key={g.group} className="ad-card">
            <header className="ad-h"><h3>{g.group}</h3></header>
            <ul className="lr-list">
              {g.items.map((x) => (
                <li key={x.url}>
                  <a href={x.url} target="_blank" rel="noreferrer noopener"><b>{x.title}</b></a> <span className="chip sm">{x.kind}</span>
                  <span className="small muted"> · {x.by}</span>
                  <p className="small">{x.why}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="note">Picked from the community list at <a href="https://jane-street-free.pages.dev/" target="_blank" rel="noreferrer noopener">jane-street-free.pages.dev</a> (not made by Jane Street). Each link goes to the original publisher.</p>
    </div>
  );
}
