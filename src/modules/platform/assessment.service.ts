import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import pdfParse from 'pdf-parse';
import { logger } from '../../utils/logger';
import { documentGeneratorService } from '../../tools/document-generator.service';
import { OpenClawService } from '../../openclaw/openclaw.service';
import {
  AssignmentCategoryType,
  AssignmentRecord,
  AssessmentQuestionRecord,
  AssessmentSessionRecord,
  AssessmentTranscriptRecord,
  platformStore,
} from './platform.store';

export class AssessmentService {
  constructor(private readonly openclawService?: OpenClawService) {}

  public validatePrerequisites(
    category: AssignmentCategoryType,
    data: Record<string, any> = {},
  ): { met: boolean; missing: string[] } {
    const missing: string[] = [];
    const has = (k: string) => typeof data[k] === 'string' ? data[k].trim().length > 0 : Boolean(data[k]);

    if (category === 'EMPLOYMENT') {
      if (!has('cvSummary') && !has('cvFileName')) missing.push('Current CV / Resume');
      if (!has('employmentHistory')) missing.push('Employment History');
      if (!has('education')) missing.push('Educational Qualifications');
      if (!has('skills')) missing.push('Technical / Core Skills');
      if (data.yearsOfExperience === undefined || data.yearsOfExperience === '') {
        missing.push('Years of Experience');
      }
      if (!has('preferredPosition')) missing.push('Preferred Job Position');
      if (!has('preferredCountries')) missing.push('Preferred Countries');
      if (!has('availability')) missing.push('Work Availability');
    } else if (category === 'RELOCATION') {
      if (!has('currentCountry')) missing.push('Current Country of Residence');
      if (!has('destinationCountry')) missing.push('Intended Destination Country');
      if (!has('education')) missing.push('Education & Qualifications');
      if (!has('employmentBackground')) missing.push('Employment Background');
      if (!has('languages')) missing.push('Language Abilities');
      if (!has('relocationObjectives')) missing.push('Relocation Objectives');
    } else if (category === 'SCHOLARSHIP') {
      if (!has('educationHistory')) missing.push('Education History');
      if (!has('qualifications')) missing.push('Academic Qualifications');
      if (!has('fieldOfStudy')) missing.push('Field of Study');
      if (!has('achievements')) missing.push('Academic Achievements');
      if (!has('intendedProgramme')) missing.push('Intended Institution or Programme');
      if (!has('motivationStatement')) missing.push('Motivation Statement');
    }

    return { met: missing.length === 0, missing };
  }

  public listAssignmentsForUser(params: {
    userUid: string;
    customerId: string;
    category?: AssignmentCategoryType;
  }): AssignmentRecord[] {
    const state = platformStore.getState();
    let userAssignments = state.assignments.filter((a) => a.userUid === params.userUid);

    // Enforce strictly 1 assignment per category (agent type) — deduplicate & clean any legacy duplicates
    if (userAssignments.length > 0) {
      const statusRank: Record<string, number> = {
        PASSED: 5,
        FAILED: 4,
        IN_PROGRESS: 3,
        READY_TO_START: 2,
        PREREQUISITES_REQUIRED: 1,
        NOT_STARTED: 0,
      };
      const bestByCategory = new Map<string, AssignmentRecord>();
      for (const asg of userAssignments) {
        const cur = bestByCategory.get(asg.category);
        if (!cur) {
          bestByCategory.set(asg.category, asg);
          continue;
        }
        const newRank = statusRank[asg.status] ?? 0;
        const curRank = statusRank[cur.status] ?? 0;
        if (
          newRank > curRank ||
          (newRank === curRank &&
            String(asg.updatedAt || asg.createdAt || '') > String(cur.updatedAt || cur.createdAt || ''))
        ) {
          bestByCategory.set(asg.category, asg);
        }
      }
      const keepIds = new Set(Array.from(bestByCategory.values()).map((a) => a.id));
      if (keepIds.size < userAssignments.length) {
        state.assignments = state.assignments.filter(
          (a) => a.userUid !== params.userUid || keepIds.has(a.id),
        );
        platformStore.save();
        userAssignments = Array.from(bestByCategory.values());
      }
    }

    if (userAssignments.length === 0) {
      const now = new Date().toISOString();
      const starters: AssignmentRecord[] = [
        {
          id: `asg-${crypto.randomUUID().slice(0, 8)}`,
          customerId: params.customerId,
          userUid: params.userUid,
          title: 'Technical & Role Readiness Assessment',
          category: 'EMPLOYMENT',
          relatedOpportunity: 'General Employment & Staffing Pipeline',
          providerName: 'Nexora AI Talent Verification',
          durationMinutes: 25,
          passingScorePercent: 70,
          status: 'PREREQUISITES_REQUIRED',
          prerequisitesMet: false,
          missingPrerequisites: this.validatePrerequisites('EMPLOYMENT', {}).missing,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `asg-${crypto.randomUUID().slice(0, 8)}`,
          customerId: params.customerId,
          userUid: params.userUid,
          title: 'International Relocation Readiness Check',
          category: 'RELOCATION',
          relatedOpportunity: 'Skilled Relocation & Employer Sponsorship',
          providerName: 'Nexora Relocation Desk',
          durationMinutes: 20,
          passingScorePercent: 70,
          status: 'PREREQUISITES_REQUIRED',
          prerequisitesMet: false,
          missingPrerequisites: this.validatePrerequisites('RELOCATION', {}).missing,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: `asg-${crypto.randomUUID().slice(0, 8)}`,
          customerId: params.customerId,
          userUid: params.userUid,
          title: 'Academic & Scholarship Readiness Assessment',
          category: 'SCHOLARSHIP',
          relatedOpportunity: 'Global Postgraduate & Merit Scholarships',
          providerName: 'Nexora Academic Desk',
          durationMinutes: 20,
          passingScorePercent: 70,
          status: 'PREREQUISITES_REQUIRED',
          prerequisitesMet: false,
          missingPrerequisites: this.validatePrerequisites('SCHOLARSHIP', {}).missing,
          createdAt: now,
          updatedAt: now,
        },
      ];
      state.assignments.push(...starters);
      platformStore.save();
      userAssignments = starters;
    }

    return params.category
      ? userAssignments.filter((a) => a.category === params.category)
      : userAssignments;
  }

