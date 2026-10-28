# Medellin / guaracha: investigacion y ronda 4 (desde cero)

## 1. Investigacion (fuentes con URL)

**Nombres.** En Medellin guaracha = aleteo = zapateo = chancleteo (mismo estilo, nombre segun ciudad/baile: "zapateo" en Bogota, "aleteo" en Barranquilla). Nada que ver con la guaracha cubana salvo el nombre y el pisoteo al bailar. Apodo estigmatizado: "narco beat". Muchos productores dicen que en realidad es **tribal house** (el ritmo viene del tribal house neoyorquino de los 90).
- https://en.wikipedia.org/wiki/Guaracha_(Colombia)
- https://www.elcolombiano.com/tendencias/zapateo-guaracha-chancleteo-pandereta-y-salseo-la-musica-que-esta-de-moda-en-medellin-XX6716257 (2017: viene del tribal house; le meten voces de Joe Arroyo, Totó la Momposina, musica jamaiquina)
- https://www.vice.com/es/article/esto-es-la-guaracha-conozca-el-gnero-que-se-tom-los-remates-en-colombia/ (percusion corta tipo congas/palmas/chacha de guacharaca, cambios melodicos bruscos, voces femeninas, drops frecuentes y "gritos de guerra", "tech house pero mas groovero", fiestas de remate)
- https://soundcloud.com/stories/post/pasaporte-guaracha-colombiana-playlist (trompeta caracteristica guia el tema, tambora y acordeon de la cumbia, voces en espanol)
- https://www.elcolombiano.com/tendencias/massianello-uno-de-los-dj-y-productor-de-guaracha-mas-importante-de-medellin-AF19492417 (version "mas armonica, no tan ruidosa", ukulele, crossover con salsa/merengue/reggaeton)

**Salchipapeo: NO verificado.** Varias busquedas (incl. "salchipapeo guaracha") no devolvieron ninguna fuente que lo defina como genero/subgenero musical; solo aparece la salchipapa (comida). No lo invento: en la tabla lo trate como "guaracha groovera/perreo de remate" y esta marcado como hipotesis. Pregunta abierta para el musico colombiano: que es para el?

**Tempo.** 128-135 BPM (TIDAL ~130; DJ de El Colombiano: zapateo a 130; Beatport "Tribal/Guaracha" 124-130).
- https://www.zmmusic.com.ar/blog/posts/que-es-la-guaracha-709af2267fb7
- https://tidal.com/magazine/article/tidal-primer-guaracha/1-80936 (via resumen de busqueda; 403 al abrir)

**Receta de produccion (tutorial FL Studio).** 128 BPM de base; bombo 4x4 en cada negra; hi-hat cerrado sobre el bombo; **dos congas desfasadas (una ligeramente adelantada, otra atrasada) crean el "galope" del zapateo/aleteo**; shaker en tiempos 3-4 con volumenes humanizados; "snare bass" y bajo en C y G alineados con conga/shaker; **lead de trompeta corta, repetitiva, notas cercanas**, acento en tiempos fuertes; breakdown dejando solo shaker, clap, bombo y bajo, con la trompeta duplicada, y vuelta del beat completo.
- https://www.zmmusic.com.ar/blog/posts/como-hacer-guaracha-en-fl-studio-0dbc065da46f

**Sonidos/voces.** Trompetas sinteticas/samples de trompeta, sampleos de acordeon y frases de salsa/cumbia (ej. Niche), "pito" (DJ Serna: "mas pito, mas tarro"), frases repetidas tipo "taketaraketake", gritos. Sirenas/lasers/toms tribales NO aparecen en fuentes (los toms vienen de la herencia tribal house, sin fuente directa).
- Entrevistas citadas en El Colombiano (arriba) y El Tiempo https://www.eltiempo.com/cultura/musica-y-libros/dj-cornetto-el-musico-colombiano-que-triunfa-en-el-mundo-con-la-guaracha-656157

