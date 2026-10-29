# Paquetes de grabacion y publicacion

Se conserva el episodio en dos partes. El paquete crea una carpeta `jN` dentro
de cada estado, para que dos partidas de una serie nunca mezclen sus archivos:

En vertical, el area de contenido esta centrada en x=540, con 130 px de margen
a cada lado (820 px utiles). Se conserva la reserva superior de 285 px y la
inferior de 420 px. La carta de ajuste de OBS usa las mismas medidas; el formato
horizontal y los recortes de la hoja maestra mantienen sus dimensiones.

```text
<serie>/
  originales/j1/         originales/j2/
  por-subir/j1/          por-subir/j2/
  subidos/j1/            subidos/j2/
  revision/j1/           revision/j2/
  paquete-j1/            paquete-j2/
```

En el LEEME todo lo que se copia (la direccion de cada pieza, el nombre al que se renombra
la grabacion de OBS, su carpeta y los comandos `node ...` de recorte) esta en **bloques de
codigo**, y al principio trae un **resumen rapido** con todos los nombres de los `.mkv` y todos
los comandos de recorte juntos, en el orden en que se graban. Los nombres de los videos que
quedan en `por-subir/` van en codigo en linea. Lo exige `paquetecli.test.js`.

El LEEME enumera las piezas en orden de subida: gancho de la parte 1, parte 1,
sus clips, gancho de la parte 2, parte 2 y sus clips. Una pieza solo se genera
si hay momentos adecuados; no se inventan clips para llenar un cupo. Cada clip
queda dentro de su parte, sin la primera unidad de la partida ni la ultima.

Para organizar grabaciones ya existentes, sin cambiar su audio ni los textos:

```powershell
node herramientas/organizar-grabaciones.mjs --json
node herramientas/organizar-grabaciones.mjs --aplicar
```

El primer comando solo propone movimientos. El segundo comprueba colisiones
antes de mover y actualiza las rutas de los LEEME conservando el resto del texto.
No mueve archivos que ya estan en `jN/` ni sobrescribe destinos existentes.

Los cupos son maximos por parte, no obligaciones. Viven en
`CLIPS_POR_PARTE`, en `web/casino/editorial-paquete.js`: Guerra 2/2, Duda y
apuesta 2/1, los demas 1/1. Se pueden cambiar para un paquete:

```powershell
node herramientas/paquete.mjs --archivo=SERIE.json --partida=1 --clips=2,1
```

Si el guion aprobado fija una frontera concreta, `--corte=5` conserva las
rondas 1–5 en la primera parte y las restantes en la segunda, aunque sus tiempos
sean distintos. Sin esa opción sigue la división automática por duración.
`--momentos=4,8` prioriza esas rondas para los clips, sin limitar los candidatos
de los ganchos. La ventana de un clip puede ampliarse dentro de su parte para
alcanzar una duración útil; revisar siempre el rango generado.

```powershell
node herramientas/paquete.mjs --archivo=SERIE.json --corte=5 --momentos=4,8
```

Conservar esas opciones al regenerar el paquete. Ninguna de ellas cambia las
reglas, los resultados o las partidas guardadas.

## Gancho en video, gancho de imagen fija e identificacion de cada pieza (reglas del 25 y 28 de octubre de 2026)

**Todo gancho, clip y parte se identifica con el `jN` (28-10-2026).** Rótulo: «Juego N · Parte M de K», con N = el `jN` del paquete y M = la parte; nunca «Partida N» (ya no son partidas, son juegos, y el
numero de partida dentro del archivo casi siempre es 1).
- **Gancho** (video o imagen): sus tarjetas de apertura y de cierre dicen «Juego N · Parte M de K».
- **Parte y clip:** abren con una tarjeta de 2.5 s (`IDENTIFICADOR_MS`, `conIdentificador` en `web/casino/gancho.js`): «JUEGO N», el nombre del juego y debajo «Parte M de K» o «Clip K · Parte M de K»; va antes de la tarjeta de arranque
  de la parte 1. La duracion de cada pieza en el LEEME ya la suma.
