/**
 * Custom hook for WebSocket connection to receive real-time queue updates.
 */
import { useEffect, useRef, useCallback } from 'react';
import { useBookingStore, type QueueUpdateMessage } from '../store/booking.store';
import { getApiUrl } from '../configs/config';
import { MAX_RECONNECT_ATTEMPTS, INITIAL_RECONNECT_DELAY_MS, MAX_RECONNECT_DELAY_MS } from '../utils/constants';

interface UseQueueWebSocketOptions {
  businessId: string;
  date: string;
  enabled?: boolean;
  token?: string;
}

export function useQueueWebSocket({ 
  businessId, 
  date, 
  enabled = true,
  token 
}: UseQueueWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  
  const { 
    updateFromWebSocket, 
    setWsConnected, 
    setError 
  } = useBookingStore();
  
  const connect = useCallback(() => {
    if (!enabled || !businessId || !date) return;
    
    const apiUrl = getApiUrl();
    const wsProtocol = apiUrl.startsWith('https') ? 'wss' : 'ws';
    const wsHost = apiUrl.replace(/^https?:\/\//, '').replace(/\/api$/, '');
    let wsUrl = `${wsProtocol}://${wsHost}/api/ws/booking/${businessId}/${date}`;
    
    if (token) {
      wsUrl += `?token=${token}`;
    }
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsConnected(true);
        reconnectAttempts.current = 0;
      };
      
      ws.onmessage = (event) => {
        try {
          const message: QueueUpdateMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'initial_state':
            case 'queue_update':
              if (message.data) {
                updateFromWebSocket(message.data);
              }
              break;
            case 'ping':
              ws.send(JSON.stringify({ type: 'pong' }));
              break;
            case 'pong':
              break;
            default:
              console.log('Unknown message type:', message.type);
          }
        } catch (e) {
          console.error('Error parsing WebSocket message:', e);
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError('Connection error. Retrying...');
      };
      
      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setWsConnected(false);
        wsRef.current = null;
        
        if (enabled && reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(INITIAL_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts.current), MAX_RECONNECT_DELAY_MS);
          reconnectAttempts.current++;
          
          console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };
      
    } catch (e) {
      console.error('Failed to create WebSocket:', e);
      setError('Failed to connect to real-time updates');
    }
  }, [businessId, date, enabled, token, updateFromWebSocket, setWsConnected, setError]);
  
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnected');
      wsRef.current = null;
    }
    
    setWsConnected(false);
  }, [setWsConnected]);
  
  const sendRefresh = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'refresh' }));
    }
  }, []);
  
  useEffect(() => {
    if (enabled && businessId && date) {
      connect();
    }
    
    return () => {
      disconnect();
    };
  }, [enabled, businessId, date, connect, disconnect]);
  
  return {
    connected: useBookingStore((state) => state.wsConnected),
    sendRefresh,
    disconnect,
    reconnect: connect,
  };
}
