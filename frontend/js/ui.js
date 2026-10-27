// All DOM wiring: top bar, letter chip + confidence ring, word bar,
// top-3 bars, stats, toasts, snapshot. Pure UI — no business logic.

export class UI {
  constructor({ handlers } = {}) {
    this.el = {
      connStatus: document.getElementById("conn-status"),
      connText: document.getElementById("conn-text"),
      modelBadge: document.getElementById("model-badge"),
      deviceBadge: document.getElementById("device-badge"),
      sourceSelect: document.getElementById("source-select"),
      fileInput: document.getElementById("file-input"),

      video: document.getElementById("video"),
      imagePreview: document.getElementById("image-preview"),
      camBody: document.getElementById("cam-body"),
      overlay: document.getElementById("overlay"),
      camToggle: document.getElementById("cam-toggle"),
      startBtn: document.getElementById("start-btn"),
      placeholder: document.getElementById("cam-placeholder"),
      samples: document.getElementById("samples"),
      uploadBtn: document.getElementById("upload-btn"),
      queueStrip: document.getElementById("queue-strip"),
      noHandHint: document.getElementById("no-hand-hint"),
      noHandText: document.getElementById("no-hand-text"),
      letterChip: document.getElementById("letter-chip"),
      letterNow: document.getElementById("letter-now"),
      confRing: document.getElementById("conf-ring"),
      toast: document.getElementById("toast"),
      handPill: document.getElementById("hand-pill"),

      word: document.getElementById("word"),
      speakWordBtn: document.getElementById("speak-word-btn"),
      spaceBtn: document.getElementById("space-btn"),
      backspaceBtn: document.getElementById("backspace-btn"),
      clearBtn: document.getElementById("clear-btn"),
      copyBtn: document.getElementById("copy-btn"),
      snapshotBtn: document.getElementById("snapshot-btn"),
      speakToggle: document.getElementById("speak-toggle"),

      top3: document.getElementById("top3"),
      statFps: document.getElementById("stat-fps"),
      statLat: document.getElementById("stat-lat"),
    };

    // confidence ring (r = 19 in the SVG viewBox)
    this._ringLen = 2 * Math.PI * 19;
    this.el.confRing.style.strokeDasharray = String(this._ringLen);
    this.el.confRing.style.strokeDashoffset = String(this._ringLen);

    this._letter = null;
    this._word = "";
    this._running = false;
    this._mode = "webcam"; // "webcam" | "image"
    this._mirrored = true;
    this._toastTimer = null;
    this._top3Key = "";
    this._qThumbs = [];
    this._qCount = null;

    // build the three top-3 rows once
    this._t3rows = [];
    for (let i = 0; i < 3; i++) {
      const row = document.createElement("div");
      row.className = "t3-row";
      row.innerHTML =
        '<span class="t3-label">–</span>' +
        '<div class="t3-track"><div class="t3-fill"></div></div>' +
        '<span class="t3-pct">–</span>';
      this.el.top3.appendChild(row);
      this._t3rows.push({
        label: row.querySelector(".t3-label"),
        fill: row.querySelector(".t3-fill"),
        pct: row.querySelector(".t3-pct"),
      });
    }

    this._bind(handlers || {});
  }

  // ---------------- top bar ----------------
  setModelInfo(health) {
    if (!health) return;
    const el = this.el;
    if (health.status === "ok") {
      el.modelBadge.textContent = `ResNet18 · val ${health.val_acc}%`;
      el.modelBadge.title = "checkpoint loaded (val accuracy from best_model.pth)";
      el.deviceBadge.textContent = String(health.device || "cpu").toUpperCase();
    } else {
      el.modelBadge.textContent = "model offline";
      el.modelBadge.title = health.error || "model not loaded";
      this.toast(health.error || "model not loaded — run: python -m backend.download_models", "warn");
    }
  }

  setConn(status) {
    const el = this.el.connStatus;
    el.classList.remove("ok", "closed", "connecting");
    if (status === "open") {
      el.classList.add("ok");
      this.el.connText.textContent = "live";
    } else if (status === "connecting") {
      el.classList.add("connecting");
      this.el.connText.textContent = "connecting…";
    } else {
      el.classList.add("closed");
      this.el.connText.textContent = "offline";
    }
  }