- **Como llega el numero:** en la direccion de cada pieza (`numero=N&parte=M&de=K`, y `clip=K` en un clip; `direccionDeGrabacion` y `direccionDeGancho`). Para verlo: `node herramientas/capturar-escena.mjs --archivo=... --numero=3 --parte=1 --de=2 --beats=0`.
- **Una direccion vieja no graba una pieza sin identificar:** si al GRABAR (`grabar=1`) la direccion no trae `numero` (la de un LEEME anterior), la pagina busca el jN de esa partida en `data/paquetes.json` (el indice de paquetes,
  `web/casino/indice-paquetes.js`; no se versiona) y, si la pieza esta en su paquete, tambien su parte y su clip. `paquete.mjs` lo actualiza cada vez que genera un paquete; `node herramientas/paquete.mjs --indexar` lo rehace con los
  paquetes que ya hay en `grabaciones/listos/`. Si esa partida no tiene paquete, no se inventa un numero. Aun asi, lo correcto es regenerar el paquete con `--forzar` y grabar con el LEEME nuevo.

**Gancho en video de Guerra de territorios, mas lento (28-10-2026).** Los cortes del gancho se aceleraban hasta 8x y un turno de 40 a 65 s cabia en ~5 s: no se distinguia nada. En Guerra (`GANCHO_POR_JUEGO.conquista` en
`gancho.js`) la aceleracion maxima es 3x, un corte dura ~6 s (hasta 12 s), el gancho llega a 4 cortes (36 s de cortes) y cada corte muestra SOLO el momento —la batalla (la decisiva primero), la traicion o la resolucion de la
Maravilla/caida/conquista—, no el turno entero: una batalla se ve a ~1.8x. Los demas juegos conservan los parametros de siempre. La pagina y el paquete piden las mismas destacadas (40) para planear los mismos cortes.

Ninguna parte sale sin gancho. El gancho en video (`gancho.js`) necesita al menos 2 momentos buenos (con puntos, dentro de la parte, sin la primera ni la ultima
unidad); cuando no los hay (Lobo en la aldea, o un juego cuyas destacadas no puntuan), `paquete.mjs` crea en su lugar una pieza `gancho-imagen` y la vuelve un **VIDEO DE IMAGEN FIJA** (28-10-2026): un video corto
(6 s, `DURACION_GANCHO_IMAGEN_S`) que repite la imagen en cada cuadro, para poder compartirlo como short de YouTube. Se genera con ffmpeg junto a los videos que se suben, con el mismo nombre en mp4
(`j1_hk1_9x16_fb-ig-tk-yt.mp4`, `j1_hk1_16x9_fb-x-yt.mp4`); **ya no se deja el PNG** (la imagen se captura en una carpeta temporal y se borra). Va en silencio (con una pista de audio vacia): la musica la pone quien lo sube.
No se graba con OBS: el LEEME lo lista antes de su parte con su vista previa y el comando para regenerarlo, y `textos/gancho-N.txt` trae el titulo y la descripcion.

- **Que dice:** «PRÓXIMAMENTE», el nombre del juego, «Juego N · Parte M de K» (N es el `jN` del paquete, no el numero de partida del archivo) y «Contenido generado por IA ·
  Proyecto independiente». La ultima parte invita a seguir «para ver el desenlace». Nunca adelanta el resultado.
- **Arte:** `ARTE_GANCHO` en `web/casino/gancho-imagen.js` da el arte por id de juego. Lobo: el panorama de la aldea (`arte/lobo/dia-asamblea-01.png`) y sus seis
  personajes en la pose de accion (el 4.o cuadro de `animacion-<rol>.png`). Un juego sin entrada lleva solo la marca (logo, texto y avisos), centrada. **Al agregar un juego,
  registrar su arte ahi** si tiene (un panorama y/o personajes que ya use la escena; no se dibuja arte nuevo solo para esto).
- **Diseno:** marca del sitio (`web/sitio.css`: Barlow Condensed e Inter locales, `--oro`, `--hueso`, `--noche`) y todo lo que se lee dentro de la zona segura del formato
  (`FORMATOS_ESCENA`: 9:16 con 285 px arriba y 420 abajo reservados). La pagina se autocomprueba (`data-fuera`: elementos fuera de la zona o con texto desbordado, debe ser 0) y
  una prueba con navegador lo verifica en 9:16 y 16:9, con y sin arte.
- **A mano:** `node herramientas/gancho-imagen.mjs --juego=lobo --numero=1 --parte=1 --de=2 --salida=<carpeta>` (necesita Chrome o Edge y ffmpeg; no llama a ningun modelo; `--duracion=S` cambia los segundos, `--imagen` deja el PNG en vez del video). Para ver la imagen en el
  navegador: `node src/servidor.js` y `http://localhost:4321/gancho-imagen.html?juego=lobo&numero=1&parte=1&de=2&formato=9x16`.
