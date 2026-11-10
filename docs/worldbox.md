# Arena WorldBox: núcleo Node y simulador

Node 20+, ES modules, sin dependencias ni build. Este núcleo permite probar una
competencia completa sin WorldBox ni API. **El simulador no reproduce WorldBox**:
todos sus registros indican `origen: "simulado"`. El juego real se conecta mediante un mod que implementa
[el protocolo v1](worldbox-protocolo.md) (`worldbox-puente/`, ya cargado en WorldBox 0.51.2 y
probado en vivo) y se juega con el reglamento versionado [`docs/worldbox-reglas.md`](worldbox-reglas.md)
(`rules_version=auge-real-1.1.0`). Este documento describe el motor y el simulador; el reglamento del
juego real, sus cifras medidas y su puntuación viven en el otro.

**Formato «era» (E4, 8-11-2026):** segundo reglamento, `era-1.0`, con borrador por etapas, muro central que cae en el año 500 y guerra por regla; vive en `src/worldbox/era/` y se activa con `--formato=era`. No cambia nada de lo que sigue: `auge-real-1.1.0` sigue siendo el reglamento por omisión. Reglas completas, costos, comandos y costos de API: [`docs/worldbox-era.md`](worldbox-era.md). **Práctica y grabación manual** (respuestas pegadas de tus chats, repetir partidas, tamaños de mapa, comentar en vivo): [`docs/worldbox-era-practica.md`](worldbox-era-practica.md).

Qué hay: `correr.js` (CLI), `orquestador.js` (ciclo de turnos), `reglas.js` (perfiles `simulado`, `real` y
`generico`), `contrato-acciones.js` (validador), `adaptador*.js`, `pasarela.js` (modelos), `bots.js`,
`puntuacion.js`, `telemetria.js`, `reporte.js`, `auditar.js` (auditoría y replay desde el log) y
`estimar-costo.js` (costo con modelos reales sin llamar a ninguna API).

## Ejecutar una partida sin API

Desde la raíz del repositorio:

```powershell
node src/worldbox/correr.js --adaptador=simulado --participantes=bot-voraz,bot-aleatorio --semilla=7 --turnos=5 --presupuesto=0 --partidas=1 --salida=data/pruebas/worldbox
```

Siempre escribir `--partidas=1`; el valor predeterminado también es uno. Solo una
solicitud expresa de varias partidas justifica cambiarlo (con varias, la semilla es la misma
y rota el orden de actuación). Hay cinco bots: `bot-pasivo` (siempre espera), `bot-aleatorio`,
`bot-voraz`, `bot-expansionista` y `bot-roto`. El roto falla de cuatro maneras (JSON roto, acción
fuera de lista, tipo equivocado, demasiadas acciones) para comprobar los descartes. El aleatorio
usa RNG con semilla y genera parámetros válidos para cualquier acción que el adaptador anuncie.
En el simulador el voraz acumula y funda; en el juego real el voraz es agresivo (poderes contra
el rival y guerra en cuanto el reglamento lo permite) y el expansionista crece sin atacar
(unidades, donaciones, bendiciones). Los bots del juego real respetan puntos, cooldowns y topes,
de modo que no suman infracciones. Ninguno llama modelos. Se admiten entre dos y cuatro
participantes, incluidos bots repetidos con identificadores de facción distintos (`f1`, `f2`…).

### Partida completa contra el WorldBox real (sin API)

Con el juego abierto y el mod cargado (`worldbox-puente\integracion.ps1 abrir|reiniciar`; el
token está en `%USERPROFILE%\AppData\LocalLow\mkarpenko\WorldBox\puente-token.txt`):

```powershell
$env:WORLDBOX_PUENTE_URL = 'http://127.0.0.1:47600'
$env:WORLDBOX_PUENTE_TOKEN = (Get-Content -Raw "$env:USERPROFILE\AppData\LocalLow\mkarpenko\WorldBox\puente-token.txt").Trim()
node src/worldbox/correr.js --adaptador=http '--participantes=bot-voraz,bot-expansionista' --partidas=1 --salida=data/pruebas/worldbox
```

