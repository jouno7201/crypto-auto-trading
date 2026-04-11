import { useState, useCallback, useRef } from 'react';

let toastId = 0;
const MAX_TOASTS = 5;

export default function useToast() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, out: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }, 300);
  }, []);

  const show = useCallback(
    (type, msg) => {
      const id = ++toastId;
      setToasts((prev) => {
        const next = [...prev, { id, type, msg, out: false }];
        return next.length > MAX_TOASTS ? next.slice(-MAX_TOASTS) : next;
      });
      timers.current[id] = setTimeout(() => dismiss(id), 3000);
    },
    [dismiss],
  );

  const Toast = () => (
    <div className="toast-wrap">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast toast-${t.type === 'error' ? 'err' : t.type === 'warning' ? 'warn' : 'ok'}${t.out ? ' toast-out' : ''}`}
          onClick={() => dismiss(t.id)}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );

  return { show, Toast };
}
