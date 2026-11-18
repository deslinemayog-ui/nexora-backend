import {
  isJidBroadcast,
  isJidGroup,
  isJidNewsletter,
  isJidStatusBroadcast,
  WAMessage,
  WAMessageUpdate,
  proto,
} from '@whiskeysockets/baileys';
import { logger } from '../../utils/logger';
import {
  downloadIncomingMedia,
  extractBaileysMessageContent,
} from './whatsapp.media';
import {
  IncomingWhatsAppMessage,
  MessageDeliveryUpdate,
} from './whatsapp.types';

/**
 * Normalizes a WhatsApp JID into an E.164-compatible digits string.
 * Example: "447700900123:12@s.whatsapp.net" -> "+447700900123"
 */
export function normalizeWhatsAppNumber(jidOrNumber: string): string {
  const withoutDomain = jidOrNumber.split('@')[0] ?? jidOrNumber;
  const withoutDevice = withoutDomain.split(':')[0] ?? withoutDomain;
  const digits = withoutDevice.replace(/[^\d]/g, '');
  if (!digits) {
    return jidOrNumber.trim();
  }
  return `+${digits}`;
}

/**
 * Converts a phone number or JID into a standard WhatsApp user JID.
 * Preserves `@g.us`, `@broadcast`, and `@newsletter` domains if passed so
 * downstream guards can detect and reject non-individual JIDs.
 */
export function toWhatsAppJid(jidOrNumber: string): string {
  if (jidOrNumber.includes('@')) {
    const [userPart, domain] = jidOrNumber.split('@');
    const cleanUser = userPart.split(':')[0];
    return `${cleanUser}@${domain}`;
  }
  const digits = jidOrNumber.replace(/[^\d]/g, '');
  return `${digits}@s.whatsapp.net`;
}

/**
 * Strictly checks that a JID belongs to a 1-on-1 individual WhatsApp chat
 * and is NEVER a group (`@g.us`), broadcast, status update, or newsletter/channel.
 */
export function isIndividualConversationJid(jid: string | null | undefined): boolean {
  if (!jid) return false;
  if (jid === 'status@broadcast') return false;
  if (
    Boolean(isJidGroup(jid)) ||
    Boolean(isJidBroadcast(jid)) ||
    Boolean(isJidStatusBroadcast(jid)) ||
    Boolean(isJidNewsletter(jid))
  ) {
    return false;
  }
  if (
    jid.endsWith('@g.us') ||
    jid.endsWith('@newsletter') ||
    jid.endsWith('@broadcast') ||
    jid.includes('@g.us')
  ) {
    return false;
  }
  return jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid');
}

/**
 * Detects whether a raw Baileys WAMessage originated from a WhatsApp group,
 * community subgroup, broadcast list, or newsletter.
 * Note: In WhatsApp's protocol, group messages ALWAYS populate `key.participant`
 * (or top-level `participant`), whereas 1-on-1 direct messages never do.
 */
export function isGroupOrNonDirectBaileysMessage(waMessage: WAMessage): boolean {
  const remoteJid = waMessage.key?.remoteJid;
  if (!isIndividualConversationJid(remoteJid)) {
    return true;
  }

  // Group / community messages carry a participant JID indicating which group member sent it
  if (waMessage.key?.participant || waMessage.participant) {
    return true;
  }

  return false;
}

/**
 * Bounded deduplication cache to ensure no WhatsApp message is processed twice
 * even across socket reconnections or Baileys retry deliveries.
 */
export class MessageDeduplicator {
  private readonly seenIds = new Map<string, number>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(maxEntries = 10000, ttlMs = 24 * 60 * 60 * 1000) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  /**
   * Returns true if the message ID is new and marks it as seen.
   * Returns false if the message ID has already been processed within the TTL window.
   */
  public tryAcquire(externalMessageId: string): boolean {
    if (!externalMessageId) return false;
    const now = Date.now();
    this.evictExpired(now);

    const existingTimestamp = this.seenIds.get(externalMessageId);
    if (existingTimestamp !== undefined && now - existingTimestamp < this.ttlMs) {
      return false;
    }

    if (this.seenIds.size >= this.maxEntries) {
      const oldestKey = this.seenIds.keys().next().value;
      if (oldestKey) {
        this.seenIds.delete(oldestKey);
      }
    }

    this.seenIds.set(externalMessageId, now);
    return true;
  }

