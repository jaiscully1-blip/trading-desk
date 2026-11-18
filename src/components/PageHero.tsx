// Shared header for the data pages: the page's nav icon on a tile in its group color, the group as a small label, the title,
// a one-line description and any controls (ticker box, chips). Colors come from --pg, the current group's color.
import type { ReactNode } from 'react';
import { NAV_GROUPS, NAV_ICON, type Page } from './SideNav';

export function PageHero({ page, title, sub, children }: { page: Page; title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  const group = NAV_GROUPS.find((g) => g.pages.includes(page));
  return (
    <header className="hero">
      <span className="hero-ic" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={NAV_ICON[page]} /></svg>
      </span>
      <div className="hero-txt">
        {group && <span className="hero-kicker">{group.label}</span>}
        <h2>{title}</h2>
        {sub && <p className="hero-sub">{sub}</p>}
      </div>
      {children && <div className="hero-ctl">{children}</div>}
    </header>
  );
}
