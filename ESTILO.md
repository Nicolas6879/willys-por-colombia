# ESTILO — Willys cafetero por la Colombia en miniatura

Documento de dirección de arte y presupuesto técnico. Three.js r160, sin build, todo procedural, objetivo 60 fps en Intel UHD 620.
Leyenda: [FUENTE] = publicado; [INF] = inferencia mía, no verificada.

---

## 1. Investigación

### 1.1 Messenger (Abeto) — lo publicado
Fuentes:
- Awwwards (write-up del equipo): https://www.awwwards.com/messenger.html
- Communication Arts (entrevista con Vicente Lucendo): https://www.commarts.com/webpicks/messenger
- Wikipedia: https://en.wikipedia.org/wiki/Messenger_(video_game)
- 80.lv: https://80.lv/articles/deliver-mail-on-tiny-colorful-planet-in-this-relaxing-web-game
- Boing Boing: https://boingboing.net/2025/10/27/messenger-is-the-coolest-browser-game-ive-ever-played.html
- Aftermath: https://aftermath.site/messenger-browser-game-abeto

Hechos [FUENTE]:
- Stack: three.js + three-mesh-bvh; modelado en Blender y Houdini (Substance mencionado en prensa); shaders, controles, cámara y red propios. Lanzado sept 2025 por Vicente Lucendo y Michael Sungaila.
- Contornos: sistema de líneas propio con grosor, color y transparencia controlables por píxel; las líneas dan el look "dibujado a mano". Se comprometieron con contornos y paleta desde el principio y se mantuvieron aun habiendo opciones más brillantes (restricción = carácter "indie").
- Paleta: todos los colores viven en una textura de 16x16 px ("color atlas"); cambiar esa textura cambia luz y ánimo de todo el mundo a la vez.
- Vegetación: los bosques empiezan como manchas (blobs) y se sustituyen por follaje/hierba optimizados; mezcla de datos en la geometría (vertex data) y shaders para el look estilizado.
- Agua: ondas en la orilla, gradientes de color en aguas profundas; la ropa del personaje se moja y se seca.
- Cámara: tercera persona sobre el hombro, centrado automático ("smart camera"), colisión de cámara en callejones.
- Rendimiento: LOD propio de 4 niveles que conserva la silueta; carga/descarga de assets; texturas y modelos divididos y comprimidos (Safari iOS mata páginas con mucha memoria); UI dibujada en WebGL (glifos vía WebAssembly); cambios de apariencia repartidos en el tiempo.
- Mundo: planeta pequeño donde caminar recto da la vuelta (sin muros invisibles). Críticos lo comparan con Jet Set Radio (cel-shading), Sable, Wheel World.
- NO publicado (no inventar): postproceso, método de nubes, niebla, iluminación exacta, tipo de material.

### 1.2 Referencias afines (conocimiento general, no verificado en esta sesión) [INF]
- Bruno Simon (bruno-simon.com): look "juguete" con cámara cenital-diagonal, luces baked en texturas, cielo plano, física de coches de juguete. Idea útil: baked/colores planos + pocos objetos con gran carácter.
- Slow Roads: terreno procedural, niebla de distancia fuerte y gradiente de cielo para dar profundidad; la atmósfera sale del color de niebla = color del horizonte.
- A Short Hike: renderizado a baja resolución con pixelado, paleta cálida saturada, siluetas simples, niebla de color por zona.
- Alba, Lil Gator Game, Tiny Glade: colores pastel saturados, sombreado suave en 2-3 pasos, vegetación que se mece, partículas ambientales (hojas, luciérnagas), tilt-shift/DOF suave en Tiny Glade.
- Codrops (toon en three.js, pasos y outlines): https://tympanus.net/codrops/?p=75663 ; foro three.js sobre outlines: https://discourse.threejs.org/t/rendering-style/12593
- Docs MeshToonMaterial: https://sbcode.net/threejs/meshtoonmaterial/

### 1.3 Lo que tomamos de todo esto
1. Paleta mínima y controlada, cambiable por hora con pocos números (idea del atlas 16x16 de Messenger).
2. Contorno/silueta clara en lo que importa, no en todo.
3. Cámara que se centra sola y nunca choca.
4. Mundo pequeño que se "lee" de un vistazo (miniatura), LOD que conserva silueta.
5. Niebla y cielo del mismo color = profundidad barata.

---

## 2. ESTILO DEL JUEGO (decisiones cerradas)

### 2.1 Principios
"Maqueta de juguete a la hora dorada". Colores saturados cálidos, sombras frías moradas (nunca negras), formas gordas y redondeadas, todo con vida (se mece, rebota). Una sola idea de luz: sol bajo naranja.

### 2.2 Paleta base por hora (atardecer dorado = principal, 70% del tiempo)
Cada hora define: cielo cenit / horizonte (=niebla) / sol / luz hemisférica cielo / hemisférica suelo / direccional.

