import { useEffect, useRef } from 'react';

export default function ConfirmDialog({ message, onConfirm, onCancel }) {
  const boxRef = useRef(null);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    boxRef.current?.querySelector('button')?.focus();
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  const handleOverlay = (e) => {
    if (e.target === e.currentTarget) onCancel();
  };

  return (
    <div className="confirm-overlay" onClick={handleOverlay}>
      <div className="confirm-box" ref={boxRef} role="dialog" aria-modal="true">
        <p>{message}</p>
        <div className="confirm-btns">
          <button className="btn btn-stop" onClick={onCancel}>
            취소
          </button>
          <button className="btn btn-go" onClick={onConfirm}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
