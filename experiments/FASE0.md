# Fase 0 - mapa-lyria: pruebas de audio con Lyria RealTime

Todo con `models/lyria-realtime-exp`, seed 7, config por defecto (sin bpm/scale), 25 s por toma (analisis sobre los segundos 4-25). WAV en `experiments/out/`. Analisis automatico (croma, Krumhansl, autocorrelacion): orientativo; el detector de tempo tiene ambiguedad de octava y es poco fiable en 6/8 y en ritmos sincopados. La autenticidad musical la decide Nico al oir.

## Prueba A: autenticidad por region (`a-generos.mjs`)
Archivos: `out/a-<region>-<n>.wav`. Datos crudos en `out/a.jsonl`.

| Region | Var | Prompt exacto | Tempo (alt. octava) | Tonalidad (conf) | Centroide Hz | Filtrado | Notas objetivas |
|---|---|---|---|---|---|---|---|
| caribe | 1 | vallenato, diatonic button accordion playing a lively melody, caja vallenata drum, guacharaca scraper rhythm, bass guitar, upbeat Colombian Caribbean folk | 156.3 (mitad 78.2) | F minor (0.34) | 2385 | no | tonalidad ambigua |
| caribe | 2 | cumbia, gaita flutes melody, tambora drum, alegre drum, maracon rattle, call and response, warm bass, traditional Colombian Caribbean coast dance | 78.6 (doble 157.3) | A minor (0.65) | 2653 | no |  |
| caribe | 3 | Colombian Caribbean folk fusion, accordion and gaita flute together, cumbia rhythm with guacharaca and tambora, joyful festive dance groove | 59.8 (doble 119.6) | D major (0.68) | 2227 | no |  |
| pacifico | 1 | currulao, marimba de chonta wooden marimba ostinato, cununo drums, bombo drum, guasa shaker, Afro-Colombian Pacific coast, call and response chant feel | 66.8 (doble 133.6) | C minor (0.6) | 944 | no | oscuro/grave |
| pacifico | 2 | Afro-Colombian Pacific rainforest folk, resonant marimba melody over deep bombo bass drum, cununos and guasa rattle, hypnotic rolling 6/8 groove | 115 | D# minor (0.49) | 3429 | no | tonalidad ambigua; muy brillante |
| pacifico | 3 | Pacific coast of Colombia, marimba de chonta, hand percussion ensemble, rhythmic ritual dance, earthy and warm, wooden marimba tones | 106 | D minor (0.85) | 1542 | no | pulso poco estable (conf 0.326) |
| santander | 1 | Andean bambuco in 6/8, tiple, bandola, acoustic guitar trio, nostalgic, string ensemble, Colombian Andean folk | 68.5 (doble 136.9) | G# major (0.76) | 1179 | no | pulso poco estable (conf 0.338); oscuro/grave |
| santander | 2 | Colombian bambuco, bandola and tiple duet with guitar accompaniment, gentle 6/8 sway, melancholic romantic mountain serenade | 140.7 (mitad 70.3) | D major (0.85) | 1316 | no | pulso poco estable (conf 0.084) |
| santander | 3 | Andean Colombian instrumental, requinto guitar, tiple strumming, soft bandola melody, rustic nostalgic bambuco rhythm in 6/8 | 109.7 | A major (0.76) | 1534 | no |  |
| llanos | 1 | joropo llanero, Colombian harp virtuoso fast arpeggios, cuatro, maracas, fast galloping 6/8 3/4 rhythm, bass guitar, plains folk | 114 | G major (0.78) | 1407 | no | pulso poco estable (conf 0.345) |
| llanos | 2 | Venezuelan-Colombian plains joropo, arpa llanera harp melody, cuatro strumming, maracas driving rhythm, energetic galloping, instrumental | 60.6 (doble 121.2) | A major (0.73) | 2577 | no |  |
| llanos | 3 | llanera music from the eastern plains, harp, cuatro and maracas, fast syncopated 6/8 gallop, festive and rustic | 95.1 | G major (0.93) | 2011 | no |  |
| cali | 1 | salsa caleña, brass section trumpets and trombones, piano montuno, congas, timbales, bass tumbao, fast dance tempo, Colombian salsa | 102.1 | A minor (0.87) | 1995 | no |  |
| cali | 2 | fast Cali salsa dura, punchy horn section stabs, piano montuno, conga and bongo, cowbell, timbales fills, energetic dance floor | 124.7 (mitad 62.4) | D minor (0.66) | 3299 | no | muy brillante |
| cali | 3 | Colombian salsa band instrumental, tight brass arrangement, montuno piano, congas, timbales, driving bass, fast and festive | 112.9 | F major (0.81) | 2443 | no |  |
| medellin | 1 | Colombian electronic tribal house, guaracha, fast 128 bpm, chopped vocal-like synths, heavy percussion, aleteo, club | 60.7 (doble 121.4) | A minor (0.43) | 2247 | no | tonalidad ambigua |
| medellin | 2 | guaracha aleteo, aggressive electronic dance, fast 130 bpm, tribal drums, chopped vocal chops synth, bass drops, Medellin club | - | - | - | SI | sin audio (prompt rechazado por el filtro) |
| medellin | 2-reintento | Colombian electronic tribal house, fast 128 bpm, chopped vocal-like synths, driving tribal drums, bouncy bassline, club dance energy | 62.4 (doble 124.7) | A# minor (0.45) | 1709 | no | tonalidad ambigua |
| medellin | 3 | Latin electronic tribal house, 128 bpm, percussive congas and timbales over four-on-the-floor kick, stuttering vocal-like synth stabs, energetic | 65.4 (doble 130.8) | A major (0.49) | 3117 | no | tonalidad ambigua; muy brillante |

