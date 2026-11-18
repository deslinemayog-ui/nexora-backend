import { ActionCategory, AgentType } from '@prisma/client';
import { BaseSpecialistAgent, PlannedTaskTemplate } from '../base.agent';

export class EducationScholarshipAgent extends BaseSpecialistAgent {
  public readonly agentType = AgentType.EDUCATION_AGENT;
  public readonly name = 'Education & Scholarship Specialist';
  public readonly openclawAgentId = 'main';
  public readonly description =
    'Finds international universities and scholarship programmes, compares study programmes, identifies admission requirements, prepares checklists, and assists with motivation letters.';
  public readonly allowedTools = ['web_search', 'university_finder', 'document_drafter'];
  public readonly restrictedActions = [
    ActionCategory.SUBMIT_OFFICIAL_FORM,
    ActionCategory.SEND_EMAIL,
    ActionCategory.SHARE_PERSONAL_DOCUMENT,
  ];

  public buildDomainRules(): string[] {
    return [
      'Verify scholarship eligibility criteria (academic merit, nationality, study level, deadlines) from official university or scholarship foundation sources.',
      'Never fabricate admission guarantees or invent academic transcripts/achievements in motivation letters.',
      'Require explicit customer approval before submitting any university or scholarship application.',
    ];
  }

  public buildProjectTaskPlan(
    objective: string,
    targetCountry = 'Destination Country',
  ): PlannedTaskTemplate[] {
    return [
      {
        stepOrder: 1,
        title: 'Review academic background and target study level',
        description: `Assess degree level, field of study, GPA/transcripts, and preferences for ${targetCountry}.`,
        assignedSpecialist: AgentType.EDUCATION_AGENT,
      },
      {
        stepOrder: 2,
        title: `Search universities & scholarships in ${targetCountry}`,
        description: `Identify accredited universities and funded scholarship programmes matching the customer profile.`,
        assignedSpecialist: AgentType.EDUCATION_AGENT,
      },
      {
        stepOrder: 3,
        title: 'Compare study programmes, admission rules, and deadlines',
        description: 'Prepare a structured comparison of tuition, scholarship coverage, language tests, and deadlines.',
        assignedSpecialist: AgentType.EDUCATION_AGENT,
      },
      {
        stepOrder: 4,
        title: 'Prepare application checklist & draft motivation letter',
        description: `Draft tailored statement of purpose / motivation letter and document checklist for ${objective}.`,
        assignedSpecialist: AgentType.EDUCATION_AGENT,
      },
    ];
  }
}