  public hasSeen(externalMessageId: string): boolean {
    const ts = this.seenIds.get(externalMessageId);
    if (ts === undefined) return false;
    if (Date.now() - ts >= this.ttlMs) {
      this.seenIds.delete(externalMessageId);
      return false;
    }
    return true;
  }

  private evictExpired(now: number): void {
    if (this.seenIds.size < this.maxEntries / 2) return;
    for (const [key, ts] of this.seenIds.entries()) {
      if (now - ts >= this.ttlMs) {
        this.seenIds.delete(key);
      }
    }
  }
}

export async function parseBaileysIncomingMessage(
  waMessage: WAMessage,
  customMediaDownloader?: (msg: WAMessage) => Promise<Buffer>,
): Promise<IncomingWhatsAppMessage | null> {
  const key = waMessage.key;
  if (!key || !key.id || key.fromMe) {
    return null;
  }

  if (isGroupOrNonDirectBaileysMessage(waMessage)) {
    logger.debug(
      {
        remoteJid: key.remoteJid,
        participant: key.participant ?? waMessage.participant,
      },
      'Ignoring non-individual / group WhatsApp message',
    );
    return null;
  }

  const remoteJid = key.remoteJid!;

  const extracted = extractBaileysMessageContent(waMessage.message);
  if (!extracted) {
    return null;
  }

  let mediaAttachment = undefined;
  if (extracted.mediaDescriptor) {
    try {
      mediaAttachment = await downloadIncomingMedia(
        waMessage,
        extracted.mediaDescriptor,
        customMediaDownloader,
      );
    } catch (err) {
      logger.warn(
        { err, messageId: key.id, remoteJid },
        'Failed to download or validate incoming WhatsApp media attachment',
      );
      throw err;
    }
  }

  const rawTs = Number(waMessage.messageTimestamp ?? Math.floor(Date.now() / 1000));
  const timestamp = new Date(rawTs > 1e12 ? rawTs : rawTs * 1000);

  return {
    externalMessageId: key.id,
    senderJid: toWhatsAppJid(remoteJid!),
    senderPhoneNumber: normalizeWhatsAppNumber(remoteJid!),
    pushName: waMessage.pushName ?? undefined,
    timestamp,
    messageType: extracted.messageType,
    textContent: extracted.textContent,
    media: mediaAttachment,
    quotedMessageId:
      waMessage.message?.extendedTextMessage?.contextInfo?.stanzaId ?? undefined,
    rawMessage: waMessage,
  };
}

export function parseBaileysMessageUpdate(
  update: WAMessageUpdate,
): MessageDeliveryUpdate | null {
  const id = update.key.id;
  const remoteJid = update.key.remoteJid;
  if (!id || !remoteJid) return null;

  const statusEnum = update.update?.status;
  if (statusEnum === undefined || statusEnum === null) return null;

  let mappedStatus: MessageDeliveryUpdate['status'] = 'SENT';
  if (statusEnum === proto.WebMessageInfo.Status.DELIVERY_ACK) {
    mappedStatus = 'DELIVERED';
  } else if (
    statusEnum === proto.WebMessageInfo.Status.READ ||
    statusEnum === proto.WebMessageInfo.Status.PLAYED
  ) {
    mappedStatus = 'READ';
  } else if (statusEnum === proto.WebMessageInfo.Status.ERROR) {
    mappedStatus = 'FAILED';
  }

  return {
    externalMessageId: id,
    remoteJid: toWhatsAppJid(remoteJid),
    status: mappedStatus,
    updatedAt: new Date(),
  };
}
