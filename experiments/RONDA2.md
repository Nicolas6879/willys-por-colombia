# Ronda 2 - Medellin, Pacifico, Santander

Fijas (no regeneradas): Cali v3, Caribe v1, Llanos v2. Seed 7, ~25 s, analisis sobre s 4-25. Script `a2-generos.mjs`, datos crudos `out/a2.jsonl`. Ningun prompt fue filtrado (0 de 15); no se uso ninguna redaccion alternativa. Los prompts no llevan nombres de artistas, canciones ni ciudades.

## Hallazgos (investigacion)

### Medellin / guaracha (referencia: Fumaratto)
- Guaracha colombiana = zapateo = aleteo = chancleteo; nacio en Medellin en los 2010 mezclando EDM, reguetón y musica tradicional colombiana (trompetas, tambora, acordeon de cumbia). Raiz en la escena tribal house latina. Fumaratto: Latin sounds + DeepTech, Tech House, Tribal House, percusion organica, trompetas "guaracheras", a veces saxofon en vivo.
- Tempo: ~124-135 BPM, centro ~130 (TIDAL: ~130; guia de prompts: ~132 paisa, 125-135 tribal; listados de Beatport 124-130, algunos 133-140).
- Patron: bombo 4x4 firme (fuente practica, no musicologica), toms tribales, silbatos tribales, melodias saltarinas y "percussive flourishes", mezcla con dembow/reggaeton/merengue.
- Descriptores usados: 4-on-the-floor stomping kick, tribal toms, timbales, cowbell, whistle accents, bouncy plucked/staccato synth lead, short shouted chants, trumpet/brass-like synth stabs, build-up and drop, dembow snare accents, bpm 128-132 fijado en config.
- Fuentes: https://tidal.com/magazine/article/tidal-primer-guaracha/1-80936 , https://en.wikipedia.org/wiki/Guaracha_(Colombia) , https://soundcloud.com/stories/post/pasaporte-guaracha-colombiana-playlist , https://events.musicofourdesire.com/artist/fumaratto , https://canaltrece.com.co/noticias/fumaratto-celebra-10-anos-de-carrera-y-anuncia-su-desembarco-en-europa-con-enfasis-tour/ , https://hookgenius.app/es/learn/suno-house-prompts/
- Caveat: ninguna fuente da el patron exacto de bombo ni define "aleteo" tecnicamente.

### Pacifico (referencia: ChocQuibTown)
- Currulao tradicional: marimba de chonta (laminas de chonta sobre resonadores de guadua, dos tocadores: registro grave y agudo, afinacion no occidental), cununos macho y hembra (conicos, un parche), dos bombos grandes golpeados en el costado del parche, guasa (tubo de guadua con semillas), canto en llamada y respuesta.
- Chirimia chocoana: clarinetes, bombardino (euphonium), a veces saxofones, bombo, redoblante, platillos, tambora; sonido mas jovial/festivo.
- Fusion tipo ChocQuibTown: base hip hop + marimba de chonta y percusion afro sampleadas/en vivo, funk, reggae/ragga/dancehall; "El Bombo" combina currulao, chirimia y ragga; porro chocoano (acento en percusion) cercano al dancehall; ritmos bunde, bambazu, aguabajo.
- Fuentes: https://www.calendariodecolombia.com/colombia/instrumentos-musicales-tradicionales-de-colombia-y-su-origen-en-las-regiones-culturales-del-pais , https://festival.si.edu/2009/las-americas/cantadoras-del-pacifico/smithsonian , https://www.cancilleria.gov.co/sala-de-prensa/noticias/chirimias-del-pacifico-colombiano-punto-de-encuentro-de-jovenes-musicos-chocoanos-y-japoneses , https://www.eluniversal.com.co/suplementos/facetas/la-chirimia-del-choco-viene-a-alegrarnos-BE2767157 , https://www.npr.org/2010/03/30/125350397/pacific-grooves-straight-outta-choc-quib-town , https://rebelbase.be/interviews/detail/choq-quib-town---couleur-cafe-062010 , https://www.miaminewtimes.com/music/colombian-urban-fusion-act-choc-quib-town-makes-its-miami-debut-at-kukaramakara-6383638/
- Variantes: 1-2 tradicional currulao, 3 chirimia, 4-5 fusion moderna (bpm 92 y 96).

