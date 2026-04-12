import { useEffect, useRef, useCallback, useState } from 'react';

export default function useWebSocket(onMessage) {
  const wsRef = useRef(null);
  const [status, setStatus] = useState('off'); // 'off' | 'ing' | 'on'
  const reconnectTimer = useRef(null);
  const reconnectDelay = useRef(1000);
  const onMessageRef = useRef(onMessage);
  const unmountedRef = useRef(false);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (unmountedRef.current) return;
    // 이전 WS가 아직 열려있거나 연결 중이면 먼저 정리
    if (wsRef.current) {
      const st = wsRef.current.readyState;
      if (st === WebSocket.CONNECTING || st === WebSocket.OPEN) return;
      // CLOSING 상태면 정리 후 새 연결
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
    }
    setStatus('ing');
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${proto}//${location.host}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      if (unmountedRef.current) {
        ws.close();
        return;
      }
      setStatus('on');
      reconnectDelay.current = 1000;
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (!msg || !msg.type) return;
        // 서버 종료 메시지 처리
        if (msg.type === 'shutdown') {
          setStatus('off');
          return;
        }
        onMessageRef.current?.(msg.type, msg.data);
      } catch {
        /* ignore non-JSON */
      }
    };
    ws.onerror = () => {
      // onerror 후 onclose가 자동 호출됨 → 여기서는 별도 처리 불필요
    };
    ws.onclose = () => {
      setStatus('off');
      if (unmountedRef.current) return;
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(connect, reconnectDelay.current);
      reconnectDelay.current = Math.min(reconnectDelay.current * 2, 30000);
    };
    wsRef.current = ws;
  }, []);

  const send = useCallback((type, data) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, ...(data ? { data } : {}) }));
    }
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    connect();
    return () => {
      unmountedRef.current = true;
      clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { status, send, reconnect: connect };
}
