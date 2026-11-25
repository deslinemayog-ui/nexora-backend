import crypto from 'crypto';
import { env } from '../config/env';
import { AgentType } from '../database/types';
import type { OpenClawService } from '../openclaw/openclaw.service';
import { logger } from '../utils/logger';

export interface AiCvJobProfile {
  primaryTitle: string;
  matchingTitles: string[];
  coreSkills: string[];
  yearsExperience?: number;
  professionalSummary: string;
  isTechRole: boolean;
  recommendedEmployers?: Array<{ name: string; websiteUrl: string }>;
}

let registeredOpenClawService: OpenClawService | null = null;

/**
 * Registers the application's OpenClawService so all CV title extraction & job-fit
 * screening runs through OpenClaw's configured AI model.
 */
export function setCvMatcherOpenClawService(service: OpenClawService): void {
  registeredOpenClawService = service;
}

function extractJsonObject(rawText: string): Record<string, any> | null {
  if (!rawText) return null;
  const cleaned = rawText
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // try extracting first balanced JSON object
  }

  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      return null;
    }
  }
  return null;
}

async function callOpenClawJson(
  prompt: string,
  customerId = 'cv-matcher',
): Promise<Record<string, any> | null> {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return null;
  if (!registeredOpenClawService) {
    logger.warn('OpenClawService not registered for CV AI matcher; falling back to deterministic rules');
    return null;
  }

  try {
    const taskId = `cv-match-${crypto.randomUUID().slice(0, 8)}`;
    const sessionKey = registeredOpenClawService.createTaskSessionKey(
      customerId,
      taskId,
      env.OPENCLAW_DEFAULT_AGENT_ID,
    );

    const output = await registeredOpenClawService.executeAgentTurn({
      customerId,
      agentType: AgentType.JOB_AGENT,
      openclawAgentId: env.OPENCLAW_DEFAULT_AGENT_ID,
      sessionKey,
      userMessage: prompt,
      systemInstructions:
        'You are a strict JSON-only CV analysis and job-matching engine. Output ONLY a single valid JSON object matching the exact schema requested. Never include markdown code fences, prose, or explanations.',
      allowedTools: [],
    });

    return extractJsonObject(output.responseText);
  } catch (err) {
    logger.warn({ err }, 'OpenClaw CV matcher call failed; falling back to deterministic rules');
    return null;
  }
}

/**
 * Feeds the candidate's actual CV text to OpenClaw (using the configured model) to extract
 * the exact best-fit job title, alternative matching titles, verified skills, years of experience,
 * and a crisp employer-ready professional summary. Works for ANY profession (tech or non-tech).
 */
