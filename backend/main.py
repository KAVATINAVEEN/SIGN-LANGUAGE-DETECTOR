"""FastAPI app — serves the single-page frontend, /api/health, and the /ws inference socket.

Run from the project root:
    python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
then open  http://127.0.0.1:8000
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path

import torch
from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles

from .pipeline import DEFAULT_LANDMARKER_PATH, DEFAULT_MODEL_PATH, SignPipeline, load_shared_model
from .stabilizer import LetterStabilizer

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

_state: dict = {"shared": None, "error": None, "device": None}


@asynccontextmanager
async def lifespan(app: FastAPI):
    torch.set_num_threads(max(1, min(8, os.cpu_count() or 4)))
    try:
        missing = [str(p) for p in (DEFAULT_MODEL_PATH, DEFAULT_LANDMARKER_PATH) if not p.exists()]
        if missing:
            raise FileNotFoundError(
                "missing model file(s): "
                + ", ".join(missing)
                + "  —  run:  python -m backend.download_models"
            )
        shared = load_shared_model(DEFAULT_MODEL_PATH)
        _state.update(shared=shared, error=None, device=str(shared["device"]))
        print(f"[backend] model ready on {shared['device']} (val_acc={shared['val_acc']:.2f}%)")
    except Exception as exc:  # keep the app up so /api/health can explain what's wrong
        _state.update(shared=None, error=str(exc), device=None)
        print(f"[backend] MODEL NOT LOADED: {exc}")
    yield


app = FastAPI(title="SL·Translate", lifespan=lifespan)


# ---------------------------------------------------------------------- #
@app.get("/api/health")
async def health() -> dict:
    shared = _state["shared"]
    return {
        "status": "ok" if shared else "degraded",
        "ready": shared is not None,
        "model": "ResNet18 (ASL A–Z)",
        "val_acc": round(shared["val_acc"], 2) if shared else None,
        "device": _state["device"],
        "torch": torch.__version__,
        "error": _state["error"],
    }


@app.websocket("/ws")
async def inference_socket(ws: WebSocket) -> None:
    await ws.accept()

    shared = _state["shared"]
    if shared is None:
        await ws.send_json({"type": "error", "error": _state["error"] or "model not loaded"})
        await ws.close(code=1011)
        return

    try:
        pipe = await asyncio.to_thread(SignPipeline, shared, DEFAULT_LANDMARKER_PATH)
    except Exception as exc:
        await ws.send_json({"type": "error", "error": f"pipeline init failed: {exc}"})
        await ws.close(code=1011)
        return

    stabilizer = LetterStabilizer()
    last_frame_ts: float | None = None
    ema_fps = 0.0

    try:
        while True:
            message = await ws.receive()
            if message["type"] == "websocket.disconnect":
                break
            data = message.get("bytes")
            if data is None:  # text/control frame
                text = message.get("text") or ""
                if text:
                    try:
                        control = json.loads(text)
                    except ValueError:
                        control = None
                    if isinstance(control, dict) and control.get("type") == "reset":
                        stabilizer = LetterStabilizer()  # fresh state for a new source
                continue

            result = await asyncio.to_thread(pipe.process_jpeg, data)

            if result.get("hand"):
                current, committed = stabilizer.update(result["letter"], result["confidence"], True)
            else:
                current, committed = stabilizer.update(None, 0.0, False)

            result["letter"] = current
            result["committed"] = committed
            result["confidence"] = round(stabilizer.current_conf, 4) if current else 0.0

            now = time.perf_counter()
            if last_frame_ts is not None:
                inst = 1.0 / max(1e-6, now - last_frame_ts)
                ema_fps = inst if ema_fps == 0.0 else 0.9 * ema_fps + 0.1 * inst
            last_frame_ts = now
            result["fps"] = round(ema_fps, 1)

            await ws.send_text(json.dumps(result))
    except Exception as exc:
        try:
            await ws.send_json({"type": "error", "error": f"socket error: {exc}"})
        except Exception:
            pass
    finally:
        await asyncio.to_thread(pipe.close)


# Mount the frontend LAST so /api/health and /ws win the route matching.
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
