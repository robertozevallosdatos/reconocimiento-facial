from datetime import datetime
from typing import Optional, List
from sqlmodel import SQLModel, Field, Relationship

class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(unique=True, index=True)
    password_hash: str
    is_admin: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Campo para control de vencimiento de suscripción
    subscription_expires_at: Optional[datetime] = Field(default=None)

    # Relación con la carpeta asignada (para usuarios no-admin)
    folder_id: Optional[int] = Field(default=None, foreign_key="folder.id")
    folder: Optional["Folder"] = Relationship(back_populates="users")


class Folder(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)  # Nombre del cliente / carpeta
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # Usuarios vinculados a esta carpeta
    users: List[User] = Relationship(back_populates="folder")
    
    # Archivos PDF dentro de esta carpeta
    files: List["PDFFile"] = Relationship(back_populates="folder", sa_relationship_kwargs={"cascade": "all, delete-orphan"})


class PDFFile(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    filename: str
    file_path: str
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)

    # Carpeta a la que pertenece el PDF
    folder_id: int = Field(foreign_key="folder.id")
    folder: Folder = Relationship(back_populates="files")

    # Usuario que subió el archivo
    uploaded_by_id: int = Field(foreign_key="user.id")