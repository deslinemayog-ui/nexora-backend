import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  AccountStatus,
  ActionCategory,
  Agent,
  AgentExecution,
  AgentType,
  Approval,
  ApprovalStatus,
  AuditLog,
  Conversation,
  ConversationStatus,
  Customer,
  CustomerMemory,
  CustomerProfile,
  DeliveryStatus,
  Document,
  DocumentType,
  ExecutionStatus,
  Message,
  MessageDirection,
  MessageType,
  Notification,
  NotificationStatus,
  Prisma,
  Priority,
  Project,
  ProjectStatus,
  ScanStatus,
  Subscription,
  SubscriptionStatus,
  SubscriptionTier,
  Task,
  TaskStatus,
} from '@prisma/client';
import { assertTenantOwnership, PrismaService } from './prisma.service';
import { NotFoundError, TenantIsolationError } from '../utils/errors';

/**
 * Multi-tenant repository that persists to PostgreSQL via Prisma when connected,
 * or operates against a deterministic, tenant-isolated in-memory store for standalone
 * execution and automated test suites.
 */
export class NexoraRepository {
  private readonly prisma?: PrismaService;
  private useInMemory: boolean;

  private readonly customers = new Map<string, Customer>();
  private readonly customersByPhone = new Map<string, string>();
  private readonly profiles = new Map<string, CustomerProfile>();
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly conversations = new Map<string, Conversation>();
  private readonly messages = new Map<string, Message>();
  private readonly messagesByExternalId = new Map<string, string>();
  private readonly projects = new Map<string, Project>();
  private readonly tasks = new Map<string, Task>();
  private readonly agents = new Map<AgentType, Agent>();
  private readonly executions = new Map<string, AgentExecution>();
  private readonly documents = new Map<string, Document>();
  private readonly approvals = new Map<string, Approval>();
  private readonly auditLogs: AuditLog[] = [];
  private readonly notifications = new Map<string, Notification>();
  private readonly memories = new Map<string, CustomerMemory>();

  constructor(options: { prisma?: PrismaService; useInMemory?: boolean } = {}) {
    this.prisma = options.prisma;
    this.useInMemory = options.useInMemory ?? !options.prisma;
  }

  public setInMemoryMode(enabled: boolean): void {
    this.useInMemory = enabled;
  }

  private get db() {
    if (!this.prisma) {
      throw new Error('PrismaService not configured on NexoraRepository');
    }
    return this.prisma.client;
  }

  // ==========================================================================
  // Customers & Profiles
  // ==========================================================================

  public async findOrCreateCustomerByWhatsApp(params: {
    whatsappNumber: string;
    whatsappJid: string;
    displayName?: string;
  }): Promise<{ customer: Customer; profile: CustomerProfile; isNew: boolean }> {
    if (!this.useInMemory) {
      const existing = await this.db.customer.findUnique({
        where: { whatsappNumber: params.whatsappNumber },
        include: { profile: true },
      });

      if (existing) {
        const updated = await this.db.customer.update({
          where: { id: existing.id },
          data: {
            lastActivityAt: new Date(),
            ...(params.displayName && !existing.displayName
              ? { displayName: params.displayName }
              : {}),
          },
        });
        const profile =
          existing.profile ??
          (await this.db.customerProfile.create({
            data: { customerId: existing.id, fullName: params.displayName },
          }));
        return { customer: updated, profile, isNew: false };
      }

      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const created = await this.db.$transaction(async (tx) => {
        const customer = await tx.customer.create({
          data: {
            whatsappNumber: params.whatsappNumber,
            whatsappJid: params.whatsappJid,
            displayName: params.displayName ?? null,
            accountStatus: AccountStatus.ACTIVE,
            consentGiven: true,
            consentTimestamp: new Date(),
            consentVersion: '1.0',
          },
        });
        const profile = await tx.customerProfile.create({
          data: {
            customerId: customer.id,
            fullName: params.displayName ?? null,
          },
        });
        await tx.subscription.create({
          data: {
            customerId: customer.id,
            tier: SubscriptionTier.FREE,
            status: SubscriptionStatus.ACTIVE,
            monthlyTaskQuota: 25,
            currentPeriodEnd: periodEnd,
          },
        });
        return { customer, profile };
      });

      return { ...created, isNew: true };
    }

    const existingId = this.customersByPhone.get(params.whatsappNumber);
    if (existingId) {
      const customer = this.customers.get(existingId)!;
      customer.lastActivityAt = new Date();
      customer.updatedAt = new Date();
      if (params.displayName && !customer.displayName) {
        customer.displayName = params.displayName;
      }
      const profile = this.profiles.get(customer.id)!;
      return { customer: { ...customer }, profile: { ...profile }, isNew: false };
    }

    const now = new Date();
    const customerId = crypto.randomUUID();
    const customer: Customer = {
      id: customerId,
      whatsappNumber: params.whatsappNumber,
      whatsappJid: params.whatsappJid,
      displayName: params.displayName ?? null,
      preferredLanguage: 'en',
      accountStatus: AccountStatus.ACTIVE,
      consentGiven: true,
      consentTimestamp: now,
      consentVersion: '1.0',
      creditBalanceCents: 500,
      executionPermissions: {
        autoResearch: true,
        autoDraft: true,
        requireApprovalForExternal: true,
      } as Prisma.JsonValue,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now,
    };

    const profile: CustomerProfile = {
      id: crypto.randomUUID(),
      customerId,
      fullName: params.displayName ?? null,
      email: null,
      countryOfResidence: null,
      nationality: null,
      targetCountries: [],
      currentOccupation: null,
      yearsOfExperience: null,
      educationSummary: null,
      skills: [],
      workExperience: null,
      businessDetails: null,
      preferences: {} as Prisma.JsonValue,
      createdAt: now,
      updatedAt: now,
    };

    const subscription: Subscription = {
      id: crypto.randomUUID(),
      customerId,
      tier: SubscriptionTier.FREE,
      status: SubscriptionStatus.ACTIVE,
      monthlyTaskQuota: 25,
      tasksUsedThisPeriod: 0,
      currentPeriodStart: now,
      currentPeriodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
    };

    this.customers.set(customerId, customer);
    this.customersByPhone.set(params.whatsappNumber, customerId);
    this.profiles.set(customerId, profile);
    this.subscriptions.set(customerId, subscription);

    return { customer: { ...customer }, profile: { ...profile }, isNew: true };
  }

