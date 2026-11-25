import pdfParse from 'pdf-parse';
import { logger } from '../utils/logger';

export interface DocumentVerificationInput {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  docType: string;
  label?: string;
}

export interface DocumentVerificationResult {
  valid: boolean;
  reason?: string;
}

const DOC_RULES: Array<{ match: RegExp; minHits: number; keywords: RegExp; friendly: string }> = [
  {
    match: /PASSPORT|ID|IDENTITY|NATIONAL_ID|PERMIT|VISA|CLEARANCE/i,
    minHits: 1,
    keywords:
      /\b(?:passport|national|identity|id\s*no|id\s*number|date\s*of\s*birth|dob|nationality|surname|given\s*name|expiry|expires|visa|permit|republic|citizenship|home\s*affairs|department|immigration|police|clearance|issued)\b/i,
    friendly: 'ID / Passport / Permit',
  },
  {
    match: /^CV$|RESUME|CURRICULUM/i,
    minHits: 2,
    keywords:
      /\b(?:experience|education|skills|employment|work|summary|profile|curriculum\s*vitae|resume|university|college|developer|engineer|manager|projects|achievements|responsibilities)\b/i,
    friendly: 'CV / Resume',
  },
  {
    match: /CERTIF|TRANSCRIPT|DIPLOMA|DEGREE|ACADEMIC/i,
    minHits: 1,
    keywords:
      /\b(?:certificate|certify|certified|diploma|degree|bachelor|master|phd|transcript|grade|gpa|university|college|institute|awarded|completed|results|module|credit|qualification|academic)\b/i,
    friendly: 'Certificate / Transcript',
  },
  {
    match: /PITCH|BUSINESS_PLAN|FINANCIAL|CAP_TABLE/i,
    minHits: 2,
    keywords:
      /\b(?:revenue|market|problem|solution|traction|funding|equity|startup|company|financial|projection|pitch|investor|product|team|business|valuation|arr|mrr)\b/i,
    friendly: 'Pitch Deck / Financial / Business Document',
  },
];

async function verifyImageWithVision(
  input: DocumentVerificationInput,
): Promise<DocumentVerificationResult | null> {
  const base64 = input.buffer.toString('base64');
  const mime = input.mimeType.startsWith('image/') ? input.mimeType : 'image/jpeg';
  const claimed = input.label || input.docType;
  const prompt = `You are a strict document verification system. The user uploaded this image claiming it is: "${claimed}" (type: ${input.docType}).
Inspect the image carefully. Is this genuinely a scan or photo of that document type (e.g. an ID card, passport, permit, certificate, CV, or official form), and NOT an unrelated photo (such as a mountain, landscape, selfie, pet, car, food, meme, or blank screen)?
Reply strictly with JSON only: {"valid": true or false, "detected": "what the image actually shows", "reason": "short explanation"}`;

  // 1. Try OpenAI Vision if configured
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
              ],
            },
          ],
          max_tokens: 180,
        }),
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const json = (await res.json()) as any;
        const parsed = JSON.parse(json.choices?.[0]?.message?.content || '{}');
        if (typeof parsed.valid === 'boolean') {
          return parsed.valid
            ? { valid: true }
            : {
                valid: false,
                reason: `Document rejected: image appears to be ${parsed.detected || 'an unrelated photo'}, not a valid ${claimed}. ${parsed.reason || ''}`.trim(),
              };
        }
      }
    } catch (err) {
      logger.warn({ err }, 'OpenAI vision document check failed');
    }
  }

  // 2. Try Gemini Vision if configured
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (geminiKey) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  { inline_data: { mime_type: mime, data: base64 } },
                ],
              },
            ],
            generationConfig: { responseMimeType: 'application/json' },
          }),
          signal: AbortSignal.timeout(12000),
        },
      );
      if (res.ok) {
        const json = (await res.json()) as any;
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const parsed = JSON.parse(text);
        if (typeof parsed.valid === 'boolean') {
          return parsed.valid
            ? { valid: true }
            : {
                valid: false,
                reason: `Document rejected: image appears to be ${parsed.detected || 'an unrelated photo'}, not a valid ${claimed}. ${parsed.reason || ''}`.trim(),
              };
        }
      }
    } catch (err) {
      logger.warn({ err }, 'Gemini vision document check failed');
    }
  }

  return null;
}

export async function verifyUploadedDocument(
  input: DocumentVerificationInput,
): Promise<DocumentVerificationResult> {
  if (!input.buffer || input.buffer.length < 100) {
    return { valid: false, reason: 'Uploaded file is empty or corrupted.' };
  }

  const isPdf =
    input.mimeType.toLowerCase().includes('pdf') ||
    input.fileName.toLowerCase().endsWith('.pdf');
  const isImage =
    input.mimeType.toLowerCase().startsWith('image/') ||
    /\.(png|jpe?g|webp)$/i.test(input.fileName);

  if (isPdf) {
    const header = input.buffer.subarray(0, 5).toString('utf8');
    if (header !== '%PDF-') {
      return {
        valid: false,
        reason: 'Invalid PDF file. Please upload a genuine PDF document.',
      };
    }

    try {
      const parsed = await pdfParse(input.buffer);
      const text = (parsed.text || '').trim();
      if (text.length >= 40) {
        const rule = DOC_RULES.find((r) => r.match.test(input.docType));
        if (rule) {
          const matches = text.match(new RegExp(rule.keywords.source, 'gi')) || [];
          const uniqueHits = new Set(matches.map((m) => m.toLowerCase())).size;
          if (uniqueHits < rule.minHits) {
            return {
              valid: false,
              reason: `This PDF does not appear to be a valid ${input.label || rule.friendly}. Please upload the correct document.`,
            };
          }
        }
      }
    } catch {
      // Scanned image-only PDF or unreadable stream — allow valid PDF header
    }
    return { valid: true };
  }

  if (isImage) {
    const visionResult = await verifyImageWithVision(input);
    if (visionResult) return visionResult;
    return { valid: true };
  }

  return { valid: true };
}
