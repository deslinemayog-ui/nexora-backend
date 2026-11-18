import { execFile } from 'child_process';
import crypto from 'crypto';
import { promisify } from 'util';
import WebSocket from 'ws';

const execFileAsync = promisify(execFile);
import { env } from '../config/env';
import { OpenClawError } from '../utils/errors';
import { logger } from '../utils/logger';
import {
  assertSessionKeyBelongsToTenant,
  enforceScopedToolsPolicy,
} from './openclaw.sessions';
import {
  ConnectChallengePayload,
  OpenClawAgentAcceptedResult,
  OpenClawAgentRpcParams,
  OpenClawAgentWaitParams,
  OpenClawAgentWaitResult,
  OpenClawChatCompletionsRequest,
  OpenClawChatCompletionsResponse,
  OpenClawConnectParams,
  OpenClawEventFrame,
  OpenClawRequestFrame,
  OpenClawResponseFrame,
  OpenClawToolInvokeRequest,
  OpenClawWireFrame,
} from './openclaw.types';

export interface OpenClawClientOptions {
  wsUrl?: string;
  httpUrl?: string;
  token?: string;
  password?: string;
  defaultTimeoutMs?: number;
  clientId?: string;
  wsFactory?: (url: string) => WebSocket;
  httpFetch?: typeof fetch;
}

interface PendingRpcRequest {
  resolve: (payload: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

export type OpenClawEventListener = (frame: OpenClawEventFrame) => void;

/**
 * OpenClaw Gateway Client (WebSocket Control-Plane RPC + HTTP Endpoints)
 * Verified against OpenClaw 2026.11.3 (847611d)
 */
export class OpenClawGatewayClient {
  private readonly wsUrl: string;
  private readonly httpUrl: string;
  private readonly token: string;
  private readonly password?: string;
  private readonly defaultTimeoutMs: number;
  private readonly clientId: string;
  private readonly wsFactory: (url: string) => WebSocket;
  private readonly httpFetch: typeof fetch;

  private ws: WebSocket | null = null;
  private isHandshakeComplete = false;
  private connectPromise: Promise<void> | null = null;
  private readonly pendingRequests = new Map<string, PendingRpcRequest>();
  private readonly eventListeners: OpenClawEventListener[] = [];

  constructor(options: OpenClawClientOptions = {}) {
    this.wsUrl = options.wsUrl ?? env.OPENCLAW_GATEWAY_WS_URL;
    this.httpUrl = (options.httpUrl ?? env.OPENCLAW_GATEWAY_HTTP_URL).replace(/\/+$/, '');
    this.token = options.token ?? env.OPENCLAW_GATEWAY_TOKEN;
    this.password = options.password || env.OPENCLAW_GATEWAY_PASSWORD || undefined;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? env.OPENCLAW_REQUEST_TIMEOUT_MS;
    this.clientId = options.clientId ?? env.OPENCLAW_CLIENT_ID;
    this.wsFactory = options.wsFactory ?? ((url: string) => new WebSocket(url));
    this.httpFetch = options.httpFetch ?? globalThis.fetch;
  }

  public onEvent(listener: OpenClawEventListener): void {
    this.eventListeners.push(listener);
  }

  public isConnected(): boolean {
    return Boolean(
      this.ws && this.ws.readyState === WebSocket.OPEN && this.isHandshakeComplete,
    );
  }

  /**
   * Connects to the OpenClaw Gateway WebSocket and completes the `connect.challenge`
   * -> `connect` handshake.
   */
  public async connect(): Promise<void> {
    if (this.isConnected()) return;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      const handshakeTimeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          this.connectPromise = null;
          reject(new OpenClawError('OpenClaw Gateway WebSocket handshake timed out'));
        }
      }, Math.min(this.defaultTimeoutMs, 10_000));

