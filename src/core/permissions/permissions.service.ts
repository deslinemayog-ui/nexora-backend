import { ActionCategory } from '../../database/types';

export type AutomaticallyPermittedAction =
  | 'RESEARCH'
  | 'INFORMATION_GATHERING'
  | 'DOCUMENT_ANALYSIS'
  | 'DRAFTING'
  | 'COMPARING_OPPORTUNITIES'
  | 'PREPARING_APPLICATION_DOCUMENTS'
  | 'CREATING_TASK_LISTS'
  | 'ORGANISING_FILES';

export type CustomerOnlyLegalAction =
  | 'PERSONAL_IDENTITY_VERIFICATION'
  | 'LEGAL_SIGNATURE'
  | 'ATTEND_INTERVIEW'
  | 'BIOMETRIC_ENROLMENT'
  | 'SWORN_DECLARATION';

export interface ActionPermissionEvaluation {
  executionPolicy: 'AUTO_PERMITTED' | 'REQUIRES_CUSTOMER_APPROVAL' | 'CUSTOMER_ONLY_ACTION';
  actionCategory?: ActionCategory;
  reason: string;
}

const AUTO_PERMITTED_SET = new Set<string>([
  'RESEARCH',
  'INFORMATION_GATHERING',
  'DOCUMENT_ANALYSIS',
  'DRAFTING',
  'COMPARING_OPPORTUNITIES',
  'PREPARING_APPLICATION_DOCUMENTS',
  'CREATING_TASK_LISTS',
  'ORGANISING_FILES',
]);

const APPROVAL_REQUIRED_MAP: Record<string, ActionCategory> = {
  SEND_EMAIL: ActionCategory.SEND_EMAIL,
  SUBMIT_JOB_APPLICATION: ActionCategory.SUBMIT_JOB_APPLICATION,
  CONTACT_INVESTOR: ActionCategory.CONTACT_INVESTOR,
  SHARE_PERSONAL_DOCUMENT: ActionCategory.SHARE_PERSONAL_DOCUMENT,
  BOOK_APPOINTMENT: ActionCategory.BOOK_APPOINTMENT,
  MAKE_PAYMENT: ActionCategory.MAKE_PAYMENT,
  SUBMIT_OFFICIAL_FORM: ActionCategory.SUBMIT_OFFICIAL_FORM,
};

const CUSTOMER_ONLY_SET = new Set<string>([
  'PERSONAL_IDENTITY_VERIFICATION',
  'LEGAL_SIGNATURE',
  'ATTEND_INTERVIEW',
  'BIOMETRIC_ENROLMENT',
  'SWORN_DECLARATION',
]);

/**
 * Evaluates whether a proposed agent action can execute automatically,
 * requires explicit human approval, or must be performed directly by the customer.
 * Implements Section 10 (Human Approval & Permissions).
 */
export class PermissionsService {
  public evaluateAction(actionIdentifier: string): ActionPermissionEvaluation {
    const normalized = actionIdentifier.trim().toUpperCase();

    if (CUSTOMER_ONLY_SET.has(normalized)) {
      return {
        executionPolicy: 'CUSTOMER_ONLY_ACTION',
        reason:
          'Actions requiring personal identity verification, legal signatures, biometrics, or live interviews must be completed directly by the customer.',
      };
    }

    if (normalized in APPROVAL_REQUIRED_MAP) {
      const category = APPROVAL_REQUIRED_MAP[normalized]!;
      return {
        executionPolicy: 'REQUIRES_CUSTOMER_APPROVAL',
        actionCategory: category,
        reason: `Action "${category}" affects external parties or personal records and requires explicit, unambiguous customer approval before execution.`,
      };
    }

    if (AUTO_PERMITTED_SET.has(normalized)) {
      return {
        executionPolicy: 'AUTO_PERMITTED',
        reason: `Action "${normalized}" is a safe internal research, analysis, or drafting operation.`,
      };
    }

    // Default fail-closed: unknown external actions require explicit approval
    return {
      executionPolicy: 'REQUIRES_CUSTOMER_APPROVAL',
      actionCategory: ActionCategory.SUBMIT_OFFICIAL_FORM,
      reason: `Unclassified action "${normalized}" defaults to requiring explicit customer approval under least-privilege policy.`,
    };
  }
}

export const permissionsService = new PermissionsService();
