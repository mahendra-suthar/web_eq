import React from "react";
import { useNotificationStore } from "../../utils/notificationStore";
import NotificationPanel from "./NotificationPanel";

const NotificationBell: React.FC = () => {
  const { unreadCount, togglePanel } = useNotificationStore();

  return (
    <div className="notif-bell-wrapper">
      <button className="notification-btn notif-bell" onClick={togglePanel} aria-label="Notifications">
        🔔
        {unreadCount > 0 && (
          <span className="notification-badge notif-bell__badge">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      <NotificationPanel />
    </div>
  );
};

export default NotificationBell;
