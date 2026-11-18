import { AnyMessageContent } from '@whiskeysockets/baileys';
import { env } from '../../config/env';
import { RateLimitError, WhatsAppError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import { isIndividualConversationJid, toWhatsAppJid } from './whatsapp.events';
import { OutgoingMessageReceipt, OutgoingWhatsAppMessage } from './whatsapp.types';

export interface BaileysSendSocket {
  sendMessage(
    jid: string,
    content: AnyMessageContent,
  ): Promise<{ key?: { id?: string | null } } | undefined>;
}

/**
 * Outbound WhatsApp sender with per-recipient and global sliding-window rate limiting
 * and automatic retry on transient socket failures.
 */
export class WhatsAppSender {
  private readonly globalTimestamps: number[] = [];
  private readonly recipientTimestamps = new Map<string, number[]>();
  private readonly maxPerMinute: number;

  constructor(maxPerMinute: number = env.WHATSAPP_RATE_LIMIT_PER_MINUTE) {
    this.maxPerMinute = maxPerMinute;
  }

  private enforceRateLimit(recipientJid: string): void {
    const now = Date.now();
    const windowMs = 60_000;

    while (this.globalTimestamps.length > 0 && now - this.globalTimestamps[0]! >= windowMs) {
      this.globalTimestamps.shift();
    }

    if (this.globalTimestamps.length >= this.maxPerMinute * 3) {
      throw new RateLimitError('Global WhatsApp outbound message rate limit reached');
    }

    const recipientHistory = this.recipientTimestamps.get(recipientJid) ?? [];
    const activeRecipientHistory = recipientHistory.filter((ts) => now - ts < windowMs);

    if (activeRecipientHistory.length >= this.maxPerMinute) {
      throw new RateLimitError(
        `Per-recipient WhatsApp rate limit (${this.maxPerMinute}/min) exceeded for ${recipientJid}`,
      );
    }

    activeRecipientHistory.push(now);
    this.recipientTimestamps.set(recipientJid, activeRecipientHistory);
    this.globalTimestamps.push(now);
  }

  public buildBaileysContent(payload: OutgoingWhatsAppMessage): AnyMessageContent {
    if (payload.media) {
      const { buffer, mimeType, fileName, caption, isVoiceNote } = payload.media;
      if (mimeType.startsWith('image/')) {
        return {
          image: buffer,
          caption: caption ?? payload.text,
          mimetype: mimeType,
        };
      }
      if (mimeType.startsWith('audio/')) {
        return {
          audio: buffer,
          mimetype: mimeType,
          ptt: Boolean(isVoiceNote),
        };
      }
      return {
        document: buffer,
        mimetype: mimeType,
        fileName: fileName || 'document.pdf',
        caption: caption ?? payload.text,
      };
    }

    if (!payload.text || payload.text.trim().length === 0) {
      throw new WhatsAppError('Outgoing WhatsApp message must contain either text or media');
    }

    return {
      text: payload.text,
    };
  }

  public async sendWithRetry(
    socket: BaileysSendSocket,
    payload: OutgoingWhatsAppMessage,
    maxRetries = 2,
  ): Promise<OutgoingMessageReceipt> {
    const recipientJid = toWhatsAppJid(payload.recipientJidOrNumber);
    if (!isIndividualConversationJid(recipientJid)) {
      throw new WhatsAppError(
        `Blocked outbound message to non-individual or group JID (${recipientJid})`,
      );
    }
    this.enforceRateLimit(recipientJid);

    const content = this.buildBaileysContent(payload);
    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await socket.sendMessage(recipientJid, content);
        const externalMessageId =
          result?.key?.id || `out-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        return {
          externalMessageId,
          recipientJid,
          timestamp: new Date(),
          status: 'SENT',
        };
      } catch (err) {
        lastError = err;
        logger.warn(
          { err, recipientJid, attempt },
          'Transient error sending WhatsApp message; retrying if attempts remain',
        );
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
        }
      }
    }

    throw new WhatsAppError('Failed to send WhatsApp message after retries', lastError);
  }
}
