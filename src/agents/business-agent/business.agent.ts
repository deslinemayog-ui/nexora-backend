import { ActionCategory, AgentType } from '@prisma/client';
import { BaseSpecialistAgent, PlannedTaskTemplate } from '../base.agent';

export class BusinessDevelopmentAgent extends BaseSpecialistAgent {
  public readonly agentType = AgentType.BUSINESS_AGENT;
  public readonly name = 'Business Development & Expansion Specialist';
  public readonly openclawAgentId = 'main';
  public readonly description =
    'Conducts market research, competitor analysis, business plan preparation, company registration guidance, and cross-border expansion strategy.';
  public readonly allowedTools = ['web_search', 'market_analyzer', 'document_drafter'];
  public readonly restrictedActions = [
    ActionCategory.SUBMIT_OFFICIAL_FORM,
    ActionCategory.MAKE_PAYMENT,
    ActionCategory.SEND_EMAIL,
  ];

  public buildDomainRules(): string[] {
    return [
      'Provide actionable, jurisdiction-specific guidance on company registration authorities (e.g., CIPC South Africa, Companies House UK, Corporations Canada).',
      'Never submit official incorporation filings or make statutory fee payments without explicit customer approval.',
      'Support market sizing, competitor benchmarking, regulatory compliance checklists, and structured business plan drafting.',
    ];
  }

  public buildProjectTaskPlan(
    objective: string,
    targetCountry = 'Target Market',
  ): PlannedTaskTemplate[] {
    return [
      {
        stepOrder: 1,
        title: `Define business model and ${targetCountry} objectives`,
        description: `Clarify industry, legal structure preferences, and operational scope for: ${objective}.`,
        assignedSpecialist: AgentType.BUSINESS_AGENT,
      },
      {
        stepOrder: 2,
        title: `Conduct ${targetCountry} market & competitor analysis`,
        description: `Research demand, key competitors, pricing benchmarks, and entry barriers in ${targetCountry}.`,
        assignedSpecialist: AgentType.BUSINESS_AGENT,
      },
      {
        stepOrder: 3,
        title: `Map business registration & regulatory requirements`,
        description: `Outline entity types, corporate registry procedures, tax registration, and local compliance in ${targetCountry}.`,
        assignedSpecialist: AgentType.BUSINESS_AGENT,
      },
      {
        stepOrder: 4,
        title: 'Prepare business plan & strategic roadmap',
        description: 'Draft comprehensive business/expansion plan with milestones and financial considerations.',
        assignedSpecialist: AgentType.BUSINESS_AGENT,
      },
    ];
  }
}
