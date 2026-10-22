# Contexto del proyecto

> Este archivo lo lee Claude Code automaticamente al abrir la carpeta.
> Resume de donde viene el proyecto y que decisiones ya estan tomadas, para no
> volver a discutirlas. Si cambias una decision, actualiza este archivo.
>
> Origen: conversacion en la app de Claude, 8 de octubre de 2026.

## RETOMAR AQUI (sesion en la nube del 22 de octubre de 2026)

Se esta construyendo **Guerra de territorios 2.0.0** en la rama **`guerra-2.0.0`** (nunca en `main`; sin PR ni fusion hasta que el usuario lo ordene). Para seguir en la computadora:

1. `git fetch origin && git checkout guerra-2.0.0 && git pull`; `git -C privado pull` (el respaldo privado trae el plan y las specs); `npm test` (verde en cada commit de la rama).
2. Leer `privado/planes/plan-guerra-2.0.0-ledger.md` (ultima etapa terminada y siguiente tarea) y `privado/planes/plan-guerra-2.0.0.md` (etapas 0 a 12 con checklist). Reglas completas: `privado/spec/guerra-2.0.0-diseno.md`. Hallazgos y mediciones: `privado/spec/guerra-2.0.0-propuesta.md`. Juego nuevo de civilizaciones: `privado/spec/civilizaciones-propuesta.md`.
3. El usuario dejo trabajando a Claude mientras dormia y delego las decisiones: las que se tomaron estan en la seccion 10 del diseno (tope de entrada 6,000 tokens y costo $1.50/$2.00 por partida, capital cerrada a aliados, tierra ajena x0.85, suministro por regiones aisladas, paquete de equilibrio, mejoras en vez de armas). Son revisables: cada una vive en una constante o una regla.
4. Espera orden expresa del usuario: pruebas con modelos reales (AL FINAL, con tope), `cache_control` para Claude (medir `cached_tokens`), PR y fusion, grabar y publicar la serie 2.0.0.

## Donde vive que

- **Publico (este repo):** codigo, `CLAUDE.md`, `README.md`, `docs/` (metodologia, como agregar un juego), `marca/` y
  `herramientas/` (programas chicos que se corren a mano, p. ej. `node herramientas/medir-prompt.mjs`).
- **Privado (`privado/`, ignorado por git, nunca se sube):** spec y borrador de reglas (`privado/spec/`), planes de
  implementacion y plan de juegos (`privado/planes/`), plan de contenido (`privado/contenido/`), terminos de uso de los
  proveedores (`privado/terminos/`) y prototipos con sus herramientas de balance (`privado/prototipos/`). Su inventario esta en
  `privado/inventario-conocimiento.md`. `src/pruebas/privado.test.js` falla si git llegara a rastrear algo ahi.
- **Respaldo de `privado/` (hecho el 11 de octubre de 2026):** `privado/` tiene su propio repo git (anidado; el repo publico lo ignora) subido a un repo
  **PRIVADO** de GitHub, `GerryPetrucci/enfrentando-a-las-ias-privado`. Para refrescar la copia despues de cambiar specs o planes:
  `git -C privado add -A && git -C privado commit -m "respaldo" && git -C privado push`. Nunca publicar ese repo ni subir `.env`.
- **Memoria de Claude:** la de este proyecto vive junto al repo y solo guarda punteros y preferencias; las decisiones van aqui
  o en `privado/`.
- La llave de OpenRouter solo esta en `.env` (ignorado): nunca se lee ni se pega en el chat.

## Que es esto

**Enfrentando a las IAs**: un canal de videos cortos + un sitio donde modelos de
IA (Claude, GPT, Gemini, etc.) compiten en juegos distintos, con **marcador por
categoria** para ver en que se destaca cada uno.

La idea nacio de dos formatos que funcionan en redes: las carreras de canicas por
paises y un video donde alguien puso a varias IAs a elegir estrategias en un
juego tipo Age of Empires. La restriccion desde el dia uno: **nada de video o
foto "real"** — todo se genera con codigo propio.

### Los tres principios que hacen funcionar el formato

1. **Identidad prestada.** El publico no ve un algoritmo, ve "su" IA. Sin eso es
   solo una simulacion bonita.
2. **Azar con suspenso.** Tiene que haber remontadas y traiciones. Si el
   resultado se ve venir en los primeros 5 segundos, se pierde la audiencia.
3. **Generable en masa.** Una vez programado el motor, cada episodio es cambiar
   participantes y seed. Eso es lo que permite publicar seguido sin morir.

## Decisiones ya tomadas (no volver a abrirlas sin motivo)

### Nada de suscripciones. API, via OpenRouter.

Las suscripciones de ~$20 USD/mes son para que un humano chatee: no se automatizan.
Cuatro de ellas = $80/mes y cero automatizacion. La API cobra por uso y para este
formato son centavos.

**OpenRouter**: una sola llave para GPT, Claude, Gemini, Llama y 300+ modelos,
formato compatible con OpenAI, sin recargo por token (el cobro es ~5.5% al cargar
saldo). Cambiar de IA = cambiar un string, que es exactamente lo que necesita un
canal cuyo chiste es enfrentarlas. Presupuesto realista: **$10-20 USD/mes.**

