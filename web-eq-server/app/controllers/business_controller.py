from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from fastapi import HTTPException
from typing import List, Optional, Dict, Tuple
from uuid import UUID
from datetime import datetime, time
from collections import defaultdict
import pytz

from app.services.business_service import BusinessService
from app.services.address_service import AddressService
from app.services.queue_service import QueueService
from app.models.address import Address, EntityType
from app.models.queue import QueueService as QueueServiceModel
from app.models.service import Service
from app.models.business import Business
from app.schemas.business import (
    BusinessBasicInfoInput, 
    BusinessData, 
    BusinessListItem,
    BusinessDetailData,
    BusinessServiceData
)
from app.controllers.role_controller import RoleController
from app.controllers.user_controller import UserController
from app.core.utils import format_time
from app.core.constants import TIMEZONE


class BusinessController:
    def __init__(self, db: Session):
        self.db = db
        self.business_service = BusinessService(db)
        self.role_controller = RoleController(db)
        self.user_controller = UserController(db)

    async def create_business_basic_info(self, data: BusinessBasicInfoInput) -> BusinessData:
        try:
            existing_business = self.business_service.get_business_by_owner(data.owner_id)
            if existing_business:
                business = self.business_service.update_business_basic_info(existing_business, data)
                return BusinessData.from_business(business)

            business = self.business_service.create_business_basic_info(data)
            self.role_controller.assign_role_to_user(data.owner_id, "BUSINESS")  # type: ignore[arg-type]
            return BusinessData.from_business(business)

        except HTTPException:
            raise
        except SQLAlchemyError:
            self.db.rollback()
            raise HTTPException(status_code=500, detail="Database error")
        except Exception as e:
            self.db.rollback()
            raise HTTPException(status_code=500, detail=f"Failed to create business: {str(e)}")

    def get_businesses(self, category_id: Optional[UUID] = None, service_ids: Optional[List[UUID]] = None) -> List[BusinessListItem]:
        try:
            results = self.business_service.get_businesses_with_services_and_addresses(
                category_id=category_id, service_ids=service_ids
            )

            if not results:
                return []

            businesses_map: Dict[UUID, Business] = {}
            services_by_business: Dict[UUID, List[Tuple[QueueServiceModel, Service]]] = defaultdict(list)
            service_seen: Dict[UUID, set] = defaultdict(set)
            addresses_by_business: Dict[UUID, Optional[Address]] = {}

            for business, queue_service, service, address in results:
                bid = business.uuid

                if bid not in businesses_map:
                    businesses_map[bid] = business

                if queue_service and service and queue_service.uuid not in service_seen[bid]:
                    services_by_business[bid].append((queue_service, service))
                    service_seen[bid].add(queue_service.uuid)

                if address and bid not in addresses_by_business:
                    addresses_by_business[bid] = address

            business_ids = list(businesses_map.keys())

            now = datetime.now(pytz.timezone(TIMEZONE))
            current_time = now.time()
            day_of_week = now.weekday()
            schedules_map = self.business_service.get_schedules_by_businesses(business_ids, day_of_week)
            review_stats = self.business_service.get_review_stats_by_businesses(business_ids)

            result = []
            for bid, business in businesses_map.items():
                services_data = services_by_business.get(bid, [])
                address = addresses_by_business.get(bid)

                is_always_open = bool(business.is_always_open)
                is_open = False
                opens_at = None
                closes_at = None

                if is_always_open:
                    is_open = True
                else:
                    schedule = schedules_map.get(bid)
                    if schedule and schedule.is_open:
                        opening = schedule.opening_time
                        closing = schedule.closing_time
                        if opening and closing:
                            is_open = opening <= current_time <= closing
                            opens_at = format_time(opening)
                            closes_at = format_time(closing)
                        else:
                            is_open = True  # is_open flag set but no times = open all day

                avg_rating, review_count = review_stats.get(bid, (0.0, 0))

                result.append(BusinessListItem.from_business(
                    business=business,
                    services_data=services_data,
                    address=address,
                    is_open=is_open,
                    is_always_open=is_always_open,
                    opens_at=opens_at,
                    closes_at=closes_at,
                    rating=avg_rating,
                    review_count=review_count,
                ))

            return result
        except SQLAlchemyError:
            self.db.rollback()
            raise HTTPException(status_code=500, detail="Database error")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to get businesses: {str(e)}")

    def get_business_details(self, business_id: UUID) -> BusinessDetailData:
        try:
            business = self.business_service.get_business_by_id(business_id)
            if not business:
                raise HTTPException(status_code=404, detail="Business not found")
            
            address_service = AddressService(self.db)
            address = address_service.get_primary_address_by_entity(EntityType.BUSINESS, business_id)
            
            return BusinessDetailData.from_business(business, address)
        except HTTPException:
            raise
        except SQLAlchemyError:
            self.db.rollback()
            raise HTTPException(status_code=500, detail="Database error")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to get business details: {str(e)}")

    def get_business_services(self, business_id: UUID) -> List[BusinessServiceData]:
        try:
            queue_service = QueueService(self.db)
            services_data = queue_service.get_business_services(business_id)
            
            return [
                BusinessServiceData.from_queue_service_and_service(queue_svc, service)
                for queue_svc, service in services_data
            ]
        except HTTPException:
            raise
        except SQLAlchemyError:
            self.db.rollback()
            raise HTTPException(status_code=500, detail="Database error")
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to get business services: {str(e)}")


