import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { handleLanternaApiRequest } from './src/server/lanternaApi.js';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };
  if (!env.FILM_SALES_ENABLED) env.FILM_SALES_ENABLED = 'true';

  return {
    plugins: [react(), lanternaApiDevPlugin(env)],
    optimizeDeps: {
      exclude: ['lucide-react'],
    },
  };
});

function lanternaApiDevPlugin(env: Record<string, string | undefined>): Plugin {
  return {
    name: 'lanterna-api-dev',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res, next) => {
        try {
          const method = req.method ?? 'GET';
          const host = req.headers.host ?? '127.0.0.1:5173';
          const body = method === 'GET' || method === 'HEAD' ? undefined : await readRequestBody(req);
          const headers = new Headers();

          Object.entries(req.headers).forEach(([key, value]) => {
            if (Array.isArray(value)) headers.set(key, value.join(', '));
            else if (value) headers.set(key, value);
          });

          const response = await handleLanternaApiRequest(new Request(`http://${host}/api${req.url ?? ''}`, {
            body,
            headers,
            method,
          }), { env });

          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          next(error);
        }
      });
    },
  };
}

function readRequestBody(req: NodeJS.ReadableStream) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
