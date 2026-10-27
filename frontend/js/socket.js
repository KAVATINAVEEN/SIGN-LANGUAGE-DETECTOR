// WebSocket client: auto-reconnect with backoff, JSON messages in.

export class SocketClient {
  constructor(url, { onMessage, onStatus } = {}) {
    this.url = url;
    this.onMessage = onMessage || (() => {});
    this.onStatus = onStatus || (() => {});
    this.ws = null;
    this.retry = 0;
    this.stopped = false;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }
    this.onStatus("connecting");
    const ws = new WebSocket(this.url);
    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      this.retry = 0;
      this.onStatus("open");
    };
    ws.onmessage = (event) => {
      try {
        this.onMessage(JSON.parse(event.data));
      } catch (err) {
        console.warn("[socket] bad message", err);
      }
    };
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      this.onStatus("closed");
      if (!this.stopped) this._scheduleReconnect();
    };
    ws.onerror = () => {
      try { ws.close(); } catch { /* ignore */ }
    };

    this.ws = ws;
  }

  _scheduleReconnect() {
    const delay = Math.min(8000, 500 * 2 ** this.retry++);
    setTimeout(() => {
      if (!this.stopped) this.connect();
    }, delay);
  }

  get open() {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  sendFrame(buffer) {
    if (this.open) this.ws.send(buffer);
  }

  sendControl(obj) {
    if (this.open) this.ws.send(JSON.stringify(obj));
  }
}