Con `--adaptador=http` el reglamento predeterminado es el real (`--reglas=real`): 2 facciones
`human`, 24 turnos de 50 s de juego a x10, mapa de 192 casillas, 3 acciones y 4 puntos por turno,
timeout de puente de 60 s. Dura unos 100 s reales. Cada valor se puede sobrescribir con `--turnos`,
`--segundos-turno`, `--acciones`, `--puntos-turno`, `--mapa`, `--velocidad`, `--plantilla`,
`--unidades-iniciales`, `--especie`; `--reglas=generico` admite cualquier puente de prueba y
`--reglas=simulado` es el del simulador. **No imprimir ni guardar el token.**

```powershell
node src/worldbox/auditar.js data/pruebas/worldbox/<corrida> --replay   # coherencia + repetición turno a turno, solo desde el log
node src/worldbox/estimar-costo.js data/pruebas/worldbox/<corrida> --modelo=id,entrada,salida[,cache] --salidas=500,2000,6000
```

`auditar.js` no vuelve a jugar: comprueba hashes de observación y de estado, campos de la
telemetría, puntos recalculados, costos, que `reporte.json` sea exactamente el reconstruido y que
cada prompt enviado se reconstruya idéntico (si la versión del prompt es la del código); sale con
código 1 si algo no cuadra. `estimar-costo.js` reconstruye el prompt exacto de cada decisión del
log de una corrida con bots, lo mide (3,5 bytes por token, supuesto declarado) y calcula el costo
de una competencia con modelos reales a partir de precios en USD por millón que el usuario pasa;
no llama a ninguna API ni lee `.env`.

Cada ejecución escribe en una carpeta nueva `<competition_id>-<partida>`:

- `eventos.jsonl`: configuración inicial, decisiones, cierres de turno y final (fuente de verdad).
- `reporte.json`: resultado, ranking, resumen por modelo y resultados por turno.
- `turnos.csv`, `modelos.csv`, `ranking.csv`, `decisiones.csv`.

La salida predeterminada `data/pruebas/worldbox/` está ignorada por git. Escribir
reportes no publica resultados en el sitio. Los registros existentes no se
sobrescriben. Una partida incompleta conserva ranking y motivo; su turno parcial
aparece con `completo=false`. Un arranque fallido (configuración inválida, puente
inalcanzable, token incorrecto) no deja carpeta de corrida. No se genera voz ni paquete de
video para bots.

### Grabar la partida en video

`--grabacion` (con `--adaptador=http` o el simulador) pone el ritmo de video: cuenta atrás, velocidad `x1`, pausa de lectura tras cada
decisión (o un Enter por decisión con `--manual`), cámara e interfaz del juego si el puente las anuncia, y el estado en vivo en
`data/vivo/worldbox.json` para la fuente de navegador de OBS. Es solo presentación: reglas, prompt y puntuación no cambian. Pasos
de OBS, comandos y el esquema del estado: `docs/worldbox-grabacion.md`.

## Reglas congeladas: Auge de reinos simulado 1.0.0

`rules_version=auge-simulado-1.0.0`, `prompt_version=worldbox-1.2.0` (la 1.1.0 separó los puntos
de acción del tope de acciones, generó la fórmula de puntos desde la tabla de pesos y añadió el
reglamento del juego real; la 1.2.0 describe la configuración efectiva del escenario; todavía no se ha jugado con modelos). El catálogo versionado está en `src/worldbox/catalogo-acciones.json`;
sus acciones propias del simulador llevan `simulada: true`. Cambiar mecánicas, cifras,
observación o prompt exige revisar y versionar el contrato.

Mundo compartido discreto, sin distancias ni adyacencia. Mapa predeterminado: 64
celdas; configurable de 12 a 10 000. Semilla entera de 0 a 2 147 483 647 (con signo de 32 bits, no negativa: el mismo rango que valida el puente). Cada
facción empieza con 20 pobladores, 1 ciudad, 3 celdas, 20 recursos y 0 objetivos.
La asignación inicial es idéntica y no depende de la semilla ni del asiento.

Duración predeterminada: 20 turnos estratégicos (configurable de 1 a 10 000). En
cada turno se congelan todas las observaciones antes de ejecutar acciones. Se
reciben entre una y K acciones por facción, K=3 por defecto (1–10), con K puntos
de acción por turno. Los puntos y los espacios son límites diferentes. La primera
facción rota cada turno y entre partidas: desplazamiento
`(índicePartida + turno - 1) % númeroParticipantes`. El índice de partida empieza
en cero. Las propuestas conservan el orden del array de cada facción.

