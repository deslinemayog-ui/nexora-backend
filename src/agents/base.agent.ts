import fs from 'fs/promises';
import path from 'path';
import pdfParse from 'pdf-parse';
import { ActionCategory, AgentType, CustomerProfile, Project, Task } from '@prisma/client';
import { env } from '../config/env';
import { OpenClawService } from '../openclaw/openclaw.service';
import { ExecuteAgentTurnOutput } from '../openclaw/openclaw.types';
import { autonomousWorkerService } from '../tools/autonomous-worker.service';
import { documentGeneratorService, type GeneratedDocumentResult } from '../tools/document-generator.service';
import { logger } from '../utils/logger';

export interface PlannedTaskTemplate {
  stepOrder: number;
  title: string;
  description: string;
  assignedSpecialist: AgentType;
  requiresApproval?: boolean;
  actionCategory?: ActionCategory;
}

export interface AgentExecutionContext {
  customerId: string;
  sessionKey: string;
  userMessage: string;
  profile: CustomerProfile;
  memoryContext: string;
  conversationContext: Array<{ role: 'user' | 'assistant'; content: string }>;
  activeProject?: Project;
  activeTask?: Task;
  maxSubmissions?: number;
  deepThink?: boolean;
}

export interface ISpecialistAgent {
  readonly agentType: AgentType;
  readonly name: string;
  readonly openclawAgentId: string;
  readonly description: string;
  readonly allowedTools: string[];
  readonly restrictedActions: ActionCategory[];

  buildSystemInstructions(context: AgentExecutionContext, autonomousContext?: string): string;
  buildProjectTaskPlan(objective: string, targetCountry?: string): PlannedTaskTemplate[];
  execute(
    openclawService: OpenClawService,
    context: AgentExecutionContext,
  ): Promise<ExecuteAgentTurnOutput>;
}

// Stores the most recently compiled Deliverable Markdown & reviewed PDF per session
const latestDraftedDocBySession = new Map<string, string>();
const latestReviewedPdfBySession = new Map<string, GeneratedDocumentResult>();

export abstract class BaseSpecialistAgent implements ISpecialistAgent {
  public abstract readonly agentType: AgentType;
  public abstract readonly name: string;
  public abstract readonly openclawAgentId: string;
  public abstract readonly description: string;
  public abstract readonly allowedTools: string[];
  public abstract readonly restrictedActions: ActionCategory[];

  public abstract buildDomainRules(): string[];
  public abstract buildProjectTaskPlan(
    objective: string,
    targetCountry?: string,
  ): PlannedTaskTemplate[];

