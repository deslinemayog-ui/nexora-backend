import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';

interface NotificationsBellProps {
  userUid?: string;
  organisationId?: string;
  apiFetch: (path: string, init?: RequestInit) => Promise<Response>;
}

export const NotificationsBell: React.FC<NotificationsBellProps> = ({
  userUid,
  organisationId,
  apiFetch,
}) => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);

  const load = async () => {
    if (!userUid && !organisationId) return;
    const qs = userUid
      ? `userUid=${encodeURIComponent(userUid)}`
      : `organisationId=${encodeURIComponent(organisationId || '')}`;
    const res = await apiFetch(`/api/v1/notifications?${qs}`).catch(() => null);
    if (res?.ok) {
      const json = await res.json().catch(() => null);
      if (json?.ok) setItems(json.data || []);
    }
  };

  useEffect(() => {
    void load();
  }, [userUid, organisationId]);

  const unread = items.filter((n) => !n.isRead).length;

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void load();
        }}
        className="sidebar-icon-btn"
        title="Notifications"
        style={{ position: 'relative' }}
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '-2px',
              right: '-2px',
              minWidth: '15px',
              height: '15px',
              borderRadius: '999px',
              background: '#ef4444',
              color: '#fff',
              fontSize: '9px',
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
            }}
          >
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '38px',
            width: '300px',
            maxHeight: '340px',
            overflowY: 'auto',
            background: '#18181b',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '10px',
            zIndex: 1200,
            boxShadow: '0 16px 40px rgba(0,0,0,0.6)',
          }}
        >
          <div className="text-xs font-bold text-white mb-2">Notifications</div>
          {items.length === 0 ? (
            <div className="text-xs text-slate-400 py-3">No notifications yet.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {items.slice(0, 12).map((n) => (
                <div
                  key={n.id}
                  onClick={async () => {
                    if (!n.isRead) {
                      await apiFetch(`/api/v1/notifications/${n.id}/read`, { method: 'POST' });
                      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
                    }
                  }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: n.isRead ? '#111827' : 'rgba(56, 189, 248, 0.1)',
                    border: '1px solid #2e2e2e',
                    cursor: 'pointer',
                  }}
                >
                  <div className="text-xs font-bold text-white">{n.title}</div>
                  <div className="text-[11px] text-slate-300 mt-0.5">{n.message}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
