import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
const root = resolve(fileURLToPath(new URL('../', import.meta.url)));
const port = Number(process.env.PORT || 5173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json; charset=utf-8' };
http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relativePath = pathname === '/' ? 'web/index.html' :
      pathname.startsWith('/src/') || pathname.startsWith('/styles') ? `web${pathname}` :
      pathname.startsWith('/assets/') ? `web/public${pathname}` :
      pathname === '/manifest.webmanifest' || pathname === '/sw.js' || pathname.startsWith('/privacy/') ? `web/public${pathname}` : pathname.slice(1);
    let file = resolve(root, relativePath);
    if ((file !== root && !file.startsWith(root + sep)) || pathname.split('/').some(segment => segment.startsWith('.')) || /\/(?:tests|scripts)\//.test(pathname)) throw new Error('Not found');
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    if (!file.startsWith(root.endsWith(sep) ? root : root + sep)) throw new Error('Not found');
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    response.end(await readFile(file));
  } catch { response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); response.end('页面不存在'); }
}).listen(port, process.env.HOST || '127.0.0.1', () => console.log(`眠记已启动：http://localhost:${port}`));