### Tres modos de costo, y cuando usar cada uno

| Modo | Que es | Costo | Para que |
|---|---|---|---|
| **Bot escrito** | La IA programa su bot una vez, corres 1000 partidas | centavos | Episodios de volumen: "las enfrentamos 1,000 veces" |
| **Estrategia declarada** | La IA declara su plan una vez, tu simulas | centavos | Episodios normales |
| **Jugada por jugada** | La IA decide cada ronda en vivo | el mas caro y lento | Finales y episodios especiales |

Los tres los soporta `src/agentes.js` sin tocar el motor. Hoy esta implementado
el modo en vivo y las estrategias de control; el modo "bot escrito" esta disenado
pero falta escribir los bots (ver `docs/agregar-un-juego.md`).

### Gratis o pago: se elige en CADA ejecucion (decidido el 10 de octubre de 2026)

`node src/correr.js ... --modo=gratis|pago` es obligatorio cuando juega algun modelo; no hay valor por
defecto. `gratis` solo admite los contendientes con `gratis: true` en `src/modelos.js` (hoy
`nemotron-ultra`, `nemotron-super` y `laguna`, que se retira el 31 de octubre de 2026; `ling` dejó de ser gratis el 17: $0 por llamada, no tocan el saldo); `pago` admite
tambien Claude, GPT, Gemini, Llama y DeepSeek. El seguro de verdad esta en `llamarModelo`: sin modo
pago se niega a llamar a un modelo que gaste credito, aunque otro script lo intente. El resultado guarda
`modo` en `data/*.json`. Comprar 10 USD solo sube el tope de modelos gratis de 50 a 1,000 por dia
(20 por minuto siempre); el saldo se gasta unicamente en modo pago. Los resultados de modelos gratis son
de practica, no de torneo (se saturan, cambian y fallan por infraestructura).
Los resultados con modelos gratis van a data/pruebas/ (no se versionan ni entran al marcador).

### Razonamiento de los modelos: siempre medio, nunca el maximo (decidido el 9 de octubre de 2026)

Todos los modelos se llaman con razonamiento **medio** (`reasoning.effort = "medium"`) o, si no tiene niveles, con su valor por defecto; **nunca `high` ni `xhigh`** (cuesta mucho mas y no cambia lo que se mide). Igual para todas
las IAs y congelado junto con el prompt y los demas parametros (`src/parametros.js`; cada contendiente declara `razonamiento` en `src/modelos.js`). `max_tokens` 4000 (decidido el 10 de octubre de 2026: con 2000 GPT Luna
se cortaba); si aun asi se cortan, se mide y se decide con el usuario, sin subir el razonamiento. Correr `node herramientas/verificar-modelos.mjs` antes de cada corrida con modelos y antes de gastar. Detalle y mediciones: `docs/decisiones-detalle.md`.

### Juegos y escenas (resumen; el detalle esta en `docs/decisiones-detalle.md`: leerlo solo al tocar ese juego)

Cada juego es un objeto con seis funciones en `src/juegos/`; cada uno trae motor, bots de control, evaluacion al final de la serie (caracteristicas por IA, sin llamadas extra), pruebas y una escena en `web/escena.html`.
Todos respetan el presupuesto de llamadas (abajo). **Con modelos reales solo se han corrido Mayor o menor (Claude vs GPT, $0.45) y Guerra de territorios (Claude, GPT, Gemini y DeepSeek, $1.03), ambos el 18 de octubre de 2026 con orden expresa y 2 partidas; detalle en `docs/decisiones-detalle.md`**; los demas, AL FINAL.

| Juego | IAs | Idea | Categoria | Llamadas por partida |
|---|---|---|---|---|
| 1 Dilema del Prisionero Negociado | 2 | cooperar o traicionar con promesas publicas; juego de control | Traición y confianza | corto |
| 2 Guerra de territorios | 2-5 | mapa de regiones, alianzas, mensajes, comercio; motor, bots y escena listos, mapa con 4 biomas guardado en la partida (la humo con modelos gratis ya se corrió: no sirven) | — | ~100 |
| 3 La Fuga | 2 | 9 situaciones, postura hacia el companero + metodo, tentaciones; **regla oculta**: salir solo vale 7, quedarse atras y salir 9, juntos 10, capturado 0 | Lealtad bajo riesgo | 18 |
| 4 El numero solitario | 5 | 12 rondas, parejas de cartas y marca; gana el menor numero que nadie mas jugo; cortes en las rondas 3 y 6 | Estrategia de eliminación | 90 |
| 5 Subasta de tiempo | 5 | 19 subastas con banco de 600 s; todas las apuestas se pagan; empate en lo alto anula | Estrategia de eliminación | 95 |
| 6 Mayor o menor | 2 | 18 rondas, carta activa y apuesta del predictor a la vez; **reglas 2.0.0 (21 oct): apuesta de 1 a 6 fichas, carta igual cuenta como menor, mazo de 33 cartas con 11 secretas por jugador y 3 rondas dobles**; fichas de la banca | Estrategia de eliminación | 36 |
| 7 Triple dado | 4 | 4 rondas, prediccion con tarjetas ZERO/MIN/MORE/MAX (una vez cada una), dados con 2 ocultos | Estrategia de eliminación | 60 |
| 8 Duda y apuesta | 4 | unico por turnos; anunciar, aceptar o dudar, una sola eliminacion | Engaño y deducción | hasta 96 |

