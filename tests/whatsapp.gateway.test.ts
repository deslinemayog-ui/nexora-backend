import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { DisconnectReason, WASocket, proto } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { BaileysWhatsAppClient } from '../src/channels/whatsapp/baileys.client';
import { WhatsAppService } from '../src/channels/whatsapp/whatsapp.service';
import { IncomingWhatsAppMessage } from '../src/channels/whatsapp/whatsapp.types';

class FakeBaileysEventEmitter extends EventEmitter {
  public on(event: string, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }
}

function createFakeBaileysSocket() {
  const ev = new FakeBaileysEventEmitter();
  const sentMessages: Array<{ jid: string; content: unknown }> = [];
  const readReceipts: unknown[] = [];

  const socket = {
    ev,
    user: { id: '447700900000:1@s.whatsapp.net' },
    sendMessage: vi.fn(async (jid: string, content: unknown) => {
      sentMessages.push({ jid, content });
      return {
        key: {
          id: `wa-out-${sentMessages.length}`,
          remoteJid: jid,
          fromMe: true,
        },
      };
    }),
    sendPresenceUpdate: vi.fn(async () => {}),
    readMessages: vi.fn(async (keys: unknown[]) => {
      readReceipts.push(...keys);
    }),
    end: vi.fn(),
  } as unknown as WASocket;

  return { socket, ev, sentMessages, readReceipts };
}

