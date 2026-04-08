import { useNotificationStore } from "../../store/notification.store";
import NotificationPanel from "./NotificationPanel";

export default function NotificationBell() {
  const { unreadCount, togglePanel } = useNotificationStore();

  return (
    <div className="cl-notif-bell-wrapper">
      <button
        className="cl-notif-bell"
        onClick={togglePanel}
        aria-label="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span className="cl-notif-bell__badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      <NotificationPanel />
    </div>
  );
}
