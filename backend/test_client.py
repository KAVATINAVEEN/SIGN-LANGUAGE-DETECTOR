"""WebSocket smoke test — send one image to the running server, print the reply.

    python -m backend.test_client --image path\\to\\frame.jpg --frames 3
"""
from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path

import websockets


async def run(url: str, image: Path, frames: int) -> None:
    data = image.read_bytes()
    async with websockets.connect(url) as ws:
        for i in range(frames):
            await ws.send(data)
            reply = json.loads(await asyncio.wait_for(ws.recv(), timeout=60))
            print(f"--- frame {i + 1} ---")
            summary = dict(reply)
            if summary.get("landmarks"):
                summary["landmarks"] = f"[{len(summary['landmarks'])} landmarks]"
            print(json.dumps(summary, indent=2)[:1500])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="ws://127.0.0.1:8000/ws")
    parser.add_argument("--image", required=True)
    parser.add_argument("--frames", type=int, default=3)
    args = parser.parse_args()
    asyncio.run(run(args.url, Path(args.image), args.frames))


if __name__ == "__main__":
    main()
