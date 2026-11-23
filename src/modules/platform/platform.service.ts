import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import pdfParse from 'pdf-parse';
import { logger } from '../../utils/logger';
import { sendMail } from '../../tools/email.service';
import { documentGeneratorService } from '../../tools/document-generator.service';
import { paystackService } from '../../tools/paystack.service';
import { OpenClawService } from '../../openclaw/openclaw.service';
import {
  ApplicationStatusType,
  DocumentAccessLogRecord,
  InterviewRecord,
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
  }): Promise<{ organisation: Omit<OrganisationRecord, 'passwordHash'>; verificationToken: string }> {
    const state = platformStore.getState();
    const emailNorm = input.businessEmail.trim().toLowerCase();
    if (state.organisations.some((o) => o.businessEmail === emailNorm)) {
      throw new Error('An organisation with this business email is already registered');
    }

    const now = new Date().toISOString();
    const verificationToken = crypto.randomBytes(16).toString('hex');
    const org: OrganisationRecord = {
      id: `org-${crypto.randomUUID().slice(0, 10)}`,
      registeredName: input.registeredName.trim(),
      tradingName: input.tradingName?.trim(),
      registrationNumber: input.registrationNumber?.trim(),
      country: input.country.trim(),
      businessAddress: input.businessAddress.trim(),
      website: input.website?.trim(),
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

    // Send verification email (best effort)
    try {
      await sendMail({
        to: org.businessEmail,
        subject: `Verify your Nexora AI Organisation Account — ${org.registeredName}`,
        html: `<div style="font-family:Montserrat,Arial,sans-serif;padding:20px;"><h2>Welcome to Nexora AI</h2><p>Hello ${org.contactFullName}, please confirm ownership of your organisation email using verification token: <code>${verificationToken}</code>.</p><h3>What to Expect on Nexora AI</h3><ul><li>Publish vacancies or opportunities with a Monthly USD Offer and optional Assessment Transcript requirement.</li><li>Receive AI-scored CVs (0–100%) and verified candidate assessment transcripts.</li><li>Schedule Online, Telephone, or In-Person interviews with automatic Google Calendar &amp; .ics invites.</li><li>Pay a transparent 10% monthly platform fee via Paystack only for candidates you accept/hire.</li></ul></div>`,
      });
    } catch {
      // non-fatal if SMTP not configured locally
    }

    const { passwordHash: _pw, ...safeOrg } = org;
    return { organisation: safeOrg, verificationToken };
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
    if (token && org.verificationToken && token !== org.verificationToken) {
      throw new Error('Invalid email verification token');
    }
    org.emailVerified = true;
    org.status = 'VERIFIED';
    org.updatedAt = new Date().toISOString();
    platformStore.save();
    const { passwordHash: _pw, ...safeOrg } = org;
    return safeOrg;
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

    if (org.requireTranscript && !input.transcriptId) {
      throw new Error(
        `${org.tradingName || org.registeredName} requires a verified Nexora Assessment Transcript with every application. Please complete an Assignment first.`,
      );
    }

    const transcript = input.transcriptId
      ? state.transcripts.find((t) => t.id === input.transcriptId && t.userUid === input.userUid)
      : state.transcripts.find((t) => t.userUid === input.userUid);

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
  ): VacancyApplicationRecord[] {
    let items = platformStore.getState().applications.filter((a) => a.organisationId === organisationId);
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
    return items;
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
          (p) => p.organisationId === organisationId && p.vacancyId === app.vacancyId && p.candidateName === app.candidateName,
        );
        let plc = existingPlc;
        if (!plc) {
          plc = {
            id: `plc-${crypto.randomUUID().slice(0, 10)}`,
            organisationId,
            vacancyId: app.vacancyId,
            customerId: app.customerId,
            candidateName: app.candidateName,
            roleTitle: app.vacancyTitle,
            contractModel: 'DIRECT_PLACEMENT',
            startDate: app.updatedAt.slice(0, 10),
            monthlySalaryCents: Math.round(offerUsd * 100),
            currency: 'USD',
            legalEntityArranged: true,
            taxComplianceReady: true,
            onboardingStatus: 'ACTIVE',
            timesheets: [],
            payrollRecords: [],
            createdAt: app.updatedAt,
            updatedAt: app.updatedAt,
          };
          state.placements.unshift(plc);
        }
        if (org && offerUsd > 0) {
          const billingMonth = app.updatedAt.slice(0, 7);
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
            offerAmountUsd: offerUsd,
          });
        }
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
      locationOrLink: string;
      instructions?: string;
    },
  ): Promise<InterviewRecord> {
    const state = platformStore.getState();
    const org = state.organisations.find((o) => o.id === organisationId);
    if (!org) throw new Error('Organisation not found');

    const now = new Date().toISOString();
    const companyName = org.tradingName || org.registeredName;
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
      locationOrLink: input.locationOrLink,
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
    const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Interview: ${input.jobTitle} — ${companyName}`)}&dates=${startDt}/${endDt}&ctz=${encodeURIComponent(input.timezone || 'Africa/Johannesburg')}&details=${encodeURIComponent(input.instructions || `Interview with ${companyName} via Nexora AI.`)}&location=${encodeURIComponent(input.locationOrLink)}`;

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
    Object.assign(interview, updates, { updatedAt: new Date().toISOString() });

    if (updates.status && updates.status !== prevStatus) {
      state.notifications.unshift({
        id: `ntf-${crypto.randomUUID().slice(0, 8)}`,
        customerId: interview.customerId,
        userUid: interview.userUid,
        type: 'INTERVIEW_UPDATE',
        title: `Interview ${updates.status}: ${interview.jobTitle}`,
        message: `${interview.companyName} updated your interview to ${updates.status} (${interview.interviewDate} ${interview.interviewTime}).`,
        actionUrl: '/app',
        isRead: false,
        createdAt: interview.updatedAt,
      });

      sendMail({
        to: interview.candidateEmail,
        subject: `Interview ${updates.status}: ${interview.jobTitle} — ${interview.companyName}`,
        html: `<div style="font-family:Montserrat,Arial,sans-serif;padding:20px;"><p>Hi ${interview.candidateName}, your interview with <strong>${interview.companyName}</strong> for <strong>${interview.jobTitle}</strong> is now marked as <strong>${updates.status}</strong> (${interview.interviewDate} at ${interview.interviewTime} ${interview.timezone}).</p></div>`,
      }).catch(() => undefined);
    }

    platformStore.save();
    return interview;
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
    return platformStore.getState().placements.filter((p) => p.organisationId === organisationId);
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
    return platformStore.getState().invoices.filter((i) => i.organisationId === organisationId);
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
      html: `<div style="font-family:Montserrat,Arial,sans-serif;padding:20px;"><h2>Nexora AI Monthly Platform Invoice</h2><p>Hello ${orgName},</p><p>Your monthly invoice (<strong>${invoiceNumber}</strong>) for accepted candidate <strong>${params.candidateName}</strong> (${params.vacancyTitle}) is ready.</p><ul><li><strong>Monthly Offer Value:</strong> $${params.offerAmountUsd.toFixed(2)} USD</li><li><strong>Nexora Platform Fee (10%):</strong> $${feeAmountUsd.toFixed(2)} USD</li><li><strong>Billing Month:</strong> ${params.billingMonth}</li></ul><p>Please pay online via Paystack in your <strong>Nexora Company Dashboard → Billing & Invoices</strong>.</p></div>`,
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
    const created: MonthlyInvoiceRecord[] = [];
    for (const app of hiredApps) {
      const vac = state.vacancies.find((v) => v.id === app.vacancyId);
      const offerUsd = Number(vac?.monthlyOfferUsd || 0);
      if (offerUsd <= 0) continue;
      const inv = await this.createOrGetMonthlyInvoice({
        org,
        applicationId: app.id,
        vacancyId: app.vacancyId,
        vacancyTitle: app.vacancyTitle,
        category: vac?.category || 'EMPLOYMENT',
        candidateName: app.candidateName,
        candidateEmail: app.candidateEmail,
        billingMonth,
        offerAmountUsd: offerUsd,
      });
      created.push(inv);
    }
    return created;
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
    platformStore.save();
    return inv;
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
}
