# Decisiones por juego y por escena (detalle)

> Movido tal cual desde `CLAUDE.md` el 17 de octubre de 2026 para que cada sesion cargue menos contexto: `CLAUDE.md` tiene el resumen y las reglas que no se reabren;
> aqui esta el detalle de cada juego, de las escenas, de la voz y del lote. **Leelo solo si vas a tocar ese juego o esa escena.** Si cambias una decision, actualiza este
> archivo y el resumen de `CLAUDE.md`.



### Razonamiento de los modelos: siempre medio, nunca el maximo (decidido el 9 de octubre de 2026)

Todos los modelos se llaman con el razonamiento en nivel **medio** (`reasoning.effort = "medium"` en OpenRouter) o, si el
modelo no lo permite, con su valor por defecto. **Nunca el maximo** (`high`, `xhigh`): cuesta mucho mas en los modelos
caros (el razonamiento oculto se cobra como salida) y no cambia lo que se mide. Es igual para todas las IAs y se congela
junto con el prompt y los demas parametros de llamada. **Estado: implementado** en `src/parametros.js` (`PARAMETROS` y `cuerpoDeLlamada`). Cada contendiente declara en `src/modelos.js`
su campo `razonamiento` (`"medium"` si el modelo admite ese nivel, `null` si no tiene niveles) y
`node herramientas/verificar-modelos.mjs` lo compara con el catalogo de OpenRouter: correrlo antes de cada corrida con modelos y antes
de gastar. Claude Sonnet 5.5 razona en `high` por defecto, por eso se le manda `medium` explicito. Segun el catalogo del 9 de
octubre de 2026, Claude (Sonnet y Haiku 5.5) y GPT-6 ignoran `temperature`: el 0.7 se manda igual a todos, pero con ellos no
tiene efecto. Lo que se le mando a cada modelo queda en `parametros` de cada resultado. Medido el 10 de octubre de 2026: con
`max_tokens` 2000 y razonamiento medio, GPT Luna se corto en 3 de 4 jugadas (el razonamiento se comio 1,919-2,000 tokens). El
usuario decidio subir `max_tokens` a 4000 (el razonamiento sigue en medio); si aun asi se cortan, se mide y se decide con el
usuario: no se sube el razonamiento para "darles espacio".



### Voz narradora con IA (decidido el 11 de octubre de 2026)

El usuario no narra los videos: la voz es **sintetizada por IA** en todas las grabaciones. Lo que se graba con OBS es el reproductor
leyendo una partida ya guardada, asi que la voz se genera **antes** de grabar y la escena espera a que termine cada frase: el video
sale completo en una sola toma, sin post-produccion de audio, y la linea de tiempo se exporta para poder re-doblarlo en otro idioma.
Nada de voz en tiempo real. Hay dos capas de texto: los **hechos** (los escribe el codigo, siempre verdaderos) y el **comentario** (la
capa editorial; nunca cambia ni oculta una jugada). La voz se declara como contenido generado por IA donde la plataforma lo pida y
no imita a ninguna persona real. Motor de voz: **gratuito y local** (decidido el 11 de octubre de 2026). **Elegido el 16 de octubre de 2026** entre 7 voces de 3 motores: Piper (MIT) con una voz en español de México (Apache-2.0; su nombre técnico no se muestra en público: ver `privado/terminos/voz-narradora.md`, con licencias, cuidados y el respaldo Kokoro). **Estado:** `herramientas/narrar.mjs` hecho: genera un audio por momento y un `voz.json` en `data/voz/` (ignorado por git), y la escena lo usa con `?voz=`. Detalle en `privado/planes/plan-voz-narradora.md`.



### Lote (Batch API): mitad de precio, sin prisa (decidido el 9 de octubre de 2026)

