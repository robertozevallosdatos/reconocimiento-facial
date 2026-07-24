from datetime import datetime, timezone
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    password_hash: str
    is_admin: bool = Field(default=False)
    created_at: datetime = Field(default_factory=utc_now)

    # Campo para control de vencimiento de suscripción
    subscription_expires_at: Optional[datetime] = Field(default=None)

    # ID del chat de Telegram del usuario
    telegram_chat_id: Optional[str] = Field(default=None)

    # Relación con la carpeta asignada
    folder_id: Optional[int] = Field(default=None, foreign_key="folder.id")
    folder: Optional["Folder"] = Relationship(back_populates="users")


class Folder(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    created_at: datetime = Field(default_factory=utc_now)

    users: List[User] = Relationship(back_populates="folder")
    files: List["PDFFile"] = Relationship(back_populates="folder", sa_relationship_kwargs={"cascade": "all, delete-orphan"})


class PDFFile(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    filename: str
    file_path: str
    uploaded_at: datetime = Field(default_factory=utc_now)

    folder_id: int = Field(foreign_key="folder.id")
    folder: Folder = Relationship(back_populates="files")

    uploaded_by_id: int = Field(foreign_key="user.id")