Reglas que valen para varios juegos:
- **Puntos del marcador** de los juegos de eliminacion: pieza 4, sobrevive 2 (a salvo 3 y en medio 2 en El numero solitario), eliminado 0. **Sin torneo general ni temporadas**: cada juego es independiente y se evalua por si mismo (al final de cada juego, caracteristicas de todos los modelos).
- **Solo en vivo:** los juegos 4 a 8 (por lote seria impractico; Duda y apuesta niega `--lote`). **La Fuga** admite lote (9 turnos).
- **La Fuga:** una partida suelta nunca se publica, siempre una **serie con asientos rotados** (mismas situaciones y dados). Vocabulario suave en el prompt, la vista y la narracion (nunca delatar, abandonar ni traicion; los identificadores internos no cambian).
- **Juegos dinamicos e inesperados (decidido el 21 de octubre de 2026):** si un juego sale con poco suspenso (gana casi siempre la misma IA, sin remontadas), se cambian o modifican sus reglas para hacerlo mas dinamico, imprevisible y parejo: **que cualquiera pueda ganar**. Vale para los juegos futuros y para los actuales mientras no se hayan publicado; cambiar el prompt sube la version de reglas (las partidas anteriores no se comparan). Primer caso: Mayor o menor (GPT gano 161-70 y 226-56; 88 % de las fichas salen de apostar, ninguna apuesta de todas las fichas perdio): **reglas 2.0.0 decididas el 21 de octubre de 2026 con medicion con bots** (`node herramientas/medir-mayormenor.mjs`; analisis en `privado/spec/mayor-o-menor-balance.md` y `-medicion.md`): tope fijo de 6 fichas por apuesta (el tope por el rival casi no ayudaba), carta igual cuenta como menor, mano oculta (mazo de 33, 11 por jugador) y 3 rondas dobles; con 10 fichas y 18 rondas. Resultado con bots: margen final 54 % -> 25 %, partidas que terminan antes 30 % -> 5 %, remontadas 1.3 -> 1.8, el peor bot gana 31 % en vez de 9 %. Las dos partidas reales del 18 de octubre (reglas 1.0.0) quedan como ensayo y no se publican. **Serie con las 2.0.0 corrida el 21 de octubre de 2026 (orden expresa, Claude vs GPT, $0.46, `data/2026-10-21-mayormenor-claude-vs-gpt.json`, respaldo en `privado/datos-oficiales/`): GPT gano las dos, pero parejo (fichas 62-85 y 60-48 contra 70-161 y 56-226; en la partida 2 el que iba arriba cambio 5 veces; en la 1, GPT fue arriba toda la partida); voz y paquetes `paquete-j1` y `paquete-j2` hechos en `grabaciones/listos/mayor-o-menor/2026-10-21_seed-596137124/`; partes de ~4:10 (no caben como Short ni Reel).** La descripcion inicial del video (`textos-juego.js`) ya cuenta las reglas nuevas. Al disenar un juego nuevo, medir con bots que el que va arriba a mitad de partida no gane casi siempre.
- **Prioridad de desarrollo:** juegos de concurso de eliminacion con nombres y personajes propios y las mismas reglas, nunca el nombre, el arte ni la estetica de ningun programa (catalogo en `privado/planes/plan-juegos-de-concurso.md`). La oleada 1 esta completa; la oleada 2 se elige de ese catalogo.
- **Escenas (todas fusionadas en `main`):** una sola pagina `web/escena.html` + `web/casino/escena.js`; registro por juego en `web/casino/lineas.js`; `mesa-base.js` y una mesa por juego con `static METODOS`; linea de tiempo, diseno y reloj puros (se prueban en Node), el DOM se verifica con `node herramientas/capturar-escena.mjs` (`--completa`, `--estado`, `--voz`). **Lo que una jugada deja a la vista (caja de apuesta, sello, flecha, etiquetas) se apaga cuando la jugada se resuelve y la ronda nueva cambia todo a la vez (cabecera, papeles, fichas); `--estado` tambien exige que el titulo de la cabecera no quede cortado, y lo que dura en pantalla se verifica con capturas en tiempo real (las de tiempo virtual engañan con las animaciones); cambiar el texto de un beat obliga a regenerar la voz** (decidido el 21 de octubre de 2026 tras grabar Mayor o menor; detalle en `docs/decisiones-detalle.md`). La web no puede importar de `src/` ni de `herramientas/` (el sitio publica solo `web/` y `data/`). Formatos 9:16, 16:9 y `hoja` 4K. **En 9:16 NADA se dibuja fuera de la zona segura** (arriba 285 y abajo 420 libres para la interfaz de las redes; `layoutzona.test.js` lo exige a los 7 juegos; **todo juego nuevo se agrega a su lista `JUEGOS` con todos los tamanos de su mesa, y otra prueba falla si falta, ademas de revisarlo en una captura 9:16 del caso mas grande**) **y el cuadro de subtitulos aparece con cada beat que dice algo y se apaga solo, como el feed** (`subtitulos-vertical.js`; en 16:9 sigue fijo) (decidido el 20 de octubre de 2026; Guerra se redibujo: mapa mas chico, cabecera y marcador dentro de la zona). La Fuga no es de casino (sala de control con 24 mini escenas); Guerra de territorios tampoco: dibuja su propio mapa en canvas (`mapa-dibujo.js`, `mesa-conquista.js`), con batallas A/VS, traicion con flashback del privado y unidad `turno` (`turno=` es sinonimo de `mano=`).
- **Camara oculta y secretos:** la escena solo LEE partidas guardadas y nunca cambia ni oculta una jugada; las jugadas que puso el juego se dicen como del juego, nunca atribuidas a la IA; lo secreto se revela en su momento (La Fuga: la tentacion y sus avisos solo en la consecuencia).
- **Cada juego se publica en DOS partes** (decidido el 17 de octubre de 2026): `node herramientas/partes.mjs --archivo=... [--voz=...]` las calcula (`dividirEnDos`); no se recorta la narracion del motor. Con `razon=1` las razones de las IAs salen con la consecuencia (decidido el 17 de octubre de 2026).
- **Tarjeta de arranque y paquete de publicacion (17 de octubre de 2026):** la parte 1 de cada juego abre con una tarjeta de 5 a 8 s (beat `intro`, antepuesto en un solo lugar: `armarLinea` en `lineas.js`; textos publicos en `web/casino/textos-juego.js`); `node herramientas/paquete.mjs --archivo=... [--voz=...]` deja en `grabaciones/paquetes/` el LEEME y los textos por pieza y red (2 partes + hasta 3 clips; solo hechos, la linea `[GANCHO: ...]` la confirma una persona; nunca privados ni razones). **La subida es manual** (decidido: sin APIs ni aprobaciones). **Gancho «Próximamente» (20 de octubre de 2026):** el paquete arma uno por parte (pieza `gancho-N`, `hkN` en el nombre; `web/casino/gancho.js`): tarjeta de apertura, 2 a 5 cortes rapidos de momentos de ESA parte con su etiqueta y tarjeta de cierre, de 12 a 26 s (mas el cierre), sin voz en los cortes ni musica (la pone quien lo sube), sin el primer ni el ultimo turno (sin spoilers). **Cierre de TODA pieza (parte, clip y gancho; 21 de octubre de 2026):** al final, la voz dice una frase que pide seguirnos y reaccionar (`No olvides seguirnos y reaccionar.` y 11 parecidas en `FRASES_CIERRE`; se elige con el seed de la pieza, asi cada video dice una distinta y el mismo video es siempre igual) y la pantalla muestra el logo, el @ de cada red (con Facebook) y la pagina de resultados, todo de `web/redes.js`; es un beat `cierre` que agrega la pagina con `cierre=1` (`web/casino/cierre.js`; las direcciones del paquete y de `partes.mjs` ya lo llevan). La voz del cierre se genera para TODAS las frases con `narrar.mjs`; una partida narrada antes del cierre usa `node herramientas/narrar.mjs --archivo=... --solo-cierres` (suma las frases sin volver a narrarla). En el gancho solo suena el cierre. El paquete suma lo que dura el cierre (unos 6.5 s) a cada pieza. Orden de subida: gancho, parte, clips. Estrategia y guia paso a paso en `privado/contenido/` (`estrategia-de-publicacion.md`, `guia-paso-a-paso.md`). **Grabacion con OBS (18 de octubre de 2026):** el paquete arma las direcciones para la hoja 4K (`--formato=hoja` por omision) con `grabar=1`: la pagina nace en negro, espera 2 s, se aclara (0.5 s), cuenta la pieza, se funde a negro y se queda en negro hasta cerrar (`FUNDIDOS` en `escena-config.js`); `herramientas/recortar-formatos.mjs` detecta ese negro y recorta dejando los fundidos (`--manual` lo apaga).
- **Carpetas y nombres de los videos (20 de octubre de 2026):** cada serie vive en `grabaciones/listos/<juego>/<AAAA-MM-DD>_seed-<seed>/` con `originales/` (los `.mkv` de OBS), `por-subir/` (recortes listos), `subidos/`, `revision/` y `paquete-j<N>/` (LEEME y textos); `paquete.mjs` crea todo (`--salida` = la carpeta de la serie). Los videos se llaman `j1_pt1_9x16_fb-ig-tk-yt.mp4`: numero de juego (`jN`, sin fecha: sube de uno en uno en cada partida que se empaqueta en la carpeta del juego, aunque sea de otra serie; regenerar un paquete conserva el suyo y `--juego=N` lo fija), pieza (`hkN` gancho, `ptN` parte, `clpN` clip), formato y redes a las que sirve (`fb` Facebook, `ig` Instagram, `tk` TikTok, `x`, `yt` YouTube; salen de `FORMATOS` en `herramientas/formatos.mjs`, nombres en `herramientas/nombres.mjs`); la grabacion original lleva el mismo nombre sin formato ni redes. Solo hay dos formatos, `9x16` y `16x9`: el `4x5` se quito el 20 de octubre de 2026 porque ninguna red lo necesita. Capturas de prueba: `grabaciones/capturas/`, se borran cuando ya no sirven. **Limpieza al terminar de subir un juego (jN, una partida) (decidido el 20 de octubre de 2026, para tener menos archivos):** cuando TODAS las piezas del juego jN (gancho `hk`, partes `pt` y clips `clp`, en todos sus formatos) ya estan en `subidos/` y no queda ningun archivo `jN_` en `por-subir/`, y el usuario avisa que termino de subir, borrar `paquete-jN/textos/` y los recortes `.mp4` `jN_*` en `subidos/`; de `originales/` queda solo la grabacion (`.mkv`), que permite volver a recortar. El LEEME y `revision/` se quedan. Decir al usuario que se borro. Si algo del juego sigue en `por-subir/`, no borrar nada. **Principio (21 de octubre de 2026): de video, en `grabaciones/` solo debe quedar el original sin recortar que sale directo de OBS (el `.mkv`); los recortes `.mp4` son desechables (se regeneran de ese original con `recortar-formatos.mjs`), asi que no se guardan de mas ni se generan por adelantado.**
- **Voz narradora:** sintetizada por IA, gratuita y local (Piper, voz elegida el 16 de octubre de 2026; su nombre tecnico no se muestra en publico: `privado/terminos/voz-narradora.md`); se genera ANTES de grabar con `herramientas/narrar.mjs` (`data/voz/`, ignorado) y la escena la usa con `?voz=`. Dos capas de texto: los hechos (los escribe el codigo, siempre verdaderos) y el comentario (editorial; nunca cambia ni oculta una jugada). **Guerra de territorios (18 de octubre de 2026):** la voz interpreta lo rutinario (expansion, tomas por reino, hambre, panorama cada 5 turnos, un mensaje publico citado por turno) y deja literal lo que es historia; `lineas` sigue con los hechos completos (y en pantalla) y `dicho` es lo que se oye y se subtitula (`web/casino/narracion-conquista.js`, ajustes arriba; solo reglas en codigo, sin modelos). Los videos se graban siempre desde el equipo de desarrollo.
- **Lote (Batch API de OpenRouter):** `--modo=pago --lote --tope=DOLARES` (las tres banderas juntas), 50 % de descuento a cambio de esperar; se detiene (fail-closed) si algo falla y un lote enviado no se reintenta. Los modelos de practica (`haiku`, `luna`, `flash-lite`) van a `data/pruebas/`, nunca a torneo. El costo de una partida entera por lote NO esta confirmado (se salto el paso 6 por decision del usuario).

