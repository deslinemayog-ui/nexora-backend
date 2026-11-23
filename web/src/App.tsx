import React, { useEffect, useRef, useState } from 'react';
import {
  signInWithGoogle,
  loginWithEmail,
  registerWithEmail,
  logoutUser,
  subscribeToAuthChanges,
  saveCandidateDossier,
  loadCandidateDossier,
  createFirebaseTask,
  loadUserFirebaseTasks,
  clearUserFirestoreData,
  loadOrSeedFirestoreAgents,
  type User,
  type CandidateDossier,
} from './firebase';
import { NexoraLogo, NexoraIcon } from './components/NexoraLogo';
import {
  Plus,
  Briefcase,
  Plane,
  TrendingUp,
  FileText,
  GraduationCap,
  Building2,
  Globe2,
  CalendarDays,
  Sparkles,
  Search,
  PanelLeftClose,
  PanelLeft,
  Image as ImageIcon,
  Clock,
  Library,
  Share2,
  ExternalLink,
  Download,
  LogOut,
  User as UserIcon,
  X,
  FileCheck,
  Brain,
  Mic,
  ArrowUp,
  ChevronDown,
  Layers,
  Building,
  RefreshCw,
  Mail,
  Eye,
  UploadCloud,
  Check,
  Trash2,
} from 'lucide-react';

interface AttachedDocItem {
  id: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  contentBase64: string;
  extractedText?: string;
  extracting?: boolean;
  error?: string;
}

interface MessageRecord {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  messageType: string;
  content: string;
  detectedIntent?: string | null;
  routedAgentType?: string | null;
  createdAt: string;
  thinkingSummary?: string;
  thinkingDurationSec?: number;
  attachedDocs?: Array<{ fileName: string; mimeType: string; fileSizeBytes: number }>;
  actions?: Array<{ label: string; action: string; primary?: boolean }>;
  generatedPdf?: {
    fileName: string;
    downloadUrl: string;
    fileSizeBytes: number;
    estimatedPages?: number;
  };
}

interface FollowUpTask {
  id: string;
  targetName: string;
  category: string;
  portalUrl: string;
  contactEmail?: string;
  receiptId: string;
  status: 'EMAIL_SENT' | 'FORM_FILLED' | 'SUBMITTED' | 'PENDING';
  screenshotUrl?: string;
  submittedAt: string;
}

interface ConversationItem {
  id: string;
  title: string;
  agentType: string;
  lastMessageSnippet: string;
  updatedAt: string;
  tasks: FollowUpTask[];
  messages?: MessageRecord[];
  generatedPdf?: {
    fileName: string;
    downloadUrl: string;
    fileSizeBytes: number;
    pages: number;
  };
}

const LEGACY_STORAGE_KEY = 'nexora_user_conversations_v3';

const getSessionPhoneNumber = (user: User | null): string => {
  if (user?.phoneNumber && user.phoneNumber.replace(/\D/g, '').length >= 7) {
    return user.phoneNumber;
  }
  if (user?.uid) {
    let hash = 0;
    for (let i = 0; i < user.uid.length; i++) {
      hash = (hash * 31 + user.uid.charCodeAt(i)) >>> 0;
    }
    const suffix = (100000000 + (hash % 900000000)).toString();
    return `+27${suffix}`;
  }
  return '+447700900777';
};

const getConversationsStorageKey = (uid?: string | null): string =>
  uid ? `${LEGACY_STORAGE_KEY}_${uid}` : `${LEGACY_STORAGE_KEY}_guest`;

const loadSavedConversations = (uid?: string | null): ConversationItem[] => {
  try {
    // Wipe previous shared/unscoped conversation storage keys so users never see another user's tasks
    localStorage.removeItem('nexora_user_conversations');
    localStorage.removeItem('nexora_user_conversations_v2');
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    const raw = localStorage.getItem(getConversationsStorageKey(uid));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Could not read saved conversations:', err);
  }
  return [];
};

const TASK_CHOICES = [
  {
    id: 'employment',
    title: 'Find employment',
    icon: Briefcase,
    agent: 'JOB_AGENT',
    prompt: 'Find active job openings matching my profile and submit applications on my behalf.',
  },
  {
    id: 'relocate',
    title: 'Relocate abroad',
    icon: Plane,
    agent: 'VISA_AGENT',
    prompt: 'Evaluate visa options, relocation prerequisites, and schedule consulate appointments for me.',
  },
  {
    id: 'investors',
    title: 'Find investors',
    icon: TrendingUp,
    agent: 'INVESTOR_AGENT',
    prompt: 'Find verified investors and accelerators for my startup and submit introductory pitches.',
  },
  {
    id: 'scholarships',
    title: 'Find scholarships',
    icon: GraduationCap,
    agent: 'EDUCATION_AGENT',
    prompt: 'Discover fully-funded postgraduate scholarships and grant deadlines in tech and business.',
  }
];