| Acción | Parámetros exactos | Puntos | Recursos | Efecto | Cooldown |
|---|---|---:|---:|---|---:|
| `esperar` | `{}` | 0 | 0 | Ninguno | 0 |
| `recolectar` | `{}` | 1 | 0 | +8 recursos | 0 |
| `expandir` | `{"cantidad":1}` (entero 1–3) | 1 | 6 por celda | Ocupa esa cantidad de celdas libres | 1 |
| `fundar` | `{}` | 2 | 15 | +1 ciudad, +1 objetivo; requiere territorio > ciudades | 2 |
| `reclutar` | `{}` | 1 | 5 | +3 pobladores | 1 |
| `atacar` | `{"objetivo":"f2"}` (cadena 1–40) | 2 | 8 | Rival −4 pobladores, atacante −2; requiere atacante con ≥5 y rival vivo distinto | 2 |

Cooldown positivo C: una acción ejecutada en T vuelve a estar disponible en
T+C+1. Cooldown cero permite repetirla incluso dentro del mismo turno. Solo
acciones aceptadas (`ejecutada` o `sin_efecto`) consumen puntos y activan cooldown; una
rechazada no cuesta nada salvo su infracción. Nunca se ajustan cantidades
automáticamente ni se ejecuta una orden parcialmente.

Un rival con población cero queda eliminado, pierde ciudades y territorio, libera
celdas y deja de producir/actuar. Conserva recursos y objetivos acumulados. No hay
conquista automática ni resurrección. El mínimo de población es cero.

Al terminar las acciones, el simulador avanza una unidad:

1. Sortea un evento común, uniforme entre −2, 0 y +2 recursos, con `src/rng.js`.
2. Cada facción viva suma `2*ciudades + territorio + evento` recursos, mínimo cero.
3. Cada facción viva suma `ciudades` pobladores.
4. Reinicia puntos disponibles y comprueba supervivencia y límite de turnos.

No hay consumo, hambre, límite de población, objetivos secretos ni otros eventos.
Las construcciones y conquistas del turno cuentan ya en ese avance. Al quedar
como máximo una facción viva o alcanzar el límite termina la partida. Gana quien
obtenga más puntos; sobrevivir aporta puntos, no sustituye al criterio de ranking.

```text
puntos = (vivo ? 100 : 0) + población + 5*territorio + 0.1*recursos
         + 20*objetivos - 5*infracciones
```

Redondeo a una decimal. Ciudades no puntúan directamente. Desempate por población,
luego territorio; si persiste, comparten puesto (el id solo estabiliza el orden de
presentación). Estado inicial sin infracciones: 137 puntos. Eficiencia = puntos/USD;
con costo cero es `null`, no infinito. Robustez = desviación poblacional de la
puntuación media por semilla; requiere al menos dos semillas distintas, en otro
caso `null`. `resumirCompetencia(reportes)` calcula esta medida entre reportes,
conservando las partidas incompletas. Repetir una semilla no cuenta como otra.

## Respuesta, validación y penalizaciones

```json
{"actions":[{"action":"esperar","parameters":{}}],"reasoning_summary":"Ejemplo inventado; no copiar decisiones."}
```

