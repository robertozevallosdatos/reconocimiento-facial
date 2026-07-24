import asyncio
import uuid
import os
import base64
from telethon import TelegramClient, events
from app.config import settings

# 1. Crear la sesión física desde la variable de entorno Base64 si existe
session_file = f"{settings.SESSION_NAME}.session"
session_env = os.getenv("TELEGRAM_SESSION_BASE64")

if session_env and not os.path.exists(session_file):
    try:
        with open(session_file, "wb") as f:
            f.write(base64.b64decode(session_env))
    except Exception as e:
        print(f"⚠️ Error al decodificar TELEGRAM_SESSION_BASE64: {e}")

class TelegramBridge:
    def __init__(self):
        self.client = TelegramClient(
            settings.SESSION_NAME,
            settings.TELEGRAM_API_ID,
            settings.TELEGRAM_API_HASH
        )
        self.pending_requests = {}
        self.target_peer = None

    async def start(self):
        await self.client.start()

        # Asegurar formato del username
        target = str(settings.TARGET_BOT_USERNAME).strip()
        if not target.startswith("@") and not target.startswith("-100"):
            target = f"@{target}"

        # Resolver la entidad e interactuar una vez para registrar la clave
        try:
            self.target_peer = await self.client.get_input_entity(target)
            print(f"--> Conectado y registrado exitosamente con el bot destino: {target}")
        except Exception as e:
            print(f"⚠️ Error al resolver {target} con get_input_entity: {e}. Intentando dialogs...")
            # Fallback: buscar en los chats existentes
            async for dialog in self.client.iter_dialogs():
                if dialog.name == target or getattr(dialog.entity, 'username', None) == target.replace("@", ""):
                    self.target_peer = dialog.input_entity
                    break
            
            if not self.target_peer:
                self.target_peer = target

        # Escuchar únicamente los mensajes del bot objetivo
        self.client.add_event_handler(self._handle_new_message, events.NewMessage(chats=self.target_peer))

    async def _handle_new_message(self, event):
        if event.message.media and hasattr(event.message.media, 'document'):
            mime_type = getattr(event.message.media.document, 'mime_type', '')
            if 'pdf' in mime_type or event.message.file.ext == '.pdf':
                for req_id, future in list(self.pending_requests.items()):
                    if not future.done():
                        file_path = os.path.join("downloads", f"{req_id}.pdf")
                        await event.message.download_media(file_path)
                        future.set_result(file_path)
                        break

    async def process_image(self, image_path: str, request_id: str) -> str:
        loop = asyncio.get_event_loop()
        future = loop.create_future()
        self.pending_requests[request_id] = future

        try:
            target = self.target_peer or settings.TARGET_BOT_USERNAME

            # Enviar el comando /reco y luego la imagen usando la entidad resuelta
            await self.client.send_message(target, "/reco")
            await asyncio.sleep(0.5)
            await self.client.send_file(target, image_path)

            pdf_path = await asyncio.wait_for(future, timeout=settings.TIMEOUT_SECONDS)
            return pdf_path
        finally:
            self.pending_requests.pop(request_id, None)

telegram_bridge = TelegramBridge()