**Subestilos.** La bala (Cartago, ~2014): vertiente cruda/oscura, bombos secos y compactos, bajos distorsionados, trompetas digitales estridentes, golpes metalicos, drop retrasado o ausente; variantes tribala, zamarreo, cojo, astral. https://elenemigo.substack.com/p/que-carajos-es-la-bala

**Diferencias.**
- *Tribal house mexicano / tribal guarachero (3ball)*: otro linaje, cumbia + musica regional mexicana, mucha mas rapidez; no confundir. https://en.wikipedia.org/wiki/Tribal_guarachero
- *Funk carioca*: 120-140 BPM pero con tamborzao sincopado (ritmo 3+3+2 tipo), MC rapeando en portugues, sampler/808; la guaracha va en 4x4 recto + congas galopantes + trompeta y voces en espanol. Evitar: silbato, batucada, tamborzao, portugues. https://en.wikipedia.org/wiki/Funk_carioca
- *Raptor house/changa tuki* (Venezuela, derivado de house/tribal/reggaeton/kuduro): otro origen, mas duro y minimal. https://en.wikipedia.org/wiki/Raptor_house
- *Dembow*: patron 3+3+2 de caja; la guaracha lo usa solo como acento en cruces con reggaeton.
- *Cumbia rebajada*: lenta (~90 BPM), sin bombo 4x4.

**Estructura tipica.** Intro de bombo/percusion; build corto; drops muy frecuentes con grito de guerra; breakdown pelado (shaker/clap/bombo/bajo + trompeta) y regreso del beat.

## 2. Ronda 4 (a4-medellin.mjs; seed 7, 32 s, bpm fijado antes de play)

Prompts exactos en `out/a4.jsonl`. Ningun prompt fue filtrado; no hizo falta reintento. "Tempo medido" = detector (suele dar mitad; se muestra el doble).

| n | Estilo | Prompt (resumen; prefijo "Colombian guaracha, ") | bpm cfg | tempo medido | centroide Hz | drop (s, ratio RMS) | notas |
|---|---|---|---|---|---|---|---|
| 1 | Guaracha clasica de aleteo | 4x4, dos congas galopantes + shaker, melodia de trompeta de 2 notas, bajo a contratiempo, gritos picados, breakdown y drop | 130 | 130.8 | 4960 | 18.5 s, 1.82 | G min; muy brillante |
| 2 | "Salchipapeo" (hipotesis) | tech house groovero, bajo rodante sincopado, palmas, perreo, gancho vocal repetido | 128 | 129 | 2617 | 23.5 s, 1.90 | C# min |
| 3 | Zapateo | bombo seco pisando, galope de congas, hats cerrados, stabs de metal, gritos, drops frecuentes | 130 | 129.9 | 4165 | 29.5 s, 1.70 | A# maj |
| 4 | Guaracha + acordeon/cumbia | riff de acordeon cortado, tambora, guacharaca, lead tipo gaita | 130 | 130.3 | 2852 | 25 s, 1.21 | D# min; drop suave |
| 5 | Oscura / bala | bombo compacto seco, bajo distorsionado, trompeta digital estridente, golpes metalicos, toms, drop retrasado | 135 | 134.3 | 2601 | 24.5 s, 1.36 | A maj |
| 6 | Festiva feria/estadio | stabs de metal grandes, coros y palmas, tambora/conga, snare roll, drop enorme | 132 | 133.1 | 1949 | 24 s, 1.09 | C min; poca subida RMS |
| 7 | Moderna 2025 armonica | acordes pulsados tipo ukulele, sub calido, hook cantado, percusion con aire reggaeton | 128 | 91.1 (conf 0.36, incierto) | 1686 | 15 s, 3.41 | D maj; el tempo se desvio, posible medio-tiempo |
| 8 | Ponderado | "Colombian guaracha aleteo club track..." 1.0 + "cumbia accordion, tambora and guacharaca" 0.6 + "Colombian vallenato brass party" 0.3 | 130 | 129.8 | 3059 | 29.5 s, 1.11 | A maj |

Archivos: `out/a4-medellin-1.wav` ... `-8.wav`.

