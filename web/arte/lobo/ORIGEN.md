# Fotogramas de Lobo en la aldea

Imágenes generadas por el usuario con ChatGPT el 24 de octubre de 2026, por su pedido explícito. No provienen de un paquete de terceros.

Cada `noche-*.png` y `dia-asamblea-01.png` es un recorte rectangular de uno de esos originales, sin relleno de bordes, filtros ni redibujo. `recortes.json` conserva origen y rectángulo en píxeles. De las siete secuencias nocturnas solo se usa la de la casa misteriosa (`noche-misteriosa`, seis cuadros: entra un figurante anónimo); las de cada rol se sustituyeron por `entrada-<rol>` (ver abajo). De la asamblea solo se usa el plano general (el cuadro 01). Las imágenes nocturnas se presentan sobre fondo negro y la asamblea sobre un degradado de amanecer. Se excluyó de los recortes de día la franja de números de referencia.

## Entradas a casa por rol (25 de octubre de 2026)

`entrada-<rol>-01…06.png` (lobo, vidente, bruja, cazador, cupido, aldeano) son los cuadros de la apertura «La aldea se prepara para dormir»: en la casa de cada rol entra **el personaje de ese rol** (de día, al atardecer, al anochecer, entra, ya dentro y puerta cerrada). Salen de las seis hojas que el usuario creó con ChatGPT el 24 de octubre de 2026 (16:55; no son de un paquete de terceros) y que viven en `privado/prototipos/lobo-assets/entrada-<rol>.png` (lobo = `…04_55_29 p.m-1`, cupido = `-2`, cazador = `-3`, aldeano = `-4`, vidente = `-7`, bruja = `-10`). Reemplazan a las secuencias `noche-<rol>-0N.png`, donde entraba siempre el mismo personaje genérico (retiradas el 25 de octubre; copia local no versionada en `privado/papelera-imagenes-2026-10-25/casas-por-rol/`).

Las genera `node herramientas/recortar-entradas-lobo.mjs`, que también escribe `recortes-entradas.json` (de dónde sale cada cuadro); no se editan a mano. No se redibuja ni se reescala: solo se separan los 6 cuadros de cada hoja por la columna con menos dibujo más cercana a cada frontera, se descarta el velo casi invisible del fondo (alfa < 16) y cada rol comparte una ventana común. Donde la hoja pone las casas pegadas y el corte atraviesa hierba o cerca, el alfa se difumina 10 px junto al corte para que la orilla no quede recta (los colores no se tocan). `src/pruebas/escena/entradas-lobo.test.js` comprueba que los PNG guardados salen exactamente de las hojas originales. Las otras cuatro hojas de la carpeta del usuario (una niña de lazo rojo, un encapuchado con dagas, un tabernero y un mago de esfera azul) no tienen rol en el juego y no se usan.

## Elenco animado (25 de octubre de 2026)

`animacion-<rol>.png` (lobo, aldeano, bruja, cazador, vidente, cupido) son tiras de 6 cuadros de izquierda a derecha, recortadas de la hoja de sprites «Hoja de sprites de fantasía pixel art.png», creada por el usuario el 25 de octubre de 2026 (no es de un paquete de terceros; el original vive en `privado/prototipos/lobo-assets/hoja-sprites-elenco-2026-10-25.png`). Reemplazan a las tiras anteriores, que no se veían bien.

Las genera `node herramientas/recortar-elenco-lobo.mjs --hoja=<ruta de la hoja>`, que también escribe `recortes-personajes.json` (de dónde sale cada cuadro) y `web/casino/lobo-personajes-animados.js` (el tamaño de cuadro de cada rol); no se editan a mano. No se redibuja ni se reescala: solo se separan los cuadros por la columna vacía más cercana a cada frontera, se descarta el velo casi invisible del fondo (alfa < 16) y cada rol comparte una ventana común. `src/pruebas/escena/elenco-lobo.test.js` comprueba que las tiras guardadas salen exactamente de la hoja original.

## Imágenes retiradas (25 de octubre de 2026)

Se borraron las que ninguna escena usa: `personaje-<rol>.png` (6, retratos fijos del elenco anterior), `entrada-anonima-01…06.png` con su `recortes-entrada.json` (la apertura usa las secuencias de noche) y `dia-asamblea-02…12.png`. Copia de respaldo local (no versionada) en `privado/papelera-imagenes-2026-10-25/`; los originales de los que se recortaron siguen en `privado/prototipos/lobo-assets/`.
