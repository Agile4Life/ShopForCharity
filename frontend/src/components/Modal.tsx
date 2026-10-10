import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
  closeDisabled?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  className = "",
  closeDisabled = false,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const closeRef = useRef({ onClose, closeDisabled });
  useEffect(() => {
    closeRef.current = { onClose, closeDisabled };
  }, [onClose, closeDisabled]);
  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const initialFocus = contentRef.current?.querySelector<HTMLElement>("[data-autofocus]");
    (initialFocus || contentRef.current)?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === "Escape" && isOpen) {
        if (!closeRef.current.closeDisabled) closeRef.current.onClose();
      }
      if (e.key === "Tab") {
        const controls = contentRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        );
        if (!controls?.length) {
          e.preventDefault();
          return;
        }
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === contentRef.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (
          !e.shiftKey &&
          (document.activeElement === last ||
            document.activeElement === contentRef.current)
        ) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div className="modal-backdrop" onClick={() => { if (!closeDisabled) onClose(); }}>
      <div
        ref={contentRef}
        tabIndex={-1}
        className={`modal-content ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title" id={titleId}>
            {title}
          </h3>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Đóng"
          >
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
};
