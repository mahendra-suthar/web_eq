from uuid import UUID
from typing import Optional
from sqlalchemy import asc, or_
from sqlalchemy.orm import Session, load_only
from sqlalchemy.exc import SQLAlchemyError

from app.models.employee import Employee
from app.schemas.employee import BusinessEmployeesInput, EmployeeUpdate


class EmployeeService:
    def __init__(self, db: Session):
        self.db = db

    def add_employees(self, data: BusinessEmployeesInput) -> list[Employee]:
        employees = [
            Employee(
                business_id=data.business_id,
                full_name=emp.full_name,
                email=emp.email,
                profile_picture=emp.profile_picture,
            )
            for emp in data.employees
        ]

        try:
            with self.db.begin():
                self.db.add_all(employees)

            for emp in employees:
                self.db.refresh(emp)

            return employees

        except SQLAlchemyError:
            raise

    def update_employee(self, employee_id: UUID, data: EmployeeUpdate) -> Employee:
        try:
            employee = self.db.query(Employee).filter(Employee.uuid == employee_id).first()
            
            if not employee:
                raise ValueError(f"Employee with id {employee_id} not found")

            if data.full_name is not None:
                employee.full_name = data.full_name
            if data.email is not None:
                employee.email = data.email
            if data.profile_picture is not None:
                employee.profile_picture = data.profile_picture
            
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
                    Employee.uuid, Employee.full_name, Employee.email, Employee.phone_number, 
                    Employee.country_code, Employee.is_verified, Employee.created_at
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
