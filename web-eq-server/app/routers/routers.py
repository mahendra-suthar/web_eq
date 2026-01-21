from fastapi import APIRouter

from app.routers.auth import auth_router
from app.routers.category import category_router
from app.routers.business import business_router
from app.routers.schedule import schedule_router
from app.routers.employee import employee_router
from app.routers.address import address_router
from app.routers.queue import queue_router
from app.routers.service import service_router
from app.routers.user import user_router

routers = APIRouter()

routers.include_router(auth_router, prefix="/auth", tags=["Authentication"])
routers.include_router(category_router, prefix="/category", tags=["Category"])
routers.include_router(business_router, prefix="/business", tags=["Business"])
routers.include_router(schedule_router, prefix="/schedule", tags=["Schedule"])
routers.include_router(employee_router, prefix="/employee", tags=["Employee"])
routers.include_router(address_router, prefix="/address", tags=["Address"])
routers.include_router(queue_router, prefix="/queue", tags=["Queue"])
routers.include_router(service_router, prefix="/service", tags=["Service"])
routers.include_router(user_router, prefix="/user", tags=["User"])

