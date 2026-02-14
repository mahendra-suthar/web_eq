from sqlalchemy.orm import Session, load_only
from sqlalchemy import and_, or_, asc, func
from uuid import UUID
from datetime import datetime
from typing import Optional, Tuple, List, Any
from sqlalchemy.exc import SQLAlchemyError

from app.models.user import User
from app.models.role import UserRoles, Role
from app.models.queue import Queue, QueueUser
from app.schemas.auth import UserRegistrationInput
from app.schemas.user import AppointmentUserItem
from app.core.context import RequestContext
from app.utils.pagination import paginate_query


class UserService:
    def __init__(self, db: Session):
        self.db = db

    def get_user_by_id(self, user_id: UUID) -> Optional[User]:
        return self.db.query(User).filter(User.uuid == user_id).first()

    def get_user_detail(self, user_id: UUID) -> Optional[Tuple[User, List[Any]]]:
        user = self.get_user_by_id(user_id)
        if not user:
            return None

        rows = (
            self.db.query(
                Queue.uuid.label("queue_id"),
                Queue.name.label("queue_name"),
                func.count(QueueUser.uuid).label("total_appointments"),
                func.max(QueueUser.created_at).label("last_visit"),
            )
            .join(QueueUser, QueueUser.queue_id == Queue.uuid)
            .filter(QueueUser.user_id == user_id)
            .group_by(Queue.uuid, Queue.name)
            .order_by(func.max(QueueUser.created_at).desc().nullslast())
            .all()
        )
        return (user, rows)

    def get_user_by_phone(self, country_code: str, phone_number: str) -> Optional[User]:
        return (
            self.db.query(User)
            .filter(User.country_code == country_code)
            .filter(User.phone_number == phone_number)
            .first()
        )

    def get_user_by_phone_with_role(
        self, country_code: str, phone_number: str, role_name: str
    ) -> Tuple[Optional[User], bool]:        
        result = (
            self.db.query(User, Role.uuid.label('role_uuid'))
            .outerjoin(UserRoles, User.uuid == UserRoles.user_id)
            .outerjoin(Role, and_(UserRoles.role_id == Role.uuid, Role.name == role_name))
            .filter(User.country_code == country_code)
            .filter(User.phone_number == phone_number)
            .first()
        )
        
        if not result:
            return (None, False)
        
        user, role_uuid = result
        return (user, role_uuid is not None)

    def create_user(self, data: UserRegistrationInput) -> User:
        dob_datetime = None
        if data.date_of_birth:
            dob_datetime = datetime.strptime(data.date_of_birth, '%Y-%m-%d')
        
        new_user = User(
            country_code=data.country_code,
            phone_number=data.phone_number,
            full_name=data.full_name,
            email=data.email,
            date_of_birth=dob_datetime,
            gender=data.gender,
            email_verify=False
        )
        
        self.db.add(new_user)
        self.db.commit()
        self.db.refresh(new_user)
        return new_user

    def update_user_profile(self, user: User, data: UserRegistrationInput) -> User:
        """Partial update: only set fields that are present in the payload."""
        user_obj = self.db.query(User).filter(User.uuid == user.uuid).first()
        if not user_obj:
            raise ValueError("User not found in current session")
        update_data = data.model_dump(exclude_unset=True)
        for skip in ("user_type", "client_type"):
            update_data.pop(skip, None)
        for field, value in update_data.items():
            if not hasattr(user_obj, field):
                continue
            if field == "date_of_birth" and value is not None:
                value = datetime.strptime(value, "%Y-%m-%d")
            setattr(user_obj, field, value)
        try:
            self.db.commit()
            self.db.refresh(user_obj)
            return user_obj
        except SQLAlchemyError:
            self.db.rollback()
            raise


    def get_users(self, page: int, limit: int, search: str | None):
        try:
            query = (
                self.db.query(User)
                .options(load_only(
                    User.uuid,  # type: ignore
                    User.full_name,  # type: ignore
                    User.email,  # type: ignore
                    User.phone_number,  # type: ignore
                    User.country_code,  # type: ignore
                    User.created_at  # type: ignore
                ))
            )
        
            if search:
                search_text = f"%{search}%"
                query = query.filter(
                    or_(
                        User.full_name.ilike(search_text),
                        User.email.ilike(search_text),
                        User.phone_number.ilike(search_text),
                    )
                )
            
            offset = (page - 1) * limit
            query = query.order_by(asc(User.created_at))
            return query.offset(offset).limit(limit).all()

        except SQLAlchemyError:
            raise

    def get_users_with_appointments(
        self,
        business_id: Optional[UUID] = None,
        queue_id: Optional[UUID] = None,
        page: int = 1,
        limit: int = 20,
    ) -> Tuple[List[AppointmentUserItem], int]:
        base = (
            self.db.query(
                User.uuid.label("user_id"),
                User.full_name,
                User.email,
                User.country_code,
                User.phone_number,
                func.count(QueueUser.uuid).label("total_appointments"),
                func.max(QueueUser.created_at).label("last_visit_date"),
            )
            .join(QueueUser, QueueUser.user_id == User.uuid)
            .join(Queue, Queue.uuid == QueueUser.queue_id)
        )
        if business_id is not None:
            base = base.filter(Queue.merchant_id == business_id)
        else:
            base = base.filter(Queue.uuid == queue_id)

        base_grouped = base.group_by(User.uuid, User.full_name, User.email, User.country_code, User.phone_number)
        rows, total = paginate_query(
            base_grouped,
            page=page,
            limit=limit,
            order_by=func.max(QueueUser.created_at).desc(),
        )

        items: List[AppointmentUserItem] = []
        for row in rows:
            phone_number = (row.phone_number or "").strip()
            if row.country_code and phone_number:
                phone_display = f"{row.country_code} {phone_number}"
            else:
                phone_display = phone_number
            items.append(
                AppointmentUserItem(
                    user_id=str(row.user_id),
                    full_name=row.full_name,
                    email=row.email,
                    country_code=row.country_code,
                    phone_number=phone_display,
                    total_appointments=row.total_appointments or 0,
                    last_visit_date=row.last_visit_date,
                )
            )
        return items, total


