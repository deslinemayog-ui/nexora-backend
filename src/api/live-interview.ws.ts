import { IncomingMessage } from 'http';
import { FastifyInstance } from 'fastify';
import WebSocket, { WebSocketServer } from 'ws';
import { logger } from '../utils/logger';
import { platformStore } from '../modules/platform/platform.store';

const DEFAULT_LIVE_MODEL = 'models/gemini-2.5-flash-native-audio-preview-12-2025';

function buildInterviewerSystemPrompt(params: {
  role: string;
  company: string;
  interviewType: string;
  candidateName: string;
  employerQuestions?: string;
  instructions?: string;
}): string {
  const lines = [
    `You are Maya, a warm, sharp, human-like senior interviewer representing ${params.company} on Nexora AI.`,
    `You are conducting a live face-to-face ${params.interviewType} interview with ${params.candidateName} for the role of "${params.role}".`,
  ];

  if (params.employerQuestions?.trim()) {
    lines.push(
      ``,
      `MANDATORY EMPLOYER INTERVIEW QUESTIONS (you MUST cover these exact questions in order, one at a time, asking brief natural follow-ups based on the candidate's answers):`,
      params.employerQuestions.trim(),
    );
  }

  if (params.instructions?.trim()) {
    lines.push(``, `Additional Employer Context / Instructions:`, params.instructions.trim());
  }

  lines.push(
    ``,
    `Style & Guidelines:`,
    `- Speak naturally and conversationally, like a real human interviewer on a video call — concise responses (2-4 sentences per turn).`,
    `- Start by greeting ${params.candidateName} warmly by name, welcoming them to the ${params.role} interview with ${params.company}, and asking the FIRST employer question.`,
    `- Ask ONE clear question at a time. Listen carefully to their answer, acknowledge what they said, ask a brief relevant follow-up if needed, and move smoothly to the next employer question.`,
    `- If you can see them on camera, keep your tone encouraging and attentive. Never read bullet symbols or numbering out loud robotically.`,
    `- If the candidate interrupts you, stop gracefully and respond to what they just said.`,
    `- Once all employer questions have been covered, thank ${params.candidateName} warmly, let them know their video recording and transcript have been shared with ${params.company}, and invite them to click End Call.`,
  );

  return lines.join('\n');
}

