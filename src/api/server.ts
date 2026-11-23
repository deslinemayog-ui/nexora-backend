import fs from 'fs/promises';
import path from 'path';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ActionCategory, AgentType, Priority, TaskStatus } from '@prisma/client';
import { z } from 'zod';
import { agentRegistry } from '../agents/agent.registry';
import { ApprovalService } from '../approvals/approval.service';
import { WhatsAppService } from '../channels/whatsapp/whatsapp.service';
import { env } from '../config/env';
import { ConversationService } from '../core/conversation/conversation.service';
import { CustomerService } from '../core/customer/customer.service';
import { OrchestratorService } from '../core/orchestrator/orchestrator.service';
import { NexoraRepository } from '../database/repository';
import { DocumentService } from '../documents/document.service';
import { requireAdminAuth, requireTenantOrAdminAuth } from '../middleware/auth.middleware';
import { globalErrorHandler } from '../middleware/error.middleware';
import { OpenClawService } from '../openclaw/openclaw.service';
import { ProjectService } from '../projects/project.service';
import { QueueService } from '../queues/queue.service';
import { TaskService } from '../tasks/task.service';
import { autonomousWorkerService } from '../tools/autonomous-worker.service';
import { documentGeneratorService } from '../tools/document-generator.service';
import { imapMonitorService } from '../tools/imap-monitor.service';
import { jobSearchApiService } from '../tools/job-search-api.service';
import { visaRelocationService } from '../tools/visa-relocation.service';
import { paystackService } from '../tools/paystack.service';

export interface ApiServerDependencies {
  repository: NexoraRepository;
  whatsappService: WhatsAppService;
  openclawService: OpenClawService;
  customerService: CustomerService;
  conversationService: ConversationService;
  projectService: ProjectService;
  taskService: TaskService;
  approvalService: ApprovalService;
  documentService: DocumentService;
  queueService: QueueService;
  orchestratorService: OrchestratorService;
}

const CustomerIdParamSchema = z.object({
  customerId: z.string().min(1),
});

const SendWhatsAppSchema = z.object({
  recipient: z.string().min(5),
  text: z.string().min(1).max(4096),
});

const CreateProjectSchema = z.object({
  title: z.string().min(3).max(200),
  objective: z.string().min(3).max(1000),
  description: z.string().min(3).max(2000),
  assignedSpecialist: z.nativeEnum(AgentType),
  targetCountry: z.string().optional(),
  priority: z.nativeEnum(Priority).optional(),
});

const UpdateTaskStatusSchema = z.object({
  status: z.nativeEnum(TaskStatus),
  resultPayload: z.record(z.unknown()).optional(),
  errorMessage: z.string().optional(),
});

const CreateApprovalSchema = z.object({
  projectId: z.string().optional(),
  taskId: z.string().optional(),
  actionCategory: z.nativeEnum(ActionCategory),
  title: z.string().min(3).max(200),
  description: z.string().min(3).max(2000),
  actionPayload: z.record(z.unknown()),
});

const RespondApprovalSchema = z.object({
  reply: z.string().min(1).max(500),
});

const UploadDocumentJsonSchema = z.object({
  projectId: z.string().optional(),
  originalFileName: z.string().min(1).max(255),
  mimeType: z.string().min(3).max(120),
  contentBase64: z.string().min(1),
});

