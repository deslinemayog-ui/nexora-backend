import { PrismaClient } from '@prisma/client';
import { env } from '../config/env';
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

export class PrismaService {
  public readonly client: PrismaClient;
  private isConnected = false;

  constructor(customClient?: PrismaClient) {
    this.client =
      customClient ??
      new PrismaClient({
        datasources: {
          db: {
            url: env.DATABASE_URL,
          },
        },
        log: [
          { emit: 'event', level: 'error' },
          { emit: 'event', level: 'warn' },
        ],
      });
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    await this.client.$connect();
    this.isConnected = true;
    logger.info('Connected to PostgreSQL via Prisma');
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) return;
    await this.client.$disconnect();
    this.isConnected = false;
    logger.info('Disconnected from PostgreSQL');
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.$queryRaw`SELECT 1`;
      return true;
    } catch (err) {
      logger.error({ err }, 'Database health check failed');
      return false;
    }
  }

  /**
   * Returns a tenant-scoped query helper that automatically injects and validates
   * `customerId` on all customer-owned models.
   */
  forTenant(customerId: string) {
    if (!customerId || customerId.trim().length === 0) {
      throw new TenantIsolationError('Valid customerId is required for tenant-scoped queries');
    }

    const prisma = this.client;

    return {
      customerId,
      getProfile: () =>
        prisma.customerProfile.findUnique({
          where: { customerId },
        }),
      listConversations: () =>
        prisma.conversation.findMany({
          where: { customerId },
          orderBy: { lastMessageAt: 'desc' },
        }),
      listMessages: (conversationId: string, limit = 50) =>
        prisma.message.findMany({
          where: { customerId, conversationId },
          orderBy: { createdAt: 'asc' },
          take: limit,
        }),
      listProjects: () =>
        prisma.project.findMany({
          where: { customerId },
          include: { tasks: { orderBy: { stepOrder: 'asc' } } },
          orderBy: { updatedAt: 'desc' },
        }),
      getProject: async (projectId: string) => {
        const project = await prisma.project.findUnique({
          where: { id: projectId },
          include: {
            tasks: { orderBy: { stepOrder: 'asc' } },
            documents: true,
            approvals: true,
          },
        });
        assertTenantOwnership(project, customerId, 'Project');
        return project;
      },
      listTasks: (projectId?: string) =>
        prisma.task.findMany({
          where: { customerId, ...(projectId ? { projectId } : {}) },
          orderBy: [{ stepOrder: 'asc' }, { createdAt: 'asc' }],
        }),
      listDocuments: (projectId?: string) =>
        prisma.document.findMany({
          where: { customerId, ...(projectId ? { projectId } : {}) },
          orderBy: { createdAt: 'desc' },
        }),
      getDocument: async (documentId: string) => {
        const doc = await prisma.document.findUnique({
          where: { id: documentId },
        });
        assertTenantOwnership(doc, customerId, 'Document');
        return doc;
      },
      listApprovals: () =>
        prisma.approval.findMany({
          where: { customerId },
          orderBy: { requestedAt: 'desc' },
        }),
      getApproval: async (approvalId: string) => {
        const approval = await prisma.approval.findUnique({
          where: { id: approvalId },
        });
        assertTenantOwnership(approval, customerId, 'Approval');
        return approval;
      },
      listMemories: (category?: string) =>
        prisma.customerMemory.findMany({
          where: { customerId, ...(category ? { category } : {}) },
          orderBy: { updatedAt: 'desc' },
        }),
    };
  }
}

export const prismaService = new PrismaService();
