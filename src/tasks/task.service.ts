import { Task, TaskStatus } from '@prisma/client';
import { NexoraRepository } from '../database/repository';
import { QueueService } from '../queues/queue.service';
import { AgentTaskJobPayload } from '../queues/queue.types';

export class TaskService {
  constructor(
    private readonly repository: NexoraRepository,
    private readonly queueService: QueueService,
  ) {}

  public async listTasksForCustomer(customerId: string, projectId?: string): Promise<Task[]> {
    if (projectId) {
      const { tasks } = await this.repository.getProjectForTenant(customerId, projectId);
      return tasks;
    }
    const projects = await this.repository.listCustomerProjects(customerId);
    return projects.flatMap((p) => p.tasks);
  }

  public async markTaskStatus(
    customerId: string,
    taskId: string,
    status: TaskStatus,
    resultPayload?: Record<string, unknown>,
    errorMessage?: string,
  ): Promise<Task> {
    return this.repository.updateTaskStatus(
      customerId,
      taskId,
      status,
      resultPayload,
      errorMessage,
    );
  }

  public async dispatchBackgroundAgentTask(payload: AgentTaskJobPayload) {
    return this.queueService.enqueueAgentTask(payload);
  }
}
