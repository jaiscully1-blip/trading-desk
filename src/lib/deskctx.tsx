// Small app-wide context so any ticker anywhere can show its star and company name without prop drilling.
import { createContext, useContext } from 'react';

export interface Article { title: string; url?: string; src: string; t: number; summary?: string; syms?: string[]; sentiment?: number }
export interface DeskCtx {
  openArticle: (a: Article) => void;
  stars: string[];
  toggleStar: (sym: string) => void;
  names: Record<string, string>;
  openCompany: (sym: string) => void;
  /** small "what is this?" card next to the click */
  openInfo: (sym: string, at?: { x: number; y: number }) => void;
  /** open the approve-to-send Webull order ticket, prefilled */
  /** words that ring a keyword alert when a message contains them (Messages feed) */
  alertWords?: string[];
  setAlertWords?: (w: string[]) => void;
  openOrder?: (draft: Partial<import('../../shared/orders').OrderDraft>, last?: number | null) => void;
}
export const Desk = createContext<DeskCtx>({ stars: [], toggleStar: () => {}, names: {}, openCompany: () => {}, openArticle: () => {}, openInfo: () => {} });
export const useDesk = () => useContext(Desk);
