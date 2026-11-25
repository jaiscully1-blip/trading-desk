// Headline check: does a headline lean on data (numbers, a named source, official figures) or on alarm words with
// nothing behind them? A keyword read of the headline (and summary when there is one), not a fact-check: it can't tell
// whether the numbers are right, only whether any are given. Pure and tested.

export type CredLabel = 'data' | 'alarm-data' | 'fear' | 'plain';
export const CRED_TEXT: Record<CredLabel, string> = { data: 'Data', 'alarm-data': 'Alarm + data', fear: 'Fear, no data', plain: 'Plain' };

const ALARM = /\b(collaps\w*|crash\w*|plung\w*|plummet\w*|meltdown|apocalyp\w*|armageddon|wipe[sd]? out|wiped out|panic\w*|bloodbath|catastroph\w*|doom\w*|implod\w*|tank(s|ed|ing)?|freefall|free fall|carnage|chaos|terrif\w*|horrif\w*|shock(ing|s)?|imminent|disaster|nightmare|bubble (is )?burst\w*|scar(y|iest)|fear(s|ed)?|devastat\w*|death spiral|end of the dollar|warns?|warning)\b/i;
const HYPE = /(nobody is talking|they don'?t want you|what they aren'?t telling|you won'?t believe|before it'?s too late|mark my words|this is it\b|it'?s over\b)/i;
const NUMBER = /(\d+(\.\d+)?\s?(%|percent|bp|basis points|bps)|\$\s?\d|\d+(\.\d+)?\s?(billion|million|trillion|bn|mn|tn)\b|\b(19|20)\d{2}\b(?!\s*(%|percent))|\b\d{2,}(,\d{3})+\b|\b\d+(\.\d+)?\s?(points|pts)\b)/i;
const SOURCE = /\b(according to|data (show|shows|showed)|report(s|ed)?\b|survey|filing|filed|study|said|says|told|statement|minutes|release[sd]?|estimates?|forecasts?|index|census|Fed\b|Federal Reserve|BLS|Labor Department|Commerce Department|Treasury|SEC\b|CFTC|FDIC|CDC|FDA|IMF|World Bank|OECD|ECB|BOJ|Bank of Japan|BIS|EIA|USDA|Moody'?s|S&P|Fitch|earnings|guidance|quarter(ly)?)\b/i;
const ANON = /\b(sources say|people familiar|insiders? say|rumou?r(s|ed)?|reportedly|unconfirmed|allegedly)\b/i;

export interface Cred { label: CredLabel; reasons: string[] }
export function credibility(title: string, summary = ''): Cred {
  const t = `${title} ${summary}`.trim(), reasons: string[] = [];
  const alarm = (title.match(new RegExp(ALARM.source, 'gi')) ?? []).length + (HYPE.test(t) ? 2 : 0);
  const caps = (title.match(/\b[A-Z]{4,}\b/g) ?? []).filter((w) => !/^(NYSE|NASDAQ|OPEC|NVDA|AAPL|TSLA|MSFT|GOOGL|AMZN|META|COVID|FOMC|CPI|PCE|GDP|USD|EUR|JPY|ECB|IMF|OECD|NATO|SPDR|ETF|ETFS|CEO|CFO|IPO|NASA|FEMA|USDA)$/.test(w)).length;
  const hasNum = NUMBER.test(t), hasSrc = SOURCE.test(t), anon = ANON.test(t);
  if (hasNum) reasons.push('gives numbers'); if (hasSrc) reasons.push('names a source or official data');
  if (alarm) reasons.push(`${alarm} alarm word${alarm > 1 ? 's' : ''}`); if (HYPE.test(t)) reasons.push('hype phrasing');
  if (caps >= 2) reasons.push('shouty capitals'); if (/!{1,}/.test(title)) reasons.push('exclamation');
  if (anon) reasons.push('unnamed sources'); if (/\?\s*$/.test(title)) reasons.push('question headline');
  const loud = alarm > 0 || caps >= 2 || /!/.test(title), evidence = hasNum || (hasSrc && !anon);
  const label: CredLabel = loud && !evidence ? 'fear' : loud && evidence ? 'alarm-data' : evidence ? 'data' : 'plain';
  return { label, reasons };
}
