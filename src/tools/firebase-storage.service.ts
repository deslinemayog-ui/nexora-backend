import { logger } from '../utils/logger';

const STORAGE_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || 'nexora-d7346.firebasestorage.app';

export async function uploadToFirebaseStorage(
  objectPath: string,
  buffer: Buffer,
  contentType = 'application/octet-stream',
): Promise<string | null> {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return null;
  }
  try {
    const url = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o?uploadType=media&name=${encodeURIComponent(objectPath)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': contentType,
      },
      body: new Uint8Array(buffer),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      logger.warn({ status: res.status, objectPath, errText }, 'Firebase Storage upload failed');
      return null;
    }
    const json = (await res.json()) as { name?: string; downloadTokens?: string };
    const storedName = json.name || objectPath;
    const tokenPart = json.downloadTokens
      ? `&token=${encodeURIComponent(json.downloadTokens.split(',')[0])}`
      : '';
    return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(storedName)}?alt=media${tokenPart}`;
  } catch (err) {
    logger.warn({ err, objectPath }, 'Firebase Storage upload error');
    return null;
  }
}

export async function downloadFromFirebaseStorage(
  objectPath: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
    return null;
  }
  try {
    const url = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media`;
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const arrayBuf = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    return { buffer: Buffer.from(arrayBuf), contentType };
  } catch {
    return null;
  }
}
