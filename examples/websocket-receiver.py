"""Minimal WebSocket receiver for testing DyCast relay output."""

import asyncio
import time

import websockets


async def echo(websocket):
    async for message in websocket:
        print(f"[{time.ctime()}] {message}")
        await websocket.send(f"服务端获取到消息: {message}")


async def main():
    print("WebSocket 服务启动成功：ws://localhost:8765")
    async with websockets.serve(echo, "localhost", 8765):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
