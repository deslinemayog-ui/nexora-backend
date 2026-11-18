import { logger } from '../../utils/logger';
import { BaileysWhatsAppClient } from './baileys.client';
import { MessageDeduplicator } from './whatsapp.events';
import {
  ConnectionStateSnapshot,
  ConnectionUpdateHandler,
  DeliveryUpdateHandler,
  IncomingMessageHandler,
  IncomingWhatsAppMessage,
  IWhatsAppProvider,
  OutgoingMessageReceipt,
  OutgoingWhatsAppMessage,
} from './whatsapp.types';

/**
 * High-level WhatsApp service abstraction.
 * Decouples the Nexora AI message processing layer and orchestrator from the
 * underlying transport implementation (Baileys today, Meta Cloud API in future).
 */
export class WhatsAppService {
  private readonly provider: IWhatsAppProvider;
  private readonly serviceDeduplicator = new MessageDeduplicator();
  private readonly messageListeners: IncomingMessageHandler[] = [];

  constructor(provider?: IWhatsAppProvider) {
    this.provider = provider ?? new BaileysWhatsAppClient();

    this.provider.onIncomingMessage(async (msg) => {
      await this.handleProviderIncomingMessage(msg);
    });
  }

  public getProviderName(): string {
    return this.provider.providerName;
  }

  public async start(): Promise<void> {
    await this.provider.start();
  }

  public async stop(): Promise<void> {
    await this.provider.stop();
  }

  public getStatus(): ConnectionStateSnapshot {
    return this.provider.getConnectionState();
  }

  public onMessage(handler: IncomingMessageHandler): void {
    this.messageListeners.push(handler);
  }

  public onDeliveryStatus(handler: DeliveryUpdateHandler): void {
    this.provider.onDeliveryUpdate(handler);
  }

  public onConnectionStatus(handler: ConnectionUpdateHandler): void {
    this.provider.onConnectionUpdate(handler);
  }

  public async sendText(
    recipientJidOrNumber: string,
    text: string,
    quotedExternalMessageId?: string,
  ): Promise<OutgoingMessageReceipt> {
    return this.provider.sendMessage({
      recipientJidOrNumber,
      text,
      quotedExternalMessageId,
    });
  }

  public async sendMedia(
    recipientJidOrNumber: string,
    media: NonNullable<OutgoingWhatsAppMessage['media']>,
  ): Promise<OutgoingMessageReceipt> {
    return this.provider.sendMessage({
      recipientJidOrNumber,
      media,
      text: media.caption,
    });
  }

  public async setTyping(recipientJidOrNumber: string, isTyping: boolean): Promise<void> {
    await this.provider.sendTypingIndicator(recipientJidOrNumber, isTyping);
  }

  public async acknowledgeMessage(jid: string, externalMessageId: string): Promise<void> {
    await this.provider.markMessageRead(jid, externalMessageId);
  }

  private async handleProviderIncomingMessage(message: IncomingWhatsAppMessage): Promise<void> {
    if (!this.serviceDeduplicator.tryAcquire(message.externalMessageId)) {
      logger.debug(
        { externalMessageId: message.externalMessageId },
        'Duplicate message suppressed at WhatsAppService layer',
      );
      return;
    }

    await this.acknowledgeMessage(message.senderJid, message.externalMessageId);

    for (const listener of this.messageListeners) {
      await listener(message);
    }
  }
}
