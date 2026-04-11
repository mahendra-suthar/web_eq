import { useEffect, useRef, useCallback } from "react";
import { getWsBaseUrl } from "../configs/config";

export interface CustomerQueueUpdate {
  queue_user_id: string;
  position: number | null;
  status: number | null;                        // 1=waiting, 2=in_progress, 3=completed
  expected_at_ts: number | null;                // epoch ms — drift-free countdown
  estimated_wait_minutes: number | null;
  estimated_appointment_time: string | null;    // e.g. "2:30 PM"
  current_token: string | null;                 // token currently being served
}

interface UseCustomerQueueWSOptions {
  onUpdate: (data: CustomerQueueUpdate) => void;
  token?: string | null;
}

/**
 * Connects to ws(s)://host/api/ws/queue-status/{queueId}/{date}?queue_user_id={id}
 *
 * Receives:
 *   initial_state          – personal position/wait on connect
 *   customer_queue_update  – when employee advances the queue
 *   ping                   – keepalive (responds with pong)
 *
 * Auto-reconnects with exponential back-off (2s → 30s cap).
 * Stops when queueId, date, or queueUserId is null/undefined.
 */
export function useCustomerQueueWS(
  queueId: string | null | undefined,
  date: string | null | undefined,
  queueUserId: string | null | undefined,
  options: UseCustomerQueueWSOptions,
): void {
  const { onUpdate, token } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const isMountedRef = useRef(true);

  const onUpdateRef = useRef(onUpdate);
  useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);

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
    if (!isMountedRef.current || !queueId || !date || !queueUserId) return;

    const base = `${getWsBaseUrl()}/ws/queue-status/${encodeURIComponent(queueId)}/${encodeURIComponent(date)}`;
    const params = new URLSearchParams({ queue_user_id: queueUserId });
    if (token) params.set("token", token);
    const wsUrl = `${base}?${params.toString()}`;

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
          case "customer_queue_update":
            onUpdateRef.current(msg.data as CustomerQueueUpdate);
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
      if (event.code === 4001 || event.code === 4003) return; // auth/forbidden — stop retrying

      const delay = Math.min(2000 * Math.pow(2, reconnectAttemptRef.current), 30000);
      reconnectAttemptRef.current += 1;
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueId, date, queueUserId, token]);

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
