// Error tracking for Jai only (PostHog, free tier: 100k exceptions a month). Off unless VITE_POSTHOG_KEY is set.
// Sends errors and failed /api calls. No page views, no clicks, no session recording, nothing stored in the browser.
type PH = { captureException: (e: unknown, props?: Record<string, unknown>) => void };
let ph: PH | null = null;
const queue: [unknown, Record<string, unknown> | undefined][] = [];

export function reportError(e: unknown, props?: Record<string, unknown>) {
  if (ph) ph.captureException(e, props); else if (queue.length < 20) queue.push([e, props]);
}

export async function startTelemetry() {
  const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
  if (!key || typeof window === 'undefined') return;
  const { default: posthog } = await import('posthog-js');
  posthog.init(key, {
    api_host: (import.meta.env.VITE_POSTHOG_HOST as string | undefined) || 'https://us.i.posthog.com',
    capture_exceptions: { capture_unhandled_errors: true, capture_unhandled_rejections: true, capture_console_errors: false },
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    persistence: 'memory',
    person_profiles: 'never',
  });
  ph = posthog as unknown as PH;
  for (const [e, p] of queue.splice(0)) ph.captureException(e, p);
  // a desk API call that fails on the server (5xx) is an error you ran into too
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await orig(input, init);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (res.status >= 500 && /^\/api\/|\/api\//.test(url)) {
      const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
      const fn = /[?&]fn=([\w-]+)/.exec(url)?.[1];
      reportError(new Error(`API ${res.status} ${path}${fn ? `?fn=${fn}` : ''}`), { path, fn, status: res.status });
    }
    return res;
  };
}
