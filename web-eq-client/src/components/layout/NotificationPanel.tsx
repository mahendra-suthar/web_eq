import React, { useEffect, useRef, useState } from "react";
import { useNotificationStore } from "../../utils/notificationStore";
import { NotificationService } from "../../services/notification/notification.service";
import { timeAgo } from "../../utils/utils";

const notifService = new NotificationService();

const NotificationPanel: React.FC = () => {
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

  useEffect(() => {
    if (!isPanelOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        closePanel();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isPanelOpen, closePanel]);

  const handleMarkRead = async (uuid: string, isRead: boolean) => {
    if (isRead) return;
    markRead(uuid);
    try {
      await notifService.markRead(uuid);
    } catch {
      // silent — optimistic update is fine
    }
  };

  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return;
    markAllRead();
    try {
      await notifService.markAllRead();
    } catch {
      // silent
    }
  };

  if (!isPanelOpen) return null;

  return (
    <div className="notif-panel" ref={panelRef}>
      <div className="notif-panel__header">
        <span className="notif-panel__title">Notifications</span>
        {unreadCount > 0 && (
          <button className="notif-panel__mark-all" onClick={handleMarkAllRead}>
            Mark all read
          </button>
        )}
      </div>

      <div className="notif-panel__list">
        {notifications.length === 0 ? (
          <div className="notif-panel__empty">No notifications yet</div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.uuid}
              className={`notif-item${n.is_read ? "" : " notif-item--unread"}`}
              onClick={() => handleMarkRead(n.uuid, n.is_read)}
            >
              {!n.is_read && <span className="notif-item__dot" />}
              <div className="notif-item__content">
                <p className="notif-item__title">{n.title}</p>
                <p className="notif-item__body">{n.body}</p>
                <span className="notif-item__time">{timeAgo(n.created_at)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default NotificationPanel;
