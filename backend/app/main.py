import os
import uuid
import asyncio
import shutil
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Depends, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session, select
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import text

from app.config import settings
from app.database import create_db_and_tables, engine, get_session
from app.models import User, Folder, PDFFile
from app.auth import get_password_hash, get_current_user, check_subscription_status
from app.telegram_client import telegram_bridge
from app.queue_manager import job_queue
from app.routes import auth, folders
from app.services.scheduler import check_subscriptions_and_notify

os.makedirs("uploads", exist_ok=True)
os.makedirs("downloads", exist_ok=True)

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()

    # 🔹 MIGRACIÓN AUTO-EJECUTABLE EN POSTGRESQL (RENDER)
    with Session(engine) as session:
        try:
            session.exec(text('ALTER TABLE "user" ADD COLUMN telegram_chat_id VARCHAR;'))
            session.commit()
        except Exception:
            session.rollback()

        # Migración para agregar image_path a pdffile si no existe
        try:
            session.exec(text('ALTER TABLE "pdffile" ADD COLUMN image_path VARCHAR;'))
            session.commit()
            print("--> Columna image_path agregada a pdffile con éxito.")
        except Exception:
            session.rollback()

    # Configuración e inserción del Admin inicial
    with Session(engine) as session:
        admin_user = session.exec(select(User).where(User.username == "admin")).first()
        if not admin_user:
            default_admin = User(
                username="admin",
                password_hash=get_password_hash("admin123"),
                is_admin=True
            )
            session.add(default_admin)
            session.commit()
            print("--> Admin inicial configurado (Usuario: 'admin' / Clave: 'admin123')")

    # 🛡️ PROTECCIÓN EN EL INICIO DE TELETHON
    try:
        await telegram_bridge.start()
        print("--> Cliente Telethon (telegram_bridge) iniciado correctamente.")
    except Exception as e:
        print(f"⚠️ ADVERTENCIA: No se pudo iniciar telegram_bridge: {e}")

    asyncio.create_task(job_queue.start_worker())

    # 🔹 PROGRAMADOR DE TAREAS
    scheduler = BackgroundScheduler()
    scheduler.add_job(check_subscriptions_and_notify, 'cron', hour=9, minute=0)
    scheduler.start()
    print("--> Tarea programada de notificación de vencimientos iniciada.")

    yield

    try:
        scheduler.shutdown()
    except Exception:
        pass

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🖼️ MONTAJE DE CARPETA UPLOADS PARA VISTA PREVIA DE IMÁGENES
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.include_router(auth.router)
app.include_router(folders.router)

def cleanup_temp_file(path: str):
    if path and os.path.exists(path):
        try:
            os.remove(path)
        except Exception:
            pass

