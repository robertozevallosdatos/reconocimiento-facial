from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import get_session
from app.models import User, Folder
from app.auth import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_user,
    require_admin,
    check_subscription_status
)

router = APIRouter(prefix="/api/auth", tags=["Auth"])

# Tu nombre de usuario de Telegram para renovación
TELEGRAM_SUPPORT_URL = "https://t.me/TuUsuarioDeTelegram"  # <-- Cambia esto por tu @usuario de Telegram

class UserCreate(BaseModel):
    username: str
    password: str
    is_admin: bool = False
    folder_name: Optional[str] = None
    days_active: int = 30  # Por defecto 30 días (1 mes)

class UserResponse(BaseModel):
    id: int
    username: str
    is_admin: bool
    folder_id: Optional[int] = None
    subscription_expires_at: Optional[str] = None


@router.post("/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session)
):
    statement = select(User).where(User.username == form_data.username)
    user = session.exec(statement).first()

    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Nombre de usuario o contraseña incorrectos.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Validar si su suscripción está vencida al intentar iniciar sesión
    if not user.is_admin and user.subscription_expires_at:
        if datetime.utcnow() > user.subscription_expires_at:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "EXPIRED_SUBSCRIPTION",
                    "message": "Tu mes de acceso ha vencido. Para renovar tu suscripción, comunícate con el vendedor.",
                    "telegram_url": TELEGRAM_SUPPORT_URL
                }
            )

    access_token = create_access_token(data={"sub": user.username, "is_admin": user.is_admin})
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "is_admin": user.is_admin,
        "username": user.username
    }


@router.post("/register", response_model=UserResponse)
def register_user(
    user_data: UserCreate,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin)
):
    existing_user = session.exec(select(User).where(User.username == user_data.username)).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="El nombre de usuario ya está registrado.")

    folder_id = None
    expires_at = None

    # Configurar fecha de vencimiento si es cliente
    if not user_data.is_admin:
        expires_at = datetime.utcnow() + timedelta(days=user_data.days_active)
        
        if not user_data.folder_name:
            raise HTTPException(status_code=400, detail="Los clientes deben tener una carpeta asignada.")

        folder = session.exec(select(Folder).where(Folder.name == user_data.folder_name)).first()
        if not folder:
            folder = Folder(name=user_data.folder_name)
            session.add(folder)
            session.commit()
            session.refresh(folder)
        folder_id = folder.id

    new_user = User(
        username=user_data.username,
        password_hash=get_password_hash(user_data.password),
        is_admin=user_data.is_admin,
        folder_id=folder_id,
        subscription_expires_at=expires_at
    )
    session.add(new_user)
    session.commit()
    session.refresh(new_user)

    return UserResponse(
        id=new_user.id,
        username=new_user.username,
        is_admin=new_user.is_admin,
        folder_id=new_user.folder_id,
        subscription_expires_at=new_user.subscription_expires_at.strftime("%Y-%m-%d %H:%M:%S") if new_user.subscription_expires_at else None
    )


@router.get("/me")
def get_me(current_user: User = Depends(get_current_user)):
    # Verificar también si caducó mientras estaba logueado
    if not current_user.is_admin and current_user.subscription_expires_at:
        if datetime.utcnow() > current_user.subscription_expires_at:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "code": "EXPIRED_SUBSCRIPTION",
                    "message": "Tu mes de acceso ha vencido. Para renovar tu suscripción, comunícate con el vendedor.",
                    "telegram_url": TELEGRAM_SUPPORT_URL
                }
            )

    return {
        "id": current_user.id,
        "username": current_user.username,
        "is_admin": current_user.is_admin,
        "folder_id": current_user.folder_id,
        "subscription_expires_at": current_user.subscription_expires_at.strftime("%Y-%m-%d %H:%M:%S") if current_user.subscription_expires_at else "Ilimitado"
    }

@router.get("/users")
def list_users(
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin)
):
    """Lista todos los usuarios creados (Solo Admin)."""
    users = session.exec(select(User)).all()
    result = []
    for u in users:
        result.append({
            "id": u.id,
            "username": u.username,
            "is_admin": u.is_admin,
            "folder_name": u.folder.name if u.folder else "Sin carpeta",
            "subscription_expires_at": u.subscription_expires_at.strftime("%Y-%m-%d %H:%M:%S") if u.subscription_expires_at else "Ilimitado"
        })
    return result


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin)
):
    """Elimina un usuario de la base de datos."""
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="Usuario no encontrado.")

    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="No puedes eliminar tu propia cuenta de Administrador.")

    session.delete(user)
    session.commit()
    return {"message": "Usuario eliminado correctamente."}