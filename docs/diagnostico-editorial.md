# Medir antes de grabar

La herramienta de diagnostico usa la misma linea de tiempo y los mismos tiempos
de voz que la escena. No llama modelos, no escribe archivos y no cambia paquetes.

```powershell
node herramientas/diagnostico-editorial.mjs --archivo=SERIE.json
node herramientas/diagnostico-editorial.mjs --archivo=SERIE.json --partida=1 --objetivo=90
node herramientas/diagnostico-editorial.mjs --archivo=SERIE.json --partida=1 --voz=data/voz/SERIE-p1/voz.json
node herramientas/diagnostico-editorial.mjs --archivo=SERIE.json --sinvoz --json
```

`--archivo` se resuelve dentro de `data/`. Sin `--partida` analiza todas las del
archivo y busca la voz de cada una en su carpeta habitual. Una voz explicita
requiere elegir partida. `--sinvoz` mide solo minimos de pantalla; no equivale a
una grabacion narrada. Los audios cuyo texto ya no coincide se ignoran y avisan.

El informe muestra tiempo por tipo de momento, partes actuales y ventanas de
unidades completas para un objetivo editorial configurable (90 s por omision).
No afirma limites actuales de ninguna plataforma ni predice retencion.
Cada ventana incluye el cierre que realmente le corresponde, con su voz si
existe. La duracion de grabacion ademas cuenta negros y fundidos de OBS.

Una unidad que sola excede el objetivo queda marcada. No se recorta una jugada,
se acelera la narracion ni se oculta el resultado para hacerla caber. Las ventanas
mantienen todas las unidades en orden y solo la primera lleva el intro original;
el contexto de las siguientes necesita revision editorial.

Las ventanas son **propuestas para revisar**, con URLs de vista previa. No son un
nuevo paquete aprobado: `paquete.mjs`, nombres, textos y politica de publicacion
siguen usando dos partes. No informar ventanas como partes subidas de ese paquete.
Antes de adoptar otra division hay que integrar y revisar ese flujo completo.

Los informes de partidas ineditas se guardan en `privado/` si se quiere conservar
la salida. Nunca subirlos como documentacion publica.
