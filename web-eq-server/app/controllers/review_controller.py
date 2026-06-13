import logging
from sqlalchemy.orm import Session
from fastapi import HTTPException
from typing import List, Optional
from uuid import UUID

from app.services.review_service import ReviewService
from app.services.business_service import BusinessService
from app.services.employee_service import EmployeeService
from app.schemas.review import ReviewCreateInput, ReviewData, BusinessReviewSummary, FeaturedReviewData, MyReviewsResponse

logger = logging.getLogger(__name__)


class ReviewController:
    def __init__(self, db: Session):
        self.db = db
        self.review_service = ReviewService(db)

    def create_review(self, user_id: UUID, data: ReviewCreateInput) -> ReviewData:
        try:
            existing = self.review_service.get_user_review_for_business(user_id, data.business_id)
            if existing:
                raise HTTPException(status_code=400, detail={"message": "You have already reviewed this business"})
            review = self.review_service.create_review(user_id, data.model_dump())
            return ReviewData.from_review(review)
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to create_review (user_id=%s business_id=%s)", user_id, data.business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_business_reviews(self, business_id: UUID, limit: int = 50, offset: int = 0) -> List[ReviewData]:
        try:
            reviews, _ = self.review_service.get_reviews_by_business(business_id, limit, offset)
            return [ReviewData.from_review(r) for r in reviews]
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_business_reviews (business_id=%s)", business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_business_review_summary(self, business_id: UUID) -> BusinessReviewSummary:
        try:
            avg_rating, count = self.review_service.get_review_summary_by_business(business_id)
            return BusinessReviewSummary(average_rating=avg_rating, review_count=count)
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_business_review_summary (business_id=%s)", business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_featured_reviews(self, limit: int = 6) -> List[FeaturedReviewData]:
        try:
            reviews = self.review_service.get_featured_reviews(limit)
            return [FeaturedReviewData.from_review(r) for r in reviews]
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_featured_reviews")
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_my_reviews(
        self, current_user, user_type: str, limit: int, offset: int,
        search: str | None = None, rating: int | None = None,
    ) -> MyReviewsResponse:
        try:
            review_svc = self.review_service
            profile_type = user_type.upper()

            if profile_type == "ADMIN":
                reviews, filtered_count = review_svc.get_all_reviews(limit, offset, search, rating)
                avg, total_count = review_svc.get_all_reviews_summary()

            elif profile_type == "BUSINESS":
                business_svc = BusinessService(self.db)
                business = business_svc.get_business_by_owner(current_user.uuid)
                if not business:
                    return MyReviewsResponse(reviews=[], avg_rating=0.0, review_count=0)
                reviews, filtered_count = review_svc.get_reviews_by_business(business.uuid, limit, offset, search, rating)
                avg, total_count = review_svc.get_review_summary_by_business(business.uuid)

            elif profile_type == "EMPLOYEE":
                employee_svc = EmployeeService(self.db)
                employee = employee_svc.get_employee_by_user_id(current_user.uuid)
                if not employee:
                    return MyReviewsResponse(reviews=[], avg_rating=0.0, review_count=0)
                reviews, filtered_count = review_svc.get_reviews_by_employee(employee.uuid, limit, offset, search, rating)
                avg, total_count = review_svc.get_review_summary_by_employee(employee.uuid)

            else:
                return MyReviewsResponse(reviews=[], avg_rating=0.0, review_count=0)

            return MyReviewsResponse(
                reviews=[ReviewData.from_review(r) for r in reviews],
                avg_rating=avg,
                review_count=filtered_count,
            )
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_my_reviews (user=%s)", current_user.uuid)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_my_review(
        self,
        user_id: UUID,
        business_id: Optional[UUID] = None,
        queue_user_id: Optional[UUID] = None,
    ) -> Optional[ReviewData]:
        try:
            if queue_user_id:
                review = self.review_service.get_user_review_for_appointment(user_id, queue_user_id)
            elif business_id:
                review = self.review_service.get_user_review_for_business(user_id, business_id)
            else:
                return None
            return ReviewData.from_review(review) if review else None
        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to get_my_review (user_id=%s)", user_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})
