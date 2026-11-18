import { downloadMediaMessage, WAMessage, proto } from '@whiskeysockets/baileys';
import { env } from '../../config/env';
import { sha256Hex } from '../../utils/crypto';
import { ValidationError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { IncomingMediaAttachment, NormalizedMessageType } from './whatsapp.types';

const ALLOWED_MIME_PREFIXES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/aac',
];

export interface ExtractedMessageContent {
  messageType: NormalizedMessageType;
  textContent: string;
  mediaDescriptor?: {
    mimeType: string;
    fileName: string;
    fileLength: number;
    isVoiceNote: boolean;
    durationSeconds?: number;
  };
}

/**
 * Unwraps ephemeral/viewOnce wrappers from Baileys proto.IMessage
 * and extracts text and media metadata.
 */
export function extractBaileysMessageContent(
  rawMessage: proto.IMessage | null | undefined,
): ExtractedMessageContent | null {
  if (!rawMessage) return null;

  const msg =
    rawMessage.ephemeralMessage?.message ??
    rawMessage.viewOnceMessage?.message ??
    rawMessage.viewOnceMessageV2?.message ??
    rawMessage.documentWithCaptionMessage?.message ??
    rawMessage;

  if (msg.conversation) {
    return {
      messageType: 'TEXT',
      textContent: msg.conversation.trim(),
    };
  }

  if (msg.extendedTextMessage?.text) {
    return {
      messageType: 'TEXT',
      textContent: msg.extendedTextMessage.text.trim(),
    };
  }

  if (msg.imageMessage) {
    const mimeType = msg.imageMessage.mimetype || 'image/jpeg';
    const fileLength = Number(msg.imageMessage.fileLength ?? 0);
    return {
      messageType: 'IMAGE',
      textContent: (msg.imageMessage.caption ?? '').trim(),
      mediaDescriptor: {
        mimeType,
        fileName: `whatsapp-image-${Date.now()}.jpg`,
        fileLength,
        isVoiceNote: false,
      },
    };
  }

  if (msg.audioMessage) {
    const isVoiceNote = Boolean(msg.audioMessage.ptt);
    const mimeType = msg.audioMessage.mimetype || 'audio/ogg; codecs=opus';
    const fileLength = Number(msg.audioMessage.fileLength ?? 0);
    return {
      messageType: isVoiceNote ? 'VOICE_NOTE' : 'AUDIO',
      textContent: '',
      mediaDescriptor: {
        mimeType,
        fileName: isVoiceNote
          ? `voice-note-${Date.now()}.ogg`
          : `audio-${Date.now()}.mp3`,
        fileLength,
        isVoiceNote,
        durationSeconds: msg.audioMessage.seconds ?? undefined,
      },
    };
  }

  if (msg.documentMessage) {
    const mimeType = msg.documentMessage.mimetype || 'application/octet-stream';
    const isPdf = mimeType.toLowerCase().includes('pdf');
    const fileLength = Number(msg.documentMessage.fileLength ?? 0);
    const fileName =
      msg.documentMessage.fileName ||
      (isPdf ? `document-${Date.now()}.pdf` : `document-${Date.now()}.bin`);
    return {
      messageType: isPdf ? 'PDF' : 'DOCUMENT',
      textContent: (msg.documentMessage.caption ?? '').trim(),
      mediaDescriptor: {
        mimeType,
        fileName,
        fileLength,
        isVoiceNote: false,
      },
    };
  }

  return null;
}

export function validateMediaConstraints(mimeType: string, fileSizeBytes: number): void {
  if (fileSizeBytes > env.MAX_FILE_SIZE_BYTES) {
    throw new ValidationError(
      `Attachment size (${fileSizeBytes} bytes) exceeds maximum allowed limit (${env.MAX_FILE_SIZE_BYTES} bytes)`,
    );
  }

  const normalizedMime = mimeType.split(';')[0].trim().toLowerCase();
  const isAllowed = ALLOWED_MIME_PREFIXES.some(
    (allowed) => normalizedMime === allowed || normalizedMime.startsWith(allowed),
  );
  if (!isAllowed) {
    throw new ValidationError(`Unsupported or disallowed media MIME type: ${normalizedMime}`);
  }
}

export async function downloadIncomingMedia(
  waMessage: WAMessage,
  descriptor: NonNullable<ExtractedMessageContent['mediaDescriptor']>,
  customDownloader?: (msg: WAMessage) => Promise<Buffer>,
): Promise<IncomingMediaAttachment> {
  if (descriptor.fileLength > 0) {
    validateMediaConstraints(descriptor.mimeType, descriptor.fileLength);
  }

  const buffer = customDownloader
    ? await customDownloader(waMessage)
    : ((await downloadMediaMessage(
        waMessage,
        'buffer',
        {},
        {
          logger: logger as never,
          reuploadRequest: async (m) => m,
        },
      )) as Buffer);

  validateMediaConstraints(descriptor.mimeType, buffer.byteLength);

  return {
    buffer,
    mimeType: descriptor.mimeType.split(';')[0].trim().toLowerCase(),
    fileName: descriptor.fileName.replace(/[^a-zA-Z0-9._-]/g, '_'),
    fileSizeBytes: buffer.byteLength,
    sha256Hex: sha256Hex(buffer),
    isVoiceNote: descriptor.isVoiceNote,
    durationSeconds: descriptor.durationSeconds,
  };
}
