import fs from 'fs';
import path from 'path';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  WASocket,
  WAMessage,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { env } from '../../config/env';
import { WhatsAppError } from '../../utils/errors';
import { logger } from '../../utils/logger';
import {
  isGroupOrNonDirectBaileysMessage,
  isIndividualConversationJid,
  MessageDeduplicator,
  normalizeWhatsAppNumber,
  parseBaileysIncomingMessage,
  parseBaileysMessageUpdate,
  toWhatsAppJid,
} from './whatsapp.events';
import { WhatsAppSender } from './whatsapp.sender';
import {
  ConnectionStateSnapshot,
  ConnectionUpdateHandler,
  DeliveryUpdateHandler,
  IncomingMessageHandler,
  IWhatsAppProvider,
  OutgoingMessageReceipt,
  OutgoingWhatsAppMessage,
} from './whatsapp.types';

export interface BaileysClientOptions {
  authDir?: string;
  printQrInTerminal?: boolean;
  maxReconnectAttempts?: number;
  reconnectBaseDelayMs?: number;
  socketFactory?: () => Promise<WASocket>;
  mediaDownloader?: (msg: WAMessage) => Promise<Buffer>;
}

export class BaileysWhatsAppClient implements IWhatsAppProvider {
  public readonly providerName = 'baileys';
  private socket: WASocket | null = null;
  private readonly authDir: string;
  private readonly printQrInTerminal: boolean;
  private readonly maxReconnectAttempts: number;
  private readonly reconnectBaseDelayMs: number;
  private readonly customSocketFactory?: () => Promise<WASocket>;
  private readonly customMediaDownloader?: (msg: WAMessage) => Promise<Buffer>;

  private readonly deduplicator = new MessageDeduplicator();
  private readonly sender = new WhatsAppSender();

  private readonly incomingHandlers: IncomingMessageHandler[] = [];
  private readonly deliveryHandlers: DeliveryUpdateHandler[] = [];
  private readonly connectionHandlers: ConnectionUpdateHandler[] = [];

  private state: ConnectionStateSnapshot = {
    status: 'DISCONNECTED',
    reconnectAttempts: 0,
  };
  private isShuttingDown = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(options: BaileysClientOptions = {}) {
    this.authDir = path.resolve(options.authDir ?? env.WHATSAPP_AUTH_DIR);
    this.printQrInTerminal = options.printQrInTerminal ?? env.WHATSAPP_PRINT_QR;
    this.maxReconnectAttempts =
      options.maxReconnectAttempts ?? env.WHATSAPP_MAX_RECONNECT_ATTEMPTS;
    this.reconnectBaseDelayMs =
      options.reconnectBaseDelayMs ?? env.WHATSAPP_RECONNECT_BASE_DELAY_MS;
    this.customSocketFactory = options.socketFactory;
    this.customMediaDownloader = options.mediaDownloader;
  }

  public async start(): Promise<void> {
    this.isShuttingDown = false;
    this.ensureSecureAuthDirectory();
    await this.initializeSocket();
  }

  public async stop(): Promise<void> {
    this.isShuttingDown = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      try {
        this.socket.end(undefined);
      } catch (err) {
        logger.warn({ err }, 'Error closing Baileys socket during shutdown');
      }
      this.socket = null;
    }

