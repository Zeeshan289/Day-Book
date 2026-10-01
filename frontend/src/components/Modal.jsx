import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Things inside the dialog that Tab can reach (visible ones only).
const focusables = (box) => [...box.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);

export default function Modal({ title, onClose, children, wide }) {
  const box = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // On open: remember what had focus (e.g. the clicked row) and move focus into the dialog.
  // On close: give focus back to it.
  useEffect(() => {
    const before = document.activeElement;
    if (!box.current.contains(document.activeElement)) {
      // First field or button, but not the × in the corner. A field with autoFocus already has focus.
      const first = focusables(box.current).find((el) => !el.classList.contains('icon-btn'));
      (first || box.current).focus();
    }
    return () => { if (before && before.isConnected) before.focus(); };
  }, []);

  // Escape closes. Tab and Shift+Tab go round inside the dialog.
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') return closeRef.current();
      if (e.key !== 'Tab') return;
      const items = focusables(box.current);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = box.current.contains(document.activeElement);
      if (!inside || (e.shiftKey && document.activeElement === first)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
