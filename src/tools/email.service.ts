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
  applicationUrl: string;
  referenceId: string;
  subject: string;
  plainTextBody: string;
  submittedFields: Record<string, string>;
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

  const hiddenKeys = new Set(['sent_on_behalf_of', 'submission_mode']);
  const fieldsRowsHtml = Object.entries(payload.submittedFields)
    .filter(([key]) => !hiddenKeys.has(key.toLowerCase()))
    .map(
      ([key, val]) => `
        <tr>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #475569; width: 34%; font-size: 13px;">${escapeHtml(formatFieldLabel(key))}</td>
          <td style="padding: 9px 14px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 13px;">${escapeHtml(val)}</td>
        </tr>`,
    )
    .join('');

  const bodyHtmlParagraphs = payload.plainTextBody
    .split('\n\n')
    .map(
      (para) =>
        `<p style="margin: 0 0 14px 0; line-height: 1.65; color: #1e293b; font-size: 14.5px;">${escapeHtml(para).replace(/\n/g, '<br/>')}</p>`,
    )
    .join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(finalSubject)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; color: #0f172a;">
  <div style="max-width: 640px; margin: 0 auto; background-color: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 2px 5px rgba(15, 23, 42, 0.06); border: 1px solid #e2e8f0;">
    
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; padding: 24px 28px;">
      <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.2px; color: #38bdf8; font-weight: 700; margin-bottom: 8px;">
        Application Submission • Ref ${escapeHtml(payload.referenceId)}
      </div>
      <h1 style="margin: 0; font-size: 21px; font-weight: 700; line-height: 1.3; color: #ffffff;">
        ${escapeHtml(payload.platformName)}
      </h1>
      <p style="margin: 6px 0 0 0; font-size: 13.5px; color: #cbd5e1;">
        Applicant: <strong style="color: #ffffff;">${escapeHtml(payload.applicantName)}</strong>
      </p>
    </div>

    <div style="padding: 28px;">
      ${bodyHtmlParagraphs}

      ${fieldsRowsHtml
      ? `
      <div style="margin-top: 26px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background-color: #f8fafc;">
        <div style="padding: 10px 14px; background-color: #f1f5f9; border-bottom: 1px solid #e2e8f0; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: #334155;">
          Applicant Details
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

    <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 28px; font-size: 12px; color: #475569; text-align: center;">
      <p style="margin: 0 0 10px 0;">Prepared and submitted via <strong>Nexora AI</strong> on behalf of ${escapeHtml(payload.applicantName)}.</p>
      <div style="margin-top: 10px; padding: 12px 16px; border-radius: 8px; background-color: #eef2ff; border: 1px solid #c7d2fe; color: #1e293b;">
        <strong style="color: #3730a3;">Hiring, Recruiting, or Offering Opportunities?</strong><br/>
        Join <strong>Nexora AI</strong> to receive AI-scored CVs (0–100%), verified candidate assessment transcripts, and schedule interviews in one click.<br/>
        <a href="${escapeHtml(process.env.PUBLIC_WEB_URL || 'https://nexora.empirelabs.digital')}/company/register" style="display: inline-block; margin-top: 8px; padding: 7px 14px; border-radius: 6px; background-color: #4f46e5; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 11.5px;">Create Your Free Company Portal</a>
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
