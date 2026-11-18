import crypto from 'crypto';
import { Queue, Worker, JobsOptions } from 'bullmq';
import { logger } from '../utils/logger';
import { buildRedisOptions } from './redis.connection';
import {
  AgentTaskJobPayload,
  AnyQueueJobPayload,
  DocumentProcessingJobPayload,
  JobProcessor,
  NotificationJobPayload,
  QueuedJobRecord,
  QueueName,
  ScheduledCheckJobPayload,
} from './queue.types';

export interface QueueServiceOptions {
  /**
   * When true, jobs execute through an in-memory resilient queue processor
   * with identical retry/backoff semantics (ideal for automated tests or
   * environments where Redis is not running).
   */
  useInMemoryDriver?: boolean;
  defaultMaxAttempts?: number;
  defaultBackoffMs?: number;
}

/**
 * Background Queue & Asynchronous Processing Service powered by BullMQ + Redis.
 * Supports long-running agent tasks, exponential backoff retries, failed-job handling,
 * scheduled tasks, background document processing, and customer notifications.
 */
export class QueueService {
  private useInMemory: boolean;
  private readonly defaultMaxAttempts: number;
  private readonly defaultBackoffMs: number;

  private readonly bullQueues = new Map<QueueName, Queue>();
  private readonly bullWorkers = new Map<QueueName, Worker>();

  private readonly processors = new Map<QueueName, JobProcessor<AnyQueueJobPayload>>();
  private readonly jobRecords = new Map<string, QueuedJobRecord>();
  private readonly failedJobs: QueuedJobRecord[] = [];

  constructor(options: QueueServiceOptions = {}) {
    this.useInMemory = options.useInMemoryDriver ?? false;
    this.defaultMaxAttempts = options.defaultMaxAttempts ?? 3;
    this.defaultBackoffMs = options.defaultBackoffMs ?? 200;
  }

  public setInMemoryMode(enabled: boolean): void {
    this.useInMemory = enabled;
  }

  public registerProcessor<T extends AnyQueueJobPayload>(
    queueName: QueueName,
    processor: JobProcessor<T>,
  ): void {
    this.processors.set(queueName, processor as JobProcessor<AnyQueueJobPayload>);
  }

  public startBullWorkers(): void {
    if (this.useInMemory) return;

    for (const [queueName] of this.processors.entries()) {
      if (this.bullWorkers.has(queueName)) continue;

      const worker = new Worker(
        queueName,
        async (job) => {
          const handler = this.processors.get(queueName);
          if (!handler) {
            throw new Error(`No processor registered for queue ${queueName}`);
          }
          await handler(job.data as AnyQueueJobPayload, async (percent) => {
            await job.updateProgress(percent);
          });
        },
        {
          connection: buildRedisOptions(),
          concurrency: 4,
        },
      );

      worker.on('error', (err) => {
        logger.debug({ queueName, err }, 'BullMQ worker connection event');
      });

      worker.on('failed', (job, err) => {
        logger.error(
          {
            queueName,
            jobId: job?.id,
            attemptsMade: job?.attemptsMade,
            err,
          },
          'BullMQ background job failed',
        );
      });

      this.bullWorkers.set(queueName, worker);
    }
  }

  public async enqueueAgentTask(
    payload: AgentTaskJobPayload,
    opts?: JobsOptions,
  ): Promise<QueuedJobRecord<AgentTaskJobPayload>> {
    return this.enqueue('nexora-agent-execution', payload, opts);
  }

  public async enqueueDocumentProcessing(
    payload: DocumentProcessingJobPayload,
    opts?: JobsOptions,
  ): Promise<QueuedJobRecord<DocumentProcessingJobPayload>> {
    return this.enqueue('nexora-document-processing', payload, opts);
  }

  public async enqueueNotification(
    payload: NotificationJobPayload,
    opts?: JobsOptions,
  ): Promise<QueuedJobRecord<NotificationJobPayload>> {
    return this.enqueue('nexora-notifications', payload, opts);
  }

