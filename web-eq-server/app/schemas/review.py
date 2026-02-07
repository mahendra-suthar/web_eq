from pydantic import BaseModel, field_validator
from typing import Optional
from uuid import UUID


class ReviewCreateInput(BaseModel):
    business_id: UUID
    queue_id: Optional[UUID] = None
    service_id: Optional[UUID] = None
    employee_id: Optional[UUID] = None
    queue_user_id: Optional[UUID] = None
    rating: float
    comment: Optional[str] = None

    @field_validator("rating")
    @classmethod
    def rating_must_be_valid(cls, value: float) -> float:
        if value < 1.0 or value > 5.0:
            raise ValueError("Rating must be between 1.0 and 5.0")
        return round(value, 1)


class ReviewData(BaseModel):
    uuid: str
    user_id: str
    business_id: str
    queue_id: Optional[str] = None
    service_id: Optional[str] = None
    employee_id: Optional[str] = None
    rating: float
    comment: Optional[str] = None
    is_verified: bool = True
    user_name: Optional[str] = None
    created_at: Optional[str] = None

    @classmethod
    def from_review(cls, review) -> "ReviewData":
        user_name = None
        if review.user:
            user_name = review.user.full_name if hasattr(review.user, 'full_name') else None

        return cls(
            uuid=str(review.uuid),
            user_id=str(review.user_id),
            business_id=str(review.business_id),
            queue_id=str(review.queue_id) if review.queue_id else None,
            service_id=str(review.service_id) if review.service_id else None,
            employee_id=str(review.employee_id) if review.employee_id else None,
            rating=review.rating,
            comment=review.comment,
            is_verified=review.is_verified,
            user_name=user_name,
            created_at=str(review.created_at) if review.created_at else None,
        )


class BusinessReviewSummary(BaseModel):
    average_rating: float
    review_count: int