Nada de esto es en vivo: la partida se graba con OBS despues. Por eso `node src/correr.js ... --modo=pago --lote --tope=DOLARES`
manda las jugadas por la Batch API de OpenRouter, con **50% de descuento** (variantes `:batch` del catalogo) a cambio de esperar:
segun OpenRouter, en el beta la mediana fue de 7 minutos y el 90% terminaba en menos de una hora (el maximo es 24). Las tres banderas son
obligatorias juntas; sin `--tope` o sin saldo suficiente no sale ningun lote. No cambia el prompt ni los parametros: es el mismo
texto al mismo modelo. Todas las partidas de la serie corren a la vez, turno por turno, y cada turno es un lote por modelo
(`src/coordinador-lote.js`); `arena.js` no sabe nada del lote. Los modelos sin variante de lote (Llama, DeepSeek, los gratis) se
llaman normal dentro de la misma corrida. El tope se revisa antes de cada lote nuevo contra el gasto ya informado por OpenRouter (lo enviado y aun en espera no se
cuenta, asi que el gasto puede pasar un poco del tope; una guardia exige que la primera ronda quepa en el tope): si se alcanza, no
salen mas lotes y la serie incompleta se guarda en `data/pruebas/`. Si un envio o una espera falla, la serie se detiene (fail-closed), se
avisa con el id del lote y cada evento queda en `data/pruebas/*.lotes.jsonl`. El costo y los tokens vienen por lote, no por peticion: el reparto por reino es
una aproximacion. Un lote enviado no se reintenta (no hay llave de idempotencia: reenviar cobraria dos veces). Si la corrida se
interrumpe a media espera, el lote sigue en OpenRouter y se cobra: la consola imprime su id al enviarlo y
`node herramientas/ver-lote.mjs ID` muestra en que quedo (no retoma la serie).

**Modelos economicos de practica:** `haiku`, `luna` y `flash-lite` (la gama baja de cada proveedor, marcados `practica: true`) para
ensayar por lote por centavos (medido el 10 de octubre de 2026: ~$0.12 por partida de 4 reinos al tamano del turno 1). Sus resultados son de practica, nunca de torneo: la consola los
manda a `data/pruebas/` y se niega a mandarlos a `--destino=oficial`. No se juegan en la misma partida que su version de gama
media (comparten color).



## Sitio y publicacion por partes (18 de octubre de 2026)

La politica esta en CLAUDE.md («Publicacion de resultados»); aqui el como.



## Formato vertical: zona segura para todos y subtitulos que se apagan (20 de octubre de 2026)



## Carpetas de grabaciones y nombres de los videos (20 de octubre de 2026)



## Cierre de cada video: frase de la voz, logo, redes y pagina de resultados (21 de octubre de 2026)

- **Que es:** el ultimo beat (`tipo: 'cierre'`, id `cierre-N`) de toda pieza grabada: parte, clip y gancho. La voz dice una de 12 frases (`FRASES_CIERRE` en `web/casino/cierre.js`: «No olvides seguirnos y reaccionar.», «Síguenos y reacciona para no perderte la próxima partida.»...) y la tarjeta (a pantalla completa dentro de la zona segura, 9:16 y 16:9) muestra el logo, la frase, una fila por red con icono y @ (TikTok, Instagram, YouTube, Facebook y X; de `web/redes.js`) y la pagina de resultados.
- **Al azar, pero siempre igual:** la frase sale de `indiceDeCierre(clave)` (hash del seed, la partida del archivo y las unidades de la pieza o el numero de gancho): cada video dice una distinta y el mismo video es siempre el mismo (el `rng` con seed de siempre, nunca `Math.random`).
- **Voz:** `narrar.mjs` genera un audio por frase (todas) junto a los de la partida; la pagina usa el de la frase que toca (`entradaDeVoz` por id y fuente). Para una partida ya narrada, `--solo-cierres` los agrega a su `voz.json`. En el gancho `vozSoloCierre` deja pasar solo los `cierre-N` (los cortes no se narran).
- **Donde se agrega:** `escena.js` con `cierre=1` (la agregan `direccionDeGrabacion` y `direccionDeGancho`); `MesaBase.ejecutarCierre` la dibuja (`.cierre-juego` en `mesa.css`). Dura al menos 6.5 s (hay que leer los @) o lo que dure la voz; el paquete lo suma a cada pieza (`duracionDeCierre`) y los clips siguen siendo de 20 a 40 s de contenido. Al grabar con OBS, despues del cierre viene el fundido a negro de siempre.
- **Verificado** con una partida de cada uno de los 7 juegos reproducida entera con `cierre=1` (sin errores, la cabecera no cambia) y el gancho; el cierre queda dentro de la zona segura (60, 285, 890 x 1215).



