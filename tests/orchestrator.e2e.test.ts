import { describe, expect, it } from 'vitest';
import { ActionCategory, AgentType, ApprovalStatus, TaskStatus } from '../src/database/types';
import {
  ConnectionStateSnapshot,
  ConnectionUpdateHandler,
  DeliveryUpdateHandler,
  IncomingMessageHandler,
  IncomingWhatsAppMessage,
  IWhatsAppProvider,
  OutgoingMessageReceipt,
  OutgoingWhatsAppMessage,
} from '../src/channels/whatsapp/whatsapp.types';
import { JobSearchAgent } from '../src/agents/job-agent/job.agent';
import { createNexoraApplication } from '../src/main';

class MockWhatsAppProvider implements IWhatsAppProvider {
  public readonly providerName = 'mock-baileys';
  public readonly sentMessages: OutgoingWhatsAppMessage[] = [];
  private incomingHandler?: IncomingMessageHandler;

  public async start(): Promise<void> {}
  public async stop(): Promise<void> {}

  public async sendMessage(payload: OutgoingWhatsAppMessage): Promise<OutgoingMessageReceipt> {
    this.sentMessages.push(payload);
    return {
      externalMessageId: `mock-out-${this.sentMessages.length}`,
      recipientJid: payload.recipientJidOrNumber,
      timestamp: new Date(),
      status: 'SENT',
    };
  }

  public async sendTypingIndicator(): Promise<void> {}
  public async markMessageRead(): Promise<void> {}

  public getConnectionState(): ConnectionStateSnapshot {
    return { status: 'CONNECTED', reconnectAttempts: 0, connectedNumber: '+447700900000' };
  }

  public onIncomingMessage(handler: IncomingMessageHandler): void {
    this.incomingHandler = handler;
  }

  public onDeliveryUpdate(_handler: DeliveryUpdateHandler): void {}
  public onConnectionUpdate(_handler: ConnectionUpdateHandler): void {}

  public async simulateIncoming(msg: IncomingWhatsAppMessage): Promise<void> {
    if (this.incomingHandler) {
      await this.incomingHandler(msg);
    }
  }
}

