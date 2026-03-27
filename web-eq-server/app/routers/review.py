from fastapi import APIRouter, Depends, Request, Query, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from uuid import UUID

from app.db.database import get_db
from app.controllers.review_controller import ReviewController
from app.schemas.review import ReviewCreateInput, ReviewData, BusinessReviewSummary
from app.middleware.permissions import get_current_user
from app.schemas.user import UserData

review_router = APIRouter()


@review_router.post("/create_review", response_model=ReviewData)
async def create_review(
    payload: ReviewCreateInput,
    current_user: UserData = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> ReviewData:
    controller: ReviewController = ReviewController(db)
    return controller.create_review(current_user.uuid, payload)


@review_router.get("/get_business_reviews/{business_id}", response_model=List[ReviewData])
async def get_business_reviews(
    business_id: UUID,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
) -> List[ReviewData]:
    controller: ReviewController = ReviewController(db)
    return controller.get_business_reviews(business_id, limit, offset)


@review_router.get("/get_business_review_summary/{business_id}", response_model=BusinessReviewSummary)
async def get_business_review_summary(
    business_id: UUID,
    db: Session = Depends(get_db)
) -> BusinessReviewSummary:
    controller: ReviewController = ReviewController(db)
    return controller.get_business_review_summary(business_id)

@review_router.get("/my_review", response_model=Optional[ReviewData])
async def get_my_review(
    business_id: Optional[UUID] = Query(None),
    queue_user_id: Optional[UUID] = Query(None),
    current_user: UserData = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Optional[ReviewData]:
    if not business_id and not queue_user_id:
        raise HTTPException(status_code=400, detail="Provide business_id or queue_user_id")
    return ReviewController(db).get_my_review(
        current_user.uuid,
        business_id=business_id,
        queue_user_id=queue_user_id,
    )
