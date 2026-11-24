import { AgentType } from '../database/types';
import { ISpecialistAgent } from './base.agent';
import { BusinessDevelopmentAgent } from './business-agent/business.agent';
import { EducationScholarshipAgent } from './education-agent/education.agent';
import { InvestorDiscoveryAgent } from './investor-agent/investor.agent';
import { JobSearchAgent } from './job-agent/job.agent';
import { GeneralResearchAgent } from './research-agent/research.agent';
import { VisaImmigrationAgent } from './visa-agent/visa.agent';

/**
 * Modular Specialist Agent Registry.
 * Allows registering new specialist agents dynamically without modifying
 * the core orchestrator or message processing layer.
 */
export class SpecialistAgentRegistry {
  private readonly agents = new Map<AgentType, ISpecialistAgent>();

  constructor() {
    this.register(new JobSearchAgent());
    this.register(new VisaImmigrationAgent());
    this.register(new InvestorDiscoveryAgent());
    this.register(new BusinessDevelopmentAgent());
    this.register(new EducationScholarshipAgent());
    this.register(new GeneralResearchAgent());
  }

  public register(agent: ISpecialistAgent): void {
    this.agents.set(agent.agentType, agent);
  }

  public getAgent(agentType: AgentType): ISpecialistAgent {
    return this.agents.get(agentType) ?? this.agents.get(AgentType.RESEARCH_AGENT)!;
  }

  public listAgents(): ISpecialistAgent[] {
    return Array.from(this.agents.values());
  }
}

export const agentRegistry = new SpecialistAgentRegistry();
