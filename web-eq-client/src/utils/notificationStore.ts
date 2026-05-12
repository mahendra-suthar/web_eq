import { create } from "zustand";
import type { NotificationData } from "../services/notification/notification.service";

interface NotificationState {
  notifications: NotificationData[];
  unreadCount: number;
  total: number;
  isPanelOpen: boolean;

  setInitial: (notifications: NotificationData[], unreadCount: number, total: number) => void;
  addNotification: (notification: NotificationData) => void;
  markRead: (uuid: string) => void;
  markAllRead: () => void;
  togglePanel: () => void;
  closePanel: () => void;
  reset: () => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  total: 0,
  isPanelOpen: false,

  setInitial: (notifications, unreadCount, total) =>
    set({ notifications, unreadCount, total }),

  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
      total: state.total + 1,
    })),

  markRead: (uuid) =>
    set((state) => {
      const updated = state.notifications.map((n) =>
        n.uuid === uuid ? { ...n, is_read: true } : n
      );
      const wasUnread = state.notifications.find((n) => n.uuid === uuid && !n.is_read);
      return {
        notifications: updated,
        unreadCount: wasUnread ? Math.max(0, state.unreadCount - 1) : state.unreadCount,
      };
    }),

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    })),

  togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),

  closePanel: () => set({ isPanelOpen: false }),

  reset: () => set({ notifications: [], unreadCount: 0, total: 0, isPanelOpen: false }),
}));
