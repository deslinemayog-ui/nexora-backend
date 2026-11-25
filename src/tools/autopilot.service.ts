import crypto from 'crypto';
import { AgentType } from '../database/types';
import type { NexoraRepository } from '../database/repository';
import { platformStore, type VacancyRecord } from '../modules/platform/platform.store';
import { logger } from '../utils/logger';
import { autonomousWorkerService } from './autonomous-worker.service';
import { imapMonitorService } from './imap-monitor.service';

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'nexora-d7346';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyBjRi92-GpP71HcBUUXknw3vPhX3lSh7dk';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

export const AUTOPILOT_COST_PER_SUBMISSION_CENTS = 10; // $0.10 per autopilot submission
export const AUTOPILOT_DEFAULT_DAILY_LIMIT = 10; // 10 unique jobs every morning
export const FREE_FOLLOWUP_DELAY_DAYS = 4; // 4-5 days with no response -> free follow-up

export interface UserAutopilotConfig {
  enabled: boolean;
  status: 'ACTIVE' | 'PAUSED' | 'HIRED' | 'LOW_BALANCE';
  dailyLimit: number;
  costPerSubmissionCents: number;
  runHourLocal: number;
  lastRunDate?: string;
  lastRunSubmittedCount?: number;
  totalSubmitted: number;
  appliedEmails: string[];
  appliedCompanies: string[];
  updatedAt: string;
}

const DEFAULT_AUTOPILOT: UserAutopilotConfig = {
  enabled: false,
  status: 'PAUSED',
  dailyLimit: AUTOPILOT_DEFAULT_DAILY_LIMIT,
  costPerSubmissionCents: AUTOPILOT_COST_PER_SUBMISSION_CENTS,
  runHourLocal: 8,
  totalSubmitted: 0,
  appliedEmails: [],
  appliedCompanies: [],
  updatedAt: new Date().toISOString(),
};

function toFirestoreValue(val: any): Record<string, any> {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map((v) => toFirestoreValue(v)) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function parseFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return undefined;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    return (val.arrayValue?.values || []).map((v: any) => parseFirestoreValue(v));
  }
  if ('mapValue' in val) {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(val.mapValue?.fields || {})) {
      out[k] = parseFirestoreValue(v);
    }
    return out;
  }
  return undefined;
}

function parseDocFields(fields: Record<string, any> | undefined): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields || {})) {
    out[k] = parseFirestoreValue(v);
  }
  return out;
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

class AutopilotService {
  private repository: NexoraRepository | null = null;
  private schedulerTimer: ReturnType<typeof setInterval> | null = null;
  private lastFollowUpSweepAt = 0;
  private activeUserRuns = new Set<string>();

  public bindRepository(repo: NexoraRepository): void {
    this.repository = repo;
  }

  /**
   * Starts the background scheduler for:
   * 1) Daily morning Autopilot (10 unique jobs/day @ $0.10 until hired, paused, or $0 balance)
   * 2) Free 4-5 day auto follow-up sweep on unanswered company emails
   */
  public startScheduler(): void {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;
    if (this.schedulerTimer) return;

    this.schedulerTimer = setInterval(() => {
      void this.tickScheduler();
    }, 15 * 60 * 1000); // every 15 minutes

    logger.info('Nexora Autopilot & Free Follow-Up Scheduler started (15-min tick)');
  }

