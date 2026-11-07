// GET /api/health -> which providers have keys configured (never the keys themselves).
import { hasKey, json } from './_lib/core.js';

export async function GET(): Promise<Response> {
  return json({
    ok: true,
    providers: {
      twelvedata: hasKey('twelvedata'),
      finnhub: hasKey('finnhub'),
      alphavantage: hasKey('alphavantage'),
      fred: hasKey('fred'),
      sec: hasKey('sec'),
      gemini: hasKey('gemini'),
    },
    extendedHours: false, // Twelve Data pre/post-market data needs the Pro plan
  });
}