## QUE ESCUCHAR
- **Galope de congas** (1, 3): suena a "zapateo" o a samba/carioca? Si suena brasileno, el culpable es el patron sincopado de percusion; entonces quitar "shuffling/off-beat" y dejar congas rectas.
- **Trompeta/lead de 2 notas** (1, 3, 5): es corta y repetitiva como en los tutoriales, o es un lead de EDM generico?
- **Bombo**: 4x4 recto en todas; en 5 debe ser mas seco y compacto.
- **Acordeon/tambora** (4, 8): se oye cumbia real o un sinte generico? El 8 muestra si el peso 0.6 realmente aporta color colombiano.
- **Drop** (todas): hay un salto claro (1, 2, 7 sí) o queda plano (6, 8, 4)? El 7 es el mas marcado pero con tempo dudoso.
- **Voces/gritos**: hay gritos en espanol tipo "eeeh" o solo ruido vocal?
- **Salchipapeo (2)**: que quiere decir para el musico? Si no es lo que suena, descartar y pedir definicion.

---

# Salchipapeo (ronda 5)

## Investigacion (fuentes)

**Lo que se pudo verificar.** No hay definicion periodistica ni academica. El propio PETERBLUE publico en TikTok "QUE ES SALCHIPAPEO? | NO ES UN GENERO | Genre Fluid" (estilo fluido, sonido original suyo); otros lo llaman "el dueno del salchipapeo". Hashtags: #techno #guaracha #electronicmusic #latin #rave. Los textos exactos de TikTok no se pudieron abrir (la pagina no carga), solo titulos via buscador.
- https://www.tiktok.com/@peter_blue_/video/7595938705244917013
- https://www.tiktok.com/@norost__/video/7588323353107172628
- Playlist "Salchipapeo" en YouTube Music (56 temas, PETERBLUE, 240 KM/H, Serafina, GIO; sin descripcion legible): https://music.youtube.com/playlist?list=PL8p0Z9ELIumoF93IU8IUWtSVluuwAgrfa
- Temas 2026 con el nombre: "Dale Salchipapeo" (DJ Celextrike, **130 BPM**, listado como house/latin urban) https://www.shazam.com/song/1878395702/dale-salchipapeo ; "Paleta Dame Paleta (Salchipapeo)" (By Izan, listado techno) https://www.shazam.com/song/1875073831/paleta-dame-paleta-salchipapeo
- Perfil SoundCloud de DJ que lo describe como "techno y salchipapeo": https://soundcloud.com/messadrr/sets/salchipapeo

**Artistas.** Peter Blue (Bogota, Barcelona): "tecno merengue" = techno + guaracha + tribal + baile funk, referencias de los 90 (Proyecto Uno, Sandy & Papo); RA/Set79: hardgroove/techno rapido con ritmos latinos (merengue, dembow, reggaeton). Noise Mafia: sonido cinematico/atmosferico, hard trance/hard dance; no se vincula a guaracha. B2B en EDC Colombia.
- https://www.bluradio.com/entretenimiento/edc-llega-a-colombia-conozca-a-noise-mafia-y-peter-blue-protagonistas-nacionales-del-cartel-rs15
- https://ra.co/events/2549658 , https://set79.com/dj/Peterblue

**NO encontrado:** "brainrot criollo" (cero resultados), BPM de Peter Blue (ninguna fuente), rasgos concretos (bombo distorsionado, vocal chops, sirenas): son hipotesis a partir de la definicion del musico, no de fuentes. Unico dato duro de tempo: 130 BPM (Celextrike); hard techno generico 140-150 es suposicion. Por eso se exploro 132-148.

## Ronda 5 (a5-salchipapeo.mjs; seed 7, 32 s, bpm fijado antes de play; sin filtrados ni reintentos)