## Gancho «Próximamente» (aprobado e implementado el 20 de octubre de 2026)

- **Que es:** una pieza nueva del paquete, la que se sube ANTES de la parte: `hk1` es el gancho de la parte 1, `hk2` el de la parte 2 (un juego corto de un solo video lleva un gancho, el video y los clips; orden de subida: gancho, parte, clips). Nombre: `26-10-19_p1_hk1_9x16_fb-ig-tk-yt.mp4`. El id interno de la pieza es `gancho-N`.
- **Como se ve (20 a 25 s):** tarjeta de apertura (2.5 s) «PRÓXIMAMENTE» con «<Juego> · Partida N · Parte M de K» y el logo; 4 a 6 cortes rapidos de ~2.5 s de momentos de ESA parte, con una etiqueta corta cada uno (los mismos momentos destacados que eligen los clips); tarjeta de cierre (3 s) «Parte M de K · No te la pierdas» y «Síguenos para ver cómo termina».
- **Reglas:** sin spoilers (solo momentos de esa parte, nunca el ultimo turno, que trae el resultado; el gancho de la parte 2 tampoco anuncia al ganador); sin voz narradora en los cortes y sin musica (el usuario pone la musica al subir; nada con derechos; solo suena la frase del cierre, ver «Cierre de cada video»); dice «Próximamente», no «mañana»; el paquete genera su texto por red con `[GANCHO: ...]` y sin resultado; las tarjetas pasan por la misma prueba de zona segura.
- **Como esta hecho:** `web/casino/gancho.js` (puro): `elegirCortes` toma las destacadas de la parte (`destacadasDe`, el paquete pide 40) con puntos > 0, sin la primera ni la ultima unidad de la partida, de mejor a peor mientras quepan en 20 s (con etiquetas); cada corte es una unidad entera acelerada para durar ~3.5 s (1x a 8x; no entra si ni asi baja de 6 s); con menos de 2 cortes esa parte sale sin gancho y el paquete lo advierte. `armarGancho` arma los beats (tarjetas `tarjeta-gancho` + copias con `vel`); `MesaBase.ejecutarTarjetaGancho` las dibuja dentro de la zona segura y `escena.js` pone la velocidad de cada corte (`gancho=1&cortes=10,6,14&parte=1&de=2`; `direccionDeGancho`). `marcarTiempos` suma lo que dura de verdad cada beat con su `vel`. Verificacion visual: `node herramientas/capturar-escena.mjs --archivo=... --gancho=auto --parte=1` (tarjetas y primer momento de cada corte) y con `--completa --vel=1` se comprueba que dura lo que dice el plan (17.8 s medidos contra 17.8 s del plan en el piloto).




## Diez modelos nuevos tras la prueba de humo (25 de octubre de 2026)



## Partidas con modelos de práctica y llamadas inválidas siempre analizables (25 de octubre de 2026)



## Gancho en imagen para los juegos sin gancho en video (25 de octubre de 2026)

- **Regla del usuario:** donde no se pueda generar el gancho «Próximamente» en video, se genera en imagen: texto «Próximamente» (o similar), número de juego y número de parte, con imágenes de la aldea o de algún personaje a elección de quien lo diseña. Aplica a todos los juegos; está en `AGENTS.md`.
- **Cómo funciona:** `construirPaquete` (web/casino/paquete-textos.js) crea una pieza `gancho-imagen` en cada parte con menos de 2 cortes buenos (`elegirCortes`); `herramientas/paquete.mjs` genera los PNG con `herramientas/gancho-imagen.mjs` (servidor de `web/` en un puerto libre + Chrome/Edge sin cabeza sobre `web/gancho-imagen.html`) en `por-subir/jN/` con el nombre de los videos (`j1_hk1_9x16_fb-ig-tk-yt.png`, `j1_hk1_16x9_fb-x-yt.png`). El LEEME la lista antes de su parte (no se graba), con vista previa y comando para regenerarla; `textos/gancho-N.txt` trae título y descripción.
- **Diseño:** marca del sitio (Barlow Condensed e Inter locales, `--oro`, `--hueso`, `--noche`), todo dentro de la zona segura del formato, etiqueta de IA y «Juego N · Parte M de K» (N = el jN del paquete, no el número de partida). Arte por juego en `ARTE_GANCHO` (`web/casino/gancho-imagen.js`): Lobo lleva el panorama de la aldea y sus seis personajes en pose de acción; un juego sin entrada lleva solo la marca. La página se autocomprueba (`data-fuera` = elementos fuera de la zona, debe ser 0) y una prueba con navegador lo verifica en ambos formatos, con y sin arte.
- **Detalle técnico a recordar:** el navegador se lanza con `spawn` asíncrono; con `spawnSync` el servidor del mismo proceso se congela mientras el navegador le pide la página y todo se queda esperando.



