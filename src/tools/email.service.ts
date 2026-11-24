import nodemailer, { type SendMailOptions as NodemailerSendMailOptions } from 'nodemailer';
import { logger } from '../utils/logger';

export interface SendMailOptions {
  to: string;
  html: string;
  subject: string;
  replyTo?: string;
  inReplyTo?: string;
  references?: string | string[];
  attachments?: NodemailerSendMailOptions['attachments'];
}

export const sendMail = async ({
  to,
  html,
  subject,
  replyTo,
  inReplyTo,
  references,
  attachments,
}: SendMailOptions): Promise<{ to: string; status: string; messageId?: string; response?: string }> => {
  return new Promise((resolve, reject) => {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.zoho.com',
      port: Number(process.env.SMTP_PORT || 465),
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : true,
      auth: {
        user: process.env.SMTP_USER || 'mrdocs@empiredigitals.org',
        pass: process.env.SMTP_PASS || 'eVc2YpPq1KFq',
      },
    });

    const resolvedReplyTo = replyTo || process.env.REPLY_TO_EMAIL || process.env.IMAP_USER || undefined;

    let mailOptions: NodemailerSendMailOptions = {
      from: process.env.SMTP_FROM || 'mrdocs@empiredigitals.org',
      to,
      subject,
      html,
      ...(resolvedReplyTo ? { replyTo: resolvedReplyTo } : {}),
      ...(inReplyTo ? { inReplyTo } : {}),
      ...(references && references.length > 0 ? { references } : {}),
    };

    if (attachments && attachments.length > 0) {
      console.log('Adding attachments:', attachments);
      mailOptions = {
        ...mailOptions,
        attachments,
      };
    }

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log('Error occurred: ' + error.message);
        logger.error({ err: error, to, subject }, 'Failed to send email via Zoho SMTP');
        reject(error);
      } else {
        console.log('Email sent: ' + info.response);
        logger.info(
          { to, subject, messageId: info.messageId, response: info.response },
          'Email sent successfully via Zoho SMTP',
        );
        resolve({
          to,
          status: 'SENT',
          messageId: info.messageId,
          response: info.response,
        });
      }
    });
  });
};

export interface BehalfEmailPayload {
  applicantName: string;
  intendedRecipientEmail: string;
  platformName: string;
  platformCategory: string;
  agentType?: string;
  applicationUrl: string;
  referenceId: string;
  subject: string;
  plainTextBody: string;
  submittedFields: Record<string, string>;
  documentLinks?: Array<{ docType: string; label: string; fileName: string; url?: string }>;
  attachments?: NodemailerSendMailOptions['attachments'];
}

/**
 * Formats and sends an application/outreach email on behalf of the user (`applicantName`).
 * For safe testing, routes delivery to TEST_RECIPIENT_EMAIL (`info@empiredigitals.org`)
 * while preserving the intended recipient metadata in the email header and body.
 */
/**
 * Builds the application/outreach email HTML from a payload.
 * Edit this function to redesign the email layout and styling.
 */
