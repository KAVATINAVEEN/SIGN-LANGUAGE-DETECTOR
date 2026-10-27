// 2D overlay on the camera feed: hand skeleton, bounding box, confidence styling.
// Landmarks/bbox arrive unmirrored (raw image coords); when the preview is a
// mirror (webcam), they are flipped here to match what the user sees.

import { HAND_CONNECTIONS } from "./constants.js";

const ACCENT = "rgba(79, 70, 229, 1)";
const ACCENT_SOFT = "rgba(79, 70, 229, 0.55)";

export class Overlay2D {
  constructor(canvas, video) {
    this.canvas = canvas;
    this.video = video;
    this.ctx = canvas.getContext("2d");
    this.ar = 4 / 3;
    this.w = 1;
    this.h = 1;
    this.mirrored = true;
    this._msg = null;

    const ro = new ResizeObserver(() => this.fit());
    ro.observe(canvas.parentElement);
    this.fit();
  }

  setVideoAspect(ar) {
    if (ar && isFinite(ar)) {
      this.ar = ar;
      this.fit();
    }
  }

  setMirrored(mirrored) {
    this.mirrored = !!mirrored;
    if (this._msg) this.update(this._msg);
  }

  /** Size/position the canvas so it exactly covers the letterboxed video content. */
  fit() {
    const body = this.canvas.parentElement;
    const bw = body.clientWidth;
    const bh = body.clientHeight;
    if (!bw || !bh) return;

    let w = bw;
    let h = w / this.ar;
    if (h > bh) {
      h = bh;
      w = h * this.ar;
    }

    this.canvas.style.left = `${(bw - w) / 2}px`;
    this.canvas.style.top = `${(bh - h) / 2}px`;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.w = w;
    this.h = h;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (this._msg) this.update(this._msg);
  }

  clear() {
    this._msg = null;
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  update(msg) {
    this._msg = msg;
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    if (!msg.hand || !msg.landmarks) return;

    // mirror x when the preview is flipped
    const pts = msg.landmarks.map(([x, y]) => [(this.mirrored ? 1 - x : x) * w, y * h]);

    // bones
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = ACCENT_SOFT;
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.beginPath();
      ctx.moveTo(pts[a][0], pts[a][1]);
      ctx.lineTo(pts[b][0], pts[b][1]);
      ctx.stroke();
    }

    // joints
    ctx.fillStyle = ACCENT;
    for (const [px, py] of pts) {
      ctx.beginPath();
      ctx.arc(px, py, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // bounding box
    if (msg.bbox) {
      const [bx, by, bw2, bh2] = msg.bbox;
      const rx = (this.mirrored ? 1 - bx - bw2 : bx) * w;
      const ry = by * h;
      const rw = bw2 * w;
      const rh = bh2 * h;

      ctx.save();
      ctx.shadowColor = "rgba(79, 70, 229, 0.45)";
      ctx.shadowBlur = 14;
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 2.5;
      roundedRect(ctx, rx, ry, rw, rh, 10);
      ctx.stroke();
      ctx.restore();
    }
  }
}

function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
