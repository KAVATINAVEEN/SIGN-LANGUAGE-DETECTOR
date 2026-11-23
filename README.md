# SL·Translate — Real-Time ASL Recognition
### Complete Project Documentation & Capstone Report Data Source

> **One file, all data.** This README contains everything needed to fill the SR University
> capstone report template (Introduction → Literature Survey → Methodology → Results &
> Discussions → Conclusion → References). Every number below is taken from the actual
> artifacts in this repo (checkpoint, classification report, notebook outputs, figures) —
> not from marketing text. Section numbers map to report chapters in the table below.

**Project title (suggested):** *Real-Time American Sign Language Alphabet Recognition and
Finger-Spelling Translation Using ResNet18 Transfer Learning and MediaPipe Hand Detection*

| Headline result | Value |
|---|---|
| Test accuracy (13,050 images, 26 classes) | **99.60%** (12,998 correct / 52 errors) |
| Best validation accuracy | **99.72%** (epoch 8) |
| Macro precision / recall / F1 | 99.59% / 99.57% / 99.58% |
| Model | ResNet18 + custom head, **11,452,506 params** (~44 MB weights) |
| Model-only inference (MX450 GPU) | **13.09 ms ± 1.03** → 76.4 FPS |
| Deployment | FastAPI + WebSocket web app, CPU inference, 2D overlay + three.js 3D hand mirror + TTS |

---

## 📑 Report Map — template section → data location

| Capstone template section | Where in this README |
|---|---|
| 1.1 Overview of Project | §1 |
| Abstract | §1.2 (ready to paste) |
| 2.1 Existing Methods | §2.1 |
| 2.2 Motivation and Scope | §2.2 |
| 2.3 Problem Statement | §2.3 |
| 3.1 Introduction to Methodology | §3 (dataset), §4 (model), §5 (training) |
| 3.2 Theoretical Framework | §4 (ResNet / transfer learning / softmax) |
| 4.1 System Design | §7 |
| 4.2 Machine Learning Integration | §7.2–7.4 |
| 4.3 Experimental Setup | §8 |
| 4.4 Analysis of Results | §6 |
| 4.5 Code or Program | §9 + code blocks in §4–§7 |
| 5.1 Conclusion / 5.2 Future Scope | §10 |
| References | §12 |
| List of Figures / Tables | figures & tables below (numbered as you insert them) |

---

## 1. Introduction  *(Report Ch. 1)*

### 1.1 Overview
Deaf and hard-of-hearing people communicate using sign language, but most hearing people
cannot understand it, and human interpreters are scarce. This project builds a **real-time
American Sign Language (ASL) finger-spelling translator**: a webcam frames are classified
into the 26 static ASL letters (A–Z) by a deep CNN, stabilized over time, assembled into
words, and spoken aloud via text-to-speech. The system runs as a browser web app with all
ML on a FastAPI server: **MediaPipe** isolates the hand (21 landmarks), a fine-tuned
**ResNet18** classifies the hand crop, and a temporal **stabilizer** commits letters only
when held consistently — enabling reliable spelling (including double letters like "LL").

### 1.2 Abstract (draft — paste into report)
> This project presents a real-time American Sign Language alphabet recognition system
> combining transfer learning with MediaPipe hand detection. The recognition engine adopts
> publicly available ResNet18 weights (ImageNet-pretrained, fine-tuned on 60,900 Kaggle ASL
> Alphabet images across 26 classes with augmentation, Adam optimization, dropout and early
> stopping) [14]. The best checkpoint (epoch 8) reached 99.72% validation accuracy and
> **99.60% test accuracy on 13,050 held-out images** (macro F1 99.58%). To bridge the
> domain gap between plain-background training images and cluttered webcam frames, a
> MediaPipe HandLandmarker crops the hand region before classification. The model is
> deployed as a FastAPI WebSocket service with a browser front-end rendering a 2D hand
> skeleton overlay, a three.js 3D hand mirror, live confidence scores, word assembly with
> hold-to-commit stabilization, and Web Speech API text-to-speech. Model-only inference
> takes 13.09 ms on an NVIDIA MX450 GPU; the full web pipeline runs on CPU-only hardware.
> The system demonstrates that transfer learning plus hand isolation yields a practical,
> low-cost accessibility tool.

### 1.3 Objectives
1. Classify 26 static ASL letters with ≥99% test accuracy.
2. Run in real time from a webcam on consumer hardware.
3. Be robust to cluttered backgrounds (hand isolation).
4. Deliver a usable product: word building, speech output, visual feedback.

---

## 2. Literature Survey  *(Report Ch. 2)*

