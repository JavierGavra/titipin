const { randomUUID } = require('node:crypto');

    const problems = {
    'invalid-request': {
        status: 400,
        title: 'Invalid request',
        detail: 'The request could not be processed as documented.',
    },
    'resource-not-found': {
        status: 404,
        title: 'Resource not found',
        detail: 'The requested resource was not found.',
    },
    'internal-error': {
        status: 500,
        title: 'An internal error occurred',
        detail: 'The service could not complete the request.',
    },
    'service-unavailable': {
        status: 503,
        title: 'Service is temporarily unavailable',
        detail: 'The service is temporarily unable to process the request.',
    },
};

function sendProblem(res, code, options = {}) {
  const problem = problems[code];

  if (!problem) {
    throw new Error('Problem type belum terdaftar: ' + code);
  }

  const instance = options.instance ?? 'urn:uuid:' + randomUUID();

  return res.status(problem.status).type('application/problem+json').json({
    ...options.extensions,
    type: 'https://api.titipin.example/problems/' + code,
    title: problem.title,
    status: problem.status,
    detail: options.detail ?? problem.detail,
    instance,
  });
}

const bodyErrorTypes = new Set([
  'entity.parse.failed',
  'entity.too.large',
  'encoding.unsupported',
  'charset.unsupported',
  'request.size.invalid',
  'request.aborted',
]);

const unavailableCodes = new Set([
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT',
  'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'EAI_AGAIN',
  '08000', '08001', '08003', '08006',
  '53300', '57P01', '57P02', '57P03',
]);

// Pesan koneksi dari pg 8.23.0 / pg-pool 3.14.0 tanpa code.
const unavailableMessages = new Set([
  'timeout exceeded when trying to connect',
  'Connection terminated due to connection timeout',
  'timeout expired',
  'Connection terminated unexpectedly',
]);

function isDependencyUnavailable(error, seen = new Set()) {
  if (error === null || typeof error !== 'object' || seen.has(error)) {
    return false;
  }

  seen.add(error);

  if (unavailableCodes.has(error.code)) {
    return true;
  }

  if (error.code == null && unavailableMessages.has(error.message)) {
    return true;
  }

  if (isDependencyUnavailable(error.cause, seen)) {
    return true;
  }

  return Array.isArray(error.errors)
    && error.errors.some((item) => isDependencyUnavailable(item, seen));
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }
  if (error instanceof URIError && error.status === 400) {
  return sendProblem(res, 'invalid-request', {
    detail: 'The request path contains invalid URL encoding.',
    extensions: {
      invalidParameters: [
        {
          name: 'path',
          location: 'path',
          reason: 'The request path could not be decoded.',
        },
      ],
    },
  });
}

  if (bodyErrorTypes.has(error.type)) {
    const reason = error.type === 'entity.parse.failed'
      ? 'The request body could not be parsed as valid JSON.'
      : 'The request body could not be processed.';

    return sendProblem(res, 'invalid-request', {
      detail: reason,
      extensions: {
        invalidParameters: [
          { name: 'body', location: 'body', reason },
        ],
      },
    });
  }

  const instance = 'urn:uuid:' + randomUUID();

  console.error({
    instance,
    method: req.method,
    path: req.path,
    error,
  });

  if (isDependencyUnavailable(error)) {
  const retryAfterSeconds = 10;

  res.set('Retry-After', String(retryAfterSeconds));

  return sendProblem(res, 'service-unavailable', {
    instance,
    extensions: { retryAfterSeconds },
  });
}

return sendProblem(res, 'internal-error', { instance });
}


module.exports = { sendProblem, errorHandler };