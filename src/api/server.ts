import fs from 'fs/promises';
import path from 'path';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { ActionCategory, AgentType, Priority, TaskStatus } from '../database/types';
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
import pdfParse from 'pdf-parse';
import { imapMonitorService } from '../tools/imap-monitor.service';
import { autopilotService } from '../tools/autopilot.service';
import { extractCvJobProfileWithAI } from '../tools/cv-ai-matcher.service';
import { jobSearchApiService } from '../tools/job-search-api.service';
import { visaRelocationService } from '../tools/visa-relocation.service';
import { paystackService } from '../tools/paystack.service';
import { downloadFromFirebaseStorage } from '../tools/firebase-storage.service';
import { platformStore } from '../modules/platform/platform.store';
import { registerPlatformRoutes } from './platform.routes';
import { registerLiveInterviewWebSocket } from './live-interview.ws';

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
    connectionTimeout: 600_000,
    keepAliveTimeout: 600_000,
    requestTimeout: 600_000,
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
    userUid: z.string().optional(),
    phoneNumber: z.string().min(5).default('+447700900777'),
    conversationId: z.string().optional(),
    agentType: z.string().optional(),
    maxSubmissions: z.number().int().min(1).max(100).optional(),
    submissionMode: z.enum(['EMAIL_ONLY', 'FORM_ONLY', 'BOTH']).optional(),
    costPerSubmissionCents: z.number().int().min(0).max(50000).optional(),
    deepThink: z.boolean().optional(),
    displayName: z.string().optional(),
    customerName: z.string().optional(),
    userEmail: z.string().optional(),
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
    attachedDocumentFileNames: z.array(z.string().min(1)).optional(),
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

      if (Array.isArray(body.attachedDocumentFileNames) && body.attachedDocumentFileNames.length > 0) {
        const { customer } = await deps.customerService.resolveCustomerFromWhatsApp({
          senderNumberOrJid: senderJid,
          displayName: resolvedDisplayName,
        });
        const extraFiles: Array<{ filename: string; path: string }> = [];
        for (const rawName of body.attachedDocumentFileNames) {
          const safeName = path.basename(rawName);
          const primary = path.resolve(process.cwd(), 'node_modules', '.cache', 'nexora-documents', safeName);
          const fallback = path.resolve(process.cwd(), 'storage', 'documents', safeName);
          const targetPath = (await fs.stat(primary).then(() => primary).catch(() => null))
            || (await fs.stat(fallback).then(() => fallback).catch(() => null));
          if (targetPath) {
            extraFiles.push({ filename: safeName, path: targetPath });
          }
        }
        if (extraFiles.length > 0) {
          autonomousWorkerService.registerSessionAttachments(customer.id, extraFiles);
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

      // Enforce credit limit before dispatching autonomous submissions
      const preResolved = await deps.repository.findOrCreateCustomerByWhatsApp({
        whatsappNumber: `+${digits}`,
        whatsappJid: senderJid,
        displayName: resolvedDisplayName,
      });
      if (body.conversationId) {
        autonomousWorkerService.registerSessionConversation(preResolved.customer.id, body.conversationId);
      }
      if (body.userUid) {
        autonomousWorkerService.registerSessionUserUid(preResolved.customer.id, body.userUid);
      }
      const chosenSubmissionMode = body.submissionMode || 'EMAIL_ONLY';
      autonomousWorkerService.registerSessionSubmissionMode(
        preResolved.customer.id,
        chosenSubmissionMode,
      );
      autonomousWorkerService.registerSessionRealContact(preResolved.customer.id, {
        email: body.userEmail,
        phone: body.phoneNumber ? `+${digits}` : undefined,
      });
      const preWallet = await deps.repository.getCustomerWallet(preResolved.customer.id, body.userUid);
      const unitCostCents =
        typeof body.costPerSubmissionCents === 'number' && body.costPerSubmissionCents >= 0
          ? body.costPerSubmissionCents
          : await deps.repository.getAgentCostPerSubmissionCents(preferredAgent || 'JOB_AGENT');
      const maxAffordable =
        unitCostCents > 0 ? Math.min(100, Math.floor(preWallet.balanceCents / unitCostCents)) : 100;
      const effectiveMaxSubmissions = Math.max(
        0,
        Math.min(body.maxSubmissions ?? 5, maxAffordable),
      );

      const trimmedResolved = resolvedText.trim().toLowerCase();
      const isShortYesApproval =
        trimmedResolved.length <= 40 &&
        /^(?:yes|yeah|yep|yup|sure|ok|okay|please\s+do|proceed|go\s+ahead|submit|apply|do\s+it|confirm)\b/i.test(
          trimmedResolved,
        ) &&
        !/\b(?:no|not|don'?t|wait|cancel|stop|later|change|edit|modify)\b/i.test(trimmedResolved);
      const isApprovalSubmitMsg =
        isShortYesApproval ||
        /\b(?:approved\.?\s*please\s+submit|approve\s*(?:&|and)\s*submit|looks\s+good,?\s*(?:search\s+and\s+)?apply|confirm\s*(?:&|and)\s*submit|apply\s+on\s+candidate\s+behalf|submit\s+the\s+applications\s+now|yes,?\s*(?:submit|apply|send)|go\s+ahead\s+and\s+(?:apply|submit|send))\b/i.test(
          resolvedText,
        );
      const isBulkApprovalSubmit =
        isApprovalSubmitMsg &&
        effectiveMaxSubmissions >= 1 &&
        process.env.NODE_ENV !== 'test' &&
        !process.env.VITEST;

      const executeSubmissionFlow = async () => {
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
          {
            skipWhatsAppSend: true,
            preferredAgent,
            maxSubmissions: effectiveMaxSubmissions,
            deepThink: body.deepThink,
          },
        );

        const submittedCount = (result.submittedApplications ?? []).filter(
          (s) =>
            (s as { smtpStatus?: string }).smtpStatus === 'SENT' ||
            s.status === 'EMAIL_SENT' ||
            s.status === 'FORM_FILLED_AND_EMAILED' ||
            Boolean((s as { browserFormProof?: { registrationCompleted?: boolean } }).browserFormProof?.registrationCompleted),
        ).length;
        const wallet =
          submittedCount > 0
            ? await deps.repository.deductSubmissionCredits(
                result.customerId,
                result.routedAgent,
                submittedCount,
                body.costPerSubmissionCents,
                body.userUid,
              )
            : await deps.repository.getCustomerWallet(result.customerId, body.userUid);

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

      if (isBulkApprovalSubmit) {
        const jobId = `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        bulkSubmissionJobs.set(jobId, {
          jobId,
          status: 'RUNNING',
          phase: 'Analyzing CV & discovering verified targets...',
          sentCount: 0,
          totalTarget: effectiveMaxSubmissions,
          startedAt: new Date().toISOString(),
        });
        autonomousWorkerService.registerProgressCallback(preResolved.customer.id, (update) => {
          const existing = bulkSubmissionJobs.get(jobId);
          if (existing && existing.status === 'RUNNING') {
            existing.phase = update.phase;
            existing.sentCount = update.sentCount;
            existing.totalTarget = update.totalTarget || effectiveMaxSubmissions;
            existing.latestTarget = update.latestTarget;
          }
        });

        autonomousWorkerService.registerVerificationCallback(preResolved.customer.id, (req) => {
          return new Promise((resolve) => {
            const verificationId = `ver-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
            const existing = bulkSubmissionJobs.get(jobId);
            if (existing) {
              existing.phase =
                req.type === 'OTP'
                  ? `Waiting for your OTP code for ${req.targetName}...`
                  : req.type === 'EMAIL_LINK'
                    ? `Waiting for your email link confirmation for ${req.targetName}...`
                    : `Waiting for additional details/documents for ${req.targetName}...`;
              existing.pendingVerification = {
                id: verificationId,
                type: req.type,
                targetName: req.targetName,
                portalUrl: req.portalUrl,
                message: req.message,
                missingFields: req.missingFields,
                missingDocuments: req.missingDocuments,
              };
            }
            const timer = setTimeout(() => {
              pendingVerificationResolvers.delete(verificationId);
              const cur = bulkSubmissionJobs.get(jobId);
              if (cur && cur.pendingVerification?.id === verificationId) {
                cur.pendingVerification = undefined;
              }
              resolve({ skipped: true });
            }, 240_000);

            pendingVerificationResolvers.set(verificationId, (resp) => {
              clearTimeout(timer);
              pendingVerificationResolvers.delete(verificationId);
              const cur = bulkSubmissionJobs.get(jobId);
              if (cur && cur.pendingVerification?.id === verificationId) {
                cur.pendingVerification = undefined;
              }
              resolve(resp);
            });
          });
        });

        void executeSubmissionFlow()
          .then((payload) => {
            const existing = bulkSubmissionJobs.get(jobId);
            if (existing) {
              existing.status = 'COMPLETED';
              existing.phase = 'Completed';
              existing.pendingVerification = undefined;
              existing.sentCount = payload.data.submittedApplications?.length ?? existing.sentCount;
              existing.completedAt = new Date().toISOString();
              existing.result = payload;
            }
          })
          .catch((err) => {
            const existing = bulkSubmissionJobs.get(jobId);
            if (existing) {
              existing.status = 'FAILED';
              existing.pendingVerification = undefined;
              existing.error = err instanceof Error ? err.message : 'Bulk submission failed';
              existing.completedAt = new Date().toISOString();
            }
          })
          .finally(() => {
            autonomousWorkerService.clearProgressCallback(preResolved.customer.id);
            autonomousWorkerService.clearVerificationCallback(preResolved.customer.id);
          });

        return {
          ok: true,
          data: {
            asyncJobId: jobId,
            status: 'RUNNING',
            totalTarget: effectiveMaxSubmissions,
            phase: 'Analyzing CV & discovering verified targets...',
          },
        };
      }

      return executeSubmissionFlow();
    };

    const pendingVerificationResolvers = new Map<
      string,
      (resp: {
        otpCode?: string;
        confirmed?: boolean;
        skipped?: boolean;
        fieldValues?: Record<string, string>;
        uploadedDocuments?: Record<string, { fileName: string; contentBase64: string }>;
        draftDocuments?: string[];
      }) => void
    >();

    const bulkSubmissionJobs = new Map<
      string,
      {
        jobId: string;
        status: 'RUNNING' | 'COMPLETED' | 'FAILED';
        phase: string;
        sentCount: number;
        totalTarget: number;
        latestTarget?: string;
        pendingVerification?: {
          id: string;
          type: 'OTP' | 'EMAIL_LINK' | 'MISSING_INFO';
          targetName: string;
          portalUrl: string;
          message: string;
          missingFields?: Array<{
            key: string;
            label: string;
            selector: string;
            inputType: 'text' | 'textarea' | 'select';
            placeholder?: string;
            options?: string[];
          }>;
          missingDocuments?: Array<{
            key: string;
            label: string;
            selector: string;
            accept?: string;
          }>;
        };
        startedAt: string;
        completedAt?: string;
        result?: any;
        error?: string;
      }
    >();

    app.get('/api/v1/webchat/job/:jobId', async (request, reply) => {
      const { jobId } = request.params as { jobId: string };
      const job = bulkSubmissionJobs.get(jobId);
      if (!job) {
        return reply.status(404).send({ ok: false, error: 'Background job not found' });
      }
      return { ok: true, data: job };
    });

    app.post('/api/v1/webchat/job/:jobId/verify', async (request, reply) => {
      const body = z
        .object({
          verificationId: z.string().min(1),
          otpCode: z.string().optional(),
          confirmed: z.boolean().optional(),
          skipped: z.boolean().optional(),
          fieldValues: z.record(z.string()).optional(),
          uploadedDocuments: z
            .record(z.object({ fileName: z.string(), contentBase64: z.string() }))
            .optional(),
          draftDocuments: z.array(z.string()).optional(),
        })
        .parse(request.body ?? {});

      const resolver = pendingVerificationResolvers.get(body.verificationId);
      if (!resolver) {
        return reply.status(404).send({ ok: false, error: 'Verification prompt already expired or resolved' });
      }
      resolver({
        otpCode: body.otpCode,
        confirmed: body.confirmed,
        skipped: body.skipped,
        fieldValues: body.fieldValues,
        uploadedDocuments: body.uploadedDocuments,
        draftDocuments: body.draftDocuments,
      });
      return { ok: true };
    });

    app.post('/api/v1/webchat/message', handleWebChatMessage);
    app.post('/api/v1/webchat/send', handleWebChatMessage);

    // Always-On Morning Autopilot ($0.10/job, 10 unique jobs/day) & Free 4-Day Auto Follow-Ups
    app.get('/api/v1/autopilot', async (request, reply) => {
      const q = request.query as { userUid?: string };
      if (!q.userUid) {
        return reply.status(400).send({ ok: false, error: 'userUid is required' });
      }
      const config = await autopilotService.getAutopilotConfig(q.userUid);
      return { ok: true, data: config };
    });

    app.get('/api/v1/autopilot/submissions', async (request, reply) => {
      const q = request.query as { userUid?: string };
      if (!q.userUid) {
        return reply.status(400).send({ ok: false, error: 'userUid is required' });
      }
      const allSubs = await platformStore.fetchFirestoreCollection('nexora_submissions');
      const items = allSubs
        .filter(
          (s) =>
            (s.userUid === q.userUid || s.userId === q.userUid) &&
            String(s.source || '').toUpperCase() === 'AUTOPILOT',
        )
        .sort((a, b) =>
          String(b.submittedAt || b.createdAt || '').localeCompare(
            String(a.submittedAt || a.createdAt || ''),
          ),
        );
      return { ok: true, data: items };
    });

    app.post('/api/v1/autopilot', async (request) => {
      const body = z
        .object({
          userUid: z.string().min(1),
          enabled: z.boolean().optional(),
          status: z.enum(['ACTIVE', 'PAUSED', 'HIRED', 'LOW_BALANCE']).optional(),
          dailyLimit: z.number().int().min(1).max(25).optional(),
          runHourLocal: z.number().int().min(0).max(23).optional(),
        })
        .parse(request.body ?? {});
      const config = await autopilotService.updateAutopilotConfig(body.userUid, {
        enabled: body.enabled,
        status: body.status,
        dailyLimit: body.dailyLimit,
        runHourLocal: body.runHourLocal,
      });
      return { ok: true, data: config };
    });

    app.post('/api/v1/autopilot/run-now', async (request) => {
      const body = z
        .object({
          userUid: z.string().min(1),
        })
        .parse(request.body ?? {});
      const result = await autopilotService.runMorningAutopilotForUser(body.userUid, true);
      return { ok: true, data: result };
    });

    app.post('/api/v1/autopilot/followups/run', async () => {
      const result = await autopilotService.runFreeFollowUpSweep();
      return { ok: true, data: result };
    });

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

  app.post('/api/v1/openclaw/direct', async (request, reply) => {
    const body = DirectOpenClawPromptSchema.parse(request.body);
    const { evaluateRestrictedRequest } = await import('../core/permissions/security-guard');
    const guard = evaluateRestrictedRequest(body.prompt);
    if (guard.blocked) {
      return reply.status(403).send({
        ok: false,
        error: {
          code: guard.category || 'SECURITY_POLICY_BLOCKED',
          message: guard.userMessage || guard.reason,
        },
      });
    }
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
    const buffer = await fs
      .readFile(primaryPath)
      .catch(() => fs.readFile(fallbackPath))
      .catch(() => null);
    if (!buffer) {
      return reply.status(404).send({ ok: false, error: 'Document not found' });
    }
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
        userUid: z.string().optional(),
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

    const wallet = await deps.repository.getCustomerWallet(cid, q.userUid);
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
        q: z.string().optional(),
        role: z.string().optional(),
        skills: z.string().optional(),
        country: z.string().optional(),
        targetCountry: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(25).default(10),
      })
      .parse(request.query);

    const data = await jobSearchApiService.searchJobs({
      role: q.q || q.role || 'Software Developer',
      skills: q.skills ? q.skills.split(',').map((s) => s.trim()).filter(Boolean) : undefined,
      targetCountry: q.country || q.targetCountry,
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
              agentType: z.string().optional(),
            }),
          )
          .optional(),
        lookbackDays: z.number().int().min(1).max(60).optional(),
        userUid: z.string().optional(),
        phone: z.string().optional(),
      })
      .parse(request.body ?? {});

    const data = await imapMonitorService.fetchRepliesAndInterviews({
      submissions: body.submissions,
      lookbackDays: body.lookbackDays,
    });

    // Automatically refund the user for any bounced submission emails (idempotent per receiptId)
    const refundedReceipts: string[] = [];
    let updatedWallet: { balanceCents: number; balanceDollars: string } | undefined;
    if (data.bouncedReceiptIds.length > 0 && (body.userUid || body.phone)) {
      const digits = (body.phone || '27658016132').replace(/[^\d]/g, '') || '27658016132';
      const customerId = body.userUid || `webchat-${digits}`;
      for (const receiptId of data.bouncedReceiptIds) {
        const subMeta = body.submissions?.find(
          (s) => s.receiptId.toLowerCase() === receiptId.toLowerCase(),
        );
        const refundCents = await deps.repository.getAgentCostPerSubmissionCents(
          (subMeta?.agentType as AgentType) || AgentType.JOB_AGENT,
        );
        const creditRes = await deps.repository.addWalletCredits(
          customerId,
          refundCents,
          `bounce-refund:${receiptId.toUpperCase()}`,
          body.userUid,
        );
        if (creditRes.credited) {
          refundedReceipts.push(receiptId);
        }
        updatedWallet = {
          balanceCents: creditRes.balanceCents,
          balanceDollars: creditRes.balanceDollars,
        };
      }
    }

    return { ok: true, data: { ...data, refundedReceipts, wallet: updatedWallet } };
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

  app.post('/api/v1/jobs/match-from-cv', async (request, reply) => {
    const body = z
      .object({
        cvFilePath: z.string().optional(),
        cvText: z.string().optional(),
        targetRole: z.string().optional(),
        additionalNotes: z.string().optional(),
        targetCountry: z.string().optional(),
        limit: z.number().int().min(1).max(20).optional(),
      })
      .parse(request.body ?? {});

    let cvText = (body.cvText || '').trim();
    if (!cvText && body.cvFilePath) {
      const resolvedPath = path.resolve(process.cwd(), body.cvFilePath);
      const buf = await fs.readFile(resolvedPath);
      if (resolvedPath.toLowerCase().endsWith('.pdf')) {
        const parsed = await pdfParse(buf);
        cvText = (parsed?.text || '').trim();
      } else {
        cvText = buf.toString('utf8').trim();
      }
    }

    if (!cvText) {
      return reply.status(400).send({ ok: false, error: 'Could not extract text from CV' });
    }

    const aiProfile = await extractCvJobProfileWithAI(
      cvText,
      body.targetRole,
      body.additionalNotes,
      'cv-match-api',
      body.targetCountry,
    );
    const searchRole = aiProfile?.primaryTitle || body.targetRole || 'Professional';
    const searchTitles = aiProfile?.matchingTitles || [searchRole];
    const limit = body.limit ?? 5;

    const searchRes = await jobSearchApiService.searchJobs({
      role: searchRole,
      searchTitles,
      skills: aiProfile?.coreSkills,
      candidateYearsExperience: aiProfile?.yearsExperience,
      cvText,
      isTechRole: aiProfile?.isTechRole,
      recommendedEmployers: aiProfile?.recommendedEmployers,
      targetCountry: body.targetCountry,
      limit,
    });

    return {
      ok: true,
      data: {
        extractedTextLength: cvText.length,
        extractedTextPreview: cvText.slice(0, 400),
        aiProfile,
        titlesUsed: searchTitles,
        sourcesUsed: searchRes.sourcesUsed,
        jobs: searchRes.jobs.slice(0, limit).map((j) => ({
          title: j.title,
          company: j.company,
          location: j.location,
          source: j.source,
          url: j.applyUrl || j.url,
          contactEmail: j.contactEmail,
          matchScore: j.matchScore,
        })),
      },
    };
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

  app.get('/api/v1/email/preview', async (_request, reply) => {
    const { previewApplicationEmailHtml } = await import('../tools/email.service');
    const html = previewApplicationEmailHtml();
    reply.header('Content-Type', 'text/html; charset=utf-8');
    return reply.send(html);
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
    let buffer: Buffer | null = await fs
      .readFile(primaryPath)
      .catch(() => fs.readFile(fallbackPath))
      .catch(() => null);
    let contentType = safeName.toLowerCase().endsWith('.png')
      ? 'image/png'
      : /\.(jpe?g)$/i.test(safeName)
        ? 'image/jpeg'
        : safeName.toLowerCase().endsWith('.webp')
          ? 'image/webp'
          : 'application/pdf';
    if (!buffer) {
      const remote = await downloadFromFirebaseStorage(`documents/${safeName}`);
      if (remote) {
        buffer = remote.buffer;
        if (remote.contentType) contentType = remote.contentType;
      }
    }
    if (!buffer) {
      const matchedDoc = platformStore
        .getState()
        .supportingDocuments.find((d) => d.fileName === safeName || d.storedFileName === safeName);
      if (matchedDoc) {
        if (matchedDoc.downloadUrl && /^https?:\/\//i.test(matchedDoc.downloadUrl)) {
          return reply.redirect(matchedDoc.downloadUrl);
        }
        const remoteByStored = await downloadFromFirebaseStorage(`documents/${matchedDoc.storedFileName}`);
        if (remoteByStored) {
          buffer = remoteByStored.buffer;
          if (remoteByStored.contentType) contentType = remoteByStored.contentType;
        }
      }
    }
    if (!buffer) {
      return reply.status(404).send({ ok: false, error: 'Document not found' });
    }
    reply.header('Content-Type', contentType);
    reply.header('Content-Disposition', `inline; filename="${safeName}"`);
    reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
    reply.header('Content-Security-Policy', 'frame-ancestors *');
    return reply.send(buffer);
  });

  registerPlatformRoutes(app, { openclawService: deps.openclawService });

  app.post('/api/v1/tasks/delete', async (request) => {
    const body = z
      .object({
        conversationId: z.string().optional(),
        userUid: z.string().optional(),
        userEmail: z.string().optional(),
        receiptIds: z.array(z.string()).optional(),
      })
      .parse(request.body ?? {});

    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      const projectId = process.env.FIREBASE_PROJECT_ID || 'nexora-d7346';
      const apiKey = process.env.FIREBASE_API_KEY || 'AIzaSyBjRi92-GpP71HcBUUXknw3vPhX3lSh7dk';
      const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;

      const deleteByCollection = async (
        collection: string,
        predicate: (fields: Record<string, any>, docName: string) => boolean,
      ) => {
        try {
          const res = await fetch(`${base}/${collection}?pageSize=300&key=${apiKey}`, {
            signal: AbortSignal.timeout(6000),
          });
          if (!res.ok) return;
          const json = (await res.json()) as {
            documents?: Array<{ name: string; fields?: Record<string, any> }>;
          };
          const toDelete = (json.documents || []).filter((d) =>
            predicate(d.fields || {}, d.name),
          );
          await Promise.all(
            toDelete.map((d) =>
              fetch(`https://firestore.googleapis.com/v1/${d.name}?key=${apiKey}`, {
                method: 'DELETE',
                signal: AbortSignal.timeout(5000),
              }).catch(() => undefined),
            ),
          );
        } catch {
          // non-fatal
        }
      };

      await Promise.all([
        deleteByCollection('nexora_submissions', (f) => {
          const conv = f.conversationId?.stringValue || '';
          const email = (f.customerEmail?.stringValue || '').toLowerCase();
          const targets: string[] = (f.targets?.arrayValue?.values || []).map(
            (v: any) => v.stringValue || '',
          );
          if (body.conversationId && conv === body.conversationId) return true;
          if (
            body.receiptIds?.length &&
            body.receiptIds.some((rid) => targets.some((t) => t.includes(rid)))
          ) {
            return true;
          }
          if (!body.conversationId && body.userEmail && email === body.userEmail.toLowerCase()) {
            return true;
          }
          return false;
        }),
        deleteByCollection('nexora_messages', (f) => {
          const conv = f.conversationId?.stringValue || '';
          return Boolean(body.conversationId && conv === body.conversationId);
        }),
      ]);
    }

    return { ok: true };
  });

  registerLiveInterviewWebSocket(app);

  return app;
}
