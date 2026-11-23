import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  FileText,
  AlertCircle,
  Play,
  ArrowLeft,
  Download,
  Award,
  Briefcase,
  Globe2,
  GraduationCap,
} from 'lucide-react';

interface AssignmentsViewProps {
  userUid: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string;
  cvFileName?: string;
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
  resolveApiUrl: (url?: string) => string;
  onClose: () => void;
  onOpenPrerequisites?: (assignment: any) => void;
  refreshKey?: number;
}

type CategoryTab = 'EMPLOYMENT' | 'RELOCATION' | 'SCHOLARSHIP';

const STATUS_BADGE: Record<string, { label: string; bg: string; color: string }> = {
  NOT_STARTED: { label: 'Not Started', bg: 'rgba(100,116,139,0.2)', color: '#cbd5e1' },
  PREREQUISITES_REQUIRED: { label: 'Prerequisites Required', bg: 'rgba(245,158,11,0.18)', color: '#fcd34d' },
  READY_TO_START: { label: 'Ready to Start', bg: 'rgba(6,182,212,0.18)', color: '#67e8f9' },
  IN_PROGRESS: { label: 'In Progress', bg: 'rgba(59,130,246,0.2)', color: '#93c5fd' },
  SUBMITTED: { label: 'Submitted', bg: 'rgba(99,102,241,0.2)', color: '#c7d2fe' },
  UNDER_REVIEW: { label: 'Under Review', bg: 'rgba(168,85,247,0.2)', color: '#e9d5ff' },
  PASSED: { label: 'Passed', bg: 'rgba(16,185,129,0.2)', color: '#6ee7b7' },
  FAILED: { label: 'Failed', bg: 'rgba(239,68,68,0.2)', color: '#fca5a5' },
  EXPIRED: { label: 'Expired', bg: 'rgba(100,116,139,0.25)', color: '#94a3b8' },
};