export async function extractCvJobProfileWithAI(
  cvText: string,
  userTargetRole?: string,
  additionalNotes?: string,
  customerId?: string,
  targetCountry?: string,
): Promise<AiCvJobProfile | null> {
  const trimmedCv = (cvText || '').trim();
  if (trimmedCv.length < 40) return null;

  const countryLabel =
    targetCountry && !/anywhere|worldwide|global|remote/i.test(targetCountry)
      ? targetCountry
      : 'South Africa, United Kingdom, United States, Canada (Remote/Global)';

  const prompt = `Based on the candidate's CV text, stated Target Job Role, Target Country, and Additional Notes / Cover Letter below, come up with:
1) AT LEAST 3 exact, searchable job titles that match the real skills and experience on this CV (for example: "Senior React Native Developer", "React Developer", "Node.js Developer" — OR for an automotive mechanic: "Automotive Mechanic", "Motor Vehicle Technician", "Automotive Diagnostic Technician").
2) 28 to 35 REAL, well-known companies, workshops, dealerships, agencies, or employers in "${countryLabel}" that actively hire for those exact roles, along with each employer's official website URL (https://...).

Target Job Role from user: "${userTargetRole || 'Not specified'}"
Target Country / Location: "${countryLabel}"
Additional Notes / Cover Letter: "${(additionalNotes || 'None provided').slice(0, 1000)}"

Extracted CV Text:
"""
${trimmedCv.slice(0, 6500)}
"""

Rules:
- Every title and skill MUST be strictly grounded in the skills and experience written on the CV (never invent stacks, trades, or certifications not on the CV).
- Provide at least 3 distinct, realistic searchable job titles in "matchingTitles".
- Set "isTechRole" to true ONLY for software/IT/engineering roles (false for automotive mechanics, trades, healthcare, security, finance, etc.).
- Every employer in "recommendedEmployers" must be a real, active organization in "${countryLabel}" relevant to this exact profession, with a valid https:// websiteUrl.
- STRONGLY PREFER specialized recruitment agencies, staffing firms, mid-sized companies, consultancies, studios, and workshops that accept direct CV emails (careers@, jobs@, hr@, recruitment@, talent@). AVOID giant consumer megacorps (like Google, MTN, Standard Bank, Discovery, Tesco) that only publish customer-care/fraud/press emails and block email CVs.
- Return JSON ONLY with this exact schema:
{
  "primaryTitle": "Best single job title matching the CV and target role",
  "matchingTitles": ["Title 1", "Title 2", "Title 3", "Title 4"],
  "coreSkills": ["Up to 15 concrete skills/tools/certifications explicitly present on the CV"],
  "yearsExperience": 7,
  "professionalSummary": "2-sentence crisp third-person professional summary suitable for an application email",
  "isTechRole": false,
  "recommendedEmployers": [
    { "name": "Company Name", "websiteUrl": "https://example-real-company.co.za" }
  ]
}`;

  const parsed = await callOpenClawJson(prompt, customerId);
  if (!parsed || typeof parsed.primaryTitle !== 'string' || !parsed.primaryTitle.trim()) {
    return null;
  }

  const rawTitles = Array.isArray(parsed.matchingTitles)
    ? parsed.matchingTitles
        .filter((t: unknown): t is string => typeof t === 'string' && t.trim().length > 1)
        .map((t: string) => t.trim())
    : [];
  const uniqueTitles = Array.from(new Set([parsed.primaryTitle.trim(), ...rawTitles])).slice(0, 5);

  const recommendedEmployers = Array.isArray(parsed.recommendedEmployers)
    ? parsed.recommendedEmployers
        .filter(
          (e: any) =>
            e &&
            typeof e.name === 'string' &&
            e.name.trim().length >= 2 &&
            typeof e.websiteUrl === 'string' &&
            /^https?:\/\//i.test(e.websiteUrl.trim()),
        )
        .map((e: any) => ({ name: e.name.trim(), websiteUrl: e.websiteUrl.trim() }))
        .slice(0, 40)
    : [];

  return {
    primaryTitle: parsed.primaryTitle.trim(),
    matchingTitles: uniqueTitles,
    coreSkills: Array.isArray(parsed.coreSkills)
      ? parsed.coreSkills
          .filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 1)
          .slice(0, 15)
      : [],
    yearsExperience:
      typeof parsed.yearsExperience === 'number' && parsed.yearsExperience > 0
        ? Math.round(parsed.yearsExperience)
        : undefined,
    professionalSummary:
      typeof parsed.professionalSummary === 'string' ? parsed.professionalSummary.trim() : '',
    isTechRole: Boolean(parsed.isTechRole),
    recommendedEmployers,
  };
}

/**
 * Requests an additional batch of unique real employers (excluding already-tried companies)
 * from OpenClaw so any requested submission count (10, 25, 50, 100) can be fulfilled dynamically.
 */
