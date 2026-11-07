// POST /api/research?fn=csvmap  { headers: string[] } -> which column is which, for broker CSVs the built-in rules don't know.
// Only the column NAMES are sent to Gemini, never your trades or amounts.
import { geminiJson } from '../adapters.js';
import { hasKey, json } from '../core.js';

const FIELDS = ['symbol', 'side', 'qty', 'price', 'time', 'status', 'fee', 'amount', 'type'] as const;
const SCHEMA = { type: 'OBJECT', properties: Object.fromEntries(FIELDS.map((f) => [f, { type: 'INTEGER' }])), required: [...FIELDS] };

export async function POST(req: Request): Promise<Response> {
  if (!hasKey('gemini')) return json({ error: 'needs GEMINI_API_KEY' }, { status: 400 });
  const body = await req.json().catch(() => null);
  const headers: string[] = Array.isArray(body?.headers) ? body.headers.slice(0, 60).map((h: unknown) => String(h).slice(0, 60)) : [];
  if (headers.length < 2) return json({ error: 'send the header row' }, { status: 400 });
  const prompt = `These are the column headers of a CSV exported from a stock broker (trade history and/or cash activity).
Return the 0-based column index for each field, or -1 if no column fits:
symbol = ticker; side = buy/sell or action/transaction code; qty = filled quantity/shares; price = fill or average price;
time = trade/execution/activity date or time; status = order status; fee = commission or fees; amount = cash amount of the row;
type = description/type of the row that says deposit, withdrawal, buy, sell, dividend.
Headers: ${JSON.stringify(headers.map((h, i) => `${i}: ${h}`))}`;
  try {
    const { data, model } = await geminiJson(prompt, SCHEMA);
    const cols: Record<string, number> = {};
    for (const f of FIELDS) { const v = Number(data?.[f]); if (Number.isInteger(v) && v >= 0 && v < headers.length) cols[f] = v; }
    return json({ cols, model });
  } catch (e) { return json({ error: (e as Error).message }, { status: 502 }); }
}
