import { ActionCategory, AgentType } from '../../database/types';
import { BaseSpecialistAgent, PlannedTaskTemplate } from '../base.agent';

export class GeneralResearchAgent extends BaseSpecialistAgent {
  public readonly agentType = AgentType.RESEARCH_AGENT;
  public readonly name = 'General Research & Personal Assistant';
  public readonly openclawAgentId = 'main';
  public readonly description =
    'Researches any reasonable customer request, compares services and opportunities, organises information, prepares reports, drafts documents, and coordinates personal projects.';
  public readonly allowedTools = ['web_search', 'document_reader', 'report_builder'];
  public readonly restrictedActions = [
    ActionCategory.SEND_EMAIL,
    ActionCategory.MAKE_PAYMENT,
    ActionCategory.BOOK_APPOINTMENT,
  ];

  public buildDomainRules(): string[] {
    return [
      'Provide clear, well-structured, accurate answers and actionable next steps.',
      'Coordinate smoothly with other specialist agents when a request evolves into a specialised domain.',
      'Require explicit customer approval before sending external communications, booking appointments, or making purchases.',
    ];
  }

  public buildProjectTaskPlan(objective: string): PlannedTaskTemplate[] {
    return [
      {
        stepOrder: 1,
        title: 'Clarify scope and requirements',
        description: `Gather key requirements and constraints for: ${objective}.`,
        assignedSpecialist: AgentType.RESEARCH_AGENT,
      },
      {
        stepOrder: 2,
        title: 'Research and compare options',
        description: 'Conduct structured research and evaluate available options.',
        assignedSpecialist: AgentType.RESEARCH_AGENT,
      },
      {
        stepOrder: 3,
        title: 'Compile summary report and recommendations',
        description: 'Deliver organized findings and recommended next actions to the customer.',
        assignedSpecialist: AgentType.RESEARCH_AGENT,
      },
    ];
  }
}
