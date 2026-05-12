import { HttpClient } from "../api/httpclient.service";

export interface NotificationData {
  uuid: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  notifications: NotificationData[];
  total: number;
  unread_count: number;
  limit: number;
  offset: number;
}

export class NotificationService extends HttpClient {
  constructor() {
    super();
  }

  async getNotifications(limit = 20, offset = 0): Promise<NotificationListResponse> {
    return this.get<NotificationListResponse>(`/notification/?limit=${limit}&offset=${offset}`);
  }

  async markRead(notificationId: string): Promise<NotificationData> {
    return this.patch<NotificationData>(`/notification/mark-read/${notificationId}`);
  }

  async markAllRead(): Promise<{ updated: number }> {
    return this.patch<{ updated: number }>("/notification/mark-all-read");
  }
}
