import React, { useEffect, useRef, useState } from 'react';
import { createNuanceConversation, type Conversation } from '@nuancelabs/js-sdk';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  PhoneOff,
  Sparkles,
  Volume2,
  Copy,
  Check,
  Radio,
  Download,
  Circle,
} from 'lucide-react';
import type { LinkedScheduledInterview } from './LiveInterviewStudio';

interface TranscriptEntry {
  id: string;
  speaker: 'ai' | 'user';
  text: string;
  timestamp: string;
}

interface NuanceInterviewStudioProps {
  userUid: string;
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
  candidateName?: string;
  linkedInterview: LinkedScheduledInterview;
  onRecordingSaved?: (recording: any) => void;
}

export const NuanceInterviewStudio: React.FC<NuanceInterviewStudioProps> = ({
  userUid,
  apiFetch,
  candidateName = 'Candidate',
  linkedInterview,
  onRecordingSaved,
}) => {
  const [personaId, setPersonaId] = useState<'sonia' | 'sam' | 'mira'>('sonia');
  const [callState, setCallState] = useState<'idle' | 'connecting' | 'live' | 'ended'>('idle');
  const [statusLabel, setStatusLabel] = useState<string>('Ready to join');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingHasVideo, setRecordingHasVideo] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'saved' | 'error'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [savedCloudUrl, setSavedCloudUrl] = useState<string | null>(null);

  const conversationRef = useRef<Conversation | null>(null);
  const avatarVideoRef = useRef<HTMLVideoElement | null>(null);
  const avatarAudioRef = useRef<HTMLAudioElement | null>(null);
  const userVideoRef = useRef<HTMLVideoElement | null>(null);
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);

  // Recording refs (mixes Nuance persona audio + candidate mic + candidate webcam)
  const recordCtxRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStartedRef = useRef(false);
  const elapsedSecRef = useRef(0);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const personaName = personaId === 'sam' ? 'Sam' : personaId === 'mira' ? 'Mira' : 'Sonia';

  useEffect(() => {
    elapsedSecRef.current = elapsedSec;
  }, [elapsedSec]);

  useEffect(() => {
    transcriptRef.current = transcript;
    const el = transcriptContainerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [transcript]);

  useEffect(() => {
    if (callState !== 'live') return;
    const id = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [callState]);

  useEffect(() => {
    return () => {
      void disconnectNuance(false);
    };
  }, []);

  const appendTranscript = (speaker: 'ai' | 'user', chunkText: string) => {
    const clean = String(chunkText || '');
    if (!clean.trim()) return;
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === speaker) {
        const needsSpace = !last.text.endsWith(' ') && !clean.startsWith(' ') && !/^[.,!?;:]/.test(clean);
        return [...prev.slice(0, -1), { ...last, text: `${last.text}${needsSpace ? ' ' : ''}${clean}` }];
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

  const tryStartRecording = (conv: Conversation) => {
    if (recordingStartedRef.current || typeof MediaRecorder === 'undefined') return;
    try {
      const avatarAudioTrack = conv.avatar.audioTrack?.mediaStreamTrack;
      const userAudioTrack = (conv.user as any)?.audioTrack?.mediaStreamTrack as MediaStreamTrack | undefined;
      const userVideoTrack = (conv.user as any)?.videoTrack?.mediaStreamTrack as MediaStreamTrack | undefined;
      const avatarVideoTrack = (conv.avatar.videoTrack as any)?.mediaStreamTrack as MediaStreamTrack | undefined;

      if (!avatarAudioTrack && !userAudioTrack) return;

      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      recordCtxRef.current = ctx;
      const dest = ctx.createMediaStreamDestination();

      if (avatarAudioTrack) {
        const s1 = ctx.createMediaStreamSource(new MediaStream([avatarAudioTrack]));
        s1.connect(dest);
      }
      if (userAudioTrack) {
        const s2 = ctx.createMediaStreamSource(new MediaStream([userAudioTrack]));
        s2.connect(dest);
      }

      const videoTrackToRecord = userVideoTrack || avatarVideoTrack || null;
      const hasVideo = Boolean(videoTrackToRecord);
      const tracks: MediaStreamTrack[] = [
        ...(videoTrackToRecord ? [videoTrackToRecord] : []),
        ...dest.stream.getAudioTracks(),
      ];
      const combinedStream = new MediaStream(tracks);

      const preferredMime = hasVideo
        ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find((m) =>
            MediaRecorder.isTypeSupported(m),
          )
        : ['audio/webm;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported(m));

      const recorder = preferredMime
        ? new MediaRecorder(combinedStream, { mimeType: preferredMime, videoBitsPerSecond: 600_000 })
        : new MediaRecorder(combinedStream);

      recordingStartedRef.current = true;
      setRecordingHasVideo(hasVideo);
      recordedChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const chunks = [...recordedChunksRef.current];
        if (recordCtxRef.current) {
          recordCtxRef.current.close().catch(() => undefined);
          recordCtxRef.current = null;
        }
        if (chunks.length === 0) return;

        const baseMime = (preferredMime || (hasVideo ? 'video/webm' : 'audio/webm')).split(';')[0];
        const blob = new Blob(chunks, { type: baseMime });
        const localUrl = URL.createObjectURL(blob);
        setRecordingUrl(localUrl);

        setUploadStatus('uploading');
        setUploadError(null);
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            const dataUrl = typeof reader.result === 'string' ? reader.result : '';
            const mediaBase64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
            if (!mediaBase64) throw new Error('Empty recording payload');
            const res = await apiFetch('/api/v1/live-interview/recordings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                userUid,
                interviewId: linkedInterview.id,
                role: linkedInterview.jobTitle,
                companyName: linkedInterview.companyName,
                interviewType: 'Nuance AI Video Interview',
                interviewProvider: 'NUANCE',
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
          } catch (err: any) {
            setUploadStatus('error');
            setUploadError(err?.message || 'Could not auto-save to Firebase');
          }
        };
        reader.readAsDataURL(blob);
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
    } catch {
      // non-fatal if browser blocks MediaRecorder
    }
  };

  const disconnectNuance = async (finalizeRecording = true) => {
    const recorder = mediaRecorderRef.current;
    mediaRecorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      if (!finalizeRecording) {
        recorder.onstop = null;
      }
      try {
        if (typeof recorder.requestData === 'function') recorder.requestData();
        recorder.stop();
      } catch {
        // ignore
      }
    } else if (recordCtxRef.current) {
      recordCtxRef.current.close().catch(() => undefined);
      recordCtxRef.current = null;
    }
    recordingStartedRef.current = false;

    const conv = conversationRef.current;
    conversationRef.current = null;
    if (conv) {
      try {
        await conv.disconnect();
      } catch {
        // ignore
      }
    }
  };

  const startNuanceInterview = async () => {
    setErrorMsg(null);
    setTranscript([]);
    setElapsedSec(0);
    setUploadStatus('idle');
    setUploadError(null);
    setSavedCloudUrl(null);
    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl);
      setRecordingUrl(null);
    }
    recordingStartedRef.current = false;
    setCallState('connecting');
    setStatusLabel(`Preparing ${personaName} (Nuance AI Video Persona)...`);

    try {
      const conversation = createNuanceConversation({
        token: async () => {
          const res = await apiFetch('/api/v1/nuance/session-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userUid,
              interviewId: linkedInterview.id,
              personaId,
              role: linkedInterview.jobTitle,
              companyName: linkedInterview.companyName,
              candidateName,
            }),
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.ok || !json?.token) {
            throw new Error(json?.error || `Failed to mint Nuance session token (${res.status})`);
          }
          return String(json.token);
        },
      });
      conversationRef.current = conversation;

      conversation.onChange((event) => {
        if (event.type === 'avatar-preparing') {
          setStatusLabel(`Warming up ${personaName}'s video stream...`);
        }
        if (event.type === 'tracks-changed') {
          if (avatarVideoRef.current) {
            conversation.avatar.videoTrack?.attach(avatarVideoRef.current);
          }
          if (avatarAudioRef.current) {
            conversation.avatar.audioTrack?.attach(avatarAudioRef.current);
          }
          if (userVideoRef.current && (conversation.user as any)?.videoTrack) {
            (conversation.user as any).videoTrack.attach(userVideoRef.current);
          }
          tryStartRecording(conversation);
        }
        if (event.type === 'avatar-presented') {
          setCallState('live');
          setStatusLabel(`${personaName} is live`);
          if (avatarVideoRef.current) {
            conversation.avatar.videoTrack?.attach(avatarVideoRef.current);
          }
          if (avatarAudioRef.current) {
            conversation.avatar.audioTrack?.attach(avatarAudioRef.current);
          }
          tryStartRecording(conversation);
          void conversation.sendInterfaceEvent({
            type: 'response.create',
            response: {
              instructions: `Greet ${candidateName} warmly by name, welcome them to the ${linkedInterview.jobTitle} interview with ${linkedInterview.companyName}, and ask the first employer interview question.`,
            },
          });
        }
        if (event.type === 'session-ended') {
          void disconnectNuance(true);
          setCallState('ended');
          setStatusLabel('Interview ended');
        }
      });

      conversation.onInterfaceEvent((event) => {
        const type = String(event.type || '');
        if (type === 'session.output_transcript.delta' && event.delta) {
          appendTranscript('ai', String(event.delta));
        } else if (
          (type === 'session.input_transcript.completed' || type === 'session.input_transcript.delta') &&
          (event.transcript || event.delta)
        ) {
          appendTranscript('user', String(event.transcript || event.delta));
        }
      });

      await conversation.connect();
      setCallState('live');
      setStatusLabel(`${personaName} is live`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not start Nuance AI interview.');
      await disconnectNuance(false);
      setCallState('idle');
      setStatusLabel('Ready to join');
    }
  };

  const endNuanceInterview = async () => {
    await disconnectNuance(true);
    setCallState('ended');
  };

  const toggleMic = async () => {
    const next = !micMuted;
    setMicMuted(next);
    const conv = conversationRef.current;
    if (conv) {
      try {
        if (next) {
          await (conv.user as any)?.muteAudio?.();
        } else {
          await (conv.user as any)?.unmuteAudio?.();
        }
      } catch {
        // ignore
      }
    }
  };

  const toggleCamera = async () => {
    const next = !cameraOn;
    setCameraOn(next);
    const conv = conversationRef.current;
    if (conv) {
      try {
        if (next) {
          await (conv.user as any)?.enableVideo?.();
        } else {
          await (conv.user as any)?.disableVideo?.();
        }
      } catch {
        // ignore
      }
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const copyTranscript = () => {
    const text = transcript
      .map((t) => `[${t.timestamp}] ${t.speaker === 'ai' ? `${personaName} (Nuance AI)` : 'You'}: ${t.text}`)
      .join('\n');
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedTranscript(true);
      setTimeout(() => setCopiedTranscript(false), 2000);
    });
  };

  return (
    <div
      style={{
        marginBottom: '16px',
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
              <span className="text-sm font-extrabold text-white">Nexora Nuance AI Video Interview</span>
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
                {callState === 'live' ? `● LIVE • ${formatTimer(elapsedSec)}` : 'NUANCE VIDEO PERSONA'}
              </span>
              {callState === 'live' && (
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
              Photorealistic full-duplex AI video interviewer — natural eye contact, interruptions &amp; auto Firebase recording.
            </div>
          </div>
        </div>
      </div>

      {/* Pre-call / Post-call Body */}
      {(callState === 'idle' || callState === 'ended') && (
        <div style={{ padding: '18px' }}>
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
                <strong>{linkedInterview.jobTitle}</strong> — {linkedInterview.companyName} (Nuance AI)
                {linkedInterview.interviewDate ? (
                  <span style={{ color: '#94a3b8', marginLeft: '8px', fontSize: '11.5px' }}>
                    • {linkedInterview.interviewDate} at {linkedInterview.interviewTime} ({linkedInterview.timezone || 'UTC'})
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: '11.5px', color: '#a7f3d0', marginTop: '3px' }}>
                Your employer&apos;s interview questions are loaded into {personaName}, and the video automatically saves to Firebase on End Call.
              </div>
              {linkedInterview.instructions && (
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                  Note: {linkedInterview.instructions}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
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

          <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <label style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 600 }}>AI Persona:</label>
                <select
                  value={personaId}
                  onChange={(e) => setPersonaId(e.target.value as 'sonia' | 'sam' | 'mira')}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '8px',
                    background: '#182229',
                    border: '1px solid #2a3942',
                    color: '#e9edef',
                    fontSize: '12px',
                  }}
                >
                  <option value="sonia">Sonia (Executive Female)</option>
                  <option value="mira">Mira (Warm Female)</option>
                  <option value="sam">Sam (Professional Default)</option>
                </select>
              </div>
            </div>
            {(() => {
              const totalAllowed = 1 + (linkedInterview.maxRetakes ?? 0);
              const used =
                linkedInterview.attemptsUsed ?? (linkedInterview.status === 'COMPLETED' ? 1 : 0);
              const remaining = Math.max(0, totalAllowed - used);
              if (remaining <= 0) {
                return (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '9px 16px',
                      borderRadius: '12px',
                      background: 'rgba(16, 185, 129, 0.14)',
                      border: '1px solid rgba(16, 185, 129, 0.35)',
                      color: '#6ee7b7',
                      fontSize: '12.5px',
                      fontWeight: 700,
                    }}
                  >
                    ✓ Interview Completed (No retakes remaining)
                  </span>
                );
              }
              return (
                <button
                  type="button"
                  onClick={startNuanceInterview}
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
                  <span>
                    {used > 0 ? `Retake Nuance AI Interview (${remaining} left)` : 'Join Nuance AI Interview'}
                  </span>
                </button>
              );
            })()}
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
                marginTop: '12px',
              }}
            >
              {errorMsg}
            </div>
          )}

          {/* Post-call Submission Confirmation (recordings go to employer, not shown to candidate) */}
          {callState === 'ended' && (uploadStatus !== 'idle' || transcript.length > 0) && (
            <div
              style={{
                marginTop: '16px',
                padding: '14px',
                borderRadius: '12px',
                background: '#182229',
                border: '1px solid #2a3942',
              }}
            >
              <span className="text-xs font-bold text-purple-300">
                {uploadStatus === 'uploading'
                  ? `Submitting your interview (${formatTimer(elapsedSec)}) to ${linkedInterview.companyName}...`
                  : uploadStatus === 'error'
                    ? `Could not submit recording: ${uploadError}`
                    : `✓ Interview completed (${formatTimer(elapsedSec)}) and securely sent to ${linkedInterview.companyName} for review.`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Active Nuance Video Call Stage */}
      {(callState === 'connecting' || callState === 'live') && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.35fr) minmax(260px, 0.85fr)',
            height: '460px',
            overflow: 'hidden',
          }}
        >
          {/* Left: Full-bleed Nuance AI Persona Video + PiP Candidate Webcam */}
          <div
            style={{
              position: 'relative',
              background: '#050a0e',
              borderRight: '1px solid rgba(255, 255, 255, 0.08)',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <video
              ref={avatarVideoRef}
              autoPlay
              playsInline
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                background: '#050a0e',
              }}
            />
            <audio ref={avatarAudioRef} autoPlay />

            {callState === 'connecting' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(5, 10, 14, 0.82)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  padding: '20px',
                  textAlign: 'center',
                }}
              >
                <Sparkles className="w-8 h-8 text-purple-400" />
                <div className="text-sm font-bold text-white">{statusLabel}</div>
                <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                  Connecting to Nuance Live WebRTC room...
                </div>
              </div>
            )}

            {/* Candidate Webcam Picture-in-Picture */}
            <div
              style={{
                position: 'absolute',
                top: '14px',
                right: '14px',
                width: '140px',
                height: '84px',
                borderRadius: '12px',
                overflow: 'hidden',
                background: '#182229',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <video
                ref={userVideoRef}
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
                background: 'rgba(17, 27, 33, 0.92)',
                border: '1px solid rgba(255, 255, 255, 0.14)',
              }}
            >
              <button
                type="button"
                onClick={() => void toggleMic()}
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
                onClick={() => void toggleCamera()}
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
                onClick={() => void endNuanceInterview()}
                title="End Nuance AI interview"
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

          {/* Right: Live Transcript */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              background: '#0b141a',
              height: '460px',
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
              <Volume2 className="w-3.5 h-3.5 text-purple-400" />
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
                  Live captions will appear here as {personaName} and you speak...
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
                        color: item.speaker === 'ai' ? '#d8b4fe' : '#a7f3d0',
                        marginBottom: '2px',
                      }}
                    >
                      {item.speaker === 'ai' ? personaName : 'You'} • {item.timestamp}
                    </div>
                    {item.text}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
