import {
  ActionCategory,
  Approval,
  ApprovalStatus,
  TaskStatus,
} from '../database/types';
import { NexoraRepository } from '../database/repository';
import { ValidationError } from '../utils/errors';

export type CustomerDecisionParseResult =
  | 'UNAMBIGUOUS_APPROVE'
  | 'UNAMBIGUOUS_REJECT'
  | 'AMBIGUOUS';

const UNAMBIGUOUS_APPROVE_PATTERNS = [
  /^(?:yes|yep|yeah)\b/i,
  /^approve(?:d)?\b/i,
  /^confirm(?:ed)?\b/i,
  /^proceed\b/i,
  /^go\s+ahead\b/i,
  /^yes,?\s*(?:please\s+)?(?:submit|send|approve|proceed|do\s+it)/i,
  /^submit\s+it$/i,
];

const UNAMBIGUOUS_REJECT_PATTERNS = [
  /^(?:no|nope)\b/i,
  /^reject(?:ed)?\b/i,
  /^cancel\b/i,
  /^stop\b/i,
  /^do\s+not\s+(?:submit|send|proceed)/i,
  /^don't\s+(?:submit|send|proceed)/i,
];

/**
 * Human-in-the-Loop Approval & Audit Workflow Service.
 * Ensures sensitive external actions (sending emails, submitting job applications,
 * contacting investors, sharing personal documents, booking appointments, making payments,
 * submitting official forms) NEVER execute without explicit, unambiguous customer approval.
 */
export class ApprovalService {
  constructor(private readonly repository: NexoraRepository) {}

  /**
   * Parses a customer's reply to determine whether it is an unambiguous approval,
   * an unambiguous rejection, or an ambiguous response requiring clarification.
   */
  public parseCustomerDecision(rawReply: string): CustomerDecisionParseResult {
    const trimmed = rawReply.trim();
    if (!trimmed) return 'AMBIGUOUS';

    // Reject mixed/conditional responses like "yes maybe later" or "yes if..."
    if (/\b(?:maybe|not\s+sure|wait|hold\s+on|later|if|unless)\b/i.test(trimmed)) {
      return 'AMBIGUOUS';
    }

    for (const pattern of UNAMBIGUOUS_APPROVE_PATTERNS) {
      if (pattern.test(trimmed)) {
        return 'UNAMBIGUOUS_APPROVE';
      }
    }

    for (const pattern of UNAMBIGUOUS_REJECT_PATTERNS) {
      if (pattern.test(trimmed)) {
        return 'UNAMBIGUOUS_REJECT';
      }
    }

    return 'AMBIGUOUS';
  }

  public async requestCustomerApproval(params: {
    customerId: string;
    projectId?: string;
    taskId?: string;
    actionCategory: ActionCategory;
    title: string;
    description: string;
    actionPayload: Record<string, unknown>;
  }): Promise<{ approval: Approval; promptMessage: string }> {
    const approval = await this.repository.createApproval(params);

    if (params.taskId) {
      await this.repository.updateTaskStatus(
        params.customerId,
        params.taskId,
        TaskStatus.AWAITING_APPROVAL,
      );
    }

    await this.repository.createAuditLog({
      customerId: params.customerId,
      actorType: 'SYSTEM',
      actorId: 'approval-service',
      action: 'APPROVAL_REQUESTED',
      resourceType: 'Approval',
      resourceId: approval.id,
      details: {
        actionCategory: params.actionCategory,
        title: params.title,
        projectId: params.projectId,
        taskId: params.taskId,
      },
    });

    const promptMessage = [
      `🔒 *Approval Required: ${params.title}*`,
      params.description,
      '',
      'Would you like me to proceed? Please reply *"Yes, submit it"* to approve or *"No, cancel"* to decline.',
    ].join('\n');

    return { approval, promptMessage };
  }

  public async listPendingApprovals(customerId: string): Promise<Approval[]> {
    return this.repository.listPendingApprovals(customerId);
  }

  public async processCustomerApprovalReply(params: {
    customerId: string;
    approvalId: string;
    rawReply: string;
    executeApprovedAction?: (approval: Approval) => Promise<Record<string, unknown>>;
  }): Promise<{
    decision: CustomerDecisionParseResult;
    approval: Approval;
    replyMessage: string;
  }> {
    const pending = await this.repository.getApprovalForTenant(
      params.customerId,
      params.approvalId,
    );

    if (pending.status !== ApprovalStatus.PENDING) {
      throw new ValidationError(`Approval (${pending.id}) is already ${pending.status}`);
    }

    if (pending.expiresAt.getTime() < Date.now()) {
      const expired = await this.repository.resolveApproval({
        customerId: params.customerId,
        approvalId: pending.id,
        status: ApprovalStatus.EXPIRED,
        customerResponseRaw: params.rawReply,
      });
      return {
        decision: 'AMBIGUOUS',
        approval: expired,
        replyMessage:
          'This approval request has expired for your security. Please let me know if you would like me to prepare a fresh request.',
      };
    }

    const decision = this.parseCustomerDecision(params.rawReply);

    if (decision === 'AMBIGUOUS') {
      return {
        decision,
        approval: pending,
        replyMessage: `To protect your account, I need an unambiguous confirmation before proceeding with *"${pending.title}"*. Please reply *"Yes, submit it"* to approve or *"No, cancel"* to decline.`,
      };
    }

    if (decision === 'UNAMBIGUOUS_REJECT') {
      const rejected = await this.repository.resolveApproval({
        customerId: params.customerId,
        approvalId: pending.id,
        status: ApprovalStatus.REJECTED,
        customerResponseRaw: params.rawReply,
      });

      if (pending.taskId) {
        await this.repository.updateTaskStatus(
          params.customerId,
          pending.taskId,
          TaskStatus.CANCELLED,
        );
      }

      await this.repository.createAuditLog({
        customerId: params.customerId,
        actorType: 'CUSTOMER',
        actorId: params.customerId,
        action: 'APPROVAL_REJECTED',
        resourceType: 'Approval',
        resourceId: pending.id,
        details: {
          actionCategory: pending.actionCategory,
          customerResponseRaw: params.rawReply,
        },
      });

      return {
        decision,
        approval: rejected,
        replyMessage: `Understood — I have cancelled *"${pending.title}"* and no external action was taken.`,
      };
    }

    // UNAMBIGUOUS_APPROVE
    const executionResult = params.executeApprovedAction
      ? await params.executeApprovedAction(pending)
      : {
          executed: true,
          actionCategory: pending.actionCategory,
          timestamp: new Date().toISOString(),
        };

    const executed = await this.repository.resolveApproval({
      customerId: params.customerId,
      approvalId: pending.id,
      status: ApprovalStatus.EXECUTED,
      customerResponseRaw: params.rawReply,
      executionResult,
    });

    if (pending.taskId) {
      await this.repository.updateTaskStatus(
        params.customerId,
        pending.taskId,
        TaskStatus.COMPLETED,
        executionResult,
      );
    }

    await this.repository.createAuditLog({
      customerId: params.customerId,
      actorType: 'CUSTOMER',
      actorId: params.customerId,
      action: 'APPROVAL_GRANTED_AND_EXECUTED',
      resourceType: 'Approval',
      resourceId: pending.id,
      details: {
        actionCategory: pending.actionCategory,
        customerResponseRaw: params.rawReply,
        executionResult,
      },
    });

    return {
      decision,
      approval: executed,
      replyMessage: `✅ Thank you for confirming. I have approved and executed *"${pending.title}"*. All details have been recorded in your activity log.`,
    };
  }
}
