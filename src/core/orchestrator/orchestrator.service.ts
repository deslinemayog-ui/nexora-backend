import {
  AgentType,
  ExecutionStatus,
  MessageType,
  Project,
  Task,
  TaskStatus,
} from '../../database/types';
import { agentRegistry, SpecialistAgentRegistry } from '../../agents/agent.registry';
import { ApprovalService } from '../../approvals/approval.service';
import { WhatsAppService } from '../../channels/whatsapp/whatsapp.service';
import { IncomingWhatsAppMessage } from '../../channels/whatsapp/whatsapp.types';
import { NexoraRepository } from '../../database/repository';
import { DocumentService } from '../../documents/document.service';
import { MemoryService } from '../../memory/memory.service';
import { NotificationService } from '../../notifications/notification.service';
import { OpenClawService } from '../../openclaw/openclaw.service';
import { ProjectService } from '../../projects/project.service';
import { QueueService } from '../../queues/queue.service';
import { AgentTaskJobPayload } from '../../queues/queue.types';
import { TaskService } from '../../tasks/task.service';
import { logger } from '../../utils/logger';
import { ConversationService } from '../conversation/conversation.service';
import { CustomerService } from '../customer/customer.service';
import { DetectedIntent, IntentDetector, intentDetector } from './intent.detector';
import { evaluateRestrictedRequest } from '../permissions/security-guard';

export interface OrchestrationResult {
  customerId: string;
  conversationId: string;
  detectedIntent: DetectedIntent;
  routedAgent: AgentType;
  project?: Project;
  tasks?: Task[];
  responseText: string;
  openclawRunId?: string;
  wasDuplicate?: boolean;
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

/**
 * Central Nexora AI Orchestrator (Section 6).
 * Coordinates the 10-step message lifecycle:
 * 1. Receive WhatsApp message
 * 2. Identify customer & tenant context
 * 3. Understand customer intent
 * 4. Distinguish simple questions vs. multi-step projects
 * 5. Create or resume persistent project & tasks
 * 6. Select appropriate specialist agent
 * 7. Delegate execution through OpenClaw in isolated tenant session
 * 8. Track execution progress & background jobs
 * 9. Store results, memories, and audit logs
 * 10. Send updates/responses to the customer through WhatsApp
 */
export class OrchestratorService {
  private readonly detector: IntentDetector;
  private readonly registry: SpecialistAgentRegistry;

  constructor(
    private readonly repository: NexoraRepository,
    private readonly whatsappService: WhatsAppService,
    private readonly openclawService: OpenClawService,
    private readonly customerService: CustomerService,
    private readonly conversationService: ConversationService,
    private readonly memoryService: MemoryService,
    private readonly projectService: ProjectService,
    private readonly taskService: TaskService,
    private readonly documentService: DocumentService,
    private readonly approvalService: ApprovalService,
    private readonly notificationService: NotificationService,
    private readonly queueService: QueueService,
    options?: {
      detector?: IntentDetector;
      registry?: SpecialistAgentRegistry;
    },
  ) {
    this.detector = options?.detector ?? intentDetector;
    this.registry = options?.registry ?? agentRegistry;

    this.registerBackgroundWorkers();
  }

  public bindToWhatsAppGateway(): void {
    this.whatsappService.onMessage(async (incoming) => {
      await this.handleIncomingWhatsAppMessage(incoming);
    });
  }

  private registerBackgroundWorkers(): void {
    this.queueService.registerProcessor<AgentTaskJobPayload>(
      'nexora-agent-execution',
      async (job, updateProgress) => {
        await updateProgress(25, 'Starting specialist agent task');
        const specialist = this.registry.getAgent(job.agentType);
        const profile = await this.customerService.getProfileForTenant(job.customerId);
        const memoryContext = await this.memoryService.buildMemoryContextPrompt(job.customerId);
        const projectBundle = await this.projectService.getProject(
          job.customerId,
          job.projectId,
        );
        const activeTask = projectBundle.tasks.find((t) => t.id === job.taskId);

        await updateProgress(50, 'Executing via OpenClaw');
        const output = await specialist.execute(this.openclawService, {
          customerId: job.customerId,
          sessionKey: job.openclawSessionKey,
          userMessage: job.prompt,
          profile,
          memoryContext,
          conversationContext: [],
          activeProject: projectBundle.project,
          activeTask,
        });

        await this.repository.recordAgentExecution({
          customerId: job.customerId,
          agentType: job.agentType,
          projectId: job.projectId,
          taskId: job.taskId,
          openclawSessionKey: job.openclawSessionKey,
          openclawRunId: output.runId,
          status: ExecutionStatus.COMPLETED,
          promptSummary: job.prompt,
          responseSummary: output.responseText,
          tokensUsed: output.tokensUsed,
          toolCallsCount: output.toolCallsCount,
          durationMs: output.durationMs,
        });

        await this.taskService.markTaskStatus(
          job.customerId,
          job.taskId,
          TaskStatus.COMPLETED,
          { summary: output.responseText },
        );

        await updateProgress(100, 'Completed');
        await this.notificationService.notifyCustomerProgress({
          customerId: job.customerId,
          recipientJid: job.recipientJid,
          projectId: job.projectId,
          title: `Task Update: ${activeTask?.title ?? 'Progress'}`,
          message: output.responseText,
        });
      },
    );
  }

