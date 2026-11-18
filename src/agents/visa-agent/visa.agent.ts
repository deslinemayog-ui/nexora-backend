import { ActionCategory, AgentType } from '@prisma/client';
import { BaseSpecialistAgent, PlannedTaskTemplate } from '../base.agent';

export class VisaImmigrationAgent extends BaseSpecialistAgent {
  public readonly agentType = AgentType.VISA_AGENT;
  public readonly name = 'Immigration & Visa Specialist';
  public readonly openclawAgentId = 'main';
  public readonly description =
    'Researches official immigration pathways, visa eligibility criteria, government portals, document checklists, and application timelines.';
  public readonly allowedTools = ['web_search', 'official_gov_lookup', 'checklist_builder'];
  public readonly restrictedActions = [
    ActionCategory.SUBMIT_OFFICIAL_FORM,
    ActionCategory.BOOK_APPOINTMENT,
    ActionCategory.SHARE_PERSONAL_DOCUMENT,
    ActionCategory.MAKE_PAYMENT,
  ];

  public buildDomainRules(): string[] {
    return [
      'NEVER guarantee visa approval or fabricate immigration laws, point thresholds, or processing times.',
      'Always reference official government immigration authorities (e.g., IRCC Canada, UK Home Office gov.uk, German Make it in Germany / Auswärtiges Amt).',
      'Escalate complex legal admissibility, asylum, prior refusal appeals, or regulated legal representation questions to licensed immigration lawyers/consultants.',
      'When a customer says they want to relocate (e.g., "I want to move to Germany" or "Help me relocate to Canada"), clarify whether their primary pathway is work, study, business/investment, or family sponsorship if not yet known.',
    ];
  }

  public buildProjectTaskPlan(
    objective: string,
    targetCountry = 'Destination Country',
  ): PlannedTaskTemplate[] {
    return [
      {
        stepOrder: 1,
        title: `Identify relocation purpose and profile for ${targetCountry}`,
        description: `Clarify pathway (work, study, business, family) and review qualifications/nationality.`,
        assignedSpecialist: AgentType.VISA_AGENT,
      },
      {
        stepOrder: 2,
        title: `Research eligible ${targetCountry} visa categories`,
        description: `Compare official government visa streams, eligibility criteria, and sponsorship rules.`,
        assignedSpecialist: AgentType.VISA_AGENT,
      },
      {
        stepOrder: 3,
        title: 'Prepare official document checklist',
        description: `Compile required identity, qualification, financial, and supporting document checklists from official government sources.`,
        assignedSpecialist: AgentType.VISA_AGENT,
      },
      {
        stepOrder: 4,
        title: 'Assist with application preparation & timelines',
        description: `Organize forms, verify document completeness, and map key submission deadlines for ${objective}.`,
        assignedSpecialist: AgentType.VISA_AGENT,
      },
      {
        stepOrder: 5,
        title: 'Review and request customer approval for any appointment/form action',
        description: `Obtain explicit customer approval before booking any appointment or submitting permitted pre-application inquiries.`,
        assignedSpecialist: AgentType.VISA_AGENT,
        requiresApproval: true,
        actionCategory: ActionCategory.SUBMIT_OFFICIAL_FORM,
      },
    ];
  }
}
