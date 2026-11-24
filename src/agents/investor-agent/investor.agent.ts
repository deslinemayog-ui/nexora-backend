import { ActionCategory, AgentType } from '../../database/types';
import { BaseSpecialistAgent, PlannedTaskTemplate } from '../base.agent';

export class InvestorDiscoveryAgent extends BaseSpecialistAgent {
  public readonly agentType = AgentType.INVESTOR_AGENT;
  public readonly name = 'Investor Discovery & Autonomous Fundraising Agent';
  public readonly openclawAgentId = 'main';
  public readonly description =
    'Scrapes customer startup websites, searches live venture capital firms, angel networks, and accelerators, prepares tailored pitch packages, and submits applications & outreach on the founder’s behalf.';
  public readonly allowedTools = [
    'web_fetch',
    'browser',
    'web_search',
    'investor_directory_lookup',
    'email_outreach',
    'portal_applicator',
    'report_builder',
  ];
  public readonly restrictedActions = [
    ActionCategory.CONTACT_INVESTOR,
    ActionCategory.SEND_EMAIL,
    ActionCategory.SHARE_PERSONAL_DOCUMENT,
  ];

  public buildDomainRules(): string[] {
    return [
      'DO NOT interrogate the founder with questionnaires. Immediately scrape any provided URL (or use context) and execute investor discovery and application submission.',
      'If raise amount or traction metrics are not explicitly stated, infer sensible pre-seed/seed defaults from the startup stage and proceed with full execution immediately.',
      'Always provide concrete investor & accelerator application portals, submitted form fields, tailored pitch emails, and submission receipt IDs.',
    ];
  }

  public buildProjectTaskPlan(objective: string): PlannedTaskTemplate[] {
    return [
      {
        stepOrder: 1,
        title: 'Scrape startup website & extract product/traction profile',
        description: `Scrape live product URL and extract value proposition, app store presence, and traction for: ${objective}.`,
        assignedSpecialist: AgentType.INVESTOR_AGENT,
      },
      {
        stepOrder: 2,
        title: 'Scrape live VC funds, angel syndicates & accelerators',
        description: 'Search the internet for active investors & open accelerator portals matching sector and geography.',
        assignedSpecialist: AgentType.INVESTOR_AGENT,
      },
      {
        stepOrder: 3,
        title: 'Prepare tailored application payloads & investor brief',
        description: 'Compile complete application form answers, use-of-funds model, and executive pitch.',
        assignedSpecialist: AgentType.INVESTOR_AGENT,
      },
      {
        stepOrder: 4,
        title: 'Draft & dispatch tailored investor pitch emails',
        description: 'Generate personalized pitch emails and submit portal applications for each shortlisted investor.',
        assignedSpecialist: AgentType.INVESTOR_AGENT,
      },
      {
        stepOrder: 5,
        title: 'Log application submission receipts & portal confirmations',
        description: 'Record submission receipt IDs, target portals, and outreach status for founder review.',
        assignedSpecialist: AgentType.INVESTOR_AGENT,
        requiresApproval: true,
        actionCategory: ActionCategory.CONTACT_INVESTOR,
      },
      {
        stepOrder: 6,
        title: 'Track investor responses & schedule partner meetings',
        description: 'Monitor incoming VC replies and update fundraising pipeline.',
        assignedSpecialist: AgentType.INVESTOR_AGENT,
        requiresApproval: true,
        actionCategory: ActionCategory.CONTACT_INVESTOR,
      },
    ];
  }
}
