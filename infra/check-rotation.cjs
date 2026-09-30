'use strict';

// Real public-client Authorization Code + PKCE. No token is printed or saved.
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('node:http');
const { randomBytes, createHash } = require('node:crypto');
const { credentials, tokenRequest } = require('./auth-dev.cjs');

async function readRealmSettings(issuer) {
  // Optional read-only confirmation against the development realm.
  const file = path.resolve(__dirname, '../.local/auth.env');
  const parsed = new URL(issuer);
  if (!fs.existsSync(file) || !['localhost', '127.0.0.1'].includes(parsed.hostname)) return { verified: false };
  try {
    const env = Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/)
      .filter((line) => line.includes('=') && !line.startsWith('#'))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
    const login = await tokenRequest(parsed.origin + '/realms/master', {
      grant_type: 'password', client_id: 'admin-cli',
      username: env.KC_BOOTSTRAP_ADMIN_USERNAME, password: env.KC_BOOTSTRAP_ADMIN_PASSWORD,
    });
    if (login.status !== 200 || !login.json.access_token) return { verified: false };
    const realm = parsed.pathname.split('/').filter(Boolean).at(-1);
    const response = await fetch(parsed.origin + '/admin/realms/' + encodeURIComponent(realm), {
      redirect: 'error', headers: { Authorization: 'Bearer ' + login.json.access_token },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return { verified: false };
    const settings = await response.json();
    return { verified: true, revokeRefreshToken: settings.revokeRefreshToken, refreshTokenMaxReuse: settings.refreshTokenMaxReuse };
  } catch { return { verified: false }; }
}

async function main() {
  const data = credentials();
  const clientId = 'titipin-web';
  const redirectUri = 'http://localhost:5173/callback';
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  let server;
  let timer;
  try {
    const code = await new Promise((resolve, reject) => {
      server = createServer((req, res) => {
        const callback = new URL(req.url, redirectUri);
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Referrer-Policy', 'no-referrer');
        if (callback.pathname !== '/callback') { res.writeHead(404).end(); return; }
        if (callback.searchParams.get('state') !== state) { res.writeHead(400).end('State mismatch.'); return; }
        const code = callback.searchParams.get('code');
        if (!code) { res.writeHead(400).end('Login failed.'); reject(new Error('Authorization refused.')); return; }
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Login diterima. Kembali ke terminal untuk hasil rotasi token.');
        resolve(code);
      });
      server.on('error', reject);
      server.listen(5173, '127.0.0.1', () => {
        const url = new URL(data.issuer + '/protocol/openid-connect/auth');
        url.search = new URLSearchParams({
          client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
          scope: 'openid requests:read', state, code_challenge: challenge,
          code_challenge_method: 'S256', prompt: 'login',
        });
        console.log('Buka URL ini, lalu login sebagai admin-a dari Step 3:');
        console.log(url.toString());
      });
      timer = setTimeout(() => reject(new Error('Login timed out after five minutes.')), 300000);
    });
    clearTimeout(timer);
    await new Promise((resolve) => server.close(resolve));
    server = null;
    const initial = await tokenRequest(data.issuer, {
      grant_type: 'authorization_code', client_id: clientId, code,
      redirect_uri: redirectUri, code_verifier: verifier,
    });
    if (initial.status !== 200 || !initial.json.refresh_token) throw new Error('PKCE code exchange failed.');
    const rt1 = initial.json.refresh_token;
    const refresh = (refreshToken) => tokenRequest(data.issuer, {
      grant_type: 'refresh_token', client_id: clientId, refresh_token: refreshToken,
    });
    const rotated = await refresh(rt1);
    const rt2 = rotated.json.refresh_token;
    if (rotated.status !== 200 || !rt2) throw new Error('Initial refresh failed.');
    const reused = await refresh(rt1);
    const family = await refresh(rt2);
    const rotation = rt1 !== rt2;
    const reusedDenied = reused.status === 400 && reused.json.error === 'invalid_grant';
    const familyDenied = family.status === 400 && family.json.error === 'invalid_grant';
    const activeSettings = await readRealmSettings(data.issuer);
    const evidence = {
      recordedAt: new Date().toISOString(), issuer: data.issuer, clientId,
      flow: 'Authorization Code + PKCE S256',
      settingsFromStep3Seed: { revokeRefreshToken: true, refreshTokenMaxReuse: 0 },
      activeSettings,
      liveSettingsNote: activeSettings.verified ? 'Read from the live development realm.' : 'Confirm the active realm settings in Keycloak Admin Console.',
      rt2DiffersFromRt1: rotation,
      reuseRt1: { status: reused.status, error: reusedDenied ? 'invalid_grant' : 'unexpected_result' },
      useRt2AfterReuse: { status: family.status, error: familyDenied ? 'invalid_grant' : 'unexpected_result' },
      pass: rotation && reusedDenied && familyDenied,
    };
    const file = path.resolve(__dirname, '../docs/evidence/step10-rotation.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(evidence, null, 2) + '\n');
    const adrFile = path.resolve(__dirname, '../docs/decisions/0003-autentikasi.md');
    let adr = fs.readFileSync(adrFile, 'utf8');
    const values = {
      'Waktu pelaksanaan': evidence.recordedAt,
      'RT2 berbeda dari RT1': String(rotation),
      'Reuse RT1 ditolak': String(reusedDenied) + ' (HTTP ' + reused.status + ')',
      'RT2 setelah reuse ditolak': String(familyDenied) + ' (HTTP ' + family.status + ')',
    };
    if (activeSettings.verified) values['Setting aktif Revoke Refresh Token / Max Reuse'] =
      String(activeSettings.revokeRefreshToken) + ' / ' + String(activeSettings.refreshTokenMaxReuse);
    adr = adr.split('\n').map((line) => {
      for (const [label, value] of Object.entries(values)) {
        if (line.startsWith('| ' + label + ' |')) return '| ' + label + ' | ' + value + ' |';
      }
      return line;
    }).join('\n');
    adr = adr.replace('**Bukti aktual: BELUM DIJALANKAN pada server Keycloak pengguna.**',
      '**Bukti aktual: sudah dijalankan; hasil ' + (evidence.pass ? 'LULUS' : 'BELUM LULUS') + '.**');
    fs.writeFileSync(adrFile, adr);
    console.log('RT2 berbeda dari RT1: ' + rotation);
    console.log('Pemakaian ulang RT1 ditolak: ' + reusedDenied);
    console.log('RT2 sesudah reuse juga ditolak: ' + familyDenied);
    console.log('Bukti tanpa token: docs/evidence/step10-rotation.json');
    if (!evidence.pass) {
      console.error('FAIL Step 10: seluruh keluarga token harus ditolak, bukan hanya RT1.');
      process.exitCode = 1;
    }
  } finally {
    clearTimeout(timer);
    if (server) await new Promise((resolve) => server.close(resolve));
  }
}
main().catch(() => {
  console.error('Pemeriksaan rotasi gagal. Pastikan Keycloak aktif dan port callback 5173 kosong. Tidak ada token yang dicetak.');
  process.exitCode = 1;
});
