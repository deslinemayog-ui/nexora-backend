import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export type OrganisationCategoryType =
  | 'HIRING_COMPANY'
  | 'RECRUITMENT_AGENCY'
  | 'STAFFING_COMPANY'
  | 'INVESTMENT_PROVIDER'
  | 'RELOCATION_AGENCY'
  | 'IMMIGRATION_CONSULTANCY'
  | 'SCHOLARSHIP_PROVIDER'
  | 'EDUCATIONAL_INSTITUTION'
  | 'OTHER_PROVIDER';

export type AssignmentCategoryType = 'EMPLOYMENT' | 'RELOCATION' | 'SCHOLARSHIP';

export type AssignmentStatusType =
  | 'NOT_STARTED'
  | 'PREREQUISITES_REQUIRED'
  | 'READY_TO_START'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'PASSED'
  | 'FAILED'
  | 'EXPIRED';

export type ApplicationStatusType =
  | 'RECEIVED'
  | 'SCREENING'
  | 'SHORTLISTED'
  | 'INTERVIEW_SCHEDULED'
  | 'INTERVIEWED'
  | 'OFFER_MADE'
  | 'HIRED'
  | 'REJECTED'
  | 'WITHDRAWN';

export interface OrganisationRecord {
  id: string;
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
  passwordHash: string;
  telephone: string;
  generalEmail?: string;
  recruitmentEmail: string;
  interviewEmail?: string;
  billingEmail?: string;
  additionalRecipients: string[];
  emailVerified: boolean;
  requireTranscript?: boolean;
  verificationToken?: string;
  verificationDocs: Array<{ fileName: string; url?: string }>;
  status: 'PENDING_APPROVAL' | 'VERIFIED' | 'SUSPENDED' | 'REJECTED';
  createdAt: string;
  updatedAt: string;
}

