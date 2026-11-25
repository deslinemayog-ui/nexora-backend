import { ImapFlow } from 'imapflow';
import { logger } from '../utils/logger';
import { sendMail } from './email.service';

export interface SubmissionAttachmentSummary {
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
}

export interface SubmissionThreadMessage {
  id: string;
  receiptId?: string;
  direction: 'OUTBOUND' | 'INBOUND';
  from: string;
  to: string;
  subject: string;
  body: string;
  receivedAt: string;
  isInterview: boolean;
  interviewSummary?: string;
  isBounce?: boolean;
  bounceReason?: string;
  companyName?: string;
  messageId?: string;
  attachments?: SubmissionAttachmentSummary[];
}

export interface InterviewAlert {
  id: string;
  receiptId?: string;
  companyName: string;
  from: string;
  subject: string;
  summary: string;
  receivedAt: string;
}

export interface SubmissionLookupTarget {
  receiptId: string;
  targetName: string;
  contactEmail?: string;
  deliveredToEmail?: string;
  portalUrl?: string;
}

const outboundThreadsByReceipt = new Map<string, SubmissionThreadMessage[]>();
const webhookInboundReplies: SubmissionThreadMessage[] = [];

export function detectBounceEmail(params: {
  subject: string;
  body: string;
  fromAddress?: string;
  rawSource?: string;
}): { isBounce: boolean; reason: string } {
  const fromLower = (params.fromAddress || '').toLowerCase();
  const subjectLower = (params.subject || '').toLowerCase();
  const combined = `${params.subject}\n${params.body}\n${(params.rawSource || '').slice(0, 4000)}`;

  const isBounceSender = /(?:mailer-daemon|postmaster|mail-delivery|bounce|daemon@)/i.test(fromLower);
  const isBounceSubject =
    /(?:delivery\s+status\s+notification|undelivered\s+mail|mail\s+delivery\s+failed|returned\s+mail|failure\s+notice|undeliverable|delivery\s+failure)/i.test(
      subjectLower,
    );
  const isBounceBody =
    /(?:550\s+5\.1\.1|address\s+not\s+found|recipient\s+address\s+rejected|user\s+unknown|mailbox\s+unavailable|domain\s+not\s+found|could\s+not\s+be\s+delivered|permanent\s+error|message\s+blocked|does\s+not\s+exist)/i.test(
      combined,
    );

  if (isBounceSender || isBounceSubject || (isBounceBody && /bounce|dsn|delivery|failed|undeliver/i.test(combined))) {
    const snippet =
      combined.match(
        /(?:550[^\n]{0,120}|address\s+not\s+found[^\n]{0,100}|recipient\s+address\s+rejected[^\n]{0,100}|user\s+unknown[^\n]{0,100}|mailbox\s+unavailable[^\n]{0,100})/i,
      )?.[0] || 'Email bounced / undeliverable';
    return { isBounce: true, reason: snippet.trim() };
  }
  return { isBounce: false, reason: '' };
}

/**
 * Classifies whether an inbound email represents an interview / shortlist invitation.
 */