export const buildApplicationEmailHtml = (
  payload: BehalfEmailPayload,
  _targetRecipient = process.env.TEST_RECIPIENT_EMAIL || 'info@empiredigitals.org',
): string => {
  const finalSubject = payload.subject;

  const formatFieldLabel = (key: string): string =>
    key
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const formatRichInlineHtml = (raw: string): string => {
    const cleaned = String(raw || '').replace(/\*\*([^*]+)$/g, '$1');
    return escapeHtml(cleaned)
      .replace(/\*\*([^*]+)\*\*/g, '<strong style="color:#0f172a;font-weight:700;">$1</strong>')
      .replace(
        /`([^`]+)`/g,
        '<code style="background:#f1f5f9;color:#1e293b;padding:2px 6px;border-radius:4px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;">$1</code>',
      );
  };

  const hiddenKeys = new Set(['sent_on_behalf_of', 'submission_mode']);
  const fieldsRowsHtml = Object.entries(payload.submittedFields)
    .filter(([key]) => !hiddenKeys.has(key.toLowerCase()))
    .map(
      ([key, val]) => `
        <tr>
          <td style="padding: 11px 16px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #475569; width: 32%; font-size: 13px; vertical-align: top;">${escapeHtml(formatFieldLabel(key))}</td>
          <td style="padding: 11px 16px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px; line-height: 1.55;">${formatRichInlineHtml(val)}</td>
        </tr>`,
    )
    .join('');

  const bodyHtmlParagraphs = payload.plainTextBody
    .split('\n\n')
    .map(
      (para) =>
        `<p style="margin: 0 0 14px 0; line-height: 1.65; color: #1e293b; font-size: 14.5px;">${formatRichInlineHtml(para).replace(/\n/g, '<br/>')}</p>`,
    )
    .join('');

  const docsHtml =
    payload.documentLinks && payload.documentLinks.length > 0
      ? `
      <div style="margin-top: 22px; border: 1px solid #cbd5e1; border-radius: 10px; overflow: hidden; background-color: #f8fafc;">
        <div style="padding: 10px 16px; background-color: #f1f5f9; border-bottom: 1px solid #e2e8f0; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; color: #334155;">
          Verified Applicant Documents (${payload.documentLinks.length})
        </div>
        <div style="padding: 12px 16px; background-color: #ffffff;">
          ${payload.documentLinks
            .map(
              (d) => `
            <div style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; font-size: 13px; display: flex; justify-content: space-between;">
              <span><strong style="color: #4f46e5;">[${escapeHtml(d.docType)}]</strong> ${escapeHtml(d.label || d.fileName)} <span style="color: #64748b;">(${escapeHtml(d.fileName)})</span></span>
              ${
                d.url && /^https?:\/\//i.test(d.url)
                  ? ` — <a href="${escapeHtml(d.url)}" style="color: #2563eb; font-weight: 600; text-decoration: none;">Download</a>`
                  : ''
              }
            </div>`,
            )
            .join('')}
        </div>
      </div>`
      : '';

  const agentKey = (payload.agentType || payload.platformCategory || '').toUpperCase();
  const isVisa = agentKey.includes('VISA') || agentKey.includes('RELOCAT') || agentKey.includes('IMMIGRAT');
  const isEdu = agentKey.includes('EDUCATION') || agentKey.includes('SCHOLAR');
  const isInvestor = agentKey.includes('INVEST');

  const headerBadge = isVisa
    ? 'VISA & RELOCATION SUBMISSION'
    : isEdu
      ? 'SCHOLARSHIP & ADMISSIONS SUBMISSION'
      : isInvestor
        ? 'INVESTMENT & DEAL SUBMISSION'
        : 'APPLICATION SUBMISSION';

  const ctaContent = isVisa
    ? {
        title: 'Immigration or Relocation Agency?',
        desc: 'Join <strong>Nexora AI</strong> to receive pre-screened relocation applicants with verified passports, permits, police clearances &amp; eligibility checklists — 10% commission only on accepted cases.',
        btn: 'Create Free Immigration Agency Portal',
      }
    : isEdu
      ? {
          title: 'University or Scholarship Provider?',
          desc: 'Join <strong>Nexora AI</strong> to receive vetted student applicants with academic transcripts, statements of purpose &amp; verified credentials in one portal.',
          btn: 'Create Free Scholarship Portal',
        }
      : isInvestor
        ? {
            title: 'VC Fund, Angel Investor, or Accelerator?',
            desc: 'Join <strong>Nexora AI</strong> to receive curated founder deal flow with pitch decks, financial models, and due diligence checklists.',
            btn: 'Create Free Investor Portal',
          }
        : {
            title: 'Hiring or Recruiting Top Talent?',
            desc: 'Join <strong>Nexora AI</strong> to receive AI-scored CVs (0–100%), verified candidate assessment transcripts, and schedule interviews in one click.',
            btn: 'Create Free Company Portal',
          };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(finalSubject)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 20px 12px; background-color: #f1f5f9; color: #0f172a;">
  <div style="max-width: 660px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
    
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e1b4b 60%, #312e81 100%); color: #ffffff; padding: 28px 30px;">
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.4px; color: #38bdf8; font-weight: 700; margin-bottom: 8px;">
        ${headerBadge} &bull; REF ${escapeHtml(payload.referenceId)}
      </div>
      <h1 style="margin: 0; font-size: 22px; font-weight: 800; line-height: 1.3; color: #ffffff;">
        ${escapeHtml(payload.platformName)}
      </h1>
      <p style="margin: 8px 0 0 0; font-size: 14px; color: #cbd5e1;">
        Applicant: <strong style="color: #ffffff;">${escapeHtml(payload.applicantName)}</strong>
      </p>
    </div>

    <div style="padding: 28px 30px;">
      ${bodyHtmlParagraphs}

      ${docsHtml}

      ${fieldsRowsHtml
      ? `
      <div style="margin-top: 22px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background-color: #f8fafc;">
        <div style="padding: 10px 16px; background-color: #f1f5f9; border-bottom: 1px solid #e2e8f0; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.7px; color: #334155;">
          Applicant Profile &amp; Submission Summary
        </div>
        <table style="width: 100%; border-collapse: collapse; background-color: #ffffff;">
          <tbody>
            ${fieldsRowsHtml}
          </tbody>
        </table>
      </div>`
      : ''
    }
    </div>

    <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 30px; font-size: 12.5px; color: #475569; text-align: center;">
      <p style="margin: 0 0 12px 0;">Prepared and submitted via <strong>Nexora AI</strong> on behalf of <strong>${escapeHtml(payload.applicantName)}</strong>.</p>
      <div style="margin-top: 10px; padding: 16px 20px; border-radius: 10px; background: linear-gradient(135deg, #eef2ff 0%, #e0e7ff 100%); border: 1px solid #c7d2fe; color: #1e293b;">
        <strong style="color: #3730a3; font-size: 13.5px;">${ctaContent.title}</strong><br/>
        <span style="display: inline-block; margin-top: 4px; line-height: 1.5;">${ctaContent.desc}</span><br/>
        <a href="${escapeHtml(process.env.PUBLIC_WEB_URL || 'https://nexora.empirelabs.digital')}/company/register" style="display: inline-block; margin-top: 10px; padding: 9px 18px; border-radius: 8px; background-color: #4f46e5; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 12px;">${ctaContent.btn}</a>
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
};

/**
 * Generates an email HTML preview with realistic dummy data (never sends an email).
 */
export const previewApplicationEmailHtml = (
  overrides?: Partial<BehalfEmailPayload>,
): string => {
  const dummyPayload: BehalfEmailPayload = {
    applicantName: 'Lameck Ndhlovu',
    intendedRecipientEmail: 'careers@stripe.com',
    platformName: 'Senior Software Developer — MASS Consultants',
    platformCategory: 'Software Engineering',
    applicationUrl: 'https://www.linkedin.com/in/lameck-ndhlovu-4b975489',
    referenceId: 'SUB-50039993',
    subject: 'Job Application: Senior Software Developer — MASS Consultants — Lameck Ndhlovu',
    plainTextBody: [
      'Dear Hiring Team at MASS Consultants,',
      'Please find attached the Curriculum Vitae (CV) for Lameck Ndhlovu in application for the Senior Software Developer position.',
      'Lameck brings 8+ years of experience delivering production React, TypeScript, Node.js, React Native, and AWS systems across fintech and enterprise telecom platforms.',
      'Please let us know if you would like to schedule an interview or require any additional details.',
      'Best regards,\nLameck Ndhlovu',
    ].join('\n\n'),
    submittedFields: {
      'Applicant Name': 'Lameck Ndhlovu',
      'Email': 'mickylyricalkartel@gmail.com',
      'Phone': '+27 65 801 6132',
      'Target Role': 'Senior Software Developer',
      'Portfolio / LinkedIn': 'https://www.linkedin.com/in/lameck-ndhlovu-4b975489',
      'Attached CV': 'Lameck_Ndhlovu_CV.pdf',
    },
    ...overrides,
  };

  return buildApplicationEmailHtml(dummyPayload);
};

export const sendApplicationEmailOnBehalfOfUser = async (
  payload: BehalfEmailPayload,
): Promise<{
  deliveredTo: string;
  intendedRecipient: string;
  status: string;
  smtpResponse?: string;
  messageId?: string;
}> => {
  // Always route to info@empiredigitals.org in test mode so real external VCs/employers are not spammed during testing
  const targetRecipient = process.env.TEST_RECIPIENT_EMAIL || 'info@empiredigitals.org';
  const finalSubject = payload.subject;
  const html = buildApplicationEmailHtml(payload, targetRecipient);

  const res = await sendMail({
    to: targetRecipient,
    subject: finalSubject,
    html,
    attachments: payload.attachments,
  });

  return {
    deliveredTo: res.to,
    intendedRecipient: payload.intendedRecipientEmail,
    status: res.status,
    smtpResponse: res.response,
    messageId: res.messageId,
  };
};

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
