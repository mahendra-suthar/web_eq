from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.controllers.qr_controller import QRController
from app.db.database import get_db
from app.middleware.permissions import get_current_user, require_roles
from app.models.user import User

qr_router = APIRouter()


@qr_router.get(
    "/business",
    response_class=Response,
    responses={200: {"content": {"image/png": {}}}},
    dependencies=[Depends(require_roles(["BUSINESS"]))],
)
def get_business_qr(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    png_bytes = QRController(db).get_business_qr(user)
    return Response(content=png_bytes, media_type="image/png")


@qr_router.get(
    "/employee/me",
    response_class=Response,
    responses={200: {"content": {"image/png": {}}}},
    dependencies=[Depends(require_roles(["EMPLOYEE"]))],
)
def get_my_employee_qr(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    png_bytes = QRController(db).get_my_employee_qr(user)
    return Response(content=png_bytes, media_type="image/png")


@qr_router.get(
    "/employee/{employee_uuid}",
    response_class=Response,
    responses={200: {"content": {"image/png": {}}}},
    dependencies=[Depends(require_roles(["BUSINESS"]))],
)
def get_employee_qr(
    employee_uuid: UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    png_bytes = QRController(db).get_employee_qr(employee_uuid, user)
    return Response(content=png_bytes, media_type="image/png")