## `max_tokens` de 4000 a 8000: llamadas inválidas por respuestas cortadas (26 de octubre de 2026)

- **Pregunta del usuario:** ¿por qué fallan las llamadas inválidas? Si son tokens, vale la pena subir el máximo: prefiere gastar más crédito y entregar una partida completa antes que partidas a medias («calidad antes que cantidad»).
- **Medido con `herramientas/analizar-invalidas.mjs`** (no llama a ningún modelo): de las 12 llamadas inválidas de las últimas partidas, **10 son respuestas cortadas por `max_tokens`** (`finish_reason=length`: el razonamiento oculto y la respuesta no cabían en 4000). Guerra de Haiku/Luna/Flash-Lite (26-10, 25 turnos, 71 llamadas): Claude Haiku 6 de 25, **todas del turno 18 al 24** (justo el final, cuando el estado es más grande y la partida se decide), GPT Luna 1; el ensayo corto de 3 turnos, GPT Luna 1 de 3; Lobo con 8 modelos: MiniMax 2 de 6 (sin niveles de razonamiento, usa su defecto). Las otras 2 son de Phi-4 en Lobo, «sin motivo registrado» (esa partida es anterior al registro del texto crudo; la próxima partida de Lobo lo guarda). La partida de bots no tuvo ninguna.
- **Consumo medio** por llamada en esa partida de Guerra: Haiku ~2,330 tokens de salida en las llamadas que terminaron (más las 6 cortadas, que gastaron 4000 cada una sin dar jugada), Luna ~2,750 y Flash-Lite ~2,780: el promedio ya estaba al 60-70 % del tope y la cola larga, que es la del final, se cortaba. Cuando una llamada se corta, el juego la reemplaza por «pasa el turno»: Haiku quedó fuera de las seis jugadas decisivas.
- **Decisión (el usuario):** subir `max_tokens` a **8000** (`PARAMETROS.maxTokens`, `src/parametros.js`) para todos los modelos y juegos; el razonamiento se queda en «medium» (como el 10-10: se amplía el límite, no se sube el razonamiento). Es un tope, no un gasto: solo se cobra lo que cada llamada usa, así que las llamadas que ya terminaban cuestan lo mismo; las que se cortaban pasan a costar lo que de verdad necesitan (en vez de 4000 tokens tirados) y dan jugada. El peor caso de una petición por lote (`COSTO_MAXIMO_PETICION`) sube de $0.006 a $0.011 y las estimaciones de la prueba de humo, que cuentan los `max_tokens` enteros, se duplican solas. Consecuencia práctica: el ensayo mínimo por lote (4 partidas, 3 modelos con lote = 12 peticiones de golpe) ya no cabe con `--tope=0.10` (peor caso $0.132): usar `--tope=0.15`.
- **Comparabilidad:** las series ya guardadas conservan su `parametros` (4000) y se publican como son; las nuevas llevan 8000. Cambiar un parámetro común entre partidas las vuelve incomparables (`docs/metodologia.md`): aquí se acepta a cambio de partidas completas. Queda sin decidir si se vuelve a jugar la partida de Guerra del 26-10 con 8000 (misma semilla, ~$0.35-0.45 con esos tres modelos): hace falta orden y tope.



