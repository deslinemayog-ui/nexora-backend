import React, { useEffect, useState } from 'react';
import { CalendarDays, Video, Phone, MapPin, ArrowLeft, Mail, MessageSquare, ExternalLink, Download } from 'lucide-react';

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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const emailParam = candidateEmail ? `&email=${encodeURIComponent(candidateEmail)}` : '';
        const refParam = receiptIds.length > 0 ? `&receiptIds=${encodeURIComponent(receiptIds.join(','))}` : '';
        const res = await apiFetch(`/api/v1/interviews?userUid=${encodeURIComponent(userUid)}${emailParam}${refParam}`);
        const json = await res.json().catch(() => null);
        if (json?.ok) setInterviews(json.data || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [userUid, candidateEmail, receiptIds.join(',')]);

  const totalCount = emailInterviews.length + interviews.length;

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

      {/* Email-Detected Interview Invitations */}
      {emailInterviews.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-bold text-emerald-300 mb-3 flex items-center gap-2">
            <Mail className="w-4 h-4" />
            <span>Detected from Email Replies ({emailInterviews.length})</span>
          </h3>
          <div className="grid gap-3">
            {emailInterviews.map((item) => (
              <div
                key={item.id}
                onClick={() => onOpenSubmissionChat?.(item)}
                style={{
                  padding: '16px',
                  borderRadius: '14px',
                  background: '#18181b',
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
        </div>
      )}

      {/* Company / Agent Scheduled Interviews */}
      {loading ? (
        <div className="text-sm text-slate-400">Loading interviews...</div>
      ) : interviews.length === 0 && emailInterviews.length === 0 ? (
        <div className="p-6 rounded-xl bg-[#18181b] border border-[#2e2e2e] text-center text-xs text-slate-400">
          No interviews scheduled yet. Complete your assignments and apply to open opportunities to receive interview invitations.
        </div>
      ) : interviews.length > 0 ? (
        <div>
          {emailInterviews.length > 0 && (
            <h3 className="text-sm font-bold text-white mb-3">Scheduled Portal Interviews ({interviews.length})</h3>
          )}
          <div className="grid gap-3">
            {interviews.map((item) => {
              const Icon =
                item.interviewType === 'TELEPHONE'
                  ? Phone
                  : item.interviewType === 'IN_PERSON'
                    ? MapPin
                    : Video;
              return (
                <div
                  key={item.id}
                  style={{
                    padding: '16px',
                    borderRadius: '14px',
                    background: '#18181b',
                    border: '1px solid #2e2e2e',
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    gap: '12px',
                  }}
                >
                  <div>
                    <div className="text-sm font-bold text-white">
                      {item.jobTitle} — {item.companyName}
                    </div>
                    <div className="text-xs text-slate-300 mt-1 flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        <CalendarDays className="w-3.5 h-3.5 text-cyan-400" />
                        {item.interviewDate} at {item.interviewTime} ({item.timezone})
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Icon className="w-3.5 h-3.5 text-emerald-400" />
                        {item.interviewType}
                      </span>
                    </div>
                    <div className="text-xs text-cyan-300 mt-1">{item.locationOrLink}</div>
                    {item.instructions && (
                      <div className="text-[11px] text-slate-400 mt-1">{item.instructions}</div>
                    )}
                    <div className="flex items-center gap-2 flex-wrap mt-3">
                      {/^https?:\/\//i.test(item.locationOrLink || '') && (
                        <a
                          href={item.locationOrLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="chat-action-btn primary"
                          style={{ textDecoration: 'none', fontSize: '11.5px', padding: '5px 10px' }}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Join Meeting</span>
                        </a>
                      )}
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
                              style={{ textDecoration: 'none', fontSize: '11.5px', padding: '5px 10px' }}
                            >
                              <CalendarDays className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Add to Google Calendar</span>
                            </a>
                            <button
                              type="button"
                              onClick={downloadIcs}
                              className="chat-action-btn"
                              style={{ fontSize: '11.5px', padding: '5px 10px' }}
                            >
                              <Download className="w-3.5 h-3.5 text-cyan-400" />
                              <span>Download .ics</span>
                            </button>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                  <span
                    style={{
                      alignSelf: 'flex-start',
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: '999px',
                      background:
                        item.status === 'CANCELLED'
                          ? 'rgba(239,68,68,0.2)'
                          : item.status === 'COMPLETED'
                            ? 'rgba(16,185,129,0.2)'
                            : 'rgba(56,189,248,0.2)',
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
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};
