import React, { useEffect, useState } from 'react';
import { CalendarDays, Video, Phone, MapPin, ArrowLeft, Mail, MessageSquare, ExternalLink, Download } from 'lucide-react';
import { LiveInterviewStudio } from './LiveInterviewStudio';
import { NuanceInterviewStudio } from './NuanceInterviewStudio';
import { TavusInterviewStudio } from './TavusInterviewStudio';

export interface EmailInterviewItem {
  id: string;
  receiptId?: string;
  companyName: string;
  subject: string;
  summary: string;
  receivedAt: string;
  from: string;
  convId?: string;
  task?: any;
}

interface InterviewsViewProps {
  userUid: string;
  candidateEmail?: string;
  receiptIds?: string[];
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  emailInterviews?: EmailInterviewItem[];
  onOpenSubmissionChat?: (item: EmailInterviewItem) => void;
}

export const InterviewsView: React.FC<InterviewsViewProps> = ({
  userUid,
  candidateEmail,
  receiptIds = [],
  apiFetch,
  onClose,
  emailInterviews = [],
  onOpenSubmissionChat,
}) => {
  const [interviews, setInterviews] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'scheduled' | 'completed' | 'detected' | 'cancelled'>('scheduled');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const emailParam = candidateEmail ? `&email=${encodeURIComponent(candidateEmail)}` : '';
        const refParam = receiptIds.length > 0 ? `&receiptIds=${encodeURIComponent(receiptIds.join(','))}` : '';
        const ivRes = await apiFetch(
          `/api/v1/interviews?userUid=${encodeURIComponent(userUid)}${emailParam}${refParam}`,
        );
        const ivJson = await ivRes.json().catch(() => null);
        if (ivJson?.ok) setInterviews(ivJson.data || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [userUid, candidateEmail, receiptIds.join(',')]);

  const activeScheduled = interviews.filter(
    (iv) => iv.status !== 'CANCELLED' && iv.status !== 'COMPLETED',
  );
  const completedInterviews = interviews.filter((iv) => iv.status === 'COMPLETED');
  const cancelledInterviews = interviews.filter((iv) => iv.status === 'CANCELLED');
  const totalCount = emailInterviews.length + activeScheduled.length + completedInterviews.length;

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px', maxWidth: '960px', margin: '0 auto', width: '100%' }}>
      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h2 className="text-xl font-extrabold text-white m-0">
            Interviews {totalCount > 0 ? `(${totalCount})` : ''}
          </h2>
          <p className="text-xs text-slate-400 m-0 mt-1">
            Interview invitations detected from employer email replies and scheduled by companies/agents.
          </p>
        </div>
        <button onClick={onClose} className="chat-action-btn">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Chat</span>
        </button>
      </div>

      {/* 2-Tab Navigation: Scheduled Interviews vs Detected from Emails */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '20px',
          padding: '4px',
          borderRadius: '12px',
          background: 'rgba(17, 27, 33, 0.85)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          width: 'fit-content',
          flexWrap: 'wrap',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('scheduled')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: '9px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '12.5px',
            fontWeight: 700,
            background: activeTab === 'scheduled' ? '#005c4b' : 'transparent',
            color: activeTab === 'scheduled' ? '#ffffff' : '#94a3b8',
          }}
        >
          <CalendarDays className="w-3.5 h-3.5" />
          <span>Scheduled Interviews ({activeScheduled.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('completed')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: '9px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '12.5px',
            fontWeight: 700,
            background: activeTab === 'completed' ? '#005c4b' : 'transparent',
            color: activeTab === 'completed' ? '#ffffff' : '#94a3b8',
          }}
        >
          <span>Completed ({completedInterviews.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('detected')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: '9px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '12.5px',
            fontWeight: 700,
            background: activeTab === 'detected' ? '#005c4b' : 'transparent',
            color: activeTab === 'detected' ? '#ffffff' : '#94a3b8',
          }}
        >
          <Mail className="w-3.5 h-3.5" />
          <span>Detected from Emails ({emailInterviews.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('cancelled')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: '9px',
            border: 'none',
            cursor: 'pointer',
            fontSize: '12.5px',
            fontWeight: 700,
            background: activeTab === 'cancelled' ? '#005c4b' : 'transparent',
            color: activeTab === 'cancelled' ? '#ffffff' : '#94a3b8',
          }}
        >
          <span>Cancelled ({cancelledInterviews.length})</span>
        </button>
      </div>

      {/* TAB 2: Email-Detected Interview Invitations */}
      {activeTab === 'detected' && (
        <div className="mb-6">
          {emailInterviews.length === 0 ? (
            <div className="p-6 rounded-xl bg-[#111b21] border border-[#2a3942] text-center text-xs text-slate-400">
              No interview invitations detected in your email replies yet.
            </div>
          ) : (
            <div className="grid gap-3">
              {emailInterviews.map((item) => (
                <div
                  key={item.id}
                  onClick={() => onOpenSubmissionChat?.(item)}
                  style={{
                    padding: '16px',
                    borderRadius: '14px',
                    background: 'linear-gradient(145deg, #0f172a 0%, #111b21 60%, #0b141a 100%)',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    cursor: onOpenSubmissionChat ? 'pointer' : 'default',
                  }}
                >
                  <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-white">{item.companyName}</span>
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: 'rgba(16, 185, 129, 0.2)',
                          color: '#6ee7b7',
                        }}
                      >
                        Email Invite
                      </span>
                    </div>
                    <div className="text-xs text-slate-300 mt-1">{item.subject}</div>
                    {item.summary && (
                      <div className="text-xs text-slate-400 mt-1">{item.summary}</div>
                    )}
                    <div className="text-[11px] text-slate-400 mt-1">
                      From: {item.from} • {new Date(item.receivedAt).toLocaleString()}
                    </div>
                  </div>
                  {onOpenSubmissionChat && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenSubmissionChat(item);
                      }}
                      className="chat-action-btn primary"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Open Submission Chat</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 1, COMPLETED & CANCELLED: Company / Agent Interviews */}
      {(activeTab === 'scheduled' || activeTab === 'completed' || activeTab === 'cancelled') && (() => {
        const list =
          activeTab === 'completed'
            ? completedInterviews
            : activeTab === 'cancelled'
              ? cancelledInterviews
              : activeScheduled;
        if (loading) {
          return <div className="text-sm text-slate-400">Loading interviews...</div>;
        }
        if (list.length === 0) {
          return (
            <div className="p-6 rounded-xl bg-[#111b21] border border-[#2a3942] text-center text-xs text-slate-400">
              {activeTab === 'completed'
                ? 'No completed interviews yet.'
                : activeTab === 'cancelled'
                  ? 'No cancelled interviews.'
                  : 'No interviews scheduled yet. Complete your assignments and apply to open opportunities to receive scheduled interviews.'}
            </div>
          );
        }
        return (
        <div>
          <div className="grid gap-3">
            {list.map((item) => {
              // Tavus CVI Photorealistic Human AI interviews render directly as the Tavus Video Studio card
              if (item.interviewProvider === 'TAVUS' && item.status !== 'CANCELLED') {
                return (
                  <TavusInterviewStudio
                    key={item.id}
                    userUid={userUid}
                    apiFetch={apiFetch}
                    candidateName={candidateEmail ? candidateEmail.split('@')[0] : 'Candidate'}
                    linkedInterview={{
                      id: item.id,
                      jobTitle: item.jobTitle,
                      companyName: item.companyName,
                      interviewProvider: item.interviewProvider,
                      interviewDate: item.interviewDate,
                      interviewTime: item.interviewTime,
                      timezone: item.timezone,
                      status: item.status,
                      instructions: item.instructions,
                      recordingUrl: item.recordingUrl,
                      maxRetakes: item.maxRetakes ?? 0,
                      attemptsUsed: item.attemptsUsed ?? (item.status === 'COMPLETED' ? 1 : 0),
                    }}
                    onRecordingSaved={(rec) => {
                      if (rec) {
                        setInterviews((prev) =>
                          prev.map((iv) =>
                            iv.id === item.id
                              ? {
                                  ...iv,
                                  status: 'COMPLETED',
                                  attemptsUsed: (iv.attemptsUsed ?? 0) + 1,
                                  billedMinutes: rec.billedMinutes,
                                }
                              : iv,
                          ),
                        );
                      }
                    }}
                  />
                );
              }

              // Nuance AI Video Persona interviews render directly as the Nuance Video Studio card
              if (item.interviewProvider === 'NUANCE' && item.status !== 'CANCELLED') {
                return (
                  <NuanceInterviewStudio
                    key={item.id}
                    userUid={userUid}
                    apiFetch={apiFetch}
                    candidateName={candidateEmail ? candidateEmail.split('@')[0] : 'Candidate'}
                    linkedInterview={{
                      id: item.id,
                      jobTitle: item.jobTitle,
                      companyName: item.companyName,
                      interviewProvider: item.interviewProvider,
                      interviewDate: item.interviewDate,
                      interviewTime: item.interviewTime,
                      timezone: item.timezone,
                      status: item.status,
                      instructions: item.instructions,
                      recordingUrl: item.recordingUrl,
                      maxRetakes: item.maxRetakes ?? 0,
                      attemptsUsed: item.attemptsUsed ?? (item.status === 'COMPLETED' ? 1 : 0),
                    }}
                    onRecordingSaved={(rec) => {
                      if (rec) {
                        setInterviews((prev) =>
                          prev.map((iv) =>
                            iv.id === item.id
                              ? {
                                  ...iv,
                                  status: 'COMPLETED',
                                  attemptsUsed: (iv.attemptsUsed ?? 0) + 1,
                                  billedMinutes: rec.billedMinutes,
                                }
                              : iv,
                          ),
                        );
                      }
                    }}
                  />
                );
              }

              // Google Live AI interviews render directly as the Live AI Studio card
              if (item.interviewProvider === 'GOOGLE_LIVE' && item.status !== 'CANCELLED') {
                return (
                  <LiveInterviewStudio
                    key={item.id}
                    userUid={userUid}
                    apiFetch={apiFetch}
                    candidateName={candidateEmail ? candidateEmail.split('@')[0] : 'Candidate'}
                    linkedInterview={{
                      id: item.id,
                      jobTitle: item.jobTitle,
                      companyName: item.companyName,
                      interviewProvider: item.interviewProvider,
                      interviewDate: item.interviewDate,
                      interviewTime: item.interviewTime,
                      timezone: item.timezone,
                      status: item.status,
                      instructions: item.instructions,
                      recordingUrl: item.recordingUrl,
                      maxRetakes: item.maxRetakes ?? 0,
                      attemptsUsed: item.attemptsUsed ?? (item.status === 'COMPLETED' ? 1 : 0),
                    }}
                    onRecordingSaved={(rec) => {
                      if (rec) {
                        setInterviews((prev) =>
                          prev.map((iv) =>
                            iv.id === item.id
                              ? {
                                  ...iv,
                                  status: 'COMPLETED',
                                  attemptsUsed: (iv.attemptsUsed ?? 0) + 1,
                                  billedMinutes: rec.billedMinutes,
                                }
                              : iv,
                          ),
                        );
                      }
                    }}
                  />
                );
              }

              const Icon =
                item.interviewType === 'TELEPHONE'
                  ? Phone
                  : item.interviewType === 'IN_PERSON'
                    ? MapPin
                    : Video;
              const isCancelled = item.status === 'CANCELLED';
              const headerTitle =
                item.interviewType === 'TELEPHONE'
                  ? 'Telephone Interview'
                  : item.interviewType === 'IN_PERSON'
                    ? 'In-Person Interview'
                    : 'External Video Interview';
              const headerBadge =
                item.interviewType === 'TELEPHONE'
                  ? 'TELEPHONE'
                  : item.interviewType === 'IN_PERSON'
                    ? 'IN PERSON'
                    : 'EXTERNAL MEETING';

              return (
                <div
                  key={item.id}
                  style={{
                    borderRadius: '18px',
                    background: 'linear-gradient(145deg, #0f172a 0%, #111b21 60%, #0b141a 100%)',
                    border: '1px solid rgba(16, 185, 129, 0.35)',
                    overflow: 'hidden',
                    boxShadow: '0 12px 32px rgba(0, 0, 0, 0.35)',
                    opacity: isCancelled ? 0.85 : 1,
                  }}
                >
                  {/* Matching Header Strip */}
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
                          background: isCancelled
                            ? 'linear-gradient(135deg, #7f1d1d, #dc2626)'
                            : 'linear-gradient(135deg, #005c4b, #10b981)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-extrabold text-white">{headerTitle}</span>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 700,
                              padding: '2px 8px',
                              borderRadius: '999px',
                              background: isCancelled
                                ? 'rgba(239, 68, 68, 0.18)'
                                : 'rgba(56, 189, 248, 0.18)',
                              color: isCancelled ? '#fca5a5' : '#7dd3fc',
                            }}
                          >
                            {headerBadge}
                          </span>
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                          {isCancelled
                            ? `This interview with ${item.companyName} has been cancelled.`
                            : `Scheduled with ${item.companyName} — join directly or save it to your calendar.`}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Matching Inner Body */}
                  <div style={{ padding: '18px' }}>
                    <div
                      style={{
                        padding: '12px 14px',
                        borderRadius: '12px',
                        background: isCancelled
                          ? 'rgba(239, 68, 68, 0.08)'
                          : 'rgba(16, 185, 129, 0.12)',
                        border: isCancelled
                          ? '1px solid rgba(239, 68, 68, 0.28)'
                          : '1px solid rgba(16, 185, 129, 0.35)',
                        marginBottom: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ fontSize: '12.5px', color: isCancelled ? '#fecaca' : '#d1fae5' }}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <strong>{item.jobTitle}</strong>
                          <span>— {item.companyName}</span>
                          <span style={{ color: '#94a3b8', fontSize: '11.5px' }}>
                            • {item.interviewDate} at {item.interviewTime} ({item.timezone})
                          </span>
                          {item.status === 'INVITED' && (
                            <span
                              className="text-[10.5px] px-2.5 py-0.5 rounded-full font-bold"
                              style={{ background: 'rgba(245,158,11,0.2)', color: '#fcd34d' }}
                            >
                              Invited — Accept to Auto-Apply
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '11.5px', color: '#7dd3fc', marginTop: '3px', wordBreak: 'break-all' }}>
                          {item.locationOrLink}
                        </div>
                        {item.instructions && (
                          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                            Note: {item.instructions}
                          </div>
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: '10.5px',
                          fontWeight: 700,
                          padding: '3px 9px',
                          borderRadius: '999px',
                          background:
                            item.status === 'CANCELLED'
                              ? 'rgba(239,68,68,0.22)'
                              : item.status === 'COMPLETED'
                                ? 'rgba(16,185,129,0.22)'
                                : 'rgba(56,189,248,0.22)',
                          color:
                            item.status === 'CANCELLED'
                              ? '#fca5a5'
                              : item.status === 'COMPLETED'
                                ? '#6ee7b7'
                                : '#7dd3fc',
                        }}
                      >
                        {item.status}
                      </span>
                    </div>

                    {item.status === 'INVITED' && (
                      <div className="flex items-center gap-2 flex-wrap mb-3">
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await apiFetch(`/api/v1/interviews/${item.id}/respond`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ userUid, action: 'ACCEPT' }),
                            });
                            const json = await res.json().catch(() => null);
                            if (json?.ok) {
                              setInterviews((prev) =>
                                prev.map((iv) =>
                                  iv.id === item.id ? { ...iv, status: 'SCHEDULED', applicationId: json.data?.application?.id } : iv,
                                ),
                              );
                            }
                          }}
                          className="chat-action-btn primary"
                          style={{ fontSize: '12px', padding: '6px 12px' }}
                        >
                          Interested — Accept &amp; Auto-Apply
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const res = await apiFetch(`/api/v1/interviews/${item.id}/respond`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ userUid, action: 'DECLINE' }),
                            });
                            const json = await res.json().catch(() => null);
                            if (json?.ok) {
                              setInterviews((prev) =>
                                prev.map((iv) => (iv.id === item.id ? { ...iv, status: 'CANCELLED' } : iv)),
                              );
                            }
                          }}
                          className="chat-action-btn"
                          style={{ fontSize: '12px', padding: '6px 12px', color: '#fca5a5' }}
                        >
                          Decline
                        </button>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        {(() => {
                          const cleanDate = String(item.interviewDate || '').replace(/-/g, '');
                          const cleanTime = String(item.interviewTime || '10:00').replace(/:/g, '').padEnd(6, '0').slice(0, 6);
                          const startDt = `${cleanDate}T${cleanTime}`;
                          const startH = Number((item.interviewTime || '10:00').split(':')[0] || 10);
                          const startM = Number((item.interviewTime || '10:00').split(':')[1] || 0) + 45;
                          const endDt = `${cleanDate}T${String((startH + Math.floor(startM / 60)) % 24).padStart(2, '0')}${String(startM % 60).padStart(2, '0')}00`;
                          const gcalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(`Interview: ${item.jobTitle} — ${item.companyName}`)}&dates=${startDt}/${endDt}&ctz=${encodeURIComponent(item.timezone || 'Africa/Johannesburg')}&details=${encodeURIComponent(item.instructions || `Interview with ${item.companyName}`)}&location=${encodeURIComponent(item.locationOrLink || '')}`;
                          const downloadIcs = () => {
                            const ics = [
                              'BEGIN:VCALENDAR',
                              'VERSION:2.0',
                              'PRODID:-//Nexora AI//Interview//EN',
                              'BEGIN:VEVENT',
                              `UID:${item.id}@nexora.ai`,
                              `DTSTART:${startDt}`,
                              `DTEND:${endDt}`,
                              `SUMMARY:Interview: ${item.jobTitle} — ${item.companyName}`,
                              `DESCRIPTION:${(item.instructions || `Interview with ${item.companyName}`).replace(/\n/g, '\\n')}\\nLink/Location: ${item.locationOrLink || ''}`,
                              `LOCATION:${item.locationOrLink || ''}`,
                              'END:VEVENT',
                              'END:VCALENDAR',
                            ].join('\r\n');
                            const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `interview-${item.id}.ics`;
                            a.click();
                            URL.revokeObjectURL(url);
                          };
                          return (
                            <>
                              <a
                                href={gcalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="chat-action-btn"
                                style={{ textDecoration: 'none', fontSize: '11.5px', padding: '6px 12px' }}
                              >
                                <CalendarDays className="w-3.5 h-3.5 text-emerald-400" />
                                <span>Add to Google Calendar</span>
                              </a>
                              <button
                                type="button"
                                onClick={downloadIcs}
                                className="chat-action-btn"
                                style={{ fontSize: '11.5px', padding: '6px 12px' }}
                              >
                                <Download className="w-3.5 h-3.5 text-cyan-400" />
                                <span>Download .ics</span>
                              </button>
                            </>
                          );
                        })()}
                      </div>
                      {!isCancelled && /^https?:\/\//i.test(item.locationOrLink || '') && (
                        <a
                          href={item.locationOrLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '9px 18px',
                            borderRadius: '12px',
                            background: '#005c4b',
                            border: '1px solid rgba(37, 211, 102, 0.45)',
                            color: '#ffffff',
                            fontSize: '12.5px',
                            fontWeight: 700,
                            textDecoration: 'none',
                          }}
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-emerald-300" />
                          <span>Join Meeting</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        );
      })()}
    </div>
  );
};
