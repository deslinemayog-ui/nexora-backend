import React, { useEffect, useState } from 'react';
import { FileText, UploadCloud, Trash2, Download, X, Briefcase, Globe2, GraduationCap, TrendingUp } from 'lucide-react';

export interface SupportingDocItem {
  id: string;
  userUid: string;
  agentType: 'JOB_AGENT' | 'VISA_AGENT' | 'EDUCATION_AGENT' | 'INVESTOR_AGENT';
  docType: string;
  label: string;
  fileName: string;
  storedFileName: string;
  mimeType: string;
  fileSizeBytes: number;
  downloadUrl: string;
  createdAt: string;
}

interface SupportingDocsModalProps {
  isOpen: boolean;
  userUid: string;
  currentCv?: { fileName?: string; fileSize?: number; downloadUrl?: string };
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
  resolveApiUrl: (url?: string) => string;
  onClose: () => void;
  onUpdated?: (docs: SupportingDocItem[]) => void;
  onCvChange?: (cv: { fileName: string; fileSize: number; downloadUrl?: string } | null) => void;
}

const AGENT_GROUPS: Array<{
  agentType: SupportingDocItem['agentType'];
  title: string;
  icon: any;
  slots: Array<{ docType: string; label: string }>;
}> = [
  {
    agentType: 'JOB_AGENT',
    title: 'Employment (JOB_AGENT)',
    icon: Briefcase,
    slots: [
      { docType: 'CV', label: 'CV / Resume' },
      { docType: 'ID_PASSPORT', label: 'ID / Passport' },
      { docType: 'QUALIFICATION_CERTIFICATE', label: 'Qualification Certificate' },
      { docType: 'OTHER', label: 'Other Employment Supporting Doc' },
    ],
  },
  {
    agentType: 'VISA_AGENT',
    title: 'Relocation & Visa (VISA_AGENT)',
    icon: Globe2,
    slots: [
      { docType: 'PASSPORT', label: 'Passport' },
      { docType: 'POLICE_MEDICAL', label: 'Police Clearance / Medical' },
      { docType: 'SPONSORSHIP_LETTER', label: 'Qualification / Sponsorship Letter' },
      { docType: 'OTHER', label: 'Other Visa Supporting Doc' },
    ],
  },
  {
    agentType: 'EDUCATION_AGENT',
    title: 'Scholarships (EDUCATION_AGENT)',
    icon: GraduationCap,
    slots: [
      { docType: 'ACADEMIC_TRANSCRIPT', label: 'Academic Transcript' },
      { docType: 'DEGREE_CERTIFICATE', label: 'Degree / Certificate' },
      { docType: 'RECOMMENDATION', label: 'Recommendation / Motivation Letter' },
      { docType: 'OTHER', label: 'Other Scholarship Doc' },
    ],
  },
  {
    agentType: 'INVESTOR_AGENT',
    title: 'Investments (INVESTOR_AGENT)',
    icon: TrendingUp,
    slots: [
      { docType: 'PITCH_DECK', label: 'Pitch Deck' },
      { docType: 'BUSINESS_PLAN', label: 'Business Plan / Financials' },
      { docType: 'COMPANY_REG', label: 'Company Registration' },
      { docType: 'OTHER', label: 'Other Investment Doc' },
    ],
  },
];

