import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

/** Runs the /api serverless functions inside `npm run dev`, so local dev matches Vercel. */
function devApi(): Plugin {
  return {
    name: 'dev-api',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res, next) => {
        const name = (req.url ?? '').split('?')[0].replace(/^\/+/, '').replace(/[^a-z-]/g, '');
        if (!name) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.ts`);
          const post = req.method === 'POST';
          const fn = post ? mod.POST : mod.GET;
          if (typeof fn !== 'function') return next();
          let body: string | undefined;
          if (post) { const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer); body = Buffer.concat(chunks).toString('utf8'); }
          const headers = Object.fromEntries(Object.entries(req.headers).filter(([, v]) => typeof v === 'string')) as Record<string, string>;
          const r: Response = await fn(new Request(`http://localhost${req.originalUrl}`, { method: req.method, headers, body }));
          res.statusCode = r.status;
          r.headers.forEach((v, k) => res.setHeader(k, v));
          res.end(await r.text());
        } catch (e) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: (e as Error).message }));
        }
      });
    },
  };
}

// `npm run build:single` inlines everything into one HTML file (used for the hosted preview, which has no /api).
export default defineConfig(({ mode }) => {
  // Server-side keys for the dev API (never exposed: only VITE_* vars reach the browser bundle).
  const env = loadEnv(mode, process.cwd(), '');
  for (const [k, v] of Object.entries(env)) if (!k.startsWith('VITE_') && process.env[k] == null) process.env[k] = v;
  return {
    plugins: [react(), devApi(), ...(mode === 'single' ? [viteSingleFile()] : [])],
    test: { include: ['tests/**/*.test.ts'] },
    // The charting library and the big company list get their own files, so the app shell stays small and they load (and cache)
    // separately, only when a chart or a company name list is needed.
    ...(mode === 'single' ? {} : { build: { rollupOptions: { output: { manualChunks: (id: string) => (id.includes('node_modules/lightweight-charts') ? 'charts' : id.includes('shared/data/companies') ? 'companies' : undefined) } } } }),
  };
});
