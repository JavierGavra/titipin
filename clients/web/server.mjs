import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { URL, fileURLToPath } from 'node:url';

const root = resolve(process.argv[2] || fileURLToPath(new URL('.', import.meta.url)));
const port = Number(process.env.PORT || 5173);
const apiBaseUrl = process.env.VITE_API_BASE_URL || process.env.TITIPIN_API_BASE_URL || 'http://localhost:8080/v1';
const issuer = process.env.VITE_OIDC_ISSUER || 'http://localhost:8081/realms/titipin';
const clientId = process.env.VITE_OIDC_CLIENT_ID || 'titipin-web';
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

async function fileFor(pathname) {
  const safe = normalize(pathname).replace(/^([.][.][\\/])+/, '');
  let file = join(root, safe);
  try { if ((await stat(file)).isDirectory()) file = join(file, 'index.html'); return file; } catch {}
  try { await stat(file); return file; } catch {}
  return join(root, 'index.html');
}

createServer(async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (requestUrl.pathname === '/config.js') {
    const origin = `${requestUrl.protocol}//${requestUrl.host}`;
    const redirectUri = process.env.VITE_OIDC_REDIRECT_URI || `${origin}/callback`;
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(`globalThis.__TITIPIN_CONFIG__ = ${JSON.stringify({ apiBaseUrl, oidcIssuer: issuer, oidcClientId: clientId, oidcRedirectUri: redirectUri })};`);
    return;
  }
  const file = await fileFor(requestUrl.pathname);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}).listen(port, '0.0.0.0', () => console.log(`Titipin web tersedia di http://localhost:${port}`));
