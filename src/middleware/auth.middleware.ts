import crypto from 'crypto';
import { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../config/env';
import { ForbiddenError, TenantIsolationError, UnauthorizedError } from '../utils/errors';

function timingSafeMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Protects administrative endpoints using timing-safe API key verification
 * and role-based access checks.
 */
export async function requireAdminAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const headerKey =
    (request.headers['x-admin-api-key'] as string | undefined) ??
    (request.headers.authorization?.startsWith('Bearer ')
      ? request.headers.authorization.slice(7).trim()
      : undefined);

  if (!headerKey) {
    throw new UnauthorizedError('Missing administrative API key');
  }

  if (!timingSafeMatch(headerKey, env.ADMIN_API_KEY)) {
    throw new ForbiddenError('Invalid administrative credentials');
  }
}

/**
 * Verifies tenant access: allows either an authenticated Admin or a request carrying
 * a matching `x-tenant-customer-id` header for the route's `:customerId` parameter.
 */
export async function requireTenantOrAdminAuth(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const adminKey =
    (request.headers['x-admin-api-key'] as string | undefined) ??
    (request.headers.authorization?.startsWith('Bearer ')
      ? request.headers.authorization.slice(7).trim()
      : undefined);

  if (adminKey && timingSafeMatch(adminKey, env.ADMIN_API_KEY)) {
    return;
  }

  const tenantHeader = request.headers['x-tenant-customer-id'] as string | undefined;
  const params = request.params as { customerId?: string } | undefined;
  const routeCustomerId = params?.customerId;

  if (!tenantHeader) {
    throw new UnauthorizedError('Authentication required (admin API key or tenant header)');
  }

  if (routeCustomerId && tenantHeader !== routeCustomerId) {
    throw new TenantIsolationError(
      `Tenant header (${tenantHeader}) does not match requested customer resource (${routeCustomerId})`,
    );
  }
}
