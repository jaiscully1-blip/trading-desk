// Home widget: live news TV. Pick a free channel (24/7 news and markets, plus government streams when live), watch it in
// the widget, or pop it out as a floating window that keeps playing on every page (several can run at once).
import { useMemo, useState } from 'react';
import { liveStreamsOf } from '../../shared/livestreams';
import { usePersisted } from '../lib/store';
import { MAX_TV, openTv } from '../lib/tv';
import type { FeedState } from '../data/feed';
import { ChannelSelect } from './TvWindows';

export function TvWidget({ feed }: { feed: FeedState | null }) {
  const streams = useMemo(() => liveStreamsOf(feed?.items ?? []), [feed?.items]);
  const [chan, setChan] = usePersisted<string>('tvWidgetChan', 'Bloomberg TV');
  const [msg, setMsg] = useState('');
  const cur = streams.find((s) => s.name === chan) ?? streams[0] ?? null;
  return (
    <div className="tvw-home">
      <div className="tvw-bar">
        {cur && <ChannelSelect streams={streams} value={cur.src} onPick={(s) => setChan(s.name)} />}
        <button className="chip sm" disabled={!cur} onClick={() => { if (cur) setMsg(openTv(cur) ? 'Opened as a floating window' : `Up to ${MAX_TV} TV windows at once`); }} title="Open in a floating window that keeps playing on every page (open more for several channels at once)">⧉ Pop out</button>
        {msg && <span className="small muted">{msg}</span>}
      </div>
      {cur ? <iframe key={cur.src} src={`${cur.src}${cur.src.includes('?') ? '&' : '?'}autoplay=0`} title={`Live TV: ${cur.name}`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen loading="lazy" />
        : <p className="small muted">No channels.</p>}
    </div>
  );
}
