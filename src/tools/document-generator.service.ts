import fs from 'fs/promises';
import path from 'path';
import { chromium, type Browser } from 'playwright-core';
import { logger } from '../utils/logger';
import { NEXORA_LOGO_BASE64, NEXORA_ICON_BASE64 } from '../assets/logo';
import { AgentType } from '@prisma/client';
import { sendMail } from './email.service';

export interface DocumentSection {
  title: string;
  subheading?: string;
  content: string;
  tableData?: { headers: string[]; rows: string[][] };
  calloutBox?: { title: string; text: string; type?: 'info' | 'highlight' | 'metric' };
  bulletPoints?: string[];
  metricsGrid?: Array<{ label: string; value: string; change?: string }>;
}

export interface BusinessPlanOptions {
  companyName: string;
  documentTitle?: string;
  subtitle?: string;
  founderName: string;
  founderEmail?: string;
  founderPhone?: string;
  websiteUrl?: string;
  location?: string;
  industry?: string;
  targetRaise?: string;
  targetPages?: number; // e.g. 5, 10, 15, up to 30
  customSections?: DocumentSection[];
  recipientEmail?: string;
}

export interface CvPdfOptions {
  candidateName: string;
  targetRole: string;
  email?: string;
  phone?: string;
  location?: string;
  summary: string;
  skills: string[];
  experienceItems: Array<{
    role: string;
    company: string;
    period?: string;
    highlights: string[];
  }>;
  educationItems: Array<{
    qualification: string;
    institution: string;
    year?: string;
  }>;
}

export interface GeneratedDocumentResult {
  fileName: string;
  filePath: string;
  fileSizeBytes: number;
  estimatedPages: number;
  downloadUrl: string;
  emailedTo?: string;
  smtpMessageId?: string;
  createdAt: string;
}

