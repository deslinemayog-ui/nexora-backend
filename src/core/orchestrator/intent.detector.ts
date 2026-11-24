import { AgentType } from '../../database/types';
import { env } from '../../config/env';
import { buildTenantSessionKey } from '../../openclaw/openclaw.sessions';
import type { OpenClawService } from '../../openclaw/openclaw.service';
import { logger } from '../../utils/logger';

export type IntentCategory =
  | 'APPROVAL_RESPONSE'
  | 'PROJECT_STATUS_INQUIRY'
  | 'JOB_SEARCH_AND_APPLICATION'
  | 'IMMIGRATION_AND_VISA'
  | 'INVESTOR_DISCOVERY'
  | 'BUSINESS_DEVELOPMENT'
  | 'EDUCATION_AND_SCHOLARSHIP'
  | 'GENERAL_RESEARCH'
  | 'CONVERSATIONAL_FOLLOWUP';

export interface DetectedIntent {
  category: IntentCategory;
  specialistAgent: AgentType;
  isMultiStepProject: boolean;
  suggestedProjectTitle?: string;
  targetCountry?: string;
  confidence: number;
  routingReasoning?: string;
}

const COUNTRY_PATTERNS: Array<{ regex: RegExp; name: string }> = [
  { regex: /\b(?:the\s+uk|united\s+kingdom|britain|england|london|scotland|manchester)\b/i, name: 'the UK' },
  { regex: /\b(?:canada|toronto|vancouver|montreal|calgary|ottawa)\b/i, name: 'Canada' },
  { regex: /\b(?:germany|berlin|munich|frankfurt|hamburg)\b/i, name: 'Germany' },
  { regex: /\b(?:america|usa|united\s+states|u\.s\.|new\s+york|california)\b/i, name: 'America' },
  { regex: /\b(?:south\s+africa|johannesburg|cape\s+town|pretoria|durban)\b/i, name: 'South Africa' },
  { regex: /\b(?:australia|sydney|melbourne|brisbane|perth)\b/i, name: 'Australia' },
  { regex: /\b(?:ireland|dublin|cork)\b/i, name: 'Ireland' },
  { regex: /\b(?:netherlands|amsterdam|rotterdam)\b/i, name: 'the Netherlands' },
  { regex: /\b(?:uae|dubai|abu\s+dhabi|united\s+arab\s+emirates)\b/i, name: 'the UAE' },
  { regex: /\b(?:new\s+zealand|auckland|wellington)\b/i, name: 'New Zealand' },
];