## Lobo en la aldea: cada rol entra en su casa y nombres sin números en la narración (25 de octubre de 2026)

- **Entradas a casa (el usuario, al empezar a grabar):** en la apertura («La aldea se prepara para dormir») entraba siempre el mismo personaje genérico (el del sombrero y la bufanda roja) en todas las casas; solo cambiaba la insignia. Ahora entra el personaje de cada rol: si la insignia es de aldeano, entra un aldeano. Se usan las hojas que el usuario dibujó con ChatGPT el 24 de octubre (`privado/prototipos/lobo-assets/entrada-<rol>.png`: de día, atardecer, anochecer, entra, ya dentro y puerta cerrada), recortadas por `herramientas/recortar-entradas-lobo.mjs` a `web/arte/lobo/entrada-<rol>-01..06.png` (36 PNG con alfa; el degradado de 10 px solo donde un corte atraviesa el dibujo de la casa vecina). Prueba: `src/pruebas/escena/entradas-lobo.test.js`.
- **Dónde más:** el paso de Cupido (`enamorados`) usa los tres cuadros nocturnos de la casa de Cupido (entra, dentro, puerta cerrada). La casa misteriosa de cada noche («?») conserva a su figurante anónimo a propósito: no dice quién vive ahí. Las 36 imágenes anteriores de las casas por rol se movieron a `privado/papelera-imagenes-2026-10-25/casas-por-rol/`.
- **En las capturas (`rapido`)** solo se precarga el cuadro 4 de cada rol: precargar los 36 dentro del tiempo virtual de Chrome dejaba la escena congelada en la apertura al capturar las rondas siguientes.
- **Nombres en la narración (el usuario, 25-10-2026):** con 8 modelos distintos la voz y los subtítulos dicen solo el nombre del modelo («Grok», no «Grok · 00»); si un modelo ocupa varios asientos lleva una letra por orden de asiento («Grok A», «Grok B», «Grok C»; con 8 y 12 jugadores se juega con pares y tercias). El número de asiento nunca se dice. Implementado en `web/casino/lobo-nombres.js` (`nombresDeEscena`), que usan la línea de tiempo (voz y subtítulos) y la mesa (tarjetas y títulos). Prueba: `src/pruebas/escena/nombres-lobo.test.js`.
- **Lo que se escribe sí lleva el número (CORREGIDO el 25-10-2026, noche):** el hecho visible (`lineas`) y las tarjetas muestran el asiento DESDE 1 y sin cero a la izquierda (`1`…`8`). El motor y el prompt siguen contando desde 0 (cambiarlo exigiría una versión nueva de las reglas y no se hizo: la partida real ya jugada cita desde 0); la pantalla suma uno solo al escribirlo (`etiquetaAsiento`).
- **Citas de otros jugadores (CORREGIDO el 25-10-2026, noche; antes se leían literales):** los modelos citan a los demás por su asiento contado desde 0, casi nunca con la palabra «asiento» («inspeccionó al 0», «un aldeano (1)», «Lobo 4 eliminado», «entre 3,6,7», «acertó con 4», «su pareja es 0-5»). Voz, subtítulos y tarjeta ya no dicen esos números: `traducirAsientos` (`web/casino/lobo-nombres.js`) los vuelve el nombre del jugador (con su letra si el modelo se repite) ANTES de partir el mensaje en tarjetas, y el narrador elige qué acusaciones leer ya con los nombres. Lo que no se toca: rondas y días («Ronda 2»), cuentas («1 lobo», «2 votos», «quedamos 3»), decimales, horas, porcentajes, enumeraciones («1) ...») y los dígitos de un nombre («Phi-4»). Un número con palabra de asiento que no es de la mesa se vuelve «otro jugador»; uno suelto que no es de la mesa se deja. El texto guardado de la partida no cambia: es solo presentación.
- **Un mensaje de varias tarjetas (1/4, 2/4...) dice «X dice» una sola vez (25-10-2026, noche):** `fragmentarMensaje` parte lo que no cabe en una tarjeta, y antes cada parte volvía a decir el nombre y cortaba la frase. Ahora solo la primera lo lleva; las que la continúan se leen y subtitulan solo con su texto. El hecho visible de cada tarjeta sí conserva quién habla, y la declaración de rol («Mistral afirma ser Vidente») se dice al terminar el mensaje, no entre dos tarjetas.
- **La voz de una partida ya narrada se debe regenerar** (`node herramientas/paquete.mjs --archivo=SERIE.json --partida=1 …` con las mismas opciones, o `narrar.mjs`): el texto de la voz cambió.