### 2.1 Existing methods
| Approach | Representative work | Limitation |
|---|---|---|
| Hand-crafted features (HOG/SIFT/LBP) + SVM/HMM | classic gesture recognition | fragile to lighting, background, viewpoint |
| Deep CNNs trained from scratch (AlexNet/VGG-style) | Krizhevsky 2012 [2], Simonyan 2015 [3] | need very large datasets & compute |
| **Transfer learning (ImageNet CNN fine-tuning)** | He 2016 (ResNet) [1], Pan & Yang 2010 [10] | **used in this project** — converges fast on modest data |
| Lightweight mobile CNNs | MobileNets, Howard 2017 [4] | lower accuracy ceiling |
| Depth/skeleton sensors (Kinect, leap) | skeleton-based SLR surveys [11] | extra hardware cost |
| Sequence models (LSTM / 3D-CNN / Transformer) for dynamic signs | Rastgoo 2021 [11], Adaloglou 2021 [12] | needed for motion signs (J, Z); future work here |
| Landmark-based classifiers (MediaPipe + MLP/GCN) | Zhang 2020 [6] | loses texture/appearance cues |
| Object detectors (YOLO / Faster R-CNN) for hand localization | detection-based SLR [12] | heavier than MediaPipe for single-hand use |

### 2.2 Motivation and scope
- **Motivation:** communication barrier for the deaf community; interpreters are expensive
  and unavailable on demand; a camera-only software solution is cheap and scalable.
- **Scope:** static ASL alphabet A–Z, single hand, finger-spelling → words → speech.
  Dynamic signs, two-handed signs and sentence grammar are out of scope (§10.2).

### 2.3 Problem statement
> Design and deploy a system that recognizes static ASL letters from a live webcam in real
> time with high accuracy despite background clutter and lighting variation, and converts
> the recognized letter sequence into spoken words — using only commodity hardware.

**Key technical challenge (domain shift):** the training dataset has plain backgrounds;
raw webcam frames do not. Classifying full webcam frames directly gave ~10% accuracy
(reported in the reference implementation [14]); isolating the hand with MediaPipe before
classification restores ~95% webcam accuracy (reported claim — see §6.5 caveat).

---

## 3. Dataset  *(Report §3.1 / §4.3)*

| Property | Value |
|---|---|
| Name | ASL Alphabet (Kaggle, author: Akash / grassknoted) |
| Link | <https://www.kaggle.com/datasets/grassknoted/asl-alphabet> |
| Total images | **87,000** (29 folders × 3,000: A–Z + `del`, `nothing`, `space`) |
| Classes used | **26** (A–Z); `del`/`nothing`/`space` excluded from training |
| Original format | RGB JPEG, 200×200 px, plain background, single signer |
| Model input | resized **224×224**, ImageNet-normalized |
| Split | **70 / 15 / 15**, `sklearn.train_test_split`, **`random_state=42`** (per class) |
| Train / Val / Test | **60,900 / 13,050 / 13,050** |
| Batches (batch 32) | 1,904 train / 408 val / 408 test |
| Class mapping | `class_mapping.json` (A→0 … Z→25) |

**Augmentation (training only):**

| Transform | Setting | Purpose |
|---|---|---|
| Resize | 224×224 | match ResNet input |
| RandomRotation | ±15° | orientation invariance |
| RandomAffine translate | ±10% | position invariance |
| ColorJitter | brightness/contrast/saturation ±0.2 | lighting robustness |
| RandomHorizontalFlip | p = 0.3 | variation (kept low — flips can change sign meaning) |
| Normalize | mean [0.485, 0.456, 0.406], std [0.229, 0.224, 0.225] | ImageNet statistics |

```python
# notebook 02 — exact training transforms
train_transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.RandomRotation(15),
    transforms.RandomAffine(degrees=0, translate=(0.1, 0.1)),
    transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2),
    transforms.RandomHorizontalFlip(p=0.3),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])
# val/test: Resize + ToTensor + Normalize only (no augmentation)
```

**Re-download (local `data/` folders are currently empty — see §11):**
```bash
pip install kagglehub
python -c "import kagglehub; print(kagglehub.dataset_download('grassknoted/asl-alphabet'))"
# then run notebooks/02_data_collection_and_preprocessing.ipynb (split seed 42)
```

> ⚠️ **Data note:** the saved `classification_report.txt` shows test support of **450/class
> with E, O, T at 900** (total 13,050), not a uniform 502/class. Quote the report file as
> ground truth; re-verify the split if you regenerate the dataset.

---

## 4. Model Architecture & Weights  *(Report §3.2 Theoretical Framework)*

