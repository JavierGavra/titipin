const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const YAML = require('yaml');
const Ajv2020 = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats');

const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:8080/v1')
  .replace(/\/+$/, '');
const contract = YAML.parse(fs.readFileSync(
  path.resolve(__dirname, '../../openapi.yaml'), 'utf8'
));

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
ajv.addVocabulary(['example', 'components']);

// Membaca referensi lokal seperti #/components/responses/InvalidRequest400.
function resolveLocal(value) {
  const seen = new Set();
  while (value && value.$ref) {
    const ref = value.$ref;
    assert.ok(ref.startsWith('#/'), `Referensi eksternal belum didukung: ${ref}`);
    assert.ok(!seen.has(ref), `Referensi melingkar: ${ref}`);
    seen.add(ref);
    value = ref.slice(2).split('/').reduce((node, part) => {
      const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
      return node?.[key];
    }, contract);
    assert.ok(value, `Referensi tidak ditemukan: ${ref}`);
  }
  return value;
}

function queryParameter(name) {
  const parameter = contract.paths['/requests'].get.parameters
    .map(resolveLocal).find((item) => item.in === 'query' && item.name === name);
  assert.ok(parameter, `Parameter ${name} tidak ditemukan dalam kontrak`);
  return resolveLocal(parameter.schema);
}

const limit = queryParameter('limit');
const cursor = queryParameter('cursor');
const requestIdSchema = resolveLocal(contract.paths['/requests/{requestId}']
  .get.parameters.map(resolveLocal).find((item) => item.name === 'requestId').schema);

function queryCase(name, value, title) {
  const query = new URLSearchParams({ [name]: String(value) });
  return {
    title,
    apiPath: `/requests?${query}`,
    contractPath: '/requests',
    status: 400,
    problemCode: 'invalid-request',
    parameter: name,
    location: 'query',
  };
}

const cases = [
  queryCase('limit', limit.minimum - 1, 'Limit di bawah minimum ditolak 400'),
  queryCase('limit', limit.maximum + 1, 'Limit di atas maksimum ditolak 400'),
  queryCase('limit', limit.minimum + 0.5, 'Limit pecahan ditolak 400'),
  queryCase('status', 'not-a-status', 'Status tidak dikenal ditolak 400'),
  queryCase('cursor', 'x'.repeat(cursor.maxLength + 1), 'Cursor terlalu panjang ditolak 400'),
  {
    title: 'ID berformat valid yang tidak ditemukan menghasilkan 404',
    apiPath: `/requests/req_missing_${randomUUID()}`,
    contractPath: '/requests/{requestId}',
    status: 404,
    problemCode: 'resource-not-found',
  },
  {
    title: 'ID terlalu pendek menghasilkan 400 yang tercantum dalam kontrak',
    apiPath: `/requests/${'x'.repeat(requestIdSchema.minLength - 1)}`,
    contractPath: '/requests/{requestId}',
    status: 400,
    problemCode: 'invalid-request',
    parameter: 'requestId',
    location: 'path',
  },
];

for (const scenario of cases) {
  test(scenario.title, async () => {
    const response = await fetch(`${baseUrl}${scenario.apiPath}`, {
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, scenario.status,
      `Diharapkan ${scenario.status}, diterima ${response.status}`);

    // Respons aktual wajib dicantumkan pada operasi yang menghasilkannya.
    const declared = contract.paths[scenario.contractPath].get
      .responses[String(response.status)];
    assert.ok(declared,
      `GET ${scenario.contractPath}: respons ${response.status} belum dideklarasikan di openapi.yaml`);

    const mediaType = (response.headers.get('content-type') || '')
      .split(';')[0].trim().toLowerCase();
    assert.equal(mediaType, 'application/problem+json');

    const documented = resolveLocal(declared).content[mediaType];
    assert.ok(documented?.schema, 'Schema respons error tidak ditemukan');
    const validate = ajv.compile({
      ...documented.schema,
      components: { schemas: contract.components.schemas },
    });
    const body = await response.json();
    assert.ok(validate(body), ajv.errorsText(validate.errors, { separator: '\n' }));
    assert.equal(body.status, response.status);

    // URI jenis masalah diperiksa terhadap katalog contoh pada kontrak.
    const examples = documented.example ? [documented.example]
      : Object.values(documented.examples || {}).map((entry) => resolveLocal(entry).value);
    const expected = examples.find((entry) =>
      entry?.type?.endsWith(`/${scenario.problemCode}`));
    assert.ok(expected, `Contoh Problem ${scenario.problemCode} tidak ditemukan`);
    assert.equal(body.type, expected.type);

    if (scenario.parameter) {
      assert.ok(Array.isArray(body.invalidParameters), 'Daftar parameter tidak valid wajib tersedia');
      assert.ok(body.invalidParameters.some((entry) =>
        entry.name === scenario.parameter && entry.location === scenario.location),
      `Error harus menunjukkan parameter ${scenario.parameter} pada ${scenario.location}`);
    }
  });
}
