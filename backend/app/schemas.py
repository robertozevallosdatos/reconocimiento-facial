from datetime import datetime
from typing import Optional
from pydantic import BaseModel

class UserCreate(BaseModel):
    username: str
    password: str
    is_admin: bool = False
    folder_id: Optional[int] = None
    subscription_expires_at: Optional[datetime] = None
    telegram_chat_id: Optional[str] = None

class UserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    is_admin: Optional[bool] = None
    folder_id: Optional[int] = None
    subscription_expires_at: Optional[datetime] = None
    telegram_chat_id: Optional[str] = None

class UserResponse(BaseModel):
    id: int
    username: str
    is_admin: bool
    created_at: datetime
    subscription_expires_at: Optional[datetime] = None
    telegram_chat_id: Optional[str] = None
    folder_id: Optional[int] = None

    class Config:
        from_attributes = True