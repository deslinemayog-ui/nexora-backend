import { ActionCategory, AgentType } from '../../database/types';
import { BaseSpecialistAgent, PlannedTaskTemplate } from '../base.agent';

export interface VacancyRiskAssessment {
  isSuspicious: boolean;
  riskScore: number;
  redFlags: string[];
}

export class JobSearchAgent extends BaseSpecialistAgent {
  public readonly agentType = AgentType.JOB_AGENT;
  public readonly name = 'Job Search & Application Specialist';
  public readonly openclawAgentId = 'main';
  public readonly description =
    'Analyses CVs, matches qualifications against international and local vacancies, detects recruitment scams, drafts tailored CVs/cover letters, and coordinates approved applications.';
  public readonly allowedTools = ['web_search', 'document_reader', 'vacancy_matcher', 'cv_formatter'];
  public readonly restrictedActions = [
    ActionCategory.SUBMIT_JOB_APPLICATION,
    ActionCategory.SEND_EMAIL,
    ActionCategory.SHARE_PERSONAL_DOCUMENT,
  ];

  public buildDomainRules(): string[] {
    return [
      'NEVER invent, exaggerate, or fabricate customer qualifications, degrees, certifications, skills, or employment history.',
      'Always evaluate job vacancies for potential scam indicators (e.g., requests for upfront visa/processing fees, unverified personal email domains, unrealistic guaranteed salaries without interviews).',
      'Always request explicit customer approval before submitting any job application or sharing personal CV documents with an employer.',
      'When starting a job search project without a CV on file, politely ask the customer to share their CV or summarize their experience and qualifications.',
    ];
  }

  public buildProjectTaskPlan(
    objective: string,
    targetCountry = 'Target Market',
  ): PlannedTaskTemplate[] {
    return [
      {
        stepOrder: 1,
        title: 'Obtain and analyse CV',
        description: `Collect and extract education, qualifications, skills, and work experience for ${targetCountry} roles.`,
        assignedSpecialist: AgentType.JOB_AGENT,
      },
      {
        stepOrder: 2,
        title: 'Identify suitable employment categories',
        description: `Map verified qualifications to eligible occupational categories in ${targetCountry}.`,
        assignedSpecialist: AgentType.JOB_AGENT,
      },
      {
        stepOrder: 3,
        title: 'Research relevant job opportunities',
        description: `Search vetted employers and job boards in ${targetCountry} while filtering out suspicious listings.`,
        assignedSpecialist: AgentType.JOB_AGENT,
      },
      {
        stepOrder: 4,
        title: 'Evaluate eligibility',
        description: `Assess vacancy requirements and sponsorship/work authorization fit against customer qualifications.`,
        assignedSpecialist: AgentType.JOB_AGENT,
      },
      {
        stepOrder: 5,
        title: 'Prepare application documents',
        description: `Draft tailored CV and cover letter aligned strictly with verified customer experience.`,
        assignedSpecialist: AgentType.JOB_AGENT,
      },
      {
        stepOrder: 6,
        title: 'Request customer approval',
        description: `Present prepared application package and employer details to the customer for explicit approval.`,
        assignedSpecialist: AgentType.JOB_AGENT,
        requiresApproval: true,
        actionCategory: ActionCategory.SUBMIT_JOB_APPLICATION,
      },
      {
        stepOrder: 7,
        title: 'Submit approved applications where permitted',
        description: `Execute approved job submissions and record confirmation receipts.`,
        assignedSpecialist: AgentType.JOB_AGENT,
        requiresApproval: true,
        actionCategory: ActionCategory.SUBMIT_JOB_APPLICATION,
      },
      {
        stepOrder: 8,
        title: 'Track employer responses',
        description: `Monitor application status, interview invitations, and employer feedback for ${objective}.`,
        assignedSpecialist: AgentType.JOB_AGENT,
      },
    ];
  }

  /**
   * Evaluates a job listing description for common recruitment scam red flags.
   */
  public assessVacancyScamRisk(listingText: string): VacancyRiskAssessment {
    const redFlags: string[] = [];
    const lower = listingText.toLowerCase();

    if (/(?:pay|payment|fee|deposit)\s+(?:for|to)\s+(?:visa|processing|training|background\s+check|equipment)/i.test(lower)) {
      redFlags.push('Requests upfront fee for visa, processing, or onboarding');
    }
    if (/(?:whatsapp|telegram)\s+only|contact\s+hr\s+at\s+[a-z0-9._%+-]+@(?:gmail|yahoo|hotmail|outlook)\.com/i.test(lower)) {
      redFlags.push('Uses unverified free webmail or messaging-only recruitment contact');
    }
    if (/no\s+experience\s+needed.*(?:\$|£|€)\s*\d{4,}\s*(?:per\s+week|weekly|a\s+day)/i.test(lower)) {
      redFlags.push('Promises unrealistic compensation with zero experience requirements');
    }
    if (/guaranteed\s+(?:visa|job\s+offer|work\s+permit)\s+within\s+\d+\s*(?:days|hours)/i.test(lower)) {
      redFlags.push('Claims guaranteed visa or work permit issuance within an unrealistic timeframe');
    }

    const riskScore = Math.min(100, redFlags.length * 35);
    return {
      isSuspicious: riskScore >= 35,
      riskScore,
      redFlags,
    };
  }
}
