import React from 'react';
import {
  ArrowRight,
  Briefcase,
  CheckCircle2,
  FileCheck,
  Globe2,
  GraduationCap,
  Mail,
  Plane,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from 'lucide-react';
import { NexoraLogo } from '../components/NexoraLogo';

interface LandingPageProps {
  onNavigate: (path: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const linkClick = (e: React.MouseEvent, path: string) => {
    e.preventDefault();
    onNavigate(path);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at top center, #111c38 0%, #0b0f19 48%, #070a12 100%)',
        color: '#f1f5f9',
        fontFamily: "'Montserrat', sans-serif",
        overflowX: 'hidden',
      }}
    >
      {/* Top Navigation */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          backdropFilter: 'blur(14px)',
          background: 'rgba(11, 15, 25, 0.82)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div
          style={{
            maxWidth: '1160px',
            margin: '0 auto',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <a
            href="/"
            onClick={(e) => linkClick(e, '/')}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
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
            <a href="#why-nexora" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
              Why Nexora AI
            </a>
            <a href="#agents" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
              Specialists
            </a>
            <a href="#how-it-works" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
              How It Works
            </a>
            <a
              href="/privacy"
              onClick={(e) => linkClick(e, '/privacy')}
              style={{ color: '#cbd5e1', textDecoration: 'none' }}
            >
              Privacy
            </a>
            <a
              href="/terms"
              onClick={(e) => linkClick(e, '/terms')}
              style={{ color: '#cbd5e1', textDecoration: 'none' }}
            >
              Terms
            </a>
            <a
              href="/app"
              onClick={(e) => linkClick(e, '/app')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 18px',
                borderRadius: '999px',
                background: 'linear-gradient(135deg, #2563eb 0%, #6366f1 100%)',
                color: '#ffffff',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '13px',
                boxShadow: '0 6px 20px rgba(37, 99, 235, 0.35)',
              }}
            >
              <span>Launch App</span>
              <ArrowRight className="w-4 h-4" />
            </a>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{ maxWidth: '1120px', margin: '0 auto', padding: '72px 20px 56px 20px', textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 14px',
            borderRadius: '999px',
            background: 'rgba(59, 130, 246, 0.14)',
            border: '1px solid rgba(96, 165, 250, 0.35)',
            color: '#93c5fd',
            fontSize: '12px',
            fontWeight: 700,
            marginBottom: '22px',
          }}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Built by Empire Labs • Autonomous AI Workforce</span>
        </div>

        <h1
          style={{
            fontSize: 'clamp(32px, 5vw, 54px)',
            fontWeight: 800,
            lineHeight: 1.12,
            letterSpacing: '-0.8px',
            margin: '0 auto 20px auto',
            maxWidth: '880px',
            color: '#ffffff',
          }}
        >
          Stop Applying Manually.{' '}
          <span
            style={{
              background: 'linear-gradient(90deg, #38bdf8 0%, #818cf8 55%, #c084fc 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Let AI Agents Execute For You.
          </span>
        </h1>

        <p
          style={{
            fontSize: 'clamp(15px, 2vw, 18px)',
            lineHeight: 1.65,
            color: '#94a3b8',
            maxWidth: '720px',
            margin: '0 auto 32px auto',
          }}
        >
          Nexora AI goes far beyond ordinary chat. It drafts executive-grade PDFs (CVs, Visa Dossiers,
          Investor Pitch Memos, Scholarship Letters), lets you review and edit every word, and autonomously
          submits your applications—while tracking replies and flagging interview invitations.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap', marginBottom: '36px' }}>
          <a
            href="/app"
            onClick={(e) => linkClick(e, '/app')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '10px',
              padding: '14px 28px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #2563eb 0%, #6366f1 100%)',
              color: '#ffffff',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '15px',
              boxShadow: '0 10px 30px rgba(37, 99, 235, 0.4)',
            }}
          >
            <span>Start Free ($5.00 Credit)</span>
            <ArrowRight className="w-4 h-4" />
          </a>
          <a
            href="#how-it-works"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '14px 24px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              color: '#e2e8f0',
              textDecoration: 'none',
              fontWeight: 600,
              fontSize: '15px',
            }}
          >
            <span>See How It Works</span>
          </a>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '24px',
            flexWrap: 'wrap',
            fontSize: '12.5px',
            color: '#94a3b8',
            fontWeight: 600,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> $5.00 Free Starter Credit
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <FileCheck className="w-4 h-4 text-cyan-400" /> Mandatory PDF Review Before Submit
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <Mail className="w-4 h-4 text-indigo-400" /> Live Reply & Interview Alerts
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck className="w-4 h-4 text-emerald-400" /> Secured by Paystack
          </span>
        </div>
      </section>

      {/* Why Nexora AI Section */}
      <section id="why-nexora" style={{ maxWidth: '1120px', margin: '0 auto', padding: '56px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#ffffff', marginBottom: '10px' }}>
            Why Nexora AI?
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '15px', maxWidth: '640px', margin: '0 auto' }}>
            Traditional AI tools stop at generating text. Nexora AI is engineered as an end-to-end execution
            engine with strict human-in-the-loop safeguards.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '18px',
          }}
        >
          {[
            {
              icon: FileCheck,
              color: '#38bdf8',
              title: 'PDF-First Review & Iterative Editing',
              desc: 'Every CV, visa dossier, pitch memo, and motivation letter is compiled into a publication-grade PDF. Inspect it side-by-side and request edits until it is perfect.',
            },
            {
              icon: Globe2,
              color: '#818cf8',
              title: 'Live Opportunity Discovery',
              desc: 'Connects to real job feeds (Adzuna, Remotive, Arbeitnow, Jobicy), licensed visa-sponsor pathways, VC accelerators, and global scholarship portals.',
            },
            {
              icon: Mail,
              color: '#34d399',
              title: 'Threaded Replies & Interview Detection',
              desc: 'Read responses directly inside Nexora AI, send chained follow-up replies, and get instant notifications whenever an employer invites you for an interview.',
            },
            {
              icon: ShieldCheck,
              color: '#fbbf24',
              title: 'Zero Unapproved Submissions',
              desc: 'Nexora AI never sends an email or fills a portal form on your behalf until you explicitly review your PDF, choose the submission count, and click Approve.',
            },
          ].map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                style={{
                  padding: '24px',
                  borderRadius: '16px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.09)',
                }}
              >
                <Icon className="w-6 h-6" style={{ color: item.color, marginBottom: '14px' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                  {item.title}
                </h3>
                <p style={{ fontSize: '13.5px', lineHeight: 1.6, color: '#94a3b8', margin: 0 }}>
                  {item.desc}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* 4 Specialist Agents */}
      <section id="agents" style={{ maxWidth: '1120px', margin: '0 auto', padding: '56px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#ffffff', marginBottom: '10px' }}>
            Four Specialised Autonomous Agents
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '15px', maxWidth: '620px', margin: '0 auto' }}>
            Every new account includes <strong style={{ color: '#34d399' }}>$5.00 free credit</strong>. Only pay
            when you approve and dispatch real submissions.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '18px',
          }}
        >
          {[
            {
              icon: Briefcase,
              name: 'Find Employment',
              price: '$1.00 / submission',
              desc: 'Expands your experience into an ATS-ready CV PDF, matches live tech & industry jobs, fills public forms, and emails your CV directly.',
            },
            {
              icon: Plane,
              name: 'Relocate Abroad',
              price: '$2.00 / submission',
              desc: 'Builds a Relocation & Visa Pathway Dossier PDF, maps EU Blue Card / UK Skilled Worker / Express Entry routes, and targets visa-sponsoring employers.',
            },
            {
              icon: TrendingUp,
              name: 'Find Investors',
              price: '$1.00 / submission',
              desc: 'Synthesizes your traction and ask into an Investor Pitch Memorandum PDF and pitches matched VCs, angel syndicates, and accelerators.',
            },
            {
              icon: GraduationCap,
              name: 'Find Scholarships',
              price: '$1.00 / submission',
              desc: 'Drafts a tailored Statement of Purpose & Academic Dossier PDF and submits to matched Chevening, DAAD, Erasmus, and university awards.',
            },
          ].map((agent, idx) => {
            const Icon = agent.icon;
            return (
              <div
                key={idx}
                style={{
                  padding: '24px',
                  borderRadius: '16px',
                  background: 'linear-gradient(180deg, rgba(30, 41, 59, 0.55) 0%, rgba(15, 23, 42, 0.7) 100%)',
                  border: '1px solid rgba(148, 163, 184, 0.16)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                    <Icon className="w-6 h-6 text-cyan-400" />
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '4px 10px',
                        borderRadius: '999px',
                        background: 'rgba(16, 185, 129, 0.14)',
                        border: '1px solid rgba(16, 185, 129, 0.35)',
                        color: '#6ee7b7',
                      }}
                    >
                      {agent.price}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                    {agent.name}
                  </h3>
                  <p style={{ fontSize: '13.5px', lineHeight: 1.6, color: '#94a3b8', marginBottom: '18px' }}>
                    {agent.desc}
                  </p>
                </div>
                <a
                  href="/app"
                  onClick={(e) => linkClick(e, '/app')}
                  style={{
                    color: '#60a5fa',
                    textDecoration: 'none',
                    fontSize: '13px',
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>Open in App</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
            );
          })}
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" style={{ maxWidth: '1040px', margin: '0 auto', padding: '56px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#ffffff', marginBottom: '10px' }}>
            How It Works
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '18px' }}>
          {[
            {
              step: '01',
              title: 'Share Your Goal or Form',
              desc: 'Select a specialist in /app or chat naturally in any language. Your profile auto-fills future tasks so you never type twice.',
            },
            {
              step: '02',
              title: 'Review & Refine Your PDF',
              desc: 'Inspect the generated PDF side-by-side, ask for edits directly on the document, and choose how many submissions to send.',
            },
            {
              step: '03',
              title: 'Approve & Track Interviews',
              desc: 'Confirm submission to dispatch real emails & portal applications, then read replies and interview alerts in one inbox.',
            },
          ].map((s) => (
            <div
              key={s.step}
              style={{
                padding: '24px',
                borderRadius: '16px',
                background: 'rgba(255, 255, 255, 0.025)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#38bdf8', marginBottom: '8px' }}>
                STEP {s.step}
              </div>
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                {s.title}
              </h3>
              <p style={{ fontSize: '13.5px', lineHeight: 1.6, color: '#94a3b8', margin: 0 }}>{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '36px 20px',
          marginTop: '32px',
          background: 'rgba(7, 10, 18, 0.85)',
        }}
      >
        <div
          style={{
            maxWidth: '1120px',
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
              style={{ color: '#60a5fa', textDecoration: 'underline' }}
            >
              Empire Labs
            </a>
            . © {new Date().getFullYear()} All rights reserved.
          </div>

          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <a href="/app" onClick={(e) => linkClick(e, '/app')} style={{ color: '#cbd5e1', textDecoration: 'none' }}>
              Launch App
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
  );
};