  public buildSystemInstructions(
    context: AgentExecutionContext,
    autonomousContext?: string,
  ): string {
    const profileSummary = [
      context.profile.fullName ? `Name: ${context.profile.fullName}` : null,
      context.profile.currentOccupation
        ? `Occupation: ${context.profile.currentOccupation}`
        : null,
      context.profile.yearsOfExperience !== null
        ? `Years of Experience: ${context.profile.yearsOfExperience}`
        : null,
      context.profile.skills.length > 0
        ? `Skills: ${context.profile.skills.join(', ')}`
        : null,
      context.profile.targetCountries.length > 0
        ? `Target Countries: ${context.profile.targetCountries.join(', ')}`
        : null,
    ]
      .filter(Boolean)
      .join(' | ');

    const activeProjectBlock = context.activeProject
      ? `Active Project: "${context.activeProject.title}" (Status: ${context.activeProject.status})`
      : 'No active project currently bound.';

    const activeTaskBlock = context.activeTask
      ? `Current Task Step #${context.activeTask.stepOrder}: "${context.activeTask.title}"`
      : '';

    const isPendingReview = this.needsReviewBeforeSubmit(context.userMessage, context);

    const deliverableGuidanceByAgent: Record<string, { label: string; requiredFields: string; template: string }> = {
      [AgentType.JOB_AGENT]: {
        label: 'CV / Resume',
        requiredFields:
          'Full Name, Email Address, Phone Number, Target Role, Target Location/Country, Work Experience, Technical Skills, and Education',
        template:
          '`# 📄 CURRICULUM VITAE — <Name>`, `## 🎯 Target Role`, `## 📍 Location & Availability`, `## 📞 Contact`, `## 👤 Professional Summary`, `## 🛠️ Core Technical Skills`, `## 💼 Work Experience` with `### <Company> — <Role>` and `**<Dates>**` followed by 3–5 detailed, achievement-oriented bullet points for EVERY company mentioned, and `## 🎓 Education`',
      },
      [AgentType.VISA_AGENT]: {
        label: 'Relocation & Visa Pathway Dossier',
        requiredFields:
          'Full Name, Email Address, Phone Number, Current Nationality/Location, Target Destination Country, Target Visa/Relocation Route (or Work/Study/Skilled Migration goal), Occupation/Qualifications, and Timeline/Family Details',
        template:
          '`# 🌍 RELOCATION & VISA PATHWAY DOSSIER — <Name>`, `## 🎯 Target Destination & Visa Route`, `## 👤 Applicant Profile & Eligibility`, `## 💼 Professional & Academic Credentials`, `## 📋 Recommended Visa Pathways & Requirements`, `## 🗓️ Step-by-Step Relocation Timeline`, and `## 📑 Supporting Documents Checklist`',
      },
      [AgentType.INVESTOR_AGENT]: {
        label: 'Investor Pitch & Business Memorandum',
        requiredFields:
          'Founder Name, Email Address, Phone Number, Startup/Company Name, Industry/Sector, Problem & Solution, Traction/Stage, and Target Funding Amount & Use of Funds',
        template:
          '`# 🚀 INVESTOR PITCH & BUSINESS MEMORANDUM — <Company Name>`, `## 🎯 Executive Summary & Funding Ask`, `## 💡 Problem & Solution`, `## 📈 Market Opportunity & Traction`, `## 🛠️ Product & Competitive Advantage`, `## 👥 Founding Team`, and `## 💰 Financial Highlights & Use of Funds`',
      },
      [AgentType.EDUCATION_AGENT]: {
        label: 'Scholarship & Admissions Motivation Dossier',
        requiredFields:
          'Applicant Name, Email Address, Phone Number, Target Degree/Program, Target Countries/Universities, Academic Background/GPA, Achievements, and Career Goals',
        template:
          '`# 🎓 SCHOLARSHIP & ADMISSIONS DOSSIER — <Name>`, `## 🎯 Target Program & Countries`, `## 👤 Academic & Personal Profile`, `## 📝 Statement of Purpose / Motivation Letter`, `## 🏆 Academic Achievements & Leadership`, and `## 🌍 Career Impact & Goals`',
      },
    };

    const domainGuide = deliverableGuidanceByAgent[this.agentType] ?? deliverableGuidanceByAgent[AgentType.JOB_AGENT]!;

    const directiveBlock = isPendingReview
      ? [
          'REVIEW-BEFORE-SUBMIT DIRECTIVE (CRITICAL):',
          `- NEVER auto-apply, submit forms, or send emails to external recipients until the user has provided all required information, reviewed the drafted deliverable (${domainGuide.label}), and clicked Approve & Submit.`,
          `- Required info before submission can proceed: ${domainGuide.requiredFields}.`,
          `- If ANY of these details are missing, DO NOT dump a long bulleted questionnaire. Reply concisely in 1–2 friendly sentences asking the user to fill in the prerequisites form below (it will pre-fill any details already saved in their profile) or reply with the missing details. DO NOT tell the user to click Approve & Submit while details are still missing!`,
          `- As soon as you have all required details, immediately compile the complete, expanded, publication-grade deliverable in Markdown (${domainGuide.template}). Never fabricate employers, dates, traction metrics, or degrees, but expand professionally based on the user's stated facts.`,
          '- Only once the complete deliverable is presented above, ask the user to review everything and click **Approve & Submit** when ready.',
        ]
      : [
          'AUTONOMOUS EXECUTION DIRECTIVE (CRITICAL):',
          '- The user has reviewed and explicitly approved submission. Execute the task and use the live scraped web data, discovered portals, and submitted application receipts provided below.',
        ];

    const previousDocRef = latestDraftedDocBySession.get(context.sessionKey);
    const previousDocBlock = previousDocRef
      ? [
          'PREVIOUS COMPILED DELIVERABLE REFERENCE & PDF EDIT INSTRUCTIONS (CRITICAL):',
          '- The full content of the referenced PDF is provided right below.',
          '- DO NOT look for or try to open any .pdf file on disk, and NEVER say the PDF file is unavailable in the workspace.',
          `- Apply the user's requested edits directly to this reference document and output the COMPLETE, updated deliverable in Markdown (${domainGuide.template}).`,
          '- Nexora AI will automatically compile your updated Markdown output into the new PDF file.',
          '',
          previousDocRef,
        ].join('\n')
      : '';

    const deepThinkBlock = context.deepThink
      ? [
          'DEEP THINKING MODE (ENABLED):',
          '- Think carefully step-by-step before answering. Wrap your internal analysis (constraints, trade-offs, options, edge cases, and action plan) inside <thinking>...</thinking> tags.',
          '- Immediately after </thinking>, provide a clear, concise, actionable final response.',
        ].join('\n')
      : '';

    return [
      `You are the ${this.name} within the Nexora AI Autonomous Workforce Platform.`,
      `Role Description: ${this.description}`,
      ...directiveBlock,
      deepThinkBlock,
      'DOMAIN RULES:',
      ...this.buildDomainRules().map((rule, idx) => `${idx + 1}. ${rule}`),
      `Customer Profile Summary: ${profileSummary || 'Auto-inferred from conversation'}`,
      `Customer Memory Facts:\n${context.memoryContext}`,
      activeProjectBlock,
      activeTaskBlock,
      previousDocBlock,
      autonomousContext ?? '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  protected needsReviewBeforeSubmit(userMessage: string, context?: AgentExecutionContext): boolean {
    const lower = (userMessage || '').toLowerCase();

    // 1. Candidate Dossier modal submission with uploaded CV is an explicit user submit action
    if (
      lower.includes('candidate profile & documents registered') ||
      lower.includes('apply on candidate behalf')
    ) {
      return false;
    }

    // 2. Explicit approval from the user ("Approve & Submit" button or confirmation reply)
    const isExplicitApproval =
      /\b(?:approved\.?\s*please\s+generate|approve\s*(?:&|and)\s*submit|looks\s+good,?\s*(?:search\s+and\s+)?apply|confirm\s*(?:&|and)\s*submit|submit\s+the\s+applications\s+now|yes,?\s*(?:submit|apply|send)|go\s+ahead\s+and\s+(?:apply|submit|send))\b/i.test(
        lower,
      ) &&
      !lower.includes("doesn't have a cv") &&
      !lower.includes('no cv') &&
      !lower.includes('interview me');

    if (isExplicitApproval) {
      // Require that a deliverable was compiled in history, cached in session, or uploaded as PDF before dispatching
      if (
        this.agentType === AgentType.JOB_AGENT ||
        this.agentType === AgentType.VISA_AGENT ||
        this.agentType === AgentType.INVESTOR_AGENT ||
        this.agentType === AgentType.EDUCATION_AGENT
      ) {
        const history = context?.conversationContext ?? [];
        const hasCompiledOrUploadedDeliverable =
          Boolean(context?.sessionKey && latestDraftedDocBySession.has(context.sessionKey)) ||
          Boolean(context?.sessionKey && latestReviewedPdfBySession.has(context.sessionKey)) ||
          lower.includes('[approved pdf:') ||
          /\b(?:\[attached|curriculum vitae|\.pdf\b)\b/i.test(lower) ||
          history.some(
            (m) =>
              m.role === 'assistant' &&
              (m.content.includes('CURRICULUM VITAE') ||
                m.content.includes('RELOCATION & VISA') ||
                m.content.includes('INVESTOR PITCH') ||
                m.content.includes('SCHOLARSHIP & ADMISSIONS') ||
                m.content.includes('created your CV PDF') ||
                m.content.includes('created your PDF') ||
                (m.content.includes('Professional Summary') && m.content.includes('Education')) ||
                m.content.includes('Ready for Live Job Search')),
          );
        return !hasCompiledOrUploadedDeliverable;
      }
      return false;
    }

    // 3. Otherwise, require user review & explicit "Approve & Submit" before sending any emails or filling forms
    return true;
  }

  public async execute(
    openclawService: OpenClawService,
    context: AgentExecutionContext,
  ): Promise<ExecuteAgentTurnOutput> {
    // If the user referenced a previously generated PDF for edits, load its text if not already cached in memory
    const refPdfMatch = context.userMessage.match(/\[(?:Reference|Approved) PDF:\s*([^\]]+)\]/i);
    if (refPdfMatch?.[1] && !latestDraftedDocBySession.has(context.sessionKey)) {
      try {
        const safeName = path.basename(refPdfMatch[1].trim());
        const cachePath = path.resolve(process.cwd(), 'node_modules', '.cache', 'nexora-documents', safeName);
        const storagePath = path.resolve(process.cwd(), 'storage', 'documents', safeName);
        const pdfBuf = await fs.readFile(cachePath).catch(() => fs.readFile(storagePath));
        const parsed = await pdfParse(pdfBuf);
        if (parsed.text?.trim()) {
          latestDraftedDocBySession.set(context.sessionKey, parsed.text.trim());
        }
      } catch {
        // non-fatal if file not found
      }
    }

    if (env.NODE_ENV === 'test' || this.needsReviewBeforeSubmit(context.userMessage, context)) {
      const thinkStart = Date.now();
      const systemInstructions = this.buildSystemInstructions(context);
      const turnOutput = await openclawService.executeAgentTurn({
        customerId: context.customerId,
        agentType: this.agentType,
        openclawAgentId: this.openclawAgentId,
        sessionKey: context.sessionKey,
        userMessage: context.userMessage,
        systemInstructions,
        conversationContext: context.conversationContext,
        allowedTools: this.allowedTools,
        projectId: context.activeProject?.id,
        taskId: context.activeTask?.id,
      });

      const thinkingMatch = turnOutput.responseText.match(/<thinking>([\s\S]*?)<\/thinking>/i);
      const extractedThinking = thinkingMatch?.[1]?.trim();
      const cleanedResponseText = thinkingMatch
        ? turnOutput.responseText.replace(/<thinking>[\s\S]*?<\/thinking>/i, '').trim()
        : turnOutput.responseText;
      const thinkingDurationMs =
        context.deepThink || extractedThinking ? Math.max(400, Date.now() - thinkStart) : undefined;
      const normalizedTurnOutput: ExecuteAgentTurnOutput = {
        ...turnOutput,
        responseText: cleanedResponseText,
        ...(extractedThinking ? { thinkingSummary: extractedThinking } : {}),
        ...(thinkingDurationMs ? { thinkingDurationMs } : {}),
      };

      // When any of the 4 specialist agents compiles or updates a deliverable during review,
      // immediately generate the real PDF via Headless Chrome and return a concise message + PDF card
      const lowerResp = normalizedTurnOutput.responseText.toLowerCase();
      const headingCount = (normalizedTurnOutput.responseText.match(/^#{1,3}\s+/gm) || []).length;
      const isCompiledDeliverable =
        lowerResp.includes('curriculum vitae') ||
        (lowerResp.includes('professional summary') && lowerResp.includes('education')) ||
        (lowerResp.includes('professional experience') && lowerResp.includes('education')) ||
        lowerResp.includes('relocation & visa') ||
        lowerResp.includes('visa pathway') ||
        lowerResp.includes('investor pitch') ||
        lowerResp.includes('business memorandum') ||
        lowerResp.includes('executive summary') ||
        lowerResp.includes('scholarship & admissions') ||
        lowerResp.includes('statement of purpose') ||
        lowerResp.includes('motivation letter') ||
        (headingCount >= 3 && normalizedTurnOutput.responseText.length >= 450);

      const isPdfReviewAgent =
        this.agentType === AgentType.JOB_AGENT ||
        this.agentType === AgentType.VISA_AGENT ||
        this.agentType === AgentType.INVESTOR_AGENT ||
        this.agentType === AgentType.EDUCATION_AGENT;

      if (env.NODE_ENV !== 'test' && isPdfReviewAgent && isCompiledDeliverable) {
        try {
          latestDraftedDocBySession.set(context.sessionKey, normalizedTurnOutput.responseText);

          const generatedPdf = await documentGeneratorService.generateDeliverablePdfFromMarkdown(
            this.agentType,
            normalizedTurnOutput.responseText,
            {
              candidateName: context.profile.fullName || undefined,
              email: context.profile.email || undefined,
              location: context.profile.targetCountries[0] || undefined,
            },
          );
          latestReviewedPdfBySession.set(context.sessionKey, generatedPdf);

          const docLabelByAgent: Record<string, string> = {
            [AgentType.JOB_AGENT]: 'CV PDF',
            [AgentType.VISA_AGENT]: 'Relocation & Visa Dossier PDF',
            [AgentType.INVESTOR_AGENT]: 'Investor Pitch & Business Plan PDF',
            [AgentType.EDUCATION_AGENT]: 'Scholarship & Motivation Letter PDF',
          };
          const docLabel = docLabelByAgent[this.agentType] || 'deliverable PDF';

          const conciseSummary = [
            `I have created your ${docLabel} (**${generatedPdf.fileName}**). Please open and review the PDF below.`,
            '',
            `If there is anything you would like edited or added, let me know and I will update this PDF for you. Once you are happy with everything, click **Approve & Submit** to review and confirm submission.`,
          ].join('\n');

          return {
            ...normalizedTurnOutput,
            responseText: conciseSummary,
            generatedDocument: generatedPdf,
          };
        } catch (pdfErr) {
          logger.warn({ err: pdfErr, agentType: this.agentType }, 'Could not generate review deliverable PDF');
        }
      }

      return normalizedTurnOutput;
    }

    // Run real autonomous web scraping, live internet discovery & email/form submission (reusing the exact reviewed PDF!)
    const workReport = await autonomousWorkerService.executeAutonomousTask({
      customerId: context.customerId,
      agentType: this.agentType,
      userMessage: context.userMessage,
      conversationHistory: context.conversationContext,
      customerName: context.profile.fullName,
      customerEmail: context.profile.email,
      targetCountry: context.profile.targetCountries[0],
      existingDocument: latestReviewedPdfBySession.get(context.sessionKey),
      maxSubmissions: context.maxSubmissions,
    });

    // Return a clean, concise submission summary for all 4 specialist outreach agents
    if (
      this.agentType === AgentType.JOB_AGENT ||
      this.agentType === AgentType.VISA_AGENT ||
      this.agentType === AgentType.INVESTOR_AGENT ||
      this.agentType === AgentType.EDUCATION_AGENT
    ) {
      const submitted = workReport.submittedApplications;
      const docName = workReport.generatedDocument?.fileName || 'your reviewed PDF';
      const actionNounByAgent: Record<string, string> = {
        [AgentType.JOB_AGENT]: 'matching job openings found online',
        [AgentType.VISA_AGENT]: 'verified immigration & relocation portals/advisors',
        [AgentType.INVESTOR_AGENT]: 'matched investors & venture portals',
        [AgentType.EDUCATION_AGENT]: 'matched scholarship & university admissions portals',
      };
      const actionNoun = actionNounByAgent[this.agentType] || 'matching targets';
      const lines =
        submitted.length > 0
          ? [
              `✅ **Done! I have submitted your reviewed document (\`${docName}\`) to ${submitted.length} ${actionNoun}:**`,
              '',
              ...submitted.map(
                (s, idx) =>
                  `${idx + 1}. **${s.targetName}** — ${s.deliveredToEmail || s.contactEmail || 'portal'} (\`${s.receiptId}\`)`,
              ),
              '',
              `You can track every submission, read replies, and follow up directly in the **Submissions** drawer.`,
            ]
          : [
              `⚠️ No matching targets with reachable submission endpoints were dispatched yet. Please verify your details and try again.`,
            ];

      return {
        runId: `submit-${Date.now()}`,
        sessionKey: context.sessionKey,
        responseText: lines.join('\n'),
        tokensUsed: 0,
        toolCallsCount: submitted.length,
        durationMs: 0,
        status: 'COMPLETED',
        generatedDocument: workReport.generatedDocument,
        submittedApplications: workReport.submittedApplications,
      };
    }

    const formattedWork = autonomousWorkerService.formatReportForPromptAndDisplay(workReport);
    const systemInstructions = this.buildSystemInstructions(
      context,
      formattedWork.promptContextBlock,
    );

    const turnOutput = await openclawService.executeAgentTurn({
      customerId: context.customerId,
      agentType: this.agentType,
      openclawAgentId: this.openclawAgentId,
      sessionKey: context.sessionKey,
      userMessage: context.userMessage,
      systemInstructions,
      conversationContext: context.conversationContext,
      allowedTools: this.allowedTools,
      projectId: context.activeProject?.id,
      taskId: context.activeTask?.id,
    });

    const combinedResponse = turnOutput.responseText.includes('SUB-')
      ? turnOutput.responseText
      : `${turnOutput.responseText}\n\n---\n\n${formattedWork.markdownExecutionSummary}`;

    return {
      ...turnOutput,
      responseText: combinedResponse,
      generatedDocument: workReport.generatedDocument,
      submittedApplications: workReport.submittedApplications,
      toolCallsCount: Math.max(
        turnOutput.toolCallsCount,
        workReport.scrapedCustomerSites.length +
        workReport.discoveredTargets.length +
        workReport.submittedApplications.length,
      ),
    };
  }
}
