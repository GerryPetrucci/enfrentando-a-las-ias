# Contexto del proyecto



## Instrucciones compartidas con Codex

Leer [AGENTS.md](AGENTS.md) y aplicar sus reglas comunes. El flujo de relevo esta
en [docs/colaboracion-asistentes.md](docs/colaboracion-asistentes.md); el estado
del trabajo entre asistentes vive en `privado/planes/relevo-asistentes.md`.



## Produccion actualizada (23 de octubre de 2026, orden del usuario)

Se conservan las DOS partes. `herramientas/paquete.mjs` crea `jN/` dentro de
originales, por-subir, subidos y revision. Los archivos existentes ya se
organizaron con `herramientas/organizar-grabaciones.mjs --aplicar` (47 archivos,
7 LEEME ajustados; no se convirtio audio ni se regeneraron paquetes viejos).
Al avisar una subida, buscar primero en `por-subir/jN/` y mover a `subidos/jN/`;
una version convoz/sinvoz es alternativa: no exigir subir ambas ni borrar una
por confundirla con una pieza faltante. Mantener la politica de publicar datos
solo al subir una parte, con su rango y final correctos.

Los paquetes NUEVOS escriben un texto por pieza (titulo + descripcion y, en
partes, comentario fijado), `guion.md` para narracion humana y el LEEME en orden
gancho 1 -> parte 1 -> clips de esa parte -> gancho 2 -> parte 2 -> sus clips.
Los cupos viven en `CLIPS_POR_PARTE` (`web/casino/editorial-paquete.js`); se
pueden ajustar con `--clips=2,1`. Solo momentos reales dentro de cada parte.
Las direcciones nuevas llevan `audio=separado`: voz izquierda, efectos derecha;
`recortar-formatos.mjs --audio-separado` genera convoz/sinvoz en ambos formatos.
Exige OBS estereo sin mezclar canales; no sirve para maestras antiguas mezcladas.
Detalles y limites: `docs/produccion-videos.md`. Paquetes de muestra nuevos:
`grabaciones/revision-produccion-2026-10-23/mayor-o-menor/paquete-j1` y `paquete-j2`.

> Este archivo lo lee Claude Code automaticamente al abrir la carpeta.
> Resume de donde viene el proyecto y que decisiones ya estan tomadas, para no
> volver a discutirlas. Si cambias una decision, actualiza este archivo.
>
> Origen: conversacion en la app de Claude, 8 de octubre de 2026.



## Donde vive que



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
las IAs y congelado junto con el prompt y los demas parametros (`src/parametros.js`; cada contendiente declara `razonamiento` en `src/modelos.js`). `max_tokens` 8000 (4000 desde el 10 de octubre de 2026, cuando con 2000 GPT Luna
se cortaba; 8000 desde el 26 de octubre por orden del usuario, «calidad antes que cantidad»: con 4000 se cortaban jugadas del final de Guerra y de Lobo); si aun asi se cortan, se mide y se decide con el usuario, sin subir el razonamiento. Correr `node herramientas/verificar-modelos.mjs` antes de cada corrida con modelos y antes de gastar. Detalle y mediciones: `docs/decisiones-detalle.md`.



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



## Invariantes de diseno (romper esto rompe el proyecto)



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



## Flujo de trabajo y revisiones

- **Aprobacion por etapas:** spec y plan se aprueban antes de construir; no se cambia lo aprobado sin preguntar. **No hacer push, PR ni fusion sin orden explicita** (una orden vale solo para lo que nombra; unica excepcion fija: el commit y push de `data/publicas/` y `web/marcador.json` tras avisar el usuario que subio un video, ver «Publicacion de resultados»). No gastar saldo de API sin orden; `privado/` y `.env` nunca se publican.
- **Pruebas con modelos reales: AL FINAL.** Primero todo lo demas al 100 %; las partidas de esa prueba seran las primeras oficiales y se graban.
- **Cada cambio con prueba que falla antes** (rojo, verde), y una mutacion para comprobar que la prueba detecta el error. Un ledger por plan en `.superpowers/sdd/`, archivado en `privado/planes/` al terminar.
- **Antes del agente de revision independiente, una pasada rapida con `/code-review` y/o `/simplify`** sobre el diff de la rama: se corrige lo que encuentren (con prueba que falle antes) y solo despues se lanza el agente (opus, solo lectura), que es mas caro. Asi el agente gasta su revision en lo que de verdad hace falta.
- **Tokens:** CLAUDE.md se mantiene corto; el detalle de cada juego vive en `docs/decisiones-detalle.md` y se lee solo al tocar ese juego. Las revisiones de muchas imagenes se hacen con una hoja de contacto, no con capturas sueltas.



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

## Decisiones comunes conservadas al acotar el repositorio

La voz se genera antes de grabar, localmente; el video espera la duración real de
cada frase. Los hechos salen del registro y los comentarios no cambian jugadas.
`linea-comun.js` conserva `dicho`, `mudas` y los textos públicos; una pieza no debe
presuponer que el espectador vio las anteriores. Los fundidos de grabación siguen
en `escena-config.js`: 2 s de negro, 0.5 s de entrada, contenido, 0.5 s de salida
y 2 s de cola. El recorte identifica los márgenes, sin alterar la partida.

Los fallos del compositor de OBS motivaron `animador-estilo.js`, genérico y probado:
escribe el estado final en estilos en línea. El cierre de video se identifica por
`cierre-N`, no por el tipo del beat. Paleta, fuentes locales, zonas seguras, audio
CC0, hashtags, identificación `jN`, paquetes y publicación por partes se mantienen.
Los tokens de salida, caché de prefijo y límites de costo se rigen por los
parámetros vigentes; las cifras históricas no son una tarifa actual.

## Histórico: juegos eliminados (7 de noviembre de 2026)

Civilizaciones, conquista (Guerra de territorios), dudaapuesta, tripledado,
mayormenor, fuga, subasta, solitario y dilema fueron eliminados del producto.
Sus reglas, motores, escenas, mediciones y decisiones exclusivas se conservan en
la etiqueta git `respaldo-antes-de-worldbox-2026-11-07`.
Las decisiones comunes de narración, publicación, marca, seeds y control de
costos siguen vigentes; el contrato actual está en `AGENTS.md`.
