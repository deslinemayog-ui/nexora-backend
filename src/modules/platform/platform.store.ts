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
  visaType?: string;
  targetCountry?: string;
  processingTime?: string;
  requiredDocuments?: string[];
  institutionName?: string;
  degreeLevel?: string;
  fundingCoverage?: string;
  minGpaOrScore?: string;
  investmentStage?: string;
  sectorFocus?: string;
  equityTerms?: string;
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
  nextBillingDate?: string;
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
  dueDate?: string;
  nextDueDate?: string;
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
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'nexora-d7346';
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyBjRi92-GpP71HcBUUXknw3vPhX3lSh7dk';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

const COLLECTION_MAP: Array<{ key: keyof PlatformStoreState; collection: string }> = [
  { key: 'organisations', collection: 'nexora_organisations' },
  { key: 'organisationUsers', collection: 'nexora_organisation_users' },
  { key: 'vacancies', collection: 'nexora_vacancies' },
  { key: 'assignments', collection: 'nexora_assignments' },
  { key: 'sessions', collection: 'nexora_assessment_sessions' },
  { key: 'transcripts', collection: 'nexora_assessment_transcripts' },
  { key: 'applications', collection: 'nexora_applications' },
  { key: 'interviews', collection: 'nexora_interviews' },
  { key: 'placements', collection: 'nexora_placements' },
  { key: 'notifications', collection: 'nexora_notifications' },
  { key: 'documentAccessLogs', collection: 'nexora_doc_access_logs' },
  { key: 'supportingDocuments', collection: 'nexora_supporting_docs' },
  { key: 'invoices', collection: 'nexora_invoices' },
];

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
  private syncedJsonByKey = new Map<string, string>();
  private syncPromise: Promise<void> | null = null;
  private firebaseHydrated = false;

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
    if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
      void this.syncFromFirebase();
    }
  }

  public async syncFromFirebase(): Promise<void> {
    if (this.syncPromise) return this.syncPromise;
    this.syncPromise = (async () => {
      try {
        for (const { key, collection } of COLLECTION_MAP) {
          const items: any[] = [];
          let pageToken = '';
          do {
            const url = `${FIRESTORE_BASE}/${collection}?pageSize=300&key=${FIREBASE_API_KEY}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
            if (!res.ok) break;
            const json = (await res.json()) as {
              documents?: Array<{ name: string; fields?: Record<string, any> }>;
              nextPageToken?: string;
            };
            for (const doc of json.documents || []) {
              const fields = doc.fields || {};
              const hasNativeFields = Object.keys(fields).some(
                (k) => k !== 'id' && k !== 'userUid' && k !== 'updatedAt' && k !== 'payload',
              );
              if (hasNativeFields) {
                const parsed: Record<string, any> = {};
                for (const [k, v] of Object.entries(fields)) {
                  if (k === 'payload') continue;
                  parsed[k] = this.parseFirestoreValue(v);
                }
                if (!parsed.id && doc.name) {
                  parsed.id = doc.name.split('/').pop() || '';
                }
                if (parsed.id) {
                  items.push(parsed);
                  this.syncedJsonByKey.set(`${collection}/${parsed.id}`, JSON.stringify(parsed));
                }
              } else if (fields.payload?.stringValue) {
                try {
                  const parsed = JSON.parse(fields.payload.stringValue);
                  items.push(parsed);
                  // Leave out of syncedJsonByKey so next flush upgrades it to native Firestore fields
                } catch {
                  // skip malformed doc
                }
              }
            }
            pageToken = json.nextPageToken || '';
          } while (pageToken);

          if (items.length > 0) {
            // Merge Firebase items with any unsynced local items (Firebase takes precedence for same ID)
            const byId = new Map<string, any>();
            for (const localItem of this.state[key] as any[]) {
              if (localItem?.id) byId.set(localItem.id, localItem);
            }
            for (const remoteItem of items) {
              if (remoteItem?.id) byId.set(remoteItem.id, remoteItem);
            }
            (this.state[key] as any[]) = Array.from(byId.values()).sort((a, b) =>
              String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')),
            );
          }
        }
        this.firebaseHydrated = true;
        this.writeLocalCache();
      } catch {
        // non-fatal if offline
      } finally {
        this.syncPromise = null;
      }
    })();
    return this.syncPromise;
  }

  private toFirestoreValue(val: any): Record<string, any> {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === 'string') return { stringValue: val };
    if (typeof val === 'boolean') return { booleanValue: val };
    if (typeof val === 'number') {
      return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
    }
    if (Array.isArray(val)) {
      return { arrayValue: { values: val.map((v) => this.toFirestoreValue(v)) } };
    }
    if (typeof val === 'object') {
      const fields: Record<string, any> = {};
      for (const [k, v] of Object.entries(val)) {
        if (v !== undefined) fields[k] = this.toFirestoreValue(v);
      }
      return { mapValue: { fields } };
    }
    return { stringValue: String(val) };
  }

  private toFirestoreFields(obj: Record<string, any>): Record<string, any> {
    const fields: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) {
        fields[k] = this.toFirestoreValue(v);
      }
    }
    return fields;
  }

  public async flushToFirebase(): Promise<void> {
    if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;
    this.ensureLoaded();
    const currentKeys = new Set<string>();
    const ops: Array<Promise<any>> = [];

    for (const { key, collection } of COLLECTION_MAP) {
      for (const item of this.state[key] as any[]) {
        if (!item?.id) continue;
        const docKey = `${collection}/${item.id}`;
        currentKeys.add(docKey);
        const serialized = JSON.stringify(item);
        if (this.syncedJsonByKey.get(docKey) === serialized) continue;

        const url = `${FIRESTORE_BASE}/${collection}/${encodeURIComponent(item.id)}?key=${FIREBASE_API_KEY}`;
        ops.push(
          fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fields: this.toFirestoreFields(item),
            }),
            signal: AbortSignal.timeout(6000),
          })
            .then((r) => {
              if (r.ok) this.syncedJsonByKey.set(docKey, serialized);
            })
            .catch(() => undefined),
        );
      }
    }

    if (this.firebaseHydrated) {
      for (const oldKey of Array.from(this.syncedJsonByKey.keys())) {
        if (!currentKeys.has(oldKey)) {
          const [collection, id] = oldKey.split('/');
          const url = `${FIRESTORE_BASE}/${collection}/${encodeURIComponent(id)}?key=${FIREBASE_API_KEY}`;
          ops.push(
            fetch(url, { method: 'DELETE', signal: AbortSignal.timeout(6000) })
              .then((r) => {
                if (r.ok || r.status === 404) this.syncedJsonByKey.delete(oldKey);
              })
              .catch(() => undefined),
          );
        }
      }
    }

    await Promise.all(ops);
  }

  private writeLocalCache(): void {
    try {
      fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
      fs.writeFileSync(STORE_PATH, JSON.stringify(this.state, null, 2), 'utf8');
    } catch {
      // ignore disk write issues in read-only envs
    }
  }

  public getState(): PlatformStoreState {
    this.ensureLoaded();
    return this.state;
  }

  public save(): void {
    this.ensureLoaded();
    this.writeLocalCache();
    void this.flushToFirebase();
  }

  public hashPassword(password: string): string {
    return crypto.createHash('sha256').update(`nexora_salt::${password}`).digest('hex');
  }

  private parseFirestoreValue(val: any): any {
    if (!val || typeof val !== 'object') return undefined;
    if ('stringValue' in val) return val.stringValue;
    if ('integerValue' in val) return Number(val.integerValue);
    if ('doubleValue' in val) return Number(val.doubleValue);
    if ('booleanValue' in val) return Boolean(val.booleanValue);
    if ('timestampValue' in val) return val.timestampValue;
    if ('nullValue' in val) return null;
    if ('arrayValue' in val) {
      return (val.arrayValue?.values || []).map((v: any) => this.parseFirestoreValue(v));
    }
    if ('mapValue' in val) {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(val.mapValue?.fields || {})) {
        out[k] = this.parseFirestoreValue(v);
      }
      return out;
    }
    return undefined;
  }

  public async fetchFirestoreCollection(collectionName: string): Promise<Array<Record<string, any>>> {
    const results: Array<Record<string, any>> = [];
    try {
      let pageToken = '';
      do {
        const url = `${FIRESTORE_BASE}/${collectionName}?pageSize=300&key=${FIREBASE_API_KEY}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) break;
        const json = (await res.json()) as {
          documents?: Array<{ name: string; fields?: Record<string, any> }>;
          nextPageToken?: string;
        };
        for (const doc of json.documents || []) {
          const docId = doc.name?.split('/').pop() || '';
          const row: Record<string, any> = { id: docId };
          for (const [k, v] of Object.entries(doc.fields || {})) {
            row[k] = this.parseFirestoreValue(v);
          }
          results.push(row);
        }
        pageToken = json.nextPageToken || '';
      } while (pageToken);
    } catch {
      // non-fatal
    }
    return results;
  }
}

export const platformStore = new PlatformStore();