### 4.1 Architecture
**ResNet18 (ImageNet-pretrained) + custom classification head.** Residual blocks learn
`y = F(x) + x` (skip connections), which avoids vanishing gradients and lets a deep network
train quickly [1]. Transfer learning reuses ImageNet edge/texture features; only the head
is task-specific, but **all 11.45M parameters were fine-tuned** (none frozen) [10].

```
Input 224×224×3
 └─ ResNet18 backbone (pretrained)
     conv1 7×7/64 s2 → BN → ReLU → maxpool
     layer1 2×BasicBlock(64)   layer2 2×BasicBlock(128)
     layer3 2×BasicBlock(256)  layer4 2×BasicBlock(512)
     → Global Average Pool → 512-D feature
 └─ Custom head
     Dropout(0.5) → Linear(512→512) → ReLU → Dropout(0.3) → Linear(512→26)
 └─ Softmax → 26 class probabilities (A–Z) → top-3
```

| Component | Parameters |
|---|---|
| ResNet18 backbone (minus original fc) | 11,176,512 |
| Linear 512→512 (+bias) | 262,656 |
| Linear 512→26 (+bias) | 13,338 |
| **Total (all trainable)** | **11,452,506** |

### 4.2 Model code (exact — `backend/model.py`, matches checkpoint keys)
```python
class SignLanguageModel(nn.Module):
    def __init__(self, num_classes: int = 26, pretrained: bool = False):
        super().__init__()
        self.model = models.resnet18(weights=None)   # checkpoint supplies all weights
        self.model.fc = nn.Sequential(
            nn.Dropout(0.5),
            nn.Linear(512, 512),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(512, num_classes),
        )
    def forward(self, x):
        return self.model(x)
```

### 4.3 Model weights — files, contents, links
| File | Size | Contents |
|---|---|---|
| `backend/models/best_model.pth` (used by app) | 131.2 MB | full checkpoint (below) |
| `best_model.pth` (repo root), `RealTime-Sign-Language-Translator/models/checkpoints/best_model.pth`, `.../models/saved_models/best_model.pth` | 131.2 MB each | identical copies |
| `backend/models/hand_landmarker.task` | 7.5 MB | MediaPipe HandLandmarker (float16, 21 landmarks) |

**Checkpoint keys (verified by inspection):**
`epoch = 8`, `model_state_dict`, `optimizer_state_dict` (Adam), `val_loss = 0.007666`,
`val_acc = 99.7165`, `history` (full per-epoch train/val loss & acc + LR, §5.2).

- 131 MB = weights (~44 MB = 11.45M × 4 bytes) **+ Adam optimizer state** + history.
  The "44 MB model" figure refers to weights only.
 - MediaPipe model: <https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task>
- ImageNet ResNet18 base weights: <https://download.pytorch.org/models/resnet18-f37072fd.pth>

```bash
python -m backend.download_models        # fetches both assets automatically
```
```python
# load weights
ckpt = torch.load('backend/models/best_model.pth', map_location='cpu')
model = SignLanguageModel(num_classes=26)
model.load_state_dict(ckpt['model_state_dict']); model.eval()
print(ckpt['epoch'], ckpt['val_acc'])    # 8  99.71647509578544
```

---

## 5. Training — Iterations Explained  *(Report §3.1 / §4.3)*

> This section documents how the adopted pre-trained engine was produced [14] (required
> technical background for the report). **The project's own contribution is the complete
> system built around it — §7.**

### 5.1 Hyperparameters (notebook 03)
| Item | Value |
|---|---|
| Loss | CrossEntropyLoss |
| Optimizer | Adam, lr **0.001**, weight decay **1e-4**, betas (0.9, 0.999) [7] |
| LR scheduler | ReduceLROnPlateau (mode min, factor 0.5, patience 3) — **no reduction occurred in the recorded run** (LR stayed 0.001, see §5.2) |
| Batch size | 32 |
| Max epochs / early-stop patience | 50 / 10 (early stop never triggered; stopped manually after epoch 9) |
| Regularization | Dropout 0.5 & 0.3 [8], weight decay, augmentation, BatchNorm inside ResNet [9] |
| Checkpoint rule | save `best_model.pth` whenever **val_loss improves** → saved at epochs **1, 3, 4, 8** |
| Training hardware | NVIDIA MX450 2 GB, CUDA 11.8, ~1 hour total (reported) |

### 5.2 What an "iteration" / "epoch" means here
- **1 iteration** = one forward + backward + Adam update on **1 batch = 32 images**.
- **1 epoch** = one full pass over the 60,900 training images = **1,904 iterations**,
  followed by validation over 13,050 images (408 batches, no gradient).