### No desarrollar juegos: desarrollar una arena

La preocupacion original era que el formato exige desarrollo constante. La
respuesta es la arquitectura: `src/arena.js` no sabe de que juego se trata. Un
juego es un objeto con seis funciones en `src/juegos/`. El primer juego costo una
tarde; el decimo cuesta un rato.

Los juegos de teoria de juegos son el atajo: baratisimos de programar (menos de
150 lineas) y brutales de ver. Si ademas los modelos se mandan mensajes entre si,
aparece la traicion — que es el mejor contenido disponible por linea de codigo.

### Un solo codigo, dos productos

El mismo motor alimenta el sitio (marcador historico) y los videos (reproductor
vertical 1080x1920 que se captura con OBS). No se escribe codigo aparte para
video.

### Presupuesto de llamadas (limite duro al disenar un juego)

Los modelos gratis de OpenRouter permiten 20 llamadas por minuto y 50 por dia (1,000 por dia
si se compraron al menos $10 de creditos, que esos modelos no gastan). Para no perder la "liga
gratuita", todo juego nuevo cumple: **una llamada por jugador por turno** (ordenes en lote),
**maximo 30 turnos**, **<= ~100 llamadas por partida de 4 jugadores**, **entrada <= 3,500 y
salida <= 500 tokens** (medidos con Claude, que cuenta ~1.5 veces mas tokens que los demas modelos
en espanol; ~7,000 caracteres de entrada), y costo con modelos de pago **<= $0.40 por partida**
(tope $0.90).
Mas complejidad cuesta tokens, no llamadas, y esta permitida dentro de esos limites; subir turnos,
llamadas por turno o jugadores requiere aprobacion expresa. Detalle en `docs/agregar-un-juego.md`.
**Excepcion aprobada el 9 de octubre de 2026 (solo Guerra de territorios):** entrada <= 4,450 (era 4,200;
ampliada con aprobacion expresa al medir con las pruebas del plan 1 el peor caso de 5 reinos, con los 4
rivales mandando mensaje, privado y nota al largo maximo: 4,406) y salida <= 650 tokens, porque con sus 6
reglas extra (mensajes privados, comercio, edificios, maravilla, honor y nota de plan) el prompt mide 3,681
tokens en el caso tipico de 5 reinos. Sigue siendo **una llamada por
jugador por turno**, 30 turnos y <= ~100 llamadas por partida de 4 jugadores; el costo con modelos de
pago sube a ~$0.44 por partida con la mezcla media (dentro del tope mensual de ~$20).

