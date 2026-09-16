'use strict';

const pino = require('pino');
const { randomUUID } = require('node:crypto');

const secretKey = /^(authorization|cookie|set-cookie|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|password)$/i;
function sanitize(value, seen = new WeakSet()) {
  if (value instanceof Error) return { name: 'Error', reason: 'request_failed' };
  if (typeof value === 'string') return value
    .replace(/Bearer\s+[^\s,;]+/gi, '[redacted]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[redacted]');
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => sanitize(v, seen));
  return Object.fromEntries(Object.entries(value).map(([key, v]) =>
    [key, secretKey.test(key) ? '[redacted]' : sanitize(v, seen)]));
}

function createLogger(destination) {
  return pino({
    level: process.env.LOG_LEVEL || 'info',
    redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'], censor: '[redacted]' },
    hooks: {
      logMethod(args, method) { return method.apply(this, args.map((arg) => sanitize(arg))); },
    },
  }, destination);
}

const logger = createLogger();
function requestLogger(req, res, next) {
  req.correlationId = randomUUID();
  req.log = logger;
  res.set('X-Request-Id', req.correlationId);
  res.once('finish', () => logger.info({
    method: req.method,
    // Log the route template, never the raw URL, query string or URL parameters.
    path: req.route?.path || '[unmatched]',
    status: res.statusCode,
    correlationId: req.correlationId,
  }, 'request completed'));
  next();
}

module.exports = { logger, createLogger, requestLogger };
