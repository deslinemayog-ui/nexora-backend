import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { OpenClawService } from '../openclaw/openclaw.service';
import { uploadToFirebaseStorage } from '../tools/firebase-storage.service';
import { AssessmentService } from '../modules/platform/assessment.service';
import { PlatformService } from '../modules/platform/platform.service';
import { platformStore } from '../modules/platform/platform.store';

export function registerPlatformRoutes(
  app: FastifyInstance,
  deps: { openclawService: OpenClawService },
): void {
  const assessmentService = new AssessmentService(deps.openclawService);
  const platformService = new PlatformService(deps.openclawService);

  // ==================== ASSIGNMENTS & AI ASSESSMENT ENGINE ====================
  app.get('/api/v1/assignments', async (request) => {
    const q = z
      .object({
        userUid: z.string().min(1),
        customerId: z.string().optional(),
        category: z.enum(['EMPLOYMENT', 'RELOCATION', 'SCHOLARSHIP']).optional(),
      })
      .parse(request.query);

    const data = assessmentService.listAssignmentsForUser({
      userUid: q.userUid,
      customerId: q.customerId || q.userUid,
      category: q.category,
    });
    return { ok: true, data };
  });

  app.post('/api/v1/assignments', async (request) => {
    const body = z
      .object({
        userUid: z.string().min(1),
        customerId: z.string().optional(),
        vacancyId: z.string().optional(),
        title: z.string().min(2),
        category: z.enum(['EMPLOYMENT', 'RELOCATION', 'SCHOLARSHIP']),
        relatedOpportunity: z.string().min(2),
        providerName: z.string().optional(),
        durationMinutes: z.number().int().min(5).max(120).optional(),
        passingScorePercent: z.number().int().min(10).max(100).optional(),
        prerequisiteData: z.record(z.any()).optional(),
      })
      .parse(request.body);

    const data = assessmentService.createAssignment({
      ...body,
      customerId: body.customerId || body.userUid,
    });
    return { ok: true, data };
  });

  app.post('/api/v1/assignments/:id/prerequisites', async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        userUid: z.string().min(1),
        data: z.record(z.any()),
      })
      .parse(request.body);

    const updated = assessmentService.savePrerequisites(params.id, body.userUid, body.data);
    return { ok: true, data: updated };
  });

  app.post('/api/v1/assignments/:id/start', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        userUid: z.string().min(1),
        rulesAccepted: z.boolean(),
      })
      .parse(request.body);

    try {
      const started = await assessmentService.startSession({
        assignmentId: params.id,
        userUid: body.userUid,
        rulesAccepted: body.rulesAccepted,
      });
      return { ok: true, data: started };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Cannot start assessment' });
    }
  });

  app.post('/api/v1/assessments/sessions/:sessionId/answer', async (request, reply) => {
    const params = z.object({ sessionId: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        userUid: z.string().min(1),
        questionId: z.string().min(1),
        selectedIndex: z.number().int().min(0).max(3),
        timeSpentSec: z.number().min(0).default(0),
      })
      .parse(request.body);

    try {
      const res = assessmentService.saveAnswer({
        sessionId: params.sessionId,
        userUid: body.userUid,
        questionId: body.questionId,
        selectedIndex: body.selectedIndex,
        timeSpentSec: body.timeSpentSec,
      });
      return { ok: true, data: res };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Cannot save answer' });
    }
  });

  app.post('/api/v1/assessments/sessions/:sessionId/submit', async (request, reply) => {
    const params = z.object({ sessionId: z.string().min(1) }).parse(request.params);
    const body = z.object({ userUid: z.string().min(1) }).parse(request.body);

    try {
      const result = await assessmentService.submitSession({
        sessionId: params.sessionId,
        userUid: body.userUid,
      });
      return { ok: true, data: result };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Cannot submit assessment' });
    }
  });

  app.get('/api/v1/transcripts', async (request) => {
    const q = z.object({ userUid: z.string().min(1) }).parse(request.query);
    return { ok: true, data: assessmentService.listTranscriptsForUser(q.userUid) };
  });

  // ==================== ORGANISATIONS (COMPANY & AGENT PORTALS) ====================
  app.post('/api/v1/organisations/register', async (request, reply) => {
    const body = z
      .object({
        registeredName: z.string().min(2),
        tradingName: z.string().optional(),
        registrationNumber: z.string().optional(),
        country: z.string().min(2),
        businessAddress: z.string().min(3),
        website: z.string().optional(),
        description: z.string().min(5),
        category: z.enum([
          'HIRING_COMPANY',
          'RECRUITMENT_AGENCY',
          'STAFFING_COMPANY',
          'INVESTMENT_PROVIDER',
          'RELOCATION_AGENCY',
          'IMMIGRATION_CONSULTANCY',
          'SCHOLARSHIP_PROVIDER',
          'EDUCATIONAL_INSTITUTION',
          'OTHER_PROVIDER',
        ]),
        contactFullName: z.string().min(2),
        contactPosition: z.string().min(2),
        businessEmail: z.string().email(),
        password: z.string().min(6),
        telephone: z.string().min(5),
        generalEmail: z.string().email().optional().or(z.literal('')),
        recruitmentEmail: z.string().email(),
        interviewEmail: z.string().email().optional().or(z.literal('')),
        billingEmail: z.string().email().optional().or(z.literal('')),
        additionalRecipients: z.array(z.string().email()).optional(),
        verificationDocs: z.array(z.object({ fileName: z.string(), url: z.string().optional() })).optional(),
      })
      .parse(request.body);

    try {
      const res = await platformService.registerOrganisation({
        ...body,
        generalEmail: body.generalEmail || undefined,
        interviewEmail: body.interviewEmail || undefined,
        billingEmail: body.billingEmail || undefined,
      });
      return { ok: true, data: res };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Registration failed' });
    }
  });

  app.post('/api/v1/organisations/login', async (request, reply) => {
    const body = z
      .object({
        businessEmail: z.string().email(),
        password: z.string().min(1),
      })
      .parse(request.body);

    try {
      const data = platformService.loginOrganisation(body.businessEmail, body.password);
      return { ok: true, data };
    } catch (err: any) {
      return reply.status(401).send({ ok: false, error: err?.message || 'Invalid credentials' });
    }
  });

  app.post('/api/v1/organisations/:id/verify', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({ token: z.string().min(1) }).parse(request.body ?? {});
    try {
      const org = platformService.verifyAndApproveOrganisation(params.id, body.token);
      return { ok: true, data: org };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Verification failed' });
    }
  });

  app.post('/api/v1/organisations/:id/resend-verification', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    try {
      const data = await platformService.resendOrganisationVerificationCode(params.id);
      return { ok: true, data };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Could not resend code' });
    }
  });

  app.get('/api/v1/organisations/:id/dashboard', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const org = platformService.getOrganisationById(params.id);
    if (!org) return reply.status(404).send({ ok: false, error: 'Organisation not found' });
    return {
      ok: true,
      data: {
        organisation: org,
        capabilities: platformService.getOrganisationCapabilities(org.category),
        stats: platformService.getDashboardStats(org.id),
      },
    };
  });

  app.post('/api/v1/organisations/:id/settings', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.record(z.any()).parse(request.body);
    try {
      const org = platformService.updateOrganisationSettings(params.id, body);
      return { ok: true, data: org };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Update failed' });
    }
  });

  // ==================== VACANCIES & PUBLIC OPPORTUNITIES ====================
  app.get('/api/v1/public/vacancies', async (request) => {
    const q = z
      .object({
        category: z.string().optional(),
      })
      .parse(request.query ?? {});
    return {
      ok: true,
      data: platformService.listVacancies({ status: 'PUBLISHED', category: q.category }),
    };
  });

  app.get('/api/v1/public/vacancies/:id', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const vac = platformService
      .listVacancies({ status: 'PUBLISHED' })
      .find((v) => v.id === params.id);
    if (!vac) return reply.status(404).send({ ok: false, error: 'Opportunity not found' });
    return { ok: true, data: vac };
  });

  app.get('/api/v1/organisations/:id/vacancies', async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    return { ok: true, data: platformService.listVacancies({ organisationId: params.id }) };
  });

  app.post('/api/v1/organisations/:id/vacancies', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        title: z.string().min(2),
        category: z.enum(['EMPLOYMENT', 'RELOCATION', 'SCHOLARSHIP', 'INVESTMENT']).default('EMPLOYMENT'),
        vacancyType: z
          .enum(['PERMANENT', 'TEMPORARY', 'CONTRACT', 'PART_TIME', 'FULL_TIME', 'REMOTE'])
          .default('FULL_TIME'),
        workArrangement: z.enum(['REMOTE', 'HYBRID', 'ON_SITE']).default('REMOTE'),
        location: z.string().min(2),
        salaryRange: z.string().optional(),
        monthlyOfferUsd: z.number().min(0).optional(),
        description: z.string().min(5),
        requirements: z.string().min(3),
        qualifications: z.string().optional(),
        minYearsExperience: z.number().int().min(0).default(0),
        requiredSkills: z.array(z.string()).default([]),
        requiresAssessment: z.boolean().default(true),
        passingScorePercent: z.number().int().min(10).max(100).default(70),
        assessmentDurationMin: z.number().int().min(5).max(120).default(25),
        applicationDeadline: z.string().optional(),
        visaType: z.string().optional(),
        targetCountry: z.string().optional(),
        processingTime: z.string().optional(),
        requiredDocuments: z.array(z.string()).optional(),
        institutionName: z.string().optional(),
        degreeLevel: z.string().optional(),
        fundingCoverage: z.string().optional(),
        minGpaOrScore: z.string().optional(),
        investmentStage: z.string().optional(),
        sectorFocus: z.string().optional(),
        equityTerms: z.string().optional(),
        status: z.enum(['DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'CLOSED']).default('PUBLISHED'),
      })
      .parse(request.body);

    try {
      const vac = platformService.createVacancy(params.id, body);
      return { ok: true, data: vac };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Could not create vacancy' });
    }
  });

  app.post('/api/v1/organisations/:id/vacancies/:vacancyId', async (request, reply) => {
    const params = z.object({ id: z.string().min(1), vacancyId: z.string().min(1) }).parse(request.params);
    const body = z.record(z.any()).parse(request.body);
    try {
      const vac = platformService.updateVacancy(params.id, params.vacancyId, body);
      return { ok: true, data: vac };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Could not update vacancy' });
    }
  });

  app.delete('/api/v1/organisations/:id/vacancies/:vacancyId', async (request) => {
    const params = z.object({ id: z.string().min(1), vacancyId: z.string().min(1) }).parse(request.params);
    const removed = platformService.deleteVacancies(params.id, [params.vacancyId]);
    return { ok: true, removed };
  });

  app.post('/api/v1/organisations/:id/vacancies/bulk-delete', async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({ vacancyIds: z.array(z.string().min(1)) }).parse(request.body);
    const removed = platformService.deleteVacancies(params.id, body.vacancyIds);
    return { ok: true, removed };
  });

  // ==================== APPLICATIONS & AUTHORISED CANDIDATES ====================
  app.post('/api/v1/vacancies/:vacancyId/apply', async (request, reply) => {
    const params = z.object({ vacancyId: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        customerId: z.string().optional(),
        userUid: z.string().min(1),
        candidateName: z.string().min(2),
        candidateEmail: z.string().email(),
        candidatePhone: z.string().optional(),
        cvFileName: z.string().optional(),
        cvDownloadUrl: z.string().optional(),
        transcriptId: z.string().optional(),
        qualifications: z.string().optional(),
        workExperience: z.string().optional(),
        skills: z.array(z.string()).optional(),
        coverNote: z.string().optional(),
        consentToShare: z.boolean().default(true),
      })
      .parse(request.body);

    try {
      const appRecord = await platformService.applyToVacancy({
        ...body,
        vacancyId: params.vacancyId,
        customerId: body.customerId || body.userUid,
      });
      return { ok: true, data: appRecord };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Application failed' });
    }
  });

  app.get('/api/v1/organisations/:id/applications', async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const q = z.object({ status: z.any().optional(), search: z.string().optional() }).parse(request.query ?? {});
    return {
      ok: true,
      data: platformService.listApplicationsForOrganisation(params.id, q),
    };
  });

  app.post('/api/v1/organisations/:id/applications/:applicationId/status', async (request, reply) => {
    const params = z
      .object({ id: z.string().min(1), applicationId: z.string().min(1) })
      .parse(request.params);
    const body = z
      .object({
        status: z
          .enum([
            'RECEIVED',
            'SCREENING',
            'SHORTLISTED',
            'INTERVIEW_SCHEDULED',
            'INTERVIEWED',
            'OFFER_MADE',
            'HIRED',
            'REJECTED',
            'WITHDRAWN',
          ])
          .optional(),
        internalNotes: z.string().optional(),
      })
      .parse(request.body);

    try {
      const updated = platformService.updateApplication(params.id, params.applicationId, body);
      return { ok: true, data: updated };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Update failed' });
    }
  });

  app.post('/api/v1/organisations/:id/applications/:applicationId/message', async (request, reply) => {
    const params = z
      .object({ id: z.string().min(1), applicationId: z.string().min(1) })
      .parse(request.params);
    const body = z.object({ subject: z.string().min(1), body: z.string().min(1) }).parse(request.body);
    try {
      const updated = await platformService.sendCompanyMessage(
        params.id,
        params.applicationId,
        body.subject,
        body.body,
      );
      return { ok: true, data: updated };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Message failed' });
    }
  });

  app.get('/api/v1/organisations/:id/candidates', async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const q = z.object({ skill: z.string().optional(), q: z.string().optional() }).parse(request.query ?? {});
    return {
      ok: true,
      data: platformService.searchAuthorizedCandidates(params.id, q),
    };
  });

  app.get('/api/v1/organisations/:id/vacancies/:vacancyId/matching-candidates', async (request, reply) => {
    const params = z.object({ id: z.string().min(1), vacancyId: z.string().min(1) }).parse(request.params);
    try {
      const data = await platformService.getMatchingCandidatesForVacancy(params.id, params.vacancyId);
      return { ok: true, data };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Could not match candidates' });
    }
  });

  app.post('/api/v1/organisations/:id/vacancies/:vacancyId/auto-apply-candidate', async (request, reply) => {
    const params = z.object({ id: z.string().min(1), vacancyId: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        userUid: z.string().min(1),
        customerId: z.string().optional(),
        candidateName: z.string().min(1),
        candidateEmail: z.string().min(3),
      })
      .parse(request.body);
    try {
      const data = await platformService.autoApplyMatchedCandidate(params.id, params.vacancyId, body);
      return { ok: true, data };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Auto-apply failed' });
    }
  });

  app.post('/api/v1/organisations/:id/vacancies/:vacancyId/invite-interview', async (request, reply) => {
    const params = z.object({ id: z.string().min(1), vacancyId: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        userUid: z.string().min(1),
        customerId: z.string().optional(),
        candidateName: z.string().min(1),
        candidateEmail: z.string().min(3),
        interviewDate: z.string().min(4),
        interviewTime: z.string().min(2),
        timezone: z.string().optional(),
        interviewType: z.enum(['ONLINE', 'TELEPHONE', 'IN_PERSON']).optional(),
        locationOrLink: z.string().min(2),
        instructions: z.string().optional(),
      })
      .parse(request.body);
    try {
      const data = await platformService.inviteMatchedCandidateToInterview(params.id, params.vacancyId, body);
      return { ok: true, data };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Invite failed' });
    }
  });

  app.post('/api/v1/interviews/:interviewId/respond', async (request, reply) => {
    const params = z.object({ interviewId: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        userUid: z.string().min(1),
        action: z.enum(['ACCEPT', 'DECLINE']),
      })
      .parse(request.body);
    try {
      const data = await platformService.respondToInterviewInvitation(params.interviewId, body.userUid, body.action);
      return { ok: true, data };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Could not respond to invitation' });
    }
  });

  // ==================== INTERVIEWS MODULE ====================
  app.get('/api/v1/interviews', async (request) => {
    const q = z
      .object({
        userUid: z.string().min(1),
        email: z.string().optional(),
        receiptIds: z.string().optional(),
      })
      .parse(request.query);
    const receiptList = q.receiptIds ? q.receiptIds.split(',').filter(Boolean) : undefined;
    return {
      ok: true,
      data: platformService.listInterviewsForCandidate(q.userUid, q.email, receiptList),
    };
  });

  app.get('/api/v1/organisations/:id/interviews', async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    return { ok: true, data: platformService.listInterviewsForOrganisation(params.id) };
  });

  app.post('/api/v1/organisations/:id/interviews', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        applicationId: z.string().optional(),
        vacancyId: z.string().optional(),
        customerId: z.string().optional(),
        userUid: z.string().min(1),
        jobTitle: z.string().min(2),
        candidateName: z.string().min(2),
        candidateEmail: z.string().email(),
        interviewDate: z.string().min(4),
        interviewTime: z.string().min(2),
        timezone: z.string().default('UTC'),
        interviewType: z.enum(['ONLINE', 'TELEPHONE', 'IN_PERSON']).default('ONLINE'),
        locationOrLink: z.string().min(2),
        instructions: z.string().optional(),
      })
      .parse(request.body);

    try {
      const interview = await platformService.scheduleInterview(params.id, {
        ...body,
        customerId: body.customerId || body.userUid,
      });
      return { ok: true, data: interview };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Could not schedule interview' });
    }
  });

  app.post('/api/v1/organisations/:id/interviews/:interviewId', async (request, reply) => {
    const params = z
      .object({ id: z.string().min(1), interviewId: z.string().min(1) })
      .parse(request.params);
    const body = z.record(z.any()).parse(request.body);
    try {
      const updated = platformService.updateInterview(params.id, params.interviewId, body);
      return { ok: true, data: updated };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Could not update interview' });
    }
  });

  app.post('/api/v1/organisations/:id/interviews/:interviewId/ai-questions', async (request, reply) => {
    const params = z
      .object({ id: z.string().min(1), interviewId: z.string().min(1) })
      .parse(request.params);
    try {
      const notes = await platformService.generateAiInterviewQuestions(params.id, params.interviewId);
      return { ok: true, data: { interviewerNotes: notes } };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Could not generate questions' });
    }
  });

  // ==================== EMPLOYER AI & STAFFING (PHASE 4 & 5) ====================
  app.post('/api/v1/organisations/:id/ai', async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        action: z.enum(['DRAFT_JD', 'SUMMARISE_CANDIDATE', 'MATCH_CANDIDATES', 'DRAFT_MESSAGE']),
        prompt: z.string().min(3),
      })
      .parse(request.body);

    const data = await platformService.runEmployerAiAssistant({
      organisationId: params.id,
      action: body.action,
      prompt: body.prompt,
    });
    return { ok: true, data };
  });

  app.get('/api/v1/organisations/:id/placements', async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    return { ok: true, data: platformService.listPlacements(params.id) };
  });

  app.post('/api/v1/organisations/:id/placements', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        vacancyId: z.string().optional(),
        customerId: z.string().min(1),
        candidateName: z.string().min(2),
        roleTitle: z.string().min(2),
        contractModel: z.enum(['DIRECT_PLACEMENT', 'CONTRACTOR_PLACEMENT', 'NEXORA_EOR_STAFFING']),
        startDate: z.string().min(4),
        hourlyRateCents: z.number().int().optional(),
        monthlySalaryCents: z.number().int().optional(),
        placementFeeCents: z.number().int().optional(),
        legalEntityArranged: z.boolean().optional(),
        taxComplianceReady: z.boolean().optional(),
        contractTerms: z.string().optional(),
      })
      .parse(request.body);
    try {
      const data = platformService.createPlacement(params.id, body);
      return { ok: true, data };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Placement creation failed' });
    }
  });

  app.post('/api/v1/organisations/:id/placements/:placementId/salary', async (request, reply) => {
    const params = z
      .object({ id: z.string().min(1), placementId: z.string().min(1) })
      .parse(request.params);
    const body = z.object({ monthlyCtcUsd: z.number().min(0) }).parse(request.body);
    try {
      const data = await platformService.updatePlacementSalary(
        params.id,
        params.placementId,
        body.monthlyCtcUsd,
      );
      return { ok: true, data };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Could not update salary' });
    }
  });

  app.post('/api/v1/organisations/:id/placements/:placementId/status', async (request, reply) => {
    const params = z
      .object({ id: z.string().min(1), placementId: z.string().min(1) })
      .parse(request.params);
    const body = z
      .object({ onboardingStatus: z.enum(['ONBOARDING', 'ACTIVE', 'COMPLETED', 'TERMINATED']) })
      .parse(request.body);
    try {
      const data = platformService.updatePlacementStatus(
        params.id,
        params.placementId,
        body.onboardingStatus,
      );
      return { ok: true, data };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Could not update status' });
    }
  });

  app.post('/api/v1/organisations/:id/placements/:placementId/timesheets', async (request, reply) => {
    const params = z
      .object({ id: z.string().min(1), placementId: z.string().min(1) })
      .parse(request.params);
    const body = z
      .object({
        weekStarting: z.string().min(4),
        hoursWorked: z.number().min(0.5).max(168),
        attendanceLog: z.string().optional(),
      })
      .parse(request.body);
    try {
      const data = platformService.addTimesheet(params.id, params.placementId, body);
      return { ok: true, data };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Timesheet failed' });
    }
  });

  app.post('/api/v1/organisations/:id/placements/:placementId/payroll', async (request, reply) => {
    const params = z
      .object({ id: z.string().min(1), placementId: z.string().min(1) })
      .parse(request.params);
    const body = z
      .object({
        periodLabel: z.string().min(2),
        grossPayCents: z.number().int().min(0),
        deductionsCents: z.number().int().min(0).default(0),
      })
      .parse(request.body);
    try {
      const data = platformService.createPayrollRecord(params.id, params.placementId, body);
      return { ok: true, data };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Payroll blocked' });
    }
  });

  // ==================== CENTRAL NOTIFICATIONS ====================
  app.get('/api/v1/notifications', async (request) => {
    const q = z
      .object({ userUid: z.string().optional(), organisationId: z.string().optional() })
      .parse(request.query ?? {});
    return { ok: true, data: platformService.listNotifications(q) };
  });

  app.post('/api/v1/notifications/:id/read', async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    platformService.markNotificationRead(params.id);
    return { ok: true };
  });

  // ==================== SUPPORTING DOCUMENTS (GROUPED BY AGENT TYPE) ====================
  app.get('/api/v1/supporting-documents', async (request) => {
    const q = z
      .object({
        userUid: z.string().min(1),
        agentType: z.enum(['JOB_AGENT', 'VISA_AGENT', 'EDUCATION_AGENT', 'INVESTOR_AGENT']).optional(),
      })
      .parse(request.query);
    const docs = platformStore
      .getState()
      .supportingDocuments.filter(
        (d) => d.userUid === q.userUid && (!q.agentType || d.agentType === q.agentType),
      );
    return { ok: true, data: docs };
  });

  app.post('/api/v1/supporting-documents', async (request) => {
    const body = z
      .object({
        userUid: z.string().min(1),
        agentType: z.enum(['JOB_AGENT', 'VISA_AGENT', 'EDUCATION_AGENT', 'INVESTOR_AGENT']),
        docType: z.string().min(1),
        label: z.string().min(1),
        fileName: z.string().min(1),
        mimeType: z.string().default('application/pdf'),
        contentBase64: z.string().min(1),
      })
      .parse(request.body);

    const safeOriginal = path.basename(body.fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
    const storedFileName = `sup_${Date.now()}_${safeOriginal}`;
    const buffer = Buffer.from(body.contentBase64, 'base64');

    // Primary cloud storage: Firebase Storage
    const firebaseUrl = await uploadToFirebaseStorage(
      `documents/${storedFileName}`,
      buffer,
      body.mimeType,
    );

    // Local fast cache fallback
    const cacheDir = path.resolve(process.cwd(), 'node_modules', '.cache', 'nexora-documents');
    await fs.mkdir(cacheDir, { recursive: true });
    await fs.writeFile(path.join(cacheDir, storedFileName), buffer).catch(() => undefined);

    const record = {
      id: `sdoc-${crypto.randomUUID().slice(0, 10)}`,
      userUid: body.userUid,
      agentType: body.agentType,
      docType: body.docType,
      label: body.label,
      fileName: body.fileName,
      storedFileName,
      mimeType: body.mimeType,
      fileSizeBytes: buffer.length,
      downloadUrl: firebaseUrl || `/api/v1/documents/download/${encodeURIComponent(storedFileName)}`,
      createdAt: new Date().toISOString(),
    };
    const state = platformStore.getState();
    if (body.docType === 'CV' && body.agentType === 'JOB_AGENT') {
      state.supportingDocuments = state.supportingDocuments.filter(
        (d) => !(d.userUid === body.userUid && d.agentType === 'JOB_AGENT' && d.docType === 'CV'),
      );
    }
    state.supportingDocuments.unshift(record);
    platformStore.save();
    return { ok: true, data: record };
  });

  app.delete('/api/v1/supporting-documents/:id', async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const q = z.object({ userUid: z.string().min(1) }).parse(request.query);
    const state = platformStore.getState();
    state.supportingDocuments = state.supportingDocuments.filter(
      (d) => !(d.id === params.id && d.userUid === q.userUid),
    );
    platformStore.save();
    return { ok: true };
  });

  // ==================== AI CV SCORING & 10% MONTHLY BILLING ====================
  app.post('/api/v1/organisations/:id/applications/:applicationId/score', async (request, reply) => {
    const params = z
      .object({ id: z.string().min(1), applicationId: z.string().min(1) })
      .parse(request.params);
    try {
      const data = await platformService.rescoreApplication(params.id, params.applicationId);
      return { ok: true, data };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Scoring failed' });
    }
  });

  app.post('/api/v1/organisations/:id/applications/score-all', async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const data = await platformService.rescoreAllApplications(params.id);
    return { ok: true, data };
  });

  app.get('/api/v1/organisations/:id/invoices', async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    return { ok: true, data: platformService.listInvoices(params.id) };
  });

  app.post('/api/v1/organisations/:id/invoices/generate-monthly', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({ billingMonth: z.string().optional() }).parse(request.body ?? {});
    try {
      const data = await platformService.generateMonthlyInvoicesForOrganisation(
        params.id,
        body.billingMonth,
      );
      return { ok: true, data };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Invoice generation failed' });
    }
  });

  app.post('/api/v1/organisations/:id/invoices/:invoiceId/paystack/initialize', async (request, reply) => {
    const params = z
      .object({ id: z.string().min(1), invoiceId: z.string().min(1) })
      .parse(request.params);
    const body = z.object({ callbackUrl: z.string().optional() }).parse(request.body ?? {});
    try {
      const data = await platformService.initializeInvoicePaystack(
        params.id,
        params.invoiceId,
        body.callbackUrl,
      );
      return { ok: true, data };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Paystack init failed' });
    }
  });

  app.get('/api/v1/organisations/:id/invoices/:invoiceId/paystack/verify/:reference', async (request, reply) => {
    const params = z
      .object({ id: z.string().min(1), invoiceId: z.string().min(1), reference: z.string().min(1) })
      .parse(request.params);
    try {
      const data = await platformService.verifyInvoicePaystack(
        params.id,
        params.invoiceId,
        params.reference,
      );
      return { ok: true, data };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Paystack verification failed' });
    }
  });

  app.post('/api/v1/organisations/:id/invoices/paystack/initialize-all', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z.object({ callbackUrl: z.string().optional() }).parse(request.body ?? {});
    try {
      const data = await platformService.initializeBulkInvoicesPaystack(params.id, body.callbackUrl);
      return { ok: true, data };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Paystack init failed' });
    }
  });

  app.get('/api/v1/organisations/:id/invoices/paystack/verify-all/:reference', async (request, reply) => {
    const params = z
      .object({ id: z.string().min(1), reference: z.string().min(1) })
      .parse(request.params);
    try {
      const data = await platformService.verifyBulkInvoicesPaystack(params.id, params.reference);
      return { ok: true, data };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Paystack verification failed' });
    }
  });

  // ==================== COMPANY TEAM / APP USERS ====================
  app.get('/api/v1/organisations/:id/users', async (request) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    return { ok: true, data: platformService.listOrganisationUsers(params.id) };
  });

  app.post('/api/v1/organisations/:id/users', async (request, reply) => {
    const params = z.object({ id: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        fullName: z.string().min(2),
        email: z.string().email(),
        password: z.string().min(6),
        role: z.enum(['ADMIN', 'RECRUITER', 'INTERVIEWER', 'FINANCE']).default('RECRUITER'),
      })
      .parse(request.body);
    try {
      const data = await platformService.addOrganisationUser(params.id, body);
      return { ok: true, data };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Could not add user' });
    }
  });

  app.post('/api/v1/organisations/:id/users/:userId', async (request, reply) => {
    const params = z.object({ id: z.string().min(1), userId: z.string().min(1) }).parse(request.params);
    const body = z
      .object({
        role: z.enum(['ADMIN', 'RECRUITER', 'INTERVIEWER', 'FINANCE']).optional(),
        status: z.enum(['ACTIVE', 'DISABLED']).optional(),
      })
      .parse(request.body);
    try {
      const data = platformService.updateOrganisationUser(params.id, params.userId, body);
      return { ok: true, data };
    } catch (err: any) {
      return reply.status(400).send({ ok: false, error: err?.message || 'Could not update user' });
    }
  });

  app.delete('/api/v1/organisations/:id/users/:userId', async (request) => {
    const params = z.object({ id: z.string().min(1), userId: z.string().min(1) }).parse(request.params);
    platformService.removeOrganisationUser(params.id, params.userId);
    return { ok: true };
  });

  // Zero-touch automated monthly 10% CTC billing cycle
  if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
    setTimeout(() => void platformService.runAutomatedMonthlyBillingCycle(), 15_000);
    setInterval(() => void platformService.runAutomatedMonthlyBillingCycle(), 6 * 60 * 60 * 1000);
  }
}