## Invariantes de diseno (romper esto rompe el proyecto)

1. **`src/prompt.js` es EL CONTRATO.** Todas las IAs reciben texto identico. Lo
   unico que cambia es el ID del modelo (y el nombre de reino de cada asiento en Guerra de territorios, que sale del modelo: `nombres.js`). Esta versionado:
   **si cambia el prompt de un juego, sube la version de sus reglas y las partidas anteriores no se comparan con las nuevas.**
   Cada juego es independiente: no hay temporadas ni torneo general.
2. **`vista(estado, i)` nunca filtra informacion secreta del rival.** Es el unico
   lugar donde se decide que sabe cada jugador. Un bug ahi invalida todas las
   partidas jugadas con ese juego.
3. **`normalizar()` nunca lanza error.** Recibe `null` o basura y siempre
   devuelve una jugada legal marcada `invalida: true`. Un modelo caido no tumba
   una grabacion.
4. **Todo lo aleatorio pasa por el `rng` con seed**, nunca `Math.random()`.
5. **Los fallos de API se registran, no se esconden.** Seguir el formato pedido
   es parte de lo que se mide.

## Dos trampas estadisticas que no hay que olvidar

- **Los modelos no son deterministas aunque el seed si lo sea.** Nunca publicar
  el resultado de un duelo suelto: correr varias partidas y reportar puntos por
  partida.
