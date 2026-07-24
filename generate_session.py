# generate_session.py
import asyncio
from telethon import TelegramClient

API_ID = 6159692  # Reemplaza con tu API ID
API_HASH = "73e90c0386344e42e3d7ee90ff833bb6"

async def main():
    client = TelegramClient('user_session', API_ID, API_HASH)
    await client.start()
    print("Sesión creada exitosamente como:", (await client.get_me()).username)
    await client.disconnect()

if __name__ == '__main__':
    asyncio.run(main())