import os
import uuid
import asyncio
import shutil
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlmodel import Session, select
from apscheduler.schedulers.background import BackgroundScheduler

from app.config import settings
from app.database import create_db_and_tables, engine, get_session
from app.models import User, Folder, PDFFile
from app.auth import get_password_hash, get_current_user, check_subscription_status
from app.telegram_client import telegram_bridge
from app.queue_manager import job_queue
from app.routes import auth, folders
from app.services.scheduler import check_subscriptions_and_notify  # 👈 Importamos el programador
from sqlalchemy import text

os.makedirs("uploads", exist_ok=True)
os.makedirs("downloads", exist_ok=True)

from sqlalchemy import text # 👈 Asegúrate de tener este import arriba en el archivo

@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()

    # 🔹 MIGRACIÓN AUTO-EJECUTABLE EN POSTGRESQL (RENDER)
    # Intenta agregar la columna si la base de datos ya existía en Render
    with Session(engine) as session:
        try:
            session.exec(text('ALTER TABLE "user" ADD COLUMN telegram_chat_id VARCHAR;'))
            session.commit()
            print("--> Columna telegram_chat_id agregada con éxito.")
        except Exception:
            # Si la columna ya existe, PostgreSQL lanza un error y simplemente lo ignoramos
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

    await telegram_bridge.start()
    asyncio.create_task(job_queue.start_worker())

    # 🔹 INICIAR EL PROGRAMADOR DE TAREAS PARA REVISAR VENCIMIENTOS
    scheduler = BackgroundScheduler()
    # Ejecuta la revisión todos los días a las 09:00 AM
    scheduler.add_job(check_subscriptions_and_notify, 'cron', hour=9, minute=0)
    scheduler.start()
    print("--> Tarea programada de notificación de vencimientos iniciada.")

    yield

    # Detener tareas al apagar el servidor
    scheduler.shutdown()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

        pdf_entry = PDFFile(
            filename=final_pdf_filename,
            file_path=final_pdf_path,
            folder_id=target_folder.id,
            uploaded_by_id=current_user.id
        )
        session.add(pdf_entry)
        session.commit()
        session.refresh(pdf_entry)

        background_tasks.add_task(cleanup_temp_file, temp_input_path)

        return {
            "message": "Convertido y guardado exitosamente.",
            "pdf_id": pdf_entry.id,
            "filename": final_pdf_filename,
            "folder_name": target_folder.name
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