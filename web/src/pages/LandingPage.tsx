import React from 'react';
import {
  ArrowRight,
  Award,
  Bot,
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Cpu,
  CreditCard,
  Database,
  FileCheck,
  FolderLock,
  Globe2,
  GraduationCap,
  Lock,
  Mail,
  Plane,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
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
          background: 'rgba(11, 15, 25, 0.86)',
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
              gap: '18px',
              fontSize: '13px',
              fontWeight: 600,
              flexWrap: 'wrap',
            }}
          >
            <a href="#candidates" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
              For Candidates
            </a>
            <a href="#companies" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
              For Companies
            </a>
            <a href="#agents" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
              Specialists
            </a>
            <a href="#how-it-works" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
              How It Works
            </a>
            <a
              href="/company/dashboard"
              onClick={(e) => linkClick(e, '/company/dashboard')}
              style={{ color: '#6ee7b7', textDecoration: 'none' }}
            >
              Company Portal
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
          <span>Built by Empire Labs • Two-Sided AI Recruitment, Staffing &amp; Opportunity Platform</span>
        </div>

        <h1
          style={{
            fontSize: 'clamp(32px, 5vw, 54px)',
            fontWeight: 800,
            lineHeight: 1.12,
            letterSpacing: '-0.8px',
            margin: '0 auto 20px auto',
            maxWidth: '920px',
            color: '#ffffff',
          }}
        >
          Verified Talent Meets{' '}
          <span
            style={{
              background: 'linear-gradient(90deg, #38bdf8 0%, #818cf8 55%, #34d399 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            Autonomous AI Execution.
          </span>
        </h1>

        <p
          style={{
            fontSize: 'clamp(15px, 2vw, 18px)',
            lineHeight: 1.65,
            color: '#94a3b8',
            maxWidth: '780px',
            margin: '0 auto 32px auto',
          }}
        >
          Nexora AI connects ambitious candidates with hiring companies, recruitment &amp; staffing agencies,
          relocation specialists, scholarship committees, and investment providers. From AI-tailored assessments
          and supporting document vaults to 0–100% CV scoring, calendar-integrated interviews, and
          success-only Paystack billing.
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
              padding: '14px 24px',
              borderRadius: '12px',
              background: 'rgba(16, 185, 129, 0.14)',
              border: '1px solid rgba(16, 185, 129, 0.38)',
              color: '#6ee7b7',
              textDecoration: 'none',
              fontWeight: 700,
              fontSize: '15px',
            }}
          >
            <Building2 className="w-4 h-4" />
            <span>Register Company / Agency</span>
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
            <span>See End-to-End Flow</span>
          </a>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '22px',
            flexWrap: 'wrap',
            fontSize: '12.5px',
            color: '#94a3b8',
            fontWeight: 600,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> AI Assessment Transcripts
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <FileCheck className="w-4 h-4 text-cyan-400" /> 0–100% AI CV Scoring
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <CalendarDays className="w-4 h-4 text-indigo-400" /> Google Calendar &amp; .ics Invites
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck className="w-4 h-4 text-emerald-400" /> 10% Success-Only Paystack Billing
          </span>
        </div>
      </section>

      {/* Candidate Platform Deep-Dive */}
      <section id="candidates" style={{ maxWidth: '1120px', margin: '0 auto', padding: '56px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
            Side 1 • For Candidates &amp; Applicants
          </div>
          <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#ffffff', marginBottom: '10px' }}>
            Your Complete Career, Relocation &amp; Funding Workspace
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '15px', maxWidth: '680px', margin: '0 auto' }}>
            Keep your original CV or let Nexora draft one, prove your skills with AI-verified transcripts,
            organise supporting documents, and manage every reply and interview in one place.
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
              icon: FolderLock,
              color: '#38bdf8',
              title: 'Grouped Supporting Docs Vault',
              desc: 'Upload your CV, ID/Passport, Qualification Certificates, Academic Transcripts, or Pitch Deck once—organised by agent type and attachable to any application.',
            },
            {
              icon: ClipboardCheck,
              color: '#818cf8',
              title: 'AI Assessments & PDF Transcripts',
              desc: 'Complete category prerequisites and take a timed 15-question AI assessment tailored to your Target Role & CV. Earn a permanent PDF transcript linked to your profile.',
            },
            {
              icon: FileCheck,
              color: '#fbbf24',
              title: 'Original CV & Approval Safeguard',
              desc: 'Prefer your own CV? Nexora reads your attached document without overwriting it, or drafts a publication-grade PDF for side-by-side review before sending.',
            },
            {
              icon: CalendarDays,
              color: '#34d399',
              title: 'WhatsApp-Style Inbox & Interviews',
              desc: 'Strict REF-tracked email threads strip clutter so you only see real replies. Detected and scheduled interviews appear in your Interviews tab with Google Calendar & .ics downloads.',
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

      {/* Company & Agency Platform Deep-Dive */}
      <section id="companies" style={{ maxWidth: '1120px', margin: '0 auto', padding: '56px 20px' }}>
        <div
          style={{
            padding: '36px 28px',
            borderRadius: '20px',
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.92) 0%, rgba(30, 41, 59, 0.78) 100%)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '36px' }}>
            <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#6ee7b7', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px' }}>
              Side 2 • For Companies, Agencies &amp; Opportunity Providers
            </div>
            <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#ffffff', marginBottom: '10px' }}>
              Hire Faster with AI CV Scoring, Verified Transcripts &amp; 10% Success Billing
            </h2>
            <p style={{ color: '#cbd5e1', fontSize: '14.5px', maxWidth: '720px', margin: '0 auto' }}>
              Built for Hiring Companies, Recruitment &amp; Staffing Agencies, Relocation &amp; Immigration Firms,
              Scholarship Providers, Educational Institutions, and Investment Funds.
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
              marginBottom: '28px',
            }}
          >
            {[
              {
                icon: Award,
                color: '#38bdf8',
                title: 'AI CV Scoring (0–100%)',
                desc: 'Every incoming CV PDF and profile is automatically parsed and scored against your role requirements, ranking top applicants first with AI strengths & gaps.',
              },
              {
                icon: ShieldCheck,
                color: '#a5b4fc',
                title: 'Transcript-Gated Shortlisting',
                desc: 'Toggle "Require Verified Assessment Transcript" in your company settings so Nexora automatically filters out unverified candidates before they reach your inbox.',
              },
              {
                icon: CalendarDays,
                color: '#34d399',
                title: '1-Click Interview & Calendar Sync',
                desc: 'Schedule Online, Telephone, or In-Person interviews with auto-generated meeting links, automatic .ics calendar attachments, and candidate notifications.',
              },
              {
                icon: CreditCard,
                color: '#fbbf24',
                title: '10% Monthly Paystack Invoicing',
                desc: 'Set a Monthly USD Offer on each opportunity. When you accept/hire a candidate, Nexora generates a PDF invoice for 10%/month payable online via Paystack.',
              },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <div
                  key={idx}
                  style={{
                    padding: '20px',
                    borderRadius: '14px',
                    background: 'rgba(11, 15, 25, 0.55)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <Icon className="w-5 h-5" style={{ color: item.color, marginBottom: '10px' }} />
                  <h3 style={{ fontSize: '15px', fontWeight: 700, color: '#ffffff', marginBottom: '6px' }}>
                    {item.title}
                  </h3>
                  <p style={{ fontSize: '13px', lineHeight: 1.55, color: '#94a3b8', margin: 0 }}>
                    {item.desc}
                  </p>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <a
              href="/company/register"
              onClick={(e) => linkClick(e, '/company/register')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 22px',
                borderRadius: '10px',
                background: '#6366f1',
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
              href="/company/login"
              onClick={(e) => linkClick(e, '/company/login')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 22px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.16)',
                color: '#e2e8f0',
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: '14px',
              }}
            >
              <span>Company Sign In</span>
            </a>
          </div>
        </div>
      </section>

      {/* 4 Specialist Agents */}
      <section id="agents" style={{ maxWidth: '1120px', margin: '0 auto', padding: '56px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h2 style={{ fontSize: '28px', fontWeight: 800, color: '#ffffff', marginBottom: '10px' }}>
            Four Specialised Autonomous Agents
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '15px', maxWidth: '660px', margin: '0 auto' }}>
            Nexora-verified partner companies receive priority candidate matching first, alongside live global
            opportunity discovery. Every candidate starts with <strong style={{ color: '#34d399' }}>$5.00 free credit</strong>.
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
              name: 'Employment & Staffing',
              price: '$0.25 / submission',
              desc: 'Uses your original CV or compiles an ATS-ready PDF, attaches your Assessment Transcript & ID/Certificates, and prioritizes Nexora hiring partners.',
            },
            {
              icon: Plane,
              name: 'Relocate Abroad & Visas',
              price: '$2.00 / submission',
              desc: 'Pairs your Passport, Police Clearance & Relocation Assessment with licensed visa-sponsoring employers and immigration consultancies.',
            },
            {
              icon: TrendingUp,
              name: 'Investments & Funding',
              price: '$1.00 / submission',
              desc: 'Attaches your Pitch Deck, Business Plan, and Financials to target matched VCs, angel syndicates, accelerators, and Nexora investment providers.',
            },
            {
              icon: GraduationCap,
              name: 'Scholarships & Study',
              price: '$1.00 / submission',
              desc: 'Combines your Academic Transcripts, Motivation Letter, and Scholarship Assessment with global awards and partner institutions.',
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

      {/* End-to-End Two-Sided Flow */}
      <section id="how-it-works" style={{ maxWidth: '1080px', margin: '0 auto', padding: '56px 20px' }}>
        <div
          style={{
            padding: '32px 24px',
            borderRadius: '18px',
            background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(17, 24, 39, 0.95) 100%)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
            boxShadow: '0 16px 40px rgba(0, 0, 0, 0.35)',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '26px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 800,
                letterSpacing: '1px',
                textTransform: 'uppercase',
                color: '#60a5fa',
              }}
            >
              Start-to-Finish Platform Lifecycle
            </span>
            <h3 style={{ fontSize: '22px', fontWeight: 800, color: '#ffffff', margin: '6px 0 0 0' }}>
              From Document Upload &amp; AI Assessment to Hired Placement &amp; Paystack Billing
            </h3>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(155px, 1fr))',
              gap: '12px',
              alignItems: 'stretch',
            }}
          >
            {[
              { icon: FolderLock, label: '1. Docs & Profile', sub: 'Original CV + Supporting Docs', color: '#38bdf8' },
              { icon: ClipboardCheck, label: '2. AI Assessment', sub: '15 Tailored MCQs & Transcript', color: '#818cf8' },
              { icon: Lock, label: '3. Approve & Apply', sub: 'Partner Roles Ranked First', color: '#fbbf24' },
              { icon: Users, label: '4. AI CV Scoring', sub: '0–100% Match in Company Portal', color: '#c084fc' },
              { icon: CalendarDays, label: '5. Interview & .ics', sub: 'Email & Portal Calendar Sync', color: '#34d399' },
              { icon: CreditCard, label: '6. Hire & 10% Bill', sub: 'Monthly PDF + Paystack Pay', color: '#60a5fa' },
            ].map((node, i) => {
              const Icon = node.icon;
              return (
                <div
                  key={i}
                  style={{
                    padding: '16px 12px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(148, 163, 184, 0.16)',
                    textAlign: 'center',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <div
                    style={{
                      width: '38px',
                      height: '38px',
                      borderRadius: '10px',
                      background: 'rgba(30, 41, 59, 0.9)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: `1px solid ${node.color}55`,
                    }}
                  >
                    <Icon className="w-4 h-4" style={{ color: node.color }} />
                  </div>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#ffffff' }}>{node.label}</div>
                  <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>{node.sub}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Capabilities Grid */}
      <section style={{ maxWidth: '1040px', margin: '0 auto', padding: '24px 20px 56px 20px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          {[
            {
              icon: Bot,
              title: 'Employer AI Assistant',
              detail: 'Companies can draft job descriptions, summarise candidate CVs, and rank shortlists directly inside their dashboard.',
            },
            {
              icon: Mail,
              title: 'Strict REF Reply Tracking',
              detail: 'Every application carries a unique SUB-XXXX reference ID so newsletters and spam never pollute your interview threads.',
            },
            {
              icon: Database,
              title: 'Staffing & EOR Ready',
              detail: 'Manage placements, contracts, timesheets, and compliance-gated payroll runs for staffing companies.',
            },
            {
              icon: RefreshCw,
              title: 'Shareable Opportunity Links',
              detail: 'Every published vacancy gets a public /opportunity/:id page so anyone can view details and apply immediately.',
            },
          ].map((box, idx) => {
            const Icon = box.icon;
            return (
              <div
                key={idx}
                style={{
                  padding: '20px',
                  borderRadius: '14px',
                  background: 'rgba(15, 23, 42, 0.55)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <Icon className="w-5 h-5 text-cyan-400" style={{ marginBottom: '10px' }} />
                <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#ffffff', marginBottom: '6px' }}>
                  {box.title}
                </div>
                <p style={{ fontSize: '12.5px', color: '#94a3b8', lineHeight: 1.55, margin: 0 }}>{box.detail}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* FAQ Section */}
      <section style={{ maxWidth: '900px', margin: '0 auto', padding: '16px 20px 56px 20px' }}>
        <h2 style={{ fontSize: '24px', fontWeight: 800, color: '#ffffff', textAlign: 'center', marginBottom: '24px' }}>
          Frequently Asked Questions
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[
            {
              q: 'Does Nexora AI keep my original CV instead of rewriting it?',
              a: 'Yes. If you attach your own CV in Supporting Docs or the prerequisite modal, Nexora AI reads and submits your original PDF without overwriting it—unless you explicitly click Draft with AI.',
            },
            {
              q: 'How do AI Assessment Transcripts work?',
              a: 'In the Assignments tab, complete your category prerequisites and take a timed 15-question AI assessment tailored to your Target Job Role and CV. Upon submission, Nexora generates a permanent PDF transcript you can attach to applications.',
            },
            {
              q: 'How does the 10% monthly company fee work?',
              a: 'Posting vacancies and receiving AI-scored applications is free. When a company accepts/hires a candidate on an opportunity with a Monthly USD Offer, Nexora automatically generates a 10% monthly PDF invoice payable via Paystack.',
            },
            {
              q: 'Can companies require an Assessment Transcript before accepting applications?',
              a: 'Yes. Companies can enable "Require Verified Assessment Transcript" in Company Dashboard → Settings, ensuring only candidates with verified transcripts are submitted to their vacancies.',
            },
          ].map((faq, idx) => (
            <div
              key={idx}
              style={{
                padding: '18px 20px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#ffffff', marginBottom: '6px' }}>{faq.q}</div>
              <div style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.6 }}>{faq.a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '36px 20px',
          marginTop: '24px',
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
              Candidate App
            </a>
            <a href="/company/dashboard" onClick={(e) => linkClick(e, '/company/dashboard')} style={{ color: '#cbd5e1', textDecoration: 'none' }}>
              Company Portal
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