| n | Variante | bpm cfg | tempo medido | centroide Hz | drop (s, ratio) | notas |
|---|---|---|---|---|---|---|
| 1 | Techno duro + congas, trompeta corta, gritos | 148 | 148.1 (conf .87) | 2760 | 18 s, 1.07 | plano, RMS constante; A# min |
| 2 | Guaracha festiva mas techno | 132 | 132.1 (.70) | 3317 | 8.5 s, 1.53 | hueco de breakdown ~5-6 s |
| 3 | Caotico brainrot (chops agudos, sirenas, airhorn, cortes) | 140 | 139.9 (.24) | 4534 | 3.5 s, 1.36 | el mas brillante; tempo incierto |
| 4 | Techno + acordeon/cumbia | 136 | 135.4 (.34) | 2999 | 2 s, 1.12 | sin drop real |
| 5 | Rave de estadio (build snare roll) | 145 | 144.8 (.80) | 2859 | 14.5 s, 1.97 | build ~15 s (RMS .07) y luego drop fuerte |
| 6 | Ponderado: guaracha 1.0 + hard techno 0.9 + memes 0.3 | 140 | 140.2 (.84) | 2111 | 19 s, 2.61 | breakdown 16-19 s y vuelta; tempo muy estable |

Extra a pedido del musico: prompt exacto de a4-medellin-7 ("moderna 2025"), **config original 128 bpm** (medido 91.1, conf .36, incierto), ahora mas rapido (a5-m7.mjs):

| bpm cfg | archivo | tempo medido | centroide | drop | notas |
|---|---|---|---|---|---|
| 140 | a5-m7-140.wav | 140 (conf .47) | 1227 | 28 s, 4.03 | mas oscuro/grave, B min |
| 148 | a5-m7-148.wav | 148.5 (.36) | 1591 | 25 s, 1.24 | A maj |
| 155 | a5-m7-155.wav | 156.7 (.45) | 1768 | 16.5 s, 1.37 | F# min |

Archivos: `out/a5-salchipapeo-1..6.wav`, `out/a5-m7-140|148|155.wav`; datos en `out/a5.jsonl` y `out/a5m7.jsonl`.

## QUE ESCUCHAR (ronda 5)
- **Bombo** (1, 5, 6): suena distorsionado/hard techno con rumble, o limpio? El 1 es plano (sin drop): demasiado techno y poco "fiesta".
- **Congas/guaracha sobre el techno** (1, 6): conviven o una tapa a la otra? El 6 (ponderado) es la apuesta mas estable.
- **Brainrot** (3): hay vocal chops agudos, sirenas, cortes abruptos graciosos, o solo ruido? Es el que mas se acerca a "caos"; ver si el musico lo reconoce.
- **Acordeon** (4): se oye cumbia o sinte generico? No hay drop.
- **Estadio** (5): el build + drop (14.5 s) es el mas dramatico; sirve como estructura de referencia.
- **Festiva** (2): mas cercana a guaracha clasica que a techno?
- **a4-7 vs a5-m7**: comparar `a4-medellin-7.wav` (128 cfg, ~91 medido) con 140/148/155: se conserva el color "ukulele/hook cantado" al subir el tempo, o se vuelve generico? El 140 tiene el drop mas marcado; elegir cual tempo se acerca mas al "salchipapeo" del musico.
- Pregunta abierta al musico: BPM real y ejemplos de temas que considera salchipapeo (la investigacion no los da).

## Ronda 6 (fusion) (a6-fusion.mjs; 40 s, bpm fijado antes de play, sin errores ni filtrados)

Origenes: sal-2 = "Festive Colombian guaracha meets techno... 132 bpm" (a5 n2); m7 = prompt de a4-7 "moderna 2025" con "140 bpm" (a5-m7-140); sal-6 = ponderado guaracha 1.0 / hard techno 0.9 / memes 0.3. En 1-3 y 5-8 sal-6 entra con sus 3 sub-prompts, cada peso multiplicado por el factor de la toma (5 prompts en 1-2, 6 con estabilidad en 3). Clausula de estabilidad: "steady four-on-the-floor kick locked to the grid from the very first beat, consistent tempo, tight quantized groove". Tempo por ventana de 4 s (10 ventanas, octava plegada al bpm cfg); desv = ventana menos bpm cfg; "arranque" = desv media absoluta de 0-8 s.

