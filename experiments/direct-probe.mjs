// Sonda puntual (no va en npm test): confirma que la key normal del .env conecta DIRECTO a Lyria RealTime
// como lo hara el navegador en el despliegue estatico:
//  - URL con ?key= (el SDK web de @google/genai construye asi la URL; el navegador no puede mandar headers)
//  - Origin https de un despliegue simulado (el navegador siempre manda Origin; riesgos: que Google lo rechace)
//  - setup + espera setupComplete; SIN play(): no genera audio ni gasta cuota de generacion
import fs from 'node:fs';
import WebSocket from 'ws';

const key = (() => {
  try {
    const raw = fs.readFileSync(new URL('../.env', import.meta.url), 'utf8');
    const k = (raw.match(/^\s*GEMINI_API_KEY\s*=\s*(.*)$/m)?.[1] || '').trim().replace(/^["']|["']$/g, '');
    if (k) return k;
  } catch { /* sin .env */ }
  return process.env.GEMINI_API_KEY || '';
})();
if (!key) { console.error('Falta GEMINI_API_KEY en .env'); process.exit(1); }

const scrub = (x) => String(x ?? '').split(key).join('[key]').slice(0, 400);
const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateMusic?key=${encodeURIComponent(key)}`;
console.log('conectando (Origin https simulado de navegador)...');
const t0 = Date.now();
const ws = new WebSocket(url, { origin: 'https://willys-web.example.com' });

const timer = setTimeout(() => { console.error('TIMEOUT (15 s) sin setupComplete'); ws.terminate(); process.exit(2); }, 15000);
ws.on('open', () => {
  console.log('open en', Date.now() - t0, 'ms; enviando setup');
  ws.send(JSON.stringify({ setup: { model: 'models/lyria-realtime-exp' } }));
});
ws.on('message', (data) => {
  const m = scrub(String(data));
  console.log('mensaje del servidor:', m);
  if (m.includes('setupComplete')) {
    clearTimeout(timer);
    console.log('OK: setupComplete con ?key= y Origin de navegador -> el modo estatico es viable');
    ws.close();
    setTimeout(() => process.exit(0), 200);
  } else if (m.includes('error')) {
    clearTimeout(timer);
    console.error('FALLO: el servidor respondio con error');
    ws.close();
    setTimeout(() => process.exit(3), 200);
  }
});
ws.on('error', (e) => { clearTimeout(timer); console.error('ERROR de conexion:', scrub(e?.message || e)); process.exit(4); });
ws.on('close', (code, reason) => console.log('close', code, scrub(reason)));