export class IntentDetector {
  public detect(
    messageText: string,
    options: {
      hasPendingApproval?: boolean;
      activeProjectAgent?: AgentType;
      hasUploadedCv?: boolean;
    } = {},
  ): DetectedIntent {
    const text = messageText.trim();
    const lower = text.toLowerCase();
    const targetCountry = this.extractTargetCountry(text);

    // 1. Check if replying to an active pending approval
    if (
      options.hasPendingApproval &&
      /^(?:yes|no|approve|approved|reject|rejected|cancel|proceed|confirm|go\s+ahead|submit\s+it|do\s+not|don't)\b/i.test(
        text,
      )
    ) {
      return {
        category: 'APPROVAL_RESPONSE',
        specialistAgent: options.activeProjectAgent ?? AgentType.RESEARCH_AGENT,
        isMultiStepProject: false,
        confidence: 0.98,
      };
    }

    // 2. Check if asking for status/continuation of an existing project
    if (
      /\b(?:what'?s\s+happening\s+with|any\s+update(?:s)?\s+on|status\s+of|how\s+is\s+my|where\s+are\s+we\s+with|progress\s+on|check\s+my\s+project|my\s+project\s+status)\b/i.test(
        lower,
      )
    ) {
      const specialist = this.inferSpecialistFromKeywords(
        lower,
        options.activeProjectAgent ?? AgentType.JOB_AGENT,
      );
      return {
        category: 'PROJECT_STATUS_INQUIRY',
        specialistAgent: specialist,
        isMultiStepProject: false,
        targetCountry,
        confidence: 0.95,
      };
    }

    // 3. Education & Scholarships (check before general job/visa keywords,
    //    EXCEPT when already in an active JOB_AGENT conversation and the user is just sharing their degree/university/diploma!)
    const isExplicitScholarshipRequest =
      /\b(?:scholarship(?:s)?|study\s+abroad|tuition|motivation\s+letter|student\s+scholarship|apply\s+(?:for|to)\s+(?:a\s+)?universit(?:y|ies))\b/i.test(
        lower,
      );
    const isEducationKeyword =
      /\b(?:universit(?:y|ies)|scholarship(?:s)?|study\s+abroad|study\s+in|master'?s|bachelor'?s|phd|degree\s+programme(?:s)?|admission(?:s)?|tuition|motivation\s+letter|student\s+scholarship)\b/i.test(
        lower,
      );

    if (
      isEducationKeyword &&
      (options.activeProjectAgent !== AgentType.JOB_AGENT || isExplicitScholarshipRequest)
    ) {
      const countrySuffix = targetCountry ? ` in ${targetCountry.trim()}` : '';
      return {
        category: 'EDUCATION_AND_SCHOLARSHIP',
        specialistAgent: AgentType.EDUCATION_AGENT,
        isMultiStepProject: true,
        suggestedProjectTitle: `Find Universities & Scholarships${countrySuffix}`,
        targetCountry: targetCountry?.trim(),
        confidence: 0.94,
      };
    }

    // 4. Investor Discovery & Fundraising
    if (
      /\b(?:investor(?:s)?|fundraising|venture\s+capital|vc\s+firms?|angel\s+investor(?:s)?|seed\s+round|series\s+a|pitch\s+deck|pitch\s+email|raise\s+capital|raise\s+funds|startup\s+funding|accelerator(?:s)?)\b/i.test(
        lower,
      )
    ) {
      return {
        category: 'INVESTOR_DISCOVERY',
        specialistAgent: AgentType.INVESTOR_AGENT,
        isMultiStepProject: true,
        suggestedProjectTitle: 'Startup Investor Discovery & Outreach',
        targetCountry: targetCountry?.trim(),
        confidence: 0.95,
      };
    }

    // 5. Business Development, Registration & Expansion
    if (
      /\b(?:business\s+development|register\s+a\s+business|business\s+registration|expand\s+my\s+business|business\s+expansion|company\s+registration|incorporat(?:e|ion)|business\s+plan|competitor\s+analysis|market\s+research|enter\s+the\s+market|start\s+a\s+company|start\s+a\s+business)\b/i.test(
        lower,
      )
    ) {
      const countrySuffix = targetCountry ? ` in ${targetCountry.trim()}` : '';
      const isExpansion = /\bexpand\b/i.test(lower);
      return {
        category: 'BUSINESS_DEVELOPMENT',
        specialistAgent: AgentType.BUSINESS_AGENT,
        isMultiStepProject: true,
        suggestedProjectTitle: isExpansion
          ? `Business Expansion${countrySuffix}`
          : `Business Registration & Strategy${countrySuffix}`,
        targetCountry: targetCountry?.trim(),
        confidence: 0.93,
      };
    }

    // 6. Job Search & Application (Including CV intake, interviews, drafting, and applications)
    if (
      /\b(?:job\s+application(?:s)?|(?:find|get)\s+(?:me\s+)?a\s+job|looking\s+for\s+(?:a\s+)?job|apply\s+for\s+(?:suitable\s+)?jobs?|job\s+search|job\s+hunting|job\s+opportunities|employment|vacanc(?:y|ies)|career\s+opportunities|using\s+my\s+cv|tailor\s+my\s+cv|cover\s+letter|my\s+cv|my\s+resume|need\s+a\s+job|search\s+for\s+jobs?)\b/i.test(
        lower,
      ) ||
      /\b(?:wants\s+(?:you\s+to\s+)?help\s+(?:.*\s+)?apply(?:ing)?\s+for\s+a\s+job|applying\s+for\s+a\s+job|doesn't\s+have\s+a\s+cv|does\s+not\s+have\s+a\s+cv|don't\s+have\s+a\s+cv|no\s+cv|without\s+a\s+cv|interview\s+me|draft.*(?:cv|resume)|build.*(?:cv|resume)|compile.*(?:cv|resume)|create.*(?:cv|resume)|cv\s+drafting)\b/i.test(
        lower,
      ) ||
      /^(?:jobs?|job\s+help|cv|resume|work\s+opportunities)$/i.test(text) ||
      options.hasUploadedCv
    ) {
      const cleanCountry = targetCountry?.trim() || 'Target Market';
      return {
        category: 'JOB_SEARCH_AND_APPLICATION',
        specialistAgent: AgentType.JOB_AGENT,
        isMultiStepProject: true,
        suggestedProjectTitle: targetCountry
          ? `Find Employment in ${cleanCountry}`
          : 'Job Search & Application Campaign',
        targetCountry: cleanCountry,
        confidence: 0.98,
      };
    }

    // 7. Immigration, Relocation & Visas
    if (
      /\b(?:visa(?:\s+research|\s+options|\s+application)?|visas|relocat(?:e|ion)|move\s+to|immigrat(?:e|ion)|work\s+permit|permanent\s+residen(?:ce|cy)|express\s+entry|skilled\s+worker\s+visa|chancenkarte)\b/i.test(
        lower,
      )
    ) {
      const cleanCountry = targetCountry?.trim() || 'Destination Country';
      return {
        category: 'IMMIGRATION_AND_VISA',
        specialistAgent: AgentType.VISA_AGENT,
        isMultiStepProject: true,
        suggestedProjectTitle: `Relocation & Visa Pathway to ${cleanCountry}`,
        targetCountry: cleanCountry,
        confidence: 0.94,
      };
    }

    // 8. Conversational follow-up within an active project context
    if (options.activeProjectAgent) {
      return {
        category: 'CONVERSATIONAL_FOLLOWUP',
        specialistAgent: options.activeProjectAgent,
        isMultiStepProject: false,
        targetCountry: targetCountry?.trim(),
        confidence: 0.88,
      };
    }

    // 9. Default to General Research & Personal Assistant
    return {
      category: 'GENERAL_RESEARCH',
      specialistAgent: AgentType.RESEARCH_AGENT,
      isMultiStepProject: false,
      targetCountry: targetCountry?.trim(),
      confidence: 0.8,
    };
  }

