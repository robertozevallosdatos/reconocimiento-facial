import asyncio
from app.telegram_client import telegram_bridge

class JobQueue:
    def __init__(self):
        self.queue = asyncio.Queue()

    async def start_worker(self):
        while True:
            image_path, request_id, response_future = await self.queue.get()
            try:
                result_path = await telegram_bridge.process_image(image_path, request_id)
                response_future.set_result(result_path)
            except Exception as e:
                response_future.set_exception(e)
            finally:
                self.queue.task_done()

    async def enqueue(self, image_path: str, request_id: str) -> str:
        loop = asyncio.get_event_loop()
        future = loop.create_future()
        await self.queue.put((image_path, request_id, future))
        return await future

job_queue = JobQueue()