  public createAssignment(input: {
    userUid: string;
    customerId: string;
    vacancyId?: string;
    title: string;
    category: AssignmentCategoryType;
    relatedOpportunity: string;
    providerName?: string;
    durationMinutes?: number;
    passingScorePercent?: number;
    prerequisiteData?: Record<string, any>;
  }): AssignmentRecord {
    const state = platformStore.getState();
    const check = this.validatePrerequisites(input.category, input.prerequisiteData || {});
    const now = new Date().toISOString();
    const record: AssignmentRecord = {
      id: `asg-${crypto.randomUUID().slice(0, 8)}`,
      customerId: input.customerId,
      userUid: input.userUid,
      vacancyId: input.vacancyId,
      title: input.title,
      category: input.category,
      relatedOpportunity: input.relatedOpportunity,
      providerName: input.providerName,
      durationMinutes: input.durationMinutes ?? 25,
      passingScorePercent: input.passingScorePercent ?? 70,
      status: check.met ? 'READY_TO_START' : 'PREREQUISITES_REQUIRED',
      prerequisiteData: input.prerequisiteData,
      prerequisitesMet: check.met,
      missingPrerequisites: check.missing,
      createdAt: now,
      updatedAt: now,
    };
    state.assignments.unshift(record);
    platformStore.save();
    return record;
  }

  public savePrerequisites(
    assignmentId: string,
    userUid: string,
    data: Record<string, any>,
  ): AssignmentRecord {
    const state = platformStore.getState();
    const asg = state.assignments.find((a) => a.id === assignmentId && a.userUid === userUid);
    if (!asg) {
      throw new Error('Assignment not found');
    }
    const merged = { ...(asg.prerequisiteData || {}), ...data };
    const check = this.validatePrerequisites(asg.category, merged);
    asg.prerequisiteData = merged;
    asg.prerequisitesMet = check.met;
    asg.missingPrerequisites = check.missing;
    if (asg.status === 'NOT_STARTED' || asg.status === 'PREREQUISITES_REQUIRED' || asg.status === 'READY_TO_START') {
      asg.status = check.met ? 'READY_TO_START' : 'PREREQUISITES_REQUIRED';
    }
    // Clear any incomplete cached sessions so next start regenerates questions with updated role/CV
    state.sessions = state.sessions.filter(
      (s) => !(s.assignmentId === asg.id && s.userUid === userUid && !s.isCompleted),
    );
    asg.updatedAt = new Date().toISOString();
    platformStore.save();
    return asg;
  }

  public async startSession(params: {
    assignmentId: string;
    userUid: string;
    rulesAccepted: boolean;
  }): Promise<{
    session: Omit<AssessmentSessionRecord, 'questions'> & {
      questions: Array<Omit<AssessmentQuestionRecord, 'correctIndex' | 'explanation'>>;
    };
    assignment: AssignmentRecord;
  }> {
    if (!params.rulesAccepted) {
      throw new Error('You must agree to the assessment rules before starting.');
    }

    const state = platformStore.getState();
    const asg = state.assignments.find((a) => a.id === params.assignmentId && a.userUid === params.userUid);
    if (!asg) {
      throw new Error('Assignment not found');
    }

    const prereqCheck = this.validatePrerequisites(asg.category, asg.prerequisiteData || {});
    if (!prereqCheck.met) {
      asg.prerequisitesMet = false;
      asg.missingPrerequisites = prereqCheck.missing;
      asg.status = 'PREREQUISITES_REQUIRED';
      platformStore.save();
      throw new Error(`Prerequisites incomplete: ${prereqCheck.missing.join(', ')}`);
    }

    // Recover active in-progress session on page refresh if not expired, not stale placeholder,
    // and not a legacy unshuffled all-A session
    const existingActive = state.sessions.find(
      (s) =>
        s.assignmentId === asg.id &&
        s.userUid === params.userUid &&
        !s.isCompleted &&
        Date.now() < new Date(s.expiresAt).getTime() &&
        !s.questions.some((q) => q.statement.includes('faces conflicting requirements and a strict deadline')) &&
        s.questions.some((q) => q.correctIndex !== 0),
    );
    if (existingActive) {
      return {
        assignment: asg,
        session: {
          ...existingActive,
          questions: existingActive.questions.map(({ correctIndex: _c, explanation: _e, ...rest }) => rest),
        },
      };
    }

    // Collect previously asked question statements for this user + assignment so retakes get fresh questions
    const previousStatements = Array.from(
      new Set(
        state.sessions
          .filter((s) => s.assignmentId === asg.id && s.userUid === params.userUid)
          .flatMap((s) => (s.questions || []).map((q) => q.statement)),
      ),
    ).slice(-45);

    const sessionId = `ses-${crypto.randomUUID().slice(0, 10)}`;
    const questions = await this.generateTailoredQuestions(asg, sessionId, previousStatements);
    const nowMs = Date.now();
    const startedAt = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + asg.durationMinutes * 60_000).toISOString();

    const session: AssessmentSessionRecord = {
      id: sessionId,
      assignmentId: asg.id,
      customerId: asg.customerId,
      userUid: params.userUid,
      rulesAccepted: true,
      startedAt,
      expiresAt,
      totalQuestions: questions.length,
      correctCount: 0,
      incorrectCount: 0,
      percentageScore: 0,
      passed: false,
      isCompleted: false,
      topicBreakdown: {},
      difficultyBreakdown: {},
      questions,
      answers: {},
      createdAt: startedAt,
    };

    state.sessions.push(session);
    asg.status = 'IN_PROGRESS';
    asg.updatedAt = startedAt;
    platformStore.save();