  public stopScheduler(): void {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  private async tickScheduler(): Promise<void> {
    try {
      const hour = new Date().getHours();
      // Run daily morning autopilot once local hour >= 8 (each user runs at most once per YYYY-MM-DD)
      if (hour >= 8) {
        await this.runMorningAutopilotSweep();
      }
      // Run free 4-5 day follow-up sweep every 6 hours
      if (Date.now() - this.lastFollowUpSweepAt >= 6 * 60 * 60 * 1000) {
        this.lastFollowUpSweepAt = Date.now();
        await this.runFreeFollowUpSweep();
      }
    } catch (err) {
      logger.warn({ err }, 'Autopilot scheduler tick encountered error');
    }
  }

  private async fetchUserDoc(userUid: string): Promise<Record<string, any> | null> {
    try {
      const res = await fetch(
        `${FIRESTORE_BASE}/users/${encodeURIComponent(userUid)}?key=${FIREBASE_API_KEY}`,
        { signal: AbortSignal.timeout(6000) },
      );
      if (!res.ok) return null;
      const json = (await res.json()) as { fields?: Record<string, any> };
      return { id: userUid, ...parseDocFields(json.fields) };
    } catch {
      return null;
    }
  }

  private async saveAutopilotToUser(userUid: string, config: UserAutopilotConfig): Promise<void> {
    const clean: UserAutopilotConfig = {
      ...config,
      costPerSubmissionCents: AUTOPILOT_COST_PER_SUBMISSION_CENTS,
      appliedEmails: Array.from(new Set((config.appliedEmails || []).map((e) => e.toLowerCase()))).slice(-500),
      appliedCompanies: Array.from(new Set(config.appliedCompanies || [])).slice(-500),
      updatedAt: new Date().toISOString(),
    };
    const url = `${FIRESTORE_BASE}/users/${encodeURIComponent(userUid)}?updateMask.fieldPaths=autopilot&updateMask.fieldPaths=updatedAt&key=${FIREBASE_API_KEY}`;
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: {
          autopilot: toFirestoreValue(clean),
          updatedAt: { stringValue: clean.updatedAt },
        },
      }),
      signal: AbortSignal.timeout(6000),
    }).catch(() => undefined);
  }

  public async getAutopilotConfig(userUid: string): Promise<UserAutopilotConfig> {
    const user = await this.fetchUserDoc(userUid);
    const raw = user?.autopilot;
    if (!raw || typeof raw !== 'object') {
      return { ...DEFAULT_AUTOPILOT };
    }
    return {
      enabled: Boolean(raw.enabled),
      status: raw.status || (raw.enabled ? 'ACTIVE' : 'PAUSED'),
      dailyLimit: Number(raw.dailyLimit) || AUTOPILOT_DEFAULT_DAILY_LIMIT,
      costPerSubmissionCents: AUTOPILOT_COST_PER_SUBMISSION_CENTS,
      runHourLocal: typeof raw.runHourLocal === 'number' ? raw.runHourLocal : 8,
      lastRunDate: raw.lastRunDate,
      lastRunSubmittedCount: raw.lastRunSubmittedCount,
      totalSubmitted: Number(raw.totalSubmitted) || 0,
      appliedEmails: Array.isArray(raw.appliedEmails) ? raw.appliedEmails : [],
      appliedCompanies: Array.isArray(raw.appliedCompanies) ? raw.appliedCompanies : [],
      updatedAt: raw.updatedAt || new Date().toISOString(),
    };
  }

  public async updateAutopilotConfig(
    userUid: string,
    patch: Partial<Pick<UserAutopilotConfig, 'enabled' | 'status' | 'dailyLimit' | 'runHourLocal'>>,
  ): Promise<UserAutopilotConfig> {
    const current = await this.getAutopilotConfig(userUid);
    const next: UserAutopilotConfig = {
      ...current,
      ...patch,
      dailyLimit: Math.min(25, Math.max(1, patch.dailyLimit ?? current.dailyLimit ?? AUTOPILOT_DEFAULT_DAILY_LIMIT)),
      costPerSubmissionCents: AUTOPILOT_COST_PER_SUBMISSION_CENTS,
      updatedAt: new Date().toISOString(),
    };
    if (patch.status === 'HIRED') {
      next.enabled = false;
      next.status = 'HIRED';
    } else if (typeof patch.enabled === 'boolean') {
      next.status = patch.enabled ? 'ACTIVE' : 'PAUSED';
    }
    await this.saveAutopilotToUser(userUid, next);
    return next;
  }

  private isUserHiredOnPlatform(userUid: string, email?: string): boolean {
    const state = platformStore.getState();
    const hasActivePlacement = (state.placements || []).some(
      (p) => !p.endDate && p.customerId === userUid,
    );
    const hasHiredApplication = (state.applications || []).some(
      (a) =>
        a.status === 'HIRED' &&
        (a.userUid === userUid ||
          a.customerId === userUid ||
          (email && a.candidateEmail?.toLowerCase() === email.toLowerCase())),
    );
    return hasActivePlacement || hasHiredApplication;
  }

  /**
   * Runs one morning Autopilot batch (up to 10 unique jobs @ $0.10 each) for a single user.
   */
  public async runMorningAutopilotForUser(
    userUid: string,
    forceNow = false,
  ): Promise<{
    ran: boolean;
    submittedCount: number;
    chargedCents: number;
    remainingBalanceCents?: number;
    reason?: string;
    config: UserAutopilotConfig;
  }> {
    if (this.activeUserRuns.has(userUid)) {
      const cfg = await this.getAutopilotConfig(userUid);
      return { ran: false, submittedCount: 0, chargedCents: 0, reason: 'Already running', config: cfg };
    }

    this.activeUserRuns.add(userUid);
    try {
      await platformStore.syncFromFirebase();
      const user = await this.fetchUserDoc(userUid);
      const config = await this.getAutopilotConfig(userUid);
      if (!user) {
        return { ran: false, submittedCount: 0, chargedCents: 0, reason: 'User not found', config };
      }

      const email = String(user.email || '').trim();
      const fullName = String(user.displayName || user.fullName || 'Applicant').trim();
      const phone = String(user.phone || '').trim();

      if (this.isUserHiredOnPlatform(userUid, email) || config.status === 'HIRED') {
        config.enabled = false;
        config.status = 'HIRED';
        await this.saveAutopilotToUser(userUid, config);
        return { ran: false, submittedCount: 0, chargedCents: 0, reason: 'User already hired', config };
      }

      if (!forceNow && (!config.enabled || config.status !== 'ACTIVE')) {
        return { ran: false, submittedCount: 0, chargedCents: 0, reason: 'Autopilot not active', config };
      }

      const today = todayYmd();
      if (!forceNow && config.lastRunDate === today) {
        return { ran: false, submittedCount: 0, chargedCents: 0, reason: 'Already ran today', config };
      }

      const balanceCents =
        typeof user.creditBalanceCents === 'number' ? user.creditBalanceCents : 0;
      const affordableCount = Math.floor(balanceCents / AUTOPILOT_COST_PER_SUBMISSION_CENTS);
      if (affordableCount <= 0) {
        config.status = 'LOW_BALANCE';
        await this.saveAutopilotToUser(userUid, config);
        return {
          ran: false,
          submittedCount: 0,
          chargedCents: 0,
          remainingBalanceCents: balanceCents,
          reason: 'Insufficient balance ($0.00)',
          config,
        };
      }

      const dailyTarget = Math.min(config.dailyLimit || AUTOPILOT_DEFAULT_DAILY_LIMIT, affordableCount);
      const jobPrereq = Array.isArray(user.prerequisites)
        ? user.prerequisites.find((p: any) => p?.type === 'JOB_AGENT')
        : undefined;
      const targetRole = String(jobPrereq?.targetRole || user.targetRole || 'Software Developer').trim();
      const targetCountry = String(jobPrereq?.location || user.location || 'South Africa').trim();
      const notes = String(jobPrereq?.notes || '').trim();

      // Register userUid, real contact, EMAIL_ONLY mode, and strict duplicate-email exclusions
      autonomousWorkerService.registerSessionUserUid(userUid, userUid);
      autonomousWorkerService.registerSessionSubmissionMode(userUid, 'EMAIL_ONLY');
      autonomousWorkerService.registerSessionRealContact(userUid, { email, phone });
      autonomousWorkerService.registerSessionExclusions(userUid, {
        emails: config.appliedEmails,
        companies: config.appliedCompanies,
      });

      const promptLines = [
        'Approved. Please submit the applications now.',
        `Candidate Name: ${fullName}`,
        `Target Job Role: ${targetRole}`,
        `Target Country: ${targetCountry}`,
        notes ? `Additional Notes: ${notes}` : '',
      ].filter(Boolean);

      const report = await autonomousWorkerService.executeAutonomousTask({
        customerId: userUid,
        agentType: AgentType.JOB_AGENT,
        userMessage: promptLines.join('\n'),
        conversationHistory: [],
        customerName: fullName,
        customerEmail: email || undefined,
        targetCountry,
        maxSubmissions: dailyTarget,
      });

      autonomousWorkerService.clearSessionExclusions(userUid);

      const delivered = (report.submittedApplications || []).filter(
        (s) => s.smtpStatus === 'SENT' || s.status === 'EMAIL_SENT' || s.status === 'FORM_FILLED_AND_EMAILED',
      );

      let remainingBalanceCents = balanceCents;
      const chargedCents = delivered.length * AUTOPILOT_COST_PER_SUBMISSION_CENTS;
      if (delivered.length > 0 && this.repository) {
        const walletRes = await this.repository.deductSubmissionCredits(
          userUid,
          AgentType.JOB_AGENT,
          delivered.length,
          AUTOPILOT_COST_PER_SUBMISSION_CENTS,
          userUid,
        );
        remainingBalanceCents = walletRes.remainingBalanceCents;
      }

      // Persist each autopilot submission into Firestore `nexora_submissions`
      const nowIso = new Date().toISOString();
      for (const sub of delivered) {
        if (sub.contactEmail) config.appliedEmails.push(sub.contactEmail.toLowerCase());
        if (sub.targetName) config.appliedCompanies.push(sub.targetName);

        const docId = `autopilot-${sub.receiptId.toLowerCase()}`;
        await fetch(
          `${FIRESTORE_BASE}/nexora_submissions/${encodeURIComponent(docId)}?key=${FIREBASE_API_KEY}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: {
                id: { stringValue: docId },
                userId: { stringValue: userUid },
                userUid: { stringValue: userUid },
                agentType: { stringValue: 'JOB_AGENT' },
                source: { stringValue: 'AUTOPILOT' },
                receiptId: { stringValue: sub.receiptId },
                targetName: { stringValue: sub.targetName },
                contactEmail: { stringValue: sub.contactEmail || '' },
                deliveredToEmail: { stringValue: sub.deliveredToEmail || '' },
                portalUrl: { stringValue: sub.portalUrl || '' },
                status: { stringValue: sub.status || 'EMAIL_SENT' },
                costCents: { integerValue: String(AUTOPILOT_COST_PER_SUBMISSION_CENTS) },
                submittedAt: { stringValue: sub.submittedAt || nowIso },
                createdAt: { stringValue: nowIso },
              },
            }),
            signal: AbortSignal.timeout(5000),
          },
        ).catch(() => undefined);
      }

      config.lastRunDate = today;
      config.lastRunSubmittedCount = delivered.length;
      config.totalSubmitted = (config.totalSubmitted || 0) + delivered.length;
      if (remainingBalanceCents < AUTOPILOT_COST_PER_SUBMISSION_CENTS) {
        config.status = 'LOW_BALANCE';
      }
      await this.saveAutopilotToUser(userUid, config);

      logger.info(
        { userUid, deliveredCount: delivered.length, chargedCents, remainingBalanceCents },
        'Morning Autopilot run completed for user',
      );

      return {
        ran: true,
        submittedCount: delivered.length,
        chargedCents,
        remainingBalanceCents,
        config,
      };
    } finally {
      this.activeUserRuns.delete(userUid);
    }
  }

  public async runMorningAutopilotSweep(): Promise<{ usersProcessed: number; totalSubmitted: number }> {
    const users = await platformStore.fetchFirestoreCollection('users');
    let usersProcessed = 0;
    let totalSubmitted = 0;
    const today = todayYmd();

    for (const user of users) {
      const uid = String(user.id || '');
      const ap = user.autopilot;
      if (!uid || !ap?.enabled || ap.status !== 'ACTIVE' || ap.lastRunDate === today) continue;
      usersProcessed += 1;
      const res = await this.runMorningAutopilotForUser(uid, false);
      totalSubmitted += res.submittedCount;
    }

    return { usersProcessed, totalSubmitted };
  }

  /**
   * Free Auto Follow-Up Sweep:
   * Finds all submitted applications >= 4 days old with NO company reply in IMAP
   * and NO previous follow-up, then sends ONE polite follow-up email for FREE ($0.00).
   */
  public async runFreeFollowUpSweep(): Promise<{ checked: number; followUpsSent: number }> {
    const submissions = await platformStore.fetchFirestoreCollection('nexora_submissions');
    const cutoffMs = Date.now() - FREE_FOLLOWUP_DELAY_DAYS * 24 * 60 * 60 * 1000;

    const eligible = submissions.filter((s) => {
      if (s.followUpSentAt) return false;
      if (!s.receiptId || !s.contactEmail || !String(s.contactEmail).includes('@')) return false;
      const ts = new Date(s.submittedAt || s.createdAt || 0).getTime();
      return ts > 0 && ts <= cutoffMs;
    });

    if (eligible.length === 0) {
      return { checked: submissions.length, followUpsSent: 0 };
    }

    // Check IMAP replies so we NEVER follow up on a company that already replied!
    const imapData = await imapMonitorService
      .fetchRepliesAndInterviews({
        submissions: eligible.map((s) => ({
          receiptId: String(s.receiptId),
          targetName: String(s.targetName || 'Hiring Team'),
          contactEmail: String(s.contactEmail),
          deliveredToEmail: s.deliveredToEmail ? String(s.deliveredToEmail) : undefined,
        })),
        lookbackDays: 30,
        limit: 50,
      })
      .catch(() => ({ replies: [] as any[] }));

    const repliedReceiptIds = new Set(
      (imapData.replies || [])
        .map((r: any) => String(r.receiptId || '').toUpperCase())
        .filter(Boolean),
    );

    let followUpsSent = 0;
    for (const sub of eligible.slice(0, 15)) {
      const refUpper = String(sub.receiptId).toUpperCase();
      if (repliedReceiptIds.has(refUpper)) continue;

      try {
        const companyName = String(sub.targetName || 'Hiring Team');
        await imapMonitorService.sendSubmissionFollowUp({
          receiptId: refUpper,
          to: String(sub.contactEmail),
          subject: `Follow-Up: Application ${refUpper} — ${companyName}`,
          message: [
            `Hello ${companyName} Team,`,
            '',
            `I hope you are well. I am writing to kindly follow up on my recent application (Ref: ${refUpper}) submitted a few days ago.`,
            '',
            `I remain very enthusiastic about the opportunity and would be glad to share any additional details or schedule a brief call at your convenience.`,
            '',
            `Thank you for your time and consideration.`,
          ].join('\n'),
          companyName,
        });

        const nowIso = new Date().toISOString();
        await fetch(
          `${FIRESTORE_BASE}/nexora_submissions/${encodeURIComponent(String(sub.id))}?updateMask.fieldPaths=followUpSentAt&key=${FIREBASE_API_KEY}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: { followUpSentAt: { stringValue: nowIso } },
            }),
            signal: AbortSignal.timeout(5000),
          },
        ).catch(() => undefined);

        followUpsSent += 1;
      } catch (err) {
        logger.warn({ err, receiptId: sub.receiptId }, 'Free auto follow-up email failed');
      }
    }

    logger.info({ checked: eligible.length, followUpsSent }, 'Completed free 4-day auto follow-up sweep');
    return { checked: eligible.length, followUpsSent };
  }

  /**
   * Event-Driven Instant Matching:
   * Triggered the instant a Nexora-registered company publishes a new vacancy.
   * Matches all active candidates in Firestore:
   * - Autopilot ON + balance >= $0.10 -> auto-applies immediately ($0.10) with zero duplicate emails
   * - Autopilot OFF or $0 balance -> sends instant match notification so they can apply in 1 click
   */
  public async onNewNexoraVacancyPublished(vacancy: VacancyRecord): Promise<{
    matchedCandidates: number;
    autoAppliedCount: number;
    notifiedCount: number;
  }> {
    if (vacancy.status !== 'PUBLISHED') {
      return { matchedCandidates: 0, autoAppliedCount: 0, notifiedCount: 0 };
    }

    try {
      const users = await platformStore.fetchFirestoreCollection('users');
      const pState = platformStore.getState();
      const org = pState.organisations.find((o) => o.id === vacancy.organisationId);
      if (!org) return { matchedCandidates: 0, autoAppliedCount: 0, notifiedCount: 0 };

      const vacText = `${vacancy.title} ${vacancy.description} ${(vacancy.requiredSkills || []).join(' ')}`.toLowerCase();
      const reqSkills = (vacancy.requiredSkills || []).map((s) => s.toLowerCase());

      let matchedCandidates = 0;
      let autoAppliedCount = 0;
      let notifiedCount = 0;

      for (const user of users) {
        const uid = String(user.id || '');
        const email = String(user.email || '').trim();
        if (!uid || !email) continue;
        if (this.isUserHiredOnPlatform(uid, email)) continue;

        const alreadyApplied = pState.applications.some(
          (a) =>
            a.vacancyId === vacancy.id &&
            (a.userUid === uid || a.candidateEmail.toLowerCase() === email.toLowerCase()),
        );
        if (alreadyApplied) continue;

        const jobPrereq = Array.isArray(user.prerequisites)
          ? user.prerequisites.find((p: any) => p?.type === 'JOB_AGENT')
          : undefined;
        const cvDoc = pState.supportingDocuments.find(
          (d) => d.userUid === uid && d.docType === 'CV',
        );
        if (!jobPrereq && !cvDoc) continue;

        const candidateHay = `${jobPrereq?.targetRole || ''} ${jobPrereq?.notes || ''} ${user.targetRole || ''}`.toLowerCase();
        const roleTokens = candidateHay
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length >= 3 && !['senior', 'junior', 'lead', 'developer', 'engineer', 'the', 'and', 'for'].includes(t));

        let score = 45;
        for (const tok of roleTokens) {
          if (vacText.includes(tok)) score += 15;
        }
        for (const sk of reqSkills) {
          if (candidateHay.includes(sk)) score += 12;
        }
        score = Math.min(98, score);
        if (score < 70) continue;

        matchedCandidates += 1;
        const ap = user.autopilot;
        const balanceCents = typeof user.creditBalanceCents === 'number' ? user.creditBalanceCents : 0;
        const companyEmail = (org.recruitmentEmail || org.businessEmail || '').toLowerCase();
        const appliedEmails: string[] = Array.isArray(ap?.appliedEmails) ? ap.appliedEmails : [];
        const canAutoApply =
          Boolean(ap?.enabled) &&
          ap?.status === 'ACTIVE' &&
          balanceCents >= AUTOPILOT_COST_PER_SUBMISSION_CENTS &&
          (!companyEmail || !appliedEmails.includes(companyEmail));

        const nowIso = new Date().toISOString();

        if (canAutoApply) {
          const receiptId = `SUB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
          const candidateName = String(user.displayName || user.fullName || email.split('@')[0]);
          const matchedTranscript = pState.transcripts.find(
            (t) => t.userUid === uid || t.candidateEmail?.toLowerCase() === email.toLowerCase(),
          );
          if ((vacancy.requiresAssessment || org.requireTranscript) && !matchedTranscript) {
            continue;
          }

          pState.applications.unshift({
            id: `app-${crypto.randomUUID().slice(0, 10)}`,
            referenceCode: receiptId,
            vacancyId: vacancy.id,
            vacancyTitle: vacancy.title,
            organisationId: vacancy.organisationId,
            organisationName: vacancy.organisationName,
            customerId: uid,
            userUid: uid,
            candidateName,
            candidateEmail: email,
            candidatePhone: String(user.phone || ''),
            cvFileName: cvDoc?.fileName,
            cvDownloadUrl: cvDoc?.downloadUrl,
            transcriptId: matchedTranscript?.id,
            transcriptScore: matchedTranscript?.percentageScore,
            transcriptPdfUrl: matchedTranscript?.pdfDownloadUrl,
            skills: vacancy.requiredSkills || [],
            coverNote:
              jobPrereq?.notes ||
              `Instant Autopilot match (${score}% fit) submitted via Nexora AI for ${vacancy.title}.`,
            consentToShare: true,
            status: 'RECEIVED',
            aiMatchScore: score,
            aiMatchSummary: `Instant Autopilot Match (${score}% fit) on newly published Nexora vacancy.`,
            communications: [],
            appliedAt: nowIso,
            updatedAt: nowIso,
          });

          pState.notifications.unshift({
            id: `ntf-${crypto.randomUUID().slice(0, 10)}`,
            organisationId: vacancy.organisationId,
            type: 'APPLICATION_RECEIVED',
            title: `Instant Autopilot Match: ${vacancy.title}`,
            message: `${candidateName} (${score}% match) was automatically matched and applied (${receiptId}).`,
            actionUrl: '/company/applications',
            isRead: false,
            createdAt: nowIso,
          });

          pState.notifications.unshift({
            id: `ntf-${crypto.randomUUID().slice(0, 10)}`,
            userUid: uid,
            type: 'SYSTEM',
            title: `Autopilot Applied (${score}% Match): ${vacancy.title}`,
            message: `Nexora Autopilot instantly submitted your CV to ${vacancy.organisationName} ($0.10 • Ref ${receiptId}).`,
            actionUrl: '/app',
            isRead: false,
            createdAt: nowIso,
          });

          if (this.repository) {
            await this.repository.deductSubmissionCredits(
              uid,
              AgentType.JOB_AGENT,
              1,
              AUTOPILOT_COST_PER_SUBMISSION_CENTS,
              uid,
            );
          }

          const updatedConfig = await this.getAutopilotConfig(uid);
          if (companyEmail) updatedConfig.appliedEmails.push(companyEmail);
          updatedConfig.appliedCompanies.push(vacancy.organisationName);
          updatedConfig.totalSubmitted += 1;
          await this.saveAutopilotToUser(uid, updatedConfig);

          autoAppliedCount += 1;
        } else {
          pState.notifications.unshift({
            id: `ntf-${crypto.randomUUID().slice(0, 10)}`,
            userUid: uid,
            type: 'SYSTEM',
            title: `New ${score}% Match: ${vacancy.title}`,
            message: `${vacancy.organisationName} just published "${vacancy.title}" — open Nexora to apply or enable Autopilot ($0.10/job).`,
            actionUrl: `/opportunity/${vacancy.id}`,
            isRead: false,
            createdAt: nowIso,
          });
          notifiedCount += 1;
        }
      }

      if (autoAppliedCount > 0 || notifiedCount > 0) {
        platformStore.save();
      }

      logger.info(
        { vacancyId: vacancy.id, matchedCandidates, autoAppliedCount, notifiedCount },
        'Event-driven instant matching completed for new Nexora vacancy',
      );
      return { matchedCandidates, autoAppliedCount, notifiedCount };
    } catch (err) {
      logger.warn({ err, vacancyId: vacancy.id }, 'Event-driven instant matching failed');
      return { matchedCandidates: 0, autoAppliedCount: 0, notifiedCount: 0 };
    }
  }
}

export const autopilotService = new AutopilotService();