  public async getCustomerById(customerId: string): Promise<Customer> {
    if (!this.useInMemory) {
      const customer = await this.db.customer.findUnique({ where: { id: customerId } });
      if (!customer) throw new NotFoundError('Customer', customerId);
      return customer;
    }
    const customer = this.customers.get(customerId);
    if (!customer) throw new NotFoundError('Customer', customerId);
    return { ...customer };
  }

  public async listCustomers(): Promise<Customer[]> {
    if (!this.useInMemory) {
      return this.db.customer.findMany({ orderBy: { createdAt: 'desc' } });
    }
    return Array.from(this.customers.values()).map((c) => ({ ...c }));
  }

  public async getCustomerProfile(
    requestingCustomerId: string,
    targetCustomerId: string,
  ): Promise<CustomerProfile> {
    if (requestingCustomerId !== targetCustomerId) {
      throw new TenantIsolationError(
        `Customer ${requestingCustomerId} cannot access profile of customer ${targetCustomerId}`,
      );
    }

    if (!this.useInMemory) {
      const profile = await this.db.customerProfile.findUnique({
        where: { customerId: targetCustomerId },
      });
      assertTenantOwnership(profile, requestingCustomerId, 'CustomerProfile');
      return profile;
    }

    const profile = this.profiles.get(targetCustomerId);
    assertTenantOwnership(profile, requestingCustomerId, 'CustomerProfile');
    return { ...profile };
  }

  public async updateCustomerProfile(
    customerId: string,
    patch: Partial<
      Pick<
        CustomerProfile,
        | 'fullName'
        | 'email'
        | 'countryOfResidence'
        | 'nationality'
        | 'targetCountries'
        | 'currentOccupation'
        | 'yearsOfExperience'
        | 'educationSummary'
        | 'skills'
        | 'workExperience'
        | 'businessDetails'
        | 'preferences'
      >
    >,
  ): Promise<CustomerProfile> {
    if (!this.useInMemory) {
      return this.db.customerProfile.update({
        where: { customerId },
        data: {
          ...patch,
          educationSummary: patch.educationSummary ?? undefined,
          workExperience: patch.workExperience ?? undefined,
          businessDetails: patch.businessDetails ?? undefined,
          preferences: patch.preferences ?? undefined,
        },
      });
    }

    const existing = this.profiles.get(customerId);
    assertTenantOwnership(existing, customerId, 'CustomerProfile');
    const updated: CustomerProfile = {
      ...existing,
      ...patch,
      updatedAt: new Date(),
    };
    this.profiles.set(customerId, updated);
    return { ...updated };
  }

  // ==========================================================================
  // Conversations & Messages
  // ==========================================================================

