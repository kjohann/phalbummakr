import { useEffect, useRef, type ReactNode } from "react";

export default function ModalDialog({ label, children, onClose, closeDisabled = false }: {
  label: string;
  children: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef({ onClose, closeDisabled });
  closeRef.current = { onClose, closeDisabled };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])",
    ));
    const focusFirst = () => (focusable()[0] ?? dialog).focus();
    const focusInside = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) focusFirst();
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !closeRef.current.closeDisabled) {
        event.preventDefault();
        closeRef.current.onClose();
      } else if (event.key === "Tab") {
        const items = focusable();
        if (!items.length) { event.preventDefault(); dialog.focus(); return; }
        const index = items.indexOf(document.activeElement as HTMLElement);
        if (event.shiftKey && index <= 0) { event.preventDefault(); items[items.length - 1].focus(); }
        else if (!event.shiftKey && (index === -1 || index === items.length - 1)) { event.preventDefault(); items[0].focus(); }
      }
    };
    focusFirst();
    document.addEventListener("focusin", focusInside);
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("focusin", focusInside);
      document.removeEventListener("keydown", keydown);
      if (previous?.isConnected) previous.focus();
    };
  }, []);

  return <div className="dialog-backdrop">
    <div className="album-form" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={dialogRef}>
      {children}
    </div>
  </div>;
}
