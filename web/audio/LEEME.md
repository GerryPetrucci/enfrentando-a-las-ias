# Muestras de sonido de las escenas (opcionales)

La escena de casino suena con **muestras grabadas** si estan en esta carpeta y, si no, con un **respaldo sintetizado** (WebAudio): nunca queda muda.
Esta carpeta puede estar vacia y todo funciona; las muestras solo hacen que suene mas real.

## De donde salen

Paquete recomendado: **Casino Audio de Kenney** (cartas, fichas y dados, formato OGG), publicado por Kenney bajo licencia **CC0** (dominio publico:
se puede usar y modificar sin atribucion). Esta en <https://kenney.nl/assets/casino-audio> y tambien en OpenGameArt ("54 casino sound effects").

**Antes de publicar un video, confirma la licencia en la pagina del paquete** (misma regla que con las voces: gratis no siempre significa libre para uso
comercial) y anota aqui la fecha de la revision. Los archivos de sonido no se versionan por ahora: se bajan a mano a esta carpeta.

Revision de la licencia: _pendiente_.

## Que archivo poner (nombre exacto)

Copia o renombra archivos del paquete con estos nombres. Si hay varios de un mismo efecto, la escena elige uno con el azar con seed (mismo video, mismos sonidos).

| Efecto | Archivos | Sugerencia del paquete de Kenney |
|---|---|---|
| Repartir una carta | `carta-1.ogg`, `carta-2.ogg`, `carta-3.ogg` | los de deslizar o poner carta (cardSlide, cardPlace) |
| Voltear las cartas | `voltear-1.ogg`, `voltear-2.ogg` | cardShove o cardFan |
| Ficha | `ficha-1.ogg`, `ficha-2.ogg`, `ficha-3.ogg` | chipLay, chipsStack o chipsCollide |
| Anuncio (campanilla) | `anuncio-1.ogg` | no hay en el paquete: opcional, de otra fuente CC0 |
| Duda (golpe grave) | `duda-1.ogg` | no hay en el paquete: opcional |
| Gana (sello dorado) | `gana-1.ogg` | no hay en el paquete: opcional |
| Pierde (sello rojo) | `pierde-1.ogg` | no hay en el paquete: opcional |
| Cuenta (tic del contador) | `tic-1.ogg` | no hay en el paquete: opcional |

Los efectos sin archivo siguen sonando con el respaldo sintetizado. Se apagan todos con `?sonido=0`.