export const AssignmentsView: React.FC<AssignmentsViewProps> = ({
  userUid,
  candidateName,
  candidateEmail,
  candidatePhone,
  cvFileName,
  apiFetch,
  resolveApiUrl,
  onClose,
  onOpenPrerequisites,
  refreshKey,
}) => {
  const [activeTab, setActiveTab] = useState<CategoryTab>('EMPLOYMENT');
  const [assignments, setAssignments] = useState<any[]>([]);
  const [transcripts, setTranscripts] = useState<any[]>([]);
  const [publicVacancies, setPublicVacancies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sub-views: list | prereq | instructions | runner | result
  const [mode, setMode] = useState<'list' | 'prereq' | 'instructions' | 'runner' | 'result'>('list');
  const [selectedAsg, setSelectedAsg] = useState<any | null>(null);
  const [prereqForm, setPrereqForm] = useState<Record<string, any>>({});
  const [rulesAccepted, setRulesAccepted] = useState(false);

  // Active timed assessment session
  const [session, setSession] = useState<any | null>(null);
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [remainingSec, setRemainingSec] = useState(0);
  const [questionStartMs, setQuestionStartMs] = useState(Date.now());
  const [resultData, setResultData] = useState<any | null>(null);
  const [startingSession, setStartingSession] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [asgRes, trnRes, vacRes] = await Promise.all([
        apiFetch(`/api/v1/assignments?userUid=${encodeURIComponent(userUid)}`),
        apiFetch(`/api/v1/transcripts?userUid=${encodeURIComponent(userUid)}`),
        apiFetch(`/api/v1/public/vacancies`),
      ]);
      const [asgJson, trnJson, vacJson] = await Promise.all([
        asgRes.json().catch(() => null),
        trnRes.json().catch(() => null),
        vacRes.json().catch(() => null),
      ]);
      if (asgJson?.ok) setAssignments(asgJson.data || []);
      if (trnJson?.ok) setTranscripts(trnJson.data || []);
      if (vacJson?.ok) setPublicVacancies(vacJson.data || []);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not load assignments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [userUid, refreshKey]);

  // Server-synced countdown timer
  useEffect(() => {
    if (mode !== 'runner' || !session?.expiresAt) return;
    const tick = () => {
      const secs = Math.max(0, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000));
      setRemainingSec(secs);
      if (secs <= 0 && !submitting) {
        void handleSubmitAssessment();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [mode, session?.id, session?.expiresAt]);

  const filteredAssignments = assignments.filter((a) => a.category === activeTab);

  const openPrereqs = (asg: any) => {
    if (onOpenPrerequisites) {
      onOpenPrerequisites(asg);
      return;
    }
    setSelectedAsg(asg);
    setPrereqForm({
      fullName: candidateName || '',
      email: candidateEmail || '',
      cvFileName: cvFileName || '',
      ...(asg.prerequisiteData || {}),
    });
    setMode('prereq');
  };

  const handleSavePrerequisites = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsg) return;
    setErrorMsg(null);
    const res = await apiFetch(`/api/v1/assignments/${selectedAsg.id}/prerequisites`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userUid, data: prereqForm }),
    });
    const json = await res.json().catch(() => null);
    if (res.ok && json?.ok) {
      setSelectedAsg(json.data);
      await loadData();
      if (json.data.prerequisitesMet) {
        setRulesAccepted(false);
        setMode('instructions');
      } else {
        setErrorMsg(`Missing required details: ${(json.data.missingPrerequisites || []).join(', ')}`);
      }
    } else {
      setErrorMsg(json?.error || 'Could not save prerequisites');
    }
  };

  const handleStartAssignmentClick = (asg: any) => {
    setSelectedAsg(asg);
    setErrorMsg(null);
    if (!asg.prerequisitesMet) {
      openPrereqs(asg);
      return;
    }
    setRulesAccepted(false);
    setMode('instructions');
  };

  const handleLaunchTimedSession = async () => {
    if (!selectedAsg || !rulesAccepted || startingSession) return;
    setErrorMsg(null);
    setStartingSession(true);
    try {
      const res = await apiFetch(`/api/v1/assignments/${selectedAsg.id}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userUid, rulesAccepted: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setErrorMsg(json?.error || 'Unable to start assessment');
        return;
      }
      const ses = json.data.session;
      const restoredAnswers: Record<string, number> = {};
      if (ses.answers) {
        for (const [qId, ans] of Object.entries<any>(ses.answers)) {
          restoredAnswers[qId] = ans.selectedIndex;
        }
      }
      setSession(ses);
      setAnswers(restoredAnswers);
      setCurrentQIdx(0);
      setQuestionStartMs(Date.now());
      setMode('runner');
    } finally {
      setStartingSession(false);
    }
  };

  const handleSelectOption = async (questionId: string, optionIdx: number) => {
    setAnswers((prev) => ({ ...prev, [questionId]: optionIdx }));
    if (!session) return;
    const spentSec = Math.round((Date.now() - questionStartMs) / 1000);
    await apiFetch(`/api/v1/assessments/sessions/${session.id}/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userUid,
        questionId,
        selectedIndex: optionIdx,
        timeSpentSec: spentSec,
      }),
    }).catch(() => undefined);
  };

  const handleSubmitAssessment = async () => {
    if (!session || submitting) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/v1/assessments/sessions/${session.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userUid }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setResultData(json.data);
        setMode('result');
        await loadData();
      } else {
        setErrorMsg(json?.error || 'Could not submit assessment');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px', maxWidth: '1040px', margin: '0 auto', width: '100%' }}>
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h2 className="text-xl font-extrabold text-white m-0">Assignments & Assessments</h2>
          <p className="text-xs text-slate-400 m-0 mt-1">
            Complete prerequisites, pass tailored AI assessments, and link verified PDF transcripts to your CV.
          </p>
        </div>
        <button onClick={onClose} className="chat-action-btn">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Chat</span>
        </button>
      </div>

      {errorMsg && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '10px',
            background: 'rgba(239, 68, 68, 0.14)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#fca5a5',
            fontSize: '12.5px',
            marginBottom: '14px',
          }}
        >
          {errorMsg}
        </div>
      )}

      {mode === 'list' && (
        <>
          {/* Exactly 3 Category Tabs: Employment, Relocation, Scholarships */}
          <div className="flex gap-2 mb-5 flex-wrap">
            {(
              [
                { id: 'EMPLOYMENT', label: 'Employment', icon: Briefcase },
                { id: 'RELOCATION', label: 'Relocation', icon: Globe2 },
                { id: 'SCHOLARSHIP', label: 'Scholarships', icon: GraduationCap },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`chat-action-btn ${active ? 'primary' : ''}`}
                  style={{ padding: '8px 16px' }}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {loading ? (
            <div className="text-sm text-slate-400 py-8">Loading your assignments...</div>
          ) : (
            <div className="grid gap-3 mb-8">
              {filteredAssignments.map((asg) => {
                const badge = STATUS_BADGE[asg.status] || STATUS_BADGE.NOT_STARTED;
                return (
                  <div
                    key={asg.id}
                    style={{
                      padding: '16px',
                      borderRadius: '14px',
                      background: '#18181b',
                      border: '1px solid #2e2e2e',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '14px',
                    }}
                  >
                    <div style={{ minWidth: 0, flex: '1 1 280px' }}>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-bold text-white">{asg.title}</span>
                        <span
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '999px',
                            background: badge.bg,
                            color: badge.color,
                          }}
                        >
                          {badge.label}
                        </span>
                      </div>
                      <div className="text-xs text-slate-300">{asg.relatedOpportunity}</div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Provider: {asg.providerName || 'Nexora AI'} • Duration: {asg.durationMinutes} min • Assigned:{' '}
                        {new Date(asg.createdAt).toLocaleDateString()}
                      </div>
                      {!asg.prerequisitesMet && asg.missingPrerequisites?.length > 0 && (
                        <div className="text-[11px] text-amber-300 mt-1.5 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Missing prerequisites: {asg.missingPrerequisites.slice(0, 3).join(', ')}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button onClick={() => openPrereqs(asg)} className="chat-action-btn">
                        <FileText className="w-3.5 h-3.5" />
                        <span>{asg.prerequisitesMet ? 'Edit Prerequisites' : 'Complete Prerequisites'}</span>
                      </button>
                      <button
                        onClick={() => handleStartAssignmentClick(asg)}
                        className="chat-action-btn primary"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>
                          {asg.status === 'IN_PROGRESS'
                            ? 'Resume Assignment'
                            : asg.status === 'PASSED' || asg.status === 'FAILED'
                              ? 'Retake Assignment'
                              : 'Start Assignment'}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Assessment Transcripts Linked to CV */}
          <div className="mb-8">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
              <Award className="w-4 h-4 text-emerald-400" />
              <span>Saved Assessment Transcripts ({transcripts.length})</span>
            </h3>
            {transcripts.length === 0 ? (
              <div className="text-xs text-slate-400 p-4 rounded-xl bg-[#18181b] border border-[#2e2e2e]">
                Complete an assessment above to generate a permanent PDF transcript linked to your CV.
              </div>
            ) : (
              <div className="grid gap-2.5">
                {transcripts.map((trn) => (
                  <div
                    key={trn.id}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '12px',
                      background: '#18181b',
                      border: '1px solid #2e2e2e',
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '10px',
                    }}
                  >
                    <div>
                      <div className="text-xs font-bold text-white">
                        {trn.assignmentTitle} — {trn.percentageScore}% ({trn.passed ? 'PASSED' : 'FAILED'})
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Linked CV: {trn.cvFileName || 'Candidate Profile'} • {trn.correctCount}/{trn.totalQuestions} correct •{' '}
                        {new Date(trn.submittedAt).toLocaleString()}
                      </div>
                    </div>
                    {trn.pdfDownloadUrl && (
                      <a
                        href={resolveApiUrl(trn.pdfDownloadUrl)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="chat-action-btn"
                        style={{ textDecoration: 'none' }}
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Transcript PDF</span>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Prerequisite Form */}
      {mode === 'prereq' && selectedAsg && (
        <form
          onSubmit={handleSavePrerequisites}
          style={{
            padding: '20px',
            borderRadius: '16px',
            background: '#18181b',
            border: '1px solid #2e2e2e',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white m-0">
              {selectedAsg.category} Prerequisites — {selectedAsg.title}
            </h3>
            <button type="button" onClick={() => setMode('list')} className="chat-action-btn">
              Cancel
            </button>
          </div>

          {selectedAsg.category === 'EMPLOYMENT' && (
            <>
              <input
                className="auth-input"
                placeholder="CV File Name or Summary *"
                value={prereqForm.cvSummary || prereqForm.cvFileName || ''}
                onChange={(e) => setPrereqForm({ ...prereqForm, cvSummary: e.target.value })}
                required
              />
              <textarea
                className="auth-input"
                rows={2}
                placeholder="Employment History (Companies, Roles, Dates) *"
                value={prereqForm.employmentHistory || ''}
                onChange={(e) => setPrereqForm({ ...prereqForm, employmentHistory: e.target.value })}
                required
              />
              <input
                className="auth-input"
                placeholder="Educational Qualifications *"
                value={prereqForm.education || ''}
                onChange={(e) => setPrereqForm({ ...prereqForm, education: e.target.value })}
                required
              />
              <input
                className="auth-input"
                placeholder="Technical / Core Skills (comma separated) *"
                value={prereqForm.skills || ''}
                onChange={(e) => setPrereqForm({ ...prereqForm, skills: e.target.value })}
                required
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input
                  type="number"
                  min={0}
                  className="auth-input"
                  placeholder="Years of Experience *"
                  value={prereqForm.yearsOfExperience ?? ''}
                  onChange={(e) => setPrereqForm({ ...prereqForm, yearsOfExperience: e.target.value })}
                  required
                />
                <input
                  className="auth-input"
                  placeholder="Preferred Job Position *"
                  value={prereqForm.preferredPosition || ''}
                  onChange={(e) => setPrereqForm({ ...prereqForm, preferredPosition: e.target.value })}
                  required
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input
                  className="auth-input"
                  placeholder="Preferred Countries *"
                  value={prereqForm.preferredCountries || ''}
                  onChange={(e) => setPrereqForm({ ...prereqForm, preferredCountries: e.target.value })}
                  required
                />
                <input
                  className="auth-input"
                  placeholder="Work Availability (e.g. Immediate, 2 weeks) *"
                  value={prereqForm.availability || ''}
                  onChange={(e) => setPrereqForm({ ...prereqForm, availability: e.target.value })}
                  required
                />
              </div>
              <input
                className="auth-input"
                placeholder="Relevant Certifications (Optional)"
                value={prereqForm.certifications || ''}
                onChange={(e) => setPrereqForm({ ...prereqForm, certifications: e.target.value })}
              />
            </>
          )}

          {selectedAsg.category === 'RELOCATION' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input
                  className="auth-input"
                  placeholder="Current Country of Residence *"
                  value={prereqForm.currentCountry || ''}
                  onChange={(e) => setPrereqForm({ ...prereqForm, currentCountry: e.target.value })}
                  required
                />
                <input
                  className="auth-input"
                  placeholder="Intended Destination Country *"
                  value={prereqForm.destinationCountry || ''}
                  onChange={(e) => setPrereqForm({ ...prereqForm, destinationCountry: e.target.value })}
                  required
                />
              </div>
              <input
                className="auth-input"
                placeholder="Education & Qualifications *"
                value={prereqForm.education || ''}
                onChange={(e) => setPrereqForm({ ...prereqForm, education: e.target.value })}
                required
              />
              <textarea
                className="auth-input"
                rows={2}
                placeholder="Employment Background *"
                value={prereqForm.employmentBackground || ''}
                onChange={(e) => setPrereqForm({ ...prereqForm, employmentBackground: e.target.value })}
                required
              />
              <input
                className="auth-input"
                placeholder="Language Abilities (e.g. English C1, German B1) *"
                value={prereqForm.languages || ''}
                onChange={(e) => setPrereqForm({ ...prereqForm, languages: e.target.value })}
                required
              />
              <textarea
                className="auth-input"
                rows={2}
                placeholder="Relocation Objectives *"
                value={prereqForm.relocationObjectives || ''}
                onChange={(e) => setPrereqForm({ ...prereqForm, relocationObjectives: e.target.value })}
                required
              />
            </>
          )}

          {selectedAsg.category === 'SCHOLARSHIP' && (
            <>
              <textarea
                className="auth-input"
                rows={2}
                placeholder="Education History *"
                value={prereqForm.educationHistory || ''}
                onChange={(e) => setPrereqForm({ ...prereqForm, educationHistory: e.target.value })}
                required
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <input
                  className="auth-input"
                  placeholder="Academic Qualifications *"
                  value={prereqForm.qualifications || ''}
                  onChange={(e) => setPrereqForm({ ...prereqForm, qualifications: e.target.value })}
                  required
                />
                <input
                  className="auth-input"
                  placeholder="Field of Study *"
                  value={prereqForm.fieldOfStudy || ''}
                  onChange={(e) => setPrereqForm({ ...prereqForm, fieldOfStudy: e.target.value })}
                  required
                />
              </div>
              <input
                className="auth-input"
                placeholder="Academic Achievements *"
                value={prereqForm.achievements || ''}
                onChange={(e) => setPrereqForm({ ...prereqForm, achievements: e.target.value })}
                required
              />
              <input
                className="auth-input"
                placeholder="Intended Institution or Programme *"
                value={prereqForm.intendedProgramme || ''}
                onChange={(e) => setPrereqForm({ ...prereqForm, intendedProgramme: e.target.value })}
                required
              />
              <textarea
                className="auth-input"
                rows={3}
                placeholder="Motivation Statement *"
                value={prereqForm.motivationStatement || ''}
                onChange={(e) => setPrereqForm({ ...prereqForm, motivationStatement: e.target.value })}
                required
              />
            </>
          )}

          <button type="submit" className="auth-submit-btn">
            Save Prerequisites & Continue
          </button>
        </form>
      )}

      {/* Instruction & Rules Screen */}
      {mode === 'instructions' && selectedAsg && (
        <div
          style={{
            padding: '22px',
            borderRadius: '16px',
            background: '#18181b',
            border: '1px solid #2e2e2e',
          }}
        >
          <h3 className="text-lg font-bold text-white mb-2">{selectedAsg.title} — Instructions & Rules</h3>
          <ul className="text-xs text-slate-300 space-y-2 mb-4 pl-4">
            <li><strong>Purpose:</strong> Assess your readiness for {selectedAsg.relatedOpportunity}.</li>
            <li><strong>Questions:</strong> 15 tailored multiple-choice questions (Intermediate, Advanced, Hard).</li>
            <li><strong>Time Allowed:</strong> {selectedAsg.durationMinutes} minutes (server-validated countdown).</li>
            <li><strong>Passing Score:</strong> {selectedAsg.passingScorePercent}%.</li>
            <li><strong>Rules:</strong> Answers auto-save as you go. When the timer reaches 00:00, your saved answers are submitted automatically.</li>
            <li><strong>Transcript:</strong> A permanent PDF transcript linked to your CV is generated upon submission.</li>
          </ul>
          <label className="flex items-center gap-2 text-xs text-white mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={rulesAccepted}
              onChange={(e) => setRulesAccepted(e.target.checked)}
            />
            <span>I agree to the assessment rules and submission conditions.</span>
          </label>
          <div className="flex gap-2">
            <button onClick={() => setMode('list')} disabled={startingSession} className="chat-action-btn">
              Back
            </button>
            <button
              onClick={() => void handleLaunchTimedSession()}
              disabled={!rulesAccepted || startingSession}
              className="chat-action-btn primary"
            >
              {startingSession ? 'Generating Tailored AI Questions...' : 'Begin Timed Assessment'}
            </button>
          </div>
        </div>
      )}

      {/* Timed Assessment Runner */}
      {mode === 'runner' && session && (
        <div
          style={{
            padding: '20px',
            borderRadius: '16px',
            background: '#18181b',
            border: '1px solid #2e2e2e',
          }}
        >
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#2e2e2e]">
            <div className="text-xs font-bold text-slate-300">
              Question {currentQIdx + 1} of {session.questions.length} •{' '}
              <span className="text-cyan-400">{session.questions[currentQIdx]?.difficulty}</span> •{' '}
              <span>{session.questions[currentQIdx]?.topic}</span>
            </div>
            <div
              className="flex items-center gap-1.5 text-sm font-extrabold"
              style={{ color: remainingSec < 120 ? '#fca5a5' : '#6ee7b7' }}
            >
              <Clock className="w-4 h-4" />
              <span>{formatTimer(remainingSec)}</span>
            </div>
          </div>

          {(() => {
            const q = session.questions[currentQIdx];
            if (!q) return null;
            const selected = answers[q.id];
            return (
              <div>
                <div className="text-sm font-semibold text-white mb-4 leading-relaxed">{q.statement}</div>
                <div className="grid gap-2.5 mb-5">
                  {q.options.map((opt: string, idx: number) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => void handleSelectOption(q.id, idx)}
                      style={{
                        textAlign: 'left',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border: selected === idx ? '1px solid #22d3ee' : '1px solid #334155',
                        background: selected === idx ? 'rgba(6,182,212,0.16)' : '#111827',
                        color: '#f8fafc',
                        fontSize: '13px',
                        cursor: 'pointer',
                      }}
                    >
                      <strong className="mr-2">{String.fromCharCode(65 + idx)}.</strong>
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex gap-1.5 flex-wrap">
              {session.questions.map((q: any, idx: number) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => {
                    setCurrentQIdx(idx);
                    setQuestionStartMs(Date.now());
                  }}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    border: idx === currentQIdx ? '1px solid #38bdf8' : '1px solid #334155',
                    background: answers[q.id] !== undefined ? '#1d4ed8' : '#0f172a',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {currentQIdx < session.questions.length - 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    setCurrentQIdx((i) => i + 1);
                    setQuestionStartMs(Date.now());
                  }}
                  className="chat-action-btn"
                >
                  Next Question
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void handleSubmitAssessment()}
                disabled={submitting}
                className="chat-action-btn primary"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{submitting ? 'Submitting...' : 'Submit Assessment'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results & Transcript Screen */}
      {mode === 'result' && resultData && (
        <div
          style={{
            padding: '22px',
            borderRadius: '16px',
            background: '#18181b',
            border: '1px solid #2e2e2e',
          }}
        >
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <h3 className="text-lg font-extrabold text-white m-0">
                Assessment {resultData.session.passed ? 'Passed' : 'Completed'} — {resultData.session.percentageScore}%
              </h3>
              <p className="text-xs text-slate-400 m-0 mt-1">
                {resultData.session.correctCount} correct • {resultData.session.incorrectCount} incorrect •{' '}
                {resultData.session.totalQuestions} total
              </p>
            </div>
            {resultData.transcript?.pdfDownloadUrl && (
              <a
                href={resolveApiUrl(resultData.transcript.pdfDownloadUrl)}
                target="_blank"
                rel="noopener noreferrer"
                className="chat-action-btn primary"
                style={{ textDecoration: 'none' }}
              >
                <Download className="w-4 h-4" />
                <span>Download Transcript PDF</span>
              </a>
            )}
          </div>
          <p className="text-xs text-slate-200 p-3 rounded-lg bg-[#111827] border border-[#2e2e2e] mb-4">
            {resultData.transcript?.aiPerformanceSummary}
          </p>
          <button onClick={() => setMode('list')} className="chat-action-btn">
            Return to Assignments
          </button>
        </div>
      )}
    </div>
  );
};
