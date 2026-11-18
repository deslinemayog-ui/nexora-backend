import { AgentType, Priority, Project, ProjectStatus, Task, TaskStatus } from '@prisma/client';
import { agentRegistry } from '../agents/agent.registry';
import { NexoraRepository } from '../database/repository';

export interface ProjectWithTasks {
  project: Project;
  tasks: Task[];
}

export class ProjectService {
  constructor(private readonly repository: NexoraRepository) {}

  /**
   * Creates a persistent multi-step project and generates its specialist task breakdown.
   */
  public async createGoalProject(params: {
    customerId: string;
    title: string;
    objective: string;
    description: string;
    assignedSpecialist: AgentType;
    targetCountry?: string;
    priority?: Priority;
  }): Promise<ProjectWithTasks> {
    const specialist = agentRegistry.getAgent(params.assignedSpecialist);
    const taskTemplates = specialist.buildProjectTaskPlan(
      params.objective,
      params.targetCountry,
    );

    const expectedCompletionDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

    return this.repository.createProjectWithTasks({
      customerId: params.customerId,
      title: params.title,
      objective: params.objective,
      description: params.description,
      assignedSpecialist: params.assignedSpecialist,
      priority: params.priority ?? Priority.MEDIUM,
      expectedCompletionDate,
      tasks: taskTemplates,
    });
  }

  /**
   * Finds an existing active/ongoing project for a customer that matches their follow-up query
   * (e.g. "What's happening with my Canada job search?") so the project continues seamlessly
   * from its current state without restarting.
   */
  public async findMatchingActiveProject(
    customerId: string,
    queryText: string,
    activeProjectId?: string | null,
    detectedAgentType?: AgentType,
  ): Promise<ProjectWithTasks | null> {
    const allProjects = await this.repository.listCustomerProjects(customerId);
    const activeProjects = allProjects.filter(
      ({ project }) =>
        project.status !== ProjectStatus.COMPLETED &&
        project.status !== ProjectStatus.CANCELLED &&
        project.status !== ProjectStatus.FAILED,
    );

    if (activeProjects.length === 0) return null;

    const normalizedQuery = queryText.toLowerCase();
    const keywords = normalizedQuery
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !['what', 'happening', 'with', 'how', 'status', 'update', 'the', 'my', 'for', 'and'].includes(w));

    // Score active projects by keyword overlap and agent match
    let bestMatch: { item: ProjectWithTasks; score: number } | null = null;
    for (const item of activeProjects) {
      let score = 0;
      const haystack = `${item.project.title} ${item.project.objective} ${item.project.description}`.toLowerCase();

      for (const kw of keywords) {
        if (haystack.includes(kw)) {
          score += 3;
        }
      }

      if (detectedAgentType && item.project.assignedSpecialist === detectedAgentType) {
        score += 2;
      }

      if (activeProjectId && item.project.id === activeProjectId) {
        score += 1;
      }

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { item, score };
      }
    }

    if (bestMatch && bestMatch.score >= 2) {
      return bestMatch.item;
    }

    if (activeProjectId) {
      const bound = activeProjects.find((p) => p.project.id === activeProjectId);
      if (bound) return bound;
    }

    return activeProjects[0] ?? null;
  }

  public async getProject(customerId: string, projectId: string): Promise<ProjectWithTasks> {
    return this.repository.getProjectForTenant(customerId, projectId);
  }

  public async listCustomerProjects(customerId: string): Promise<ProjectWithTasks[]> {
    return this.repository.listCustomerProjects(customerId);
  }

  /**
   * Advances the current active task in a project and starts the next pending task,
   * updating the overall project status accordingly.
   */
  public async advanceProjectProgress(
    customerId: string,
    projectId: string,
    completedTaskResult?: Record<string, unknown>,
  ): Promise<{
    project: Project;
    completedTask?: Task;
    currentTask?: Task;
    tasks: Task[];
  }> {
    const { project, tasks } = await this.repository.getProjectForTenant(customerId, projectId);

    const activeTask =
      tasks.find((t) => t.status === TaskStatus.IN_PROGRESS) ??
      tasks.find((t) => t.status === TaskStatus.WAITING_FOR_CUSTOMER) ??
      tasks.find((t) => t.status === TaskStatus.PENDING);

    let completedTask: Task | undefined;
    let nextActiveTask: Task | undefined;

    if (activeTask) {
      completedTask = await this.repository.updateTaskStatus(
        customerId,
        activeTask.id,
        TaskStatus.COMPLETED,
        completedTaskResult,
      );

      nextActiveTask = tasks.find(
        (t) => t.stepOrder > activeTask.stepOrder && t.status === TaskStatus.PENDING,
      );

      if (nextActiveTask) {
        const nextStatus = nextActiveTask.requiresApproval
          ? TaskStatus.AWAITING_APPROVAL
          : TaskStatus.IN_PROGRESS;
        nextActiveTask = await this.repository.updateTaskStatus(
          customerId,
          nextActiveTask.id,
          nextStatus,
        );
      }
    }

    const updatedBundle = await this.repository.getProjectForTenant(customerId, projectId);
    const allCompleted = updatedBundle.tasks.every((t) => t.status === TaskStatus.COMPLETED);
    const anyAwaitingApproval = updatedBundle.tasks.some(
      (t) => t.status === TaskStatus.AWAITING_APPROVAL,
    );

    const newProjectStatus = allCompleted
      ? ProjectStatus.COMPLETED
      : anyAwaitingApproval
        ? ProjectStatus.AWAITING_APPROVAL
        : ProjectStatus.IN_PROGRESS;

    const updatedProject = await this.repository.updateProjectStatus(
      customerId,
      project.id,
      newProjectStatus,
      {
        event: allCompleted ? 'PROJECT_COMPLETED' : 'TASK_ADVANCED',
        details: completedTask
          ? `Completed step #${completedTask.stepOrder} ("${completedTask.title}")`
          : 'Project status refreshed',
      },
      allCompleted ? { summary: 'All project tasks completed successfully.' } : undefined,
    );

    return {
      project: updatedProject,
      completedTask,
      currentTask:
        nextActiveTask ??
        updatedBundle.tasks.find(
          (t) =>
            t.status === TaskStatus.IN_PROGRESS ||
            t.status === TaskStatus.AWAITING_APPROVAL ||
            t.status === TaskStatus.WAITING_FOR_CUSTOMER,
        ),
      tasks: updatedBundle.tasks,
    };
  }

  public formatProjectStatusSummary(bundle: ProjectWithTasks): string {
    const { project, tasks } = bundle;
    const completedCount = tasks.filter((t) => t.status === TaskStatus.COMPLETED).length;
    const currentTask =
      tasks.find(
        (t) =>
          t.status === TaskStatus.IN_PROGRESS ||
          t.status === TaskStatus.AWAITING_APPROVAL ||
          t.status === TaskStatus.WAITING_FOR_CUSTOMER,
      ) ?? tasks.find((t) => t.status === TaskStatus.PENDING);

    const lines = [
      `📋 *Project:* ${project.title}`,
      `📊 *Status:* ${project.status.replace(/_/g, ' ')} (${completedCount}/${tasks.length} steps completed)`,
    ];

    if (currentTask) {
      lines.push(
        `🔄 *Current Step (#${currentTask.stepOrder}):* ${currentTask.title} — ${currentTask.description}`,
      );
    }

    return lines.join('\n');
  }
}
