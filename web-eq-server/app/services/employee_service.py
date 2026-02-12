from uuid import UUID
from datetime import timedelta
from typing import List, Optional, Tuple
from sqlalchemy import asc, or_
from sqlalchemy.orm import Session, load_only
from sqlalchemy.exc import SQLAlchemyError

from app.models.employee import Employee
from app.schemas.employee import BusinessEmployeesInput, EmployeeUpdate
from app.core.utils import generate_invitation_code, now_utc


class EmployeeService:
    def __init__(self, db: Session):
        self.db = db

    def add_employees(self, data: BusinessEmployeesInput) -> Tuple[List[Employee], List[str]]:
        employees = [
            Employee(
                business_id=data.business_id,
                full_name=emp.full_name,
                email=emp.email,
                phone_number=emp.phone_number,
                country_code=emp.country_code,
                profile_picture=emp.profile_picture,
            )
            for emp in data.employees
        ]

        try:
            self.db.add_all(employees)
            self.db.flush()

            # Generate unique invitation codes (stored on employee, 48h expiry)
            codes_list = []
            while len(codes_list) < len(employees):
                c = generate_invitation_code(length=8, expires_in_hours=48).upper()
                if c not in codes_list:
                    codes_list.append(c)
            expires_at = now_utc() + timedelta(hours=48)

            for emp, code in zip(employees, codes_list):
                emp.invitation_code = code
                emp.invitation_code_expires_at = expires_at
            invitation_codes = codes_list

            self.db.commit()
            for emp in employees:
                self.db.refresh(emp)
            return employees, invitation_codes

        except SQLAlchemyError:
            self.db.rollback()
            raise

    def update_employee(self, employee_id: UUID, data: EmployeeUpdate) -> Employee:
        """Partial update: only set fields that are present in the payload."""
        employee = self.db.query(Employee).filter(Employee.uuid == employee_id).first()
        if not employee:
            raise ValueError(f"Employee with id {employee_id} not found")
        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if hasattr(employee, field):
                setattr(employee, field, value)
        try:
            self.db.commit()
            self.db.refresh(employee)
            return employee
        except SQLAlchemyError:
            self.db.rollback()
            raise

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

        except SQLAlchemyError:
            raise

    def get_employee_by_user_id(self, user_id: UUID) -> Optional[Employee]:
        """Get employee by user_id"""
        try:
            return self.db.query(Employee).filter(Employee.user_id == user_id).first()
        except SQLAlchemyError:
            raise

    def get_employee_by_phone(self, country_code: str, phone_number: str) -> Optional[Employee]:
        """Get employee by phone number and country code"""
        try:
            return self.db.query(Employee).filter(
                Employee.country_code == country_code,
                Employee.phone_number == phone_number
            ).first()
        except SQLAlchemyError:
            raise

    def get_employee_by_invitation_code(self, code: str) -> Optional[Employee]:
        """Find an employee by valid (unused, not expired) invitation code. Code is normalized (strip, uppercase)."""
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

    def activate_employee(self, employee_id: UUID, user_id: UUID) -> Employee:
        """Activate employee by linking user account, setting verification status, and clearing invitation code."""
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
        except SQLAlchemyError:
            self.db.rollback()
            raise
    
    def get_employee_by_phone_with_status(self, country_code: str, phone_number: str) -> Optional[Employee]:
        """Get employee by phone number and country code (same as get_employee_by_phone, kept for compatibility)"""
        return self.get_employee_by_phone(country_code, phone_number)