- Best checkpoint at epoch 8 ⇒ **8 × 1,904 = 15,232 training iterations**
  (9 epochs ran in total ≈ 17,136 iterations).

**Actual per-epoch history — extracted from the checkpoint (ground truth):**

| Epoch | Train loss | Train acc % | Val loss | Val acc % | LR | Note |
|---|---|---|---|---|---|---|
| 1 | 0.3505 | 89.03 | 0.0486 | 98.74 | 0.001 | checkpoint saved |
| 2 | 0.1311 | 96.22 | 0.0505 | 98.61 | 0.001 | |
| 3 | 0.1033 | 97.16 | 0.0283 | 99.20 | 0.001 | checkpoint saved |
| 4 | 0.0938 | 97.47 | 0.0113 | 99.69 | 0.001 | checkpoint saved |
| 5 | 0.0796 | 97.77 | 0.0208 | 99.52 | 0.001 | |
| 6 | 0.0677 | 98.11 | 0.0263 | 99.23 | 0.001 | |
| 7 | 0.0651 | 98.21 | 0.0286 | 99.32 | 0.001 | |
| **8** | **0.0578** | **98.37** | **0.0077** | **99.72** | 0.001 | **best — deployed weights** |
| 9 | ≈0.06 | ≈98.4 | ≈0.105 | ≈97.3 | 0.001 | val loss spike (overfitting); read from plot only; training stopped |

**Reading the curves:** transfer learning converges extremely fast — val acc >98.7% after
a single epoch because ImageNet features already describe edges/shapes. Train acc climbs
steadily (89→98.4%) while val acc plateaus ~99.2–99.7%; the epoch-9 val-loss spike shows
the onset of overfitting, which is exactly why the **epoch-8 best-val-loss checkpoint** is
the one deployed.

![Training history — loss, accuracy, LR (9 epochs)](RealTime-Sign-Language-Translator/outputs/visualizations/training_history.png)

### 5.3 Training loop (core, notebook 03 — abridged)
```python
criterion = nn.CrossEntropyLoss()
optimizer = optim.Adam(model.parameters(), lr=0.001, weight_decay=1e-4)
scheduler = optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode='min', factor=0.5, patience=3)
best_val_loss = float('inf')

for epoch in range(50):
    model.train()
    for images, labels in train_loader:              # 1,904 iterations / epoch
        images, labels = images.to(device), labels.to(device)
        optimizer.zero_grad()
        loss = criterion(model(images), labels)
        loss.backward(); optimizer.step()
    val_loss, val_acc = validate_epoch(model, val_loader, criterion, device)
    scheduler.step(val_loss)
    history['train_loss'].append(train_loss); history['val_acc'].append(val_acc)  # etc.
    if val_loss < best_val_loss:                     # save best checkpoint
        best_val_loss = val_loss
        torch.save({'epoch': epoch+1, 'model_state_dict': model.state_dict(),
                    'optimizer_state_dict': optimizer.state_dict(),
                    'val_loss': val_loss, 'val_acc': val_acc, 'history': history},
                   'models/checkpoints/best_model.pth')
    elif (epochs_no_improve := epochs_no_improve + 1) >= 10:
        break                                        # early stopping
```

---

## 6. Results & Analysis  *(Report Ch. 4 / §4.4)*

### 6.1 Test-set summary (13,050 held-out images)
| Metric | Value |
|---|---|
| **Accuracy** | **99.60%** (12,998 / 13,050) |
| Misclassifications | 52 |
| Precision (macro / weighted) | 99.59% / 99.61% |
| Recall (macro / weighted) | 99.57% / 99.60% |
| F1 (macro / weighted) | 99.58% / 99.60% |
| Perfect classes (F1 = 1.000) | **C, D, F, L, Q, W, Y, Z** (8 classes) |

