import logging
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from fastapi import HTTPException
from uuid import UUID
from typing import List, Optional, Tuple

from app.models.review import Review
from app.models.business import Business

logger = logging.getLogger(__name__)


class ReviewService:
    def __init__(self, db: Session):
        self.db = db

    def create_review(self, user_id: UUID, data: dict) -> Review:
        try:
            review = Review(
                user_id=user_id,
                business_id=data["business_id"],
                queue_id=data.get("queue_id"),
                service_id=data.get("service_id"),
                employee_id=data.get("employee_id"),
                queue_user_id=data.get("queue_user_id"),
                rating=data["rating"],
                comment=data.get("comment"),
            )
            self.db.add(review)
            self.db.commit()
            self.db.refresh(review)
            return review
        except Exception:
            self.db.rollback()
            logger.exception("Failed to create_review (user_id=%s business_id=%s)", user_id, data.get("business_id"))
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_reviews_by_business(self, business_id: UUID, limit: int = 50, offset: int = 0) -> List[Review]:
        try:
            return (
                self.db.query(Review)
                .options(joinedload(Review.user))
                .filter(Review.business_id == business_id)
                .order_by(Review.created_at.desc())
                .offset(offset)
                .limit(limit)
                .all()
            )
        except Exception:
            logger.exception("Failed to get_reviews_by_business (business_id=%s)", business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_review_summary_by_business(self, business_id: UUID) -> Tuple[float, int]:
        try:
            result = (
                self.db.query(
                    func.coalesce(func.avg(Review.rating), 0.0),
                    func.count(Review.uuid)
                )
                .filter(Review.business_id == business_id)
                .first()
            )
            avg_rating = round(float(result[0]), 1) if result else 0.0
            count = int(result[1]) if result else 0
            return avg_rating, count
        except Exception:
            logger.exception("Failed to get_review_summary_by_business (business_id=%s)", business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_review_summaries_by_businesses(self, business_ids: List[UUID]) -> dict[UUID, Tuple[float, int]]:
        if not business_ids:
            return {}
        try:
            results = (
                self.db.query(
                    Review.business_id,
                    func.coalesce(func.avg(Review.rating), 0.0),
                    func.count(Review.uuid)
                )
                .filter(Review.business_id.in_(business_ids))
                .group_by(Review.business_id)
                .all()
            )
            summaries: dict[UUID, Tuple[float, int]] = {}
            for business_id, avg_rating, count in results:
                summaries[business_id] = (round(float(avg_rating), 1), int(count))
            return summaries
        except Exception:
            logger.exception("Failed to get_review_summaries_by_businesses")
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_user_review_for_business(self, user_id: UUID, business_id: UUID) -> Optional[Review]:
        try:
            return (
                self.db.query(Review)
                .filter(Review.user_id == user_id, Review.business_id == business_id)
                .first()
            )
        except Exception:
            logger.exception("Failed to get_user_review_for_business (user_id=%s business_id=%s)", user_id, business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_user_review_for_appointment(self, user_id: UUID, queue_user_id: UUID) -> Optional[Review]:
        try:
            return (
                self.db.query(Review)
                .filter(Review.user_id == user_id, Review.queue_user_id == queue_user_id)
                .first()
            )
        except Exception:
            logger.exception("Failed to get_user_review_for_appointment (user_id=%s queue_user_id=%s)", user_id, queue_user_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_featured_reviews(self, limit: int = 6) -> List[Review]:
        try:
            return (
                self.db.query(Review)
                .join(Business, Review.business_id == Business.uuid)
                .options(joinedload(Review.user), joinedload(Review.business))
                .filter(Review.comment.isnot(None), Review.comment != "", Review.rating >= 4)
                .order_by(Review.created_at.desc())
                .limit(limit)
                .all()
            )
        except Exception:
            logger.exception("Failed to get_featured_reviews")
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})