## Un texto por pieza

`textos/parte-1.txt`, `textos/clip-1.txt`, etc. contienen titulo y descripcion;
las partes tambien incluyen el comentario fijado. YouTube usa titulo y
descripcion, y las demas redes usan la descripcion. No copiar las etiquetas.

Los textos se basan en hechos visibles de la ventana y priorizan las rondas
destacadas, sin llamadas a modelos. No extraen razones, mensajes ni privados.
Un gancho identifica a los participantes y las rondas del adelanto, sin contar
el resultado. Titulo y descripcion tienen topes de 90 y 280 caracteres. Son propuestas para revisar; no se prometen textos distintos
si el registro y la pieza son identicos, ni se inventa un conflicto para variarlos.

**Todo titulo y toda descripcion empiezan igual** (decidido el 25 de octubre de 2026),
para encontrar el juego, su numero, la parte y el seed a simple vista en cualquier red:
`Guerra de territorios J3 - Parte 1/2 - Seed 1704202488`; un clip dice
`Clip 2 (Parte 1/2)` y un gancho (de video o de imagen) `Proximamente Parte 2/2`.
Lo que sigue (hecho destacado o participantes) se acota para que el identificador nunca se corte.

**Hashtags y topes (26 de octubre de 2026):** TODA descripcion generada lleva hashtags en su ultima
linea: `#IAvsIA` primero, luego los del juego (`web/casino/textos-juego.js`) y los de los modelos
que juegan (`MODELOS` en `web/casino/paquete-textos.js`; un modelo nuevo se agrega ahi), de 1 a 5.
El **titulo mide como maximo 90 caracteres** y la descripcion 280. Cuando no cabe todo en 280 se
quita primero la linea de las rondas, luego hashtags desde el final (nunca `#IAvsIA`) y por ultimo
se acota el detalle. El comentario fijado no lleva hashtags (no es el texto de la publicacion).
Una prueba (`paquete.test.js`, `produccion.test.js`) lo exige en cada pieza de cada juego.

## La frase del cierre segun la pieza

El cierre de cada video (logo, redes y pagina de resultados) dice una frase distinta
segun lo que se ve: `final` (la parte que llega al ultimo turno: invita a ver mas
juegos), `parte` (deja el juego a medias: que no se pierdan la siguiente), `clip`
(ver la partida completa) y `gancho` (estar al pendiente). La direccion de grabacion del
paquete lo trae como `cierre=parte|final|clip|gancho`; con `cierre=1` la pagina deduce
`final` o `parte` segun si la pieza llega a la ultima unidad. `narrar.mjs` narra todas
las frases de todos los tipos; si cambian o se agregan, `--solo-cierres` las suma a una voz ya generada.

Al regenerar con `--forzar`, los archivos antiguos por red y los de piezas
ausentes se apartan en `textos/anteriores/` para conservar anotaciones. Los
archivos actuales del paquete se reescriben, como antes.

## Una grabacion, con voz y sin voz conservando efectos

Las nuevas direcciones del paquete llevan `audio=separado`: narracion en el
canal izquierdo y efectos en el derecho. Es un formato de trabajo, no de subida.
La escena mantiene los mismos tiempos y subtitulos en ambas versiones.

1. OBS: fuente Navegador con audio controlado por OBS; grabacion **estereo**.
   Desactivar Mono y cualquier filtro que mezcle los canales. Evitar duplicar
   la fuente con audio de escritorio o introducir microfono en esa pista.
2. Grabar una sola maestra MKV de la hoja 4K, como indica el LEEME.
3. Ejecutar el comando de recorte del LEEME, que incluye `--audio-separado`.
4. Comprobar los cuatro archivos: `convoz`/`sinvoz` en 9:16 y 16:9. Ambas mezclas
   se oyen centradas; `sinvoz` conserva efectos al mismo nivel y omite narracion.
5. Elegir cual se publica. La otra version es alternativa, no otra subida pendiente.

```powershell
node herramientas/recortar-formatos.mjs "<serie>/originales/j1/j1_pt1.mkv" j1_pt1 "--carpeta=<serie>/por-subir/j1" --audio-separado
```

Sin la opcion, el recortador sigue funcionando con grabaciones antiguas.
Una maestra con voz y efectos ya mezclados no permite obtener la version limpia
con este procedimiento. Comprobar primero una pieza corta en OBS: una prueba
automatica de canales no verifica los ajustes de tu instalacion.

