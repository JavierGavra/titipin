'use strict';

const fs = require('node:fs');
const path = require('node:path');

function credentials() {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, '../.local/auth-credentials.json'), 'utf8'));
}

async function tokenRequest(issuer, fields) {
  const response = await fetch(issuer + '/protocol/openid-connect/token', {
    method: 'POST', redirect: 'error',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields), signal: AbortSignal.timeout(15000),
  });
  const json = await response.json();
  return { status: response.status, json };
}

async function userToken(data, username, scope) {
  const user = data.users.find((u) => u.username === username);
  if (!user) throw new Error('Test user is missing: ' + username);
  const result = await tokenRequest(data.issuer, {
    grant_type: 'password', client_id: 'test-cli', username, password: user.password, scope,
  });
  if (result.status !== 200 || typeof result.json.access_token !== 'string') {
    throw new Error('The development authorization server refused a test login.');
  }
  return result.json.access_token;
}

module.exports = { credentials, tokenRequest, userToken };