| Rank arranque | n | Toma | bpm/seed | tempo ventanas (rango) | desv arranque / resto | sd | break y drop (RMS) | centroide Hz | tono |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 5 | mejor de 1-4 (la 3), seed 11 | 140/11 | 139.8-140.2 | 0.2 / 0.15 | 0.13 | break 7.5-9 s, drop 9 s (x1.32) | 2767 | A maj |
| 2 | 6 | idem seed 23 | 140/23 | 139.8-140.4 | 0.3 / 0.15 | 0.16 | hueco largo ~22-26 s, drop 26 s (x1.31) | 2641 | F# min |
| 3 | 7 | idem seed 42 | 140/42 | 139.1-140.6 | 0.4 / 0.42 | 0.42 | sin break (plano, mas fuerte) x1.09 | 2230 | A# min |
| 4 | 1 | 3 originales 1.0/1.0/1.0 | 140/7 | 139.2-139.8 | 0.6 / 0.52 | 0.16 | sin break claro, x1.14 | 2202 | A maj |
| 4 | 2 | pesos 0.8/1.0/0.7 | 140/7 | identico a 1 | 0.6 / 0.52 | 0.16 | identico a 1 | 2202 | A maj |
| 6 | 8 | n3 a 136 bpm | 136/7 | 136.9-137.2 | 1.2 / 0.96 | 0.11 | sin break claro, x1.11 | 1913 | A maj |
| 6 | 4 | prompt unico fusionado + estab. | 140/7 | 138.8 todas | 1.2 / 1.2 | 0.00 | sin break, x1.09 | 3005 | A maj |
| 8 | 3 | 2 + estabilidad 0.6 | 140/7 | 137.7-138.2 | 2.0 / 2.15 | 0.15 | break 15-19 s, drop ~19.5 s (x1.29) | 1991 | A# maj |

Hallazgos: (a) ninguna toma se "desordena" al inicio: con las 10 ventanas el arranque (0-8 s) nunca se desvia mas que el resto (first8bad = falso en todas); la inconsistencia del m7 original no se reproduce en la fusion. (b) Las desviaciones son offsets constantes (la 3 se traba en ~138, la 4 en 138.8, la 8 en ~137), no inestabilidad; las seeds 11/23 clavan 140. (c) Los pesos 1.0/1.0/1.0 y 0.8/1.0/0.7 dieron audio con metricas identicas al decimal: sospecha de que el cambio de pesos no altera la toma con la misma seed (o se normaliza); no hay diferencia que oir. (d) La estabilidad por si sola (clausula) acerca al break: 3, 5 y 6 tienen hueco de energia; 1, 2, 4, 7, 8 no. (e) Los drops son suaves en RMS (ratio max 1.32) frente a m7-140 original (x4.03 a 28 s); la fusion perdio el drop fuerte del m7.

