"""Frame -> prediction pipeline.

    JPEG bytes
      -> cv2 decode
      -> MediaPipe HandLandmarker (21 landmarks)
      -> hand bounding box (+40 px padding, model-card pipeline)
      -> resize 224x224 + ImageNet normalization
      -> ResNet18 -> softmax -> top-3

The torch model is loaded once and shared between all WebSocket connections.
The MediaPipe landmarker is stateful (VIDEO mode), so every connection gets
its own SignPipeline instance.
"""
from __future__ import annotations

import argparse
import time
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image
from torchvision import transforms

import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

from .model import SignLanguageModel

BACKEND_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL_PATH = BACKEND_DIR / "models" / "best_model.pth"
DEFAULT_LANDMARKER_PATH = BACKEND_DIR / "models" / "hand_landmarker.task"

CLASSES = [chr(65 + i) for i in range(26)]  # A..Z — matches class_mapping.json
BBOX_PAD = 40  # pixels of padding around the hand box (same as the model card)

PREPROCESS = transforms.Compose(
    [
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(
            mean=[0.485, 0.456, 0.406],
            std=[0.229, 0.224, 0.225],
        ),
    ]
)


def load_shared_model(model_path: Path | str = DEFAULT_MODEL_PATH, device: str | None = None) -> dict:
    """Load the checkpoint once. Returns a dict that is shared by all pipelines."""
    device = device or ("cuda" if torch.cuda.is_available() else "cpu")
    try:
        checkpoint = torch.load(model_path, map_location=device, weights_only=True)
    except Exception:
        checkpoint = torch.load(model_path, map_location=device, weights_only=False)

    if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
        state = checkpoint["model_state_dict"]
        val_acc = float(checkpoint.get("val_acc", 0.0))
    else:  # a raw state_dict was saved
        state = checkpoint
        val_acc = 0.0

    model = SignLanguageModel(num_classes=len(CLASSES))
    model.load_state_dict(state)
    model.to(device)
    model.eval()

    return {
        "model": model,
        "device": torch.device(device),
        "val_acc": val_acc,
        "num_classes": len(CLASSES),
    }


class SignPipeline:
    """Per-connection pipeline (one MediaPipe landmarker per WebSocket)."""

    def __init__(
        self,
        shared: dict,
        landmarker_path: Path | str = DEFAULT_LANDMARKER_PATH,
        square_crop: bool = False,
    ):
        self.model = shared["model"]
        self.device = shared["device"]
        self.val_acc = shared.get("val_acc", 0.0)
        self.square_crop = square_crop
        self._ts_ms = 0

        options = vision.HandLandmarkerOptions(
            base_options=mp_python.BaseOptions(model_asset_path=str(landmarker_path)),
            running_mode=vision.RunningMode.VIDEO,
            num_hands=1,
            min_hand_detection_confidence=0.5,
            min_hand_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.landmarker = vision.HandLandmarker.create_from_options(options)

    def close(self) -> None:
        try:
            self.landmarker.close()
        except Exception:
            pass

    # ------------------------------------------------------------------ #
    def process_jpeg(self, data: bytes) -> dict:
        t0 = time.perf_counter()
        result: dict = {
            "type": "result",
            "hand": False,
            "bbox": None,
            "landmarks": None,
            "letter": None,
            "confidence": 0.0,
            "top3": [],
            "latency_ms": 0.0,
        }

        frame_bgr = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        if frame_bgr is None:
            result["type"] = "error"
            result["error"] = "could not decode frame"
            return result

        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        h, w = frame_rgb.shape[:2]

        self._ts_ms += 33
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
        detection = self.landmarker.detect_for_video(mp_image, self._ts_ms)

        if detection.hand_landmarks:
            lms = detection.hand_landmarks[0]
            xs = [lm.x * w for lm in lms]
            ys = [lm.y * h for lm in lms]

            x_min = max(0, int(min(xs)) - BBOX_PAD)
            y_min = max(0, int(min(ys)) - BBOX_PAD)
            x_max = min(w, int(max(xs)) + BBOX_PAD)
            y_max = min(h, int(max(ys)) + BBOX_PAD)

            if self.square_crop:
                x_min, y_min, x_max, y_max = _square(x_min, y_min, x_max, y_max, w, h)

            crop = frame_rgb[y_min:y_max, x_min:x_max]
            if crop.size > 0:
                tensor = PREPROCESS(Image.fromarray(crop)).unsqueeze(0).to(self.device)
                with torch.inference_mode():
                    probs = torch.softmax(self.model(tensor), dim=1)[0]
                values, indices = torch.topk(probs, k=3)
                top3 = [
                    [CLASSES[int(i)], round(float(p), 4)]
                    for p, i in zip(values.tolist(), indices.tolist())
                ]

                result.update(
                    hand=True,
                    bbox=[
                        round(x_min / w, 4),
                        round(y_min / h, 4),
                        round((x_max - x_min) / w, 4),
                        round((y_max - y_min) / h, 4),
                    ],
                    landmarks=[
                        [round(float(lm.x), 4), round(float(lm.y), 4), round(float(lm.z), 4)]
                        for lm in lms
                    ],
                    letter=top3[0][0],
                    confidence=top3[0][1],
                    top3=top3,
                )

        result["latency_ms"] = round((time.perf_counter() - t0) * 1000.0, 1)
        return result


def _square(x_min: int, y_min: int, x_max: int, y_max: int, w: int, h: int) -> tuple[int, int, int, int]:
    """Expand the crop to a square so Resize(224) keeps the aspect ratio."""
    side = max(x_max - x_min, y_max - y_min)
    cx, cy = (x_min + x_max) // 2, (y_min + y_max) // 2
    x_min = max(0, cx - side // 2)
    y_min = max(0, cy - side // 2)
    x_max = min(w, x_min + side)
    y_max = min(h, y_min + side)
    return x_min, y_min, x_max, y_max


# ---------------------------------------------------------------------- #
def _cli() -> None:
    parser = argparse.ArgumentParser(description="Run the ASL pipeline on a single image.")
    parser.add_argument("--image", required=True, help="path to a test image containing a hand")
    parser.add_argument("--model", default=str(DEFAULT_MODEL_PATH))
    parser.add_argument("--landmarker", default=str(DEFAULT_LANDMARKER_PATH))
    parser.add_argument("--square-crop", action="store_true", help="pad the crop to a square before resize")
    args = parser.parse_args()

    shared = load_shared_model(args.model)
    print(f"device      : {shared['device']}")
    print(f"val_acc     : {shared['val_acc']:.2f}%")

    pipe = SignPipeline(shared, args.landmarker, square_crop=args.square_crop)
    try:
        data = Path(args.image).read_bytes()
        pipe._ts_ms = 1000  # first timestamp just needs to be positive
        res = pipe.process_jpeg(data)
    finally:
        pipe.close()

    if res["type"] == "error":
        raise SystemExit(f"ERROR: {res['error']}")
    print(f"hand        : {res['hand']}")
    if res["hand"]:
        print(f"bbox        : {res['bbox']}")
        print(f"prediction  : {res['letter']}  ({res['confidence'] * 100:.1f}%)")
        print("top-3       : " + ", ".join(f"{c}:{p * 100:.1f}%" for c, p in res["top3"]))
    print(f"latency     : {res['latency_ms']} ms")


if __name__ == "__main__":
    _cli()
