import { useTranslation } from "react-i18next";

interface ExportModalProps {
  onExport: (format: "pdf" | "xlsx") => void;
  onClose: () => void;
  exporting: "pdf" | "xlsx" | null;
  title?: string;
}

export function ExportModal({ onExport, onClose, exporting, title }: ExportModalProps) {
  const { t } = useTranslation();
  const busy = exporting !== null;

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div className="modal">
        <div className="modal-header">
          <h3>{title ?? t("exportQueueUsers")}</h3>
          <button className="modal-close" onClick={onClose} disabled={busy} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              className="btn btn-secondary"
              onClick={() => onExport("xlsx")}
              disabled={busy}
              style={{ justifyContent: "flex-start", padding: "12px 16px" }}
            >
              {exporting === "xlsx" ? t("exportingFile") : `📊 ${t("downloadExcel")}`}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => onExport("pdf")}
              disabled={busy}
              style={{ justifyContent: "flex-start", padding: "12px 16px" }}
            >
              {exporting === "pdf" ? t("exportingFile") : `📄 ${t("downloadPDF")}`}
            </button>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