const DEFAULT_MAC_CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export class DocumentGeneratorService {
  private readonly docsDir: string;

  constructor(docsDir?: string) {
    this.docsDir =
      docsDir ?? path.resolve(process.cwd(), 'node_modules', '.cache', 'nexora-documents');
  }

  /**
   * Generates a publication-grade, beautifully formatted PDF document
   * (e.g. 5 to 30 page comprehensive Business Plan / Investment Memorandum)
   * using Headless Chrome print-to-PDF with custom typography, tables, and footers.
   */
  public async generateBusinessPlanPdf(
    options: BusinessPlanOptions,
  ): Promise<GeneratedDocumentResult> {
    await fs.mkdir(this.docsDir, { recursive: true });

    const safeCompany = options.companyName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const fileName = `${safeCompany}_business_plan_${Date.now()}.pdf`;
    const filePath = path.join(this.docsDir, fileName);

    const htmlContent = this.buildFullDocumentHtml(options);

    let browser: Browser | null = null;
    try {
      const executablePath = process.env.CHROME_EXECUTABLE_PATH || DEFAULT_MAC_CHROME_PATH;
      browser = await chromium.launch({
        executablePath,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });

      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 15000 });

      // Generate the PDF with custom headers and footers featuring Nexora AI logo
      await page.pdf({
        path: filePath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '22mm',
          bottom: '22mm',
          left: '18mm',
          right: '18mm',
        },
        displayHeaderFooter: true,
        headerTemplate: `
          <div style="width: 100%; font-family: 'Montserrat', sans-serif; font-size: 8px; color: #94a3b8; display: flex; justify-content: space-between; align-items: center; padding: 0 18mm; border-bottom: 0.5px solid #e2e8f0; padding-bottom: 4px;">
            <span>${this.escapeHtml(options.companyName)} — ${this.escapeHtml(options.documentTitle || 'Executive Business Plan')}</span>
            <span style="font-weight: 700; color: #6366f1;">CONFIDENTIAL</span>
          </div>
        `,
        footerTemplate: `
          <div style="width: 100%; font-family: 'Montserrat', sans-serif; font-size: 8px; color: #64748b; display: flex; justify-content: space-between; align-items: center; padding: 0 18mm; border-top: 0.5px solid #e2e8f0; padding-top: 4px;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="font-weight: 800; color: #0f172a; letter-spacing: 0.5px;">Powered by Nexora AI</span>
              <span style="color: #cbd5e1;">|</span>
              <span>Autonomous Workforce Intelligence</span>
            </div>
            <div>
              Page <span class="pageNumber"></span> of <span class="totalPages"></span>
            </div>
          </div>
        `,
      });

      const stats = await fs.stat(filePath);
      logger.info({ filePath, size: stats.size }, 'Document PDF successfully compiled');

      let emailedTo: string | undefined;
      let smtpMessageId: string | undefined;

      // If a recipient email is specified, automatically send via Zoho SMTP
      const targetEmail = options.recipientEmail || process.env.TEST_RECIPIENT_EMAIL || 'info@empiredigitals.org';
      if (targetEmail) {
        try {
          const emailSubject = `[Document Generated] ${options.companyName} — ${options.documentTitle || 'Comprehensive Business Plan'}`;
          const emailHtml = `
            <div style="font-family: 'Montserrat', sans-serif; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 12px;">
              <div style="background: linear-gradient(135deg, #06b6d4, #6366f1); padding: 14px 20px; border-radius: 8px; margin-bottom: 20px;">
                <h2 style="margin: 0; color: #ffffff; font-size: 18px;">Nexora AI Document Generation Service</h2>
              </div>
              <p>Hello,</p>
              <p>Nexora AI has completed compiling the official <strong>${this.escapeHtml(options.documentTitle || 'Business Plan')}</strong> for <strong>${this.escapeHtml(options.companyName)}</strong> on behalf of <strong>${this.escapeHtml(options.founderName)}</strong>.</p>
              <div style="background: #1e293b; padding: 16px; border-radius: 8px; border-left: 4px solid #38bdf8; margin: 16px 0;">
                <p style="margin: 4px 0;"><strong>File Name:</strong> ${fileName}</p>
                <p style="margin: 4px 0;"><strong>Document Size:</strong> ${(stats.size / 1024).toFixed(1)} KB</p>
                <p style="margin: 4px 0;"><strong>Industry / Focus:</strong> ${this.escapeHtml(options.industry || 'Music-Tech & Phygital Fashion')}</p>
                <p style="margin: 4px 0;"><strong>Target Raise:</strong> ${this.escapeHtml(options.targetRaise || '$250,000')}</p>
              </div>
              <p>The full publication PDF is attached to this email.</p>
              <hr style="border: 0; border-top: 1px solid #334155; margin: 20px 0;" />
              <p style="font-size: 12px; color: #94a3b8; text-align: center;">Powered by <strong>Nexora AI</strong> — Multi-Tenant AI Workforce Platform</p>
            </div>
          `;

          const sendResult = await sendMail({
            to: targetEmail,
            subject: emailSubject,
            html: emailHtml,
            attachments: [
              {
                filename: fileName,
                path: filePath,
              },
            ],
          });

          emailedTo = sendResult.to;
          smtpMessageId = sendResult.messageId;
          logger.info({ emailedTo, smtpMessageId }, 'Business plan PDF emailed to recipient');
        } catch (emailErr) {
          logger.warn({ err: emailErr }, 'Could not email generated PDF');
        }
      }

      return {
        fileName,
        filePath,
        fileSizeBytes: stats.size,
        estimatedPages: options.targetPages || 12,
        downloadUrl: `/api/v1/documents/download/${fileName}`,
        emailedTo,
        smtpMessageId,
        createdAt: new Date().toISOString(),
      };
    } finally {
      if (browser) {
        await browser.close().catch(() => undefined);
      }
    }
  }

  /**
   * Assembles the complete HTML structure including Cover Page, Table of Contents,
   * extensive multi-page executive sections, financial model tables, and charts.
   */
  private buildFullDocumentHtml(options: BusinessPlanOptions): string {
    const sections = options.customSections || this.getDefaultBusinessPlanSections(options);

    const sectionsHtml = sections
      .map((sec, idx) => this.renderSectionHtml(sec, idx + 1))
      .join('\n');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${this.escapeHtml(options.companyName)} — Business Plan</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4;
      margin: 20mm 16mm 22mm 16mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      color: #1e293b;
      background: #ffffff;
      line-height: 1.65;
      font-size: 11pt;
      margin: 0;
      padding: 0;
    }
    h1, h2, h3, h4, .brand-font {
      font-family: 'Montserrat', sans-serif;
      color: #0f172a;
      font-weight: 700;
    }
    .page-break {
      page-break-after: always;
      break-after: page;
    }
    
    /* Cover Page Styling */
    .cover-page {
      min-height: 940px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 40px 20px;
      position: relative;
    }
    .cover-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 24px;
    }
    .cover-badge {
      display: inline-block;
      background: linear-gradient(135deg, #06b6d4, #6366f1);
      color: #ffffff;
      font-family: 'Montserrat', sans-serif;
      font-size: 9pt;
      font-weight: 800;
      letter-spacing: 1.5px;
      text-transform: uppercase;
      padding: 6px 16px;
      border-radius: 999px;
      margin-bottom: 24px;
    }
    .cover-title {
      font-size: 32pt;
      font-weight: 900;
      line-height: 1.15;
      color: #0f172a;
      margin: 0 0 16px 0;
      letter-spacing: -0.5px;
    }
    .cover-subtitle {
      font-size: 14pt;
      color: #475569;
      font-weight: 400;
      line-height: 1.5;
      max-width: 650px;
      margin: 0 0 32px 0;
    }
    .cover-meta-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 24px;
      margin-top: 40px;
    }
    .cover-meta-item {
      display: flex;
      flex-direction: column;
    }
    .cover-meta-label {
      font-family: 'Montserrat', sans-serif;
      font-size: 8pt;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 4px;
    }
    .cover-meta-value {
      font-size: 11pt;
      font-weight: 600;
      color: #0f172a;
    }
    .cover-footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9pt;
      color: #94a3b8;
    }

    /* Table of Contents */
    .toc-container {
      padding: 20px 0;
    }
    .toc-title {
      font-size: 22pt;
      margin-bottom: 24px;
      color: #0f172a;
      border-bottom: 3px solid #6366f1;
      padding-bottom: 8px;
      display: inline-block;
    }
    .toc-item {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 10px 0;
      border-bottom: 1px dashed #e2e8f0;
      font-size: 11pt;
    }
    .toc-item-title {
      font-weight: 600;
      color: #1e293b;
    }
    .toc-item-num {
      font-weight: 700;
      color: #6366f1;
      font-family: 'Montserrat', sans-serif;
    }

    /* Content Sections */
    .section-container {
      margin-bottom: 30px;
    }
    .section-header {
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 10px;
      margin-bottom: 18px;
    }
    .section-number {
      font-family: 'Montserrat', sans-serif;
      font-size: 10pt;
      font-weight: 800;
      color: #6366f1;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .section-title {
      font-size: 18pt;
      margin: 4px 0 0 0;
      color: #0f172a;
    }
    .section-subheading {
      font-size: 11pt;
      color: #64748b;
      margin: 4px 0 0 0;
      font-weight: 400;
    }

    /* Metrics Grid */
    .metrics-container {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 14px;
      margin: 20px 0;
    }
    .metric-card {
      background: linear-gradient(135deg, #f8fafc, #f1f5f9);
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 16px;
      text-align: center;
    }
    .metric-value {
      font-family: 'Montserrat', sans-serif;
      font-size: 18pt;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .metric-label {
      font-size: 8.5pt;
      color: #64748b;
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.5px;
    }

    /* Callout Box */
    .callout-box {
      border-left: 4px solid #6366f1;
      background: #f8fafc;
      padding: 16px 20px;
      border-radius: 0 10px 10px 0;
      margin: 20px 0;
    }
    .callout-title {
      font-family: 'Montserrat', sans-serif;
      font-size: 11pt;
      font-weight: 700;
      color: #1e1b4b;
      margin-bottom: 6px;
    }
    .callout-text {
      margin: 0;
      color: #334155;
      font-size: 10pt;
      line-height: 1.6;
    }

    /* Data Tables */
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 9.5pt;
    }
    table.data-table th {
      background: #0f172a;
      color: #ffffff;
      font-family: 'Montserrat', sans-serif;
      font-weight: 700;
      text-align: left;
      padding: 10px 14px;
      border: 1px solid #0f172a;
    }
    table.data-table td {
      padding: 9px 14px;
      border: 1px solid #e2e8f0;
      color: #1e293b;
    }
    table.data-table tr:nth-child(even) {
      background-color: #f8fafc;
    }

    /* Bullet List */
    ul.feature-list {
      padding-left: 20px;
      margin: 14px 0;
    }
    ul.feature-list li {
      margin-bottom: 8px;
      color: #334155;
    }
  </style>
</head>
<body>

  <!-- ==================== COVER PAGE ==================== -->
  <div class="cover-page page-break">
    <div class="cover-top">
      <img src="${NEXORA_LOGO_BASE64}" alt="Nexora AI Logo" style="height: 38px;" />
      <span style="font-family: 'Montserrat', sans-serif; font-size: 8.5pt; font-weight: 700; color: #64748b; letter-spacing: 1px;">INVESTOR MEMORANDUM</span>
    </div>

    <div style="margin-top: 60px;">
      <div class="cover-badge">${this.escapeHtml(options.industry || 'TECHNOLOGY VENTURE')}</div>
      <h1 class="cover-title">${this.escapeHtml(options.documentTitle || `${options.companyName} Comprehensive Business Plan`)}</h1>
      <p class="cover-subtitle">${this.escapeHtml(options.subtitle || 'Executive Strategy, Live Market Traction, Financial Projections & Pre-Seed Investment Roadmap')}</p>
    </div>

    <div>
      <div class="cover-meta-grid">
        <div class="cover-meta-item">
          <span class="cover-meta-label">Ventures / Company</span>
          <span class="cover-meta-value">${this.escapeHtml(options.companyName)}</span>
        </div>
        <div class="cover-meta-item">
          <span class="cover-meta-label">Founder & Lead Executive</span>
          <span class="cover-meta-value">${this.escapeHtml(options.founderName)}</span>
        </div>
        <div class="cover-meta-item">
          <span class="cover-meta-label">Headquarters / Market</span>
          <span class="cover-meta-value">${this.escapeHtml(options.location || 'Sandton, Johannesburg, South Africa')}</span>
        </div>
        <div class="cover-meta-item">
          <span class="cover-meta-label">Capital Requirement</span>
          <span class="cover-meta-value" style="color: #6366f1; font-weight: 800;">${this.escapeHtml(options.targetRaise || '$250,000 Pre-Seed Round')}</span>
        </div>
      </div>

      <div class="cover-footer">
        <span>Prepared via Nexora AI Autonomous Workforce</span>
        <span>Date: ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
      </div>
    </div>
  </div>

  <!-- ==================== TABLE OF CONTENTS ==================== -->
  <div class="toc-container page-break">
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
      <h2 class="toc-title" style="margin: 0;">Table of Contents</h2>
      <img src="${NEXORA_ICON_BASE64}" style="width: 28px; height: 28px;" />
    </div>

    ${sections
      .map(
        (sec, i) => `
      <div class="toc-item">
        <span class="toc-item-title">${i + 1}. ${this.escapeHtml(sec.title)}</span>
        <span class="toc-item-num">Section ${i + 1}</span>
      </div>
    `,
      )
      .join('')}
  </div>

  <!-- ==================== CONTENT SECTIONS ==================== -->
  ${sectionsHtml}

</body>
</html>
    `.trim();
  }

  private renderSectionHtml(section: DocumentSection, index: number): string {
    const metricsHtml = section.metricsGrid
      ? `
      <div class="metrics-container">
        ${section.metricsGrid
          .map(
            (m) => `
          <div class="metric-card">
            <div class="metric-value">${this.escapeHtml(m.value)}</div>
            <div class="metric-label">${this.escapeHtml(m.label)}</div>
            ${m.change ? `<div style="font-size: 8pt; color: #10b981; font-weight: 700; margin-top: 4px;">${this.escapeHtml(m.change)}</div>` : ''}
          </div>
        `,
          )
          .join('')}
      </div>
    `
      : '';

    const calloutHtml = section.calloutBox
      ? `
      <div class="callout-box">
        <div class="callout-title">${this.escapeHtml(section.calloutBox.title)}</div>
        <p class="callout-text">${this.escapeHtml(section.calloutBox.text)}</p>
      </div>
    `
      : '';

    const tableHtml = section.tableData
      ? `
      <table class="data-table">
        <thead>
          <tr>
            ${section.tableData.headers.map((h) => `<th>${this.escapeHtml(h)}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${section.tableData.rows
            .map(
              (row) => `
            <tr>
              ${row.map((cell) => `<td>${this.escapeHtml(cell)}</td>`).join('')}
            </tr>
          `,
            )
            .join('')}
        </tbody>
      </table>
    `
      : '';

    const bulletsHtml = section.bulletPoints
      ? `
      <ul class="feature-list">
        ${section.bulletPoints.map((b) => `<li>${this.escapeHtml(b)}</li>`).join('')}
      </ul>
    `
      : '';

    return `
      <div class="section-container page-break">
        <div class="section-header">
          <div class="section-number">Section ${index}</div>
          <h2 class="section-title">${this.escapeHtml(section.title)}</h2>
          ${section.subheading ? `<p class="section-subheading">${this.escapeHtml(section.subheading)}</p>` : ''}
        </div>

        <div>
          <p style="white-space: pre-line;">${this.escapeHtml(section.content)}</p>
          ${metricsHtml}
          ${calloutHtml}
          ${tableHtml}
          ${bulletsHtml}
        </div>
      </div>
    `;
  }

  private getDefaultBusinessPlanSections(options: BusinessPlanOptions): DocumentSection[] {
    return [
      {
        title: 'Executive Summary',
        content: `Comprehensive business plan and operational roadmap for ${options.companyName}, led by ${options.founderName}.`,
      },
      {
        title: 'Market Analysis & Strategic Roadmap',
        content: `Detailed industry positioning, addressable market analysis, and product differentiation for ${options.companyName} in ${options.industry || 'the target sector'}.`,
      },
      {
        title: 'Financial Projections & Capital Allocation',
        content: `Target funding requirement: ${options.targetRaise || 'Growth Capital'}, allocated across product development, customer acquisition, and operations.`,
      },
    ];
  }

  /**
   * Parses a compiled Markdown CV (e.g. generated by OpenClaw) into structured CvPdfOptions
   * and compiles it into a real PDF file via Headless Chrome.
   */
  public async generateCvPdfFromMarkdown(
    markdownText: string,
    fallback: { candidateName?: string; email?: string; phone?: string; location?: string } = {},
  ): Promise<GeneratedDocumentResult> {
    const clean = markdownText.replace(/\r\n/g, '\n');

    const extractSection = (headingPattern: RegExp): string => {
      const lines = clean.split('\n');
      let capturing = false;
      let capturedLevel = 2;
      const collected: string[] = [];
      for (const line of lines) {
        const headingMatch = line.match(/^(#{1,3})\s+(.+)/);
        if (headingMatch) {
          const level = headingMatch[1]!.length;
          if (capturing) {
            // Only stop when we reach a heading of the SAME or HIGHER level (e.g. ## stops at ## or #, NOT at ###)
            if (level <= capturedLevel) break;
          } else if (headingPattern.test(headingMatch[2]!)) {
            capturing = true;
            capturedLevel = level;
            continue;
          }
        }
        if (capturing) {
          if (/^---+$/.test(line.trim())) break;
          collected.push(line);
        }
      }
      return collected.join('\n').trim();
    };

    const nameMatch = clean.match(/CURRICULUM\s+VITAE\s*[—–-]\s*([^\n#*]+)/i);
    const candidateName = (nameMatch?.[1] || fallback.candidateName || 'Candidate').trim();

    const targetRoleSec = extractSection(/Target\s+Role|Target\s+Position/i);
    const roleInlineMatch = clean.match(/\*\*Target\s+(?:Role|Position):\*\*\s*([^|\n]+)/i);
    const targetRole = (
      targetRoleSec.split('\n').find((l) => l.trim())?.replace(/\*\*/g, '') ||
      roleInlineMatch?.[1] ||
      'Senior Software Developer'
    ).trim();

    const locationSec = extractSection(/Location/i);
    const locInlineMatch = clean.match(/\*\*(?:Target\s+)?Location:\*\*\s*([^\n]+)/i);
    const location = (
      locationSec.split('\n').find((l) => l.trim())?.replace(/\*\*/g, '') ||
      locInlineMatch?.[1] ||
      fallback.location ||
      'South Africa / Remote'
    ).trim();

    const email =
      clean.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/)?.[0] ||
      fallback.email ||
      '';
    const phone =
      clean.match(/(?:\+?\d[\d\s\-()]{7,16}\d)/)?.[0]?.trim() ||
      fallback.phone ||
      '';

    const summarySec = extractSection(/Professional\s+Summary/i);
    const summary =
      summarySec.replace(/\s+/g, ' ').trim() ||
      `${targetRole} with strong experience delivering scalable web and mobile applications.`;

    const skillsSec = extractSection(/Skills|Competencies/i);
    const skills = skillsSec
      .split(/\n|,/)
      .map((s) => s.replace(/^[-•*]\s*/, '').replace(/\*\*[^*]+:\*\*\s*/g, '').replace(/^[A-Za-z\s&]+:\s*/, '').trim())
      .filter((s) => s.length >= 2 && s.length <= 50)
      .slice(0, 20);

    const expSec = extractSection(/Experience/i);
    const experienceItems: CvPdfOptions['experienceItems'] = [];
    if (expSec) {
      const hasSubheadings = /^###\s+/m.test(expSec);
      const blocks = hasSubheadings
        ? expSec.split(/\n(?=###\s+)/).filter((b) => b.trim())
        : expSec.split(/\n(?=(?:\*\*)?[A-Z0-9][^\n]*(?:\n[^\n]*\|[^\n]*|\s+[—–-]\s+[^\n]*))/).filter((b) => b.trim());

      for (const block of blocks) {
        const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length === 0) continue;
        const bullets = lines
          .filter((l) => /^[-•*]/.test(l))
          .map((l) => l.replace(/^[-•*]\s*/, '').replace(/\*\*/g, '').trim());
        const headerLines = lines.filter((l) => !/^[-•*]/.test(l));
        const firstLine = (headerLines[0] || '').replace(/^###\s+/, '').replace(/\*\*/g, '').trim();
        const secondLine = (headerLines[1] || '').replace(/\*\*/g, '').replace(/\*/g, '').trim();

        let company = firstLine;
        let role = targetRole;
        let period = '';

        if (/\s+[—–-]\s+/.test(firstLine)) {
          const [compPart, rolePart] = firstLine.split(/\s+[—–-]\s+/);
          company = compPart?.trim() || firstLine;
          role = rolePart?.trim() || targetRole;
        }

        if (secondLine) {
          if (secondLine.includes('|')) {
            const [rPart, pPart] = secondLine.split('|').map((p) => p.trim());
            if (rPart && !/\d{4}/.test(rPart)) role = rPart;
            period = pPart || secondLine;
          } else {
            period = secondLine;
          }
        }

        experienceItems.push({
          company: company || 'Employer',
          role: role || targetRole,
          period,
          highlights: bullets.length > 0 ? bullets : ['Delivered production software solutions.'],
        });
      }
    }
    if (experienceItems.length === 0) {
      experienceItems.push({
        role: targetRole,
        company: 'Verified Industry Experience',
        highlights: ['Engineered and delivered production web and mobile applications.'],
      });
    }

    const eduSec = extractSection(/Education/i);
    const educationItems: CvPdfOptions['educationItems'] = [];
    const eduLines = eduSec
      .split('\n')
      .map((l) => l.replace(/^[-•*]\s*/, '').replace(/\*\*/g, '').trim())
      .filter(Boolean);
    if (eduLines.length > 0) {
      educationItems.push({
        qualification: eduLines[0]!,
        institution: eduLines[1]?.replace(/^Field:\s*/i, '') || '',
      });
    } else {
      educationItems.push({
        qualification: 'Diploma / Degree in Information Technology',
        institution: '',
      });
    }

    return this.generateCvPdf({
      candidateName,
      targetRole,
      email,
      phone,
      location,
      summary,
      skills: skills.length > 0 ? skills : ['React.js', 'React Native', 'Node.js', 'TypeScript', 'AWS'],
      experienceItems,
      educationItems,
    });
  }

  /**
   * Generates an ATS-friendly, publication-grade CV / Resume PDF using Headless Chrome.
   */
  public async generateCvPdf(options: CvPdfOptions): Promise<GeneratedDocumentResult> {
    await fs.mkdir(this.docsDir, { recursive: true });

    const safeName = (options.candidateName || 'candidate')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .toLowerCase();
    const fileName = `${safeName}_cv_${Date.now()}.pdf`;
    const filePath = path.join(this.docsDir, fileName);

    const skillsHtml = options.skills
      .map(
        (s) =>
          `<span style="display:inline-block;background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:600;margin:0 6px 6px 0;">${this.escapeHtml(s)}</span>`,
      )
      .join('');

    const expHtml = options.experienceItems
      .map(
        (exp) => `
        <div style="margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;">
            <strong style="font-size:13px;color:#0f172a;">${this.escapeHtml(exp.role)} — <span style="color:#2563eb;">${this.escapeHtml(exp.company)}</span></strong>
            ${exp.period ? `<span style="font-size:11px;color:#64748b;font-weight:600;">${this.escapeHtml(exp.period)}</span>` : ''}
          </div>
          <ul style="margin:6px 0 0 18px;padding:0;font-size:11.5px;color:#334155;line-height:1.55;">
            ${exp.highlights.map((h) => `<li style="margin-bottom:3px;">${this.escapeHtml(h)}</li>`).join('')}
          </ul>
        </div>`,
      )
      .join('');

    const eduHtml = options.educationItems
      .map(
        (edu) => `
        <div style="margin-bottom:8px;font-size:12px;color:#1e293b;">
          <strong>${this.escapeHtml(edu.qualification)}</strong>${edu.institution ? ` — ${this.escapeHtml(edu.institution)}` : ''}
          ${edu.year ? `<span style="color:#64748b;"> (${this.escapeHtml(edu.year)})</span>` : ''}
        </div>`,
      )
      .join('');

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap');
    body { font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a; margin: 0; padding: 0; }
    .header { border-bottom: 2px solid #2563eb; padding-bottom: 14px; margin-bottom: 18px; }
    .name { font-size: 24px; font-weight: 800; color: #0f172a; margin: 0; letter-spacing: -0.3px; }
    .role { font-size: 13px; font-weight: 700; color: #2563eb; margin: 4px 0 8px 0; text-transform: uppercase; letter-spacing: 0.6px; }
    .contact { font-size: 11px; color: #475569; }
    .section-title { font-size: 12px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin: 18px 0 10px 0; }
    .summary { font-size: 11.5px; color: #334155; line-height: 1.6; margin: 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1 class="name">${this.escapeHtml(options.candidateName)}</h1>
    <div class="role">${this.escapeHtml(options.targetRole)}</div>
    <div class="contact">
      ${options.location ? `${this.escapeHtml(options.location)} • ` : ''}${options.email ? `${this.escapeHtml(options.email)} • ` : ''}${options.phone ? this.escapeHtml(options.phone) : ''}
    </div>
  </div>

  <div class="section-title">Professional Summary</div>
  <p class="summary">${this.escapeHtml(options.summary)}</p>

  <div class="section-title">Core Technical Skills</div>
  <div style="margin-top:6px;">${skillsHtml}</div>

  <div class="section-title">Professional Experience</div>
  ${expHtml}

  <div class="section-title">Education & Qualifications</div>
  ${eduHtml}
</body>
</html>`;

    return this.renderHtmlToPdf(
      htmlContent,
      fileName,
      `Curriculum Vitae — ${options.candidateName}`,
    );
  }

  /**
   * Generates a publication-grade PDF for any specialist agent's compiled Markdown deliverable
   * (CV for JOB_AGENT, Relocation & Visa Dossier for VISA_AGENT, Pitch Memorandum for INVESTOR_AGENT,
   * or Scholarship Motivation Dossier for EDUCATION_AGENT).
   */
  public async generateDeliverablePdfFromMarkdown(
    agentType: AgentType,
    markdownText: string,
    fallback?: {
      candidateName?: string;
      email?: string;
      phone?: string;
      location?: string;
      title?: string;
    },
  ): Promise<GeneratedDocumentResult> {
    if (agentType === AgentType.JOB_AGENT) {
      return this.generateCvPdfFromMarkdown(markdownText, fallback);
    }

    await fs.mkdir(this.docsDir, { recursive: true });

    const metaByAgent: Record<string, { prefix: string; badge: string; defaultTitle: string; accent: string }> = {
      [AgentType.VISA_AGENT]: {
        prefix: 'relocation_visa_dossier',
        badge: 'RELOCATION & VISA PATHWAY DOSSIER',
        defaultTitle: 'International Relocation & Visa Strategy',
        accent: '#0d9488',
      },
      [AgentType.INVESTOR_AGENT]: {
        prefix: 'investor_pitch_memo',
        badge: 'INVESTOR PITCH & BUSINESS MEMORANDUM',
        defaultTitle: 'Venture Pitch & Investment Memorandum',
        accent: '#2563eb',
      },
      [AgentType.EDUCATION_AGENT]: {
        prefix: 'scholarship_application',
        badge: 'SCHOLARSHIP & ADMISSIONS DOSSIER',
        defaultTitle: 'Scholarship Motivation & Academic Profile',
        accent: '#7c3aed',
      },
    };

    const meta = metaByAgent[agentType] ?? {
      prefix: 'nexora_deliverable',
      badge: 'EXECUTIVE DELIVERABLE',
      defaultTitle: fallback?.title || 'Nexora AI Strategic Dossier',
      accent: '#2563eb',
    };

    const rawH1 = markdownText.match(/^#\s+(.+)$/m)?.[1]?.replace(/[*_`#📄🌍💼🎓🎯]/g, '').trim();
    const docTitle = rawH1 || fallback?.title || meta.defaultTitle;
    const ownerName = fallback?.candidateName || 'Candidate';
    const safeName = ownerName.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() || 'nexora';
    const fileName = `${meta.prefix}_${safeName}_${Date.now()}.pdf`;

    const bodyHtml = this.markdownToStyledHtml(markdownText, meta.accent);
    const contactLine = [fallback?.location, fallback?.email, fallback?.phone].filter(Boolean).join(' • ');

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800&display=swap');
    body { font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a; margin: 0; padding: 0; line-height: 1.58; }
    .hero { border-bottom: 2.5px solid ${meta.accent}; padding-bottom: 14px; margin-bottom: 18px; }
    .badge { display: inline-block; font-size: 9.5px; font-weight: 800; letter-spacing: 0.9px; color: ${meta.accent}; text-transform: uppercase; margin-bottom: 6px; }
    .title { font-size: 21px; font-weight: 800; color: #0f172a; margin: 0; letter-spacing: -0.3px; }
    .meta { font-size: 11px; color: #475569; margin-top: 6px; }
    h2 { font-size: 12.5px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.7px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin: 18px 0 8px 0; }
    h3 { font-size: 12px; font-weight: 700; color: ${meta.accent}; margin: 12px 0 4px 0; }
    p { font-size: 11.2px; color: #334155; margin: 0 0 8px 0; }
    ul { margin: 4px 0 10px 18px; padding: 0; }
    li { font-size: 11.2px; color: #334155; margin-bottom: 4px; }
  </style>
</head>
<body>
  <div class="hero">
    <div class="badge">${this.escapeHtml(meta.badge)}</div>
    <h1 class="title">${this.escapeHtml(docTitle)}</h1>
    ${contactLine || ownerName !== 'Candidate' ? `<div class="meta">${this.escapeHtml([ownerName !== 'Candidate' ? ownerName : '', contactLine].filter(Boolean).join(' • '))}</div>` : ''}
  </div>
  ${bodyHtml}
</body>
</html>`;

    return this.renderHtmlToPdf(htmlContent, fileName, docTitle);
  }

  private markdownToStyledHtml(markdownText: string, accentColor: string): string {
    const lines = markdownText.split(/\r?\n/);
    const chunks: string[] = [];
    let inList = false;
    let skippedFirstH1 = false;

    const formatInline = (text: string): string => {
      const escaped = this.escapeHtml(text);
      return escaped
        .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#0f172a;">$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, `<code style="background:#f1f5f9;padding:1px 4px;border-radius:3px;color:${accentColor};font-size:10.5px;">$1</code>`);
    };

    const closeList = () => {
      if (inList) {
        chunks.push('</ul>');
        inList = false;
      }
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
        closeList();
        continue;
      }
      if (/^#\s+/.test(line) && !skippedFirstH1) {
        skippedFirstH1 = true;
        continue;
      }
      if (/^#{1,2}\s+/.test(line)) {
        closeList();
        const heading = line.replace(/^#{1,2}\s+/, '').trim();
        chunks.push(`<h2>${formatInline(heading)}</h2>`);
        continue;
      }
      if (/^###\s+/.test(line)) {
        closeList();
        const sub = line.replace(/^###\s+/, '').trim();
        chunks.push(`<h3>${formatInline(sub)}</h3>`);
        continue;
      }
      if (/^[-*•]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
        if (!inList) {
          chunks.push('<ul>');
          inList = true;
        }
        const item = line.replace(/^(?:[-*•]|\d+\.)\s+/, '').trim();
        chunks.push(`<li>${formatInline(item)}</li>`);
        continue;
      }
      closeList();
      chunks.push(`<p>${formatInline(line)}</p>`);
    }
    closeList();
    return chunks.join('\n');
  }

  private async renderHtmlToPdf(
    htmlContent: string,
    fileName: string,
    footerTitle: string,
  ): Promise<GeneratedDocumentResult> {
    const filePath = path.join(this.docsDir, fileName);
    let browser: Browser | null = null;
    try {
      const executablePath = process.env.CHROME_EXECUTABLE_PATH || DEFAULT_MAC_CHROME_PATH;
      browser = await chromium.launch({
        executablePath,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      });

      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.pdf({
        path: filePath,
        format: 'A4',
        printBackground: true,
        margin: { top: '16mm', bottom: '18mm', left: '16mm', right: '16mm' },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
          <div style="width:100%;font-family:'Montserrat',sans-serif;font-size:8px;color:#64748b;display:flex;justify-content:space-between;align-items:center;padding:0 16mm;">
            <span>${this.escapeHtml(footerTitle)}</span>
            <span>Powered by <strong>Nexora AI</strong></span>
          </div>
        `,
      });

      const stats = await fs.stat(filePath);
      return {
        fileName,
        filePath,
        fileSizeBytes: stats.size,
        estimatedPages: 1,
        downloadUrl: `/api/v1/documents/download/${fileName}`,
        createdAt: new Date().toISOString(),
      };
    } finally {
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }

  public async generateAssessmentTranscriptPdf(params: {
    candidateName: string;
    candidateEmail?: string;
    cvFileName?: string;
    assignmentTitle: string;
    category: string;
    totalQuestions: number;
    correctCount: number;
    percentageScore: number;
    passed: boolean;
    totalDurationSec: number;
    topicBreakdown: Record<string, { correct: number; total: number }>;
    difficultyBreakdown: Record<string, { correct: number; total: number }>;
    aiPerformanceSummary: string;
    submittedAt: string;
    questionDetails: Array<{
      order: number;
      topic: string;
      difficulty: string;
      statement: string;
      selectedAnswer: string;
      correctAnswer: string;
      isCorrect: boolean;
      timeSpentSec: number;
    }>;
  }): Promise<GeneratedDocumentResult> {
    const safeSlug = params.candidateName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'candidate';
    const fileName = `transcript_${safeSlug}_${Date.now()}.pdf`;
    const topicRows = Object.entries(params.topicBreakdown)
      .map(
        ([topic, s]) =>
          `<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${this.escapeHtml(topic)}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;">${s.correct}/${s.total} (${s.total ? Math.round((s.correct / s.total) * 100) : 0}%)</td></tr>`,
      )
      .join('');
    const diffRows = Object.entries(params.difficultyBreakdown)
      .map(
        ([lvl, s]) =>
          `<tr><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;">${this.escapeHtml(lvl)}</td><td style="padding:6px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700;">${s.correct}/${s.total}</td></tr>`,
      )
      .join('');
    const qRows = params.questionDetails
      .map(
        (q) => `
          <div style="margin-bottom:10px;padding:10px 12px;border:1px solid #e2e8f0;border-radius:8px;page-break-inside:avoid;">
            <div style="display:flex;justify-content:space-between;font-size:10px;color:#475569;margin-bottom:4px;">
              <span><strong>Q${q.order}</strong> • ${this.escapeHtml(q.topic)} • ${this.escapeHtml(q.difficulty)}</span>
              <span style="font-weight:700;color:${q.isCorrect ? '#059669' : '#dc2626'};">${q.isCorrect ? 'CORRECT' : 'INCORRECT'} (${q.timeSpentSec}s)</span>
            </div>
            <div style="font-size:11.5px;font-weight:600;color:#0f172a;margin-bottom:4px;">${this.escapeHtml(q.statement)}</div>
            <div style="font-size:10.5px;color:#334155;">Selected: <strong>${this.escapeHtml(q.selectedAnswer)}</strong>${q.isCorrect ? '' : ` • Correct: <strong>${this.escapeHtml(q.correctAnswer)}</strong>`}</div>
          </div>`,
      )
      .join('');

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8" />
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet" />
<style>body{font-family:'Montserrat',Arial,sans-serif;color:#0f172a;margin:0;padding:0;line-height:1.5;}</style>
</head><body>
  <div style="background:linear-gradient(135deg,#0f172a,#1e3a8a);color:#fff;padding:20px 24px;border-radius:10px;margin-bottom:16px;">
    <div style="font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#38bdf8;font-weight:700;">Official Candidate Assessment Transcript</div>
    <h1 style="margin:4px 0 0 0;font-size:20px;">${this.escapeHtml(params.assignmentTitle)}</h1>
    <div style="font-size:11.5px;color:#cbd5e1;margin-top:4px;">Candidate: <strong>${this.escapeHtml(params.candidateName)}</strong>${params.candidateEmail ? ` (${this.escapeHtml(params.candidateEmail)})` : ''} • Category: ${this.escapeHtml(params.category)}</div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;">
    <div style="padding:10px;border:1px solid #cbd5e1;border-radius:8px;text-align:center;"><div style="font-size:10px;color:#64748b;">Score</div><div style="font-size:18px;font-weight:800;color:${params.passed ? '#059669' : '#dc2626'};">${params.percentageScore.toFixed(1)}%</div></div>
    <div style="padding:10px;border:1px solid #cbd5e1;border-radius:8px;text-align:center;"><div style="font-size:10px;color:#64748b;">Status</div><div style="font-size:16px;font-weight:800;color:${params.passed ? '#059669' : '#dc2626'};">${params.passed ? 'PASSED' : 'FAILED'}</div></div>
    <div style="padding:10px;border:1px solid #cbd5e1;border-radius:8px;text-align:center;"><div style="font-size:10px;color:#64748b;">Correct</div><div style="font-size:16px;font-weight:800;">${params.correctCount}/${params.totalQuestions}</div></div>
    <div style="padding:10px;border:1px solid #cbd5e1;border-radius:8px;text-align:center;"><div style="font-size:10px;color:#64748b;">Duration</div><div style="font-size:16px;font-weight:800;">${Math.floor(params.totalDurationSec / 60)}m ${params.totalDurationSec % 60}s</div></div>
  </div>
  <div style="padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:14px;font-size:11.5px;">
    <strong>Linked CV:</strong> ${this.escapeHtml(params.cvFileName || 'Candidate Profile CV')} • <strong>Submitted:</strong> ${this.escapeHtml(new Date(params.submittedAt).toLocaleString())}<br/>
    <strong>AI Performance Summary:</strong> ${this.escapeHtml(params.aiPerformanceSummary)}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
    <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #e2e8f0;"><thead><tr style="background:#f1f5f9;"><th style="padding:6px 10px;text-align:left;">Topic</th><th style="padding:6px 10px;text-align:right;">Score</th></tr></thead><tbody>${topicRows}</tbody></table>
    <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #e2e8f0;"><thead><tr style="background:#f1f5f9;"><th style="padding:6px 10px;text-align:left;">Difficulty</th><th style="padding:6px 10px;text-align:right;">Score</th></tr></thead><tbody>${diffRows}</tbody></table>
  </div>
  <h3 style="font-size:13px;margin:0 0 8px 0;">Question-by-Question Record</h3>
  ${qRows}
</body></html>`;

    return this.renderHtmlToPdf(html, fileName, `Nexora AI Assessment Transcript • ${params.candidateName}`);
  }

  public async generateMonthlyInvoicePdf(params: {
    invoiceNumber: string;
    organisationName: string;
    billingEmail: string;
    candidateName: string;
    vacancyTitle: string;
    category: string;
    billingMonth: string;
    offerAmountUsd: number;
    feePercent: number;
    feeAmountUsd: number;
    status: 'PENDING' | 'PAID';
  }): Promise<GeneratedDocumentResult> {
    const safeSlug = params.invoiceNumber.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    const fileName = `invoice_${safeSlug}_${Date.now()}.pdf`;
    const html = `<!doctype html><html><head><meta charset="utf-8" />
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet" />
<style>body{font-family:'Montserrat',Arial,sans-serif;color:#0f172a;margin:0;padding:0;line-height:1.5;}</style>
</head><body>
  <div style="background:linear-gradient(135deg,#0f172a,#1e3a8a);color:#fff;padding:24px;border-radius:10px;margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;">
    <div>
      <div style="font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#38bdf8;font-weight:700;">Nexora AI Platform Invoice</div>
      <h1 style="margin:4px 0 0 0;font-size:22px;">${this.escapeHtml(params.invoiceNumber)}</h1>
    </div>
    <div style="text-align:right;">
      <div style="font-size:12px;color:#cbd5e1;">Billing Month: <strong>${this.escapeHtml(params.billingMonth)}</strong></div>
      <div style="font-size:13px;font-weight:800;color:${params.status === 'PAID' ? '#6ee7b7' : '#fcd34d'};margin-top:4px;">${params.status}</div>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:20px;font-size:12px;">
    <div style="padding:12px;border:1px solid #e2e8f0;border-radius:8px;">
      <div style="font-size:10px;color:#64748b;text-transform:uppercase;">Billed To</div>
      <div style="font-weight:700;font-size:14px;margin-top:4px;">${this.escapeHtml(params.organisationName)}</div>
      <div style="color:#475569;">${this.escapeHtml(params.billingEmail)}</div>
    </div>
    <div style="padding:12px;border:1px solid #e2e8f0;border-radius:8px;">
      <div style="font-size:10px;color:#64748b;text-transform:uppercase;">Accepted Candidate</div>
      <div style="font-weight:700;font-size:14px;margin-top:4px;">${this.escapeHtml(params.candidateName)}</div>
      <div style="color:#475569;">${this.escapeHtml(params.vacancyTitle)} (${this.escapeHtml(params.category)})</div>
    </div>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e2e8f0;margin-bottom:20px;">
    <thead><tr style="background:#f1f5f9;"><th style="padding:10px;text-align:left;">Description</th><th style="padding:10px;text-align:right;">Monthly Offer (USD)</th><th style="padding:10px;text-align:right;">Fee Rate</th><th style="padding:10px;text-align:right;">Amount Due (USD)</th></tr></thead>
    <tbody>
      <tr>
        <td style="padding:12px;border-top:1px solid #e2e8f0;">Nexora AI Monthly Platform Fee — Accepted Placement (${this.escapeHtml(params.billingMonth)})</td>
        <td style="padding:12px;border-top:1px solid #e2e8f0;text-align:right;">$${params.offerAmountUsd.toFixed(2)}</td>
        <td style="padding:12px;border-top:1px solid #e2e8f0;text-align:right;">${params.feePercent}%</td>
        <td style="padding:12px;border-top:1px solid #e2e8f0;text-align:right;font-weight:800;">$${params.feeAmountUsd.toFixed(2)}</td>
      </tr>
    </tbody>
  </table>
  <div style="padding:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:11.5px;color:#475569;">
    Pay securely online inside your <strong>Nexora Company Dashboard → Billing &amp; Invoices</strong> via Paystack.
  </div>
</body></html>`;
    return this.renderHtmlToPdf(html, fileName, `Nexora AI Invoice ${params.invoiceNumber}`);
  }

  private escapeHtml(str: string): string {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

export const documentGeneratorService = new DocumentGeneratorService();