Campos obligatorios sin extras. `actions`: array de 1 a K objetos con exactamente
`action` y `parameters`; nombres y parámetros del catálogo habilitado, todos los
parámetros obligatorios, con su tipo y rango. `reasoning_summary`: cadena de 0 a 240
caracteres, justificación breve. No se solicita ni almacena razonamiento privado extenso.
Se rechaza texto antes o después del JSON; lo único que se tolera es que **todo** el JSON venga
dentro de un único bloque de código ``` (los modelos lo hacen por costumbre).

Política determinista, la misma para todos los participantes:

| Situación | Qué se ejecuta | Infracción (−5) |
|---|---|:--:|
| JSON roto, esquema de respuesta incorrecto, respuesta cortada por longitud o vacía, más de K acciones (**contenido: no se reintenta**) | `esperar` (se pierde toda la decisión) | 1 |
| Una acción fuera de la lista, con parámetros inválidos, en cooldown, sin puntos, o con un `objetivo` que no es un rival vivo | esa acción se sustituye por `esperar`; las demás se siguen evaluando; **no llega al puente** | 1 por acción |
| El adaptador/juego rechaza una acción válida (recursos, sin espacio…), o el puente contesta `400 solicitud_invalida` a una orden | nada; la siguiente se evalúa | 1 por acción |
| Fallo técnico: proveedor caído, tiempo agotado, límite de peticiones, 5xx, red, error del proveedor a media respuesta, circuito abierto (**se reintenta de forma limitada**) | `esperar` | **0** |
| Corte de seguridad: presupuesto, tokens o tiempo agotados | la partida se detiene, queda incompleta | **0** |

`esperar` es la acción nula del orquestador: **nunca se envía al adaptador**. Cada decisión
registra `acciones_invalidas` (descartadas por Node) y `acciones_rechazadas` (rechazadas por el
juego); el reporte las suma junto con `turnos_sin_respuesta` (decisiones sin jugada propia).

Las vistas tienen orden estable: `origen`, `turno_juego`, `tiempo_juego_s`,
`faccion`, `rivales`, `mundo`. Cada facción muestra `id`, `vivo`, `poblacion`,
`ciudades`, `territorio`, `recursos`, `objetivos`, `cooldowns`. Los cooldowns indican
el primer turno disponible. Rivales se ordenan por id (por unidades de código, no por
locale). Con el juego real se añaden, tras los obligatorios y en orden fijo, `especie`, `ejercito`,
`edificios`, `comida`, `salud_media_pct`, `rey_vivo` y, solo en la facción propia, los contadores
`unidades_creadas` / `unidades_creables_restantes` (si el puente no los entrega no se inventan). Mundo
muestra `tamano_mapa` y `libres`. Se descartan campos adicionales del
adaptador y se rechaza una vista ambigua (ids repetidos, la propia facción entre los
rivales). La huella `observation_hash` es SHA-256 del JSON canónico, con claves ordenadas
recursivamente. Las vistas difieren por la facción propia, no por la cantidad de información.

No se muestran RNG interno, eventos futuros, decisiones actuales de rivales,
mensajes privados ni historial. Los rechazos se registran pero no se agregan a la
siguiente observación. El prompt (`src/worldbox/prompt.js`) sigue `docs/guia-de-prompts.md`:
reglas con cifras, orden del turno, cada acción con sintaxis y esquema exacto, cómo leer el
estado, formato de respuesta campo por campo con ejemplo de valores inventados y errores
frecuentes; se genera con las acciones realmente habilitadas, sin acentos, y el texto de
sistema es idéntico para todos los participantes (`sistema_hash` único por corrida). Las
cifras se verifican con pruebas contra el motor. **No se ha evaluado con modelos reales**;
antes de un piloto falta la comparación de variantes sobre prompts reales.

## Límites y pasarela

Opciones adicionales: `--acciones=3`, `--mapa=64`, `--max-tokens=1000000` (consumo
total por partida), `--tiempo-ms=300000`, `--timeout-ms=30000`, `--timeout-puente-ms=5000`.
El tope común de salida por llamada se importa de `src/parametros.js`; no se aumenta. Se
conservan los parámetros del cliente compartido y su selección de razonamiento por modelo.

Los modelos reales requieren **ambos** `--modelos=id-proveedor/modelo,...` y
`--modo=pago`, también para modelos gratuitos. Sin esa bandera se rechaza la
ejecución antes de importar el cliente, y la pasarela real se niega a construirse. Los
identificadores deben ser IDs completos, no alias del registro. Los bots no importan
`src/modelos.js`, no leen `.env` y no hacen red. Las credenciales las administra el
cliente existente (`llamarModelo`, que exige además `exigirModoPago`); el núcleo no tiene un
segundo cliente de OpenRouter.

El uso real requiere además presupuesto positivo y tarifas explícitas en USD por
millón de tokens: `--tarifa-entrada=... --tarifa-salida=...`. **No son tarifas
incorporadas ni verificadas por este módulo**. Deben cubrir todos los modelos y
la ruta de proveedor elegida. El presupuesto por modelo se configura con
`--presupuesto-modelo=...`; por defecto, presupuesto total/número de participantes.
Se comparte la cuenta de gasto entre partidas cuando se solicitan varias.

Antes de cada intento la pasarela reserva `(bytesUTF8(prompt)+256)*tarifaEntrada`
más `maxTokens*tarifaSalida`, dividido entre un millón. Rechaza la llamada (sin esperar al
limitador) si no cabe en el presupuesto global o del modelo, o en el límite de tokens
restante. El proveedor puede cobrar más que esa cota si las tarifas están equivocadas:
se registra el costo completo y se detiene con `presupuesto_excedido`; no es una
garantía de facturación del proveedor. Se recomienda un límite de crédito externo
para uso real. No se realizó ninguna llamada pagada para validar este núcleo.

Usa `usage.cost` reportado (incluido cero); si falta, estima por tokens y tarifas.
Sin respuesta/uso conserva la reserva como costo estimado y los tokens máximos,
sin fingir que el intento fue gratis. Las decisiones suman todos sus intentos y el
costo es `estimado` si algún intento lo fue. Rate limit predeterminado: 20/minuto mediante
`src/limitador.js`. Un reintento predeterminado; máximo configurable en API: tres, **solo para
fallos técnicos** (429, 5xx, red, error del proveedor a media respuesta). El contenido inválido (JSON
roto, respuesta cortada por `max_tokens` o vacía, esquema de respuesta incorrecto) **no se reintenta**:
la decisión se pierde con su infracción. Circuito por modelo: abre tras tres fallos técnicos (el
contenido inválido no lo cuenta: el proveedor sí contestó), se puede probar de nuevo después de 30 s.
La traza privada guarda el texto de **cada** intento (hasta 20 000 caracteres) y el nivel de
razonamiento que el trabajador aplicó de verdad (`razonamiento_efectivo`).

El cliente compartido no admite AbortSignal. La llamada real se aísla en un
worker, que se termina al vencer el plazo. No se reintenta un timeout: el proveedor
podría seguir cobrando aunque se cierre la conexión. Los intentos técnicos (429, 5xx, red)
se contabilizan y se limitan. Los IDs de solicitud al modelo son locales: el cliente compartido
todavía no devuelve el id/proveedor de ruta (los de solicitud al puente sí se registran).

## Adaptadores, catálogo y reproducibilidad

Interfaz: `info`, `reiniciarEscenario`, `observar`, `ejecutar`, `avanzar`,
`estadoTerminal`, `cerrar`. `comprobarAdaptador(a)` comprueba métodos y capacidades
(obligatorias: `reiniciar`, `avanzar`, `terminal`, `multi_faccion`; **`semilla` es opcional**);
con `{escenario}` además reinicia, observa, avanza y comprueba terminal (esta variante
modifica el escenario de prueba). Errores del puente no se reintentan fuera del cliente
HTTP; se conserva el último estado confirmado y un final incompleto. El estado terminal
confirmado (`estadoTerminal`) manda sobre el `terminal` de `avanzar`.

**Catálogo de acciones.** La lista blanca de una competencia es `esperar` (siempre, local)
más:

- *Simulador:* solo las acciones del catálogo con `simulada: true`, anunciadas con
  `verificada: true` y esquema **idéntico**.
- *Juego real, reglamento `real` (`auge-real-1.1.0`, el predeterminado con `--adaptador=http`):*
  lista **cerrada** de siete acciones (`src/worldbox/reglas.js`, tabla en
  [`worldbox-reglas.md`](worldbox-reglas.md)). Una acción se habilita solo si el puente la anuncia
  `verificada: true` y con EXACTAMENTE el esquema de parámetros del reglamento; costos,
  cooldowns, restricciones (`desde_turno`, `max_por_partida`, `acumulado`, `tope_grupo`) y texto
  son los del reglamento. Lo no listado, no verificado o marcado «EN PRUEBA» no existe, y las
  acciones del simulador no se habilitan por HTTP.
- *Puente de prueba, reglamento `generico` (`puente-observacion-1.0.0`, `--reglas=generico`):*
  exactamente las acciones que el puente anuncie con `verificada: true`, con su nombre,
  descripción y esquema; costo en puntos y cooldown los que anuncie (campos opcionales `puntos`
  0–100 y `cooldown` 0–1000) o 1 y 0. El mod sigue validando por su cuenta.

El orquestador lleva los cooldowns de cada facción entre turnos (el juego real no los calcula) y
cuenta los usos **ejecutados** para los topes de la partida; ambos se le muestran a la facción en
`estado_orquestador`. `puntos por turno` (4 en el juego real) es independiente de `acciones por
turno` (3): una acción de 3 puntos deja 1 para otra de 1.

**Reproducibilidad (hallazgo de la inspección del binario, W2).** El motor Node **no promete
determinismo del juego real**: `Randy.resetSeed` existe, pero `MapBox.Update` vuelve a sembrar
y la generación elige su propia semilla, y hay ejecución paralela. Por eso:

- `info.determinista` es `true` solo para el simulador (misma semilla + mismos bots = mismo
  `hash_final`, probado); `false` si el puente declara `semilla:false`; `'desconocido'` si
  declara `semilla:true` (Node no puede comprobar la trayectoria completa). Si el adaptador
  informa haber usado una semilla distinta de la pedida, la partida queda `determinista:false`.
- El evento `inicio` y el reporte registran `escenario`: `escenario_id`, `hash_mundo` (del
  puente), `semilla_pedida`, `semilla_usada` (si la informa) y `hash_estado_inicial` (SHA-256
  del estado terminal confirmado tras reiniciar). Con ellos se audita si dos partidas
  comenzaron igual, sin suponerlo.

HTTP admite únicamente `http://127.0.0.1:puerto/`, sin credenciales, rutas base,
redirecciones ni DNS. Recibe `WORLDBOX_PUENTE_URL` y `WORLDBOX_PUENTE_TOKEN` del entorno; si
faltan, `correr.js` las toma del `.env` **solo con `--adaptador=http` o `--modelos`** y
únicamente las claves `WORLDBOX_*` (nunca llaves de proveedores). `WORLDBOX_PRESUPUESTO_USD`
es el presupuesto alternativo al argumento. Timeout HTTP predeterminado: 5 s
(`--timeout-puente-ms`), un reintento, circuito tras tres fallos durante 30 s. Cuerpos de
hasta 1 MB y toda respuesta debe declarar `protocolo:1`. Toda repetición de una mutación
conserva `id_solicitud`; el mod mantiene su caché idempotente. No se ha demostrado
compatibilidad con la ejecución dentro de ninguna instalación real de WorldBox.