### 6.2 Full classification report (`outputs/metrics/classification_report.txt`)
| Class | Precision | Recall | F1 | Support | | Class | Precision | Recall | F1 | Support |
|---|---|---|---|---|---|---|---|---|---|---|
| A | 0.9846 | 0.9978 | 0.9912 | 450 | | N | 0.9783 | 1.0000 | 0.9890 | 450 |
| B | 1.0000 | 0.9911 | 0.9955 | 450 | | O | 0.9945 | 0.9989 | 0.9967 | 900 |
| C | 1.0000 | 1.0000 | 1.0000 | 450 | | P | 1.0000 | 0.9911 | 0.9955 | 450 |
| D | 1.0000 | 1.0000 | 1.0000 | 450 | | Q | 1.0000 | 1.0000 | 1.0000 | 450 |
| E | 1.0000 | 0.9967 | 0.9983 | 900 | | R | 1.0000 | 0.9844 | 0.9922 | 450 |
| F | 1.0000 | 1.0000 | 1.0000 | 450 | | S | 1.0000 | 0.9978 | 0.9989 | 450 |
| G | 0.9912 | 0.9978 | 0.9945 | 450 | | T | 0.9989 | 1.0000 | 0.9994 | 900 |
| H | 0.9955 | 0.9889 | 0.9922 | 450 | | U | 0.9761 | 1.0000 | 0.9879 | 450 |
| I | 0.9956 | 0.9956 | 0.9956 | 450 | | V | 1.0000 | 0.9867 | 0.9933 | 450 |
| J | 0.9912 | 0.9956 | 0.9933 | 450 | | W | 1.0000 | 1.0000 | 1.0000 | 450 |
| K | 0.9978 | 1.0000 | 0.9989 | 450 | | X | 0.9934 | 1.0000 | 0.9967 | 450 |
| L | 1.0000 | 1.0000 | 1.0000 | 450 | | Y | 1.0000 | 1.0000 | 1.0000 | 450 |
| M | 0.9954 | 0.9667 | 0.9808 | 450 | | Z | 1.0000 | 1.0000 | 1.0000 | 450 |

Weakest classes: **M** (F1 98.08%), **U** (98.79%), **N** (98.90%), **A** (99.12%) —
all pairs of visually similar finger configurations.

### 6.3 Confusion matrix (26×26, test set)
![Confusion matrix](RealTime-Sign-Language-Translator/outputs/visualizations/confusion_matrix.png)

Strong diagonal dominance; all 52 errors broken down:

| Error (true → predicted) | Count | Cause |
|---|---|---|
| M → N | 8 | three-finger folds look alike |
| M → A | 7 | thumb tucked under fingers |
| R → U | 7 | crossed vs. together fingers |
| H → N | 5 | sideways two-finger vs. folded |
| B → T | 4 | thumb across palm |
| P → F | 4 | similar pinched fingertip |
| V → I | 3 | finger-count ambiguity at angle |
| J → I | 2 | J is motion-based; static frame ≈ I |
| 12 single errors (A→M, E→H/M/N, G→H, I→J/X, O→M, S→X, V→J/U/X) | 12 | viewpoint / lighting |

### 6.4 Qualitative results
![Sample predictions on test set — all correct, confidence ≈100%](RealTime-Sign-Language-Translator/outputs/visualizations/sample_predictions.png)

**Internet / out-of-distribution images (10 samples):** **9/10 correct (90%)**, average
confidence 100%. The single failure is the `nothing` image (no hand) predicted as **O** —
expected: the model has no "no-hand" class, so it must output some letter. The deployed
app handles this via MediaPipe (no hand → no prediction) and the stabilizer's confidence
thresholds.

![Internet image test — 9/10 correct](RealTime-Sign-Language-Translator/outputs/visualizations/internet_test_results.png)

### 6.5 Performance benchmarks
| Configuration | FPS | Latency | Accuracy | Evidence |
|---|---|---|---|---|
| Model only, MX450 GPU, 100 runs | 76.4 | **13.09 ms ± 1.03** (min 11.45 / max 17.24) | 99.60% (test set) | ✅ recorded, notebook 04 |
| Webcam, no hand detection, MX450 | 23.34 avg (1,705 frames) | — | poor (~10%, domain shift) | ✅ session recorded, notebook 04 |
| Webcam + MediaPipe, MX450 | 25–30 (claimed) | 30–35 ms (≈15 detect + 13 model + 2–7 UI) | ~95% (claimed) | ⚠️ reported in [14]; **no saved session data** (notebook 05 shows 0 frames) |
| Full web pipeline, **this CPU-only PC** | ~12 streamed | ~55–60 ms server-side | same weights | ⚠️ prose estimate, unlogged |

> **Honesty note for the report:** quote the ✅ rows as measured results; present ⚠️ rows
> as "reported in the reference implementation [14]" or re-measure them locally (§11).

---

## 7. System Design & ML Integration  *(Report §4.1 / §4.2)*