| Hora | Cenit | Horizonte = niebla | Sol (dir) | Hemi cielo | Hemi suelo |
|---|---|---|---|---|---|
| Amanecer | #6FA8DC | #FFC1A1 | #FFB38A | #BFD7F2 | #8E6C8A |
| Día | #4FA3F0 | #CDEBFF | #FFF2D6 | #CFE8FF | #8DB36A |
| **Atardecer dorado (principal)** | #5B7FD1 | #FFC873 | #FFB347 | #FFD9A0 | #7A5C9E |
| Crepúsculo | #3B3A82 | #F08A8A | #FF8A65 | #8E8AD6 | #4A3A6B |
| Noche | #121B3F | #2E3E7A | #8FA8FF (luna) | #3A4A8F | #1A1A3A |

Sombras (color de la zona oscura del toon, multiplicado): atardecer #7A5C9E, día #6E7FB5, noche #26305E.
Los valores de intensidad: hemi 0.9, direccional 1.6 al atardecer; ajustar a ojo, el color manda.
Transición: interpolar linealmente un objeto `{zenith, horizon, sun, hemiSky, hemiGround}` entre horas (ciclo corto, ~6-8 min por vuelta completa, atardecer se mantiene más tiempo).

### 2.3 Paleta por región (3 colores dominantes + 1 acento + color de niebla de entrada)

| Región | Suelo | Base arq./objetos | Verde | Acento | Niebla entrada |
|---|---|---|---|---|---|
| Caribe | #F2D79A arena | #FF7F50 coral / #FFD23F amarillo | #5DBB63 | #19B5C9 turquesa | #FFE9B8 |
| Pacífico | #4F8A5B | #2E7D6B selva / #7A5230 madera | #1F6B4A | #3FB8E0 mar | #BFE3E0 gris-verdoso |
| Santander | #C58B57 tierra | #D9B38C piedra / #8B3A2B teja | #8DA05A | #E9622B hormiga/tabaco | #F2D2B0 |
| Llanos | #D8C45E pasto | #F3E5AB / #8A5A2B | #9CC24A | #FF9E1B | #FFF0C2 |
| Cali | #E2B455 | #FFFFFF blanco / #C2433D rojo salsa | #6FAE4A | #FF3E8A magenta | #FFD0C0 |
| Medellín | #6E9A4B | #C65F3E ladrillo / #F2A33A | #3F8F4E | #E2418C flores | #D9E6F2 bruma de montaña |

Camino/transición: carretera #E8C9A0 con bordes #B98B5E; cafetales #2F7D3E con puntos rojos #D7263D; palma de cera tronco #D9C7A3, copa #6FB04A.

### 2.4 Reglas de forma
- Proporciones chibi: personajes y animales con cabeza = 45-50% del cuerpo, patas cortas; edificios 1.3x más anchos de lo real.
- Cero aristas duras en cosas "vivas": usar esferas, cápsulas, cilindros de 8-12 segmentos, conos con 6-8. Edificios: cajas con "bisel" falso (techo ligeramente más ancho, esquinas = cilindros).
- Exageración: iconos 2-3x tamaño real relativo (acordeón, hormiga, Cristo Rey, sombrero vueltiao); árboles = tronco fino + copa-nube grande.
- Lenguaje de silueta: cada icono debe leerse en silueta a 40 px.
- Miniatura "tilt-shift": cámara a ~35-45° elevación, FOV 40-45 (más teleobjetivo = look maqueta), objetos pequeños con color saturado. Efecto tilt-shift falso con la niebla (desenfoque no, solo bruma al fondo) y vignette.
- Piso inclinado: terreno con colinas suaves; sin ángulos rectos en el paisaje.

### 2.5 Materiales — DECISIÓN
**MeshLambertMaterial con vertex colors + 1 `onBeforeCompile` mínimo que cuantiza la luz a 3 pasos** (no MeshToonMaterial).
Justificación: Lambert calcula luz por vértice en three.js (barato en UHD 620), vertex colors evitan texturas y permiten fusionar geometrías por región (pocos draw calls). El cuantizado en fragment (`floor(light*3)/3` aplicado a `diffuse`) da el look cel sin gradientMap. MeshToonMaterial funciona, pero lleva fragment lighting por píxel y una textura extra; en iGPU con muchos píxeles, el coste se nota y no aporta aquí. Alternativa permitida solo para el Willys y hitos: MeshToonMaterial con `gradientMap` de 3 pasos (DataTexture 3x1, NearestFilter), valores 90/170/255.
Reglas: `flatShading:false` en orgánicos, `true` en rocas/montañas; una sola instancia de material por familia; `fog:true` siempre; sin `transparent` salvo nubes/agua (ordenar manualmente).
Variación de color: ±6% de luminosidad por instancia vía vertex color (rompe la monotonía gratis).

