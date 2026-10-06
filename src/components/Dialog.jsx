import { useEffect, useRef } from "react";

const FOCUSABLE = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

// Modal panel: moves focus inside on open, keeps Tab cycling within it, and hands
// focus back to whatever opened it on close. Escape is handled app-wide.
export function Dialog({ overlayClassName = "drawer-overlay", className, label, onClose, children }) {
  const panelRef = useRef(null);
  useEffect(() => {
    const opener = document.activeElement;
    panelRef.current?.querySelector(FOCUSABLE)?.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);
  const trapTab = (event) => {
    if (event.key !== "Tab") return;
    const focusable = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  return (
    <div className={overlayClassName} onClick={onClose}>
      <div ref={panelRef} className={className} role="dialog" aria-modal="true" aria-label={label} onClick={(event) => event.stopPropagation()} onKeyDown={trapTab}>
        {children}
      </div>
    </div>
  );
}
