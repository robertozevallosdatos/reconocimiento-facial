import os
from sqlmodel import SQLModel, create_engine, Session

# 1. Leer la URL de la base de datos desde las variables de entorno de Render
# Si no existe (en entorno local), usa SQLite como respaldo
DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    # Render entrega URLs que empiezan con "postgres://", pero SQLAlchemy requiere "postgresql://"
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    engine = create_engine(DATABASE_URL, echo=True)
else:
    # Respaldo local con SQLite para desarrollo en tu PC
    sqlite_file_name = "database.db"
    sqlite_url = f"sqlite:///{sqlite_file_name}"
    engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})

def create_db_and_tables():
    """Crea las tablas en la base de datos si no existen."""
    SQLModel.metadata.create_all(engine)

def get_session():
    """Proveedor de sesiones de base de datos para los endpoints."""
    with Session(engine) as session:
        yield session