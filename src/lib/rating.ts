// Colour for an AI analyst's verdict text. The first verdict word decides ("SELL, not a buy" is a sell), negated phrases
// ("not a buy", "no sell signal") are ignored, and HOLD / neutral stays uncoloured.
export function ratingTone(d?: string): 'up' | 'down' | '' {
  const t = (d ?? '').toLowerCase().replace(/\b(not|no|never|isn't|is not)\s+(a\s+|an\s+)?(strong\s+)?(buy|sell|overweight|underweight)\b/g, ' ');
  const hit = /\b(strong\s+buy|buy|overweight|accumulate|strong\s+sell|sell|underweight|reduce|hold|neutral)\b/.exec(t);
  if (!hit) return '';
  const w = hit[1];
  return /buy|overweight|accumulate/.test(w) ? 'up' : /sell|underweight|reduce/.test(w) ? 'down' : '';
}