## Trazabilidad

Un evento `decision` contiene los 23 campos de la sección 8 del plan (identificadores,
versiones, `observation_hash`/`observation`, `request_id`, `latency_ms`, `action_raw`,
`action_validated`, `execution_result`, tokens, `cost`/`cost_source`, `score_delta`,
`world_snapshot_ref`, `error_type`, `retry_count`, `timestamp`); la telemetría **se niega a
escribir** un evento incompleto o con tipos imposibles. Además guarda `sistema_hash` y
`prompt_hash` (huellas del texto enviado, no el texto), `snapshot` (estado confirmado al que
apunta `world_snapshot_ref`), `intentos`, `penalizaciones`, `acciones_invalidas` y
`acciones_rechazadas`, `orden`, `usos`, `estado_orquestador` (cooldowns y restricciones que vio la
facción), `razonamiento_efectivo`, `anomalias` (p. ej. una respuesta sin `efecto.creadas`) y, en cada
orden ejecutada, el `efecto` ACOTADO de la respuesta del puente (solo escalares: «pedí 5, se crearon 1»)
y el `id_solicitud` que viajó al puente; el cierre de turno guarda `avance` (segundos pedidos, tiempo de
juego e `id_solicitud`). `score_delta` mide el cambio inmediato por decisión e infracciones; el
crecimiento posterior aparece en el cierre de turno. El evento `inicio` guarda versiones
(`rules_version`, `prompt_version`), capacidades, acciones habilitadas, límites, la tabla de pesos, la
información del juego (`build_steam`, `unity`) y la **configuración efectiva** del escenario
(`efectiva`: especies, unidades iniciales, velocidad, plantilla, tamaño; lo que el puente confirmó, no
los valores por omisión; si difiere de lo pedido la partida no empieza). Sin tokens ni secretos. Las trazas
usan IDs/timestamps reales: el hash reproducible es el del estado final, no el del JSONL.

