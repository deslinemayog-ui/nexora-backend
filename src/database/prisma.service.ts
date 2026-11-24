import { logger } from '../utils/logger';
import { TenantIsolationError } from '../utils/errors';

/**
 * Asserts that a record belongs to the expected tenant (customerId).
 * Enforces strict multi-tenant boundary checks at the data layer.
 */
export function assertTenantOwnership<T extends { customerId?: string | null }>(
  record: T | null | undefined,
  expectedCustomerId: string,
  resourceName = 'Resource',
): asserts record is T & { customerId: string } {
  if (!record) {
    throw new TenantIsolationError(`${resourceName} not found or inaccessible for tenant`);
  }
  if (!expectedCustomerId || record.customerId !== expectedCustomerId) {
    logger.warn(
      {
        expectedCustomerId,
        actualCustomerId: record.customerId,
        resourceName,
      },
      'Blocked cross-tenant resource access attempt',
    );
    throw new TenantIsolationError(
      `Cross-tenant access denied for ${resourceName} (expected tenant ${expectedCustomerId})`,
    );
  }
}

export type PrismaService = undefined;
