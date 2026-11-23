import React, { useEffect, useState } from 'react';
import { Briefcase, MapPin, CheckCircle2, ArrowLeft, Send } from 'lucide-react';
import { NexoraLogo } from '../components/NexoraLogo';

interface PublicVacancyPageProps {
  vacancyId: string;
  onNavigate: (to: string) => void;
}

const API_BASE =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_API_BASE_URL || '';

export const PublicVacancyPage: React.FC<PublicVacancyPageProps> = ({ vacancyId, onNavigate }) => {
  const [vacancy, setVacancy] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    candidateName: '',
    candidateEmail: '',
    candidatePhone: '',
    coverNote: '',
    consentToShareDocuments: true,
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/v1/public/vacancies/${encodeURIComponent(vacancyId)}`);
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          setError(json?.error || 'Opportunity not found.');
        } else {
          setVacancy(json.data);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [vacancyId]);

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/api/v1/vacancies/${encodeURIComponent(vacancyId)}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userUid: 'public-applicant',
          candidateName: form.candidateName,
          candidateEmail: form.candidateEmail,
          candidatePhone: form.candidatePhone || undefined,
          coverNote: form.coverNote || undefined,
          consentToShare: form.consentToShareDocuments,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error || 'Could not submit application.');
        return;
      }
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0b101b', color: '#f8fafc', padding: '24px 16px' }}>
      <div style={{ maxWidth: '780px', margin: '0 auto' }}>
        <div className="flex items-center justify-between mb-6">
          <button
            type="button"
            onClick={() => onNavigate('/app')}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            Open Nexora AI
          </button>
          <NexoraLogo />
        </div>

        {loading && <div className="text-sm text-slate-400">Loading opportunity...</div>}
        {error && !loading && (
          <div className="p-4 rounded-xl bg-red-500/15 text-red-300 text-sm">{error}</div>
        )}

        {vacancy && (
          <div className="grid gap-6">
            <div
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px',
                padding: '24px',
              }}
            >
              <div className="text-xs text-indigo-400 font-semibold uppercase tracking-wide">
                {vacancy.category}
              </div>
              <h1 className="text-2xl font-bold text-white mt-1">{vacancy.title}</h1>
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-2 flex-wrap">
                <span className="flex items-center gap-1">
                  <Briefcase className="w-3.5 h-3.5" />
                  {vacancy.organisationName}
                </span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {vacancy.location || vacancy.country} ({vacancy.workMode})
                </span>
                {vacancy.salaryRange && <span>• {vacancy.salaryRange}</span>}
              </div>

              <div className="mt-5 text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                {vacancy.description}
              </div>
              {vacancy.requirements && (
                <div className="mt-4">
                  <div className="text-xs font-semibold text-slate-300 uppercase mb-1">Requirements</div>
                  <div className="text-sm text-slate-300 whitespace-pre-wrap">{vacancy.requirements}</div>
                </div>
              )}
              {Array.isArray(vacancy.skills) && vacancy.skills.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-4">
                  {vacancy.skills.map((s: string) => (
                    <span
                      key={s}
                      className="text-xs px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {submitted ? (
              <div
                style={{
                  background: 'rgba(16,185,129,0.12)',
                  border: '1px solid rgba(16,185,129,0.35)',
                  borderRadius: '14px',
                  padding: '20px',
                }}
                className="flex items-center gap-3 text-emerald-300"
              >
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <div>
                  <div className="font-semibold">Application Submitted!</div>
                  <div className="text-xs text-emerald-200/80">
                    {vacancy.organisationName} has been notified and will review your application.
                  </div>
                </div>
              </div>
            ) : (
              <form
                onSubmit={handleApply}
                style={{
                  background: '#111827',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '16px',
                  padding: '24px',
                }}
                className="grid gap-3"
              >
                <h2 className="text-base font-bold text-white">Apply for this Opportunity</h2>
                <input
                  required
                  placeholder="Full Name *"
                  value={form.candidateName}
                  onChange={(e) => setForm({ ...form, candidateName: e.target.value })}
                  className="auth-input"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    required
                    type="email"
                    placeholder="Email Address *"
                    value={form.candidateEmail}
                    onChange={(e) => setForm({ ...form, candidateEmail: e.target.value })}
                    className="auth-input"
                  />
                  <input
                    placeholder="Phone Number"
                    value={form.candidatePhone}
                    onChange={(e) => setForm({ ...form, candidatePhone: e.target.value })}
                    className="auth-input"
                  />
                </div>
                <textarea
                  rows={3}
                  placeholder="Short cover note / motivation"
                  value={form.coverNote}
                  onChange={(e) => setForm({ ...form, coverNote: e.target.value })}
                  className="auth-input"
                />
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={form.consentToShareDocuments}
                    onChange={(e) =>
                      setForm({ ...form, consentToShareDocuments: e.target.checked })
                    }
                  />
                  I consent to sharing my Nexora CV and Assessment Transcript with this organisation.
                </label>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-indigo-500 text-white text-sm font-semibold"
                >
                  <Send className="w-4 h-4" />
                  {submitting ? 'Submitting...' : 'Submit Application'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
