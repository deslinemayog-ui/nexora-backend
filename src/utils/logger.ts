import pino from 'pino';
import { env } from '../config/env';

/**
 * Redacts sensitive credentials, tokens, passport numbers, and identity details from logs.
 * Requirement 11 & 18: Avoid logging passport numbers, identity documents, passwords or other sensitive info.
 */
const REDACT_PATHS = [
  'password',
  '*.password',
  'token',
  '*.token',
  'auth.token',
  'auth.password',
  'headers.authorization',
  'headers["x-admin-api-key"]',
  'passportNumber',
  '*.passportNumber',
  'nationalId',
  '*.nationalId',
  'identityDocumentNumber',
  '*.identityDocumentNumber',
  'secret',
  '*.secret',
  'encryptionKey',
];

const PASSPORT_OR_ID_REGEX =
  /\b(?:passport(?:\s*(?:no|number|#))?\s*[:=-]?\s*[A-Z0-9]{6,12}|id(?:\s*(?:no|number|#))?\s*[:=-]?\s*[A-Z0-9-]{7,18})\b/gi;

export function scrubSensitiveText(input: string): string {
  return input.replace(PASSPORT_OR_ID_REGEX, '[REDACTED_SENSITIVE_ID]');
}

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
  },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