  /**
   * AI-powered semantic intent detection: handles indirect phrasing ("I want to work"),
   * typos, slang, and non-English / native languages by asking the LLM to reason about
   * which specialist agent matches the user's underlying goal.
   */
  public async detectWithAI(
    rawText: string,
    openclawService: OpenClawService,
    options: {
      hasPendingApproval?: boolean;
      activeProjectAgent?: AgentType;
      hasUploadedCv?: boolean;
      customerId?: string;
    } = {},
  ): Promise<DetectedIntent> {
    const heuristic = this.detect(rawText, options);

    // If a specific specialist already matched with high confidence, or we're in tests / pure greeting, return fast
    const trimmed = rawText.trim();
    const isSimpleGreeting = /^(?:hi|hello|hey|good\s+(?:morning|afternoon|evening)|how\s+are\s+you|thanks?|thank\s+you)[!?.]*$/i.test(
      trimmed,
    );
    if (
      heuristic.specialistAgent !== AgentType.RESEARCH_AGENT ||
      env.NODE_ENV === 'test' ||
      process.env.VITEST ||
      trimmed.length < 4 ||
      isSimpleGreeting
    ) {
      return heuristic;
    }

    try {
      const routerPrompt = [
        'Classify the user message into the single best specialist agent.',
        'The user may write indirectly (e.g., "I want to work" -> JOB_AGENT, "I need money for my startup" -> INVESTOR_AGENT, "I want to move overseas" -> VISA_AGENT, "help me study" -> EDUCATION_AGENT), have typos, or write in any native language (Zulu, Shona, Xhosa, French, Spanish, etc.).',
        '',
        'Agents:',
        '- JOB_AGENT: Finding work/employment, CVs, resumes, job applications, careers.',
        '- VISA_AGENT: Relocating abroad, visas, immigration, work permits, moving to another country.',
        '- INVESTOR_AGENT: Fundraising, startup investors, VCs, pitch decks, business capital.',
        '- EDUCATION_AGENT: Scholarships, university admissions, studying abroad, academic motivation letters.',
        '- BUSINESS_AGENT: Registering/expanding a company, market strategy, general business plans.',
        '- RESEARCH_AGENT: General questions, casual chat, or tasks that do not fit the 5 specialists above.',
        '',
        'Respond ONLY with strict JSON (no markdown fences):',
        '{"agent":"JOB_AGENT|VISA_AGENT|INVESTOR_AGENT|EDUCATION_AGENT|BUSINESS_AGENT|RESEARCH_AGENT","targetCountry":null,"reasoning":"brief 1-sentence explanation","confidence":0.9}',
      ].join('\n');

      const routerCustomerId = options.customerId || 'intent-router';
      const sessionKey = buildTenantSessionKey({
        customerId: routerCustomerId,
        openclawAgentId: 'main',
        scopeType: 'conversation',
        scopeId: `router-${Date.now()}`,
      });

      const turn = await openclawService.executeAgentTurn({
        customerId: routerCustomerId,
        agentType: AgentType.RESEARCH_AGENT,
        openclawAgentId: 'main',
        sessionKey,
        userMessage: `User message: "${trimmed.slice(0, 500)}"`,
        systemInstructions: routerPrompt,
        conversationContext: [],
        allowedTools: [],
      });

      const jsonMatch = turn.responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch?.[0]) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          agent?: string;
          targetCountry?: string | null;
          reasoning?: string;
          confidence?: number;
        };

