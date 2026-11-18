import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;

export interface EncryptedPayload {
  ciphertext: Buffer;
  ivHex: string;
  authTagHex: string;
  checksumSha256: string;
}

function getMasterKeyBuffer(keyHex: string = env.ENCRYPTION_KEY_HEX): Buffer {
  const buf = Buffer.from(keyHex, 'hex');
  if (buf.length !== 32) {
    throw new Error('Master encryption key must be exactly 32 bytes (64 hex chars)');
  }
  return buf;
}

/**
 * Encrypts sensitive customer documents or credentials at rest using AES-256-GCM
 * with a customer-scoped Additional Authenticated Data (AAD) binding so ciphertext
 * cannot be transplanted across tenants.
 */
export function encryptBufferForTenant(
  plaintext: Buffer,
  customerId: string,
  keyHex?: string,
): EncryptedPayload {
  const key = getMasterKeyBuffer(keyHex);
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(`tenant:${customerId}`, 'utf8'));

  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const checksumSha256 = crypto.createHash('sha256').update(plaintext).digest('hex');

  return {
    ciphertext: encrypted,
    ivHex: iv.toString('hex'),
    authTagHex: authTag.toString('hex'),
    checksumSha256,
  };
}

/**
 * Decrypts tenant-scoped AES-256-GCM ciphertext. Fails immediately if the
 * requesting customerId does not match the AAD used during encryption.
 */
export function decryptBufferForTenant(
  ciphertext: Buffer,
  customerId: string,
  ivHex: string,
  authTagHex: string,
  keyHex?: string,
): Buffer {
  const key = getMasterKeyBuffer(keyHex);
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAAD(Buffer.from(`tenant:${customerId}`, 'utf8'));
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function sha256Hex(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}
