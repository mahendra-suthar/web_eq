import os
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.routers import routers
from app.db.database import engine, Base
from app.middleware.auth_middleware import AuthMiddleware

# Import all models to ensure they're registered with SQLAlchemy
from app.models import (
    User, UserLogin, Business, Category,
    Address, Schedule, Employee, Service,
    Queue, QueueUser, QueueService, QueueUserService,
    Role, UserRoles, Review
)  # noqa: F401

# Create the database schema
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Web EQ API",
    description="Web EQ Backend API",
    version="1.0.0",
)

# CORS configuration
origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.add_middleware(AuthMiddleware)
app.include_router(routers, prefix="/api")


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