## Hashtags siempre y título de 90 caracteres (26 de octubre de 2026)

- **Qué pasó:** los textos que se escriben para subir (`textos/<pieza>.txt`, de `publicacionDePieza`) salían sin hashtags desde que se pasó a un «texto único por pieza»; los hashtags (`hashtagsDe`) solo estaban en los textos por red que ya no se escriben. El usuario lo vio en los de Lobo.
- **Regla (el usuario):** siempre que se generen textos para publicar llevan hashtags. Cada descripción termina con una línea de 1 a 5 (`#IAvsIA`, los del juego, los de los modelos que juegan; en Lobo salen `#IAvsIA #LoboEnLaAldea #DeducciónSocial #Grok #Qwen`: solo caben los dos primeros modelos). El título mide **como máximo 90** caracteres (antes 100) y la descripción 280 (`MAX_TITULO`, `MAX_DESCRIPCION`, `MAX_HASHTAGS` en `web/casino/editorial-paquete.js`). Si no cabe, primero se quita la línea de las rondas, luego hashtags desde el final (nunca `#IAvsIA`) y al final se acota el detalle. El comentario fijado no lleva hashtags.
- **Modelos nuevos con hashtag:** `MODELOS` suma Grok, Qwen, Mistral (y Ministral), MiniMax, GLM, Kimi y Phi (`#Phi4`); un modelo que se registre en `src/modelos.js` debe agregarse allí.



## Cierre por tipo de pieza y título uniforme (25 de octubre de 2026, noche)

## Lobo en la aldea 1.3.0: Cupido oculto (26 de octubre de 2026)

- **Por qué:** desde el 24-10 Cupido quedaba revelado a todos, también a las IAs (`vistaDe` entregaba su rol): un lobo que lo sabe lo mata la primera noche y, si Cupido es enamorado, se lleva a dos. Además el público perdía el suspenso del rol. Spec: sección 7-ter de `privado/spec/lobo-propuesta.md`.
- **IAs:** nunca saben quién es Cupido ni quiénes son los enamorados, salvo Cupido (a quién eligió) y cada enamorado (su pareja). Cupido se descubre al morir o si él se declara con `afirmaRol`; la pareja, cuando muere uno de los dos. El texto de reglas lo dice (reglas `lobo-1.3.0`).
- **Público, por seed (25 % cada modo, `MODOS_CUPIDO`):** `pareja` (se ve quiénes son los enamorados), `cupido` (se ve quién es Cupido), `ambos` (como en 1.2.0) y `nada` (solo «Cupido ha elegido a dos enamorados»). La tirada es la ÚLTIMA del RNG en `crearEstado`: un seed reparte los mismos roles y reemplazos que en 1.2.0. `crearEstado(rng, { modoCupido })` lo fuerza (pruebas, `jugarLobo`).
- **Datos:** el evento público `enamorados` guarda solo lo que el modo revela (más `revela`); la elección completa queda en el registro privado. La primera muerte de un enamorado trae `pareja` (una sola vez) y el evento `final` trae `enamorados`; la escena, la voz y la conversación del sitio lo usan. Un `enamorados` sin `revela` es de 1.2.0 y se narra EXACTAMENTE igual que antes (comprobado con la partida ya publicada: 48 momentos idénticos), así que la voz ya generada de Lobo j1 sigue valiendo.
- **Aviso de subida de Lobo j1 (jugada con 1.2.0):** `publicar.mjs` se negará (el prompt de sistema cambió) y `--forzar` publicaría sin prompts. Usar el worktree del commit anterior a este cambio, como en Guerra j3 (ver arriba): `git worktree add --detach <carpeta> 49e3cbe`.



