import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Sparkles,
  Send,
  Volume2,
  Copy,
  Check,
  Radio,
  Download,
  Circle,
} from 'lucide-react';

interface TranscriptEntry {
  id: string;
  speaker: 'ai' | 'user';
  text: string;
  timestamp: string;
}

export interface LinkedScheduledInterview {
  id: string;
  jobTitle: string;
  companyName: string;
  interviewProvider?: 'GOOGLE_LIVE' | 'NUANCE' | 'EXTERNAL';
  interviewDate?: string;
  interviewTime?: string;
  timezone?: string;
  status?: string;
  instructions?: string;
  recordingUrl?: string;
}

interface LiveInterviewStudioProps {
  userUid?: string;
  apiFetch?: (path: string, init?: RequestInit) => Promise<Response>;
  candidateName?: string;
  defaultRole?: string;
  linkedInterview?: LinkedScheduledInterview | null;
  onClearLinkedInterview?: () => void;
  onRecordingSaved?: (recording: any) => void;
}

function downsampleTo16kPcm16(input: Float32Array, inputSampleRate: number): Int16Array {
  if (inputSampleRate === 16000) {
    const out = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }
  const ratio = inputSampleRate / 16000;
  const newLength = Math.round(input.length / ratio);
  const out = new Int16Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < out.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < input.length; i++) {
      accum += input[i];
      count++;
    }
    const sample = count > 0 ? accum / count : 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    out[offsetResult] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return out;
}

function int16ToBase64(int16: Int16Array): string {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToFloat32Pcm24k(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const sampleCount = Math.floor(bytes.byteLength / 2);
  const floats = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    floats[i] = view.getInt16(i * 2, true) / 32768;
  }
  return floats;
}

