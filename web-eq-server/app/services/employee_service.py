import logging
import math
from uuid import UUID
from datetime import timedelta
from typing import List, Optional, Tuple
from sqlalchemy import asc, desc, or_, and_
from sqlalchemy.orm import Session, load_only, joinedload, selectinload
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException

from app.models.employee import Employee
from app.models.business import Business
from app.models.queue import Queue, QueueService
from app.schemas.employee import BusinessEmployeesInput, EmployeeUpdate
from app.core.utils import generate_invitation_code, now_utc, normalize_email, normalize_phone, normalize_country_code
from app.core.exceptions import handle_integrity_error
from app.services.schedule_service import ScheduleService

logger = logging.getLogger(__name__)


def _describe_duplicate(emp: Employee) -> dict:
    """Compact dict used in duplicate-error payloads. Avoids leaking row internals."""
    return {
        "full_name": emp.full_name,
        "email": emp.email,
        "phone_number": emp.phone_number,
        "country_code": emp.country_code,
    }


class EmployeeService:
    def __init__(self, db: Session):
        self.db = db

    def _find_duplicates(
        self,
        business_id: UUID,
        emails: set,
        phones: set,
        user_ids: set,
        exclude_uuid: Optional[UUID] = None,
    ) -> List[Employee]:
        """Return existing employees in this business that match any of the
        given email/phone/user_id values. Comparison is case-insensitive
        for email and considers (country_code, phone_number) as a pair."""
        if not (emails or phones or user_ids):
            return []

        conditions = []
        if emails:
            conditions.append(Employee.email.in_(emails))
        if phones:
            phone_conds = [
                and_(
                    Employee.phone_number == phone,
                    (Employee.country_code == cc) if cc else Employee.country_code.is_(None),
                )
                for cc, phone in phones
            ]
            conditions.extend(phone_conds)
        if user_ids:
            conditions.append(Employee.user_id.in_(user_ids))

        query = self.db.query(Employee).filter(
            Employee.business_id == business_id,
            or_(*conditions),
        )
        if exclude_uuid is not None:
            query = query.filter(Employee.uuid != exclude_uuid)
        return query.all()

    def add_employees(self, data: BusinessEmployeesInput) -> Tuple[List[Employee], List[str]]:
        # Normalize incoming data so duplicate detection is consistent
        # (lowercased emails, trimmed phones, trimmed names).
        normalized = []
        for emp in data.employees:
            normalized.append({
                "full_name": (emp.full_name or "").strip(),
                "email": normalize_email(emp.email),
                "phone_number": normalize_phone(emp.phone_number),
                "country_code": normalize_country_code(emp.country_code),
                "profile_picture": emp.profile_picture,
                "user_id": emp.user_id if emp.user_id else None,
            })

        # Detect duplicates within the incoming payload itself
        seen_emails: set = set()
        seen_phones: set = set()
        seen_users: set = set()
        in_payload_dups: List[dict] = []
        deduped_rows: List[dict] = []
        for row in normalized:
            email_key = row["email"]
            phone_key = (row["country_code"], row["phone_number"]) if row["phone_number"] else None
            user_key = str(row["user_id"]) if row["user_id"] else None
            if (
                (email_key and email_key in seen_emails)
                or (phone_key and phone_key in seen_phones)
                or (user_key and user_key in seen_users)
            ):
                in_payload_dups.append({
                    "full_name": row["full_name"],
                    "email": row["email"],
                    "phone_number": row["phone_number"],
                    "country_code": row["country_code"],
                })
                continue
            if email_key:
                seen_emails.add(email_key)
            if phone_key:
                seen_phones.add(phone_key)
            if user_key:
                seen_users.add(user_key)
            deduped_rows.append(row)

        # Detect duplicates against existing rows in the business
        phone_pairs = {
            (row["country_code"], row["phone_number"])
            for row in deduped_rows if row["phone_number"]
        }
        existing_matches = self._find_duplicates(
            business_id=data.business_id,
            emails=seen_emails,
            phones=phone_pairs,
            user_ids={row["user_id"] for row in deduped_rows if row["user_id"]},
        )

        if existing_matches or in_payload_dups:
            existing_payload = [_describe_duplicate(e) for e in existing_matches]
            logger.info(
                "add_employees blocked %d existing + %d in-payload duplicates (business_id=%s)",
                len(existing_payload), len(in_payload_dups), data.business_id,
            )
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Some employees already exist for this business.",
                    "error_code": "EMPLOYEE_DUPLICATE",
                    "existing": existing_payload,
                    "duplicates_in_request": in_payload_dups,
                },
            )

        employees = [
            Employee(
                business_id=data.business_id,
                full_name=row["full_name"],
                email=row["email"],
                phone_number=row["phone_number"],
                country_code=row["country_code"],
                profile_picture=row["profile_picture"],
                user_id=row["user_id"],
                is_verified=bool(row["user_id"]),
            )
            for row in deduped_rows
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

            # Normalize before duplicate check so comparisons match storage.
            if "email" in update_data:
                update_data["email"] = normalize_email(update_data["email"])
            if "phone_number" in update_data:
                update_data["phone_number"] = normalize_phone(update_data["phone_number"])
            if "country_code" in update_data:
                update_data["country_code"] = normalize_country_code(update_data["country_code"])
            if "full_name" in update_data and update_data["full_name"]:
                update_data["full_name"] = update_data["full_name"].strip()

            # Pre-check uniqueness within the same business when contact info changes.
            new_email = update_data.get("email", employee.email)
            new_phone = update_data.get("phone_number", employee.phone_number)
            new_country = update_data.get("country_code", employee.country_code)

            emails = {new_email} if new_email and new_email != employee.email else set()
            phones = (
                {(new_country, new_phone)}
                if new_phone and (new_phone != employee.phone_number or new_country != employee.country_code)
                else set()
            )
            if emails or phones:
                conflicts = self._find_duplicates(
                    business_id=employee.business_id,
                    emails=emails,
                    phones=phones,
                    user_ids=set(),
                    exclude_uuid=employee.uuid,
                )
                if conflicts:
                    logger.info(
                        "update_employee blocked duplicate for employee_id=%s in business_id=%s",
                        employee_id, employee.business_id,
                    )
                    raise HTTPException(
                        status_code=409,
                        detail={
                            "message": "Another employee in this business already uses this email or phone.",
                            "error_code": "EMPLOYEE_DUPLICATE",
                            "existing": [_describe_duplicate(c) for c in conflicts],
                        },
                    )

            for field, value in update_data.items():
                if hasattr(employee, field):
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
                    Employee.is_verified, Employee.queue_id, Employee.created_at,
                    Employee.invitation_code, Employee.invitation_code_expires_at,
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

            total: int = query.count()
            pages: int = math.ceil(total / limit) if total else 1
            offset = (page - 1) * limit
            items = query.order_by(desc(Employee.created_at)).offset(offset).limit(limit).all()
            return items, total, pages

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

    def regenerate_invitation_code(self, employee_id: UUID, business_id: UUID) -> Employee:
        try:
            employee = (
                self.db.query(Employee)
                .filter(Employee.uuid == employee_id, Employee.business_id == business_id)
                .first()
            )
            if not employee:
                raise HTTPException(status_code=404, detail={"message": "Employee not found"})
            if employee.is_verified:
                raise HTTPException(status_code=400, detail={"message": "Employee has already joined — no invitation code needed"})
            expires_at = now_utc() + timedelta(hours=48)
            while True:
                code = generate_invitation_code(length=8, expires_in_hours=48).upper()
                conflict = self.db.query(Employee).filter(
                    Employee.invitation_code == code,
                    Employee.uuid != employee_id,
                ).first()
                if not conflict:
                    break
            employee.invitation_code = code
            employee.invitation_code_expires_at = expires_at
            self.db.commit()
            self.db.refresh(employee)
            return employee
        except HTTPException:
            raise
        except Exception:
            self.db.rollback()
            logger.exception("Failed to regenerate_invitation_code (employee_id=%s)", employee_id)
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
