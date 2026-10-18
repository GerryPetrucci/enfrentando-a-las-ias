# Contexto del proyecto

> Este archivo lo lee Claude Code automaticamente al abrir la carpeta.
> Resume de donde viene el proyecto y que decisiones ya estan tomadas, para no
> volver a discutirlas. Si cambias una decision, actualiza este archivo.
>
> Origen: conversacion en la app de Claude, 8 de octubre de 2026.

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
se cortaba); si aun asi se cortan, se mide y se decide con el usuario, sin subir el razonamiento. Correr `node herramientas/verificar-modelos.mjs` antes de cada temporada y antes de gastar. Detalle y mediciones: `docs/decisiones-detalle.md`.

### Juegos y escenas (resumen; el detalle esta en `docs/decisiones-detalle.md`: leerlo solo al tocar ese juego)

Cada juego es un objeto con seis funciones en `src/juegos/`; cada uno trae motor, bots de control, evaluacion al final de la serie (caracteristicas por IA, sin llamadas extra), pruebas y una escena en `web/escena.html`.
Todos respetan el presupuesto de llamadas (abajo). **Con modelos reales solo se ha corrido Mayor o menor** (Claude vs GPT, 2 partidas, 18 de octubre de 2026, $0.38 en total; detalle en `docs/decisiones-detalle.md`); los demas, AL FINAL.

| Juego | IAs | Idea | Categoria | Llamadas por partida |
|---|---|---|---|---|
| 1 Dilema del Prisionero Negociado | 2 | cooperar o traicionar con promesas publicas; juego de control | Traición y confianza | corto |
| 2 Guerra de territorios | 2-5 | mapa de regiones, alianzas, mensajes, comercio; motor, bots y escena listos, mapa con 4 biomas guardado en la partida (la humo con modelos gratis ya se corrió: no sirven) | — | ~100 |
| 3 La Fuga | 2 | 9 situaciones, postura hacia el companero + metodo, tentaciones; **regla oculta**: salir solo vale 7, quedarse atras y salir 9, juntos 10, capturado 0 | Lealtad bajo riesgo | 18 |
| 4 El numero solitario | 5 | 12 rondas, parejas de cartas y marca; gana el menor numero que nadie mas jugo; cortes en las rondas 3 y 6 | Estrategia de eliminación | 90 |
| 5 Subasta de tiempo | 5 | 19 subastas con banco de 600 s; todas las apuestas se pagan; empate en lo alto anula | Estrategia de eliminación | 95 |
| 6 Mayor o menor | 2 | 18 rondas, carta activa y apuesta del predictor a la vez; fichas de la banca | Estrategia de eliminación | 36 |
| 7 Triple dado | 4 | 4 rondas, prediccion con tarjetas ZERO/MIN/MORE/MAX (una vez cada una), dados con 2 ocultos | Estrategia de eliminación | 60 |
| 8 Duda y apuesta | 4 | unico por turnos; anunciar, aceptar o dudar, una sola eliminacion | Engaño y deducción | hasta 96 |

