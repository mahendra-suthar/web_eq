import { useNotificationStore } from "../../store/notification.store";

export default function NotificationBell() {
  const { unreadCount, togglePanel } = useNotificationStore();

  return (
    <button
      className="cl-notif-bell"
      onClick={togglePanel}
      aria-label="Notifications"
    >
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 01-3.46 0"/>
      </svg>
      {unreadCount > 0 && (
        <span className="cl-notif-bell__badge" aria-label={`${unreadCount} unread`}>
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}