    this.updateState({ status: 'DISCONNECTED' });
    logger.info('Baileys WhatsApp Gateway stopped gracefully');
  }

  public getConnectionState(): ConnectionStateSnapshot {
    return { ...this.state };
  }

  public onIncomingMessage(handler: IncomingMessageHandler): void {
    this.incomingHandlers.push(handler);
  }

  public onDeliveryUpdate(handler: DeliveryUpdateHandler): void {
    this.deliveryHandlers.push(handler);
  }

  public onConnectionUpdate(handler: ConnectionUpdateHandler): void {
    this.connectionHandlers.push(handler);
  }

  public async sendMessage(payload: OutgoingWhatsAppMessage): Promise<OutgoingMessageReceipt> {
    if (!this.socket || this.state.status !== 'CONNECTED') {
      throw new WhatsAppError(
        `Cannot send WhatsApp message while gateway status is ${this.state.status}`,
      );
    }
    return this.sender.sendWithRetry(this.socket, payload);
  }

  public async sendTypingIndicator(jidOrNumber: string, isTyping: boolean): Promise<void> {
    if (!this.socket || this.state.status !== 'CONNECTED') return;
    const jid = toWhatsAppJid(jidOrNumber);
    if (!isIndividualConversationJid(jid)) return;
    try {
      await this.socket.sendPresenceUpdate(isTyping ? 'composing' : 'paused', jid);
    } catch (err) {
      logger.debug({ err, jid }, 'Non-fatal error updating typing presence');
    }
  }

  public async markMessageRead(jid: string, externalMessageId: string): Promise<void> {
    if (!this.socket || this.state.status !== 'CONNECTED') return;
    const targetJid = toWhatsAppJid(jid);
    if (!isIndividualConversationJid(targetJid)) return;
    try {
      await this.socket.readMessages([
        {
          remoteJid: targetJid,
          id: externalMessageId,
          fromMe: false,
        },
      ]);
    } catch (err) {
      logger.debug({ err, jid, externalMessageId }, 'Non-fatal error marking message read');
    }
  }

  private ensureSecureAuthDirectory(): void {
    if (!fs.existsSync(this.authDir)) {
      fs.mkdirSync(this.authDir, { recursive: true, mode: 0o700 });
    } else {
      try {
        fs.chmodSync(this.authDir, 0o700);
      } catch {
        // Ignore chmod warnings on filesystems that do not support POSIX permissions
      }
    }
  }

  private async initializeSocket(): Promise<void> {
    this.updateState({ status: 'CONNECTING' });

    let saveCreds: () => Promise<void> = async () => {};

    if (this.customSocketFactory) {
      this.socket = await this.customSocketFactory();
    } else {
      const { state: authState, saveCreds: persistCreds } = await useMultiFileAuthState(
        this.authDir,
      );
      saveCreds = persistCreds;

      let version: [number, number, number] = [2, 3000, 1015901307];
      try {
        const latest = await fetchLatestBaileysVersion();
        version = latest.version;
      } catch (err) {
        logger.debug({ err }, 'Using fallback Baileys WA Web version');
      }

      const silentLogger = pino({ level: 'silent' });
      this.socket = makeWASocket({
        version,
        auth: {
          creds: authState.creds,
          keys: makeCacheableSignalKeyStore(authState.keys, silentLogger as never),
        },
        printQRInTerminal: false,
        logger: silentLogger as never,
        browser: ['Nexora AI Workforce', 'Server', '1.0.0'],
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        // Instruct Baileys at the socket layer to ignore all group, broadcast, and newsletter JIDs
        shouldIgnoreJid: (jid) => !isIndividualConversationJid(jid),
      });
    }

    this.bindSocketEvents(saveCreds);
  }

  private bindSocketEvents(saveCreds: () => Promise<void>): void {
    const sock = this.socket;
    if (!sock) return;

    sock.ev.on('creds.update', async () => {
      try {
        await saveCreds();
      } catch (err) {
        logger.error({ err }, 'Failed to persist WhatsApp authentication credentials');
      }
    });

    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.updateState({
          status: 'QR_READY',
          qrCode: qr,
        });
        if (this.printQrInTerminal) {
          logger.info('Scan the QR code below with your dedicated Nexora AI WhatsApp Business account:');
          qrcode.generate(qr, { small: true });
        }
      }

      if (connection === 'open') {
        const connectedJid = sock.user?.id;
        const connectedNumber = connectedJid
          ? normalizeWhatsAppNumber(connectedJid)
          : env.WHATSAPP_BUSINESS_NUMBER || undefined;

        this.updateState({
          status: 'CONNECTED',
          qrCode: undefined,
          connectedNumber,
          reconnectAttempts: 0,
          lastConnectedAt: new Date(),
          lastError: undefined,
        });

        logger.info(
          { connectedNumber },
          'Nexora AI WhatsApp Gateway connected and ready to receive customer messages',
        );
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as Boom | undefined)?.output?.statusCode;
        const errorMessage = lastDisconnect?.error?.message || 'Connection closed';
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;

        if (isLoggedOut) {
          this.updateState({
            status: 'LOGGED_OUT',
            qrCode: undefined,
            lastError: 'WhatsApp session logged out; re-authentication required',
          });
          logger.error(
            'WhatsApp session was logged out. Clear WHATSAPP_AUTH_DIR and scan QR code again.',
          );
          return;
        }

        if (!this.isShuttingDown) {
          this.scheduleReconnect(errorMessage);
        }
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      // Only respond to real-time incoming messages ('notify'), never history syncs ('append')
      if (type !== 'notify') return;

      for (const waMsg of messages) {
        if (isGroupOrNonDirectBaileysMessage(waMsg)) {
          continue;
        }

        const externalId = waMsg.key?.id;
        if (!externalId) continue;

        if (!this.deduplicator.tryAcquire(externalId)) {
          logger.debug({ externalId }, 'Skipping duplicate incoming WhatsApp message');
          continue;
        }

        try {
          const parsed = await parseBaileysIncomingMessage(waMsg, this.customMediaDownloader);
          if (!parsed) continue;

          for (const handler of this.incomingHandlers) {
            await handler(parsed);
          }
        } catch (err) {
          logger.error(
            { err, externalId, remoteJid: waMsg.key?.remoteJid },
            'Error processing incoming WhatsApp message',
          );
        }
      }
    });

    sock.ev.on('messages.update', async (updates) => {
      for (const rawUpdate of updates) {
        const delivery = parseBaileysMessageUpdate(rawUpdate);
        if (!delivery) continue;

        for (const handler of this.deliveryHandlers) {
          try {
            await handler(delivery);
          } catch (err) {
            logger.error({ err, delivery }, 'Error in delivery update handler');
          }
        }
      }
    });
  }

  private scheduleReconnect(reason: string): void {
    const nextAttempt = this.state.reconnectAttempts + 1;
    if (nextAttempt > this.maxReconnectAttempts) {
      this.updateState({
        status: 'DISCONNECTED',
        lastError: `Max reconnect attempts (${this.maxReconnectAttempts}) exceeded: ${reason}`,
      });
      logger.error(
        { attempts: this.state.reconnectAttempts, reason },
        'WhatsApp Gateway reached maximum reconnection attempts',
      );
      return;
    }

    const delayMs = Math.min(
      this.reconnectBaseDelayMs * Math.pow(2, nextAttempt - 1),
      30_000,
    );

    this.updateState({
      status: 'RECONNECTING',
      reconnectAttempts: nextAttempt,
      lastError: reason,
    });

    logger.warn(
      { attempt: nextAttempt, delayMs, reason },
      'WhatsApp connection interrupted; scheduling automatic reconnection',
    );

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(() => {
      if (!this.isShuttingDown) {
        void this.initializeSocket().catch((err) => {
          logger.error({ err }, 'Reconnect attempt failed');
          this.scheduleReconnect(err instanceof Error ? err.message : 'Reconnect failed');
        });
      }
    }, delayMs);
  }

  private updateState(patch: Partial<ConnectionStateSnapshot>): void {
    this.state = {
      ...this.state,
      ...patch,
    };
    const snapshot = this.getConnectionState();
    for (const handler of this.connectionHandlers) {
      try {
        handler(snapshot);
      } catch (err) {
        logger.error({ err }, 'Error in WhatsApp connection state handler');
      }
    }
  }
}
