import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AppointmentService } from "../../services/appointment/appointment.service";
import { ReviewService } from "../../services/review/review.service";
import ReviewModal from "../review-modal";
import Modal from "../modal";
import Button from "../button";
import "./appointment-actions.scss";

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

const EDITABLE_STATUSES = [1];       // REGISTERED only
const CANCELLABLE_STATUSES = [1, 2]; // REGISTERED + IN_PROGRESS
const COMPLETED_STATUS = 3;

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
  const [showReview, setShowReview] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);

  const canEdit = EDITABLE_STATUSES.includes(appointment.status);
  const canCancel = CANCELLABLE_STATUSES.includes(appointment.status);
  const canReview = appointment.status === COMPLETED_STATUS;

  useEffect(() => {
    if (!canReview) return;
    new ReviewService().getMyReview({ queueUserId: appointment.queue_user_id })
      .then((r) => { if (r) setHasReviewed(true); })
      .catch(() => {});
  }, [appointment.queue_user_id, canReview]);

  if (!canEdit && !canCancel && !canReview) return null;

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/business/${appointment.business_id}/book`, {
      state: {
        selectedServices: appointment.queue_service_uuids ?? [],
        selectedServicesData: [], // booking page resolves these from API
        businessName: appointment.business_name,
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
        {canReview && !hasReviewed && (
          <button
            type="button"
            className="appt-actions__btn appt-actions__btn--review"
            onClick={(e) => { e.stopPropagation(); setShowReview(true); }}
            aria-label={`Write a review for ${appointment.business_name}`}
          >
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
            Write a Review
          </button>
        )}
        {canReview && hasReviewed && (
          <span className="appt-actions__reviewed">
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Reviewed
          </span>
        )}
      </div>

      {showCancel && (
        <CancelModal
          appointment={appointment}
          onClose={() => setShowCancel(false)}
          onCancelled={onUpdated}
        />
      )}

      <ReviewModal
        open={showReview}
        onClose={() => setShowReview(false)}
        businessId={appointment.business_id}
        businessName={appointment.business_name}
        queueUserId={appointment.queue_user_id}
        onSuccess={() => { setHasReviewed(true); setShowReview(false); }}
      />
    </>
  );
}

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
  const [error, setError] = useState<string | null>(null);

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
    <Modal open onClose={onClose} titleId="appt-cancel-title" contentClassName="appt-modal">
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
    </Modal>
  );
}
