export type WhatsAppConnectionStatus =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'QR_READY'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'LOGGED_OUT';

export type NormalizedMessageType =
  | 'TEXT'
  | 'IMAGE'
  | 'AUDIO'
  | 'VOICE_NOTE'
  | 'PDF'
  | 'DOCUMENT';

export interface IncomingMediaAttachment {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  fileSizeBytes: number;
  sha256Hex?: string;
  isVoiceNote?: boolean;
  durationSeconds?: number;
}

export interface IncomingWhatsAppMessage {
  externalMessageId: string;
  senderJid: string;
  senderPhoneNumber: string;
  pushName?: string;
  timestamp: Date;
  messageType: NormalizedMessageType;
  textContent: string;
  media?: IncomingMediaAttachment;
  quotedMessageId?: string;
  rawMessage?: unknown;
}

export interface OutgoingWhatsAppMessage {
  recipientJidOrNumber: string;
  text?: string;
  media?: {
    buffer: Buffer;
    mimeType: string;
    fileName?: string;
    caption?: string;
    isVoiceNote?: boolean;
  };
  quotedExternalMessageId?: string;
}

export interface OutgoingMessageReceipt {
  externalMessageId: string;
  recipientJid: string;
  timestamp: Date;
  status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
}

export interface MessageDeliveryUpdate {
  externalMessageId: string;
  remoteJid: string;
  status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  updatedAt: Date;
}

export interface ConnectionStateSnapshot {
  status: WhatsAppConnectionStatus;
  qrCode?: string;
  connectedNumber?: string;
  reconnectAttempts: number;
  lastConnectedAt?: Date;
  lastError?: string;
}

export type IncomingMessageHandler = (message: IncomingWhatsAppMessage) => Promise<void>;
export type DeliveryUpdateHandler = (update: MessageDeliveryUpdate) => Promise<void>;
export type ConnectionUpdateHandler = (state: ConnectionStateSnapshot) => void;

/**
 * Provider-agnostic WhatsApp Messaging Gateway interface.
 * Allows switching between @whiskeysockets/baileys (for controlled testing)
 * and the official Meta WhatsApp Cloud API without modifying core Nexora logic.
 */
export interface IWhatsAppProvider {
  readonly providerName: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(payload: OutgoingWhatsAppMessage): Promise<OutgoingMessageReceipt>;
  sendTypingIndicator(jidOrNumber: string, isTyping: boolean): Promise<void>;
  markMessageRead(jid: string, externalMessageId: string): Promise<void>;
  getConnectionState(): ConnectionStateSnapshot;
  onIncomingMessage(handler: IncomingMessageHandler): void;
  onDeliveryUpdate(handler: DeliveryUpdateHandler): void;
  onConnectionUpdate(handler: ConnectionUpdateHandler): void;
}
