'use strict';
// Injects TEST_ACCESS_TOKEN as Authorization header into every fetch call
// made by contract tests. This avoids modifying individual test files.
if (process.env.TEST_ACCESS_TOKEN) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = function patchedFetch(input, init = {}) {
    const headers = new Headers(init.headers || {});
    if (!headers.has('Authorization')) {
      headers.set('Authorization', 'Bearer ' + process.env.TEST_ACCESS_TOKEN);
    }
    return originalFetch(input, { ...init, headers });
  };
}
