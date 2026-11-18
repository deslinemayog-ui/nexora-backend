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

  const finalSubject = `[On behalf of ${payload.applicantName}] ${payload.subject}`;

  const fieldsRowsHtml = Object.entries(payload.submittedFields)
    .map(
      ([key, val]) => `
        <tr>
          <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 600; background-color: #f8fafc; color: #334155; width: 32%;">${escapeHtml(key)}</td>
          <td style="padding: 8px 12px; border: 1px solid #e2e8f0; color: #0f172a;">${escapeHtml(val)}</td>
        </tr>`,
    )
    .join('');

  const bodyHtmlParagraphs = payload.plainTextBody
    .split('\n\n')
    .map(
      (para) =>
        `<p style="margin: 0 0 14px 0; line-height: 1.6; color: #1e293b;">${escapeHtml(para).replace(/\n/g, '<br/>')}</p>`,
    )
    .join('');

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(finalSubject)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px;">
  <div style="max-width: 680px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.08); border: 1px solid #e2e8f0;">
    
    <div style="background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 100%); color: #ffffff; padding: 20px 24px;">
      <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #93c5fd; font-weight: 700; margin-bottom: 6px;">
        Nexora AI Autonomous Workforce • Official Outreach Dispatch
      </div>
      <h2 style="margin: 0; font-size: 20px; font-weight: 700;">
        Sent on behalf of ${escapeHtml(payload.applicantName)}
      </h2>
      <p style="margin: 6px 0 0 0; font-size: 13px; color: #cbd5e1;">
        Target Platform: <strong>${escapeHtml(payload.platformName)}</strong> (${escapeHtml(payload.platformCategory)}) • Ref: <code>${escapeHtml(payload.referenceId)}</code>
      </p>
    </div>

    <div style="background-color: #eff6ff; border-bottom: 1px solid #bfdbfe; padding: 12px 24px; font-size: 13px; color: #1e40af;">
      <strong>Delivery Routing Notice:</strong> This application was prepared and dispatched by <strong>Nexora AI on behalf of ${escapeHtml(payload.applicantName)}</strong>.<br/>
      • <strong>Intended Platform Recipient:</strong> ${escapeHtml(payload.intendedRecipientEmail)} (<a href="${escapeHtml(payload.applicationUrl)}" style="color: #2563eb;">${escapeHtml(payload.applicationUrl)}</a>)<br/>
      • <strong>Delivered To (Test Inbox):</strong> ${escapeHtml(targetRecipient)}
    </div>

    <div style="padding: 24px;">
      <h3 style="margin: 0 0 14px 0; font-size: 16px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
        Outreach / Application Letter (On behalf of ${escapeHtml(payload.applicantName)})
      </h3>
      ${bodyHtmlParagraphs}

      <h3 style="margin: 24px 0 12px 0; font-size: 16px; color: #0f172a; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">
        Submitted Application Payload
      </h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <tbody>
          ${fieldsRowsHtml}
        </tbody>
      </table>
    </div>

    <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 14px 24px; font-size: 12px; color: #64748b; text-align: center;">
      Dispatched autonomously by <strong>Nexora AI Workforce Platform</strong> on behalf of <strong>${escapeHtml(payload.applicantName)}</strong> via <code>mrdocs@empiredigitals.org</code>.
    </div>
  </div>
</body>
</html>
  `.trim();

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
