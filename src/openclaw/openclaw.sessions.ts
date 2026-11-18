import { TenantIsolationError, ValidationError } from '../utils/errors';

/**
 * Disallowed OpenClaw internal/administrative namespaces and unrestricted host tools.
 * Requirement 5 & 18: Never expose OpenClaw's unrestricted administrative interface
 * or share sessions across tenants. Do not give an AI agent unrestricted shell,
 * filesystem, browser or administrative access.
 */
const FORBIDDEN_SESSION_PREFIXES = ['subagent:', 'cron:', 'acp:', 'admin:', 'system:'];

const FORBIDDEN_HOST_TOOLS = new Set([
  'bash',
  'sh',
  'exec',
  'shell',
  'host_exec',
  'fs_write_host',
  'fs_delete_host',
  'admin_rpc',
  'gateway_config_write',
]);

export interface TenantSessionScope {
  customerId: string;
  openclawAgentId: string;
  scopeType: 'conversation' | 'project' | 'task';
  scopeId: string;
}

function sanitizeSegment(raw: string, fieldName: string): string {
  const cleaned = raw.trim().replace(/[^a-zA-Z0-9_-]/g, '');
  if (!cleaned || cleaned !== raw.trim()) {
    throw new ValidationError(`Invalid identifier segment for ${fieldName}`);
  }
  return cleaned;
}

/**
 * Builds an OpenClaw sessionKey strictly scoped to a single tenant (customerId),
 * specialist agent, and conversation/task context.
 * Format: `agent:<openclawAgentId>:tenant_<customerId>_<scopeType>_<scopeId>`
 */
export function buildTenantSessionKey(scope: TenantSessionScope): string {
  const customerId = sanitizeSegment(scope.customerId, 'customerId');
  const agentId = sanitizeSegment(scope.openclawAgentId, 'openclawAgentId');
  const scopeId = sanitizeSegment(scope.scopeId, 'scopeId');

  const sessionKey = `agent:${agentId}:tenant_${customerId}_${scope.scopeType}_${scopeId}`;
  for (const forbidden of FORBIDDEN_SESSION_PREFIXES) {
    if (sessionKey.toLowerCase().startsWith(forbidden)) {
      throw new ValidationError(`Reserved OpenClaw namespace (${forbidden}) is not allowed`);
    }
  }
  return sessionKey;
}

/**
 * Verifies that an OpenClaw sessionKey belongs to the specified `customerId`.
 * Throws `TenantIsolationError` if a mismatch or spoofing attempt is detected.
 */
export function assertSessionKeyBelongsToTenant(
  sessionKey: string,
  expectedCustomerId: string,
): void {
  if (!sessionKey || !expectedCustomerId) {
    throw new TenantIsolationError('Session key and customerId are required for tenant verification');
  }

  const sanitizedCustomer = sanitizeSegment(expectedCustomerId, 'expectedCustomerId');
  const expectedMarker = `:tenant_${sanitizedCustomer}_`;

  if (!sessionKey.includes(expectedMarker)) {
    throw new TenantIsolationError(
      `OpenClaw sessionKey (${sessionKey}) does not belong to customer (${expectedCustomerId})`,
    );
  }
}

/**
 * Filters an agent's requested tool list against the least-privilege policy,
 * stripping any unrestricted host, shell, or admin tools.
 */
export function enforceScopedToolsPolicy(requestedTools: string[] = []): string[] {
  return requestedTools.filter((tool) => {
    const normalized = tool.trim().toLowerCase();
    return normalized.length > 0 && !FORBIDDEN_HOST_TOOLS.has(normalized);
  });
}

/**
 * Wraps untrusted customer messages, extracted document text, or web content
 * inside explicit boundary delimiters so prompt injection payloads cannot override
 * system instructions or access cross-tenant state.
 */
export function wrapUntrustedCustomerInput(
  customerId: string,
  rawUntrustedText: string,
  sourceLabel: 'WHATSAPP_MESSAGE' | 'DOCUMENT_CONTENT' | 'VOICE_TRANSCRIPT' = 'WHATSAPP_MESSAGE',
): string {
  const neutralized = rawUntrustedText
    .replace(/<\/?untrusted_customer_data[^>]*>/gi, '[escaped_boundary_tag]')
    .trim();

  return [
    `<untrusted_customer_data tenant_id="${customerId}" source="${sourceLabel}">`,
    neutralized,
    `</untrusted_customer_data>`,
  ].join('\n');
}
