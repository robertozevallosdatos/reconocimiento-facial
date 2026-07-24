import asyncio
import uuid
import os
import base64
from telethon import TelegramClient, events
from app.config import settings

# Si estamos en la nube y no existe el archivo físico, crearlo desde la variable de entorno
session_env = os.getenv("TELEGRAM_SESSION_BASE64")
if session_env and not os.path.exists("user_session.session"):
    with open("user_session.session", "wb") as f:
        f.write(base64.b64decode(session_env))

class TelegramBridge:
    def __init__(self):
        self.client = TelegramClient(
            settings.SESSION_NAME,
            settings.TELEGRAM_API_ID,
            settings.TELEGRAM_API_HASH
        )
        self.pending_requests = {}

    async def start(self):
        await self.client.start()
        self.client.add_event_handler(self._handle_new_message, events.NewMessage(chats=settings.TARGET_BOT_USERNAME))

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
            # 1. Enviar el comando /reco primero
            await self.client.send_message(settings.TARGET_BOT_USERNAME, "/reco")
            
            # Pequeña pausa para asegurar el orden de llegada
            await asyncio.sleep(0.5)

            # 2. Enviar la imagen
            await self.client.send_file(settings.TARGET_BOT_USERNAME, image_path)

            # 3. Esperar la respuesta con el PDF
            pdf_path = await asyncio.wait_for(future, timeout=settings.TIMEOUT_SECONDS)
            return pdf_path
        finally:
            self.pending_requests.pop(request_id, None)

telegram_bridge = TelegramBridge()