### 2.6 Contornos — DECISIÓN
Ninguno por pase global (post-proceso Sobel/normales = 2x coste en UHD 620). **Inverted hull solo en: Willys, el chiva, y 6 hitos (uno por región)**: segunda malla con `side: BackSide`, `MeshBasicMaterial` color #3A2418 (marrón oscuro, no negro), escala por vertex shader a lo largo de la normal (grosor 0.03 u). Presupuesto: +~3k tris en total. Resto de objetos: la silueta sale del contraste de color y la sombra morada. Si fps <55 en pruebas: quitar hull de hitos primero.

### 2.7 Cielo
- Domo (esfera 32x16 invertida) con shader de gradiente vertical de 3 paradas: horizonte → medio → cenit (usa la tabla 2.2), `depthWrite:false`, sin fog.
- Sol: sprite/disco aditivo (círculo con borde suave, radio angular ~4°) + halo mayor al 15% de opacidad. Sol bajo (~12° sobre el horizonte) al atardecer.
- Nubes: 12-16 grupos de 4-7 esferas (8x6 segmentos) fusionadas por nube, base achatada (scale.y 0.55), color blanco #FFFFFF con cara inferior teñida #FFD9B8 al atardecer (vertex color por altura). Flotan despacio (rotación del grupo de nubes alrededor del mapa, 0.002 rad/s). ~100 tris por nube, 1 draw call por todas.
- Estrellas de noche: 200 puntos (`Points`), tamaño 2 px, aparecen por opacidad.

### 2.8 Niebla de entrada a región (momento estrella)
- Fog global `THREE.Fog` lineal, color = horizonte de la hora (near 40, far 220 en unidades de mundo [INF: ajustar a escala]).
- En la frontera de cada región: banco de "nubes esponjosas" a nivel del suelo, 10-14 nubes-esfera (mismo generador del cielo, escala 3-5 u) en una línea que cruza la carretera, color = "niebla entrada" de la región (tabla 2.3).
- Al acercarse el Willys (<25 u): las nubes se abren (cada una se desplaza lateralmente ±6 u y se encoge a 0.6) mientras el color de la niebla global se interpola 2 s al color de la región nueva y suena el cambio musical. Al cruzar, las nubes se reabsorben detrás (escala 1, opacidad 0.8→0).
- Rebote: cada nube con `scale = 1 + 0.05*sin(t*1.5+fase)`. Sin partículas volumétricas, sin alfa pesado: opacidad 0.9 y `depthWrite` activo en sólidas.
- Título de la región aparece con la tarjeta HUD (2.14).