        const agentMap: Record<string, { agent: AgentType; category: IntentCategory; title: string }> = {
          JOB_AGENT: {
            agent: AgentType.JOB_AGENT,
            category: 'JOB_SEARCH_AND_APPLICATION',
            title: 'Job Search & Application Campaign',
          },
          VISA_AGENT: {
            agent: AgentType.VISA_AGENT,
            category: 'IMMIGRATION_AND_VISA',
            title: 'Relocation & Visa Pathway',
          },
          INVESTOR_AGENT: {
            agent: AgentType.INVESTOR_AGENT,
            category: 'INVESTOR_DISCOVERY',
            title: 'Startup Investor Discovery & Outreach',
          },
          EDUCATION_AGENT: {
            agent: AgentType.EDUCATION_AGENT,
            category: 'EDUCATION_AND_SCHOLARSHIP',
            title: 'University Admissions & Scholarships',
          },
          BUSINESS_AGENT: {
            agent: AgentType.BUSINESS_AGENT,
            category: 'BUSINESS_DEVELOPMENT',
            title: 'Business Registration & Strategy',
          },
          RESEARCH_AGENT: {
            agent: AgentType.RESEARCH_AGENT,
            category: 'GENERAL_RESEARCH',
            title: 'General Research',
          },
        };

        const mapped = parsed.agent ? agentMap[parsed.agent.toUpperCase()] : undefined;
        if (mapped && mapped.agent !== AgentType.RESEARCH_AGENT) {
          logger.info(
            {
              rawText: trimmed.slice(0, 80),
              routedAgent: mapped.agent,
              reasoning: parsed.reasoning,
            },
            'AI semantic intent detector routed message',
          );
          return {
            category: mapped.category,
            specialistAgent: mapped.agent,
            isMultiStepProject: true,
            suggestedProjectTitle: mapped.title,
            targetCountry: parsed.targetCountry || heuristic.targetCountry,
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
            routingReasoning: parsed.reasoning,
          };
        }
      }
    } catch (err) {
      logger.debug({ err }, 'AI semantic intent routing fallback to heuristic');
    }

    return heuristic;
  }

  private extractTargetCountry(text: string): string | undefined {
    for (const entry of COUNTRY_PATTERNS) {
      if (entry.regex.test(text)) {
        return entry.name.trim();
      }
    }
    return undefined;
  }

  private inferSpecialistFromKeywords(lower: string, fallback: AgentType): AgentType {
    if (/\b(?:job|employment|cv|resume|application|vacancy|career)\b/.test(lower)) {
      return AgentType.JOB_AGENT;
    }
    if (/\b(?:visa|relocat|immigrat|move|permit)\b/.test(lower)) {
      return AgentType.VISA_AGENT;
    }
    if (/\b(?:investor|funding|fundraising|vc|pitch|startup)\b/.test(lower)) {
      return AgentType.INVESTOR_AGENT;
    }
    if (/\b(?:business|register|expand|company|market)\b/.test(lower)) {
      return AgentType.BUSINESS_AGENT;
    }
    if (/\b(?:university|scholarship|study|degree)\b/.test(lower)) {
      return AgentType.EDUCATION_AGENT;
    }
    return fallback;
  }
}

export const intentDetector = new IntentDetector();
