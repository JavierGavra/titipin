'use strict';

// Step 11c: temporarily remove exactly one gate and restore it even on failure.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const mutants = [
  ['N1', 'service/src/routes/requests.js', 'if (!mayReadRequest(actor, row))', 'if (row === null)'],
  ['N2', 'service/src/routes/deliveries.js', 'if (!mayWriteLocation(actor, delivery))', 'if (delivery === null)'],
  ['N3', 'service/src/auth/require-scope.js', 'if (!needed.every((scope) => req.principal.scopes.includes(scope)))', 'if (false)'],
  ['N4', 'service/src/routes/assignments.js', 'if (!mayReadAssignment(actor, row))', 'if (row === null)'],
];
function run(name) {
  return spawnSync(process.execPath, ['--test', '--test-reporter=tap', '--test-name-pattern=^' + name + ' ', 'tests/authz/access.test.cjs'], {
    cwd: root, encoding: 'utf8', timeout: 60000,
  });
}
for (const [name, relative, before, after] of mutants) {
  const file = path.join(root, relative);
  const original = fs.readFileSync(file, 'utf8');
  if (original.split(before).length !== 2) throw new Error('Expected one guard for ' + name);
  try {
    fs.writeFileSync(file, original.replace(before, after));
    const red = run(name);
    if (red.status === 0 || !red.stdout.includes('not ok') || !red.stdout.includes('ERR_ASSERTION')) {
      throw new Error(name + ': expected an assertion failure after removing the guard.');
    }
  } finally { fs.writeFileSync(file, original); }
  const green = run(name);
  if (green.status !== 0) throw new Error(name + ': restored guard did not pass.');
  console.log(name + ': RED without guard; GREEN after restoring guard');
}