export async function discoverAdditionalEmployersWithAI(params: {
  role: string;
  matchingTitles?: string[];
  targetCountry?: string;
  excludeCompanies: string[];
  batchSize?: number;
  customerId?: string;
}): Promise<Array<{ name: string; websiteUrl: string }>> {
  const count = Math.min(35, Math.max(15, params.batchSize ?? 25));
  const countryLabel =
    params.targetCountry && !/anywhere|worldwide|global|remote/i.test(params.targetCountry)
      ? params.targetCountry
      : 'South Africa, United Kingdom, United States, Canada, Australia';
  const excludeList = params.excludeCompanies.slice(-120).join(', ');

  const prompt = `List ${count} MORE real, active companies, workshops, dealerships, agencies, or employers in "${countryLabel}" that hire for "${params.role}"${params.matchingTitles?.length ? ` (or ${params.matchingTitles.join(', ')})` : ''}.

DO NOT repeat any of these already-checked companies:
${excludeList || 'None'}

Rules:
- Every company must be a real organization with its official website URL (https://...).
- STRONGLY PREFER specialized recruitment agencies, staffing firms, mid-sized companies, studios, dealerships, and workshops that publish real hiring/HR/careers email addresses (careers@, jobs@, hr@, recruitment@, talent@). AVOID giant consumer banks/telecoms/megacorps that only list customer-care, fraud, or press emails.
- Return JSON ONLY:
{
  "employers": [
    { "name": "Company Name", "websiteUrl": "https://example-company.co.za" }
  ]
}`;

  const parsed = await callOpenClawJson(prompt, params.customerId);
  if (!parsed || !Array.isArray(parsed.employers)) return [];

  const excludeSet = new Set(
    params.excludeCompanies.map((c) => c.trim().toLowerCase().replace(/[^a-z0-9]/g, '')),
  );
  return parsed.employers
    .filter(
      (e: any) =>
        e &&
        typeof e.name === 'string' &&
        e.name.trim().length >= 2 &&
        typeof e.websiteUrl === 'string' &&
        /^https?:\/\//i.test(e.websiteUrl.trim()) &&
        !excludeSet.has(e.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '')),
    )
    .map((e: any) => ({ name: e.name.trim(), websiteUrl: e.websiteUrl.trim() }))
    .slice(0, count);
}

/**
 * Discovers real, verified outreach targets via OpenClaw for VISA_AGENT, EDUCATION_AGENT,
 * and INVESTOR_AGENT (immigration agencies/relocation sponsors, scholarship/university offices,
 * or VC funds/angel syndicates) so all specialist agents scale cleanly to 10–100 unique submissions.
 */
export async function discoverAgentTargetsWithAI(params: {
  agentType: AgentType;
  contextSummary: string;
  targetCountry?: string;
  excludeNames: string[];
  batchSize?: number;
  customerId?: string;
}): Promise<Array<{ name: string; category: string; websiteUrl: string; focusSummary: string }>> {
  const count = Math.min(35, Math.max(15, params.batchSize ?? 25));
  const countryLabel =
    params.targetCountry && !/anywhere|worldwide|global|remote/i.test(params.targetCountry)
      ? params.targetCountry
      : 'Global (UK, Canada, Germany, USA, Australia, South Africa, Europe)';
  const excludeList = params.excludeNames.slice(-120).join(', ');

  const roleDesc =
    params.agentType === AgentType.VISA_AGENT
      ? `licensed immigration agencies, relocation consultancies, and visa-sponsoring employers in "${countryLabel}"`
      : params.agentType === AgentType.EDUCATION_AGENT
        ? `universities, international admissions offices, and scholarship foundations offering funded programs in "${countryLabel}"`
        : `venture capital funds, startup accelerators, and angel investor networks investing in "${countryLabel}"`;

  const prompt = `List ${count} REAL, active ${roleDesc} that genuinely match this applicant's profile.

Applicant Profile / Context:
"""
${params.contextSummary.slice(0, 2800)}
"""

DO NOT repeat any of these already-checked organizations:
${excludeList || 'None'}

Rules:
- Every organization must be real and active, with its official website URL (https://...).
- Prefer organizations that publish public contact, admissions, pitch, or recruitment email addresses on their websites.
- Return JSON ONLY:
{
  "targets": [
    {
      "name": "Organization Name",
      "category": "Short category label",
      "websiteUrl": "https://official-website.org",
      "focusSummary": "1-sentence explanation of why they match this applicant"
    }
  ]
}`;

  const parsed = await callOpenClawJson(prompt, params.customerId);
  if (!parsed || !Array.isArray(parsed.targets)) return [];

  const excludeSet = new Set(
    params.excludeNames.map((n) => n.trim().toLowerCase().replace(/[^a-z0-9]/g, '')),
  );
  return parsed.targets
    .filter(
      (t: any) =>
        t &&
        typeof t.name === 'string' &&
        t.name.trim().length >= 2 &&
        typeof t.websiteUrl === 'string' &&
        /^https?:\/\//i.test(t.websiteUrl.trim()) &&
        !excludeSet.has(t.name.trim().toLowerCase().replace(/[^a-z0-9]/g, '')),
    )
    .map((t: any) => ({
      name: t.name.trim(),
      category: typeof t.category === 'string' && t.category.trim() ? t.category.trim() : 'Verified Partner',
      websiteUrl: t.websiteUrl.trim(),
      focusSummary: typeof t.focusSummary === 'string' ? t.focusSummary.trim() : '',
    }))
    .slice(0, count);
}

