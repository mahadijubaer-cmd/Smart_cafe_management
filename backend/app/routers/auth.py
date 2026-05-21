from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.schemas.user import UserCreate, UserLogin, UserResponse, Token
from app.services.auth_service import AuthService
from app.models.models import User

router = APIRouter(prefix="/auth", tags=["auth"])
auth_service = AuthService()


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(user_data: UserCreate, db: AsyncSession = Depends(get_db)):
    """Register a new user"""
    # Check if email already exists
    from sqlalchemy import select
    existing = await db.execute(select(User).where(User.email == user_data.email))
    if existing.scalar():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Hash password
    hashed_password = auth_service.hash_password(user_data.password)
    
    # Create user
    new_user = User(
        full_name=user_data.full_name,
        email=user_data.email,
        password_hash=hashed_password,
        role=user_data.role,
        student_id=user_data.student_id,
        phone=user_data.phone
    )
    
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    
    return new_user


@router.post("/login", response_model=Token)
async def login(credentials: UserLogin, db: AsyncSession = Depends(get_db)):
    """Login and get JWT token"""
    from sqlalchemy import select
    
    result = await db.execute(select(User).where(User.email == credentials.email))
    user = result.scalar()
    
    if not user or not auth_service.verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    access_token = auth_service.create_access_token({"sub": str(user.user_id), "role": user.role.value})
    
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Get current user profile"""
    return current_user