Reglas que valen para varios juegos:
- **Puntos del marcador** de los juegos de eliminacion: pieza 4, sobrevive 2 (a salvo 3 y en medio 2 en El numero solitario), eliminado 0. **Sin torneo general**: cada juego se evalua por si mismo.
- **Solo en vivo:** los juegos 4 a 8 (por lote seria impractico; Duda y apuesta niega `--lote`). **La Fuga** admite lote (9 turnos).
- **La Fuga:** una partida suelta nunca se publica, siempre una **serie con asientos rotados** (mismas situaciones y dados). Vocabulario suave en el prompt, la vista y la narracion (nunca delatar, abandonar ni traicion; los identificadores internos no cambian).
- **Prioridad de desarrollo:** juegos de concurso de eliminacion con nombres y personajes propios y las mismas reglas, nunca el nombre, el arte ni la estetica de ningun programa (catalogo en `privado/planes/plan-juegos-de-concurso.md`). La oleada 1 esta completa; la oleada 2 se elige de ese catalogo.
- **Escenas (todas fusionadas en `main`):** una sola pagina `web/escena.html` + `web/casino/escena.js`; registro por juego en `web/casino/lineas.js`; `mesa-base.js` y una mesa por juego con `static METODOS`; linea de tiempo, diseno y reloj puros (se prueban en Node), el DOM se verifica con `node herramientas/capturar-escena.mjs` (`--completa`, `--estado`, `--voz`). La web no puede importar de `src/` ni de `herramientas/` (el sitio publica solo `web/` y `data/`). Formatos 9:16, 16:9 y `hoja` 4K. La Fuga no es de casino (sala de control con 24 mini escenas); Guerra de territorios tampoco: dibuja su propio mapa en canvas (`mapa-dibujo.js`, `mesa-conquista.js`), con batallas A/VS, traicion con flashback del privado y unidad `turno` (`turno=` es sinonimo de `mano=`).
- **Camara oculta y secretos:** la escena solo LEE partidas guardadas y nunca cambia ni oculta una jugada; las jugadas que puso el juego se dicen como del juego, nunca atribuidas a la IA; lo secreto se revela en su momento (La Fuga: la tentacion y sus avisos solo en la consecuencia).
- **Cada juego se publica en DOS partes** (decidido el 17 de octubre de 2026): `node herramientas/partes.mjs --archivo=... [--voz=...]` las calcula (`dividirEnDos`); no se recorta la narracion del motor. Con `razon=1` las razones de las IAs salen con la consecuencia (decidido el 17 de octubre de 2026).
- **Tarjeta de arranque y paquete de publicacion (17 de octubre de 2026):** la parte 1 de cada juego abre con una tarjeta de 5 a 8 s (beat `intro`, antepuesto en un solo lugar: `armarLinea` en `lineas.js`; textos publicos en `web/casino/textos-juego.js`); `node herramientas/paquete.mjs --archivo=... [--voz=...]` deja en `grabaciones/paquetes/` el LEEME y los textos por pieza y red (2 partes + hasta 3 clips; solo hechos, la linea `[GANCHO: ...]` la confirma una persona; nunca privados ni razones). **La subida es manual** (decidido: sin APIs ni aprobaciones). Estrategia y guia paso a paso en `privado/contenido/` (`estrategia-de-publicacion.md`, `guia-paso-a-paso.md`). **Grabacion con OBS (18 de octubre de 2026):** el paquete arma las direcciones para la hoja 4K (`--formato=hoja` por omision) con `grabar=1`: la pagina nace en negro, espera 2 s, se aclara (0.5 s), cuenta la pieza, se funde a negro y se queda en negro hasta cerrar (`FUNDIDOS` en `escena-config.js`); `herramientas/recortar-formatos.mjs` detecta ese negro y recorta dejando los fundidos (`--manual` lo apaga).
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
   unico que cambia es el ID del modelo. Esta versionado: **si cambia el prompt,
   se cierra la temporada y empieza una nueva.** No se comparan resultados de
   prompts distintos.
2. **`vista(estado, i)` nunca filtra informacion secreta del rival.** Es el unico
   lugar donde se decide que sabe cada jugador. Un bug ahi invalida la temporada
   entera.
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
  estan; cambiar el prompt cierra la temporada). El sitio sera multilenguaje despues;
  los datos de las partidas ya son neutros (C/T).
- **Redes:** TikTok + YouTube Shorts + Instagram Reels desde el dia 1 (mismo video
  1080x1920), el sitio como base. Facebook Reels y X despues.
- **Riesgo de monetizacion:** YouTube no paga contenido "mass-produced or repetitive"
  (plantillas sin variacion). Cada episodio necesita una capa editorial propia
  (gancho, historia, comentario) y variedad de juegos; no contar con monetizacion al
  inicio.
- **Hashtags:** Instagram permite 5 por publicacion desde dic 2025 y sirven para
  clasificar, no para ganar alcance. Usar 3 a 5 especificos.

## Flujo de trabajo y revisiones