Filtrados: 1 de 19 intentos. `medellin-2` ("guaracha aleteo, aggressive ... Medellin club") devolvio `filteredPrompt` ("We couldn't create what you asked for") y no genero audio (WAV vacio de 44 bytes). Se reintento (fila "2-reintento", sin las palabras "guaracha aleteo", "aggressive", "Medellin" ni "vocal chops") y funciono; el WAV `a-medellin-2.wav` es el del reintento. No se sabe cual de esas palabras disparo el filtro. Ningun otro prompt fue filtrado.

Observacion objetiva: ningun prompt fijo el tempo; los tempos detectados (60-156, con ambiguedad de octava) no siempre coinciden con lo que pide el genero (ej. salsa y guaracha salen a ~100-125 o ~62/125). Para la mecanica del mapa convendria fijar bpm (con resetContext) por region si el tempo importa.

## Prueba B: "volver suena convincente?" (`b-recall.mjs`)
Regiones: X = Cali salsa (prompt de `cali-1`), Y = Caribe vallenato (prompt de `caribe-1`), seed 7. Eleccion por defecto del encargo (no se uso juicio musical). Sesion 1: 25 s primera visita (audio 0-25), viaje de 40 s con 20 pasos de 2 s (X 1 -> 0.05, Y 0.05 -> 1; audio 25-65), sesion 2 (seed 7, X solo) abierta a los ~36 s del viaje y grabada ~24 s; sesion 1 vuelve a X solo (sin seed nueva) y sigue 20 s.

| Medida | Valor |
|---|---|
| Bytes de sesion 2 vs primera visita (primeros 20 s) | 1.000 (identicos) |
| Croma sesion 2 [0-20 s] vs primera visita [0-20 s] | 1.000 |
| Croma 20 s finales de `b-recall-memoria.wav` vs primera visita | **0.998** |
| Croma 20 s finales de `b-recall-sin-memoria.wav` vs primera visita | **0.790** |
| Croma viaje, ultimos 15 s (casi todo Y) vs primera visita | 0.781 |
| Croma viaje, primeros 12 s vs primera visita | 0.935 |
| Control: primera visita mitad 1 vs mitad 2 | 0.944 |

Lectura: la sesion 2 con seed igual arranca bit a bit identica a la primera visita, asi que la version "con memoria" devuelve exactamente el material oido (0.998 tras el crossfade, el resto es el propio crossfade de 1.5 s). La version "sin memoria" vuelve al estilo pero deriva (0.79, parecido a la deriva medida en orquesta-lyria). Caveat: una sola toma; el 0.998 mide la repeticion de un tramo ya oido; si suena natural o brusco el corte lo decide el oido. Duracion de ambos WAV: 85 s. Cortes: primera visita/viaje en s 25 (continuo, misma sesion); viaje/vuelta en s 65 (memoria: crossfade 63.5-65 hacia el inicio de la sesion 2).

Tambien guardados: `b-recall-sesion1.wav` (88 s, sesion completa) y `b-recall-sesion2.wav` (24 s).

## QUE ESCUCHAR
Prueba A (25 s cada uno; elegir la mejor variante por region):
1. `out/a-caribe-1.wav` vallenato; `a-caribe-2.wav` cumbia; `a-caribe-3.wav` mixta. Oir si hay acordeon/guacharaca (vallenato) y gaitas/tambora (cumbia).
2. `out/a-pacifico-1.wav`, `-2`, `-3`: busca marimba de chonta, cununos y bombo; que no suene a marimba generica de otro pais.
3. `out/a-santander-1.wav`, `-2`, `-3`: bambuco 6/8 con tiple/bandola/guitarras; el 6/8 nostalgico (el detector de tempo no lo mide bien).
4. `out/a-llanos-1.wav`, `-2`, `-3`: arpa llanera, cuatro, maracas, galope rapido.
5. `out/a-cali-1.wav`, `-2`, `-3`: salsa con metales, montuno de piano, congas y timbales.
6. `out/a-medellin-1.wav`, `-2` (reintento), `-3`: tribal house/guaracha; que no sea house generico.
Prueba B:
7. `out/b-recall-memoria.wav` (85 s): 0-25 salsa (primera visita), 25-65 transicion a vallenato, ~63.5-65 crossfade, 65-85 deberia sonar como la primera visita otra vez (mismo tema). Oir si el crossfade es aceptable y si reconoce "volver".
8. `out/b-recall-sin-memoria.wav` (85 s): igual hasta 65; 65-85 la misma sesion vuelve a salsa pero con material nuevo. Comparar contra el 7: se nota la diferencia de "reconocimiento"?
9. Opcional: `out/b-recall-sesion1.wav` y `out/b-recall-sesion2.wav` (esta debe sonar igual a los primeros 24 s de la primera).
