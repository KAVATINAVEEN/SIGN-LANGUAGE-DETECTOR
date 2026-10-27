// Input source (webcam / still image) + JPEG frame capture.

export class Camera {
  constructor(videoEl) {
    this.video = videoEl;
    this.stream = null;
    this.image = null;
    this.imageUrl = null;
    this.mode = "webcam"; // "webcam" | "image"
    this.onReady = null; // callback(aspectRatio) once a source is usable
    this._captureCanvas = document.createElement("canvas");
  }

  get ready() {
    if (this.mode === "image") {
      return !!this.image && this.image.complete && this.image.naturalWidth > 0;
    }
    return this.video.readyState >= 2 && this.video.videoWidth > 0;
  }

  async startWebcam() {
    this._releaseAll();
    this.video.removeAttribute("src");
    this.mode = "webcam";
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this._play();
  }

  /**
   * Load a still image as the active source.
   * `source` is a File (from <input type="file">) or a URL string.
   * Resolves to the URL that should be shown in the preview.
   */
  async startImage(source) {
    this._releaseAll();
    this.video.srcObject = null;
    this.video.removeAttribute("src");
    try { this.video.pause(); this.video.load(); } catch { /* ignore */ }

    const url = typeof source === "string" ? source : URL.createObjectURL(source);
    if (typeof source !== "string") this.imageUrl = url;

    const img = new Image();
    const loaded = new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error("could not load the image"));
    });
    img.src = url;
    await loaded;

    this.image = img;
    this.mode = "image";
    if (this.onReady && img.naturalWidth > 0) {
      this.onReady(img.naturalWidth / img.naturalHeight);
    }
    return url;
  }

  stop() {
    this._releaseAll();
    try { this.video.pause(); } catch { /* ignore */ }
    this.video.srcObject = null;
    this.video.removeAttribute("src");
    try { this.video.load(); } catch { /* ignore */ }
    this.mode = "webcam";
  }

  /** Capture the current frame as a JPEG Blob (raw orientation, no mirroring). */
  captureFrame(targetWidth = 512) {
    if (!this.ready) return Promise.resolve(null);
    const isImage = this.mode === "image";
    const src = isImage ? this.image : this.video;
    const sw = isImage ? this.image.naturalWidth : this.video.videoWidth;
    const sh = isImage ? this.image.naturalHeight : this.video.videoHeight;
    const w = targetWidth;
    const h = Math.max(1, Math.round(targetWidth * (sh / sw)));
    const c = this._captureCanvas;
    c.width = w;
    c.height = h;
    c.getContext("2d").drawImage(src, 0, 0, w, h);
    return new Promise((resolve) => c.toBlob((blob) => resolve(blob), "image/jpeg", 0.72));
  }

  async _play() {
    await this.video.play();
    if (this.onReady && this.video.videoWidth > 0) {
      this.onReady(this.video.videoWidth / this.video.videoHeight);
    }
  }

  _releaseAll() {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.imageUrl) {
      URL.revokeObjectURL(this.imageUrl);
      this.imageUrl = null;
    }
    this.image = null;
  }
}
