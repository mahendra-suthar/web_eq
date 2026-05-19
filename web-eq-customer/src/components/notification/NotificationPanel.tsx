import { useEffect, useRef, useState } from "react";
import { useNotificationStore } from "../../store/notification.store";
import { NotificationService } from "../../services/notification/notification.service";
import { timeAgo } from "../../utils/util";

const notifService = new NotificationService();

export default function NotificationPanel() {
  const { notifications, unreadCount, isPanelOpen, closePanel, markRead, markAllRead } =
    useNotificationStore();
  const panelRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);

  // Re-render every 60s so timeAgo labels stay current
  useEffect(() => {
    if (!isPanelOpen) return;
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, [isPanelOpen]);

  // Close on click/touch outside
  useEffect(() => {
    if (!isPanelOpen) return;
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        closePanel();
      }
    };
    document.addEventListener("pointerdown", handleOutside);
    return () => document.removeEventListener("pointerdown", handleOutside);
  }, [isPanelOpen, closePanel]);

  // Close on Escape key
  useEffect(() => {
    if (!isPanelOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") closePanel(); };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isPanelOpen, closePanel]);

  const handleMarkRead = async (uuid: string, isRead: boolean) => {
    if (isRead) return;
    markRead(uuid);
    try { await notifService.markRead(uuid); } catch { /* optimistic update is fine */ }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return;
    markAllRead();
    try { await notifService.markAllRead(); } catch { /* silent */ }
  };

  if (!isPanelOpen) return null;

  return (
    <>
      {/* Mobile backdrop */}
      <div className="cl-notif-backdrop" onClick={closePanel} aria-hidden="true" />

      <div className="cl-notif-panel" ref={panelRef} role="dialog" aria-label="Notifications" aria-modal="true">
        <div className="cl-notif-panel__header">
          <span className="cl-notif-panel__title">
            Notifications
            {unreadCount > 0 && <span className="cl-notif-panel__count">{unreadCount}</span>}
          </span>
          <div className="cl-notif-panel__actions">
            {unreadCount > 0 && (
              <button className="cl-notif-panel__mark-all" onClick={handleMarkAllRead}>
                Mark all read
              </button>
            )}
            <button className="cl-notif-panel__close" onClick={closePanel} aria-label="Close notifications">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        <div className="cl-notif-panel__list">
          {notifications.length === 0 ? (
            <div className="cl-notif-panel__empty">
              <svg width="40" height="40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 01-3.46 0"/>
              </svg>
              <p>No notifications yet</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.uuid}
                className={`cl-notif-item${n.is_read ? "" : " cl-notif-item--unread"}`}
                onClick={() => handleMarkRead(n.uuid, n.is_read)}
                role="button"
                tabIndex={0}
              >
                <span className={`cl-notif-item__dot${n.is_read ? " cl-notif-item__dot--read" : ""}`} />
                <div className="cl-notif-item__content">
                  <p className="cl-notif-item__title">{n.title}</p>
                  <p className="cl-notif-item__body">{n.body}</p>
                  <span className="cl-notif-item__time">{timeAgo(n.created_at)}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
