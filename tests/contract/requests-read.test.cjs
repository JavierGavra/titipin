const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');
const Ajv2020 = require('ajv/dist/2020').default;
const addFormats = require('ajv-formats');

// BASE_URL sudah mencakup /v1.
const baseUrl = (process.env.BASE_URL || 'http://127.0.0.1:8080/v1')
  .replace(/\/+$/, '');

const contract = YAML.parse(fs.readFileSync(
  path.resolve(__dirname, '../../openapi.yaml'), 'utf8'
));

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);

// Keduanya metadata/container OpenAPI, bukan aturan validasi data.
ajv.addVocabulary(['example', 'components']);

function validatorFor(contractPath) {
  const schema = contract.paths[contractPath].get.responses['200']
    .content['application/json'].schema;

  return ajv.compile({
    ...schema,
    components: { schemas: contract.components.schemas },
  });
}

const validatePage = validatorFor('/requests');
const validateRequest = validatorFor('/requests/{requestId}');

async function getAndValidate(apiPath, validate) {
  const response = await fetch(`${baseUrl}${apiPath}`, {
    signal: AbortSignal.timeout(15000),
  });

  assert.equal(response.status, 200,
    `GET ${apiPath}: diharapkan 200, diterima ${response.status}`);

  const mediaType = (response.headers.get('content-type') || '')
    .split(';')[0].trim().toLowerCase();
  assert.equal(mediaType, 'application/json');

  const body = await response.json();
  const valid = validate(body);
  assert.ok(valid, ajv.errorsText(validate.errors, { separator: '\n' }));

  return body;
}

test('GET daftar request sesuai kontrak dan limit', async () => {
  const page = await getAndValidate('/requests?limit=1', validatePage);

  assert.equal(page.page.limit, 1);
  assert.ok(page.items.length <= 1, 'Jumlah item melebihi limit=1');
});

test('GET detail request sesuai kontrak dan ID yang diminta', async () => {
  const page = await getAndValidate('/requests?limit=1', validatePage);
  assert.ok(page.items.length > 0,
    'Tes detail membutuhkan minimal satu request sebagai data uji.');

  const requestId = page.items[0].requestId;
  const item = await getAndValidate(
    `/requests/${encodeURIComponent(requestId)}`, validateRequest
  );

  assert.equal(item.requestId, requestId);
});
