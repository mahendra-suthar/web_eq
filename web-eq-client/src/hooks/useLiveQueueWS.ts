import { useEffect, useRef, useCallback } from "react";
import { getWsBaseUrl } from "../configs/config";
import type { LiveQueueData } from "../services/queue/queue.service";

type EventHandler = (data: LiveQueueData) => void;
type StatusEventHandler = (payload: { queue_id: string; queue_status: number }) => void;

interface UseLiveQueueWSOptions {
    onUpdate?: EventHandler;
    onStarted?: StatusEventHandler;
    onStopped?: StatusEventHandler;
    reconnectDelayMs?: number;
    pingIntervalMs?: number;
}

/**
 * Employee-facing WebSocket hook for live queue real-time updates.
 *
 * Connects to  ws(s)://host/api/ws/live/{queueId}/{date}
 * Handles:
 *  - initial_state     → calls onUpdate
 *  - live_queue_update → calls onUpdate
 *  - queue_started     → calls onStarted
 *  - queue_stopped     → calls onStopped
 *  - ping              → responds with pong
 *  - auto-reconnect with exponential back-off (up to 30 s)
 *  - cleanup on unmount
 */
export function useLiveQueueWS(
    queueId: string | null | undefined,
    dateStr: string,          // "YYYY-MM-DD"
    options: UseLiveQueueWSOptions = {}
): { send: (msg: object) => void } {
    const {
        onUpdate,
        onStarted,
        onStopped,
        reconnectDelayMs = 2000,
        pingIntervalMs = 25000,
    } = options;

    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const reconnectAttemptRef = useRef(0);
    const isMountedRef = useRef(true);

    // Keep callbacks in refs so the connect function doesn't need to be recreated
    const onUpdateRef = useRef(onUpdate);
    const onStartedRef = useRef(onStarted);
    const onStoppedRef = useRef(onStopped);
    useEffect(() => { onUpdateRef.current = onUpdate; }, [onUpdate]);
    useEffect(() => { onStartedRef.current = onStarted; }, [onStarted]);
    useEffect(() => { onStoppedRef.current = onStopped; }, [onStopped]);

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
        if (!isMountedRef.current || !queueId || !dateStr) return;
        const wsUrl = `${getWsBaseUrl()}/ws/live/${encodeURIComponent(queueId)}/${dateStr}`;
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
            }, pingIntervalMs);
        };

        ws.onmessage = (event: MessageEvent) => {
            try {
                const msg = JSON.parse(event.data as string);
                switch (msg.type) {
                    case "live_queue_update":
                        onUpdateRef.current?.(msg.data as LiveQueueData);
                        break;
                    case "queue_started":
                        onStartedRef.current?.(msg.data);
                        break;
                    case "queue_stopped":
                        onStoppedRef.current?.(msg.data);
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

        ws.onclose = () => {
            clearPingTimer();
            if (!isMountedRef.current) return;

            // Exponential back-off: 2s, 4s, 8s … capped at 30s
            const delay = Math.min(
                reconnectDelayMs * Math.pow(2, reconnectAttemptRef.current),
                30000
            );
            reconnectAttemptRef.current += 1;
            reconnectTimerRef.current = setTimeout(connect, delay);
        };

        ws.onerror = () => {
            ws.close();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queueId, dateStr, reconnectDelayMs, pingIntervalMs]);

    useEffect(() => {
        isMountedRef.current = true;
        connect();
        return () => {
            isMountedRef.current = false;
            clearPingTimer();
            clearReconnectTimer();
            if (wsRef.current) {
                wsRef.current.onclose = null; // prevent reconnect on unmount close
                wsRef.current.close();
                wsRef.current = null;
            }
        };
    }, [connect]);

    const send = useCallback((msg: object) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(msg));
        }
    }, []);

    return { send };
}
