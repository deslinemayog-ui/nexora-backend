import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const booleanFromString = z
  .union([z.boolean(), z.string()])
  .transform((val) => {
    if (typeof val === 'boolean') return val;
    return val.toLowerCase() === 'true' || val === '1';
  });

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // Database
  DATABASE_URL: z
    .string()
    .min(1)
    .default('postgresql://nexora:nexora_secret_password@localhost:5432/nexora_ai?schema=public'),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional().default(''),
  REDIS_DB: z.coerce.number().int().min(0).default(0),

  // OpenClaw Gateway (Verified against OpenClaw 2026.11.3)
  OPENCLAW_GATEWAY_WS_URL: z.string().url().default('ws://127.0.0.1:18789'),
  OPENCLAW_GATEWAY_HTTP_URL: z.string().url().default('http://127.0.0.1:18789'),
  OPENCLAW_GATEWAY_TOKEN: z.string().default('dev-openclaw-token'),
  OPENCLAW_GATEWAY_PASSWORD: z.string().optional().default(''),
  OPENCLAW_DEFAULT_AGENT_ID: z.string().default('main'),
  OPENCLAW_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60000),
  OPENCLAW_CLIENT_ID: z.string().default('nexora-orchestrator'),

  // WhatsApp Gateway
  WHATSAPP_PROVIDER: z.enum(['baileys', 'mock']).default('baileys'),
  WHATSAPP_AUTH_DIR: z.string().default('./storage/whatsapp-auth'),
  WHATSAPP_BUSINESS_NUMBER: z.string().optional().default(''),
  WHATSAPP_PRINT_QR: booleanFromString.default(true),
  WHATSAPP_MAX_RECONNECT_ATTEMPTS: z.coerce.number().int().min(0).default(10),
  WHATSAPP_RECONNECT_BASE_DELAY_MS: z.coerce.number().int().positive().default(2000),
  WHATSAPP_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(30),

  // Object Storage
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./storage/documents'),
  S3_ENDPOINT: z.string().optional().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('nexora-customer-documents'),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
  S3_FORCE_PATH_STYLE: booleanFromString.default(true),

  // Media & File Limits
  MAX_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(15 * 1024 * 1024),
  CLAMAV_ENABLED: booleanFromString.default(false),
  CLAMAV_HOST: z.string().default('127.0.0.1'),
  CLAMAV_PORT: z.coerce.number().int().positive().default(3310),
  STT_PROVIDER: z.enum(['openclaw', 'local']).default('openclaw'),
  OCR_PROVIDER: z.enum(['openclaw', 'local']).default('openclaw'),

  // Security & Encryption
  ENCRYPTION_KEY_HEX: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY_HEX must be a 64-character hex string (32 bytes)')
    .default('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
  ADMIN_API_KEY: z.string().min(16).default('nexora-dev-admin-api-key-change-in-prod'),
  API_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  API_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
});

export type AppEnv = z.infer<typeof EnvSchema>;

export function validateEnv(rawEnv: NodeJS.ProcessEnv = process.env): AppEnv {
  const parsed = EnvSchema.safeParse(rawEnv);
  if (!parsed.success) {
    const formatted = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${formatted}`);
  }
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = parsed.data.DATABASE_URL;
  }
  return parsed.data;
}

export const env: AppEnv = validateEnv();