@app.post("/api/convert")
async def convert_image(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    folder_id: Optional[int] = Form(None),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    check_subscription_status(current_user)
    
    allowed_types = ["image/jpeg", "image/png", "image/jpg"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Formato no válido. Solo JPG o PNG.")

    contents = await file.read()
    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(status_code=400, detail="El archivo supera el tamaño máximo permitido.")

    target_folder: Optional[Folder] = None

    if current_user.is_admin:
        if folder_id:
            target_folder = session.get(Folder, folder_id)
            if not target_folder:
                raise HTTPException(status_code=404, detail="La carpeta seleccionada no existe.")
        else:
            raise HTTPException(status_code=400, detail="El administrador debe seleccionar una carpeta de cliente.")
    else:
        if not current_user.folder_id:
            raise HTTPException(status_code=400, detail="Tu usuario no tiene una carpeta asignada.")
        target_folder = current_user.folder

    request_id = str(uuid.uuid4())
    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "jpg"
    temp_input_path = os.path.join("uploads", f"{request_id}.{ext}")

    with open(temp_input_path, "wb") as f:
        f.write(contents)

    try:
        pdf_temp_path = await job_queue.enqueue(temp_input_path, request_id)

        folder_dir = os.path.join("downloads", target_folder.name)
        os.makedirs(folder_dir, exist_ok=True)

        final_pdf_filename = f"{os.path.splitext(file.filename)[0]}_{request_id[:6]}.pdf"
        final_pdf_path = os.path.join(folder_dir, final_pdf_filename)
        shutil.move(pdf_temp_path, final_pdf_path)

        # 🔹 Guardamos la ruta de la foto en 'image_path'
        pdf_entry = PDFFile(
            filename=final_pdf_filename,
            file_path=final_pdf_path,
            image_path=temp_input_path,
            folder_id=target_folder.id,
            uploaded_by_id=current_user.id
        )
        session.add(pdf_entry)
        session.commit()
        session.refresh(pdf_entry)

        # ⚠️ Se removió el cleanup_temp_file para conservar la imagen original y ver su vista previa

        return {
            "message": "Convertido y guardado exitosamente.",
            "pdf_id": pdf_entry.id,
            "filename": final_pdf_filename,
            "folder_name": target_folder.name,
            "image_url": f"/uploads/{os.path.basename(temp_input_path)}"
        }

    except asyncio.TimeoutError:
        background_tasks.add_task(cleanup_temp_file, temp_input_path)
        raise HTTPException(status_code=504, detail="El bot de Telegram no respondió dentro del tiempo límite.")
    except Exception as e:
        background_tasks.add_task(cleanup_temp_file, temp_input_path)
        raise HTTPException(status_code=500, detail=f"Error en el procesamiento: {str(e)}")


@app.get("/api/downloads/{pdf_id}")
def download_pdf(
    pdf_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    pdf_entry = session.get(PDFFile, pdf_id)
    if not pdf_entry:
        raise HTTPException(status_code=404, detail="Archivo PDF no encontrado.")

    if not current_user.is_admin and current_user.folder_id != pdf_entry.folder_id:
        raise HTTPException(status_code=403, detail="No tienes acceso a este archivo.")

    if not os.path.exists(pdf_entry.file_path):
        raise HTTPException(status_code=404, detail="El archivo físico no existe en el servidor.")

    return FileResponse(
        path=pdf_entry.file_path,
        filename=pdf_entry.filename,
        media_type="application/pdf"
    )


# 🗑️ NUEVA RUTA: ELIMINAR PDF Y SU IMAGEN ASOCIADA
@app.delete("/api/pdfs/{pdf_id}")
def delete_pdf(
    pdf_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    pdf_entry = session.get(PDFFile, pdf_id)
    if not pdf_entry:
        raise HTTPException(status_code=404, detail="Archivo no encontrado.")

    if not current_user.is_admin and current_user.folder_id != pdf_entry.folder_id:
        raise HTTPException(status_code=403, detail="No tienes acceso para eliminar este archivo.")

    # Eliminar PDF físico
    if pdf_entry.file_path and os.path.exists(pdf_entry.file_path):
        try:
            os.remove(pdf_entry.file_path)
        except Exception:
            pass

    # Eliminar imagen física asociada
    if pdf_entry.image_path and os.path.exists(pdf_entry.image_path):
        try:
            os.remove(pdf_entry.image_path)
        except Exception:
            pass

    session.delete(pdf_entry)
    session.commit()
    return {"message": "Archivo e imagen eliminados con éxito."}


# ✏️ NUEVA RUTA: RENOMBRAR PDF
@app.patch("/api/pdfs/{pdf_id}")
def rename_pdf(
    pdf_id: int,
    new_name: str = Body(..., embed=True),
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    pdf_entry = session.get(PDFFile, pdf_id)
    if not pdf_entry:
        raise HTTPException(status_code=404, detail="Archivo no encontrado.")

    if not current_user.is_admin and current_user.folder_id != pdf_entry.folder_id:
        raise HTTPException(status_code=403, detail="No tienes acceso para renombrar este archivo.")

    clean_name = new_name.strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="El nombre no puede estar vacío.")

    if not clean_name.endswith(".pdf"):
        clean_name += ".pdf"

    pdf_entry.filename = clean_name
    session.add(pdf_entry)
    session.commit()

    return {"message": "Nombre del archivo actualizado con éxito.", "filename": clean_name}