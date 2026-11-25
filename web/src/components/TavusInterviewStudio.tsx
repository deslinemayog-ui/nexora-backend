import React, { useEffect, useRef, useState } from 'react';
import DailyIframe, { type DailyCall, type DailyEventObjectParticipant, type DailyEventObjectTrack } from '@daily-co/daily-js';
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

const TAVUS_REPLICAS = [
  { id: 'r8fbdfb197a8', name: 'Audrey', label: 'Audrey (Real Human • Executive Office)' },
  { id: 'r7473bbefa5d', name: 'Shane', label: 'Shane (Real Human • Technical Lead)' },
  { id: 'r12de861fc9f', name: 'Emily', label: 'Emily (Real Human • Senior Recruiter)' },
  { id: 'r4067604db72', name: 'Lucy', label: 'Lucy (Real Human • HR Specialist)' },
  { id: 'r4b03c679d42', name: 'Joyce', label: 'Joyce (Real Human • Interviewer)' },
];

interface TranscriptEntry {
  id: string;
  speaker: 'ai' | 'user';
  text: string;
  timestamp: string;
}

interface TavusInterviewStudioProps {
  userUid: string;
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
  candidateName?: string;
  linkedInterview: LinkedScheduledInterview;
  onRecordingSaved?: (recording: any) => void;
}