### Santander (bambuco, guabina, torbellino)
- Bambuco: 6/8 y 3/4 superpuestos (sesquialtera/hemiola); duos/trios de guitarra, tiple, bandola, a veces flauta.
- Tiple: 12 cuerdas metalicas en 4 ordenes de tres, timbre brillante, rasgueo. Bandola: punteada, con tremolo (12 cuerdas en 6 ordenes dobles segun una fuente; otras dicen 16). Requinto: guitarra pequeña afinada una cuarta arriba, solista agudo.
- Guabina: lamento lirico, coplas repetidas, rural, instrumentos tiple, requinto, bandola, carraca, pandereta, chucho. Torbellino: version mas rapida de la guabina, baile de pareja con giros.
- Fuentes: https://en.wikipedia.org/wiki/Guabina , https://transactions.ismir.net/articles/118 , https://librosaccesoabierto.uptc.edu.co/index.php/editorial-uptc/catalog/download/73/99/2816?inline=1 , https://www.lifeder.com/ritmos-region-andina/ , https://www.calendariodecolombia.com/colombia/instrumentos-musicales-tradicionales-de-colombia-y-su-origen-en-las-regiones-culturales-del-pais
- Caveat: los conteos de cuerdas vienen de fuentes secundarias.

## Tabla ronda 2

Ronda 1 "menos malas" de base: medellin 2-reintento -> a2-medellin-4; pacifico 2 -> a2-pacifico-1; santander 1 -> a2-santander-1.

| Region | Var | Prompt exacto | bpm config | Tempo detectado | Tonalidad (conf) | Centroide Hz | Filtrado |
|---|---|---|---|---|---|---|---|
| medellin | 1 | Latin electronic tribal house, 130 bpm, stomping four-on-the-floor kick, tribal toms and timbales, cowbell and whistle accents, bouncy plucked synth lead, short shouted crowd chants, energetic club | 130 | 65.4 (doble 130.7) (conf 0.926) | B major (0.41) | 3824 | no |
| medellin | 2 | Tribal house dance music with offbeat bouncy bassline, rolling tribal toms, timbales fills, staccato plucked synth riff, short shouted chants, big build-up and hard drop, 130 bpm | 130 | 131.1 (mitad 65.6) (conf 0.806) | A minor (0.47) | 3639 | no |
| medellin | 3 | Latin club electronic, stomping house kick, fast percussive hi-hats, congas, cowbell, police-whistle accents, trumpet-like synth stabs, hypnotic repetitive riff, festive | 128 | 127.3 (mitad 63.7) (conf 0.752) | F# minor (0.72) | 4514 | no |
| medellin | 4 | Colombian electronic tribal house, fast 128 bpm, chopped vocal-like synths, driving tribal drums, bouncy bassline, club dance energy, cowbell and whistle, raw percussive drop | 128 | 127.2 (mitad 63.6) (conf 0.76) | A major (0.43) | 2884 | no |
| medellin | 5 | Latin electronic dance, cumbia-inspired brass-like synth melody over tribal house drums, tambora-like toms, dembow-influenced snare accents, rolling percussion, 132 bpm | 132 | 65.7 (doble 131.5) (conf 0.701) | F# minor (0.71) | 4082 | no |
| pacifico | 1 | Afro-Colombian Pacific folk, resonant wooden marimba de chonta playing a repeating ostinato, deep bombo bass drum on a rolling 6/8 groove, male and female cununo drums, guasa bamboo shaker, call and response chorus chant, earthy rainforest feel | - | 105.1 (conf 0.482) | A minor (0.7) | 1906 | no |
| pacifico | 2 | Traditional currulao ensemble, marimba with a low bass register and a high melodic register, two large bombo drums struck on the side, conical cununo hand drums, guasa tube shaker, group chanting in call and response, 6/8 swing, raw acoustic live recording | - | 103.3 (conf 0.376) | G# major (0.51) | 1346 | no |
| pacifico | 3 | Pacific coast chirimia band, clarinets and euphonium playing a lively melody, snare drum, bass drum and cymbals, jovial festive street parade dance, fast and joyful, acoustic | - | 113.1 (conf 0.661) | D# major (0.72) | 1806 | no |
| pacifico | 4 | Modern Afro-Colombian Pacific fusion, hip hop drum groove with a sampled wooden marimba loop, cununo percussion, funky bass guitar, reggae offbeat guitar skank, urban and rhythmic instrumental | 92 | 92.5 (conf 0.704) | F# minor (0.65) | 1678 | no |
| pacifico | 5 | Afro-Colombian Pacific dancehall-tinged groove, marimba melody, bombo and cununo drums, ragga bassline, clarinet riff from a chirimia band, upbeat and danceable | 96 | 95.5 (conf 0.83) | G# minor (0.62) | 1795 | no |
| santander | 1 | Andean bambuco, bright twelve-string metal tiple strumming, plucked bandola melody with tremolo, acoustic guitar bass and chords, requinto fills, 6/8 against 3/4 sway, nostalgic intimate acoustic trio, clear and bright | - | 80.3 (doble 160.6) (conf 0.288) | C# minor (0.62) | 1436 | no |
| santander | 2 | Andean guabina, lyrical and melancholic, tiple and requinto duet, plucked bandola with tremolo, guitar accompaniment, slow lamenting mood, rustic rural acoustic recording | - | 106.2 (conf 0.234) | A major (0.89) | 1591 | no |
| santander | 3 | Fast torbellino dance, requinto lead playing quick lively runs, bright tiple strumming, guitar, carraca scraper and tambourine, spinning dance rhythm, rustic festive mountain folk | - | 64.4 (doble 128.7) (conf 0.587) | A major (0.88) | 3393 | no |
| santander | 4 | Colombian Andean string trio, bandola tremolo melody in parallel thirds over bright tiple rasgueo and guitar, bambuco rhythm alternating 6/8 and 3/4 accents, warm wooden acoustic sound | 110 | 107.9 (conf 0.162) | B minor (0.64) | 1237 | no |
| santander | 5 | Slow romantic Andean serenade, solo requinto and tiple, free expressive tempo, warm wooden acoustic recording, tender and nostalgic, mountain village evening | - | 112.7 (conf 0.233) | D major (0.74) | 1076 | no |