### 7.1 Architecture (deployed web app — the system built in this project)
```
Browser (HTML/CSS/JS + three.js r166)
  │  WebSocket: binary JPEG frames (~12 fps)
  ▼
FastAPI (uvicorn, 127.0.0.1:8000)
  ├─ MediaPipe HandLandmarker (VIDEO mode, 1 hand, 21 landmarks, ~15 ms)
  ├─ hand bbox + 40 px padding → crop → 224×224 → ImageNet normalize
  ├─ ResNet18 (best_model.pth, shared across connections) → softmax → top-3
  └─ LetterStabilizer (majority vote + hold-to-commit)
  ◀── JSON: letter, confidence, top3, landmarks, bbox, committed, fps, latency_ms
Browser renders:
  • 2D overlay: mirrored feed + hand skeleton + bbox + letter chip w/ confidence ring
  • three.js 3D hand mirror (21 joints, extruded letter pops, particles)
  • word bar (space/backspace/clear/copy) + Web Speech API TTS
```
- One shared torch model; **one MediaPipe instance per WebSocket** (VIDEO mode is stateful).
- Endpoints: `GET /api/health` (model status, val_acc badge), `WS /ws` (frames ↔ results),
  static frontend served at `/`.
- Result JSON fields: `type, hand, bbox [x,y,w,h normalized], landmarks [21×(x,y,z)],
  letter, confidence, top3 [[class,prob]×3], committed, fps (EMA), latency_ms`.

### 7.2 Inference pipeline code (core — `backend/pipeline.py`)
```python
detection = self.landmarker.detect_for_video(mp_image, self._ts_ms)   # MediaPipe
if detection.hand_landmarks:
    lms = detection.hand_landmarks[0]
    # bbox from landmark min/max, +40 px padding, clipped to frame
    crop = frame_rgb[y_min:y_max, x_min:x_max]
    tensor = PREPROCESS(Image.fromarray(crop)).unsqueeze(0).to(device)  # 224×224 + norm
    with torch.inference_mode():
        probs = torch.softmax(self.model(tensor), dim=1)[0]
    values, indices = torch.topk(probs, k=3)                            # top-3 letters
```
**Why MediaPipe is critical:** it removes the cluttered background so the crop matches the
plain-background training distribution — the fix for the ~10% → ~95% domain-shift gap.

### 7.3 Temporal stabilization (`backend/stabilizer.py`)
| Parameter | Value | Meaning |
|---|---|---|
| `window` | 9 frames | rolling majority-vote buffer |
| `min_conf` | 0.60 | frame counts only if conf ≥ 0.60 |
| majority rule | ≥ max(3, 60% of window) | current letter must dominate buffer |
| `commit_frames` | 6 | hold letter 6 consecutive frames (~0.5–0.7 s) to commit |
| `commit_conf` | 0.75 | average confidence gate for committing |
| `hand_gap_s` | 0.4 s | hand absent ≥ 0.4 s resets buffer & re-commit block |

Rules: a letter commits only after a consistent hold; the same letter cannot re-commit
until a different letter appears **or** the hand leaves the frame briefly — this is what
makes double letters ("LL" in HELLO) possible.

### 7.4 Frontend ML integration
- `socket.js` streams JPEG frames, applies JSON results; `overlay2d.js` draws skeleton/bbox;
  `scene3d.js` maps the 21 landmarks onto a three.js hand; `speech.js` speaks letters/words;
  `ui.js` manages the word bar; demo mode accepts uploaded images & bundled samples
  (`frontend/assets/samples/`, 8 letters) when no camera is available.

### 7.5 Technology stack
| Layer | Technology | Version / link |
|---|---|---|
| DL framework | PyTorch / torchvision | ≥2.2 (trained 2.7.1+cu118) — <https://pytorch.org> |
| Hand detection | MediaPipe Tasks (HandLandmarker) | ≥0.10 (trained 0.10.31) — <https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker> |
| Backend | FastAPI + uvicorn | ≥0.110 / ≥0.29 — <https://fastapi.tiangolo.com> |
| Image I/O | OpenCV, Pillow | 4.12 / ≥10 |
| Model hosting | huggingface_hub | ≥0.23 |
| Frontend | vanilla JS + three.js | r166 (vendored, offline) — <https://threejs.org> |
| Speech | Web Speech API | browser-native |

---

## 8. Experimental Setup  *(Report §4.3)*

**Training environment (recorded in notebook 01 outputs):**
| Item | Value |
|---|---|
| GPU | NVIDIA GeForce MX450, 2 GB VRAM (driver 577.03, CUDA 12.9 runtime / cu118 build) |
| OS / Python | Windows 11 / 3.13.7 |
| Key libs | torch 2.7.1+cu118, torchvision 0.22.1+cu118, mediapipe 0.10.31, opencv 4.12.0.88, numpy 2.2.6, pandas 2.3.2, scikit-learn 1.7.2, matplotlib 3.10.6, seaborn 0.13.2 |
| GPU utilization | training 70–80%, inference 60–70%, VRAM ~1.5/2 GB (reported) |