- **Puntos por partida no es ranking hasta cerrar el round-robin.** Una IA puede
  verse arriba solo porque le tocaron rivales suaves. (En la demo de arranque,
  "Siempre Coopera" sale primero por exactamente eso.)

Las estrategias clasicas (`tomaydaca`, `siempre-c`, `siempre-t`, `azar`) estan en
la tabla como **control**. Si una IA no le gana a `tomaydaca`, eso dice mas que
cualquier duelo entre modelos.

## Marca y alcance de lo que se afirma

Se dice: *"en este juego, con estas reglas, en estas 8 partidas, gano X"*.
No se dice: *"X es la mejor IA"*.

Se usan nombres de modelos de forma descriptiva; **no se usan logos oficiales** ni
nada que sugiera patrocinio. Terminos de uso de los proveedores revisados el 9 de
octubre de 2026; de ahi salen tres reglas: lo que producen las IAs se presenta como
**generado por IA** con aviso visible, **cada partida se revisa a mano** antes de
publicarse, y las salidas **no se usan para entrenar** otros modelos. Repetir la
revision antes de monetizar y cada 3 meses.

## Marca y presencia (decidido el 8 de octubre de 2026)

Todo el detalle vive en [`marca/`](marca/README.md); aqui solo lo que no se debe reabrir.

- **Logo:** concepto A, "Duelo" (disco verde = cooperar, disco rojo = traicionar,
  interseccion dorada = tension). Paleta = la del reproductor. Tipografia: Barlow
  Condensed (titulos) + Inter (texto). Los colores significan **jugadas**, no modelos.
- **Color de cada IA (decidido el 10 de octubre de 2026): uno solo, global, para todos los
  juegos.** Vive en [`web/paleta.js`](web/paleta.js) y se pide por id (`colorDe`, `textoDe`,
  `franjasDe`, `fondoCSS`); ningun juego ni escena define el color de una IA. Claude naranja
  `#D97757`, GPT blanco con negro, Gemini multicolor de Google (franjas), DeepSeek azul
  `#4D6BFE`, Llama magenta `#D946EF` (sin color propio; el azul de Meta se confundia con
  DeepSeek y con el azul de Gemini). Solo colores, nunca logos. Una IA nueva se agrega
  en `paleta.js`; `npm test` falla si dos IAs se pueden confundir sobre el mapa.
- **Nunca** logos de proveedores, ni nombres de modelos en el nombre del canal,
  usuarios o dominio. Aviso estandar: "Proyecto independiente, sin afiliacion con los
  proveedores de los modelos".
- **Regla editorial publica:** las jugadas no se retocan; lo que se ve es lo que
  registro el motor (esta prometido en la descripcion del canal de YouTube).
- **Idioma:** espanol primero (el prompt, el nombre y los mensajes de las IAs ya lo
  estan; cambiar el prompt sube la version de reglas del juego). El sitio sera multilenguaje despues;
  los datos de las partidas ya son neutros (C/T).
- **Redes:** TikTok + YouTube Shorts + Instagram Reels desde el dia 1 (mismo video
  1080x1920), el sitio como base. Pagina de Facebook «Enfrentando a las IAs» creada el 20 de octubre de 2026 (el paquete ya genera su texto); X ya tiene cuenta.
- **Riesgo de monetizacion:** YouTube no paga contenido "mass-produced or repetitive"
  (plantillas sin variacion). Cada episodio necesita una capa editorial propia
  (gancho, historia, comentario) y variedad de juegos; no contar con monetizacion al
  inicio.
- **Hashtags:** Instagram permite 5 por publicacion desde dic 2025 y sirven para
  clasificar, no para ganar alcance. Usar 3 a 5 especificos.

## Publicacion de resultados (decidido el 18 de octubre de 2026)

