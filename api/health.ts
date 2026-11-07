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
    // private panels (set or not; values never leave the server)
    private: { password: !!process.env.DESK_PASSWORD, webull: !!(process.env.WEBULL_APP_KEY && process.env.WEBULL_APP_SECRET), discord: !!process.env.DISCORD_BOT_TOKEN, claude: !!process.env.ANTHROPIC_API_KEY },
    extendedHours: false, // Twelve Data pre/post-market data needs the Pro plan
  });
}
