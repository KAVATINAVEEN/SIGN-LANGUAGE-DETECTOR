# SL·Translate — Real-Time ASL Recognition (single-page showcase)

One page, one WebSocket, one FastAPI backend. The browser captures webcam
frames and renders results; all machine learning runs server-side:

```
Browser (HTML/CSS/JS + three.js)
  │  WS: binary JPEG frames (~12 fps)
  ▼
FastAPI ──► MediaPipe HandLandmarker (21 landmarks)
        ──► hand crop (+40 px pad) ──► 224×224 ──► ImageNet normalize
        ──► ResNet18 (best_model.pth, 99.60% test acc) ──► softmax top-3
        ──► stabilizer (majority vote + hold-to-commit letters)
  ◀── JSON: letter, confidence, top3, landmarks, bbox, committed, fps, latency
```

The page then draws a 2D overlay on the mirrored camera feed (hand skeleton +
bounding box + letter chip with confidence ring) and a three.js "3D hand
mirror" (live 21-joint hand, extruded letter pops, ambient particles).

---

## Quick start

```
start.bat          (Windows - double-click it, or run in a terminal)
./start.sh         (Linux / macOS / Git Bash)
```

**Open / close the website**

| Command | What it does |
| --- | --- |
| `start.bat` / `./start.sh` | Start the backend + frontend, open the browser automatically |
| `stop.bat` / `./stop.sh` | Stop the backend — the browser tab shows *offline* and can be closed |
| `run.bat` | Alias for `start.bat` |

`start.bat` checks the venv, installs dependencies and downloads the model on
first run, starts uvicorn on `http://127.0.0.1:8000`, waits until the model is
loaded, then opens your browser (the server console shows the live logs; close
it or run `stop.bat` to stop the server). `./start.sh` does the same in the
background with logs in `server.log`.

## Manual run

```bat
.venv\Scripts\activate
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

then open <http://127.0.0.1:8000>.

## First-time setup (if you prefer doing it by hand)

```bat
python -m venv .venv
.venv\Scripts\python -m pip install torch torchvision --extra-index-url https://download.pytorch.org/whl/cpu
.venv\Scripts\python -m pip install -r backend\requirements.txt
.venv\Scripts\python -m backend.download_models
```

Verify the model on a test image:

```bat
.venv\Scripts\python -m backend.pipeline --image path\to\hand.jpg
```

---

## Controls

| Control | What it does |
| --- | --- |
| **Start camera** / power button | Start / stop the webcam stream |
| Source dropdown | Switch between webcam and **images** (multi-select; demo fallback mode) |
| **Upload images…** / drag & drop | Pick or drop many images at once — they are recognized one after another; each thumbnail gets a result badge and the letters collect in the word bar |
| Sample thumbnails | One-click demo images on the start screen |
| Space · Backspace · Clear | Manual editing of the word being spelled |
| Copy | Copy the word to the clipboard |
| Snapshot | Save a snapshot (frame + overlay) as PNG |
| Letters | Toggle speaking each recognized letter aloud |
| Speaker (word bar) | Read the whole word aloud (Web Speech API) |
| Drag / scroll on 3D panel | Orbit and zoom the 3D hand mirror |

**How to sign:** hold one letter per ~0.7 s. There is a brief stabilization
delay on purpose — a letter is only committed after it is detected
consistently, then the same letter can't repeat until you either change the
letter or pull your hand out of the frame for a moment (that's how "LL" works).

## Demo script (mentor showcase)

1. `run.bat` → browser opens. The badge shows **ResNet18 · val 99.72% · CPU**
   (read live from your checkpoint).
2. Start camera → 3D hand mirror, bbox, letter chip + confidence ring,
   top-3 bars and fps/latency all update live.
3. Spell **H-E-L-L-O** slowly → the word bar fills → press the speaker button on
   the word bar → it says "hello".
4. Architecture talking points: browser is a thin client; FastAPI runs
   MediaPipe + ResNet18; MediaPipe's hand crop fixed the domain-shift problem
   (webcam accuracy ~10% → ~95%) reported in the paper.
5. Contingency without a camera: click any sample thumbnail on the start
   screen, or use **Upload images…** / drag & drop a batch of images — they
   run one after another and results collect in the word bar.
6. Numbers to quote: 99.60% test accuracy (12,998/13,050), best val acc
   99.72% (epoch 8), 44 MB model, trained on 87,000 ASL alphabet images.

## Performance notes

- This machine has **no NVIDIA GPU**, so inference runs on CPU:
  ~55–60 ms per frame server-side (~15 fps ceiling, streamed at ~12 fps).
- The original report's 25–30 fps was measured on an NVIDIA MX450 GPU.
  The model and accuracy are unchanged.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| "model offline" badge | `.venv\Scripts\python -m backend.download_models` |
| Camera not starting | Allow camera permission in the browser; close other apps using the webcam |
| `port 8000 already in use` | Another server is running — close it or use `--port 8001` |
| Low fps | Normal on CPU; close heavy apps; the 3D panel stays at 60 fps |
| Letters commit too fast/slow | Tune `commit_frames` / `hand_gap_s` in `backend/stabilizer.py` |
| Reference demo without a camera | Click a sample thumbnail, or **Upload images…** / drag & drop a batch of images |

## Project layout

```
backend/
  main.py            FastAPI app: /api/health, WS /ws, serves the frontend
  pipeline.py        MediaPipe -> crop -> ResNet18 -> top-3  (+ CLI test)
  stabilizer.py      majority vote + hold-to-commit letter logic
  model.py           ResNet18 + custom head (matches the checkpoint)
  download_models.py downloads best_model.pth + hand_landmarker.task
  test_client.py     WS smoke test (send an image, print the reply)
  models/            model assets (downloaded, not in git)
frontend/
  index.html         the single page
  css/style.css      light "lab" theme
  js/                camera, socket, 2D overlay, 3D scene, UI, speech, main
  assets/samples/    bundled demo images (one-click samples)
  vendor/three/      pinned three.js r166 (works offline)
run.bat                alias for start.bat
start.bat / start.sh   start everything + open the browser
stop.bat / stop.sh     stop the server (close the website)
server.log             server output when started via ./start.sh
```

## Credits

- three.js r166 (MIT), MediaPipe (Apache 2.0), FastAPI, PyTorch, OpenCV
