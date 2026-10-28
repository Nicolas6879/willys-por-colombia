// Conexion WebSocket con el servidor: JSON de control hacia arriba; hacia abajo, JSON de estado y
// frames binarios [1 byte de canal][PCM16 crudo].
export class Link {
  constructor({ onAudio, onMessage, onDisconnect }) {
    this.onAudio = onAudio;           // (ch, ArrayBuffer sin el byte de canal)
    this.onMessage = onMessage;       // (obj JSON del servidor: status, first_audio, filtered, closed, promoted, rotate_soon, error)
    this.onDisconnect = onDisconnect; // (motivo)
    this.ws = null;
  }

  connect() {
    let done = false;
    const down = (why) => { if (done) return; done = true; this.onDisconnect?.(why); };
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        try { this.onMessage(JSON.parse(ev.data)); } catch { /* ignorar */ }
      } else if (ev.data.byteLength > 1) {
        const u = new Uint8Array(ev.data);
        this.onAudio(u[0], ev.data.slice(1));
      }
    };
    ws.onclose = () => down('desconectado del servidor');
    ws.onerror = () => down('error de conexion');
    this.ws = ws;
    return new Promise((res) => { ws.onopen = res; });
  }

  // true si se envio
  send(obj) {
    if (this.ws?.readyState === WebSocket.OPEN) { this.ws.send(JSON.stringify(obj)); return true; }
    return false;
  }
}