`auditar.js` **reproduce cada decisión**: revalida `action_raw` con el validador y el catálogo de su
`rules_version`, contrasta `action_validated`, infracciones, usos, cooldowns y restricciones mostradas con lo
registrado, vincula `model_id` con el participante y reconstruye el prompt con la configuración efectiva.
Alterar la respuesta original, una acción validada o la identidad del modelo da `ok:false` con el motivo.

```js
import { leerTelemetria } from './src/worldbox/telemetria.js';
import { reconstruirReporte, escribirReporte } from './src/worldbox/reporte.js';
const eventos = await leerTelemetria('data/pruebas/worldbox/MI-CORRIDA/eventos.jsonl');
await escribirReporte(reconstruirReporte(eventos), 'data/pruebas/worldbox/reconstruido');
```

Reconstrucción exacta del reporte sin simulador ni API. Si falta `fin`, marca
`registro_interrumpido` y usa el último snapshot completo. Una línea JSONL truncada falla
(`registro_corrupto`); no se ignora corrupción. Errores de configuración o inicialización
previos al primer estado válido se rechazan sin inventar datos. No se registran cabeceras,
variables de entorno ni errores crudos del proveedor. Los CSV escapan comillas y neutralizan
fórmulas. El reporte incluye `determinista`, `escenario`, `equidad` (textos de sistema
distintos: debe ser 1), `consumo`, y por participante: fallos, turnos sin respuesta, acciones
inválidas/rechazadas, reintentos, tokens, costo y puntos por dólar.

