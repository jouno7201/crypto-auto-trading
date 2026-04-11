import { useEffect, useRef, useCallback, useState } from 'react';

export default function useWebSocket(onMessage) {
  const wsRef = useRef(null);
  const [status, setStatus] = useState('off'); // 'off' | 'ing' | 'on'
  const reconnectTimer = useRef(null);
  const reconnectDelay = useRef(1000);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= 1) return;
    setStatus('ing');
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setStatus('on');
      reconnectDelay.current = 1000;
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg && msg.type) onMessageRef.current?.(msg.type, msg.data);
      } catch {
        /* ignore non-JSON */
      }
    };
    ws.onclose = () => {
      setStatus('off');
      reconnectTimer.current = setTimeout(connect, reconnectDelay.current);
      reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000);
    };
    wsRef.current = ws;
  }, []);

  const send = useCallback((type, data) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type, ...(data ? { data } : {}) }));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { status, send, reconnect: connect };
}