export function classifyInterviewEmail(params: {
  subject: string;
  body: string;
  fromName?: string;
  fromAddress?: string;
}): { isInterview: boolean; companyName: string; summary: string } {
  const fromLower = (params.fromAddress || '').toLowerCase();
  const combined = `${params.subject}\n${params.body}`;

  // Never classify automated no-reply digests / newsletters / security alerts as interview invitations
  if (
    /(?:no[-_.]?reply|noreply|newsletter|notification|marketing|updates@|hello@ollama\.com)/i.test(fromLower) ||
    /\b(?:unsubscribe|security alert|performance report|ad credit)\b/i.test(combined)
  ) {
    return {
      isInterview: false,
      companyName: (params.fromName || '').replace(/["<>]/g, '').trim() || 'Automated Sender',
      summary: '',
    };
  }

  const rejectionPattern =
    /\b(unfortunately|regret\s+to\s+inform|not\s+moving\s+forward|other\s+candidates|application\s+was\s+not\s+successful|position\s+has\s+been\s+filled|auto[- ]?reply|out\s+of\s+office)\b/i;

  const interviewPattern =
    /\b(interview|shortlist(?:ed)?|schedule\s+(?:a\s+)?(?:call|chat|meeting|time|interview)|calendly\.com|zoom\.us|teams\.microsoft\.com|meet\.google\.com|technical\s+(?:screen|assessment)|next\s+(?:step|round)|hiring\s+manager|would\s+like\s+(?:us\s+)?to\s+(?:speak|meet|connect|chat|have\s+an\s+interview))\b/i;

  const isInterview = interviewPattern.test(combined) && !rejectionPattern.test(combined);

  // Infer company name from sender display name, domain, or subject
  let companyName = (params.fromName || '').replace(/["<>]/g, '').trim();
  if (!companyName || /@/.test(companyName)) {
    const domain = (params.fromAddress || '').split('@')[1] || '';
    const domainRoot = domain.split('.')[0] || '';
    companyName = domainRoot
      ? domainRoot.charAt(0).toUpperCase() + domainRoot.slice(1)
      : 'Employer';
  }

  const cleanBody = params.body.replace(/\s+/g, ' ').trim();
  const summary = isInterview
    ? `${companyName} invited you to an interview/call: "${params.subject}"${cleanBody ? ` — ${cleanBody.slice(0, 140)}` : ''}`
    : cleanBody.slice(0, 140);

  return { isInterview, companyName, summary };
}

/**
 * Matches an inbound email to a known submission receipt by:
 * 1) Exact SUB-XXXXXXXX receipt ID
 * 2) Exact/highest-scoring targetName match in subject/body
 * 3) Non-shared sender email match
 */
export function matchReplyToSubmission(
  reply: { subject: string; body: string; fromAddress: string; fromName: string },
  submissions: SubmissionLookupTarget[],
): SubmissionLookupTarget | undefined {
  if (submissions.length === 0) return undefined;

  const subjectLower = reply.subject.toLowerCase();
  const haystack = `${reply.subject}\n${reply.body}`.toLowerCase();
  const fromEmail = reply.fromAddress.toLowerCase();

  // 1. Strict REF / Receipt ID match (e.g. SUB-1234ABCD)
  for (const sub of submissions) {
    if (sub.receiptId && haystack.includes(sub.receiptId.toLowerCase())) {
      return sub;
    }
  }

  // 2. Strict reply subject match: must be a reply ("Re:") and contain the exact targetName
  if (/^re:/i.test(reply.subject.trim())) {
    const exactSubjectMatch = submissions.find(
      (sub) => sub.targetName && sub.targetName.length >= 6 && subjectLower.includes(sub.targetName.toLowerCase()),
    );
    if (exactSubjectMatch) {
      return exactSubjectMatch;
    }
  }

  // 3. Exact non-shared sender email match ONLY for actual replies ("Re:")
  const sharedTestEmail = (process.env.TEST_RECIPIENT_EMAIL || 'info@empiredigitals.org').toLowerCase();
  if (/^re:/i.test(reply.subject.trim()) && fromEmail && fromEmail !== sharedTestEmail) {
    for (const sub of submissions) {
      const contact = (sub.contactEmail || '').toLowerCase();
      const delivered = (sub.deliveredToEmail || '').toLowerCase();
      if ((contact && fromEmail === contact) || (delivered && fromEmail === delivered)) {
        return sub;
      }
    }
  }

  return undefined;
}

function decodeQuotedPrintable(input: string): string {
  const unfolded = input.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < unfolded.length; i++) {
    if (unfolded[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(unfolded.slice(i + 1, i + 3))) {
      bytes.push(parseInt(unfolded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      const code = unfolded.charCodeAt(i);
      if (code < 128) {
        bytes.push(code);
      } else {
        const utf8 = Buffer.from(unfolded[i]!, 'utf8');
        for (const b of utf8) bytes.push(b);
      }
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function extractReadableTextFromRawEmail(raw: string): string {
  // Split headers and body
  const splitIdx = raw.search(/\r?\n\r?\n/);
  const bodyPart = splitIdx >= 0 ? raw.slice(splitIdx).trim() : raw;

  // Prefer text/plain MIME section if present (capturing Content-Transfer-Encoding if specified)
  const plainMatch = bodyPart.match(
    /Content-Type:\s*text\/plain[^\n]*\r?\n(?:([^\n]*\r?\n)*?)\r?\n([\s\S]*?)(?:\r?\n--[a-zA-Z0-9_=-]+|$)/i,
  );
  const plainHeaders = plainMatch?.[1] ?? bodyPart.slice(0, 400);
  let text = plainMatch?.[2] ?? bodyPart;

  const isBase64 =
    /Content-Transfer-Encoding:\s*base64/i.test(plainHeaders) ||
    (/^[A-Za-z0-9+/=\s]{40,}$/.test(text.trim()) && !text.includes(' '));

  if (isBase64) {
    try {
      const cleaned = text.replace(/\s+/g, '');
      const decoded = Buffer.from(cleaned, 'base64').toString('utf8');
      if (decoded && /[a-zA-Z]{2,}/.test(decoded)) {
        text = decoded;
      }
    } catch {
      // keep original text if base64 decode fails
    }
  } else if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(plainHeaders) || /=C2=A0|=E2=80=|=3D/i.test(text)) {
    text = decodeQuotedPrintable(text);
  }

  // Strip HTML tags & MIME boundaries if it's HTML or multipart
  text = text
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r?\n--[a-zA-Z0-9_=-]+[\s\S]*$/m, '');

  // Strip quoted email reply chains (Zoho, Gmail, Outlook, Apple/Samsung Mail "From: ... Date: ... Subject:")
  text = text
    .replace(/\s*-{2,}\s*On\s+[\s\S]*?\bwrote\b[\s\S]*$/i, '')
    .replace(/\s*-{2,}\s*Original Message\s*-{2,}[\s\S]*$/i, '')
    .replace(/\s*On\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[\s\S]*?\bwrote:\s*[\s\S]*$/i, '')
    .replace(/\s*From:\s*[\s\S]*?\b(?:Sent|Date)\s*:\s*[\s\S]*$/i, '')
    .replace(/\s*Application Submission\s*[•·-]\s*Ref\s+SUB-[\s\S]*$/i, '')
    .replace(/\s*>+\s.*$/gm, '')
    .replace(/=\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return text.slice(0, 1800);
}

export class ImapMonitorService {
  /**
   * Records an outbound email (initial application or user follow-up) into the submission thread.
   */
  public recordOutboundMessage(msg: Omit<SubmissionThreadMessage, 'id' | 'direction' | 'isInterview'>): SubmissionThreadMessage {
    const entry: SubmissionThreadMessage = {
      ...msg,
      id: `msg-out-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      direction: 'OUTBOUND',
      isInterview: false,
    };
    const key = msg.receiptId || msg.to.toLowerCase();
    const existing = outboundThreadsByReceipt.get(key) ?? [];
    existing.push(entry);
    outboundThreadsByReceipt.set(key, existing);
    return entry;
  }

  public getOutboundMessages(receiptId?: string): SubmissionThreadMessage[] {
    if (receiptId) {
      return outboundThreadsByReceipt.get(receiptId) ?? [];
    }
    return Array.from(outboundThreadsByReceipt.values()).flat();
  }

  /**
   * Records an inbound reply delivered via webhook (e.g. Cloudflare Email Routing, ImprovMX, or Resend)
   * so replies work even without paid IMAP on Zoho Free.
   */
  public recordInboundWebhookReply(params: {
    from: string;
    to?: string;
    subject: string;
    body: string;
    receiptId?: string;
    receivedAt?: string;
  }): SubmissionThreadMessage {
    const classification = classifyInterviewEmail({
      subject: params.subject,
      body: params.body,
      fromAddress: params.from,
    });
    const receiptMatch = params.receiptId || `${params.subject}\n${params.body}`.match(/SUB-[A-Z0-9]{6,10}/i)?.[0];

    const entry: SubmissionThreadMessage = {
      id: `wh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      receiptId: receiptMatch?.toUpperCase(),
      direction: 'INBOUND',
      from: params.from,
      to: params.to || process.env.REPLY_TO_EMAIL || process.env.SMTP_FROM || 'mrdocs@empiredigitals.org',
      subject: params.subject,
      body: params.body,
      receivedAt: params.receivedAt || new Date().toISOString(),
      isInterview: classification.isInterview,
      interviewSummary: classification.isInterview ? classification.summary : undefined,
      companyName: classification.companyName,
    };
    webhookInboundReplies.unshift(entry);
    return entry;
  }

  /**
   * Connects to Zoho IMAP (`imap.zoho.com:993`), reads recent INBOX replies, matches them
   * to submissions, and flags interview invitations.
   */
  public async fetchRepliesAndInterviews(params?: {
    submissions?: SubmissionLookupTarget[];
    lookbackDays?: number;
    limit?: number;
  }): Promise<{
    replies: SubmissionThreadMessage[];
    outboundMessages: SubmissionThreadMessage[];
    interviews: InterviewAlert[];
    bouncedReceiptIds: string[];
    imapConnected: boolean;
    error?: string;
  }> {
    const submissions = params?.submissions ?? [];
    const lookbackDays = params?.lookbackDays ?? 14;
    const limit = params?.limit ?? 30;
    const outboundMessages = this.getOutboundMessages();

    const imapUser = process.env.IMAP_USER || process.env.SMTP_USER || 'mrdocs@empiredigitals.org';
    const imapPass = process.env.IMAP_PASS || process.env.SMTP_PASS || 'eVc2YpPq1KFq';

    const client = new ImapFlow({
      host: process.env.IMAP_HOST || 'imap.zoho.com',
      port: Number(process.env.IMAP_PORT || 993),
      secure: true,
      auth: {
        user: imapUser,
        pass: imapPass,
      },
      logger: false,
    });

    const replies: SubmissionThreadMessage[] = [...webhookInboundReplies];
    const bouncedReceiptSet = new Set<string>();
    const interviews: InterviewAlert[] = webhookInboundReplies
      .filter((r) => r.isInterview)
      .map((r) => ({
        id: `interview-${r.id}`,
        receiptId: r.receiptId,
        companyName: r.companyName || 'Employer',
        from: r.from,
        subject: r.subject,
        summary: r.interviewSummary || r.subject,
        receivedAt: r.receivedAt,
      }));

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        const total = client.mailbox ? client.mailbox.exists : 0;
        if (total > 0) {
          const startSeq = Math.max(1, total - limit + 1);
          const range = `${startSeq}:${total}`;
          const cutoffMs = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
          const fetched: Array<{ uid: number; envelope: any; source?: Buffer }> = [];

          for await (const msg of client.fetch(range, { uid: true, envelope: true, source: true })) {
            fetched.push({ uid: msg.uid, envelope: msg.envelope, source: msg.source });
          }

          for (const message of fetched.reverse()) {
            const msgTime = message.envelope?.date ? new Date(message.envelope.date).getTime() : Date.now();
            if (msgTime < cutoffMs) continue;

            const uid = message.uid;
            const fromObj = message.envelope?.from?.[0];
            const fromAddress = fromObj?.address || '';
            const fromName = fromObj?.name || fromAddress;
            const subject = message.envelope?.subject || '(No Subject)';
            const receivedAt = message.envelope?.date
              ? new Date(message.envelope.date).toISOString()
              : new Date().toISOString();

            const rawSource = message.source ? message.source.toString('utf8') : '';
            const body = extractReadableTextFromRawEmail(rawSource);

            const bounceCheck = detectBounceEmail({
              subject,
              body,
              fromAddress,
              rawSource,
            });

            // Skip automated newsletters, bulk marketing emails, and Nexora's own outbound dispatches (but NEVER skip bounces!)
            const isNewsletterOrBulk =
              !bounceCheck.isBounce &&
              (/(?:no[-_.]?reply|noreply|newsletter|marketing|updates@|hello@ollama\.com)/i.test(fromAddress) ||
                /\bList-Unsubscribe:/i.test(rawSource.slice(0, 4000)) ||
                /\b(?:unsubscribe|opted in to receive updates)\b/i.test(body));
            const isOwnOutbound =
              !bounceCheck.isBounce &&
              ((fromAddress && fromAddress.toLowerCase() === imapUser.toLowerCase() && !/^re:/i.test(subject)) ||
                /^\s*Dear Hiring Team at\b/i.test(body) ||
                /^\s*Application Submission\s*[•·-]\s*Ref\s+SUB-/i.test(body));
            if (isNewsletterOrBulk || isOwnOutbound || (!body && !bounceCheck.isBounce)) {
              continue;
            }

            // Match against rawSource + subject so stripped SUB-XXXX receipts in quoted threads & bounce DSNs still match!
            let matched = matchReplyToSubmission(
              { subject, body: `${body}\n${rawSource.slice(0, 8000)}`, fromAddress, fromName },
              submissions,
            );

            // For bounce DSNs, also match by bounced recipient email address in rawSource
            if (!matched && bounceCheck.isBounce && submissions.length > 0) {
              const rawLower = rawSource.slice(0, 8000).toLowerCase();
              matched = submissions.find(
                (sub) =>
                  (sub.contactEmail && rawLower.includes(sub.contactEmail.toLowerCase())) ||
                  (sub.deliveredToEmail &&
                    sub.deliveredToEmail.toLowerCase() !== (process.env.TEST_RECIPIENT_EMAIL || 'info@empiredigitals.org').toLowerCase() &&
                    rawLower.includes(sub.deliveredToEmail.toLowerCase())),
              );
            }

            // Skip unrelated inbox noise (newsletters, Google security alerts, Ollama updates, etc.)
            // Only surface messages that actually match a tracked submission (or contain a SUB- receipt / application reply when no submissions filter is passed)
            const looksLikeApplicationReply =
              /\bSUB-[A-Z0-9]{6,10}\b/i.test(`${subject}\n${body}\n${rawSource.slice(0, 4000)}`) ||
              /\b(?:job\s+application|relocation|investor|scholarship\s+application)\b/i.test(subject);

            if (submissions.length > 0 ? !matched : !looksLikeApplicationReply) {
              continue;
            }

            if (bounceCheck.isBounce) {
              const bouncedId =
                matched?.receiptId ||
                `${subject}\n${body}\n${rawSource.slice(0, 6000)}`.match(/\b(SUB-[A-Z0-9]{6,10})\b/i)?.[1]?.toUpperCase();
              if (bouncedId) {
                bouncedReceiptSet.add(bouncedId);
              }
            }

            const classification = bounceCheck.isBounce
              ? { isInterview: false, companyName: matched?.targetName || 'Mail Delivery Subsystem', summary: bounceCheck.reason }
              : classifyInterviewEmail({
                  subject,
                  body,
                  fromName,
                  fromAddress,
                });

            const companyName = matched?.targetName || classification.companyName;
            const msgRecord: SubmissionThreadMessage = {
              id: `imap-${uid}`,
              receiptId: matched?.receiptId,
              direction: 'INBOUND',
              from: fromName !== fromAddress ? `${fromName} <${fromAddress}>` : fromAddress,
              to: imapUser,
              subject,
              body: bounceCheck.isBounce ? `[BOUNCED — AUTO-REFUNDED] ${bounceCheck.reason}\n${body}` : body,
              receivedAt,
              isInterview: classification.isInterview,
              interviewSummary: classification.isInterview ? classification.summary : undefined,
              isBounce: bounceCheck.isBounce,
              bounceReason: bounceCheck.isBounce ? bounceCheck.reason : undefined,
              companyName,
              messageId: message.envelope?.messageId,
            };

            replies.push(msgRecord);

            if (classification.isInterview) {
              interviews.push({
                id: `interview-${uid}`,
                receiptId: matched?.receiptId,
                companyName,
                from: msgRecord.from,
                subject,
                summary: classification.summary,
                receivedAt,
              });
            }
          }
        }
      } finally {
        lock.release();
      }

      return {
        replies,
        outboundMessages,
        interviews,
        bouncedReceiptIds: Array.from(bouncedReceiptSet),
        imapConnected: true,
      };
    } catch (err) {
      const imapErr = err as { responseText?: string; message?: string };
      const detailedError = imapErr?.responseText || imapErr?.message || 'IMAP connection unavailable';
      logger.warn({ err, detailedError }, 'Zoho IMAP inbox poll failed');
      return {
        replies,
        outboundMessages,
        interviews,
        bouncedReceiptIds: Array.from(bouncedReceiptSet),
        imapConnected: false,
        error: detailedError,
      };
    } finally {
      await client.logout().catch(() => undefined);
    }
  }

  /**
   * Sends a user follow-up / reply email via Zoho SMTP and appends it to the submission thread.
   */
  public async sendSubmissionFollowUp(params: {
    receiptId: string;
    to: string;
    subject: string;
    message: string;
    companyName?: string;
    senderName?: string;
    inReplyTo?: string;
    references?: string[];
    attachments?: Array<{
      fileName: string;
      mimeType: string;
      contentBase64: string;
    }>;
  }): Promise<SubmissionThreadMessage> {
    const html = `
      <div style="font-family: Montserrat, Arial, sans-serif; color: #1e293b; line-height: 1.65;">
        <p>${params.message.replace(/\n/g, '<br/>')}</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;"/>
        <p style="font-size:11px;color:#64748b;">
          Reference: <strong>${params.receiptId}</strong>${params.companyName ? ` • ${params.companyName}` : ''}<br/>
          Sent via Nexora AI Autonomous Workforce
        </p>
      </div>
    `;

    const safeTestRecipient = process.env.TEST_RECIPIENT_EMAIL?.trim();
    const actualRecipient = safeTestRecipient || params.to;

    const priorOutboundIds = (outboundThreadsByReceipt.get(params.receiptId) ?? [])
      .map((m) => m.messageId)
      .filter((id): id is string => Boolean(id));
    const mergedRefs = Array.from(new Set([...(params.references ?? []), ...priorOutboundIds]));
    const inReplyTo = params.inReplyTo || mergedRefs[mergedRefs.length - 1];

    const nodemailerAttachments = (params.attachments ?? []).map((att) => ({
      filename: att.fileName,
      content: Buffer.from(att.contentBase64, 'base64'),
      contentType: att.mimeType,
    }));

    const mailRes = await sendMail({
      to: actualRecipient,
      subject: params.subject,
      html,
      inReplyTo,
      references: mergedRefs.length > 0 ? mergedRefs : undefined,
      attachments: nodemailerAttachments.length > 0 ? nodemailerAttachments : undefined,
    });

    return this.recordOutboundMessage({
      receiptId: params.receiptId,
      from: process.env.SMTP_FROM || 'nexora@empirelabs.digital',
      to: actualRecipient,
      subject: params.subject,
      body: params.message,
      receivedAt: new Date().toISOString(),
      companyName: params.companyName,
      messageId: mailRes.messageId,
      attachments: (params.attachments ?? []).map((att) => ({
        fileName: att.fileName,
        mimeType: att.mimeType,
        sizeBytes: Buffer.from(att.contentBase64, 'base64').byteLength,
      })),
    });
  }
}

export const imapMonitorService = new ImapMonitorService();
