// Servidor estatico minimo (sin dependencias) para probar en local el modo estatico:
// sirve SOLO public/ tal cual se sube a un hosting (Vercel o cualquier hosting estatico).
// Cada jugador pone su API key en la pantalla de inicio; aqui no se guarda ninguna key.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const PORT = Number(process.env.PORT) || 4000;
const HOST = '127.0.0.1';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
};

const server = http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent((req.url || '/').split('?')[0]); } catch { res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Solicitud invalida'); return; }
  if (rel.endsWith('/')) rel += 'index.html'; // raiz (o cualquier carpeta) -> index.html
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) { res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Prohibido'); return; } // traversal
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`No encontrado: ${rel}`); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Modo estatico en http://${HOST}:${PORT} (pega tu API key en la pantalla de inicio)`);
});