## QUE ESCUCHAR (ronda 6)
Top 3 por estabilidad + drop: **a6-medellin-5** (tempo clavado 140, break corto 7.5-9 s y drop a 9 s; el mas rapido de llegar al drop), **a6-medellin-6** (clavado, build largo y drop a 26 s; fa# menor, mas oscuro, el mas parecido en estructura al m7-140), **a6-medellin-3** (break claro 15-19 s con drop a ~19.5 s, pero tempo real ~138: es el de la receta "festivo + m7 + break"). 7 es estable pero sin break.
- Comparar con las originales: sal-2 (festivo, 132), m7-140 (drop x4.03 a 28 s) y sal-6 (breakdown 16-19 s, tempo muy estable). Pregunta: el 5/6 conservan el caracter festivo de sal-2 y el ukulele/gancho cantado del m7, o gana el techno de sal-6?
- Primeros 8 s: se sienten "ordenados" desde el primer bombo? (medicion dice que si en todas; si el musico aun lo oye desordenado, es percepcion de groove/sincopa, no de tempo).
- El drop de 5 y 6 pega como el del m7-140 o queda blando? (medido mas blando).
- 4 (prompt unico) es el mas brillante (3005 Hz) y plano: suena a mezcla de generos o a uno solo?
- 8 (136) vs 3 (140 cfg ~138): se nota el cambio de 2 bpm?
Archivos: `out/a6-medellin-1..8.wav`; datos `out/a6.jsonl`.


## Ronda 7 (5 finales) (a7-finales.mjs; 1 prompt por estilo, 35 s, seeds 7/11/23/42, sin errores ni filtrados)

Prompts exactos:
1. reggaeton (bpm 93): Modern Medellin-style reggaeton, slow classic dembow rhythm with the signature dembow kick and snare pattern, deep rolling 808 sub bass, melancholic modern synth pads, romantic nylon guitar melody over lush chords, elegant sensual perreo groove, clean polished contemporary production, 93 bpm
2. guaracha (bpm 139): Colombian guaracha salchipapeo party track, punchy straight four-on-the-floor kick from the very first beat, galloping congas, short repetitive synthetic trumpet hook, cumbia accordion riff, festive Spanish party shouts, tension build then explosive drop, no whistles, no batucada, 139 bpm
3. parrandera (alegre y pícara, sin bpm fijado): Antioquian parranda folk music, lively and mischievous village fonda party, bright accordion, tiple and acoustic guitars strumming, guacharaca scraper rhythm, upright bass, joyful rustic carrying groove, live band feel, festive dancing energy
4. tango (clasico dramatico, sin bpm fijado; se eligio el clasico por ser lo mas distinto de las demas electronicas): Dramatic classic tango, passionate bandoneon leading, expressive piano, walking double bass, sweeping string section violins, staccato rhythmic accents, intense romantic tension and swelling crescendo, smoky milonga hall atmosphere
5. melodic (bpm 122): Elegant melodic afro house for a Latin club, organic percussion with congas and shakers, hypnotic rolling bass, emotive warm pads, memorable plucked synth melody with Latin flavor, tasteful build and smooth uplifting drop, polished modern production, 122 bpm

Metodo: ventanas de 4 s, octava plegada al bpm fijado (o al tempo global si no hay bpm); desv = media abs. de ventanas 0-8 s vs mediana (arranque) y del resto. Drop = mayor salto RMS (media 2 s despues / 2 s antes). Regla de eleccion: menor desv de arranque (tolerancia 0.5); entre empatados, en guaracha y melodic el drop mas fuerte, en el resto menor desv del resto. En tango y parrandera (sin bpm) el detector de tempo es poco fiable; ahi manda el oido.

| estilo | seed | ventanas 4s (bpm plegado) | mediana | desv arranque/resto | centroide | tono | drop (s, x) |
|---|---|---|---|---|---|---|---|
| reggaeton | 7 | 123.8 93.3 74.3 74.3 74.3 74.1 74.2 123.8 | 74.3 | 34.25 / 8.3 | 2632 | F# minor | 4 s, x1.45 |
| reggaeton | 11 | 92.1 92.1 92.1 122.6 73.7 73.8 73.4 92.1 | 92.1 | 0 / 14.32 | 2125 | A major | 27 s, x1.87 |
| reggaeton | 23 | 123.6 95.3 123.6 123.6 92.6 92.8 123.6 123.4 | 123.6 | 14.15 / 10.33 | 1830 | F# minor | 7 s, x1.56 |
| reggaeton | 42 | 93.2 93.2 95.3 93.1 74.3 74.3 62.4 93.3 | 93.2 | 0 / 11.82 | 1723 | G minor | 9 s, x1.82 |
| guaracha | 7 | 144.9 106.6 143.8 121.2 141 120.8 120.6 121.2 | 121.2 | 19.15 / 7.23 | 3860 | A# minor | 29.5 s, x2.01 |
| guaracha | 11 | 138.2 183.1 184.6 137 140.4 138.6 138.2 138 | 138.6 | 22.45 / 8.4 | 3487 | E minor | 14 s, x1.73 |
| guaracha | 23 | 139.4 140.8 140.2 140.6 140.2 140 139 139.8 | 140.2 | 0.7 / 0.37 | 2591 | F major | 5 s, x2.68 |
| guaracha | 42 | 137.4 138.3 138 137 138.6 136.9 137.7 140.6 | 138 | 0.45 / 0.93 | 3002 | G# major | 8.5 s, x4.78 |
| parrandera | 7 | 108 108.2 108.9 109 109.7 108.7 108.8 114.5 | 108.9 | 0.8 / 1.13 | 5754 | G minor | 28.5 s, x1.22 |
| parrandera | 11 | 115.1 114.2 115 114.9 112.8 114.7 114.7 114.3 | 114.7 | 0.45 / 0.47 | 5257 | D# major | 17.5 s, x1.11 |
| parrandera | 23 | 106.5 108.6 106.5 106.4 104.3 108.2 107.2 107.7 | 107.2 | 1.05 / 0.98 | 5717 | F major | 3 s, x1.24 |
| parrandera | 42 | 113.3 114.3 114.5 113.4 115 114.1 116.1 114.8 | 114.5 | 0.7 / 0.65 | 5659 | D minor | 24.5 s, x1.29 |
| tango | 7 | 177.2 176.2 144.6 183 178.8 144.8 176.2 173.2 | 176.2 | 0.5 / 12.57 | 1842 | C major | 8 s, x1.72 |
| tango | 11 | 403.4 155.6 201.6 138.4 309.8 407.4 135 162 | 201.6 | 123.9 / 80.57 | 1706 | D minor | 28 s, x2.65 |
| tango | 23 | 178.5 162.1 166.5 181.9 169.7 123.6 160.8 175.2 | 169.7 | 8.2 / 12.65 | 1952 | E major | 12.5 s, x2.76 |
| tango | 42 | 53.5 82.3 80 78.4 61.7 86.3 69.8 68.5 | 78.4 | 14.4 / 7.45 | 2165 | D minor | 25.5 s, x1.43 |
| melodic | 7 | 121.4 121.2 121.2 121.4 121.2 121.2 121.4 121.7 | 121.4 | 0.1 / 0.15 | 2894 | A# major | 8.5 s, x3.03 |
| melodic | 11 | 122.2 122.1 122.2 122.4 122.1 122.1 122 122 | 122.1 | 0.05 / 0.1 | 3352 | B minor | 4.5 s, x1.17 |
| melodic | 23 | 122 122 122 122 122 122.2 122.2 122 | 122 | 0 / 0.07 | 3109 | F# minor | 29 s, x1.16 |
| melodic | 42 | 121.2 121.2 121.4 121.4 121.8 121.4 121.4 121.4 | 121.4 | 0.2 / 0.07 | 2869 | D# minor | 34 s, x1.8 |

Elegidas: 1 reggaeton s42 (arranque 0, tempo 93.2 = el pedido; s11 empata pero cae a 73/122 mas veces), 2 guaracha s42 (arranque 0.45, drop x4.78 a 8.5 s, el mas fuerte; s23 mas estable pero drop x2.68), 3 parrandera s11 (arranque 0.45, ~115 bpm estable), 4 tango s7 (unica con tempo coherente ~176 ya desde el inicio; las demas se desordenan), 5 melodic s7 (arranque 0.1, drop x3.03 a 8.5 s, 121 bpm).
Archivos: out/FINAL-medellin-1-reggaeton|2-guaracha|3-parrandera|4-tango|5-melodic.wav; tomas out/a7-<estilo>-s<seed>.wav; datos out/a7.jsonl.

Nota posterior a la tabla: la eleccion final de `places.json` es melodic **s11** (`a7-melodic-s11.wav`; escucha final: arranque 0.05, drop x1.17 a 4.5 s), no la s7 de "Elegidas". La s7 queda como alternativa con el drop mas marcado (x3.03 a 8.5 s).
