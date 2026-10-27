// Main orchestrator: input source (webcam / image batch) -> capture pump ->
// WebSocket -> UI / 2D / 3D.

import { Camera } from "./camera.js";
import { SocketClient } from "./socket.js";
import { Overlay2D } from "./overlay2d.js";
import { Scene3D } from "./scene3d.js";
import { UI } from "./ui.js";
import { SAMPLES } from "./constants.js";
import { speech } from "./speech.js";

const videoEl = document.getElementById("video");
const overlayCanvas = document.getElementById("overlay");
const sceneCanvas = document.getElementById("scene");

const camera = new Camera(videoEl);
const overlay = new Overlay2D(overlayCanvas, videoEl);
const scene3d = new Scene3D(sceneCanvas);

camera.onReady = (aspect) => overlay.setVideoAspect(aspect);

const state = {
  running: false,
  busy: false,
  busyTimer: null,
  word: "",
  autoSpeak: false,
  inputSource: "webcam", // "webcam" | "image"
};

// Image batch queue: many images recognized one after another.
const QUEUE = {
  active: false,
  items: [],        // { url, name, letter } — letter: undefined pending | null no result
  index: -1,
  started: false,   // first server frame seen for the current item
  itemTimer: null,  // per-item budget, armed once frames arrive
  holdTimer: null,  // short pause after a commit
  backstopTimer: null,
};
const ITEM_BUDGET_MS = 2800;      // max processing time per image
const BACKSTOP_MS = 7000;         // max time per image when no frame comes back
const HOLD_AFTER_COMMIT_MS = 800; // linger so the committed letter is readable

const ui = new UI({
  handlers: {
    onStart: () => start(),
    onStop: () => stop(),
    onSourceChange: (value) => changeSource(value),
    onFilesPicked: (files) => onFilesPicked(files),
    onFilesDropped: (files) => onFilesPicked(files),
    onUploadClick: () => openImagePicker(),
    onSpace: () => appendChar(" "),
    onBackspace: () => setWord(state.word.slice(0, -1)),
    onClear: () => setWord(""),
    onCopy: async () => {
      if (!state.word) return ui.toast("nothing to copy", "warn");
      try {
        await navigator.clipboard.writeText(state.word);
        ui.toast("copied to clipboard");
      } catch {
        ui.toast("clipboard blocked by the browser", "warn");
      }
    },
    onSpeakWord: () => {
      if (state.word.trim()) speech.speak(state.word);
      else ui.toast("spell a word first", "warn");
    },
    onToggleSpeak: () => {
      state.autoSpeak = !state.autoSpeak;
      ui.setSpeakToggle(state.autoSpeak);
      ui.toast(state.autoSpeak ? "letter voice on" : "letter voice off");
    },
  },
});

ui.buildSamples(SAMPLES, (src) => startImage(src));

// ---------------- socket ----------------
const socket = new SocketClient(`ws://${location.host}/ws`, {
  onStatus: (status) => ui.setConn(status),
  onMessage: handleMessage,
});
socket.connect();

// ---------------- word bar ----------------
function setWord(word, appended = false) {
  state.word = word;
  ui.setWord(word, { appended });
}

function appendChar(ch) {
  if (state.word.length >= 60) return;
  setWord(state.word + ch, true);
}

// ---------------- sources ----------------
function setMirrored(mirrored) {
  // webcam preview is a selfie mirror; images are shown as-is
  ui.setMirrored(mirrored);
  overlay.setMirrored(mirrored);
  scene3d.setMirrored(mirrored);
}

async function start() {
  exitQueue();
  try {
    ui.toast("requesting camera…");
    await camera.startWebcam();
    state.inputSource = "webcam";
    ui.el.sourceSelect.value = "webcam";
    ui.setStageMode("webcam");
    setMirrored(true);
    beginRunning("streaming — show a hand sign");
  } catch (err) {
    ui.toast(`camera error: ${err.message || err}`, "warn");
  }
}

async function startImage(source) {
  exitQueue();
  try {
    ui.toast("loading image…");
    const url = await camera.startImage(source);
    state.inputSource = "image";
    ui.el.sourceSelect.value = "image";
    ui.setStageMode("image");
    ui.setImagePreview(url);
    setMirrored(false);
    beginRunning("recognizing image…");
  } catch (err) {
    ui.toast(`image error: ${err.message || err}`, "warn");
  }
}

// ---------------- image batch ----------------
function openImagePicker() {
  ui.el.fileInput.accept = "image/*";
  ui.el.fileInput.multiple = true;
  ui.el.fileInput.click();
}

function onFilesPicked(files) {
  const list = Array.from(files || []);
  if (!list.length) {
    ui.el.sourceSelect.value = state.inputSource; // picker canceled → revert
    return;
  }
  const images = list.filter((f) => (f.type || "").startsWith("image/"));
  if (images.length) {
    startImageBatch(images);
    return;
  }
  ui.toast("only images are supported", "warn");
  ui.el.sourceSelect.value = state.inputSource;
}

function startImageBatch(files) {
  exitQueue();
  QUEUE.items = files.map((f) => ({
    url: URL.createObjectURL(f),
    name: f.name || "image",
    letter: undefined,
  }));
  QUEUE.active = true;
  state.inputSource = "image";
  ui.el.sourceSelect.value = "image";
  setMirrored(false);
  ui.buildQueue(QUEUE.items, (i) => {
    if (QUEUE.active) runQueueItem(i);
  });
  runQueueItem(0);
}

