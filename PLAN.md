# Plan v2: "La música olvida, el camino recuerda" (Willys por Colombia + Lyria RealTime)

Reemplaza la fase 3 del plan original (mapa visto desde arriba). Fases 0-2 hechas y se reutilizan.

## Por qué así
El hilo con @mwjoffe es sobre música adaptativa en juegos ("game composers have been faking it with stems and crossfades").
Un juego de manejo con banda sonora generada en vivo por Lyria responde la pregunta en su terreno:
- **Carretera = deriva:** mientras manejas, la música se mezcla por cercanía y se va desviando (lo que Lyria hace sola).
- **Región = memoria:** al cruzar la neblina de entrada, una sesión nueva con la seed de la región toca su tema idéntico, cada vez.
- **Interruptor Memoria (M):** el A/B del video; sin memoria, volver a una región no suena igual.

## Qué es
Paseo arcade (tipo Mario Kart / Messenger / Slow Roads), sin carrera ni rivales.
- Un Willys cafetero en tercera persona recorre una Colombia en miniatura.
- Hay 6 regiones unidas por carreteras, a unos 30-45 s de manejo entre vecinas.
- Un minimapa arriba muestra flechas hacia cada región.
- Estilo animado y luminoso (atardecer, colores vivos, sombreado tipo toon/low-poly), nada de "hackathon oscuro".

## Qué se reutiliza (fases 1-2, probado)
- `server-core.mjs` / `server.mjs`: 2 canales (live/recall), sid por sesión, promote, rotación a ~10 min, logs JSONL.
- `public/audio.js` + `audio-core.js`: hold/release desde el primer bloque, crossfade equal-power 3 s con barrido lowpass.
- `public/session-state.js`: estado de canales y handover (a prueba de mensajes viejos).
- `public/memory.js`: pesos afilados (2 más cercanos, p≈4), rate limit, prewarm/cancel/enter/leave.
  Se adapta así:
  - las distancias se miden en el mundo 3D;
  - el prewarm pasa a decidirse por tiempo estimado de llegada: si con la velocidad actual entrarás en ≤5 s por una carretera que va a esa región (o con el rumbo directo, cos ≥ 0.9), se pre-calienta;
  - al frenar o desviarse, se cancela.
- `places.json`: 6 prompts + seeds elegidos de oído. Caribe ya es instrumental (seed 7, alternativa 11 guardada).

## Mundo
- **Terreno:** heightfield procedural, del orden de 1-1.5 km de lado en unidades del juego. Tiene tres cordilleras andinas de SO a NE por el centro, tierras bajas en las costas Caribe y Pacífica y el llano plano al oriente. Disposición geográfica aproximada:
  - Caribe al norte, Pacífico al oeste;
  - Cali al suroeste, Medellín al centro-oeste en montaña;
  - Santander al centro-norte en montaña, Llanos al este.
- **Carreteras:** un grafo que une las regiones (anillo + atajos) como cintas sobre el terreno con curvas de montaña. Se puede salir de la carretera, pero el carro va más lento.
- **Regiones:** zonas con identidad visual y entrada por neblina. La nube cubre los ~4 s que tarda Lyria en arrancar el tema y al salir de ella ya suena.
  - Caribe: playa, palmeras, mar.
  - Pacífico: selva, río, palafitos, marimba.
  - Santander: montaña, cañón, pueblo blanco con tiple.
  - Llanos: sabana, morichales, arpa, ganado.
  - Cali: ciudad, farolas, tarima de salsa.
  - Medellín: ciudad en valle, metrocable, luces de club.
  - Al entrar aparece una tarjeta didáctica corta (género, instrumentos, un dato), que se cierra sola.
- **Willys:** construido procedural (cajas + cilindros, verde o rojo, carga de café en la parrilla).
  - Física arcade a mano, sin motor: aceleración, freno, giro, derrape suave y rebote de suspensión (resorte sobre la carrocería). Las ruedas siguen la altura del terreno.
  - Cámara de persecución con retardo y FOV que crece con la velocidad.
  - Controles: WASD/flechas; espacio = freno de mano.
- **Minimapa** (canvas 2D, arriba a la derecha):
  - silueta de Colombia, carreteras y zonas con su color;
  - el Willys como flecha;
  - flechas en el borde hacia regiones fuera de vista;
  - halo del color de lo que suena ahora.
- **HUD mínimo:** región / mezcla actual, Memoria (M), Pausa (P), ocultar HUD (H), fps (F).
- **Memoria visible:** las regiones visitadas quedan marcadas en el minimapa. Con Memoria=sí, al volver la neblina brilla y "recuerda".

## Rendimiento (Intel UHD 620)
- Objetivo ~60 fps a 1080p.
- pixelRatio ≤ 1.25; sin sombras dinámicas (sombra "blob" bajo el carro).
- Niebla de distancia que limita el dibujado; props instanciados; chunks del terreno con frustum culling.
- Calidad adaptativa (reutiliza la de orquesta-lyria).

## Fases (ejecución delegada a tacano:sonnet-worker; Opus revisa)
- **G1 Prototipo jugable:** terreno con montañas + 1 carretera entre 2 regiones (Medellín ↔ Caribe), Willys con física arcade y cámara, minimapa, audio conectado (mezcla live, prewarm por tiempo de llegada, handover en la neblina, Memoria M). Tests puros: paso de física, ETA/prewarm, proyección del minimapa, zonas. **Puerta:** Nico maneja en Chrome y dice si el manejo y la música se sienten bien.
- **G2 Mundo completo:** 6 regiones, red de carreteras, props por región, neblinas, tarjetas didácticas.
- **G3 Pulido visual:** cielo de atardecer, paleta, partículas (polvo del camino, hojas, olas), animaciones del carro, memoria visible, calidad adaptativa, sonido de motor opcional y suave (apagado por defecto: no tapar la música).
- **G4 Video y datos:** logs (`region_enter`, `recall_prewarm/start/cancel`, `rotate`), herramienta de similitud con/sin memoria para el post, modo cámara/HUD limpio para grabar.

## Verificación
- `npm test` en cada fase: lógica pura y protocolo.
- Simulación sin navegador: un "conductor" scriptado recorre la carretera y alimenta memory.js para comprobar prewarm → handover → sin >2 sesiones.
- Navegador de prueba (puerto 3002) para errores de consola. El panel integrado frena la animación, así que el manejo real lo prueba Nico en Chrome.

## Fuera de alcance (v1)
Carreras/rivales, multijugador, táctil/móvil, geografía real con DEM, modelos 3D descargados (se puede considerar un modelo CC0 después, con permiso), Latinoamérica/mapamundi (idea futura).