  // ---------------- per frame ----------------
  update(msg) {
    const el = this.el;
    const hand = !!msg.hand;

    el.handPill.textContent = hand ? "hand detected" : "no hand";
    el.handPill.classList.toggle("pill-on", hand);

    // letter chip + confidence ring
    if (msg.letter) {
      if (this._letter !== msg.letter) {
        this._letter = msg.letter;
        el.letterNow.textContent = msg.letter;
        el.letterChip.classList.remove("flip");
        void el.letterChip.offsetWidth; // restart the animation
        el.letterChip.classList.add("flip");
        const hue = ((((msg.letter.charCodeAt(0) - 65) % 26) + 26) % 26) / 26 * 360;
        el.letterChip.style.setProperty("--letter-hue", hue.toFixed(0));
      }
      el.letterChip.hidden = false;
      const conf = Math.max(0, Math.min(1, msg.confidence || 0));
      el.confRing.style.strokeDashoffset = String(this._ringLen * (1 - conf));
    } else {
      this._letter = null;
      el.letterChip.hidden = true;
    }

    el.noHandHint.hidden = !(this._running && !hand);

    // top-3 bars (update only when values change)
    const top3 = msg.top3 || [];
    const key = top3.map(([c, p]) => `${c}:${p}`).join("|");
    if (key !== this._top3Key) {
      this._top3Key = key;
      for (let i = 0; i < 3; i++) {
        const row = this._t3rows[i];
        const pair = top3[i];
        if (pair) {
          row.label.textContent = pair[0];
          row.pct.textContent = `${(pair[1] * 100).toFixed(1)}%`;
          row.fill.style.width = `${Math.max(2, pair[1] * 100)}%`;
        } else {
          row.label.textContent = "–";
          row.pct.textContent = "–";
          row.fill.style.width = "0%";
        }
      }
    }

    // stats
    if (typeof msg.fps === "number") el.statFps.textContent = `${msg.fps.toFixed(1)} fps`;
    if (typeof msg.latency_ms === "number") el.statLat.textContent = `${msg.latency_ms.toFixed(0)} ms`;
  }

  // ---------------- stage (video / image) ----------------
  setStageMode(mode) {
    this._mode = mode;
    const imageMode = mode === "image";
    this.el.imagePreview.hidden = !imageMode;
    this.el.video.hidden = imageMode;
    this.el.noHandText.textContent = imageMode ? "no hand found in the image" : "show your hand";
  }

  setImagePreview(url) {
    this.el.imagePreview.src = url;
  }

  setMirrored(mirrored) {
    this._mirrored = !!mirrored;
    this.el.camBody.classList.toggle("mirrored", this._mirrored);
  }

  buildSamples(samples, onPick) {
    const box = this.el.samples;
    if (!box || !samples || !samples.length) return;

    const label = document.createElement("span");
    label.className = "samples-label";
    label.textContent = "or try a sample:";

    const row = document.createElement("div");
    row.className = "samples-row";

    for (const sample of samples) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "sample-thumb";
      btn.title = `Recognize the ASL letter “${sample.letter}”`;

      const img = document.createElement("img");
      img.src = sample.src;
      img.alt = `ASL letter ${sample.letter}`;
      img.loading = "lazy";

      const tag = document.createElement("b");
      tag.textContent = sample.letter;

      btn.append(img, tag);
      btn.addEventListener("click", () => onPick && onPick(sample.src));
      row.appendChild(btn);
    }

