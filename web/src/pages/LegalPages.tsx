import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { NexoraLogo } from '../components/NexoraLogo';

interface LegalPageProps {
  mode: 'privacy' | 'terms';
  onNavigate: (path: string) => void;
}

export const LegalPage: React.FC<LegalPageProps> = ({ mode, onNavigate }) => {
  const isPrivacy = mode === 'privacy';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0b0f19',
        color: '#e2e8f0',
        fontFamily: "'Montserrat', sans-serif",
        padding: '32px 20px 64px 20px',
      }}
    >
      <div style={{ maxWidth: '860px', margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '32px',
            flexWrap: 'wrap',
            gap: '14px',
          }}
        >
          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              onNavigate('/');
            }}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <NexoraLogo size="sm" showSubtitle={false} />
          </a>

          <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                color: '#93c5fd',
                textDecoration: 'none',
                fontSize: '13px',
                fontWeight: 600,
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Home</span>
            </a>
            <a
              href="/app"
              onClick={(e) => {
                e.preventDefault();
                onNavigate('/app');
              }}
              style={{
                padding: '8px 16px',
                borderRadius: '999px',
                background: '#2563eb',
                color: '#ffffff',
                textDecoration: 'none',
                fontSize: '13px',
                fontWeight: 700,
              }}
            >
              Launch App
            </a>
          </div>
        </div>

        <div
          style={{
            background: '#111827',
            border: '1px solid #1f2937',
            borderRadius: '16px',
            padding: '32px',
            lineHeight: 1.7,
          }}
        >
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#ffffff', marginBottom: '6px' }}>
            {isPrivacy ? 'Privacy Policy' : 'Terms & Conditions'}
          </h1>
          <p style={{ fontSize: '12.5px', color: '#94a3b8', marginBottom: '28px' }}>
            Effective Date: November 18, 2026 • Operated by{' '}
            <a
              href="https://www.empirelabs.digital/"
              target="_blank"
              rel="noreferrer"
              style={{ color: '#60a5fa' }}
            >
              Empire Labs
            </a>{' '}
            (https://www.empirelabs.digital/)
          </p>

          {isPrivacy ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontSize: '14px', color: '#cbd5e1' }}>
              <section>
                <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                  1. Who We Are
                </h2>
                <p>
                  Nexora AI is an autonomous AI workforce platform developed and operated by{' '}
                  <strong>Empire Labs</strong> (https://www.empirelabs.digital/). This Privacy Policy explains how we
                  collect, use, store, and protect your personal information when you use the Nexora AI website and
                  web application at <code>/app</code>.
                </p>
              </section>

              <section>
                <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                  2. Information We Collect
                </h2>
                <ul style={{ paddingLeft: '20px', margin: 0 }}>
                  <li>
                    <strong>Account Information:</strong> Name, email address, and authentication identifiers provided
                    when you sign in via Google or Email/Password (Firebase Authentication).
                  </li>
                  <li>
                    <strong>Profile &amp; Prerequisites Data:</strong> Career history, skills, education, nationality,
                    target destination, startup details, and uploaded documents (CVs, transcripts, pitch decks) that you
                    voluntarily submit so Nexora AI can draft deliverables on your behalf.
                  </li>
                  <li>
                    <strong>Submission &amp; Communication Records:</strong> Generated PDFs, target portals, submission
                    receipt IDs, and email replies/follow-ups processed for your active tasks.
                  </li>
                  <li>
                    <strong>Billing Metadata:</strong> Wallet credit balances and payment transaction references
                    processed securely via Paystack (we do not store raw card numbers).
                  </li>
                </ul>
              </section>

              <section>
                <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                  3. How We Use Your Information
                </h2>
                <p>
                  We use your information exclusively to: (a) draft and refine your requested PDF documents, (b)
                  discover matching jobs, visa pathways, investors, or scholarships, (c) dispatch applications{' '}
                  <strong>only after your explicit review and approval</strong>, and (d) monitor replies and alert you
                  to interview invitations.
                </p>
              </section>

              <section>
                <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                  4. Third-Party Service Providers
                </h2>
                <p>
                  To deliver these capabilities, Nexora AI integrates with trusted infrastructure providers including
                  Google Firebase (authentication &amp; cloud storage), Paystack (payment processing), AI inference
                  providers, and email transport servers (SMTP/IMAP). Each provider processes data solely to execute
                  your requested actions.
                </p>
              </section>

              <section>
                <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                  5. Data Retention, Control &amp; Deletion
                </h2>
                <p>
                  You can inspect, edit, or delete your stored profile and tasks at any time using the{' '}
                  <strong>Clear All Data</strong> control inside the app or by contacting us at{' '}
                  <a href="mailto:nexora@empirelabs.digital" style={{ color: '#60a5fa' }}>
                    nexora@empirelabs.digital
                  </a>
                  .
                </p>
              </section>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontSize: '14px', color: '#cbd5e1' }}>
              <section>
                <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                  1. Acceptance of Terms
                </h2>
                <p>
                  By accessing or using Nexora AI (operated by <strong>Empire Labs</strong>,
                  https://www.empirelabs.digital/), you agree to be bound by these Terms &amp; Conditions. If you do not
                  agree, please discontinue use of the platform.
                </p>
              </section>

              <section>
                <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                  2. Service Description &amp; Human-in-the-Loop Approval
                </h2>
                <p>
                  Nexora AI provides AI-assisted document drafting (CVs, relocation dossiers, investor memos, and
                  scholarship letters), opportunity discovery, and autonomous submission workflows. You are solely
                  responsible for reviewing the generated PDF and verifying accuracy before clicking{' '}
                  <strong>Approve &amp; Submit</strong>.
                </p>
              </section>

              <section>
                <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                  3. Credits, Pricing &amp; Paystack Payments
                </h2>
                <ul style={{ paddingLeft: '20px', margin: 0 }}>
                  <li>New accounts receive a complimentary <strong>$5.00 starter credit</strong>.</li>
                  <li>
                    Standard submissions (Employment, Investors, Scholarships) cost <strong>$1.00 per submission</strong>;
                    Relocation &amp; Visa submissions cost <strong>$2.00 per submission</strong>.
                  </li>
                  <li>
                    Additional credits may be purchased via Paystack. Purchased credits do not expire and are deducted
                    only when submissions are dispatched.
                  </li>
                </ul>
              </section>

              <section>
                <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                  4. Acceptable Use &amp; Accuracy
                </h2>
                <p>
                  You agree not to submit false credentials, spam, unlawful content, or attempt to bypass third-party
                  security controls or anti-bot protections. You represent that all information provided in your forms and
                  CVs is truthful and accurate.
                </p>
              </section>

              <section>
                <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                  5. Disclaimers &amp; Limitation of Liability
                </h2>
                <p>
                  Nexora AI facilitates discovery and submissions, but <strong>Empire Labs</strong> does not guarantee
                  job offers, visa approvals, investor funding, or scholarship awards. Services are provided &ldquo;as
                  is&rdquo; to the maximum extent permitted by applicable law.
                </p>
              </section>

              <section>
                <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
                  6. Contact
                </h2>
                <p>
                  For support or legal inquiries, contact Empire Labs at{' '}
                  <a href="mailto:nexora@empirelabs.digital" style={{ color: '#60a5fa' }}>
                    nexora@empirelabs.digital
                  </a>{' '}
                  or visit{' '}
                  <a href="https://www.empirelabs.digital/" target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>
                    https://www.empirelabs.digital/
                  </a>
                  .
                </p>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