Nota objetiva: con bpm fijado en config el tempo detectado coincide (guaracha 127-131 con confianza 0.7-0.9; fusion Pacifico 92 y 96). Sin bpm, Pacifico y Santander salen a ~100-113 con pulso poco estable (conf 0.16-0.59), no fiable en 6/8. Las medidas no juzgan autenticidad.

## QUE ESCUCHAR
Comparar cada una con la favorita de la ronda 1 (Medellin 2-reintento `a-medellin-2.wav`, Pacifico 2 `a-pacifico-2.wav`, Santander 1 `a-santander-1.wav`).
1. Medellin: `out/a2-medellin-1.wav` ... `-5.wav` (1-3 tribal/guaracha con silbatos y cencerro; 4 = mejora de la ronda 1; 5 = sintes tipo metales cumbia + dembow).
2. Pacifico: `out/a2-pacifico-1.wav` (mejora de la ronda 1), `-2` (currulao tradicional), `-3` (chirimia), `-4` y `-5` (fusion hip hop/ragga).
3. Santander: `out/a2-santander-1.wav` (mejora de la ronda 1), `-2` (guabina), `-3` (torbellino rapido), `-4` (trio bandola/tiple, bpm 110), `-5` (serenata lenta).
Pregunta clave para el musico: cuales suenan mas autenticas que su favorita de la ronda 1, y si en Pacifico prefiere tradicional, chirimia o fusion.

## Ronda 3 (Medellin)

Base: `a2-medellin-5.wav` (v5). Objetivo: conservar ritmo y drop, quitar lo "brasileño" (silbato tipo samba/funk carioca), acercar a guaracha colombiana. Seed 7, bpm 132, ~32 s por toma. Script: `a3-medellin.mjs`, datos: `out/a3.jsonl`. Ninguna toma fue filtrada (filteredPrompt vacio). Pesos negativos: la API NO los rechazo (sin error, audio normal), pero no esta demostrado que tengan efecto; ver nota.