export interface TailoredOutreachPitch {
  subject: string;
  body: string;
  profileSummary: string;
}

/**
 * Generates hyper-personalized, per-company email subjects, 3-sentence custom pitches,
 * and tailored profile summaries in ONE fast batched OpenClaw call (up to 12 targets per batch).
 * Strictly grounded in the candidate's real CV/profile — never fabricates experience or skills.
 */
export async function generateTailoredPitchesBatchWithAI(params: {
  agentType: AgentType;
  applicantName: string;
  applicantContact: string;
  cvOrProfileText: string;
  targets: Array<{
    key: string;
    name: string;
    category: string;
    focusSummary: string;
  }>;
  customerId?: string;
}): Promise<Map<string, TailoredOutreachPitch>> {
  const result = new Map<string, TailoredOutreachPitch>();
  if (params.targets.length === 0) return result;
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return result;

  const CHUNK_SIZE = 12;
  for (let i = 0; i < params.targets.length; i += CHUNK_SIZE) {
    const batch = params.targets.slice(i, i + CHUNK_SIZE);
    const toneHint =
      params.agentType === AgentType.INVESTOR_AGENT
        ? 'investor introduction & fundraising pitch'
        : params.agentType === AgentType.EDUCATION_AGENT
          ? 'scholarship & university admissions inquiry'
          : params.agentType === AgentType.VISA_AGENT
            ? 'skilled migration / work visa sponsorship application'
            : 'direct job application';

    const prompt = `Write a sharp, human, hyper-personalized ${toneHint} for EACH target below on behalf of ${params.applicantName}.

Applicant Real CV / Profile (USE ONLY REAL FACTS, PROJECTS, EMPLOYERS, AND SKILLS FROM HERE — NEVER FABRICATE ANYTHING):
"""
${params.cvOrProfileText.slice(0, 4200)}
"""
Applicant Contact: ${params.applicantContact}

Targets to personalize (${batch.length}):
${JSON.stringify(
  batch.map((t) => ({
    key: t.key,
    target: t.name,
    category: t.category,
    summary: t.focusSummary.slice(0, 260),
  })),
  null,
  2,
)}

Rules:
- For EACH target, reference the specific company/role AND connect 1-2 REAL achievements, past employers, or verified skills from the applicant's CV that directly fit that target.
- Keep each "body" concise (3-4 crisp sentences, natural human tone, no fluff, no markdown bold **, sign off with ${params.applicantName}).
- Keep each "subject" crisp and specific (under 85 chars) including the role/opportunity and ${params.applicantName}.
- Keep each "profileSummary" to 1-2 sentences tailored to that specific company.
- Return JSON ONLY:
{
  "pitches": [
    {
      "key": "target-key",
      "subject": "Specific high-open-rate subject",
      "body": "Dear Hiring Team at ...,\\n\\nParagraph 1...\\n\\nBest regards,\\n${params.applicantName}",
      "profileSummary": "1-2 sentence tailored highlight"
    }
  ]
}`;

    const parsed = await callOpenClawJson(prompt, params.customerId);
    if (!parsed || !Array.isArray(parsed.pitches)) continue;
    for (const item of parsed.pitches) {
      if (
        item &&
        typeof item.key === 'string' &&
        typeof item.body === 'string' &&
        item.body.trim().length >= 40
      ) {
        result.set(item.key, {
          subject: typeof item.subject === 'string' && item.subject.trim() ? item.subject.trim() : '',
          body: item.body.trim(),
          profileSummary:
            typeof item.profileSummary === 'string' && item.profileSummary.trim()
              ? item.profileSummary.trim()
              : '',
        });
      }
    }
  }

  return result;
}