export const TavusInterviewStudio: React.FC<TavusInterviewStudioProps> = ({
  userUid,
  apiFetch,
  candidateName = 'Candidate',
  linkedInterview,
  onRecordingSaved,
}) => {
  const [replicaId, setReplicaId] = useState(TAVUS_REPLICAS[0].id);
  const [callState, setCallState] = useState<'idle' | 'connecting' | 'live' | 'ended'>('idle');
  const [statusLabel, setStatusLabel] = useState('Ready to join');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [replicaVideoReady, setReplicaVideoReady] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [recordingHasVideo, setRecordingHasVideo] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'saved' | 'error'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [savedCloudUrl, setSavedCloudUrl] = useState<string | null>(null);

  const callObjRef = useRef<DailyCall | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const replicaVideoRef = useRef<HTMLVideoElement | null>(null);
  const replicaAudioRef = useRef<HTMLAudioElement | null>(null);
  const userVideoRef = useRef<HTMLVideoElement | null>(null);
  const transcriptContainerRef = useRef<HTMLDivElement | null>(null);

  // Track refs for clean white-label rendering & dual-voice Firebase recording
  const remoteVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const remoteAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const localVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const localAudioTrackRef = useRef<MediaStreamTrack | null>(null);

  const recordCtxRef = useRef<AudioContext | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStartedRef = useRef(false);
  const elapsedSecRef = useRef(0);
  const transcriptRef = useRef<TranscriptEntry[]>([]);

  const selectedReplica = TAVUS_REPLICAS.find((r) => r.id === replicaId) || TAVUS_REPLICAS[0];

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
      void teardownCall(false);
    };
  }, []);

  const appendTranscript = (speaker: 'ai' | 'user', text: string) => {
    const clean = String(text || '').trim();
    if (!clean) return;
    setTranscript((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        speaker,
        text: clean,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  const attachTracksToElements = () => {
    if (replicaVideoRef.current && remoteVideoTrackRef.current) {
      const currentStream = replicaVideoRef.current.srcObject as MediaStream | null;
      if (!currentStream || currentStream.getVideoTracks()[0]?.id !== remoteVideoTrackRef.current.id) {
        replicaVideoRef.current.srcObject = new MediaStream([remoteVideoTrackRef.current]);
        replicaVideoRef.current.play().catch(() => undefined);
      }
      setReplicaVideoReady(true);
    }
    if (replicaAudioRef.current && remoteAudioTrackRef.current) {
      const currentStream = replicaAudioRef.current.srcObject as MediaStream | null;
      if (!currentStream || currentStream.getAudioTracks()[0]?.id !== remoteAudioTrackRef.current.id) {
        replicaAudioRef.current.srcObject = new MediaStream([remoteAudioTrackRef.current]);
        replicaAudioRef.current.play().catch(() => undefined);
      }
    }
    if (userVideoRef.current && localVideoTrackRef.current) {
      const currentStream = userVideoRef.current.srcObject as MediaStream | null;
      if (!currentStream || currentStream.getVideoTracks()[0]?.id !== localVideoTrackRef.current.id) {
        userVideoRef.current.srcObject = new MediaStream([localVideoTrackRef.current]);
        userVideoRef.current.play().catch(() => undefined);
      }
    }
  };

  const tryStartRecording = () => {
    if (recordingStartedRef.current || typeof MediaRecorder === 'undefined') return;
    const remoteAudio = remoteAudioTrackRef.current;
    const localAudio = localAudioTrackRef.current;
    if (!remoteAudio && !localAudio) return;

    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioCtx();
      recordCtxRef.current = ctx;
      const dest = ctx.createMediaStreamDestination();

      if (remoteAudio) {
        const s1 = ctx.createMediaStreamSource(new MediaStream([remoteAudio]));
        s1.connect(dest);
      }
      if (localAudio) {
        const s2 = ctx.createMediaStreamSource(new MediaStream([localAudio]));
        s2.connect(dest);
      }

      const videoTrack = localVideoTrackRef.current || remoteVideoTrackRef.current;
      const hasVideo = Boolean(videoTrack);
      const tracks: MediaStreamTrack[] = [
        ...(videoTrack ? [videoTrack] : []),
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
        if (ev.data && ev.data.size > 0) recordedChunksRef.current.push(ev.data);
      };

      recorder.onstop = () => {
        const chunks = [...recordedChunksRef.current];
        releaseDailyAndAudio();
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
                interviewType: 'Tavus Human AI Video Interview',
                interviewProvider: 'TAVUS',
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
      // non-fatal
    }
  };

  const releaseDailyAndAudio = () => {
    if (recordCtxRef.current) {
      recordCtxRef.current.close().catch(() => undefined);
      recordCtxRef.current = null;
    }
    recordingStartedRef.current = false;
    remoteVideoTrackRef.current = null;
    remoteAudioTrackRef.current = null;
    localVideoTrackRef.current = null;
    localAudioTrackRef.current = null;
    setReplicaVideoReady(false);

    const call = callObjRef.current;
    callObjRef.current = null;
    if (call) {
      call.leave().catch(() => undefined).finally(() => {
        call.destroy().catch(() => undefined);
      });
    }
  };

  const teardownCall = async (finalizeRecording = true) => {
    const cid = conversationIdRef.current;
    conversationIdRef.current = null;
    if (cid) {
      void apiFetch(`/api/v1/tavus/conversations/${encodeURIComponent(cid)}/end`, {
        method: 'POST',
      }).catch(() => undefined);
    }

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
        releaseDailyAndAudio();
      } else {
        try {
          if (typeof recorder.requestData === 'function') recorder.requestData();
          recorder.stop();
        } catch {
          releaseDailyAndAudio();
        }
      }
      return;
    }

    releaseDailyAndAudio();
  };

  const startTavusInterview = async () => {
    setErrorMsg(null);
    setTranscript([]);
    setElapsedSec(0);
    setReplicaVideoReady(false);
    setUploadStatus('idle');
    setUploadError(null);
    setSavedCloudUrl(null);
    if (recordingUrl) {
      URL.revokeObjectURL(recordingUrl);
      setRecordingUrl(null);
    }
    setCallState('connecting');
    setStatusLabel(`Preparing ${selectedReplica.name}...`);

    try {
      const res = await apiFetch('/api/v1/tavus/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userUid,
          interviewId: linkedInterview.id,
          replicaId: selectedReplica.id,
          replicaName: selectedReplica.name,
          role: linkedInterview.jobTitle,
          companyName: linkedInterview.companyName,
          candidateName,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok || !json?.conversationUrl) {
        throw new Error(json?.error || `Could not start Tavus interview (${res.status})`);
      }

      conversationIdRef.current = json.conversationId;
      setStatusLabel(`Connecting to ${selectedReplica.name}...`);

      // Join headlessly with Daily Call Object — 100% white-label Nexora UI (zero Daily/Tavus UI!)
      const call = DailyIframe.createCallObject({
        audioSource: true,
        videoSource: true,
      });
      callObjRef.current = call;

      const syncParticipant = (p: any) => {
        if (!p) return;
        const vTrack = p.tracks?.video?.persistentTrack || p.tracks?.video?.track || null;
        const aTrack = p.tracks?.audio?.persistentTrack || p.tracks?.audio?.track || null;
        if (p.local) {
          if (vTrack) localVideoTrackRef.current = vTrack;
          if (aTrack) localAudioTrackRef.current = aTrack;
        } else {
          if (vTrack) remoteVideoTrackRef.current = vTrack;
          if (aTrack) remoteAudioTrackRef.current = aTrack;
        }
        attachTracksToElements();
        if (remoteAudioTrackRef.current && localAudioTrackRef.current) {
          tryStartRecording();
        }
      };

      call.on('track-started', (ev: DailyEventObjectTrack) => {
        syncParticipant(ev.participant);
      });

      call.on('participant-joined', (ev: DailyEventObjectParticipant) => {
        syncParticipant(ev.participant);
      });

      call.on('participant-updated', (ev: DailyEventObjectParticipant) => {
        syncParticipant(ev.participant);
      });

      call.on('app-message', (ev: any) => {
        const data = ev?.data;
        if (!data || typeof data !== 'object') return;
        if (data.event_type === 'conversation.utterance' && data.properties?.speech) {
          const role = data.properties?.role === 'replica' ? 'ai' : 'user';
          appendTranscript(role, String(data.properties.speech));
        }
      });

      call.on('left-meeting', () => {
        if (callObjRef.current) {
          void teardownCall(true);
          setCallState('ended');
        }
      });

      call.on('error', (ev: any) => {
        setErrorMsg(ev?.errorMsg || 'Connection interrupted.');
      });

      await call.join({
        url: json.conversationUrl,
        userName: candidateName || 'Candidate',
      });

      setCallState('live');
      setStatusLabel(`${selectedReplica.name} is live`);

      // Sync any already-present participants immediately
      const participants = call.participants();
      Object.values(participants).forEach(syncParticipant);
      // Fallback: start recording even if only local audio is present after 3s
      window.setTimeout(() => tryStartRecording(), 3000);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to join Tavus Human AI interview.');
      await teardownCall(false);
      setCallState('idle');
      setStatusLabel('Ready to join');
    }
  };

  const endTavusInterview = async () => {
    await teardownCall(true);
    setCallState('ended');
  };

  const toggleMic = () => {
    const nextMuted = !micMuted;
    setMicMuted(nextMuted);
    callObjRef.current?.setLocalAudio(!nextMuted);
  };

  const toggleCamera = () => {
    const nextOn = !cameraOn;
    setCameraOn(nextOn);
    callObjRef.current?.setLocalVideo(nextOn);
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const copyTranscript = () => {
    const text = transcript
      .map((t) => `[${t.timestamp}] ${t.speaker === 'ai' ? `${selectedReplica.name} (AI Interviewer)` : 'You'}: ${t.text}`)
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
            <Video className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-extrabold text-white">Nexora Photorealistic Human AI Interview</span>
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
                {callState === 'live' ? `● LIVE • ${formatTimer(elapsedSec)}` : 'TAVUS HUMAN VIDEO'}
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
              Lifelike real human interviewer inside Nexora Studio — natural eye contact, live captions &amp; auto Firebase recording.
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
                <strong>{linkedInterview.jobTitle}</strong> — {linkedInterview.companyName} (Tavus Human AI)
                {linkedInterview.interviewDate ? (
                  <span style={{ color: '#94a3b8', marginLeft: '8px', fontSize: '11.5px' }}>
                    • {linkedInterview.interviewDate} at {linkedInterview.interviewTime} ({linkedInterview.timezone || 'UTC'})
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: '11.5px', color: '#a7f3d0', marginTop: '3px' }}>
                Your employer&apos;s interview questions are loaded into {selectedReplica.name}, and both voices + video save automatically to Firebase on End Call.
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

          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <label style={{ fontSize: '11.5px', color: '#94a3b8', fontWeight: 600 }}>Human Interviewer:</label>
              <select
                value={replicaId}
                onChange={(e) => setReplicaId(e.target.value)}
                style={{
                  padding: '6px 10px',
                  borderRadius: '8px',
                  background: '#182229',
                  border: '1px solid #2a3942',
                  color: '#e9edef',
                  fontSize: '12px',
                }}
              >
                {TAVUS_REPLICAS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
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
                  onClick={() => void startTavusInterview()}
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
                    {used > 0 ? `Retake Human AI Interview (${remaining} left)` : 'Join Human AI Interview'}
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
              <span className="text-xs font-bold text-sky-300">
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

      {/* White-Label Nexora Studio Video Stage (zero Daily/Tavus UI!) */}
      {(callState === 'connecting' || callState === 'live') && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.35fr) minmax(260px, 0.85fr)',
            height: '460px',
            overflow: 'hidden',
          }}
        >
          {/* Left: Full-bleed Real Human Interviewer Video + PiP Candidate Webcam + Our Own Controls */}
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
              ref={replicaVideoRef}
              autoPlay
              playsInline
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                background: '#050a0e',
              }}
            />
            <audio ref={replicaAudioRef} autoPlay />

            {(callState === 'connecting' || !replicaVideoReady) && (
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
                <Sparkles className="w-8 h-8 text-sky-400" />
                <div className="text-sm font-bold text-white">{statusLabel}</div>
                <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                  Waiting for {selectedReplica.name} to join your private Nexora interview room...
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

            {/* White-Label Nexora Call Controls */}
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
                onClick={toggleMic}
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
                onClick={toggleCamera}
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
                onClick={() => void endTavusInterview()}
                title="End interview and save recording"
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
              <Volume2 className="w-3.5 h-3.5 text-sky-400" />
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
                  Live captions will appear here as {selectedReplica.name} and you speak...
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
                        color: item.speaker === 'ai' ? '#7dd3fc' : '#a7f3d0',
                        marginBottom: '2px',
                      }}
                    >
                      {item.speaker === 'ai' ? selectedReplica.name : 'You'} • {item.timestamp}
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
