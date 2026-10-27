"""Download the model assets into backend/models/.

Idempotent and resumable — safe to re-run; complete files are skipped.

    python -m backend.download_models
"""
from __future__ import annotations

import shutil
from pathlib import Path

from huggingface_hub import hf_hub_download

REPO_ID = "huzaifanasirrr/realtime-sign-language-translator"
FILES = {
    "best_model.pth": 1_000_000,  # ~44 MB
    "hand_landmarker.task": 1_000_000,  # ~7.8 MB
}
MODELS_DIR = Path(__file__).resolve().parent / "models"


def main() -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    for filename, min_size in FILES.items():
        target = MODELS_DIR / filename
        if target.exists() and target.stat().st_size >= min_size:
            print(f"[skip] {filename} already present ({target.stat().st_size / 1e6:.1f} MB)")
            continue

        print(f"[down] {filename} …")
        path = hf_hub_download(repo_id=REPO_ID, filename=filename, local_dir=str(MODELS_DIR))
        if not target.exists():  # older hub versions only fill the cache
            shutil.copy(path, target)
        size = target.stat().st_size if target.exists() else 0
        print(f"       -> {target}  ({size / 1e6:.1f} MB)")

    print("done.")


if __name__ == "__main__":
    main()
