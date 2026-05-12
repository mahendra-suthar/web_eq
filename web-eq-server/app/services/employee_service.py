import logging
from uuid import UUID
from datetime import timedelta
from typing import List, Optional, Tuple
from sqlalchemy import asc, or_
from sqlalchemy.orm import Session, load_only, joinedload, selectinload
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException

from app.models.employee import Employee
from app.models.business import Business
from app.models.queue import Queue, QueueService
from app.schemas.employee import BusinessEmployeesInput, EmployeeUpdate
from app.core.utils import generate_invitation_code, now_utc, normalize_email
from app.core.exceptions import handle_integrity_error
from app.services.schedule_service import ScheduleService

logger = logging.getLogger(__name__)


class EmployeeService:
    def __init__(self, db: Session):
        self.db = db

    def add_employees(self, data: BusinessEmployeesInput) -> Tuple[List[Employee], List[str]]:
        employees = [
            Employee(
                business_id=data.business_id,
                full_name=emp.full_name,
                email=normalize_email(emp.email),
                phone_number=emp.phone_number,
                country_code=emp.country_code,
                profile_picture=emp.profile_picture,
                user_id=emp.user_id if emp.user_id else None,
                is_verified=bool(emp.user_id),
            )
            for emp in data.employees
        ]

        try:
            self.db.add_all(employees)
            self.db.flush()

            expires_at = now_utc() + timedelta(hours=48)
            invitation_codes: List[str] = []
            used_codes: set = set()
            for emp in employees:
                if emp.user_id:
                    invitation_codes.append("")
                    continue
                while True:
                    code = generate_invitation_code(length=8, expires_in_hours=48).upper()
                    if code not in used_codes:
                        used_codes.add(code)
                        break
                emp.invitation_code = code
                emp.invitation_code_expires_at = expires_at
                invitation_codes.append(code)

            schedule_svc = ScheduleService(self.db)
            employee_ids = [emp.uuid for emp in employees]
            all_new_schedules = schedule_svc.copy_business_schedule_to_employees(
                data.business_id, employee_ids
            )

            self.db.commit()
            for emp in employees:
                self.db.refresh(emp)
            for s in all_new_schedules:
                self.db.refresh(s)
            return employees, invitation_codes

        except IntegrityError as e:
            self.db.rollback()
            handle_integrity_error(e, f"add_employees business_id={data.business_id}")
        except Exception:
            self.db.rollback()
            logger.exception("Failed to add_employees (business_id=%s)", data.business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def update_employee(self, employee_id: UUID, data: EmployeeUpdate) -> Employee:
        try:
            employee = self.db.query(Employee).filter(Employee.uuid == employee_id).first()
            if not employee:
                raise ValueError(f"Employee with id {employee_id} not found")
            update_data = data.model_dump(exclude_unset=True)
            for field, value in update_data.items():
                if hasattr(employee, field):
                    if field == "email":
                        value = normalize_email(value)
                    setattr(employee, field, value)
            self.db.commit()
            self.db.refresh(employee)
            return employee
        except (HTTPException, ValueError):
            raise
        except IntegrityError as e:
            self.db.rollback()
            handle_integrity_error(e, f"update_employee employee_id={employee_id}")
        except Exception:
            self.db.rollback()
            logger.exception("Failed to update_employee (employee_id=%s)", employee_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_employees(self, business_id: UUID, page: int, limit: int, search: str | None):
        try:
            query = (
                self.db.query(Employee)
                .options(load_only(
                    Employee.uuid, Employee.business_id, Employee.full_name, Employee.email,
                    Employee.phone_number, Employee.country_code, Employee.profile_picture,
                    Employee.is_verified, Employee.queue_id, Employee.created_at
                ))
                .filter(Employee.business_id == business_id)
            )

            if search:
                search_text = f"%{search}%"
                query = query.filter(
                    or_(
                        Employee.full_name.ilike(search_text),
                        Employee.email.ilike(search_text),
                        Employee.phone_number.ilike(search_text),
                    )
                )

            offset = (page - 1) * limit
            query = query.order_by(asc(Employee.created_at))
            return query.offset(offset).limit(limit).all()

        except Exception:
            logger.exception("Failed to get_employees (business_id=%s)", business_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_employee_by_id(self, employee_id: UUID) -> Optional[Employee]:
        try:
            return self.db.query(Employee).filter(Employee.uuid == employee_id).first()
        except Exception:
            logger.exception("Failed to get_employee_by_id (employee_id=%s)", employee_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_employee_by_id_with_relations(self, employee_id: UUID) -> Optional[Employee]:
        try:
            return (
                self.db.query(Employee)
                .options(
                    joinedload(Employee.user),
                    joinedload(Employee.queue)
                        .selectinload(Queue.queue_services)
                        .joinedload(QueueService.service),
                )
                .filter(Employee.uuid == employee_id)
                .first()
            )
        except Exception:
            logger.exception("Failed to get_employee_by_id_with_relations (employee_id=%s)", employee_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_employee_by_user_id(self, user_id: UUID) -> Optional[Employee]:
        try:
            return self.db.query(Employee).filter(Employee.user_id == user_id).first()
        except Exception:
            logger.exception("Failed to get_employee_by_user_id (user_id=%s)", user_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_employee_by_user_id_with_relations(self, user_id: UUID) -> Optional[Employee]:
        try:
            return (
                self.db.query(Employee)
                .options(
                    joinedload(Employee.business).joinedload(Business.category),
                    joinedload(Employee.queue),
                )
                .filter(Employee.user_id == user_id)
                .first()
            )
        except Exception:
            logger.exception("Failed to get_employee_by_user_id_with_relations (user_id=%s)", user_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_employee_by_uuid_and_business(self, employee_uuid: UUID, business_id: UUID) -> Optional[Employee]:
        """Fetch an employee only if they belong to the given business (ownership check)."""
        try:
            return (
                self.db.query(Employee)
                .filter(Employee.uuid == employee_uuid, Employee.business_id == business_id)
                .first()
            )
        except Exception:
            logger.exception("Failed to get_employee_by_uuid_and_business (employee_uuid=%s)", employee_uuid)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_verified_employee_by_queue(self, queue_id: UUID, business_id: UUID) -> Optional[Employee]:
        try:
            return (
                self.db.query(Employee)
                .filter(
                    Employee.queue_id == queue_id,
                    Employee.business_id == business_id,
                    Employee.user_id.isnot(None),
                )
                .first()
            )
        except Exception:
            logger.exception("Failed to get_verified_employee_by_queue (queue_id=%s)", queue_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_employee_by_phone(self, country_code: str, phone_number: str) -> Optional[Employee]:
        try:
            return self.db.query(Employee).filter(
                Employee.country_code == country_code,
                Employee.phone_number == phone_number
            ).first()
        except Exception:
            logger.exception("Failed to get_employee_by_phone (country_code=%s)", country_code)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def get_employee_by_invitation_code(self, code: str) -> Optional[Employee]:
        try:
            normalized = (code or "").strip().upper()
            if not normalized:
                return None
            return (
                self.db.query(Employee)
                .filter(
                    Employee.invitation_code == normalized,
                    Employee.invitation_code_expires_at.isnot(None),
                    Employee.invitation_code_expires_at > now_utc(),
                    Employee.user_id.is_(None),
                )
                .first()
            )
        except Exception:
            logger.exception("Failed to get_employee_by_invitation_code")
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})

    def activate_employee(self, employee_id: UUID, user_id: UUID) -> Employee:
        try:
            employee = self.db.query(Employee).filter(Employee.uuid == employee_id).first()
            if not employee:
                raise ValueError(f"Employee with id {employee_id} not found")
            employee.user_id = user_id
            employee.is_verified = True
            employee.invitation_code = None
            employee.invitation_code_expires_at = None
            self.db.commit()
            self.db.refresh(employee)
            return employee
        except (HTTPException, ValueError):
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to activate_employee (employee_id=%s)", employee_id)
            raise HTTPException(status_code=500, detail={"message": "An unexpected error occurred. Please try again."})
