from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from uuid import UUID

from app.db.database import get_db
from app.middleware.permissions import get_current_user, require_roles
from app.models.user import User
from app.controllers.employee_controller import EmployeeController
from app.schemas.employee import BusinessEmployeesInput, EmployeeData, EmployeeUpdate


employee_router = APIRouter()


@employee_router.post(
    "/create_employees", 
    response_model=list[EmployeeData],
    dependencies=[Depends(require_roles(["BUSINESS"]))]
)
async def create_employees(payload: BusinessEmployeesInput, db: Session = Depends(get_db)):
    controller = EmployeeController(db)
    return await controller.create_employees(payload)


@employee_router.put(
    "/update_employee/{employee_id}", 
    response_model=EmployeeData,
    dependencies=[Depends(require_roles(["BUSINESS"]))]
)
async def update_employee(employee_id: UUID, payload: EmployeeUpdate, db: Session = Depends(get_db)):
    controller = EmployeeController(db)
    return await controller.update_employee(employee_id, payload)


@employee_router.put("/update_my_profile", response_model=EmployeeData)
async def update_my_profile(
    payload: EmployeeUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    controller = EmployeeController(db)
    return await controller.update_my_profile(user, payload)


@employee_router.get(
    "/get_employees/{business_id}", 
    response_model=list[EmployeeData], 
    dependencies=[Depends(require_roles(["BUSINESS"]))]
)
async def get_employees(
    business_id: UUID, page: int = 1, limit: int = 10, search: str = "", db: Session = Depends(get_db)
):
    controller = EmployeeController(db)
    return await controller.get_employees(business_id, page, limit, search)