      try {
        const socket = this.wsFactory(this.wsUrl);
        this.ws = socket;
        let connectSent = false;

        const sendConnectFrame = (challenge?: ConnectChallengePayload) => {
          if (connectSent) return;
          connectSent = true;

          const connectParams: OpenClawConnectParams = {
            minProtocol: 3,
            maxProtocol: 4,
            client: {
              id: this.clientId,
              version: '1.0.0',
              platform: process.platform,
              mode: 'operator',
            },
            role: 'operator',
            scopes: ['operator.read', 'operator.write'],
            caps: [],
            commands: [],
            permissions: {},
            auth: {
              ...(this.token ? { token: this.token } : {}),
              ...(this.password ? { password: this.password } : {}),
            },
            locale: 'en-US',
            userAgent: 'nexora-ai/1.0.0',
            ...(challenge
              ? {
                device: {
                  id: this.clientId,
                  signedAt: challenge.ts,
                  nonce: challenge.nonce,
                },
              }
              : {}),
          };

          this.callRpcInternal('connect', connectParams as unknown as Record<string, unknown>, 8000)
            .then(() => {
              this.isHandshakeComplete = true;
              clearTimeout(handshakeTimeout);
              if (!settled) {
                settled = true;
                resolve();
              }
            })
            .catch((err) => {
              clearTimeout(handshakeTimeout);
              this.connectPromise = null;
              if (!settled) {
                settled = true;
                reject(
                  err instanceof OpenClawError
                    ? err
                    : new OpenClawError('OpenClaw connect handshake rejected', err),
                );
              }
            });
        };

        socket.on('open', () => {
          // Give the gateway 150ms to emit `connect.challenge`; if the gateway does not
          // require a pre-challenge nonce, initiate `connect` immediately.
          setTimeout(() => {
            if (!connectSent && socket.readyState === WebSocket.OPEN) {
              sendConnectFrame();
            }
          }, 150);
        });

        socket.on('message', (rawData) => {
          const text = rawData.toString();
          let frame: OpenClawWireFrame;
          try {
            frame = JSON.parse(text) as OpenClawWireFrame;
          } catch {
            logger.warn('Received non-JSON frame from OpenClaw Gateway');
            return;
          }

          if (frame.type === 'event') {
            if (frame.event === 'connect.challenge' && !connectSent) {
              sendConnectFrame(frame.payload as unknown as ConnectChallengePayload);
              return;
            }
            for (const listener of this.eventListeners) {
              try {
                listener(frame);
              } catch (err) {
                logger.error({ err }, 'Error in OpenClaw event listener');
              }
            }
            return;
          }

          if (frame.type === 'res') {
            this.handleResponseFrame(frame);
          }
        });

        socket.on('error', (err) => {
          logger.debug({ err }, 'OpenClaw WebSocket error');
          if (!settled) {
            clearTimeout(handshakeTimeout);
            settled = true;
            this.connectPromise = null;
            reject(new OpenClawError(`OpenClaw Gateway connection error: ${err.message}`, err));
          }
        });

        socket.on('close', () => {
          this.isHandshakeComplete = false;
          this.connectPromise = null;
          this.rejectAllPending(new OpenClawError('OpenClaw Gateway WebSocket closed'));
        });
      } catch (err) {
        clearTimeout(handshakeTimeout);
        this.connectPromise = null;
        if (!settled) {
          settled = true;
          reject(new OpenClawError('Failed to initialize OpenClaw WebSocket', err));
        }
      }
    });

    return this.connectPromise;
  }

  public async disconnect(): Promise<void> {
    this.isHandshakeComplete = false;
    this.connectPromise = null;
    this.rejectAllPending(new OpenClawError('Client disconnecting'));
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }
  }

  /**
   * Executes a control-plane RPC method over the OpenClaw Gateway WebSocket.
   */
  public async callRpc<TPayload = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs: number = this.defaultTimeoutMs,
  ): Promise<TPayload> {
    if (!this.isConnected()) {
      await this.connect();
    }
    return this.callRpcInternal<TPayload>(method, params, timeoutMs);
  }

  private callRpcInternal<TPayload = unknown>(
    method: string,
    params: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<TPayload> {
    return new Promise<TPayload>((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new OpenClawError('OpenClaw WebSocket is not open'));
        return;
      }

      const id = `req-${crypto.randomUUID()}`;
      const frame: OpenClawRequestFrame = {
        type: 'req',
        id,
        method,
        params,
      };

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(
          new OpenClawError(`OpenClaw RPC method "${method}" timed out after ${timeoutMs}ms`),
        );
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: resolve as (payload: unknown) => void,
        reject,
        timer,
      });

      this.ws.send(JSON.stringify(frame), (err) => {
        if (err) {
          clearTimeout(timer);
          this.pendingRequests.delete(id);
          reject(new OpenClawError(`Failed to send OpenClaw RPC frame "${method}"`, err));
        }
      });
    });
  }

  private handleResponseFrame(frame: OpenClawResponseFrame): void {
    const pending = this.pendingRequests.get(frame.id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pendingRequests.delete(frame.id);

    if (frame.ok === false || frame.error) {
      pending.reject(
        new OpenClawError(
          frame.error?.message || 'OpenClaw Gateway returned an error response',
          frame.error,
        ),
      );
      return;
    }

    pending.resolve((frame.payload ?? frame.result) as unknown);
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pendingRequests.delete(id);
    }
  }

  /**
   * Executes an agent run via the OpenClaw WebSocket `agent` + `agent.wait` two-stage
   * protocol, verifying tenant session isolation before sending.
   */
  public async runAgentViaWebSocket(
    customerId: string,
    params: OpenClawAgentRpcParams,
    timeoutMs: number = this.defaultTimeoutMs,
  ): Promise<OpenClawAgentWaitResult> {
    assertSessionKeyBelongsToTenant(params.sessionKey, customerId);
    const scopedTools = enforceScopedToolsPolicy(params.allowedTools);

    const accepted = await this.callRpc<OpenClawAgentAcceptedResult>(
      'agent',
      {
        message: params.message,
        sessionKey: params.sessionKey,
        idempotencyKey: params.idempotencyKey,
        ...(params.agentId ? { agentId: params.agentId } : {}),
        ...(params.systemPrompt ? { systemPrompt: params.systemPrompt } : {}),
        ...(scopedTools.length > 0 ? { allowedTools: scopedTools } : {}),
      },
      timeoutMs,
    );

    if (accepted.status === 'ok' && (accepted.payloads || accepted.summary)) {
      return {
        status: 'ok',
        runId: accepted.runId || `run-${crypto.randomUUID()}`,
        payloads: accepted.payloads,
        summary: accepted.summary,
      };
    }

    const waitParams: OpenClawAgentWaitParams = {
      runId: accepted.runId,
      timeoutMs,
    };

    return this.callRpc<OpenClawAgentWaitResult>(
      'agent.wait',
      waitParams as unknown as Record<string, unknown>,
      timeoutMs + 2000,
    );
  }

  /**
   * Sends a chat message via the OpenClaw Gateway HTTP `/v1/chat/completions` endpoint
   * using standard `Authorization: Bearer <token>`, `x-openclaw-agent-id`, and
   * `x-openclaw-session-key` headers.
   */
  public async createChatCompletionHttp(
    customerId: string,
    openclawAgentId: string,
    sessionKey: string,
    requestBody: OpenClawChatCompletionsRequest,
    timeoutMs: number = this.defaultTimeoutMs,
  ): Promise<OpenClawChatCompletionsResponse> {
    assertSessionKeyBelongsToTenant(sessionKey, customerId);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.httpFetch(`${this.httpUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token || this.password || ''}`,
          'x-openclaw-agent-id': openclawAgentId,
          'x-openclaw-session-key': sessionKey,
        },
        body: JSON.stringify({
          ...requestBody,
          model: requestBody.model || `openclaw:${openclawAgentId}`,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        throw new OpenClawError(
          `OpenClaw HTTP /v1/chat/completions failed with status ${response.status}`,
          errBody,
        );
      }

      return (await response.json()) as OpenClawChatCompletionsResponse;
    } catch (err) {
      if (err instanceof OpenClawError) throw err;
      throw new OpenClawError(
        `OpenClaw HTTP request failed: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Invokes a permitted OpenClaw tool via `POST /tools/invoke`.
   */
  public async invokeToolHttp<TResult = unknown>(
    customerId: string,
    request: OpenClawToolInvokeRequest,
    timeoutMs: number = this.defaultTimeoutMs,
  ): Promise<TResult> {
    assertSessionKeyBelongsToTenant(request.sessionKey, customerId);
    const allowed = enforceScopedToolsPolicy([request.tool]);
    if (allowed.length === 0) {
      throw new OpenClawError(`Tool "${request.tool}" is forbidden by Nexora security policy`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await this.httpFetch(`${this.httpUrl}/tools/invoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.token || this.password || ''}`,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => '');
        throw new OpenClawError(
          `OpenClaw /tools/invoke failed with status ${response.status}`,
          errText,
        );
      }

      return (await response.json()) as TResult;
    } finally {
      clearTimeout(timeout);
    }
  }

  public async checkHealth(): Promise<{ healthy: boolean; transport: string }> {
    try {
      await this.callRpc('health', {}, 3000);
      return { healthy: true, transport: 'websocket-rpc' };
    } catch {
      return { healthy: false, transport: 'websocket-rpc' };
    }
  }

  /**
   * Executes an isolated turn using the installed OpenClaw CLI embedded agent engine
   * (`openclaw agent --local --session-key <sessionKey> --thinking minimal --message <prompt> --json`)
   * when the standalone Gateway daemon on port 18789 is not active.
   */
  public async runAgentViaEmbeddedCli(
    customerId: string,
    params: {
      sessionKey: string;
      systemPrompt: string;
      userMessage: string;
      conversationContext?: Array<{ role: 'user' | 'assistant'; content: string }>;
    },
    timeoutMs: number = this.defaultTimeoutMs,
  ): Promise<OpenClawAgentWaitResult> {
    assertSessionKeyBelongsToTenant(params.sessionKey, customerId);

    const recentHistoryBlock =
      params.conversationContext && params.conversationContext.length > 0
        ? [
          'RECENT CONVERSATION CONTEXT:',
          ...params.conversationContext
            .slice(-6)
            .map((t) => `${t.role.toUpperCase()}: ${t.content}`),
        ].join('\n')
        : '';

    const compositeMessage = [
      params.systemPrompt,
      'CRITICAL EXECUTION RULE: Do NOT ask the customer clarifying questions or tell the customer what to do. You are an autonomous execution agent. Use the scraped web data, discovered portals, and submitted application receipts provided in the prompt to deliver a complete execution report. Do NOT call the "message" channel tool; output your complete response directly as assistant text.',
      recentHistoryBlock,
      'CUSTOMER MESSAGE:',
      params.userMessage,
    ]
      .filter(Boolean)
      .join('\n\n');

    const { stdout } = await execFileAsync(
      'openclaw',
      [
        'agent',
        '--local',
        '--session-key',
        params.sessionKey,
        '--thinking',
        'low',
        '--message',
        compositeMessage,
        '--json',
      ],
      {
        timeout: timeoutMs,
        maxBuffer: 10 * 1024 * 1024,
        env: process.env,
      },
    );

    const match = stdout.match(/\{\s*"payloads"\s*:[\s\S]*\}/);
    const jsonSlice = match
      ? match[0]
      : (() => {
        const s = stdout.indexOf('{');
        const e = stdout.lastIndexOf('}');
        return s !== -1 && e > s ? stdout.slice(s, e + 1) : '';
      })();

    if (!jsonSlice) {
      throw new OpenClawError('OpenClaw embedded CLI did not return valid JSON output');
    }

    const parsed = JSON.parse(jsonSlice) as {
      payloads?: Array<{ text?: string; content?: string }>;
      meta?: {
        durationMs?: number;
        finalAssistantVisibleText?: string;
        agentMeta?: {
          usage?: { total?: number };
          terminalReceipt?: { runId?: string };
        };
      };
    };

    const replyText =
      parsed.payloads
        ?.map((p) => p.text ?? p.content ?? '')
        .filter(Boolean)
        .join('\n')
        .trim() ||
      parsed.meta?.finalAssistantVisibleText?.trim() ||
      '';

    if (!replyText) {
      throw new OpenClawError('OpenClaw embedded CLI returned empty response text');
    }

    return {
      status: 'ok',
      runId: parsed.meta?.agentMeta?.terminalReceipt?.runId ?? `cli-run-${crypto.randomUUID()}`,
      payloads: [{ type: 'text', content: replyText }],
      summary: {
        text: replyText,
        tokensUsed: parsed.meta?.agentMeta?.usage?.total ?? 0,
        toolCallsCount: 0,
      },
    };
  }
}
