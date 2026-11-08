# Contrato para incorporar un juego

El alcance actual es Lobo en la Aldea. Esta guía conserva el contrato de la arena
para extensiones expresamente autorizadas; no autoriza agregar juegos por cuenta propia.

Un juego exporta `id`, `nombre`, `categoria`, `jugadores`, `versionReglas`,
`reglas`, `formatoRespuesta` y estas funciones:

| Función | Contrato |
|---|---|
| `crear(rng, opciones)` | Estado inicial; recibe el número de jugadores y opciones. |
| `terminado(estado)` | Indica cuándo acaba la partida. |
| `vista(estado, i)` | Solo la información que puede conocer ese asiento; texto u objeto. |
| `normalizar(respuesta, estado)` | Maneja respuestas inválidas sin tumbar la partida. |
| `aplicar(estado, jugadas, rng)` | Valida acciones, resuelve la fase y devuelve su registro. |
| `resultado(estado)` | Puntos, ganadores, empate y métricas desde el estado final. |

Referencia concreta: `src/juegos/lobo.js`, `src/juegos/lobo/` y sus pruebas.
Los bots se registran en `juego.bots`: `{ nombre, color, fn(estado, asiento, rng) }`.
Una IA solo recibe `vista`; nunca modifica el estado. Todo azar usa el RNG con seed.

Extensiones comunes: `activos(estado)` evita consultar asientos inactivos;
`minJugadores`/`maxJugadores` acotan la mesa; `rondas` fija la guardia de terminación;
`mismoSeedEnSerie` permite conservar un mundo en una serie pedida por el usuario;
`limiteLlamadasDuro` reserva una fase entera antes de consultar modelos.
`opcionesDeAgentes` aporta datos de presentación al estado inicial.
`evaluar(partidas)` puede producir un resumen sin modificar las partidas.

El registro conserva errores de API por asiento. La arena añade `errores` si
el juego no lo hace. Lobo registra una fase por entrada y una ronda en varias fases:
`src/publicacion.js` cuenta la ronda para recortar la publicación y excluye los
roles, acciones privadas, errores y cámaras mientras falta la parte final.

## Reglas y prompts

Leer el spec antes de cambiar reglas. Aplicar la lista de verificación completa
de `docs/guia-de-prompts.md`: cifras, orden de fases, visibilidad, estado, sintaxis,
errores y formato campo por campo con ejemplos inventados que no se deben copiar.
Versionar reglas y prompt; no subir topes de tokens sin orden.

Para examinar el formato de Lobo sin una partida entera:

```powershell
node herramientas/examen-modelos.mjs --juego=lobo --modelos=haiku,glm-flash --archivo=CATALOGO.json
```

Sin `--ejecutar` solo estima. La llamada real exige autorización y un tope en dólares.
`--sistema=privado/spec/BORRADOR.txt` y `--reemplazar="viejo=>nuevo"` prueban variantes
en memoria. Los escenarios actuales son noche y día con ocho asientos; aún no
reconstruyen los prompts de una partida guardada de Lobo.

## Escena, publicación y videos

Registrar solo juegos aprobados en `src/juegos/index.js`; añadir su escena en
`web/casino/lineas.js` y textos públicos en `web/casino/textos-juego.js`.
La web no importa `src/` ni `herramientas/`. La portada solo anuncia juegos
con partidas publicadas en `data/publicas/`, después de regenerar el marcador.

Usar `web/paleta.js`, fuentes locales y tokens de marca. En 9:16 todo queda
dentro de la zona segura de `herramientas/formatos.mjs`: 285 px arriba, 420 abajo
y 130 a cada lado. Añadir el layout a las pruebas de zona segura y comprobar
capturas reales antes de afirmar una mejora visual.

Toda parte lleva gancho: cortes si hay al menos dos momentos puntuados; si no,
un video de imagen fija de seis segundos con su `jN`, parte y etiqueta de IA.
Registrar el arte en `ARTE_GANCHO` de `web/casino/gancho-imagen.js`.
Los sonidos son grabaciones CC0 documentadas en `web/audio/LICENCIAS.txt`.

Los IDs `cierre-N` se reservan al cierre del video. No confundirlos con el cierre
de una ronda. Ver `docs/produccion-videos.md` para identificación, voz, hashtags,
límites de texto y bloques copiables del LEEME.

Pruebas: primero las afectadas y después toda la suite aplicable con bots/mocks.
Solo una partida por corrida, `--partidas=1`, salvo petición de serie.
