from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from fastapi import HTTPException
from typing import List
from uuid import UUID

from app.services.review_service import ReviewService
from app.schemas.review import ReviewCreateInput, ReviewData, BusinessReviewSummary


class ReviewController:
    def __init__(self, db: Session):
        self.db = db
        self.review_service = ReviewService(db)

    def create_review(self, user_id: UUID, data: ReviewCreateInput) -> ReviewData:
        try:
            # Check if user already reviewed this business
            existing = self.review_service.get_user_review_for_business(user_id, data.business_id)
            if existing:
                raise HTTPException(status_code=400, detail="You have already reviewed this business")

            review = self.review_service.create_review(user_id, data.model_dump())
            return ReviewData.from_review(review)
        except HTTPException:
            raise
        except SQLAlchemyError:
            self.db.rollback()
            raise HTTPException(status_code=500, detail="Database error")
        except Exception as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to create review: {str(e)}")

    def get_business_reviews(self, business_id: UUID, limit: int = 50, offset: int = 0) -> List[ReviewData]:
        try:
            reviews = self.review_service.get_reviews_by_business(business_id, limit, offset)
            return [ReviewData.from_review(r) for r in reviews]
        except SQLAlchemyError:
            self.db.rollback()
            raise HTTPException(status_code=500, detail="Database error")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to get reviews: {str(e)}")

    def get_business_review_summary(self, business_id: UUID) -> BusinessReviewSummary:
        try:
            avg_rating, count = self.review_service.get_review_summary_by_business(business_id)
            return BusinessReviewSummary(average_rating=avg_rating, review_count=count)
        except SQLAlchemyError:
            self.db.rollback()
            raise HTTPException(status_code=500, detail="Database error")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to get review summary: {str(e)}")
