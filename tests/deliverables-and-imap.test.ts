import fs from 'fs/promises';
import pdfParse from 'pdf-parse';
import { describe, expect, it } from 'vitest';
import { AgentType } from '@prisma/client';
import { documentGeneratorService } from '../src/tools/document-generator.service';
import {
  classifyInterviewEmail,
  matchReplyToSubmission,
} from '../src/tools/imap-monitor.service';

describe('Zoho IMAP Interview Classification & Submission Matching', () => {
  it('flags genuine interview invitations and extracts company name', () => {
    const res = classifyInterviewEmail({
      subject: 'Interview Invitation: Senior React Engineer (SUB-12AB34CD)',
      body: 'Hi James, our hiring manager would like to schedule a call via Zoom this Thursday.',
      fromName: 'Acme Cloud Talent',
      fromAddress: 'careers@acmecloud.io',
    });

    expect(res.isInterview).toBe(true);
    expect(res.companyName).toBe('Acme Cloud Talent');
    expect(res.summary).toContain('Acme Cloud Talent');
  });

  it('does not flag polite rejections mentioning interview or other candidates', () => {
    const res = classifyInterviewEmail({
      subject: 'Update on your application',
      body: 'Unfortunately we are not moving forward with your application at this time.',
      fromName: 'Beta Corp',
      fromAddress: 'no-reply@betacorp.com',
    });

    expect(res.isInterview).toBe(false);
  });

  it('does not flag automated no-reply digests like Google Business Profile as interviews', () => {
    const res = classifyInterviewEmail({
      subject: 'Empire Digitals, your performance report for October 2026',
      body: 'Your business performance: 45 interactions. A customer calls, makes a booking. Unsubscribe here.',
      fromName: 'Google Business Profile',
      fromAddress: 'businessprofile-noreply@google.com',
    });

    expect(res.isInterview).toBe(false);
  });

  it('matches reply to the exact target submission even when all submissions share TEST_RECIPIENT_EMAIL', () => {
    const subs = [
      {
        receiptId: 'SUB-11111111',
        targetName: 'Software Engineer Jobs with Visa Sponsorship — 2026',
        contactEmail: 'info@empiredigitals.org',
      },
      {
        receiptId: 'SUB-22222222',
        targetName: '80+ Visa Sponsored Software Jobs in UK (Apply Directly) 2026',
        contactEmail: 'info@empiredigitals.org',
      },
    ];

    const matched = matchReplyToSubmission(
      {
        subject: 'Re: Job Application: James Phiri — 80+ Visa Sponsored Software Jobs in UK (Apply Directly) 2026',
        body: 'Hello, we would like us to have an interview on Friday.',
        fromAddress: 'info@empiredigitals.org',
        fromName: 'Empire Digitals',
      },
      subs,
    );

    expect(matched?.receiptId).toBe('SUB-22222222');
  });

  it('matches replies by SUB receipt ID, email, or company name', () => {
    const subs = [
      {
        receiptId: 'SUB-99AABB11',
        targetName: 'Northstar Fintech',
        contactEmail: 'talent@northstar.io',
      },
      {
        receiptId: 'SUB-77CCDD22',
        targetName: 'Horizon Robotics',
        contactEmail: 'jobs@horizon.ai',
      },
    ];

    const byReceipt = matchReplyToSubmission(
      {
        subject: 'Re: Application SUB-99AABB11',
        body: 'Can we schedule a call?',
        fromAddress: 'recruiter@northstar.io',
        fromName: 'Sarah',
      },
      subs,
    );
    expect(byReceipt?.receiptId).toBe('SUB-99AABB11');

    const byCompany = matchReplyToSubmission(
      {
        subject: 'Next steps with Horizon Robotics',
        body: 'We shortlisted your profile.',
        fromAddress: 'hiring@horizon.ai',
        fromName: 'Horizon Team',
      },
      subs,
    );
    expect(byCompany?.receiptId).toBe('SUB-77CCDD22');
  });
});

describe('Deliverable PDF Generation for Relocate, Investors & Scholarships', () => {
  it('generates real PDFs for VISA_AGENT, INVESTOR_AGENT, and EDUCATION_AGENT', async () => {
    const visaPdf = await documentGeneratorService.generateDeliverablePdfFromMarkdown(
      AgentType.VISA_AGENT,
      [
        '# 🌍 RELOCATION & VISA PATHWAY DOSSIER — Tariro Moyo',
        '## 🎯 Target Destination & Visa Route',
        'Germany — EU Blue Card & Opportunity Card',
        '## 📋 Recommended Visa Pathways',
        '- **EU Blue Card**: Eligible via Bachelor of Computer Science and software engineering experience.',
      ].join('\n\n'),
      { candidateName: 'Tariro Moyo', email: 'tariro@example.com', location: 'Germany' },
    );
    const visaText = (await pdfParse(await fs.readFile(visaPdf.filePath))).text;
    expect(visaPdf.fileName).toContain('relocation_visa_dossier_');
    expect(visaText).toContain('EU Blue Card');

    const investorPdf = await documentGeneratorService.generateDeliverablePdfFromMarkdown(
      AgentType.INVESTOR_AGENT,
      [
        '# 🚀 INVESTOR PITCH & BUSINESS MEMORANDUM — FinPulse',
        '## 🎯 Executive Summary & Funding Ask',
        'Raising **$500,000 Seed** to scale real-time SME treasury automation across Africa.',
      ].join('\n\n'),
      { candidateName: 'FinPulse', email: 'founders@finpulse.io', location: 'South Africa' },
    );
    const investorText = (await pdfParse(await fs.readFile(investorPdf.filePath))).text;
    expect(investorPdf.fileName).toContain('investor_pitch_memo_');
    expect(investorText).toContain('FinPulse');

    const eduPdf = await documentGeneratorService.generateDeliverablePdfFromMarkdown(
      AgentType.EDUCATION_AGENT,
      [
        '# 🎓 SCHOLARSHIP & ADMISSIONS DOSSIER — Anesu Banda',
        '## 📝 Statement of Purpose',
        'Applying for Chevening & DAAD MSc in Artificial Intelligence to build resilient agri-tech systems.',
      ].join('\n\n'),
      { candidateName: 'Anesu Banda', email: 'anesu@example.com', location: 'United Kingdom' },
    );
    const eduText = (await pdfParse(await fs.readFile(eduPdf.filePath))).text;
    expect(eduPdf.fileName).toContain('scholarship_application_');
    expect(eduText).toContain('Chevening');
  }, 30000);
});