export const SupportingDocsModal: React.FC<SupportingDocsModalProps> = ({
  isOpen,
  userUid,
  currentCv,
  apiFetch,
  resolveApiUrl,
  onClose,
  onUpdated,
  onCvChange,
}) => {
  const [activeAgent, setActiveAgent] = useState<SupportingDocItem['agentType']>('JOB_AGENT');
  const [docs, setDocs] = useState<SupportingDocItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadDocs = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/v1/supporting-documents?userUid=${encodeURIComponent(userUid)}`);
      const json = await res.json().catch(() => null);
      if (json?.ok) {
        setDocs(json.data || []);
        onUpdated?.(json.data || []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) void loadDocs();
  }, [isOpen, userUid]);

  if (!isOpen) return null;

  const currentGroup = AGENT_GROUPS.find((g) => g.agentType === activeAgent) || AGENT_GROUPS[0];
  const groupDocs = docs.filter((d) => d.agentType === activeAgent);

  const handleUpload = async (docType: string, label: string, file: File) => {
    setError(null);
    setUploadingSlot(docType);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          resolve(result.includes(',') ? result.split(',')[1] : result);
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
      });

      const res = await apiFetch('/api/v1/supporting-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userUid,
          agentType: activeAgent,
          docType,
          label,
          fileName: file.name,
          mimeType: file.type || 'application/pdf',
          contentBase64: base64,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error || 'Could not upload document');
        return;
      }
      if (docType === 'CV' && activeAgent === 'JOB_AGENT' && json.data) {
        onCvChange?.({
          fileName: json.data.fileName,
          fileSize: json.data.fileSizeBytes || file.size,
          downloadUrl: json.data.downloadUrl,
        });
      }
      await loadDocs();
    } catch (err: any) {
      setError(err?.message || 'Upload failed');
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleDelete = async (doc: SupportingDocItem) => {
    await apiFetch(`/api/v1/supporting-documents/${doc.id}?userUid=${encodeURIComponent(userUid)}`, {
      method: 'DELETE',
    });
    if (doc.docType === 'CV' && doc.agentType === 'JOB_AGENT') {
      onCvChange?.(null);
    }
    await loadDocs();
  };

  return (
    <div className="dossier-modal-overlay" onClick={onClose}>
      <div
        className="dossier-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '680px', width: '95vw', maxHeight: '88vh', overflowY: 'auto' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-white m-0">Supporting Documents</h3>
            <p className="text-xs text-slate-400 m-0 mt-1">
              Upload documents grouped by agent type and attach them whenever you apply or submit.
            </p>
          </div>
          <button type="button" onClick={onClose} className="sidebar-icon-btn">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Agent Type Tabs */}
        <div className="flex gap-2 flex-wrap mb-4">
          {AGENT_GROUPS.map((g) => {
            const Icon = g.icon;
            const active = g.agentType === activeAgent;
            return (
              <button
                key={g.agentType}
                type="button"
                onClick={() => setActiveAgent(g.agentType)}
                className={`chat-action-btn ${active ? 'primary' : ''}`}
                style={{ fontSize: '12px', padding: '7px 12px' }}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{g.title.split(' (')[0]}</span>
              </button>
            );
          })}
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/15 text-red-300 text-xs mb-3">{error}</div>
        )}

        {/* Upload Slots */}
        <div className="grid gap-2.5 mb-5">
          {currentGroup.slots.map((slot) => {
            const existing = groupDocs.filter((d) => d.docType === slot.docType);
            const showPreloadedCv =
              activeAgent === 'JOB_AGENT' &&
              slot.docType === 'CV' &&
              existing.length === 0 &&
              Boolean(currentCv?.fileName);
            const preloadedUrl =
              showPreloadedCv && currentCv?.fileName?.toLowerCase().endsWith('.pdf')
                ? currentCv.downloadUrl ||
                  `/api/v1/documents/download/${encodeURIComponent(currentCv.fileName)}`
                : undefined;

            return (
              <div
                key={slot.docType}
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  background: '#171717',
                  border: '1px solid #2e2e2e',
                }}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <div className="text-xs font-bold text-white">{slot.label}</div>
                    <div className="text-[11px] text-slate-400">
                      {existing.length > 0
                        ? `${existing.length} file(s) uploaded`
                        : showPreloadedCv
                          ? 'Active CV from Profile / AI Generator'
                          : 'No file uploaded yet'}
                    </div>
                  </div>
                  <label className="chat-action-btn" style={{ cursor: 'pointer', fontSize: '11.5px' }}>
                    <UploadCloud className="w-3.5 h-3.5 text-cyan-400" />
                    <span>
                      {uploadingSlot === slot.docType
                        ? 'Uploading...'
                        : existing.length > 0 || showPreloadedCv
                          ? 'Replace'
                          : 'Upload'}
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleUpload(slot.docType, slot.label, f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </div>

                {showPreloadedCv && currentCv?.fileName && (
                  <div className="flex flex-col gap-1.5 mt-2">
                    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white/5">
                      <div className="flex items-center gap-2 text-xs text-emerald-300">
                        <FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{currentCv.fileName}</span>
                        {currentCv.fileSize ? (
                          <span className="text-[11px] text-slate-400">
                            ({(currentCv.fileSize / 1024).toFixed(1)} KB)
                          </span>
                        ) : null}
                      </div>
                      {preloadedUrl && (
                        <a
                          href={resolveApiUrl(preloadedUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-emerald-400 p-1"
                          title="Download / View"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {existing.length > 0 && (
                  <div className="flex flex-col gap-1.5 mt-2">
                    {existing.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white/5"
                      >
                        <div className="flex items-center gap-2 text-xs text-slate-200">
                          <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span>{doc.fileName}</span>
                          <span className="text-[11px] text-slate-400">
                            ({(doc.fileSizeBytes / 1024).toFixed(1)} KB)
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <a
                            href={resolveApiUrl(doc.downloadUrl)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-emerald-400 p-1"
                            title="Download / View"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                          <button
                            type="button"
                            onClick={() => void handleDelete(doc)}
                            className="text-xs text-red-300 p-1"
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {loading && <div className="text-xs text-slate-400">Refreshing documents...</div>}
      </div>
    </div>
  );
};
