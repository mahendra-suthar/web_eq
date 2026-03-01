/**
 * AppointmentActions – Edit (reschedule) and Cancel controls for an appointment card.
 *
 * Edit:   Navigates to the business booking page with reschedule context so the user
 *         goes through the familiar "choose services → date → queue → confirm" flow.
 *         On confirm, BookingPage calls PATCH /customer/appointments/{id} (reschedule)
 *         instead of POST /queue/book (create).
 *
 * Cancel: Opens an in-place confirmation modal; removes the user from the queue in
 *         real time via the cancel endpoint and immediately refreshes the list.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppointmentService } from "../../services/appointment/appointment.service";
import Button from "../button";
import "./appointment-actions.scss";

// ─── Shared appointment shape ─────────────────────────────────────────────────

export interface AppointmentActionItem {
  queue_user_id: string;
  queue_id: string;
  queue_name: string;
  business_id: string;
  business_name: string;
  queue_date?: string;
  status: number;
  queue_service_uuids?: string[];
  service_summary?: string | null;
}

// ─── Allowed status codes ─────────────────────────────────────────────────────

const EDITABLE_STATUSES = [1];       // REGISTERED only
const CANCELLABLE_STATUSES = [1, 2]; // REGISTERED + IN_PROGRESS

// ─── Root component ──────────────────────────────────────────────────────────

interface AppointmentActionsProps {
  appointment: AppointmentActionItem;
  onUpdated: () => void;
}

export default function AppointmentActions({
  appointment,
  onUpdated,
}: AppointmentActionsProps) {
  const navigate = useNavigate();
  const [showCancel, setShowCancel] = useState(false);

  const canEdit   = EDITABLE_STATUSES.includes(appointment.status);
  const canCancel = CANCELLABLE_STATUSES.includes(appointment.status);

  if (!canEdit && !canCancel) return null;

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Navigate to the business booking page carrying reschedule context.
    // BookingPage will pre-fill services + date from location.state and, on
    // confirm, call PATCH /customer/appointments/{queue_user_id} instead of
    // POST /queue/book.
    navigate(`/business/${appointment.business_id}/book`, {
      state: {
        selectedServices:     appointment.queue_service_uuids ?? [],
        selectedServicesData: [],        // booking page resolves these from API
        businessName:         appointment.business_name,
        // Reschedule context
        rescheduleQueueUserId: appointment.queue_user_id,
        rescheduleInitialDate: appointment.queue_date,
      },
    });
  };

  return (
    <>
      <div className="appt-actions">
        {canEdit && (
          <button
            type="button"
            className="appt-actions__btn appt-actions__btn--edit"
            onClick={handleEdit}
            aria-label={`Reschedule appointment at ${appointment.business_name}`}
          >
            Reschedule
          </button>
        )}
        {canCancel && (
          <button
            type="button"
            className="appt-actions__btn appt-actions__btn--cancel"
            onClick={(e) => { e.stopPropagation(); setShowCancel(true); }}
            aria-label={`Cancel appointment at ${appointment.business_name}`}
          >
            Cancel
          </button>
        )}
      </div>

      {showCancel && (
        <CancelModal
          appointment={appointment}
          onClose={() => setShowCancel(false)}
          onCancelled={onUpdated}
        />
      )}
    </>
  );
}

// ─── Cancel confirmation modal ────────────────────────────────────────────────

function CancelModal({
  appointment,
  onClose,
  onCancelled,
}: {
  appointment: AppointmentActionItem;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      const svc = new AppointmentService();
      await svc.cancelAppointment(appointment.queue_user_id);
      onCancelled();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to cancel appointment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="appt-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="appt-cancel-title"
      onClick={onClose}
    >
      <div className="appt-modal" onClick={(e) => e.stopPropagation()}>
        <h3 id="appt-cancel-title" className="appt-modal__title">
          Cancel appointment?
        </h3>
        <p className="appt-modal__desc">
          You will be removed from{" "}
          <strong>{appointment.queue_name}</strong> at{" "}
          <strong>{appointment.business_name}</strong>. This cannot be undone.
        </p>
        {error && <p className="appt-modal__error" role="alert">{error}</p>}
        <div className="appt-modal__actions">
          <Button
            text="Go back"
            color="outline-blue"
            onClick={onClose}
            disabled={loading}
          />
          <Button
            text={loading ? "Cancelling…" : "Yes, cancel"}
            color="red"
            onClick={handleConfirm}
            disabled={loading}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}