## Criterios del MVP (plan, sección 13): qué está hecho y qué sigue PENDIENTE

| Criterio del plan | Estado |
|---|---|
| Dos o más participantes completan una competencia con el mismo contrato | **Hecho con bots** (26 partidas completas contra el WorldBox real y el simulador). **PENDIENTE con dos modelos reales:** no hay ninguna competencia con modelos; falta la **orden de gasto** del usuario (presupuesto y tarifas). |
| El escenario se puede reiniciar y repetir con configuración registrada | **Reiniciar: hecho. Repetir el MISMO escenario inicial: NO existe.** El juego no controla el mundo con la semilla (`capacidades.semilla:false`, medido): cada reinicio genera otro mapa. Se **acepta como cambio de alcance** de este criterio (el plan suponía repetición); la sustituyen la auditoría por `hash_mundo`/`hash_estado_inicial`/`calidad_sitio`, la regla de mundo equilibrado y varias partidas. Restaurar un mismo guardado (`SaveManager.loadMapFromBytes`) sigue como mejora futura sin probar. |
| Acciones inválidas y fallos de API no rompen el proceso | Hecho (pruebas con mocks; con el puente real, las órdenes inválidas); los fallos reales de proveedores no se han probado con API. |
| Cada decisión queda trazada y auditable | Hecho: telemetría de 23 campos más la traza ampliada; `auditar.js` reproduce cada decisión desde el log. |
| Puntuación final y costo/consumo por modelo | Puntuación hecha; el consumo es 0 con bots y **solo estimado** con modelos reales (`estimar-costo.js`). |
| Documentación suficiente para repetir una competencia | Este documento, `worldbox-reglas.md` y `worldbox-protocolo.md`; falta validarla con una competencia con modelos. |

## Pruebas

```powershell
node --test src/pruebas/worldbox/
```

`index.js` (que importa también `era-reglas.test.js`, `era-orquestador.test.js` y `era-cortes.test.js` del formato era) permite ese comando de directorio (en Node 22+ un directorio se resuelve a su
`index.js`); la suite global descubre los `*.test.js` sin repetir el índice. No incluye
`ensamblado.test.js`, `puente-csharp.test.js` ni `puente-vivo.test.js` (otros lotes; la última se
salta salvo con `WORLDBOX_VIVO=1` y el juego abierto). Las pruebas usan bots, funciones falsas y
servidores `node:http` en loopback (incluido un puente falso con la forma del real: siete
acciones, observación con los campos reales, cooldowns vacíos, guerra que elimina); el CLI se
ejecuta en procesos con la red externa y `.env` aislados. Cubren reglas del simulador
(invariantes sobre 25 semillas), esquema y validador estricto, cooldowns, restricciones del
reglamento real (turno 6, una guerra, 10 unidades, 10 poderes, 100 recursos, 4 puntos), equidad
de sitio, determinismo, presupuesto, tokens, timeout, reintento, circuito, truncamiento,
reconstrucción exacta JSON/CSV, protocolo e idempotencia, la bandera de pago, la auditoría
(cada manipulación del log se detecta), la estimación de costo y el análisis de pesos.
Además se aplicaron 97 mutaciones manuales sobre validaciones críticas (cooldown, puntos, lista
blanca, esquema, token, loopback, presupuesto, protocolo, puerta del turno 6, topes, cooldowns
entre turnos, mundo equilibrado, auditoría, y las 30 del lote X1: objetivos válidos, 400 de órdenes,
victoria por supervivencia, contenido sin reintento, configuración efectiva, cupo por lo creado,
trazas, rango de semilla, reproducción de decisiones…); todas fueron detectadas salvo dos
equivalentes (defensas redundantes: la segunda validación de la configuración y el tope que ya
aplica el planificador del bot).