import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import pdfParse from 'pdf-parse';
import { logger } from '../../utils/logger';
import { sendMail } from '../../tools/email.service';
import { autopilotService } from '../../tools/autopilot.service';
import { documentGeneratorService } from '../../tools/document-generator.service';
import { paystackService } from '../../tools/paystack.service';
import { uploadToFirebaseStorage } from '../../tools/firebase-storage.service';
import { OpenClawService } from '../../openclaw/openclaw.service';
import {
  ApplicationStatusType,
  DocumentAccessLogRecord,
  INTERVIEW_PROVIDER_RATES_USD,
  InterviewProviderType,
  InterviewRecord,
  InterviewRecordingRecord,
  MonthlyInvoiceRecord,
  NotificationRecord,
  OrganisationCategoryType,
  OrganisationRecord,
  OrganisationUserRecord,
  PlacementRecord,
  platformStore,
  VacancyApplicationRecord,
  VacancyRecord,
} from './platform.store';

function addDaysIso(dateIso: string, days: number): string {
  const base = dateIso ? new Date(dateIso) : new Date();
  const d = Number.isNaN(base.getTime()) ? new Date() : base;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export class PlatformService {
  constructor(private readonly openclawService?: OpenClawService) {}

  public getOrganisationCapabilities(category: OrganisationCategoryType) {
    const isRecruitment = ['HIRING_COMPANY', 'RECRUITMENT_AGENCY', 'STAFFING_COMPANY'].includes(category);
    const isStaffing = category === 'STAFFING_COMPANY';
    const isRelocation = ['RELOCATION_AGENCY', 'IMMIGRATION_CONSULTANCY'].includes(category);
    const isScholarship = ['SCHOLARSHIP_PROVIDER', 'EDUCATIONAL_INSTITUTION'].includes(category);
    const isInvestment = category === 'INVESTMENT_PROVIDER';

    return {
      canPublishVacancies: isRecruitment || isRelocation || isScholarship || isInvestment,
      canScheduleInterviews: isRecruitment || isRelocation || isScholarship,
      canManageStaffing: isStaffing || category === 'HIRING_COMPANY',
      allowedVacancyCategories: isInvestment
        ? ['INVESTMENT']
        : isRelocation
          ? ['RELOCATION']
          : isScholarship
            ? ['SCHOLARSHIP']
            : ['EMPLOYMENT'],
    };
  }

  public async registerOrganisation(input: {
    registeredName: string;
    tradingName?: string;
    registrationNumber?: string;
    country: string;
    businessAddress: string;
    website?: string;
    description: string;
    category: OrganisationCategoryType;
    contactFullName: string;
    contactPosition: string;
    businessEmail: string;
    password: string;
    telephone: string;
    generalEmail?: string;
    recruitmentEmail: string;
    interviewEmail?: string;
    billingEmail?: string;
    additionalRecipients?: string[];
    verificationDocs?: Array<{ fileName: string; url?: string }>;
  }): Promise<{ organisation: Omit<OrganisationRecord, 'passwordHash'>; verificationToken: string; requiresEmailVerification: boolean }> {
    const state = platformStore.getState();
    const emailNorm = input.businessEmail.trim().toLowerCase();
    if (state.organisations.some((o) => o.businessEmail === emailNorm)) {
      throw new Error('An organisation with this business email is already registered');
    }

    const rawWebsite = (input.website || '').trim();
    if (!rawWebsite) {
      throw new Error('Company website URL is required for registration');
    }
    let websiteHost = '';
    try {
      const normalizedUrl = /^https?:\/\//i.test(rawWebsite) ? rawWebsite : `https://${rawWebsite}`;
      websiteHost = new URL(normalizedUrl).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
      throw new Error('Please enter a valid company website URL (e.g. https://yourcompany.com)');
    }
    const emailDomain = (emailNorm.split('@')[1] || '').toLowerCase();
    if (
      !websiteHost ||
      !emailDomain ||
      (emailDomain !== websiteHost &&
        !emailDomain.endsWith(`.${websiteHost}`) &&
        !websiteHost.endsWith(`.${emailDomain}`))
    ) {
      throw new Error(
        `Work email domain (@${emailDomain}) must match your company website domain (${websiteHost}).`,
      );
    }

    const now = new Date().toISOString();
    const verificationToken = String(crypto.randomInt(100000, 999999));
    const org: OrganisationRecord = {
      id: `org-${crypto.randomUUID().slice(0, 10)}`,
      registeredName: input.registeredName.trim(),
      tradingName: input.tradingName?.trim(),
      registrationNumber: input.registrationNumber?.trim(),
      country: input.country.trim(),
      businessAddress: input.businessAddress.trim(),
      website: /^https?:\/\//i.test(rawWebsite) ? rawWebsite : `https://${rawWebsite}`,
      description: input.description.trim(),
      category: input.category,
      contactFullName: input.contactFullName.trim(),
      contactPosition: input.contactPosition.trim(),
      businessEmail: emailNorm,
      passwordHash: platformStore.hashPassword(input.password),
      telephone: input.telephone.trim(),
      generalEmail: input.generalEmail?.trim() || emailNorm,
      recruitmentEmail: input.recruitmentEmail.trim().toLowerCase(),
      interviewEmail: input.interviewEmail?.trim().toLowerCase() || input.recruitmentEmail.trim().toLowerCase(),
      billingEmail: input.billingEmail?.trim().toLowerCase() || emailNorm,
      additionalRecipients: input.additionalRecipients ?? [],
      emailVerified: false,
      verificationToken,
      verificationDocs: input.verificationDocs ?? [],
      status: 'PENDING_APPROVAL',
      createdAt: now,
      updatedAt: now,
    };

    state.organisations.push(org);
    platformStore.save();

    // Send 6-digit verification code to businessEmail
    try {
      await sendMail({
        to: org.businessEmail,
        subject: `Nexora AI Verification Code: ${verificationToken} — ${org.registeredName}`,
        html: `<div style="font-family:Montserrat,Arial,sans-serif;padding:24px;max-width:560px;"><h2>Verify Your Nexora AI Company Account</h2><p>Hello ${org.contactFullName},</p><p>Your 6-digit email verification code for <strong>${org.registeredName}</strong> (${websiteHost}) is:</p><div style="font-size:28px;font-weight:800;letter-spacing:6px;padding:14px 20px;background:#0f172a;color:#6ee7b7;border-radius:10px;display:inline-block;margin:12px 0;">${verificationToken}</div><p>Enter this code on the Nexora AI Company Portal to activate your account.</p></div>`,
      });
    } catch {
      // non-fatal if SMTP unavailable
    }

    const { passwordHash: _pw, ...safeOrg } = org;
    return { organisation: safeOrg, verificationToken, requiresEmailVerification: true };
  }

  public loginOrganisation(email: string, password: string): {
    organisation: Omit<OrganisationRecord, 'passwordHash'>;
    activeUser?: Omit<OrganisationUserRecord, 'passwordHash'>;
    capabilities: ReturnType<PlatformService['getOrganisationCapabilities']>;
  } {
    const state = platformStore.getState();
    const cleanEmail = email.trim().toLowerCase();
    const pwHash = platformStore.hashPassword(password);

    const org = state.organisations.find((o) => o.businessEmail === cleanEmail);
    if (org && org.passwordHash === pwHash) {
      const { passwordHash: _pw, ...safeOrg } = org;
      return {
        organisation: safeOrg,
        capabilities: this.getOrganisationCapabilities(org.category),
      };
    }

    const teamUser = state.organisationUsers.find(
      (u) => u.email === cleanEmail && u.passwordHash === pwHash,
    );
    if (teamUser) {
      if (teamUser.status === 'DISABLED') {
        throw new Error('Your team user account has been disabled by your administrator.');
      }
      const parentOrg = state.organisations.find((o) => o.id === teamUser.organisationId);
      if (parentOrg) {
        const { passwordHash: _pw, ...safeOrg } = parentOrg;
        const { passwordHash: _upw, ...safeUser } = teamUser;
        return {
          organisation: safeOrg,
          activeUser: safeUser,
          capabilities: this.getOrganisationCapabilities(parentOrg.category),
        };
      }
    }

    throw new Error('Invalid organisation email or password');
  }

  public verifyAndApproveOrganisation(organisationId: string, token?: string): Omit<OrganisationRecord, 'passwordHash'> {
    const state = platformStore.getState();
    const org = state.organisations.find((o) => o.id === organisationId);
    if (!org) throw new Error('Organisation not found');
    const cleanToken = (token || '').trim();
    if (!cleanToken) {
      throw new Error('Verification code is required');
    }
    if (org.verificationToken && cleanToken !== org.verificationToken) {
      throw new Error('Invalid verification code. Please check the 6-digit code sent to your email.');
    }
    org.emailVerified = true;
    org.status = 'VERIFIED';
    org.updatedAt = new Date().toISOString();
    platformStore.save();
    const { passwordHash: _pw, ...safeOrg } = org;
    return safeOrg;
  }

  public async resendOrganisationVerificationCode(organisationId: string): Promise<{ sent: boolean; email: string }> {
    const state = platformStore.getState();
    const org = state.organisations.find((o) => o.id === organisationId);
    if (!org) throw new Error('Organisation not found');
    const code = String(crypto.randomInt(100000, 999999));
    org.verificationToken = code;
    org.updatedAt = new Date().toISOString();
    platformStore.save();
    await sendMail({
      to: org.businessEmail,
      subject: `Nexora AI Verification Code: ${code} — ${org.registeredName}`,
      html: `<div style="font-family:Montserrat,Arial,sans-serif;padding:24px;max-width:560px;"><h2>Your New Verification Code</h2><p>Hello ${org.contactFullName},</p><p>Your 6-digit verification code for <strong>${org.registeredName}</strong> is:</p><div style="font-size:28px;font-weight:800;letter-spacing:6px;padding:14px 20px;background:#0f172a;color:#6ee7b7;border-radius:10px;display:inline-block;margin:12px 0;">${code}</div></div>`,
    }).catch(() => undefined);
    return { sent: true, email: org.businessEmail };
  }

  public getOrganisationById(organisationId: string): Omit<OrganisationRecord, 'passwordHash'> | null {
    const org = platformStore.getState().organisations.find((o) => o.id === organisationId);
    if (!org) return null;
    const { passwordHash: _pw, ...safeOrg } = org;
    return safeOrg;
  }

  public updateOrganisationSettings(
    organisationId: string,
    updates: Partial<
      Pick<
        OrganisationRecord,
        | 'tradingName'
        | 'website'
        | 'description'
        | 'businessAddress'
        | 'telephone'
        | 'generalEmail'
        | 'recruitmentEmail'
        | 'interviewEmail'
        | 'billingEmail'
        | 'additionalRecipients'
      >
    >,
  ): Omit<OrganisationRecord, 'passwordHash'> {
    const state = platformStore.getState();
    const org = state.organisations.find((o) => o.id === organisationId);
    if (!org) throw new Error('Organisation not found');
    Object.assign(org, updates, { updatedAt: new Date().toISOString() });
    platformStore.save();
    const { passwordHash: _pw, ...safeOrg } = org;
    return safeOrg;
  }

  public getDashboardStats(organisationId: string) {
    const state = platformStore.getState();
    const vacancies = state.vacancies.filter((v) => v.organisationId === organisationId);
    const apps = state.applications.filter((a) => a.organisationId === organisationId);
    const interviews = state.interviews.filter((i) => i.organisationId === organisationId);

    return {
      totalVacancies: vacancies.length,
      activeVacancies: vacancies.filter((v) => v.status === 'PUBLISHED').length,
      closedVacancies: vacancies.filter((v) => v.status === 'CLOSED').length,
      totalApplications: apps.length,
      newApplications: apps.filter((a) => a.status === 'RECEIVED').length,
      candidatesShortlisted: apps.filter((a) => a.status === 'SHORTLISTED').length,
      interviewsScheduled: interviews.filter((i) => i.status === 'SCHEDULED' || i.status === 'RESCHEDULED').length,
      offersMade: apps.filter((a) => a.status === 'OFFER_MADE').length,
      successfulHires: apps.filter((a) => a.status === 'HIRED').length,
    };
  }

  public createVacancy(
    organisationId: string,
    input: Omit<
      VacancyRecord,
      'id' | 'organisationId' | 'organisationName' | 'organisationCategory' | 'createdAt' | 'updatedAt'
    >,
  ): VacancyRecord {
    const state = platformStore.getState();
    const org = state.organisations.find((o) => o.id === organisationId);
    if (!org) throw new Error('Organisation not found');

    const caps = this.getOrganisationCapabilities(org.category);
    if (!caps.allowedVacancyCategories.includes(input.category)) {
      throw new Error(`Your organisation category (${org.category}) cannot publish ${input.category} opportunities.`);
    }

    const now = new Date().toISOString();
    const vacancy: VacancyRecord = {
      ...input,
      nexoraFeePercent: 10,
      id: `vac-${crypto.randomUUID().slice(0, 10)}`,
      organisationId: org.id,
      organisationName: org.tradingName || org.registeredName,
      organisationCategory: org.category,
      createdAt: now,
      updatedAt: now,
    };
    state.vacancies.unshift(vacancy);
    platformStore.save();
    if (vacancy.status === 'PUBLISHED' && process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      void autopilotService.onNewNexoraVacancyPublished(vacancy);
    }
    return vacancy;
  }

  public updateVacancy(
    organisationId: string,
    vacancyId: string,
    updates: Partial<VacancyRecord>,
  ): VacancyRecord {
    const state = platformStore.getState();
    const vac = state.vacancies.find((v) => v.id === vacancyId && v.organisationId === organisationId);
    if (!vac) throw new Error('Vacancy not found or access denied');
    Object.assign(vac, updates, { updatedAt: new Date().toISOString() });
    platformStore.save();
    return vac;
  }

  public deleteVacancies(organisationId: string, vacancyIds: string[]): number {
    const state = platformStore.getState();
    const idSet = new Set(vacancyIds);
    const before = state.vacancies.length;
    state.vacancies = state.vacancies.filter(
      (v) => !(v.organisationId === organisationId && idSet.has(v.id)),
    );
    const removed = before - state.vacancies.length;
    if (removed > 0) {
      platformStore.save();
    }
    return removed;
  }

  public listVacancies(filter?: { organisationId?: string; status?: string; category?: string }): VacancyRecord[] {
    const state = platformStore.getState();
    return state.vacancies.filter((v) => {
      if (filter?.organisationId && v.organisationId !== filter.organisationId) return false;
      if (filter?.status && v.status !== filter.status) return false;
      if (filter?.category && v.category !== filter.category) return false;
      return true;
    });
  }

  public async applyToVacancy(input: {
    vacancyId: string;
    customerId: string;
    userUid: string;
    candidateName: string;
    candidateEmail: string;
    candidatePhone?: string;
    cvFileName?: string;
    cvDownloadUrl?: string;
    transcriptId?: string;
    qualifications?: string;
    workExperience?: string;
    skills?: string[];
    coverNote?: string;
    consentToShare: boolean;
  }): Promise<VacancyApplicationRecord> {
    const state = platformStore.getState();
    const vac = state.vacancies.find((v) => v.id === input.vacancyId && v.status === 'PUBLISHED');
    if (!vac) throw new Error('Vacancy is not published or no longer available');

    const org = state.organisations.find((o) => o.id === vac.organisationId);
    if (!org) throw new Error('Organisation not found');

    const transcript = input.transcriptId
      ? state.transcripts.find((t) => t.id === input.transcriptId && t.userUid === input.userUid)
      : state.transcripts.find((t) => t.userUid === input.userUid);

    if ((vac.requiresAssessment || org.requireTranscript) && !transcript) {
      throw new Error(
        `This vacancy (${vac.title}) requires a verified Nexora Assessment Transcript. Please complete an Assignment first.`,
      );
    }

    const now = new Date().toISOString();
    const referenceCode = `APP-${Math.floor(100000 + Math.random() * 900000)}`;

    const app: VacancyApplicationRecord = {
      id: `app-${crypto.randomUUID().slice(0, 10)}`,
      referenceCode,
      vacancyId: vac.id,
      vacancyTitle: vac.title,
      organisationId: org.id,
      organisationName: org.tradingName || org.registeredName,
      customerId: input.customerId,
      userUid: input.userUid,
      candidateName: input.candidateName,
      candidateEmail: input.candidateEmail,
      candidatePhone: input.candidatePhone,
      cvFileName: input.cvFileName,
      cvDownloadUrl: input.cvDownloadUrl,
      transcriptId: input.consentToShare ? transcript?.id : undefined,
      transcriptScore: input.consentToShare ? transcript?.percentageScore : undefined,
      transcriptPdfUrl: input.consentToShare ? transcript?.pdfDownloadUrl : undefined,
      qualifications: input.qualifications,
      workExperience: input.workExperience,
      skills: input.skills ?? [],
      coverNote: input.coverNote,
      consentToShare: input.consentToShare,
      status: 'RECEIVED',
      communications: [],
      appliedAt: now,
      updatedAt: now,
    };

    await this.scoreApplicationInternal(app, vac);

    state.applications.unshift(app);

    state.notifications.unshift(
      {
        id: `ntf-${crypto.randomUUID().slice(0, 8)}`,
        organisationId: org.id,
        type: 'NEW_APPLICATION',
        title: `New Application: ${vac.title}`,
        message: `${input.candidateName} applied (${referenceCode})${app.transcriptScore !== undefined ? ` • Assessment: ${app.transcriptScore}%` : ''}.`,
        actionUrl: '/company/applications',
        isRead: false,
        createdAt: now,
      },
      {
        id: `ntf-${crypto.randomUUID().slice(0, 8)}`,
        customerId: input.customerId,
        userUid: input.userUid,
        type: 'APPLICATION_SUBMITTED',
        title: `Application Submitted: ${vac.title}`,
        message: `Your application (${referenceCode}) was sent to ${app.organisationName}.`,
        actionUrl: '/app',
        isRead: false,
        createdAt: now,
      },
    );

    platformStore.save();

    // Notify company's configured recruitment email + candidate confirmation (best effort)
    const recipients = [org.recruitmentEmail, ...(org.additionalRecipients || [])].filter(Boolean);
    for (const to of recipients) {
      sendMail({
        to,
        subject: `New Application (${referenceCode}): ${vac.title} — ${input.candidateName}`,
        html: `<div style="font-family:Montserrat,Arial,sans-serif;padding:20px;"><h2>New Candidate Application</h2><p><strong>Vacancy:</strong> ${vac.title}<br/><strong>Candidate:</strong> ${input.candidateName} (${input.candidateEmail})<br/><strong>Reference:</strong> ${referenceCode}${app.transcriptScore !== undefined ? `<br/><strong>Assessment Score:</strong> ${app.transcriptScore}%` : ''}</p><p>Review CV, assessment transcript, and pipeline status in your Nexora AI Company Dashboard.</p></div>`,
      }).catch(() => undefined);
    }

    sendMail({
      to: input.candidateEmail,
      subject: `Application Received (${referenceCode}): ${vac.title} at ${app.organisationName}`,
      html: `<div style="font-family:Montserrat,Arial,sans-serif;padding:20px;"><h2>Application Confirmed</h2><p>Hi ${input.candidateName}, your application for <strong>${vac.title}</strong> at <strong>${app.organisationName}</strong> has been received (Ref: <code>${referenceCode}</code>).</p></div>`,
    }).catch(() => undefined);

    return app;
  }

  public listApplicationsForOrganisation(
    organisationId: string,
    filter?: { status?: ApplicationStatusType; search?: string },
  ) {
    const state = platformStore.getState();
    let items = state.applications.filter((a) => a.organisationId === organisationId);
    if (filter?.status) {
      items = items.filter((a) => a.status === filter.status);
    }
    if (filter?.search) {
      const q = filter.search.toLowerCase();
      items = items.filter(
        (a) =>
          a.candidateName.toLowerCase().includes(q) ||
          a.vacancyTitle.toLowerCase().includes(q) ||
          a.skills.some((s) => s.toLowerCase().includes(q)),
      );
    }
    return items.map((a) => {
      const docs = state.supportingDocuments.filter((d) => d.userUid === a.userUid);
      const trs = state.transcripts.filter((t) => t.userUid === a.userUid);
      const vac = state.vacancies.find((v) => v.id === a.vacancyId);
      const reqDocs = vac?.requiredDocuments || [];
      const docBlob = [
        a.cvFileName || '',
        ...docs.map((d) => `${d.docType} ${d.label} ${d.fileName}`),
        ...trs.map((t) => `transcript ${t.assignmentTitle}`),
      ]
        .join(' ')
        .toLowerCase();

      const documentChecklist = reqDocs.map((reqItem) => {
        const words = reqItem
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((w) => w.length > 2 && w !== 'valid' && w !== 'months');
        const matched =
          words.some((w) => docBlob.includes(w)) ||
          (/cv|resume/i.test(reqItem) && Boolean(a.cvFileName || a.cvDownloadUrl)) ||
          (/transcript|assessment/i.test(reqItem) && (Boolean(a.transcriptId) || trs.length > 0));
        return { item: reqItem, met: matched };
      });

      return {
        ...a,
        documentChecklist,
        supportingDocuments: docs.map((d) => ({
          id: d.id,
          docType: d.docType,
          label: d.label,
          fileName: d.fileName,
          downloadUrl: d.downloadUrl,
        })),
        transcripts: trs.map((t) => ({
          id: t.id,
          assignmentTitle: t.assignmentTitle,
          percentageScore: t.percentageScore,
          pdfDownloadUrl: t.pdfDownloadUrl,
        })),
      };
    });
  }

  public updateApplication(
    organisationId: string,
    applicationId: string,
    updates: { status?: ApplicationStatusType; internalNotes?: string },
  ): VacancyApplicationRecord {
    const state = platformStore.getState();
    const app = state.applications.find((a) => a.id === applicationId && a.organisationId === organisationId);
    if (!app) throw new Error('Application not found or access denied');

    const prevStatus = app.status;
    if (updates.status === 'HIRED' && prevStatus !== 'HIRED') {
      const sameCandidate = (c: { customerId?: string; userUid?: string; candidateEmail?: string; candidateName?: string }) =>
        (app.customerId && c.customerId && c.customerId === app.customerId) ||
        (app.userUid && c.userUid && c.userUid === app.userUid) ||
        (app.candidateEmail && c.candidateEmail && c.candidateEmail.toLowerCase() === app.candidateEmail.toLowerCase()) ||
        c.candidateName?.trim().toLowerCase() === app.candidateName.trim().toLowerCase();

      const existingActivePlc = state.placements.find(
        (p) =>
          p.organisationId === organisationId &&
          p.onboardingStatus !== 'TERMINATED' &&
          p.onboardingStatus !== 'COMPLETED' &&
          sameCandidate(p),
      );
      const existingHiredApp = state.applications.find(
        (a) =>
          a.organisationId === organisationId &&
          a.id !== app.id &&
          a.status === 'HIRED' &&
          sameCandidate(a),
      );
      if (existingActivePlc || existingHiredApp) {
        const existingRole = existingActivePlc?.roleTitle || existingHiredApp?.vacancyTitle || 'another role';
        throw new Error(
          `${app.candidateName} is already hired as an active employee (${existingRole}). A candidate cannot hold two active jobs in the same company.`,
        );
      }
    }

    if (updates.status) app.status = updates.status;
    if (updates.internalNotes !== undefined) app.internalNotes = updates.internalNotes;
    app.updatedAt = new Date().toISOString();

    if (updates.status && updates.status !== prevStatus) {
      state.notifications.unshift({
        id: `ntf-${crypto.randomUUID().slice(0, 8)}`,
        customerId: app.customerId,
        userUid: app.userUid,
        type: 'APPLICATION_STATUS',
        title: `Application Update: ${app.vacancyTitle}`,
        message: `${app.organisationName} updated your application (${app.referenceCode}) to ${updates.status.replace(/_/g, ' ')}.`,
        actionUrl: '/app',
        isRead: false,
        createdAt: app.updatedAt,
      });

      if (updates.status === 'HIRED') {
        const vac = state.vacancies.find((v) => v.id === app.vacancyId);
        const org = state.organisations.find((o) => o.id === organisationId);
        const offerUsd = Number(vac?.monthlyOfferUsd || 0);
        const existingPlc = state.placements.find(
          (p) =>
            p.organisationId === organisationId &&
            p.onboardingStatus !== 'TERMINATED' &&
            p.onboardingStatus !== 'COMPLETED' &&
            ((app.customerId && p.customerId === app.customerId) ||
              p.candidateName.trim().toLowerCase() === app.candidateName.trim().toLowerCase()),
        );
        // Automatically close other open applications from this candidate at the same organisation
        for (const otherApp of state.applications) {
          if (
            otherApp.organisationId === organisationId &&
            otherApp.id !== app.id &&
            otherApp.status !== 'HIRED' &&
            otherApp.status !== 'REJECTED' &&
            otherApp.status !== 'WITHDRAWN' &&
            ((app.customerId && otherApp.customerId === app.customerId) ||
              (app.userUid && otherApp.userUid === app.userUid) ||
              otherApp.candidateEmail.toLowerCase() === app.candidateEmail.toLowerCase() ||
              otherApp.candidateName.trim().toLowerCase() === app.candidateName.trim().toLowerCase())
          ) {
            otherApp.status = 'WITHDRAWN';
            otherApp.internalNotes = `Automatically withdrawn — candidate was hired for ${app.vacancyTitle}.`;
            otherApp.updatedAt = app.updatedAt;
          }
        }
        let plc = existingPlc;
        if (!plc) {
          const startDate = app.updatedAt.slice(0, 10);
          plc = {
            id: `plc-${crypto.randomUUID().slice(0, 10)}`,
            organisationId,
            vacancyId: app.vacancyId,
            customerId: app.customerId,
            candidateName: app.candidateName,
            roleTitle: app.vacancyTitle,
            contractModel: 'DIRECT_PLACEMENT',
            startDate,
            nextBillingDate: addDaysIso(startDate, 28),
            monthlySalaryCents: Math.round(offerUsd * 100),
            currency: 'USD',
            legalEntityArranged: true,
            taxComplianceReady: true,
            onboardingStatus:
              org?.category === 'RELOCATION_AGENCY' || org?.category === 'IMMIGRATION_CONSULTANCY'
                ? 'DOCUMENTS_REVIEW'
                : org?.category === 'SCHOLARSHIP_PROVIDER' || org?.category === 'EDUCATIONAL_INSTITUTION'
                  ? 'SCHOLAR_AWARDED'
                  : org?.category === 'INVESTMENT_PROVIDER'
                    ? 'TERM_SHEET'
                    : 'ACTIVE',
            timesheets: [],
            payrollRecords: [],
            createdAt: app.updatedAt,
            updatedAt: app.updatedAt,
          };
          state.placements.unshift(plc);
        } else if (!plc.nextBillingDate) {
          plc.nextBillingDate = addDaysIso(plc.startDate, 28);
        }
        if (org && offerUsd > 0) {
          const billingMonth = app.updatedAt.slice(0, 7);
          const dueDate = plc.nextBillingDate || addDaysIso(plc.startDate, 28);
          void this.createOrGetMonthlyInvoice({
            org,
            placementId: plc.id,
            applicationId: app.id,
            vacancyId: app.vacancyId,
            vacancyTitle: app.vacancyTitle,
            category: vac?.category || 'EMPLOYMENT',
            candidateName: app.candidateName,
            candidateEmail: app.candidateEmail,
            billingMonth,
            dueDate,
            offerAmountUsd: offerUsd,
          });
        }
      } else if (updates.status === 'WITHDRAWN' || updates.status === 'REJECTED') {
        const candNameLower = app.candidateName.trim().toLowerCase();
        const matchesCandidate = (candidateName?: string, customerId?: string) =>
          (app.customerId && customerId && customerId === app.customerId) ||
          candidateName?.trim().toLowerCase() === candNameLower;

        // Remove any unpaid/pending invoices attached to this withdrawn/rejected application
        state.invoices = state.invoices.filter(
          (i) =>
            !(
              i.organisationId === organisationId &&
              i.status === 'PENDING' &&
              (i.applicationId === app.id ||
                (i.vacancyId === app.vacancyId && matchesCandidate(i.candidateName)))
            ),
        );

        // Remove any placement created from this withdrawn/rejected application
        state.placements = state.placements.filter(
          (p) =>
            !(
              p.organisationId === organisationId &&
              p.vacancyId === app.vacancyId &&
              matchesCandidate(p.candidateName, p.customerId)
            ),
        );
      }
    }

    platformStore.save();
    return app;
  }

  public async sendCompanyMessage(
    organisationId: string,
    applicationId: string,
    subject: string,
    body: string,
  ): Promise<VacancyApplicationRecord> {
    const state = platformStore.getState();
    const app = state.applications.find((a) => a.id === applicationId && a.organisationId === organisationId);
    if (!app) throw new Error('Application not found or access denied');

    const sentAt = new Date().toISOString();
    app.communications.push({
      id: `msg-${crypto.randomUUID().slice(0, 8)}`,
      senderType: 'COMPANY',
      senderName: app.organisationName,
      subject,
      body,
      sentAt,
    });
    app.updatedAt = sentAt;

    state.notifications.unshift({
      id: `ntf-${crypto.randomUUID().slice(0, 8)}`,
      customerId: app.customerId,
      userUid: app.userUid,
      type: 'COMPANY_MESSAGE',
      title: `Message from ${app.organisationName}`,
      message: `${subject}: ${body.slice(0, 120)}`,
      actionUrl: '/app',
      isRead: false,
      createdAt: sentAt,
    });
    platformStore.save();

    sendMail({
      to: app.candidateEmail,
      subject: `[${app.referenceCode}] ${subject}`,
      html: `<div style="font-family:Montserrat,Arial,sans-serif;padding:20px;"><p><strong>${app.organisationName}</strong> sent you a message regarding <strong>${app.vacancyTitle}</strong> (Ref: <code>${app.referenceCode}</code>):</p><hr/><p>${body.replace(/\n/g, '<br/>')}</p></div>`,
    }).catch(() => undefined);

    return app;
  }

  public searchAuthorizedCandidates(
    organisationId: string,
    query?: { skill?: string; q?: string },
  ) {
    const state = platformStore.getState();
    // Strict tenant/consent isolation: company only sees candidates who applied to it with consentToShare === true
    let apps = state.applications.filter(
      (a) => a.organisationId === organisationId && a.consentToShare,
    );
    if (query?.skill) {
      const sk = query.skill.toLowerCase();
      apps = apps.filter((a) => a.skills.some((s) => s.toLowerCase().includes(sk)));
    }
    if (query?.q) {
      const text = query.q.toLowerCase();
      apps = apps.filter(
        (a) =>
          a.candidateName.toLowerCase().includes(text) ||
          (a.qualifications || '').toLowerCase().includes(text) ||
          (a.workExperience || '').toLowerCase().includes(text) ||
          a.skills.some((s) => s.toLowerCase().includes(text)),
      );
    }

    // Log access for sensitive candidate records
    for (const a of apps.slice(0, 20)) {
      const logEntry: DocumentAccessLogRecord = {
        id: `acl-${crypto.randomUUID().slice(0, 8)}`,
        organisationId,
        candidateUid: a.userUid,
        documentType: 'CANDIDATE_PROFILE_AND_TRANSCRIPT',
        action: 'AUTHORIZED_CANDIDATE_VIEW',
        accessedAt: new Date().toISOString(),
      };
      state.documentAccessLogs.push(logEntry);
    }
    platformStore.save();

    return apps.map((a) => ({
      applicationId: a.id,
      userUid: a.userUid,
      candidateName: a.candidateName,
      candidateEmail: a.candidateEmail,
      candidatePhone: a.candidatePhone,
      vacancyTitle: a.vacancyTitle,
      status: a.status,
      skills: a.skills,
      qualifications: a.qualifications,
      workExperience: a.workExperience,
      cvFileName: a.cvFileName,
      cvDownloadUrl: a.cvDownloadUrl,
      transcriptId: a.transcriptId,
      transcriptScore: a.transcriptScore,
      transcriptPdfUrl: a.transcriptPdfUrl,
      appliedAt: a.appliedAt,
    }));
  }

  public async scheduleInterview(
    organisationId: string,
    input: {
      applicationId?: string;
      vacancyId?: string;
      customerId: string;
      userUid: string;
      jobTitle: string;
      candidateName: string;
      candidateEmail: string;
      interviewDate: string;
      interviewTime: string;
      timezone: string;
      interviewType: 'ONLINE' | 'TELEPHONE' | 'IN_PERSON';
      interviewProvider?: InterviewProviderType;
      aiQuestions?: string;
      maxRetakes?: number;
      locationOrLink?: string;
      instructions?: string;
    },
  ): Promise<InterviewRecord> {
    const state = platformStore.getState();
    const org = state.organisations.find((o) => o.id === organisationId);
    if (!org) throw new Error('Organisation not found');

    const now = new Date().toISOString();
    const companyName = org.tradingName || org.registeredName;
    const provider: InterviewProviderType = input.interviewProvider || 'EXTERNAL';
    if (
      (provider === 'GOOGLE_LIVE' || provider === 'NUANCE' || provider === 'TAVUS') &&
      !input.aiQuestions?.trim()
    ) {
      throw new Error('Please enter the interview questions for the AI interviewer.');
    }
    const ratePerMinuteUsd = INTERVIEW_PROVIDER_RATES_USD[provider] ?? 0;
    const resolvedLocation =
      input.locationOrLink?.trim() ||
      (provider === 'GOOGLE_LIVE'
        ? 'Nexora AI Live Room (Google Live • $0.50/min)'
        : provider === 'NUANCE'
          ? 'Nexora AI Video Room (Nuance Persona • $2.00/min)'
          : provider === 'TAVUS'
            ? 'Nexora Human AI Video Room (Tavus CVI • $2.00/min)'
            : 'Provided by organisation');

    const interview: InterviewRecord = {
      id: `int-${crypto.randomUUID().slice(0, 10)}`,
      organisationId,
      vacancyId: input.vacancyId,
      applicationId: input.applicationId,
      customerId: input.customerId,
      userUid: input.userUid,
      companyName,
      jobTitle: input.jobTitle,
      candidateName: input.candidateName,
      candidateEmail: input.candidateEmail,
      interviewDate: input.interviewDate,
      interviewTime: input.interviewTime,
      timezone: input.timezone || 'UTC',
      interviewType: input.interviewType,
      interviewProvider: provider,
      ratePerMinuteUsd,
      aiQuestions: input.aiQuestions?.trim() || undefined,
      maxRetakes: Math.max(0, Math.min(5, Math.floor(Number(input.maxRetakes ?? 0) || 0))),
      attemptsUsed: 0,
      locationOrLink: resolvedLocation,
      instructions: input.instructions,
      status: 'SCHEDULED',
      createdAt: now,
      updatedAt: now,
    };

    state.interviews.unshift(interview);
    if (input.applicationId) {
      const app = state.applications.find((a) => a.id === input.applicationId && a.organisationId === organisationId);
      if (app) {
        app.status = 'INTERVIEW_SCHEDULED';
        app.updatedAt = now;
      }
    }

    state.notifications.unshift({
      id: `ntf-${crypto.randomUUID().slice(0, 8)}`,
      customerId: input.customerId,
      userUid: input.userUid,
      type: 'INTERVIEW_INVITATION',
      title: `Interview Scheduled: ${input.jobTitle}`,
      message: `${companyName} scheduled a ${input.interviewType} interview on ${input.interviewDate} at ${input.interviewTime} (${input.timezone}).`,
      actionUrl: '/app',
      isRead: false,
      createdAt: now,
    });

    platformStore.save();

    const cleanDate = input.interviewDate.replace(/-/g, '');
    const cleanTime = input.interviewTime.replace(/:/g, '').padEnd(6, '0').slice(0, 6);
    const startDt = `${cleanDate}T${cleanTime}`;
    const startHour = Number(input.interviewTime.split(':')[0] || 10);
    const startMin = Number(input.interviewTime.split(':')[1] || 0) + 45;
    const endHour = String((startHour + Math.floor(startMin / 60)) % 24).padStart(2, '0');
    const endMin = String(startMin % 60).padStart(2, '0');
    const endDt = `${cleanDate}T${endHour}${endMin}00`;
    const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Interview: ${input.jobTitle} — ${companyName}`)}&dates=${startDt}/${endDt}&ctz=${encodeURIComponent(input.timezone || 'Africa/Johannesburg')}&details=${encodeURIComponent(input.instructions || `Interview with ${companyName} via Nexora AI.`)}&location=${encodeURIComponent(resolvedLocation)}`;

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Nexora AI//Interview Scheduler//EN',
      'METHOD:REQUEST',
      'BEGIN:VEVENT',
      `UID:${interview.id}@nexora.ai`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART:${startDt}`,
      `DTEND:${endDt}`,
      `SUMMARY:Interview: ${input.jobTitle} — ${companyName}`,
      `DESCRIPTION:${(input.instructions || `Interview with ${companyName}`).replace(/\n/g, '\\n')}\\nLink/Location: ${input.locationOrLink}`,
      `LOCATION:${input.locationOrLink}`,
      'STATUS:CONFIRMED',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    sendMail({
      to: input.candidateEmail,
      subject: `Interview Invitation: ${input.jobTitle} — ${companyName}`,
      html: `<div style="font-family:Montserrat,Arial,sans-serif;padding:20px;"><h2>Interview Scheduled</h2><p>Hi ${input.candidateName},</p><p><strong>${companyName}</strong> has scheduled your <strong>${input.interviewType}</strong> interview for <strong>${input.jobTitle}</strong>.</p><ul><li><strong>Date:</strong> ${input.interviewDate}</li><li><strong>Time:</strong> ${input.interviewTime} (${input.timezone})</li><li><strong>Link / Location:</strong> ${input.locationOrLink}</li></ul>${input.instructions ? `<p><strong>Instructions:</strong> ${input.instructions}</p>` : ''}<p style="margin-top:16px;"><a href="${gcalUrl}" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold;">Add to Google Calendar</a></p></div>`,
      attachments: [
        {
          filename: 'interview-invite.ics',
          content: icsContent,
          contentType: 'text/calendar; charset=utf-8; method=REQUEST',
        },
      ],
    }).catch(() => undefined);

    return interview;
  }

  public updateInterview(
    organisationId: string,
    interviewId: string,
    updates: {
      status?: InterviewRecord['status'];
      interviewDate?: string;
      interviewTime?: string;
      locationOrLink?: string;
      interviewerNotes?: string;
    },
  ): InterviewRecord {
    const state = platformStore.getState();
    const interview = state.interviews.find((i) => i.id === interviewId && i.organisationId === organisationId);
    if (!interview) throw new Error('Interview not found or access denied');

    const prevStatus = interview.status;
    const prevDate = interview.interviewDate;
    const prevTime = interview.interviewTime;
    Object.assign(interview, updates, { updatedAt: new Date().toISOString() });

    const rescheduled =
      (updates.interviewDate && updates.interviewDate !== prevDate) ||
      (updates.interviewTime && updates.interviewTime !== prevTime);

    if ((updates.status && updates.status !== prevStatus) || rescheduled) {
      const actionLabel = rescheduled && updates.status !== 'CANCELLED' ? 'RESCHEDULED' : (updates.status || 'UPDATED');
      state.notifications.unshift({
        id: `ntf-${crypto.randomUUID().slice(0, 8)}`,
        customerId: interview.customerId,
        userUid: interview.userUid,
        type: 'INTERVIEW_UPDATE',
        title: `Interview ${actionLabel}: ${interview.jobTitle}`,
        message: `${interview.companyName} updated your interview to ${actionLabel} (${interview.interviewDate} ${interview.interviewTime}).`,
        actionUrl: '/app',
        isRead: false,
        createdAt: interview.updatedAt,
      });

      sendMail({
        to: interview.candidateEmail,
        subject: `Interview ${actionLabel}: ${interview.jobTitle} — ${interview.companyName}`,
        html: `<div style="font-family:Montserrat,Arial,sans-serif;padding:20px;"><p>Hi ${interview.candidateName}, your interview with <strong>${interview.companyName}</strong> for <strong>${interview.jobTitle}</strong> is now <strong>${actionLabel}</strong> (${interview.interviewDate} at ${interview.interviewTime} ${interview.timezone} • ${interview.locationOrLink}).</p></div>`,
      }).catch(() => undefined);
    }

    if (updates.status === 'COMPLETED' && interview.applicationId) {
      const linkedApp = state.applications.find((a) => a.id === interview.applicationId);
      if (linkedApp && linkedApp.status === 'INTERVIEW_SCHEDULED') {
        linkedApp.status = 'INTERVIEWED';
        linkedApp.updatedAt = interview.updatedAt;
      }
    }

    platformStore.save();
    return interview;
  }

  public async generateAiInterviewQuestions(organisationId: string, interviewId: string): Promise<string> {
    const state = platformStore.getState();
    const iv = state.interviews.find((i) => i.id === interviewId && i.organisationId === organisationId);
    if (!iv) throw new Error('Interview not found');
    const app = state.applications.find((a) => a.id === iv.applicationId);
    const vac = state.vacancies.find((v) => v.id === iv.vacancyId);

    const prompt = [
      `Generate 5 sharp, role-specific interview questions and evaluation signals for ${iv.candidateName} interviewing for ${iv.jobTitle}.`,
      vac ? `Required Skills: ${(vac.requiredSkills || []).join(', ')}. Requirements: ${vac.requirements}` : '',
      app?.aiMatchSummary ? `AI CV Summary: ${app.aiMatchSummary}` : '',
      app?.aiGaps?.length ? `Areas to probe: ${app.aiGaps.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const ai = await this.runEmployerAiAssistant({
      organisationId,
      action: 'DRAFT_MESSAGE',
      prompt,
    });
    iv.interviewerNotes = ai.text;
    iv.updatedAt = new Date().toISOString();
    platformStore.save();
    return ai.text;
  }

  public listInterviewsForCandidate(
    userUid: string,
    email?: string,
    receiptIds?: string[],
  ): InterviewRecord[] {
    const state = platformStore.getState();
    const emailLower = email?.trim().toLowerCase();
    const receiptSet = new Set((receiptIds || []).map((r) => r.trim().toUpperCase()).filter(Boolean));
    const matchingAppIds = new Set(
      state.applications
        .filter((a) => receiptSet.has(a.referenceCode.toUpperCase()))
        .map((a) => a.id),
    );
    return state.interviews.filter(
      (i) =>
        i.userUid === userUid ||
        i.customerId === userUid ||
        (emailLower && i.candidateEmail?.toLowerCase() === emailLower) ||
        (i.applicationId && matchingAppIds.has(i.applicationId)),
    );
  }

  public listInterviewRecordings(userUid: string): InterviewRecordingRecord[] {
    const state = platformStore.getState();
    return (state.interviewRecordings || []).filter((r) => r.userUid === userUid);
  }

  public async saveInterviewRecording(input: {
    userUid: string;
    interviewId?: string;
    role: string;
    companyName: string;
    interviewType: string;
    interviewProvider?: InterviewProviderType;
    durationSeconds: number;
    hasVideo: boolean;
    mimeType: string;
    mediaBase64: string;
    transcript: Array<{ speaker: 'ai' | 'user'; text: string; timestamp: string }>;
  }): Promise<{ recording: InterviewRecordingRecord; invoice?: MonthlyInvoiceRecord }> {
    const state = platformStore.getState();
    if (!Array.isArray(state.interviewRecordings)) {
      state.interviewRecordings = [];
    }

    const linkedInterview = input.interviewId
      ? state.interviews.find((iv) => iv.id === input.interviewId)
      : undefined;

    const provider: InterviewProviderType =
      linkedInterview?.interviewProvider || input.interviewProvider || 'GOOGLE_LIVE';
    const ratePerMinuteUsd = INTERVIEW_PROVIDER_RATES_USD[provider] ?? 0.5;
    const durationSeconds = Math.max(1, Math.round(input.durationSeconds || 1));
    const billedMinutes = Math.max(1, Math.ceil(durationSeconds / 60));
    const billedAmountUsd = Math.round(billedMinutes * ratePerMinuteUsd * 100) / 100;

    const buffer = Buffer.from(input.mediaBase64, 'base64');
    const recId = `rec-${crypto.randomUUID().slice(0, 10)}`;
    const safeUid = input.userUid.replace(/[^a-zA-Z0-9_-]/g, '_') || 'candidate';
    const cleanMimeType = (input.mimeType || (input.hasVideo ? 'video/webm' : 'audio/webm'))
      .split(';')[0]
      .trim();
    const ext = cleanMimeType.includes('mp4') ? 'mp4' : 'webm';
    const storagePath = `interviews/${safeUid}/${recId}.${ext}`;

    const uploadedUrl = await uploadToFirebaseStorage(
      storagePath,
      buffer,
      cleanMimeType,
    );
    if (!uploadedUrl) {
      throw new Error('Could not upload interview recording to Firebase Storage.');
    }

    const now = new Date().toISOString();
    const recording: InterviewRecordingRecord = {
      id: recId,
      userUid: input.userUid,
      interviewId: linkedInterview?.id,
      organisationId: linkedInterview?.organisationId,
      companyName: linkedInterview?.companyName || input.companyName || 'Nexora AI Practice',
      jobTitle: linkedInterview?.jobTitle || input.role || 'Live AI Interview',
      interviewType: input.interviewType || 'Technical & Behavioral',
      interviewProvider: provider,
      ratePerMinuteUsd,
      durationSeconds,
      billedMinutes,
      billedAmountUsd,
      hasVideo: input.hasVideo,
      mimeType: input.mimeType || (input.hasVideo ? 'video/webm' : 'audio/webm'),
      fileSizeBytes: buffer.length,
      storagePath,
      recordingUrl: uploadedUrl,
      transcript: Array.isArray(input.transcript) ? input.transcript.slice(0, 200) : [],
      createdAt: now,
    };

    state.interviewRecordings.unshift(recording);

    let invoice: MonthlyInvoiceRecord | undefined;
    if (linkedInterview) {
      linkedInterview.recordedDurationSec = durationSeconds;
      linkedInterview.billedMinutes = billedMinutes;
      linkedInterview.billedAmountUsd = billedAmountUsd;
      linkedInterview.recordingId = recId;
      linkedInterview.recordingUrl = uploadedUrl;
      linkedInterview.attemptsUsed = (linkedInterview.attemptsUsed || 0) + 1;
      linkedInterview.status = 'COMPLETED';
      linkedInterview.updatedAt = now;

      // Accrue AI interview cost onto the company's Monthly Invoice (Google Live $0.50/min, Nuance $2.00/min)
      if (billedAmountUsd > 0) {
        const org = state.organisations.find((o) => o.id === linkedInterview.organisationId);
        if (org) {
          const billingMonth = now.slice(0, 7);
          const providerLabel =
            provider === 'TAVUS'
              ? 'Tavus Human AI ($2.00/min)'
              : provider === 'NUANCE'
                ? 'Nuance AI ($2.00/min)'
                : 'Google Live AI ($0.50/min)';
          const existingInv = state.invoices.find(
            (inv) => inv.organisationId === org.id && inv.interviewId === linkedInterview.id,
          );
          if (!existingInv) {
            invoice = {
              id: `inv-${crypto.randomUUID().slice(0, 10)}`,
              invoiceNumber: `NX-${billingMonth.replace('-', '')}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`,
              organisationId: org.id,
              organisationName: org.tradingName || org.registeredName,
              billingEmail: org.billingEmail || org.recruitmentEmail || org.interviewEmail || '',
              applicationId: linkedInterview.applicationId,
              vacancyId: linkedInterview.vacancyId,
              interviewId: linkedInterview.id,
              interviewProvider: provider,
              billedMinutes,
              vacancyTitle: `${linkedInterview.jobTitle} — ${providerLabel} (${billedMinutes} min)`,
              category: 'AI_INTERVIEW',
              candidateName: linkedInterview.candidateName,
              candidateEmail: linkedInterview.candidateEmail,
              billingMonth,
              dueDate: addDaysIso(now.slice(0, 10), 28),
              offerAmountUsd: billedAmountUsd,
              feePercent: 100,
              feeAmountUsd: billedAmountUsd,
              feeAmountCents: Math.round(billedAmountUsd * 100),
              status: 'PENDING',
              createdAt: now,
            };
            state.invoices.unshift(invoice);
          }
        }
      }
    }

    platformStore.save();
    return { recording, invoice };
  }

  public listInterviewsForOrganisation(organisationId: string): InterviewRecord[] {
    return platformStore.getState().interviews.filter((i) => i.organisationId === organisationId);
  }

  // Phase 5: Staffing & Workforce Management
  public createPlacement(
    organisationId: string,
    input: {
      vacancyId?: string;
      customerId: string;
      candidateName: string;
      roleTitle: string;
      contractModel: PlacementRecord['contractModel'];
      startDate: string;
      hourlyRateCents?: number;
      monthlySalaryCents?: number;
      placementFeeCents?: number;
      legalEntityArranged?: boolean;
      taxComplianceReady?: boolean;
      contractTerms?: string;
    },
  ): PlacementRecord {
    const state = platformStore.getState();
    const existingActive = state.placements.find(
      (p) =>
        p.organisationId === organisationId &&
        p.onboardingStatus !== 'TERMINATED' &&
        p.onboardingStatus !== 'COMPLETED' &&
        ((input.customerId && p.customerId === input.customerId) ||
          p.candidateName.trim().toLowerCase() === input.candidateName.trim().toLowerCase()),
    );
    if (existingActive) {
      throw new Error(
        `${input.candidateName} is already an active employee (${existingActive.roleTitle}) in this organisation.`,
      );
    }
    const now = new Date().toISOString();
    const placement: PlacementRecord = {
      id: `plc-${crypto.randomUUID().slice(0, 10)}`,
      organisationId,
      vacancyId: input.vacancyId,
      customerId: input.customerId,
      candidateName: input.candidateName,
      roleTitle: input.roleTitle,
      contractModel: input.contractModel,
      startDate: input.startDate,
      hourlyRateCents: input.hourlyRateCents,
      monthlySalaryCents: input.monthlySalaryCents,
      placementFeeCents: input.placementFeeCents,
      currency: 'USD',
      legalEntityArranged: Boolean(input.legalEntityArranged),
      taxComplianceReady: Boolean(input.taxComplianceReady),
      onboardingStatus: 'ONBOARDING',
      contractTerms: input.contractTerms,
      timesheets: [],
      payrollRecords: [],
      createdAt: now,
      updatedAt: now,
    };
    state.placements.unshift(placement);
    platformStore.save();
    return placement;
  }

  public addTimesheet(
    organisationId: string,
    placementId: string,
    input: { weekStarting: string; hoursWorked: number; attendanceLog?: string },
  ): PlacementRecord {
    const state = platformStore.getState();
    const plc = state.placements.find((p) => p.id === placementId && p.organisationId === organisationId);
    if (!plc) throw new Error('Placement not found or access denied');

    const invoiceAmountCents = plc.hourlyRateCents ? Math.round(input.hoursWorked * plc.hourlyRateCents) : undefined;
    plc.timesheets.unshift({
      id: `ts-${crypto.randomUUID().slice(0, 8)}`,
      weekStarting: input.weekStarting,
      hoursWorked: input.hoursWorked,
      attendanceLog: input.attendanceLog,
      approved: false,
      invoiced: false,
      invoiceAmountCents,
      createdAt: new Date().toISOString(),
    });
    plc.updatedAt = new Date().toISOString();
    platformStore.save();
    return plc;
  }

  public createPayrollRecord(
    organisationId: string,
    placementId: string,
    input: { periodLabel: string; grossPayCents: number; deductionsCents: number },
  ): PlacementRecord {
    const state = platformStore.getState();
    const plc = state.placements.find((p) => p.id === placementId && p.organisationId === organisationId);
    if (!plc) throw new Error('Placement not found or access denied');

    if (plc.contractModel !== 'NEXORA_EOR_STAFFING' || !plc.legalEntityArranged || !plc.taxComplianceReady) {
      throw new Error(
        'Payroll activation blocked: contractModel must be NEXORA_EOR_STAFFING with legalEntityArranged and taxComplianceReady verified.',
      );
    }

    plc.payrollRecords.unshift({
      id: `pay-${crypto.randomUUID().slice(0, 8)}`,
      periodLabel: input.periodLabel,
      grossPayCents: input.grossPayCents,
      deductionsCents: input.deductionsCents,
      netPayCents: Math.max(0, input.grossPayCents - input.deductionsCents),
      status: 'READY_FOR_PAYOUT',
      createdAt: new Date().toISOString(),
    });
    plc.updatedAt = new Date().toISOString();
    platformStore.save();
    return plc;
  }

  public listPlacements(organisationId: string): PlacementRecord[] {
    const all = platformStore.getState().placements.filter((p) => p.organisationId === organisationId);
    const seenActive = new Set<string>();
    return all.filter((p) => {
      if (p.onboardingStatus === 'TERMINATED' || p.onboardingStatus === 'COMPLETED') {
        return true;
      }
      const key = (p.customerId || p.candidateName).trim().toLowerCase();
      if (seenActive.has(key)) return false;
      seenActive.add(key);
      return true;
    });
  }

  public listNotifications(filter: { userUid?: string; organisationId?: string }): NotificationRecord[] {
    return platformStore.getState().notifications.filter((n) => {
      if (filter.userUid && n.userUid === filter.userUid) return true;
      if (filter.organisationId && n.organisationId === filter.organisationId) return true;
      return false;
    });
  }

  public markNotificationRead(id: string): void {
    const n = platformStore.getState().notifications.find((item) => item.id === id);
    if (n) {
      n.isRead = true;
      platformStore.save();
    }
  }

  public async runEmployerAiAssistant(params: {
    organisationId: string;
    action: 'DRAFT_JD' | 'SUMMARISE_CANDIDATE' | 'MATCH_CANDIDATES' | 'DRAFT_MESSAGE';
    prompt: string;
  }): Promise<{ text: string; explainable: boolean }> {
    if (this.openclawService && process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      try {
        const res = await this.openclawService.executeAgentTurn({
          customerId: params.organisationId,
          agentType: 'RESEARCH_AGENT' as any,
          openclawAgentId: 'main',
          sessionKey: `agent:main:tenant_${params.organisationId.replace(/[^a-zA-Z0-9_-]/g, '')}_task_${Date.now()}`,
          userMessage: `Employer AI Task (${params.action}):\n${params.prompt}`,
          systemInstructions:
            'You are Nexora Employer AI. Provide explainable, structured recruitment recommendations. Never make automated final hiring decisions; always leave final hiring authority with the employer.',
          useLocalCli: false,
          timeoutMs: 30_000,
        });
        return { text: res.responseText, explainable: true };
      } catch (err) {
        logger.debug({ err }, 'Employer AI fallback response');
      }
    }

    return {
      explainable: true,
      text: `### Employer AI Recommendation (${params.action})\n- **Context:** ${params.prompt.slice(0, 180)}\n- **Advisory Note:** Review candidate CV, assessment transcript breakdown, and interview notes before making any hiring decision.`,
    };
  }

  // ==================== AI CV SCORING & 10% MONTHLY INVOICING ====================
  private async readCvTextForScoring(cvFileName?: string): Promise<string> {
    if (!cvFileName) return '';
    const safeName = path.basename(String(cvFileName));
    if (!safeName.toLowerCase().endsWith('.pdf')) return '';
    const primaryPath = path.resolve(process.cwd(), 'node_modules', '.cache', 'nexora-documents', safeName);
    const fallbackPath = path.resolve(process.cwd(), 'storage', 'documents', safeName);
    try {
      const buffer = await fs.readFile(primaryPath).catch(() => fs.readFile(fallbackPath));
      const parsed = await pdfParse(buffer);
      return (parsed.text || '').replace(/\s+/g, ' ').trim().slice(0, 3500);
    } catch {
      return '';
    }
  }

  private async scoreApplicationInternal(
    app: VacancyApplicationRecord,
    vac?: VacancyRecord,
  ): Promise<void> {
    const cvText = await this.readCvTextForScoring(app.cvFileName);
    const candidateContext = [
      `Candidate: ${app.candidateName}`,
      `Skills: ${(app.skills || []).join(', ') || 'Not listed'}`,
      app.qualifications ? `Qualifications: ${app.qualifications}` : '',
      app.workExperience ? `Work Experience: ${app.workExperience}` : '',
      app.coverNote ? `Cover Note: ${app.coverNote}` : '',
      app.transcriptScore !== undefined ? `Assessment Score: ${app.transcriptScore}%` : '',
      cvText ? `CV Content:\n${cvText}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const vacancyContext = vac
      ? [
          `Opportunity: ${vac.title} (${vac.category})`,
          `Required Skills: ${(vac.requiredSkills || []).join(', ')}`,
          `Min Experience: ${vac.minYearsExperience} years`,
          `Requirements: ${vac.requirements}`,
          `Description: ${vac.description}`,
        ].join('\n')
      : `Opportunity: ${app.vacancyTitle}`;

    if (this.openclawService && process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      try {
        const res = await this.openclawService.executeAgentTurn({
          customerId: app.organisationId,
          agentType: 'RESEARCH_AGENT' as any,
          openclawAgentId: 'main',
          sessionKey: `agent:main:score_${app.id}`,
          userMessage: `Score this candidate 0-100 against the opportunity.\n\n${vacancyContext}\n\n${candidateContext}\n\nReturn ONLY JSON: {"score": number, "summary": string, "strengths": string[], "gaps": string[]}`,
          systemInstructions:
            'Return ONLY valid JSON with keys score (0-100 integer), summary (2 sentences), strengths (array of up to 3 strings), gaps (array of up to 3 strings).',
          timeoutMs: 35_000,
        });
        const match = res.responseText.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]) as {
            score?: number;
            summary?: string;
            strengths?: string[];
            gaps?: string[];
          };
          if (typeof parsed.score === 'number') {
            app.aiMatchScore = Math.max(0, Math.min(100, Math.round(parsed.score)));
            app.aiMatchSummary = parsed.summary || 'AI CV evaluation completed.';
            app.aiStrengths = Array.isArray(parsed.strengths) ? parsed.strengths.slice(0, 3) : [];
            app.aiGaps = Array.isArray(parsed.gaps) ? parsed.gaps.slice(0, 3) : [];
            return;
          }
        }
      } catch (err) {
        logger.debug({ err }, 'AI CV scoring fallback');
      }
    }

    // Deterministic CV + skills + assessment heuristic fallback
    const hay = `${candidateContext} ${app.vacancyTitle}`.toLowerCase();
    const reqSkills = vac?.requiredSkills || [];
    const matchedSkills = reqSkills.filter((s) => hay.includes(s.toLowerCase()));
    const skillRatio = reqSkills.length > 0 ? matchedSkills.length / reqSkills.length : 0.65;
    let score = 45 + Math.round(skillRatio * 35);
    if (cvText.length > 150 || app.cvFileName) score += 10;
    if (typeof app.transcriptScore === 'number') {
      score = Math.round(score * 0.7 + app.transcriptScore * 0.3);
    }
    app.aiMatchScore = Math.max(25, Math.min(98, score));
    app.aiStrengths = matchedSkills.length > 0
      ? matchedSkills.slice(0, 3).map((s) => `Matched requirement: ${s}`)
      : ['Profile submitted with supporting details'];
    app.aiGaps = reqSkills
      .filter((s) => !matchedSkills.includes(s))
      .slice(0, 3)
      .map((s) => `Verify experience in ${s}`);
    app.aiMatchSummary = `CV & profile match ${app.aiMatchScore}% for ${app.vacancyTitle}${matchedSkills.length > 0 ? ` (${matchedSkills.join(', ')})` : ''}.`;
  }

  public async rescoreApplication(organisationId: string, applicationId: string): Promise<VacancyApplicationRecord> {
    const state = platformStore.getState();
    const app = state.applications.find((a) => a.id === applicationId && a.organisationId === organisationId);
    if (!app) throw new Error('Application not found or access denied');
    const vac = state.vacancies.find((v) => v.id === app.vacancyId);
    await this.scoreApplicationInternal(app, vac);
    app.updatedAt = new Date().toISOString();
    platformStore.save();
    return app;
  }

  public async rescoreAllApplications(organisationId: string): Promise<VacancyApplicationRecord[]> {
    const state = platformStore.getState();
    const apps = state.applications.filter((a) => a.organisationId === organisationId);
    for (const app of apps) {
      const vac = state.vacancies.find((v) => v.id === app.vacancyId);
      await this.scoreApplicationInternal(app, vac);
      app.updatedAt = new Date().toISOString();
    }
    platformStore.save();
    return apps;
  }

  public listInvoices(organisationId: string): MonthlyInvoiceRecord[] {
    const state = platformStore.getState();
    return state.invoices.filter((i) => {
      if (i.organisationId !== organisationId) return false;
      if (i.status === 'PENDING') {
        if (i.applicationId) {
          const app = state.applications.find((a) => a.id === i.applicationId);
          if (app && (app.status === 'WITHDRAWN' || app.status === 'REJECTED')) {
            return false;
          }
        }
        if (i.placementId) {
          const plc = state.placements.find((p) => p.id === i.placementId);
          if (plc && plc.onboardingStatus === 'TERMINATED') {
            return false;
          }
        }
      }
      return true;
    });
  }

  private async createOrGetMonthlyInvoice(params: {
    org: OrganisationRecord;
    placementId?: string;
    applicationId?: string;
    vacancyId?: string;
    vacancyTitle: string;
    category: string;
    candidateName: string;
    candidateEmail: string;
    billingMonth: string;
    dueDate?: string;
    offerAmountUsd: number;
  }): Promise<MonthlyInvoiceRecord> {
    const state = platformStore.getState();
    const existing = state.invoices.find(
      (i) =>
        i.organisationId === params.org.id &&
        i.billingMonth === params.billingMonth &&
        i.candidateName === params.candidateName &&
        i.vacancyTitle === params.vacancyTitle,
    );
    if (existing) return existing;

    const feePercent = 10;
    const feeAmountUsd = Math.round(params.offerAmountUsd * 0.1 * 100) / 100;
    const feeAmountCents = Math.round(feeAmountUsd * 100);
    const invoiceNumber = `INV-${params.billingMonth.replace('-', '')}-${crypto.randomUUID().slice(0, 5).toUpperCase()}`;
    const orgName = params.org.tradingName || params.org.registeredName;
    const billingEmail = params.org.billingEmail || params.org.businessEmail;

    let pdfFileName: string | undefined;
    let pdfDownloadUrl: string | undefined;
    try {
      const pdf = await documentGeneratorService.generateMonthlyInvoicePdf({
        invoiceNumber,
        organisationName: orgName,
        billingEmail,
        candidateName: params.candidateName,
        vacancyTitle: params.vacancyTitle,
        category: params.category,
        billingMonth: params.billingMonth,
        offerAmountUsd: params.offerAmountUsd,
        feePercent,
        feeAmountUsd,
        status: 'PENDING',
      });
      pdfFileName = pdf.fileName;
      pdfDownloadUrl = pdf.downloadUrl;
    } catch {
      // non-fatal
    }

    const dueDate = params.dueDate || addDaysIso(new Date().toISOString().slice(0, 10), 28);
    const nextDueDate = addDaysIso(dueDate, 28);

    const invoice: MonthlyInvoiceRecord = {
      id: `inv-${crypto.randomUUID().slice(0, 10)}`,
      invoiceNumber,
      organisationId: params.org.id,
      organisationName: orgName,
      billingEmail,
      placementId: params.placementId,
      applicationId: params.applicationId,
      vacancyId: params.vacancyId,
      vacancyTitle: params.vacancyTitle,
      category: params.category,
      candidateName: params.candidateName,
      candidateEmail: params.candidateEmail,
      billingMonth: params.billingMonth,
      dueDate,
      nextDueDate,
      offerAmountUsd: params.offerAmountUsd,
      feePercent,
      feeAmountUsd,
      feeAmountCents,
      status: 'PENDING',
      pdfFileName,
      pdfDownloadUrl,
      createdAt: new Date().toISOString(),
    };
    state.invoices.unshift(invoice);
    state.notifications.unshift({
      id: `ntf-${crypto.randomUUID().slice(0, 8)}`,
      organisationId: params.org.id,
      type: 'MONTHLY_INVOICE',
      title: `Monthly Invoice ${invoiceNumber}: $${feeAmountUsd.toFixed(2)}`,
      message: `10% Nexora platform fee for accepted candidate ${params.candidateName} (${params.vacancyTitle}, ${params.billingMonth}).`,
      actionUrl: '/company/billing',
      isRead: false,
      createdAt: invoice.createdAt,
    });
    platformStore.save();

    sendMail({
      to: billingEmail,
      subject: `Nexora AI Invoice ${invoiceNumber} — $${feeAmountUsd.toFixed(2)} USD (${params.billingMonth})`,
      html: `<div style="font-family:Montserrat,Arial,sans-serif;padding:20px;"><h2>Nexora AI Recruiting Fee Invoice (10% of CTC)</h2><p>Hello ${orgName},</p><p>Your invoice (<strong>${invoiceNumber}</strong>) for accepted candidate <strong>${params.candidateName}</strong> (${params.vacancyTitle}) is ready.</p><ul><li><strong>Max Monthly Budget (CTC):</strong> $${params.offerAmountUsd.toFixed(2)} USD</li><li><strong>Candidate Net Payout (90%):</strong> $${(params.offerAmountUsd * 0.9).toFixed(2)} USD</li><li><strong>Nexora Recruiting Fee (10% deducted from CTC):</strong> $${feeAmountUsd.toFixed(2)} USD</li><li><strong>Billing Month:</strong> ${params.billingMonth}</li></ul><p>Zero extra cost above your stated budget. Pay Nexora's 10% share online via Paystack in your <strong>Nexora Company Dashboard → Billing &amp; 10% Fees</strong>.</p></div>`,
    }).catch(() => undefined);

    return invoice;
  }

  public async generateMonthlyInvoicesForOrganisation(
    organisationId: string,
    billingMonth = new Date().toISOString().slice(0, 7),
  ): Promise<MonthlyInvoiceRecord[]> {
    const state = platformStore.getState();
    const org = state.organisations.find((o) => o.id === organisationId);
    if (!org) throw new Error('Organisation not found');

    const hiredApps = state.applications.filter(
      (a) => a.organisationId === organisationId && a.status === 'HIRED',
    );
    const seenCandidates = new Set<string>();
    const created: MonthlyInvoiceRecord[] = [];
    for (const app of hiredApps) {
      const candKey = (app.customerId || app.candidateEmail || app.candidateName).trim().toLowerCase();
      if (seenCandidates.has(candKey)) continue;
      seenCandidates.add(candKey);
      const vac = state.vacancies.find((v) => v.id === app.vacancyId);
      const plc = state.placements.find(
        (p) =>
          p.organisationId === organisationId &&
          p.candidateName === app.candidateName &&
          (p.vacancyId === app.vacancyId || p.roleTitle === app.vacancyTitle),
      );
      const offerUsd =
        plc?.monthlySalaryCents && plc.monthlySalaryCents > 0
          ? plc.monthlySalaryCents / 100
          : Number(vac?.monthlyOfferUsd || 0);
      if (offerUsd <= 0) continue;
      const dueDate =
        plc?.nextBillingDate ||
        (plc?.startDate
          ? addDaysIso(plc.startDate, 28)
          : addDaysIso(app.updatedAt.slice(0, 10), 28));
      if (plc && !plc.nextBillingDate) {
        plc.nextBillingDate = dueDate;
      }
      const inv = await this.createOrGetMonthlyInvoice({
        org,
        placementId: plc?.id,
        applicationId: app.id,
        vacancyId: app.vacancyId,
        vacancyTitle: app.vacancyTitle,
        category: vac?.category || 'EMPLOYMENT',
        candidateName: app.candidateName,
        candidateEmail: app.candidateEmail,
        billingMonth,
        dueDate,
        offerAmountUsd: offerUsd,
      });
      created.push(inv);
    }
    return created;
  }

  public async updatePlacementSalary(
    organisationId: string,
    placementId: string,
    monthlyCtcUsd: number,
  ): Promise<PlacementRecord> {
    const state = platformStore.getState();
    const plc = state.placements.find((p) => p.id === placementId && p.organisationId === organisationId);
    if (!plc) throw new Error('Employee placement not found');

    const cleanCtc = Math.max(0, Number(monthlyCtcUsd) || 0);
    plc.monthlySalaryCents = Math.round(cleanCtc * 100);
    plc.updatedAt = new Date().toISOString();

    const currentMonth = new Date().toISOString().slice(0, 7);
    const pendingInv = state.invoices.find(
      (i) =>
        i.organisationId === organisationId &&
        i.status === 'PENDING' &&
        i.billingMonth === currentMonth &&
        (i.placementId === plc.id || (i.candidateName === plc.candidateName && i.vacancyTitle === plc.roleTitle)),
    );

    if (pendingInv && cleanCtc > 0) {
      pendingInv.offerAmountUsd = cleanCtc;
      pendingInv.feeAmountUsd = Math.round(cleanCtc * 0.1 * 100) / 100;
      pendingInv.feeAmountCents = Math.round(pendingInv.feeAmountUsd * 100);
      try {
        const pdf = await documentGeneratorService.generateMonthlyInvoicePdf({
          invoiceNumber: pendingInv.invoiceNumber,
          organisationName: pendingInv.organisationName,
          billingEmail: pendingInv.billingEmail,
          candidateName: pendingInv.candidateName,
          vacancyTitle: pendingInv.vacancyTitle,
          category: pendingInv.category,
          billingMonth: pendingInv.billingMonth,
          offerAmountUsd: pendingInv.offerAmountUsd,
          feePercent: pendingInv.feePercent,
          feeAmountUsd: pendingInv.feeAmountUsd,
          status: pendingInv.status,
        });
        pendingInv.pdfFileName = pdf.fileName;
        pendingInv.pdfDownloadUrl = pdf.downloadUrl;
      } catch {
        // non-fatal
      }
    } else if (!pendingInv && cleanCtc > 0) {
      const org = state.organisations.find((o) => o.id === organisationId);
      const app = state.applications.find(
        (a) => a.organisationId === organisationId && a.candidateName === plc.candidateName && a.vacancyTitle === plc.roleTitle,
      );
      const vac = state.vacancies.find((v) => v.id === plc.vacancyId);
      if (org) {
        await this.createOrGetMonthlyInvoice({
          org,
          placementId: plc.id,
          applicationId: app?.id,
          vacancyId: plc.vacancyId,
          vacancyTitle: plc.roleTitle,
          category: vac?.category || 'EMPLOYMENT',
          candidateName: plc.candidateName,
          candidateEmail: app?.candidateEmail || org.businessEmail,
          billingMonth: currentMonth,
          offerAmountUsd: cleanCtc,
        });
      }
    }

    platformStore.save();
    return plc;
  }

  public updatePlacementStatus(
    organisationId: string,
    placementId: string,
    onboardingStatus: PlacementRecord['onboardingStatus'],
  ): PlacementRecord {
    const state = platformStore.getState();
    const plc = state.placements.find((p) => p.id === placementId && p.organisationId === organisationId);
    if (!plc) throw new Error('Employee placement not found');
    plc.onboardingStatus = onboardingStatus;
    plc.updatedAt = new Date().toISOString();
    if (onboardingStatus === 'TERMINATED') {
      state.invoices = state.invoices.filter(
        (i) =>
          !(
            i.organisationId === organisationId &&
            i.status === 'PENDING' &&
            (i.placementId === plc.id ||
              (i.candidateName.trim().toLowerCase() === plc.candidateName.trim().toLowerCase() &&
                i.vacancyTitle === plc.roleTitle))
          ),
      );
    }
    platformStore.save();
    return plc;
  }

  public async runAutomatedMonthlyBillingCycle(): Promise<number> {
    const state = platformStore.getState();
    const billingMonth = new Date().toISOString().slice(0, 7);
    let totalGenerated = 0;
    for (const org of state.organisations) {
      try {
        const list = await this.generateMonthlyInvoicesForOrganisation(org.id, billingMonth);
        totalGenerated += list.length;
      } catch {
        // continue other organisations
      }
    }
    return totalGenerated;
  }

  public async initializeInvoicePaystack(
    organisationId: string,
    invoiceId: string,
    callbackUrl?: string,
  ) {
    const state = platformStore.getState();
    const inv = state.invoices.find((i) => i.id === invoiceId && i.organisationId === organisationId);
    if (!inv) throw new Error('Invoice not found');
    if (inv.status === 'PAID') throw new Error('Invoice is already paid');

    const init = await paystackService.initializeInvoicePayment({
      invoiceId: inv.id,
      organisationId,
      email: inv.billingEmail,
      amountCentsUsd: inv.feeAmountCents,
      callbackUrl,
    });
    inv.paystackReference = init.reference;
    platformStore.save();
    return init;
  }

  public async verifyInvoicePaystack(
    organisationId: string,
    invoiceId: string,
    reference: string,
  ): Promise<MonthlyInvoiceRecord> {
    const state = platformStore.getState();
    const inv = state.invoices.find((i) => i.id === invoiceId && i.organisationId === organisationId);
    if (!inv) throw new Error('Invoice not found');
    if (inv.status === 'PAID') return inv;

    const verified = await paystackService.verifyTransaction(reference);
    if (!verified.paid) {
      throw new Error(`Payment not completed yet (status: ${verified.status})`);
    }
    inv.status = 'PAID';
    inv.paystackReference = reference;
    inv.paidAt = new Date().toISOString();
    const currentDue = inv.dueDate || addDaysIso(inv.createdAt, 28);
    const nextDue = addDaysIso(currentDue, 28);
    inv.dueDate = currentDue;
    inv.nextDueDate = nextDue;

    const plc = state.placements.find(
      (p) =>
        p.organisationId === organisationId &&
        (p.id === inv.placementId || (p.candidateName === inv.candidateName && p.roleTitle === inv.vacancyTitle)),
    );
    if (plc) {
      plc.nextBillingDate = nextDue;
      plc.updatedAt = inv.paidAt;
    }

    platformStore.save();
    return inv;
  }

  public async initializeBulkInvoicesPaystack(
    organisationId: string,
    callbackUrl?: string,
  ) {
    const state = platformStore.getState();
    const org = state.organisations.find((o) => o.id === organisationId);
    const pending = state.invoices.filter(
      (i) => i.organisationId === organisationId && i.status === 'PENDING',
    );
    if (pending.length === 0) {
      throw new Error('No pending invoices to pay.');
    }

    const totalCentsUsd = pending.reduce(
      (sum, inv) => sum + (inv.feeAmountCents || Math.round(Number(inv.feeAmountUsd || 0) * 100)),
      0,
    );
    if (totalCentsUsd <= 0) {
      throw new Error('Total amount due must be greater than $0.00.');
    }

    const billingEmail = org?.billingEmail || org?.businessEmail || pending[0].billingEmail;
    const init = await paystackService.initializeInvoicePayment({
      invoiceId: pending.map((i) => i.id).join(','),
      organisationId,
      email: billingEmail,
      amountCentsUsd: totalCentsUsd,
      callbackUrl,
    });

    for (const inv of pending) {
      inv.paystackReference = init.reference;
    }
    platformStore.save();

    return {
      ...init,
      invoiceCount: pending.length,
      totalAmountUsd: Math.round(totalCentsUsd) / 100,
    };
  }

  public async verifyBulkInvoicesPaystack(
    organisationId: string,
    reference: string,
  ): Promise<{ paidCount: number; invoices: MonthlyInvoiceRecord[] }> {
    const state = platformStore.getState();
    const verified = await paystackService.verifyTransaction(reference);
    if (!verified.paid) {
      throw new Error(`Payment not completed yet (status: ${verified.status})`);
    }

    const nowIso = new Date().toISOString();
    let targets = state.invoices.filter(
      (i) => i.organisationId === organisationId && i.status === 'PENDING' && i.paystackReference === reference,
    );
    if (targets.length === 0) {
      targets = state.invoices.filter(
        (i) => i.organisationId === organisationId && i.status === 'PENDING',
      );
    }

    for (const inv of targets) {
      inv.status = 'PAID';
      inv.paystackReference = reference;
      inv.paidAt = nowIso;
      const currentDue = inv.dueDate || addDaysIso(inv.createdAt, 28);
      const nextDue = addDaysIso(currentDue, 28);
      inv.dueDate = currentDue;
      inv.nextDueDate = nextDue;

      const plc = state.placements.find(
        (p) =>
          p.organisationId === organisationId &&
          (p.id === inv.placementId || (p.candidateName === inv.candidateName && p.roleTitle === inv.vacancyTitle)),
      );
      if (plc) {
        plc.nextBillingDate = nextDue;
        plc.updatedAt = nowIso;
      }
    }

    platformStore.save();
    return { paidCount: targets.length, invoices: targets };
  }

  // ==================== COMPANY TEAM / APP USERS ====================
  public listOrganisationUsers(organisationId: string): Array<Omit<OrganisationUserRecord, 'passwordHash'>> {
    return platformStore
      .getState()
      .organisationUsers.filter((u) => u.organisationId === organisationId)
      .map(({ passwordHash: _pw, ...safe }) => safe);
  }

  public async addOrganisationUser(
    organisationId: string,
    input: {
      fullName: string;
      email: string;
      password: string;
      role: OrganisationUserRecord['role'];
    },
  ): Promise<Omit<OrganisationUserRecord, 'passwordHash'>> {
    const state = platformStore.getState();
    const org = state.organisations.find((o) => o.id === organisationId);
    if (!org) throw new Error('Organisation not found');

    const cleanEmail = input.email.trim().toLowerCase();
    const exists =
      state.organisations.some((o) => o.businessEmail === cleanEmail) ||
      state.organisationUsers.some((u) => u.email === cleanEmail);
    if (exists) {
      throw new Error('A user with this email already exists.');
    }

    const now = new Date().toISOString();
    const record: OrganisationUserRecord = {
      id: `ousr-${crypto.randomUUID().slice(0, 10)}`,
      organisationId,
      fullName: input.fullName.trim(),
      email: cleanEmail,
      passwordHash: platformStore.hashPassword(input.password),
      role: input.role,
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
    state.organisationUsers.unshift(record);
    platformStore.save();

    const portalUrl = `${process.env.PUBLIC_WEB_URL || 'https://nexora.empirelabs.digital'}/company/login`;
    sendMail({
      to: cleanEmail,
      subject: `You were added to ${org.tradingName || org.registeredName} on Nexora AI`,
      html: `<div style="font-family:Montserrat,Arial,sans-serif;padding:20px;"><h2>Welcome to ${org.tradingName || org.registeredName}</h2><p>Hi ${record.fullName},</p><p>You have been added as a <strong>${record.role}</strong> on the Nexora AI Company Portal.</p><p>Sign in at <a href="${portalUrl}">${portalUrl}</a> using your email <code>${cleanEmail}</code>.</p></div>`,
    }).catch(() => undefined);

    const { passwordHash: _pw, ...safe } = record;
    return safe;
  }

  public updateOrganisationUser(
    organisationId: string,
    userId: string,
    updates: { role?: OrganisationUserRecord['role']; status?: OrganisationUserRecord['status'] },
  ): Omit<OrganisationUserRecord, 'passwordHash'> {
    const state = platformStore.getState();
    const user = state.organisationUsers.find((u) => u.id === userId && u.organisationId === organisationId);
    if (!user) throw new Error('User not found');
    if (updates.role) user.role = updates.role;
    if (updates.status) user.status = updates.status;
    user.updatedAt = new Date().toISOString();
    platformStore.save();
    const { passwordHash: _pw, ...safe } = user;
    return safe;
  }

  public removeOrganisationUser(organisationId: string, userId: string): void {
    const state = platformStore.getState();
    state.organisationUsers = state.organisationUsers.filter(
      (u) => !(u.id === userId && u.organisationId === organisationId),
    );
    platformStore.save();
  }

  // ==================== VACANCY MATCHING CANDIDATES & INTERVIEW INVITES ====================
  public async getMatchingCandidatesForVacancy(organisationId: string, vacancyId: string) {
    const state = platformStore.getState();
    const vac = state.vacancies.find((v) => v.id === vacancyId && v.organisationId === organisationId);
    if (!vac) throw new Error('Vacancy not found or access denied');

    const [fbCandidates, fbUsers] = await Promise.all([
      platformStore.fetchFirestoreCollection('candidates'),
      platformStore.fetchFirestoreCollection('users'),
    ]);

    type CandidatePoolEntry = {
      userUid: string;
      customerId: string;
      candidateName: string;
      candidateEmail: string;
      candidatePhone?: string;
      headline?: string;
      location?: string;
      skills: string[];
      qualifications?: string;
      workExperience?: string;
      yearsExperience: number;
      hasCandidateProfile: boolean;
      hasTranscript: boolean;
      assessmentScore?: number;
      transcriptId?: string;
      hasCv: boolean;
      cvFileName?: string;
      cvDownloadUrl?: string;
    };

    const byKey = new Map<string, CandidatePoolEntry>();

    // 1. Seed from Firestore `candidates` collection first (users with candidate profiles)
    for (const c of fbCandidates) {
      const uid = String(c.userId || c.uid || c.id || '').trim();
      const email = String(c.email || '').trim().toLowerCase();
      if (!uid && !email) continue;
      const key = uid || email;
      const skills: string[] = Array.isArray(c.skills)
        ? c.skills.map(String)
        : typeof c.skills === 'string'
          ? c.skills.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [];
      byKey.set(key, {
        userUid: uid || key,
        customerId: uid || key,
        candidateName: String(c.fullName || c.name || c.displayName || email.split('@')[0] || 'Candidate'),
        candidateEmail: email || `${uid}@nexora.user`,
        candidatePhone: c.phone ? String(c.phone) : undefined,
        headline: c.targetRole || c.headline || c.summary ? String(c.targetRole || c.headline || c.summary).slice(0, 140) : undefined,
        location: c.location || c.country ? String(c.location || c.country) : undefined,
        skills,
        qualifications: c.qualifications || c.education ? String(c.qualifications || c.education) : undefined,
        workExperience: c.experience || c.workExperience ? String(c.experience || c.workExperience) : undefined,
        yearsExperience: Number(c.yearsExperience || 0) || 0,
        hasCandidateProfile: true,
        hasTranscript: false,
        hasCv: Boolean(c.cvText || c.cvFileName),
        cvFileName: c.cvFileName ? String(c.cvFileName) : undefined,
      });
    }

    // 2. Merge Firestore `users` collection ({ ...user, prerequisites: [{ type: 'JOB_AGENT', ... }, ...] })
    for (const u of fbUsers) {
      const uid = String(u.uid || u.id || '').trim();
      const email = String(u.email || u.profile?.email || '').trim().toLowerCase();
      if (!uid && !email) continue;
      const key = uid || email;
      const prereqArr: Array<Record<string, any>> = Array.isArray(u.prerequisites) ? u.prerequisites : [];
      const jobP = prereqArr.find((p) => p?.type === 'JOB_AGENT') || {};
      const prof = (u.profile && typeof u.profile === 'object' ? u.profile : {}) as Record<string, any>;
      const hasProfile = Boolean(
        jobP.targetRole || jobP.cvFileName || prof.fullName || u.fullName || u.phone || prereqArr.length > 0,
      );
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.candidateEmail && email) existing.candidateEmail = email;
        if ((!existing.candidateName || existing.candidateName === 'Candidate') && (u.displayName || prof.fullName || u.fullName || u.name)) {
          existing.candidateName = String(u.displayName || prof.fullName || u.fullName || u.name);
        }
        if (hasProfile) existing.hasCandidateProfile = true;
      } else {
        byKey.set(key, {
          userUid: uid || key,
          customerId: uid || key,
          candidateName: String(u.displayName || prof.fullName || u.fullName || u.name || (email ? email.split('@')[0] : 'Nexora User')),
          candidateEmail: email || `${uid}@nexora.user`,
          candidatePhone: u.phone || prof.phone ? String(u.phone || prof.phone) : undefined,
          headline: jobP.targetRole || prof.targetRole || u.targetRole ? String(jobP.targetRole || prof.targetRole || u.targetRole) : undefined,
          location: u.location || prof.location ? String(u.location || prof.location) : undefined,
          skills: [],
          yearsExperience: 0,
          hasCandidateProfile: hasProfile,
          hasTranscript: false,
          hasCv: Boolean(jobP.cvFileName || prof.cvFileName || u.cvFileName),
          cvFileName: jobP.cvFileName || prof.cvFileName || u.cvFileName ? String(jobP.cvFileName || prof.cvFileName || u.cvFileName) : undefined,
        });
      }
    }

    // 3. Merge existing platform supporting docs (CVs), transcripts, and prior applications
    for (const doc of state.supportingDocuments) {
      if (doc.docType !== 'CV') continue;
      const entry = byKey.get(doc.userUid);
      if (entry) {
        entry.hasCv = true;
        entry.hasCandidateProfile = true;
        entry.cvFileName = entry.cvFileName || doc.fileName;
        entry.cvDownloadUrl = doc.downloadUrl;
      }
    }

    for (const tr of state.transcripts) {
      const key = tr.userUid;
      const existing = byKey.get(key);
      if (existing) {
        existing.hasTranscript = true;
        existing.hasCandidateProfile = true;
        existing.assessmentScore = Math.max(existing.assessmentScore || 0, tr.percentageScore || 0);
        existing.transcriptId = tr.id;
      } else {
        byKey.set(key, {
          userUid: tr.userUid,
          customerId: tr.customerId || tr.userUid,
          candidateName: tr.candidateName || 'Screened Candidate',
          candidateEmail: tr.candidateEmail || `${tr.userUid}@nexora.user`,
          skills: [],
          yearsExperience: 0,
          hasCandidateProfile: true,
          hasTranscript: true,
          assessmentScore: tr.percentageScore,
          transcriptId: tr.id,
          hasCv: false,
        });
      }
    }

    for (const a of state.applications) {
      const key = a.userUid || a.candidateEmail.toLowerCase();
      const existing = byKey.get(key);
      if (existing) {
        existing.hasCandidateProfile = true;
        if (existing.skills.length === 0 && a.skills?.length) existing.skills = [...a.skills];
        if (!existing.qualifications && a.qualifications) existing.qualifications = a.qualifications;
        if (!existing.workExperience && a.workExperience) existing.workExperience = a.workExperience;
        if (!existing.cvDownloadUrl && a.cvDownloadUrl) {
          existing.hasCv = true;
          existing.cvFileName = a.cvFileName;
          existing.cvDownloadUrl = a.cvDownloadUrl;
        }
      } else {
        byKey.set(key, {
          userUid: a.userUid,
          customerId: a.customerId,
          candidateName: a.candidateName,
          candidateEmail: a.candidateEmail,
          candidatePhone: a.candidatePhone,
          skills: [...(a.skills || [])],
          qualifications: a.qualifications,
          workExperience: a.workExperience,
          yearsExperience: 0,
          hasCandidateProfile: true,
          hasTranscript: Boolean(a.transcriptId),
          assessmentScore: a.transcriptScore,
          transcriptId: a.transcriptId,
          hasCv: Boolean(a.cvFileName || a.cvDownloadUrl),
          cvFileName: a.cvFileName,
          cvDownloadUrl: a.cvDownloadUrl,
        });
      }
    }

    const reqSkills = (vac.requiredSkills || []).map((s) => s.toLowerCase().trim()).filter(Boolean);
    const titleWords = `${vac.title} ${vac.description || ''}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3);

    const results = Array.from(byKey.values()).map((c) => {
      const profileBlob = `${c.headline || ''} ${c.qualifications || ''} ${c.workExperience || ''} ${c.skills.join(' ')}`.toLowerCase();
      const matchedSkills = reqSkills.filter((sk) => profileBlob.includes(sk));
      const skillRatio = reqSkills.length > 0 ? matchedSkills.length / reqSkills.length : 0.4;
      const wordHits = titleWords.filter((w) => profileBlob.includes(w)).length;
      const keywordScore = Math.min(20, wordHits * 4);
      const expScore =
        vac.minYearsExperience > 0
          ? c.yearsExperience >= vac.minYearsExperience
            ? 15
            : Math.round((c.yearsExperience / vac.minYearsExperience) * 15)
          : 10;
      const transcriptBonus = c.hasTranscript ? 15 : 0;
      const cvBonus = c.hasCv ? 10 : 0;
      const rawScore = Math.round(skillRatio * 40 + keywordScore + expScore + transcriptBonus + cvBonus);
      const matchScore = Math.max(c.hasCandidateProfile ? 35 : 15, Math.min(100, rawScore));

      const appForVac = state.applications.find(
        (a) =>
          a.vacancyId === vacancyId &&
          a.organisationId === organisationId &&
          (a.userUid === c.userUid || a.candidateEmail.toLowerCase() === c.candidateEmail.toLowerCase()),
      );
      const invForVac = state.interviews.find(
        (iv) =>
          iv.vacancyId === vacancyId &&
          iv.organisationId === organisationId &&
          iv.status !== 'CANCELLED' &&
          (iv.userUid === c.userUid || iv.candidateEmail.toLowerCase() === c.candidateEmail.toLowerCase()),
      );

      const userDocs = state.supportingDocuments
        .filter((d) => d.userUid === c.userUid)
        .map((d) => ({
          id: d.id,
          docType: d.docType,
          label: d.label,
          fileName: d.fileName,
          downloadUrl: d.downloadUrl,
          createdAt: d.createdAt,
        }));
      const userTranscripts = state.transcripts
        .filter((t) => t.userUid === c.userUid)
        .map((t) => ({
          id: t.id,
          assignmentTitle: t.assignmentTitle,
          percentageScore: t.percentageScore,
          pdfDownloadUrl: t.pdfDownloadUrl,
          submittedAt: t.submittedAt,
        }));

      return {
        ...c,
        documents: userDocs,
        transcripts: userTranscripts,
        matchedSkills,
        matchScore,
        alreadyApplied: Boolean(appForVac),
        applicationStatus: appForVac?.status,
        alreadyInvited: Boolean(invForVac),
        interviewStatus: invForVac?.status,
      };
    });

    // Always return users WITH candidate profiles FIRST, then sort by matchScore descending
    results.sort((a, b) => {
      if (a.hasCandidateProfile !== b.hasCandidateProfile) {
        return a.hasCandidateProfile ? -1 : 1;
      }
      if (b.matchScore !== a.matchScore) {
        return b.matchScore - a.matchScore;
      }
      return (b.assessmentScore || 0) - (a.assessmentScore || 0);
    });

    return results.slice(0, 60);
  }

  public async autoApplyMatchedCandidate(
    organisationId: string,
    vacancyId: string,
    input: {
      userUid: string;
      customerId?: string;
      candidateName: string;
      candidateEmail: string;
    },
  ): Promise<VacancyApplicationRecord> {
    const state = platformStore.getState();
    const org = state.organisations.find((o) => o.id === organisationId);
    const vac = state.vacancies.find((v) => v.id === vacancyId && v.organisationId === organisationId);
    if (!org || !vac) throw new Error('Organisation or vacancy not found');

    const existing = state.applications.find(
      (a) =>
        a.organisationId === organisationId &&
        a.vacancyId === vacancyId &&
        (a.userUid === input.userUid || a.candidateEmail.toLowerCase() === input.candidateEmail.toLowerCase()),
    );
    if (existing) {
      return existing;
    }

    const fbCandidates = await platformStore.fetchFirestoreCollection('candidates');
    const dossier = fbCandidates.find(
      (c) => c.userId === input.userUid || c.uid === input.userUid || c.id === input.userUid,
    );
    const cvDoc = state.supportingDocuments.find(
      (d) => d.userUid === input.userUid && d.docType === 'CV',
    );
    const transcript = state.transcripts.find((t) => t.userUid === input.userUid);
    const skills: string[] = Array.isArray(dossier?.skills)
      ? dossier.skills.map(String)
      : typeof dossier?.skills === 'string'
        ? dossier.skills.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [];

    const now = new Date().toISOString();
    const app: VacancyApplicationRecord = {
      id: `app-${crypto.randomUUID().slice(0, 10)}`,
      referenceCode: `AUTO-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      vacancyId: vac.id,
      vacancyTitle: vac.title,
      organisationId,
      organisationName: org.tradingName || org.registeredName,
      customerId: input.customerId || input.userUid,
      userUid: input.userUid,
      candidateName: input.candidateName,
      candidateEmail: input.candidateEmail,
      candidatePhone: dossier?.phone ? String(dossier.phone) : undefined,
      skills,
      qualifications:
        dossier?.qualifications || dossier?.education
          ? String(dossier.qualifications || dossier.education)
          : undefined,
      workExperience:
        dossier?.experience || dossier?.workExperience
          ? String(dossier.experience || dossier.workExperience)
          : undefined,
      cvFileName: cvDoc?.fileName || (dossier?.cvFileName ? String(dossier.cvFileName) : undefined),
      cvDownloadUrl: cvDoc?.downloadUrl,
      transcriptId: transcript?.id,
      transcriptScore: transcript?.percentageScore,
      transcriptPdfUrl: transcript?.pdfDownloadUrl,
      consentToShare: true,
      status: 'RECEIVED',
      internalNotes: 'Auto-submitted from Nexora AI Smart Matching Candidates.',
      communications: [],
      appliedAt: now,
      updatedAt: now,
    };

    await this.scoreApplicationInternal(app, vac);
    state.applications.unshift(app);
    state.notifications.unshift({
      id: `ntf-${crypto.randomUUID().slice(0, 8)}`,
      customerId: app.customerId,
      userUid: app.userUid,
      type: 'AUTO_APPLICATION_SUBMITTED',
      title: `Matched & Auto-Applied: ${vac.title}`,
      message: `${app.organisationName} selected your Nexora AI profile for ${vac.title} and auto-submitted your CV & documents (Ref: ${app.referenceCode}).`,
      actionUrl: '/app',
      isRead: false,
      createdAt: now,
    });
    platformStore.save();
    return app;
  }

  public async inviteMatchedCandidateToInterview(
    organisationId: string,
    vacancyId: string,
    input: {
      userUid: string;
      customerId?: string;
      candidateName: string;
      candidateEmail: string;
      interviewDate: string;
      interviewTime: string;
      timezone?: string;
      interviewType?: InterviewRecord['interviewType'];
      interviewProvider?: InterviewProviderType;
      aiQuestions?: string;
      maxRetakes?: number;
      locationOrLink?: string;
      instructions?: string;
    },
  ): Promise<InterviewRecord> {
    const state = platformStore.getState();
    const org = state.organisations.find((o) => o.id === organisationId);
    const vac = state.vacancies.find((v) => v.id === vacancyId && v.organisationId === organisationId);
    if (!org || !vac) throw new Error('Organisation or vacancy not found');

    const existing = state.interviews.find(
      (iv) =>
        iv.organisationId === organisationId &&
        iv.vacancyId === vacancyId &&
        iv.status !== 'CANCELLED' &&
        (iv.userUid === input.userUid || iv.candidateEmail.toLowerCase() === input.candidateEmail.toLowerCase()),
    );
    if (existing) {
      throw new Error(`${input.candidateName} has already been invited for this vacancy.`);
    }

    const now = new Date().toISOString();
    const provider: InterviewProviderType = input.interviewProvider || 'EXTERNAL';
    if (
      (provider === 'GOOGLE_LIVE' || provider === 'NUANCE' || provider === 'TAVUS') &&
      !input.aiQuestions?.trim()
    ) {
      throw new Error('Please enter the interview questions for the AI interviewer.');
    }
    const ratePerMinuteUsd = INTERVIEW_PROVIDER_RATES_USD[provider] ?? 0;
    const resolvedLocation =
      input.locationOrLink?.trim() ||
      (provider === 'GOOGLE_LIVE'
        ? 'Nexora AI Live Room (Google Live • $0.50/min)'
        : provider === 'NUANCE'
          ? 'Nexora AI Video Room (Nuance Persona • $2.00/min)'
          : provider === 'TAVUS'
            ? 'Nexora Human AI Video Room (Tavus CVI • $2.00/min)'
            : 'Provided by organisation');

    const interview: InterviewRecord = {
      id: `int-${crypto.randomUUID().slice(0, 10)}`,
      organisationId,
      vacancyId,
      customerId: input.customerId || input.userUid,
      userUid: input.userUid,
      companyName: org.tradingName || org.registeredName,
      jobTitle: vac.title,
      candidateName: input.candidateName,
      candidateEmail: input.candidateEmail,
      interviewDate: input.interviewDate,
      interviewTime: input.interviewTime,
      timezone: input.timezone || 'Africa/Johannesburg',
      interviewType: input.interviewType || 'ONLINE',
      interviewProvider: provider,
      ratePerMinuteUsd,
      aiQuestions: input.aiQuestions?.trim() || undefined,
      maxRetakes: Math.max(0, Math.min(5, Math.floor(Number(input.maxRetakes ?? 0) || 0))),
      attemptsUsed: 0,
      locationOrLink: resolvedLocation,
      instructions: input.instructions,
      status: 'INVITED',
      createdAt: now,
      updatedAt: now,
    };

    state.interviews.unshift(interview);
    state.notifications.unshift({
      id: `ntf-${crypto.randomUUID().slice(0, 8)}`,
      customerId: interview.customerId,
      userUid: interview.userUid,
      type: 'INTERVIEW_INVITATION',
      title: `Interview Invitation: ${vac.title} at ${interview.companyName}`,
      message: `${interview.companyName} matched your Nexora profile for ${vac.title} and invited you to interview on ${interview.interviewDate} at ${interview.interviewTime}. Accept in Interviews to auto-apply!`,
      actionUrl: '/app',
      isRead: false,
      createdAt: now,
    });
    platformStore.save();

    if (input.candidateEmail && !input.candidateEmail.endsWith('@nexora.user')) {
      const appUrl = `${process.env.PUBLIC_WEB_URL || 'https://nexora.empirelabs.digital'}/app`;
      sendMail({
        to: input.candidateEmail,
        subject: `Interview Invitation: ${vac.title} — ${interview.companyName} (Nexora AI)`,
        html: `<div style="font-family:Montserrat,Arial,sans-serif;padding:20px;"><h2>You've Been Matched &amp; Invited for an Interview!</h2><p>Hello ${interview.candidateName},</p><p><strong>${interview.companyName}</strong> found your profile through Nexora AI Smart Matching for <strong>${vac.title}</strong> and would like to interview you.</p><ul><li><strong>Date &amp; Time:</strong> ${interview.interviewDate} at ${interview.interviewTime} (${interview.timezone})</li><li><strong>Format:</strong> ${interview.interviewType}</li><li><strong>Link / Location:</strong> ${interview.locationOrLink}</li></ul><p>Open your <a href="${appUrl}">Nexora AI Interviews</a> tab and click <strong>Interested — Accept &amp; Auto-Apply</strong> to automatically submit your application and confirm your interview slot.</p></div>`,
      }).catch(() => undefined);
    }

    return interview;
  }

  public async respondToInterviewInvitation(
    interviewId: string,
    userUid: string,
    action: 'ACCEPT' | 'DECLINE',
  ): Promise<{ interview: InterviewRecord; application: VacancyApplicationRecord | null }> {
    const state = platformStore.getState();
    const interview = state.interviews.find((iv) => iv.id === interviewId);
    if (!interview) throw new Error('Interview invitation not found');
    if (interview.userUid !== userUid && interview.customerId !== userUid) {
      throw new Error('Unauthorized to respond to this invitation');
    }

    const now = new Date().toISOString();

    if (action === 'DECLINE') {
      interview.status = 'CANCELLED';
      interview.candidateFeedback = 'Candidate declined interview invitation.';
      interview.updatedAt = now;
      state.notifications.unshift({
        id: `ntf-${crypto.randomUUID().slice(0, 8)}`,
        organisationId: interview.organisationId,
        type: 'INTERVIEW_DECLINED',
        title: `Interview Declined: ${interview.candidateName}`,
        message: `${interview.candidateName} declined the interview invitation for ${interview.jobTitle}.`,
        actionUrl: '/company/interviews',
        isRead: false,
        createdAt: now,
      });
      platformStore.save();
      return { interview, application: null };
    }

    // ACCEPT -> trigger auto-submission if not yet applied
    let application =
      (interview.applicationId
        ? state.applications.find((a) => a.id === interview.applicationId)
        : undefined) ||
      state.applications.find(
        (a) =>
          a.organisationId === interview.organisationId &&
          a.vacancyId === interview.vacancyId &&
          (a.userUid === userUid || a.candidateEmail.toLowerCase() === interview.candidateEmail.toLowerCase()),
      ) ||
      null;

    if (!application) {
      const vac = state.vacancies.find((v) => v.id === interview.vacancyId);
      const fbCandidates = await platformStore.fetchFirestoreCollection('candidates');
      const dossier = fbCandidates.find(
        (c) => c.userId === userUid || c.uid === userUid || c.id === userUid,
      );
      const cvDoc = state.supportingDocuments.find(
        (d) => d.userUid === userUid && d.docType === 'CV',
      );
      const transcript = state.transcripts.find((t) => t.userUid === userUid);
      const skills: string[] = Array.isArray(dossier?.skills)
        ? dossier.skills.map(String)
        : typeof dossier?.skills === 'string'
          ? dossier.skills.split(',').map((s: string) => s.trim()).filter(Boolean)
          : [];

      const createdApp: VacancyApplicationRecord = {
        id: `app-${crypto.randomUUID().slice(0, 10)}`,
        referenceCode: `AUTO-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
        vacancyId: interview.vacancyId || '',
        vacancyTitle: interview.jobTitle,
        organisationId: interview.organisationId,
        organisationName: interview.companyName,
        customerId: interview.customerId || userUid,
        userUid,
        candidateName: interview.candidateName,
        candidateEmail: interview.candidateEmail,
        candidatePhone: dossier?.phone ? String(dossier.phone) : undefined,
        skills,
        qualifications: dossier?.qualifications || dossier?.education ? String(dossier.qualifications || dossier.education) : undefined,
        workExperience: dossier?.experience || dossier?.workExperience ? String(dossier.experience || dossier.workExperience) : undefined,
        cvFileName: cvDoc?.fileName || (dossier?.cvFileName ? String(dossier.cvFileName) : undefined),
        cvDownloadUrl: cvDoc?.downloadUrl,
        transcriptId: transcript?.id,
        transcriptScore: transcript?.percentageScore,
        transcriptPdfUrl: transcript?.pdfDownloadUrl,
        consentToShare: true,
        status: 'INTERVIEW_SCHEDULED',
        internalNotes: 'Auto-submitted when candidate accepted employer interview invitation.',
        communications: [],
        appliedAt: now,
        updatedAt: now,
      };
      await this.scoreApplicationInternal(createdApp, vac);
      state.applications.unshift(createdApp);
      application = createdApp;
    } else if (application.status === 'RECEIVED' || application.status === 'SCREENING' || application.status === 'SHORTLISTED') {
      application.status = 'INTERVIEW_SCHEDULED';
      application.updatedAt = now;
    }

    interview.applicationId = application!.id;
    interview.status = 'SCHEDULED';
    interview.candidateFeedback = 'Candidate accepted interview invitation & auto-submitted application.';
    interview.updatedAt = now;

    state.notifications.unshift({
      id: `ntf-${crypto.randomUUID().slice(0, 8)}`,
      organisationId: interview.organisationId,
      type: 'INTERVIEW_ACCEPTED_AUTO_APPLIED',
      title: `Candidate Accepted & Auto-Applied: ${interview.candidateName}`,
      message: `${interview.candidateName} accepted your interview invite for ${interview.jobTitle}. Their application (${application!.referenceCode}) is now in your pipeline.`,
      actionUrl: '/company/applications',
      isRead: false,
      createdAt: now,
    });

    platformStore.save();
    return { interview, application };
  }
}
