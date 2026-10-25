# Fotogramas de Lobo en la aldea

Imágenes generadas por el usuario con ChatGPT el 24 de octubre de 2026, por su pedido explícito. No provienen de un paquete de terceros.

Cada `noche-*.png` y `dia-asamblea-01.png` es un recorte rectangular de uno de esos originales, sin relleno de bordes, filtros ni redibujo. `recortes.json` conserva origen y rectángulo en píxeles. Las siete secuencias nocturnas tienen seis cuadros cada una; de la asamblea solo se usa el plano general (el cuadro 01). Las imágenes nocturnas se presentan sobre fondo negro y la asamblea sobre un degradado de amanecer. Se excluyó de los recortes de día la franja de números de referencia.

## Elenco animado (25 de octubre de 2026)

`animacion-<rol>.png` (lobo, aldeano, bruja, cazador, vidente, cupido) son tiras de 6 cuadros de izquierda a derecha, recortadas de la hoja de sprites «Hoja de sprites de fantasía pixel art.png», creada por el usuario el 25 de octubre de 2026 (no es de un paquete de terceros; el original vive en `privado/prototipos/lobo-assets/hoja-sprites-elenco-2026-10-25.png`). Reemplazan a las tiras anteriores, que no se veían bien.

Las genera `node herramientas/recortar-elenco-lobo.mjs --hoja=<ruta de la hoja>`, que también escribe `recortes-personajes.json` (de dónde sale cada cuadro) y `web/casino/lobo-personajes-animados.js` (el tamaño de cuadro de cada rol); no se editan a mano. No se redibuja ni se reescala: solo se separan los cuadros por la columna vacía más cercana a cada frontera, se descarta el velo casi invisible del fondo (alfa < 16) y cada rol comparte una ventana común. `src/pruebas/escena/elenco-lobo.test.js` comprueba que las tiras guardadas salen exactamente de la hoja original.

## Imágenes retiradas (25 de octubre de 2026)

Se borraron las que ninguna escena usa: `personaje-<rol>.png` (6, retratos fijos del elenco anterior), `entrada-anonima-01…06.png` con su `recortes-entrada.json` (la apertura usa las secuencias de noche) y `dia-asamblea-02…12.png`. Copia de respaldo local (no versionada) en `privado/papelera-imagenes-2026-10-25/`; los originales de los que se recortaron siguen en `privado/prototipos/lobo-assets/`.