El sitio (decidido el 21 de octubre de 2026: **no hay series, solo juegos y partidas**) tiene una barra fija con menu (`web/menu.js`), una landing con buscador libre y un cuadro por juego (`web/index.html`), una pagina por juego con su tabla (partidas, V-E-D y puntos) y sus partidas (`web/juego.html`), una pagina por partida (`web/partida.html`; `serie.html` solo redirige), las redes del proyecto en un solo lugar (`web/redes.js`: enlaces e iconos de TikTok, Instagram, YouTube, Facebook y X para la landing y el pie; **una red nueva se agrega ahi, en `marca/perfiles.md` y en `REDES` de `herramientas/nombres.mjs`; `sitio-redes.test.js` falla si falta en alguno**), los modulos y el CSS se piden con `?v=__V__` que el despliegue cambia por el commit (si no, el navegador mezcla una pagina nueva con un modulo viejo de su cache de 10 min: un `import` nuevo en una pagina siempre lleva `?v=__V__`; una prueba lo exige), `web/metodo.html` y `web/proponer.html` (propuestas de juegos y enfrentamientos: abre un Issue de GitHub prellenado y lista los Issues abiertos con titulo `[Juego]` o `[Enfrentamiento]` por apoyos 👍; sin servidor). Solo muestra lo que ya salio en video. **Cada partida tiene un estado:**

- **Por publicarse:** se sube el video de su parte 1 o de una parte intermedia que NO llega al ultimo turno. El sitio muestra el seed, la conversacion (mensajes, jugadas y razones) y los prompts que recibio cada IA **solo hasta el ultimo turno subido**; nada de resultado, ganador, puntos, fichas ni turnos posteriores. Una partida sin ninguna parte subida muestra solo su seed.
- **Publicada:** se sube la parte que llega al ultimo turno de la partida (la parte final). Se publica la partida completa con su resultado y su evaluacion. Cada partida se publica por si sola (el archivo de datos agrupa las partidas de una tanda, pero el sitio no lo muestra). El marcador de cada juego cuenta unicamente partidas publicadas.

**Aviso de subida = orden de hacer TODO esto, sin preguntar ni esperar otra orden** (decidido el 21 de octubre de 2026, tras olvidar publicar la parte 2 del j1 porque el usuario solo pidio mover archivos). Se activa con cualquier mensaje que diga que se subio una pieza (`ptN`, `clpN`, `hkN` de un juego `jN`), aunque la frase hable solo de mover archivos o de limpiar: 1) mover sus archivos de `por-subir/` a `subidos/` en `grabaciones/listos/` (los que ya estan en todas las redes de su nombre; si subio solo a algunas, preguntar); 2) **si la pieza es una PARTE (`pt`; clips y ganchos no se publican)**: el `jN` da la partida y el archivo (`paquete-jN/paquete.json`); averiguar hasta que turno llega esa parte (`node herramientas/partes.mjs --archivo=... --partida=N`) y si es la parte final (`hasta` = ultimo turno de la partida; si hay duda, **preguntar**) y correr `node herramientas/publicar.mjs --archivo=SERIE.json --partida=N --parte=P --hasta=TURNO [--final=si] --fecha=AAAA-MM-DD` (fecha = la de hoy; se niega si lo declarado no cuadra con la partida); 3) revisar el resumen que imprime (estado de la partida y de la serie, avisos); 4) `npm test`, y **hacer commit y push SOLO de `data/publicas/` y `web/marcador.json`** (el sitio se despliega solo): para esto el aviso de subida vale como autorizacion; cualquier otro cambio sigue necesitando orden expresa; 5) si con esto ya esta TODO el juego jN subido (sin nada suyo en `por-subir/`), aplicar la limpieza de arriba. Contar al usuario que se movio, que se publico y que se borro. El primer despliegue de esta politica, si aun no esta en `main`, requiere antes la orden expresa de fusionar la rama.

**Reglas fijas:** el JSON COMPLETO de cada serie (con resultado y todas las partidas) **nunca va al repo publico**: `/data/*.json` esta ignorado y el respaldo vive en `privado/datos-oficiales/` (lo copia `publicar.mjs`); al sitio solo sale `data/publicas/`. Los prompts por turno se reconstruyen repitiendo la partida con su seed (`reconstruirPrompts`, solo Guerra de territorios por ahora; si el repaso no coincide con lo guardado, se omiten con un aviso) y el prompt de sistema debe coincidir con el hash guardado (si las reglas cambiaron, `publicar.mjs` se niega salvo `--forzar`). Nunca hay un ranking general: una tabla por juego. Los textos de comentario/descripcion de cada video llevan el enlace `?seed=` del sitio para que se pueda buscar.

## Flujo de trabajo y revisiones

- **Aprobacion por etapas:** spec y plan se aprueban antes de construir; no se cambia lo aprobado sin preguntar. **No hacer push, PR ni fusion sin orden explicita** (una orden vale solo para lo que nombra; unica excepcion fija: el commit y push de `data/publicas/` y `web/marcador.json` tras avisar el usuario que subio un video, ver «Publicacion de resultados»). No gastar saldo de API sin orden; `privado/` y `.env` nunca se publican.
- **Pruebas con modelos reales: AL FINAL.** Primero todo lo demas al 100 %; las partidas de esa prueba seran las primeras oficiales y se graban.
- **Cada cambio con prueba que falla antes** (rojo, verde), y una mutacion para comprobar que la prueba detecta el error. Un ledger por plan en `.superpowers/sdd/`, archivado en `privado/planes/` al terminar.
- **Antes del agente de revision independiente, una pasada rapida con `/code-review` y/o `/simplify`** sobre el diff de la rama: se corrige lo que encuentren (con prueba que falle antes) y solo despues se lanza el agente (opus, solo lectura), que es mas caro. Asi el agente gasta su revision en lo que de verdad hace falta.
- **Tokens:** CLAUDE.md se mantiene corto; el detalle de cada juego vive en `docs/decisiones-detalle.md` y se lee solo al tocar ese juego. Las revisiones de muchas imagenes se hacen con una hoja de contacto, no con capturas sueltas.