Si no hay `voz.json`, ambas versiones solo tendran efectos y se avisa. Cargar
voz no equivale a reproducirla: `--sinvoz` en el generador del paquete elimina
tambien sus tiempos, por lo que no debe usarse para preparar la version muda de
una partida narrada. Para esa version se usa el recorte por canales.

## Si en OBS desaparece o se queda pegada una parte de la pantalla (28 de octubre de 2026)

Dos grabaciones de Guerra j3 fallaron en OBS (33, Chromium 150, aceleración por hardware, 4K) y nunca en un Chrome de escritorio, y el DOM estaba bien (opacidad 1, sin la clase del zoom, `transform: none`):
(1) la cabecera con la marca y el turno, el aviso de IA, el marcador, el feed y los subtítulos desaparecieron ~27 s tras ciertas batallas; (2) al terminar el zoom el mapa se quedó con el zoom puesto y sin recorte, cubriendo la hoja.
En los dos, una animación del navegador (`animate()` con `fill: 'forwards'`) cancelada dejaba su valor viejo en el compositor de OBS. En los otros juegos no se nota porque el valor viejo coincide con el final; en Guerra no.
**Regla:** en la escena de Guerra, lo que debe quedar puesto (HUD, zoom del mapa, lo que se apaga: tarjetas, feed, subtítulos) lo mueve `web/casino/animador-estilo.js` (requestAnimationFrame, estilo en línea; el estado final lo escribe
él), sin Web Animations con `fill` ni transiciones de CSS de opacidad/transform. Una prueba lo exige (`src/pruebas/escena/hud-conquista.test.js`). Si en otro juego algo se queda pegado o invisible solo en OBS, es lo primero que hay que sospechar.
Al regrabar: «Actualizar caché de la página actual» en OBS. Si aun así falla, probar con la aceleración por hardware del navegador apagada (OBS → Ajustes → Avanzado → «Aceleración por hardware del navegador», pide reiniciar OBS).
Para diagnosticar: sacar de la grabación el brillo de la zona (ffmpeg `signalstats`) segundo a segundo, casarlo con los momentos de la partida y comparar con el DOM en una reproducción en tiempo real.

## Guion para narracion humana

`paquete-jN/guion.md` trae el texto propuesto para cada pieza en orden de
publicacion, con marcas de inicio/fin relativas al contenido. Usa la narracion
del registro y el cierre de esa pieza, nunca respuestas crudas ni razonamientos
inventados. Los ganchos solo llevan lectura del cierre.

La narradora puede ensayar contra `sinvoz` y grabarse aparte. Despues se mezcla
su toma con ese video en el editor; el programa no sustituye automaticamente
Piper por un audio humano. Si cambia el texto o necesita mas tiempo, ajustar el
montaje y los subtitulos. Las marcas del guion son una referencia, no una
obligacion de leer deprisa.

## Revisión local con marca y controles

`herramientas/ver-piloto.mjs` puede generar `REVISAR.html` para cualquier juego
desde un `revision.json` dentro de la carpeta del piloto. Usa directamente
`web/sitio.css` y las fuentes locales Barlow Condensed/Inter; la página permite
seleccionar muestra, cambiar velocidad, avanzar, retroceder y saltar al final.

```json
{
  "titulo": "Muestra de revisión",
  "descripcion": "Bots de control; sin modelos reales.",
  "muestras": [
    { "titulo": "Partida", "tipo": "escena", "url": "http://127.0.0.1:4321/escena.html?archivo=pruebas/muestra.json&formato=16x9&voz=data/voz/muestra-p1/voz.json" },
    { "titulo": "Grabación", "tipo": "video", "archivo": "revision/j1/muestra.mp4" }
  ]
}
```

```powershell
node src/servidor.js
node herramientas/ver-piloto.mjs --carpeta=grabaciones/mi-piloto --config=revision.json --generar --puerto=4324
```

Las escenas necesitan el servidor del proyecto; la barra recorre sus momentos
públicos y el retroceso reconstruye el estado sin conservar revelaciones futuras.
Buscar o pausar deja una imagen para inspeccionar; Reproducir comienza ese momento
con voz. Cambiar velocidad mientras se reproduce conserva la reproducción.
Los videos se recorren por segundos y necesitan existir previamente.
`--generar --solo-generar` escribe la página sin abrir servidor. Sin `--generar`
se conserva el HTML existente. La herramienta sirve solo la carpeta elegida y una
lista fija de recursos de marca/control; no publica el material ni crea un MP4.
