# Architecture Pattern Guide

This document outlines the standard architecture pattern used in this project for maintaining clean separation of concerns.

## Layer Structure

```
Router → Controller → Service → Database
```

## Responsibilities

### **Router** (`app/routers/`)
- **Purpose**: HTTP endpoint definitions
- **Responsibilities**:
  - Define API routes
  - Handle HTTP request/response
  - Dependency injection (database session, etc.)
  - Call Controller methods
- **Should NOT**:
  - Contain business logic
  - Directly access services
  - Perform database operations

**Example:**
```python
@router.post("/create-user", response_model=LoginResponse)
async def create_user(
    payload: UserRegistrationInput,
    response: Response,
    request: Request,
    db: Session = Depends(get_db)
):
    controller = AuthController(db)
    return await controller.create_user(payload, response, request)
```

### **Controller** (`app/controllers/`)
- **Purpose**: Business logic and orchestration
- **Responsibilities**:
  - Implement business logic
  - Validate business rules
  - Orchestrate multiple services/controllers
  - Handle error cases and raise HTTPException
  - Transform data between layers
- **Should**:
  - Use Services for database operations
  - Use other Controllers for cross-domain business logic
  - Handle all business validation
- **Should NOT**:
  - Perform direct database queries
  - Contain SQL queries
  - Handle low-level database operations

**Example:**
```python
class RoleController:
    def __init__(self, db: Session):
        self.db = db
        self.role_service = RoleService(db)  # Use Service for DB operations
    
    def assign_role_to_user(self, user_id: uuid.UUID, role_name: str) -> UserRoles:
        # Business logic: Get or create role, check if user has it, assign if not
        role = self.get_or_create_role(role_name)
        existing_user_role = self.role_service.get_user_role(user_id, role.uuid)
        if existing_user_role:
            return existing_user_role
        return self.role_service.create_user_role(user_id, role.uuid)
```

### **Service** (`app/services/`)
- **Purpose**: Database operations only
- **Responsibilities**:
  - Perform database queries
  - Create, read, update, delete operations
  - Simple data transformations (if needed)
- **Should**:
  - Only contain database operations
  - Return model objects or simple data structures
  - Handle database errors (SQLAlchemyError)
- **Should NOT**:
  - Contain business logic
  - Make decisions (if/else for business rules)
  - Raise HTTPException (let Controller handle it)
  - Call other services for business logic

**Example:**
```python
class RoleService:
    def __init__(self, db: Session):
        self.db = db
    
    def get_role_by_name(self, name: str) -> Optional[Role]:
        return self.db.query(Role).filter(Role.name == name).first()
    
    def create_role(self, name: str, description: Optional[str] = None) -> Role:
        role = Role(uuid=uuid.uuid4(), name=name, description=description)
        self.db.add(role)
        self.db.commit()
        self.db.refresh(role)
        return role
```

## Cross-Controller Communication

When one controller needs business logic from another domain, use the other controller:

```python
class AuthController:
    def __init__(self, db: Session):
        self.role_controller = RoleController(db)  # Use Controller for business logic
    
    async def create_user(self, data: UserRegistrationInput, ...):
        user = self.user_service.create_user(data)  # Service for DB operation
        self.role_controller.assign_role_to_user(user.uuid, "CUSTOMER")  # Controller for business logic
        return await self.auth_service.generate_auth_response(user, ...)
```

## Pattern Checklist

When creating new features, follow this checklist:

### ✅ Controller Checklist
- [ ] Contains business logic and validation
- [ ] Uses Services for database operations
- [ ] Uses other Controllers for cross-domain business logic
- [ ] Handles HTTPException for errors
- [ ] No direct database queries

### ✅ Service Checklist
- [ ] Only database operations
- [ ] No business logic (no if/else for business rules)
- [ ] Returns model objects or simple data
- [ ] No HTTPException (let Controller handle)
- [ ] Simple, focused methods

### ✅ Router Checklist
- [ ] Only HTTP endpoint definitions
- [ ] Calls Controller methods
- [ ] No business logic
- [ ] Proper response models

## Examples

### ✅ Good: Controller with Business Logic
```python
# Controller
def assign_role_to_user(self, user_id: uuid.UUID, role_name: str):
    role = self.get_or_create_role(role_name)  # Business logic: get or create
    existing = self.role_service.get_user_role(user_id, role.uuid)  # DB operation
    if existing:  # Business logic: check if exists
        return existing
    return self.role_service.create_user_role(user_id, role.uuid)  # DB operation
```

### ❌ Bad: Service with Business Logic
```python
# Service - WRONG
def assign_role_to_user(self, user_id: uuid.UUID, role_name: str):
    role = self.get_or_create_role(role_name)  # Business logic in service - WRONG!
    existing = self.get_user_role(user_id, role.uuid)
    if existing:  # Business logic in service - WRONG!
        return existing
    return self.create_user_role(user_id, role.uuid)
```

### ✅ Good: Service with Only DB Operations
```python
# Service - CORRECT
def get_role_by_name(self, name: str) -> Optional[Role]:
    return self.db.query(Role).filter(Role.name == name).first()  # Only DB operation

def create_role(self, name: str, description: Optional[str] = None) -> Role:
    role = Role(uuid=uuid.uuid4(), name=name, description=description)
    self.db.add(role)
    self.db.commit()
    self.db.refresh(role)
    return role
```

## Summary

- **Router**: HTTP layer, calls Controllers
- **Controller**: Business logic layer, uses Services and other Controllers
- **Service**: Database layer, only database operations

This pattern ensures:
- Clear separation of concerns
- Easy testing (mock services in controllers)
- Maintainable code (business logic in one place)
- Reusable services (simple database operations)