  public async findOrCreateActiveConversation(
    customerId: string,
    sessionKeyBuilder: (conversationId: string) => string,
  ): Promise<Conversation> {
    if (!this.useInMemory) {
      const existing = await this.db.conversation.findFirst({
        where: { customerId, status: ConversationStatus.ACTIVE },
        orderBy: { lastMessageAt: 'desc' },
      });
      if (existing) return existing;

      const convId = crypto.randomUUID();
      return this.db.conversation.create({
        data: {
          id: convId,
          customerId,
          openclawSessionKey: sessionKeyBuilder(convId),
          status: ConversationStatus.ACTIVE,
        },
      });
    }

    for (const conv of this.conversations.values()) {
      if (conv.customerId === customerId && conv.status === ConversationStatus.ACTIVE) {
        return { ...conv };
      }
    }

    const now = new Date();
    const convId = crypto.randomUUID();
    const conv: Conversation = {
      id: convId,
      customerId,
      openclawSessionKey: sessionKeyBuilder(convId),
      status: ConversationStatus.ACTIVE,
      activeProjectId: null,
      summary: null,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(convId, conv);
    return { ...conv };
  }

  public async setConversationActiveProject(
    customerId: string,
    conversationId: string,
    projectId: string | null,
  ): Promise<Conversation> {
    if (!this.useInMemory) {
      const conv = await this.db.conversation.findUnique({ where: { id: conversationId } });
      assertTenantOwnership(conv, customerId, 'Conversation');
      return this.db.conversation.update({
        where: { id: conversationId },
        data: { activeProjectId: projectId, lastMessageAt: new Date() },
      });
    }

    const conv = this.conversations.get(conversationId);
    assertTenantOwnership(conv, customerId, 'Conversation');
    conv.activeProjectId = projectId;
    conv.lastMessageAt = new Date();
    conv.updatedAt = new Date();
    return { ...conv };
  }

  public async hasProcessedExternalMessage(externalMessageId: string): Promise<boolean> {
    if (!externalMessageId) return false;
    if (!this.useInMemory) {
      const count = await this.db.message.count({
        where: { externalMessageId },
      });
      return count > 0;
    }
    return this.messagesByExternalId.has(externalMessageId);
  }

  public async createMessage(params: {
    customerId: string;
    conversationId: string;
    externalMessageId?: string;
    direction: MessageDirection;
    messageType?: MessageType;
    content: string;
    mediaDocumentId?: string;
    deliveryStatus?: DeliveryStatus;
    detectedIntent?: string;
    routedAgentType?: AgentType;
    projectId?: string;
  }): Promise<Message> {
    if (!this.useInMemory) {
      const conv = await this.db.conversation.findUnique({
        where: { id: params.conversationId },
      });
      assertTenantOwnership(conv, params.customerId, 'Conversation');

      return this.db.message.create({
        data: {
          customerId: params.customerId,
          conversationId: params.conversationId,
          externalMessageId: params.externalMessageId ?? null,
          direction: params.direction,
          messageType: params.messageType ?? MessageType.TEXT,
          content: params.content,
          mediaDocumentId: params.mediaDocumentId ?? null,
          deliveryStatus: params.deliveryStatus ?? DeliveryStatus.RECEIVED,
          detectedIntent: params.detectedIntent ?? null,
          routedAgentType: params.routedAgentType ?? null,
          projectId: params.projectId ?? null,
        },
      });
    }

    const conv = this.conversations.get(params.conversationId);
    assertTenantOwnership(conv, params.customerId, 'Conversation');

    const now = new Date();
    const message: Message = {
      id: crypto.randomUUID(),
      customerId: params.customerId,
      conversationId: params.conversationId,
      externalMessageId: params.externalMessageId ?? null,
      direction: params.direction,
      messageType: params.messageType ?? MessageType.TEXT,
      content: params.content,
      mediaDocumentId: params.mediaDocumentId ?? null,
      deliveryStatus: params.deliveryStatus ?? DeliveryStatus.RECEIVED,
      detectedIntent: params.detectedIntent ?? null,
      routedAgentType: params.routedAgentType ?? null,
      projectId: params.projectId ?? null,
      createdAt: now,
      updatedAt: now,
    };

    this.messages.set(message.id, message);
    if (params.externalMessageId) {
      this.messagesByExternalId.set(params.externalMessageId, message.id);
    }
    conv.lastMessageAt = now;
    conv.updatedAt = now;
    return { ...message };
  }

  public async listConversationMessages(
    customerId: string,
    conversationId: string,
    limit = 20,
  ): Promise<Message[]> {
    if (!this.useInMemory) {
      const conv = await this.db.conversation.findUnique({ where: { id: conversationId } });
      assertTenantOwnership(conv, customerId, 'Conversation');
      return this.db.message.findMany({
        where: { customerId, conversationId },
        orderBy: { createdAt: 'asc' },
        take: limit,
      });
    }

    const conv = this.conversations.get(conversationId);
    assertTenantOwnership(conv, customerId, 'Conversation');
    const items = Array.from(this.messages.values())
      .filter((m) => m.customerId === customerId && m.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return items.slice(-limit).map((m) => ({ ...m }));
  }

  // ==========================================================================
  // Persistent Projects & Tasks
  // ==========================================================================

  public async createProjectWithTasks(params: {
    customerId: string;
    title: string;
    objective: string;
    description: string;
    assignedSpecialist: AgentType;
    priority?: Priority;
    expectedCompletionDate?: Date;
    tasks: Array<{
      stepOrder: number;
      title: string;
      description: string;
      assignedSpecialist: AgentType;
      requiresApproval?: boolean;
      actionCategory?: ActionCategory;
    }>;
  }): Promise<{ project: Project; tasks: Task[] }> {
    if (!this.useInMemory) {
      return this.db.$transaction(async (tx) => {
        const project = await tx.project.create({
          data: {
            customerId: params.customerId,
            title: params.title,
            objective: params.objective,
            description: params.description,
            assignedSpecialist: params.assignedSpecialist,
            status: ProjectStatus.IN_PROGRESS,
            priority: params.priority ?? Priority.MEDIUM,
            expectedCompletionDate: params.expectedCompletionDate ?? null,
            executionHistory: [
              {
                timestamp: new Date().toISOString(),
                event: 'PROJECT_CREATED',
                details: `Project "${params.title}" initialized with ${params.tasks.length} tasks.`,
              },
            ],
          },
        });

        const tasks: Task[] = [];
        for (const t of params.tasks) {
          const createdTask = await tx.task.create({
            data: {
              customerId: params.customerId,
              projectId: project.id,
              stepOrder: t.stepOrder,
              title: t.title,
              description: t.description,
              assignedSpecialist: t.assignedSpecialist,
              status: t.stepOrder === 1 ? TaskStatus.IN_PROGRESS : TaskStatus.PENDING,
              priority: params.priority ?? Priority.MEDIUM,
              requiresApproval: Boolean(t.requiresApproval),
              actionCategory: t.actionCategory ?? null,
              startedAt: t.stepOrder === 1 ? new Date() : null,
            },
          });
          tasks.push(createdTask);
        }

        return { project, tasks };
      });
    }

    const now = new Date();
    const projectId = crypto.randomUUID();
    const project: Project = {
      id: projectId,
      customerId: params.customerId,
      title: params.title,
      objective: params.objective,
      description: params.description,
      assignedSpecialist: params.assignedSpecialist,
      status: ProjectStatus.IN_PROGRESS,
      priority: params.priority ?? Priority.MEDIUM,
      expectedCompletionDate: params.expectedCompletionDate ?? null,
      executionHistory: [
        {
          timestamp: now.toISOString(),
          event: 'PROJECT_CREATED',
          details: `Project "${params.title}" initialized with ${params.tasks.length} tasks.`,
        },
      ] as Prisma.JsonValue,
      finalResults: null,
      createdAt: now,
      updatedAt: now,
    };
    this.projects.set(projectId, project);

    const createdTasks: Task[] = params.tasks.map((t) => {
      const task: Task = {
        id: crypto.randomUUID(),
        customerId: params.customerId,
        projectId,
        stepOrder: t.stepOrder,
        title: t.title,
        description: t.description,
        assignedSpecialist: t.assignedSpecialist,
        status: t.stepOrder === 1 ? TaskStatus.IN_PROGRESS : TaskStatus.PENDING,
        priority: params.priority ?? Priority.MEDIUM,
        requiresApproval: Boolean(t.requiresApproval),
        actionCategory: t.actionCategory ?? null,
        inputPayload: null,
        resultPayload: null,
        errorMessage: null,
        retryCount: 0,
        startedAt: t.stepOrder === 1 ? now : null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      this.tasks.set(task.id, task);
      return { ...task };
    });

    return { project: { ...project }, tasks: createdTasks };
  }

  public async getProjectForTenant(
    customerId: string,
    projectId: string,
  ): Promise<{ project: Project; tasks: Task[] }> {
    if (!this.useInMemory) {
      const project = await this.db.project.findUnique({
        where: { id: projectId },
        include: { tasks: { orderBy: { stepOrder: 'asc' } } },
      });
      assertTenantOwnership(project, customerId, 'Project');
      const { tasks, ...rest } = project;
      return { project: rest, tasks };
    }

    const project = this.projects.get(projectId);
    assertTenantOwnership(project, customerId, 'Project');
    const tasks = Array.from(this.tasks.values())
      .filter((t) => t.projectId === projectId && t.customerId === customerId)
      .sort((a, b) => a.stepOrder - b.stepOrder)
      .map((t) => ({ ...t }));
    return { project: { ...project }, tasks };
  }

  public async listCustomerProjects(
    customerId: string,
  ): Promise<Array<{ project: Project; tasks: Task[] }>> {
    if (!this.useInMemory) {
      const rows = await this.db.project.findMany({
        where: { customerId },
        include: { tasks: { orderBy: { stepOrder: 'asc' } } },
        orderBy: { updatedAt: 'desc' },
      });
      return rows.map(({ tasks, ...project }) => ({ project, tasks }));
    }

    const customerProjects = Array.from(this.projects.values())
      .filter((p) => p.customerId === customerId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    return customerProjects.map((project) => ({
      project: { ...project },
      tasks: Array.from(this.tasks.values())
        .filter((t) => t.projectId === project.id && t.customerId === customerId)
        .sort((a, b) => a.stepOrder - b.stepOrder)
        .map((t) => ({ ...t })),
    }));
  }

  public async updateProjectStatus(
    customerId: string,
    projectId: string,
    status: ProjectStatus,
    historyEntry?: { event: string; details: string },
    finalResults?: Record<string, unknown>,
  ): Promise<Project> {
    if (!this.useInMemory) {
      const existing = await this.db.project.findUnique({ where: { id: projectId } });
      assertTenantOwnership(existing, customerId, 'Project');
      const history = Array.isArray(existing.executionHistory)
        ? [...existing.executionHistory]
        : [];
      if (historyEntry) {
        history.push({
          timestamp: new Date().toISOString(),
          ...historyEntry,
        });
      }
      return this.db.project.update({
        where: { id: projectId },
        data: {
          status,
          executionHistory: history as Prisma.InputJsonValue,
          ...(finalResults ? { finalResults: finalResults as Prisma.InputJsonValue } : {}),
        },
      });
    }

    const existing = this.projects.get(projectId);
    assertTenantOwnership(existing, customerId, 'Project');
    const history = Array.isArray(existing.executionHistory)
      ? [...(existing.executionHistory as unknown[])]
      : [];
    if (historyEntry) {
      history.push({
        timestamp: new Date().toISOString(),
        ...historyEntry,
      });
    }
    existing.status = status;
    existing.executionHistory = history as Prisma.JsonValue;
    if (finalResults) {
      existing.finalResults = finalResults as Prisma.JsonValue;
    }
    existing.updatedAt = new Date();
    return { ...existing };
  }

  public async updateTaskStatus(
    customerId: string,
    taskId: string,
    status: TaskStatus,
    resultPayload?: Record<string, unknown>,
    errorMessage?: string,
  ): Promise<Task> {
    if (!this.useInMemory) {
      const existing = await this.db.task.findUnique({ where: { id: taskId } });
      assertTenantOwnership(existing, customerId, 'Task');
      return this.db.task.update({
        where: { id: taskId },
        data: {
          status,
          ...(resultPayload ? { resultPayload: resultPayload as Prisma.InputJsonValue } : {}),
          ...(errorMessage !== undefined ? { errorMessage } : {}),
          ...(status === TaskStatus.IN_PROGRESS && !existing.startedAt
            ? { startedAt: new Date() }
            : {}),
          ...(status === TaskStatus.COMPLETED ? { completedAt: new Date() } : {}),
        },
      });
    }

    const existing = this.tasks.get(taskId);
    assertTenantOwnership(existing, customerId, 'Task');
    existing.status = status;
    if (resultPayload) {
      existing.resultPayload = resultPayload as Prisma.JsonValue;
    }
    if (errorMessage !== undefined) {
      existing.errorMessage = errorMessage;
    }
    if (status === TaskStatus.IN_PROGRESS && !existing.startedAt) {
      existing.startedAt = new Date();
    }
    if (status === TaskStatus.COMPLETED) {
      existing.completedAt = new Date();
    }
    existing.updatedAt = new Date();
    return { ...existing };
  }

  // ==========================================================================
  // Approvals & Audit Logs
  // ==========================================================================

  public async createApproval(params: {
    customerId: string;
    projectId?: string;
    taskId?: string;
    actionCategory: ActionCategory;
    title: string;
    description: string;
    actionPayload: Record<string, unknown>;
    expiresInMs?: number;
  }): Promise<Approval> {
    const expiresAt = new Date(Date.now() + (params.expiresInMs ?? 48 * 60 * 60 * 1000));

    if (!this.useInMemory) {
      return this.db.approval.create({
        data: {
          customerId: params.customerId,
          projectId: params.projectId ?? null,
          taskId: params.taskId ?? null,
          actionCategory: params.actionCategory,
          title: params.title,
          description: params.description,
          actionPayload: params.actionPayload as Prisma.InputJsonValue,
          status: ApprovalStatus.PENDING,
          expiresAt,
        },
      });
    }

    const approval: Approval = {
      id: crypto.randomUUID(),
      customerId: params.customerId,
      projectId: params.projectId ?? null,
      taskId: params.taskId ?? null,
      actionCategory: params.actionCategory,
      title: params.title,
      description: params.description,
      actionPayload: params.actionPayload as Prisma.JsonValue,
      status: ApprovalStatus.PENDING,
      requestedAt: new Date(),
      respondedAt: null,
      customerResponseRaw: null,
      executedAt: null,
      executionResult: null,
      expiresAt,
    };
    this.approvals.set(approval.id, approval);
    return { ...approval };
  }

  public async listPendingApprovals(customerId: string): Promise<Approval[]> {
    if (!this.useInMemory) {
      return this.db.approval.findMany({
        where: { customerId, status: ApprovalStatus.PENDING },
        orderBy: { requestedAt: 'desc' },
      });
    }

    return Array.from(this.approvals.values())
      .filter((a) => a.customerId === customerId && a.status === ApprovalStatus.PENDING)
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())
      .map((a) => ({ ...a }));
  }

  public async getApprovalForTenant(customerId: string, approvalId: string): Promise<Approval> {
    if (!this.useInMemory) {
      const approval = await this.db.approval.findUnique({ where: { id: approvalId } });
      assertTenantOwnership(approval, customerId, 'Approval');
      return approval;
    }

    const approval = this.approvals.get(approvalId);
    assertTenantOwnership(approval, customerId, 'Approval');
    return { ...approval };
  }

  public async resolveApproval(params: {
    customerId: string;
    approvalId: string;
    status: ApprovalStatus;
    customerResponseRaw: string;
    executionResult?: Record<string, unknown>;
  }): Promise<Approval> {
    if (!this.useInMemory) {
      const existing = await this.db.approval.findUnique({
        where: { id: params.approvalId },
      });
      assertTenantOwnership(existing, params.customerId, 'Approval');

      return this.db.approval.update({
        where: { id: params.approvalId },
        data: {
          status: params.status,
          respondedAt: new Date(),
          customerResponseRaw: params.customerResponseRaw,
          ...(params.executionResult
            ? {
                executedAt: new Date(),
                executionResult: params.executionResult as Prisma.InputJsonValue,
              }
            : {}),
        },
      });
    }

    const existing = this.approvals.get(params.approvalId);
    assertTenantOwnership(existing, params.customerId, 'Approval');
    existing.status = params.status;
    existing.respondedAt = new Date();
    existing.customerResponseRaw = params.customerResponseRaw;
    if (params.executionResult) {
      existing.executedAt = new Date();
      existing.executionResult = params.executionResult as Prisma.JsonValue;
    }
    return { ...existing };
  }

  public async createAuditLog(params: {
    customerId?: string;
    actorType: 'CUSTOMER' | 'SYSTEM' | 'ADMIN' | 'AGENT';
    actorId: string;
    action: string;
    resourceType: string;
    resourceId?: string;
    details: Record<string, unknown>;
    ipAddress?: string;
  }): Promise<AuditLog> {
    if (!this.useInMemory) {
      return this.db.auditLog.create({
        data: {
          customerId: params.customerId ?? null,
          actorType: params.actorType,
          actorId: params.actorId,
          action: params.action,
          resourceType: params.resourceType,
          resourceId: params.resourceId ?? null,
          details: params.details as Prisma.InputJsonValue,
          ipAddress: params.ipAddress ?? null,
        },
      });
    }

    const log: AuditLog = {
      id: crypto.randomUUID(),
      customerId: params.customerId ?? null,
      actorType: params.actorType,
      actorId: params.actorId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? null,
      details: params.details as Prisma.JsonValue,
      ipAddress: params.ipAddress ?? null,
      createdAt: new Date(),
    };
    this.auditLogs.push(log);
    return { ...log };
  }

  public async listAuditLogs(customerId?: string, limit = 100): Promise<AuditLog[]> {
    if (!this.useInMemory) {
      return this.db.auditLog.findMany({
        where: customerId ? { customerId } : undefined,
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    }

    const filtered = customerId
      ? this.auditLogs.filter((l) => l.customerId === customerId)
      : this.auditLogs;
    return filtered.slice(-limit).reverse().map((l) => ({ ...l }));
  }

  // ==========================================================================
  // Documents
  // ==========================================================================

  public async createDocument(params: {
    customerId: string;
    projectId?: string;
    documentType: DocumentType;
    originalFileName: string;
    mimeType: string;
    fileSizeBytes: number;
    storageKey: string;
    encryptionIv: string;
    encryptionAuthTag: string;
    checksumSha256: string;
    scanStatus: ScanStatus;
    extractedText?: string;
    structuredMetadata?: Record<string, unknown>;
    isSensitive?: boolean;
  }): Promise<Document> {
    if (!this.useInMemory) {
      return this.db.document.create({
        data: {
          customerId: params.customerId,
          projectId: params.projectId ?? null,
          documentType: params.documentType,
          originalFileName: params.originalFileName,
          mimeType: params.mimeType,
          fileSizeBytes: params.fileSizeBytes,
          storageKey: params.storageKey,
          encryptionIv: params.encryptionIv,
          encryptionAuthTag: params.encryptionAuthTag,
          checksumSha256: params.checksumSha256,
          scanStatus: params.scanStatus,
          extractedText: params.extractedText ?? null,
          structuredMetadata: (params.structuredMetadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          isSensitive: params.isSensitive ?? true,
        },
      });
    }

    const now = new Date();
    const doc: Document = {
      id: crypto.randomUUID(),
      customerId: params.customerId,
      projectId: params.projectId ?? null,
      documentType: params.documentType,
      originalFileName: params.originalFileName,
      mimeType: params.mimeType,
      fileSizeBytes: params.fileSizeBytes,
      storageKey: params.storageKey,
      encryptionIv: params.encryptionIv,
      encryptionAuthTag: params.encryptionAuthTag,
      checksumSha256: params.checksumSha256,
      scanStatus: params.scanStatus,
      extractedText: params.extractedText ?? null,
      structuredMetadata: (params.structuredMetadata as Prisma.JsonValue) ?? null,
      isSensitive: params.isSensitive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.documents.set(doc.id, doc);
    return { ...doc };
  }

  public async getDocumentForTenant(
    requestingCustomerId: string,
    documentId: string,
  ): Promise<Document> {
    if (!this.useInMemory) {
      const doc = await this.db.document.findUnique({ where: { id: documentId } });
      assertTenantOwnership(doc, requestingCustomerId, 'Document');
      return doc;
    }

    const doc = this.documents.get(documentId);
    assertTenantOwnership(doc, requestingCustomerId, 'Document');
    return { ...doc };
  }

  public async listDocumentsForTenant(
    requestingCustomerId: string,
    projectId?: string,
  ): Promise<Document[]> {
    if (!this.useInMemory) {
      return this.db.document.findMany({
        where: {
          customerId: requestingCustomerId,
          ...(projectId ? { projectId } : {}),
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    return Array.from(this.documents.values())
      .filter(
        (d) =>
          d.customerId === requestingCustomerId && (!projectId || d.projectId === projectId),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((d) => ({ ...d }));
  }

  // ==========================================================================
  // Customer Memory
  // ==========================================================================

  public async upsertMemory(params: {
    customerId: string;
    category: string;
    key: string;
    value: string;
    confidence?: number;
    sourceMessageId?: string;
  }): Promise<CustomerMemory> {
    if (!this.useInMemory) {
      return this.db.customerMemory.upsert({
        where: {
          customerId_category_key: {
            customerId: params.customerId,
            category: params.category,
            key: params.key,
          },
        },
        update: {
          value: params.value,
          confidence: params.confidence ?? 1.0,
          sourceMessageId: params.sourceMessageId ?? null,
        },
        create: {
          customerId: params.customerId,
          category: params.category,
          key: params.key,
          value: params.value,
          confidence: params.confidence ?? 1.0,
          sourceMessageId: params.sourceMessageId ?? null,
        },
      });
    }

    const compositeKey = `${params.customerId}::${params.category}::${params.key}`;
    const existing = this.memories.get(compositeKey);
    const now = new Date();
    const record: CustomerMemory = {
      id: existing?.id ?? crypto.randomUUID(),
      customerId: params.customerId,
      category: params.category,
      key: params.key,
      value: params.value,
      confidence: params.confidence ?? 1.0,
      sourceMessageId: params.sourceMessageId ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.memories.set(compositeKey, record);
    return { ...record };
  }

  public async listMemoriesForTenant(
    requestingCustomerId: string,
    targetCustomerId: string = requestingCustomerId,
    category?: string,
  ): Promise<CustomerMemory[]> {
    if (requestingCustomerId !== targetCustomerId) {
      throw new TenantIsolationError(
        `Customer ${requestingCustomerId} cannot read memories of customer ${targetCustomerId}`,
      );
    }

    if (!this.useInMemory) {
      return this.db.customerMemory.findMany({
        where: {
          customerId: requestingCustomerId,
          ...(category ? { category } : {}),
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    return Array.from(this.memories.values())
      .filter(
        (m) =>
          m.customerId === requestingCustomerId && (!category || m.category === category),
      )
      .map((m) => ({ ...m }));
  }

  // ==========================================================================
  // Agent Executions & Notifications
  // ==========================================================================

  public async recordAgentExecution(params: {
    customerId: string;
    agentType: AgentType;
    projectId?: string;
    taskId?: string;
    openclawSessionKey: string;
    openclawRunId?: string;
    status: ExecutionStatus;
    promptSummary: string;
    responseSummary?: string;
    tokensUsed?: number;
    toolCallsCount?: number;
    durationMs?: number;
    errorMessage?: string;
  }): Promise<AgentExecution> {
    if (!this.useInMemory) {
      return this.db.agentExecution.create({
        data: {
          customerId: params.customerId,
          agentType: params.agentType,
          projectId: params.projectId ?? null,
          taskId: params.taskId ?? null,
          openclawSessionKey: params.openclawSessionKey,
          openclawRunId: params.openclawRunId ?? null,
          status: params.status,
          promptSummary: params.promptSummary.slice(0, 1000),
          responseSummary: params.responseSummary?.slice(0, 2000) ?? null,
          tokensUsed: params.tokensUsed ?? 0,
          toolCallsCount: params.toolCallsCount ?? 0,
          durationMs: params.durationMs ?? null,
          errorMessage: params.errorMessage ?? null,
          endedAt:
            params.status === ExecutionStatus.COMPLETED ||
            params.status === ExecutionStatus.FAILED ||
            params.status === ExecutionStatus.TIMEOUT
              ? new Date()
              : null,
        },
      });
    }

    const now = new Date();
    const exec: AgentExecution = {
      id: crypto.randomUUID(),
      customerId: params.customerId,
      agentId: null,
      agentType: params.agentType,
      projectId: params.projectId ?? null,
      taskId: params.taskId ?? null,
      openclawSessionKey: params.openclawSessionKey,
      openclawRunId: params.openclawRunId ?? null,
      status: params.status,
      promptSummary: params.promptSummary.slice(0, 1000),
      responseSummary: params.responseSummary?.slice(0, 2000) ?? null,
      tokensUsed: params.tokensUsed ?? 0,
      toolCallsCount: params.toolCallsCount ?? 0,
      durationMs: params.durationMs ?? null,
      errorMessage: params.errorMessage ?? null,
      startedAt: now,
      endedAt: now,
      createdAt: now,
    };
    this.executions.set(exec.id, exec);
    return { ...exec };
  }

  public async listAgentExecutions(customerId?: string, limit = 50): Promise<AgentExecution[]> {
    if (!this.useInMemory) {
      return this.db.agentExecution.findMany({
        where: customerId ? { customerId } : undefined,
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    }

    const all = Array.from(this.executions.values());
    const filtered = customerId ? all.filter((e) => e.customerId === customerId) : all;
    return filtered.slice(-limit).reverse().map((e) => ({ ...e }));
  }

  public async createNotification(params: {
    customerId: string;
    projectId?: string;
    title: string;
    message: string;
    status?: NotificationStatus;
  }): Promise<Notification> {
    if (!this.useInMemory) {
      return this.db.notification.create({
        data: {
          customerId: params.customerId,
          projectId: params.projectId ?? null,
          title: params.title,
          message: params.message,
          status: params.status ?? NotificationStatus.PENDING,
          sentAt: params.status === NotificationStatus.SENT ? new Date() : null,
        },
      });
    }

    const now = new Date();
    const notif: Notification = {
      id: crypto.randomUUID(),
      customerId: params.customerId,
      projectId: params.projectId ?? null,
      title: params.title,
      message: params.message,
      status: params.status ?? NotificationStatus.PENDING,
      sentAt: params.status === NotificationStatus.SENT ? now : null,
      errorMessage: null,
      createdAt: now,
    };
    this.notifications.set(notif.id, notif);
    return { ...notif };
  }

  // ==========================================================================
  // DB-Backed Agent Catalog & Account Wallet ($5.00 Free, $1/$2 per Submission)
  // ==========================================================================

  private readonly walletFilePath = path.resolve(process.cwd(), 'storage', 'nexora-wallets.json');
  private readonly walletBalances = new Map<string, number>();
  private readonly creditedPaystackRefs = new Set<string>();

  private loadWalletStore(): void {
    if (this.walletBalances.size > 0) return;
    try {
      if (fs.existsSync(this.walletFilePath)) {
        const raw = JSON.parse(fs.readFileSync(this.walletFilePath, 'utf8')) as
          | Record<string, number>
          | { balances?: Record<string, number>; refs?: string[] };
        if ('balances' in raw && raw.balances) {
          for (const [k, v] of Object.entries(raw.balances)) {
            if (typeof v === 'number') this.walletBalances.set(k, v);
          }
          for (const ref of Array.isArray(raw.refs) ? raw.refs : []) {
            this.creditedPaystackRefs.add(ref);
          }
        } else {
          for (const [k, v] of Object.entries(raw as Record<string, number>)) {
            if (typeof v === 'number') this.walletBalances.set(k, v);
          }
        }
      }
    } catch {
      // ignore if unreadable
    }
  }

  private saveWalletStore(): void {
    try {
      fs.mkdirSync(path.dirname(this.walletFilePath), { recursive: true });
      const payload = {
        balances: Object.fromEntries(this.walletBalances.entries()),
        refs: Array.from(this.creditedPaystackRefs.values()),
      };
      fs.writeFileSync(this.walletFilePath, JSON.stringify(payload, null, 2), 'utf8');
    } catch {
      // non-fatal
    }
  }

  private getDefaultAgentsSeed(): Array<Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>> {
    return [
      {
        agentType: AgentType.JOB_AGENT,
        taskKey: 'employment',
        name: 'Find Employment',
        description: 'Draft CV, match Indeed/Adzuna/Remotive roles & apply autonomously',
        openclawAgentId: 'job-agent',
        allowedTools: ['job_search', 'cv_pdf', 'browser_form_fill', 'email_outreach'],
        restrictedActions: [],
        costPerSubmissionCents: 100,
        sortOrder: 1,
        isActive: true,
      },
      {
        agentType: AgentType.VISA_AGENT,
        taskKey: 'relocate',
        name: 'Relocate Abroad',
        description: 'Build Relocation & Visa Dossier PDF, match sponsored roles & pathways',
        openclawAgentId: 'visa-agent',
        allowedTools: ['visa_pathways', 'sponsor_jobs', 'dossier_pdf', 'email_outreach'],
        restrictedActions: [],
        costPerSubmissionCents: 200,
        sortOrder: 2,
        isActive: true,
      },
      {
        agentType: AgentType.INVESTOR_AGENT,
        taskKey: 'investors',
        name: 'Find Investors',
        description: 'Compile Investor Pitch PDF, match VCs/accelerators & submit',
        openclawAgentId: 'investor-agent',
        allowedTools: ['investor_discovery', 'pitch_pdf', 'browser_form_fill', 'email_outreach'],
        restrictedActions: [],
        costPerSubmissionCents: 100,
        sortOrder: 3,
        isActive: true,
      },
      {
        agentType: AgentType.EDUCATION_AGENT,
        taskKey: 'scholarships',
        name: 'Find Scholarships',
        description: 'Draft Motivation Letter PDF, match global scholarships & apply',
        openclawAgentId: 'education-agent',
        allowedTools: ['scholarship_discovery', 'motivation_pdf', 'email_outreach'],
        restrictedActions: [],
        costPerSubmissionCents: 100,
        sortOrder: 4,
        isActive: true,
      },
    ];
  }

  public async ensureDefaultAgentsSeeded(): Promise<void> {
    const seeds = this.getDefaultAgentsSeed();
    if (!this.useInMemory) {
      for (const s of seeds) {
        await this.db.agent.upsert({
          where: { agentType: s.agentType },
          update: {
            taskKey: s.taskKey,
            name: s.name,
            description: s.description,
            costPerSubmissionCents: s.costPerSubmissionCents,
            sortOrder: s.sortOrder,
          },
          create: s,
        });
      }
      return;
    }

    const now = new Date();
    for (const s of seeds) {
      if (!this.agents.has(s.agentType)) {
        this.agents.set(s.agentType, {
          id: crypto.randomUUID(),
          ...s,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  public async listAgents(): Promise<Agent[]> {
    await this.ensureDefaultAgentsSeeded();
    if (!this.useInMemory) {
      return this.db.agent.findMany({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      });
    }
    return Array.from(this.agents.values())
      .filter((a) => a.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((a) => ({ ...a }));
  }

  public async getAgentCostPerSubmissionCents(agentType: AgentType): Promise<number> {
    const agents = await this.listAgents();
    const found = agents.find((a) => a.agentType === agentType);
    if (found) return found.costPerSubmissionCents;
    return agentType === AgentType.VISA_AGENT ? 200 : 100;
  }

  public async getCustomerWallet(customerId: string): Promise<{
    customerId: string;
    balanceCents: number;
    balanceDollars: string;
    freeStarterCreditCents: number;
  }> {
    if (!this.useInMemory) {
      const customer = await this.db.customer.findUnique({ where: { id: customerId } });
      const cents = customer?.creditBalanceCents ?? 500;
      return {
        customerId,
        balanceCents: cents,
        balanceDollars: (cents / 100).toFixed(2),
        freeStarterCreditCents: 500,
      };
    }

    this.loadWalletStore();
    if (!this.walletBalances.has(customerId)) {
      this.walletBalances.set(customerId, 500);
      this.saveWalletStore();
    }
    const cents = this.walletBalances.get(customerId) ?? 500;
    return {
      customerId,
      balanceCents: cents,
      balanceDollars: (cents / 100).toFixed(2),
      freeStarterCreditCents: 500,
    };
  }

  public async deductSubmissionCredits(
    customerId: string,
    agentType: AgentType,
    submissionCount: number,
  ): Promise<{
    chargedCents: number;
    remainingBalanceCents: number;
    remainingBalanceDollars: string;
    costPerSubmissionCents: number;
  }> {
    const unitCost = await this.getAgentCostPerSubmissionCents(agentType);
    const totalCharge = Math.max(0, submissionCount) * unitCost;

    if (!this.useInMemory) {
      const customer = await this.db.customer.findUnique({ where: { id: customerId } });
      const current = customer?.creditBalanceCents ?? 500;
      const next = Math.max(0, current - totalCharge);
      if (customer) {
        await this.db.customer.update({
          where: { id: customerId },
          data: { creditBalanceCents: next },
        });
      }
      return {
        chargedCents: totalCharge,
        remainingBalanceCents: next,
        remainingBalanceDollars: (next / 100).toFixed(2),
        costPerSubmissionCents: unitCost,
      };
    }

    this.loadWalletStore();
    const current = this.walletBalances.has(customerId) ? this.walletBalances.get(customerId)! : 500;
    const next = Math.max(0, current - totalCharge);
    this.walletBalances.set(customerId, next);
    this.saveWalletStore();

    return {
      chargedCents: totalCharge,
      remainingBalanceCents: next,
      remainingBalanceDollars: (next / 100).toFixed(2),
      costPerSubmissionCents: unitCost,
    };
  }

  public async addWalletCredits(
    customerId: string,
    amountCents: number,
    reference: string,
  ): Promise<{
    credited: boolean;
    alreadyProcessed: boolean;
    balanceCents: number;
    balanceDollars: string;
  }> {
    this.loadWalletStore();
    if (this.creditedPaystackRefs.has(reference)) {
      const wallet = await this.getCustomerWallet(customerId);
      return {
        credited: false,
        alreadyProcessed: true,
        balanceCents: wallet.balanceCents,
        balanceDollars: wallet.balanceDollars,
      };
    }

    const addAmount = Math.max(0, Math.round(amountCents));
    this.creditedPaystackRefs.add(reference);

    if (!this.useInMemory) {
      const customer = await this.db.customer.findUnique({ where: { id: customerId } });
      const current = customer?.creditBalanceCents ?? 500;
      const next = current + addAmount;
      if (customer) {
        await this.db.customer.update({
          where: { id: customerId },
          data: { creditBalanceCents: next },
        });
      }
      this.saveWalletStore();
      return {
        credited: true,
        alreadyProcessed: false,
        balanceCents: next,
        balanceDollars: (next / 100).toFixed(2),
      };
    }

    const current = this.walletBalances.has(customerId) ? this.walletBalances.get(customerId)! : 500;
    const next = current + addAmount;
    this.walletBalances.set(customerId, next);
    this.saveWalletStore();

    return {
      credited: true,
      alreadyProcessed: false,
      balanceCents: next,
      balanceDollars: (next / 100).toFixed(2),
    };
  }
}