- **Aprobacion por etapas:** spec y plan se aprueban antes de construir; no se cambia lo aprobado sin preguntar. **No hacer push, PR ni fusion sin orden explicita** (una orden vale solo para lo que nombra). No gastar saldo de API sin orden; `privado/` y `.env` nunca se publican.
- **Pruebas con modelos reales: AL FINAL.** Primero todo lo demas al 100 %; las partidas de esa prueba seran las primeras oficiales y se graban.
- **Cada cambio con prueba que falla antes** (rojo, verde), y una mutacion para comprobar que la prueba detecta el error. Un ledger por plan en `.superpowers/sdd/`, archivado en `privado/planes/` al terminar.
- **Antes del agente de revision independiente, una pasada rapida con `/code-review` y/o `/simplify`** sobre el diff de la rama: se corrige lo que encuentren (con prueba que falle antes) y solo despues se lanza el agente (opus, solo lectura), que es mas caro. Asi el agente gasta su revision en lo que de verdad hace falta.
- **Tokens:** CLAUDE.md se mantiene corto; el detalle de cada juego vive en `docs/decisiones-detalle.md` y se lee solo al tocar ese juego. Las revisiones de muchas imagenes se hacen con una hoja de contacto, no con capturas sueltas.

## Estado actual

**Hecho:** motor generico (`arena.js`), prompt unico versionado, RNG con seed, cliente de OpenRouter y registro de contendientes; los 8 juegos con motor, bots, evaluacion, pruebas y escena (la del juego 2, Guerra de territorios, terminada el 17 de octubre de 2026; 1326 pruebas con la narracion interpretada y los fundidos de grabacion del 18 de octubre, rama `narracion-y-fundidos` aun sin fusionar);
CLI de duelos, series de rotacion, agregador de marcador, sitio publicado con marcador por categoria (<https://gerrypetrucci.github.io/enfrentando-a-las-ias/>, se despliega solo en cada push a `main` que toque `web/` o `data/`), reproductor vertical, voz local y
herramienta de partes. Repo publico: <https://github.com/GerryPetrucci/enfrentando-a-las-ias>.

**Pendiente:**
- [ ] Piloto con modelos reales (en curso desde el 18 de octubre de 2026, con orden expresa y tope): grabar el episodio 1 y, si queda bien, subirlo; los IDs de modelo se verifican con `node herramientas/verificar-modelos.mjs` antes de cada corrida (cambian cada pocos meses; ultima vez 18 de octubre, todo cuadra).
- [ ] Kit de marca hecho (`marca/`), cuentas de las 4 redes creadas (usuarios en `marca/perfiles.md`) y estrategia de publicacion escrita (`privado/contenido/`); falta dominio propio, sitio multilenguaje, imagen para links (`marca/exportados/og-1200x630.png`) y la tarjeta de marcador (resumen de una serie). Antes de la semana 1: correr series reales (AL FINAL, con orden expresa) y verificar una vez las pantallas de cada red (lista en la guia).
- [ ] Juego 2 Guerra de territorios: mapa en la partida con 4 biomas y escena **hechos el 17 de octubre de 2026** (detalle en `docs/decisiones-detalle.md`); la humo con modelos gratis ya se corrió (15-40 % de respuestas con JSON: no sirven); falta solo la prueba con modelos reales (AL FINAL).
- [ ] Quinto bioma «cordillera» (apuntado el 17 de octubre de 2026): quedó fuera porque con el tinte de los reinos no se distingue del continente; rediseñar con montañas más anchas o un tinte más ligero.
- [ ] Modo "bot escrito" para correr miles de partidas.
- El detalle del estado de cada juego y las ideas de formato en la banca estan en `docs/decisiones-detalle.md`.

## Convenciones del codigo

- Espanol en nombres, comentarios y textos. Sin acentos en identificadores,
  comentarios ni documentacion interna. **Los textos que ve el publico** (video,
  sitio, nombres de categoria, marca/) **llevan acentos**, tambien en mayusculas
  (NEGOCIACIÓN, ROMPIÓ): lo exige la ortografia y se ve bien en pantalla.
- **No acentuar el prompt** (`reglas` y `formatoRespuesta` de cada juego, `src/prompt.js`):
  es EL CONTRATO. Tocarlo cierra la temporada.
- El nombre de la categoria se guarda dentro de cada partida y el marcador agrupa por
  el: cambiarlo despues de tener episodios reales parte el historial en dos.
- ES modules, Node 20+, **cero dependencias**. Si algo necesita un paquete,
  pensarlo dos veces antes de agregarlo.
- Sin paso de build: el sitio es HTML estatico que se abre y ya.
- Pruebas con `npm test` (`node --test`, archivos `src/pruebas/*.test.js`).
