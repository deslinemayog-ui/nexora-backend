export const AccountStatus = {
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  DEACTIVATED: 'DEACTIVATED',
} as const;
export type AccountStatus = (typeof AccountStatus)[keyof typeof AccountStatus];

export const SubscriptionTier = {
  FREE: 'FREE',
  STARTER: 'STARTER',
  PROFESSIONAL: 'PROFESSIONAL',
  ENTERPRISE: 'ENTERPRISE',
} as const;
export type SubscriptionTier = (typeof SubscriptionTier)[keyof typeof SubscriptionTier];

export const SubscriptionStatus = {
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  CANCELLED: 'CANCELLED',
  TRIALING: 'TRIALING',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const ConversationStatus = {
  ACTIVE: 'ACTIVE',
  ARCHIVED: 'ARCHIVED',
  CLOSED: 'CLOSED',
} as const;
export type ConversationStatus = (typeof ConversationStatus)[keyof typeof ConversationStatus];

export const MessageDirection = {
  INBOUND: 'INBOUND',
  OUTBOUND: 'OUTBOUND',
} as const;
export type MessageDirection = (typeof MessageDirection)[keyof typeof MessageDirection];

export const MessageType = {
  TEXT: 'TEXT',
  IMAGE: 'IMAGE',
  AUDIO: 'AUDIO',
  VOICE_NOTE: 'VOICE_NOTE',
  PDF: 'PDF',
  DOCUMENT: 'DOCUMENT',
  SYSTEM: 'SYSTEM',
} as const;
export type MessageType = (typeof MessageType)[keyof typeof MessageType];

export const DeliveryStatus = {
  RECEIVED: 'RECEIVED',
  QUEUED: 'QUEUED',
  SENT: 'SENT',
  DELIVERED: 'DELIVERED',
  READ: 'READ',
  FAILED: 'FAILED',
} as const;
export type DeliveryStatus = (typeof DeliveryStatus)[keyof typeof DeliveryStatus];

export const ProjectStatus = {
  PENDING: 'PENDING',
  PLANNING: 'PLANNING',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_FOR_CUSTOMER: 'WAITING_FOR_CUSTOMER',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type ProjectStatus = (typeof ProjectStatus)[keyof typeof ProjectStatus];

export const TaskStatus = {
  PENDING: 'PENDING',
  PLANNING: 'PLANNING',
  IN_PROGRESS: 'IN_PROGRESS',
  WAITING_FOR_CUSTOMER: 'WAITING_FOR_CUSTOMER',
  AWAITING_APPROVAL: 'AWAITING_APPROVAL',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const Priority = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  URGENT: 'URGENT',
} as const;
export type Priority = (typeof Priority)[keyof typeof Priority];

export const AgentType = {
  JOB_AGENT: 'JOB_AGENT',
  VISA_AGENT: 'VISA_AGENT',
  INVESTOR_AGENT: 'INVESTOR_AGENT',
  BUSINESS_AGENT: 'BUSINESS_AGENT',
  EDUCATION_AGENT: 'EDUCATION_AGENT',
  RESEARCH_AGENT: 'RESEARCH_AGENT',
} as const;
export type AgentType = (typeof AgentType)[keyof typeof AgentType];

export const ExecutionStatus = {
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  TIMEOUT: 'TIMEOUT',
  CANCELLED: 'CANCELLED',
} as const;
export type ExecutionStatus = (typeof ExecutionStatus)[keyof typeof ExecutionStatus];

export const DocumentType = {
  CV: 'CV',
  PASSPORT: 'PASSPORT',
  CERTIFICATE: 'CERTIFICATE',
  BUSINESS_PLAN: 'BUSINESS_PLAN',
  COMPANY_REGISTRATION: 'COMPANY_REGISTRATION',
  IMAGE: 'IMAGE',
  PDF: 'PDF',
  VOICE_NOTE: 'VOICE_NOTE',
  AUDIO: 'AUDIO',
  OTHER: 'OTHER',
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

export const ScanStatus = {
  PENDING: 'PENDING',
  CLEAN: 'CLEAN',
  INFECTED: 'INFECTED',
  FAILED: 'FAILED',
} as const;
export type ScanStatus = (typeof ScanStatus)[keyof typeof ScanStatus];

export const ApprovalStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  EXECUTED: 'EXECUTED',
} as const;
export type ApprovalStatus = (typeof ApprovalStatus)[keyof typeof ApprovalStatus];

export const ActionCategory = {
  SEND_EMAIL: 'SEND_EMAIL',
  SUBMIT_JOB_APPLICATION: 'SUBMIT_JOB_APPLICATION',
  CONTACT_INVESTOR: 'CONTACT_INVESTOR',
  SHARE_PERSONAL_DOCUMENT: 'SHARE_PERSONAL_DOCUMENT',
  BOOK_APPOINTMENT: 'BOOK_APPOINTMENT',
  MAKE_PAYMENT: 'MAKE_PAYMENT',
  SUBMIT_OFFICIAL_FORM: 'SUBMIT_OFFICIAL_FORM',
} as const;
export type ActionCategory = (typeof ActionCategory)[keyof typeof ActionCategory];

export const NotificationStatus = {
  PENDING: 'PENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  SUPPRESSED: 'SUPPRESSED',
} as const;
export type NotificationStatus = (typeof NotificationStatus)[keyof typeof NotificationStatus];

export const Prisma = {
  JsonNull: null as any,
};
export namespace Prisma {
  export type InputJsonValue = any;
  export type JsonValue = any;
}

export interface Customer {
  id: string;
  whatsappNumber: string;
  whatsappJid: string;
  displayName: string | null;
  preferredLanguage: string;
  accountStatus: AccountStatus;
  consentGiven: boolean;
  consentTimestamp: Date | null;
  consentVersion: string | null;
  creditBalanceCents: number;
  executionPermissions: any;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerProfile {
  id: string;
  customerId: string;
  fullName: string | null;
  email: string | null;
  countryOfResidence: string | null;
  nationality: string | null;
  targetCountries: string[];
  currentOccupation: string | null;
  yearsOfExperience: number | null;
  educationSummary: any;
  skills: string[];
  workExperience: any;
  businessDetails: any;
  preferences: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface Subscription {
  id: string;
  customerId: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  monthlyTaskQuota: number;
  tasksUsedThisPeriod: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Conversation {
  id: string;
  customerId: string;
  openclawSessionKey: string;
  status: ConversationStatus;
  activeProjectId: string | null;
  summary: string | null;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  customerId: string;
  conversationId: string;
  externalMessageId: string | null;
  direction: MessageDirection;
  messageType: MessageType;
  content: string;
  mediaDocumentId: string | null;
  deliveryStatus: DeliveryStatus;
  detectedIntent: string | null;
  routedAgentType: AgentType | null;
  projectId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  customerId: string;
  title: string;
  objective: string;
  description: string;
  assignedSpecialist: AgentType;
  status: ProjectStatus;
  priority: Priority;
  expectedCompletionDate: Date | null;
  executionHistory: any;
  finalResults: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  customerId: string;
  projectId: string;
  stepOrder: number;
  title: string;
  description: string;
  assignedSpecialist: AgentType;
  status: TaskStatus;
  priority: Priority;
  requiresApproval: boolean;
  actionCategory: ActionCategory | null;
  inputPayload: any;
  resultPayload: any;
  errorMessage: string | null;
  retryCount: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Agent {
  id: string;
  agentType: AgentType;
  taskKey: string;
  name: string;
  description: string;
  openclawAgentId: string;
  allowedTools: string[];
  restrictedActions: string[];
  costPerSubmissionCents: number;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentExecution {
  id: string;
  customerId: string;
  agentId: string | null;
  agentType: AgentType;
  projectId: string | null;
  taskId: string | null;
  openclawSessionKey: string;
  openclawRunId: string | null;
  status: ExecutionStatus;
  promptSummary: string;
  responseSummary: string | null;
  tokensUsed: number;
  toolCallsCount: number;
  durationMs: number | null;
  errorMessage: string | null;
  startedAt: Date;
  endedAt: Date | null;
  createdAt: Date;
}

export interface Document {
  id: string;
  customerId: string;
  projectId: string | null;
  documentType: DocumentType;
  originalFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  storageKey: string;
  encryptionIv: string;
  encryptionAuthTag: string;
  checksumSha256: string;
  scanStatus: ScanStatus;
  extractedText: string | null;
  structuredMetadata: any;
  isSensitive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Approval {
  id: string;
  customerId: string;
  projectId: string | null;
  taskId: string | null;
  actionCategory: ActionCategory;
  title: string;
  description: string;
  actionPayload: any;
  status: ApprovalStatus;
  requestedAt: Date;
  respondedAt: Date | null;
  customerResponseRaw: string | null;
  executedAt: Date | null;
  executionResult: any;
  expiresAt: Date;
}

export interface AuditLog {
  id: string;
  customerId: string | null;
  actorType: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  details: any;
  ipAddress: string | null;
  createdAt: Date;
}

export interface Notification {
  id: string;
  customerId: string | null;
  organisationId: string | null;
  projectId: string | null;
  type: string;
  title: string;
  message: string;
  actionUrl: string | null;
  isRead: boolean;
  status: NotificationStatus;
  sentAt: Date | null;
  errorMessage: string | null;
  createdAt: Date;
}

export interface CustomerMemory {
  id: string;
  customerId: string;
  category: string;
  key: string;
  value: string;
  confidence: number;
  sourceMessageId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
