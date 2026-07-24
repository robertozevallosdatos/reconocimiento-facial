import os
import shutil  # Para borrar la carpeta física y sus archivos
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from app.database import get_session
from app.models import Folder, PDFFile, User
from app.auth import get_current_user, require_admin



router = APIRouter(prefix="/api/folders", tags=["Folders"])

# Esquemas Pydantic
class FolderCreate(BaseModel):
    name: str

class FolderUpdate(BaseModel):
    name: str

class PDFFileSchema(BaseModel):
    id: int
    filename: str
    file_path: str
    uploaded_at: str
    uploaded_by_id: int

class FolderDetailResponse(BaseModel):
    id: int
    name: str
    files_count: int
    files: List[PDFFileSchema]

class FolderListResponse(BaseModel):
    id: int
    name: str
    files_count: int


@router.get("", response_model=List[FolderListResponse])
def list_folders(
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin)
):
    """Lista todas las carpetas registradas (Solo Admin)."""
    folders = session.exec(select(Folder)).all()
    response = []
    for f in folders:
        response.append(FolderListResponse(
            id=f.id,
            name=f.name,
            files_count=len(f.files)
        ))
    return response


@router.post("", response_model=FolderListResponse, status_code=status.HTTP_201_CREATED)
def create_folder(
    folder_data: FolderCreate,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin)
):
    """Crea una nueva carpeta de cliente en la base de datos y en el sistema de archivos."""
    clean_name = folder_data.name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="El nombre de la carpeta no puede estar vacío.")

    existing = session.exec(select(Folder).where(Folder.name == clean_name)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe una carpeta con ese nombre.")

    # 1. Guardar en base de datos
    new_folder = Folder(name=clean_name)
    session.add(new_folder)
    session.commit()
    session.refresh(new_folder)

    # 2. Crear directorio físico en downloads/
    folder_dir = os.path.join("downloads", clean_name)
    os.makedirs(folder_dir, exist_ok=True)

    return FolderListResponse(
        id=new_folder.id,
        name=new_folder.name,
        files_count=0
    )


@router.put("/{folder_id}", response_model=FolderListResponse)
def rename_folder(
    folder_id: int,
    folder_data: FolderUpdate,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin)
):
    """Renombra una carpeta de cliente en DB y actualiza el nombre del directorio físico."""
    folder = session.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Carpeta no encontrada.")

    new_name = folder_data.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="El nombre de la carpeta no puede estar vacío.")

    if new_name == folder.name:
        return FolderListResponse(id=folder.id, name=folder.name, files_count=len(folder.files))

    existing = session.exec(select(Folder).where(Folder.name == new_name)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Ya existe otra carpeta con ese nombre.")

    old_dir = os.path.join("downloads", folder.name)
    new_dir = os.path.join("downloads", new_name)

    # Renombrar directorio físico si existe
    if os.path.exists(old_dir):
        os.rename(old_dir, new_dir)
    else:
        os.makedirs(new_dir, exist_ok=True)

    # Actualizar rutas de archivos existentes vinculados a esta carpeta en la DB
    for pdf in folder.files:
        pdf.file_path = pdf.file_path.replace(f"downloads/{folder.name}/", f"downloads/{new_name}/")
        session.add(pdf)

    # Actualizar nombre de la carpeta en DB
    folder.name = new_name
    session.add(folder)
    session.commit()
    session.refresh(folder)

    return FolderListResponse(
        id=folder.id,
        name=folder.name,
        files_count=len(folder.files)
    )


@router.get("/{folder_id}", response_model=FolderDetailResponse)
def get_folder_details(
    folder_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """Obtiene el detalle y los PDFs de una carpeta. Acceso para Admin o el Usuario asignado."""
    folder = session.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Carpeta no encontrada.")

    # Validar permisos: si no es admin, solo puede ver la carpeta si le está asignada
    if not current_user.is_admin and current_user.folder_id != folder.id:
        raise HTTPException(status_code=403, detail="No tienes acceso a esta carpeta.")

    files_list = [
        PDFFileSchema(
            id=f.id,
            filename=f.filename,
            file_path=f.file_path,
            uploaded_at=f.uploaded_at.strftime("%Y-%m-%d %H:%M:%S"),
            uploaded_by_id=f.uploaded_by_id
        )
        for f in folder.files
    ]

    return FolderDetailResponse(
        id=folder.id,
        name=folder.name,
        files_count=len(folder.files),
        files=files_list
    )

@router.delete("/{folder_id}", status_code=status.HTTP_200_OK)
def delete_folder(
    folder_id: int,
    session: Session = Depends(get_session),
    admin: User = Depends(require_admin)
):
    """Elimina una carpeta, sus archivos de la DB y su directorio físico en disco."""
    folder = session.get(Folder, folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="Carpeta no encontrada.")

    # 1. Eliminar directorio físico si existe
    folder_dir = os.path.join("downloads", folder.name)
    if os.path.exists(folder_dir):
        shutil.rmtree(folder_dir, ignore_errors=True)

    # 2. Desvincular usuarios asociados a esta carpeta
    for user in folder.users:
        user.folder_id = None
        session.add(user)

    # 3. Eliminar carpeta de la base de datos (los PDFs asociados se borran en cascada)
    session.delete(folder)
    session.commit()

    return {"message": f"Carpeta '{folder.name}' y sus archivos eliminados correctamente."}