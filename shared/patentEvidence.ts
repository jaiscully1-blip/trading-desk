// "Is this patent's technology in the company's products?" Helpers for the AI rollout check and the plain-English line.
// The AI only sees 10-K sentences picked here, must copy its evidence word for word, and every quote is checked against the
// 10-K text before it is shown. Pure + tested.

const STOP = new Set('system systems method methods apparatus device devices using based thereof related same such having including include includes provide providing data first second plurality associated configured component components techniques technique process processes composition compositions use uses improved'.split(' '));
const stem = (w: string) => w.toLowerCase().replace(/(ing|ed|es|s)$/, '');
/** Content words of a patent title, lightly stemmed ("Lipid nanoparticle compositions" -> lipid, nanoparticle). */
export function titleWords(title: string): string[] {
  return [...new Set(title.toLowerCase().split(/[^a-z0-9-]+/).filter((w) => w.length >= 4 && !STOP.has(w)).map(stem))];
}
const sentences = (text: string) => text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z])/).filter((s) => s.length >= 40 && s.length <= 600);

/** The 10-K sentences that share the most content words with any of the titles (at most `max`, best first). */
export function candidateSentences(text: string, titles: string[], max = 60): string[] {
  const words = titles.map(titleWords);
  const scored = sentences(text).map((s) => {
    const sw = new Set(s.toLowerCase().split(/[^a-z0-9-]+/).map(stem));
    const best = Math.max(0, ...words.map((ws) => ws.filter((w) => sw.has(w)).length));
    return { s, best };
  }).filter((x) => x.best >= 1);
  return [...new Map(scored.sort((a, b) => b.best - a.best).map((x) => [x.s, x])).keys()].slice(0, max);
}

const flat = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** True when the quote really is in the source text (ignoring case, spacing and punctuation). */
export const quoteFound = (quote: string, text: string) => flat(quote).length >= 20 && flat(text).includes(flat(quote));

export type Verdict = 'in_products' | 'in_development' | 'no_evidence';
export const ROLLOUT_SCHEMA = {
  type: 'object',
  properties: { items: { type: 'array', items: { type: 'object', properties: { i: { type: 'integer' }, verdict: { type: 'string', enum: ['in_products', 'in_development', 'no_evidence'] }, quote: { type: 'string' } }, required: ['i', 'verdict', 'quote'] } } },
  required: ['items'],
};
export function rolloutPrompt(company: string, titles: string[], sents: string[]): string {
  return `You check whether ${company}'s patented technology shows up in what the company sells or is developing, using ONLY the numbered sentences from its latest 10-K annual report below. No outside knowledge.
For each patent title return:
- verdict: "in_products" if a sentence describes a product or service the company sells that uses this technology; "in_development" if a sentence describes it in research, a pipeline, trials or a product not yet launched; otherwise "no_evidence".
- quote: the one sentence that supports the verdict, copied EXACTLY, word for word, from the list. Empty string for "no_evidence".
Be strict: a sentence that only shares a word is not evidence. When unsure, answer "no_evidence".

PATENT TITLES:
${titles.map((t, i) => `${i}. ${t}`).join('\n')}

10-K SENTENCES:
${sents.map((s, i) => `[${i}] ${s}`).join('\n')}`;
}
/** Keep only well-formed answers whose quotes are really in the 10-K; anything else becomes "no_evidence". */
export function checkRollout(raw: any, n: number, text: string): { verdict: Verdict; quote: string; dropped: boolean }[] {
  const out = Array.from({ length: n }, () => ({ verdict: 'no_evidence' as Verdict, quote: '', dropped: false }));
  for (const it of Array.isArray(raw?.items) ? raw.items : []) {
    const i = Number(it?.i);
    if (!Number.isInteger(i) || i < 0 || i >= n) continue;
    const v = it?.verdict === 'in_products' || it?.verdict === 'in_development' ? it.verdict : 'no_evidence';
    if (v === 'no_evidence') continue;
    const q = String(it?.quote ?? '').trim();
    if (quoteFound(q, text)) out[i] = { verdict: v, quote: q.slice(0, 400), dropped: false };
    else out[i] = { verdict: 'no_evidence', quote: '', dropped: true };
  }
  return out;
}

/** Google Patents id for a row: the patent number when granted, else the publication number ("US20240123456A1"). */
export function gpId(patentNo: string | null, pubNo: string | null): string | null {
  if (patentNo && /^[A-Z]{0,2}\d{5,8}$/.test(patentNo.replace(/[^A-Z0-9]/gi, ''))) return `US${patentNo.replace(/[^A-Z0-9]/gi, '').toUpperCase()}`;
  const p = (pubNo ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (/^US\d{11}[A-Z]\d?$/.test(p)) return p;
  if (/^\d{11}[A-Z]\d?$/.test(p)) return `US${p}`;
  return null;
}
export const GP_ID_RE = /^US(RE)?\d{5,11}([A-Z]\d?)?$/;
/** The abstract from a Google Patents page (its description meta tag). */
export function gpAbstract(html: string): string | null {
  const m = /<meta name="description" content="([\s\S]*?)"\s*\/?>/i.exec(html);
  const t = m ? m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim() : '';
  return t.length >= 30 ? t.slice(0, 2000) : null;
}
export const PLAIN_SCHEMA = { type: 'object', properties: { plain: { type: 'string' } }, required: ['plain'] };
export const plainPrompt = (title: string, abstract: string) => `In ONE plain-English sentence (at most 25 words), say what this invention does and what it could be used for, for an investor with no technical background. Use only the title and abstract. No hype, no claims about value.
TITLE: ${title}
ABSTRACT: ${abstract}`;
