# mapa-lyria: notas de desarrollo

Documentacion tecnica (en espanol). Las rutas son relativas a la raiz del repo, no a `docs/`. Para la presentacion del proyecto mira [`README.md`](../README.md) / [`README.es.md`](../README.es.md).

## Fase 1: audio + servidor

Mapa de Colombia donde viajar mezcla la musica de Lyria RealTime y volver a un lugar suena exactamente a su tema:
se abre una sesion nueva con la seed del lugar (mismo seed + prompt + config = mismo audio). El proyecto actual es el juego 3D Willys por Colombia (`public/index.html`); las paginas de las fases anteriores siguen en `public/test.html` (prueba de audio) y `public/map2d.html` (mapa 2D).

## Arrancar
```
npm install
npm start                 # http://127.0.0.1:3000   (PORT=3002 npm start para otro puerto)
npm run static            # http://127.0.0.1:4000   (modo estatico: sirve public/ tal cual, sin servidor)
npm test                  # 19 suites (audio-core, protocolo, memoria, session-state, secciones, reactive, vehiculo, colisiones, mundo, ciclo de dia, geomap, bigmap, perf, drive-sim, handover, key-store, local-link, touch, spotify) con mock o logica pura
npm run test:real         # Lyria real en el puerto 3002 (gasta cuota; no va en npm test)
```
Key del servidor (modo clasico, `?server=1`): `GEMINI_API_KEY` en `.env` (manda sobre la variable de entorno). `ROTATE_MS` cambia el umbral de rotacion (def. 585000).
Key del jugador (modo estatico, el que se despliega): la pagina se conecta directo a Lyria con ella, asi que se guarda solo en el navegador. Se consigue gratis en [Google AI Studio](https://aistudio.google.com/apikey) (~2 min) y se pega en la pantalla de inicio; si no marcas "Recordar" va en sessionStorage y se borra al cerrar la pestaña (con "Recordar" va en localStorage). Usa una key dedicada para jugar: una extension del navegador podria leerla (aqui no hay servidor que la esconda).
Pagina de prueba de audio: `public/test.html` (elige destino, slider de mezcla, Viajar, Pre-calentar recall, Entrar, Memoria si/no, Pausa).
Controles tactiles (celular/tablet en horizontal, o `?touch=1` para probarlos en el PC; `?touch=0` los apaga): dos modos en `public/touch.js`, "joystick" (por defecto; joystick analogico flotante en la mitad izquierda + Freno de mano) y "flechas" (◀ ▶ + Acelerar / Freno-Reversa / Freno de mano). El boton de modo (bajo el minimapa) lo guarda en localStorage; `?touchmode=joystick|flechas` lo fuerza. Mapa/Memoria/Pausa van bajo el minimapa. Logica pura probada en `test-touch.mjs`.
Modo observador: el boton del ojo o la tecla H (un solo estado, `setObserver` en `game.js`) ocultan toda la UI; en tactil quedan los controles de manejo atenuados.
Modo sin key (`?nokey=1` o el boton de la pantalla de inicio): no se crea Link/LocalLink ni sesion Lyria; `memory.update` solo se usa para detectar la entrada a una region (accion `enter`), que muestra la tarjeta y carga la playlist de Spotify de esa region (campo `spotify` de `public/places.json`) en un embed (Spotify iFrame API, cargada solo en este modo). Logica pura en `public/spotify.js` (`test-spotify.mjs`).

## Desplegar (sin servidor)
`public/` es el sitio completo: se sube tal cual, sin build, y funciona en cualquier hosting estatico. Cada jugador pega su key en la pantalla de inicio y el navegador se conecta directo a Lyria (sin proxy de por medio); el SDK de Google viaja vendorizado en `public/vendor/` (sin respaldo por CDN). Para probarlo en local: `npm run static` (http://127.0.0.1:4000).
- **Vercel**: importa el repo, framework "Other", output directory `public` y sin comando de build (`vercel.json` ya lo deja asi).
Nota: Lyria RealTime es experimental (`models/lyria-realtime-exp`); cada jugador necesita acceso al modelo con su key y las cuotas pueden cambiar.

## Protocolo WebSocket (`/ws`)
Canales: `0` = live, `1` = recall (tambien se aceptan `"live"`/`"recall"` en los mensajes del cliente).

Servidor -> cliente
- Binario: `[1 byte de canal][PCM16 estereo 48 kHz crudo]`.
- JSON: `status {ch,state}` (connecting|ready|playing|paused|closed), `first_audio {ch,ms}` (ms desde el `open`),
  `filtered {ch,reason,text}`, `closed {ch,code,reason}`, `promoted {from:1,ch:0}`, `rotate_soon {ch:0,ageMs}`, `error {message,ch?}`.

Cliente -> servidor
- `open {ch, prompts:[{text,weight}], config:{seed?,bpm?,scale?,temperature?,topK?,guidance?,density?,brightness?,muteBass?,muteDrums?,onlyBassAndDrums?,musicGenerationMode?}, play:true}` (nombres camelCase del SDK; `scale` = enum `Scale`, p.ej. `G_MAJOR_E_MINOR`; `musicGenerationMode` = QUALITY|DIVERSITY|VOCALIZATION; `sanitizeConfig` en `core.mjs` valida tipos y rangos).
  El servidor aplica prompts y config ANTES de `play()` (bpm solo se aplica asi o con resetContext). Si el canal esta ocupado, lo reemplaza.
- `prompts {ch, prompts, config?}`: coalescing (maximo un envio cada 150 ms, gana el ultimo). Si cambia bpm/scale hace resetContext.
- `config {ch, config}`: config dinamica (density, brightness, muteDrums...). Se FUSIONA con la config de la sesion y se reenvia COMPLETA (los campos omitidos vuelven al default de Lyria, seed incluida, asi que nunca se manda un parche suelto); no toca los prompts ni hace resetContext salvo que cambien bpm o scale. Mismo coalescing que `prompts`.
- `close {ch}`, `pause`, `play`, `promote {from:"recall"}`, `log {entries}` (logger del cliente).
- Limite: nunca mas de 2 sesiones Lyria por cliente (cuentan tambien las que aun estan conectando y fueron reemplazadas). La 3a da `error`.
- Un solo cliente activo: una conexion nueva cierra la anterior.

## Decisiones
- **Promote**: el recall pasa a ser live; el live viejo se cierra y el canal 1 queda libre. El servidor manda `promoted` justo
  entre los frames: antes llevan byte 1, despues byte 0, asi el cliente intercambia canales en `Player.promote()` sin mezclar frames.
  Flujo de "Entrar": pre-calentar (recall retenido con `hold`) -> `hold(1,false)` suena desde el primer bloque -> `crossfade(0,1,1500)` -> `promote`.
- **Rotacion** (Lyria corta a ~601 s con 1011): cuando el live lleva `ROTATE_MS` el servidor manda `rotate_soon`. El cliente abre una sesion
  nueva (mismos prompts, sin seed) en el canal 1, hace crossfade y `promote`; la sesion nueva reinicia el reloj. Si hay un recall abierto
  (2 sesiones en uso) el aviso se aplaza (sondea cada 1 s) hasta que se cierre o se promueva. Un recall pre-calentado de mas de ~10 min no se rota.
- **Recuperacion del live** (`session-state.js`): si el canal 0 se cierra solo (red, corte de 1011 no rotado, hipo) y no hay handover ni
  rotacion en curso, el cliente lo reabre con la mezcla actual (mismos prompts, sin seed) y backoff 1/2/4/8 s; agotados los reintentos queda
  una nota fija con el motivo. El `promote` del handover se vigila tambien por frame (`handover.tick`) por si el `setTimeout` quedo congelado,
  y al ocultar la pestana (celular) el audio se pausa limpio y al volver se reanuda limpiando colas (evita bucles de audio rancia).
- **Audio** (`public/audio-core.js`, puro y testeado): cola por canal con jitter 0.6 s, recorte por colchon alto como el original, `hold` con
  tope de 60 s (se conserva el inicio), tras soltar el hold no se recorta (el atraso es la duracion retenida; recortar saltaria el principio del tema).
- Logs JSONL por conexion en `logs/` (open, first_audio, prompts, apply/apply_initial, close, promote, rotate, filtered, error, client_connected/client_disconnected). El cliente manda ademas sus propios eventos (`region_enter`, `recall_prewarm`, `rotate`, `quality`...) en lotes `{type:'log'}`.

## Ronda 3: musica reactiva, prompts por capas, bpm/scale por region
Detalle y audicion en `experiments/RONDA3.md` (`experiments/a10-ronda3.mjs`).
- **Prompts por capas** (`places.json`): `prompt` = ancla corta fija (genero + 2-3 instrumentos, sin artistas); `sections` = 2 capas con peso propio (`instrument` a +25 s y `mood` a +50 s, esta ultima el "breakdown": pads/ambiente arriba y la base de density a ~0.2). Maximo 2-3 prompts activos; la mezcla por cercania usa solo las anclas de los 2 lugares mas cercanos. Los prompts anteriores quedan en `prompt_v1`/`sections_v1`/`bpm_v1`.
- **bpm y scale por region** (`places.json`): se fijan en la config inicial antes de `play()` (live y recall). El live abre con la config del lugar mas cercano y NO hace resetContext al viajar (`prompts` no lleva bpm/scale); la rotacion y la reapertura conservan el bpm/scale con que se abrio (`tempoConfig`).
- **Reactividad** (`reactive.js`, pura, `test-reactive.mjs`): de la velocidad salen density (0.3 parado .. 0.7 a ~24 u/s con base 0.5) y brightness (0.4..0.7) ALREDEDOR de una base (`memory.base` = base del lugar + desplazamiento de la seccion); `muteDrums` tras ~2 s parado. Suavizado asimetrico (sube ~3 s, baja ~6 s, evaluado ~1/s), envio solo si el cambio pasa 0.05 y como mucho cada 1.75 s. Va como `{type:'config', ch:0}` SOLO al live: una sesion de region retenida/pre-calentada no la recibe (su inicio sigue identico en cada visita); tras el promote `resync()` la reenvia.
- **Rampa con coalesce** (`memory.js`): el ultimo estado de la mezcla nunca se descarta; un envio pendiente por el rate limit sale al vencer los 700 ms con el estado actual, y un resto menor que `sendDelta` se manda pasados `settleMs` (1.5 s).

## Fase 2: el mapa 2D (`public/map2d.html`, antes index.html; main.js ahora es `map2d.js`)
Controles: WASD / flechas o clic para ir; M memoria si/no; P pausa; H (o el boton del ojo) modo observador: oculta la interfaz; F fps. "Clic para empezar" abre el live con el lugar mas cercano (seed, bpm y `LIVE_CONFIG`).
Archivos: `geo.js` (poligono de Colombia, lugares y radios, proyeccion 1 unidad = 1 grado), `map.js` (three.js r160 por CDN), `map2d.js` (bucle: orbe -> `memory.update` -> acciones -> render), `memory.js` (logica pura).
- `memory.js`: `update({now,pos,vel,memoryOn,chans})` devuelve acciones `livePrompts | prewarm | cancelPrewarm | enter | leave`. Pesos = 1/d^4 de los 2 lugares mas cercanos (>=0.85 -> solo uno, <0.05 se descarta), envio max cada 700 ms y solo si un peso cambia >0.08 o cambia el set.
- Radio interior 0.35-0.6; exterior = interior + 2.8 (lo que recorre el orbe, 0.7 u/s, en 4 s). Prewarm: dentro del exterior de un lugar que no es el del live, acercandose (o ya muy cerca), con Memoria y sin handover/rotacion en curso.
- Cancela el prewarm al salir del exterior o a los 10 s retenido (cooldown 3 s). Al cruzar el interior: `enter` con memoria -> main hace handover (crossfade 3 s + promote); sin memoria -> solo `livePrompts` con ese lugar a peso 1.
- El live "olvida" su lugar al salir de su radio exterior; volver a entrar repite el handover (la "vuelta"). Nunca mas de 2 sesiones: el enter con handover en curso queda pendiente hasta el `promoted`.
- `LIVE_CONFIG = {temperature: 0.9, topK: 28, guidance: 4.5}` (menos azar) se manda en el `open` del live y del recall (misma config siempre: la seed suena igual). `placeConfig(lugar)` = seed + bpm + scale del lugar + LIVE_CONFIG (nunca density/brightness/muteDrums). La rotacion (`rotate_soon`) abre un recall con la mezcla actual y misma config, sin seed.
- La pagina de prueba de la fase 1 sigue en `public/test.html` (`test.js`). `npm test` incluye `test-memory.mjs`.
- **sid**: cada `open` lleva `sid` (contador del cliente); el servidor lo devuelve en status/first_audio/filtered/closed/promoted de esa sesion. `session-state.js` (puro, testeado) ignora mensajes cuyo sid no es el actual del canal (p.ej. el `closed` del recall viejo tras close+open).
- Prewarm: con destino de clic solo se calienta el lugar cuyo radio interior contiene el destino; con teclado solo si el rumbo apunta al lugar (cos >= 0.9). `update` recibe `target`.

## Juego (G1): Willys por Colombia (`public/index.html`)
Prototipo jugable de 2 regiones (Medellin al sur, Caribe al norte) unidas por una carretera de montana. Mundo de 1200x1200 u (1 u ~ 1 m), todo procedural (sin assets). Plan completo en `PLAN.md`.

Controles: WASD / flechas conducir, Espacio freno de mano, M Memoria si/no, P pausa, H (o el boton del ojo) modo observador: oculta la interfaz, F fps. "Clic para empezar" abre el audio.
Al cruzar la neblina de una region (con Memoria) se hace handover a una sesion con su seed; aparece una tarjeta didactica de ~6 s.

Parametros clave: carretera ~956 u (a crucero ~24 u/s: ~35 s hasta la neblina del Caribe, ~39 s hasta su centro); tope 25 u/s en carretera y 12 fuera;
zonas de radio 120 u con neblina donde la carretera cruza el borde; prewarm cuando `eta <= 5 s` yendo hacia la region (por la carretera, o rumbo directo cos >= 0.9 fuera de ella),
se cancela si la velocidad baja de 3 u/s o ya no va hacia ella; el live olvida su region a radio + 60 u. Paso de fisica fijo 1/120 s.

Archivos (puros = testeados en Node, sin three):
- `vehicle.js` (puro): fisica arcade `step`/`advance`/`eta`. `approach.js` (puro): ETA y "va hacia" cada zona (alimenta `memory.update({approach, speed})`).
- `world/base.js` (puro): ruido y altura base. `world/road.js` (puro): spline Catmull-Rom, `roadInfo`, `onRoad`, perfil con pendiente maxima 0.3. `world/terrain.js` (puro): `heightAt` (aplanado a lo largo de la carretera) y datos de la malla low-poly.
- `world/regions.js` (puro): zonas, tarjetas, entradas de neblina, `fogBoost`. `world/scene.js` (three): cielo, luces, terreno, carretera, mar, bancos de neblina, props instanciados.
- `willys.js` (three): el carro procedural + sombra blob. `minimap.js`: proyeccion pura + dibujo canvas. `game.js`: bucle, camara de persecucion, HUD y audio (mismo pipeline que `map2d.js`).
- Pruebas: `test-vehicle.mjs`, `test-world.mjs`, `test-drive-sim.mjs` (conductor scriptado + servidor falso: prewarm, handover, max 2 sesiones, sin Memoria).

## Juego (G2): 6 regiones, red de carreteras y secciones musicales
Mundo de 2600x2600 u (ejes: x este, z sur; norte = -z). Regiones (centro, radio 120): Medellin (-250,-60), Caribe (-50,-860), Santander (520,-380), Llanos (900,50), Pacifico (-950,-120), Cali (-620,620).
Red (`world/layout.js` EDGES): med-car 918 u, car-san 827, med-san 926 (atajo), san-lla 854, med-pac 788, pac-cal 904, cal-med 871; a crucero (~24 u/s) 33-39 s centro a centro. El juego arranca en Medellin.
- `world/layout.js` (puro): sitios, tramos, cordilleras (3, SO->NE), rio del Pacifico y canon de Santander. `world/road.js`: `ROADS` (un spline por tramo), `roadInfo` = carretera mas cercana de la red (rejilla espacial; devuelve `edge`), `roadAt(s, edge)`. Cada region es una meseta plana y las carreteras se juntan a su altura.
- `world/regions.js`: `ZONES[i].entries` = una entrada (neblina) por tramo que toca la zona. `approach.js` solo cuenta la region a la que lleva el tramo por el que vas.
- `sections.js` (puro) + opcion `sections: true` de `MemoryController` (places llevan `sections: [s0, s1]`): dentro de la region con su tema en el live, base peso 1; +25 s base + s0 (0.35); +50 s base + s1; +70 s solo base; ciclo 90 s desde el promote/inicio. Con Memoria=no cuenta desde la entrada. Al salir de la region se quitan. Respeta el limite de 700 ms de `livePrompts`.
- Props por region en `world/props/<region>.js` (`build(scene, ctx)`; placeholders baratos que G3 reemplaza): caribe, pacifico, santander, llanos, cali, medellin (con metrocable animado) y mountains.
- Pruebas: `test-world.mjs`, `test-sections.mjs`, `test-drive-sim.mjs` (ruta Medellin -> Caribe -> Santander -> Medellin por la red).

## Juego (G3a): pase visual "maqueta de juguete a la hora dorada"
Primera mitad de G3 (pasos 1-5 de ESTILO.md seccion 6 + camino vivo basico + UI). Plan de arte en `ESTILO.md`; todo procedural, sin assets (solo Fredoka y Nunito por `<link>` de Google Fonts).
Teclas nuevas: **T** avanza una hora del ciclo de dia (amanecer > dia > atardecer > crepusculo > noche), **F** muestra fps, triangulos, llamadas, nivel de calidad y hora (`renderer.info`). Resto igual (WASD, Espacio, M, P, H).
- **Ciclo de dia** (`world/daycycle.js`, puro, `test-daycycle.mjs`): `paletteAt(t01)` interpola las 5 horas de la tabla 2.2 (cenit, horizonte = fog, sol/luna, hemisferica cielo/suelo, color de sombra, nubes, intensidades). El atardecer dorado se queda ~55% del ciclo (+ transiciones); `timeAt(elapsed, period)`; periodo por defecto 7 min, configurable con `?day=<segundos>`. Arranca en pleno atardecer (`?hour=dia|amanecer|...` para otra).
- **Cielo y luces** (`world/sky.js`, `scene.js`): domo con gradiente de 3 paradas + disco y halo del sol/luna (sol a ~11 grados al atardecer), 200 estrellas que aparecen de noche, 14 nubes (esferas fusionadas, 1 draw call, base tenida segun la hora, giran 0.002 rad/s), `HemisphereLight` + `DirectionalLight` del sol, `Fog` lineal (color = horizonte; near 70 / far 420 u: ESTILO decia 40/220, escalado al mundo de 2600 u).
- **Material cel** (`world/materials.js`): un solo `MeshLambertMaterial` + vertex colors + un `onBeforeCompile` que cuantiza la luz a 3 pasos (sombra / media / luz) y multiplica la zona oscura por el color de sombra de la hora (uniforms compartidos, los actualiza el ciclo). Variantes que comparten shader: `plain` (color por instancia, +-6% de luminosidad), `vc` (vertex colors), `wind`/`windplain` (viento), `hero` (sombras suaves: Willys y chivas), mas `makeGlow()` (MeshBasic emisivo: farolas, ventanas, luces de tarima se encienden de noche) y `addOutline(mesh)` (contorno inverted hull #3A2418 con normales suavizadas; solo en Willys y chivas por ahora).
- **Terreno y carreteras** (`world/terrain.js`, `road.js`): suelo por region segun tabla 2.3 (`GROUND`) y transicion de un suelo al otro a lo largo de cada carretera (corredor de ~170 u); carretera #E8C9A0 con bordes #B98B5E.
- **Sombras blob** (`world/shadows.js`): UN `InstancedMesh` con textura radial de canvas; instancia 0 = Willys, 1-2 = chivas, el resto sombras estaticas bajo casas, tarima, palmas, iglesia (`ctx.shade`). **Viento**: atributo `aWind` + `uTime` compartido en arboles, palmas, cafetales y palmas de cera (cero CPU).
- **Agua** (`world/water.js`): mar = un plano de 64x64 que sigue la camara, color por profundidad (textura 128x128 precalculada de `heightAt`) y 2-3 bandas de espuma que avanzan hacia la orilla en las costas norte y oeste; rio del Pacifico con flujo y espuma en las orillas.
- **Neblina de entrada** (`world/banks.js`, `fogRegionAt` en `regions.js`): reemplaza los sprites por bancos de 19 nubes-esfera esponjosas del color "niebla entrada" de cada region, que rebotan (`1 + 0.05 sin(1.5 t)`); a < 40 u del Willys se abren a los lados (despejan la carretera) y se encogen a 0.6, el fog global se tine 2 s hacia el color de la region y, al cruzar (12 u), se cierran detras y se reabsorben (opacidad 0.92 > 0). `fogBoost` (alcance 55 u) sigue acortando near/far del fog, asi que la neblina sigue tapando el arranque del tema; la logica de audio/memoria no cambio. Un anillo disperso de nubes marca el borde de cada zona.
- **Camino vivo** (`world/life.js`): cafetales (arbustos con puntos rojos, en filas sobre laderas) y palmas de cera en Medellin-Caribe y Cali-Medellin; 2 chivas (bus de colores con contorno) que recorren en bucle los anillos Medellin-Caribe-Santander y Medellin-Pacifico-Cali a 9 u/s constantes.
- **UI** (`index.html`, `minimap.js`): HUD, tarjetas y minimapa tipo sticker (crema, borde 3 px #3A2418, sombra dura), tarjeta de region arriba al centro (entra con pop de 280 ms, titulo con el color acento) y el HUD se oculta mientras dura si no cabe (< 960 px); velocimetro circular, ecualizador de 5 barras, vignette CSS. Camara: FOV 44-50, ~30 grados de elevacion, mira 18 u adelante.
- **Rendimiento** (`perf.js`, puro, `test-perf.mjs`): `pixelRatio 1`, `antialias:false` (`?aa=1` lo activa), sin sombras dinamicas. Media movil del frametime con histeresis: ignora los primeros 5 s tras arrancar (y tras pausa o cambio de pestana); baja un nivel si la media supera 18 ms sostenida 3 s y lo recupera si queda bajo 12 ms sostenida 6 s (con freno anti-oscilacion; ver G3c). Niveles (degradacion): densidad de arboles/palmas/cafetales 70/45/30%, fog far 340/270/210, nubes del cielo 75/50/35%.
- Parametros de dev en la URL: `?preview=1` (sin pantalla de inicio), `?hud=0`, `?fps=1`, `?card=<region>` (ver la tarjeta), `?road=<tramo>&s=<arco>` o `?at=x,z,rumbo` (aparecer en otro sitio).
- Pruebas: `npm test` incluye `test-daycycle.mjs` y `test-perf.mjs`. `experiments/smoke-scene.mjs` construye la escena con three real y un renderer falso (necesita `THREE_DIR`, ver el encabezado; no va en `npm test`).

## Mapa grande (G3b)
Tecla **N** (o clic en el minimapa) abre/cierra un mapa grande de todo el mundo (~70% del alto, fondo difuminado; Esc tambien cierra y el juego sigue corriendo): terreno con relieve, carreteras, estela del recorrido, las 6 regiones con icono y nombre, visitadas con check/halo y la que suena con pulso de su color. Codigo en `public/bigmap.js`; piezas puras (`pushTrail`, `bigMapSide`, `bigScale`, `hillshade`) en `minimap.js`, probadas en `test-bigmap.mjs`.

## Mapa ilustrado y carga (G3c)
- El mapa grande (N) ahora es un mapa ilustrado: papel crema, mar con ondas, silueta real de Colombia (`geo.js`) suavizada.
- Las 6 regiones van en su lugar geografico, con cordilleras, rios Magdalena/Cauca y carreteras del juego punteadas.
- Parte estatica horneada una vez en un canvas aparte; por frame solo estela, pulso, visitadas y Willys.
- `public/geomap.js` (puro, `test-geomap.mjs`): `worldToGeo(x,z)` = ajuste afin + correccion por pesos inversos; exacto en los 6 centros.
- `worldToGeo` esta aislada: si el mundo 3D toma la forma real de Colombia, basta reemplazar esa funcion.
- Carga: pantalla sticker con Willys y barra; el mundo se construye por pasos (`World.create`) y se precompilan shaders.
- `perf.js`: ignora 5 s tras arrancar o cambiar de pestana/pausa; media movil con histeresis.
- Baja si >18 ms por 3 s; sube si <12 ms por 6 s (con freno anti-oscilacion).
- El aviso de calidad solo sale con F o `?dev=1`, y nunca sobre el mapa grande.
- Capturas: `experiments/out/bigmap-*.png`. El minimapa circular sigue con el terreno horneado (el estilo ilustrado queda pendiente).

## Mapa de Colombia (G4)
El mundo 3D ahora tiene la FORMA REAL de Colombia, con colisiones y la carretera siempre limpia. Todo sigue siendo procedural (sin assets); capturas en `experiments/out/g4-*.png`.

**Proyeccion y mundo** (`world/geoproj.js`, pura): `lonLatToWorld`/`worldToLonLat` con escala uniforme de **260 u por grado** (1 u ~ 0.43 km; x este, z sur = -norte, origen en el centro del pais). El mundo es un rectangulo de 4200 x 5440 u (Colombia ocupa ~3100 x 4300 u; el resto es mar y la franja "fuera del mapa"). `geomap.js::worldToGeo` pasa a ser la inversa EXACTA de esa proyeccion (se acabaron el ajuste afin y los pesos): el Willys del mapa grande cae donde esta en el 3D, las regiones en su lon/lat y la silueta es el mismo poligono del terreno.

**Contorno** (`world/colombia.js`, `world/coast.js`): 275 vertices en cadenas costa Caribe / frontera Panama / costa Pacifica / fronteras Ecuador, Peru, Brasil y Venezuela (Chaikin en las costas; la Guajira, el golfo de Uraba, la costa Pacifica y el trapecio amazonico se reconocen). Dos estilizaciones para dar sitio a las mini-ciudades: la costa entre Cartagena y Barranquilla se endereza y la del Choco se corre ~0.1 grados al oeste. `coast.js` hornea dos campos de distancia con signo (rejilla de 20 u, ~45 ms): `countrySD` (distancia al contorno real, > 0 dentro: limite jugable y franja "fuera del mapa") y `landSD` (distancia a la playa: > 0 tierra, tambien la extranjera; < 0 mar). Las fronteras terrestres se empujan 800 u hacia afuera en un poligono extendido y las dos "cunas" que las unen a la costa cuentan como costa extranjera: asi el mar rodea las costas y la tierra continua mas alla de las fronteras (no es una isla).
- Costa: playa que sube suave desde el nivel del mar (agua de G3a: espuma y color por profundidad, ahora con una textura de profundidad rectangular de ~14 u por texel) y fondo plano a -9.
- Fronteras: al otro lado hay una franja de colinas bajas (hasta 26 u) de color gris lila apagado y la niebla cercana al borde se vuelve gris lila y ~30% mas corta (`scene.js`, `borderK`). El vehiculo no puede cruzar: limite blando en `vehicle.js` (ver colisiones).

**Regiones en su lugar** (`layout.js::GEO_SITES`): Medellin 6.25N 75.57W, Santander 6.7N 73.1W, Llanos 4.5N 71.5W y Cali 3.45N 76.53W en su coordenada real; Caribe 10.4N 75.0W (0.2 grados al sur de lo real, para tener mar a ~155 u al norte) y Pacifico 5.2N 76.85W (Quibdo real queda a 130 km de Medellin y la meseta plana de 150 u no cabria; asi hay >= 430 u entre vecinas y la playa a ~190 u al oeste). `llanos.js` y `santander.js` tenian coordenadas absolutas: ahora se desplazan con la region (`OX/OZ`); `caribe.js` pone su Sierra Nevada decorativa al ESTE (donde esta de verdad). Los demas props ya eran relativos al centro.

**Relieve** (`base.js`, `layout.js`): cordilleras Occidental, Central y Oriental de SO a NE (la Oriental se abre hacia Venezuela con las ramas de Merida y Perija), valle del Cauca y del Magdalena entre ellas con sus rios (agua de G3a, interrumpidos junto a carreteras y regiones), Sierra Nevada de Santa Marta (185 u, con nieve) cerca del Caribe, Pacifico bajo al oeste, Llanos planos y Amazonia como selva baja (`props/mountains.js`: ~9000 copas instanciadas por bloques de 520 u con culling por distancia, sin carreteras). Las regiones siguen siendo mesetas planas. `climate(x,z)` reparte oeste/este/norte/sur para suelo y arboles.

**Carreteras**: misma red de 7 tramos, re-trazada por valles y pasos (`edge(...)` con waypoints lat/lon + `amp/waves/bulge`). Tiempos a crucero (24 u/s, centro a centro) y medidos con el conductor scriptado (`test-drive-sim`):

| tramo | largo | a 24 u/s | radio minimo |
|---|---|---|---|
| Medellin - Caribe | 1123 u | 46.8 s (medido 47.0) | 63 u |
| Caribe - Santander | 1099 u | 45.8 s (medido 53.4) | 135 u |
| Medellin - Santander | 740 u | 30.9 s | 77 u |
| Santander - Llanos | 772 u | 32.2 s | 77 u |
| Medellin - Pacifico | 722 u | 30.1 s | 29 u |
| Pacifico - Cali | 746 u | 31.1 s | 22 u |
| Cali - Medellin | 855 u | 35.6 s | 32 u |

Medellin y Pacifico quedan a solo ~430 u, asi que su carretera da una panza amplia por el Atrato (`bulge`) para llegar a los 30 s. Los cafetales, palmas de cera y chivas de G3a siguen en med-car / cal-med y en los anillos.

**Colisiones** (`world/colliders.js`, `world/solidify.js`, `world/env.js`, `vehicle.js`; `test-colliders.mjs`, `test-vehicle.mjs`):
- `ColliderGrid` (rejilla de 40 u): circulos y cajas orientadas; `push(x,z,r)` empuja fuera y devuelve la normal. Singleton `COLLIDERS`; `ENV = { colliders, limit }` es el 6o argumento opcional de `vehicle.step/advance` (sin `env` la fisica es la de antes).
- `props/ctx.js`: `ctx.addCollider(x,z,r)` y `ctx.addBox(x,z,hx,hz,yaw)` para registrar a mano; ademas `ctx.inst` registra solo, por instancia, los objetos grandes (casas/torres como caja o circulo segun su huella, arboles solo por el tronco; se salta lo bajo, lo fino y lo que cae sobre la carretera; `opts.collide:false` / `opts.colliderR` para afinar). Las mallas FUSIONADAS estaticas de las regiones (muros, torres, iglesias, monumentos) pasan por `solidify` desde `scene.js`: se rasterizan sus caras verticales a 1.5 u en la banda 0.5-3.2 u sobre el terreno y se funden en cajas (lomas, techos inclinados y agua no bloquean; los edificios cerrados quedan macizos). ~6900 colisionadores en total (5.7k son troncos de pinos y selva baja).
- Resolucion en `vehicle.js`: 2 circulos (morro y cola, r 1.15), empuja fuera, rebote suave (restitucion 0.22, rozamiento tangencial 0.9: un golpe de refilon conserva velocidad; sin frenazos raros).
- Limite blando de Colombia: a < 27 u del contorno la velocidad hacia afuera se amortigua con exp(-7 dt); pasado el borde se devuelve despacio. Vale contra fronteras y contra el mar.
- Pendientes: la traccion cae entre ~30 y ~40 grados (`slopeLo/slopeHi`) y por encima el carro resbala cuesta abajo (`slide`); no sube de ~35 grados. Las cordilleras (flancos > 35 grados) son barreras naturales; las carreteras (<= 17 grados) y las mesetas siguen libres. `experiments/smoke-scene.mjs` recorre cada carretera con los colisionadores reales: 0 golpes, todas llegan.

**"A veces el pasto invade la carretera detras mio"** - diagnostico y arreglo:
1. La malla del terreno en el eje de la carretera quedaba EXACTAMENTE a la altura de la cinta (coplanar; solo `polygonOffset` desempataba) y, ademas, la interpolacion lineal de celdas de 12.8 u entre muestras de la carretera sobresalia hasta 1.1 u en curvas y crestas. Medido con `meshHeightAt`: la malla alcanzaba o superaba la cinta en el **80%** de las muestras de la red; a distancia, el z-fighting y los triangulos del terreno asoman como manchas de pasto sobre la via (sobre todo mirando hacia atras, donde la carretera ya queda lejos). No era un problema de LOD (el terreno siempre uso el aplanado).
2. Arreglo: la malla visual se hunde `ROAD_SINK = 1.1` u bajo la cinta a menos de ~9 u del eje y se funde a 0 hacia los 34 u (`terrain.js::roadSink`; la altura FISICA `heightAt` no cambia, el carro sigue en el perfil); la cinta lleva taludes de tierra a cada borde (`road.js`) para que no flote; `camera.near` 0.5 -> 1 (doble precision de profundidad); la cinta se parte en piezas de ~160 u (menos tris con culling por distancia). Resultado: malla >= cinta **80.2% -> 0.01%** (`test-world`).
3. Props sobre la via: `ctx.inst` descarta toda instancia a menos de `ROAD.halfWidth + 2.4` u del eje (salvo `onRoad:true` o dinamicas); en la primera version de la red 84 casas de ladera de Medellin caian encima de la carretera (`stats.roadFiltered`).
Capturas: `g4-atras-antes.png` (`?roadfix=0`) y `g4-atras-despues.png`.

**Minimapa y mapa grande**: el minimapa circular hornea el mundo rectangular (16 u por pixel) con el estilo del mapa grande (mar claro, tierra crema-verde con relieve, "fuera del mapa" lila) y dibuja el contorno de Colombia en tinta; el mapa grande dibuja la silueta con `lineTo` (exacta), cordilleras y rios tomados del mundo 3D (`geomap.js::RIDGES_LL/RIVERS_LL`), y vuelve a hornearse solo si se cambia el tamano de la ventana con el mapa abierto (antes quedaba en blanco).

**Rendimiento**: terreno en bloques de 20 x 20 celdas solo donde hay tierra (218 bloques, 145k tris en total) con culling por distancia del fog; visibles (conteo por frustum + culling por distancia en `experiments/smoke-scene.mjs`; `renderer.info` con `?perf=1` da lo mismo): Pacifico ~119k, Medellin ~116k, Amazonia ~99k (62k de selva), cordillera ~81k, Caribe ~73k, Llanos ~66k, frontera ~49k; 55-95 llamadas. La densidad lejana de pinos y selva baja baja con el governor de calidad (`thin`).

**Parametros de dev nuevos** (`index.html`): `?cam=x,y,z,tx,ty,tz` (camara fija), `?fov=`, `?nofog=1` (vistas del pais), `?roadfix=0` (terreno sin hundimiento: "antes" del arreglo), `?map=1` (abre el mapa grande), `?perf=1` (tris/draws por consola). Las capturas se sacan con Chrome headless (puerto 3010).

**Pruebas nuevas/actualizadas** (`npm test`): `test-world` (geografia real, contorno y mar/frontera, relieve, tiempos 30-55 s, carretera sobre el terreno), `test-geomap` (proyeccion exacta, silueta = terreno), `test-vehicle` (colisiones, limite de Colombia, pendientes), `test-colliders` (solidify), `test-drive-sim` (Medellin -> Caribe -> Santander -> Medellin con los tiempos nuevos).

**Pendiente / limites conocidos**: los rios se interrumpen (~30-100 u) al cruzar una carretera o una region en vez de llevar puente; Pacifico - Cali tiene tramos con radio de 22 u; la tierra "fuera del mapa" no tiene props ni muestra un cartel; el relieve entre Medellin y el Pacifico queda aplanado por las dos mesetas (la Occidental solo se ve al norte y al sur); los colisionadores de mallas fusionadas son aproximados (cajas de 1.5 u).
