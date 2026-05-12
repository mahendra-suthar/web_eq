import React from "react";

export interface ConfirmModalProps {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Shared confirmation dialog used across admin panels.
 * Relies on shared CSS classes from admin-shared.scss:
 * .modal-backdrop, .modal, .modal-header, .modal-body, .modal-footer, .modal-close,
 * .btn, .btn-primary, .btn-secondary, .btn-danger
 */
export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}) => (
  <div className="modal-backdrop" onClick={(e) => e.target === e.currentTarget && onCancel()}>
    <div className="modal">
      <div className="modal-header">
        <h3>{title}</h3>
        <button className="modal-close" onClick={onCancel} aria-label="Close">×</button>
      </div>
      <div className="modal-body">{message}</div>
      <div className="modal-footer">
        <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </button>
        <button
          className={`btn ${destructive ? "btn-danger btn-danger--solid" : "btn-primary"}`}
          onClick={onConfirm}
          disabled={loading}
        >
          {loading ? "Processing…" : confirmLabel}
        </button>
      </div>
    </div>
  </div>
);
