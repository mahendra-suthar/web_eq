import { useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import "./modal.scss";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  titleId?: string;
  children: ReactNode;
  contentClassName?: string;
  role?: "dialog" | "alertdialog";
}

export default function Modal(props: ModalProps) {
  const {
    open,
    onClose,
    titleId,
    children,
    contentClassName = "",
    role = "dialog",
  } = props;

  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!open) return;
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, handleEscape]);

  if (!open) return null;

  const contentClass = "modal-content " + (contentClassName || "").trim();

  return createPortal(
    <div
      className="modal-overlay"
      role={role}
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className={contentClass}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}