export const LiveInterviewStudio: React.FC<LiveInterviewStudioProps> = ({
  userUid = 'guest-user',
  apiFetch,
  candidateName = 'Candidate',
  defaultRole = 'Senior Software Engineer',
  linkedInterview = null,
  onClearLinkedInterview,
  onRecordingSaved,
}) => {
  const [role, setRole] = useState(linkedInterview?.jobTitle || defaultRole);
  const [company, setCompany] = useState(linkedInterview?.companyName || 'Nexora AI Partner');
  const [interviewType, setInterviewType] = useState('Technical & Behavioral');
  const [voice, setVoice] = useState('Aoede');

  const [callState, setCallState] = useState<'idle' | 'connecting' | 'live' | 'ended'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [recordCall, setRecordCall] = useState(true);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [textInput, setTextInput] = useState('');
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  // Saved recording after call ends (local preview + automatic Firebase Storage upload)
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingHasVideo, setRecordingHasVideo] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'saved' | 'error'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [savedCloudUrl, setSavedCloudUrl] = useState<string | null>(null);

  const elapsedSecRef = useRef(0);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const roleRef = useRef(role);
  const companyRef = useRef(company);
  const interviewTypeRef = useRef(interviewType);
  const linkedInterviewRef = useRef(linkedInterview);

  useEffect(() => {
    elapsedSecRef.current = elapsedSec;
  }, [elapsedSec]);
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);
  useEffect(() => {
    roleRef.current = role;
  }, [role]);
  useEffect(() => {
    companyRef.current = company;
  }, [company]);
  useEffect(() => {
    interviewTypeRef.current = interviewType;
  }, [interviewType]);
  useEffect(() => {
    linkedInterviewRef.current = linkedInterview;
    if (linkedInterview) {
      setRole(linkedInterview.jobTitle || defaultRole);
      setCompany(linkedInterview.companyName || 'Nexora AI Partner');
    }
  }, [linkedInterview?.id]);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const playbackAudioCtxRef = useRef<AudioContext | null>(null);
  const recordingAudioDestRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const nextPlayTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoIntervalRef = useRef<number | null>(null);
  const micMutedRef = useRef(false);
  const cameraOnRef = useRef(true);
  const callStateRef = useRef<'idle' | 'connecting' | 'live' | 'ended'>('idle');

  // Direct DOM refs for 60fps zero-shake animations (no React re-renders)
  const aiPulseRef = useRef<HTMLDivElement | null>(null);
  const micBarRef = useRef<HTMLDivElement | null>(null);
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    micMutedRef.current = micMuted;
  }, [micMuted]);

  useEffect(() => {
    cameraOnRef.current = cameraOn;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getVideoTracks().forEach((t) => {
        t.enabled = cameraOn;
      });
    }
    if ((callState === 'connecting' || callState === 'live') && videoElRef.current && mediaStreamRef.current) {
      if (videoElRef.current.srcObject !== mediaStreamRef.current) {
        videoElRef.current.srcObject = mediaStreamRef.current;
        videoElRef.current.play().catch(() => undefined);
      }
    }
  }, [cameraOn, callState]);

  // Scroll ONLY the inner transcript container (never the outer page!)
  useEffect(() => {
    const el = transcriptContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [transcript]);

  useEffect(() => {
    if (callState !== 'live') return;
    const id = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [callState]);

  useEffect(() => {
    return () => {
      cleanupSession(false);
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    };
  }, []);

  const updateAiPulseDom = (level: number) => {
    if (aiPulseRef.current) {
      const scale = 1 + Math.min(0.42, level * 0.42);
      aiPulseRef.current.style.transform = `scale(${scale.toFixed(3)})`;
      aiPulseRef.current.style.opacity = level > 0.03 ? '1' : '0.25';
    }
  };

  const updateMicBarDom = (level: number) => {
    if (micBarRef.current) {
      micBarRef.current.style.transform = `scaleX(${Math.max(0.02, Math.min(1, level)).toFixed(3)})`;
    }
  };

  const stopAllPlayback = () => {
    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {
        // already stopped
      }
    });
    activeSourcesRef.current.clear();
    if (playbackAudioCtxRef.current) {
      nextPlayTimeRef.current = playbackAudioCtxRef.current.currentTime;
    }
    setIsAiSpeaking(false);
    updateAiPulseDom(0);
  };

  const releaseMediaAndAudio = () => {
    stopAllPlayback();

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        // ignore
      }
      processorRef.current = null;
    }
    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close().catch(() => undefined);
      inputAudioCtxRef.current = null;
    }
    if (playbackAudioCtxRef.current) {
      playbackAudioCtxRef.current.close().catch(() => undefined);
      playbackAudioCtxRef.current = null;
    }
    recordingAudioDestRef.current = null;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    updateAiPulseDom(0);
    updateMicBarDom(0);
  };

  const cleanupSession = (finalizeRecording = true) => {
    if (videoIntervalRef.current) {
      window.clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }

    // Stop MediaRecorder FIRST and wait for onstop before closing AudioContext / stopping tracks,
    // otherwise the final WebM cluster & headers are truncated and the video cannot play!
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      if (!finalizeRecording) {
        recorder.onstop = null;
        try {
          recorder.stop();
        } catch {
          // ignore
        }
        releaseMediaAndAudio();
      } else {
        try {
          if (typeof recorder.requestData === 'function') {
            recorder.requestData();
          }
          recorder.stop();
        } catch {
          releaseMediaAndAudio();
        }
      }
      return;
    }

    releaseMediaAndAudio();
  };

  const appendTranscript = (speaker: 'ai' | 'user', chunkText: string) => {
    const clean = chunkText.replace(/\s+/g, ' ');
    if (!clean.trim()) return;
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === speaker) {
        return [
          ...prev.slice(0, -1),
          {
            ...last,
            text: `${last.text}${last.text.endsWith(' ') || clean.startsWith(' ') ? '' : ' '}${clean.trim()}`,
          },
        ];
      }
      return [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          speaker,
          text: clean.trim(),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ];
    });
  };

  const schedulePcmPlayback = (base64Audio: string) => {
    const ctx = playbackAudioCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => undefined);
    }

    const floats = base64ToFloat32Pcm24k(base64Audio);
    if (floats.length === 0) return;

    // Smooth GPU-composited avatar pulse (zero React re-render)
    let sumSq = 0;
    for (let i = 0; i < floats.length; i += 8) {
      sumSq += floats[i] * floats[i];
    }
    const rms = Math.sqrt(sumSq / Math.max(1, floats.length / 8));
    updateAiPulseDom(Math.min(1, rms * 5.5));

    const buffer = ctx.createBuffer(1, floats.length, 24000);
    buffer.getChannelData(0).set(floats);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    // Also route Maya's voice into the recording mix!
    if (recordingAudioDestRef.current) {
      source.connect(recordingAudioDestRef.current);
    }

    const now = ctx.currentTime;
    const startAt = Math.max(now + 0.02, nextPlayTimeRef.current);
    source.start(startAt);
    nextPlayTimeRef.current = startAt + buffer.duration;

    if (activeSourcesRef.current.size === 0) {
      setIsAiSpeaking(true);
    }
    activeSourcesRef.current.add(source);
    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (activeSourcesRef.current.size === 0) {
        setIsAiSpeaking(false);
        updateAiPulseDom(0);
      }
    };
  };

  const startLiveInterview = async () => {
    setErrorMsg(null);
    setTranscript([]);
    setElapsedSec(0);
    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl);
      setRecordingUrl(null);
    }
    setUploadStatus('idle');
    setUploadError(null);
    setSavedCloudUrl(null);
    recordedChunksRef.current = [];
    setCallState('connecting');

    try {
      // 1. Request Microphone (+ optional Camera)
      let stream: MediaStream;
      let hasVideo = false;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
          video: cameraOn ? { width: 640, height: 360, facingMode: 'user' } : false,
        });
        hasVideo = stream.getVideoTracks().length > 0;
      } catch {
        setCameraOn(false);
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
          video: false,
        });
        hasVideo = false;
      }
      mediaStreamRef.current = stream;

      if (videoElRef.current && hasVideo) {
        videoElRef.current.srcObject = stream;
        videoElRef.current.play().catch(() => undefined);
      }

      // 2. Initialize playback AudioContext at browser native sample rate (48kHz) so Web Audio
      // automatically resamples 24kHz Gemini audio AND Opus MediaRecorder gets clean 48kHz audio!
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const playbackCtx = new AudioCtx();
      playbackAudioCtxRef.current = playbackCtx;
      nextPlayTimeRef.current = playbackCtx.currentTime;

      // 2b. Set up call recording (mixes BOTH candidate mic + Maya AI voice + optional webcam video)
      if (recordCall && typeof MediaRecorder !== 'undefined') {
        try {
          const recDest = playbackCtx.createMediaStreamDestination();
          recordingAudioDestRef.current = recDest;

          // Route candidate mic into the recording mix (not speakers!)
          const micRecSource = playbackCtx.createMediaStreamSource(stream);
          micRecSource.connect(recDest);

          const combinedTracks: MediaStreamTrack[] = [
            ...(hasVideo ? stream.getVideoTracks() : []),
            ...recDest.stream.getAudioTracks(),
          ];
          const combinedStream = new MediaStream(combinedTracks);

          const preferredMime = hasVideo
            ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((m) =>
                MediaRecorder.isTypeSupported(m),
              )
            : ['audio/webm;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m));

          const recorder = preferredMime
            ? new MediaRecorder(combinedStream, { mimeType: preferredMime, videoBitsPerSecond: 600_000 })
            : new MediaRecorder(combinedStream);

          setRecordingHasVideo(hasVideo);
          recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) {
              recordedChunksRef.current.push(ev.data);
            }
          };
          recorder.onstop = () => {
            // Release camera/mic/AudioContext AFTER MediaRecorder has cleanly finalized the container!
            const chunks = [...recordedChunksRef.current];
            releaseMediaAndAudio();

            if (chunks.length > 0) {
              const baseMime = (preferredMime || (hasVideo ? 'video/webm' : 'audio/webm')).split(';')[0];
              const blob = new Blob(chunks, { type: baseMime });
              const localUrl = URL.createObjectURL(blob);
              setRecordingUrl(localUrl);

              // Automatically upload recording to Firebase Storage + Firestore
              setUploadStatus('uploading');
              setUploadError(null);
              const reader = new FileReader();
              reader.onloadend = async () => {
                try {
                  const dataUrl = typeof reader.result === 'string' ? reader.result : '';
                  const mediaBase64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
                  if (!mediaBase64) throw new Error('Empty recording payload');
                  const fetcher = apiFetch || fetch;
                  const linked = linkedInterviewRef.current;
                  const res = await fetcher('/api/v1/live-interview/recordings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      userUid,
                      interviewId: linked?.id,
                      role: roleRef.current.trim() || 'Live AI Interview',
                      companyName: companyRef.current.trim() || 'Nexora AI Practice',
                      interviewType: interviewTypeRef.current,
                      interviewProvider: linked?.interviewProvider || 'GOOGLE_LIVE',
                      durationSeconds: Math.max(1, elapsedSecRef.current),
                      hasVideo,
                      mimeType: baseMime,
                      mediaBase64,
                      transcript: transcriptRef.current.map(({ speaker, text, timestamp }) => ({
                        speaker,
                        text,
                        timestamp,
                      })),
                    }),
                  });
                  const json = await res.json().catch(() => null);
                  if (!res.ok || !json?.ok) {
                    throw new Error(json?.error || `Upload failed (${res.status})`);
                  }
                  setUploadStatus('saved');
                  setSavedCloudUrl(json.data?.recordingUrl || null);
                  onRecordingSaved?.(json.data);
                } catch (upErr: any) {
                  setUploadStatus('error');
                  setUploadError(upErr?.message || 'Could not auto-save to Firebase');
                }
              };
              reader.readAsDataURL(blob);
            }
          };
          recorder.start(1000);
          mediaRecorderRef.current = recorder;
        } catch {
          // Non-fatal if browser blocks MediaRecorder
        }
      }

      // 3. Open WebSocket to secure backend proxy -> Google Gemini Live API
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const qs = new URLSearchParams({
        interviewId: linkedInterviewRef.current?.id || '',
        role: role.trim() || 'Senior Software Engineer',
        company: company.trim() || 'Nexora AI Partner',
        interviewType,
        candidateName: candidateName || 'Candidate',
        voice,
      });
      const wsUrl = `${wsProtocol}//${window.location.host}/api/v1/live-interview/ws?${qs.toString()}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = async (event) => {
        try {
          const text = typeof event.data === 'string' ? event.data : await event.data.text();
          const msg = JSON.parse(text);

          if (msg.type === 'error') {
            setErrorMsg(msg.message || 'Live API error');
            cleanupSession(false);
            setCallState('idle');
            return;
          }

          if (msg.setupComplete) {
            setCallState('live');
            ws.send(
              JSON.stringify({
                clientContent: {
                  turns: [
                    {
                      role: 'user',
                      parts: [
                        {
                          text: `Hello Maya, I'm ${candidateName || 'ready'}. Please welcome me and start our ${interviewType} interview for the ${role} role.`,
                        },
                      ],
                    },
                  ],
                  turnComplete: true,
                },
              }),
            );
            return;
          }

          const sc = msg.serverContent;
          if (!sc) return;

          if (sc.interrupted) {
            stopAllPlayback();
          }

          if (sc.inputTranscription?.text) {
            appendTranscript('user', sc.inputTranscription.text);
          }
          if (sc.outputTranscription?.text) {
            appendTranscript('ai', sc.outputTranscription.text);
          }

          const parts = sc.modelTurn?.parts || [];
          for (const part of parts) {
            if (part.inlineData?.data && String(part.inlineData?.mimeType || '').startsWith('audio/pcm')) {
              schedulePcmPlayback(part.inlineData.data);
            }
          }
        } catch {
          // ignore malformed frame
        }
      };

      ws.onerror = () => {
        setErrorMsg('WebSocket connection error. Make sure the backend server is running.');
        cleanupSession(false);
        setCallState('idle');
      };

      ws.onclose = () => {
        if (callStateRef.current === 'connecting') {
          setCallState('idle');
        }
      };

      // 4. Stream Microphone 16kHz PCM16 audio (routed through silent GainNode=0 to prevent echo!)
      const inputCtx = new AudioCtx();
      inputAudioCtxRef.current = inputCtx;
      const source = inputCtx.createMediaStreamSource(stream);
      const processor = inputCtx.createScriptProcessor(4096, 1, 1);
      const silentGain = inputCtx.createGain();
      silentGain.gain.value = 0;
      processorRef.current = processor;

      processor.onaudioprocess = (e) => {
        if (micMutedRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          updateMicBarDom(0);
          return;
        }
        const channelData = e.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < channelData.length; i += 8) {
          sum += channelData[i] * channelData[i];
        }
        const rms = Math.sqrt(sum / Math.max(1, channelData.length / 8));
        updateMicBarDom(Math.min(1, rms * 8));

        const pcm16 = downsampleTo16kPcm16(channelData, inputCtx.sampleRate);
        const b64 = int16ToBase64(pcm16);
        wsRef.current.send(
          JSON.stringify({
            realtimeInput: {
              mediaChunks: [
                {
                  mimeType: 'audio/pcm;rate=16000',
                  data: b64,
                },
              ],
            },
          }),
        );
      };

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(inputCtx.destination);

      // 5. Stream 1 FPS webcam frames when camera is active
      videoIntervalRef.current = window.setInterval(() => {
        if (
          !cameraOnRef.current ||
          !videoElRef.current ||
          !wsRef.current ||
          wsRef.current.readyState !== WebSocket.OPEN
        ) {
          return;
        }
        const video = videoElRef.current;
        if (video.videoWidth === 0 || video.videoHeight === 0) return;
        if (!canvasRef.current) {
          canvasRef.current = document.createElement('canvas');
        }
        const canvas = canvasRef.current;
        canvas.width = 480;
        canvas.height = 270;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.55);
        const base64Jpeg = dataUrl.split(',')[1];
        if (base64Jpeg) {
          wsRef.current.send(
            JSON.stringify({
              realtimeInput: {
                mediaChunks: [
                  {
                    mimeType: 'image/jpeg',
                    data: base64Jpeg,
                  },
                ],
              },
            }),
          );
        }
      }, 1000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not access microphone. Please allow mic permissions and try again.');
      cleanupSession(false);
      setCallState('idle');
    }
  };

  const endLiveInterview = () => {
    cleanupSession(true);
    setCallState('ended');
  };

  const sendTextMessage = () => {
    const trimmed = textInput.trim();
    if (!trimmed || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    appendTranscript('user', trimmed);
    wsRef.current.send(
      JSON.stringify({
        clientContent: {
          turns: [{ role: 'user', parts: [{ text: trimmed }] }],
          turnComplete: true,
        },
      }),
    );
    setTextInput('');
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const copyTranscript = () => {
    const text = transcript
      .map((t) => `[${t.timestamp}] ${t.speaker === 'ai' ? 'Maya (AI Interviewer)' : 'You'}: ${t.text}`)
      .join('\n');
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedTranscript(true);
      setTimeout(() => setCopiedTranscript(false), 2000);
    });
  };

  return (
    <div
      style={{
        marginBottom: '24px',
        borderRadius: '18px',
        background: 'linear-gradient(145deg, #0f172a 0%, #111b21 60%, #0b141a 100%)',
        border: '1px solid rgba(16, 185, 129, 0.35)',
        overflow: 'hidden',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
      }}
    >
      {/* Header Strip */}
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          background: 'rgba(17, 27, 33, 0.85)',
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #005c4b, #10b981)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-extrabold text-white">Nexora Live AI Video Interview</span>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: callState === 'live' ? 'rgba(16, 185, 129, 0.22)' : 'rgba(56, 189, 248, 0.18)',
                  color: callState === 'live' ? '#34d399' : '#7dd3fc',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {callState === 'live' ? `● LIVE • ${formatTimer(elapsedSec)}` : 'GEMINI LIVE API'}
              </span>
              {callState === 'live' && recordCall && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '999px',
                    background: 'rgba(239, 68, 68, 0.2)',
                    color: '#fca5a5',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Circle className="w-2.5 h-2.5 fill-red-400 text-red-400" />
                  REC
                </span>
              )}
            </div>
            <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
              Real-time voice + webcam interview with Maya — interrupt naturally, record &amp; replay with live captions.
            </div>
          </div>
        </div>
      </div>

      {/* Setup Controls (real scheduled interview pre-call room) */}
      {(callState === 'idle' || callState === 'ended') && (
        <div style={{ padding: '18px' }}>
          {linkedInterview && (
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ fontSize: '12.5px', color: '#d1fae5' }}>
                <div>
                  <strong>{linkedInterview.jobTitle}</strong> — {linkedInterview.companyName} (
                  {linkedInterview.interviewProvider === 'NUANCE' ? 'Nuance AI' : 'Google Live AI'})
                  {linkedInterview.interviewDate ? (
                    <span style={{ color: '#94a3b8', marginLeft: '8px', fontSize: '11.5px' }}>
                      • {linkedInterview.interviewDate} at {linkedInterview.interviewTime} ({linkedInterview.timezone || 'UTC'})
                    </span>
                  ) : null}
                </div>
                <div style={{ fontSize: '11.5px', color: '#a7f3d0', marginTop: '3px' }}>
                  Your employer&apos;s interview questions are loaded, and the video automatically saves to Firebase when you click End Call.
                </div>
                {linkedInterview.instructions && (
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                    Note: {linkedInterview.instructions}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {linkedInterview.recordingUrl && (
                  <a
                    href={linkedInterview.recordingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="chat-action-btn"
                    style={{ padding: '5px 10px', fontSize: '11.5px', textDecoration: 'none' }}
                  >
                    Watch Saved Recording
                  </a>
                )}
                {linkedInterview.status && (
                  <span
                    style={{
                      fontSize: '10.5px',
                      fontWeight: 700,
                      padding: '3px 9px',
                      borderRadius: '999px',
                      background:
                        linkedInterview.status === 'COMPLETED'
                          ? 'rgba(16,185,129,0.22)'
                          : 'rgba(56,189,248,0.22)',
                      color: linkedInterview.status === 'COMPLETED' ? '#6ee7b7' : '#7dd3fc',
                    }}
                  >
                    {linkedInterview.status}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <label style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 600 }}>AI Voice:</label>
                <select
                  value={voice}
                  onChange={(e) => setVoice(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    background: '#182229',
                    border: '1px solid #2a3942',
                    color: '#e9edef',
                    fontSize: '12px',
                  }}
                >
                  <option value="Aoede">Aoede (Warm Female)</option>
                  <option value="Kore">Kore (Clear Professional Female)</option>
                  <option value="Puck">Puck (Energetic Male)</option>
                  <option value="Fenrir">Fenrir (Deep Executive Male)</option>
                  <option value="Charon">Charon (Calm Analytical Male)</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={cameraOn}
                  onChange={(e) => setCameraOn(e.target.checked)}
                />
                <span>Camera on</span>
              </label>
            </div>
            <button
              type="button"
              onClick={startLiveInterview}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                borderRadius: '12px',
                background: '#005c4b',
                border: '1px solid rgba(37, 211, 102, 0.45)',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Radio className="w-4 h-4 text-emerald-300" />
              <span>{callState === 'ended' ? 'Retake AI Interview' : 'Join AI Interview Now'}</span>
            </button>
          </div>

          {errorMsg && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                background: 'rgba(239, 68, 68, 0.14)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: '#fca5a5',
                fontSize: '12px',
                marginBottom: '14px',
              }}
            >
              {errorMsg}
            </div>
          )}

          {/* Post-call Recording Player & Transcript Summary */}
          {callState === 'ended' && (recordingUrl || transcript.length > 0) && (
            <div
              style={{
                marginTop: '16px',
                padding: '14px',
                borderRadius: '12px',
                background: '#182229',
                border: '1px solid #2a3942',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              {recordingUrl && (
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-emerald-300">
                        Interview Recording ({formatTimer(elapsedSec)})
                      </span>
                      {uploadStatus === 'uploading' && (
                        <span style={{ fontSize: '11px', color: '#7dd3fc', fontWeight: 600 }}>
                          Saving to Firebase...
                        </span>
                      )}
                      {uploadStatus === 'saved' && (
                        <span style={{ fontSize: '11px', color: '#34d399', fontWeight: 700 }}>
                          ✓ Auto-saved to Firebase
                        </span>
                      )}
                      {uploadStatus === 'error' && (
                        <span style={{ fontSize: '11px', color: '#fca5a5', fontWeight: 600 }}>
                          Firebase upload error: {uploadError}
                        </span>
                      )}
                    </div>
                    <a
                      href={savedCloudUrl || recordingUrl}
                      download={`nexora-interview-${role.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.webm`}
                      className="chat-action-btn primary"
                      style={{ padding: '5px 12px', fontSize: '11.5px', textDecoration: 'none' }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download Recording (.webm)</span>
                    </a>
                  </div>
                  {recordingHasVideo ? (
                    <video
                      src={recordingUrl}
                      controls
                      style={{
                        width: '100%',
                        maxHeight: '280px',
                        borderRadius: '10px',
                        background: '#000',
                      }}
                    />
                  ) : (
                    <audio src={recordingUrl} controls style={{ width: '100%' }} />
                  )}
                </div>
              )}

              {transcript.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-300">
                      Interview Transcript ({transcript.length} turns)
                    </span>
                    <button
                      type="button"
                      onClick={copyTranscript}
                      className="chat-action-btn"
                      style={{ padding: '4px 10px', fontSize: '11px' }}
                    >
                      {copiedTranscript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedTranscript ? 'Copied' : 'Copy Transcript'}</span>
                    </button>
                  </div>
                  <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {transcript.map((item) => (
                      <div key={item.id} style={{ fontSize: '12px', color: '#d1d7db', lineHeight: 1.5 }}>
                        <strong style={{ color: item.speaker === 'ai' ? '#34d399' : '#7dd3fc' }}>
                          {item.speaker === 'ai' ? 'Maya: ' : 'You: '}
                        </strong>
                        {item.text}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Active Call Studio — fixed height & GPU-composited animations so nothing ever shakes */}
      {(callState === 'connecting' || callState === 'live') && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.3fr) minmax(260px, 0.9fr)',
            height: '430px',
            overflow: 'hidden',
          }}
        >
          {/* Left: AI Interviewer Stage + PiP Webcam + Controls */}
          <div
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px 18px 80px',
              background: 'radial-gradient(circle at 50% 40%, rgba(16, 185, 129, 0.14), rgba(11, 20, 26, 0.96) 70%)',
              borderRight: '1px solid rgba(255, 255, 255, 0.08)',
              overflow: 'hidden',
            }}
          >
            {/* Maya AI Avatar with GPU-composited transform pulse (zero layout shift) */}
            <div
              style={{
                position: 'relative',
                width: '150px',
                height: '150px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <div
                ref={aiPulseRef}
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  background: 'radial-gradient(circle, rgba(16, 185, 129, 0.38), transparent 70%)',
                  transform: 'scale(1)',
                  opacity: 0.25,
                  transition: 'transform 0.1s ease-out, opacity 0.12s ease-out',
                  willChange: 'transform, opacity',
                  pointerEvents: 'none',
                }}
              />
              <div
                style={{
                  width: '112px',
                  height: '112px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #005c4b, #0ea5e9)',
                  border: `3px solid ${isAiSpeaking ? '#34d399' : 'rgba(255,255,255,0.18)'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                  zIndex: 2,
                  boxShadow: '0 8px 28px rgba(0, 0, 0, 0.45)',
                  transition: 'border-color 0.15s ease',
                }}
              >
                <span style={{ fontSize: '34px', fontWeight: 800, color: '#fff', lineHeight: 1 }}>M</span>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#d1fae5', marginTop: '4px' }}>MAYA AI</span>
              </div>
            </div>

            <div style={{ marginTop: '12px', textAlign: 'center', zIndex: 2, minHeight: '58px' }}>
              <div className="text-sm font-bold text-white" style={{ height: '20px', lineHeight: '20px' }}>
                {callState === 'connecting'
                  ? 'Connecting to Gemini Live...'
                  : isAiSpeaking
                    ? 'Maya is speaking...'
                    : 'Listening — speak naturally'}
              </div>
              <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '3px', height: '16px', lineHeight: '16px' }}>
                {role} • {interviewType}
              </div>
              {/* User mic activity bar (GPU scaleX, zero reflow) */}
              <div
                style={{
                  margin: '10px auto 0',
                  width: '140px',
                  height: '5px',
                  borderRadius: '999px',
                  background: 'rgba(255,255,255,0.08)',
                  overflow: 'hidden',
                }}
              >
                <div
                  ref={micBarRef}
                  style={{
                    width: '100%',
                    height: '100%',
                    background: '#34d399',
                    transformOrigin: 'left center',
                    transform: 'scaleX(0.02)',
                    transition: 'transform 0.08s linear',
                    willChange: 'transform',
                  }}
                />
              </div>
            </div>

            {/* Candidate Webcam Picture-in-Picture */}
            <div
              style={{
                position: 'absolute',
                top: '14px',
                right: '14px',
                width: '144px',
                height: '86px',
                borderRadius: '12px',
                overflow: 'hidden',
                background: '#182229',
                border: '1px solid rgba(255, 255, 255, 0.14)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <video
                ref={videoElRef}
                autoPlay
                playsInline
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  transform: 'scaleX(-1)',
                  display: cameraOn ? 'block' : 'none',
                }}
              />
              {!cameraOn && (
                <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <VideoOff className="w-3.5 h-3.5" />
                  <span>Camera off</span>
                </div>
              )}
            </div>

            {/* Call Controls Bar */}
            <div
              style={{
                position: 'absolute',
                bottom: '16px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 14px',
                borderRadius: '999px',
                background: 'rgba(24, 34, 41, 0.92)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <button
                type="button"
                onClick={() => setMicMuted((m) => !m)}
                title={micMuted ? 'Unmute microphone' : 'Mute microphone'}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: micMuted ? '#ef4444' : '#2a3942',
                  color: '#fff',
                }}
              >
                {micMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => setCameraOn((c) => !c)}
                title={cameraOn ? 'Turn camera off' : 'Turn camera on'}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: !cameraOn ? '#475569' : '#2a3942',
                  color: '#fff',
                }}
              >
                {cameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={endLiveInterview}
                title="End live interview"
                style={{
                  height: '40px',
                  padding: '0 16px',
                  borderRadius: '999px',
                  border: 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#dc2626',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 700,
                }}
              >
                <PhoneOff className="w-4 h-4" />
                <span>End Call</span>
              </button>
            </div>
          </div>

          {/* Right: Live Transcript & Text Side-Channel */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              background: '#0b141a',
              height: '430px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                fontSize: '11.5px',
                fontWeight: 700,
                color: '#94a3b8',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                flexShrink: 0,
              }}
            >
              <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Live Captions &amp; Transcript</span>
            </div>
            <div
              ref={transcriptContainerRef}
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {transcript.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#64748b', margin: 'auto', textAlign: 'center' }}>
                  Live captions will appear here as Maya and you speak...
                </div>
              ) : (
                transcript.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      alignSelf: item.speaker === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '90%',
                      padding: '8px 11px',
                      borderRadius: item.speaker === 'user' ? '12px 2px 12px 12px' : '2px 12px 12px 12px',
                      background: item.speaker === 'user' ? '#005c4b' : '#202c33',
                      color: '#e9edef',
                      fontSize: '12px',
                      lineHeight: 1.45,
                    }}
                  >
                    <div
                      style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        color: item.speaker === 'ai' ? '#34d399' : '#a7f3d0',
                        marginBottom: '2px',
                      }}
                    >
                      {item.speaker === 'ai' ? 'Maya' : 'You'} • {item.timestamp}
                    </div>
                    {item.text}
                  </div>
                ))
              )}
            </div>
            <div
              style={{
                padding: '8px 10px',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                display: 'flex',
                gap: '6px',
                background: '#111b21',
                flexShrink: 0,
              }}
            >
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') sendTextMessage();
                }}
                placeholder="Type a note or code snippet..."
                style={{
                  flex: 1,
                  padding: '7px 10px',
                  borderRadius: '8px',
                  background: '#202c33',
                  border: '1px solid #2a3942',
                  color: '#e9edef',
                  fontSize: '12px',
                }}
              />
              <button
                type="button"
                onClick={sendTextMessage}
                style={{
                  padding: '7px 10px',
                  borderRadius: '8px',
                  background: '#005c4b',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