    return {
      assignment: asg,
      session: {
        ...session,
        questions: session.questions.map(({ correctIndex: _c, explanation: _e, ...rest }) => rest),
      },
    };
  }

  public saveAnswer(params: {
    sessionId: string;
    userUid: string;
    questionId: string;
    selectedIndex: number;
    timeSpentSec: number;
  }): { saved: boolean; expired: boolean } {
    const state = platformStore.getState();
    const session = state.sessions.find((s) => s.id === params.sessionId && s.userUid === params.userUid);
    if (!session) throw new Error('Assessment session not found');
    if (session.isCompleted) throw new Error('Assessment has already been submitted');

    const expired = Date.now() > new Date(session.expiresAt).getTime() + 5000;
    if (expired) {
      return { saved: false, expired: true };
    }

    const q = session.questions.find((item) => item.id === params.questionId);
    if (!q) throw new Error('Question not found in session');

    session.answers[q.id] = {
      questionId: q.id,
      selectedIndex: params.selectedIndex,
      isCorrect: params.selectedIndex === q.correctIndex,
      timeSpentSec: Math.max(0, Math.round(params.timeSpentSec || 0)),
      answeredAt: new Date().toISOString(),
    };
    platformStore.save();
    return { saved: true, expired: false };
  }

  public async submitSession(params: {
    sessionId: string;
    userUid: string;
  }): Promise<{
    session: AssessmentSessionRecord;
    assignment: AssignmentRecord;
    transcript: AssessmentTranscriptRecord;
  }> {
    const state = platformStore.getState();
    const session = state.sessions.find((s) => s.id === params.sessionId && s.userUid === params.userUid);
    if (!session) throw new Error('Assessment session not found');

    const asg = state.assignments.find((a) => a.id === session.assignmentId);
    if (!asg) throw new Error('Assignment not found');

    // Prevent duplicate submissions — return already generated transcript
    if (session.isCompleted) {
      const existingTranscript = state.transcripts.find((t) => t.sessionId === session.id);
      if (existingTranscript) {
        return { session, assignment: asg, transcript: existingTranscript };
      }
    }

    const submittedAt = new Date().toISOString();
    const elapsedSec = Math.max(
      1,
      Math.min(
        asg.durationMinutes * 60,
        Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000),
      ),
    );

    let correctCount = 0;
    const topicBreakdown: Record<string, { correct: number; total: number }> = {};
    const difficultyBreakdown: Record<string, { correct: number; total: number }> = {};

    const questionDetails = session.questions.map((q) => {
      const ans = session.answers[q.id];
      const selectedIdx = ans?.selectedIndex ?? -1;
      const isCorrect = selectedIdx === q.correctIndex;
      if (isCorrect) correctCount++;

      topicBreakdown[q.topic] = topicBreakdown[q.topic] || { correct: 0, total: 0 };
      topicBreakdown[q.topic].total += 1;
      if (isCorrect) topicBreakdown[q.topic].correct += 1;

      difficultyBreakdown[q.difficulty] = difficultyBreakdown[q.difficulty] || { correct: 0, total: 0 };
      difficultyBreakdown[q.difficulty].total += 1;
      if (isCorrect) difficultyBreakdown[q.difficulty].correct += 1;

      return {
        order: q.questionOrder,
        topic: q.topic,
        difficulty: q.difficulty,
        statement: q.statement,
        selectedAnswer: selectedIdx >= 0 && q.options[selectedIdx] ? q.options[selectedIdx] : 'Not answered',
        correctAnswer: q.options[q.correctIndex] || '',
        isCorrect,
        timeSpentSec: ans?.timeSpentSec ?? 0,
      };
    });

    const totalQuestions = session.questions.length;
    const incorrectCount = totalQuestions - correctCount;
    const percentageScore = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 1000) / 10 : 0;
    const passed = percentageScore >= asg.passingScorePercent;

    session.submittedAt = submittedAt;
    session.durationSeconds = elapsedSec;
    session.correctCount = correctCount;
    session.incorrectCount = incorrectCount;
    session.percentageScore = percentageScore;
    session.passed = passed;
    session.isCompleted = true;
    session.topicBreakdown = topicBreakdown;
    session.difficultyBreakdown = difficultyBreakdown;

    asg.status = passed ? 'PASSED' : 'FAILED';
    asg.updatedAt = submittedAt;

    const candidateName =
      String(asg.prerequisiteData?.fullName || asg.prerequisiteData?.candidateName || 'Candidate').trim();
    const candidateEmail = asg.prerequisiteData?.email ? String(asg.prerequisiteData.email).trim() : undefined;
    const cvFileName = asg.prerequisiteData?.cvFileName
      ? String(asg.prerequisiteData.cvFileName)
      : undefined;

    const strengths = Object.entries(topicBreakdown)
      .filter(([, s]) => s.total > 0 && s.correct / s.total >= 0.7)
      .map(([topic]) => topic);
    const gaps = Object.entries(topicBreakdown)
      .filter(([, s]) => s.total > 0 && s.correct / s.total < 0.7)
      .map(([topic]) => topic);

    const aiPerformanceSummary = [
      `${candidateName} completed "${asg.title}" (${asg.category}) scoring ${percentageScore}% (${correctCount}/${totalQuestions}) — ${passed ? 'PASSED' : 'NEEDS IMPROVEMENT'} (threshold ${asg.passingScorePercent}%).`,
      strengths.length > 0 ? `Strongest areas: ${strengths.join(', ')}.` : '',
      gaps.length > 0 ? `Recommended growth areas: ${gaps.join(', ')}.` : '',
    ]
      .filter(Boolean)
      .join(' ');

    let pdfFileName: string | undefined;
    let pdfDownloadUrl: string | undefined;
    try {
      const pdf = await documentGeneratorService.generateAssessmentTranscriptPdf({
        candidateName,
        candidateEmail,
        cvFileName,
        assignmentTitle: asg.title,
        category: asg.category,
        totalQuestions,
        correctCount,
        percentageScore,
        passed,
        totalDurationSec: elapsedSec,
        topicBreakdown,
        difficultyBreakdown,
        aiPerformanceSummary,
        submittedAt,
        questionDetails,
      });
      pdfFileName = pdf.fileName;
      pdfDownloadUrl = pdf.downloadUrl;
    } catch (err) {
      logger.warn({ err }, 'Could not render assessment transcript PDF');
    }

    const transcript: AssessmentTranscriptRecord = {
      id: `trn-${crypto.randomUUID().slice(0, 10)}`,
      customerId: asg.customerId,
      userUid: params.userUid,
      assignmentId: asg.id,
      sessionId: session.id,
      cvFileName,
      candidateName,
      candidateEmail,
      assignmentTitle: asg.title,
      category: asg.category,
      totalQuestions,
      correctCount,
      percentageScore,
      passed,
      totalDurationSec: elapsedSec,
      topicBreakdown,
      difficultyBreakdown,
      questionDetails,
      aiPerformanceSummary,
      pdfFileName,
      pdfDownloadUrl,
      submittedAt,
      createdAt: submittedAt,
    };

    // 1 transcript per user per assignment category (agent type): retaking nullifies & removes any previous transcript
    state.transcripts = state.transcripts.filter(
      (t) => !(t.userUid === params.userUid && t.category === asg.category),
    );
    state.transcripts.unshift(transcript);
    state.notifications.unshift({
      id: `ntf-${crypto.randomUUID().slice(0, 8)}`,
      customerId: asg.customerId,
      userUid: params.userUid,
      type: 'ASSESSMENT_RESULT',
      title: `Assessment ${passed ? 'Passed' : 'Completed'}: ${asg.title}`,
      message: `You scored ${percentageScore}% (${correctCount}/${totalQuestions}). Your permanent PDF transcript is saved in your profile.`,
      actionUrl: '/app',
      isRead: false,
      createdAt: submittedAt,
    });
    platformStore.save();

    return { session, assignment: asg, transcript };
  }

  public listTranscriptsForUser(userUid: string): AssessmentTranscriptRecord[] {
    const all = platformStore.getState().transcripts.filter((t) => t.userUid === userUid);
    // Keep only the single latest transcript per category (1 assignment transcript per agent type)
    const byCategory = new Map<string, AssessmentTranscriptRecord>();
    for (const tr of all) {
      const existing = byCategory.get(tr.category);
      if (
        !existing ||
        String(tr.submittedAt || tr.createdAt || '') > String(existing.submittedAt || existing.createdAt || '')
      ) {
        byCategory.set(tr.category, tr);
      }
    }
    return Array.from(byCategory.values());
  }

  private async readCvTextSnippet(cvFileName?: string): Promise<string> {
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

  private shuffleArray<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = crypto.randomInt(0, i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  private shuffleQuestionOptions(
    options: string[],
    correctIndex: number,
  ): { options: string[]; correctIndex: number } {
    const safeIdx = correctIndex >= 0 && correctIndex < options.length ? correctIndex : 0;
    const tagged = options.map((text, idx) => ({ text, isCorrect: idx === safeIdx }));
    const shuffled = this.shuffleArray(tagged);
    const newCorrectIndex = shuffled.findIndex((item) => item.isCorrect);
    return {
      options: shuffled.map((item) => item.text),
      correctIndex: newCorrectIndex >= 0 ? newCorrectIndex : 0,
    };
  }

  private async generateTailoredQuestions(
    asg: AssignmentRecord,
    sessionId: string,
    previousStatements: string[] = [],
  ): Promise<AssessmentQuestionRecord[]> {
    const p = asg.prerequisiteData || {};
    const roleOrField = String(
      p.preferredPosition || p.fieldOfStudy || p.intendedProgramme || asg.relatedOpportunity || asg.title,
    );
    const skills = String(p.skills || p.qualifications || '');
    const yearsExp = Number(p.yearsOfExperience || 2);
    const cvSummary = String(p.cvSummary || p.employmentHistory || p.employmentBackground || '');
    const extraContext =
      asg.category === 'RELOCATION'
        ? `Origin: ${p.currentCountry || 'Not specified'}, Destination: ${p.destinationCountry || 'Not specified'}, Languages: ${p.languages || 'Not specified'}, Objectives: ${p.relocationObjectives || 'Skilled Relocation'}`
        : asg.category === 'SCHOLARSHIP'
          ? `Field of Study: ${p.fieldOfStudy || 'Not specified'}, Programme: ${p.intendedProgramme || 'Postgraduate'}, Achievements: ${p.achievements || 'Not specified'}, Motivation: ${p.motivationStatement || ''}`
          : '';
    const cvText = await this.readCvTextSnippet(p.cvFileName);
    const attemptSeed = crypto.randomBytes(4).toString('hex');

    if (this.openclawService && process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      try {
        const prompt = [
          `Generate exactly 15 fresh, varied, non-repetitive multiple-choice assessment questions in strict JSON array format (Attempt Seed: ${attemptSeed}).`,
          `Category: ${asg.category}. Target Job Role / Field: ${roleOrField}. Candidate Experience: ${yearsExp} years.`,
          `Skills / Qualifications: ${skills || 'Not specified'}.`,
          extraContext ? `Category Details: ${extraContext}` : '',
          cvText
            ? `Candidate CV Content (use this directly to tailor technical & scenario questions to their actual stack, projects, and experience):\n${cvText}`
            : `Candidate Background / Notes: ${cvSummary || 'General professional'}`,
          previousStatements.length > 0
            ? `CRITICAL: This candidate has already seen these questions in earlier attempts. Generate 15 COMPLETELY DIFFERENT questions covering new angles, edge cases, and scenarios — do NOT repeat or paraphrase any of these:\n${previousStatements.slice(-25).map((s, i) => `${i + 1}. ${s}`).join('\n')}`
            : '',
          `Difficulty mix: 5 INTERMEDIATE, 5 ADVANCED, 5 HARD. Avoid trivial beginner questions and never repeat question templates. Tailor every question specifically to "${roleOrField}" and the candidate's CV.`,
          `IMPORTANT: Distribute correctIndex evenly across 0, 1, 2, and 3 (do NOT put every correct answer at index 0).`,
          `Return ONLY a valid JSON array of 15 objects with keys: statement (string), options (array of exactly 4 strings), correctIndex (0-3), difficulty ("INTERMEDIATE"|"ADVANCED"|"HARD"), topic (string), explanation (string), allocatedSec (number 60-120).`,
        ]
          .filter(Boolean)
          .join('\n');

        const safeTenantId = asg.customerId.replace(/[^a-zA-Z0-9_-]/g, '') || 'web_studio';
        const sessionKey =
          typeof (this.openclawService as any).createConversationSessionKey === 'function'
            ? this.openclawService.createConversationSessionKey(safeTenantId, `asg_${sessionId}`, 'main')
            : `agent:main:tenant_${safeTenantId}_task_${sessionId}`;

        const aiRes = await this.openclawService.executeAgentTurn({
          customerId: safeTenantId,
          agentType: 'RESEARCH_AGENT' as any,
          openclawAgentId: 'main',
          sessionKey,
          userMessage: prompt,
          systemInstructions:
            'You are Nexora AI Assessment Examiner. Return ONLY a valid JSON array of 15 fresh assessment questions tailored to the Target Job Role and CV. Vary correctIndex across 0-3. No markdown fences or extra prose.',
          timeoutMs: 65_000,
        });

        const cleaned = (aiRes.responseText || '').replace(/```json\s*/gi, '').replace(/```\s*/g, '');
        const match = cleaned.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]) as Array<Partial<AssessmentQuestionRecord>>;
          if (Array.isArray(parsed) && parsed.length >= 10) {
            const shuffledQuestions = this.shuffleArray(parsed.slice(0, 15));
            return shuffledQuestions.map((q, idx) => {
              const rawOptions =
                Array.isArray(q.options) && q.options.length === 4
                  ? q.options.map(String)
                  : ['Option A', 'Option B', 'Option C', 'Option D'];
              const rawCorrect =
                typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex <= 3
                  ? q.correctIndex
                  : 0;
              const { options, correctIndex } = this.shuffleQuestionOptions(rawOptions, rawCorrect);
              return {
                id: `q-${sessionId}-${idx + 1}`,
                sessionId,
                questionOrder: idx + 1,
                statement: String(q.statement || `Scenario Question ${idx + 1}`),
                options,
                correctIndex,
                difficulty:
                  q.difficulty === 'HARD' || q.difficulty === 'ADVANCED' ? q.difficulty : 'INTERMEDIATE',
                topic: String(q.topic || roleOrField),
                explanation: String(q.explanation || 'Verified best-practice answer.'),
                allocatedSec: typeof q.allocatedSec === 'number' ? q.allocatedSec : 90,
              };
            });
          }
        }
        logger.warn(
          { responsePreview: cleaned.slice(0, 240) },
          'OpenClaw assessment response did not contain a valid 10+ question JSON array; using shuffled domain bank',
        );
      } catch (err) {
        logger.warn({ err }, 'OpenClaw question generation failed; falling back to shuffled domain bank');
      }
    }

    return this.buildDomainFallbackQuestions(asg, sessionId, roleOrField, skills, previousStatements);
  }

  private buildDomainFallbackQuestions(
    asg: AssignmentRecord,
    sessionId: string,
    roleOrField: string,
    skills: string,
    previousStatements: string[] = [],
  ): AssessmentQuestionRecord[] {
    const contextText = `${roleOrField} ${skills} ${asg.title}`.toLowerCase();
    const bank: Array<Omit<AssessmentQuestionRecord, 'id' | 'sessionId' | 'questionOrder'>> =
      /react|frontend|typescript|javascript|software|developer|engineer|full.?stack|backend|node|python|java|web|api/.test(
        contextText,
      )
        ? [
            {
              statement: 'In a large React application, a parent component re-renders frequently and passes an inline callback prop to a heavy memoized child (`React.memo`). What is the best fix to prevent unnecessary child re-renders?',
              options: [
                'Wrap the callback in `useCallback` with stable dependencies and memoize derived object props with `useMemo`',
                'Replace `React.memo` with `useEffect` inside the child component',
                'Store the callback in `localStorage` on every render',
                'Use `forceUpdate()` inside the parent',
              ],
              correctIndex: 0,
              difficulty: 'INTERMEDIATE',
              topic: 'React Performance',
              explanation: 'Inline functions get a new reference each render; `useCallback` + `useMemo` preserves referential equality for `React.memo`.',
              allocatedSec: 90,
            },
            {
              statement: 'Why should you avoid using array index as the `key` prop on a dynamic list where items can be inserted, reordered, or deleted?',
              options: [
                'React uses `key` to match fiber nodes across renders; index keys cause state/DOM mismatch when order changes',
                'Array index keys throw a TypeScript compile error in strict mode',
                'Index keys disable CSS flexbox layouts on child elements',
                'React ignores `onClick` handlers when `key` is a number',
              ],
              correctIndex: 0,
              difficulty: 'INTERMEDIATE',
              topic: 'React Fundamentals',
              explanation: 'React reconciliation tracks element identity by `key`; shifting indices misaligns component state and inputs.',
              allocatedSec: 75,
            },
            {
              statement: 'When fetching data in `useEffect` on search input changes, how do you prevent stale earlier responses from overwriting newer responses?',
              options: [
                'Use an `AbortController` (or cleanup cancellation flag) returned from `useEffect` to cancel/ignore superseded requests',
                'Wrap `fetch` in `setTimeout(..., 0)`',
                'Use `async` directly on the `useEffect` callback function',
                'Store the response in a `useRef` without triggering state',
              ],
              correctIndex: 0,
              difficulty: 'ADVANCED',
              topic: 'React Hooks & Async',
              explanation: 'Returning a cleanup function with `AbortController.abort()` prevents race conditions from out-of-order network responses.',
              allocatedSec: 90,
            },
            {
              statement: 'Which TypeScript utility type constructs a type with only `id` and `email` picked from `CandidateProfile` while keeping them optional?',
              options: [
                '`Partial<Pick<CandidateProfile, "id" | "email">>`',
                '`Omit<CandidateProfile, "id" | "email">`',
                '`Required<Extract<CandidateProfile, "id" | "email">>`',
                '`Record<"id" | "email", CandidateProfile>`',
              ],
              correctIndex: 0,
              difficulty: 'ADVANCED',
              topic: 'TypeScript',
              explanation: '`Pick` selects the subset of keys and `Partial` marks each selected property optional.',
              allocatedSec: 90,
            },
            {
              statement: 'What is the primary cause of React hydration mismatches in SSR/React applications?',
              options: [
                'Rendering non-deterministic values (like `Date.now()` or `window.innerWidth`) differently on server vs initial client render',
                'Using CSS Grid inside functional components',
                'Calling `useState` more than twice in a single component',
                'Exporting components as named exports instead of default exports',
              ],
              correctIndex: 0,
              difficulty: 'HARD',
              topic: 'Application Architecture',
              explanation: 'Hydration expects the initial client render output to match the server-rendered HTML tree.',
              allocatedSec: 100,
            },
            {
              statement: 'Which HTTP status code and response strategy is most appropriate when an API client sends a malformed JSON payload or fails schema validation?',
              options: [
                'Return 400 Bad Request (or 422 Unprocessable Entity) with structured field-level validation errors',
                'Return 200 OK with an empty body',
                'Return 500 Internal Server Error and expose stack traces to the client',
                'Return 302 Redirect to the login page',
              ],
              correctIndex: 0,
              difficulty: 'INTERMEDIATE',
              topic: 'REST API Design',
              explanation: '4xx client error codes clearly signal invalid input without masking bugs as 500s.',
              allocatedSec: 75,
            },
            {
              statement: 'An API endpoint executes 1 query to fetch 50 orders and then runs 50 separate queries inside a loop to fetch each order’s customer. What is this issue called and how do you fix it?',
              options: [
                'The N+1 query problem; fix it with an eager JOIN, `WHERE IN (...)` batch query, or DataLoader',
                'A CORS preflight issue; fix it by disabling HTTPS',
                'A memory leak in JSON.stringify; fix it by using XML',
                'Deadlock; fix it by removing all database indexes',
              ],
              correctIndex: 0,
              difficulty: 'ADVANCED',
              topic: 'Database Performance',
              explanation: 'Batching or joining collapses N+1 round-trips into 1–2 queries.',
              allocatedSec: 90,
            },
            {
              statement: 'When storing user passwords in a production database, which approach meets modern security standards?',
              options: [
                'Hash with a slow, memory-hard salted algorithm such as Argon2id or bcrypt (cost >= 10)',
                'Encrypt with Base64 encoding so support can decode it',
                'Store a plain SHA-256 hash without a per-user salt',
                'Store passwords in plaintext inside an environment variable',
              ],
              correctIndex: 0,
              difficulty: 'INTERMEDIATE',
              topic: 'Application Security',
              explanation: 'Argon2id/bcrypt with unique salts resists rainbow tables and GPU brute-force attacks.',
              allocatedSec: 75,
            },
            {
              statement: 'In SQL/PostgreSQL, why should a composite index `(tenant_id, created_at)` be ordered with `tenant_id` first when queries filter `WHERE tenant_id = $1 ORDER BY created_at DESC`?',
              options: [
                'B-tree indexes sort by the leading column first, allowing an index range scan per tenant without a separate sort',
                'PostgreSQL ignores indexes that start with an ID column',
                'Putting `created_at` first encrypts the table automatically',
                'Composite indexes only work on boolean columns',
              ],
              correctIndex: 0,
              difficulty: 'HARD',
              topic: 'Databases & Indexing',
              explanation: 'Leftmost prefix ordering lets the database narrow to one tenant and read rows already sorted by `created_at`.',
              allocatedSec: 100,
            },
            {
              statement: 'How do you make a payment or webhook processing endpoint idempotent so duplicate retries do not charge or create records twice?',
              options: [
                'Require an idempotency key / unique event ID stored with a unique DB constraint and return the recorded result on replay',
                'Sleep for 5 seconds before processing every request',
                'Disable retries on the client and ignore network timeouts',
                'Use HTTP GET instead of HTTP POST',
              ],
              correctIndex: 0,
              difficulty: 'HARD',
              topic: 'Distributed Systems',
              explanation: 'Atomic unique-constraint tracking on idempotency keys guarantees at-most-once side effects.',
              allocatedSec: 100,
            },
            {
              statement: 'Which Git workflow best preserves a clean, bisect-friendly history when integrating a feature branch with many small WIP commits into `main`?',
              options: [
                'Squash-and-merge (or interactive rebase) into a cohesive commit with passing CI checks before merging',
                'Force-push directly to `main` without running tests',
                'Commit `node_modules` and `.env` files to avoid CI setup',
                'Copy-paste changed files manually into the GitHub web editor',
              ],
              correctIndex: 0,
              difficulty: 'INTERMEDIATE',
              topic: 'Engineering Practices',
              explanation: 'Squash/rebase keeps `main` atomic and easy to revert or `git bisect`.',
              allocatedSec: 75,
            },
            {
              statement: 'When testing a service that calls an external payment gateway, what is the best way to achieve fast, deterministic unit/integration tests?',
              options: [
                'Mock or stub the gateway HTTP boundary (e.g. MSW/Nock/interface fake) while testing real validation and state transitions',
                'Charge a real credit card on every CI run',
                'Skip all assertions around payment failure paths',
                'Hardcode `if (test) return true` inside production business logic',
              ],
              correctIndex: 0,
              difficulty: 'INTERMEDIATE',
              topic: 'Automated Testing',
              explanation: 'Boundary fakes keep tests deterministic and fast while exercising real domain logic.',
              allocatedSec: 80,
            },
            {
              statement: 'In Node.js / TypeScript async code, what happens if you `forEach` over an array with an `async` callback without `Promise.all` or `for...of`?',
              options: [
                '`Array.prototype.forEach` ignores returned Promises, so outer code continues before async iterations finish and errors may be unhandled',
                '`forEach` automatically runs items sequentially and awaits each one',
                'TypeScript refuses to compile `forEach` with async callbacks',
                'Node.js blocks the entire event loop until `forEach` completes',
              ],
              correctIndex: 0,
              difficulty: 'ADVANCED',
              topic: 'JavaScript / Node.js',
              explanation: '`forEach` does not await promises; use `for...of` for sequential or `Promise.all(arr.map(...))` for concurrent execution.',
              allocatedSec: 90,
            },
            {
              statement: 'A production service experiences cascading failures because a slow downstream API holds connections open indefinitely. Which resilience pattern prevents thread/connection exhaustion?',
              options: [
                'Strict request timeouts combined with a circuit breaker and bounded retries with exponential backoff + jitter',
                'Infinite synchronous retries with zero delay',
                'Increasing the client browser cache TTL to 1 year',
                'Removing all error handling so the process crashes on every failed request',
              ],
              correctIndex: 0,
              difficulty: 'HARD',
              topic: 'System Reliability',
              explanation: 'Timeouts + circuit breakers fail fast and protect upstream capacity from cascading overload.',
              allocatedSec: 100,
            },
            {
              statement: 'What is the key security risk of concatenating user input directly into a SQL query string instead of using parameterized queries?',
              options: [
                'SQL injection, allowing attackers to alter query structure, exfiltrate data, or modify/drop records',
                'Increased CSS bundle size on the frontend',
                'Automatic conversion of integers to floating-point numbers',
                'Loss of UTF-8 character encoding',
              ],
              correctIndex: 0,
              difficulty: 'INTERMEDIATE',
              topic: 'Security & SQL',
              explanation: 'Parameterized/prepared statements separate SQL syntax from user-supplied data.',
              allocatedSec: 75,
            },
            {
              statement: 'In a React Native / mobile app, a FlatList with 2,000 items drops frames while scrolling. Which combination best improves scroll performance?',
              options: [
                'Memoize row items (`React.memo`), provide stable `keyExtractor` and `getItemLayout`, and tune `windowSize`/`maxToRenderPerBatch`',
                'Replace `FlatList` with a plain `ScrollView` rendering all 2,000 items at once',
                'Call `setState` inside every row’s `render` method on scroll',
                'Disable image caching so every row re-downloads assets on scroll',
              ],
              correctIndex: 0,
              difficulty: 'ADVANCED',
              topic: 'Mobile & React Native',
              explanation: 'Virtualization tuning plus `React.memo` and `getItemLayout` eliminates layout thrashing and redundant renders.',
              allocatedSec: 90,
            },
            {
              statement: 'You need to deploy a breaking database column rename with zero downtime while old and new app instances run concurrently. What is the safest migration strategy?',
              options: [
                'Expand-and-contract: add the new column, dual-write/backfill, switch reads to the new column, then drop the old column in a later deploy',
                'Run `ALTER TABLE ... RENAME COLUMN` directly during peak traffic before deploying app code',
                'Drop the table and recreate it from a local CSV backup',
                'Disable all database writes for 24 hours without notifying users',
              ],
              correctIndex: 0,
              difficulty: 'HARD',
              topic: 'Zero-Downtime Migrations',
              explanation: 'Expand-and-contract maintains backward compatibility across rolling deployments.',
              allocatedSec: 100,
            },
            {
              statement: 'How does Cross-Site Request Forgery (CSRF) differ from Cross-Site Scripting (XSS), and how is cookie-based auth protected against CSRF?',
              options: [
                'CSRF abuses ambient browser credentials on cross-origin requests; mitigate with `SameSite=Lax/Strict` cookies and anti-CSRF tokens',
                'CSRF injects SQL into PostgreSQL; mitigate by minifying JavaScript',
                'XSS and CSRF are identical and both are fully solved by enabling gzip compression',
                'CSRF only occurs over WebSockets and cannot affect HTTP POST endpoints',
              ],
              correctIndex: 0,
              difficulty: 'ADVANCED',
              topic: 'Web Security',
              explanation: 'SameSite cookie attributes and synchronizer/double-submit CSRF tokens block forged cross-site state changes.',
              allocatedSec: 90,
            },
            {
              statement: 'In AWS / cloud architectures, why should long-running email or document processing jobs be decoupled behind a queue (e.g., SQS) rather than executed synchronously in an HTTP request?',
              options: [
                'Queues absorb traffic spikes, prevent HTTP timeouts, and enable controlled retries with dead-letter queues for failed jobs',
                'Queues eliminate the need for authentication on public endpoints',
                'HTTP servers cannot send JSON responses larger than 1 KB',
                'Queues automatically fix syntax errors in worker code',
              ],
              correctIndex: 0,
              difficulty: 'INTERMEDIATE',
              topic: 'Cloud Architecture',
              explanation: 'Asynchronous queues improve resilience, latency, and fault isolation under load.',
              allocatedSec: 85,
            },
            {
              statement: 'When implementing cursor-based pagination vs offset-based pagination (`OFFSET 10000 LIMIT 20`) on a rapidly changing table, why is cursor pagination preferred?',
              options: [
                'Cursor pagination avoids scanning/discarding skipped rows and prevents duplicate or skipped items when new rows are inserted',
                'Offset pagination does not support `ORDER BY` clauses in SQL',
                'Cursor pagination removes the need for any index on the sort column',
                'Offset pagination can only return 10 rows per query',
              ],
              correctIndex: 0,
              difficulty: 'HARD',
              topic: 'API & Database Scaling',
              explanation: 'Keyset/cursor pagination runs in O(log N) via index seek and stays stable under concurrent writes.',
              allocatedSec: 95,
            },
            {
              statement: 'In TypeScript, what is the practical advantage of using `unknown` over `any` for untrusted API responses or caught errors?',
              options: [
                '`unknown` forces explicit type narrowing or schema validation before accessing properties, preventing silent runtime TypeErrors',
                '`unknown` disables all type checking across the entire file',
                '`unknown` automatically converts JSON strings into class instances at runtime',
                '`any` is rejected by Node.js at runtime',
              ],
              correctIndex: 0,
              difficulty: 'INTERMEDIATE',
              topic: 'TypeScript Safety',
              explanation: '`unknown` is type-safe: you must validate or narrow the value before using it.',
              allocatedSec: 75,
            },
          ]
        : asg.category === 'RELOCATION'
          ? [
              {
                statement: 'Which document is typically required by employers and immigration authorities before issuing a skilled work visa sponsorship?',
                options: [
                  'Verified employment contract/offer letter meeting salary & occupation thresholds plus recognized qualification proof',
                  'Only a social media profile link without identification',
                  'An unverified verbal promise from a recruiter',
                  'A tourist hotel reservation for 3 nights',
                ],
                correctIndex: 0,
                difficulty: 'INTERMEDIATE',
                topic: 'Visa Sponsorship Requirements',
                explanation: 'Skilled work visas require an eligible job offer/contract and verified qualifications.',
                allocatedSec: 90,
              },
              {
                statement: 'When relocating internationally with foreign academic qualifications, what does credential evaluation / apostille verification accomplish?',
                options: [
                  'Confirms authenticity and equivalency of your degree/diploma against the destination country framework',
                  'Automatically grants permanent citizenship on arrival',
                  'Replaces the need for a valid passport',
                  'Exempts all applicants from language proficiency rules',
                ],
                correctIndex: 0,
                difficulty: 'ADVANCED',
                topic: 'Credential Equivalency',
                explanation: 'Destination immigration bodies use credential recognition (e.g. WES, ZAB, NARIC) to validate foreign degrees.',
                allocatedSec: 90,
              },
              {
                statement: 'What is the primary purpose of a police clearance certificate in an international skilled work visa application?',
                options: [
                  'Demonstrates good character and absence of disqualifying criminal records in countries of recent residence',
                  'Replaces proof of employment experience',
                  'Waives visa application fees',
                  'Guarantees employer-paid housing',
                ],
                correctIndex: 0,
                difficulty: 'INTERMEDIATE',
                topic: 'Compliance & Background Checks',
                explanation: 'Immigration authorities require criminal background clearance from countries lived in for 12+ months.',
                allocatedSec: 75,
              },
              {
                statement: 'When negotiating a relocation package with an overseas employer, which item directly reduces initial settlement risk?',
                options: [
                  'Written agreement covering visa sponsorship fees, flight allowance, temporary accommodation, and tax/payroll onboarding support',
                  'Relying on an informal verbal commitment after arriving on a tourist visa',
                  'Declining to verify whether the employer holds a valid sponsorship license',
                  'Entering the country without a work-authorized visa to start immediately',
                ],
                correctIndex: 0,
                difficulty: 'ADVANCED',
                topic: 'Relocation Planning',
                explanation: 'Documented sponsorship and settlement terms prevent unlawful work status and unexpected out-of-pocket costs.',
                allocatedSec: 90,
              },
              {
                statement: 'Why do many countries require recognized language proficiency test results (e.g. IELTS, TOEFL, Goethe) for skilled migration?',
                options: [
                  'To objectively verify workplace communication readiness and immigration points eligibility',
                  'To convert foreign currency into local salary',
                  'To replace academic transcripts',
                  'To extend passport validity by 10 years',
                ],
                correctIndex: 0,
                difficulty: 'INTERMEDIATE',
                topic: 'Language & Integration',
                explanation: 'Standardized language scores are often mandatory for visa points and regulated professions.',
                allocatedSec: 75,
              },
            ]
          : asg.category === 'SCHOLARSHIP'
            ? [
                {
                  statement: 'What makes a postgraduate scholarship motivation statement stand out to admissions and funding committees?',
                  options: [
                    'Clear alignment between prior academic/work impact, chosen programme curriculum, and measurable post-study goals',
                    'Repeating the university marketing brochure word-for-word',
                    'Omitting academic achievements to keep the letter under three sentences',
                    'Applying without checking eligibility or degree prerequisites',
                  ],
                  correctIndex: 0,
                  difficulty: 'INTERMEDIATE',
                  topic: 'Motivation & Alignment',
                  explanation: 'Scholarship panels evaluate specific fit, track record, and clear post-study impact.',
                  allocatedSec: 90,
                },
                {
                  statement: 'When preparing academic reference letters for a competitive international scholarship, who should you ask and what should you provide them?',
                  options: [
                    'Professors or supervisors who directly oversaw your work, briefed with your CV, transcript, and programme goals well before the deadline',
                    'A friend or relative with no knowledge of your academic work',
                    'Submit unsigned letters written by yourself',
                    'Wait until the day after the scholarship deadline',
                  ],
                  correctIndex: 0,
                  difficulty: 'INTERMEDIATE',
                  topic: 'Academic References',
                  explanation: 'Specific, credible academic/professional referees given context write far stronger endorsements.',
                  allocatedSec: 75,
                },
                {
                  statement: 'What is the best way to present a research proposal for a funded Master’s or PhD scholarship?',
                  options: [
                    'Define a clear research question, literature gap, methodology, feasibility, and alignment with a target supervisor’s lab',
                    'List 10 unrelated topics without any methodology',
                    'Copy an abstract from an existing published paper',
                    'Omit how the research relates to the host department',
                  ],
                  correctIndex: 0,
                  difficulty: 'HARD',
                  topic: 'Research Proposal Design',
                  explanation: 'Committees fund focused, feasible proposals aligned with host faculty expertise.',
                  allocatedSec: 100,
                },
                {
                  statement: 'If your undergraduate grading scale differs from the host university’s GPA scale, how should you present your academic transcript?',
                  options: [
                    'Submit the official certified transcript with its institutional grading key (and official conversion/evaluation if requested)',
                    'Manually guess and alter the grades on the PDF',
                    'Submit only a screenshot of partial grades without institution details',
                    'Omit failed or repeated courses from the official document',
                  ],
                  correctIndex: 0,
                  difficulty: 'ADVANCED',
                  topic: 'Academic Credentials',
                  explanation: 'Official transcripts with grading scales allow admissions teams to evaluate equivalence accurately.',
                  allocatedSec: 85,
                },
              ]
            : [];

    const difficulties: Array<'INTERMEDIATE' | 'ADVANCED' | 'HARD'> = [
      'INTERMEDIATE',
      'ADVANCED',
      'HARD',
    ];
    const topics = [
      `${roleOrField} Core Practice`,
      'Problem Solving & Diagnostics',
      'Quality, Safety & Compliance',
      'Stakeholder Communication',
      'Architecture & Execution',
    ];

    // Prioritize unseen questions first, then shuffle both order and options (A/B/C/D)
    const prevSet = new Set(previousStatements);
    const unseen = this.shuffleArray(bank.filter((q) => !prevSet.has(q.statement)));
    const seen = this.shuffleArray(bank.filter((q) => prevSet.has(q.statement)));
    const orderedBank = [...unseen, ...seen];

    const result: AssessmentQuestionRecord[] = [];
    for (let i = 0; i < 15; i++) {
      const preset = orderedBank[i];
      if (preset) {
        const { options, correctIndex } = this.shuffleQuestionOptions(preset.options, preset.correctIndex);
        result.push({
          ...preset,
          options,
          correctIndex,
          id: `q-${sessionId}-${i + 1}`,
          sessionId,
          questionOrder: i + 1,
        });
      } else {
        const diff = difficulties[i % 3];
        const topic = topics[i % topics.length];
        const rawOptions = [
          'Validate core requirements with stakeholders, document trade-offs/risks, execute the highest-impact items first, and verify quality before handoff',
          'Skip quality verification completely and submit unreviewed work',
          'Change scope silently without informing stakeholders or documenting decisions',
          'Wait indefinitely without escalating blockers or proposing alternatives',
        ];
        const { options, correctIndex } = this.shuffleQuestionOptions(rawOptions, 0);
        result.push({
          id: `q-${sessionId}-${i + 1}`,
          sessionId,
          questionOrder: i + 1,
          statement: `[${diff}] In a ${roleOrField} role (${topic}), a deliverable faces conflicting requirements and a strict deadline. Which action demonstrates the strongest professional judgment?`,
          options,
          correctIndex,
          difficulty: diff,
          topic,
          explanation: 'Clear stakeholder alignment, risk documentation, and verified execution ensure reliable delivery.',
          allocatedSec: 90,
        });
      }
    }
    return result;
  }
}