export async function buildApiServer(deps: ApiServerDependencies): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    connectionTimeout: 240_000,
    keepAliveTimeout: 240_000,
    requestTimeout: 240_000,
    bodyLimit: 25 * 1024 * 1024,
  });

  app.setErrorHandler(globalErrorHandler);

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    xFrameOptions: false,
  });
  await app.register(cors, { origin: true });
  await app.register(rateLimit, {
    max: env.API_RATE_LIMIT_MAX,
    timeWindow: env.API_RATE_LIMIT_WINDOW_MS,
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Nexora AI – Multi-Tenant WhatsApp AI Workforce API',
        description:
          'REST API for customer management, persistent projects, tasks, approvals, encrypted documents, OpenClaw execution monitoring, and WhatsApp gateway status.',
        version: '1.0.0',
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  // 1. Health Check Endpoints
  app.get('/api/v1/health', async () => {
    const waStatus = deps.whatsappService.getStatus();
    const queueMetrics = deps.queueService.getQueueMetrics();
    return {
      ok: true,
      service: 'nexora-ai',
      timestamp: new Date().toISOString(),
      whatsapp: {
        provider: deps.whatsappService.getProviderName(),
        status: waStatus.status,
      },
      queues: queueMetrics,
    };
  });

  // 2. WhatsApp Connection Status & Outbound Messaging
  app.get('/api/v1/whatsapp/status', { preHandler: [requireAdminAuth] }, async () => {
    return {
      ok: true,
      data: deps.whatsappService.getStatus(),
    };
  });

  app.post('/api/v1/whatsapp/send', { preHandler: [requireAdminAuth] }, async (request) => {
    const body = SendWhatsAppSchema.parse(request.body);
    const receipt = await deps.whatsappService.sendText(body.recipient, body.text);
    return {
      ok: true,
      data: receipt,
    };
  });

  // 3. Customer Management Endpoints
  app.get('/api/v1/customers', { preHandler: [requireAdminAuth] }, async () => {
    const customers = await deps.customerService.listCustomers();
    return {
      ok: true,
      data: customers,
    };
  });

  app.get(
    '/api/v1/customers/:customerId/profile',
    { preHandler: [requireTenantOrAdminAuth] },
    async (request) => {
      const { customerId } = CustomerIdParamSchema.parse(request.params);
      const profile = await deps.customerService.getProfileForTenant(customerId, customerId);
      return {
        ok: true,
        data: profile,
      };
    },
  );

  // 4. Conversation Management Endpoints
  app.get(
    '/api/v1/customers/:customerId/conversations/active',
    { preHandler: [requireTenantOrAdminAuth] },
    async (request) => {
      const { customerId } = CustomerIdParamSchema.parse(request.params);
      const conversation = await deps.conversationService.getOrCreateActiveConversation(
        customerId,
      );
      const messages = await deps.repository.listConversationMessages(
        customerId,
        conversation.id,
        50,
      );
      return {
        ok: true,
        data: {
          conversation,
          messages,
        },
      };
    },
  );

  // 5. Project Management Endpoints
  app.get(
    '/api/v1/customers/:customerId/projects',
    { preHandler: [requireTenantOrAdminAuth] },
    async (request) => {
      const { customerId } = CustomerIdParamSchema.parse(request.params);
      const projects = await deps.projectService.listCustomerProjects(customerId);
      return {
        ok: true,
        data: projects,
      };
    },
  );

  app.post(
    '/api/v1/customers/:customerId/projects',
    { preHandler: [requireTenantOrAdminAuth] },
    async (request, reply) => {
      const { customerId } = CustomerIdParamSchema.parse(request.params);
      const body = CreateProjectSchema.parse(request.body);
      const created = await deps.projectService.createGoalProject({
        customerId,
        ...body,
      });
      return reply.status(201).send({
        ok: true,
        data: created,
      });
    },
  );

  app.get(
    '/api/v1/customers/:customerId/projects/:projectId',
    { preHandler: [requireTenantOrAdminAuth] },
    async (request) => {
      const params = z
        .object({ customerId: z.string().min(1), projectId: z.string().min(1) })
        .parse(request.params);
      const project = await deps.projectService.getProject(params.customerId, params.projectId);
      return {
        ok: true,
        data: project,
      };
    },
  );

  // 6. Task Management Endpoints
  app.get(
    '/api/v1/customers/:customerId/tasks',
    { preHandler: [requireTenantOrAdminAuth] },
    async (request) => {
      const { customerId } = CustomerIdParamSchema.parse(request.params);
      const query = z.object({ projectId: z.string().optional() }).parse(request.query ?? {});
      const tasks = await deps.taskService.listTasksForCustomer(customerId, query.projectId);
      return {
        ok: true,
        data: tasks,
      };
    },
  );

  app.patch(
    '/api/v1/customers/:customerId/tasks/:taskId/status',
    { preHandler: [requireTenantOrAdminAuth] },
    async (request) => {
      const params = z
        .object({ customerId: z.string().min(1), taskId: z.string().min(1) })
        .parse(request.params);
      const body = UpdateTaskStatusSchema.parse(request.body);
      const updated = await deps.taskService.markTaskStatus(
        params.customerId,
        params.taskId,
        body.status,
        body.resultPayload,
        body.errorMessage,
      );
      return {
        ok: true,
        data: updated,
      };
    },
  );

  // 7. Approval Management Endpoints
  app.get(
    '/api/v1/customers/:customerId/approvals',
    { preHandler: [requireTenantOrAdminAuth] },
    async (request) => {
      const { customerId } = CustomerIdParamSchema.parse(request.params);
      const approvals = await deps.approvalService.listPendingApprovals(customerId);
      return {
        ok: true,
        data: approvals,
      };
    },
  );

  app.post(
    '/api/v1/customers/:customerId/approvals',
    { preHandler: [requireTenantOrAdminAuth] },
    async (request, reply) => {
      const { customerId } = CustomerIdParamSchema.parse(request.params);
      const body = CreateApprovalSchema.parse(request.body);
      const created = await deps.approvalService.requestCustomerApproval({
        customerId,
        ...body,
      });
      return reply.status(201).send({
        ok: true,
        data: created,
      });
    },
  );

  app.post(
    '/api/v1/customers/:customerId/approvals/:approvalId/respond',
    { preHandler: [requireTenantOrAdminAuth] },
    async (request) => {
      const params = z
        .object({ customerId: z.string().min(1), approvalId: z.string().min(1) })
        .parse(request.params);
      const body = RespondApprovalSchema.parse(request.body);
      const result = await deps.approvalService.processCustomerApprovalReply({
        customerId: params.customerId,
        approvalId: params.approvalId,
        rawReply: body.reply,
      });
      return {
        ok: true,
        data: result,
      };
    },
  );

  // 8. Document Management Endpoints
  app.get(
    '/api/v1/customers/:customerId/documents',
    { preHandler: [requireTenantOrAdminAuth] },
    async (request) => {
      const { customerId } = CustomerIdParamSchema.parse(request.params);
      const docs = await deps.documentService.listCustomerDocuments(customerId);
      return {
        ok: true,
        data: docs,
      };
    },
  );

  app.post(
    '/api/v1/customers/:customerId/documents',
    { preHandler: [requireTenantOrAdminAuth] },
    async (request, reply) => {
      const { customerId } = CustomerIdParamSchema.parse(request.params);
      const body = UploadDocumentJsonSchema.parse(request.body);
      const buffer = Buffer.from(body.contentBase64, 'base64');
      const stored = await deps.documentService.processAndStoreDocument({
        customerId,
        projectId: body.projectId,
        originalFileName: body.originalFileName,
        mimeType: body.mimeType,
        buffer,
      });
      return reply.status(201).send({
        ok: true,
        data: stored,
      });
    },
  );

  app.get(
    '/api/v1/customers/:customerId/documents/:documentId/download',
    { preHandler: [requireTenantOrAdminAuth] },
    async (request) => {
      const params = z
        .object({ customerId: z.string().min(1), documentId: z.string().min(1) })
        .parse(request.params);
      const { document, plaintextBuffer } =
        await deps.documentService.getDecryptedDocumentForTenant(
          params.customerId,
          params.documentId,
        );
      return {
        ok: true,
        data: {
          document,
          contentBase64: plaintextBuffer.toString('base64'),
        },
      };
    },
  );

  // 9. Agent Execution Monitoring Endpoints
  app.get('/api/v1/executions', { preHandler: [requireAdminAuth] }, async () => {
    const executions = await deps.repository.listAgentExecutions();
    return {
      ok: true,
      data: executions,
    };
  });

  app.get(
    '/api/v1/customers/:customerId/executions',
    { preHandler: [requireTenantOrAdminAuth] },
    async (request) => {
      const { customerId } = CustomerIdParamSchema.parse(request.params);
      const executions = await deps.repository.listAgentExecutions(customerId);
      return {
        ok: true,
        data: executions,
      };
    },
  );

  // 10. System Administration Endpoints
  app.get('/api/v1/admin/overview', { preHandler: [requireAdminAuth] }, async () => {
    const customers = await deps.customerService.listCustomers();
    const executions = await deps.repository.listAgentExecutions(undefined, 100);
    const agents = agentRegistry.listAgents().map((a) => ({
      agentType: a.agentType,
      name: a.name,
      openclawAgentId: a.openclawAgentId,
      description: a.description,
      allowedTools: a.allowedTools,
      restrictedActions: a.restrictedActions,
    }));

    return {
      ok: true,
      data: {
        customerCount: customers.length,
        recentExecutionsCount: executions.length,
        whatsapp: deps.whatsappService.getStatus(),
        queues: deps.queueService.getQueueMetrics(),
        registeredAgents: agents,
      },
    };
  });

  app.get('/api/v1/admin/audit-logs', { preHandler: [requireAdminAuth] }, async (request) => {
    const query = z.object({ customerId: z.string().optional() }).parse(request.query ?? {});
    const logs = await deps.repository.listAuditLogs(query.customerId);
    return {
      ok: true,
      data: logs,
    };
  });

  // 11. Interactive React Web Console & OpenClaw Direct Bridge Endpoints
  const WebChatMessageSchema = z.object({
    phoneNumber: z.string().min(5).default('+447700900777'),
    conversationId: z.string().optional(),
    agentType: z.string().optional(),
    maxSubmissions: z.number().int().min(1).max(25).optional(),
    deepThink: z.boolean().optional(),
    displayName: z.string().optional(),
    customerName: z.string().optional(),
    text: z.string().optional(),
    message: z.string().optional(),
    attachment: z
      .object({
        fileName: z.string().min(1),
        mimeType: z.string().min(3),
        contentBase64: z.string().min(1),
      })
      .optional(),
    attachments: z
      .array(
        z.object({
          fileName: z.string().min(1),
          mimeType: z.string().min(3),
          contentBase64: z.string().min(1),
        }),
      )
      .optional(),
  });

    const handleWebChatMessage = async (request: any) => {
      const body = WebChatMessageSchema.parse(request.body);
      const baseDigits = body.phoneNumber.replace(/[^\d]/g, '') || '447700900777';
      // Isolate each UI conversation into its own clean session/project context
      const convDigits = body.conversationId
        ? body.conversationId.replace(/[^\d]/g, '').slice(-8)
        : '';
      const digits = convDigits ? `${baseDigits.slice(0, 7)}${convDigits}` : baseDigits;
      const senderJid = `${digits}@s.whatsapp.net`;
      const resolvedDisplayName = body.displayName || body.customerName || 'Web Console User';
      let resolvedText = body.text || body.message || '';

      const allUploads = [
        ...(body.attachments ?? []),
        ...(body.attachment ? [body.attachment] : []),
      ];

      let media = undefined;
      let messageType: 'TEXT' | 'PDF' | 'DOCUMENT' | 'IMAGE' | 'VOICE_NOTE' = 'TEXT';

      if (allUploads.length > 0) {
        const { customer } = await deps.customerService.resolveCustomerFromWhatsApp({
          senderNumberOrJid: senderJid,
          displayName: resolvedDisplayName,
        });

        const storedSessionFiles: Array<{ filename: string; path: string }> = [];
        const extractedSnippets: string[] = [];

        for (let idx = 0; idx < allUploads.length; idx++) {
          const item = allUploads[idx];
          const buffer = Buffer.from(item.contentBase64, 'base64');

          if (idx === 0) {
            media = {
              buffer,
              mimeType: item.mimeType,
              fileName: item.fileName,
              fileSizeBytes: buffer.byteLength,
            };
            if (item.mimeType.includes('pdf')) {
              messageType = 'PDF';
            } else if (item.mimeType.startsWith('image/')) {
              messageType = 'IMAGE';
            } else {
              messageType = 'DOCUMENT';
            }
          }

          try {
            const safeAttName = path.basename(item.fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
            const attDir = path.resolve(
              process.cwd(),
              'node_modules',
              '.cache',
              'nexora-attachments',
              customer.id,
            );
            await fs.mkdir(attDir, { recursive: true });
            const attPath = path.join(attDir, `${Date.now()}-${safeAttName}`);
            await fs.writeFile(attPath, buffer);
            storedSessionFiles.push({
              filename: item.fileName,
              path: attPath,
            });

            const processed = await deps.documentService.processAndStoreDocument({
              customerId: customer.id,
              originalFileName: item.fileName,
              mimeType: item.mimeType,
              buffer,
            });
            if (idx > 0 && processed.extractedText) {
              extractedSnippets.push(
                `[Attached Reference Document (${item.fileName})]:\n${processed.extractedText.slice(0, 8000)}`,
              );
            }
          } catch {
            const fallbackText = await deps.documentService
              .extractTextOnly(buffer, item.mimeType, item.fileName)
              .catch(() => '');
            if (idx > 0 && fallbackText) {
              extractedSnippets.push(
                `[Attached Reference Document (${item.fileName})]:\n${fallbackText.slice(0, 8000)}`,
              );
            }
          }
        }

        if (storedSessionFiles.length > 0) {
          autonomousWorkerService.registerSessionAttachments(customer.id, storedSessionFiles);
        }
        if (extractedSnippets.length > 0) {
          resolvedText = resolvedText
            ? `${resolvedText}\n\n${extractedSnippets.join('\n\n')}`
            : extractedSnippets.join('\n\n');
        }
      }

      const validAgentTypes = new Set([
        'JOB_AGENT',
        'VISA_AGENT',
        'INVESTOR_AGENT',
        'BUSINESS_AGENT',
        'EDUCATION_AGENT',
        'RESEARCH_AGENT',
      ]);
      const preferredAgent =
        body.agentType && validAgentTypes.has(body.agentType)
          ? (body.agentType as any)
          : undefined;

      const result = await deps.orchestratorService.handleIncomingWhatsAppMessage(
        {
          externalMessageId: `webchat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          senderJid,
          senderPhoneNumber: `+${digits}`,
          pushName: resolvedDisplayName,
          timestamp: new Date(),
          messageType,
          textContent: resolvedText,
          media,
        },
        { skipWhatsAppSend: true, preferredAgent, maxSubmissions: body.maxSubmissions, deepThink: body.deepThink },
      );

      const submittedCount = result.submittedApplications?.length ?? 0;
      const wallet =
        submittedCount > 0
          ? await deps.repository.deductSubmissionCredits(
              result.customerId,
              result.routedAgent,
              submittedCount,
            )
          : await deps.repository.getCustomerWallet(result.customerId);

      const projects = await deps.projectService.listCustomerProjects(result.customerId);
      const approvals = await deps.approvalService.listPendingApprovals(result.customerId);
      const executions = await deps.repository.listAgentExecutions(result.customerId, 15);
      const messages = await deps.repository.listConversationMessages(
        result.customerId,
        result.conversationId,
        50,
      );

      return {
        ok: true,
        data: {
          replyText: result.responseText,
          response: result.responseText,
          responseText: result.responseText,
          detectedIntent: result.detectedIntent,
          routedAgentType: result.routedAgent,
          thinkingSummary: result.thinkingSummary,
          thinkingDurationMs: result.thinkingDurationMs,
          generatedDocument: result.generatedDocument,
          submittedApplications: result.submittedApplications,
          wallet,
          orchestration: result,
          messages,
          projects,
          approvals,
          executions,
        },
      };
    };

    app.post('/api/v1/webchat/message', handleWebChatMessage);
    app.post('/api/v1/webchat/send', handleWebChatMessage);

  app.get('/api/v1/webchat/state', async (request) => {
    const query = z
      .object({
        phoneNumber: z.string().default('+447700900777'),
        conversationId: z.string().optional(),
        displayName: z.string().optional().default('Web Console User'),
      })
      .parse(request.query ?? {});

    const baseDigits = query.phoneNumber.replace(/[^\d]/g, '') || '447700900777';
    const convDigits = query.conversationId
      ? query.conversationId.replace(/[^\d]/g, '').slice(-8)
      : '';
    const scopedPhone = convDigits ? `+${baseDigits.slice(0, 7)}${convDigits}` : query.phoneNumber;

    const { customer, profile } = await deps.customerService.resolveCustomerFromWhatsApp({
      senderNumberOrJid: scopedPhone,
      displayName: query.displayName,
    });
    const conversation = await deps.conversationService.getOrCreateActiveConversation(
      customer.id,
    );
    const messages = await deps.repository.listConversationMessages(
      customer.id,
      conversation.id,
      50,
    );
    const projects = await deps.projectService.listCustomerProjects(customer.id);
    const approvals = await deps.approvalService.listPendingApprovals(customer.id);
    const documents = await deps.documentService.listCustomerDocuments(customer.id);
    const executions = await deps.repository.listAgentExecutions(customer.id, 15);
    const agents = agentRegistry.listAgents().map((a) => ({
      agentType: a.agentType,
      name: a.name,
      description: a.description,
      allowedTools: a.allowedTools,
    }));

    return {
      ok: true,
      data: {
        customer,
        profile,
        conversation,
        messages,
        projects,
        approvals,
        documents,
        executions,
        agents,
        whatsapp: deps.whatsappService.getStatus(),
      },
    };
  });

  const DirectOpenClawPromptSchema = z.object({
    customerId: z.string().default('web-studio-user'),
    agentType: z.nativeEnum(AgentType).default(AgentType.RESEARCH_AGENT),
    prompt: z.string().min(1),
    systemInstructions: z
      .string()
      .default('You are an OpenClaw AI agent connected to the Nexora AI Studio.'),
    useLocalCli: z.boolean().optional().default(true),
  });

  app.post('/api/v1/openclaw/direct', async (request) => {
    const body = DirectOpenClawPromptSchema.parse(request.body);
    const safeTenantId = body.customerId.replace(/[^a-zA-Z0-9_-]/g, '') || 'web_studio';
    const sessionKey = deps.openclawService.createConversationSessionKey(
      safeTenantId,
      'direct_studio',
      'main',
    );

    const workReport = await autonomousWorkerService.executeAutonomousTask({
      customerId: safeTenantId,
      agentType: body.agentType,
      userMessage: body.prompt,
      conversationHistory: [],
    });
    const formattedWork = autonomousWorkerService.formatReportForPromptAndDisplay(workReport);

    const output = await deps.openclawService.executeAgentTurn({
      customerId: safeTenantId,
      agentType: body.agentType,
      openclawAgentId: 'main',
      sessionKey,
      userMessage: body.prompt,
      systemInstructions: `${body.systemInstructions}\n\n${formattedWork.promptContextBlock}`,
      useLocalCli: body.useLocalCli,
    });

    const combinedText = `${output.responseText}\n\n---\n\n${formattedWork.markdownExecutionSummary}`;

    return {
      ok: true,
      data: {
        ...output,
        responseText: combinedText,
      },
    };
  });

  app.get('/api/v1/screenshots/:fileName', async (request, reply) => {
    const params = z.object({ fileName: z.string() }).parse(request.params);
    const safeName = path.basename(params.fileName);
    const primaryPath = path.resolve(
      process.cwd(),
      'node_modules',
      '.cache',
      'nexora-screenshots',
      safeName,
    );
    const fallbackPath = path.resolve(process.cwd(), 'storage', 'screenshots', safeName);
    const buffer = await fs.readFile(primaryPath).catch(() => fs.readFile(fallbackPath));
    reply.header('Content-Type', 'image/png');
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
    return reply.send(buffer);
  });

  const GeneratePlanSchema = z.object({
    companyName: z.string().min(1).default('Client Venture'),
    documentTitle: z.string().optional(),
    subtitle: z.string().optional(),
    founderName: z.string().min(1).default('Client Founder'),
    founderEmail: z.string().optional(),
    founderPhone: z.string().optional(),
    websiteUrl: z.string().optional(),
    location: z.string().optional(),
    industry: z.string().optional(),
    targetRaise: z.string().optional(),
    targetPages: z.number().int().min(1).max(30).optional().default(12),
    recipientEmail: z.string().optional(),
  });

  app.post('/api/v1/documents/generate-plan', async (request) => {
    const body = GeneratePlanSchema.parse(request.body ?? {});
    const result = await documentGeneratorService.generateBusinessPlanPdf({
      companyName: body.companyName,
      documentTitle: body.documentTitle,
      subtitle: body.subtitle,
      founderName: body.founderName,
      founderEmail: body.founderEmail,
      founderPhone: body.founderPhone,
      websiteUrl: body.websiteUrl,
      location: body.location,
      industry: body.industry,
      targetRaise: body.targetRaise,
      targetPages: body.targetPages,
      recipientEmail: body.recipientEmail,
    });
    return {
      ok: true,
      data: result,
    };
  });

  app.get('/api/v1/agents', async () => {
    const agents = await deps.repository.listAgents();
    return {
      ok: true,
      data: agents.map((a) => ({
        id: a.id,
        agentType: a.agentType,
        taskKey: a.taskKey,
        name: a.name,
        description: a.description,
        costPerSubmissionCents: a.costPerSubmissionCents,
        costPerSubmissionDollars: (a.costPerSubmissionCents / 100).toFixed(2),
        sortOrder: a.sortOrder,
        isActive: a.isActive,
      })),
    };
  });

  app.get('/api/v1/wallet', async (request) => {
    const q = z
      .object({
        phone: z.string().default('27000000000'),
        customerId: z.string().optional(),
      })
      .parse(request.query);

    let cid = q.customerId;
    if (!cid) {
      const digits = q.phone.replace(/\D/g, '') || '27000000000';
      const resolved = await deps.repository.findOrCreateCustomerByWhatsApp({
        whatsappNumber: `+${digits}`,
        whatsappJid: `${digits}@s.whatsapp.net`,
      });
      cid = resolved.customer.id;
    }

    const wallet = await deps.repository.getCustomerWallet(cid);
    return { ok: true, data: wallet };
  });

  app.get('/api/v1/payments/paystack/packages', async () => {
    return {
      ok: true,
      data: {
        configured: paystackService.isConfigured(),
        currency: (process.env.PAYSTACK_CURRENCY || 'ZAR').toUpperCase(),
        packages: paystackService.getPackages().map((p) => ({
          ...p,
          charge: paystackService.computePaystackChargeAmount(p.creditCents),
        })),
      },
    };
  });

  app.post('/api/v1/payments/paystack/initialize', async (request, reply) => {
    const body = z
      .object({
        phone: z.string().default('27000000000'),
        email: z.string().email(),
        packageId: z.string().min(1),
        callbackUrl: z.string().url().optional(),
      })
      .parse(request.body);

    const digits = body.phone.replace(/\D/g, '') || '27000000000';
    const resolved = await deps.repository.findOrCreateCustomerByWhatsApp({
      whatsappNumber: `+${digits}`,
      whatsappJid: `${digits}@s.whatsapp.net`,
    });

    try {
      const init = await paystackService.initializeTransaction({
        customerId: resolved.customer.id,
        email: body.email,
        packageId: body.packageId,
        callbackUrl: body.callbackUrl,
      });
      return { ok: true, data: init };
    } catch (err) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: 'PAYSTACK_INIT_ERROR',
          message: err instanceof Error ? err.message : 'Could not initialize Paystack checkout',
        },
      });
    }
  });

  app.get('/api/v1/payments/paystack/verify/:reference', async (request, reply) => {
    const params = z.object({ reference: z.string().min(1) }).parse(request.params);
    const query = z.object({ phone: z.string().optional() }).parse(request.query);

    try {
      const verified = await paystackService.verifyTransaction(params.reference);
      if (!verified.paid) {
        return { ok: true, data: { ...verified, walletUpdated: false } };
      }

      let customerId = verified.customerId;
      if (!customerId && query.phone) {
        const digits = query.phone.replace(/\D/g, '') || '27000000000';
        const resolved = await deps.repository.findOrCreateCustomerByWhatsApp({
          whatsappNumber: `+${digits}`,
          whatsappJid: `${digits}@s.whatsapp.net`,
        });
        customerId = resolved.customer.id;
      }

      if (!customerId || verified.creditCents <= 0) {
        return { ok: true, data: { ...verified, walletUpdated: false } };
      }

      const creditResult = await deps.repository.addWalletCredits(
        customerId,
        verified.creditCents,
        verified.reference,
      );

      return {
        ok: true,
        data: {
          ...verified,
          walletUpdated: creditResult.credited,
          alreadyProcessed: creditResult.alreadyProcessed,
          balanceCents: creditResult.balanceCents,
          balanceDollars: creditResult.balanceDollars,
        },
      };
    } catch (err) {
      return reply.status(400).send({
        ok: false,
        error: {
          code: 'PAYSTACK_VERIFY_ERROR',
          message: err instanceof Error ? err.message : 'Paystack verification failed',
        },
      });
    }
  });

  app.post('/api/v1/payments/paystack/webhook', async (request, reply) => {
    const sig = request.headers['x-paystack-signature'] as string | undefined;
    const rawBody = JSON.stringify(request.body ?? {});
    if (!paystackService.verifyWebhookSignature(rawBody, sig)) {
      return reply.status(401).send({ ok: false, error: 'Invalid Paystack signature' });
    }

    const event = request.body as {
      event?: string;
      data?: {
        reference?: string;
        metadata?: { customerId?: string; creditCents?: number };
      };
    };

    if (
      event?.event === 'charge.success' &&
      event.data?.reference &&
      event.data.metadata?.customerId &&
      event.data.metadata?.creditCents
    ) {
      await deps.repository.addWalletCredits(
        event.data.metadata.customerId,
        Number(event.data.metadata.creditCents),
        event.data.reference,
      );
    }

    return { ok: true };
  });

  app.get('/api/v1/jobs/search', async (request) => {
    const q = z
      .object({
        q: z.string().default('Software Developer'),
        skills: z.string().optional(),
        country: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(25).default(10),
      })
      .parse(request.query);

    const data = await jobSearchApiService.searchJobs({
      role: q.q,
      skills: q.skills ? q.skills.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      targetCountry: q.country,
      limit: q.limit,
    });
    return { ok: true, data };
  });

  app.get('/api/v1/visa/pathways', async (request) => {
    const q = z
      .object({
        destination: z.string().default('Germany'),
        nationality: z.string().optional(),
        role: z.string().default('Software Developer'),
        skills: z.string().optional(),
      })
      .parse(request.query);

    const [relocation, b2b] = await Promise.all([
      visaRelocationService.discoverRelocationTargets({
        destinationCountry: q.destination,
        nationality: q.nationality,
        role: q.role,
        skills: q.skills ? q.skills.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      }),
      visaRelocationService.checkB2bVisaApi({
        nationality: q.nationality,
        destinationCountry: q.destination,
      }),
    ]);

    return { ok: true, data: { ...relocation, b2bStatus: b2b } };
  });

  app.get('/api/v1/submissions/replies', async () => {
    const data = await imapMonitorService.fetchRepliesAndInterviews();
    return { ok: true, data };
  });

  app.post('/api/v1/submissions/replies', async (request) => {
    const body = z
      .object({
        submissions: z
          .array(
            z.object({
              receiptId: z.string(),
              targetName: z.string(),
              contactEmail: z.string().optional(),
              deliveredToEmail: z.string().optional(),
              portalUrl: z.string().optional(),
            }),
          )
          .optional(),
        lookbackDays: z.number().int().min(1).max(60).optional(),
      })
      .parse(request.body ?? {});

    const data = await imapMonitorService.fetchRepliesAndInterviews({
      submissions: body.submissions,
      lookbackDays: body.lookbackDays,
    });
    return { ok: true, data };
  });

  app.post('/api/v1/submissions/reply', async (request) => {
    const body = z
      .object({
        receiptId: z.string().min(1),
        to: z.string().email(),
        subject: z.string().min(1),
        message: z.string().min(1),
        companyName: z.string().optional(),
        senderName: z.string().optional(),
        inReplyTo: z.string().optional(),
        references: z.array(z.string()).optional(),
        attachments: z
          .array(
            z.object({
              fileName: z.string().min(1),
              mimeType: z.string().min(1),
              contentBase64: z.string().min(1),
            }),
          )
          .optional(),
      })
      .parse(request.body);

    const sent = await imapMonitorService.sendSubmissionFollowUp(body);
    return { ok: true, data: sent };
  });

  app.post('/api/v1/documents/extract', async (request) => {
    const body = z
      .object({
        files: z
          .array(
            z.object({
              fileName: z.string().min(1),
              mimeType: z.string().default('application/octet-stream'),
              contentBase64: z.string().min(1),
            }),
          )
          .min(1)
          .max(10),
      })
      .parse(request.body);

    const results = await Promise.all(
      body.files.map(async (f) => {
        const buffer = Buffer.from(f.contentBase64, 'base64');
        const extractedText = await deps.documentService
          .extractTextOnly(buffer, f.mimeType, f.fileName)
          .catch(() => '');
        return {
          fileName: f.fileName,
          mimeType: f.mimeType,
          fileSizeBytes: buffer.byteLength,
          extractedText: extractedText.slice(0, 12000),
          charCount: extractedText.length,
        };
      }),
    );

    return { ok: true, data: results };
  });

  app.post('/api/v1/submissions/inbound-webhook', async (request) => {
    const body = z
      .object({
        from: z.string().min(1),
        to: z.string().optional(),
        subject: z.string().default('(No Subject)'),
        body: z.string().default(''),
        text: z.string().optional(),
        receiptId: z.string().optional(),
      })
      .parse(request.body);

    const saved = imapMonitorService.recordInboundWebhookReply({
      from: body.from,
      to: body.to,
      subject: body.subject,
      body: body.body || body.text || '',
      receiptId: body.receiptId,
    });
    return { ok: true, data: saved };
  });

  app.get('/api/v1/documents/download/:fileName', async (request, reply) => {
    const params = z.object({ fileName: z.string() }).parse(request.params);
    const safeName = path.basename(params.fileName);
    const primaryPath = path.resolve(
      process.cwd(),
      'node_modules',
      '.cache',
      'nexora-documents',
      safeName,
    );
    const fallbackPath = path.resolve(process.cwd(), 'storage', 'documents', safeName);
    const buffer = await fs.readFile(primaryPath).catch(() => fs.readFile(fallbackPath));
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `inline; filename="${safeName}"`);
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
    reply.header('Content-Security-Policy', 'frame-ancestors *');
    return reply.send(buffer);
  });

  return app;
}