**Deployment environment (this machine):** CPU-only (no NVIDIA GPU), Python 3.14 venv,
torch CPU build; inference ~55–60 ms/frame; 3D panel stays at 60 fps (client-side).

**Reproduce:**
```bat
python -m venv .venv
.venv\Scripts\python -m pip install torch torchvision --extra-index-url https://download.pytorch.org/whl/cpu
.venv\Scripts\python -m pip install -r backend\requirements.txt
.venv\Scripts\python -m backend.download_models
.venv\Scripts\python -m backend.pipeline --image path\to\hand.jpg   :: single-image check
start.bat                                                          :: full web app
```
Training/evaluation reproduction: run notebooks 01→03 (needs the Kaggle dataset, §3).

---

## 9. Code & Artifact Index  *(Report §4.5)*

| Path | Purpose |
|---|---|
| `backend/main.py` | FastAPI app: `/api/health`, `/ws`, static serving, FPS EMA |
| `backend/pipeline.py` | MediaPipe → crop(+40px) → ResNet18 → top-3; CLI tester |
| `backend/stabilizer.py` | majority vote + hold-to-commit logic |
| `backend/model.py` | ResNet18 + head (matches checkpoint) |
| `backend/download_models.py` | fetch weights from Hugging Face |
| `backend/test_client.py` | WebSocket smoke test |
| `frontend/js/*.js` | camera, socket, overlay2d, scene3d, ui, speech, main |
| `notebooks/01_setup_and_data_exploration.ipynb` | env/GPU/webcam verification |
| `notebooks/02_data_collection_and_preprocessing.ipynb` | Kaggle download, split (seed 42), augmentation, loaders |
| `notebooks/03_model_building_and_training.ipynb` | model, training loop, evaluation, all figures |
| `notebooks/04_realtime_inference.ipynb` | webcam inference, 13.09 ms benchmark, internet-image test |
| `notebooks/05_hand_detection_yolo.ipynb` | MediaPipe integration (despite filename, uses MediaPipe not YOLO) |
| `outputs/metrics/classification_report.txt` | full test metrics (§6.2) |
| `outputs/visualizations/*.png` | the 4 figures in §5–§6 |
| `outputs/test_images/` | 10 internet test images (A D H J M S T W X + nothing) |
| `config.json`, `class_mapping.json` | hyperparameters & A→0…Z→25 mapping |

---

## 10. Conclusion & Future Scope  *(Report Ch. 5)*

### 10.1 Conclusion
- The adopted ResNet18 engine (transfer learning + augmentation) achieves **99.60% test
  accuracy / 99.72% val** in only **8 effective epochs (~15k iterations, ~1 h on an MX450)** —
  confirming that ImageNet features transfer strongly to hand-shape classification.
- **MediaPipe hand isolation** is the key deployment enabler: it removes background clutter
  and matches the training distribution (domain-shift fix).
- The full product — WebSocket pipeline, temporal stabilization, word assembly, 2D/3D
  visualization and TTS — runs on **CPU-only consumer hardware**, proving practicality.
- Error analysis shows remaining confusions are concentrated in visually similar static
  pairs (M/N/A, R/U, H/N) — an inherent limit of static, single-frame classification.

### 10.2 Limitations → Future work
| Limitation | Future scope |
|---|---|
| Static letters only (J, Z need motion) | LSTM/Transformer temporal models |
| Single hand | two-handed sign support |
| Single-signer dataset bias | multi-signer, diverse lighting/skin-tone data |
| Letter-by-letter only | word/sentence-level language model |
| No "no-hand" class in CNN | explicit background class / detection gating (partly solved by MediaPipe) |
| CPU latency ~55–60 ms | ONNX / TFLite quantization, mobile deployment |
| ASL only | ISL, BSL and other sign languages |

---

## 11. Data Availability & Caveats  *(read before writing the report)*

**Missing locally (must re-download / regenerate / create):**
1. **Dataset** — `data/raw/` and `data/processed/` are **empty**. Re-download (§3) to re-run
   any experiment or produce new figures.
2. `training_history.csv` — absent, but **fully recoverable** from the checkpoint `history`
   (§5.2 table is that data).
3. `Report/main.tex` (Springer LNCS report of the reference implementation) — absent; its 20+ citations
   are unavailable. Use §12 references instead.
4. `RealTime-Sign-Language-Translator.pdf` — deleted from working tree but **in git**:
   `git -C RealTime-Sign-Language-Translator restore RealTime-Sign-Language-Translator.pdf`