describe('WhatsApp Gateway – Baileys Connection, Reconnection, Messaging & Deduplication', () => {
  it('connects via QR code, transitions to CONNECTED, and automatically reconnects after transient disconnect', async () => {
    const sockets: ReturnType<typeof createFakeBaileysSocket>[] = [];
    const states: string[] = [];

    const client = new BaileysWhatsAppClient({
      authDir: '/tmp/nexora-test-wa-auth',
      printQrInTerminal: false,
      maxReconnectAttempts: 3,
      reconnectBaseDelayMs: 20,
      socketFactory: async () => {
        const created = createFakeBaileysSocket();
        sockets.push(created);
        return created.socket;
      },
    });

    client.onConnectionUpdate((state) => {
      states.push(state.status);
    });

    await client.start();
    expect(sockets.length).toBe(1);

    // Emit QR event then open connection
    sockets[0]!.ev.emit('connection.update', { qr: 'mock-qr-payload-123' });
    expect(client.getConnectionState().status).toBe('QR_READY');
    expect(client.getConnectionState().qrCode).toBe('mock-qr-payload-123');

    sockets[0]!.ev.emit('connection.update', { connection: 'open' });
    expect(client.getConnectionState().status).toBe('CONNECTED');
    expect(client.getConnectionState().connectedNumber).toBe('+447700900000');

    // Simulate transient network drop (non-loggedOut)
    const transientDisconnectError = new Boom('Connection lost', {
      statusCode: DisconnectReason.connectionLost,
    });
    sockets[0]!.ev.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: transientDisconnectError, date: new Date() },
    });

    expect(client.getConnectionState().status).toBe('RECONNECTING');

    // Wait for automatic reconnect timer
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(sockets.length).toBe(2);

    sockets[1]!.ev.emit('connection.update', { connection: 'open' });
    expect(client.getConnectionState().status).toBe('CONNECTED');

    await client.stop();
    expect(client.getConnectionState().status).toBe('DISCONNECTED');
  });

  it('handles incoming text & media messages, sends outgoing replies, and prevents duplicate message processing', async () => {
    const fake = createFakeBaileysSocket();
    const client = new BaileysWhatsAppClient({
      authDir: '/tmp/nexora-test-wa-auth-2',
      printQrInTerminal: false,
      socketFactory: async () => fake.socket,
      mediaDownloader: async () => Buffer.from('%PDF-1.4 Fake CV Content'),
    });

    const service = new WhatsAppService(client);
    const received: IncomingWhatsAppMessage[] = [];
    service.onMessage(async (msg) => {
      received.push(msg);
    });

    await service.start();
    fake.ev.emit('connection.update', { connection: 'open' });

    const rawTextMessage = {
      key: {
        id: 'msg-unique-101',
        remoteJid: '447700900111@s.whatsapp.net',
        fromMe: false,
      },
      pushName: 'Alice',
      messageTimestamp: Math.floor(Date.now() / 1000),
      message: {
        conversation: 'Find me a job in the UK.',
      },
    };

    // Emit the same message twice to test deduplication
    fake.ev.emit('messages.upsert', {
      type: 'notify',
      messages: [rawTextMessage, rawTextMessage],
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(received.length).toBe(1);
    expect(received[0]!.externalMessageId).toBe('msg-unique-101');
    expect(received[0]!.senderPhoneNumber).toBe('+447700900111');
    expect(received[0]!.textContent).toBe('Find me a job in the UK.');

    // Emit a PDF CV attachment message
    fake.ev.emit('messages.upsert', {
      type: 'notify',
      messages: [
        {
          key: {
            id: 'msg-unique-102',
            remoteJid: '447700900111@s.whatsapp.net',
            fromMe: false,
          },
          pushName: 'Alice',
          messageTimestamp: Math.floor(Date.now() / 1000),
          message: {
            documentMessage: {
              mimetype: 'application/pdf',
              fileName: 'Alice_CV.pdf',
              fileLength: 24,
              caption: 'Here is my CV',
            },
          },
        },
      ],
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(received.length).toBe(2);
    expect(received[1]!.messageType).toBe('PDF');
    expect(received[1]!.media?.fileName).toBe('Alice_CV.pdf');

    // Outgoing message
    const receipt = await service.sendText(
      '+447700900111',
      'I have received your CV and started analysing your qualifications.',
    );
    expect(receipt.status).toBe('SENT');
    expect(fake.sentMessages.length).toBe(1);
    expect(fake.sentMessages[0]!.jid).toBe('447700900111@s.whatsapp.net');

    // Delivery receipt tracking
    const deliveryUpdates: string[] = [];
    service.onDeliveryStatus(async (u) => {
      deliveryUpdates.push(u.status);
    });

    fake.ev.emit('messages.update', [
      {
        key: { id: receipt.externalMessageId, remoteJid: '447700900111@s.whatsapp.net' },
        update: { status: proto.WebMessageInfo.Status.DELIVERY_ACK },
      },
    ]);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(deliveryUpdates).toContain('DELIVERED');

    await service.stop();
  });

  it('strictly ignores all group messages (@g.us, participant-tagged messages, broadcasts, newsletters, and history append syncs) and blocks outbound group sends', async () => {
    const fake = createFakeBaileysSocket();
    const client = new BaileysWhatsAppClient({
      authDir: '/tmp/nexora-test-wa-auth-groups',
      printQrInTerminal: false,
      socketFactory: async () => fake.socket,
    });

    const service = new WhatsAppService(client);
    const received: IncomingWhatsAppMessage[] = [];
    service.onMessage(async (msg) => {
      received.push(msg);
    });

    await service.start();
    fake.ev.emit('connection.update', { connection: 'open' });

    // 1. Emit standard @g.us group message, participant-tagged community message, broadcast, and newsletter
    fake.ev.emit('messages.upsert', {
      type: 'notify',
      messages: [
        {
          key: {
            id: 'grp-msg-1',
            remoteJid: '12036304987654321@g.us',
            participant: '447700900111@s.whatsapp.net',
            fromMe: false,
          },
          message: { conversation: 'Hello group!' },
        },
        {
          key: {
            id: 'grp-msg-2-lid',
            remoteJid: '9988776655@lid',
            participant: '447700900111@s.whatsapp.net',
            fromMe: false,
          },
          message: { conversation: 'Community subgroup message with participant' },
        },
        {
          key: {
            id: 'status-msg-3',
            remoteJid: 'status@broadcast',
            fromMe: false,
          },
          message: { conversation: 'Status update' },
        },
        {
          key: {
            id: 'newsletter-msg-4',
            remoteJid: '120363111111111@newsletter',
            fromMe: false,
          },
          message: { conversation: 'Channel post' },
        },
      ],
    });

    // 2. Emit a 'append' history sync event (should also be ignored)
    fake.ev.emit('messages.upsert', {
      type: 'append',
      messages: [
        {
          key: {
            id: 'history-sync-1',
            remoteJid: '447700900111@s.whatsapp.net',
            fromMe: false,
          },
          message: { conversation: 'Old synced message' },
        },
      ],
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(received.length).toBe(0);
    expect(fake.readReceipts.length).toBe(0);

    // 3. Outbound send to a group JID must be rejected
    await expect(
      service.sendText('12036304987654321@g.us', 'Should never send to a group'),
    ).rejects.toThrow(/Blocked outbound message to non-individual or group JID/);
    expect(fake.sentMessages.length).toBe(0);

    await service.stop();
  });
});
