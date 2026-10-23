import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import type { IncomingMessage, ServerResponse } from 'http';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'abs-cors-proxy',
      configureServer(server) {
        server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          if (req.url && (req.url.startsWith('/abs-proxy') || req.url.startsWith('/api/proxy'))) {
            try {
              const urlObj = new URL(req.url, 'http://localhost');
              const targetServer = req.headers['x-abs-target'] as string || urlObj.searchParams.get('target');
              let targetPath = urlObj.searchParams.get('path') || urlObj.pathname.replace(/^\/(abs-proxy|api\/proxy)/, '') || '/';
              if (!targetPath.startsWith('/')) targetPath = '/' + targetPath;

              const targetQuery = new URLSearchParams(urlObj.searchParams);
              targetQuery.delete('target');
              targetQuery.delete('path');
              
              if (!targetServer) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: 'Missing x-abs-target header or target query param' }));
                return;
              }

              const fullTargetUrl = `${targetServer.replace(/\/+$/, '')}${targetPath}${targetQuery.toString() ? '?' + targetQuery.toString() : ''}`;

              // Forward request to Audiobookshelf
              const forwardHeaders: Record<string, string> = {};
              for (const [key, value] of Object.entries(req.headers)) {
                if (['host', 'connection', 'content-length', 'x-abs-target', 'origin', 'referer'].includes(key.toLowerCase())) continue;
                if (typeof value === 'string') forwardHeaders[key] = value;
                else if (Array.isArray(value)) forwardHeaders[key] = value.join(', ');
              }

              const requestInit: RequestInit = {
                method: req.method,
                headers: forwardHeaders,
              };

              if (req.method !== 'GET' && req.method !== 'HEAD') {
                const chunks: Buffer[] = [];
                for await (const chunk of req) {
                  chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
                }
                if (chunks.length > 0) {
                  requestInit.body = Buffer.concat(chunks);
                }
              }

              const response = await fetch(fullTargetUrl, requestInit);

              res.statusCode = response.status;
              response.headers.forEach((val, key) => {
                // Don't forward transfer-encoding or content-encoding if node handles decompression
                if (['content-encoding', 'transfer-encoding'].includes(key.toLowerCase())) return;
                res.setHeader(key, val);
              });

              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
              res.setHeader('Access-Control-Allow-Headers', '*');

              const responseBuffer = await response.arrayBuffer();
              res.end(Buffer.from(responseBuffer));
              return;
            } catch (err: any) {
              res.statusCode = 502;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: 'Proxy fetch failed', message: err?.message || String(err) }));
              return;
            }
          }
          next();
        });
      },
    },
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
  },
});