5. Webcam+MediaPipe benchmark & ~95% webcam accuracy — **no recorded data** (§6.5); re-measure
   or cite as reported.
6. **To create for the report:** app screenshots (2D overlay, 3D mirror, word bar), system
   design diagram image, abstract finalization, team names/roll numbers, guide name,
   plagiarism report.

**Discrepancies found (use the verified column):**
| Claim in old docs | Verified fact |
|---|---|
| 9-epoch table, LR halved at epoch 5 | checkpoint: **8 epochs, LR constant 0.001**; epoch 9 ran and overfit (plot) |
| Test split "502 per class" | report file: 450/class, E/O/T = 900 |
| "44 MB model" file | files are 131 MB (weights + optimizer); weights-only ≈ 44 MB |
| A confused with E | matrix shows A↔M, M↔N dominant |

**Environment note:** torch DLLs are currently blocked by Windows App Control in `.venv`
(`WinError 4551`) — allow them (Windows Security → App & browser control) before running
the backend or regenerating local benchmarks.

---

## 12. References & Links  *(Report References)*

1. K. He, X. Zhang, S. Ren, J. Sun, "Deep Residual Learning for Image Recognition," *CVPR*, 2016, pp. 770–778.
2. A. Krizhevsky, I. Sutskever, G. E. Hinton, "ImageNet Classification with Deep Convolutional Neural Networks," *NeurIPS*, 2012.
3. K. Simonyan, A. Zisserman, "Very Deep Convolutional Networks for Large-Scale Image Recognition," *ICLR*, 2015.
4. A. G. Howard et al., "MobileNets: Efficient Convolutional Neural Networks for Mobile Vision Applications," arXiv:1704.04861, 2017.
5. C. Lugaresi et al., "MediaPipe: A Framework for Building Perception Pipelines," arXiv:1906.08172, 2019.
6. F. Zhang et al., "MediaPipe Hands: On-device Real-time Hand Tracking," arXiv:2006.10214, 2020.
7. D. P. Kingma, J. Ba, "Adam: A Method for Stochastic Optimization," *ICLR*, 2015.
8. N. Srivastava et al., "Dropout: A Simple Way to Prevent Neural Networks from Overfitting," *JMLR* 15(1), 2014.
9. S. Ioffe, C. Szegedy, "Batch Normalization: Accelerating Deep Network Training by Reducing Internal Covariate Shift," *ICML*, 2015.
10. S. J. Pan, Q. Yang, "A Survey on Transfer Learning," *IEEE TKDE* 22(10), 2010.
11. R. Rastgoo, K. Kiani, S. Escalera, "Sign Language Recognition: A Deep Survey," *Expert Systems with Applications* 164, 2021.
12. N. Adaloglou et al., "A Comprehensive Study on Deep Learning-Based Methods for Sign Language Recognition," *IEEE Trans. Multimedia* 24, 2021.
13. J. Deng et al., "ImageNet: A Large-Scale Hierarchical Image Database," *CVPR*, 2009.
14. Akash (grassknoted), "ASL Alphabet" dataset, Kaggle. <https://www.kaggle.com/datasets/grassknoted/asl-alphabet>

---

## 13. Quick Start & Usage

```bat
start.bat      :: start backend + frontend, open browser (run.bat = alias)
stop.bat       :: stop server
```
Manual: `.venv\Scripts\activate` → `python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000` → <http://127.0.0.1:8000>

| Control | Action |
|---|---|
| Start camera / power | start/stop webcam |
| Source dropdown → Images | demo mode: upload/drag-drop many images, or click sample thumbnails |
| Space / Backspace / Clear | edit the spelled word |
| Copy / Snapshot | copy word / save PNG of frame+overlay |
| Letters / Speaker | speak each letter / speak whole word (Web Speech API) |
| Drag / scroll on 3D panel | orbit / zoom the 3D hand mirror |

**How to sign:** hold each letter ~0.7 s; pull the hand out briefly to repeat a letter ("LL").

| Problem | Fix |
|---|---|
| "model offline" badge | `python -m backend.download_models` |
| torch DLL blocked (WinError 4551) | Windows Security → App & browser control → allow, or re-create venv |
| port 8000 in use | `--port 8001` |
| low fps | normal on CPU (~12 fps stream); close heavy apps |

**Third-party assets:** pre-trained weights & reference notebooks adapted from an
open-source MIT-licensed implementation [14] (attribution retained as the license requires —
see `RealTime-Sign-Language-Translator/LICENSE`); dataset — Akash [15]; MediaPipe
(Apache 2.0), PyTorch, FastAPI, OpenCV, three.js r166 (MIT).
