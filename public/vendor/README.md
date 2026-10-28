# public/vendor

Builds ESM autocontenidos del SDK web que el juego importa en el navegador. El `dist/web/index.mjs` que
publica @google/genai no es autocontenido (tiene `import pRetry from 'p-retry'`, un especificador desnudo
que el navegador no puede resolver sin bundler), por eso se vendoriza el build `+esm` de jsdelivr con las
dependencias reescritas a rutas locales:

- `genai-web.mjs` — @google/genai@2.29.1 (Apache-2.0), transformacion `+esm` de jsdelivr
- `p-retry.mjs` — p-retry@4.6.2 (MIT)
- `retry.mjs` — retry@0.13.1 (MIT)

Reescrituras aplicadas: en `genai-web.mjs`, `/npm/p-retry@4.6.2/+esm` → `./p-retry.mjs`; en `p-retry.mjs`,
`/npm/retry@0.13.1/+esm` → `./retry.mjs`; ademas se quito el `sourceMappingURL` en los tres.

Regenerar (PowerShell, desde la raiz; al actualizar @google/genai usa la misma version que `package.json`):

```powershell
Invoke-WebRequest 'https://cdn.jsdelivr.net/npm/@google/genai@2.29.1/+esm' -OutFile public/vendor/genai-web.mjs
Invoke-WebRequest 'https://cdn.jsdelivr.net/npm/p-retry@4.6.2/+esm' -OutFile public/vendor/p-retry.mjs
Invoke-WebRequest 'https://cdn.jsdelivr.net/npm/retry@0.13.1/+esm' -OutFile public/vendor/retry.mjs
# y repetir las reescrituras de arriba; test-local-link.mjs verifica el resultado
```

Nota: el juego NO usa el CDN como respaldo en tiempo de ejecucion (`SDK_URLS` solo apunta a `./vendor/genai-web.mjs`);
jsdelivr se usa unicamente para regenerar estos archivos a mano, para no cargar codigo de terceros con acceso a la key del jugador.