export interface VacancyRecord {
  id: string;
  organisationId: string;
  organisationName: string;
  organisationCategory: OrganisationCategoryType;
  title: string;
  category: 'EMPLOYMENT' | 'RELOCATION' | 'SCHOLARSHIP' | 'INVESTMENT';
  vacancyType: 'PERMANENT' | 'TEMPORARY' | 'CONTRACT' | 'PART_TIME' | 'FULL_TIME' | 'REMOTE';
  workArrangement: 'REMOTE' | 'HYBRID' | 'ON_SITE';
  location: string;
  salaryRange?: string;
  monthlyOfferUsd?: number;
  nexoraFeePercent?: number;
  description: string;
  requirements: string;
  qualifications?: string;
  minYearsExperience: number;
  requiredSkills: string[];
  requiresAssessment: boolean;
  passingScorePercent: number;
  assessmentDurationMin: number;
  applicationDeadline?: string;
  status: 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' | 'CLOSED';
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentRecord {
  id: string;
  customerId: string;
  userUid: string;
  vacancyId?: string;
  title: string;
  category: AssignmentCategoryType;
  relatedOpportunity: string;
  providerName?: string;
  durationMinutes: number;
  passingScorePercent: number;
  status: AssignmentStatusType;
  prerequisiteData?: Record<string, any>;
  prerequisitesMet: boolean;
  missingPrerequisites: string[];
  dueDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssessmentQuestionRecord {
  id: string;
  sessionId: string;
  questionOrder: number;
  statement: string;
  options: string[];
  correctIndex: number;
  difficulty: 'INTERMEDIATE' | 'ADVANCED' | 'HARD';
  topic: string;
  explanation: string;
  allocatedSec: number;
}

export interface AssessmentAnswerRecord {
  questionId: string;
  selectedIndex: number;
  isCorrect: boolean;
  timeSpentSec: number;
  answeredAt: string;
}

export interface AssessmentSessionRecord {
  id: string;
  assignmentId: string;
  customerId: string;
  userUid: string;
  rulesAccepted: boolean;
  startedAt: string;
  expiresAt: string;
  submittedAt?: string;
  durationSeconds?: number;
  totalQuestions: number;
  correctCount: number;
  incorrectCount: number;
  percentageScore: number;
  passed: boolean;
  isCompleted: boolean;
  topicBreakdown: Record<string, { correct: number; total: number }>;
  difficultyBreakdown: Record<string, { correct: number; total: number }>;
  questions: AssessmentQuestionRecord[];
  answers: Record<string, AssessmentAnswerRecord>;
  createdAt: string;
}

export interface AssessmentTranscriptRecord {
  id: string;
  customerId: string;
  userUid: string;
  assignmentId: string;
  sessionId: string;
  cvDocumentId?: string;
  cvFileName?: string;
  candidateName: string;
  candidateEmail?: string;
  assignmentTitle: string;
  category: AssignmentCategoryType;
  totalQuestions: number;
  correctCount: number;
  percentageScore: number;
  passed: boolean;
  totalDurationSec: number;
  topicBreakdown: Record<string, { correct: number; total: number }>;
  difficultyBreakdown: Record<string, { correct: number; total: number }>;
  questionDetails: Array<{
    order: number;
    topic: string;
    difficulty: string;
    statement: string;
    selectedAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    timeSpentSec: number;
  }>;
  aiPerformanceSummary: string;
  pdfFileName?: string;
  pdfDownloadUrl?: string;
  submittedAt: string;
  createdAt: string;
}

export interface VacancyApplicationRecord {
  id: string;
  referenceCode: string;
  vacancyId: string;
  vacancyTitle: string;
  organisationId: string;
  organisationName: string;
  customerId: string;
  userUid: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string;
  cvFileName?: string;
  cvDownloadUrl?: string;
  transcriptId?: string;
  transcriptScore?: number;
  transcriptPdfUrl?: string;
  qualifications?: string;
  workExperience?: string;
  skills: string[];
  coverNote?: string;
  consentToShare: boolean;
  status: ApplicationStatusType;
  internalNotes?: string;
  aiMatchSummary?: string;
  aiMatchScore?: number;
  aiStrengths?: string[];
  aiGaps?: string[];
  communications: Array<{
    id: string;
    senderType: 'COMPANY' | 'CANDIDATE';
    senderName: string;
    subject: string;
    body: string;
    sentAt: string;
  }>;
  appliedAt: string;
  updatedAt: string;
}

export interface InterviewRecord {
  id: string;
  organisationId: string;
  vacancyId?: string;
  applicationId?: string;
  customerId: string;
  userUid: string;
  companyName: string;
  jobTitle: string;
  candidateName: string;
  candidateEmail: string;
  interviewDate: string;
  interviewTime: string;
  timezone: string;
  interviewType: 'ONLINE' | 'TELEPHONE' | 'IN_PERSON';
  locationOrLink: string;
  instructions?: string;
  status: 'INVITED' | 'SCHEDULED' | 'RESCHEDULED' | 'COMPLETED' | 'CANCELLED';
  interviewerNotes?: string;
  candidateFeedback?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlacementRecord {
  id: string;
  organisationId: string;
  vacancyId?: string;
  customerId: string;
  candidateName: string;
  roleTitle: string;
  contractModel: 'DIRECT_PLACEMENT' | 'CONTRACTOR_PLACEMENT' | 'NEXORA_EOR_STAFFING';
  startDate: string;
  endDate?: string;
  hourlyRateCents?: number;
  monthlySalaryCents?: number;
  placementFeeCents?: number;
  currency: string;
  legalEntityArranged: boolean;
  taxComplianceReady: boolean;
  onboardingStatus: string;
  contractTerms?: string;
  timesheets: Array<{
    id: string;
    weekStarting: string;
    hoursWorked: number;
    attendanceLog?: string;
    approved: boolean;
    invoiced: boolean;
    invoiceAmountCents?: number;
    createdAt: string;
  }>;
  payrollRecords: Array<{
    id: string;
    periodLabel: string;
    grossPayCents: number;
    deductionsCents: number;
    netPayCents: number;
    status: string;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationRecord {
  id: string;
  customerId?: string;
  userUid?: string;
  organisationId?: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
  isRead: boolean;
  createdAt: string;
}

export interface DocumentAccessLogRecord {
  id: string;
  organisationId: string;
  candidateUid: string;
  documentType: string;
  action: string;
  accessedAt: string;
}

export interface SupportingDocumentRecord {
  id: string;
  userUid: string;
  agentType: 'JOB_AGENT' | 'VISA_AGENT' | 'EDUCATION_AGENT' | 'INVESTOR_AGENT';
  docType: string;
  label: string;
  fileName: string;
  storedFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  downloadUrl: string;
  createdAt: string;
}

export interface MonthlyInvoiceRecord {
  id: string;
  invoiceNumber: string;
  organisationId: string;
  organisationName: string;
  billingEmail: string;
  placementId?: string;
  applicationId?: string;
  vacancyId?: string;
  vacancyTitle: string;
  category: string;
  candidateName: string;
  candidateEmail: string;
  billingMonth: string; // YYYY-MM
  offerAmountUsd: number;
  feePercent: number;
  feeAmountUsd: number;
  feeAmountCents: number;
  status: 'PENDING' | 'PAID';
  paystackReference?: string;
  pdfFileName?: string;
  pdfDownloadUrl?: string;
  paidAt?: string;
  createdAt: string;
}

export interface OrganisationUserRecord {
  id: string;
  organisationId: string;
  fullName: string;
  email: string;
  passwordHash: string;
  role: 'ADMIN' | 'RECRUITER' | 'INTERVIEWER' | 'FINANCE';
  status: 'ACTIVE' | 'DISABLED';
  createdAt: string;
  updatedAt: string;
}

export interface PlatformStoreState {
  organisations: OrganisationRecord[];
  organisationUsers: OrganisationUserRecord[];
  vacancies: VacancyRecord[];
  assignments: AssignmentRecord[];
  sessions: AssessmentSessionRecord[];
  transcripts: AssessmentTranscriptRecord[];
  applications: VacancyApplicationRecord[];
  interviews: InterviewRecord[];
  placements: PlacementRecord[];
  notifications: NotificationRecord[];
  documentAccessLogs: DocumentAccessLogRecord[];
  supportingDocuments: SupportingDocumentRecord[];
  invoices: MonthlyInvoiceRecord[];
}

const STORE_PATH = path.resolve(process.cwd(), 'node_modules', '.cache', 'nexora-platform-db.json');

const EMPTY_STATE: PlatformStoreState = {
  organisations: [],
  organisationUsers: [],
  vacancies: [],
  assignments: [],
  sessions: [],
  transcripts: [],
  applications: [],
  interviews: [],
  placements: [],
  notifications: [],
  documentAccessLogs: [],
  supportingDocuments: [],
  invoices: [],
};

class PlatformStore {
  private state: PlatformStoreState = { ...EMPTY_STATE };
  private loaded = false;

  private ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    try {
      if (fs.existsSync(STORE_PATH)) {
        const raw = fs.readFileSync(STORE_PATH, 'utf8');
        const parsed = JSON.parse(raw) as Partial<PlatformStoreState>;
        this.state = {
          organisations: parsed.organisations ?? [],
          organisationUsers: parsed.organisationUsers ?? [],
          vacancies: parsed.vacancies ?? [],
          assignments: parsed.assignments ?? [],
          sessions: parsed.sessions ?? [],
          transcripts: parsed.transcripts ?? [],
          applications: parsed.applications ?? [],
          interviews: parsed.interviews ?? [],
          placements: parsed.placements ?? [],
          notifications: parsed.notifications ?? [],
          documentAccessLogs: parsed.documentAccessLogs ?? [],
          supportingDocuments: parsed.supportingDocuments ?? [],
          invoices: parsed.invoices ?? [],
        };
      }
    } catch {
      this.state = { ...EMPTY_STATE };
    }
  }

  public getState(): PlatformStoreState {
    this.ensureLoaded();
    return this.state;
  }

  public save(): void {
    this.ensureLoaded();
    try {
      fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
      fs.writeFileSync(STORE_PATH, JSON.stringify(this.state, null, 2), 'utf8');
    } catch {
      // ignore disk write issues in read-only test envs
    }
  }

  public hashPassword(password: string): string {
    return crypto.createHash('sha256').update(`nexora_salt::${password}`).digest('hex');
  }
}

export const platformStore = new PlatformStore();
