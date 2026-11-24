import { AgentType, DocumentType } from '../database/types';

export type QueueName =
  | 'nexora-agent-execution'
  | 'nexora-document-processing'
  | 'nexora-notifications'
  | 'nexora-scheduled-tasks';

export interface AgentTaskJobPayload {
  jobType: 'AGENT_TASK_EXECUTION';
  customerId: string;
  projectId: string;
  taskId: string;
  agentType: AgentType;
  openclawSessionKey: string;
  prompt: string;
  recipientJid: string;
}

export interface DocumentProcessingJobPayload {
  jobType: 'DOCUMENT_PROCESSING';
  customerId: string;
  documentId: string;
  documentType: DocumentType;
  projectId?: string;
  recipientJid: string;
}

export interface NotificationJobPayload {
  jobType: 'CUSTOMER_NOTIFICATION';
  customerId: string;
  projectId?: string;
  notificationId?: string;
  recipientJid: string;
  title: string;
  message: string;
}

export interface ScheduledCheckJobPayload {
  jobType: 'SCHEDULED_PROJECT_CHECK';
  customerId: string;
  projectId: string;
}

export type AnyQueueJobPayload =
  | AgentTaskJobPayload
  | DocumentProcessingJobPayload
  | NotificationJobPayload
  | ScheduledCheckJobPayload;

export interface QueuedJobRecord<T = AnyQueueJobPayload> {
  id: string;
  queueName: QueueName;
  payload: T;
  status: 'WAITING' | 'ACTIVE' | 'COMPLETED' | 'FAILED';
  attemptsMade: number;
  maxAttempts: number;
  progress: number;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type JobProcessor<T> = (
  payload: T,
  updateProgress: (percent: number, message?: string) => Promise<void>,
) => Promise<void>;