    box.append(label, row);
    box.hidden = false;
  }

  // ---------------- image batch queue ----------------
  buildQueue(items, onPick) {
    const strip = this.el.queueStrip;
    if (!strip) return;
    strip.textContent = "";
    this._qThumbs = [];

    const count = document.createElement("span");
    count.className = "queue-count";
    count.textContent = `1/${items.length}`;
    strip.appendChild(count);
    this._qCount = count;

    items.forEach((item, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "queue-thumb";
      btn.title = item.name || `image ${i + 1}`;

      const img = document.createElement("img");
      img.src = item.url;
      img.alt = item.name || `image ${i + 1}`;

      btn.appendChild(img);
      btn.addEventListener("click", () => onPick && onPick(i));
      strip.appendChild(btn);
      this._qThumbs.push(btn);
    });

    strip.hidden = false;
  }

  setQueueIndex(index, total) {
    if (this._qCount) this._qCount.textContent = `${index + 1}/${total}`;
    this._qThumbs.forEach((btn, i) => btn.classList.toggle("current", i === index));
    const cur = this._qThumbs[index];
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest", inline: "center" });
  }

  setQueueResult(index, letter) {
    const btn = this._qThumbs[index];
    if (!btn) return;
    const existing = btn.querySelector("b");
    if (existing) existing.remove();
    btn.classList.remove("done", "miss");
    if (typeof letter === "string") {
      const tag = document.createElement("b");
      tag.textContent = letter;
      btn.appendChild(tag);
      btn.classList.add("done");
    } else if (letter === null) {
      const tag = document.createElement("b");
      tag.className = "miss";
      tag.textContent = "–";
      btn.appendChild(tag);
      btn.classList.add("done", "miss");
    }
  }

  hideQueue() {
    const strip = this.el.queueStrip;
    if (!strip) return;
    strip.hidden = true;
    strip.textContent = "";
    this._qThumbs = [];
    this._qCount = null;
  }

  setDropTarget(on) {
    this.el.camBody.classList.toggle("drop-target", !!on);
  }

  setRunning(running) {
    this._running = running;
    this.el.placeholder.hidden = running;
    this.el.camToggle.disabled = !running;
    this.el.noHandHint.hidden = true;
    if (!running) {
      this.setStageMode("webcam");
      this._letter = null;
      this.el.letterChip.hidden = true;
      this.el.handPill.textContent = "no hand";
      this.el.handPill.classList.remove("pill-on");
      this.el.statFps.textContent = "— fps";
      this.el.statLat.textContent = "— ms";
    }
  }

  // ---------------- word bar ----------------
  get word() {
    return this._word;
  }

  setWord(word, { appended = false } = {}) {
    this._word = word;
    const el = this.el.word;
    el.textContent = "";
    if (!word) {
      const empty = document.createElement("span");
      empty.className = "word-empty";
      empty.textContent = "spell something…";
      el.appendChild(empty);
      return;
    }
    const chars = Array.from(word);
    chars.forEach((ch, idx) => {
      const span = document.createElement("span");
      span.className = ch === " " ? "ch ch-space" : "ch";
      span.textContent = ch === " " ? "" : ch;
      if (appended && idx === chars.length - 1) span.classList.add("pop");
      el.appendChild(span);
    });
    const caret = document.createElement("span");
    caret.className = "caret";
    el.appendChild(caret);
  }

  setSpeakToggle(on) {
    this.el.speakToggle.setAttribute("aria-pressed", on ? "true" : "false");
  }

  // ---------------- misc ----------------
  toast(text, kind = "info") {
    const el = this.el.toast;
    if (!el.hidden && el.dataset.text === text) return; // don't spam identical toasts
    el.dataset.text = text;
    el.textContent = text;
    el.className = `toast toast-${kind}`;
    el.hidden = false;
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      el.hidden = true;
      el.dataset.text = "";
    }, 3500);
  }

  snapshot() {
    const imageMode = this._mode === "image";
    const src = imageMode ? this.el.imagePreview : this.el.video;
    const w = imageMode ? src.naturalWidth : src.videoWidth;
    const h = imageMode ? src.naturalHeight : src.videoHeight;
    if (!w || !h) {
      this.toast("no frame to capture yet", "warn");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (this._mirrored) {
      ctx.save();
      ctx.scale(-1, 1); // match the mirrored preview
      ctx.drawImage(src, -w, 0, w, h);
      ctx.restore();
    } else {
      ctx.drawImage(src, 0, 0, w, h);
    }
    ctx.drawImage(this.el.overlay, 0, 0, w, h);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `asl-snapshot-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, "image/png");
  }

  // ---------------- wiring ----------------
  _bind(handlers) {
    const el = this.el;
    const h = handlers;
    el.startBtn.addEventListener("click", () => h.onStart && h.onStart());
    el.camToggle.addEventListener("click", () => h.onStop && h.onStop());
    el.sourceSelect.addEventListener("change", () => h.onSourceChange && h.onSourceChange(el.sourceSelect.value));
    el.fileInput.addEventListener("change", () => {
      const files = Array.from(el.fileInput.files || []);
      el.fileInput.value = "";
      if (h.onFilesPicked) h.onFilesPicked(files);
    });
    if (el.uploadBtn) el.uploadBtn.addEventListener("click", () => h.onUploadClick && h.onUploadClick());

    // drag & drop files onto the camera stage
    const body = el.camBody;
    const showDrop = (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      this.setDropTarget(true);
    };
    body.addEventListener("dragenter", showDrop);
    body.addEventListener("dragover", showDrop);
    body.addEventListener("dragleave", (e) => {
      if (!body.contains(e.relatedTarget)) this.setDropTarget(false);
    });
    body.addEventListener("drop", (e) => {
      e.preventDefault();
      this.setDropTarget(false);
      const files = e.dataTransfer ? Array.from(e.dataTransfer.files || []) : [];
      if (files.length && h.onFilesDropped) h.onFilesDropped(files);
    });
    // keep the browser from navigating away when files are dropped outside the stage
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("drop", (e) => e.preventDefault());
    el.spaceBtn.addEventListener("click", () => h.onSpace && h.onSpace());
    el.backspaceBtn.addEventListener("click", () => h.onBackspace && h.onBackspace());
    el.clearBtn.addEventListener("click", () => h.onClear && h.onClear());
    el.copyBtn.addEventListener("click", () => h.onCopy && h.onCopy());
    el.snapshotBtn.addEventListener("click", () => this.snapshot());
    el.speakWordBtn.addEventListener("click", () => h.onSpeakWord && h.onSpeakWord());
    el.speakToggle.addEventListener("click", () => h.onToggleSpeak && h.onToggleSpeak());
  }
}
