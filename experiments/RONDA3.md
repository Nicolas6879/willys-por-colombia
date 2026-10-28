# Ronda 3: prompts por capas, bpm/scale por region, musica reactiva

Script: `a10-ronda3.mjs` (modos probe, gap, repro, regions, reactive). Datos crudos: `out/a10.jsonl`. Config de todas las tomas: temperature 0.9, topK 28, guidance 4.5 + seed + bpm + scale de la region (sin density/brightness/muteDrums).

## 1. Campos de config confirmados contra la API real (modelo lyria-realtime-exp, v1alpha)
Cada uno probado en su propia sesion, en el open (antes de play) y de nuevo a mitad de sesion: ninguno dio error ni cierre, el audio siguio. camelCase del SDK: `temperature, topK, seed, guidance, bpm, density, brightness, scale, muteBass, muteDrums, onlyBassAndDrums, musicGenerationMode` (QUALITY | DIVERSITY | VOCALIZATION). Ninguno se quito del juego. OJO: "aceptado" no prueba efecto (la API tampoco protesta por ignorar); el efecto de density/muteDrums se vio en la prueba reactiva (seccion 5), topK/guidance solo por oido. El juego NO usa musicGenerationMode, muteBass ni onlyBassAndDrums (sanitizeConfig los admite).

## 2. Tempos y tonalidades
Criterio: tempo propio del genero y, entre vecinas en la red de carreteras, tempo cercano (<= ~12%) o relacion simple (Medellin-Caribe 4:3); tonalidades a <= 1 paso en el circulo de quintas.

| Region | Genero | bpm | scale (Lyria) | Vecinas | Razon |
|---|---|---|---|---|---|
| Medellin | guaracha | 128 | C_MAJOR_A_MINOR | Caribe, Santander, Pacifico, Cali | extremo bajo del rango guaracha 128-135; La menor (trompeta) |
| Cali | salsa | 124 | C_MAJOR_A_MINOR | Medellin, Pacifico | 3% de Medellin, misma tonalidad |
| Pacifico | currulao | 116 | F_MAJOR_D_MINOR | Medellin, Cali | 9% / 6% de sus vecinas; Re menor = una quinta bajo C |
| Santander | bambuco | 112 | G_MAJOR_E_MINOR | Medellin, Caribe, Llanos | 12% de Medellin, 4% de Pacifico; G = una quinta sobre C |
| Llanos | joropo | 120 | D_MAJOR_B_MINOR | Santander | 7% de Santander; D = una quinta sobre G |
| Caribe | vallenato/cumbia | 96 | G_MAJOR_E_MINOR | Medellin, Santander | 3:4 con Medellin (96 x 4/3 = 128), misma tonalidad que Santander |

Live: abre con la config del lugar mas cercano (Medellin al empezar) y no hace resetContext al viajar. Mientras viajas entre regiones el tempo sigue siendo el del lugar del open hasta que el handover abre el recall con el bpm de la region.

## 3. Prompts nuevos (ancla fija + capas)
| Region | Ancla (peso 1) | Capa de instrumento (+25 s, 0.4) | Capa de mood / breakdown (+50 s, 0.5) |
|---|---|---|---|
| caribe | Vallenato cumbia, accordion, caja drum, guacharaca, instrumental | gaita flute melody, tambora drum, maracas | soft ambient pads, sparse percussion, warm sea breeze |
| pacifico | Currulao, marimba de chonta, bombo drum, cununo drums | fast marimba patterns, guasa shaker, call and response chant | rainforest ambience, soft spacious marimba, hypnotic and warm |
| santander | Bambuco, tiple, bandola, acoustic guitar | requinto lead melody, bandola tremolo solo | tender and nostalgic, sparse plucked strings, warm ambient room |
| llanos | Joropo, arpa llanera harp, cuatro, maracas | virtuosic harp runs, cuatro strumming harder | open plains at dusk, gentle slow harp, spacious ambient pads |
| cali | Salsa, brass section, piano montuno, congas | trumpet and trombone mambo brass, timbales fills | smooth electric piano, soft vibraphone pads, laid-back, sparse percussion |
| medellin | Colombian guaracha, Latin tribal house, congas, trumpet synth lead | rising synth lead, extra percussion and timbales | filtered warm pads, atmospheric breakdown, minimal percussion |

Base por region (density/brightness): caribe 0.5/0.6, pacifico 0.5/0.45, santander 0.4/0.5, llanos 0.55/0.6, cali 0.6/0.65, medellin 0.6/0.6. Solo +0.1/+0.05 en la capa de instrumento; el breakdown baja la base de density a ~0.2 (y brightness -0.05). Los prompts anteriores estan en `prompt_v1` / `sections_v1` de `places.json`.
Medellin: la identidad pedida es guaracha/Latin tribal house; el prompt anterior (afro house melodico, seed 11, 122 bpm) queda como v1. Salchipapeo sigue sin fuente (ver MEDELLIN.md); no se uso la palabra. Se evitaron "aggressive" y "Medellin club" (filtrados en ronda 1) y silbatos/batucada.

## 4. Audicion: 3 seeds x 25 s por region (`*` = seed actual)
Tempo = detector con la octava mas cercana al bpm pedido; Tono = tonalidad detectada vs tonica mayor pedida (la deteccion es orientativa). Sin filtrados ni errores en las 18 tomas.