## Lobo en la aldea 1.4.0: prompt completo (29 de octubre de 2026)

- **Por qué:** la regla del 28-10 (`docs/guia-de-prompts.md`) pide un prompt que explique el juego entero en TODOS los juegos; Lobo seguía con el resumen de reglas de `lobo-1.3.0` (3 115 caracteres, una línea de formato, con acentos) y la tabla de auditoría lo marcaba «Pendiente». Vacíos que tenía, comprobados contra el motor: no decía que los lobos no se ven ni se hablan de noche ni que sin acuerdo unánime no hay víctima (y que una respuesta descartada de un lobo casi siempre lo rompe), que `matar` de la bruja es obligatorio (escribir `null`), que `afirmaRol: null` o un mensaje de más de 1 000 caracteres invalida TODA la respuesta (incluido el voto), qué se pone en lugar de una respuesta descartada y que no se avisa, el orden del amanecer (víctima y veneno, amor, cazador, victoria), que el cazador dispara antes de comprobar la victoria, el tope de 6 rondas y el presupuesto de 100 llamadas, qué trae cada campo del estado ni la forma de cada evento.
- **Reglas del motor:** NO cambian. Cambia lo que ven las IAs (`VERSION` `lobo-1.4.0`): `src/juegos/lobo/reglas-texto.js` (PRESENTACION, REGLAS en 7 secciones, GUIA_ESTADO, FORMATO, EXPLICACION_RESPUESTA, ERRORES_FRECUENTES; 19 458 caracteres, ~7 200 tokens estimados, solo ASCII). Los números salen de `constantes.js` (nuevas: `LARGO_MENSAJE`, `PUNTOS`, `LIMITE_LLAMADAS`; `turno.js` y `lobo.js` ya las usan, sin cambio de comportamiento). Los ejemplos de estado son texto fijo (`ejemplo-estado.js`, generado con el motor por `herramientas/ejemplo-estado-lobo.mjs`: una mesa de 12 jugada a mano hasta la ronda 2; una prueba avisa si la vista cambia).
- **Quitado a propósito:** «Obediencia se mide aparte» (es una métrica del proyecto, no una regla); los acentos (el prompt va en ASCII).
- **Pruebas:** `src/pruebas/lobo/prompt-claro.test.js` (28 pruebas contra el motor: unanimidad de los lobos, un amanecer sin muertos indistinguible, orden del amanecer, cazador antes de la victoria, fases sin actores, empate de votos, sin victoria por paridad, tope de rondas, cada regla de puntaje, cada causa de respuesta inválida y su reemplazo, orden de las claves del estado, ejemplos del formato aceptados por el parser) y `ejemplo-estado.test.js`. Se actualizaron las pruebas que fijaban el texto o la versión viejos (`dos-videntes`, `cupido-oculto`, `declaraciones`). Suite completa: 2 360 pasan, 0 fallan.
- **Sin medir con modelos (decisión del usuario, 29-10: menos de 10 USD de crédito):** a diferencia de Guerra, este texto NO se probó como variante sobre prompts reales ni hay línea base con el prompt viejo. Lo que se sabe por Guerra: un prompt más completo hace razonar más a algunos modelos (Haiku y Gemini ×2) y el tope de salida ya es de 16 000. La primera partida real con 1.4.0 es la medición: revisar sus llamadas inválidas con `herramientas/analizar-invalidas.mjs` y, si algún modelo se corta, repetir sus prompts reales con `examen-modelos.mjs --partida`.
- **Costo:** la entrada por llamada pasa de ~1 200 a ~7 200 tokens solo de prompt de sistema (más el estado, que crece con la partida). Estimado de una mesa de 12 con ~75 llamadas: $1.5–2.3 con Claude, GPT, Gemini, Grok, GLM y DeepSeek (dos asientos cada uno); la caché de prefijo de OpenAI, Anthropic, Google y GLM lo baja.
- **Partidas anteriores:** Lobo j1 (jugada con 1.2.0) ya está publicada completa; cualquier otra partida de Lobo anterior a 1.4.0 pediría el worktree del commit anterior (el hash del prompt de sistema cambió).

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