async function runQueueItem(i) {
  if (!QUEUE.active || i < 0 || i >= QUEUE.items.length) return;
  clearQueueTimers();
  QUEUE.index = i;
  QUEUE.started = false;
  const item = QUEUE.items[i];
  item.letter = undefined;
  ui.setQueueIndex(i, QUEUE.items.length);
  ui.setQueueResult(i, undefined);
  try {
    const url = await camera.startImage(item.url);
    ui.setStageMode("image");
    ui.setImagePreview(url);
  } catch (err) {
    item.letter = null;
    ui.setQueueResult(i, null);
    ui.toast(`image error: ${err.message || err}`, "warn");
    setTimeout(advanceQueue, 0);
    return;
  }
  const message = QUEUE.items.length > 1
    ? `recognizing image ${i + 1}/${QUEUE.items.length}`
    : "recognizing image…";
  if (!state.running) beginRunning(message);
  else {
    socket.sendControl({ type: "reset" }); // fresh stabilizer for each image
    ui.toast(message);
  }
  QUEUE.backstopTimer = setTimeout(advanceQueue, BACKSTOP_MS);
}

function clearQueueTimers() {
  clearTimeout(QUEUE.itemTimer);
  clearTimeout(QUEUE.holdTimer);
  clearTimeout(QUEUE.backstopTimer);
  QUEUE.itemTimer = QUEUE.holdTimer = QUEUE.backstopTimer = null;
}

function noteQueueFrame() {
  // frames are flowing for the current image → replace the backstop with the budget
  if (!QUEUE.active || QUEUE.started) return;
  QUEUE.started = true;
  clearTimeout(QUEUE.backstopTimer);
  QUEUE.backstopTimer = null;
  QUEUE.itemTimer = setTimeout(advanceQueue, ITEM_BUDGET_MS);
}

function advanceQueue() {
  if (!QUEUE.active) return;
  clearQueueTimers();
  const item = QUEUE.items[QUEUE.index];
  if (item && item.letter === undefined) {
    item.letter = null; // no commit within the budget
    ui.setQueueResult(QUEUE.index, null);
  }
  const next = QUEUE.index + 1;
  if (next < QUEUE.items.length) runQueueItem(next);
  else finishQueue();
}

function finishQueue() {
  const letters = QUEUE.items.map((it) => it.letter || "·").join(" ");
  QUEUE.active = false;
  state.running = false; // stop sending frames — the final result stays on screen
  ui.toast(`batch done — ${letters}`);
}

function exitQueue() {
  clearQueueTimers();
  for (const it of QUEUE.items) {
    try {
      URL.revokeObjectURL(it.url);
    } catch {
      /* ignore */
    }
  }
  QUEUE.items = [];
  QUEUE.index = -1;
  QUEUE.active = false;
  QUEUE.started = false;
  ui.hideQueue();
}

function beginRunning(message) {
  state.running = true;
  state.busy = false;
  socket.connect();
  socket.sendControl({ type: "reset" }); // fresh stabilizer for the new source
  ui.setRunning(true);
  ui.toast(message);
}

function stop() {
  state.running = false;
  exitQueue();
  camera.stop();
  overlay.clear();
  ui.setRunning(false);
}

function changeSource(value) {
  if (value === "image") {
    openImagePicker(); // the source switches once images are picked
    return;
  }
  if (value === state.inputSource && state.running) return;
  stop();
  start();
}

// ---------------- server messages ----------------
function handleMessage(msg) {
  if (msg.type === "error") {
    state.busy = false;
    clearTimeout(state.busyTimer);
    ui.toast(msg.error || "server error", "warn");
    return;
  }

  state.busy = false;
  clearTimeout(state.busyTimer);

  noteQueueFrame();

  overlay.update(msg);
  scene3d.update(msg);
  ui.update(msg);

  if (msg.committed) {
    appendChar(msg.committed);
    scene3d.spawnLetter(msg.committed);
    if (state.autoSpeak) speech.speak(msg.committed, true);
    const item = QUEUE.active ? QUEUE.items[QUEUE.index] : null;
    if (item && item.letter === undefined) {
      item.letter = msg.committed;
      ui.setQueueResult(QUEUE.index, msg.committed);
      clearQueueTimers();
      QUEUE.holdTimer = setTimeout(advanceQueue, HOLD_AFTER_COMMIT_MS);
    }
  }
}

// ---------------- capture pump ----------------
const SEND_INTERVAL_MS = 66; // ask for ~15 fps; one frame in flight at a time
setInterval(pump, SEND_INTERVAL_MS);

async function pump() {
  if (!state.running || state.busy || !socket.open || !camera.ready) return;
  state.busy = true;
  try {
    const blob = await camera.captureFrame(512);
    if (!blob || !socket.open) {
      state.busy = false;
      return;
    }
    socket.sendFrame(await blob.arrayBuffer());
    clearTimeout(state.busyTimer);
    state.busyTimer = setTimeout(() => { state.busy = false; }, 1500); // safety net
  } catch {
    state.busy = false;
  }
}

// ---------------- boot ----------------
setMirrored(true);
ui.setRunning(false);
ui.setWord("");
ui.setSpeakToggle(false);

fetch("/api/health")
  .then((r) => r.json())
  .then((health) => ui.setModelInfo(health))
  .catch(() => ui.toast("backend unreachable", "warn"));
