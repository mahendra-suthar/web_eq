from sqlalchemy.orm import Session
from sqlalchemy import func
from uuid import UUID
from typing import List, Optional, Tuple

from app.models.review import Review


class ReviewService:
    def __init__(self, db: Session):
        self.db = db

    def create_review(self, user_id: UUID, data: dict) -> Review:
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

    def get_reviews_by_business(self, business_id: UUID, limit: int = 50, offset: int = 0) -> List[Review]:
        return (
            self.db.query(Review)
            .filter(Review.business_id == business_id)
            .order_by(Review.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

    def get_review_summary_by_business(self, business_id: UUID) -> Tuple[float, int]:
        """Returns (average_rating, review_count) for a business"""
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

    def get_review_summaries_by_businesses(self, business_ids: List[UUID]) -> dict[UUID, Tuple[float, int]]:
        """Returns {business_id: (average_rating, review_count)} for multiple businesses in one query"""
        if not business_ids:
            return {}

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

    def get_user_review_for_business(self, user_id: UUID, business_id: UUID) -> Optional[Review]:
        return (
            self.db.query(Review)
            .filter(Review.user_id == user_id, Review.business_id == business_id)
            .first()
        )
