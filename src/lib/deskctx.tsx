// Small app-wide context so any ticker anywhere can show its star and company name without prop drilling.
import { createContext, useContext } from 'react';

export interface DeskCtx {
  stars: string[];
  toggleStar: (sym: string) => void;
  names: Record<string, string>;
  openCompany: (sym: string) => void;
}
export const Desk = createContext<DeskCtx>({ stars: [], toggleStar: () => {}, names: {}, openCompany: () => {} });
export const useDesk = () => useContext(Desk);
