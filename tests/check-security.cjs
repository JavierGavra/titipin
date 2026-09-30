'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');
const YAML = require('yaml');
const api = YAML.parse(fs.readFileSync('openapi.yaml', 'utf8'));
const readme = fs.readFileSync('service/README.md', 'utf8');
const expected = ['requests:read', 'requests:write', 'requests:fulfil', 'deliveries:write',
  'payments:read', 'accounts:read', 'issues:read', 'issues:write'];
const flows = api.components.securitySchemes.oauth2.flows;
assert.deepEqual(Object.keys(flows.authorizationCode.scopes).sort(), [...expected].sort());
assert.deepEqual(Object.keys(flows.clientCredentials.scopes).sort(), ['issues:read', 'requests:read']);
let operations = 0;
for (const [route, item] of Object.entries(api.paths)) {
  for (const [method, op] of Object.entries(item)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
    if (route === '/health') {
      assert.deepEqual(op.security, []);
      assert.equal(item.servers[0].url, '/');
      continue;
    }
    assert.equal(op.security.length, 1);
    const scopes = op.security[0].oauth2;
    assert.equal(scopes.length, 1);
    assert.ok(expected.includes(scopes[0]));
    assert.ok(readme.includes(`| ${method.toUpperCase()} | \`/v1${route}\` | \`${scopes[0]}\` |`),
      `README mapping differs for ${method.toUpperCase()} ${route}`);
    for (const status of ['401', '403', '404']) assert.ok(op.responses[status]);
    operations++;
  }
}
assert.equal(operations, 21);
console.log('PASS: 21 protected operations, 8 matching scopes, public /health, and 401/403/404.');
