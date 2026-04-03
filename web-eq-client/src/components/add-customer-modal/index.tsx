import { useState, useEffect, useMemo } from "react";
import {
  QueueService,
  QueueDetailData,
  WalkInBookingPayload,
} from "../../services/queue/queue.service";
import "./add-customer-modal.scss";

const queueService = new QueueService();

export interface AddCustomerQueueOption {
  id: string;
  name: string;
}

interface Props {
  /** The queue to book into. When provided as a single value the queue selector is hidden. */
  queueId?: string | null;
  /** Pass multiple queues for business-owner view; shows a dropdown to pick one. */
  queues?: AddCustomerQueueOption[];
  businessId: string;
  onClose: () => void;
  onSuccess: () => void;
}

const DEFAULT_COUNTRY_CODE = "+91";

export default function AddCustomerModal({
  queueId,
  queues = [],
  businessId,
  onClose,
  onSuccess,
}: Props) {
  const initialQueueId = queueId ?? (queues.length === 1 ? queues[0].id : "");

  const [selectedQueueId, setSelectedQueueId] = useState(initialQueueId);
  const [queueDetail, setQueueDetail] = useState<QueueDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch queue detail (for services list) when queue changes
  useEffect(() => {
    if (!selectedQueueId) return;
    setDetailLoading(true);
    setQueueDetail(null);
    setSelectedServiceIds([]);
    queueService
      .getQueueDetail(selectedQueueId)
      .then((d) => {
        setQueueDetail(d);
        // Auto-select all services by default
        setSelectedServiceIds(d.services.map((s) => s.uuid));
      })
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  }, [selectedQueueId]);

  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);

  const showQueueSelector = !queueId && queues.length > 1;

  const toggleService = (uuid: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(uuid) ? prev.filter((id) => id !== uuid) : [...prev, uuid]
    );
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    const digits = phone.replace(/\D/g, "");
    if (!digits) {
      errs.phone = "Phone number is required";
    } else if (digits.length !== 10 || !/^[6789]/.test(digits)) {
      errs.phone = "Enter a valid 10-digit mobile number";
    }
    if (!countryCode.trim()) {
      errs.countryCode = "Country code is required";
    }
    if (!selectedQueueId) {
      errs.queue = "Please select a queue";
    }
    if (selectedServiceIds.length === 0) {
      errs.services = "Select at least one service";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    const payload: WalkInBookingPayload = {
      business_id: businessId,
      queue_id: selectedQueueId,
      queue_date: todayStr,
      service_ids: selectedServiceIds,
      recipient_phone: phone.replace(/\D/g, ""),
      recipient_country_code: countryCode.trim(),
      recipient_name: name.trim() || undefined,
      notes: notes.trim() || undefined,
      appointment_type: "QUEUE",
    };

    setSubmitting(true);
    try {
      await queueService.createWalkInBooking(payload);
      onSuccess();
      onClose();
    } catch (err: any) {
      setSubmitError(err?.message || "Failed to add customer. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="acm-overlay" role="dialog" aria-modal="true" aria-label="Add Customer">
      <div className="acm-modal">
        <div className="acm-header">
          <h2 className="acm-title">Add Walk-in Customer</h2>
          <button
            type="button"
            className="acm-close"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form className="acm-body" onSubmit={handleSubmit} noValidate>
          {/* Queue selector */}
          {showQueueSelector && (
            <div className="acm-field">
              <label className="acm-label">Queue *</label>
              <select
                className={`acm-select${errors.queue ? " acm-input--error" : ""}`}
                value={selectedQueueId}
                onChange={(e) => setSelectedQueueId(e.target.value)}
              >
                <option value="">Select a queue…</option>
                {queues.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name}
                  </option>
                ))}
              </select>
              {errors.queue && <span className="acm-error">{errors.queue}</span>}
            </div>
          )}

          {/* Phone */}
          <div className="acm-field">
            <label className="acm-label">Phone Number *</label>
            <div className="acm-phone-row">
              <input
                type="text"
                className="acm-input acm-input--code"
                placeholder="+91"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                maxLength={5}
              />
              <div className="acm-input-wrap">
                <input
                  type="tel"
                  className={`acm-input${errors.phone ? " acm-input--error" : ""}`}
                  placeholder="10-digit number"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                    if (errors.phone) setErrors((p) => ({ ...p, phone: "" }));
                  }}
                  maxLength={10}
                  inputMode="numeric"
                />
                {errors.phone && <span className="acm-error">{errors.phone}</span>}
              </div>
            </div>
          </div>

          {/* Name (optional) */}
          <div className="acm-field">
            <label className="acm-label">Customer Name <span className="acm-optional">(optional)</span></label>
            <input
              type="text"
              className="acm-input"
              placeholder="e.g. Rajesh Kumar"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
            />
          </div>

          {/* Services */}
          <div className="acm-field">
            <label className="acm-label">Services *</label>
            {detailLoading ? (
              <p className="acm-hint">Loading services…</p>
            ) : queueDetail && queueDetail.services.length > 0 ? (
              <div className={`acm-services${errors.services ? " acm-services--error" : ""}`}>
                {queueDetail.services.map((s) => (
                  <label key={s.uuid} className="acm-service-item">
                    <input
                      type="checkbox"
                      checked={selectedServiceIds.includes(s.uuid)}
                      onChange={() => toggleService(s.uuid)}
                    />
                    <span className="acm-service-name">{s.service_name || "Service"}</span>
                    {s.avg_service_time && (
                      <span className="acm-service-meta">~{s.avg_service_time} min</span>
                    )}
                    {s.service_fee != null && s.service_fee > 0 && (
                      <span className="acm-service-meta">₹{s.service_fee}</span>
                    )}
                  </label>
                ))}
              </div>
            ) : queueDetail ? (
              <p className="acm-hint">No services configured for this queue.</p>
            ) : null}
            {errors.services && <span className="acm-error">{errors.services}</span>}
          </div>

          {/* Notes (optional) */}
          <div className="acm-field">
            <label className="acm-label">Notes <span className="acm-optional">(optional)</span></label>
            <textarea
              className="acm-textarea"
              placeholder="Any special instructions…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={300}
            />
          </div>

          {submitError && (
            <div className="acm-submit-error" role="alert">
              {submitError}
            </div>
          )}

          <div className="acm-actions">
            <button
              type="button"
              className="acm-btn acm-btn--cancel"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="acm-btn acm-btn--submit"
              disabled={submitting || detailLoading || !selectedQueueId}
            >
              {submitting ? "Adding…" : "Add to Queue"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