describe('End-to-End Orchestrator: Specialist Agent Routing, Persistent Projects, Continuation, Approvals & Queues', () => {
  it('routes customer goals to the right specialist agent, creates persistent 8-step Canada job project, and resumes seamlessly when returning later', async () => {
    const waProvider = new MockWhatsAppProvider();

    const app = await createNexoraApplication({
      useInMemoryStores: true,
      whatsappProvider: waProvider,
      openclawExecutor: async (input) => {
        return {
          runId: `run-${Date.now()}`,
          sessionKey: input.sessionKey,
          responseText: `[${input.agentType}] I can help with that. Let's start by understanding your qualifications and experience.`,
          tokensUsed: 120,
          toolCallsCount: 0,
          durationMs: 15,
          status: 'COMPLETED',
        };
      },
    });

    // 1. Customer sends: "Find me a job in Canada."
    const firstTurn = await app.orchestratorService.handleIncomingWhatsAppMessage({
      externalMessageId: 'wa-msg-canada-1',
      senderJid: '27821234567@s.whatsapp.net',
      senderPhoneNumber: '+27821234567',
      pushName: 'Thabo',
      timestamp: new Date(),
      messageType: 'TEXT',
      textContent: 'Find me a job in Canada.',
    });

    expect(firstTurn.routedAgent).toBe(AgentType.JOB_AGENT);
    expect(firstTurn.project).toBeDefined();
    expect(firstTurn.project?.title).toBe('Find Employment in Canada');
    expect(firstTurn.tasks?.length).toBe(8);
    expect(firstTurn.tasks?.[0]?.title).toBe('Obtain and analyse CV');
    expect(firstTurn.tasks?.[5]?.title).toBe('Request customer approval');
    expect(firstTurn.tasks?.[5]?.requiresApproval).toBe(true);

    const projectId = firstTurn.project!.id;

    // 2. Customer uploads their CV on the next message -> Step 1 completes & Step 2 starts
    const cvUploadTurn = await app.orchestratorService.handleIncomingWhatsAppMessage({
      externalMessageId: 'wa-msg-canada-2',
      senderJid: '27821234567@s.whatsapp.net',
      senderPhoneNumber: '+27821234567',
      pushName: 'Thabo',
      timestamp: new Date(),
      messageType: 'PDF',
      textContent: 'Here is my CV for the Canada job search.',
      media: {
        buffer: Buffer.from(
          '%PDF-1.4\nThabo CV\n7 years experience in Mechanical Engineering, Project Management\nB.Sc Mechanical Engineering\nthabo@example.com',
        ),
        mimeType: 'application/pdf',
        fileName: 'Thabo_CV.pdf',
        fileSizeBytes: 128,
      },
    });

    expect(cvUploadTurn.project?.id).toBe(projectId);
    const step1 = cvUploadTurn.tasks?.find((t) => t.stepOrder === 1);
    const step2 = cvUploadTurn.tasks?.find((t) => t.stepOrder === 2);
    expect(step1?.status).toBe(TaskStatus.COMPLETED);
    expect(step2?.status).toBe(TaskStatus.IN_PROGRESS);

    // 3. Customer returns a week later and asks: "What's happening with my Canada job search?"
    // Nexora MUST retrieve the existing project and continue from Step 2 without restarting!
    const statusTurn = await app.orchestratorService.handleIncomingWhatsAppMessage({
      externalMessageId: 'wa-msg-canada-3',
      senderJid: '27821234567@s.whatsapp.net',
      senderPhoneNumber: '+27821234567',
      pushName: 'Thabo',
      timestamp: new Date(),
      messageType: 'TEXT',
      textContent: "What's happening with my Canada job search?",
    });

    expect(statusTurn.detectedIntent.category).toBe('PROJECT_STATUS_INQUIRY');
    expect(statusTurn.project?.id).toBe(projectId);
    expect(statusTurn.responseText).toContain('Find Employment in Canada');
    expect(statusTurn.responseText).toContain('1/8 steps completed');
    expect(statusTurn.responseText).toContain('Identify suitable employment categories');

    // Ensure only 1 project was ever created for this customer
    const allCustomerProjects = await app.projectService.listCustomerProjects(
      firstTurn.customerId,
    );
    expect(allCustomerProjects.length).toBe(1);

    await app.stop();
  });

  it('correctly routes Visa, Investor, Business, Education, and Research intents and detects job scams', async () => {
    const waProvider = new MockWhatsAppProvider();
    const app = await createNexoraApplication({
      useInMemoryStores: true,
      whatsappProvider: waProvider,
      openclawExecutor: async (input) => ({
        runId: 'run-routing',
        sessionKey: input.sessionKey,
        responseText: `Handled by ${input.agentType}`,
        tokensUsed: 50,
        toolCallsCount: 0,
        durationMs: 5,
        status: 'COMPLETED',
      }),
    });

    const cases: Array<{ prompt: string; expectedAgent: AgentType; phone: string }> = [
      {
        prompt: 'job application',
        expectedAgent: AgentType.JOB_AGENT,
        phone: '+447700900200',
      },
      {
        prompt: 'Help me relocate to Canada.',
        expectedAgent: AgentType.VISA_AGENT,
        phone: '+447700900201',
      },
      {
        prompt: 'Find investors for my startup.',
        expectedAgent: AgentType.INVESTOR_AGENT,
        phone: '+447700900202',
      },
      {
        prompt: 'Help me expand my business into South Africa.',
        expectedAgent: AgentType.BUSINESS_AGENT,
        phone: '+447700900203',
      },
      {
        prompt: 'Find universities offering scholarships in America.',
        expectedAgent: AgentType.EDUCATION_AGENT,
        phone: '+447700900204',
      },
      {
        prompt: 'Can you summarize the pros and cons of remote work tools?',
        expectedAgent: AgentType.RESEARCH_AGENT,
        phone: '+447700900205',
      },
    ];

    for (const [idx, c] of cases.entries()) {
      const res = await app.orchestratorService.handleIncomingWhatsAppMessage({
        externalMessageId: `msg-route-${idx}`,
        senderJid: `${c.phone.slice(1)}@s.whatsapp.net`,
        senderPhoneNumber: c.phone,
        timestamp: new Date(),
        messageType: 'TEXT',
        textContent: c.prompt,
      });
      expect(res.routedAgent).toBe(c.expectedAgent);
    }

    // Verify JobSearchAgent scam risk detector
    const jobAgent = new JobSearchAgent();
    const scamCheck = jobAgent.assessVacancyScamRisk(
      'Urgent hiring! No experience needed, earn $5000 per week. Please pay for visa processing fee and contact HR at recruiter123@gmail.com',
    );
    expect(scamCheck.isSuspicious).toBe(true);
    expect(scamCheck.redFlags.length).toBeGreaterThanOrEqual(2);

    await app.stop();
  });

  it('enforces explicit human approval workflow (ambiguous vs. approve vs. reject) and logs audit records', async () => {
    const waProvider = new MockWhatsAppProvider();
    const app = await createNexoraApplication({
      useInMemoryStores: true,
      whatsappProvider: waProvider,
      openclawExecutor: async (input) => ({
        runId: 'run-approval',
        sessionKey: input.sessionKey,
        responseText: 'Standard turn',
        tokensUsed: 40,
        toolCallsCount: 0,
        durationMs: 5,
        status: 'COMPLETED',
      }),
    });

    const { customer } = await app.customerService.resolveCustomerFromWhatsApp({
      senderNumberOrJid: '+447700900555',
      displayName: 'Sarah Founder',
    });

    const { approval } = await app.approvalService.requestCustomerApproval({
      customerId: customer.id,
      actionCategory: ActionCategory.SUBMIT_JOB_APPLICATION,
      title: 'Submit Senior Backend Engineer Application to Acme Corp',
      description: 'I have prepared your tailored CV and cover letter for Acme Corp.',
      actionPayload: { employer: 'Acme Corp', role: 'Senior Backend Engineer' },
    });

    expect(approval.status).toBe(ApprovalStatus.PENDING);

    // 1. Ambiguous reply must NOT execute the action
    const ambiguousCheck = await app.approvalService.processCustomerApprovalReply({
      customerId: customer.id,
      approvalId: approval.id,
      rawReply: 'Yes maybe if the salary is high',
    });
    expect(ambiguousCheck.decision).toBe('AMBIGUOUS');
    expect(ambiguousCheck.approval.status).toBe(ApprovalStatus.PENDING);

    // 2. Unambiguous approval via WhatsApp message executes and logs to AuditLog
    const whatsappApprovalTurn = await app.orchestratorService.handleIncomingWhatsAppMessage({
      externalMessageId: 'wa-approve-msg-1',
      senderJid: '447700900555@s.whatsapp.net',
      senderPhoneNumber: '+447700900555',
      timestamp: new Date(),
      messageType: 'TEXT',
      textContent: 'Yes, submit it',
    });

    expect(whatsappApprovalTurn.detectedIntent.category).toBe('APPROVAL_RESPONSE');
    expect(whatsappApprovalTurn.responseText).toContain('approved and executed');

    const auditLogs = await app.repository.listAuditLogs(customer.id);
    const actions = auditLogs.map((l) => l.action);
    expect(actions).toContain('APPROVAL_REQUESTED');
    expect(actions).toContain('APPROVAL_GRANTED_AND_EXECUTED');

    await app.stop();
  });

  it('processes background queue jobs with automatic retry on transient failure and sends WhatsApp progress notifications', async () => {
    const waProvider = new MockWhatsAppProvider();
    let attemptCounter = 0;

    const app = await createNexoraApplication({
      useInMemoryStores: true,
      whatsappProvider: waProvider,
      openclawExecutor: async (input) => {
        attemptCounter += 1;
        if (attemptCounter === 1) {
          throw new Error('Simulated transient OpenClaw network timeout');
        }
        return {
          runId: 'run-bg-recovered',
          sessionKey: input.sessionKey,
          responseText:
            "I've found 8 opportunities in Canada that match your experience and am reviewing eligibility.",
          tokensUsed: 210,
          toolCallsCount: 2,
          durationMs: 25,
          status: 'COMPLETED',
        };
      },
    });

    const { customer } = await app.customerService.resolveCustomerFromWhatsApp({
      senderNumberOrJid: '+16045550188',
      displayName: 'David',
    });

    const projectBundle = await app.projectService.createGoalProject({
      customerId: customer.id,
      title: 'Find Employment in Canada',
      objective: 'Find Software Engineer role in Vancouver',
      description: 'Background job search',
      assignedSpecialist: AgentType.JOB_AGENT,
      targetCountry: 'Canada',
    });

    const task = projectBundle.tasks[2]!; // Step 3: Research relevant job opportunities
    const sessionKey = app.openclawService.createTaskSessionKey(customer.id, task.id);

    const jobRecord = await app.taskService.dispatchBackgroundAgentTask({
      jobType: 'AGENT_TASK_EXECUTION',
      customerId: customer.id,
      projectId: projectBundle.project.id,
      taskId: task.id,
      agentType: AgentType.JOB_AGENT,
      openclawSessionKey: sessionKey,
      prompt: 'Research 8 matching software engineering vacancies in Canada',
      recipientJid: customer.whatsappJid,
    });

    expect(jobRecord.status).toBe('COMPLETED');
    expect(jobRecord.attemptsMade).toBe(2); // Succeeded on retry #2!
    expect(
      waProvider.sentMessages.some((m) =>
        m.text?.includes("I've found 8 opportunities in Canada"),
      ),
    ).toBe(true);

    await app.stop();
  });
});