## Estado actual

**Hecho:** motor generico (`arena.js`), prompt unico versionado, RNG con seed, cliente de OpenRouter y registro de contendientes; los 8 juegos con motor, bots, evaluacion, pruebas y escena (la del juego 2, Guerra de territorios, terminada el 17 de octubre de 2026; 1326 pruebas con la narracion interpretada y los fundidos de grabacion del 18 de octubre, rama `narracion-y-fundidos` aun sin fusionar);
CLI de duelos, series de rotacion, agregador de marcador, sitio publicado (landing con menu y buscador, pagina por juego con su tabla, pagina por partida, propuestas; sin series) (<https://gerrypetrucci.github.io/enfrentando-a-las-ias/>, politica «Publicacion de resultados»; se despliega solo en cada push a `main` que toque `web/` o `data/`), reproductor vertical, voz local y
herramienta de partes. Repo publico: <https://github.com/GerryPetrucci/enfrentando-a-las-ias>.

**Pendiente:**
- [ ] Piloto con modelos reales (en curso desde el 18 de octubre de 2026, con orden expresa y tope): grabar el episodio 1 y, si queda bien, subirlo; los IDs de modelo se verifican con `node herramientas/verificar-modelos.mjs` antes de cada corrida (cambian cada pocos meses; ultima vez 18 de octubre, todo cuadra).
- [ ] Kit de marca hecho (`marca/`), cuentas de las 5 redes creadas (usuarios en `marca/perfiles.md`) y estrategia de publicacion escrita (`privado/contenido/`); falta dominio propio, sitio multilenguaje, imagen para links (`marca/exportados/og-1200x630.png`) y la tarjeta de marcador (resumen de una serie). Antes de la semana 1: correr series reales (AL FINAL, con orden expresa) y verificar una vez las pantallas de cada red (lista en la guia).
- [ ] Juego 2 Guerra de territorios: mapa en la partida con 4 biomas y escena **hechos el 17 de octubre de 2026** (detalle en `docs/decisiones-detalle.md`); la humo con modelos gratis ya se corrió (15-40 % de respuestas con JSON: no sirven); falta solo la prueba con modelos reales (AL FINAL).
- [ ] Guerra de territorios, serie nueva con las reglas 1.1.0 (hechas el 18 de octubre de 2026: Maravilla con costo x1.5 y cuenta de 8 turnos, porque con modelos reales decidio 2 de 2 partidas; y el nombre de reino de cada modelo del color de su IA): correr 2 partidas con modelos reales (con orden expresa y tope), medir si la Maravilla decide como maximo 1 de cada 4 y ajustar, grabar y publicar esa. Las dos partidas anteriores (reglas 1.0.0, `data/2026-10-18-conquista-claude-vs-gpt-vs-gemini-vs-deepseek.json`) quedan como ensayo y no se publican.
- [ ] Las escenas de los otros 5 juegos con evaluacion (Mayor o menor, El numero solitario, Subasta de tiempo, Triple dado, Duda y apuesta) tampoco muestran hoy sus caracteristicas al final del video, y La Fuga y el Dilema no tienen evaluacion; Guerra de territorios la tiene desde el 19 de octubre de 2026 (cinco caracteristicas, una ficha por IA antes del ranking; `docs/decisiones-detalle.md`).
- [ ] Quinto bioma «cordillera» (apuntado el 17 de octubre de 2026): quedó fuera porque con el tinte de los reinos no se distingue del continente; rediseñar con montañas más anchas o un tinte más ligero.
- [ ] Modo "bot escrito" para correr miles de partidas.
- El detalle del estado de cada juego y las ideas de formato en la banca estan en `docs/decisiones-detalle.md`.

## Convenciones del codigo

- Espanol en nombres, comentarios y textos. Sin acentos en identificadores,
  comentarios ni documentacion interna. **Los textos que ve el publico** (video,
  sitio, nombres de categoria, marca/) **llevan acentos**, tambien en mayusculas
  (NEGOCIACIÓN, ROMPIÓ): lo exige la ortografia y se ve bien en pantalla.
- **No acentuar el prompt** (`reglas` y `formatoRespuesta` de cada juego, `src/prompt.js`):
  es EL CONTRATO. Tocarlo sube la version de reglas del juego.
- El nombre de la categoria se guarda dentro de cada partida y el marcador agrupa por
  el: cambiarlo despues de tener episodios reales parte el historial en dos.
- ES modules, Node 20+, **cero dependencias**. Si algo necesita un paquete,
  pensarlo dos veces antes de agregarlo.
- Sin paso de build: el sitio es HTML estatico que se abre y ya.
- Pruebas con `npm test` (`node --test`, archivos `src/pruebas/*.test.js`).