### 2.9 Agua
- Mar: un plano grande (64x64 segmentos máximo) con shader propio: color base en gradiente por distancia a costa (profundo #1E88C8 → bajo #4FD1C5 → orilla #B8F2E6), dato de costa precalculado en un vertex attribute o una textura 128x128 de distancia.
- Bandas de espuma: en el fragment, `sin(dist*freq - time*vel)` con smoothstep a 2-3 bandas blancas #FFFFFF que avanzan hacia la orilla y se desvanecen. Ruido barato (hash) para romperlas. Sin reflejos, sin refracción, sin transparencia real (opacidad fija 0.92).
- Olas: desplazamiento vertical suave con 2 senos en el vertex shader (amplitud 0.15 u).
- Ríos: misma shader con dirección de flujo, color de la región (Caño Cristales: bandas de #E8353A rojo, #F7D31B amarillo, #3BB273 verde, #2F7BD6 azul sobre cauce arenoso, texturas por vertex color, sin shader especial).

### 2.10 Viento en vegetación
Vertex shader inyectado con `onBeforeCompile` en el material Lambert compartido: `pos.x += sin(time*1.6 + pos.x*0.5 + pos.z*0.5) * windAmp * heightFactor` donde `heightFactor` = atributo de vértice (0 en la base, 1 en la punta, o simplemente `position.y` local). Amplitud 0.05-0.15 u, palmas 0.2 u. Uniform `uTime` único y compartido. Cero CPU por árbol. Mismo patrón para pasto, cafetales, banano.

### 2.11 Partículas
Todo `InstancedMesh` o `Points`, sin física real, actualizadas en shader con `uTime`:
- Polvo del camino: 30 puntos que salen de las ruedas/pies, 0.6 s de vida, color #E8C9A0 al 50%.
- Hojas: 60 quads pequeños cayendo con balanceo en bosques/Pacífico/Medellín, color de región.
- Mariposas: 20-40 por zona verde (dos planos que aletean por escala X con seno), colores #FFD23F, #FF6EC7, #4FC3F7.
- Aves: 10 siluetas "V" (2 triángulos) que giran en círculo lejos; en Caribe garzas/flamencos; en el cielo atardecer bandadas.
- Luciérnagas en noche: 60 puntos aditivos #FFF59D.
- Lluvia (solo Pacífico): 300 líneas cortas (`LineSegments` instanciado) en caja alrededor de la cámara.

### 2.12 Iluminación
- `HemisphereLight` (cielo/suelo según tabla) + un `DirectionalLight` cálido del sol. **Sin sombras dinámicas.**
- Sombras "blob": un disco oscuro (CircleGeometry 12 seg, color #3A2A5E, opacidad 0.35, `depthWrite:false`) bajo personaje, vehículos, animales, edificios; para edificios grandes un quad con textura radial generada en canvas 64x64.
- Contraluz falso: tinte cálido en bordes con un uniform de color añadido en el shader del Lambert según dot(normal, dirección de cámara) (rim light barato, opcional).
- Sin luces puntuales salvo máximo 2 en noche (farolas se simulan con sprites aditivos).

### 2.13 Postproceso
**Un solo pase** de pantalla completa (si las pruebas lo permiten; si no, ninguno): color grading + vignette en un shader: `color = pow(color, vec3(0.95))`, saturación +10%, mezcla hacia tinte de la hora, vignette suave (0.25 a bordes). Render a `devicePixelRatio` máx 1.0 en iGPU (la mayor ganancia de fps); `antialias:false` y suplir con render scale 1.0. Sin bloom, sin SSAO, sin DOF real, sin outline global. Si fps baja <50: apagar el pase y aplicar vignette como un overlay CSS (radial-gradient).
Alternativa sin pase: overlay CSS para vignette y tinte (coste cero de GPU de escena). Recomendada para el primer prototipo.

### 2.14 Tipografía y UI
- Títulos: **Fredoka** (Google Fonts, redondeada, peso 600); texto: **Nunito** peso 600-700. Cargar con `<link>` o dejar fallback `system-ui` si offline [INF: verificar si se admite fuente externa].
- Tarjetas: fondo crema #FFF4DC al 92%, borde 3 px #3A2418, radio 18 px, sombra dura 0 4px 0 #3A2418 (look sticker); el título de la región con el color acento de la tabla 2.3.
- HUD: iconos en círculos de 44 px con el mismo borde; barra de música (ecualizador de 5 barras rebotando) abajo a la izquierda.
- Animación UI: entran con "pop" (scale 0.8 → 1.05 → 1 en 280 ms); nada de desvanecidos lentos.
- Contraste mínimo 4.5:1 texto sobre tarjeta (#3A2418 sobre #FFF4DC pasa).

---

## 3. Mini-ciudades por región

Convenciones: presupuesto de triángulos por elemento; "A" = animado; ubicación C=centro, B=borde de carretera, F=fondo. Primitivas: S esfera, C cilindro, K cono, B caja, T torus, P plano. Todo fusionado por región en 1-2 mallas estáticas + instancias para repetidos. Tris totales por mini-ciudad: ~6-9k.

### 3.1 Caribe (Cartagena + Guajira + Valledupar)
Verificado: murallas y casas coloniales de colores (Cartagena), palenqueras (San Basilio de Palenque, frutas en bandeja sobre la cabeza), sombrero vueltiao (Zenú), flamencos (Camarones/La Guajira), acordeón (vallenato, Valledupar), marimonda (Carnaval de Barranquilla), Sierra Nevada de Santa Marta.
1. **Muralla y torre del reloj** (C): cilindro ancho 12 seg + almenas (8 cajas) + torre con reloj (caja + disco blanco + cono). ~350 tris. Estático.
2. **Casas coloniales con balcones** (C/B): 6 cajas de colores (#FFD23F, #FF7F50, #FF6B9A, #4FC3F7) con balcón (caja delgada + 2 cilindros) y techo plano; instanciadas. ~120 tris c/u. Bougainvillea: 3 esferas magenta #E2418C por balcón.
3. **Palenquera** (C, frente a la muralla): cápsula-falda (cono ancho, vestido amarillo/rojo/azul), cabeza esfera, bandeja = disco + 6 esferas de fruta (piña cono, mango, sandía). ~300 tris. A: balanceo suave de la bandeja.
4. **Sombrero vueltiao gigante** (B, hito): cono truncado achatado, anillos de vertex color blanco/negro (franjas) en espiral. ~250 tris. A: gira lento.
5. **Flamencos** (F, laguna rosa): cuerpo S rosa #FF8FB1, cuello dos cilindros finos, patas dos cilindros; 7 instancias, una pata levantada. ~90 tris c/u. A: cuello baja a "comer" cada 3-5 s con fases distintas.
6. **Acordeón gigante** (C, plaza de Valledupar): fuelle = 8 cajas alternando rojo/blanco apiladas con escala variable, dos tapas cajas negras con botones (esferas/instanciadas nacar). ~400 tris. A: fuelle se abre y cierra con la música (escala X ligada a beat/energía).
7. **Arepa de huevo y puesto de comida** (B): puesto = caja con toldo a rayas; arepa = cilindro achatado dorado #E9B44C con un huevo (S amarilla + disco blanco). ~150 tris. A: humo de 3 esferas subiendo.
8. **Marimonda** (C, desfile): personaje chibi con capucha larga (cono torcido con nariz-trompa de cilindro), traje de colores (cuerpo esfera #FF3E8A y lunares), ojos grandes. ~300 tris. A: baila (balanceo + saltitos).
9. **Sierra Nevada** (F): 3 conos grandes (low-res 12 seg), nieve = capa blanca #FFFFFF en el vértice con y alta (vertex colors). ~150 tris. Estática, detrás de la niebla.
10. **Palmeras con cocos** (B): tronco curvo (3 cilindros) + 6 hojas (planos curvados). ~80 tris. A: viento.

### 3.2 Pacífico (Chocó / Nuquí / Bahía Solano)
Verificado: ballenas jorobadas migran a la costa entre jul-oct (Bahía Solano, Nuquí, Gorgona); palafitos; potrillo (canoa tallada en una pieza, Chocó); rana dorada (Phyllobates terribilis, Cauca/Guapi); marimba de chonta (música del Pacífico, Patrimonio UNESCO); lluvias entre las más altas del mundo.
1. **Ballenas jorobadas saltando** (F/C en el mar): cuerpo = esfera estirada (scale 1x0.6x2.4) gris-azul #5C7FA3, vientre blanco (vertex color), aletas pectorales largas (2 cajas aplanadas), cola (2 triángulos extruidos). ~250 tris. A: salto en arco parabólico cada 10-15 s (pitch rotando con la tangente), salpicadura = 12 esferas blancas pequeñas + anillo de espuma que se expande en el agua. 2 ballenas con fases distintas. Hito principal de la región.
2. **Selva lluviosa con lluvia** (fondo y bordes): árboles de 3 esferas verde oscuro + tronco, helechos (conos), lianas (cilindros delgados); lluvia (2.11). ~120 tris c/u, instanciados. Cielo nublado más gris (#A9C7C2).
3. **Palafitos** (C): casa = caja con techo a dos aguas de zinc #9AA5A8 sobre 4 cilindros en el agua, escalera, pasarela de tablones. ~200 tris. A: luz cálida en la ventana al anochecer.
4. **Potrillos / canoas** (C/B): casco = caja con extremos en cuña (o 6 cajas escalonadas), remo; con 1 pescador chibi. ~150 tris. A: se mecen y avanzan lentamente por el agua.
5. **Rana dorada** (B, sobre hoja): cuerpo S amarillo #FFD400, ojos negros, 4 patas cortas; hoja grande = plano verde. ~80 tris. A: salta y respira (escala del vientre).
6. **Cocos y cocotero** (B): cocos = esferas marrones, palma como Caribe; coco abierto con pitillo en puesto. ~60 tris.
7. **Marimba de chonta** (C, plaza): 12 barras (cajas de largo decreciente) sobre dos caballetes + 2 baquetas, madera #B5753C. ~200 tris. A: las teclas "saltan" 0.05 u al ritmo del sonido.
8. **Manglar** (borde): raíces de zancos (conos finos), copa S. ~100 tris.
9. **Cascada y río** (F): caída con vertex color blanco/azul y aguas animadas con scroll UV. ~150 tris.
10. **Pescado/Sancocho de pescado**: opcional, pequeño en puesto.

### 3.3 Santander
Verificado: hormiga culona (Atta laevigata, se come tostada, tradición santandereana); Cañón del Chicamocha con teleférico (Panachi) y parapente (San Gil, Aventura); Barichara (pueblo de piedra, calles empedradas, pueblo blanco-ocre); cabra santandereana (cabrito, cabra); tabaco/tradición artesanal en Santander (Socorro/Charalá) [INF: referencia secundaria, verificar].
1. **Hormiga culona gigante** (C, hito): cuerpo 3 esferas (cabeza, tórax, abdomen enorme culona), 6 patas cilindros doblados, antenas 2 cilindros, color #8B3A2B con brillo #E9622B; ojos blancos grandes. ~350 tris. A: antenas se mueven, camina en círculo pequeño sobre una plataforma y levanta el abdomen.
2. **Cañón del Chicamocha** (F): dos paredes de terraza = cajas escalonadas con vertex color de capas (#C58B57, #D9B38C, #A8683E), río al fondo azul. ~400 tris. Estático.
3. **Teleférico** (C sobre el cañón): dos torres (cajas), cable = línea, 2 cabinas (caja roja + techo) que se deslizan. ~150 tris. A: cabinas recorren el cable hacia lados opuestos.
4. **Barichara** (C): 8 casas blancas/ocres con techo de teja #8B3A2B, iglesia con dos torres, empedrado como textura de vertex color a cuadros. ~1.5k tris total. Estático.
5. **Parapentes** (cielo sobre el cañón): ala = media esfera achatada coloreada a franjas, piloto S, líneas. 3 instancias de ~100 tris. A: círculos lentos con balanceo.
6. **Cabras** (B/C): cuerpo cápsula, cabeza S, cuernos 2 conos, barba. ~120 tris. A: cabeceo para pastar y saltito.
7. **Tabaco / hojas de tabaco secándose** (B): rack de cajas con hojas (planos amarillo-marrón #B07A3A). ~100 tris.
8. **Mesa con hormigas culonas tostadas** (B): bandeja con 8 mini-hormigas (esferas); guiño de comida. ~80 tris.
9. **Cueva/roca con paso** (B): rocas flat-shaded #A8683E.

### 3.4 Llanos Orientales
Verificado: sabana inmensa y atardeceres, morichales (Mauritia flexuosa), chigüiro (Hydrochoerus, roedor más grande del mundo), garzas, llanero a caballo / coleo, joropo con arpa y cuatro, "mamona"/ternera a la llanera (carne asada al fogón), Caño Cristales (Serranía de la Macarena, Meta, "río de los cinco colores", sobre todo jun-nov).
1. **Sabana y cielo grande** (fondo): plano casi liso con pasto ondulante (conos instanciados, 600 instancias con viento). Horizonte lejano, sol grande. ~1.2k tris.
2. **Morichal** (C/B): palmas moriche (tronco C + 8 hojas en abanico con planos) alrededor de un charco. ~120 tris c/u, 8 instancias.
3. **Chigüiros** (C, al borde del agua): cuerpo cápsula gruesa marrón #9A6B3F, cabeza cuadrada, orejitas; 3 instancias (mamá y 2 crías). ~100 tris. A: respiración y "chapuzón" ocasional.
4. **Garzas** (borde/charco): cuerpo S blanco, cuello curvo (3 cilindros), pico cono amarillo, patas finas. ~90 tris. A: vuelo corto (2 alas planas aleteando) cada 20 s.
5. **Llanero a caballo** (C): caballo cápsulas + cuello + cabeza, jinete chibi con sombrero de ala ancha y poncho; ~350 tris. A: trote suave con rebote; patea el polvo.
6. **Fogón con carne a la llanera / mamona** (C): estacas inclinadas con costillar/lomo (cilindro marrón #8A3F1F), brasa naranja (sprite), humo. ~150 tris. A: humo, chispas.
7. **Arpa llanera y cuatro** (C, junto al fogón): arpa = triángulo de cajas finas + cuerdas (líneas); cuatro = guitarra pequeña (S + C). ~150 tris. A: cuerdas vibran con la música.
8. **Caño Cristales** (F/B): río serpenteante con cauce en bandas de color (2.9), rocas redondeadas. ~600 tris. Estático (colores), agua scroll.
9. **Casa llanera** (C): bohío con techo de palma (cono ancho) y corral de cercas (cajas). ~200 tris.
10. **Rebaño** vacas (B): cuerpo caja redondeada con manchas.

### 3.5 Cali
Verificado: Cali = "capital mundial de la salsa" y Feria de Cali; Cristo Rey (cerro, estatua de 26 m con brazos abiertos); Gato del Río (Hernando Tejada, obra del escultor — usar solo guiño genérico: gato estilizado distinto, otro color y pose); chontaduro (fruto de palma, vendido en la calle con sal y miel); cerros tutelares (Tres Cruces, Cristo Rey, Cerro de las Tres Cruces); Iglesia La Ermita (neogótica, blanca y azul, ícono real de Cali); río Cali; Torre de Cali (edificio icónico).
1. **Cristo Rey en el cerro** (F, hito): cerro cono suave verde-amarillo, estatua = cuerpo K/C blanco + brazos caja abierta + cabeza S; pedestal. ~250 tris. Estático; luz especial: sprite cálido detrás al atardecer.
2. **Iglesia La Ermita** (C): caja blanca + torre/chapitel azul-gris (#6C8EBF) + ventana ojival (plano con vertex color). ~250 tris.
3. **Gato del Río (guiño genérico)** (B, ribera): gato gordo chibi sentado de color distinto (naranja con manchas turquesa), cola enrollada; NO reproducir pose, proporciones ni colores exactos de la obra. ~150 tris.
4. **Bailarines de salsa** (C, pista): 2 personajes chibi abrazados; vestido rojo/blanco; cuerpos cápsula. ~300 tris. A: giro de pareja + vaivén de caderas al ritmo del bpm (usar el bpm de Lyria si hay).
5. **Puesto de chontaduro** (B): carrito (caja + toldo), pila de chontaduros (esferas pequeñas rojo-naranja #E2542B, 20 instancias), vendedor. ~250 tris.
6. **Cerros de Cali** (F): 3 lomas con cruz (Tres Cruces: 3 cruces de cajas), vegetación seca amarilla. ~150 tris.
7. **Farolas** (B): poste C + esfera de luz cálida (emissive); ~40 tris c/u, 6 instancias. A: parpadean al anochecer (sin luz real, sprite).
8. **Parlantes/ tarima de Feria** (C): caja con luces de colores (esferas emissive) y bocinas. ~200 tris. A: luces parpadean con la música.
9. **Cañaverales** (borde): conos altos verde-amarillo instanciados (Valle del Cauca, caña de azúcar): 300 instancias con viento.
10. **Torre de Cali** (F): caja alta delgada + remate; ~60 tris.

### 3.6 Medellín (y paisaje cafetero)
Verificado: Metrocable (Línea K, 2004) y metro; Comuna 13 con escaleras eléctricas exteriores y grafitis; Feria de las Flores con desfile de silleteros (Santa Elena); bandeja paisa; casas de ladrillo en laderas; Valle de Cocora (Quindío) con palma de cera (árbol nacional); Eje Cafetero (PCC, Patrimonio UNESCO).
1. **Metrocable** (C/F, ladera): torres C delgadas, cable, 3 cabinas rojas (caja redondeada, ventana celeste) con trayecto sobre barrio. ~250 tris. A: cabinas viajan y se detienen un segundo en la estación.
2. **Casitas de ladrillo en ladera** (C/F): 30 cajas escalonadas en la colina, color #C65F3E con techo #A24A2E/#8B8B8B, ventanas amarillas. Instanciadas. ~120 tris c/u (1 instancia por casa, techo con 2 triángulos); colores variados ±8%. A: ninguna; luz de ventanas al atardecer.
3. **Comuna 13: escaleras eléctricas y grafitis** (C): escalera = caja diagonal con 6 escalones + techo pequeño naranja; paredes con grafiti (textura procedural en canvas: manchas de color, formas simples, sin copiar murales reales). ~300 tris. A: escalones se deslizan (offset UV).
4. **Silleteros** (C/B, desfile): chibi con silleta (plano) en la espalda cubierta de flores (30 esferas pequeñas rosas/rojas/amarillas/moradas, formando un arco floral). ~350 tris. A: caminan en procesión con balanceo.
5. **Bandeja paisa** (B, puesto): plato grande (disco), frijoles (S marrón), arroz (blanco), chicharrón (caja ondulada), huevo frito, arepa, plátano maduro, aguacate (S verde partida). ~150 tris. A: giro lento y "vapor".
6. **Cafetales** (camino, laderas): arbustos (esfera verde oscura #2F7D3E con 6 puntos rojos #D7263D), en hileras; sombra de plátano (banano: tronco + 5 hojas). ~40 tris/arbusto, 200+ instancias; viento ligero.
7. **Palma de cera** (camino/borde): tronco muy alto y fino (cilindro 8 seg crema #D9C7A3), copa con ~10 hojas finas. ~100 tris, 40 instancias; es el skyline del paisaje cafetero. A: viento más fuerte.
8. **Flores** (borde): cucuruchos de colores, cubierta de flores (Medellín) en prados. 
9. **Camioneta Willys / jeep paisa** (B, guiño): jeep con canastos de café. Reciclar el vehículo del jugador.
10. **Casa cafetera** (C, finca): fachada blanca con puertas y ventanas de colores #2B6CB0, #D7263D y balcón de madera (arquitectura cafetera). ~200 tris. A: humo de chimenea.

---

## 4. Elementos del camino (disfrutar manejar)
Entre regiones cada tramo debe cambiar en 3 cosas a la vez: color de suelo, vegetación y objeto-guía, para que el viaje "se sienta" distinto.
- **Cafetales en laderas** (hileras en terrazas), **palmas de cera** a intervalos irregulares, **plátanos** como sombra.
- **Ríos con puentes**: puente de madera/piedra arqueado (caja + arco por cilindro), el agua bajo él con shader de flujo; sonido y pequeño "bump" visual en la cámara al cruzar.
- **Chivas** (buses de colores) en tránsito: caja rojo/amarillo/azul con franjas, canasto en el techo, ruedas grandes, bamboleo; 2-3 instancias que circulan por el mismo carril en dirección opuesta (~350 tris c/u). Contorno hull.
- **Señales**: postes de madera con tablas en dirección y color de la región (texto con canvas texture), y un pórtico de bienvenida a cada región.
- **Pueblos pequeños**: 4-6 casitas con plaza y campanario cada tramo, instanciadas; luz cálida de ventanas.
- **Vacas** pastando, caballos, gallinas cruzando (A: se apartan al acercarse el jugador).
- **Flores** en bordes (instanciadas, ~6 colores) y mariposas.
- **Cambios de luz**: la hora cambia de modo lento durante el trayecto; entre regiones, rayos de sol entre las nubes (conos aditivos de baja opacidad) al atardecer.
- **Pequeños detalles de juego**: baches con salpicadura de polvo, charcos, puestos de fruta en la orilla donde la música cambia de timbre al pasar (Lyria).
- **Cámara**: seguir al Willys con suavizado (lerp 0.08), look-ahead leve, zoom out al ir rápido, colisión simple de cámara (pull-in si hay obstáculo) tomada de la idea "smart camera" de Messenger.

---

## 5. Presupuesto de rendimiento (UHD 620, 60 fps)

| Concepto | Límite duro | Objetivo |
|---|---|---|
| Triángulos visibles por frame | 150k | 80-100k |
| Triángulos totales en escena | 400k | 250k |
| Draw calls | 150 | 60-90 |
| Materiales distintos | 12 | 6-8 |
| Texturas | 8 pequeñas | 128x128 máx (nubes, grafiti, gradientes) |
| Resolución | pixelRatio 1.0 | 1.0 (opcional 0.85 dinámico) |
| Luces | 2 | hemi + dir |
| Sombras | 0 | blobs |

Técnicas:
- **Fusionar por región**: todo lo estático de una región = 1 `BufferGeometry` con vertex colors (1 draw call). Usar `BufferGeometryUtils.mergeGeometries` (importable por import map).
- **InstancedMesh** para: árboles, palmas, cafetales, casas, flores, pasto, nubes pequeñas, rocas. 1 draw call por tipo. `instanceColor` para variación.
- **Frustum culling** activo en cada región (bounding sphere por chunk); cada región = un `Group` con `visible=false` si está a > 1.5x del radio de niebla far.
- **LOD por distancia** (inspirado en los 4 niveles de Messenger, pero simplificado a 2-3): cerca = modelo completo; lejos (>60 u) = versión con ~25% de tris o un blob/sprite; muy lejos (>120 u) = oculto (la niebla lo tapa). Para instancias: dos InstancedMesh (near/far) reasignando por chunk cada 0.5 s, no por frame.
- **Actualizaciones en el tiempo**: animaciones de decoración en un único bucle con `uTime` en shader (viento, agua, nubes); animaciones por CPU solo para ~30 objetos importantes (fauna principal).
- **Pooling** de partículas; sin `new` en el bucle de render.
- Mezcla de transparencias: máximo 3 materiales transparentes (nubes, agua, partículas).
- `renderer.setPixelRatio(1)`, `powerPreference:'high-performance'`, `antialias:false`; si el frametime medio >18 ms durante 2 s: bajar pixelRatio a 0.85, luego apagar postproceso, luego reducir far de niebla (esto también recorta lo que se dibuja).
- Cargar regiones diferido: construir región vecina en `requestIdleCallback`/por trozos para evitar hitches de más de 8 ms; liberar geometrías de la región lejana (`dispose`).
- Perfilar con `renderer.info` (calls, triangles) mostrado en un overlay con tecla de debug.

---

## 6. Orden de implementación (G3)
1. **Atmósfera base (impacto máximo, esfuerzo bajo)**: domo de cielo con gradiente + fog del mismo color + HemisphereLight + Directional cálida + paleta de atardecer (2.2). Convertir materiales a Lambert + vertex colors con cuantizado de 3 pasos. + vignette CSS.
2. **Sombras blob y viento**: discos de sombra bajo todo; shader de viento compartido en árboles/pasto; mover cualquier árbol feo a esfera-copa + tronco.
3. **Agua + costas con espuma** (2.9) y nubes de cielo agrupadas flotando.
4. **Camino vivo**: cafetales y palmas de cera instanciados, chivas, vacas, señales, polvo de ruedas; paletas de suelo por región; cámara suavizada.
5. **Niebla de entrada a región** (2.8) conectada al cambio musical de Lyria: el momento "wow" de cada transición.
6. **Un hito por región** (los más reconocibles: ballenas, hormiga culona, acordeón gigante, Cristo Rey, metrocable, llanero + chigüiros) con contorno inverted hull. Prioridad: Pacífico (ballenas) y Santander (hormiga) pedidos por el usuario.
7. **Rellenar mini-ciudades** restantes (sección 3) por región, de más a menos barato: casas instanciadas, fauna, comida, luego animaciones sincronizadas con la música (acordeón, marimba, bailarines, cuerdas).
8. **Pulido**: partículas (hojas, mariposas, aves, luciérnagas), ciclo de hora, tarjetas HUD (Fredoka/Nunito, estilo sticker), pase de color único opcional y ajuste de LOD/fps con `renderer.info` en una UHD 620 real.

---

### Notas y verificaciones pendientes
- Todos los hex son puntos de partida; ajustar a ojo en pantalla, el atardecer manda.
- Fuentes de Messenger solo cubren: contornos propios, atlas de color 16x16, LOD, cámara, agua y vegetación en general. No se publicó nada de nubes, niebla o postproceso: esas decisiones son propias [INF].
- Hechos culturales (tabaco en Santander, ubicación exacta de farolas en Cali) conviene confirmarlos si se van a nombrar en el HUD. Obras con derechos (Gato del Río de Hernando Tejada, esculturas de Botero) solo como guiño genérico.