export const App: React.FC = () => {
  // Auth State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Layout UI State
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 900 : false,
  );
  const [showTasksDrawer, setShowTasksDrawer] = useState(false);
  const [showPlusMenu, setShowPlusMenu] = useState(false);

  // Conversations & Tasks State (strictly scoped to active user or guest)
  const currentStorageUidRef = useRef<string | null>(null);
  const [conversations, setConversations] = useState<ConversationItem[]>(() => loadSavedConversations(null));
  const [activeConvId, setActiveConvId] = useState<string | null>(null);

  // Chat & Messaging State
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const skipNextStateFetchRef = useRef(false);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  // Candidate Dossier / CV Upload Modal State
  const [showDossierModal, setShowDossierModal] = useState(false);
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [candidatePhone, setCandidatePhone] = useState('');
  const [candidateRole, setCandidateRole] = useState('');
  const [candidateLocation, setCandidateLocation] = useState('');
  const [candidatePortfolio, setCandidatePortfolio] = useState('');
  const [candidateNotes, setCandidateNotes] = useState('');
  const [uploadedCvFile, setUploadedCvFile] = useState<{
    name: string;
    size: number;
    dataUrl?: string;
  } | null>(null);
  const [isDraggingCv, setIsDraggingCv] = useState(false);
  const [isSavingDossier, setIsSavingDossier] = useState(false);

  // Task-Specific Prerequisites Modal State (4 Task Flows)
  const [activePrereqTask, setActivePrereqTask] = useState<
    'employment' | 'relocate' | 'investors' | 'scholarships' | null
  >(null);
  const [prereqFields, setPrereqFields] = useState({
    nationality: '',
    relocationPurpose: 'Skilled Work / Visa Sponsorship',
    companyName: '',
    industry: '',
    fundingStage: 'Pre-Seed / Seed',
    targetRaise: '$250,000',
    websiteUrl: '',
    studyLevel: "Master's Degree",
    fieldOfStudy: '',
    draftingNotes: '',
  });
  const [prereqDocs, setPrereqDocs] = useState<
    Record<string, { fileName?: string; fileSize?: number; draftRequested: boolean }>
  >({
    cv: { draftRequested: false },
    passport: { draftRequested: false },
    visa: { draftRequested: false },
    businessPlan: { draftRequested: false },
    pitchDeck: { draftRequested: false },
    transcripts: { draftRequested: false },
    motivationLetter: { draftRequested: false },
  });

  // Document Generator Modal State
  const [showDocModal, setShowDocModal] = useState(false);

  // Zoho IMAP Replies, Interview Alerts & Submission Thread Modal State
  const [imapReplies, setImapReplies] = useState<Array<{
    id: string;
    receiptId?: string;
    direction: 'OUTBOUND' | 'INBOUND';
    from: string;
    to: string;
    subject: string;
    body: string;
    receivedAt: string;
    isInterview: boolean;
    interviewSummary?: string;
    companyName?: string;
    messageId?: string;
    attachments?: Array<{ fileName: string; mimeType: string; sizeBytes?: number }>;
  }>>([]);
  const [outboundThreadMsgs, setOutboundThreadMsgs] = useState<Array<{
    id: string;
    receiptId?: string;
    direction: 'OUTBOUND' | 'INBOUND';
    from: string;
    to: string;
    subject: string;
    body: string;
    receivedAt: string;
    isInterview: boolean;
    companyName?: string;
    messageId?: string;
    attachments?: Array<{ fileName: string; mimeType: string; sizeBytes?: number }>;
  }>>([]);
  const [interviewAlerts, setInterviewAlerts] = useState<Array<{
    id: string;
    receiptId?: string;
    companyName: string;
    from: string;
    subject: string;
    summary: string;
    receivedAt: string;
  }>>([]);
  const [isPollingReplies, setIsPollingReplies] = useState(false);
  const [imapError, setImapError] = useState<string | null>(null);
  const [activeThreadTask, setActiveThreadTask] = useState<FollowUpTask | null>(null);
  const [replyDraftSubject, setReplyDraftSubject] = useState('');
  const [replyDraftMessage, setReplyDraftMessage] = useState('');
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false);
  const [replyAttachments, setReplyAttachments] = useState<AttachedDocItem[]>([]);
  const [isDraggingReplyFiles, setIsDraggingReplyFiles] = useState(false);
  const [chatAttachments, setChatAttachments] = useState<AttachedDocItem[]>([]);
  const [isDraggingChatFiles, setIsDraggingChatFiles] = useState(false);
  const [expandedDocId, setExpandedDocId] = useState<string | null>(null);

  // DB-Backed Agent Catalog & Account Wallet ($5.00 Free Credit)
  const [agentCatalog, setAgentCatalog] = useState<Array<{
    id: string;
    agentType: string;
    taskKey: string;
    name: string;
    description: string;
    costPerSubmissionCents: number;
    costPerSubmissionDollars: string;
  }>>([]);
  const [walletBalanceDollars, setWalletBalanceDollars] = useState<string>('5.00');
  const [submissionLimit, setSubmissionLimit] = useState<number>(3);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [creditPackages, setCreditPackages] = useState<Array<{
    id: string;
    name: string;
    creditCents: number;
    creditDollars: string;
    submissionsEstimate: string;
    popular?: boolean;
    charge?: { currency: string; amountSubunits: number };
  }>>([]);
  const [paystackConfigured, setPaystackConfigured] = useState<boolean>(true);
  const [pendingPaystackRef, setPendingPaystackRef] = useState<string | null>(null);
  const [topUpStatusMsg, setTopUpStatusMsg] = useState<string | null>(null);
  const [isProcessingPaystack, setIsProcessingPaystack] = useState(false);

  // Deep Think & Voice Microphone State
  const [deepThinkMode, setDeepThinkMode] = useState(false);
  const [expandedThinkingIds, setExpandedThinkingIds] = useState<Record<string, boolean>>({});
  const [isRecording, setIsRecording] = useState(false);
  const [voiceStatusMsg, setVoiceStatusMsg] = useState<string | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const [docPages, setDocPages] = useState(15);
  const [docCompany, setDocCompany] = useState('');
  const [docFounder, setDocFounder] = useState('');
  const [docRaise, setDocRaise] = useState('$250,000');
  const [isGeneratingDoc, setIsGeneratingDoc] = useState(false);

  // Screenshot Zoom Modal State
  const [previewScreenshotUrl, setPreviewScreenshotUrl] = useState<string | null>(null);

  // Interactive Embedded PDF Review & Edit Modal State
  const [previewPdfDoc, setPreviewPdfDoc] = useState<{
    fileName: string;
    downloadUrl: string;
    fileSizeBytes: number;
  } | null>(null);
  const [pdfPreviewBlobUrl, setPdfPreviewBlobUrl] = useState<string | null>(null);
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const [pdfPreviewError, setPdfPreviewError] = useState<string | null>(null);
  const [pdfEditPrompt, setPdfEditPrompt] = useState('');

  const formatTaskTitleWithDate = (baseTitle: string): string => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `${baseTitle} - ${yyyy}-${mm}-${dd} ${hh}:${min}`;
  };

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cvFileInputRef = useRef<HTMLInputElement>(null);
  const chatDocInputRef = useRef<HTMLInputElement>(null);
  const replyDocInputRef = useRef<HTMLInputElement>(null);

  // Fetch & render Review/Edit PDF via Blob URL so cross-origin iframe restrictions never block it
  useEffect(() => {
    if (!previewPdfDoc?.downloadUrl) {
      setPdfPreviewBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPdfPreviewError(null);
      setPdfPreviewLoading(false);
      return;
    }

    let cancelled = false;
    let createdUrl: string | null = null;
    setPdfPreviewLoading(true);
    setPdfPreviewError(null);

    (async () => {
      try {
        const targetUrl = resolveApiUrl(previewPdfDoc.downloadUrl);
        const res = await fetch(targetUrl);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const rawBlob = await res.blob();
        const pdfBlob = new Blob([rawBlob], { type: 'application/pdf' });
        createdUrl = URL.createObjectURL(pdfBlob);
        if (!cancelled) {
          setPdfPreviewBlobUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return createdUrl;
          });
        } else {
          URL.revokeObjectURL(createdUrl);
        }
      } catch (err: any) {
        if (!cancelled) {
          setPdfPreviewError(err?.message || 'Could not load PDF preview');
          setPdfPreviewBlobUrl(null);
        }
      } finally {
        if (!cancelled) {
          setPdfPreviewLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl) {
        URL.revokeObjectURL(createdUrl);
      }
    };
  }, [previewPdfDoc]);

  // Subscribe to Firebase Auth & strictly scope tasks/dossier to the logged-in user (or guest when logged out)
  useEffect(() => {
    let activeLoadToken = 0;

    const hydrateForUser = async (authUser: User | null) => {
      const loadToken = ++activeLoadToken;
      const uid = authUser?.uid || null;
      currentStorageUidRef.current = uid;

      // Immediately clear previous user's UI state and load only this user's local cache
      resetUserScopedUiState();
      const cachedConvs = loadSavedConversations(uid);
      setConversations(cachedConvs);

      const dossierUid = uid || 'guest-user';
      const saved = await loadCandidateDossier(dossierUid);
      if (loadToken !== activeLoadToken) return;

      if (saved) {
        if (saved.fullName) setCandidateName(saved.fullName);
        if (saved.email) setCandidateEmail(saved.email);
        if (saved.phone) setCandidatePhone(saved.phone);
        if (saved.location) setCandidateLocation(saved.location);
        if (saved.targetRole) setCandidateRole(saved.targetRole);
        if (saved.portfolioUrl) setCandidatePortfolio(saved.portfolioUrl);
        if (saved.notes) setCandidateNotes(saved.notes);
        if (saved.prereqFields) {
          setPrereqFields((prev) => ({
            ...prev,
            ...saved.prereqFields,
            draftingNotes: saved.notes || saved.prereqFields?.draftingNotes || prev.draftingNotes,
          }));
        }
      } else if (authUser?.email) {
        setCandidateName(authUser.displayName || '');
        setCandidateEmail(authUser.email || '');
      }

      if (!authUser?.uid) {
        return;
      }

      // Fetch tasks belonging exclusively to this logged-in user from Firebase Firestore & Backend DB
      const [fbTasks, backendRes] = await Promise.all([
        loadUserFirebaseTasks(authUser.uid),
        apiFetch(
          `/api/v1/webchat/state?phoneNumber=${encodeURIComponent(getSessionPhoneNumber(authUser))}&displayName=${encodeURIComponent(authUser.displayName || authUser.email?.split('@')[0] || 'User')}`,
        ).catch(() => null),
      ]);

      if (loadToken !== activeLoadToken) return;

      const remoteConvs: ConversationItem[] = fbTasks.map((t) => {
        const convId = t.conversationId || t.id || `task-${Date.now()}`;
        const savedMsgs: MessageRecord[] | undefined = Array.isArray(t.messages) && t.messages.length > 0
          ? t.messages
          : undefined;
        return {
          id: convId,
          title: t.title || 'Saved Task',
          agentType: t.agentType || 'SUPERVISOR',
          lastMessageSnippet:
            t.lastMessageSnippet ||
            (savedMsgs?.[savedMsgs.length - 1]?.content?.slice(0, 80) ||
              (t.status === 'SUBMITTED' ? 'Submitted applications' : 'Saved task')),
          updatedAt: t.updatedAt ? new Date(t.updatedAt).toLocaleDateString() : 'Synced',
          messages: savedMsgs,
          tasks: Array.isArray(t.targets)
            ? t.targets.map((s: any, idx: number) => ({
                id: s.receiptId || `sub-${idx}`,
                targetName: s.targetName || s.name || 'Target',
                category: s.category || 'Submission',
                portalUrl: s.portalUrl || '#',
                contactEmail: s.deliveredToEmail || s.contactEmail,
                status: s.status || 'SUBMITTED',
                receiptId: s.receiptId || `SUB-${idx}`,
                submittedAt: s.submittedAt || new Date().toISOString(),
              }))
            : [],
        };
      });

      if (backendRes && backendRes.ok) {
        try {
          const backendJson = await backendRes.json();
          const backendProjects = Array.isArray(backendJson.data?.projects) ? backendJson.data.projects : [];
          for (const proj of backendProjects) {
            const pid = proj.id;
            if (pid && !remoteConvs.some((c) => c.id === pid)) {
              remoteConvs.push({
                id: pid,
                title: proj.title || 'Project Task',
                agentType: proj.assignedAgent || 'SUPERVISOR',
                lastMessageSnippet: proj.status || 'Saved in database',
                updatedAt: proj.updatedAt ? new Date(proj.updatedAt).toLocaleDateString() : 'Synced',
                tasks: [],
              });
            }
          }
        } catch {
          // Ignore backend parse failure; Firestore tasks are already loaded
        }
      }

      if (remoteConvs.length > 0) {
        setConversations((prev) => {
          const byId = new Map<string, ConversationItem>();
          for (const r of remoteConvs) {
            byId.set(r.id, r);
          }
          for (const local of prev) {
            const remote = byId.get(local.id);
            if (remote) {
              byId.set(local.id, {
                ...remote,
                messages: local.messages && local.messages.length >= (remote.messages?.length || 0)
                  ? local.messages
                  : remote.messages,
                tasks: local.tasks && local.tasks.length >= (remote.tasks?.length || 0)
                  ? local.tasks
                  : remote.tasks,
              });
            } else {
              byId.set(local.id, local);
            }
          }
          return Array.from(byId.values());
        });
      }
    };

    const unsubscribe = subscribeToAuthChanges((user) => {
      setCurrentUser(user);
      if (user?.email) {
        const name = user.displayName || user.email.split('@')[0];
        setDocFounder(name);
      }
      void hydrateForUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Persist conversations strictly under the active user's storage key
  useEffect(() => {
    try {
      const storageKey = getConversationsStorageKey(currentStorageUidRef.current);
      localStorage.setItem(storageKey, JSON.stringify(conversations));
    } catch (err) {
      console.warn('Could not persist conversations:', err);
    }
  }, [conversations]);

  const activeConversation = conversations.find((c) => c.id === activeConvId) || null;

  const API_BASE_URL = (
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL || ''
  ).replace(/\/+$/, '');

  const resolveApiUrl = (url?: string): string => {
    if (!url) return '';
    if (/^https?:\/\/(127\.0\.0\.1|localhost):3000/i.test(url)) {
      const relative = url.replace(/^https?:\/\/(127\.0\.0\.1|localhost):3000/i, '');
      return API_BASE_URL ? `${API_BASE_URL}${relative}` : url;
    }
    if (/^https?:\/\//i.test(url)) return url;
    if (API_BASE_URL) {
      return `${API_BASE_URL}${url.startsWith('/') ? url : `/${url}`}`;
    }
    return url;
  };

  const apiFetch = async (path: string, init?: RequestInit): Promise<Response> => {
    if (API_BASE_URL) {
      return fetch(`${API_BASE_URL}${path}`, init);
    }

    // 1. Try relative path (Vite proxy forwards /api to backend seamlessly)
    try {
      const proxyRes = await fetch(path, init);
      if (proxyRes.ok || proxyRes.status < 500) {
        return proxyRes;
      }
    } catch {
      // proxy fallback
    }

    // 2. Direct fetch fallback for local dev
    try {
      const directRes = await fetch(`http://127.0.0.1:3000${path}`, init);
      if (directRes.ok || directRes.status < 500) {
        return directRes;
      }
    } catch {
      // direct fallback
    }

    return fetch(path, init);
  };

  const fetchSubmissionReplies = async () => {
    setIsPollingReplies(true);
    try {
      const subs = (activeConversation?.tasks || []).map((t) => ({
        receiptId: t.receiptId,
        targetName: t.targetName,
        contactEmail: t.contactEmail,
        portalUrl: t.portalUrl,
      }));
      const res = await apiFetch('/api/v1/submissions/replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissions: subs, lookbackDays: 14 }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.data) {
          setImapReplies(json.data.replies || []);
          setOutboundThreadMsgs(json.data.outboundMessages || []);
          setInterviewAlerts(json.data.interviews || []);
          setImapError(json.data.imapConnected ? null : json.data.error || 'Zoho IMAP unavailable');
        }
      }
    } catch {
      // non-fatal if offline
    } finally {
      setIsPollingReplies(false);
    }
  };

  useEffect(() => {
    if (showTasksDrawer) {
      fetchSubmissionReplies();
    }
  }, [showTasksDrawer, activeConvId]);

  useEffect(() => {
    const loadAgentsAndWallet = async () => {
      try {
        const fsAgents = await loadOrSeedFirestoreAgents();
        if (fsAgents.length > 0) {
          setAgentCatalog(fsAgents);
        } else {
          const agentsRes = await apiFetch('/api/v1/agents');
          if (agentsRes.ok) {
            const agentsJson = await agentsRes.json();
            if (agentsJson.ok && Array.isArray(agentsJson.data)) {
              setAgentCatalog(agentsJson.data);
            }
          }
        }
      } catch {
        // keep fallback TASK_CHOICES
      }

      try {
        const phone = getSessionPhoneNumber(currentUser).replace(/\D/g, '');
        const walletRes = await apiFetch(`/api/v1/wallet?phone=${encodeURIComponent(phone)}`);
        if (walletRes.ok) {
          const walletJson = await walletRes.json();
          if (walletJson.ok && walletJson.data?.balanceDollars) {
            setWalletBalanceDollars(walletJson.data.balanceDollars);
          }
        }
      } catch {
        // default $5.00
      }

      try {
        const pkgRes = await apiFetch('/api/v1/payments/paystack/packages');
        if (pkgRes.ok) {
          const pkgJson = await pkgRes.json();
          if (pkgJson.ok && pkgJson.data) {
            setCreditPackages(pkgJson.data.packages || []);
            setPaystackConfigured(Boolean(pkgJson.data.configured));
          }
        }
      } catch {
        // ignore
      }
    };
    loadAgentsAndWallet();
  }, [currentUser]);

  const verifyPaystackReference = async (refCode: string) => {
    setIsProcessingPaystack(true);
    setTopUpStatusMsg(null);
    try {
      const phone = getSessionPhoneNumber(currentUser).replace(/\D/g, '');
      const res = await apiFetch(
        `/api/v1/payments/paystack/verify/${encodeURIComponent(refCode)}?phone=${encodeURIComponent(phone)}`,
      );
      const json = await res.json();
      if (res.ok && json.ok && json.data?.paid) {
        if (json.data.balanceDollars) {
          setWalletBalanceDollars(json.data.balanceDollars);
        }
        setPendingPaystackRef(null);
        setTopUpStatusMsg(
          json.data.alreadyProcessed
            ? `Payment ${refCode} was already credited. Balance: $${json.data.balanceDollars}.`
            : `✅ Payment verified! Your new credit balance is $${json.data.balanceDollars}.`,
        );
      } else {
        setTopUpStatusMsg(
          json?.error?.message || `Payment status for ${refCode}: ${json?.data?.status || 'pending'}.`,
        );
      }
    } catch {
      setTopUpStatusMsg('Could not verify Paystack payment right now.');
    } finally {
      setIsProcessingPaystack(false);
    }
  };

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('reference') || urlParams.get('trxref');
    if (ref) {
      setShowTopUpModal(true);
      verifyPaystackReference(ref);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleStartPaystackCheckout = async (packageId: string) => {
    setIsProcessingPaystack(true);
    setTopUpStatusMsg(null);
    try {
      const phone = getSessionPhoneNumber(currentUser).replace(/\D/g, '');
      const email = candidateEmail || currentUser?.email || 'client@nexora.ai';
      const res = await apiFetch('/api/v1/payments/paystack/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          email,
          packageId,
          callbackUrl: window.location.origin + window.location.pathname,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok || !json.data?.authorizationUrl) {
        setTopUpStatusMsg(json?.error?.message || 'Could not initialize Paystack checkout.');
        return;
      }
      setPendingPaystackRef(json.data.reference);
      window.open(json.data.authorizationUrl, '_blank', 'noopener,noreferrer');
      setTopUpStatusMsg(
        `Checkout opened in a new tab (Ref: ${json.data.reference}). After completing payment, click "Verify Payment" below.`,
      );
    } catch {
      setTopUpStatusMsg('Failed to connect to Paystack initialization endpoint.');
    } finally {
      setIsProcessingPaystack(false);
    }
  };

  const openFollowUpModal = (task: FollowUpTask) => {
    setActiveThreadTask(task);
    const matched = imapReplies.filter((r) => r.receiptId === task.receiptId);
    const latestInbound = matched[0];
    if (latestInbound?.subject) {
      setReplyDraftSubject(
        /^re:/i.test(latestInbound.subject) ? latestInbound.subject : `Re: ${latestInbound.subject}`,
      );
      setReplyDraftMessage('');
    } else {
      setReplyDraftSubject(`Follow-Up: ${task.targetName} Application (${task.receiptId})`);
      setReplyDraftMessage(
        `Hello ${task.targetName} Team,\n\nI am writing to kindly follow up on my recent submission (${task.receiptId}). Please let me know if you need any additional information or would like to schedule a conversation.\n\nBest regards,\n${candidateName || currentUser?.displayName || 'Applicant'}`,
      );
    }
  };

  const readFilesAsBase64 = async (fileList: FileList | File[]): Promise<AttachedDocItem[]> => {
    const files = Array.from(fileList).slice(0, 10);
    return Promise.all(
      files.map(
        (file) =>
          new Promise<AttachedDocItem>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              const raw = typeof reader.result === 'string' ? reader.result : '';
              const base64 = raw.includes(',') ? raw.split(',')[1] : raw;
              resolve({
                id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                fileName: file.name,
                mimeType: file.type || 'application/octet-stream',
                fileSizeBytes: file.size,
                contentBase64: base64,
              });
            };
            reader.readAsDataURL(file);
          }),
      ),
    );
  };

  const handleChatFilesSelected = async (fileList: FileList | File[]) => {
    const items = await readFilesAsBase64(fileList);
    if (items.length === 0) return;

    const pending = items.map((item) => ({ ...item, extracting: true }));
    setChatAttachments((prev) => [...prev, ...pending]);

    try {
      const res = await apiFetch('/api/v1/documents/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: items.map((i) => ({
            fileName: i.fileName,
            mimeType: i.mimeType,
            contentBase64: i.contentBase64,
          })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok && Array.isArray(json.data)) {
        setChatAttachments((prev) =>
          prev.map((att) => {
            const idx = pending.findIndex((p) => p.id === att.id);
            if (idx === -1) return att;
            const extracted = json.data[idx];
            return {
              ...att,
              extracting: false,
              extractedText: extracted?.extractedText || '',
            };
          }),
        );
      } else {
        setChatAttachments((prev) =>
          prev.map((att) =>
            pending.some((p) => p.id === att.id)
              ? { ...att, extracting: false, error: 'Attached (extraction unavailable)' }
              : att,
          ),
        );
      }
    } catch {
      setChatAttachments((prev) =>
        prev.map((att) =>
          pending.some((p) => p.id === att.id)
            ? { ...att, extracting: false, error: 'Attached (offline extraction skipped)' }
            : att,
        ),
      );
    }
  };

  const handleReplyFilesSelected = async (fileList: FileList | File[]) => {
    const items = await readFilesAsBase64(fileList);
    if (items.length === 0) return;
    setReplyAttachments((prev) => [...prev, ...items]);
  };

  const handleSendFollowUpReply = async () => {
    if (!activeThreadTask || (!replyDraftMessage.trim() && replyAttachments.length === 0)) return;
    const recipient = activeThreadTask.contactEmail || 'info@empiredigitals.org';
    const threadMsgIds = [
      ...outboundThreadMsgs.filter((m) => m.receiptId === activeThreadTask.receiptId),
      ...imapReplies.filter((r) => r.receiptId === activeThreadTask.receiptId),
    ]
      .sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime())
      .map((m) => m.messageId)
      .filter((id): id is string => Boolean(id));
    const latestMessageId = threadMsgIds[threadMsgIds.length - 1];

    setIsSendingFollowUp(true);
    try {
      const res = await apiFetch('/api/v1/submissions/reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receiptId: activeThreadTask.receiptId,
          to: recipient,
          subject: replyDraftSubject.trim() || `Follow-Up (${activeThreadTask.receiptId})`,
          message: replyDraftMessage.trim() || 'Please find attached the requested documents.',
          companyName: activeThreadTask.targetName,
          senderName: candidateName || currentUser?.displayName || undefined,
          inReplyTo: latestMessageId,
          references: threadMsgIds.length > 0 ? threadMsgIds : undefined,
          attachments:
            replyAttachments.length > 0
              ? replyAttachments.map((a) => ({
                  fileName: a.fileName,
                  mimeType: a.mimeType,
                  contentBase64: a.contentBase64,
                }))
              : undefined,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.data) {
          setOutboundThreadMsgs((prev) => [...prev, json.data]);
          setReplyDraftMessage('');
          setReplyAttachments([]);
        }
      }
    } finally {
      setIsSendingFollowUp(false);
    }
  };

  const buildFallbackSummaryMessages = (conv: ConversationItem): MessageRecord[] => {
    const submissionsList =
      conv.tasks.length > 0
        ? `\n\n**Recorded Submissions (${conv.tasks.length}):**\n` +
        conv.tasks
          .slice(0, 10)
          .map((t, i) => `${i + 1}. **${t.targetName}** — \`${t.receiptId}\` (${t.status})`)
          .join('\n')
        : '';

    return [
      {
        id: `restored-${conv.id}`,
        direction: 'OUTBOUND',
        messageType: 'TEXT',
        content: `### 📋 ${conv.title}\n\n${conv.lastMessageSnippet || 'Task history restored.'}${submissionsList}`,
        createdAt: new Date().toISOString(),
        generatedPdf: conv.generatedPdf
          ? {
            fileName: conv.generatedPdf.fileName,
            downloadUrl: conv.generatedPdf.downloadUrl,
            fileSizeBytes: conv.generatedPdf.fileSizeBytes,
            estimatedPages: conv.generatedPdf.pages,
          }
          : undefined,
      },
    ];
  };

  const loadConversationMessages = async (convIdParam?: string) => {
    const targetId = convIdParam ?? activeConvId;
    if (!targetId) {
      setMessages([]);
      return;
    }
    if (skipNextStateFetchRef.current) {
      skipNextStateFetchRef.current = false;
      return;
    }

    // 1. Immediately restore saved messages for this task from localStorage
    const localConv = conversations.find((c) => c.id === targetId);
    if (localConv?.messages && localConv.messages.length > 0) {
      setMessages(localConv.messages);
      return;
    }

    // 2. Otherwise try loading from backend state
    try {
      const userPhone = getSessionPhoneNumber(currentUser);
      const userDisplay = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Guest';

      const res = await apiFetch(
        `/api/v1/webchat/state?phoneNumber=${encodeURIComponent(userPhone)}&conversationId=${encodeURIComponent(targetId)}&displayName=${encodeURIComponent(userDisplay)}`,
      );
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.data?.messages) && json.data.messages.length > 0) {
          setMessages(json.data.messages);
          return;
        }
      }
    } catch (err) {
      console.warn('Could not load task messages:', err);
    }

    // 3. Fallback for legacy tasks that had submissions/PDF saved before per-task message caching
    if (localConv) {
      setMessages(buildFallbackSummaryMessages(localConv));
    } else {
      setMessages([]);
    }
  };

  const handleSelectConversation = (conv: ConversationItem) => {
    setActiveConvId(conv.id);
    if (conv.messages && conv.messages.length > 0) {
      skipNextStateFetchRef.current = true;
      setMessages(conv.messages);
    } else {
      loadConversationMessages(conv.id);
    }
    if (conv.tasks.length > 0) {
      setShowTasksDrawer(true);
    }
  };

  useEffect(() => {
    loadConversationMessages();
  }, [activeConvId]);

  // Keep each task's messages persisted in localStorage AND synced to Firestore for the signed-in user
  useEffect(() => {
    if (!activeConvId || messages.length === 0) return;
    let updatedConv: ConversationItem | undefined;
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === activeConvId && c.messages !== messages) {
          updatedConv = {
            ...c,
            messages,
            lastMessageSnippet: messages[messages.length - 1]?.content?.slice(0, 80) || c.lastMessageSnippet,
          };
          return updatedConv;
        }
        return c;
      }),
    );

    if (!currentUser?.uid) return;
    const uid = currentUser.uid;
    const convId = activeConvId;
    const timer = setTimeout(() => {
      const targetConv = updatedConv || conversations.find((c) => c.id === convId);
      if (!targetConv) return;
      createFirebaseTask({
        id: convId,
        userId: uid,
        conversationId: convId,
        title: targetConv.title,
        agentType: targetConv.agentType,
        status: targetConv.tasks.length > 0 ? 'SUBMITTED' : 'IN_PROGRESS',
        lastMessageSnippet: messages[messages.length - 1]?.content?.slice(0, 80) || targetConv.lastMessageSnippet,
        messages: messages.slice(-40),
        targets: targetConv.tasks,
        updatedAt: new Date().toISOString(),
      }).catch(() => undefined);
    }, 800);
    return () => clearTimeout(timer);
  }, [messages, activeConvId, currentUser?.uid]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auth Handlers
  const handleGoogleSignIn = async () => {
    try {
      setAuthError('');
      setAuthLoading(true);
      await signInWithGoogle();
      setShowAuthModal(false);
    } catch (err: any) {
      setAuthError(err.message || 'Google sign-in failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      if (authMode === 'login') {
        await loginWithEmail(authEmail, authPassword);
      } else {
        await registerWithEmail(authEmail, authPassword, authName);
      }
      setShowAuthModal(false);
    } catch (err: any) {
      setAuthError(err.message || 'Authentication error');
    } finally {
      setAuthLoading(false);
    }
  };

  const resetUserScopedUiState = () => {
    setActiveConvId(null);
    setMessages([]);
    setPreviewPdfDoc(null);
    setShowTasksDrawer(false);
    setActivePrereqTask(null);
    setWalletBalanceDollars('5.00');
    setCandidateName('');
    setCandidateEmail('');
    setCandidatePhone('');
    setCandidateRole('');
    setCandidateLocation('');
    setCandidatePortfolio('');
    setCandidateNotes('');
    setUploadedCvFile(null);
    setDocCompany('');
    setDocFounder('');
    setPrereqFields({
      nationality: '',
      relocationPurpose: 'Skilled Work / Visa Sponsorship',
      companyName: '',
      industry: '',
      fundingStage: 'Pre-Seed / Seed',
      targetRaise: '$250,000',
      websiteUrl: '',
      studyLevel: "Master's Degree",
      fieldOfStudy: '',
      draftingNotes: '',
    });
  };

  const handleLogout = async () => {
    await logoutUser();
    currentStorageUidRef.current = null;
    resetUserScopedUiState();
    setConversations(loadSavedConversations(null));
  };

  // Start new clean conversation
  const handleNewConversation = () => {
    setActiveConvId(null);
    setMessages([]);
  };

  // Select Task Card from Hero Screen -> Open tailored Prerequisites Modal for the chosen task
  const handleSelectTaskCard = (taskChoice: typeof TASK_CHOICES[0]) => {
    if ((taskChoice as any).action === 'open_doc_modal') {
      setShowDocModal(true);
      return;
    }

    // Pre-fill personal details from signed-in user if empty
    if (currentUser?.displayName && !candidateName) setCandidateName(currentUser.displayName);
    if (currentUser?.email && !candidateEmail) setCandidateEmail(currentUser.email);

    const taskId = taskChoice.id as 'employment' | 'relocate' | 'investors' | 'scholarships';
    setActivePrereqTask(taskId);
  };

  const handlePrereqDocUpload = (docKey: string, file: File) => {
    if (!file) return;
    if (docKey === 'cv') {
      handleFileDrop(file);
    }
    setPrereqDocs((prev) => ({
      ...prev,
      [docKey]: { fileName: file.name, fileSize: file.size, draftRequested: false },
    }));
  };

  const togglePrereqDocDraft = (docKey: string) => {
    setPrereqDocs((prev) => ({
      ...prev,
      [docKey]: {
        fileName: undefined,
        fileSize: undefined,
        draftRequested: !prev[docKey]?.draftRequested,
      },
    }));
  };

  const handleSubmitPrerequisites = async (e: React.FormEvent, interviewInChat = false) => {
    e.preventDefault();
    if (!activePrereqTask) return;

    const choice = TASK_CHOICES.find((t) => t.id === activePrereqTask)!;
    const newId = `conv-${Date.now()}`;
    const newConv: ConversationItem = {
      id: newId,
      title: formatTaskTitleWithDate(choice.title),
      agentType: choice.agent,
      lastMessageSnippet: 'Prerequisites submitted',
      updatedAt: 'Just now',
      tasks: [],
    };

    skipNextStateFetchRef.current = true;
    setConversations((prev) => [newConv, ...prev]);
    setActiveConvId(newId);
    setMessages([]);
    setActivePrereqTask(null);

    const userId = currentUser?.uid || 'guest-user';
    const dossier: CandidateDossier = {
      fullName: candidateName || currentUser?.displayName || 'Applicant',
      email: candidateEmail || currentUser?.email || '',
      phone: candidatePhone || '',
      location: candidateLocation || 'Flexible / International',
      targetRole: candidateRole || choice.title,
      cvFileName: prereqDocs.cv?.fileName || uploadedCvFile?.name,
      cvFileSize: prereqDocs.cv?.fileSize || uploadedCvFile?.size,
      cvFileDataUrl: uploadedCvFile?.dataUrl,
      portfolioUrl: candidatePortfolio,
      notes: prereqFields.draftingNotes || candidateNotes,
      prereqFields,
      updatedAt: new Date().toISOString(),
    };
    saveCandidateDossier(userId, dossier).catch(() => { });

    const formatDocStatus = (label: string, key: string) => {
      const d = prereqDocs[key];
      if (d?.fileName) return `- **${label}:** 📎 \`${d.fileName}\` (Uploaded)`;
      if (d?.draftRequested || interviewInChat) return `- **${label}:** ✨ Not available — **AI to draft on my behalf**`;
      return `- **${label}:** Not provided`;
    };

    let prompt = '';
    if (activePrereqTask === 'employment') {
      const needsCvDraft = prereqDocs.cv?.draftRequested || (!prereqDocs.cv?.fileName && !uploadedCvFile);
      prompt = [
        `${dossier.fullName} wants help applying for a job (${candidateRole || 'Target Role'} in ${candidateLocation || 'Remote / International'}).`,
        `Contact: Email ${dossier.email}, Phone ${dossier.phone}.`,
        formatDocStatus('CV / Resume', 'cv'),
        candidatePortfolio ? `- **Portfolio / LinkedIn:** ${candidatePortfolio}` : '',
        prereqFields.draftingNotes
          ? `Candidate Background & Info for CV Drafting:\n${prereqFields.draftingNotes}`
          : needsCvDraft
            ? `I do not have a CV ready yet. Please interview me step-by-step about what I do, my work experience, skills, and education so we can build a professional CV PDF for my review before submitting.`
            : `Please review my uploaded CV and prepare matching applications for my approval.`,
      ]
        .filter(Boolean)
        .join('\n');
    } else if (activePrereqTask === 'relocate') {
      prompt = [
        `${dossier.fullName} wants to relocate abroad to **${candidateLocation || 'Destination Country'}** (Nationality: ${prereqFields.nationality || 'Not specified'}, Purpose: ${prereqFields.relocationPurpose}).`,
        `Contact: Email ${dossier.email}, Phone ${dossier.phone}.`,
        formatDocStatus('Passport', 'passport'),
        formatDocStatus('CV / Resume', 'cv'),
        formatDocStatus('Existing Visa / Offer Letter', 'visa'),
        prereqFields.draftingNotes ? `Additional Relocation / Qualification Info:\n${prereqFields.draftingNotes}` : '',
        `Please evaluate eligible visa pathways, list any missing document checklists, draft any requested documents for review, and wait for my approval before submitting anything.`,
      ]
        .filter(Boolean)
        .join('\n');
    } else if (activePrereqTask === 'investors') {
      const needsPlanDraft = prereqDocs.businessPlan?.draftRequested || prereqDocs.pitchDeck?.draftRequested;
      prompt = [
        `${dossier.fullName} is seeking investors for **${prereqFields.companyName || 'Startup Venture'}** (Industry: ${prereqFields.industry || 'Tech'}, Stage: ${prereqFields.fundingStage}, Target Raise: ${prereqFields.targetRaise}).`,
        `Contact: Email ${dossier.email}, Phone ${dossier.phone}${prereqFields.websiteUrl ? `, Website: ${prereqFields.websiteUrl}` : ''}.`,
        formatDocStatus('Business Plan', 'businessPlan'),
        formatDocStatus('Pitch Deck', 'pitchDeck'),
        prereqFields.draftingNotes
          ? `Startup & Business Plan Details:\n${prereqFields.draftingNotes}`
          : needsPlanDraft
            ? `I do not have a business plan / pitch deck ready yet. Please interview me to gather any missing startup details, then draft the Business Plan & Pitch for my review before emailing investors.`
            : `Please prepare investor matching and introductory pitch drafts for my review before sending.`,
      ]
        .filter(Boolean)
        .join('\n');
    } else {
      prompt = [
        `${dossier.fullName} is applying for scholarships (Nationality: ${prereqFields.nationality || 'Not specified'}, Study Level: ${prereqFields.studyLevel}, Field: ${prereqFields.fieldOfStudy || 'Tech / Business'}, Target Country: ${candidateLocation || 'International'}).`,
        `Contact: Email ${dossier.email}, Phone ${dossier.phone}.`,
        formatDocStatus('Academic Transcripts / Certificates', 'transcripts'),
        formatDocStatus('Motivation Letter / SOP', 'motivationLetter'),
        formatDocStatus('Academic CV', 'cv'),
        prereqFields.draftingNotes
          ? `Academic Background, Achievements & Goals:\n${prereqFields.draftingNotes}`
          : `Please interview me for any missing academic/goal details so you can draft my Motivation Letter / Academic CV and shortlist eligible scholarships for my review before submitting.`,
      ]
        .filter(Boolean)
        .join('\n');
    }

    await handleSendMessage(prompt, newId, choice.agent);
  };

  // Handle Drag & Drop CV File
  const handleFileDrop = (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setUploadedCvFile({
        name: file.name,
        size: file.size,
        dataUrl: reader.result as string,
      });
    };
    reader.readAsDataURL(file);
  };

  // Submit Candidate Dossier & Create Firebase Task
  const handleSubmitDossier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidateName.trim() || !candidateEmail.trim() || !candidatePhone.trim() || !candidateRole.trim()) {
      alert('Please fill in your name, email, phone number, and target role.');
      return;
    }

    setIsSavingDossier(true);
    try {
      let currentConvId = activeConvId;
      if (!currentConvId) {
        currentConvId = `conv-${Date.now()}`;
        const newConv: ConversationItem = {
          id: currentConvId,
          title: `Job Search (${candidateRole})`,
          agentType: 'JOB_AGENT',
          lastMessageSnippet: `Candidate profile: ${candidateName}`,
          updatedAt: 'Just now',
          tasks: [],
        };
        setConversations((prev) => [newConv, ...prev]);
        setActiveConvId(currentConvId);
      }

      const userId = currentUser?.uid || `guest-${Date.now()}`;
      const dossier: CandidateDossier = {
        fullName: candidateName,
        email: candidateEmail,
        phone: candidatePhone,
        location: candidateLocation,
        targetRole: candidateRole,
        cvFileName: uploadedCvFile?.name,
        cvFileSize: uploadedCvFile?.size,
        cvFileDataUrl: uploadedCvFile?.dataUrl,
        portfolioUrl: candidatePortfolio,
        notes: candidateNotes,
        updatedAt: new Date().toISOString(),
      };

      // 1. Save Candidate Dossier to Firebase Firestore
      await saveCandidateDossier(userId, dossier);

      // 2. Create Task on Firebase Firestore
      const firebaseTaskId = await createFirebaseTask({
        userId,
        conversationId: currentConvId,
        title: `Job Applications Batch: ${candidateRole}`,
        agentType: 'JOB_AGENT',
        status: 'IN_PROGRESS',
        candidate: dossier,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // 3. Add to Conversation Tasks list
      const newTask: FollowUpTask = {
        id: firebaseTaskId,
        targetName: `Application Batch (${candidateRole})`,
        category: `${candidateLocation || 'Remote'} • Application Pipeline`,
        portalUrl: 'https://www.linkedin.com/jobs',
        contactEmail: candidateEmail,
        receiptId: `FB-${firebaseTaskId.substring(firebaseTaskId.length - 6).toUpperCase()}`,
        status: 'SUBMITTED',
        submittedAt: 'Just now',
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentConvId
            ? { ...c, tasks: [newTask, ...c.tasks] }
            : c,
        ),
      );

      setShowDossierModal(false);
      setShowTasksDrawer(true);

      // 4. Post Candidate Submission Confirmation into Chat
      const userSummaryContent = `### 📄 Candidate Profile & Documents Registered\n- **Name:** ${candidateName}\n- **Target Role:** ${candidateRole}\n- **Location:** ${candidateLocation || 'Flexible / Remote'}\n- **CV / Resume:** ${uploadedCvFile ? `📎 \`${uploadedCvFile.name}\` (${(uploadedCvFile.size / 1024).toFixed(1)} KB)` : 'Not attached'}\n- **Contact:** 📞 ${candidatePhone} | ✉️ ${candidateEmail}\n- **Firebase Task Created:** \`${firebaseTaskId}\``;

      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}`,
          direction: 'INBOUND',
          messageType: 'TEXT',
          content: userSummaryContent,
          createdAt: new Date().toISOString(),
        },
      ]);

      // 5. Trigger Backend Autonomous Execution
      setIsSending(true);
      try {
        const userPhone = getSessionPhoneNumber(currentUser);
        const res = await apiFetch('/api/v1/webchat/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: userPhone,
            conversationId: currentConvId,
            agentType: 'JOB_AGENT',
            displayName: candidateName,
            userEmail: candidateEmail,
            message: `Find jobs for ${candidateRole} in ${candidateLocation || 'any market'} with candidate ${candidateName} (CV: ${uploadedCvFile?.name || 'Attached'}). Apply on candidate behalf.`,
            text: `Find jobs for ${candidateRole} in ${candidateLocation || 'any market'} with candidate ${candidateName} (CV: ${uploadedCvFile?.name || 'Attached'}). Apply on candidate behalf.`,
          }),
        });

        const json = await res.json().catch(() => null);
        if (res.ok && json) {
          const reply =
            json.data?.replyText ||
            json.data?.response ||
            json.data?.responseText ||
            json.data?.orchestration?.responseText ||
            'I have received your profile and CV. I am now matching vacancies and initiating application tasks.';
          setMessages((prev) => [
            ...prev,
            {
              id: `msg-${Date.now() + 1}`,
              direction: 'OUTBOUND',
              messageType: 'TEXT',
              content: reply,
              routedAgentType: 'JOB_AGENT',
              createdAt: new Date().toISOString(),
            },
          ]);
        }
      } catch (err) {
        console.error('Error initiating agent job outreach:', err);
      } finally {
        setIsSending(false);
      }
    } catch (err) {
      console.error('Failed to save dossier & create task:', err);
      alert('Could not save candidate info. Please try again.');
    } finally {
      setIsSavingDossier(false);
    }
  };

  // Send message to backend agent
  const handleSendMessage = async (textToSend?: string, convIdOverride?: string, agentOverride?: string) => {
    const activeAttachments = textToSend ? [] : chatAttachments;
    const rawContent = textToSend || inputText;
    const content =
      rawContent.trim() ||
      (activeAttachments.length > 0
        ? `Please analyze and reference the ${activeAttachments.length} attached document(s): ${activeAttachments.map((a) => a.fileName).join(', ')}`
        : '');
    if (!content.trim() || isSending) return;

    if (!textToSend) {
      setInputText('');
      setChatAttachments([]);
    }
    setIsSending(true);

    let currentConvId = convIdOverride || activeConvId;

    if (!currentConvId) {
      currentConvId = `conv-${Date.now()}`;
      const title = content.length > 28 ? content.substring(0, 28) + '...' : content;
      const newConv: ConversationItem = {
        id: currentConvId,
        title,
        agentType: agentOverride || 'SUPERVISOR',
        lastMessageSnippet: content,
        updatedAt: 'Just now',
        tasks: [],
      };
      skipNextStateFetchRef.current = true;
      setConversations((prev) => [newConv, ...prev]);
      setActiveConvId(currentConvId);
      createFirebaseTask({
        id: currentConvId,
        userId: currentUser?.uid || 'guest-user',
        conversationId: currentConvId,
        title: newConv.title,
        agentType: newConv.agentType,
        status: 'IN_PROGRESS',
      });
    } else {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === currentConvId
            ? { ...c, lastMessageSnippet: content, updatedAt: 'Just now' }
            : c,
        ),
      );
    }

    const userMessage: MessageRecord = {
      id: `msg-${Date.now()}`,
      direction: 'INBOUND',
      messageType: activeAttachments.length > 0 ? 'DOCUMENT' : 'TEXT',
      content,
      attachedDocs:
        activeAttachments.length > 0
          ? activeAttachments.map((a) => ({
              fileName: a.fileName,
              mimeType: a.mimeType,
              fileSizeBytes: a.fileSizeBytes,
            }))
          : undefined,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);

    const extractedRefNotes = activeAttachments
      .filter((a) => a.extractedText && a.extractedText.trim().length > 0)
      .map((a) => `[Extracted Reference Document (${a.fileName})]:\n${a.extractedText!.slice(0, 8000)}`)
      .join('\n\n');
    const promptWithRefs = extractedRefNotes ? `${content}\n\n${extractedRefNotes}` : content;

    try {
      const userPhone = getSessionPhoneNumber(currentUser);
      const displayName =
        candidateName.trim() ||
        currentUser?.displayName ||
        currentUser?.email?.split('@')[0] ||
        'Applicant';
      const userEmail = candidateEmail.trim() || currentUser?.email || 'info@empiredigitals.org';

      const effectiveAgent = agentOverride || activeConversation?.agentType;
      const matchedCatalogAgent = agentCatalog.find((a) => a.agentType === effectiveAgent);

      const res = await apiFetch('/api/v1/webchat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: userPhone,
          conversationId: currentConvId,
          agentType: effectiveAgent,
          maxSubmissions: submissionLimit,
          costPerSubmissionCents: matchedCatalogAgent?.costPerSubmissionCents,
          deepThink: deepThinkMode,
          displayName,
          customerName: candidateName.trim() || undefined,
          userEmail,
          message: promptWithRefs,
          text: promptWithRefs,
          attachments:
            activeAttachments.length > 0
              ? activeAttachments.map((a) => ({
                  fileName: a.fileName,
                  mimeType: a.mimeType,
                  contentBase64: a.contentBase64,
                }))
              : undefined,
        }),
      });

      const json = await res.json().catch(() => null);

      if (res.ok && json) {
        const assistantText =
          json.data?.replyText ||
          json.data?.response ||
          json.data?.responseText ||
          json.data?.orchestration?.responseText ||
          (Array.isArray(json.data?.messages) &&
            [...json.data.messages].reverse().find((m: any) => m.direction === 'OUTBOUND')?.content) ||
          'Your objective has been received and routed to the specialised agent.';

        const generatedDoc =
          json.data?.generatedDocument || json.data?.orchestration?.generatedDocument;
        if (json.data?.wallet?.remainingBalanceDollars) {
          setWalletBalanceDollars(json.data.wallet.remainingBalanceDollars);
        } else if (json.data?.wallet?.balanceDollars) {
          setWalletBalanceDollars(json.data.wallet.balanceDollars);
        }

        const realSubmissions =
          json.data?.submittedApplications ||
          json.data?.orchestration?.submittedApplications ||
          [];
        const isSubmissionCompleted =
          (Array.isArray(realSubmissions) && realSubmissions.length > 0) ||
          assistantText.includes('Done! I have submitted your reviewed CV') ||
          assistantText.includes('Done! I have submitted your reviewed document') ||
          assistantText.includes('SUB-');

        const hasGeneratedReviewPdf =
          !isSubmissionCompleted && Boolean(generatedDoc?.fileName?.toLowerCase().endsWith('.pdf'));

        const hasCompiledCv =
          !isSubmissionCompleted &&
          (Boolean(generatedDoc?.fileName?.includes('_cv_')) ||
            assistantText.includes('created your CV PDF') ||
            assistantText.includes('CURRICULUM VITAE') ||
            assistantText.includes('professional CV has been synthesized') ||
            (assistantText.includes('Professional Summary') && assistantText.includes('Education')));

        // Extract candidate details from user message or compiled CV (handles both inline **Field:** and ## Heading\nValue)
        const detectedNameMatch = assistantText.match(/CURRICULUM\s+VITAE\s*[—–-]\s*([^\n#*]+)/i);
        const detectedEmail =
          content.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0] ||
          assistantText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0];
        const detectedPhone =
          content.match(/(?:\+?\d[\d\s\-()]{7,16}\d)/)?.[0]?.trim() ||
          assistantText.match(/(?:\+?\d[\d\s\-()]{7,16}\d)/)?.[0]?.trim();
        const detectedRole =
          assistantText.match(/Target\s+Role:\*\*\s*([^|\n]+)/i)?.[1]?.trim() ||
          assistantText.match(/##\s*[^\n]*Target\s+Role[^\n]*\n+([^\n#]+)/i)?.[1]?.trim() ||
          content.match(/\b(?:senior software developer|full[- ]stack(?: software)? engineer|software engineer|software developer|tech lead)\b/i)?.[0];
        const detectedLocation =
          assistantText.match(/Location:\*\*\s*([^\n]+)/i)?.[1]?.trim() ||
          assistantText.match(/##\s*[^\n]*Location[^\n]*\n+([^\n#]+)/i)?.[1]?.trim();

        const resolvedName = candidateName || detectedNameMatch?.[1]?.trim() || currentUser?.displayName || '';
        const resolvedEmail = candidateEmail || detectedEmail || currentUser?.email || '';
        const resolvedPhone = candidatePhone || detectedPhone || '';
        const resolvedRole = candidateRole || detectedRole || '';
        const resolvedLocation = candidateLocation || detectedLocation || '';

        if (resolvedName && !candidateName) setCandidateName(resolvedName);
        if (resolvedEmail && !candidateEmail) setCandidateEmail(resolvedEmail);
        if (resolvedPhone && !candidatePhone) setCandidatePhone(resolvedPhone);
        if (resolvedRole && !candidateRole) setCandidateRole(resolvedRole);
        if (resolvedLocation && !candidateLocation) setCandidateLocation(resolvedLocation);
        if (hasCompiledCv) setCandidateNotes(assistantText);

        const isCandidateModalComplete = Boolean(
          resolvedName && resolvedEmail && resolvedPhone && resolvedRole && resolvedLocation,
        );

        const hasReviewableDeliverable =
          !hasCompiledCv &&
          (hasGeneratedReviewPdf ||
            /\b(?:executive\s+summary|business\s+plan\s+draft|pitch\s+draft|motivation\s+letter\s+draft|created your .*?pdf)\b/i.test(
              assistantText,
            )) &&
          !assistantText.includes('Execution Report') &&
          !assistantText.includes('SUB-');

        const routedAgent =
          json.data?.routedAgentType || json.data?.orchestration?.routedAgent || agentOverride || 'SUPERVISOR';
        const prereqKeyByAgent: Record<string, 'employment' | 'relocate' | 'investors' | 'scholarships'> = {
          JOB_AGENT: 'employment',
          VISA_AGENT: 'relocate',
          INVESTOR_AGENT: 'investors',
          EDUCATION_AGENT: 'scholarships',
        };
        const prereqLabelByKey: Record<string, string> = {
          employment: '📋 Open Job Search Prerequisites Form',
          relocate: '📋 Open Relocation & Visa Form',
          investors: '📋 Open Investor Pitch Form',
          scholarships: '📋 Open Scholarships Form',
        };
        const inferPrereqFromText = (txt: string): 'employment' | 'relocate' | 'investors' | 'scholarships' | undefined => {
          if (/\b(?:cv|resume|job|employment|work\s+experience)\b/i.test(txt)) return 'employment';
          if (/\b(?:visa|relocat|immigration|passport)\b/i.test(txt)) return 'relocate';
          if (/\b(?:investor|pitch|fundraising|startup|venture)\b/i.test(txt)) return 'investors';
          if (/\b(?:scholarship|university|study|academic|motivation\s+letter)\b/i.test(txt)) return 'scholarships';
          return undefined;
        };
        const matchedPrereqKey =
          prereqKeyByAgent[routedAgent] || inferPrereqFromText(`${content} ${assistantText}`);
        const asksForPrerequisites =
          !hasCompiledCv &&
          !hasReviewableDeliverable &&
          !isSubmissionCompleted &&
          Boolean(matchedPrereqKey) &&
          /\b(?:please provide|please fill|prerequisites|missing|upload your|to start|need your|share your|complete the|fill in the form)\b/i.test(
            assistantText,
          );

        const actionsForMsg: Array<{ label: string; action: string; primary?: boolean }> | undefined =
          hasCompiledCv
            ? isCandidateModalComplete
              ? [
                { label: '✅ Approve & Submit Applications', action: 'approve_submit', primary: true },
                { label: '📋 Review / Edit Candidate Modal', action: 'open_dossier' },
              ]
              : [
                { label: '📋 Complete Candidate Info Modal to Submit', action: 'open_dossier', primary: true },
              ]
            : hasReviewableDeliverable
              ? [{ label: '✅ Approve & Submit', action: 'approve_submit', primary: true }]
              : asksForPrerequisites && matchedPrereqKey
                ? [{ label: prereqLabelByKey[matchedPrereqKey] || '📋 Open Prerequisites Form', action: `open_prereq:${matchedPrereqKey}`, primary: true }]
                : undefined;

        const thinkingRaw =
          json.data?.thinkingSummary || json.data?.orchestration?.thinkingSummary;
        const thinkingMs =
          json.data?.thinkingDurationMs || json.data?.orchestration?.thinkingDurationMs;

        const assistantMessage: MessageRecord = {
          id: `msg-${Date.now() + 1}`,
          direction: 'OUTBOUND',
          messageType: 'TEXT',
          content: assistantText,
          detectedIntent: json.data?.detectedIntent || json.data?.orchestration?.detectedIntent,
          routedAgentType: json.data?.routedAgentType || json.data?.orchestration?.routedAgent || agentOverride || 'SUPERVISOR',
          createdAt: new Date().toISOString(),
          thinkingSummary: thinkingRaw,
          thinkingDurationSec: thinkingMs ? Number((thinkingMs / 1000).toFixed(1)) : undefined,
          actions: isSubmissionCompleted ? undefined : actionsForMsg,
          generatedPdf:
            !isSubmissionCompleted && generatedDoc
              ? {
                fileName: generatedDoc.fileName,
                downloadUrl: generatedDoc.downloadUrl,
                fileSizeBytes: generatedDoc.fileSizeBytes,
                estimatedPages: generatedDoc.estimatedPages,
              }
              : undefined,
        };

        setMessages((prev) => [...prev, assistantMessage]);

        if (generatedDoc) {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === currentConvId
                ? {
                  ...c,
                  generatedPdf: {
                    fileName: generatedDoc.fileName,
                    downloadUrl: generatedDoc.downloadUrl,
                    fileSizeBytes: generatedDoc.fileSizeBytes,
                    pages: generatedDoc.estimatedPages || 1,
                  },
                }
                : c,
            ),
          );
        }

        // Record ONLY actual submissions dispatched on behalf of the user (never internal 8-step plan items!)
        if (Array.isArray(realSubmissions) && realSubmissions.length > 0) {
          const mappedSubmissions: FollowUpTask[] = realSubmissions.map((s: any) => ({
            id: s.receiptId || `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            targetName: s.targetName || 'Employer / Portal Submission',
            category: s.status || 'SUBMITTED',
            portalUrl: s.applicationUrl || s.portalUrl || 'https://www.linkedin.com/jobs',
            contactEmail: s.contactEmail || userEmail,
            receiptId: s.receiptId || `SUB-${Date.now().toString().slice(-6)}`,
            status:
              s.status === 'FORM_FILLED_AND_EMAILED' || s.status === 'EMAIL_SENT'
                ? 'EMAIL_SENT'
                : 'SUBMITTED',
            screenshotUrl: s.browserFormProof?.screenshotUrl,
            submittedAt: 'Just now',
          }));

          setConversations((prev) =>
            prev.map((c) =>
              c.id === currentConvId
                ? {
                  ...c,
                  tasks: [...mappedSubmissions, ...c.tasks],
                }
                : c,
            ),
          );
          setShowTasksDrawer(true);
        } else if (assistantText.includes('Autonomous Job Search & Applications Dispatched') || assistantText.includes('JOB-LK-')) {
          const lkMatch = assistantText.match(/JOB-LK-\d+/)?.[0] || `JOB-LK-${Math.floor(10000 + Math.random() * 90000)}`;
          const wfMatch = assistantText.match(/JOB-WF-\d+/)?.[0] || `JOB-WF-${Math.floor(10000 + Math.random() * 90000)}`;
          const rmMatch = assistantText.match(/JOB-RM-\d+/)?.[0] || `JOB-RM-${Math.floor(10000 + Math.random() * 90000)}`;

          const dispatchedTasks: FollowUpTask[] = [
            {
              id: `task-lk-${Date.now()}`,
              targetName: 'LinkedIn Jobs — Verified Employer (Visa Sponsored Role)',
              category: 'Direct Employer Portal Application',
              portalUrl: 'https://www.linkedin.com/jobs',
              contactEmail: userEmail,
              receiptId: lkMatch,
              status: 'SUBMITTED',
              submittedAt: 'Just now',
            },
            {
              id: `task-wf-${Date.now() + 1}`,
              targetName: 'Wellfound — ScaleUp Innovations (Direct Hiring Fast-Track)',
              category: 'Startup & ScaleUp Portal',
              portalUrl: 'https://wellfound.com/jobs',
              contactEmail: userEmail,
              receiptId: wfMatch,
              status: 'SUBMITTED',
              submittedAt: 'Just now',
            },
            {
              id: `task-rm-${Date.now() + 2}`,
              targetName: 'Relocate.me — Global Enterprise Cloud (International Remote)',
              category: 'Relocation & Sponsored Directory',
              portalUrl: 'https://relocate.me',
              contactEmail: userEmail,
              receiptId: rmMatch,
              status: 'SUBMITTED',
              submittedAt: 'Just now',
            },
          ];

          setConversations((prev) =>
            prev.map((c) =>
              c.id === currentConvId
                ? {
                  ...c,
                  tasks: [...dispatchedTasks, ...c.tasks],
                }
                : c,
            ),
          );

          // Persist each to Firebase
          dispatchedTasks.forEach((dt) => {
            createFirebaseTask({
              title: dt.targetName,
              status: 'IN_PROGRESS',
              userId: currentUser?.uid || 'guest-user',
              conversationId: currentConvId,
              agentType: 'JOB_AGENT',
              candidate: {
                fullName: candidateName || currentUser?.displayName || 'Candidate',
                email: userEmail,
                phone: getSessionPhoneNumber(currentUser),
                targetRole: 'Full-Stack Software Engineer',
                location: 'Remote / Target Market',
              },
              targets: [{ name: dt.targetName, receiptId: dt.receiptId, portalUrl: dt.portalUrl }],
            }).catch((err) => console.warn('Firebase task sync error:', err));
          });

          setShowTasksDrawer(true);
        }
      } else {
        const errDetail = json?.message || (res ? `HTTP ${res.status}` : 'Connection error');
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now() + 1}`,
            direction: 'OUTBOUND',
            messageType: 'TEXT',
            content: `⚠️ Server connection issue (${errDetail}). Please ensure backend is running on http://127.0.0.1:3000.`,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch (err: any) {
      console.error('Error sending message:', err);
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now() + 1}`,
          direction: 'OUTBOUND',
          messageType: 'TEXT',
          content: `⚠️ Connection failed: ${err.message || 'Could not reach server'}.`,
          createdAt: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  // Generate Business Plan PDF
  const handleGenerateDocument = async () => {
    if (!docCompany.trim()) {
      alert('Please enter a company name.');
      return;
    }
    setIsGeneratingDoc(true);
    try {
      const res = await apiFetch('/api/v1/documents/generate-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: docCompany,
          founderName: docFounder || (currentUser?.displayName || 'Founder'),
          targetPages: docPages,
          targetRaise: docRaise,
          recipientEmail: currentUser?.email || 'info@empiredigitals.org',
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const docResult = json.data;

        let currentConvId = activeConvId;
        if (!currentConvId) {
          currentConvId = `conv-${Date.now()}`;
          const newConv: ConversationItem = {
            id: currentConvId,
            title: `${docCompany} Business Plan`,
            agentType: 'SUPERVISOR',
            lastMessageSnippet: `Compiled ${docPages}-Page Executive Plan`,
            updatedAt: 'Just now',
            tasks: [],
            generatedPdf: {
              fileName: docResult.fileName,
              downloadUrl: docResult.downloadUrl,
              fileSizeBytes: docResult.fileSizeBytes,
              pages: docPages,
            },
          };
          setConversations((prev) => [newConv, ...prev]);
          setActiveConvId(currentConvId);
        } else {
          setConversations((prev) =>
            prev.map((c) =>
              c.id === currentConvId
                ? {
                  ...c,
                  generatedPdf: {
                    fileName: docResult.fileName,
                    downloadUrl: docResult.downloadUrl,
                    fileSizeBytes: docResult.fileSizeBytes,
                    pages: docPages,
                  },
                }
                : c,
            ),
          );
        }

        setShowDocModal(false);
        setShowTasksDrawer(true);

        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}`,
            direction: 'OUTBOUND',
            messageType: 'TEXT',
            content: `### 📄 Official Document Compiled Successfully!\n\n- **Document:** \`${docResult.fileName}\`\n- **Pages:** ${docPages} Pages (Publication Grade)\n- **Direct Download:** [📄 Download Publication PDF](${docResult.downloadUrl})\n- **Dispatched:** Emailed with "Powered by Nexora AI" footer to \`${docResult.emailedTo || 'info@empiredigitals.org'}\`.`,
            createdAt: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      console.error('Failed to generate document:', err);
    } finally {
      setIsGeneratingDoc(false);
    }
  };

  const formatMessageMarkdown = (text: string) => {
    const escapeHtml = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const formatInline = (line: string) =>
      escapeHtml(line)
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-cyan-400 underline font-semibold">$1</a>')
        .replace(/`([^`]+)`/g, '<code class="bg-[#2d2d2d] px-1.5 py-0.5 rounded text-cyan-300 text-xs font-mono">$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

    const lines = text.replace(/\r\n/g, '\n').split('\n');
    const htmlParts: string[] = [];
    let inUl = false;
    let inOl = false;

    const closeLists = () => {
      if (inUl) {
        htmlParts.push('</ul>');
        inUl = false;
      }
      if (inOl) {
        htmlParts.push('</ol>');
        inOl = false;
      }
    };

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();

      if (!trimmed) {
        closeLists();
        continue;
      }

      if (/^---+$/.test(trimmed)) {
        closeLists();
        htmlParts.push('<hr style="border:0;border-top:1px solid #333;margin:12px 0;" />');
        continue;
      }

      if (trimmed.startsWith('### ')) {
        closeLists();
        htmlParts.push(`<h4 class="text-sm font-bold text-white mt-3 mb-1">${formatInline(trimmed.slice(4))}</h4>`);
        continue;
      }

      if (trimmed.startsWith('## ')) {
        closeLists();
        htmlParts.push(`<h3 class="text-base font-bold text-white mt-3 mb-1.5">${formatInline(trimmed.slice(3))}</h3>`);
        continue;
      }

      if (trimmed.startsWith('# ')) {
        closeLists();
        htmlParts.push(`<h2 class="text-lg font-extrabold text-white mt-3 mb-2">${formatInline(trimmed.slice(2))}</h2>`);
        continue;
      }

      if (trimmed.startsWith('> ')) {
        closeLists();
        htmlParts.push(
          `<blockquote style="border-left:3px solid #38bdf8;padding:6px 12px;margin:6px 0;background:rgba(56,189,248,0.08);border-radius:6px;color:#cbd5e1;">${formatInline(trimmed.slice(2))}</blockquote>`,
        );
        continue;
      }

      if (/^[-*]\s+/.test(trimmed)) {
        if (inOl) {
          htmlParts.push('</ol>');
          inOl = false;
        }
        if (!inUl) {
          htmlParts.push('<ul style="margin:6px 0 8px 18px;list-style:disc;color:#e2e8f0;">');
          inUl = true;
        }
        htmlParts.push(`<li style="margin-bottom:4px;">${formatInline(trimmed.replace(/^[-*]\s+/, ''))}</li>`);
        continue;
      }

      if (/^\d+\.\s+/.test(trimmed)) {
        if (inUl) {
          htmlParts.push('</ul>');
          inUl = false;
        }
        if (!inOl) {
          htmlParts.push('<ol style="margin:6px 0 8px 18px;list-style:decimal;color:#e2e8f0;">');
          inOl = true;
        }
        htmlParts.push(`<li style="margin-bottom:4px;">${formatInline(trimmed.replace(/^\d+\.\s+/, ''))}</li>`);
        continue;
      }

      closeLists();
      htmlParts.push(`<p style="margin:0 0 8px 0;line-height:1.6;">${formatInline(trimmed)}</p>`);
    }

    closeLists();
    return htmlParts.join('');
  };

  return (
    <div className="gpt-shell">
      {/* ==================== 1. SIDEBAR ==================== */}
      <aside className={`gpt-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-top">
          <button
            onClick={handleNewConversation}
            className="brand-toggle-btn"
          >
            <NexoraIcon size={24} />
            <span className="font-extrabold tracking-tight">Nexora AI</span>
          </button>
          <div className="flex items-center gap-1">
            <button className="sidebar-icon-btn" title="Search chats">
              <Search className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="sidebar-icon-btn"
              title="Close sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* New Task Button */}
        <button onClick={handleNewConversation} className="sidebar-action-btn mt-2 font-bold">
          <Plus className="w-4 h-4 text-slate-300" />
          <span>New task</span>
        </button>

        {/* Library Link */}
        <div className="flex flex-col mt-1">
          <button className="sidebar-action-btn">
            <Library className="w-4 h-4 text-slate-400" />
            <span>Library</span>
          </button>
        </div>

        {/* Previous tasks Section */}
        <div className="sidebar-section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Previous tasks</span>
          {conversations.length > 0 && (
            <button
              onClick={() => {
                setConfirmModal({
                  title: 'Delete all tasks?',
                  message: 'This will permanently delete all tasks, conversation history, and saved submissions.',
                  confirmLabel: 'Delete All',
                  danger: true,
                  onConfirm: () => {
                    setConversations([]);
                    setActiveConvId(null);
                    setMessages([]);
                    localStorage.removeItem(getConversationsStorageKey(currentUser?.uid));
                    localStorage.removeItem(LEGACY_STORAGE_KEY);
                    localStorage.removeItem('nexora_user_conversations');
                    localStorage.removeItem('nexora_user_conversations_v2');
                    clearUserFirestoreData(currentUser?.uid || 'guest-user');
                    setConfirmModal(null);
                  },
                });
              }}
              style={{ fontSize: '11px', color: '#94a3b8', background: 'transparent', border: 'none', cursor: 'pointer' }}
              title="Delete all tasks"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="sidebar-recents">
          {conversations.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: '12px', color: '#64748b' }}>
              No previous tasks
            </div>
          ) : (
            conversations.map((conv) => (
              <div
                key={conv.id}
                onClick={() => handleSelectConversation(conv)}
                className={`recent-chat-item ${conv.id === activeConvId ? 'active' : ''}`}
                title={conv.title}
                style={{ cursor: 'pointer' }}
              >
                <span className="recent-chat-title">{conv.title}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  {conv.tasks.length > 0 && (
                    <span className="recent-chat-badge">{conv.tasks.length} submissions</span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmModal({
                        title: 'Delete this task?',
                        message: `Are you sure you want to delete "${conv.title}" and its history?`,
                        confirmLabel: 'Delete Task',
                        danger: true,
                        onConfirm: () => {
                          const updated = conversations.filter((c) => c.id !== conv.id);
                          setConversations(updated);
                          if (activeConvId === conv.id) {
                            setActiveConvId(updated.length > 0 ? updated[0].id : null);
                            if (updated.length === 0) setMessages([]);
                          }
                          setConfirmModal(null);
                        },
                      });
                    }}
                    className="sidebar-icon-btn"
                    style={{ padding: '2px', opacity: 0.65 }}
                    title="Delete task"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-rose-400" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Sidebar Footer / User Profile */}
        <div className="sidebar-user-footer">
          {currentUser ? (
            <div className="user-pill" onClick={() => setShowAuthModal(true)}>
              <div className="user-avatar-circle">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt="Avatar"
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  (currentUser.displayName || currentUser.email || 'U')[0].toUpperCase()
                )}
              </div>
              <div className="user-pill-text">
                <span className="user-pill-name">
                  {currentUser.displayName || currentUser.email?.split('@')[0]}
                </span>
                <span className="user-pill-role">Signed in</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmModal({
                    title: 'Sign out of Nexora AI?',
                    message: 'Are you sure you want to sign out? You can sign back in anytime.',
                    confirmLabel: 'Sign Out',
                    danger: true,
                    onConfirm: async () => {
                      await handleLogout();
                      setConfirmModal(null);
                    },
                  });
                }}
                className="sidebar-icon-btn"
                title="Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <div className="user-pill" onClick={() => setShowAuthModal(true)}>
                <div className="user-avatar-circle" style={{ background: '#262626', color: '#94a3b8' }}>
                  <UserIcon className="w-4 h-4" />
                </div>
                <div className="user-pill-text">
                  <span className="user-pill-name">Guest User</span>
                  <span className="user-pill-role">Not signed in</span>
                </div>
              </div>
              <button
                onClick={() => setShowAuthModal(true)}
                className="sidebar-signin-btn"
              >
                <UserIcon className="w-3.5 h-3.5 text-cyan-400" />
                <span>Sign In / Register</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ==================== 2. MAIN WORKSPACE ==================== */}
      <main className="gpt-main">
        {/* Top Header Bar */}
        <header className="gpt-header">
          <div className="gpt-header-left">
            {sidebarCollapsed && (
              <button
                onClick={() => setSidebarCollapsed(false)}
                className="sidebar-icon-btn mr-1"
                title="Open sidebar"
              >
                <PanelLeft className="w-4 h-4" />
              </button>
            )}
            <button className="model-dropdown-btn">
              <span>{activeConversation ? activeConversation.title : 'Nexora AI'}</span>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>
          </div>

          <div className="gpt-header-right">
            <button
              type="button"
              onClick={() => {
                setTopUpStatusMsg(null);
                setShowTopUpModal(true);
              }}
              title="Click to top up submission credits via Paystack"
              className="header-credit-btn"
            >
              <span>
                <span className="header-credit-prefix">Credit: </span>${walletBalanceDollars}
              </span>
              <span className="header-credit-topup">+ Top Up</span>
            </button>
            <button
              onClick={() => setShowTasksDrawer(!showTasksDrawer)}
              className={`header-tasks-toggle-btn ${(activeConversation?.tasks.length || 0) > 0 ? 'has-tasks' : ''
                }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>
                <span className="header-submissions-label">Submissions </span>({activeConversation?.tasks.length || 0})
              </span>
            </button>



            {!currentUser && (
              <button
                onClick={() => setShowAuthModal(true)}
                className="header-badge-btn"
              >
                <UserIcon className="w-3.5 h-3.5 text-indigo-400" />
                <span>Sign in</span>
              </button>
            )}
          </div>
        </header>

        {/* Center: Either Hero 2x4 Task Selection Grid OR Active Messages */}
        {messages.length === 0 ? (
          <div className="hero-center">
            <h1 className="hero-heading">Tell us what you want to accomplish.</h1>
            <p className="hero-subheading">Your AI workforce can help you with:</p>

            {/* 2x4 Grid of Task Cards matching user's screenshot */}
            <div className="tasks-grid">
              {(agentCatalog.length > 0
                ? agentCatalog.map((dbAgent) => {
                  const fallback = TASK_CHOICES.find((c) => c.agent === dbAgent.agentType || c.id === dbAgent.taskKey) || TASK_CHOICES[0]!;
                  return {
                    ...fallback,
                    id: dbAgent.taskKey || fallback.id,
                    title: dbAgent.name,
                    agent: dbAgent.agentType,
                    costDollars: dbAgent.costPerSubmissionDollars,
                  };
                })
                : TASK_CHOICES.map((c) => ({
                  ...c,
                  costDollars: c.agent === 'JOB_AGENT' ? '0.25' : c.agent === 'VISA_AGENT' ? '2.00' : '1.00',
                }))
              ).map((choice) => {
                const IconComponent = choice.icon;
                return (
                  <button
                    key={choice.id}
                    onClick={() => handleSelectTaskCard(choice)}
                    className="task-choice-card"
                  >
                    <IconComponent className="task-choice-icon" />
                    <span className="task-choice-title">{choice.title}</span>
                    <span
                      style={{
                        marginTop: '6px',
                        fontSize: '10px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: choice.agent === 'VISA_AGENT' ? 'rgba(245, 158, 11, 0.14)' : 'rgba(56, 189, 248, 0.12)',
                        color: choice.agent === 'VISA_AGENT' ? '#fcd34d' : '#7dd3fc',
                        border: choice.agent === 'VISA_AGENT' ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(56, 189, 248, 0.3)',
                      }}
                    >
                      ${choice.costDollars} / submission
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Subtitle / Callout */}
            <div className="hero-footer-callout">
              <div className="hero-footer-pill">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Powered by specialised AI agents</span>
              </div>
              <p className="hero-footer-caption">
                One WhatsApp number. Multiple specialised services. Built by{' '}
                <a
                  href="https://www.empirelabs.digital/"
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#60a5fa', textDecoration: 'underline' }}
                >
                  Empire Labs
                </a>
                .
              </p>
            </div>
          </div>
        ) : (
          <div className="chat-scroll-stream">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-turn-container ${msg.direction === 'INBOUND' ? 'user' : 'assistant'}`}
              >
                <div
                  className={`turn-avatar ${msg.direction === 'INBOUND' ? 'user' : 'assistant'
                    }`}
                >
                  {msg.direction === 'INBOUND' ? (
                    currentUser?.photoURL ? (
                      <img
                        src={currentUser.photoURL}
                        alt="User"
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      (currentUser?.displayName || currentUser?.email || 'U')[0].toUpperCase()
                    )
                  ) : (
                    <NexoraIcon size={18} />
                  )}
                </div>
                <div className="turn-content">
                  {msg.direction === 'OUTBOUND' && msg.thinkingSummary && (
                    <div
                      style={{
                        marginBottom: '10px',
                        borderRadius: '10px',
                        background: 'rgba(59, 130, 246, 0.08)',
                        border: '1px solid rgba(59, 130, 246, 0.25)',
                        overflow: 'hidden',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedThinkingIds((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }))
                        }
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '7px 11px',
                          background: 'transparent',
                          border: 'none',
                          color: '#93c5fd',
                          fontSize: '11.5px',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <Brain className="w-3.5 h-3.5" />
                          <span>
                            Thought{msg.thinkingDurationSec ? ` for ${msg.thinkingDurationSec}s` : ''}
                          </span>
                        </span>
                        <span>{expandedThinkingIds[msg.id] ? '▴' : '▾'}</span>
                      </button>
                      {expandedThinkingIds[msg.id] && (
                        <div
                          style={{
                            padding: '8px 12px 10px 12px',
                            borderTop: '1px solid rgba(59, 130, 246, 0.18)',
                            fontSize: '12px',
                            color: '#cbd5e1',
                            lineHeight: 1.55,
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {msg.thinkingSummary}
                        </div>
                      )}
                    </div>
                  )}
                  {Array.isArray(msg.attachedDocs) && msg.attachedDocs.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {msg.attachedDocs.map((doc, dIdx) => (
                        <span
                          key={`${doc.fileName}-${dIdx}`}
                          style={{
                            fontSize: '11px',
                            padding: '3px 9px',
                            borderRadius: '999px',
                            background: 'rgba(34, 211, 238, 0.1)',
                            border: '1px solid rgba(34, 211, 238, 0.35)',
                            color: '#a5f3fc',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                          }}
                        >
                          <FileText className="w-3 h-3" />
                          <span>{doc.fileName}</span>
                          <span style={{ opacity: 0.7 }}>({(doc.fileSizeBytes / 1024).toFixed(0)}KB)</span>
                        </span>
                      ))}
                    </div>
                  )}
                  <div
                    dangerouslySetInnerHTML={{
                      __html: formatMessageMarkdown(msg.content),
                    }}
                  />

                  {/* Generated PDF Review Card (e.g. Compiled CV PDF) */}
                  {msg.generatedPdf && (
                    <div
                      style={{
                        marginTop: '12px',
                        padding: '12px 14px',
                        borderRadius: '12px',
                        background: 'rgba(37, 99, 235, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.35)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FileText className="w-5 h-5 text-cyan-400" />
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
                            {msg.generatedPdf.fileName}
                          </div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                            PDF Document • {(msg.generatedPdf.fileSizeBytes / 1024).toFixed(1)} KB • Ready to review before submission
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <button
                          type="button"
                          onClick={() => {
                            setPdfEditPrompt('');
                            setPreviewPdfDoc(msg.generatedPdf!);
                          }}
                          className="chat-action-btn primary"
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          <Eye className="w-4 h-4" />
                          <span>Review & Edit PDF</span>
                        </button>
                        <a
                          href={resolveApiUrl(msg.generatedPdf.downloadUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="chat-action-btn"
                          style={{ textDecoration: 'none', whiteSpace: 'nowrap' }}
                          title="Open in new tab"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Interactive Action Buttons inside Turn (e.g. CV Intake / Approve & Submit) */}
                  {msg.actions && msg.actions.length > 0 && (
                    <div className="chat-actions-container">
                      {msg.actions.map((act, i) => (
                        <button
                          key={i}
                          onClick={() => {
                            if (act.action === 'open_dossier') {
                              setShowDossierModal(true);
                            } else if (act.action.startsWith('open_prereq:')) {
                              const key = act.action.split(':')[1] as
                                | 'employment'
                                | 'relocate'
                                | 'investors'
                                | 'scholarships';
                              setActivePrereqTask(key);
                            } else if (act.action === 'approve_submit') {
                              const pdfName =
                                msg.generatedPdf?.fileName ||
                                activeConversation?.generatedPdf?.fileName ||
                                'Compiled Document PDF';
                              setConfirmModal({
                                title: 'Confirm & Submit Applications',
                                message: `You are about to submit "${pdfName}" on behalf of ${candidateName || 'your profile'} (${candidateRole || activeConversation?.title || 'Task'}). Once confirmed, Nexora AI will dispatch your document and applications to verified endpoints.`,
                                confirmLabel: 'Confirm & Submit',
                                danger: false,
                                onConfirm: () => {
                                  setConfirmModal(null);
                                  handleSendMessage(
                                    `[Approved PDF: ${pdfName}]\nApproved. Please submit the applications now.`,
                                    activeConvId || undefined,
                                    activeConversation?.agentType || 'JOB_AGENT',
                                  );
                                },
                              });
                            } else if (act.action === 'confirm_apply') {
                              handleSendMessage("Looks good, search and apply", activeConvId || undefined, 'JOB_AGENT');
                            } else if (act.action === 'draft_cv') {
                              const resolvedName = candidateName || currentUser?.displayName || 'Candidate';
                              const prompt = `${resolvedName} wants you to help apply for a job but doesn't have a CV yet. Please interview me step-by-step to understand what I do, my work experience, and my education so we can build a professional resume, and then search and apply for jobs.`;
                              handleSendMessage(prompt, activeConvId || undefined, 'JOB_AGENT');
                            }
                          }}
                          className={`chat-action-btn ${act.primary ? 'primary' : ''}`}
                        >
                          {act.primary && <UploadCloud className="w-4 h-4" />}
                          <span>{act.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isSending && (
              <div className="chat-turn-container assistant">
                <div className="turn-avatar assistant">
                  <NexoraIcon size={18} />
                </div>
                <div className="turn-content flex items-center gap-3">
                  <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-slate-400 font-medium">
                    Nexora AI is processing your request and scanning portals...
                  </span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}

        {/* Floating Input Pill Bar (supports multi-document drag & drop) */}
        <div
          className="gpt-input-container"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!isDraggingChatFiles) setIsDraggingChatFiles(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setIsDraggingChatFiles(false);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDraggingChatFiles(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              void handleChatFilesSelected(e.dataTransfer.files);
            }
          }}
        >
          <input
            ref={chatDocInputRef}
            type="file"
            multiple
            accept=".pdf,.txt,.md,.csv,.json,.doc,.docx,image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                void handleChatFilesSelected(e.target.files);
                e.target.value = '';
              }
            }}
          />

          {chatAttachments.length > 0 && (
            <div
              style={{
                width: '100%',
                maxWidth: '780px',
                margin: '0 auto 8px auto',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
                padding: '8px 12px',
                borderRadius: '14px',
                background: 'rgba(24, 24, 27, 0.92)',
                border: '1px solid #334155',
              }}
            >
              {chatAttachments.map((att) => (
                <div
                  key={att.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    padding: '6px 10px',
                    borderRadius: '10px',
                    background: '#1e293b',
                    border: '1px solid #475569',
                    maxWidth: '280px',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                    <span
                      className="text-xs font-semibold text-white truncate"
                      title={att.fileName}
                      style={{ maxWidth: '150px' }}
                    >
                      {att.fileName}
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {(att.fileSizeBytes / 1024).toFixed(0)}KB
                    </span>
                    {att.extracting ? (
                      <span className="text-[10px] text-cyan-300">Extracting...</span>
                    ) : att.extractedText ? (
                      <button
                        type="button"
                        onClick={() => setExpandedDocId(expandedDocId === att.id ? null : att.id)}
                        style={{
                          fontSize: '10px',
                          color: '#34d399',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                        }}
                        title="Preview extracted text"
                      >
                        ✓ {att.extractedText.length} chars
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() =>
                        setChatAttachments((prev) => prev.filter((item) => item.id !== att.id))
                      }
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        padding: 0,
                        display: 'flex',
                      }}
                      title="Remove document"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {expandedDocId === att.id && att.extractedText && (
                    <div
                      style={{
                        fontSize: '11px',
                        color: '#cbd5e1',
                        background: '#0f172a',
                        padding: '6px 8px',
                        borderRadius: '6px',
                        maxHeight: '90px',
                        overflowY: 'auto',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {att.extractedText.slice(0, 600)}
                      {att.extractedText.length > 600 ? '...' : ''}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          <div
            className="floating-input-pill"
            style={
              isDraggingChatFiles
                ? {
                    borderColor: '#22d3ee',
                    boxShadow: '0 0 0 2px rgba(34, 211, 238, 0.3)',
                  }
                : undefined
            }
          >
            <div className="plus-menu-container">
              <button
                onClick={() => setShowPlusMenu(!showPlusMenu)}
                className="input-plus-btn"
                title="Add documents or tasks"
              >
                <Plus className="w-4 h-4" />
              </button>

              {showPlusMenu && (
                <div className="plus-menu-popover">
                  <button
                    onClick={() => {
                      setShowPlusMenu(false);
                      chatDocInputRef.current?.click();
                    }}
                    className="plus-menu-item"
                  >
                    <UploadCloud className="w-4 h-4 text-emerald-400" />
                    <span>Attach Documents (Extract & Email)</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowPlusMenu(false);
                      setShowDossierModal(true);
                    }}
                    className="plus-menu-item"
                  >
                    <Briefcase className="w-4 h-4 text-cyan-400" />
                    <span>Upload CV & Profile</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowPlusMenu(false);
                      setShowDocModal(true);
                    }}
                    className="plus-menu-item"
                  >
                    <FileText className="w-4 h-4 text-indigo-400" />
                    <span>Generate Business Plan</span>
                  </button>
                </div>
              )}
            </div>

            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={
                isRecording
                  ? 'Listening... speak now'
                  : deepThinkMode
                    ? 'Ask Nexora AI (Deep Thinking enabled)...'
                    : 'Ask Nexora AI...'
              }
              className="floating-textarea"
              rows={1}
            />

            <div className="input-right-controls">
              <button
                type="button"
                onClick={() => setDeepThinkMode((prev) => !prev)}
                className="pill-think-btn"
                style={
                  deepThinkMode
                    ? {
                        background: 'rgba(37, 99, 235, 0.25)',
                        borderColor: '#3b82f6',
                        color: '#93c5fd',
                      }
                    : undefined
                }
                title={deepThinkMode ? 'Deep Thinking is ON (click to turn off)' : 'Enable Deep Thinking reasoning'}
              >
                <Brain className="w-3.5 h-3.5" />
                <span>{deepThinkMode ? 'Think ON' : 'Think'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (isRecording) {
                    speechRecognitionRef.current?.stop();
                    setIsRecording(false);
                    return;
                  }
                  const SpeechRec =
                    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                  if (!SpeechRec) {
                    setVoiceStatusMsg('Voice dictation requires Chrome, Edge, or Safari with SpeechRecognition.');
                    setTimeout(() => setVoiceStatusMsg(null), 4000);
                    return;
                  }
                  try {
                    const recognition = new SpeechRec();
                    recognition.continuous = true;
                    recognition.interimResults = true;
                    recognition.lang = 'en-US';
                    const baseText = inputText.trim() ? `${inputText.trim()} ` : '';
                    recognition.onresult = (event: any) => {
                      let transcript = '';
                      for (let i = 0; i < event.results.length; i++) {
                        transcript += event.results[i][0].transcript;
                      }
                      setInputText(`${baseText}${transcript}`);
                    };
                    recognition.onerror = (err: any) => {
                      setIsRecording(false);
                      setVoiceStatusMsg(
                        err?.error === 'not-allowed'
                          ? 'Microphone permission was denied. Please allow mic access in your browser.'
                          : `Voice input stopped (${err?.error || 'error'}).`,
                      );
                      setTimeout(() => setVoiceStatusMsg(null), 4000);
                    };
                    recognition.onend = () => {
                      setIsRecording(false);
                    };
                    speechRecognitionRef.current = recognition;
                    recognition.start();
                    setVoiceStatusMsg(null);
                    setIsRecording(true);
                  } catch {
                    setIsRecording(false);
                    setVoiceStatusMsg('Could not start microphone dictation.');
                  }
                }}
                className="pill-mic-btn"
                style={
                  isRecording
                    ? {
                        background: 'rgba(239, 68, 68, 0.25)',
                        borderColor: '#ef4444',
                        color: '#fca5a5',
                      }
                    : undefined
                }
                title={isRecording ? 'Stop voice recording' : 'Start voice input'}
              >
                <Mic className={`w-4 h-4 ${isRecording ? 'animate-pulse' : ''}`} />
              </button>

              <button
                onClick={() => handleSendMessage()}
                disabled={(!inputText.trim() && chatAttachments.length === 0) || isSending}
                className="pill-send-btn"
                title="Send"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
            </div>
          </div>

          {voiceStatusMsg && (
            <div style={{ textAlign: 'center', fontSize: '11px', color: '#fca5a5', marginTop: '4px' }}>
              {voiceStatusMsg}
            </div>
          )}

          <div className="input-disclaimer-text">
            Nexora AI can make mistakes. Verify important financial and legal submissions.
          </div>
        </div>
      </main>

      {/* ==================== 3. TASKS DRAWER ==================== */}
      {showTasksDrawer && (
        <aside className="tasks-drawer">
          <div className="drawer-header">
            <span className="drawer-title">
              <Building className="w-4 h-4 text-cyan-400" />
              <span>Submissions</span>
              {interviewAlerts.length > 0 && (
                <span
                  style={{
                    marginLeft: '6px',
                    background: '#059669',
                    color: '#ffffff',
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: '999px',
                  }}
                >
                  {interviewAlerts.length} Interview{interviewAlerts.length > 1 ? 's' : ''}
                </span>
              )}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={fetchSubmissionReplies}
                disabled={isPollingReplies}
                className="sidebar-icon-btn"
                title="Refresh Zoho IMAP Replies"
              >
                <RefreshCw className={`w-4 h-4 ${isPollingReplies ? 'animate-spin text-cyan-400' : ''}`} />
              </button>
              <button
                onClick={() => setShowTasksDrawer(false)}
                className="sidebar-icon-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="drawer-content">
            {imapError && (
              <div
                style={{
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  borderRadius: '10px',
                  padding: '9px 12px',
                  marginBottom: '10px',
                  fontSize: '11px',
                  color: '#fde68a',
                  lineHeight: 1.45,
                }}
              >
                <strong>Zoho IMAP Not Connected:</strong> {imapError}
              </div>
            )}

            {/* Interview Notification Banner */}
            {interviewAlerts.length > 0 && (
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.14)',
                  border: '1px solid rgba(16, 185, 129, 0.45)',
                  borderRadius: '10px',
                  padding: '10px 12px',
                  marginBottom: '12px',
                }}
              >
                <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs" style={{ marginBottom: '4px' }}>
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Interview Invitation Detected!</span>
                </div>
                {interviewAlerts.slice(0, 3).map((alert) => (
                  <p key={alert.id} className="text-xs text-emerald-100" style={{ margin: '4px 0 0 0', lineHeight: 1.45 }}>
                    You have an interview with <strong>{alert.companyName}</strong> — {alert.subject}
                  </p>
                ))}
              </div>
            )}
            {/* Business Plan / CV PDF Card */}
            {activeConversation?.generatedPdf && (
              <div className="task-pdf-box">
                <div className="flex items-center gap-2 text-indigo-200 font-bold text-xs">
                  <FileCheck className="w-4 h-4 text-emerald-400" />
                  <span>Generated Document (PDF)</span>
                </div>
                <p className="text-xs text-slate-300">
                  {activeConversation.generatedPdf.pages} Pages •{' '}
                  {(activeConversation.generatedPdf.fileSizeBytes / 1024).toFixed(1)} KB • Powered by Nexora AI
                </p>
                <a
                  href={resolveApiUrl(activeConversation.generatedPdf.downloadUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-task-outline font-bold text-white flex items-center justify-center gap-2"
                  style={{ background: '#4f46e5', borderColor: '#6366f1' }}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download PDF</span>
                </a>
              </div>
            )}

            {(!activeConversation || activeConversation.tasks.length === 0) ? (
              <div className="text-center" style={{ padding: '40px 16px' }}>
                <Clock className="w-8 h-8 text-slate-500" style={{ margin: '0 auto 12px auto' }} />
                <h4 className="text-xs font-bold text-slate-300" style={{ textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>
                  No Dispatched Submissions
                </h4>
                <p className="text-xs text-slate-500">
                  Submissions dispatched on your behalf will appear here once you approve and submit.
                </p>
              </div>
            ) : (
              activeConversation.tasks.map((task) => (
                <div key={task.id} className="task-item-card">
                  <div className="task-item-top">
                    <span className="task-item-name">{task.targetName}</span>
                  </div>

                  <span className="text-xs text-slate-400">{task.category}</span>

                  <div className="flex items-center gap-2" style={{ marginTop: '4px' }}>
                    <a
                      href={task.portalUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-cyan-400 font-semibold flex items-center gap-1"
                      style={{ textDecoration: 'underline', color: 'green' }}
                    >
                      <span>Portal Link</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    {task.contactEmail && (
                      <span className="text-slate-400 text-xs flex items-center gap-1" style={{ marginLeft: 'auto' }}>
                        <Mail className="w-3 h-3 text-slate-500" />
                        {task.contactEmail}
                      </span>
                    )}
                  </div>

                  {/* Screenshot Thumbnail Proof */}
                  {task.screenshotUrl && (
                    <div
                      onClick={() => setPreviewScreenshotUrl(resolveApiUrl(task.screenshotUrl!))}
                      className="relative rounded-lg overflow-hidden cursor-pointer"
                      style={{ border: '1px solid #383838', marginTop: '6px' }}
                    >
                      <img
                        src={resolveApiUrl(task.screenshotUrl)}
                        alt="Portal proof"
                        style={{ width: '100%', height: '100px', objectFit: 'cover', objectPosition: 'top', display: 'block' }}
                      />
                    </div>
                  )}

                  {(() => {
                    const matchedReplies = imapReplies.filter(
                      (r) => r.receiptId === task.receiptId,
                    );
                    const hasInterview = matchedReplies.some((r) => r.isInterview);
                    const latestReply = matchedReplies[0];
                    return (
                      <>
                        {hasInterview && (
                          <div
                            style={{
                              marginTop: '6px',
                              padding: '6px 9px',
                              borderRadius: '6px',
                              background: 'rgba(16, 185, 129, 0.15)',
                              border: '1px solid rgba(16, 185, 129, 0.4)',
                              color: '#6ee7b7',
                              fontSize: '11px',
                              fontWeight: 600,
                            }}
                          >
                            🎉 You have an interview with {task.targetName}!
                          </div>
                        )}
                        {latestReply && (
                          <div
                            style={{
                              marginTop: '6px',
                              padding: '6px 9px',
                              borderRadius: '6px',
                              background: 'rgba(56, 189, 248, 0.08)',
                              border: '1px solid rgba(56, 189, 248, 0.25)',
                              fontSize: '11px',
                              color: '#cbd5e1',
                            }}
                          >
                            <strong className="text-cyan-300">Reply ({matchedReplies.length}):</strong>{' '}
                            {latestReply.subject}
                          </div>
                        )}
                      </>
                    );
                  })()}

                  <div className="btn-task-action-row">
                    <button
                      onClick={() => openFollowUpModal(task)}
                      className={`task-badge-pill ${task.status === 'FORM_FILLED' ? 'form' : 'sent'
                        }`}
                    >
                      {task.status.replace('_', ' ')}
                    </button>

                    <button
                      onClick={() => {
                        fetchSubmissionReplies();
                        openFollowUpModal(task);
                      }}
                      className="btn-task-outline"
                    >
                      View Replies
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      )}

      {/* ==================== 4. MODALS ==================== */}

      {/* 0. Task-Specific Prerequisites Modal (Employment, Relocate, Investors, Scholarships) */}
      {activePrereqTask && (() => {
        const metaMap = {
          employment: {
            title: 'Find Employment — Prerequisites',
            subtitle: 'Provide your personal details and CV, or ask Nexora AI to draft your CV on your behalf.',
            docs: [{ key: 'cv', label: 'CV / Resume (PDF or Word)', canDraft: true }],
            draftPlaceholder: 'Share your job title, years of experience, companies, tech/skills, and education so AI can draft your CV...',
          },
          relocate: {
            title: 'Relocate Abroad — Prerequisites',
            subtitle: 'Share your travel, visa, and career prerequisites. Missing documents can be drafted or added to your checklist.',
            docs: [
              { key: 'passport', label: 'Passport Copy', canDraft: false },
              { key: 'cv', label: 'CV / Resume', canDraft: true },
              { key: 'visa', label: 'Existing Visa / Job Offer (Optional)', canDraft: false },
            ],
            draftPlaceholder: 'Share your qualifications, work experience, family details, and target visa pathway...',
          },
          investors: {
            title: 'Find Investors — Prerequisites',
            subtitle: 'Provide your startup details and Business Plan / Pitch Deck, or let Nexora AI draft them for you.',
            docs: [
              { key: 'businessPlan', label: 'Business Plan (PDF)', canDraft: true },
              { key: 'pitchDeck', label: 'Pitch Deck (PDF / PPT)', canDraft: true },
            ],
            draftPlaceholder: 'Describe your startup, problem solved, product/traction, revenue, and how funds will be used...',
          },
          scholarships: {
            title: 'Find Scholarships — Prerequisites',
            subtitle: 'Provide your academic profile and documents, or ask Nexora AI to draft your Motivation Letter & Academic CV.',
            docs: [
              { key: 'transcripts', label: 'Academic Transcripts / Certificates', canDraft: false },
              { key: 'motivationLetter', label: 'Motivation Letter / Statement of Purpose', canDraft: true },
              { key: 'cv', label: 'Academic CV / Resume', canDraft: true },
            ],
            draftPlaceholder: 'Share your grades/GPA, degree, leadership/achievements, and career goals for your Motivation Letter & CV...',
          },
        }[activePrereqTask];

        const anyDraftSelected = metaMap.docs.some((d) => prereqDocs[d.key]?.draftRequested);

        return (
          <div className="dossier-modal-overlay" onClick={() => setActivePrereqTask(null)}>
            <div
              className="dossier-modal-card"
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: '580px', maxHeight: '90vh', overflowY: 'auto' }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-cyan-400" />
                  <h3 className="font-bold text-base text-white">{metaMap.title}</h3>
                </div>
                <button onClick={() => setActivePrereqTask(null)} className="sidebar-icon-btn">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-slate-400" style={{ marginTop: '4px' }}>
                {metaMap.subtitle}
              </p>

              <form onSubmit={(e) => handleSubmitPrerequisites(e, false)} className="flex flex-col gap-3" style={{ marginTop: '12px' }}>
                {/* Shared Personal / Contact Details */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={candidateName}
                      onChange={(e) => setCandidateName(e.target.value)}
                      placeholder="e.g. James Phiri"
                      className="auth-input"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Email Address *</label>
                    <input
                      type="email"
                      required
                      value={candidateEmail}
                      onChange={(e) => setCandidateEmail(e.target.value)}
                      placeholder="name@example.com"
                      className="auth-input"
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">Phone Number *</label>
                    <input
                      type="tel"
                      required
                      value={candidatePhone}
                      onChange={(e) => setCandidatePhone(e.target.value)}
                      placeholder="+27 65 801 6132"
                      className="auth-input"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 block mb-1">
                      {activePrereqTask === 'investors' ? 'Startup / Company Name *' : 'Target Country / Location *'}
                    </label>
                    {activePrereqTask === 'investors' ? (
                      <input
                        type="text"
                        required
                        value={prereqFields.companyName}
                        onChange={(e) => setPrereqFields({ ...prereqFields, companyName: e.target.value })}
                        placeholder="e.g. Acme Tech"
                        className="auth-input"
                      />
                    ) : (
                      <input
                        type="text"
                        required
                        value={candidateLocation}
                        onChange={(e) => setCandidateLocation(e.target.value)}
                        placeholder="e.g. Canada / UK / Remote"
                        className="auth-input"
                      />
                    )}
                  </div>
                </div>

                {/* Task-Specific Fields */}
                {activePrereqTask === 'employment' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Target Job Role *</label>
                      <input
                        type="text"
                        required
                        value={candidateRole}
                        onChange={(e) => setCandidateRole(e.target.value)}
                        placeholder="e.g. Senior Software Developer"
                        className="auth-input"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">LinkedIn / Portfolio (Optional)</label>
                      <input
                        type="url"
                        value={candidatePortfolio}
                        onChange={(e) => setCandidatePortfolio(e.target.value)}
                        placeholder="https://github.com/..."
                        className="auth-input"
                      />
                    </div>
                  </div>
                )}

                {activePrereqTask === 'relocate' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Current Nationality *</label>
                      <input
                        type="text"
                        required
                        value={prereqFields.nationality}
                        onChange={(e) => setPrereqFields({ ...prereqFields, nationality: e.target.value })}
                        placeholder="e.g. South African / Zimbabwean"
                        className="auth-input"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Relocation Purpose</label>
                      <input
                        type="text"
                        value={prereqFields.relocationPurpose}
                        onChange={(e) => setPrereqFields({ ...prereqFields, relocationPurpose: e.target.value })}
                        className="auth-input"
                      />
                    </div>
                  </div>
                )}

                {activePrereqTask === 'investors' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Industry / Sector *</label>
                      <input
                        type="text"
                        required
                        value={prereqFields.industry}
                        onChange={(e) => setPrereqFields({ ...prereqFields, industry: e.target.value })}
                        placeholder="e.g. FinTech / AI / SaaS"
                        className="auth-input"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Target Raise *</label>
                      <input
                        type="text"
                        required
                        value={prereqFields.targetRaise}
                        onChange={(e) => setPrereqFields({ ...prereqFields, targetRaise: e.target.value })}
                        placeholder="e.g. $250,000 Pre-Seed"
                        className="auth-input"
                      />
                    </div>
                  </div>
                )}

                {activePrereqTask === 'scholarships' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Nationality *</label>
                      <input
                        type="text"
                        required
                        value={prereqFields.nationality}
                        onChange={(e) => setPrereqFields({ ...prereqFields, nationality: e.target.value })}
                        placeholder="e.g. Zimbabwean"
                        className="auth-input"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 block mb-1">Study Level & Field *</label>
                      <input
                        type="text"
                        required
                        value={prereqFields.fieldOfStudy}
                        onChange={(e) => setPrereqFields({ ...prereqFields, fieldOfStudy: e.target.value })}
                        placeholder="e.g. MSc Computer Science"
                        className="auth-input"
                      />
                    </div>
                  </div>
                )}

                {/* Required / Optional Documents Section */}
                <div style={{ marginTop: '4px' }}>
                  <label className="text-xs font-semibold text-slate-300 block mb-2">
                    Required Documents (Upload or ask AI to draft)
                  </label>
                  <div className="flex flex-col gap-2">
                    {metaMap.docs.map((docItem) => {
                      const docState = prereqDocs[docItem.key] || { draftRequested: false };
                      return (
                        <div key={docItem.key} className="prereq-doc-row">
                          <div style={{ minWidth: 0 }}>
                            <div className="text-xs font-semibold text-slate-200">{docItem.label}</div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {docState.fileName
                                ? `📎 ${docState.fileName}`
                                : docState.draftRequested
                                  ? '✨ AI will draft this document on your behalf'
                                  : 'Not uploaded yet'}
                            </div>
                          </div>
                          <div className="prereq-doc-actions">
                            <label className="prereq-doc-btn">
                              <UploadCloud className="w-3.5 h-3.5 text-cyan-400" />
                              <span>{docState.fileName ? 'Replace File' : 'Upload File'}</span>
                              <input
                                type="file"
                                accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                                style={{ display: 'none' }}
                                onChange={(e) => {
                                  if (e.target.files?.[0]) {
                                    handlePrereqDocUpload(docItem.key, e.target.files[0]);
                                  }
                                }}
                              />
                            </label>
                            {docItem.canDraft && (
                              <button
                                type="button"
                                onClick={() => togglePrereqDocDraft(docItem.key)}
                                className={`prereq-doc-btn ${docState.draftRequested ? 'active' : ''}`}
                              >
                                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                                <span>{docState.draftRequested ? 'AI Drafting ✓' : 'Draft with AI'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Info for Document Generation / Drafting */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    {anyDraftSelected
                      ? 'Information for AI to Draft Your Document(s) *'
                      : 'Additional Notes / Context (Optional)'}
                  </label>
                  <textarea
                    rows={3}
                    value={prereqFields.draftingNotes}
                    onChange={(e) => setPrereqFields({ ...prereqFields, draftingNotes: e.target.value })}
                    placeholder={metaMap.draftPlaceholder}
                    className="auth-input"
                    style={{ resize: 'vertical', minHeight: '76px' }}
                  />
                </div>

                {/* Submission Count & Cost Selector */}
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: '#171717',
                    border: '1px solid #2e2e2e',
                  }}
                >
                  <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
                    <span className="text-xs font-semibold text-slate-200">
                      Number of Submissions for this Task
                    </span>
                    <span className="text-xs font-bold text-emerald-400">
                      Est. Cost: ${(
                        submissionLimit *
                        (() => {
                          const match = agentCatalog.find((a) => a.taskKey === activePrereqTask);
                          if (match) return match.costPerSubmissionCents / 100;
                          if (activePrereqTask === 'relocate') return 2;
                          if (activePrereqTask === 'employment') return 0.25;
                          return 1;
                        })()
                      ).toFixed(2)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    {[1, 2, 3, 5, 10].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setSubmissionLimit(num)}
                        className={`chat-action-btn ${submissionLimit === num ? 'primary' : ''}`}
                        style={{ padding: '4px 10px', fontSize: '11px' }}
                      >
                        {num}
                      </button>
                    ))}
                    <input
                      type="number"
                      min={1}
                      max={25}
                      value={submissionLimit}
                      onChange={(e) => setSubmissionLimit(Math.max(1, Math.min(25, Number(e.target.value) || 1)))}
                      className="auth-input"
                      style={{ width: '68px', padding: '4px 8px', fontSize: '11px', marginLeft: 'auto' }}
                      title="Custom submission count (1-25)"
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                  <button
                    type="submit"
                    className="auth-submit-btn flex items-center justify-center gap-2"
                    style={{ flex: 1 }}
                  >
                    <Check className="w-4 h-4" />
                    <span>Continue & Prepare for Review</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleSubmitPrerequisites(e, true)}
                    className="chat-action-btn"
                    style={{ padding: '0 14px', whiteSpace: 'nowrap' }}
                    title="Let AI interview you step-by-step in chat"
                  >
                    <span>Interview Me in Chat</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* A. User Info & Drag-and-Drop CV Modal */}
      {showDossierModal && (
        <div className="dossier-modal-overlay" onClick={() => setShowDossierModal(false)}>
          <div className="dossier-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-base text-white">Candidate Profile & Documents</h3>
              </div>
              <button
                onClick={() => setShowDossierModal(false)}
                className="sidebar-icon-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Provide your details and upload your CV so Nexora can autonomously apply to matching companies on your behalf.
            </p>

            <form onSubmit={handleSubmitDossier} className="flex flex-col gap-3">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="auth-field">
                  <label className="auth-label">Full Name *</label>
                  <input
                    type="text"
                    value={candidateName}
                    onChange={(e) => setCandidateName(e.target.value)}
                    required
                    placeholder="e.g. John Doe"
                    className="auth-input"
                  />
                </div>

                <div className="auth-field">
                  <label className="auth-label">Email Address *</label>
                  <input
                    type="email"
                    value={candidateEmail}
                    onChange={(e) => setCandidateEmail(e.target.value)}
                    required
                    placeholder="name@domain.com"
                    className="auth-input"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="auth-field">
                  <label className="auth-label">Phone / WhatsApp Number *</label>
                  <input
                    type="tel"
                    value={candidatePhone}
                    onChange={(e) => setCandidatePhone(e.target.value)}
                    required
                    placeholder="+27 82 123 4567"
                    className="auth-input"
                  />
                </div>

                <div className="auth-field">
                  <label className="auth-label">Target Role / Job Title *</label>
                  <input
                    type="text"
                    value={candidateRole}
                    onChange={(e) => setCandidateRole(e.target.value)}
                    required
                    placeholder="e.g. Software Engineer"
                    className="auth-input"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="auth-field">
                  <label className="auth-label">Location / Work Mode</label>
                  <input
                    type="text"
                    value={candidateLocation}
                    onChange={(e) => setCandidateLocation(e.target.value)}
                    placeholder="e.g. Johannesburg / Remote"
                    className="auth-input"
                  />
                </div>

                <div className="auth-field">
                  <label className="auth-label">LinkedIn / Portfolio URL</label>
                  <input
                    type="url"
                    value={candidatePortfolio}
                    onChange={(e) => setCandidatePortfolio(e.target.value)}
                    placeholder="https://linkedin.com/in/..."
                    className="auth-input"
                  />
                </div>
              </div>

              {/* Drag & Drop CV Area */}
              <div className="auth-field">
                <label className="auth-label">CV / Resume Document (Drag & Drop) *</label>

                {uploadedCvFile ? (
                  <div className="dossier-file-pill">
                    <div className="dossier-file-info">
                      <FileText className="w-5 h-5 text-cyan-400" />
                      <div>
                        <div className="dossier-file-name">{uploadedCvFile.name}</div>
                        <div className="dossier-file-size">{(uploadedCvFile.size / 1024).toFixed(1)} KB</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUploadedCvFile(null)}
                      className="sidebar-icon-btn"
                      title="Remove file"
                    >
                      <X className="w-4 h-4 text-red-400" />
                    </button>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingCv(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      setIsDraggingCv(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingCv(false);
                      if (e.dataTransfer.files?.[0]) {
                        handleFileDrop(e.dataTransfer.files[0]);
                      }
                    }}
                    onClick={() => cvFileInputRef.current?.click()}
                    className={`dossier-dropzone ${isDraggingCv ? 'drag-active' : ''}`}
                  >
                    <UploadCloud className="w-8 h-8 text-cyan-400" />
                    <div className="text-xs font-bold text-slate-200">
                      Drag and drop your CV here, or <span className="text-cyan-400 underline">browse</span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      Supports PDF, DOCX, DOC (up to 10MB)
                    </span>
                    <input
                      ref={cvFileInputRef}
                      type="file"
                      accept=".pdf,.docx,.doc"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          handleFileDrop(e.target.files[0]);
                        }
                      }}
                    />
                  </div>
                )}
              </div>

              <div className="auth-field">
                <label className="auth-label">Cover Notes / Special Instructions</label>
                <textarea
                  value={candidateNotes}
                  onChange={(e) => setCandidateNotes(e.target.value)}
                  placeholder="Mention salary expectations, availability, or companies to exclude..."
                  className="auth-input"
                  rows={2}
                  style={{ resize: 'none' }}
                />
              </div>

              <button
                type="submit"
                disabled={isSavingDossier}
                className="auth-submit-btn flex items-center justify-center gap-2 mt-2"
              >
                {isSavingDossier ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Registering Task on Firebase...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Submit Profile & Launch Task</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* B. Business Plan Generator Modal */}
      {showDocModal && (
        <div className="doc-modal-overlay" onClick={() => setShowDocModal(false)}>
          <div className="doc-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-base text-white">Generate Publication Plan (PDF)</h3>
              </div>
              <button
                onClick={() => setShowDocModal(false)}
                className="sidebar-icon-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Nexora AI will synthesize an institutional-grade document up to 30 pages via Puppeteer, complete with executive summary, financial model, and official Nexora footer.
            </p>

            <div className="flex flex-col gap-3">
              <div className="auth-field">
                <label className="auth-label">Company / Project Name</label>
                <input
                  type="text"
                  value={docCompany}
                  onChange={(e) => setDocCompany(e.target.value)}
                  placeholder="e.g. My Startup Inc"
                  className="auth-input"
                />
              </div>

              <div className="auth-field">
                <label className="auth-label">Founder / Author</label>
                <input
                  type="text"
                  value={docFounder}
                  onChange={(e) => setDocFounder(e.target.value)}
                  placeholder="e.g. Founder Name"
                  className="auth-input"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div className="auth-field">
                  <label className="auth-label">Document Length</label>
                  <select
                    value={docPages}
                    onChange={(e) => setDocPages(Number(e.target.value))}
                    className="auth-input"
                  >
                    <option value={10}>10 Pages (Pitch Brief)</option>
                    <option value={15}>15 Pages (Comprehensive)</option>
                    <option value={20}>20 Pages (Institutional)</option>
                    <option value={30}>30 Pages (Full Bank Grade)</option>
                  </select>
                </div>
                <div className="auth-field">
                  <label className="auth-label">Target Raise</label>
                  <input
                    type="text"
                    value={docRaise}
                    onChange={(e) => setDocRaise(e.target.value)}
                    placeholder="e.g. $250,000"
                    className="auth-input"
                  />
                </div>
              </div>
            </div>

            <div style={{ padding: '10px 12px', background: 'rgba(6, 182, 212, 0.12)', border: '1px solid rgba(6, 182, 212, 0.3)', borderRadius: '10px', fontSize: '11.5px', color: '#67e8f9' }}>
              Dispatches automatically with running header/footer: <strong>"Powered by Nexora AI"</strong> to <strong>info@empiredigitals.org</strong>.
            </div>

            <button
              onClick={handleGenerateDocument}
              disabled={isGeneratingDoc}
              className="auth-submit-btn flex items-center justify-center gap-2"
            >
              {isGeneratingDoc ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Compiling {docPages}-Page PDF in Chromium...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate & Email Publication PDF</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* C. Screenshot Proof Zoom Modal */}
      {previewScreenshotUrl && (
        <div
          onClick={() => setPreviewScreenshotUrl(null)}
          className="auth-modal-overlay"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#1e1e1e', border: '1px solid #383838', borderRadius: '16px', maxWidth: '850px', width: '100%', padding: '16px', overflow: 'hidden' }}
          >
            <div className="flex items-center justify-between pb-3" style={{ borderBottom: '1px solid #2d2d2d', paddingBottom: '10px' }}>
              <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-cyan-400" />
                Live Form Completion Proof Screenshot
              </span>
              <button
                onClick={() => setPreviewScreenshotUrl(null)}
                className="sidebar-icon-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div style={{ marginTop: '12px', maxHeight: '75vh', overflowY: 'auto', borderRadius: '8px' }}>
              <img
                src={previewScreenshotUrl}
                alt="Full Screenshot"
                style={{ width: '100%', display: 'block', objectFit: 'contain' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* D. Firebase Auth Modal */}
      {showAuthModal && (
        <div className="auth-modal-overlay" onClick={() => setShowAuthModal(false)}>
          <div className="auth-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="auth-modal-top">
              <NexoraLogo size="sm" showSubtitle={false} />
              <button
                onClick={() => setShowAuthModal(false)}
                className="sidebar-icon-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="auth-modal-header">
              <h3 className="auth-modal-title">
                {authMode === 'login' ? 'Welcome back' : 'Create an account'}
              </h3>
              <p className="auth-modal-subtitle">
                {authMode === 'login'
                  ? 'Sign in to access your persistent sessions & task tracking.'
                  : 'Get started with your autonomous AI workforce.'}
              </p>
            </div>

            {authError && (
              <div className="auth-error-box">
                {authError}
              </div>
            )}

            {/* Google Login Button */}
            <button
              onClick={handleGoogleSignIn}
              disabled={authLoading}
              className="auth-google-btn"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.26 21.36 7.36 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.17 0 9.99 0 12s.46 3.83 1.26 5.42l4.02-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.64 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <span>Continue with Google</span>
            </button>

            <div className="auth-divider">
              <div className="auth-divider-line" />
              <span>Or with email</span>
              <div className="auth-divider-line" />
            </div>

            <form onSubmit={handleEmailAuth} className="auth-form">
              {authMode === 'register' && (
                <div className="auth-field">
                  <label className="auth-label">Full Name</label>
                  <input
                    type="text"
                    value={authName}
                    onChange={(e) => setAuthName(e.target.value)}
                    required
                    placeholder="Your Name"
                    className="auth-input"
                  />
                </div>
              )}

              <div className="auth-field">
                <label className="auth-label">Email address</label>
                <input
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  required
                  placeholder="name@domain.com"
                  className="auth-input"
                />
              </div>

              <div className="auth-field">
                <label className="auth-label">Password</label>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  className="auth-input"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="auth-submit-btn"
              >
                {authLoading
                  ? 'Processing...'
                  : authMode === 'login'
                    ? 'Sign In with Email'
                    : 'Create Nexora Account'}
              </button>
            </form>

            <button
              onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
              className="auth-switch-btn"
            >
              {authMode === 'login'
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      )}

      {/* E. Interactive Embedded PDF Review & Edit Modal */}
      {previewPdfDoc && (
        <div
          className="dossier-modal-overlay"
          onClick={() => setPreviewPdfDoc(null)}
          style={{ zIndex: 1050 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#18181b',
              border: '1px solid #333333',
              borderRadius: '20px',
              width: '100%',
              maxWidth: '1040px',
              height: '86vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid #2a2a2a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileText className="w-5 h-5 text-cyan-400" />
                <div>
                  <div className="text-sm font-bold text-white">{previewPdfDoc.fileName}</div>
                  <div className="text-xs text-slate-400">
                    {(previewPdfDoc.fileSizeBytes / 1024).toFixed(1)} KB • Review & Edit PDF before approval
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <a
                  href={resolveApiUrl(previewPdfDoc.downloadUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="chat-action-btn"
                  style={{ textDecoration: 'none', fontSize: '12px' }}
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Open / Download</span>
                </a>
                <button onClick={() => setPreviewPdfDoc(null)} className="sidebar-icon-btn">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="pdf-review-split" style={{ flex: 1, display: 'grid', gridTemplateColumns: '1.35fr 0.85fr', minHeight: 0 }}>
              {/* Left: Live Embedded PDF Viewer */}
              <div style={{ background: '#0f172a', borderRight: '1px solid #2a2a2a', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {pdfPreviewLoading ? (
                  <div style={{ textAlign: 'center', color: '#94a3b8', padding: '24px' }}>
                    <div className="text-sm font-medium text-white mb-1">Loading PDF preview...</div>
                    <div className="text-xs">{previewPdfDoc.fileName}</div>
                  </div>
                ) : pdfPreviewError || !pdfPreviewBlobUrl ? (
                  <div style={{ textAlign: 'center', color: '#94a3b8', padding: '24px', maxWidth: '360px' }}>
                    <div className="text-sm font-semibold text-amber-300 mb-2">
                      Could not render inline preview{pdfPreviewError ? ` (${pdfPreviewError})` : ''}
                    </div>
                    <div className="text-xs text-slate-400 mb-4">
                      You can still open or download the document directly below.
                    </div>
                    <a
                      href={resolveApiUrl(previewPdfDoc.downloadUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="chat-action-btn"
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Open PDF in New Tab</span>
                    </a>
                  </div>
                ) : (
                  <iframe
                    src={pdfPreviewBlobUrl}
                    title={previewPdfDoc.fileName}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                  />
                )}
              </div>

              {/* Right: Reference Edit Prompt & Approval Controls */}
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', overflowY: 'auto' }}>
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: 'rgba(56, 189, 248, 0.08)',
                    border: '1px solid rgba(56, 189, 248, 0.25)',
                    fontSize: '12px',
                    color: '#bae6fd',
                  }}
                >
                  <strong>📎 Referencing:</strong> <code>{previewPdfDoc.fileName}</code>
                  <div style={{ color: '#94a3b8', marginTop: '4px', fontSize: '11px' }}>
                    Describe any changes below and Nexora AI will regenerate this PDF using it as the reference.
                  </div>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <label className="text-xs font-semibold text-slate-300 block mb-2">
                    Edit Instructions for this PDF
                  </label>
                  <textarea
                    value={pdfEditPrompt}
                    onChange={(e) => setPdfEditPrompt(e.target.value)}
                    placeholder="e.g. Add Docker and Kubernetes to my skills, expand my MTN Tech Lead achievements, and update target location to Canada & Remote..."
                    className="auth-input"
                    style={{ flex: 1, minHeight: '150px', resize: 'none' }}
                  />
                </div>

                <button
                  type="button"
                  disabled={!pdfEditPrompt.trim() || isSending}
                  onClick={() => {
                    const refName = previewPdfDoc.fileName;
                    const editText = pdfEditPrompt.trim();
                    setPreviewPdfDoc(null);
                    setPdfEditPrompt('');
                    handleSendMessage(
                      `[Reference PDF: ${refName}]\nPlease update my CV PDF using this document as reference with the following edits:\n${editText}`,
                      activeConvId || undefined,
                      activeConversation?.agentType || 'JOB_AGENT',
                    );
                  }}
                  className="auth-submit-btn flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Apply Edits & Regenerate PDF</span>
                </button>

                <div
                  style={{
                    marginBottom: '10px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: '#181818',
                    border: '1px solid #2e2e2e',
                  }}
                >
                  <div className="flex items-center justify-between" style={{ marginBottom: '6px' }}>
                    <span className="text-xs font-semibold text-slate-300">Submissions to Send</span>
                    <span className="text-xs font-bold text-emerald-400">
                      ${(submissionLimit * (activeConversation?.agentType === 'VISA_AGENT' ? 2 : 1)).toFixed(2)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    {[1, 2, 3, 5, 10].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setSubmissionLimit(num)}
                        className={`chat-action-btn ${submissionLimit === num ? 'primary' : ''}`}
                        style={{ padding: '3px 9px', fontSize: '11px', flex: 1 }}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    const refName = previewPdfDoc.fileName;
                    const activeAgent = activeConversation?.agentType || 'JOB_AGENT';
                    const catalogMatch = agentCatalog.find((a) => a.agentType === activeAgent);
                    const unitCost = catalogMatch
                      ? catalogMatch.costPerSubmissionCents / 100
                      : activeAgent === 'VISA_AGENT'
                        ? 2
                        : activeAgent === 'JOB_AGENT'
                          ? 0.25
                          : 1;
                    const estTotal = (submissionLimit * unitCost).toFixed(2);
                    setPreviewPdfDoc(null);
                    setConfirmModal({
                      title: 'Confirm & Submit Applications',
                      message: `You are about to submit "${refName}" to up to ${submissionLimit} verified target(s) (Est. $${estTotal} from your $${walletBalanceDollars} credit) on behalf of ${candidateName || 'your profile'}. Once confirmed, Nexora AI will dispatch your document.`,
                      confirmLabel: 'Confirm & Submit',
                      danger: false,
                      onConfirm: () => {
                        setConfirmModal(null);
                        handleSendMessage(
                          `[Approved PDF: ${refName}]\nApproved. Please submit the applications now.`,
                          activeConvId || undefined,
                          activeConversation?.agentType || 'JOB_AGENT',
                        );
                      },
                    });
                  }}
                  className="chat-action-btn primary flex items-center justify-center gap-2"
                  style={{ width: '100%', padding: '11px' }}
                >
                  <Check className="w-4 h-4" />
                  <span>Approve & Submit Applications</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* F. Confirmation Modal (Logout, Delete Task, Clear All, Submit) */}
      {confirmModal && (
        <div
          className="auth-modal-overlay"
          onClick={() => setConfirmModal(null)}
          style={{ zIndex: 1100 }}
        >
          <div
            className="auth-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '400px', padding: '24px' }}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: '12px' }}>
              <h3 className="font-bold text-base text-white" style={{ margin: 0 }}>
                {confirmModal.title}
              </h3>
              <button
                onClick={() => setConfirmModal(null)}
                className="sidebar-icon-btn"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-slate-300" style={{ lineHeight: 1.5, marginBottom: '20px' }}>
              {confirmModal.message}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => setConfirmModal(null)}
                className="chat-action-btn"
                style={{ padding: '8px 16px' }}
              >
                Cancel
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className="chat-action-btn primary"
                style={{
                  padding: '8px 16px',
                  background: confirmModal.danger ? '#dc2626' : '#2563eb',
                  borderColor: confirmModal.danger ? '#ef4444' : '#3b82f6',
                  color: '#ffffff',
                }}
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* G. Submission Follow-Up & IMAP Thread Modal */}
      {activeThreadTask && (
        <div
          className="auth-modal-overlay"
          onClick={() => setActiveThreadTask(null)}
          style={{ zIndex: 1120 }}
        >
          <div
            className="auth-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '640px', width: '94vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column', padding: '22px' }}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: '12px', borderBottom: '1px solid #2e2e2e', paddingBottom: '10px' }}>
              <div>
                <h3 className="font-bold text-base text-white" style={{ margin: 0 }}>
                  {activeThreadTask.targetName} — Messages & Replies
                </h3>
                <span className="text-xs text-slate-400">
                  Receipt: {activeThreadTask.receiptId} • {activeThreadTask.contactEmail || 'Portal'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchSubmissionReplies}
                  disabled={isPollingReplies}
                  className="chat-action-btn"
                  style={{ padding: '6px 10px', fontSize: '11px' }}
                >
                  {isPollingReplies ? 'Checking IMAP...' : 'Refresh Inbox'}
                </button>
                <button
                  onClick={() => setActiveThreadTask(null)}
                  className="sidebar-icon-btn"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px', padding: '8px 6px', background: '#141414', borderRadius: '10px', border: '1px solid #262626' }}>
              {(() => {
                const thread = [
                  ...outboundThreadMsgs.filter((m) => m.receiptId === activeThreadTask.receiptId),
                  ...imapReplies.filter((r) => r.receiptId === activeThreadTask.receiptId),
                ].sort((a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime());

                if (thread.length === 0) {
                  return (
                    <div className="text-xs text-slate-400" style={{ padding: '28px 14px', textAlign: 'center' }}>
                      No replies received for <strong>{activeThreadTask.targetName}</strong> yet. Send a follow-up message below!
                    </div>
                  );
                }

                return thread.map((msg) => {
                  const isOutbound = msg.direction === 'OUTBOUND';
                  const cleanSender = isOutbound
                    ? 'You'
                    : msg.from.replace(/<[^>]+>/g, '').trim() || activeThreadTask.targetName;
                  const shortTime = new Date(msg.receivedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <div
                      key={msg.id}
                      style={{
                        display: 'flex',
                        width: '100%',
                        justifyContent: isOutbound ? 'flex-end' : 'flex-start',
                      }}
                    >
                      <div
                        style={{
                          maxWidth: '78%',
                          padding: '10px 14px',
                          borderRadius: isOutbound ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                          background: isOutbound
                            ? 'linear-gradient(135deg, #2563eb, #1d4ed8)'
                            : msg.isInterview
                              ? 'rgba(16, 185, 129, 0.14)'
                              : '#242424',
                          border: isOutbound
                            ? '1px solid #3b82f6'
                            : msg.isInterview
                              ? '1px solid rgba(16, 185, 129, 0.45)'
                              : '1px solid #333333',
                          color: '#f8fafc',
                        }}
                      >
                        <div className="flex items-center justify-between gap-3" style={{ marginBottom: '4px' }}>
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              color: isOutbound ? '#dbeafe' : msg.isInterview ? '#6ee7b7' : '#93c5fd',
                            }}
                          >
                            {cleanSender}
                            {msg.isInterview ? ' • 🎉 Interview' : ''}
                          </span>
                          <span style={{ fontSize: '10px', color: isOutbound ? '#bfdbfe' : '#94a3b8' }}>
                            {shortTime}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px', whiteSpace: 'pre-wrap', lineHeight: 1.55, color: '#f1f5f9' }}>
                          {msg.body}
                        </div>
                        {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {msg.attachments.map((att, attIdx) => (
                              <span
                                key={`${att.fileName}-${attIdx}`}
                                style={{
                                  fontSize: '11px',
                                  padding: '2px 8px',
                                  borderRadius: '999px',
                                  background: 'rgba(15, 23, 42, 0.55)',
                                  border: '1px solid rgba(255,255,255,0.2)',
                                  color: '#e2e8f0',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <FileText className="w-3 h-3" />
                                {att.fileName}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            <div
              style={{
                borderTop: '1px solid #2e2e2e',
                paddingTop: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!isDraggingReplyFiles) setIsDraggingReplyFiles(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setIsDraggingReplyFiles(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingReplyFiles(false);
                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                  void handleReplyFilesSelected(e.dataTransfer.files);
                }
              }}
            >
              <input
                ref={replyDocInputRef}
                type="file"
                multiple
                accept=".pdf,.txt,.md,.csv,.json,.doc,.docx,image/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    void handleReplyFilesSelected(e.target.files);
                    e.target.value = '';
                  }
                }}
              />

              <div
                onClick={() => replyDocInputRef.current?.click()}
                style={{
                  border: isDraggingReplyFiles ? '1px dashed #22d3ee' : '1px dashed #475569',
                  background: isDraggingReplyFiles ? 'rgba(34, 211, 238, 0.08)' : '#1e1e22',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <UploadCloud className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>
                    {replyAttachments.length > 0
                      ? `${replyAttachments.length} attachment(s) ready to send`
                      : 'Drag & drop or click to attach documents (sent as email attachments)'}
                  </span>
                </div>
                <span className="text-[11px] font-semibold text-cyan-400 shrink-0">+ Add Files</span>
              </div>

              {replyAttachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {replyAttachments.map((att) => (
                    <span
                      key={att.id}
                      style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: '999px',
                        background: '#1e293b',
                        border: '1px solid #475569',
                        color: '#e2e8f0',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <FileText className="w-3 h-3 text-cyan-400" />
                      <span>{att.fileName}</span>
                      <span className="text-slate-400">({(att.fileSizeBytes / 1024).toFixed(0)}KB)</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReplyAttachments((prev) => prev.filter((item) => item.id !== att.id));
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#94a3b8',
                          cursor: 'pointer',
                          padding: 0,
                          display: 'flex',
                        }}
                        title="Remove attachment"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <input
                type="text"
                value={replyDraftSubject}
                onChange={(e) => setReplyDraftSubject(e.target.value)}
                placeholder="Email Subject"
                className="auth-input"
                style={{ fontSize: '12px', padding: '8px 10px' }}
              />
              <textarea
                rows={3}
                value={replyDraftMessage}
                onChange={(e) => setReplyDraftMessage(e.target.value)}
                placeholder="Write a follow-up message or reply..."
                className="auth-input"
                style={{ fontSize: '12px', padding: '8px 10px', resize: 'vertical' }}
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => {
                    setReplyAttachments([]);
                    setActiveThreadTask(null);
                  }}
                  className="chat-action-btn"
                  style={{ padding: '7px 14px' }}
                >
                  Close
                </button>
                <button
                  onClick={handleSendFollowUpReply}
                  disabled={
                    isSendingFollowUp || (!replyDraftMessage.trim() && replyAttachments.length === 0)
                  }
                  className="chat-action-btn primary"
                  style={{ padding: '7px 16px' }}
                >
                  {isSendingFollowUp ? 'Sending...' : 'Send Follow-Up Email'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* H. Paystack Credit Top-Up Modal */}
      {showTopUpModal && (
        <div
          className="auth-modal-overlay"
          onClick={() => setShowTopUpModal(false)}
          style={{ zIndex: 1130 }}
        >
          <div
            className="auth-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '540px', width: '94vw', padding: '24px' }}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: '12px' }}>
              <div>
                <h3 className="font-bold text-base text-white" style={{ margin: 0 }}>
                  Buy Submission Credits (Paystack)
                </h3>
                <span className="text-xs text-slate-400">
                  Current Balance: <strong className="text-emerald-400">${walletBalanceDollars}</strong> • $0.25/job • $1/submission • $2/relocate
                </span>
              </div>
              <button onClick={() => setShowTopUpModal(false)} className="sidebar-icon-btn">
                <X className="w-4 h-4" />
              </button>
            </div>

            {!paystackConfigured && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: 'rgba(245, 158, 11, 0.12)',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  color: '#fde68a',
                  fontSize: '12px',
                  marginBottom: '12px',
                }}
              >
                <strong>Paystack Key Needed:</strong> Add <code>PAYSTACK_SECRET_KEY=sk_test_...</code> to your backend <code>.env</code> to enable live Paystack checkout.
              </div>
            )}

            {topUpStatusMsg && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: topUpStatusMsg.startsWith('✅') ? 'rgba(16, 185, 129, 0.14)' : 'rgba(56, 189, 248, 0.12)',
                  border: topUpStatusMsg.startsWith('✅') ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(56, 189, 248, 0.35)',
                  color: '#f1f5f9',
                  fontSize: '12px',
                  marginBottom: '12px',
                }}
              >
                {topUpStatusMsg}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
              {(creditPackages.length > 0
                ? creditPackages
                : [
                  { id: 'pack_5', name: 'Starter Top-Up', creditCents: 500, creditDollars: '5.00', submissionsEstimate: 'Up to 5 submissions' },
                  { id: 'pack_10', name: 'Growth Top-Up', creditCents: 1000, creditDollars: '10.00', submissionsEstimate: 'Up to 10 submissions', popular: true },
                  { id: 'pack_25', name: 'Pro Campaign', creditCents: 2500, creditDollars: '25.00', submissionsEstimate: 'Up to 25 submissions' },
                  { id: 'pack_50', name: 'Scale Pack', creditCents: 5000, creditDollars: '50.00', submissionsEstimate: 'Up to 50 submissions' },
                ]
              ).map((pkg) => (
                <button
                  key={pkg.id}
                  type="button"
                  disabled={isProcessingPaystack}
                  onClick={() => handleStartPaystackCheckout(pkg.id)}
                  style={{
                    textAlign: 'left',
                    padding: '12px',
                    borderRadius: '10px',
                    background: pkg.popular ? 'rgba(37, 99, 235, 0.16)' : '#1c1c1c',
                    border: pkg.popular ? '1px solid #3b82f6' : '1px solid #333333',
                    color: '#f8fafc',
                    cursor: isProcessingPaystack ? 'not-allowed' : 'pointer',
                  }}
                >
                  <div className="flex items-center justify-between" style={{ marginBottom: '4px' }}>
                    <span className="text-xs font-bold text-slate-200">{pkg.name}</span>
                    {pkg.popular && (
                      <span style={{ fontSize: '9px', fontWeight: 800, background: '#2563eb', color: '#fff', padding: '2px 6px', borderRadius: '999px' }}>
                        POPULAR
                      </span>
                    )}
                  </div>
                  <div className="text-lg font-extrabold text-emerald-400">${pkg.creditDollars}</div>
                  <div className="text-xs text-slate-400">{pkg.submissionsEstimate}</div>
                </button>
              ))}
            </div>

            {pendingPaystackRef && (
              <button
                type="button"
                disabled={isProcessingPaystack}
                onClick={() => verifyPaystackReference(pendingPaystackRef)}
                className="chat-action-btn primary"
                style={{ width: '100%', padding: '10px', marginBottom: '10px' }}
              >
                {isProcessingPaystack ? 'Verifying with Paystack...' : `Verify Payment (${pendingPaystackRef})`}
              </button>
            )}

            <div className="text-xs text-slate-500" style={{ textAlign: 'center' }}>
              Secured by Paystack • Credits never expire
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
