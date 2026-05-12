import { useEffect, useRef, useCallback } from "react";
import { getWsBaseUrl } from "../configs/config";
import { useNotificationStore } from "../utils/notificationStore";
import type { NotificationData } from "../services/notification/notification.service";

/**
 * Connects to ws(s)://host/api/ws/notifications/{userId}
 * Auth is handled via httpOnly cookie (SameSite=None; Secure) — sent automatically
 * by the browser on every WebSocket upgrade request, including cross-origin.
 *
 * In dev the Vite proxy makes it same-origin (localhost:5173 → localhost:8008).
 * In production on Render the cookie's SameSite=None policy covers cross-origin WS.
 *
 * Auto-reconnects with exponential back-off (2s → 30s cap).
 */
export function useNotificationWS(userId: string | null | undefined, token?: string | null): void {
  const { setInitial, addNotification } = useNotificationStore();

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const isMountedRef = useRef(true);

  const setInitialRef = useRef(setInitial);
  const addNotificationRef = useRef(addNotification);
  useEffect(() => { setInitialRef.current = setInitial; }, [setInitial]);
  useEffect(() => { addNotificationRef.current = addNotification; }, [addNotification]);

  const clearPingTimer = () => {
    if (pingTimerRef.current != null) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  };

  const clearReconnectTimer = () => {
    if (reconnectTimerRef.current != null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  };

  const connect = useCallback(() => {
    if (!isMountedRef.current || !userId) return;

    const base = `${getWsBaseUrl()}/ws/notifications/${encodeURIComponent(userId)}`;
    const wsUrl = token ? `${base}?token=${encodeURIComponent(token)}` : base;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!isMountedRef.current) { ws.close(); return; }
      reconnectAttemptRef.current = 0;

      clearPingTimer();
      pingTimerRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 25000);
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string);
        switch (msg.type) {
          case "initial_state":
            setInitialRef.current(
              msg.data.notifications as NotificationData[],
              msg.data.unread_count as number,
              msg.data.total as number
            );
            break;
          case "notification":
            addNotificationRef.current(msg.data as NotificationData);
            break;
          case "ping":
            ws.send(JSON.stringify({ type: "pong" }));
            break;
          default:
            break;
        }
      } catch {
        // Ignore non-JSON frames
      }
    };

    ws.onclose = (event) => {
      clearPingTimer();
      if (!isMountedRef.current) return;
      if (event.code === 4001) return; // auth rejected — don't retry until token changes

      const delay = Math.min(2000 * Math.pow(2, reconnectAttemptRef.current), 30000);
      reconnectAttemptRef.current += 1;
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, token]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();
    return () => {
      isMountedRef.current = false;
      clearPingTimer();
      clearReconnectTimer();
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);
}
