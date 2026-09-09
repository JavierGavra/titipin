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
    'invalid-idempotency-key': {
      status: 400,
      title: 'Invalid idempotency key',
      detail: 'Idempotency-Key must be a canonical UUID version 4.',
    },
    'validation-failed': {
      status: 422,
      title: 'Request validation failed',
      detail: 'One or more references cannot be used.',
    },
    'invalid-state-transition': {
      status: 409,
      title: 'State transition is not allowed',
      detail: 'The resource state does not allow this operation.',
    },
    'offer-already-selected': {
      status: 409,
      title: 'An offer has already been selected',
      detail: 'The request already has an assignment.',
    },
    'idempotency-key-reuse': {
      status: 409,
      title: 'Idempotency key reused for a different request',
      detail: 'The supplied Idempotency-Key is already bound to another request.',
    },
    'idempotency-request-in-progress': {
      status: 409,
      title: 'The original request is still being processed',
      detail: 'Retry the same request after the delay in Retry-After.',
    },
};

class ProblemError extends Error {
  constructor(code, options = {}) {
    super(options.detail ?? problems[code]?.detail ?? code);
    this.name = 'ProblemError';
    this.code = code;
    this.options = options;
  }
}

function buildProblem(code, options = {}) {
  const problem = problems[code];

  if (!problem) {
    throw new Error('Problem type belum terdaftar: ' + code);
  }

  return {
    ...options.extensions,
    type: 'https://api.titipin.example/problems/' + code,
    title: problem.title,
    status: problem.status,
    detail: options.detail ?? problem.detail,
    instance: options.instance ?? 'urn:uuid:' + randomUUID(),
  };
}

function sendProblem(res, code, options = {}) {
  const body = buildProblem(code, options);

  if (options.retryAfterSeconds !== undefined) {
    res.set('Retry-After', String(options.retryAfterSeconds));
  }

  return res
    .status(body.status)
    .type('application/problem+json')
    .json(body);
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
  if (error instanceof ProblemError) {
  return sendProblem(res, error.code, error.options);
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


module.exports = {
  sendProblem,
  errorHandler,
  buildProblem,
  ProblemError,
};