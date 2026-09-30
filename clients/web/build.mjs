import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = new URL('.', import.meta.url).pathname;
const dist = resolve(root, 'dist');
let fileEnv = {};
try {
  fileEnv = Object.fromEntries((await readFile(resolve(root, '.env'), 'utf8')).split(/\r?\n/)
    .map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
    .map((line) => { const index = line.indexOf('='); return index > 0 ? [line.slice(0, index), line.slice(index + 1)] : null; })
    .filter(Boolean));
} catch {}
const env = { ...fileEnv, ...process.env };
if (!env.VITE_API_BASE_URL && !env.TITIPIN_API_BASE_URL) throw new Error('VITE_API_BASE_URL wajib diisi sebelum build web.');
if (!env.VITE_OIDC_ISSUER) throw new Error('VITE_OIDC_ISSUER wajib diisi sebelum build web.');
const config = {
  apiBaseUrl: env.VITE_API_BASE_URL || env.TITIPIN_API_BASE_URL,
  oidcIssuer: env.VITE_OIDC_ISSUER,
  oidcClientId: env.VITE_OIDC_CLIENT_ID || 'titipin-web',
  oidcRedirectUri: env.VITE_OIDC_REDIRECT_URI || '',
};

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(resolve(root, 'index.html'), resolve(dist, 'index.html'));
await cp(resolve(root, 'styles.css'), resolve(dist, 'styles.css'));
await cp(resolve(root, 'src'), resolve(dist, 'src'), { recursive: true });
await writeFile(resolve(dist, 'config.js'), `globalThis.__TITIPIN_CONFIG__ = ${JSON.stringify(config)};\n`, 'utf8');
console.log(`Titipin web dibangun ke ${dist}`);