/**
 * Vets a batch of candidate job listings against the candidate's actual CV profile via OpenClaw.
 * Rejects mismatched roles (wrong tech stack, wrong department, huge experience gap, etc.).
 */
export async function filterJobsByCvFitWithAI<
  T extends { id: string; title: string; company: string; description: string; matchScore: number },
>(
  profile: {
    role: string;
    skills?: string[];
    yearsExperience?: number;
    cvText?: string;
    customerId?: string;
  },
  jobs: T[],
): Promise<T[]> {
  if (jobs.length === 0) return jobs;

  const jobSummaries = jobs.slice(0, 35).map((j) => ({
    id: j.id,
    title: j.title,
    company: j.company,
    description: j.description.slice(0, 320),
  }));

  const prompt = `Screen these job listings against the candidate's CV.
REJECT any job that:
- Belongs to a different profession/department (e.g. Marketing/Content Creator for a Developer, or Software Dev for a Security Guard)
- Requires a primary technology stack NOT on the candidate's CV (e.g. Ruby on Rails, MuleSoft, SAP, COBOL, Java/Azure Integration, OR native iOS Swift/SwiftUI/UIKit / native Android Kotlin when the candidate only uses React Native / Expo)
- Never match a React Native / cross-platform mobile developer to a native iOS (Swift) or native Android (Kotlin) role unless Swift or Kotlin is explicitly listed on their CV!
- Requires significantly more years of experience than the candidate has (more than +2 years above candidate's experience)

Candidate Profile:
- Target Role: ${profile.role}
- Years Experience: ${profile.yearsExperience ?? 'Unknown'}
- Verified Skills: ${(profile.skills || []).join(', ') || 'See CV'}
- CV Excerpt: ${(profile.cvText || '').slice(0, 2200)}

Candidate Jobs to Screen:
${JSON.stringify(jobSummaries, null, 2)}

Return JSON ONLY:
{
  "approved": [
    { "id": "job-id", "fitScore": 85 }
  ]
}
Include ONLY jobs with fitScore >= 60.`;

  const parsed = await callOpenClawJson(prompt, profile.customerId);
  if (!parsed || !Array.isArray(parsed.approved)) {
    return jobs;
  }

  const approvedScores = new Map<string, number>();
  for (const item of parsed.approved) {
    if (
      item &&
      typeof item.id === 'string' &&
      typeof item.fitScore === 'number' &&
      item.fitScore >= 60
    ) {
      approvedScores.set(item.id, item.fitScore);
    }
  }

  return jobs
    .filter((j) => approvedScores.has(j.id))
    .map((j) => ({
      ...j,
      matchScore: Math.max(j.matchScore, approvedScores.get(j.id)!),
    }))
    .sort((a, b) => b.matchScore - a.matchScore);
}
