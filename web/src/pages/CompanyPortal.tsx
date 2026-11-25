import React, { useEffect, useState } from 'react';
import {
  Building2,
  Briefcase,
  Users,
  CalendarDays,
  Settings,
  LogOut,
  Plus,
  Search,
  Sparkles,
  Copy,
  ExternalLink,
  ArrowLeft,
  ShieldCheck,
  DollarSign,
  Send,
  FileText,
  UserPlus,
  Menu,
  X,
  Trash2,
} from 'lucide-react';
import { NexoraLogo } from '../components/NexoraLogo';
import { NotificationsBell } from '../components/NotificationsBell';

interface CompanyPortalProps {
  pathname: string;
  onNavigate: (to: string) => void;
}

const API_BASE =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL || '';

function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  return fetch(url, init);
}

function resolveApiUrl(url?: string): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_BASE}${url}`;
}

const CATEGORIES = [
  { value: 'HIRING_COMPANY', label: 'Employer / Hiring Company (Job Agent)' },
  { value: 'RELOCATION_AGENCY', label: 'Relocation & Immigration Agency (Immigration Agent)' },
  { value: 'INVESTMENT_PROVIDER', label: 'Investment Opportunity Provider (Investment Agent)' },
  { value: 'SCHOLARSHIP_PROVIDER', label: 'Scholarship / Educational Institution (Scholarship Agent)' },
];

const PIPELINE_STAGES = [
  'RECEIVED',
  'SCREENING',
  'SHORTLISTED',
  'INTERVIEW_SCHEDULED',
  'INTERVIEWED',
  'OFFER_MADE',
  'HIRED',
  'REJECTED',
  'WITHDRAWN',
];

const SESSION_KEY = 'nexora_company_org_session_v1';

export const CompanyPortal: React.FC<CompanyPortalProps> = ({ pathname, onNavigate }) => {
  const isAgentRoute = pathname.startsWith('/agent');
  const prefix = isAgentRoute ? '/agent' : '/company';

  const [org, setOrg] = useState<any>(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [authMode, setAuthMode] = useState<'login' | 'register'>(
    pathname.includes('register') ? 'register' : 'login',
  );
  const [authForm, setAuthForm] = useState({
    registeredName: '',
    category: isAgentRoute ? 'RECRUITMENT_AGENCY' : 'HIRING_COMPANY',
    country: 'South Africa',
    businessAddress: '',
    website: '',
    contactFullName: '',
    contactPosition: 'HR Manager',
    telephone: '',
    businessEmail: '',
    password: '',
    recruitmentEmail: '',
    interviewEmail: '',
    billingEmail: '',
    verificationDocName: '',
    description: '',
  });
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  const [dashboardData, setDashboardData] = useState<any>(null);
  const [vacancies, setVacancies] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [candidates, setCandidates] = useState<any[]>([]);
  const [interviews, setInterviews] = useState<any[]>([]);
  const [placements, setPlacements] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [teamUsers, setTeamUsers] = useState<any[]>([]);
  const [scoringBusy, setScoringBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [showVacancyModal, setShowVacancyModal] = useState(false);
  const [vacancyForm, setVacancyForm] = useState({
    id: '',
    title: '',
    category: 'EMPLOYMENT',
    location: 'Johannesburg, South Africa',
    workArrangement: 'HYBRID',
    vacancyType: 'FULL_TIME',
    salaryRange: '',
    monthlyOfferUsd: '3500',
    minYearsExperience: '2',
    requiredSkills: '',
    description: '',
    requirements: '',
    requiresAssessment: false,
    visaType: '',
    targetCountry: '',
    processingTime: '',
    requiredDocuments: 'Valid Passport (>6 months), Police Clearance, Medical Certificate, Proof of Funds, Qualifications / CV',
    institutionName: '',
    degreeLevel: 'Undergraduate / Masters',
    fundingCoverage: 'Full Tuition + Stipend',
    minGpaOrScore: '70%',
    investmentStage: 'Seed / Series A',
    sectorFocus: 'AI, SaaS & Fintech',
    equityTerms: '5% - 15% Equity',
    status: 'PUBLISHED',
  });

  const [candidateQuery, setCandidateQuery] = useState('');
  const [aiAction, setAiAction] = useState<
    'DRAFT_JD' | 'SUMMARISE_CANDIDATE' | 'MATCH_CANDIDATES' | 'DRAFT_MESSAGE'
  >('DRAFT_JD');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiReply, setAiReply] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const [interviewModalApp, setInterviewModalApp] = useState<any>(null);
  const [interviewForm, setInterviewForm] = useState({
    interviewType: 'ONLINE',
    interviewProvider: 'GOOGLE_LIVE' as 'GOOGLE_LIVE' | 'NUANCE' | 'EXTERNAL',
    aiQuestions: '',
    interviewDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    interviewTime: '10:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Johannesburg',
    locationOrLink: '',
    instructions: '',
  });

  const [messageModalApp, setMessageModalApp] = useState<any>(null);
  const [messageForm, setMessageForm] = useState({ subject: '', body: '' });

  const [settingsForm, setSettingsForm] = useState({
    recruitmentEmail: '',
    interviewEmail: '',
    billingEmail: '',
    requireTranscript: false,
    legalEntityArranged: false,
    taxComplianceReady: false,
    verificationToken: '',
  });

  const [placementForm, setPlacementForm] = useState({
    customerId: 'guest-user',
    candidateName: '',
    roleTitle: '',
    contractModel: 'NEXORA_EOR_STAFFING',
    startDate: new Date().toISOString().slice(0, 10),
    hourlyRateDollars: '25',
  });

  const [newUserForm, setNewUserForm] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'RECRUITER',
  });
  const [editingSalaryPlc, setEditingSalaryPlc] = useState<any>(null);
  const [editSalaryInput, setEditSalaryInput] = useState('');
  const [selectedVacancyIds, setSelectedVacancyIds] = useState<string[]>([]);
  const [rescheduleIv, setRescheduleIv] = useState<any>(null);
  const [rescheduleForm, setRescheduleForm] = useState({ interviewDate: '', interviewTime: '', locationOrLink: '' });
  const [matchingVacancy, setMatchingVacancy] = useState<any>(null);
  const [matchingCandidates, setMatchingCandidates] = useState<any[]>([]);
  const [matchingLoading, setMatchingLoading] = useState(false);
  const [viewingMatchedCandidate, setViewingMatchedCandidate] = useState<any>(null);
  const [invitingCandidate, setInvitingCandidate] = useState<any>(null);
  const [inviteForm, setInviteForm] = useState({
    interviewDate: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    interviewTime: '10:00',
    interviewType: 'ONLINE' as 'ONLINE' | 'TELEPHONE' | 'IN_PERSON',
    interviewProvider: 'GOOGLE_LIVE' as 'GOOGLE_LIVE' | 'NUANCE' | 'EXTERNAL',
    aiQuestions: '',
    locationOrLink: '',
    instructions: 'We found your Nexora AI profile a strong match. Accept this invite to auto-apply and confirm your slot.',
  });
  const [inviteBusy, setInviteBusy] = useState(false);
  const [applicationVacancyFilter, setApplicationVacancyFilter] = useState<string>('ALL');
  const [pendingVerifyOrg, setPendingVerifyOrg] = useState<any>(null);
  const [verifyCodeInput, setVerifyCodeInput] = useState('');
  const [verifyBusy, setVerifyBusy] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const activeSection = pathname.includes('/vacancies')
    ? 'vacancies'
    : pathname.includes('/applications')
      ? 'applications'
      : pathname.includes('/interviews')
        ? 'interviews'
        : pathname.includes('/settings')
          ? 'settings'
          : pathname.includes('/billing')
            ? 'billing'
            : pathname.includes('/employees')
              ? 'employees'
              : pathname.includes('/users')
                ? 'users'
                : pathname.includes('/staffing')
                  ? 'staffing'
                  : 'dashboard';

  const loadAll = async (orgId: string) => {
    const [dRes, vRes, aRes, iRes, pRes, invRes, uRes] = await Promise.all([
      apiFetch(`/api/v1/organisations/${orgId}/dashboard`),
      apiFetch(`/api/v1/organisations/${orgId}/vacancies`),
      apiFetch(`/api/v1/organisations/${orgId}/applications`),
      apiFetch(`/api/v1/organisations/${orgId}/interviews`),
      apiFetch(`/api/v1/organisations/${orgId}/placements`),
      apiFetch(`/api/v1/organisations/${orgId}/invoices`),
      apiFetch(`/api/v1/organisations/${orgId}/users`),
    ]);
    const [dJson, vJson, aJson, iJson, pJson, invJson, uJson] = await Promise.all([
      dRes.json().catch(() => null),
      vRes.json().catch(() => null),
      aRes.json().catch(() => null),
      iRes.json().catch(() => null),
      pRes.json().catch(() => null),
      invRes.json().catch(() => null),
      uRes.json().catch(() => null),
    ]);
    if (dJson?.ok) {
      setDashboardData(dJson.data);
      if (dJson.data?.organisation) {
        setOrg(dJson.data.organisation);
        localStorage.setItem(SESSION_KEY, JSON.stringify(dJson.data.organisation));
        setSettingsForm({
          recruitmentEmail: dJson.data.organisation.recruitmentEmail || '',
          interviewEmail: dJson.data.organisation.interviewEmail || '',
          billingEmail: dJson.data.organisation.billingEmail || '',
          requireTranscript: Boolean(dJson.data.organisation.requireTranscript),
          legalEntityArranged: Boolean(dJson.data.organisation.legalEntityArranged),
          taxComplianceReady: Boolean(dJson.data.organisation.taxComplianceReady),
          verificationToken: '',
        });
      }
    }
    if (vJson?.ok) setVacancies(vJson.data || []);
    if (aJson?.ok) setApplications(aJson.data || []);
    if (iJson?.ok) setInterviews(iJson.data || []);
    if (pJson?.ok) setPlacements(pJson.data || []);
    if (invJson?.ok) setInvoices(invJson.data || []);
    if (uJson?.ok) setTeamUsers(uJson.data || []);
  };

  useEffect(() => {
    if (org?.id) {
      loadAll(org.id);
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('reference') || params.get('trxref');
      const invId = params.get('invoiceId');
      const isBulk = params.get('bulkInvoices') === '1';
      if (ref && isBulk) {
        apiFetch(`/api/v1/organisations/${org.id}/invoices/paystack/verify-all/${encodeURIComponent(ref)}`)
          .then((r) => r.json())
          .then((j) => {
            if (j?.ok) {
              showToast(`Paid ${j.data?.paidCount || ''} invoice(s) and updated next due dates (+28 days)!`);
              loadAll(org.id);
              window.history.replaceState({}, '', window.location.pathname);
            }
          })
          .catch(() => undefined);
      } else if (ref && invId) {
        apiFetch(`/api/v1/organisations/${org.id}/invoices/${invId}/paystack/verify/${encodeURIComponent(ref)}`)
          .then((r) => r.json())
          .then((j) => {
            if (j?.ok) {
              showToast('Invoice paid and next due date updated (+28 days)!');
              loadAll(org.id);
              window.history.replaceState({}, '', window.location.pathname);
            }
          })
          .catch(() => undefined);
      }
    }
  }, [org?.id]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthBusy(true);
    try {
      const endpoint =
        authMode === 'register' ? '/api/v1/organisations/register' : '/api/v1/organisations/login';
      const payload =
        authMode === 'register'
          ? {
            registeredName: authForm.registeredName,
            country: authForm.country || 'South Africa',
            businessAddress: authForm.businessAddress || `${authForm.country || 'South Africa'} HQ`,
            website: authForm.website || undefined,
            description:
              authForm.description || `${authForm.registeredName} official opportunity portal.`,
            category: authForm.category,
            contactFullName: authForm.contactFullName || 'Admin Contact',
            contactPosition: authForm.contactPosition || 'Hiring Manager',
            businessEmail: authForm.businessEmail,
            password: authForm.password,
            telephone: authForm.telephone || '+27000000000',
            recruitmentEmail: authForm.recruitmentEmail || authForm.businessEmail,
            interviewEmail: authForm.interviewEmail || undefined,
            billingEmail: authForm.billingEmail || undefined,
            verificationDocs: authForm.verificationDocName
              ? [{ fileName: authForm.verificationDocName }]
              : [],
          }
          : {
            businessEmail: authForm.businessEmail,
            password: authForm.password,
          };

      if (authMode === 'register') {
        const rawWebsite = authForm.website.trim();
        if (!rawWebsite) {
          setAuthError('Company website URL is required.');
          return;
        }
        let websiteHost = '';
        try {
          const normalized = /^https?:\/\//i.test(rawWebsite) ? rawWebsite : `https://${rawWebsite}`;
          websiteHost = new URL(normalized).hostname.toLowerCase().replace(/^www\./, '');
        } catch {
          setAuthError('Please enter a valid company website URL (e.g. https://yourcompany.com).');
          return;
        }
        const emailDomain = (authForm.businessEmail.trim().toLowerCase().split('@')[1] || '').toLowerCase();
        if (
          !websiteHost ||
          !emailDomain ||
          (emailDomain !== websiteHost &&
            !emailDomain.endsWith(`.${websiteHost}`) &&
            !websiteHost.endsWith(`.${emailDomain}`))
        ) {
          setAuthError(`Work Email domain (@${emailDomain}) must match your Company Website domain (${websiteHost}).`);
          return;
        }
      }

      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setAuthError(json?.error || json?.message || 'Authentication failed.');
        return;
      }
      const orgRecord = json.data?.organisation || json.data;
      if (orgRecord && orgRecord.emailVerified === false) {
        setPendingVerifyOrg(orgRecord);
        setVerifyCodeInput('');
        showToast(`Verification code sent to ${orgRecord.businessEmail}`);
        return;
      }
      setOrg(orgRecord);
      localStorage.setItem(SESSION_KEY, JSON.stringify(orgRecord));
      if (authMode === 'register') {
        showToast('Welcome to Nexora AI! Publish vacancies, score CVs with AI, and pay 10% monthly only on accepted candidates.');
      }
      onNavigate(`${prefix}/dashboard`);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSaveVacancy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org?.id) return;
    const payload = {
      title: vacancyForm.title,
      category: vacancyForm.category,
      vacancyType: vacancyForm.vacancyType,
      workArrangement: vacancyForm.workArrangement,
      location: vacancyForm.location || 'Remote',
      salaryRange: vacancyForm.salaryRange || undefined,
      monthlyOfferUsd: Number(vacancyForm.monthlyOfferUsd) || 0,
      description: vacancyForm.description,
      requirements: vacancyForm.requirements || 'Relevant experience and skills.',
      minYearsExperience: Number(vacancyForm.minYearsExperience) || 0,
      requiredSkills: vacancyForm.requiredSkills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      requiresAssessment: Boolean(vacancyForm.requiresAssessment),
      ...(vacancyForm.category === 'RELOCATION' ||
      vacancyForm.category === 'SCHOLARSHIP' ||
      vacancyForm.category === 'INVESTMENT'
        ? {
            requiredDocuments: vacancyForm.requiredDocuments
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          }
        : {}),
      ...(vacancyForm.category === 'RELOCATION'
        ? {
            visaType: vacancyForm.visaType || undefined,
            targetCountry: vacancyForm.targetCountry || undefined,
            processingTime: vacancyForm.processingTime || undefined,
          }
        : {}),
      ...(vacancyForm.category === 'SCHOLARSHIP'
        ? {
            institutionName: vacancyForm.institutionName || undefined,
            degreeLevel: vacancyForm.degreeLevel || undefined,
            fundingCoverage: vacancyForm.fundingCoverage || undefined,
            minGpaOrScore: vacancyForm.minGpaOrScore || undefined,
          }
        : {}),
      ...(vacancyForm.category === 'INVESTMENT'
        ? {
            investmentStage: vacancyForm.investmentStage || undefined,
            sectorFocus: vacancyForm.sectorFocus || undefined,
            equityTerms: vacancyForm.equityTerms || undefined,
          }
        : {}),
      status: vacancyForm.status,
    };
    const url = vacancyForm.id
      ? `/api/v1/organisations/${org.id}/vacancies/${vacancyForm.id}`
      : `/api/v1/organisations/${org.id}/vacancies`;
    const res = await apiFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => null);
    if (json?.ok) {
      setShowVacancyModal(false);
      showToast(vacancyForm.id ? 'Vacancy updated.' : 'Vacancy published.');
      loadAll(org.id);
    } else {
      showToast(json?.error || json?.message || 'Could not save vacancy.');
    }
  };

  const handleStatusChange = async (applicationId: string, status: string) => {
    if (!org?.id) return;
    const res = await apiFetch(
      `/api/v1/organisations/${org.id}/applications/${applicationId}/status`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      },
    );
    const json = await res.json().catch(() => null);
    if (json?.ok) {
      showToast(`Application moved to ${status.replace(/_/g, ' ')}.`);
      loadAll(org.id);
    } else {
      showToast(json?.error || 'Could not update application status.');
      loadAll(org.id);
    }
  };

  const handleSearchCandidates = async () => {
    if (!org?.id) return;
    const res = await apiFetch(
      `/api/v1/organisations/${org.id}/candidates?q=${encodeURIComponent(candidateQuery)}`,
    );
    const json = await res.json().catch(() => null);
    if (json?.ok) setCandidates(json.data || []);
    else showToast(json?.error || 'Search failed.');
  };

  const handleScheduleInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org?.id || !interviewModalApp) return;
    const res = await apiFetch(`/api/v1/organisations/${org.id}/interviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        applicationId: interviewModalApp.id,
        vacancyId: interviewModalApp.vacancyId,
        userUid: interviewModalApp.userUid || interviewModalApp.customerId || 'candidate',
        jobTitle: interviewModalApp.vacancyTitle || 'Opportunity',
        candidateName: interviewModalApp.candidateName,
        candidateEmail: interviewModalApp.candidateEmail,
        interviewDate: interviewForm.interviewDate,
        interviewTime: interviewForm.interviewTime,
        timezone: interviewForm.timezone || 'Africa/Johannesburg',
        interviewType: interviewForm.interviewType,
        interviewProvider: interviewForm.interviewType === 'ONLINE' ? interviewForm.interviewProvider : 'EXTERNAL',
        aiQuestions:
          interviewForm.interviewType === 'ONLINE' && interviewForm.interviewProvider !== 'EXTERNAL'
            ? interviewForm.aiQuestions.trim()
            : undefined,
        locationOrLink:
          interviewForm.interviewType === 'ONLINE' && interviewForm.interviewProvider !== 'EXTERNAL'
            ? undefined
            : interviewForm.locationOrLink || 'Provided by organisation',
        instructions: interviewForm.instructions || undefined,
      }),
    });
    const json = await res.json().catch(() => null);
    if (json?.ok) {
      setInterviewModalApp(null);
      showToast('Interview scheduled and calendar invite sent.');
      loadAll(org.id);
    } else {
      showToast(json?.error || json?.message || 'Failed to schedule interview.');
    }
  };

  const handleSendCandidateMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org?.id || !messageModalApp) return;
    const res = await apiFetch(
      `/api/v1/organisations/${org.id}/applications/${messageModalApp.id}/message`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(messageForm),
      },
    );
    const json = await res.json().catch(() => null);
    if (json?.ok) {
      setMessageModalApp(null);
      setMessageForm({ subject: '', body: '' });
      showToast('Message sent to candidate.');
    } else {
      showToast(json?.error || 'Failed to send message.');
    }
  };

  const handleAskEmployerAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org?.id || !aiPrompt.trim()) return;
    setAiBusy(true);
    try {
      const res = await apiFetch(`/api/v1/organisations/${org.id}/ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: aiAction, prompt: aiPrompt }),
      });
      const json = await res.json().catch(() => null);
      if (json?.ok) setAiReply(json.data?.text || json.data?.output || json.data?.reply || '');
      else showToast(json?.error || 'AI request failed.');
    } finally {
      setAiBusy(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org?.id) return;
    const res = await apiFetch(`/api/v1/organisations/${org.id}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settingsForm),
    });
    const json = await res.json().catch(() => null);
    if (json?.ok) {
      showToast('Settings saved.');
      loadAll(org.id);
    }
  };

  const handleVerifyEmail = async () => {
    if (!org?.id) return;
    const res = await apiFetch(`/api/v1/organisations/${org.id}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: settingsForm.verificationToken || org.verificationToken,
      }),
    });
    const json = await res.json().catch(() => null);
    if (json?.ok) {
      showToast('Organisation email verified!');
      loadAll(org.id);
    } else {
      showToast(json?.error || 'Verification failed.');
    }
  };

  const handleCreatePlacement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org?.id) return;
    const res = await apiFetch(`/api/v1/organisations/${org.id}/placements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId: placementForm.customerId || 'guest-user',
        candidateName: placementForm.candidateName,
        roleTitle: placementForm.roleTitle,
        contractModel: placementForm.contractModel,
        startDate: placementForm.startDate,
        hourlyRateCents: Math.round((Number(placementForm.hourlyRateDollars) || 0) * 100),
      }),
    });
    const json = await res.json().catch(() => null);
    if (json?.ok) {
      showToast('Staffing contract created.');
      loadAll(org.id);
    } else {
      showToast(json?.error || 'Could not create placement.');
    }
  };

  const handlePayrollRun = async (placementId: string) => {
    if (!org?.id) return;
    const res = await apiFetch(
      `/api/v1/organisations/${org.id}/placements/${placementId}/payroll`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          periodLabel: 'Current Month',
          grossPayCents: 250000,
          deductionsCents: 45000,
        }),
      },
    );
    const json = await res.json().catch(() => null);
    if (json?.ok) {
      showToast('Payroll record processed.');
      loadAll(org.id);
    } else {
      showToast(json?.error || 'Payroll blocked by compliance check.');
    }
  };

  const handleAddTeamUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org?.id) return;
    const res = await apiFetch(`/api/v1/organisations/${org.id}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newUserForm),
    });
    const json = await res.json().catch(() => null);
    if (json?.ok) {
      setNewUserForm({ fullName: '', email: '', password: '', role: 'RECRUITER' });
      showToast(`Added ${json.data.fullName} to your portal team!`);
      loadAll(org.id);
    } else {
      showToast(json?.error || 'Could not add team user.');
    }
  };

  if (!org) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'radial-gradient(circle at top center, #111c38 0%, #090d16 65%)',
          color: '#f8fafc',
          padding: '28px 16px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <div style={{ width: '100%', maxWidth: '580px' }}>
          <div className="flex items-center justify-between mb-6">
            <button
              type="button"
              onClick={() => onNavigate('/app')}
              className="chat-action-btn"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Candidate App</span>
            </button>
            <NexoraLogo size="sm" showSubtitle={false} />
          </div>

          <div className="cp-card" style={{ padding: '26px' }}>
            {pendingVerifyOrg ? (
              <div className="grid gap-4">
                <div>
                  <div className="text-base font-extrabold text-white">Verify Your Work Email</div>
                  <p className="text-xs text-slate-300 mt-1">
                    We sent a 6-digit verification code to <strong className="text-emerald-300">{pendingVerifyOrg.businessEmail}</strong>.
                    Enter the code below to activate <strong>{pendingVerifyOrg.registeredName}</strong>.
                  </p>
                </div>
                {authError && (
                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      background: 'rgba(239,68,68,0.15)',
                      border: '1px solid rgba(239,68,68,0.3)',
                      color: '#fca5a5',
                      fontSize: '13px',
                    }}
                  >
                    {authError}
                  </div>
                )}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setAuthError('');
                    setVerifyBusy(true);
                    try {
                      const res = await apiFetch(`/api/v1/organisations/${pendingVerifyOrg.id}/verify`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token: verifyCodeInput.trim() }),
                      });
                      const json = await res.json().catch(() => null);
                      if (!res.ok || !json?.ok) {
                        setAuthError(json?.error || 'Invalid verification code.');
                        return;
                      }
                      const verifiedOrg = json.data;
                      setPendingVerifyOrg(null);
                      setOrg(verifiedOrg);
                      localStorage.setItem(SESSION_KEY, JSON.stringify(verifiedOrg));
                      showToast('Email verified! Welcome to Nexora AI.');
                      onNavigate(`${prefix}/dashboard`);
                    } finally {
                      setVerifyBusy(false);
                    }
                  }}
                  className="grid gap-3"
                >
                  <input
                    required
                    maxLength={6}
                    placeholder="Enter 6-digit verification code *"
                    value={verifyCodeInput}
                    onChange={(e) => setVerifyCodeInput(e.target.value)}
                    className="auth-input"
                    style={{ textAlign: 'center', fontSize: '18px', letterSpacing: '6px', fontWeight: 700 }}
                  />
                  <button
                    type="submit"
                    disabled={verifyBusy}
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#fff',
                      border: 'none',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {verifyBusy ? 'Verifying...' : 'Verify Code & Enter Dashboard'}
                  </button>
                </form>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <button
                    type="button"
                    onClick={async () => {
                      setAuthError('');
                      const res = await apiFetch(`/api/v1/organisations/${pendingVerifyOrg.id}/resend-verification`, {
                        method: 'POST',
                      });
                      const json = await res.json().catch(() => null);
                      if (json?.ok) {
                        showToast(`New verification code sent to ${pendingVerifyOrg.businessEmail}`);
                      } else {
                        setAuthError(json?.error || 'Could not resend verification code.');
                      }
                    }}
                    className="chat-action-btn"
                  >
                    Resend Code
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingVerifyOrg(null);
                      setAuthError('');
                    }}
                    className="text-slate-400 hover:text-white"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                  >
                    Back to Sign In
                  </button>
                </div>
              </div>
            ) : (
              <>
            <div className="flex gap-2 mb-5">
              <button
                type="button"
                onClick={() => setAuthMode('login')}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '10px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '13.5px',
                  background: authMode === 'login' ? 'linear-gradient(135deg, #4f46e5, #6366f1)' : '#1e293b',
                  color: '#fff',
                }}
              >
                {isAgentRoute ? 'Agent Sign In' : 'Company / Team Sign In'}
              </button>
              <button
                type="button"
                onClick={() => setAuthMode('register')}
                style={{
                  flex: 1,
                  padding: '10px',
                  borderRadius: '10px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 700,
                  fontSize: '13.5px',
                  background: authMode === 'register' ? 'linear-gradient(135deg, #4f46e5, #6366f1)' : '#1e293b',
                  color: '#fff',
                }}
              >
                Register Organisation
              </button>
            </div>

            {authError && (
              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px',
                  background: 'rgba(239,68,68,0.15)',
                  border: '1px solid rgba(239,68,68,0.3)',
                  color: '#fca5a5',
                  fontSize: '13px',
                  marginBottom: '12px',
                }}
              >
                {authError}
              </div>
            )}

            <form onSubmit={handleAuth} className="grid gap-3">
              {authMode === 'register' && (
                <>
                  <input
                    required
                    placeholder="Registered Organisation Name *"
                    value={authForm.registeredName}
                    onChange={(e) => setAuthForm({ ...authForm, registeredName: e.target.value })}
                    className="auth-input"
                  />
                  <select
                    value={authForm.category}
                    onChange={(e) => setAuthForm({ ...authForm, category: e.target.value })}
                    className="auth-input"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      required
                      placeholder="Country *"
                      value={authForm.country}
                      onChange={(e) => setAuthForm({ ...authForm, country: e.target.value })}
                      className="auth-input"
                    />
                    <input
                      required
                      placeholder="Business Address *"
                      value={authForm.businessAddress}
                      onChange={(e) => setAuthForm({ ...authForm, businessAddress: e.target.value })}
                      className="auth-input"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      required
                      placeholder="Contact Full Name *"
                      value={authForm.contactFullName}
                      onChange={(e) => setAuthForm({ ...authForm, contactFullName: e.target.value })}
                      className="auth-input"
                    />
                    <input
                      required
                      placeholder="Telephone *"
                      value={authForm.telephone}
                      onChange={(e) => setAuthForm({ ...authForm, telephone: e.target.value })}
                      className="auth-input"
                    />
                  </div>
                  <input
                    required
                    placeholder="Company Website URL * (e.g. https://yourcompany.com)"
                    value={authForm.website}
                    onChange={(e) => setAuthForm({ ...authForm, website: e.target.value })}
                    className="auth-input"
                  />
                  <div className="text-[11px] text-slate-400 -mt-1">
                    Your Work Email domain must match your Company Website domain (e.g. hr@yourcompany.com). A verification code will be sent to this email.
                  </div>
                  <input
                    required
                    type="email"
                    placeholder="Official Application Receiving Email *"
                    value={authForm.recruitmentEmail}
                    onChange={(e) => setAuthForm({ ...authForm, recruitmentEmail: e.target.value })}
                    className="auth-input"
                  />
                  <textarea
                    required
                    rows={2}
                    placeholder="Short Organisation Description *"
                    value={authForm.description}
                    onChange={(e) => setAuthForm({ ...authForm, description: e.target.value })}
                    className="auth-input"
                  />
                  <input
                    placeholder="Verification Document Reference (e.g. CIPC Reg PDF)"
                    value={authForm.verificationDocName}
                    onChange={(e) =>
                      setAuthForm({ ...authForm, verificationDocName: e.target.value })
                    }
                    className="auth-input"
                  />
                  <div
                    style={{
                      padding: '12px 14px',
                      borderRadius: '10px',
                      background: 'rgba(99,102,241,0.1)',
                      border: '1px solid rgba(99,102,241,0.28)',
                      fontSize: '12px',
                      color: '#cbd5e1',
                    }}
                  >
                    <div className="font-bold text-indigo-300 mb-1">What to Expect After Registration:</div>
                    <ul style={{ margin: 0, paddingLeft: '18px', lineHeight: 1.6 }}>
                      <li>Nexora handles all recruiting: AI CV scoring (0–100%), candidate matching, and verified Assessment Transcripts.</li>
                      <li>You handle final hiring &amp; staffing: set your Max Monthly Budget (CTC USD) on each role.</li>
                      <li>Zero extra cost above your budget: 90% goes to the accepted candidate and 10% goes to Nexora (invoiced monthly via Paystack).</li>
                      <li>Schedule Online, Telephone, or In-Person interviews with automatic .ics &amp; Google Calendar invites.</li>
                    </ul>
                  </div>
                </>
              )}
              <input
                required
                type="email"
                placeholder="Work Email *"
                value={authForm.businessEmail}
                onChange={(e) => setAuthForm({ ...authForm, businessEmail: e.target.value })}
                className="auth-input"
              />
              <input
                required
                type="password"
                placeholder="Password (min 6 chars) *"
                value={authForm.password}
                onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                className="auth-input"
              />
              <button
                type="submit"
                disabled={authBusy}
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #4f46e5, #6366f1)',
                  color: '#fff',
                  border: 'none',
                  fontWeight: 700,
                  cursor: 'pointer',
                  marginTop: '4px',
                }}
              >
                {authBusy
                  ? 'Please wait...'
                  : authMode === 'register'
                    ? 'Create Organisation Account'
                    : 'Sign In to Portal'}
              </button>
            </form>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const stats = dashboardData?.stats || {};
  const orgMode: 'JOB' | 'IMMIGRATION' | 'SCHOLARSHIP' | 'INVESTMENT' =
    org.category === 'RELOCATION_AGENCY' || org.category === 'IMMIGRATION_CONSULTANCY'
      ? 'IMMIGRATION'
      : org.category === 'SCHOLARSHIP_PROVIDER' || org.category === 'EDUCATIONAL_INSTITUTION'
        ? 'SCHOLARSHIP'
        : org.category === 'INVESTMENT_PROVIDER'
          ? 'INVESTMENT'
          : 'JOB';
  const isImmigrationOrg = orgMode === 'IMMIGRATION';
  const isScholarshipOrg = orgMode === 'SCHOLARSHIP';
  const isInvestmentOrg = orgMode === 'INVESTMENT';

  const navItems = [
    { key: 'dashboard', label: 'Overview', icon: Building2, path: `${prefix}/dashboard` },
    {
      key: 'vacancies',
      label: isImmigrationOrg
        ? 'Visa Programs'
        : isScholarshipOrg
          ? 'Scholarships'
          : isInvestmentOrg
            ? 'Investment Mandates'
            : 'Vacancies',
      icon: Briefcase,
      path: `${prefix}/vacancies`,
      badge: vacancies.length,
    },
    {
      key: 'applications',
      label: isImmigrationOrg
        ? 'Visa Applications'
        : isScholarshipOrg
          ? 'Applicants'
          : isInvestmentOrg
            ? 'Startup Pitches'
            : 'Applications',
      icon: FileText,
      path: `${prefix}/applications`,
      badge: applications.length,
    },
    {
      key: 'interviews',
      label: isImmigrationOrg
        ? 'Consultations'
        : isScholarshipOrg
          ? 'Admissions Interviews'
          : isInvestmentOrg
            ? 'Pitch Meetings'
            : 'Interviews',
      icon: CalendarDays,
      path: `${prefix}/interviews`,
      badge: interviews.length,
    },
    {
      key: 'employees',
      label: isImmigrationOrg
        ? 'Active Visa Cases'
        : isScholarshipOrg
          ? 'Scholars & Awardees'
          : isInvestmentOrg
            ? 'Funded Portfolio'
            : 'Employees',
      icon: Users,
      path: `${prefix}/employees`,
      badge: placements.length,
    },
    {
      key: 'billing',
      label: 'Invoice',
      icon: DollarSign,
      path: `${prefix}/billing`,
      badge: invoices.filter((i) => i.status === 'PENDING').length,
    },
    ...(orgMode === 'JOB'
      ? [{ key: 'staffing', label: 'Staffing & Payroll', icon: ShieldCheck, path: `${prefix}/staffing` }]
      : []),
    { key: 'users', label: 'Team Users', icon: UserPlus, path: `${prefix}/users`, badge: teamUsers.length },
    { key: 'settings', label: 'Settings', icon: Settings, path: `${prefix}/settings` },
  ];

  const activeNav = navItems.find((n) => n.key === activeSection) || navItems[0];

  return (
    <div className="cp-shell">
      {/* Left Sidebar */}
      <aside className={`cp-sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div>
          <div className="flex items-center justify-between mb-5 px-2">
            <NexoraLogo size="sm" showSubtitle={false} />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="cp-mobile-menu-btn sidebar-icon-btn"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              marginBottom: '16px',
            }}
          >
            <div className="text-xs font-bold text-white flex items-center justify-between gap-1">
              <span>{org.registeredName}</span>
              {org.emailVerified && (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                  Verified
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {org.category?.replace(/_/g, ' ')}
            </div>
          </div>

          <nav className="flex flex-col gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeSection === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    onNavigate(item.path);
                    setMobileMenuOpen(false);
                  }}
                  className={`cp-nav-btn ${active ? 'active' : ''}`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      style={{
                        fontSize: '10.5px',
                        fontWeight: 700,
                        padding: '1px 7px',
                        borderRadius: '999px',
                        background: active ? 'rgba(255,255,255,0.2)' : 'rgba(99,102,241,0.2)',
                        color: active ? '#fff' : '#a5b4fc',
                      }}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col gap-2 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem(SESSION_KEY);
              setOrg(null);
              onNavigate(`${prefix}/login`);
            }}
            className="cp-nav-btn text-red-300"
          >
            <span className="flex items-center gap-2">
              <LogOut className="w-4 h-4" />
              <span>Sign Out</span>
            </span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="cp-main">
        <header className="cp-topbar">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="cp-mobile-menu-btn sidebar-icon-btn"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div>
              <div className="text-base font-bold text-white">{activeNav.label}</div>
              <div className="text-[11px] text-slate-400">{org.businessEmail}</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <NotificationsBell organisationId={org.id} apiFetch={apiFetch} />
            <button
              type="button"
              onClick={() => {
                setVacancyForm({
                  id: '',
                  title: '',
                  category: isImmigrationOrg
                    ? 'RELOCATION'
                    : isScholarshipOrg
                      ? 'SCHOLARSHIP'
                      : isInvestmentOrg
                        ? 'INVESTMENT'
                        : 'EMPLOYMENT',
                  location: isImmigrationOrg
                    ? 'United Kingdom / Canada / Global'
                    : isScholarshipOrg
                      ? 'Global / Campus'
                      : isInvestmentOrg
                        ? 'Remote / Africa & Global'
                        : 'Johannesburg, South Africa',
                  workArrangement: 'HYBRID',
                  vacancyType: 'FULL_TIME',
                  salaryRange: '',
                  monthlyOfferUsd: isImmigrationOrg ? '2000' : isScholarshipOrg ? '15000' : isInvestmentOrg ? '50000' : '3500',
                  minYearsExperience: '2',
                  requiredSkills: '',
                  description: '',
                  requirements: '',
                  requiresAssessment: false,
                  visaType: isImmigrationOrg ? 'Skilled Worker / Critical Skills Visa' : '',
                  targetCountry: isImmigrationOrg ? 'United Kingdom' : '',
                  processingTime: isImmigrationOrg ? '4–8 weeks' : '',
                  requiredDocuments: isImmigrationOrg
                    ? 'Valid Passport (>6 months), Police Clearance, Medical Certificate, Proof of Funds, Qualifications / CV'
                    : isScholarshipOrg
                      ? 'Academic Transcript, Recommendation Letters, Statement of Purpose, Valid Passport/ID, Language Test'
                      : isInvestmentOrg
                        ? 'Pitch Deck, Financial Model, Cap Table, Company Registration, Traction Metrics'
                        : 'Valid Passport (>6 months), Police Clearance, Medical Certificate, Proof of Funds, Qualifications / CV',
                  institutionName: isScholarshipOrg ? org.registeredName : '',
                  degreeLevel: 'Masters / Undergraduate',
                  fundingCoverage: 'Full Tuition + Stipend',
                  minGpaOrScore: '70%',
                  investmentStage: 'Seed / Series A',
                  sectorFocus: 'AI, SaaS & Fintech',
                  equityTerms: '5% - 15% Equity',
                  status: 'PUBLISHED',
                });
                setShowVacancyModal(true);
              }}
              className="chat-action-btn primary"
            >
              <Plus className="w-4 h-4" />
              <span>
                {isImmigrationOrg
                  ? 'Publish Visa Program'
                  : isScholarshipOrg
                    ? 'Publish Scholarship'
                    : isInvestmentOrg
                      ? 'Publish Mandate'
                      : 'Publish Vacancy'}
              </span>
            </button>
          </div>
        </header>

        {toast && (
          <div
            style={{
              position: 'fixed',
              bottom: '20px',
              right: '20px',
              background: '#1e293b',
              border: '1px solid rgba(99,102,241,0.55)',
              color: '#fff',
              padding: '12px 16px',
              borderRadius: '10px',
              zIndex: 100,
              fontSize: '13px',
              boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            }}
          >
            {toast}
          </div>
        )}

        <main className="cp-content">
          {activeSection === 'dashboard' && (() => {
            const totalApps = applications.length;
            const submittedCount = applications.filter((a) => a.status === 'SUBMITTED').length;
            const reviewCount = applications.filter((a) => a.status === 'UNDER_REVIEW').length;
            const shortlistedCount = applications.filter((a) => a.status === 'SHORTLISTED').length;
            const interviewStatusCount = applications.filter((a) => a.status === 'INTERVIEW_SCHEDULED').length;
            const hiredCount = applications.filter((a) => a.status === 'HIRED').length;
            const rejectedCount = applications.filter((a) => a.status === 'REJECTED').length;

            const scoredApps = applications.filter((a) => typeof a.aiMatchScore === 'number');
            const avgAiScore =
              scoredApps.length > 0
                ? Math.round(scoredApps.reduce((s, a) => s + Number(a.aiMatchScore || 0), 0) / scoredApps.length)
                : 0;

            const totalMonthlyCtc = placements.reduce((s, p) => s + (p.monthlySalaryCents || 0) / 100, 0);
            const totalEmployeeNet = totalMonthlyCtc * 0.9;
            const totalNexoraFee = totalMonthlyCtc * 0.1;

            const pendingInvoices = invoices.filter((i) => i.status !== 'PAID');
            const paidInvoices = invoices.filter((i) => i.status === 'PAID');
            const pendingDueUsd = pendingInvoices.reduce((s, i) => s + Number(i.feeAmountUsd || 0), 0);
            const paidTotalUsd = paidInvoices.reduce((s, i) => s + Number(i.feeAmountUsd || 0), 0);

            const publishedVacancies = vacancies.filter((v) => v.status === 'PUBLISHED').length;
            const conversionRate = totalApps > 0 ? Math.round(((shortlistedCount + interviewStatusCount + hiredCount) / totalApps) * 100) : 0;

            const labels = isImmigrationOrg
              ? {
                  vacanciesLabel: 'Active Visa Programs',
                  appsLabel: 'Visa Applications',
                  conversionLabel: 'Eligibility & Consultations',
                  hiredLabel: 'Active Visa Cases',
                  dueLabel: 'Service Fees Due (28d)',
                  pipelineTitle: 'Visa Case & Application Pipeline',
                  pipelineSub: 'Client volume across visa processing stages',
                  pieTitle: 'Visa Application Status Pie Chart',
                  pieCenter: 'Clients',
                  splitTitle: 'Visa Service Fee Breakdown (90% / 10%)',
                  splitSub: '90% Agency Retainer • 10% Nexora Commission on Case Acceptance',
                  splitBudgetLabel: 'Total Visa Service Fees',
                  splitMainLabel: 'Agency Payout (90%)',
                  topTitle: 'Top Visa Programs & Consultations',
                  topSub: 'Corridor demand & next scheduled consultations',
                  stageLabels: ['New Case', 'Screening', 'Eligible', 'Consult', 'Accepted', 'Declined'],
                }
              : isScholarshipOrg
                ? {
                    vacanciesLabel: 'Active Scholarships',
                    appsLabel: 'Student Applicants',
                    conversionLabel: 'Admissions Conversion',
                    hiredLabel: 'Awarded Scholars',
                    dueLabel: 'Admin Fees Due (28d)',
                    pipelineTitle: 'Admissions & Award Pipeline',
                    pipelineSub: 'Applicant volume across scholarship review stages',
                    pieTitle: 'Scholarship Applicant Pie Chart',
                    pieCenter: 'Students',
                    splitTitle: 'Scholarship Grant & Fee Split (90% / 10%)',
                    splitSub: '90% Scholar Award / Tuition • 10% Nexora Platform Fee',
                    splitBudgetLabel: 'Total Grant Commitments',
                    splitMainLabel: 'Scholar Awards (90%)',
                    topTitle: 'Top Scholarships & Admissions Interviews',
                    topSub: 'Program demand & upcoming admissions interviews',
                    stageLabels: ['Applied', 'Academic Check', 'Shortlisted', 'Interview', 'Awarded', 'Declined'],
                  }
                : isInvestmentOrg
                  ? {
                      vacanciesLabel: 'Active Mandates',
                      appsLabel: 'Startup Pitches',
                      conversionLabel: 'Deal Flow Conversion',
                      hiredLabel: 'Funded Portfolio',
                      dueLabel: 'Success Fees Due (28d)',
                      pipelineTitle: 'Deal Flow Pipeline Graph',
                      pipelineSub: 'Founder pitches across due-diligence stages',
                      pieTitle: 'Deal Flow Status Pie Chart',
                      pieCenter: 'Pitches',
                      splitTitle: 'Capital Allocation & Facilitation Split (90% / 10%)',
                      splitSub: '90% Deployed Capital • 10% Nexora Deal Facilitation Fee',
                      splitBudgetLabel: 'Committed Capital',
                      splitMainLabel: 'Capital Deployed (90%)',
                      topTitle: 'Top Mandates & Upcoming Pitch Meetings',
                      topSub: 'Founder demand & scheduled pitch meetings',
                      stageLabels: ['Pitched', 'Diligence', 'Shortlisted', 'Pitch Call', 'Funded', 'Passed'],
                    }
                  : {
                      vacanciesLabel: 'Active Vacancies',
                      appsLabel: 'Total Applications',
                      conversionLabel: 'Pipeline Conversion',
                      hiredLabel: 'Hired Employees',
                      dueLabel: 'Invoices Due (28d)',
                      pipelineTitle: 'Recruitment Pipeline Graph',
                      pipelineSub: 'Candidate volume across hiring stages',
                      pieTitle: 'Application Status Pie Chart',
                      pieCenter: 'Applicants',
                      splitTitle: 'CTC Payroll & Invoice Breakdown (90% / 10%)',
                      splitSub: 'Zero extra markup above company Max Budget',
                      splitBudgetLabel: 'Monthly Max CTC',
                      splitMainLabel: 'Employee Payout (90%)',
                      topTitle: 'Top Vacancies & Upcoming Interviews',
                      topSub: 'Applicant demand & next scheduled interviews',
                      stageLabels: ['Submitted', 'Review', 'Shortlisted', 'Interview', 'Hired', 'Rejected'],
                    };

            // Pipeline Bar Chart data
            const pipelineStages = [
              { label: labels.stageLabels[0], count: submittedCount, color: '#38bdf8' },
              { label: labels.stageLabels[1], count: reviewCount, color: '#a78bfa' },
              { label: labels.stageLabels[2], count: shortlistedCount, color: '#fbbf24' },
              { label: labels.stageLabels[3], count: Math.max(interviewStatusCount, interviews.filter((i) => i.status === 'SCHEDULED').length), color: '#34d399' },
              { label: labels.stageLabels[4], count: Math.max(hiredCount, placements.length), color: '#10b981' },
              { label: labels.stageLabels[5], count: rejectedCount, color: '#f87171' },
            ];
            const maxStageCount = Math.max(1, ...pipelineStages.map((s) => s.count));

            // Pie / Donut Chart segments (Applications Breakdown)
            const pieData = [
              { label: 'Shortlisted', value: shortlistedCount, color: '#fbbf24' },
              { label: 'Interviewing', value: interviewStatusCount, color: '#34d399' },
              { label: 'Hired', value: hiredCount, color: '#10b981' },
              { label: 'In Review / New', value: submittedCount + reviewCount, color: '#38bdf8' },
              { label: 'Rejected', value: rejectedCount, color: '#f87171' },
            ].filter((d) => d.value > 0);
            const pieTotal = pieData.reduce((s, d) => s + d.value, 0);
            const radius = 54;
            const circumference = 2 * Math.PI * radius;
            let cumulativeOffset = 0;

            // CTC 90/10 Donut segments
            const ctcRadius = 46;
            const ctcCircumference = 2 * Math.PI * ctcRadius;
            const empDash = totalMonthlyCtc > 0 ? ctcCircumference * 0.9 : ctcCircumference * 0.9;
            const feeDash = totalMonthlyCtc > 0 ? ctcCircumference * 0.1 : ctcCircumference * 0.1;

            // Top Vacancies by applicants
            const topVacancies = vacancies
              .map((v) => {
                const vApps = applications.filter((a) => a.vacancyId === v.id || a.vacancyTitle === v.title);
                const vAvg = vApps.length > 0
                  ? Math.round(vApps.reduce((s, a) => s + Number(a.aiMatchScore || 0), 0) / vApps.length)
                  : 0;
                return { id: v.id, title: v.title, count: vApps.length, avgScore: vAvg, offer: Number(v.monthlyOfferUsd || 0) };
              })
              .sort((a, b) => b.count - a.count)
              .slice(0, 5);
            const maxVacApps = Math.max(1, ...topVacancies.map((v) => v.count));

            const upcomingInterviews = interviews
              .filter((i) => i.status === 'SCHEDULED')
              .slice(0, 4);

            return (
              <div className="grid gap-5">
                {/* Executive KPI Grid */}
                <div className="cp-stat-grid">
                  <div className="cp-card" style={{ borderTop: '3px solid #818cf8' }}>
                    <div className="text-xs text-slate-400">{labels.vacanciesLabel}</div>
                    <div className="text-2xl font-extrabold text-white mt-1">{publishedVacancies}</div>
                    <div className="text-[11px] text-slate-400 mt-1">{vacancies.length} total posted</div>
                  </div>
                  <div className="cp-card" style={{ borderTop: '3px solid #38bdf8' }}>
                    <div className="text-xs text-slate-400">{labels.appsLabel}</div>
                    <div className="text-2xl font-extrabold text-white mt-1">{totalApps}</div>
                    <div className="text-[11px] text-sky-300 mt-1">Avg AI Match: {avgAiScore}%</div>
                  </div>
                  <div className="cp-card" style={{ borderTop: '3px solid #fbbf24' }}>
                    <div className="text-xs text-slate-400">{labels.conversionLabel}</div>
                    <div className="text-2xl font-extrabold text-white mt-1">{conversionRate}%</div>
                    <div className="text-[11px] text-amber-300 mt-1">
                      {shortlistedCount} shortlisted • {interviews.length} scheduled
                    </div>
                  </div>
                  <div className="cp-card" style={{ borderTop: '3px solid #34d399' }}>
                    <div className="text-xs text-slate-400">{labels.hiredLabel}</div>
                    <div className="text-2xl font-extrabold text-emerald-300 mt-1">{placements.length}</div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Total: ${totalMonthlyCtc.toFixed(0)}
                    </div>
                  </div>
                  <div className="cp-card" style={{ borderTop: '3px solid #f472b6' }}>
                    <div className="text-xs text-slate-400">{labels.dueLabel}</div>
                    <div className="text-2xl font-extrabold text-pink-300 mt-1">${pendingDueUsd.toFixed(2)}</div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      {pendingInvoices.length} pending • ${paidTotalUsd.toFixed(2)} paid
                    </div>
                  </div>
                </div>

                {/* Row 2: Pipeline Bar Chart + Status Pie Chart */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                  {/* Bar Chart */}
                  <div className="cp-card">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="font-bold text-white text-sm">{labels.pipelineTitle}</div>
                        <div className="text-[11px] text-slate-400">{labels.pipelineSub}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate(`${prefix}/applications`)}
                        className="chat-action-btn"
                        style={{ padding: '4px 10px', fontSize: '11px' }}
                      >
                        View Pipeline
                      </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${pipelineStages.length}, 1fr)`, gap: '10px', alignItems: 'end', height: '190px', paddingTop: '16px' }}>
                      {pipelineStages.map((stage) => {
                        const heightPct = Math.max(8, Math.round((stage.count / maxStageCount) * 130));
                        return (
                          <div key={stage.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', height: '100%', justifyContent: 'flex-end' }}>
                            <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff' }}>{stage.count}</span>
                            <div
                              style={{
                                width: '100%',
                                maxWidth: '42px',
                                height: `${heightPct}px`,
                                borderRadius: '8px 8px 4px 4px',
                                background: `linear-gradient(180deg, ${stage.color}, ${stage.color}55)`,
                                border: `1px solid ${stage.color}88`,
                                transition: 'height 0.3s ease',
                              }}
                            />
                            <span style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center', whiteSpace: 'nowrap' }}>
                              {stage.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Pie / Donut Chart */}
                  <div className="cp-card">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="font-bold text-white text-sm">{labels.pieTitle}</div>
                        <div className="text-[11px] text-slate-400">Distribution of all {totalApps} submissions</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-around flex-wrap gap-4" style={{ minHeight: '190px' }}>
                      <svg width="144" height="144" viewBox="0 0 144 144">
                        <circle
                          cx="72"
                          cy="72"
                          r={radius}
                          fill="transparent"
                          stroke="rgba(255,255,255,0.08)"
                          strokeWidth="18"
                        />
                        {pieTotal > 0 &&
                          pieData.map((seg) => {
                            const segLen = (seg.value / pieTotal) * circumference;
                            const dashArray = `${segLen} ${circumference - segLen}`;
                            const dashOffset = -cumulativeOffset;
                            cumulativeOffset += segLen;
                            return (
                              <circle
                                key={seg.label}
                                cx="72"
                                cy="72"
                                r={radius}
                                fill="transparent"
                                stroke={seg.color}
                                strokeWidth="18"
                                strokeDasharray={dashArray}
                                strokeDashoffset={dashOffset}
                                transform="rotate(-90 72 72)"
                              />
                            );
                          })}
                        <text x="72" y="68" textAnchor="middle" fill="#fff" fontSize="22" fontWeight="800">
                          {totalApps}
                        </text>
                        <text x="72" y="86" textAnchor="middle" fill="#94a3b8" fontSize="11">
                          {labels.pieCenter}
                        </text>
                      </svg>

                      <div className="grid gap-2" style={{ minWidth: '155px' }}>
                        {pieTotal === 0 ? (
                          <div className="text-xs text-slate-400">No applications yet.</div>
                        ) : (
                          pieData.map((seg) => {
                            const pct = Math.round((seg.value / pieTotal) * 100);
                            return (
                              <div key={seg.label} className="flex items-center justify-between gap-3 text-xs">
                                <span className="flex items-center gap-2 text-slate-200">
                                  <span style={{ width: 10, height: 10, borderRadius: '999px', background: seg.color, display: 'inline-block' }} />
                                  {seg.label}
                                </span>
                                <span className="font-bold text-white">
                                  {seg.value} <span className="text-slate-400 font-normal">({pct}%)</span>
                                </span>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Row 3: Budget 90/10 Split Chart + Top Vacancies & Upcoming Interviews */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
                  {/* Payroll & 10% Invoice Split Pie + Summary */}
                  <div className="cp-card">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="font-bold text-white text-sm">{labels.splitTitle}</div>
                        <div className="text-[11px] text-slate-400">{labels.splitSub}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onNavigate(`${prefix}/billing`)}
                        className="chat-action-btn"
                        style={{ padding: '4px 10px', fontSize: '11px' }}
                      >
                        Go to Invoice
                      </button>
                    </div>

                    <div className="flex items-center gap-5 flex-wrap">
                      <svg width="120" height="120" viewBox="0 0 120 120">
                        <circle
                          cx="60"
                          cy="60"
                          r={ctcRadius}
                          fill="transparent"
                          stroke="#34d399"
                          strokeWidth="16"
                          strokeDasharray={`${empDash} ${ctcCircumference - empDash}`}
                          transform="rotate(-90 60 60)"
                        />
                        <circle
                          cx="60"
                          cy="60"
                          r={ctcRadius}
                          fill="transparent"
                          stroke="#818cf8"
                          strokeWidth="16"
                          strokeDasharray={`${feeDash} ${ctcCircumference - feeDash}`}
                          strokeDashoffset={-empDash}
                          transform="rotate(-90 60 60)"
                        />
                        <text x="60" y="57" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="800">
                          90 / 10
                        </text>
                        <text x="60" y="73" textAnchor="middle" fill="#94a3b8" fontSize="10">
                          Split
                        </text>
                      </svg>

                      <div className="grid gap-2 flex-1" style={{ minWidth: '180px' }}>
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-300">{labels.splitBudgetLabel}</span>
                          <strong className="text-white">${totalMonthlyCtc.toFixed(2)}</strong>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="flex items-center gap-1.5 text-emerald-300">
                            <span style={{ width: 8, height: 8, borderRadius: 99, background: '#34d399', display: 'inline-block' }} />
                            {labels.splitMainLabel}
                          </span>
                          <strong className="text-emerald-300">${totalEmployeeNet.toFixed(2)}</strong>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="flex items-center gap-1.5 text-indigo-300">
                            <span style={{ width: 8, height: 8, borderRadius: 99, background: '#818cf8', display: 'inline-block' }} />
                            Nexora Fee (10%)
                          </span>
                          <strong className="text-indigo-300">${totalNexoraFee.toFixed(2)}</strong>
                        </div>
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px', marginTop: '4px' }} className="flex justify-between text-xs">
                          <span className="text-amber-300">Pending Paystack Due</span>
                          <strong className="text-amber-300">${pendingDueUsd.toFixed(2)} USD</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Top Vacancies & Upcoming Interviews */}
                  <div className="cp-card">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <div className="font-bold text-white text-sm">{labels.topTitle}</div>
                        <div className="text-[11px] text-slate-400">{labels.topSub}</div>
                      </div>
                    </div>

                    <div className="grid gap-2.5">
                      {topVacancies.length === 0 ? (
                        <div className="text-xs text-slate-400">No vacancies published yet.</div>
                      ) : (
                        topVacancies.map((v) => (
                          <div key={v.id} className="grid gap-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-200 font-semibold truncate" style={{ maxWidth: '65%' }}>
                                {v.title}
                              </span>
                              <span className="text-slate-400">
                                <strong className="text-white">{v.count}</strong> apps • {v.avgScore}% AI
                              </span>
                            </div>
                            <div style={{ height: '6px', borderRadius: '999px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                              <div
                                style={{
                                  width: `${Math.max(6, Math.round((v.count / maxVacApps) * 100))}%`,
                                  height: '100%',
                                  background: 'linear-gradient(90deg, #6366f1, #38bdf8)',
                                }}
                              />
                            </div>
                          </div>
                        ))
                      )}

                      {upcomingInterviews.length > 0 && (
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '10px', marginTop: '4px' }}>
                          <div className="text-[11px] font-bold text-slate-400 uppercase mb-2">
                            Upcoming Interviews ({upcomingInterviews.length})
                          </div>
                          <div className="grid gap-1.5">
                            {upcomingInterviews.map((iv) => (
                              <div key={iv.id} className="flex justify-between items-center text-xs">
                                <span className="text-slate-200">{iv.candidateName} ({iv.vacancyTitle})</span>
                                <span className="text-emerald-300 font-semibold">{iv.scheduledAt}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>


              </div>
            );
          })()}

          {activeSection === 'vacancies' && (
            <div className="grid gap-3">
              {vacancies.length > 0 && (
                <div className="cp-card flex items-center justify-between gap-3 flex-wrap" style={{ padding: '12px 16px' }}>
                  <label className="flex items-center gap-2 text-xs text-slate-200 font-semibold" style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={vacancies.length > 0 && selectedVacancyIds.length === vacancies.length}
                      onChange={(e) => {
                        setSelectedVacancyIds(e.target.checked ? vacancies.map((v) => v.id) : []);
                      }}
                    />
                    <span>
                      Select All ({selectedVacancyIds.length}/{vacancies.length})
                    </span>
                  </label>
                  {selectedVacancyIds.length > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!org?.id) return;
                        const res = await apiFetch(`/api/v1/organisations/${org.id}/vacancies/bulk-delete`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ vacancyIds: selectedVacancyIds }),
                        });
                        const json = await res.json().catch(() => null);
                        if (json?.ok) {
                          setSelectedVacancyIds([]);
                          showToast(`Deleted ${json.removed} vacancy(ies).`);
                          loadAll(org.id);
                        }
                      }}
                      className="px-3 py-1.5 rounded-lg bg-red-500/15 text-red-300 text-xs font-bold flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Selected ({selectedVacancyIds.length})</span>
                    </button>
                  )}
                </div>
              )}

              {vacancies.map((v) => {
                const publicUrl = `${window.location.origin}/opportunity/${v.id}`;
                const isChecked = selectedVacancyIds.includes(v.id);
                return (
                  <div key={v.id} className="cp-card flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-3" style={{ flex: '1 1 300px' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          setSelectedVacancyIds((prev) =>
                            e.target.checked ? [...prev, v.id] : prev.filter((id) => id !== v.id),
                          );
                        }}
                        style={{ marginTop: '4px', cursor: 'pointer' }}
                      />
                      <div>
                        <div className="font-bold text-white">{v.title}</div>
                        <div className="text-xs text-slate-400 mt-1">
                          {v.category} • {v.location} • {v.workArrangement} • Status: {v.status}
                          {v.monthlyOfferUsd
                            ? ` • Max Budget (CTC): $${v.monthlyOfferUsd}/mo → Candidate: $${(v.monthlyOfferUsd * 0.9).toFixed(2)} (90%) • Nexora: $${(v.monthlyOfferUsd * 0.1).toFixed(2)} (10%)`
                            : ''}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!org?.id) return;
                          setMatchingVacancy(v);
                          setMatchingCandidates([]);
                          setViewingMatchedCandidate(null);
                          setInvitingCandidate(null);
                          setMatchingLoading(true);
                          try {
                            const res = await apiFetch(`/api/v1/organisations/${org.id}/vacancies/${v.id}/matching-candidates`);
                            const json = await res.json().catch(() => null);
                            if (json?.ok) {
                              setMatchingCandidates(json.data || []);
                            } else {
                              showToast(json?.error || 'Could not load matching candidates.');
                            }
                          } finally {
                            setMatchingLoading(false);
                          }
                        }}
                        className="chat-action-btn primary"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Get Matching Candidates</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(publicUrl);
                          showToast('Public opportunity link copied!');
                        }}
                        className="chat-action-btn"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Link</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigate(`/opportunity/${v.id}`)}
                        className="chat-action-btn"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Public Page</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setVacancyForm({
                            id: v.id,
                            title: v.title,
                            category: v.category,
                            location: v.location || '',
                            workArrangement: v.workArrangement || 'HYBRID',
                            vacancyType: v.vacancyType || 'FULL_TIME',
                            salaryRange: v.salaryRange || '',
                            monthlyOfferUsd: String(v.monthlyOfferUsd ?? 3500),
                            minYearsExperience: String(v.minYearsExperience ?? 0),
                            requiredSkills: (v.requiredSkills || []).join(', '),
                            description: v.description || '',
                            requirements: v.requirements || '',
                            requiresAssessment: Boolean(v.requiresAssessment),
                            visaType: v.visaType || '',
                            targetCountry: v.targetCountry || '',
                            processingTime: v.processingTime || '',
                            requiredDocuments: (v.requiredDocuments || []).join(', ') || 'Valid Passport (>6 months), Police Clearance, Medical Certificate, Proof of Funds, Qualifications / CV',
                            institutionName: v.institutionName || '',
                            degreeLevel: v.degreeLevel || 'Undergraduate / Masters',
                            fundingCoverage: v.fundingCoverage || 'Full Tuition + Stipend',
                            minGpaOrScore: v.minGpaOrScore || '70%',
                            investmentStage: v.investmentStage || 'Seed / Series A',
                            sectorFocus: v.sectorFocus || 'AI, SaaS & Fintech',
                            equityTerms: v.equityTerms || '5% - 15% Equity',
                            status: v.status === 'PUBLISHED' ? 'CLOSED' : 'PUBLISHED',
                          });
                          setShowVacancyModal(true);
                        }}
                        className="chat-action-btn"
                      >
                        Edit / Toggle Status
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!org?.id) return;
                          const res = await apiFetch(`/api/v1/organisations/${org.id}/vacancies/${v.id}`, {
                            method: 'DELETE',
                          });
                          const json = await res.json().catch(() => null);
                          if (json?.ok) {
                            setSelectedVacancyIds((prev) => prev.filter((id) => id !== v.id));
                            showToast(`Deleted "${v.title}".`);
                            loadAll(org.id);
                          }
                        }}
                        className="chat-action-btn"
                        title="Delete vacancy"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-300" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {vacancies.length === 0 && (
                <div className="cp-card text-sm text-slate-400">No vacancies published yet. Click &ldquo;Publish Vacancy&rdquo; above to get started.</div>
              )}
            </div>
          )}

          {activeSection === 'applications' && (() => {
            const vacancyOptions = Array.from(
              new Map<string, { id: string; title: string }>([
                ...vacancies.map((v): [string, { id: string; title: string }] => [
                  String(v.id),
                  { id: String(v.id), title: String(v.title) },
                ]),
                ...applications.map((a): [string, { id: string; title: string }] => [
                  String(a.vacancyId || a.vacancyTitle),
                  { id: String(a.vacancyId || a.vacancyTitle), title: String(a.vacancyTitle) },
                ]),
              ]).values(),
            );
            const filteredApps = applications
              .filter(
                (app) =>
                  applicationVacancyFilter === 'ALL' ||
                  app.vacancyId === applicationVacancyFilter ||
                  app.vacancyTitle === applicationVacancyFilter,
              )
              .sort((a, b) => (b.aiMatchScore ?? 0) - (a.aiMatchScore ?? 0));

            return (
              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={applicationVacancyFilter}
                      onChange={(e) => setApplicationVacancyFilter(e.target.value)}
                      className="auth-input"
                      style={{ width: 'auto', minWidth: '220px', padding: '7px 12px', fontSize: '12px' }}
                    >
                      <option value="ALL">All Vacancies ({applications.length})</option>
                      {vacancyOptions.map((vo) => {
                        const count = applications.filter(
                          (a) => a.vacancyId === vo.id || a.vacancyTitle === vo.title,
                        ).length;
                        return (
                          <option key={vo.id} value={vo.id}>
                            {vo.title} ({count})
                          </option>
                        );
                      })}
                    </select>
                    <div className="text-xs text-slate-400">
                      Showing {filteredApps.length} applicant{filteredApps.length === 1 ? '' : 's'} ranked by AI Match Score.
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={scoringBusy}
                    onClick={async () => {
                      if (!org?.id) return;
                      setScoringBusy(true);
                      try {
                        const res = await apiFetch(`/api/v1/organisations/${org.id}/applications/score-all`, {
                          method: 'POST',
                        });
                        const json = await res.json().catch(() => null);
                        if (json?.ok) {
                          showToast('All applicants scored with AI!');
                          loadAll(org.id);
                        }
                      } finally {
                        setScoringBusy(false);
                      }
                    }}
                    className="chat-action-btn primary"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{scoringBusy ? 'Scoring CVs...' : 'Score All Applicants with AI'}</span>
                  </button>
                </div>
                {filteredApps.map((app) => (
                  <div key={app.id} className="cp-card flex justify-between gap-3 flex-wrap">
                    <div style={{ flex: '1 1 320px' }}>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white">{app.candidateName}</span>
                        {app.aiMatchScore != null && (
                          <span
                            style={{
                              fontSize: '11px',
                              fontWeight: 700,
                              padding: '2px 9px',
                              borderRadius: '999px',
                              background:
                                app.aiMatchScore >= 75
                                  ? 'rgba(16,185,129,0.2)'
                                  : app.aiMatchScore >= 50
                                    ? 'rgba(245,158,11,0.2)'
                                    : 'rgba(239,68,68,0.2)',
                              color:
                                app.aiMatchScore >= 75
                                  ? '#6ee7b7'
                                  : app.aiMatchScore >= 50
                                    ? '#fcd34d'
                                    : '#fca5a5',
                            }}
                          >
                            {app.aiMatchScore}% AI CV Match
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {app.candidateEmail} • Role: {app.vacancyTitle} • Assessment:{' '}
                        {app.transcriptScore != null ? `${app.transcriptScore}%` : 'N/A'}
                      </div>
                      {app.aiMatchSummary && (
                        <div className="text-xs text-slate-300 mt-1.5">{app.aiMatchSummary}</div>
                      )}
                      {Array.isArray(app.documentChecklist) && app.documentChecklist.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {app.documentChecklist.map((chk: any) => (
                            <span
                              key={chk.item}
                              style={{
                                fontSize: '11px',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                fontWeight: 600,
                                background: chk.met ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.16)',
                                color: chk.met ? '#6ee7b7' : '#fca5a5',
                              }}
                            >
                              {chk.met ? '✓' : '✗'} {chk.item}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="flex gap-3 mt-2 text-xs flex-wrap">
                        {app.cvDownloadUrl && (
                          <a href={resolveApiUrl(app.cvDownloadUrl)} target="_blank" rel="noreferrer" className="text-indigo-400 underline">
                            CV ({app.cvFileName || 'Download'})
                          </a>
                        )}
                        {app.transcriptPdfUrl && (
                          <a href={resolveApiUrl(app.transcriptPdfUrl)} target="_blank" rel="noreferrer" className="text-emerald-400 underline">
                            Transcript PDF
                          </a>
                        )}
                        {(app.supportingDocuments || []).map((doc: any) => (
                          <a
                            key={doc.id}
                            href={resolveApiUrl(doc.downloadUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-300 underline"
                          >
                            {doc.docType}: {doc.label || doc.fileName}
                          </a>
                        ))}
                        {(app.transcripts || []).map((tr: any) =>
                          tr.pdfDownloadUrl ? (
                            <a
                              key={tr.id}
                              href={resolveApiUrl(tr.pdfDownloadUrl)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-cyan-300 underline"
                            >
                              Transcript ({tr.assignmentTitle} • {tr.percentageScore}%)
                            </a>
                          ) : null,
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        value={app.status}
                        onChange={(e) => handleStatusChange(app.id, e.target.value)}
                        className="auth-input"
                        style={{ width: 'auto', padding: '6px 10px', fontSize: '12px' }}
                      >
                        {PIPELINE_STAGES.map((st) => (
                          <option key={st} value={st}>
                            {st.replace(/_/g, ' ')}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!org?.id) return;
                          const res = await apiFetch(`/api/v1/organisations/${org.id}/applications/${app.id}/score`, {
                            method: 'POST',
                          });
                          const json = await res.json().catch(() => null);
                          if (json?.ok) {
                            showToast(`Scored ${app.candidateName}: ${json.data.aiMatchScore}%`);
                            loadAll(org.id);
                          }
                        }}
                        className="chat-action-btn"
                      >
                        AI Score
                      </button>
                      {app.status !== 'HIRED' && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(app.id, 'HIRED')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs"
                        >
                          {isImmigrationOrg
                            ? 'Accept Case & Invoice (10%)'
                            : isScholarshipOrg
                              ? 'Award Scholar & Invoice (10%)'
                              : isInvestmentOrg
                                ? 'Fund Deal & Invoice (10%)'
                                : 'Accept / Hire'}
                        </button>
                      )}
                      <button type="button" onClick={() => setInterviewModalApp(app)} className="chat-action-btn">
                        Schedule Interview
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMessageModalApp(app);
                          setMessageForm({ subject: `Regarding your application for ${app.vacancyTitle}`, body: '' });
                        }}
                        className="chat-action-btn"
                      >
                        Message
                      </button>
                    </div>
                  </div>
                ))}
                {filteredApps.length === 0 && (
                  <div className="cp-card text-sm text-slate-400">
                    {applications.length === 0
                      ? 'No applications received yet.'
                      : 'No applications found for the selected vacancy.'}
                  </div>
                )}
              </div>
            );
          })()}

          {matchingVacancy && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(2, 6, 23, 0.78)',
                backdropFilter: 'blur(6px)',
                zIndex: 95,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
              }}
            >
              <div
                className="cp-card"
                style={{
                  width: '100%',
                  maxWidth: '820px',
                  maxHeight: '88vh',
                  overflowY: 'auto',
                  borderColor: 'rgba(99, 102, 241, 0.4)',
                }}
              >
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <div className="text-base font-extrabold text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      <span>Matching Nexora AI Candidates — {matchingVacancy.title}</span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      Prioritizes users with candidate profiles, CVs &amp; transcripts first. Invite interested candidates to interview — if they accept, their application auto-submits!
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setMatchingVacancy(null);
                      setInvitingCandidate(null);
                      setViewingMatchedCandidate(null);
                    }}
                    className="sidebar-icon-btn"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {matchingLoading ? (
                  <div className="text-xs text-slate-300 py-8 text-center">
                    Scanning Nexora AI users &amp; candidate profiles...
                  </div>
                ) : matchingCandidates.length === 0 ? (
                  <div className="text-xs text-slate-400 py-6 text-center">
                    No matching Nexora AI users found yet.
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {matchingCandidates.map((c, idx) => {
                      const isViewing = viewingMatchedCandidate?.userUid === c.userUid;
                      const isInviting = invitingCandidate?.userUid === c.userUid;
                      return (
                        <div
                          key={`${c.userUid}-${idx}`}
                          style={{
                            padding: '14px',
                            borderRadius: '12px',
                            background: 'rgba(15, 23, 42, 0.75)',
                            border: '1px solid rgba(255,255,255,0.08)',
                          }}
                        >
                          <div className="flex justify-between items-start gap-3 flex-wrap">
                            <div>
                              <div className="font-bold text-white flex items-center gap-2 flex-wrap">
                                <span>{c.candidateName}</span>
                                <span
                                  className="text-[11px] px-2 py-0.5 rounded-full font-bold"
                                  style={{ background: 'rgba(99,102,241,0.22)', color: '#a5b4fc' }}
                                >
                                  {c.matchScore}% Match
                                </span>
                                {c.hasCandidateProfile ? (
                                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-semibold">
                                    Candidate Profile
                                  </span>
                                ) : (
                                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-300">
                                    Nexora User
                                  </span>
                                )}
                                {c.hasTranscript && (
                                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 font-semibold">
                                    Transcript {c.assessmentScore ?? ''}%
                                  </span>
                                )}
                                {c.hasCv && (
                                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-semibold">
                                    CV Ready
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400 mt-1">
                                {c.candidateEmail}
                                {c.location ? ` • ${c.location}` : ''}
                                {c.yearsExperience ? ` • ${c.yearsExperience} yrs exp` : ''}
                              </div>
                              {c.headline && (
                                <div className="text-xs text-slate-300 mt-1">{c.headline}</div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                type="button"
                                onClick={() => setViewingMatchedCandidate(isViewing ? null : c)}
                                className="chat-action-btn"
                                style={{ padding: '6px 10px', fontSize: '12px' }}
                              >
                                {isViewing ? 'Hide Profile' : 'View Profile'}
                              </button>
                              {c.alreadyApplied ? (
                                <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                                  Applied ({c.applicationStatus})
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  disabled={inviteBusy}
                                  onClick={async () => {
                                    if (!org?.id || !matchingVacancy?.id) return;
                                    setInviteBusy(true);
                                    try {
                                      const res = await apiFetch(
                                        `/api/v1/organisations/${org.id}/vacancies/${matchingVacancy.id}/auto-apply-candidate`,
                                        {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({
                                            userUid: c.userUid,
                                            customerId: c.customerId,
                                            candidateName: c.candidateName,
                                            candidateEmail: c.candidateEmail,
                                          }),
                                        },
                                      );
                                      const json = await res.json().catch(() => null);
                                      if (json?.ok) {
                                        showToast(`${c.candidateName} auto-submitted under Applications!`);
                                        setMatchingCandidates((prev) =>
                                          prev.map((item) =>
                                            item.userUid === c.userUid
                                              ? { ...item, alreadyApplied: true, applicationStatus: json.data?.status || 'RECEIVED' }
                                              : item,
                                          ),
                                        );
                                        loadAll(org.id);
                                      } else {
                                        showToast(json?.error || 'Could not auto-apply candidate.');
                                      }
                                    } finally {
                                      setInviteBusy(false);
                                    }
                                  }}
                                  className="chat-action-btn primary"
                                  style={{ padding: '6px 12px', fontSize: '12px' }}
                                >
                                  Apply
                                </button>
                              )}
                            </div>
                          </div>

                          {isViewing && (
                            <div
                              className="mt-3 p-3 rounded-lg text-xs text-slate-300 grid gap-2"
                              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                            >
                              {c.skills?.length > 0 && (
                                <div><strong className="text-white">Skills:</strong> {c.skills.join(', ')}</div>
                              )}
                              {c.qualifications && (
                                <div><strong className="text-white">Qualifications:</strong> {c.qualifications}</div>
                              )}
                              {c.workExperience && (
                                <div><strong className="text-white">Experience:</strong> {c.workExperience}</div>
                              )}
                              <div className="pt-1">
                                <strong className="text-white block mb-1">
                                  Verified Documents (CVs, Transcripts, IDs, Permits, Certificates):
                                </strong>
                                <div className="flex flex-wrap gap-2">
                                  {c.cvDownloadUrl && (
                                    <a
                                      href={resolveApiUrl(c.cvDownloadUrl)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="chat-action-btn"
                                      style={{ textDecoration: 'none', padding: '4px 10px', fontSize: '11px' }}
                                    >
                                      CV: {c.cvFileName || 'Download CV'}
                                    </a>
                                  )}
                                  {(c.documents || []).map((doc: any) => (
                                    <a
                                      key={doc.id}
                                      href={resolveApiUrl(doc.downloadUrl)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="chat-action-btn"
                                      style={{ textDecoration: 'none', padding: '4px 10px', fontSize: '11px' }}
                                    >
                                      {doc.docType}: {doc.label || doc.fileName}
                                    </a>
                                  ))}
                                  {(c.transcripts || []).map((tr: any) => (
                                    <span
                                      key={tr.id}
                                      className="chat-action-btn"
                                      style={{ padding: '4px 10px', fontSize: '11px' }}
                                    >
                                      {tr.pdfDownloadUrl ? (
                                        <a
                                          href={resolveApiUrl(tr.pdfDownloadUrl)}
                                          target="_blank"
                                          rel="noreferrer"
                                          style={{ color: '#6ee7b7', textDecoration: 'none' }}
                                        >
                                          Transcript ({tr.assignmentTitle} • {tr.percentageScore}%)
                                        </a>
                                      ) : (
                                        `Transcript: ${tr.assignmentTitle} (${tr.percentageScore}%)`
                                      )}
                                    </span>
                                  ))}
                                  {!c.cvDownloadUrl && (!c.documents || c.documents.length === 0) && (!c.transcripts || c.transcripts.length === 0) && (
                                    <span className="text-slate-500">No documents uploaded yet.</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {isInviting && (
                            <form
                              onSubmit={async (e) => {
                                e.preventDefault();
                                if (!org?.id || !matchingVacancy?.id) return;
                                setInviteBusy(true);
                                try {
                                  const res = await apiFetch(
                                    `/api/v1/organisations/${org.id}/vacancies/${matchingVacancy.id}/invite-interview`,
                                    {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({
                                        userUid: c.userUid,
                                        customerId: c.customerId,
                                        candidateName: c.candidateName,
                                        candidateEmail: c.candidateEmail,
                                        ...inviteForm,
                                      }),
                                    },
                                  );
                                  const json = await res.json().catch(() => null);
                                  if (json?.ok) {
                                    showToast(`Interview invitation sent to ${c.candidateName}!`);
                                    setInvitingCandidate(null);
                                    setMatchingCandidates((prev) =>
                                      prev.map((item) =>
                                        item.userUid === c.userUid
                                          ? { ...item, alreadyInvited: true, interviewStatus: 'INVITED' }
                                          : item,
                                      ),
                                    );
                                    loadAll(org.id);
                                  } else {
                                    showToast(json?.error || 'Could not send interview invite.');
                                  }
                                } finally {
                                  setInviteBusy(false);
                                }
                              }}
                              className="mt-3 p-3 rounded-lg grid gap-2"
                              style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)' }}
                            >
                              <div className="text-xs font-bold text-white">
                                Send Interview Invitation to {c.candidateName}
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <input
                                  type="date"
                                  required
                                  value={inviteForm.interviewDate}
                                  onChange={(e) => setInviteForm({ ...inviteForm, interviewDate: e.target.value })}
                                  className="auth-input"
                                  style={{ fontSize: '12px' }}
                                />
                                <input
                                  type="time"
                                  required
                                  value={inviteForm.interviewTime}
                                  onChange={(e) => setInviteForm({ ...inviteForm, interviewTime: e.target.value })}
                                  className="auth-input"
                                  style={{ fontSize: '12px' }}
                                />
                                <select
                                  value={inviteForm.interviewType}
                                  onChange={(e) => setInviteForm({ ...inviteForm, interviewType: e.target.value as any })}
                                  className="auth-input"
                                  style={{ fontSize: '12px' }}
                                >
                                  <option value="ONLINE">Online Video</option>
                                  <option value="TELEPHONE">Telephone</option>
                                  <option value="IN_PERSON">In Person</option>
                                </select>
                              </div>
                              <select
                                value={inviteForm.interviewProvider}
                                onChange={(e) =>
                                  setInviteForm({
                                    ...inviteForm,
                                    interviewProvider: e.target.value as 'GOOGLE_LIVE' | 'NUANCE' | 'EXTERNAL',
                                  })
                                }
                                className="auth-input"
                                style={{ fontSize: '12px' }}
                              >
                                <option value="GOOGLE_LIVE">Google Live AI — $0.50/min (Monthly Invoice)</option>
                                <option value="NUANCE">Nuance AI Video Persona — $2.00/min (Monthly Invoice)</option>
                                <option value="EXTERNAL">Own / External Meeting Link — Free</option>
                              </select>
                              {(inviteForm.interviewType !== 'ONLINE' || inviteForm.interviewProvider === 'EXTERNAL') ? (
                                <input
                                  required
                                  placeholder="Meeting link or address"
                                  value={inviteForm.locationOrLink}
                                  onChange={(e) => setInviteForm({ ...inviteForm, locationOrLink: e.target.value })}
                                  className="auth-input"
                                  style={{ fontSize: '12px' }}
                                />
                              ) : (
                                <textarea
                                  required
                                  rows={3}
                                  placeholder="Enter the interview questions the AI interviewer must ask (one per line) *"
                                  value={inviteForm.aiQuestions}
                                  onChange={(e) => setInviteForm({ ...inviteForm, aiQuestions: e.target.value })}
                                  className="auth-input"
                                  style={{ fontSize: '12px' }}
                                />
                              )}
                              <input
                                placeholder="Message / instructions for candidate"
                                value={inviteForm.instructions}
                                onChange={(e) => setInviteForm({ ...inviteForm, instructions: e.target.value })}
                                className="auth-input"
                                style={{ fontSize: '12px' }}
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setInvitingCandidate(null)}
                                  className="chat-action-btn"
                                >
                                  Cancel
                                </button>
                                <button type="submit" disabled={inviteBusy} className="chat-action-btn primary">
                                  {inviteBusy ? 'Sending...' : 'Send Interview Invite'}
                                </button>
                              </div>
                            </form>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSection === 'interviews' && (
            <div className="grid gap-3">
              {interviews.map((iv) => (
                <div key={iv.id} className="cp-card grid gap-3">
                  <div className="flex justify-between items-start flex-wrap gap-3">
                    <div>
                      <div className="font-bold text-white flex items-center gap-2 flex-wrap">
                        <span>{iv.candidateName} — {iv.jobTitle}</span>
                        <span
                          className="text-[11px] px-2.5 py-0.5 rounded-full font-bold"
                          style={{
                            background:
                              iv.interviewProvider === 'NUANCE'
                                ? 'rgba(168,85,247,0.22)'
                                : iv.interviewProvider === 'GOOGLE_LIVE'
                                  ? 'rgba(16,185,129,0.22)'
                                  : 'rgba(100,116,139,0.22)',
                            color:
                              iv.interviewProvider === 'NUANCE'
                                ? '#d8b4fe'
                                : iv.interviewProvider === 'GOOGLE_LIVE'
                                  ? '#6ee7b7'
                                  : '#cbd5e1',
                          }}
                        >
                          {iv.interviewProvider === 'NUANCE'
                            ? 'Nuance AI • $2.00/min'
                            : iv.interviewProvider === 'GOOGLE_LIVE'
                              ? 'Google Live • $0.50/min'
                              : 'External • Free'}
                        </span>
                        <span
                          className="text-[11px] px-2.5 py-0.5 rounded-full font-bold"
                          style={{
                            background:
                              iv.status === 'CANCELLED'
                                ? 'rgba(239,68,68,0.2)'
                                : iv.status === 'COMPLETED'
                                  ? 'rgba(16,185,129,0.2)'
                                  : 'rgba(56,189,248,0.2)',
                            color:
                              iv.status === 'CANCELLED'
                                ? '#fca5a5'
                                : iv.status === 'COMPLETED'
                                  ? '#6ee7b7'
                                  : '#7dd3fc',
                          }}
                        >
                          {iv.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {iv.interviewType} • {iv.interviewDate} at {iv.interviewTime} ({iv.timezone}) • {iv.locationOrLink}
                        {iv.billedMinutes ? (
                          <span style={{ color: '#fbbf24', fontWeight: 600 }}>
                            {' '}• Recorded {iv.billedMinutes} min (${Number(iv.billedAmountUsd || 0).toFixed(2)} on monthly invoice)
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {iv.recordingUrl && (
                        <a
                          href={iv.recordingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="chat-action-btn primary"
                          style={{ textDecoration: 'none' }}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Watch Recording</span>
                        </a>
                      )}
                      {/^https?:\/\//i.test(iv.locationOrLink || '') && (
                        <a
                          href={iv.locationOrLink}
                          target="_blank"
                          rel="noreferrer"
                          className="chat-action-btn primary"
                          style={{ textDecoration: 'none' }}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Join</span>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          if (!org?.id) return;
                          showToast('Generating AI interview questions...');
                          const res = await apiFetch(
                            `/api/v1/organisations/${org.id}/interviews/${iv.id}/ai-questions`,
                            { method: 'POST' },
                          );
                          const json = await res.json().catch(() => null);
                          if (json?.ok) {
                            showToast('AI Interview Questions ready!');
                            loadAll(org.id);
                          }
                        }}
                        className="chat-action-btn"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                        <span>AI Questions</span>
                      </button>
                      {iv.status !== 'COMPLETED' && iv.status !== 'CANCELLED' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setRescheduleIv(iv);
                              setRescheduleForm({
                                interviewDate: iv.interviewDate || '',
                                interviewTime: iv.interviewTime || '',
                                locationOrLink: iv.locationOrLink || '',
                              });
                            }}
                            className="chat-action-btn"
                          >
                            Reschedule
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!org?.id) return;
                              await apiFetch(`/api/v1/organisations/${org.id}/interviews/${iv.id}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ status: 'COMPLETED' }),
                              });
                              showToast('Interview marked COMPLETED.');
                              loadAll(org.id);
                            }}
                            className="chat-action-btn"
                          >
                            Mark Completed
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!org?.id) return;
                              await apiFetch(`/api/v1/organisations/${org.id}/interviews/${iv.id}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ status: 'CANCELLED' }),
                              });
                              showToast('Interview cancelled & candidate notified.');
                              loadAll(org.id);
                            }}
                            className="chat-action-btn"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {iv.applicationId && iv.status === 'COMPLETED' && (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(iv.applicationId, 'HIRED')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs"
                        >
                          Hire Candidate
                        </button>
                      )}
                    </div>
                  </div>
                  {iv.interviewerNotes && (
                    <div
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        background: 'rgba(99,102,241,0.08)',
                        border: '1px solid rgba(99,102,241,0.2)',
                        fontSize: '12px',
                        color: '#cbd5e1',
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {iv.interviewerNotes}
                    </div>
                  )}
                </div>
              ))}
              {interviews.length === 0 && (
                <div className="cp-card text-sm text-slate-400">No interviews scheduled yet.</div>
              )}
            </div>
          )}

          {activeSection === 'employees' && (
            <div className="grid gap-4">
              {(() => {
                const totalCtc = placements.reduce((s, p) => s + (p.monthlySalaryCents || 0) / 100, 0);
                return (
                  <div className="cp-stat-grid">
                    <div className="cp-card" style={{ borderTop: '3px solid #38bdf8' }}>
                      <div className="text-xs text-slate-400">
                        {isImmigrationOrg
                          ? 'Active Visa Cases'
                          : isScholarshipOrg
                            ? 'Awarded Scholars'
                            : isInvestmentOrg
                              ? 'Portfolio Companies'
                              : 'Total Hired Employees'}
                      </div>
                      <div className="text-2xl font-extrabold text-white mt-1">{placements.length}</div>
                    </div>
                    <div className="cp-card" style={{ borderTop: '3px solid #818cf8' }}>
                      <div className="text-xs text-slate-400">
                        {isImmigrationOrg
                          ? 'Total Visa Service Fees'
                          : isScholarshipOrg
                            ? 'Total Grant Commitments'
                            : isInvestmentOrg
                              ? 'Total Committed Capital'
                              : 'Total Monthly Budget (CTC)'}
                      </div>
                      <div className="text-2xl font-extrabold text-white mt-1">${totalCtc.toFixed(2)}</div>
                    </div>
                    <div className="cp-card" style={{ borderTop: '3px solid #34d399' }}>
                      <div className="text-xs text-slate-400">
                        {isImmigrationOrg
                          ? 'Agency Payout (90%)'
                          : isScholarshipOrg
                            ? 'Scholar Awards (90%)'
                            : isInvestmentOrg
                              ? 'Capital Deployed (90%)'
                              : 'Paid to Employees (90%)'}
                      </div>
                      <div className="text-2xl font-extrabold text-emerald-300 mt-1">${(totalCtc * 0.9).toFixed(2)}</div>
                    </div>
                    <div className="cp-card" style={{ borderTop: '3px solid #f472b6' }}>
                      <div className="text-xs text-slate-400">
                        {isImmigrationOrg
                          ? 'Nexora Commission (10%)'
                          : isScholarshipOrg
                            ? 'Nexora Platform Fee (10%)'
                            : isInvestmentOrg
                              ? 'Nexora Facilitation (10%)'
                              : 'Nexora Recruiting Fee (10%)'}
                      </div>
                      <div className="text-2xl font-extrabold text-indigo-300 mt-1">${(totalCtc * 0.1).toFixed(2)}</div>
                    </div>
                  </div>
                );
              })()}

              {placements.length === 0 ? (
                <div className="cp-card text-sm text-slate-400">
                  {isImmigrationOrg
                    ? 'No active visa cases yet. Accept a client in Visa Applications to open a case and generate the 10% service-fee invoice.'
                    : isScholarshipOrg
                      ? 'No scholars awarded yet. Award a student in Applicants to track enrollment and generate the 10% platform invoice.'
                      : isInvestmentOrg
                        ? 'No portfolio deals funded yet. Approve a startup in Startup Pitches to track capital deployment and generate the 10% invoice.'
                        : 'No employees hired yet. Accept / Hire a candidate in the Applications or Interviews tab to manage them here.'}
                </div>
              ) : (
                <div className="cp-card" style={{ padding: 0, overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        <th style={{ padding: '12px 14px' }}>
                          {isImmigrationOrg ? 'Client' : isScholarshipOrg ? 'Scholar' : isInvestmentOrg ? 'Founder / Startup' : 'Employee'}
                        </th>
                        <th style={{ padding: '12px 14px' }}>
                          {isImmigrationOrg ? 'Visa Program' : isScholarshipOrg ? 'Scholarship' : isInvestmentOrg ? 'Mandate' : 'Role'}
                        </th>
                        <th style={{ padding: '12px 14px' }}>
                          {isImmigrationOrg ? 'Case Opened' : isScholarshipOrg ? 'Award Date' : isInvestmentOrg ? 'Deal Date' : 'Hired / Start'}
                        </th>
                        <th style={{ padding: '12px 14px' }}>Next Due (28d)</th>
                        <th style={{ padding: '12px 14px' }}>
                          {isImmigrationOrg ? 'Service Fee' : isScholarshipOrg ? 'Grant Value' : isInvestmentOrg ? 'Allocation' : 'Max CTC'}
                        </th>
                        <th style={{ padding: '12px 14px' }}>
                          {isImmigrationOrg ? 'Agency (90%)' : isScholarshipOrg ? 'Scholar (90%)' : isInvestmentOrg ? 'Deployed (90%)' : 'Employee (90%)'}
                        </th>
                        <th style={{ padding: '12px 14px' }}>Nexora (10%)</th>
                        <th style={{ padding: '12px 14px' }}>
                          {isImmigrationOrg ? 'Visa Milestone' : isScholarshipOrg ? 'Academic Status' : isInvestmentOrg ? 'Deal Stage' : 'Status'}
                        </th>
                        <th style={{ padding: '12px 14px', textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {placements.map((p) => {
                        const ctcUsd = (p.monthlySalaryCents || 0) / 100;
                        const netEmployeeUsd = ctcUsd * 0.9;
                        const nexoraFeeUsd = ctcUsd * 0.1;
                        return (
                          <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <td style={{ padding: '12px 14px', fontWeight: 700, color: '#fff' }}>{p.candidateName}</td>
                            <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>{p.roleTitle}</td>
                            <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{p.startDate}</td>
                            <td style={{ padding: '12px 14px', color: '#fbbf24', fontWeight: 600 }}>
                              {p.nextBillingDate || '—'}
                            </td>
                            <td style={{ padding: '12px 14px', color: '#fff', fontWeight: 600 }}>${ctcUsd.toFixed(2)}</td>
                            <td style={{ padding: '12px 14px', color: '#6ee7b7', fontWeight: 600 }}>${netEmployeeUsd.toFixed(2)}</td>
                            <td style={{ padding: '12px 14px', color: '#a5b4fc', fontWeight: 600 }}>${nexoraFeeUsd.toFixed(2)}</td>
                            <td style={{ padding: '12px 14px' }}>
                              <select
                                value={
                                  p.onboardingStatus ||
                                  (isImmigrationOrg
                                    ? 'DOCUMENTS_REVIEW'
                                    : isScholarshipOrg
                                      ? 'SCHOLAR_AWARDED'
                                      : isInvestmentOrg
                                        ? 'TERM_SHEET'
                                        : 'ACTIVE')
                                }
                                onChange={async (e) => {
                                  if (!org?.id) return;
                                  await apiFetch(`/api/v1/organisations/${org.id}/placements/${p.id}/status`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ onboardingStatus: e.target.value }),
                                  });
                                  showToast(`Status updated to ${e.target.value.replace(/_/g, ' ')}.`);
                                  loadAll(org.id);
                                }}
                                className="auth-input"
                                style={{ width: 'auto', padding: '4px 8px', fontSize: '12px' }}
                              >
                                {isImmigrationOrg ? (
                                  <>
                                    <option value="DOCUMENTS_REVIEW">Documents Review</option>
                                    <option value="EMBASSY_LODGED">Embassy Lodged</option>
                                    <option value="BIOMETRICS_BOOKED">Biometrics Booked</option>
                                    <option value="VISA_APPROVED">Visa Approved</option>
                                    <option value="COMPLETED">Relocated / Completed</option>
                                    <option value="TERMINATED">Cancelled</option>
                                  </>
                                ) : isScholarshipOrg ? (
                                  <>
                                    <option value="SCHOLAR_AWARDED">Scholar Awarded</option>
                                    <option value="ENROLLED">Enrolled</option>
                                    <option value="ACTIVE_SCHOLAR">Active Scholar</option>
                                    <option value="COMPLETED">Graduated</option>
                                    <option value="TERMINATED">Revoked</option>
                                  </>
                                ) : isInvestmentOrg ? (
                                  <>
                                    <option value="TERM_SHEET">Term Sheet Signed</option>
                                    <option value="DUE_DILIGENCE">Due Diligence</option>
                                    <option value="CAPITAL_DEPLOYED">Capital Deployed</option>
                                    <option value="COMPLETED">Exited</option>
                                    <option value="TERMINATED">Passed / Closed</option>
                                  </>
                                ) : (
                                  <>
                                    <option value="ONBOARDING">Onboarding</option>
                                    <option value="ACTIVE">Active</option>
                                    <option value="COMPLETED">Completed</option>
                                    <option value="TERMINATED">Offboarded</option>
                                  </>
                                )}
                              </select>
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingSalaryPlc(p);
                                  setEditSalaryInput(String(ctcUsd || 0));
                                }}
                                className="chat-action-btn primary"
                                style={{ padding: '6px 10px', fontSize: '12px' }}
                              >
                                {isImmigrationOrg
                                  ? 'Edit Fee'
                                  : isScholarshipOrg
                                    ? 'Edit Grant'
                                    : isInvestmentOrg
                                      ? 'Edit Capital'
                                      : 'Edit Salary'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeSection === 'billing' && (() => {
            const pendingInvoices = invoices.filter((i) => i.status !== 'PAID');
            const totalDueUsd = pendingInvoices.reduce((sum, i) => sum + Number(i.feeAmountUsd || 0), 0);
            return (
              <div className="grid gap-4">
                <div className="cp-card flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-bold text-white">Invoice — 10% CTC Recruiting Fee (Due 28 Days After Hire)</div>
                    <div className="text-xs text-slate-400 mt-1">
                      Pending Invoices: <strong className="text-white">{pendingInvoices.length}</strong> • Total Amount Due:{' '}
                      <strong className="text-emerald-300">${totalDueUsd.toFixed(2)} USD</strong>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={async () => {
                        if (!org?.id) return;
                        const res = await apiFetch(`/api/v1/organisations/${org.id}/invoices/generate-monthly`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({}),
                        });
                        const json = await res.json().catch(() => null);
                        if (json?.ok) {
                          showToast(`Synced ${json.data.length} invoice(s).`);
                          loadAll(org.id);
                        }
                      }}
                      className="chat-action-btn"
                    >
                      Sync Invoices
                    </button>
                    {pendingInvoices.length > 0 && totalDueUsd > 0 && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!org?.id) return;
                          const callbackUrl = `${window.location.origin}${prefix}/billing?bulkInvoices=1`;
                          const res = await apiFetch(`/api/v1/organisations/${org.id}/invoices/paystack/initialize-all`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ callbackUrl }),
                          });
                          const json = await res.json().catch(() => null);
                          if (json?.ok && json.data?.authorizationUrl) {
                            window.open(json.data.authorizationUrl, '_blank', 'noopener,noreferrer');
                            showToast(`Paystack checkout opened for $${totalDueUsd.toFixed(2)} USD.`);
                          } else {
                            showToast(json?.error || 'Could not initialize Paystack payment.');
                          }
                        }}
                        className="px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs"
                      >
                        Pay Total Due (${totalDueUsd.toFixed(2)}) via Paystack
                      </button>
                    )}
                  </div>
                </div>

                {invoices.length === 0 ? (
                  <div className="cp-card text-sm text-slate-400">
                    No invoices yet. Hire a candidate on a vacancy with a Monthly USD Offer to generate the 10% invoice (due 28 days after hire).
                  </div>
                ) : (
                  <div className="cp-card" style={{ padding: 0, overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                          <th style={{ padding: '12px 14px' }}>Invoice #</th>
                          <th style={{ padding: '12px 14px' }}>Employee</th>
                          <th style={{ padding: '12px 14px' }}>Role</th>
                          <th style={{ padding: '12px 14px' }}>Due Date (28d)</th>
                          <th style={{ padding: '12px 14px' }}>Next Due Date</th>
                          <th style={{ padding: '12px 14px' }}>Max CTC</th>
                          <th style={{ padding: '12px 14px' }}>Nexora (10%)</th>
                          <th style={{ padding: '12px 14px' }}>Status</th>
                          <th style={{ padding: '12px 14px', textAlign: 'right' }}>PDF</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map((inv) => (
                          <tr key={inv.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                            <td style={{ padding: '12px 14px', fontWeight: 700, color: '#fff' }}>{inv.invoiceNumber}</td>
                            <td style={{ padding: '12px 14px', color: '#e2e8f0' }}>{inv.candidateName}</td>
                            <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{inv.vacancyTitle}</td>
                            <td style={{ padding: '12px 14px', color: '#fbbf24', fontWeight: 600 }}>{inv.dueDate || inv.billingMonth}</td>
                            <td style={{ padding: '12px 14px', color: '#a5b4fc' }}>{inv.nextDueDate || '—'}</td>
                            <td style={{ padding: '12px 14px', color: '#cbd5e1' }}>${Number(inv.offerAmountUsd).toFixed(2)}</td>
                            <td style={{ padding: '12px 14px', color: '#6ee7b7', fontWeight: 700 }}>${Number(inv.feeAmountUsd).toFixed(2)}</td>
                            <td style={{ padding: '12px 14px' }}>
                              <span
                                style={{
                                  padding: '3px 10px',
                                  borderRadius: '999px',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  background: inv.status === 'PAID' ? 'rgba(16,185,129,0.18)' : 'rgba(245,158,11,0.18)',
                                  color: inv.status === 'PAID' ? '#6ee7b7' : '#fcd34d',
                                }}
                              >
                                {inv.status === 'PAID' ? 'PAID ✓' : 'PENDING'}
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                              {inv.pdfDownloadUrl ? (
                                <a
                                  href={resolveApiUrl(inv.pdfDownloadUrl)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="chat-action-btn"
                                  style={{ textDecoration: 'none', padding: '5px 10px', fontSize: '12px' }}
                                >
                                  PDF
                                </a>
                              ) : (
                                <span style={{ color: '#64748b' }}>—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

          {activeSection === 'staffing' && (
            <div className="grid gap-4">
              <form onSubmit={handleCreatePlacement} className="cp-card grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  required
                  placeholder="Candidate Name *"
                  value={placementForm.candidateName}
                  onChange={(e) => setPlacementForm({ ...placementForm, candidateName: e.target.value })}
                  className="auth-input"
                />
                <input
                  required
                  placeholder="Contract Role Title *"
                  value={placementForm.roleTitle}
                  onChange={(e) => setPlacementForm({ ...placementForm, roleTitle: e.target.value })}
                  className="auth-input"
                />
                <input
                  type="number"
                  placeholder="Hourly Rate ($)"
                  value={placementForm.hourlyRateDollars}
                  onChange={(e) => setPlacementForm({ ...placementForm, hourlyRateDollars: e.target.value })}
                  className="auth-input"
                />
                <button type="submit" className="chat-action-btn primary w-fit">
                  Create Placement Contract
                </button>
              </form>

              {placements.map((p) => {
                const ctcUsd = (p.monthlySalaryCents || 0) / 100;
                return (
                  <div key={p.id} className="cp-card flex justify-between items-center flex-wrap gap-3">
                    <div>
                      <div className="font-bold text-white">
                        {p.candidateName} — {p.roleTitle}
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        {ctcUsd > 0
                          ? `CTC: $${ctcUsd.toFixed(2)}/mo • Employee (90%): $${(ctcUsd * 0.9).toFixed(2)} • Nexora (10%): $${(ctcUsd * 0.1).toFixed(2)}`
                          : `$${((p.hourlyRateCents || 0) / 100).toFixed(2)}/hr`} • Status: {p.onboardingStatus || p.status}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSalaryPlc(p);
                          setEditSalaryInput(String(ctcUsd || 0));
                        }}
                        className="chat-action-btn"
                      >
                        Edit Salary
                      </button>
                      <button type="button" onClick={() => handlePayrollRun(p.id)} className="chat-action-btn">
                        Run Payroll
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeSection === 'users' && (
            <div className="grid gap-5">
              <form onSubmit={handleAddTeamUser} className="cp-card grid gap-3">
                <div className="font-bold text-white flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-indigo-400" />
                  <span>Add App / Team User</span>
                </div>
                <p className="text-xs text-slate-400 m-0">
                  Invite recruiters, interviewers, admins, or finance team members to sign into your Company Portal with their own credentials.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    required
                    placeholder="Full Name *"
                    value={newUserForm.fullName}
                    onChange={(e) => setNewUserForm({ ...newUserForm, fullName: e.target.value })}
                    className="auth-input"
                  />
                  <input
                    required
                    type="email"
                    placeholder="Work Email *"
                    value={newUserForm.email}
                    onChange={(e) => setNewUserForm({ ...newUserForm, email: e.target.value })}
                    className="auth-input"
                  />
                  <input
                    required
                    type="password"
                    minLength={6}
                    placeholder="Temporary Password (min 6 chars) *"
                    value={newUserForm.password}
                    onChange={(e) => setNewUserForm({ ...newUserForm, password: e.target.value })}
                    className="auth-input"
                  />
                  <select
                    value={newUserForm.role}
                    onChange={(e) => setNewUserForm({ ...newUserForm, role: e.target.value })}
                    className="auth-input"
                  >
                    <option value="ADMIN">Admin (Full Access)</option>
                    <option value="RECRUITER">Recruiter (Vacancies &amp; Candidates)</option>
                    <option value="INTERVIEWER">Interviewer (Interviews &amp; Notes)</option>
                    <option value="FINANCE">Finance (Invoices &amp; Paystack)</option>
                  </select>
                </div>
                <button type="submit" className="chat-action-btn primary w-fit">
                  <Plus className="w-4 h-4" />
                  <span>Add Team User</span>
                </button>
              </form>

              <div className="grid gap-3">
                {teamUsers.map((u) => (
                  <div key={u.id} className="cp-card flex justify-between items-center flex-wrap gap-3">
                    <div>
                      <div className="font-bold text-white flex items-center gap-2">
                        <span>{u.fullName}</span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300">
                          {u.role}
                        </span>
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded-full ${u.status === 'ACTIVE'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-red-500/15 text-red-300'
                            }`}
                        >
                          {u.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">{u.email}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          const nextStatus = u.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
                          await apiFetch(`/api/v1/organisations/${org.id}/users/${u.id}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: nextStatus }),
                          });
                          loadAll(org.id);
                        }}
                        className="chat-action-btn"
                      >
                        {u.status === 'ACTIVE' ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/v1/organisations/${org.id}/users/${u.id}`, {
                            method: 'DELETE',
                          });
                          loadAll(org.id);
                        }}
                        className="chat-action-btn"
                        title="Remove user"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-red-300" />
                      </button>
                    </div>
                  </div>
                ))}
                {teamUsers.length === 0 && (
                  <div className="cp-card text-sm text-slate-400">No additional team users added yet.</div>
                )}
              </div>
            </div>
          )}

          {activeSection === 'settings' && (
            <form onSubmit={handleSaveSettings} className="cp-card grid gap-4 max-w-xl">
              {!org.emailVerified && (
                <div
                  style={{
                    background: 'rgba(245,158,11,0.12)',
                    border: '1px solid rgba(245,158,11,0.3)',
                    borderRadius: '10px',
                    padding: '12px',
                  }}
                >
                  <div className="text-xs text-amber-300 mb-2">
                    Email verification pending. Token: <code>{org.verificationToken}</code>
                  </div>
                  <button
                    type="button"
                    onClick={handleVerifyEmail}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 text-slate-950 font-bold text-xs"
                  >
                    Verify Organisation Email Now
                  </button>
                </div>
              )}
              <label className="text-xs text-slate-300">
                Recruitment / Application Receiving Email
                <input
                  value={settingsForm.recruitmentEmail}
                  onChange={(e) => setSettingsForm({ ...settingsForm, recruitmentEmail: e.target.value })}
                  className="auth-input mt-1"
                />
              </label>
              <label className="text-xs text-slate-300">
                Interview Coordination Email
                <input
                  value={settingsForm.interviewEmail}
                  onChange={(e) => setSettingsForm({ ...settingsForm, interviewEmail: e.target.value })}
                  className="auth-input mt-1"
                />
              </label>
              <label className="text-xs text-slate-300">
                Billing Email
                <input
                  value={settingsForm.billingEmail}
                  onChange={(e) => setSettingsForm({ ...settingsForm, billingEmail: e.target.value })}
                  className="auth-input mt-1"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={settingsForm.legalEntityArranged}
                  onChange={(e) => setSettingsForm({ ...settingsForm, legalEntityArranged: e.target.checked })}
                />
                Legal Entity Arranged (for Staffing Payroll)
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={settingsForm.taxComplianceReady}
                  onChange={(e) => setSettingsForm({ ...settingsForm, taxComplianceReady: e.target.checked })}
                />
                Tax Compliance Verified (for Staffing Payroll)
              </label>
              <button type="submit" className="chat-action-btn primary w-fit">
                Save Settings
              </button>
            </form>
          )}
        </main>
      </div>

      {/* Reschedule Interview Modal */}
      {rescheduleIv && (
        <div className="dossier-modal-overlay" onClick={() => setRescheduleIv(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!org?.id) return;
              const res = await apiFetch(
                `/api/v1/organisations/${org.id}/interviews/${rescheduleIv.id}`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(rescheduleForm),
                },
              );
              const json = await res.json().catch(() => null);
              if (json?.ok) {
                setRescheduleIv(null);
                showToast('Interview rescheduled and candidate notified!');
                loadAll(org.id);
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="dossier-modal-card grid gap-3"
            style={{ maxWidth: '440px', width: '95vw' }}
          >
            <h3 className="font-bold text-white m-0">
              Reschedule Interview — {rescheduleIv.candidateName}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <input
                required
                type="date"
                value={rescheduleForm.interviewDate}
                onChange={(e) => setRescheduleForm({ ...rescheduleForm, interviewDate: e.target.value })}
                className="auth-input"
              />
              <input
                required
                type="time"
                value={rescheduleForm.interviewTime}
                onChange={(e) => setRescheduleForm({ ...rescheduleForm, interviewTime: e.target.value })}
                className="auth-input"
              />
            </div>
            <input
              required
              placeholder="Meeting Link / Phone / Address"
              value={rescheduleForm.locationOrLink}
              onChange={(e) => setRescheduleForm({ ...rescheduleForm, locationOrLink: e.target.value })}
              className="auth-input"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRescheduleIv(null)} className="chat-action-btn">
                Cancel
              </button>
              <button type="submit" className="chat-action-btn primary">
                Save &amp; Notify Candidate
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Employee Salary / CTC Modal */}
      {editingSalaryPlc && (
        <div className="dossier-modal-overlay" onClick={() => setEditingSalaryPlc(null)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!org?.id) return;
              const val = Math.max(0, Number(editSalaryInput) || 0);
              const res = await apiFetch(
                `/api/v1/organisations/${org.id}/placements/${editingSalaryPlc.id}/salary`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ monthlyCtcUsd: val }),
                },
              );
              const json = await res.json().catch(() => null);
              if (json?.ok) {
                setEditingSalaryPlc(null);
                showToast('Employee CTC & 90/10 split updated!');
                loadAll(org.id);
              } else {
                showToast(json?.error || 'Could not update salary.');
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="dossier-modal-card grid gap-3"
            style={{ maxWidth: '440px', width: '95vw' }}
          >
            <h3 className="font-bold text-white m-0">
              Edit Monthly CTC — {editingSalaryPlc.candidateName}
            </h3>
            <div className="text-xs text-slate-400">
              Role: {editingSalaryPlc.roleTitle}
            </div>
            <div>
              <label className="text-xs text-slate-300 block mb-1">
                Max Monthly CTC (USD $)
              </label>
              <input
                required
                type="number"
                min={0}
                step="0.01"
                value={editSalaryInput}
                onChange={(e) => setEditSalaryInput(e.target.value)}
                className="auth-input"
              />
            </div>
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                background: 'rgba(16,185,129,0.1)',
                border: '1px solid rgba(16,185,129,0.28)',
                fontSize: '12px',
                color: '#cbd5e1',
              }}
            >
              <div>
                Paid to Employee (90%):{' '}
                <strong className="text-emerald-300">
                  ${((Number(editSalaryInput) || 0) * 0.9).toFixed(2)}/mo
                </strong>
              </div>
              <div className="mt-1">
                Nexora Recruiting Fee (10%):{' '}
                <strong className="text-indigo-300">
                  ${((Number(editSalaryInput) || 0) * 0.1).toFixed(2)}/mo
                </strong>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setEditingSalaryPlc(null)} className="chat-action-btn">
                Cancel
              </button>
              <button type="submit" className="chat-action-btn primary">
                Save &amp; Update Invoice
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Vacancy Modal */}
      {showVacancyModal && (
        <div className="dossier-modal-overlay" onClick={() => setShowVacancyModal(false)}>
          <form
            onSubmit={handleSaveVacancy}
            onClick={(e) => e.stopPropagation()}
            className="dossier-modal-card grid gap-3"
            style={{ maxWidth: '540px', width: '95vw', maxHeight: '90vh', overflowY: 'auto' }}
          >
            <h3 className="font-bold text-white m-0">
              {vacancyForm.id
                ? isImmigrationOrg
                  ? 'Edit Visa Program'
                  : isScholarshipOrg
                    ? 'Edit Scholarship'
                    : isInvestmentOrg
                      ? 'Edit Investment Mandate'
                      : 'Edit Vacancy'
                : isImmigrationOrg
                  ? 'Publish Visa / Relocation Program'
                  : isScholarshipOrg
                    ? 'Publish Scholarship Program'
                    : isInvestmentOrg
                      ? 'Publish Investment Mandate'
                      : 'Publish New Vacancy'}
            </h3>
            <input
              required
              placeholder={
                isImmigrationOrg
                  ? 'Visa / Relocation Program Title *'
                  : isScholarshipOrg
                    ? 'Scholarship / Fellowship Title *'
                    : isInvestmentOrg
                      ? 'Investment Mandate / Fund Title *'
                      : 'Role / Opportunity Title *'
              }
              value={vacancyForm.title}
              onChange={(e) => setVacancyForm({ ...vacancyForm, title: e.target.value })}
              className="auth-input"
            />
            {(isImmigrationOrg || vacancyForm.category === 'RELOCATION') && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    placeholder="Target Country (e.g. UK)"
                    value={vacancyForm.targetCountry}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, targetCountry: e.target.value })}
                    className="auth-input"
                  />
                  <input
                    placeholder="Visa Type (e.g. Skilled Worker)"
                    value={vacancyForm.visaType}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, visaType: e.target.value })}
                    className="auth-input"
                  />
                  <input
                    placeholder="Processing Time (e.g. 4–8 wks)"
                    value={vacancyForm.processingTime}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, processingTime: e.target.value })}
                    className="auth-input"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 block mb-1">
                    Mandatory Visa Document Checklist (comma-separated)
                  </label>
                  <input
                    placeholder="Valid Passport (>6 months), Police Clearance, Medical Certificate, Proof of Funds"
                    value={vacancyForm.requiredDocuments}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, requiredDocuments: e.target.value })}
                    className="auth-input"
                  />
                </div>
              </>
            )}
            {(isScholarshipOrg || vacancyForm.category === 'SCHOLARSHIP') && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    placeholder="Institution / University"
                    value={vacancyForm.institutionName}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, institutionName: e.target.value })}
                    className="auth-input"
                  />
                  <input
                    placeholder="Degree Level (e.g. Masters)"
                    value={vacancyForm.degreeLevel}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, degreeLevel: e.target.value })}
                    className="auth-input"
                  />
                  <input
                    placeholder="Min GPA / Score (e.g. 75%)"
                    value={vacancyForm.minGpaOrScore}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, minGpaOrScore: e.target.value })}
                    className="auth-input"
                  />
                </div>
                <input
                  placeholder="Funding Coverage (e.g. Full Tuition + Stipend)"
                  value={vacancyForm.fundingCoverage}
                  onChange={(e) => setVacancyForm({ ...vacancyForm, fundingCoverage: e.target.value })}
                  className="auth-input"
                />
                <div>
                  <label className="text-xs text-slate-300 block mb-1">
                    Mandatory Academic Checklist (comma-separated)
                  </label>
                  <input
                    placeholder="Academic Transcript, Recommendation Letters, Statement of Purpose, Valid Passport/ID"
                    value={vacancyForm.requiredDocuments}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, requiredDocuments: e.target.value })}
                    className="auth-input"
                  />
                </div>
              </>
            )}
            {(isInvestmentOrg || vacancyForm.category === 'INVESTMENT') && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <input
                    placeholder="Stage (e.g. Seed / Series A)"
                    value={vacancyForm.investmentStage}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, investmentStage: e.target.value })}
                    className="auth-input"
                  />
                  <input
                    placeholder="Sector Focus (e.g. Fintech, AI)"
                    value={vacancyForm.sectorFocus}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, sectorFocus: e.target.value })}
                    className="auth-input"
                  />
                  <input
                    placeholder="Equity / Terms (e.g. 10% Equity)"
                    value={vacancyForm.equityTerms}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, equityTerms: e.target.value })}
                    className="auth-input"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-300 block mb-1">
                    Mandatory Due Diligence Checklist (comma-separated)
                  </label>
                  <input
                    placeholder="Pitch Deck, Financial Model, Cap Table, Company Registration, Traction Metrics"
                    value={vacancyForm.requiredDocuments}
                    onChange={(e) => setVacancyForm({ ...vacancyForm, requiredDocuments: e.target.value })}
                    className="auth-input"
                  />
                </div>
              </>
            )}
            <div className="grid grid-cols-2 gap-3">
              <select
                value={vacancyForm.category}
                onChange={(e) => setVacancyForm({ ...vacancyForm, category: e.target.value })}
                className="auth-input"
              >
                <option value="EMPLOYMENT">Employment</option>
                <option value="RELOCATION">Relocation</option>
                <option value="SCHOLARSHIP">Scholarship</option>
                <option value="INVESTMENT">Investment</option>
              </select>
              <select
                value={vacancyForm.status}
                onChange={(e) => setVacancyForm({ ...vacancyForm, status: e.target.value })}
                className="auth-input"
              >
                <option value="PUBLISHED">Published</option>
                <option value="DRAFT">Draft</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>
            <input
              required
              placeholder="Location (e.g. Johannesburg, South Africa) *"
              value={vacancyForm.location}
              onChange={(e) => setVacancyForm({ ...vacancyForm, location: e.target.value })}
              className="auth-input"
            />
            <div>
              <label className="text-xs text-slate-300 block mb-1">
                {isImmigrationOrg || vacancyForm.category === 'RELOCATION'
                  ? `All-In Visa Service Fee (USD $) — Agency gets 90% ($${((Number(vacancyForm.monthlyOfferUsd) || 0) * 0.9).toFixed(2)}) • Nexora 10% ($${((Number(vacancyForm.monthlyOfferUsd) || 0) * 0.1).toFixed(2)}) on Case Acceptance`
                  : isScholarshipOrg || vacancyForm.category === 'SCHOLARSHIP'
                    ? `Total Scholarship Grant Value (USD $) — Scholar gets 90% ($${((Number(vacancyForm.monthlyOfferUsd) || 0) * 0.9).toFixed(2)}) • Nexora 10% ($${((Number(vacancyForm.monthlyOfferUsd) || 0) * 0.1).toFixed(2)})`
                    : isInvestmentOrg || vacancyForm.category === 'INVESTMENT'
                      ? `Investment Ticket / Capital Allocation (USD $) — Deployed 90% ($${((Number(vacancyForm.monthlyOfferUsd) || 0) * 0.9).toFixed(2)}) • Nexora 10% ($${((Number(vacancyForm.monthlyOfferUsd) || 0) * 0.1).toFixed(2)})`
                      : `Max Monthly Budget / CTC (USD $) — Candidate gets 90% ($${((Number(vacancyForm.monthlyOfferUsd) || 0) * 0.9).toFixed(2)}/mo) • Nexora 10% ($${((Number(vacancyForm.monthlyOfferUsd) || 0) * 0.1).toFixed(2)}/mo)`}
              </label>
              <input
                required
                type="number"
                min={0}
                placeholder="Monthly Offer in USD (e.g. 3500)"
                value={vacancyForm.monthlyOfferUsd}
                onChange={(e) => setVacancyForm({ ...vacancyForm, monthlyOfferUsd: e.target.value })}
                className="auth-input"
              />
            </div>
            <input
              placeholder="Skills (comma-separated, e.g. React, TypeScript, Node.js)"
              value={vacancyForm.requiredSkills}
              onChange={(e) => setVacancyForm({ ...vacancyForm, requiredSkills: e.target.value })}
              className="auth-input"
            />
            <textarea
              required
              rows={3}
              placeholder="Description *"
              value={vacancyForm.description}
              onChange={(e) => setVacancyForm({ ...vacancyForm, description: e.target.value })}
              className="auth-input"
            />
            <textarea
              required
              rows={2}
              placeholder="Requirements *"
              value={vacancyForm.requirements}
              onChange={(e) => setVacancyForm({ ...vacancyForm, requirements: e.target.value })}
              className="auth-input"
            />
            <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={vacancyForm.requiresAssessment}
                onChange={(e) => setVacancyForm({ ...vacancyForm, requiresAssessment: e.target.checked })}
              />
              <span>Require Verified Assessment Transcript (skip applicants without a transcript)</span>
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowVacancyModal(false)} className="chat-action-btn">
                Cancel
              </button>
              <button type="submit" className="chat-action-btn primary">
                Save Vacancy
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Schedule Interview Modal */}
      {interviewModalApp && (
        <div className="dossier-modal-overlay" onClick={() => setInterviewModalApp(null)}>
          <form
            onSubmit={handleScheduleInterview}
            onClick={(e) => e.stopPropagation()}
            className="dossier-modal-card grid gap-3"
            style={{ maxWidth: '460px', width: '95vw' }}
          >
            <h3 className="font-bold text-white m-0">
              Schedule Interview — {interviewModalApp.candidateName}
            </h3>
            <select
              value={interviewForm.interviewType}
              onChange={(e) => setInterviewForm({ ...interviewForm, interviewType: e.target.value })}
              className="auth-input"
            >
              <option value="ONLINE">Online Video</option>
              <option value="TELEPHONE">Telephone</option>
              <option value="IN_PERSON">In-Person</option>
            </select>

            {interviewForm.interviewType === 'ONLINE' && (
              <div className="grid gap-2">
                <div className="text-xs font-bold text-slate-300">
                  Meeting Engine (billed on your monthly invoice)
                </div>
                {(
                  [
                    {
                      id: 'GOOGLE_LIVE',
                      title: 'Google Live AI Interview',
                      price: '$0.50 / min',
                      desc: 'Real-time voice & webcam AI interviewer + auto-saved Firebase recording & transcript.',
                    },
                    {
                      id: 'NUANCE',
                      title: 'Nuance AI Video Persona',
                      price: '$2.00 / min',
                      desc: 'Photorealistic full-duplex AI video interviewer + auto-saved Firebase recording.',
                    },
                    {
                      id: 'EXTERNAL',
                      title: 'Own / External Meeting Link',
                      price: 'Free',
                      desc: 'Use your own Google Meet, Zoom, Microsoft Teams, or Jitsi link.',
                    },
                  ] as const
                ).map((opt) => {
                  const selected = interviewForm.interviewProvider === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setInterviewForm({ ...interviewForm, interviewProvider: opt.id })}
                      style={{
                        textAlign: 'left',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        background: selected ? 'rgba(16, 185, 129, 0.14)' : '#18181b',
                        border: selected ? '1px solid #10b981' : '1px solid #2e2e2e',
                        cursor: 'pointer',
                      }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-white">{opt.title}</span>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: opt.id === 'EXTERNAL' ? 'rgba(100,116,139,0.25)' : 'rgba(16,185,129,0.22)',
                            color: opt.id === 'EXTERNAL' ? '#cbd5e1' : '#6ee7b7',
                          }}
                        >
                          {opt.price}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '3px' }}>{opt.desc}</div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <input
                required
                type="date"
                value={interviewForm.interviewDate}
                onChange={(e) => setInterviewForm({ ...interviewForm, interviewDate: e.target.value })}
                className="auth-input"
              />
              <input
                required
                type="time"
                value={interviewForm.interviewTime}
                onChange={(e) => setInterviewForm({ ...interviewForm, interviewTime: e.target.value })}
                className="auth-input"
              />
            </div>
            <select
              value={interviewForm.timezone}
              onChange={(e) => setInterviewForm({ ...interviewForm, timezone: e.target.value })}
              className="auth-input"
            >
              <option value="Africa/Johannesburg">Africa/Johannesburg (SAST)</option>
              <option value="UTC">UTC</option>
              <option value="Europe/London">Europe/London (GMT/BST)</option>
              <option value="America/New_York">America/New_York (EST/EDT)</option>
              <option value="Asia/Dubai">Asia/Dubai (GST)</option>
            </select>
            {(interviewForm.interviewType !== 'ONLINE' || interviewForm.interviewProvider === 'EXTERNAL') ? (
              <div className="flex gap-2">
                <input
                  required
                  placeholder={
                    interviewForm.interviewType === 'ONLINE'
                      ? 'Meeting Link (Google Meet / Zoom / Teams / Jitsi) *'
                      : interviewForm.interviewType === 'TELEPHONE'
                        ? 'Telephone Number *'
                        : 'Office Street Address *'
                  }
                  value={interviewForm.locationOrLink}
                  onChange={(e) => setInterviewForm({ ...interviewForm, locationOrLink: e.target.value })}
                  className="auth-input"
                  style={{ flex: 1 }}
                />
                {interviewForm.interviewType === 'ONLINE' && (
                  <button
                    type="button"
                    onClick={() =>
                      setInterviewForm({
                        ...interviewForm,
                        locationOrLink: `https://meet.jit.si/nexora-interview-${Date.now().toString(36)}`,
                      })
                    }
                    className="chat-action-btn"
                    style={{ whiteSpace: 'nowrap' }}
                  >
                    + Auto Meet Link
                  </button>
                )}
              </div>
            ) : (
              <div className="grid gap-2">
                <label className="text-xs font-bold text-emerald-300">
                  AI Interview Questions (Required — fed directly to{' '}
                  {interviewForm.interviewProvider === 'NUANCE' ? 'Nuance AI' : 'Google Live AI'}) *
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder={
                    '1. Walk me through a challenging production project you led.\n2. How do you handle tight deadlines and technical trade-offs?\n3. What excites you about this role?'
                  }
                  value={interviewForm.aiQuestions}
                  onChange={(e) => setInterviewForm({ ...interviewForm, aiQuestions: e.target.value })}
                  className="auth-input"
                />
                <div
                  style={{
                    padding: '9px 12px',
                    borderRadius: '10px',
                    background: 'rgba(16, 185, 129, 0.1)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    fontSize: '11.5px',
                    color: '#a7f3d0',
                  }}
                >
                  Nexora AI room is provisioned automatically. Recording saves to Firebase when the candidate ends the call, and usage (
                  {interviewForm.interviewProvider === 'NUANCE' ? '$2.00/min' : '$0.50/min'}) is added to your monthly invoice.
                </div>
              </div>
            )}
            <textarea
              rows={2}
              placeholder="Preparation instructions for candidate"
              value={interviewForm.instructions}
              onChange={(e) => setInterviewForm({ ...interviewForm, instructions: e.target.value })}
              className="auth-input"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setInterviewModalApp(null)} className="chat-action-btn">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs">
                Send Invitation &amp; .ics
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Message Candidate Modal */}
      {messageModalApp && (
        <div className="dossier-modal-overlay" onClick={() => setMessageModalApp(null)}>
          <form
            onSubmit={handleSendCandidateMessage}
            onClick={(e) => e.stopPropagation()}
            className="dossier-modal-card grid gap-3"
            style={{ maxWidth: '460px', width: '95vw' }}
          >
            <h3 className="font-bold text-white m-0">Message {messageModalApp.candidateName}</h3>
            <input
              required
              placeholder="Subject"
              value={messageForm.subject}
              onChange={(e) => setMessageForm({ ...messageForm, subject: e.target.value })}
              className="auth-input"
            />
            <textarea
              required
              rows={4}
              placeholder="Write your message..."
              value={messageForm.body}
              onChange={(e) => setMessageForm({ ...messageForm, body: e.target.value })}
              className="auth-input"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setMessageModalApp(null)} className="chat-action-btn">
                Cancel
              </button>
              <button type="submit" className="chat-action-btn primary">
                <Send className="w-3.5 h-3.5" />
                <span>Send Email &amp; Notification</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