"Drop (s)" = mayor salto RMS (media 2 s despues / 2 s antes, ventanas de 0.5 s). Ratio alto = explosion clara; ratio ~1.2-1.5 = energia plana, sin drop real.

| # | Prompt exacto (peso) | Tempo | Tonalidad (conf) | Centroide Hz | Drop s (ratio) | Notas |
|---|---|---|---|---|---|---|
| 1 | Latin electronic dance, cumbia-inspired brass-like synth melody over tribal house drums, tambora-like toms, snare accents, big build-up and explosive drop, 132 bpm (1.0) | 132.1 (mitad 66, conf 0.65) | A minor (0.46) | 4792 | 12.0 (5.8x) | Hay break casi en silencio ~10-11 s y vuelve con fuerza: drop claro. Centroide mas brillante. |
| 2 | Igual que 1 + ", guacharaca-like scraper and shaker, accordion-like synth riff, cumbia gaita-like lead" (1.0) | 131.6 (conf 0.70) | A minor (0.60) | 4222 | 24.0 (7.2x) | Dos breaks (~7.5 s y ~22 s) con retorno fuerte: estructura build/drop repetida. |
| 3 | Latin electronic dance, guaracha, punchy offbeat bass, chopped vocal shouts, tribal toms, aggressive synth stab riff, big build-up and explosive drop, no whistles, 132 bpm (1.0) | 134.9 (conf 0.44) | C# major (0.62) | 4573 | 16.0 (3.4x) | Mas seco y bajo de volumen, golpes fuertes puntuales (~16 s); tempo menos estable. |
| 4 | v5 exacto (1.0) + "samba whistle, Brazilian funk, batucada" (-0.5) | 132.0 (conf 0.56) | B major (0.70) | 4129 | 19.5 (1.2x) | Acepto peso negativo. Sonido muy parejo y fuerte (RMS ~0.15-0.2), sin drop marcado. |
| 5 | v5 (1.0) + "Colombian cumbia rhythm, tambora and guacharaca" (0.4) | 65.6 (doble 131.2, conf 0.68) | F# major (0.67) | 4454 | 18.5 (1.4x) | Energia plana, ligero hueco ~17 s; sin drop claro. |
| 6 | Colombian guaracha, Latin electronic dance, cumbia accordion-like synth riff over tribal house drums, tambora toms, guacharaca scraper, punchy offbeat bass, chopped shouts, big build-up and explosive drop, no whistles, 132 bpm (1.0) | 65.5 (doble 131, conf 0.84) | B major (0.63) | 3788 | 21.5 (1.5x) | Pulso muy estable; centroide mas bajo (menos brillante); drop poco marcado. |

Nota: las tomas 4-6 estan muy niveladas en volumen (RMS casi constante), asi que "drop" por RMS es debil; puede haber explosion por timbre, no por volumen. Solo la oreja decide. Las tomas 1-2 consiguen drops por silencio+retorno, que es lo que mas se acerca a "explotar". Los pesos negativos no dieron error pero el efecto es incierto (la toma 4 cambio de caracter respecto a v5 por la nueva mezcla, no se puede aislar sin A/B con el mismo seed y sin el negativo).

## QUE ESCUCHAR (Ronda 3)
Comparar con `out/a2-medellin-5.wav`:
1. `out/a3-medellin-1.wav` y `-2`: drop claro tras break (~12 s y ~24 s). Estan sin "dembow/rolling"; el 2 anade guacharaca/acordeon/gaita. Aparece el silbato? Suena menos brasileño?
2. `-3`: guaracha punzante sin silbatos; mas seco, menos explosion de volumen.
3. `-4`: v5 + negativo "samba whistle/funk/batucada". Desaparece el pito de la mitad?
4. `-5` y `-6`: rasgos colombianos (tambora, guacharaca, acordeon); `-6` es mi mejor intuicion (guaracha + acordeon + sin silbatos). Mantiene el ritmo pero el drop puede ser menos explosivo.
Preguntas al musico: cual conserva el drop sin pito brasileño; si 1/2 (drop fuerte) gana a 6 (mas colombiano) o conviene combinarlas.