| Region | seed | WAV | bpm pedido | tempo medido (conf) | tono detectado (conf) | encaja scale | centroide Hz | 1er audio ms |
|---|---|---|---|---|---|---|---|---|
| caribe | 7* | out/a10-caribe-s7.wav | 96 | 124.6 (0.532) | B minor (0.37) | no | 3029 | 3540 |
| caribe | 11 | out/a10-caribe-s11.wav | 96 | 86.8 (0.711) | G major (0.76) | si | 3199 | 3508 |
| caribe | 23 | out/a10-caribe-s23.wav | 96 | 92.1 (0.645) | B minor (0.65) | no | 2850 | 3618 |
| pacifico | 7* | out/a10-pacifico-s7.wav | 116 | 117.2 (0.751) | D# major (0.66) | no | 1067 | 3647 |
| pacifico | 11 | out/a10-pacifico-s11.wav | 116 | 115.9 (0.693) | C minor (0.52) | no | 1257 | 3913 |
| pacifico | 23 | out/a10-pacifico-s23.wav | 116 | 156.4 (0.473) | C minor (0.76) | no | 1073 | 3575 |
| santander | 7* | out/a10-santander-s7.wav | 112 | 121.8 (0.105) | G major (0.74) | si | 1833 | 4458 |
| santander | 11 | out/a10-santander-s11.wav | 112 | 116.1 (0.117) | E minor (0.85) | si | 1937 | 3773 |
| santander | 23 | out/a10-santander-s23.wav | 112 | 141 (0.207) | F# minor (0.67) | no | 2147 | 3451 |
| llanos | 7* | out/a10-llanos-s7.wav | 120 | 160.3 (0.699) | D major (0.87) | si | 2578 | 3507 |
| llanos | 11 | out/a10-llanos-s11.wav | 120 | 160.6 (0.751) | D major (0.7) | si | 3151 | 3487 |
| llanos | 23 | out/a10-llanos-s23.wav | 120 | 156.4 (0.72) | D major (0.85) | si | 2962 | 3485 |
| cali | 7* | out/a10-cali-s7.wav | 124 | 152 (0.425) | G major (0.78) | no | 1535 | 3863 |
| cali | 11 | out/a10-cali-s11.wav | 124 | 123.4 (0.589) | C major (0.63) | si | 1595 | 3939 |
| cali | 23 | out/a10-cali-s23.wav | 124 | 95 (0.606) | G major (0.72) | no | 1610 | 3470 |
| medellin | 11* | out/a10-medellin-s11.wav | 128 | 128 (0.834) | E minor (0.7) | no | 2879 | 3663 |
| medellin | 7 | out/a10-medellin-s7.wav | 128 | 128.2 (0.733) | D minor (0.63) | no | 2395 | 3496 |
| medellin | 23 | out/a10-medellin-s23.wav | 128 | 128.8 (0.816) | A minor (0.38) | si | 2838 | 3633 |

Tonalidad: 8/18 tomas encajan con la scale pedida segun el detector; el tempo sigue el bpm pedido en Medellin (128 +-1) y a ratos se va a doble/otra octava en las acusticas (Llanos ~160 = 4/3, Santander con conf <0.2: 6/8 poco fiable). Para decidir manda el oido: ¿suenan las seeds actuales igual de bien con el prompt corto, o conviene cambiar la seed de alguna region?
Reproducibilidad con la config nueva (misma seed + prompt + bpm + scale + topK + guidance, 6 s): IDENTICA bit a bit (Medellin seed 11).

## 5. Prueba reactiva (Medellin, 40 s): `out/a10-reactive-medellin.wav`
Velocidad simulada: 12 u/s (0-8 s), 24 (8-16), parado (16-30), 24 (30-40). Parches enviados (posicion de audio): 0 s d0.6/b0.6 | 8 s d0.77/b0.73 | 16 s d0.55 | 18 s d0.45 mute=true | 30 s d0.75 mute=false | 34 s d0.8.
Centroide por 2 s: ~5000 Hz en marcha, cae a 3110/1748 Hz (18-22 s) con la bateria silenciada y vuelve a subir hacia 24 s: efecto audible de muteDrums, pero el retorno parece anticipado respecto al unmute a 30 s (el audio no esta alineado exacto con la posicion de envio). Escuchar para confirmar.

## 6. Cambiar config a mitad de sesion NO corta el audio: `out/a10-gap-medellin.wav` (46 s)
Cambios: density 0.2 (8 s), 0.8 (14), muteDrums on (20) / off (26), brightness 0.2 (32), brightness 0.8 + density 0.5 (38), siempre con la config completa. Chunks de 2.0 s, 23 chunks:
- hueco mediano entre chunks 1989 ms; p95 2089 ms; **maximo global 2138 ms**; maximo en los 6 s tras cada cambio 2033-2138 ms (nada fuera de lo normal).
- salto de muestra en fronteras de chunk <= 0.056 de escala completa, por debajo del p99 natural de saltos entre muestras vecinas (0.077): sin clics.
- sin errores ni cierres. (El control con resetContext por cambio de bpm no se midio en la API real.)

## Riesgos
- bpm/scale nuevos cambian el sonido de las seeds elegidas de oido: hay que re-escuchar y quiza re-elegir seed.
- Prompts de 3-5 palabras dejan mas libertad al modelo (Llanos y Pacifico tienden a doble tempo/tono menos claro).
- Con Memoria=si, viajando el tempo/tono del live es el del lugar del open hasta el siguiente handover.
- La reactividad actua al instante sobre la base: en el breakdown (density ~0.2) la velocidad solo puede mover +-0.2.
- Parado ~2 s en el arranque silencia la bateria (previsto por diseno).
- Efecto real de topK/guidance sin cuantificar.