  public async handleIncomingWhatsAppMessage(
    incoming: IncomingWhatsAppMessage,
    options?: { skipWhatsAppSend?: boolean; preferredAgent?: AgentType; maxSubmissions?: number; deepThink?: boolean },
  ): Promise<OrchestrationResult> {
    // Step 1: Check database-level deduplication
    const alreadyProcessed = await this.conversationService.isDuplicateMessage(
      incoming.externalMessageId,
    );
    if (alreadyProcessed) {
      logger.debug(
        { externalMessageId: incoming.externalMessageId },
        'Ignoring duplicate WhatsApp message in OrchestratorService',
      );
      const { customer } = await this.customerService.resolveCustomerFromWhatsApp({
        senderNumberOrJid: incoming.senderPhoneNumber,
        displayName: incoming.pushName,
      });
      const conv = await this.conversationService.getOrCreateActiveConversation(customer.id);
      return {
        customerId: customer.id,
        conversationId: conv.id,
        detectedIntent: {
          category: 'CONVERSATIONAL_FOLLOWUP',
          specialistAgent: AgentType.RESEARCH_AGENT,
          isMultiStepProject: false,
          confidence: 1,
        },
        routedAgent: AgentType.RESEARCH_AGENT,
        responseText: '',
        wasDuplicate: true,
      };
    }

    // Step 2: Identify Customer & Profile
    const { customer, profile } = await this.customerService.resolveCustomerFromWhatsApp({
      senderNumberOrJid: incoming.senderPhoneNumber,
      displayName: incoming.pushName,
    });

    if (
      incoming.pushName &&
      !/^(web chat customer|web console user|guest user|direct openclaw user|customer|applicant)$/i.test(
        incoming.pushName.trim(),
      ) &&
      profile.fullName !== incoming.pushName.trim()
    ) {
      profile.fullName = incoming.pushName.trim();
      await this.customerService.updateProfileFromExtractedData(customer.id, {
        fullName: incoming.pushName.trim(),
      });
    }

    if (!options?.skipWhatsAppSend) {
      await this.whatsappService.setTyping(incoming.senderJid, true);
    }

    try {
      const conversation = await this.conversationService.getOrCreateActiveConversation(
        customer.id,
      );

      // Process media attachment if present (CV, PDF, Voice Note, Image)
      let effectiveText = incoming.textContent;
      let mediaDocumentId: string | undefined;
      let hasUploadedCv = false;

      if (incoming.media) {
        const processedDoc = await this.documentService.processAndStoreDocument({
          customerId: customer.id,
          projectId: conversation.activeProjectId ?? undefined,
          originalFileName: incoming.media.fileName,
          mimeType: incoming.media.mimeType,
          buffer: incoming.media.buffer,
        });

        mediaDocumentId = processedDoc.document.id;
        if (processedDoc.cvMetadata) {
          hasUploadedCv = true;
          await this.customerService.updateProfileFromExtractedData(customer.id, {
            email: processedDoc.cvMetadata.email,
            yearsOfExperience: processedDoc.cvMetadata.yearsOfExperience,
            skills: processedDoc.cvMetadata.skills,
            educationSummary: processedDoc.cvMetadata.educationSummary,
            workExperience: processedDoc.cvMetadata.workExperience,
          });
        }

        if (!effectiveText && processedDoc.extractedText) {
          effectiveText = `[Attached ${processedDoc.document.documentType}: ${processedDoc.document.originalFileName}]\n${processedDoc.extractedText}`;
        } else if (processedDoc.extractedText) {
          effectiveText = `${effectiveText}\n\n[Extracted Document Content (${processedDoc.document.documentType})]:\n${processedDoc.extractedText}`;
        }
      }

      if (!effectiveText || effectiveText.trim().length === 0) {
        effectiveText = `[Received ${incoming.messageType} message]`;
      }

      // Security & Compliance Guardrail: Reject OS manipulation, unrelated file access, and certificate/gov doc edits
      const guard = evaluateRestrictedRequest(effectiveText);
      if (guard.blocked && guard.userMessage) {
        await this.repository.createAuditLog({
          customerId: customer.id,
          actorType: 'SYSTEM',
          actorId: guard.category || 'POLICY_BLOCK',
          action: 'RESTRICTED_REQUEST_REJECTED',
          resourceType: 'CONVERSATION',
          resourceId: conversation.id,
          details: {
            category: guard.category,
            reason: guard.reason,
          },
        });

        await this.conversationService.recordInboundMessage({
          customerId: customer.id,
          conversationId: conversation.id,
          externalMessageId: incoming.externalMessageId,
          messageType: incoming.messageType,
          content: effectiveText,
          mediaDocumentId,
          detectedIntent: guard.category || 'SECURITY_BLOCK',
          routedAgentType: AgentType.RESEARCH_AGENT,
        });

        await this.conversationService.recordOutboundMessage({
          customerId: customer.id,
          conversationId: conversation.id,
          content: guard.userMessage,
          routedAgentType: AgentType.RESEARCH_AGENT,
        });

        if (!options?.skipWhatsAppSend) {
          await this.whatsappService.sendText(incoming.senderJid, guard.userMessage);
        }

        return {
          customerId: customer.id,
          conversationId: conversation.id,
          detectedIntent: {
            category: 'SECURITY_BLOCK' as any,
            specialistAgent: AgentType.RESEARCH_AGENT,
            isMultiStepProject: false,
            confidence: 1,
          },
          routedAgent: AgentType.RESEARCH_AGENT,
          responseText: guard.userMessage,
        };
      }

      // Extract candidate full name if provided in third-person prompt e.g. "James Phiri wants you to help..."
      const nameMatch = effectiveText.match(/^([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)\s+wants you to help/i);
      if (nameMatch && nameMatch[1]) {
        const extractedName = nameMatch[1].trim();
        await this.customerService.updateProfileFromExtractedData(customer.id, {
          fullName: extractedName,
        });
      }

      // Check existing active project & pending approvals for this customer
      const pendingApprovals = await this.approvalService.listPendingApprovals(customer.id);
      let activeProjectBundle = conversation.activeProjectId
        ? await this.projectService
            .getProject(customer.id, conversation.activeProjectId)
            .catch(() => null)
        : null;

      // Step 3: Detect Intent (fast heuristic + AI semantic reasoning for indirect phrasing, typos, or native languages)
      const detected = await this.detector.detectWithAI(effectiveText, this.openclawService, {
        hasPendingApproval: pendingApprovals.length > 0,
        activeProjectAgent:
          activeProjectBundle?.project.assignedSpecialist ?? options?.preferredAgent,
        hasUploadedCv,
        customerId: customer.id,
      });

      // Record inbound message in database
      const inboundRecord = await this.conversationService.recordInboundMessage({
        customerId: customer.id,
        conversationId: conversation.id,
        externalMessageId: incoming.externalMessageId,
        messageType: incoming.messageType as MessageType,
        content: effectiveText,
        mediaDocumentId,
        detectedIntent: detected.category,
        routedAgentType: detected.specialistAgent,
        projectId: activeProjectBundle?.project.id,
      });

      // Extract & store durable customer memory facts
      await this.memoryService.extractAndStoreImplicitFacts(
        customer.id,
        effectiveText,
        inboundRecord.id,
      );

      // Handle Approval Responses immediately if the customer is responding to a pending approval
      if (detected.category === 'APPROVAL_RESPONSE' && pendingApprovals.length > 0) {
        const latestApproval = pendingApprovals[0]!;
        const approvalResult = await this.approvalService.processCustomerApprovalReply({
          customerId: customer.id,
          approvalId: latestApproval.id,
          rawReply: incoming.textContent,
        });

        await this.conversationService.recordOutboundMessage({
          customerId: customer.id,
          conversationId: conversation.id,
          content: approvalResult.replyMessage,
          routedAgentType: detected.specialistAgent,
          projectId: latestApproval.projectId ?? undefined,
        });

        if (!options?.skipWhatsAppSend) {
          await this.whatsappService.sendText(incoming.senderJid, approvalResult.replyMessage);
        }

        return {
          customerId: customer.id,
          conversationId: conversation.id,
          detectedIntent: detected,
          routedAgent: detected.specialistAgent,
          project: activeProjectBundle?.project,
          tasks: activeProjectBundle?.tasks,
          responseText: approvalResult.replyMessage,
        };
      }

      // Step 4 & 5: Handle Project Status Inquiry / Continuation OR Create Persistent Project
      if (detected.category === 'PROJECT_STATUS_INQUIRY') {
        const matched = await this.projectService.findMatchingActiveProject(
          customer.id,
          effectiveText,
          conversation.activeProjectId,
          detected.specialistAgent,
        );
        if (matched) {
          activeProjectBundle = matched;
          await this.conversationService.bindActiveProject(
            customer.id,
            conversation.id,
            matched.project.id,
          );
        }
      } else if (detected.isMultiStepProject) {
        // Check if an identical active project already exists before creating a new one
        const existingMatch = await this.projectService.findMatchingActiveProject(
          customer.id,
          effectiveText,
          conversation.activeProjectId,
          detected.specialistAgent,
        );

        const isSameGoal =
          existingMatch &&
          existingMatch.project.assignedSpecialist === detected.specialistAgent &&
          (!detected.targetCountry ||
            existingMatch.project.title
              .toLowerCase()
              .includes(detected.targetCountry.toLowerCase()));

        if (isSameGoal && existingMatch) {
          activeProjectBundle = existingMatch;
        } else {
          activeProjectBundle = await this.projectService.createGoalProject({
            customerId: customer.id,
            title: detected.suggestedProjectTitle ?? 'Customer Goal Project',
            objective: effectiveText.slice(0, 300),
            description: `Multi-step goal initiated via WhatsApp: "${effectiveText.slice(0, 500)}"`,
            assignedSpecialist: detected.specialistAgent,
            targetCountry: detected.targetCountry,
          });

          await this.conversationService.bindActiveProject(
            customer.id,
            conversation.id,
            activeProjectBundle.project.id,
          );

          await this.repository.createAuditLog({
            customerId: customer.id,
            actorType: 'SYSTEM',
            actorId: 'orchestrator',
            action: 'PROJECT_CREATED',
            resourceType: 'Project',
            resourceId: activeProjectBundle.project.id,
            details: {
              title: activeProjectBundle.project.title,
              assignedSpecialist: detected.specialistAgent,
              taskCount: activeProjectBundle.tasks.length,
            },
          });
        }
      }

      // If CV was uploaded while a Job project is active and on Step 1 ("Obtain and analyse CV"), advance step 1
      if (
        hasUploadedCv &&
        activeProjectBundle &&
        activeProjectBundle.project.assignedSpecialist === AgentType.JOB_AGENT
      ) {
        const firstTask = activeProjectBundle.tasks.find((t) => t.stepOrder === 1);
        if (firstTask && firstTask.status !== TaskStatus.COMPLETED) {
          const advanced = await this.projectService.advanceProjectProgress(
            customer.id,
            activeProjectBundle.project.id,
            { cvAnalyzed: true, documentId: mediaDocumentId },
          );
          activeProjectBundle = {
            project: advanced.project,
            tasks: advanced.tasks,
          };
        }
      }

      // Step 6: Select Specialist Agent
      const routedAgentType =
        activeProjectBundle?.project.assignedSpecialist ?? detected.specialistAgent;
      const specialistAgent = this.registry.getAgent(routedAgentType);

      // Refresh profile & memory context
      const updatedProfile = await this.customerService.getProfileForTenant(customer.id);
      const memoryContext = await this.memoryService.buildMemoryContextPrompt(customer.id);
      const recentContext = await this.conversationService.getRecentContext(
        customer.id,
        conversation.id,
        10,
      );

      const currentTask = activeProjectBundle?.tasks.find(
        (t) =>
          t.status === TaskStatus.IN_PROGRESS ||
          t.status === TaskStatus.WAITING_FOR_CUSTOMER ||
          t.status === TaskStatus.AWAITING_APPROVAL,
      );

      // Step 7 & 8: Delegate execution through OpenClaw in isolated tenant session
      const executionOutput = await specialistAgent.execute(this.openclawService, {
        customerId: customer.id,
        sessionKey: conversation.openclawSessionKey,
        userMessage: effectiveText,
        profile: updatedProfile,
        memoryContext,
        conversationContext: recentContext,
        activeProject: activeProjectBundle?.project,
        activeTask: currentTask,
        maxSubmissions: options?.maxSubmissions,
        deepThink: options?.deepThink,
      });

      // Automatically advance project task steps when autonomous work has been executed
      // Note: Do NOT auto-advance past step 1 if the Job Agent is conducting a CV interview/intake
      if (activeProjectBundle && process.env.NODE_ENV !== 'test') {
        const isCvInterview =
          routedAgentType === AgentType.JOB_AGENT &&
          (/\b(?:doesn't have a cv|does not have a cv|don't have a cv|no cv|without a cv|interview me|draft.*(?:cv|resume)|build.*(?:cv|resume)|compile.*(?:cv|resume)|stage \d|target role|work experience|what i do|my education)\b/i.test(
            effectiveText,
          ) ||
          (activeProjectBundle.tasks.some((t) => t.stepOrder === 1 && t.status !== TaskStatus.COMPLETED) &&
           !/\b(?:looks good|apply now|proceed with applications?|submit applications?|confirm cv|start applying|go ahead and apply|search and apply)\b/i.test(
             effectiveText,
           )));

        if (!isCvInterview) {
          const stepsToComplete = Math.min(
            4,
            activeProjectBundle.tasks.filter((t) => t.status !== TaskStatus.COMPLETED && !t.requiresApproval).length,
          );
          for (let i = 0; i < stepsToComplete; i++) {
            const advanced = await this.projectService.advanceProjectProgress(
              customer.id,
              activeProjectBundle.project.id,
              { autonomousExecution: true, runId: executionOutput.runId },
            );
            activeProjectBundle = {
              project: advanced.project,
              tasks: advanced.tasks,
            };
          }
        }
      }

      // Step 9: Store AgentExecution & outbound message
      await this.repository.recordAgentExecution({
        customerId: customer.id,
        agentType: routedAgentType,
        projectId: activeProjectBundle?.project.id,
        taskId: currentTask?.id,
        openclawSessionKey: conversation.openclawSessionKey,
        openclawRunId: executionOutput.runId,
        status: ExecutionStatus.COMPLETED,
        promptSummary: effectiveText,
        responseSummary: executionOutput.responseText,
        tokensUsed: executionOutput.tokensUsed,
        toolCallsCount: executionOutput.toolCallsCount,
        durationMs: executionOutput.durationMs,
      });

      const finalResponseText =
        detected.category === 'PROJECT_STATUS_INQUIRY' && activeProjectBundle
          ? `${this.projectService.formatProjectStatusSummary(activeProjectBundle)}\n\n${executionOutput.responseText}`
          : executionOutput.responseText;

      let outboundExternalId = `web-${Date.now()}`;
      if (!options?.skipWhatsAppSend) {
        const receipt = await this.whatsappService.sendText(
          incoming.senderJid,
          finalResponseText,
          incoming.externalMessageId,
        );
        outboundExternalId = receipt.externalMessageId;
      }

      await this.conversationService.recordOutboundMessage({
        customerId: customer.id,
        conversationId: conversation.id,
        externalMessageId: outboundExternalId,
        content: finalResponseText,
        routedAgentType,
        projectId: activeProjectBundle?.project.id,
      });

      return {
        customerId: customer.id,
        conversationId: conversation.id,
        detectedIntent: detected,
        routedAgent: routedAgentType,
        project: activeProjectBundle?.project,
        tasks: activeProjectBundle?.tasks,
        responseText: finalResponseText,
        openclawRunId: executionOutput.runId,
        thinkingSummary: executionOutput.thinkingSummary,
        thinkingDurationMs: executionOutput.thinkingDurationMs,
        generatedDocument: executionOutput.generatedDocument,
        submittedApplications: executionOutput.submittedApplications,
      };
    } finally {
      if (!options?.skipWhatsAppSend) {
        await this.whatsappService.setTyping(incoming.senderJid, false);
      }
    }
  }
}