export function registerLiveInterviewWebSocket(app: FastifyInstance): void {
  const apiKey = (process.env.GEMINI_LIVE_API_KEY || '').trim();
  const model = (process.env.GEMINI_LIVE_MODEL || DEFAULT_LIVE_MODEL).trim();

  // Status endpoint so frontend knows if Gemini Live is ready
  app.get('/api/v1/live-interview/status', async () => {
    const key = (process.env.GEMINI_LIVE_API_KEY || '').trim();
    return {
      ok: true,
      enabled: Boolean(key),
      model: (process.env.GEMINI_LIVE_MODEL || DEFAULT_LIVE_MODEL).trim(),
    };
  });

  const wss = new WebSocketServer({ noServer: true });

  app.server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const urlStr = request.url || '';
    if (!urlStr.startsWith('/api/v1/live-interview/ws')) {
      return;
    }

    wss.handleUpgrade(request, socket, head, (clientWs) => {
      wss.emit('connection', clientWs, request);
    });
  });

  wss.on('connection', (clientWs: WebSocket, request: IncomingMessage) => {
    const liveKey = (process.env.GEMINI_LIVE_API_KEY || apiKey || '').trim();
    if (!liveKey) {
      clientWs.send(
        JSON.stringify({
          type: 'error',
          message: 'GEMINI_LIVE_API_KEY is not configured on the server.',
        }),
      );
      clientWs.close(1011, 'Missing API key');
      return;
    }

    const parsedUrl = new URL(request.url || '/api/v1/live-interview/ws', 'http://localhost');
    const interviewId = (parsedUrl.searchParams.get('interviewId') || '').trim();
    const scheduledInterview = interviewId
      ? platformStore.getState().interviews.find((iv) => iv.id === interviewId)
      : undefined;

    const role = (
      scheduledInterview?.jobTitle ||
      parsedUrl.searchParams.get('role') ||
      'Senior Software Engineer'
    ).slice(0, 120);
    const company = (
      scheduledInterview?.companyName ||
      parsedUrl.searchParams.get('company') ||
      'Nexora AI Partner'
    ).slice(0, 120);
    const interviewType = (parsedUrl.searchParams.get('interviewType') || 'Technical & Behavioral').slice(0, 80);
    const candidateName = (
      scheduledInterview?.candidateName ||
      parsedUrl.searchParams.get('candidateName') ||
      'Candidate'
    ).slice(0, 80);
    const voiceName = (parsedUrl.searchParams.get('voice') || 'Aoede').slice(0, 32);
    const employerQuestions = scheduledInterview?.aiQuestions || scheduledInterview?.interviewerNotes || '';
    const instructions = scheduledInterview?.instructions || '';

    const upstreamUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(liveKey)}`;
    const upstreamWs = new WebSocket(upstreamUrl);
    let upstreamReady = false;
    const pendingClientMessages: string[] = [];

    logger.info(
      { role, company, interviewType, voiceName, model },
      'Opening Gemini Live API interview session',
    );

    upstreamWs.on('open', () => {
      const setupPayload = {
        setup: {
          model: (process.env.GEMINI_LIVE_MODEL || model).trim(),
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName,
                },
              },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          systemInstruction: {
            parts: [
              {
                text: buildInterviewerSystemPrompt({
                  role,
                  company,
                  interviewType,
                  candidateName,
                  employerQuestions,
                  instructions,
                }),
              },
            ],
          },
        },
      };

      upstreamWs.send(JSON.stringify(setupPayload));
    });

    upstreamWs.on('message', (rawData) => {
      const text = rawData.toString('utf8');
      if (!upstreamReady) {
        try {
          const parsed = JSON.parse(text);
          if (parsed.setupComplete) {
            upstreamReady = true;
            // Flush any queued client messages
            while (pendingClientMessages.length > 0 && upstreamWs.readyState === WebSocket.OPEN) {
              const nextMsg = pendingClientMessages.shift();
              if (nextMsg) upstreamWs.send(nextMsg);
            }
          }
        } catch {
          // ignore parse errors on non-JSON frames
        }
      }

      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(text);
      }
    });

    upstreamWs.on('close', (code, reasonBuf) => {
      const reason = reasonBuf?.toString('utf8') || '';
      logger.info({ code, reason }, 'Gemini Live upstream WebSocket closed');
      if (clientWs.readyState === WebSocket.OPEN) {
        if (code !== 1000) {
          clientWs.send(
            JSON.stringify({
              type: 'error',
              message: reason || `Gemini Live connection closed (code ${code})`,
            }),
          );
        }
        clientWs.close(1000);
      }
    });

    upstreamWs.on('error', (err) => {
      logger.error({ err }, 'Gemini Live upstream WebSocket error');
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({
            type: 'error',
            message: err.message || 'Upstream Gemini Live connection failed.',
          }),
        );
        clientWs.close(1011);
      }
    });

    clientWs.on('message', (rawData) => {
      const text = rawData.toString('utf8');
      if (upstreamReady && upstreamWs.readyState === WebSocket.OPEN) {
        upstreamWs.send(text);
      } else if (pendingClientMessages.length < 25) {
        pendingClientMessages.push(text);
      }
    });

    clientWs.on('close', () => {
      if (upstreamWs.readyState === WebSocket.OPEN || upstreamWs.readyState === WebSocket.CONNECTING) {
        upstreamWs.close(1000);
      }
    });

    clientWs.on('error', () => {
      if (upstreamWs.readyState === WebSocket.OPEN || upstreamWs.readyState === WebSocket.CONNECTING) {
        upstreamWs.close(1000);
      }
    });
  });
}
