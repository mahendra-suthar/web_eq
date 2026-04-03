import { useState, useCallback } from "react";
import Modal from "../modal";
import {
  ReviewService,
  type ReviewData,
} from "../../services/review/review.service";
import "./review-modal.scss";

const STAR_HINTS = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];

interface ReviewModalProps {
  open: boolean;
  onClose: () => void;
  businessId: string;
  businessName: string;
  queueUserId?: string;
  onSuccess?: (review: ReviewData) => void;
}

export default function ReviewModal({
  open,
  onClose,
  businessId,
  businessName,
  queueUserId,
  onSuccess,
}: ReviewModalProps) {
  const [selectedRating, setSelectedRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    setSelectedRating(0);
    setHoverRating(0);
    setComment("");
    setError(null);
    onClose();
  }, [onClose]);

  const handleSubmit = async () => {
    if (selectedRating === 0) {
      setError("Please select a rating");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const svc = new ReviewService();
      const review = await svc.createReview({
        business_id: businessId,
        rating: selectedRating,
        comment: comment.trim() || null,
        ...(queueUserId ? { queue_user_id: queueUserId } : {}),
      });
      onSuccess?.(review);
      handleClose();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const activeStars = hoverRating || selectedRating;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      titleId="rv-modal-title"
      contentClassName="rv-modal"
    >
      <div className="rv-modal-header">
        <h2 id="rv-modal-title" className="rv-modal-title">
          Write a Review
        </h2>
        <button
          className="rv-modal-close"
          onClick={handleClose}
          aria-label="Close"
        >
          <svg
            width="18"
            height="18"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <p className="rv-modal-subtitle">{businessName}</p>

      <div className="rv-modal-body">
        <div className="rv-modal-section">
          <div className="rv-modal-label">Your Rating</div>
          <div
            className="rv-star-picker"
            role="radiogroup"
            aria-label="Rating"
            onMouseLeave={() => setHoverRating(0)}
          >
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                role="radio"
                aria-checked={selectedRating === star}
                aria-label={`${star} star${star > 1 ? "s" : ""}`}
                className={`rv-star-btn${star <= activeStars ? " active" : ""}`}
                onMouseEnter={() => setHoverRating(star)}
                onClick={() => setSelectedRating(star)}
              >
                ★
              </button>
            ))}
          </div>
          <div className="rv-star-hint">{STAR_HINTS[activeStars]}</div>
        </div>

        <div className="rv-modal-section">
          <label className="rv-modal-label" htmlFor="rv-comment">
            Your Comment <span style={{ fontWeight: 400, color: "#6b7d74" }}>(optional)</span>
          </label>
          <textarea
            id="rv-comment"
            className="rv-textarea"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Share your experience with this business…"
            rows={4}
            maxLength={1000}
          />
          <div className="rv-char-count">{comment.length}/1000</div>
        </div>

        {error && (
          <div className="rv-error" role="alert">
            {error}
          </div>
        )}

        <button
          className="rv-submit-btn"
          onClick={handleSubmit}
          disabled={submitting || selectedRating === 0}
        >
          {submitting ? "Submitting…" : "Submit Review"}
        </button>
      </div>
    </Modal>
  );
}
