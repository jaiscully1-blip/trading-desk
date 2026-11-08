// Links from outside feeds (RSS, Finnhub, GDELT, Benzinga) are shown as <a href>. Only web links are allowed through:
// a "javascript:" or "data:" link in a headline must never become something you can click.
/** The trimmed URL if it is http(s), else an empty string. */
export const safeUrl = (u: unknown): string => {
  const s = typeof u === 'string' ? u.trim() : '';
  return /^https?:\/\/[^\s<>"']+$/i.test(s) ? s : '';
};
