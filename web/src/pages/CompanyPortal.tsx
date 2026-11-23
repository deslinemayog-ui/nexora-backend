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
  { value: 'HIRING_COMPANY', label: 'Hiring Company / Employer' },
  { value: 'RECRUITMENT_AGENCY', label: 'Recruitment Agency' },
  { value: 'STAFFING_COMPANY', label: 'Staffing Company' },
  { value: 'RELOCATION_AGENCY', label: 'Relocation Agency' },
  { value: 'SCHOLARSHIP_PROVIDER', label: 'Scholarship Provider' },
  { value: 'INVESTMENT_PROVIDER', label: 'Investment Opportunity Provider' },
  { value: 'EDUCATIONAL_INSTITUTION', label: 'Educational Institution' },
  { value: 'IMMIGRATION_CONSULTANCY', label: 'Immigration Consultancy' },
  { value: 'OTHER_PROVIDER', label: 'Other Opportunity Provider' },
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

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const activeSection = pathname.includes('/vacancies')
    ? 'vacancies'
    : pathname.includes('/applications')
      ? 'applications'
      : pathname.includes('/candidates')
        ? 'candidates'
        : pathname.includes('/interviews')
          ? 'interviews'
          : pathname.includes('/settings')
            ? 'settings'
            : pathname.includes('/billing')
              ? 'billing'
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
      if (ref && invId) {
        apiFetch(`/api/v1/organisations/${org.id}/invoices/${invId}/paystack/verify/${encodeURIComponent(ref)}`)
          .then((r) => r.json())
          .then((j) => {
            if (j?.ok) {
              showToast('Invoice paid and verified via Paystack!');
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
        locationOrLink: interviewForm.locationOrLink || 'Provided by organisation',
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
                      <li>Publish jobs, scholarships, relocation, or investment offers with a Monthly USD Value.</li>
                      <li>Choose whether applicants must include a verified AI Assessment Transcript.</li>
                      <li>Receive AI-scored CVs (0–100%), shortlist candidates, and send .ics calendar invites.</li>
                      <li>Transparent 10% monthly platform fee (invoiced monthly via Paystack) only on accepted candidates.</li>
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
          </div>
        </div>
      </div>
    );
  }

  const stats = dashboardData?.stats || {};
  const navItems = [
    { key: 'dashboard', label: 'Overview', icon: Building2, path: `${prefix}/dashboard` },
    { key: 'vacancies', label: 'Vacancies', icon: Briefcase, path: `${prefix}/vacancies`, badge: vacancies.length },
    { key: 'applications', label: 'Applications', icon: FileText, path: `${prefix}/applications`, badge: applications.length },
    { key: 'candidates', label: 'Talent Search', icon: Users, path: `${prefix}/candidates` },
    { key: 'interviews', label: 'Interviews', icon: CalendarDays, path: `${prefix}/interviews`, badge: interviews.length },
    { key: 'billing', label: 'Billing & 10% Fees', icon: DollarSign, path: `${prefix}/billing`, badge: invoices.filter((i) => i.status === 'PENDING').length },
    { key: 'staffing', label: 'Staffing & Payroll', icon: ShieldCheck, path: `${prefix}/staffing` },
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
            onClick={() => onNavigate('/app')}
            className="cp-nav-btn"
          >
            <span className="flex items-center gap-2">
              <ArrowLeft className="w-4 h-4" />
              <span>Candidate App</span>
            </span>
          </button>
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
                  status: 'PUBLISHED',
                });
                setShowVacancyModal(true);
              }}
              className="chat-action-btn primary"
            >
              <Plus className="w-4 h-4" />
              <span>Publish Vacancy</span>
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
          {activeSection === 'dashboard' && (
            <div className="grid gap-5">
              <div className="cp-stat-grid">
                {[
                  { label: 'Active Vacancies', value: stats.activeVacancies ?? 0, accent: '#818cf8' },
                  { label: 'Total Applications', value: stats.totalApplications ?? 0, accent: '#38bdf8' },
                  { label: 'Shortlisted', value: stats.shortlistedCandidates ?? 0, accent: '#fcd34d' },
                  { label: 'Interviews', value: stats.interviewsScheduled ?? 0, accent: '#34d399' },
                  { label: 'Pending 10% Invoices', value: invoices.filter((i) => i.status === 'PENDING').length, accent: '#f472b6' },
                ].map((card) => (
                  <div key={card.label} className="cp-card" style={{ borderTop: `3px solid ${card.accent}` }}>
                    <div className="text-xs text-slate-400">{card.label}</div>
                    <div className="text-2xl font-extrabold text-white mt-1">{card.value}</div>
                  </div>
                ))}
              </div>

              <div className="cp-card" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(15,23,42,0.9))', borderColor: 'rgba(99,102,241,0.3)' }}>
                <div className="flex items-center gap-2 font-bold text-white mb-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  Employer AI Assistant
                </div>
                <p className="text-xs text-slate-300 mb-3">
                  Draft job descriptions, rank applicants, summarise CVs, or prepare candidate messages.
                </p>
                <form onSubmit={handleAskEmployerAi} className="flex gap-2 flex-wrap">
                  <select
                    value={aiAction}
                    onChange={(e) => setAiAction(e.target.value as any)}
                    className="auth-input"
                    style={{ width: 'auto' }}
                  >
                    <option value="DRAFT_JD">Draft Job Description</option>
                    <option value="MATCH_CANDIDATES">Match Candidates</option>
                    <option value="SUMMARISE_CANDIDATE">Summarise Candidate</option>
                    <option value="DRAFT_MESSAGE">Draft Candidate Message</option>
                  </select>
                  <input
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="Describe the role, candidate, or message..."
                    className="auth-input"
                    style={{ flex: 1, minWidth: '220px' }}
                  />
                  <button type="submit" disabled={aiBusy} className="chat-action-btn primary">
                    {aiBusy ? 'Thinking...' : 'Ask AI'}
                  </button>
                </form>
                {aiReply && (
                  <div
                    style={{
                      marginTop: '12px',
                      padding: '14px',
                      borderRadius: '10px',
                      background: 'rgba(15,23,42,0.85)',
                      fontSize: '13px',
                      color: '#e2e8f0',
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {aiReply}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSection === 'vacancies' && (
            <div className="grid gap-3">
              {vacancies.map((v) => {
                const publicUrl = `${window.location.origin}/opportunity/${v.id}`;
                return (
                  <div key={v.id} className="cp-card flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <div className="font-bold text-white">{v.title}</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {v.category} • {v.location} • {v.workArrangement} • Status: {v.status}
                        {v.monthlyOfferUsd ? ` • Offer: $${v.monthlyOfferUsd}/mo (10% Nexora fee: $${(v.monthlyOfferUsd * 0.1).toFixed(2)}/mo)` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
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
                            status: v.status === 'PUBLISHED' ? 'CLOSED' : 'PUBLISHED',
                          });
                          setShowVacancyModal(true);
                        }}
                        className="chat-action-btn"
                      >
                        Edit / Toggle Status
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

          {activeSection === 'applications' && (
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                <div className="text-xs text-slate-400">Applicants are automatically ranked by AI CV Match Score.</div>
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
              {[...applications]
                .sort((a, b) => (b.aiMatchScore ?? 0) - (a.aiMatchScore ?? 0))
                .map((app) => (
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
                      <div className="flex gap-3 mt-2 text-xs">
                        {app.cvDownloadUrl && (
                          <a href={resolveApiUrl(app.cvDownloadUrl)} target="_blank" rel="noreferrer" className="text-indigo-400 underline">
                            View CV
                          </a>
                        )}
                        {app.transcriptPdfUrl && (
                          <a href={resolveApiUrl(app.transcriptPdfUrl)} target="_blank" rel="noreferrer" className="text-emerald-400 underline">
                            View Transcript PDF
                          </a>
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
                          Accept / Hire
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
              {applications.length === 0 && (
                <div className="cp-card text-sm text-slate-400">No applications received yet.</div>
              )}
            </div>
          )}

          {activeSection === 'candidates' && (
            <div className="grid gap-4">
              <div className="flex gap-2">
                <input
                  value={candidateQuery}
                  onChange={(e) => setCandidateQuery(e.target.value)}
                  placeholder="Search authorised candidates by name, email, role, or skills..."
                  className="auth-input"
                  style={{ flex: 1 }}
                />
                <button type="button" onClick={handleSearchCandidates} className="chat-action-btn primary">
                  <Search className="w-4 h-4" />
                  <span>Search</span>
                </button>
              </div>
              <div className="grid gap-3">
                {candidates.map((c, idx) => (
                  <div key={`${c.userUid || c.customerId}-${idx}`} className="cp-card">
                    <div className="font-bold text-white">{c.candidateName}</div>
                    <div className="text-xs text-slate-400 mt-1">
                      {c.candidateEmail} • Assessment Score: {c.assessmentScore ?? 'N/A'}%
                    </div>
                  </div>
                ))}
                {candidates.length === 0 && (
                  <div className="cp-card text-xs text-slate-400">
                    Only candidates who applied or consented to discovery appear here. All document access is logged.
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSection === 'interviews' && (
            <div className="grid gap-3">
              {interviews.map((iv) => (
                <div key={iv.id} className="cp-card flex justify-between items-center flex-wrap gap-3">
                  <div>
                    <div className="font-bold text-white">
                      {iv.candidateName} — {iv.jobTitle}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {iv.interviewType} • {iv.interviewDate} {iv.interviewTime} ({iv.timezone}) • Status: {iv.status}
                    </div>
                  </div>
                  <div className="text-xs text-indigo-300">{iv.locationOrLink}</div>
                </div>
              ))}
              {interviews.length === 0 && (
                <div className="cp-card text-sm text-slate-400">No interviews scheduled yet.</div>
              )}
            </div>
          )}

          {activeSection === 'billing' && (
            <div className="grid gap-4">
              <div className="cp-card flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-bold text-white">10% Monthly Success-Only Billing</div>
                  <div className="text-xs text-slate-400 mt-1">
                    Nexora invoices 10% per month of the USD offer value for every accepted/hired placement.
                  </div>
                </div>
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
                      showToast(`Generated/refreshed ${json.data.length} monthly invoice(s).`);
                      loadAll(org.id);
                    }
                  }}
                  className="chat-action-btn primary"
                >
                  Generate This Month&apos;s Invoices
                </button>
              </div>

              {invoices.map((inv) => (
                <div key={inv.id} className="cp-card flex justify-between items-center flex-wrap gap-3">
                  <div>
                    <div className="font-bold text-white">
                      {inv.invoiceNumber} — {inv.candidateName} ({inv.vacancyTitle})
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      Month: {inv.billingMonth} • Offer: ${Number(inv.offerAmountUsd).toFixed(2)} USD • Nexora Fee ({inv.feePercent}%):{' '}
                      <strong className="text-emerald-300">${Number(inv.feeAmountUsd).toFixed(2)} USD</strong> • Status: {inv.status}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {inv.pdfDownloadUrl && (
                      <a href={resolveApiUrl(inv.pdfDownloadUrl)} target="_blank" rel="noreferrer" className="chat-action-btn" style={{ textDecoration: 'none' }}>
                        Download Invoice PDF
                      </a>
                    )}
                    {inv.status !== 'PAID' ? (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!org?.id) return;
                          const callbackUrl = `${window.location.origin}${prefix}/billing?invoiceId=${encodeURIComponent(inv.id)}`;
                          const res = await apiFetch(`/api/v1/organisations/${org.id}/invoices/${inv.id}/paystack/initialize`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ callbackUrl }),
                          });
                          const json = await res.json().catch(() => null);
                          if (json?.ok && json.data?.authorizationUrl) {
                            window.open(json.data.authorizationUrl, '_blank', 'noopener,noreferrer');
                            showToast('Paystack checkout opened in a new tab.');
                          } else {
                            showToast(json?.error || 'Could not initialize Paystack payment.');
                          }
                        }}
                        className="px-3 py-2 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs"
                      >
                        Pay ${Number(inv.feeAmountUsd).toFixed(2)} via Paystack
                      </button>
                    ) : (
                      <span className="text-xs px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-300 font-bold">
                        Paid ✓
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {invoices.length === 0 && (
                <div className="cp-card text-sm text-slate-400">
                  No invoices yet. Accept/Hire a candidate on a vacancy with a Monthly USD Offer to generate the 10% monthly invoice.
                </div>
              )}
            </div>
          )}

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

              {placements.map((p) => (
                <div key={p.id} className="cp-card flex justify-between items-center flex-wrap gap-3">
                  <div>
                    <div className="font-bold text-white">
                      {p.candidateName} — {p.roleTitle}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      ${((p.hourlyRateCents || 0) / 100).toFixed(2)}/hr • Status: {p.onboardingStatus || p.status}
                    </div>
                  </div>
                  <button type="button" onClick={() => handlePayrollRun(p.id)} className="chat-action-btn">
                    Run Payroll
                  </button>
                </div>
              ))}
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
                          className={`text-[11px] px-2 py-0.5 rounded-full ${
                            u.status === 'ACTIVE'
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
                  checked={settingsForm.requireTranscript}
                  onChange={(e) => setSettingsForm({ ...settingsForm, requireTranscript: e.target.checked })}
                />
                Require Verified Assessment Transcript (skip applicants without a transcript)
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
              {vacancyForm.id ? 'Edit Vacancy' : 'Publish New Vacancy'}
            </h3>
            <input
              required
              placeholder="Role / Opportunity Title *"
              value={vacancyForm.title}
              onChange={(e) => setVacancyForm({ ...vacancyForm, title: e.target.value })}
              className="auth-input"
            />
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
                Monthly Offer / Package Value (USD $) — Nexora 10% Monthly Fee: $
                {((Number(vacancyForm.monthlyOfferUsd) || 0) * 0.1).toFixed(2)}/mo
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