  public async scheduleProjectCheck(
    payload: ScheduledCheckJobPayload,
    delayMs: number,
  ): Promise<QueuedJobRecord<ScheduledCheckJobPayload>> {
    return this.enqueue('nexora-scheduled-tasks', payload, { delay: delayMs });
  }

  public async enqueue<T extends AnyQueueJobPayload>(
    queueName: QueueName,
    payload: T,
    opts?: JobsOptions,
  ): Promise<QueuedJobRecord<T>> {
    const id = opts?.jobId ? String(opts.jobId) : `job-${crypto.randomUUID()}`;
    const maxAttempts = opts?.attempts ?? this.defaultMaxAttempts;

    const record: QueuedJobRecord<T> = {
      id,
      queueName,
      payload,
      status: 'WAITING',
      attemptsMade: 0,
      maxAttempts,
      progress: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.jobRecords.set(id, record);

    if (this.useInMemory) {
      await this.executeInMemoryWithRetry(record, opts?.delay ?? 0);
      return record;
    }

    const queue = this.getOrCreateBullQueue(queueName);
    await queue.add(payload.jobType, payload, {
      jobId: id,
      attempts: maxAttempts,
      backoff: {
        type: 'exponential',
        delay: this.defaultBackoffMs,
      },
      removeOnComplete: 100,
      removeOnFail: 250,
      ...opts,
    });

    return record;
  }

  private getOrCreateBullQueue(queueName: QueueName): Queue {
    let queue = this.bullQueues.get(queueName);
    if (!queue) {
      queue = new Queue(queueName, {
        connection: buildRedisOptions(),
      });
      this.bullQueues.set(queueName, queue);
    }
    return queue;
  }

  private async executeInMemoryWithRetry<T extends AnyQueueJobPayload>(
    record: QueuedJobRecord<T>,
    delayMs: number,
  ): Promise<void> {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 50)));
    }

    const processor = this.processors.get(record.queueName);
    if (!processor) {
      return;
    }

    record.status = 'ACTIVE';
    record.updatedAt = new Date();

    while (record.attemptsMade < record.maxAttempts) {
      record.attemptsMade += 1;
      try {
        await processor(record.payload, async (percent) => {
          record.progress = Math.max(0, Math.min(100, percent));
          record.updatedAt = new Date();
        });
        record.status = 'COMPLETED';
        record.progress = 100;
        record.error = undefined;
        record.updatedAt = new Date();
        return;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        record.error = message;
        record.updatedAt = new Date();
        logger.warn(
          {
            jobId: record.id,
            queueName: record.queueName,
            attempt: record.attemptsMade,
            maxAttempts: record.maxAttempts,
            error: message,
          },
          'Queue job attempt failed',
        );

        if (record.attemptsMade < record.maxAttempts) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.defaultBackoffMs * record.attemptsMade),
          );
        }
      }
    }

    record.status = 'FAILED';
    record.updatedAt = new Date();
    this.failedJobs.push(record);
  }

  public getJobRecord(jobId: string): QueuedJobRecord | undefined {
    return this.jobRecords.get(jobId);
  }

  public getFailedJobs(): QueuedJobRecord[] {
    return [...this.failedJobs];
  }

  public getQueueMetrics() {
    const all = Array.from(this.jobRecords.values());
    return {
      totalTracked: all.length,
      waiting: all.filter((j) => j.status === 'WAITING').length,
      active: all.filter((j) => j.status === 'ACTIVE').length,
      completed: all.filter((j) => j.status === 'COMPLETED').length,
      failed: all.filter((j) => j.status === 'FAILED').length,
    };
  }

  public async close(): Promise<void> {
    for (const worker of this.bullWorkers.values()) {
      await worker.close();
    }
    for (const queue of this.bullQueues.values()) {
      await queue.close();
    }
    this.bullWorkers.clear();
    this.bullQueues.clear();
  }
}
