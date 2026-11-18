import { AgentType } from '@prisma/client';

/**
 * OpenClaw Gateway WebSocket Protocol Frame Schemas
 * Verified against OpenClaw 2026.11.3 (847611d) Gateway Protocol
 */
export interface OpenClawRequestFrame<TParams = Record<string, unknown>> {
  type: 'req';
  id: string;
  method:
    | 'connect'
    | 'health'
    | 'status'
    | 'agent'
    | 'agent.wait'
    | 'chat.send'
    | 'chat.history'
    | string;
  params: TParams;
}

export interface OpenClawResponseFrame<TPayload = unknown> {
  type: 'res';
  id: string;
  ok: boolean;
  payload?: TPayload;
  result?: TPayload;
  error?: {
    code?: string | number;
    message: string;
    details?: unknown;
  };
}

export interface OpenClawEventFrame<TPayload = Record<string, unknown>> {
  type: 'event';
  event: 'connect.challenge' | 'agent' | 'chat' | 'tick' | string;
  payload: TPayload;
  seq?: number;
}

export type OpenClawWireFrame =
  | OpenClawRequestFrame
  | OpenClawResponseFrame
  | OpenClawEventFrame;

export interface ConnectChallengePayload {
  nonce: string;
  ts: number;
}

export interface OpenClawConnectParams {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id: string;
    version: string;
    platform: string;
    mode: 'operator';
  };
  role: 'operator';
  /**
   * Nexora strictly scopes gateway connections to read/write operator scopes
   * and never grants unrestricted `operator.admin` privileges to customer sessions.
   */
  scopes: Array<'operator.read' | 'operator.write'>;
  caps: string[];
  commands: string[];
  permissions: Record<string, boolean>;
  auth: {
    token?: string;
    password?: string;
  };
  locale: string;
  userAgent: string;
  device?: {
    id: string;
    signedAt: number;
    nonce: string;
  };
}

export interface OpenClawAgentRpcParams {
  message: string;
  sessionKey: string;
  idempotencyKey: string;
  agentId?: string;
  systemPrompt?: string;
  allowedTools?: string[];
}

export interface OpenClawAgentAcceptedResult {
  status: 'accepted' | 'ok';
  runId: string;
  acceptedAt?: number;
  payloads?: Array<{
    type: string;
    content?: string;
    text?: string;
  }>;
  summary?: {
    text?: string;
    tokensUsed?: number;
    toolCallsCount?: number;
  };
}

export interface OpenClawAgentWaitParams {
  runId: string;
  timeoutMs?: number;
}

export interface OpenClawAgentWaitResult {
  status: 'ok' | 'error' | 'timeout';
  runId: string;
  startedAt?: number;
  endedAt?: number;
  payloads?: Array<{
    type: string;
    content?: string;
    text?: string;
  }>;
  summary?: {
    text?: string;
    tokensUsed?: number;
    toolCallsCount?: number;
  };
  error?: {
    code?: string;
    message: string;
  } | null;
}

export interface OpenClawChatCompletionsRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  stream?: boolean;
}

export interface OpenClawChatCompletionsResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface OpenClawToolInvokeRequest {
  tool: string;
  action?: string;
  args: Record<string, unknown>;
  sessionKey: string;
}

export interface AgentProgressEvent {
  runId: string;
  sessionKey: string;
  customerId: string;
  state: 'queued' | 'running' | 'streaming' | 'tool_use' | 'completed' | 'failed';
  deltaText?: string;
  toolName?: string;
  timestamp: Date;
}

export interface ExecuteAgentTurnInput {
  customerId: string;
  agentType: AgentType;
  openclawAgentId: string;
  sessionKey: string;
  userMessage: string;
  systemInstructions: string;
  conversationContext?: Array<{ role: 'user' | 'assistant'; content: string }>;
  allowedTools?: string[];
  projectId?: string;
  taskId?: string;
  idempotencyKey?: string;
  timeoutMs?: number;
  useLocalCli?: boolean;
  onProgress?: (event: AgentProgressEvent) => void;
}

export interface ExecuteAgentTurnOutput {
  runId: string;
  sessionKey: string;
  responseText: string;
  tokensUsed: number;
  toolCallsCount: number;
  durationMs: number;
  status: 'COMPLETED' | 'TIMEOUT' | 'FAILED';
  thinkingSummary?: string;
  thinkingDurationMs?: number;
  generatedDocument?: {
    fileName: string;
    filePath: string;
    fileSizeBytes: number;
    estimatedPages: number;
    downloadUrl: string;
    createdAt: string;
  };
  submittedApplications?: Array<{
    receiptId: string;
    targetName: string;
    portalUrl: string;
    applicationUrl: string;
    contactEmail?: string;
    status: string;
    submittedAt: string;
    browserFormProof?: unknown;
  }>;
}
