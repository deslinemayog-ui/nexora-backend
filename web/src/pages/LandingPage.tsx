import React, { useState } from 'react';
import {
  ArrowRight,
  Award,
  Bot,
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  CreditCard,
  FileCheck,
  FolderLock,
  GraduationCap,
  Lock,
  Mail,
  Mic,
  Plane,
  Radio,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Video,
  Zap,
} from 'lucide-react';
import { NexoraLogo } from '../components/NexoraLogo';

interface LandingPageProps {
  onNavigate: (path: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const [heroTab, setHeroTab] = useState<'interview' | 'autopilot' | 'shortlist'>('interview');
  const [audienceTab, setAudienceTab] = useState<'candidates' | 'companies'>('candidates');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const linkClick = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    onNavigate(path);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#05090e',
        color: '#f1f5f9',
        fontFamily: "'Montserrat', -apple-system, BlinkMacSystemFont, sans-serif",
        overflowX: 'hidden',
        position: 'relative',
      }}
    >
      {/* Ambient Digital Grid & Radial Glows */}
      <div
        className="nx-grid-bg"
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 0,
          maskImage: 'radial-gradient(ellipse 85% 65% at 50% 0%, #000 40%, transparent 100%)',
          WebkitMaskImage: 'radial-gradient(ellipse 85% 65% at 50% 0%, #000 40%, transparent 100%)',
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: '-180px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '920px',
          height: '520px',
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(16, 185, 129, 0.16) 0%, rgba(14, 165, 233, 0.08) 45%, transparent 72%)',
          filter: 'blur(40px)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* ==================== 1. GLASS NAVBAR ==================== */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          background: 'rgba(5, 9, 14, 0.78)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '13px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <a href="/" onClick={(e) => linkClick(e, '/')} style={{ textDecoration: 'none', color: 'inherit' }}>
            <NexoraLogo size="sm" showSubtitle={false} />
          </a>

          <nav
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '20px',
              fontSize: '13px',
              fontWeight: 600,
              flexWrap: 'wrap',
            }}
          >
            <a href="#ai-interviews" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
              AI Interviews
            </a>
            <a href="#platform" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
              Platform
            </a>
            <a href="#agents" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
              Agents
            </a>
            <a href="#faq" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
              FAQ
            </a>
            <a
              href="/company/dashboard"
              onClick={(e) => linkClick(e, '/company/dashboard')}
              style={{
                color: '#6ee7b7',
                textDecoration: 'none',
                padding: '7px 14px',
                borderRadius: '999px',
                background: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.28)',
              }}
            >
              Company Portal
            </a>
            <a
              href="/app"
              onClick={(e) => linkClick(e, '/app')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                padding: '8px 18px',
                borderRadius: '999px',
                background: 'linear-gradient(135deg, #005c4b 0%, #10b981 100%)',
                color: '#ffffff',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '13px',
                boxShadow: '0 6px 22px rgba(16, 185, 129, 0.32)',
              }}
            >
              <span>Launch App</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </nav>
        </div>
      </header>

      <div style={{ position: 'relative', zIndex: 2 }}>
        {/* ==================== 2. DIGITAL SPLIT HERO ==================== */}
        <section
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '64px 20px 56px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
            gap: '40px',
            alignItems: 'center',
          }}
        >
          {/* Left Copy */}
          <div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 14px',
                borderRadius: '999px',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                color: '#6ee7b7',
                fontSize: '11.5px',
                fontWeight: 700,
                letterSpacing: '0.3px',
                marginBottom: '20px',
              }}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>NEW • Photorealistic Human AI Video Interviews &amp; Morning Autopilot</span>
            </div>

            <h1
              style={{
                fontSize: 'clamp(34px, 4.6vw, 54px)',
                fontWeight: 800,
                lineHeight: 1.08,
                letterSpacing: '-1.1px',
                margin: '0 0 18px 0',
                color: '#ffffff',
              }}
            >
              Verified Talent Meets{' '}
              <span
                style={{
                  background: 'linear-gradient(90deg, #34d399 0%, #38bdf8 55%, #818cf8 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                Autonomous AI Execution.
              </span>
            </h1>

            <p
              style={{
                fontSize: '15.5px',
                lineHeight: 1.68,
                color: '#94a3b8',
                margin: '0 0 28px 0',
                maxWidth: '560px',
              }}
            >
              Nexora AI connects ambitious candidates with hiring companies, recruitment &amp; staffing agencies,
              relocation specialists, scholarship committees, and investment providers. From AI-tailored assessments,
              Morning Autopilot, and supporting document vaults to 0–100% CV scoring,{' '}
              <strong style={{ color: '#e2e8f0' }}>Live AI Video Interviews</strong>, and success-only Paystack billing.
            </p>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '28px' }}>
              <a
                href="/app"
                onClick={(e) => linkClick(e, '/app')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '9px',
                  padding: '13px 24px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #005c4b 0%, #10b981 100%)',
                  color: '#ffffff',
                  textDecoration: 'none',
                  fontWeight: 700,
                  fontSize: '14px',
                  boxShadow: '0 10px 28px rgba(16, 185, 129, 0.34)',
                }}
              >
                <Sparkles className="w-4 h-4" />
                <span>Candidate App ($5.00 Free Credit)</span>
                <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href="/company/register"
                onClick={(e) => linkClick(e, '/company/register')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '13px 22px',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.14)',
                  color: '#e2e8f0',
                  textDecoration: 'none',
                  fontWeight: 700,
                  fontSize: '14px',
                }}
              >
                <Building2 className="w-4 h-4 text-emerald-400" />
                <span>Register Company / Agency</span>
              </a>
            </div>

            {/* Key Metrics Strip */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: '12px',
                paddingTop: '18px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              {[
                { val: '$5.00 Free', lbl: 'Starter Candidate Credit' },
                { val: '$0.10/job', lbl: 'Morning Autopilot Batch' },
                { val: '$0.50–$2/min', lbl: 'Live AI Video Interviews' },
              ].map((m, i) => (
                <div key={i}>
                  <div style={{ fontSize: '17px', fontWeight: 800, color: '#ffffff' }}>{m.val}</div>
                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>{m.lbl}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Interactive Digital Product Console Preview */}
          <div
            style={{
              borderRadius: '20px',
              background: 'linear-gradient(155deg, rgba(17, 27, 33, 0.94) 0%, rgba(11, 20, 26, 0.98) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              boxShadow: '0 24px 70px rgba(0, 0, 0, 0.6), 0 0 40px rgba(16, 185, 129, 0.08)',
              overflow: 'hidden',
            }}
          >
            {/* Window Top Bar + Live Mode Switcher */}
            <div
              style={{
                padding: '12px 16px',
                background: 'rgba(11, 20, 26, 0.9)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#ef4444' }} />
                <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#f59e0b' }} />
                <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: '#10b981' }} />
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 700, marginLeft: '6px' }}>
                  nexora.empirelabs.digital
                </span>
              </div>
              <div style={{ display: 'flex', gap: '4px', background: '#182229', padding: '3px', borderRadius: '8px' }}>
                {(
                  [
                    { id: 'interview', label: 'AI Interview' },
                    { id: 'shortlist', label: 'Company AI' },
                    { id: 'autopilot', label: 'Autopilot' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setHeroTab(t.id)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: heroTab === t.id ? '#005c4b' : 'transparent',
                      color: heroTab === t.id ? '#ffffff' : '#94a3b8',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive Preview Body */}
            <div style={{ padding: '20px', minHeight: '340px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '14px' }}>
              {heroTab === 'interview' && (
                <>
                  <div
                    style={{
                      borderRadius: '14px',
                      background: 'radial-gradient(circle at 50% 35%, rgba(16, 185, 129, 0.16), #070d12 75%)',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      padding: '18px',
                      position: 'relative',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 800,
                          padding: '3px 9px',
                          borderRadius: '999px',
                          background: 'rgba(16, 185, 129, 0.2)',
                          color: '#34d399',
                        }}
                      >
                        ● LIVE • 04:18 • REC TO EMPLOYER
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '3px 9px',
                          borderRadius: '999px',
                          background: 'rgba(56, 189, 248, 0.16)',
                          color: '#7dd3fc',
                        }}
                      >
                        0 RETAKES • WHITE-LABEL STUDIO
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '14px' }}>
                      <div
                        style={{
                          width: '56px',
                          height: '56px',
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #005c4b, #38bdf8)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '20px',
                          fontWeight: 800,
                          color: '#fff',
                          border: '2px solid #34d399',
                          flexShrink: 0,
                        }}
                      >
                        A
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#fff' }}>
                          Audrey • Photorealistic Human AI Interviewer
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                          Asking custom employer questions for Senior React Native Developer
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '24px' }}>
                        {[0, 0.15, 0.3, 0.45, 0.2].map((delay, i) => (
                          <div
                            key={i}
                            className="nx-wave-bar"
                            style={{ height: '22px', animationDelay: `${delay}s` }}
                          />
                        ))}
                      </div>
                    </div>

                    <div
                      style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        background: 'rgba(32, 44, 51, 0.85)',
                        fontSize: '12px',
                        color: '#e9edef',
                        lineHeight: 1.5,
                      }}
                    >
                      <span style={{ color: '#34d399', fontWeight: 700 }}>Audrey: </span>
                      &ldquo;Walk me through how you diagnosed and resolved a high-severity state management or API bottleneck in production.&rdquo;
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                      Supports <strong style={{ color: '#e2e8f0' }}>Google Live</strong>,{' '}
                      <strong style={{ color: '#e2e8f0' }}>Tavus Human</strong> &amp;{' '}
                      <strong style={{ color: '#e2e8f0' }}>Nuance</strong>
                    </div>
                    <a
                      href="/company/register"
                      onClick={(e) => linkClick(e, '/company/register')}
                      style={{
                        fontSize: '12px',
                        fontWeight: 700,
                        color: '#34d399',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      Try in Company Portal <ArrowRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </>
              )}

              {heroTab === 'shortlist' && (
                <>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {[
                      { name: 'Thabo Mokoena', score: '94%', role: 'Senior Full-Stack Engineer', badge: 'Verified Transcript • 93%' },
                      { name: 'Amara Okafor', score: '89%', role: 'Cloud DevOps Architect', badge: 'AI Video Interview Completed' },
                      { name: 'Lameck Ndhlovu', score: '86%', role: 'React Native Lead', badge: 'CV + Verified PDF Ready' },
                    ].map((c, i) => (
                      <div
                        key={i}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '12px',
                          background: '#111b21',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '10px',
                        }}
                      >
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff' }}>{c.name}</div>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>{c.role} • {c.badge}</div>
                        </div>
                        <span
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 800,
                            padding: '4px 10px',
                            borderRadius: '999px',
                            background: 'rgba(16, 185, 129, 0.18)',
                            color: '#6ee7b7',
                          }}
                        >
                          {c.score} Match
                        </span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                    1-click <strong style={{ color: '#e2e8f0' }}>Schedule AI Interview</strong> → Recording delivered exclusively to your recruiter dashboard.
                  </div>
                </>
              )}

              {heroTab === 'autopilot' && (
                <>
                  <div
                    style={{
                      padding: '16px',
                      borderRadius: '14px',
                      background: 'rgba(16, 185, 129, 0.09)',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 800, color: '#fff' }}>⚡ Morning Autopilot Active</span>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: '#34d399' }}>08:00 Daily • $0.10/job</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: '#cbd5e1' }}>
                      <div>✓ Tailored CV &amp; custom pitch sent to 10 verified employers</div>
                      <div>✓ Zero duplicate companies across all sessions</div>
                      <div>✓ Automatic free 4-day follow-up on unopened threads</div>
                      <div>✓ Automatic credit refund on bounced emails</div>
                    </div>
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                    Stops automatically the moment you click <strong style={{ color: '#34d399' }}>I Got Hired</strong> or pause.
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* ==================== 3. FLAGSHIP: LIVE AI VIDEO INTERVIEWS ==================== */}
        <section id="ai-interviews" style={{ maxWidth: '1200px', margin: '0 auto', padding: '56px 20px' }}>
          <div style={{ textAlign: 'center', marginBottom: '42px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '11.5px',
                fontWeight: 800,
                color: '#34d399',
                textTransform: 'uppercase',
                letterSpacing: '1.2px',
                marginBottom: '10px',
              }}
            >
              <Video className="w-3.5 h-3.5" />
              <span>AI Interview Studio for Companies &amp; Recruiters</span>
            </div>
            <h2 style={{ fontSize: 'clamp(26px, 3.6vw, 38px)', fontWeight: 800, color: '#ffffff', margin: '0 0 12px 0' }}>
              Interview 100 Candidates Before Your Team Spends 1 Minute
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '15px', maxWidth: '720px', margin: '0 auto', lineHeight: 1.65 }}>
              When scheduling any interview in the Company Portal, enter your exact questions, choose your AI interview
              engine, and set retake limits. Usage is billed transparently per minute on your monthly Paystack invoice —
              zero monthly subscription required.
            </p>
          </div>

          {/* 4 Meeting Engine Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(255px, 1fr))',
              gap: '18px',
              marginBottom: '26px',
            }}
          >
            {[
              {
                icon: Mic,
                badge: 'FASTEST VALUE',
                name: 'Google Live AI',
                price: '$0.50',
                unit: '/ min',
                desc: 'Real-time native audio + webcam screening powered by Gemini Live. Natural barge-in interruptions, live captions, and instant employer questions.',
                bullets: ['Custom employer questions prompt', 'Real-time voice & 1 FPS vision', 'Auto cloud recording to employer'],
              },
              {
                icon: Video,
                badge: 'PHOTOREALISTIC HUMAN',
                featured: true,
                name: 'Tavus Human AI',
                price: '$2.00',
                unit: '/ min',
                desc: 'Lifelike Phoenix-4.5 real human video interviewers (Audrey, Shane, Emily, Lucy, Joyce) running inside our white-label Nexora Studio.',
                bullets: ['100% real human face & eye contact', 'Zero 3rd-party branding or lobby', 'Dual-voice HD recording + transcript'],
              },
              {
                icon: Sparkles,
                badge: 'FULL-DUPLEX PERSONA',
                name: 'Nuance AI Video',
                price: '$2.00',
                unit: '/ min',
                desc: 'Sub-500ms expressive interactive video personas (Sonia, Mira, Sam) that nod, react in real time, and hold natural conversational flow.',
                bullets: ['Sub-500ms full-duplex reactions', 'Expressive non-verbal listening', 'Auto cloud recording + transcript'],
              },
              {
                icon: CalendarDays,
                badge: 'BRING YOUR OWN LINK',
                name: 'External Meeting',
                price: 'Free',
                unit: '',
                desc: 'Prefer to interview live yourself? Paste your Google Meet, Zoom, Microsoft Teams, or auto-generated Jitsi link with instant calendar invites.',
                bullets: ['Google Calendar + .ics attachment', 'In-person & telephone supported', 'Zero per-minute cost'],
              },
            ].map((eng, idx) => {
              const Icon = eng.icon;
              return (
                <div
                  key={idx}
                  className="nx-glass-card"
                  style={{
                    padding: '24px',
                    borderRadius: '18px',
                    borderColor: eng.featured ? 'rgba(16, 185, 129, 0.5)' : 'rgba(255, 255, 255, 0.08)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    position: 'relative',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                      <div
                        style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '11px',
                          background: 'linear-gradient(135deg, #005c4b, #10b981)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 800,
                          padding: '3px 9px',
                          borderRadius: '999px',
                          background: eng.featured ? 'rgba(16, 185, 129, 0.2)' : 'rgba(56, 189, 248, 0.14)',
                          color: eng.featured ? '#34d399' : '#7dd3fc',
                        }}
                      >
                        {eng.badge}
                      </span>
                    </div>

                    <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#ffffff', margin: '0 0 6px 0' }}>
                      {eng.name}
                    </h3>
                    <div style={{ marginBottom: '12px' }}>
                      <span style={{ fontSize: '26px', fontWeight: 800, color: '#34d399' }}>{eng.price}</span>
                      {eng.unit && <span style={{ fontSize: '12.5px', color: '#94a3b8', marginLeft: '4px' }}>{eng.unit}</span>}
                    </div>
                    <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#94a3b8', margin: '0 0 16px 0' }}>
                      {eng.desc}
                    </p>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                    {eng.bullets.map((b, bi) => (
                      <div key={bi} style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: '#cbd5e1' }}>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" style={{ flexShrink: 0 }} />
                        <span>{b}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recruiter Controls Strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '12px',
              padding: '18px 20px',
              borderRadius: '16px',
              background: 'rgba(17, 27, 33, 0.72)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
            }}
          >
            {[
              { icon: Lock, title: 'Employer-Only Recordings', desc: 'Videos auto-upload to cloud storage exclusively for your hiring team — candidates cannot download or tamper.' },
              { icon: ShieldCheck, title: 'Strict Retake Limits', desc: 'Default 0 retakes (or allow 1–3). Server-enforced so every candidate gets a fair, controlled evaluation.' },
              { icon: ClipboardCheck, title: 'Your Exact Questions', desc: 'Type your custom technical or behavioral questions once — fed directly into Google Live, Tavus, or Nuance.' },
              { icon: CreditCard, title: 'Monthly Invoice Billing', desc: 'Only pay for actual interview minutes completed, consolidated onto your monthly Paystack invoice.' },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={idx} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <Icon className="w-4 h-4 text-emerald-400" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#ffffff' }}>{item.title}</div>
                    <div style={{ fontSize: '11.5px', color: '#94a3b8', lineHeight: 1.5, marginTop: '2px' }}>{item.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ==================== 4. TWO-SIDED PLATFORM (TABBED BENTO) ==================== */}
        <section id="platform" style={{ maxWidth: '1200px', margin: '0 auto', padding: '48px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '28px' }}>
            <div>
              <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>
                Two-Sided Digital Ecosystem
              </div>
              <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                Built for Both Hiring Teams &amp; Ambitious Talent
              </h2>
            </div>

            <div
              style={{
                display: 'inline-flex',
                padding: '4px',
                borderRadius: '12px',
                background: '#111b21',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <button
                type="button"
                onClick={() => setAudienceTab('candidates')}
                style={{
                  padding: '9px 18px',
                  borderRadius: '9px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: audienceTab === 'candidates' ? '#005c4b' : 'transparent',
                  color: audienceTab === 'candidates' ? '#fff' : '#94a3b8',
                }}
              >
                For Candidates &amp; Talent
              </button>
              <button
                type="button"
                onClick={() => setAudienceTab('companies')}
                style={{
                  padding: '9px 18px',
                  borderRadius: '9px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: audienceTab === 'companies' ? '#005c4b' : 'transparent',
                  color: audienceTab === 'companies' ? '#fff' : '#94a3b8',
                }}
              >
                For Companies &amp; Recruiters
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '18px',
            }}
          >
            {(audienceTab === 'companies'
              ? [
                  {
                    icon: Award,
                    title: '0–100% AI CV Scoring',
                    desc: 'Every incoming CV PDF is automatically parsed and ranked against your role requirements with AI strengths and gap summaries.',
                  },
                  {
                    icon: Video,
                    title: 'White-Label AI Video Screening',
                    desc: 'Schedule Google Live, Tavus Human, or Nuance AI interviews in 1 click and review saved recordings directly in your dashboard.',
                  },
                  {
                    icon: ShieldCheck,
                    title: 'Transcript-Gated Shortlisting',
                    desc: 'Require a Verified Skills Assessment Transcript so only proven, pre-tested candidates enter your shortlist.',
                  },
                  {
                    icon: CreditCard,
                    title: 'Zero Markup 90/10 CTC Split',
                    desc: 'Set your Max Monthly Budget (CTC). Your hire gets 90% and Nexora invoices 10% via Paystack — only after you hire.',
                  },
                  {
                    icon: Users,
                    title: 'Instant Talent Matching',
                    desc: 'Publishing a vacancy automatically matches verified candidates in the Nexora pool so you can invite them to interview immediately.',
                  },
                  {
                    icon: Bot,
                    title: 'Staffing, EOR & Payroll Ready',
                    desc: 'Manage placements, contracts, timesheets, and multi-user recruiter roles inside one unified Company Portal.',
                  },
                ]
              : [
                  {
                    icon: Zap,
                    title: 'Morning Autopilot ($0.10/job)',
                    desc: 'Applies to 10 fresh, zero-duplicate matching jobs every morning at 08:00 with tailored pitches and free 4-day follow-ups.',
                  },
                  {
                    icon: ClipboardCheck,
                    title: '1 Verified Transcript per Agent',
                    desc: 'Take a timed 15-question AI assessment tailored to your CV & role. Retaking replaces your old transcript with your latest score.',
                  },
                  {
                    icon: FolderLock,
                    title: 'Grouped Supporting Docs Vault',
                    desc: 'Store your original CV, ID/Passport, Certificates, Academic Transcripts, or Pitch Deck once and attach to any application.',
                  },
                  {
                    icon: Mail,
                    title: 'WhatsApp-Style Reply Inbox',
                    desc: 'Strict REF-tracked threads filter out spam so you chat directly with employers and see interview invites instantly.',
                  },
                  {
                    icon: CalendarDays,
                    title: '4-Tab Interviews Hub',
                    desc: 'Join AI Video Interviews, track Scheduled, Completed, Detected from Emails, and Cancelled interviews in one place.',
                  },
                  {
                    icon: FileCheck,
                    title: 'Bounce Protection & Refunds',
                    desc: 'Original CV preserved without overwriting, plus automatic credit refunds if an outreach email ever bounces.',
                  },
                ]
            ).map((card, i) => {
              const Icon = card.icon;
              return (
                <div key={i} className="nx-glass-card" style={{ padding: '24px', borderRadius: '16px' }}>
                  <Icon className="w-5 h-5 text-emerald-400" style={{ marginBottom: '12px' }} />
                  <h3 style={{ fontSize: '15.5px', fontWeight: 700, color: '#ffffff', margin: '0 0 8px 0' }}>
                    {card.title}
                  </h3>
                  <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#94a3b8', margin: 0 }}>{card.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ==================== 5. FOUR AUTONOMOUS SPECIALIST AGENTS ==================== */}
        <section id="agents" style={{ maxWidth: '1200px', margin: '0 auto', padding: '48px 20px' }}>
          <div style={{ textAlign: 'center', marginBottom: '36px' }}>
            <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#ffffff', margin: '0 0 10px 0' }}>
              Four Autonomous Specialist Agents
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '14.5px', maxWidth: '660px', margin: '0 auto' }}>
              Every candidate starts with <strong style={{ color: '#34d399' }}>$5.00 free credit</strong>. Partner
              opportunities are prioritized first alongside live global &amp; African job, visa, scholarship, and investor feeds.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(255px, 1fr))',
              gap: '18px',
            }}
          >
            {[
              {
                icon: Briefcase,
                name: 'Employment & Staffing',
                price: '$0.25 / sub • $0.10 Autopilot',
                desc: 'Matches your CV across partner companies + global & African job feeds, drafts tailored pitches, and tracks replies.',
              },
              {
                icon: Plane,
                name: 'Relocate Abroad & Visas',
                price: '$2.00 / submission',
                desc: 'Pairs your Passport, Police Clearance & Relocation Transcript with licensed visa-sponsoring employers and agencies.',
              },
              {
                icon: TrendingUp,
                name: 'Investments & Funding',
                price: '$1.00 / submission',
                desc: 'Attaches your Pitch Deck, Business Plan & Financials to target matched VCs, angel syndicates, and accelerators.',
              },
              {
                icon: GraduationCap,
                name: 'Scholarships & Study',
                price: '$1.00 / submission',
                desc: 'Combines your Academic Transcripts, Motivation Letter & Assessment with global postgraduate funding committees.',
              },
            ].map((agent, idx) => {
              const Icon = agent.icon;
              return (
                <div
                  key={idx}
                  className="nx-glass-card"
                  style={{
                    padding: '24px',
                    borderRadius: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '14px' }}>
                      <Icon className="w-5 h-5 text-emerald-400" />
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          padding: '3px 9px',
                          borderRadius: '999px',
                          background: 'rgba(16, 185, 129, 0.14)',
                          border: '1px solid rgba(16, 185, 129, 0.32)',
                          color: '#6ee7b7',
                        }}
                      >
                        {agent.price}
                      </span>
                    </div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', margin: '0 0 8px 0' }}>
                      {agent.name}
                    </h3>
                    <p style={{ fontSize: '13px', lineHeight: 1.6, color: '#94a3b8', margin: '0 0 18px 0' }}>
                      {agent.desc}
                    </p>
                  </div>
                  <a
                    href="/app"
                    onClick={(e) => linkClick(e, '/app')}
                    style={{
                      color: '#34d399',
                      textDecoration: 'none',
                      fontSize: '13px',
                      fontWeight: 700,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <span>Launch Agent</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </a>
                </div>
              );
            })}
          </div>
        </section>

        {/* ==================== 6. INTERACTIVE FAQ ==================== */}
        <section id="faq" style={{ maxWidth: '880px', margin: '0 auto', padding: '40px 20px 64px' }}>
          <h2 style={{ fontSize: '26px', fontWeight: 800, color: '#ffffff', textAlign: 'center', marginBottom: '26px' }}>
            Frequently Asked Questions
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              {
                q: 'How do AI Video & Voice Interviews work for companies?',
                a: 'When scheduling an interview in the Company Portal, choose Google Live AI ($0.50/min), Tavus Photorealistic Human AI ($2.00/min), Nuance AI ($2.00/min), or your own External Link (Free). Enter your exact questions and retake limit (default 0). Once the candidate finishes, the video recording is saved exclusively to your Company Dashboard and billed per minute on your monthly Paystack invoice.',
              },
              {
                q: 'Can candidates see or download their AI interview recordings?',
                a: 'No. Recordings are encrypted and sent exclusively to the employer in Company Dashboard → Interviews so your hiring team has an authentic, tamper-free evaluation.',
              },
              {
                q: 'How do Verified Assessment Transcripts work?',
                a: 'Each candidate holds 1 active verified transcript per agent category (Employment, Relocation, Scholarship). If they choose to retake an assessment, their new completed transcript automatically replaces the previous one.',
              },
              {
                q: 'How does the 90/10 CTC hiring split work?',
                a: 'Your stated Max Monthly Budget (CTC) is the total you ever pay — zero extra markup. On an accepted hire, 90% goes to your employee and Nexora invoices 10% monthly via Paystack.',
              },
            ].map((faq, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={idx}
                  style={{
                    borderRadius: '14px',
                    background: 'rgba(17, 27, 33, 0.72)',
                    border: isOpen ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                    overflow: 'hidden',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    style={{
                      width: '100%',
                      padding: '16px 20px',
                      background: 'transparent',
                      border: 'none',
                      color: '#ffffff',
                      fontSize: '14px',
                      fontWeight: 700,
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '12px',
                    }}
                  >
                    <span>{faq.q}</span>
                    <ChevronDown
                      className="w-4 h-4 text-emerald-400"
                      style={{
                        flexShrink: 0,
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease',
                      }}
                    />
                  </button>
                  {isOpen && (
                    <div style={{ padding: '0 20px 16px', fontSize: '13px', color: '#94a3b8', lineHeight: 1.65 }}>
                      {faq.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ==================== 7. FINAL CTA BANNER ==================== */}
        <section style={{ maxWidth: '1120px', margin: '0 auto', padding: '0 20px 64px' }}>
          <div
            style={{
              padding: '44px 28px',
              borderRadius: '22px',
              background: 'linear-gradient(135deg, rgba(0, 92, 75, 0.32) 0%, rgba(17, 27, 33, 0.92) 55%, rgba(14, 165, 233, 0.16) 100%)',
              border: '1px solid rgba(16, 185, 129, 0.38)',
              textAlign: 'center',
            }}
          >
            <h2 style={{ fontSize: 'clamp(24px, 3.2vw, 34px)', fontWeight: 800, color: '#ffffff', margin: '0 0 12px 0' }}>
              Ready to Automate Your Hiring or Career Pipeline?
            </h2>
            <p style={{ fontSize: '14.5px', color: '#cbd5e1', maxWidth: '620px', margin: '0 auto 26px' }}>
              Launch your Company Portal with Live AI Video Interviews in 60 seconds, or start applying as a candidate
              with $5.00 in free credits.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <a
                href="/company/register"
                onClick={(e) => linkClick(e, '/company/register')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '13px 26px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #005c4b 0%, #10b981 100%)',
                  color: '#ffffff',
                  textDecoration: 'none',
                  fontWeight: 700,
                  fontSize: '14px',
                }}
              >
                <span>Create Free Company Portal</span>
                <ArrowRight className="w-4 h-4" />
              </a>
              <a
                href="/app"
                onClick={(e) => linkClick(e, '/app')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '13px 24px',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  color: '#ffffff',
                  textDecoration: 'none',
                  fontWeight: 700,
                  fontSize: '14px',
                }}
              >
                <span>Open Candidate App</span>
              </a>
            </div>
          </div>
        </section>

        {/* ==================== 8. FOOTER ==================== */}
        <footer
          style={{
            borderTop: '1px solid rgba(255, 255, 255, 0.07)',
            padding: '32px 20px',
            background: 'rgba(5, 9, 14, 0.92)',
          }}
        >
          <div
            style={{
              maxWidth: '1200px',
              margin: '0 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '16px',
              fontSize: '13px',
              color: '#94a3b8',
            }}
          >
            <div>
              <strong style={{ color: '#ffffff' }}>Nexora AI</strong> • A product by{' '}
              <a
                href="https://www.empirelabs.digital/"
                target="_blank"
                rel="noreferrer"
                style={{ color: '#34d399', textDecoration: 'underline' }}
              >
                Empire Labs
              </a>
              . © {new Date().getFullYear()} All rights reserved.
            </div>

            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <a href="/app" onClick={(e) => linkClick(e, '/app')} style={{ color: '#cbd5e1', textDecoration: 'none' }}>
                Candidate App
              </a>
              <a
                href="/company/dashboard"
                onClick={(e) => linkClick(e, '/company/dashboard')}
                style={{ color: '#cbd5e1', textDecoration: 'none' }}
              >
                Company Portal
              </a>
              <a
                href="/company/login"
                onClick={(e) => linkClick(e, '/company/login')}
                style={{ color: '#cbd5e1', textDecoration: 'none' }}
              >
                Company Sign In
              </a>
              <a
                href="/privacy"
                onClick={(e) => linkClick(e, '/privacy')}
                style={{ color: '#cbd5e1', textDecoration: 'none' }}
              >
                Privacy Policy
              </a>
              <a
                href="/terms"
                onClick={(e) => linkClick(e, '/terms')}
                style={{ color: '#cbd5e1', textDecoration: 'none' }}
              >
                Terms &amp; Conditions
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};
