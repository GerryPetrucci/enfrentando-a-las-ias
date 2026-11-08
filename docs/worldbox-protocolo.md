# Protocolo del puente WorldBox v1

Contrato del cable entre el orquestador Node y un mod dentro del juego. No afirma
que ninguna acción esté implementada en una versión instalada. El mod anuncia
solo acciones comprobadas (`verificada:true`); el orquestador habilita exactamente
esas y ninguna más.

## Transporte

HTTP/1.1, JSON UTF-8, escucha únicamente en `127.0.0.1`, puerto predeterminado
47600. Nunca `0.0.0.0`. Cabecera obligatoria `X-Puente-Token`. El mod genera el
token al arrancar y lo guarda localmente junto al mod; Node lo recibe mediante
`WORLDBOX_PUENTE_TOKEN`. No se transportan llaves de proveedores al juego.

Todos los cuerpos y respuestas llevan `"protocolo":1`. Un número diferente, ausente o de
otro tipo aborta, también en las respuestas de error. Éxito: HTTP 200 con `"ok":true`.
Error: HTTP 4xx/5xx con:

```json
{"protocolo":1,"ok":false,"error":{"codigo":"no_listo","mensaje":"El juego todavía no está listo."}}
```

Códigos estables: `no_autorizado`, `protocolo_incompatible`, `no_listo`,
`solicitud_invalida`, `no_soportado`, `juego_ocupado`, `tiempo_agotado`,
`error_interno`. Sin token o token incorrecto: HTTP 401. El cliente guarda el
código normalizado (uno desconocido pasa a `error_interno`); nunca el mensaje crudo del servidor.

Las solicitudes mutadoras incluyen `id_solicitud` único. El mod encola cada solicitud y la
ejecuta en el hilo principal de Unity: **no se asume que el juego sea monohilo** (la inspección
del binario muestra opciones de ejecución paralela); la cola es una decisión de integración
prudente, no una propiedad del juego. Un id repetido devuelve la respuesta anterior y
**no repite el efecto**, incluso si el cliente perdió la primera respuesta.
Reintentos del cliente conservan cuerpo e id. Se pide que la simulación permanezca pausada
entre turnos y solo avance dentro de `/v1/avanzar`; que la pausa congele todo el estado es algo
que el mod debe medir, no suponer.

## Qué garantiza cada capa

El **orquestador** (Node) y el **puente** (mod) se reparten las garantías; ninguna se supone en la otra capa.

| Garantía | Orquestador | Puente |
|---|---|---|
| Lista blanca de acciones y esquema exacto de parámetros | Sí (solo acciones anunciadas `verificada:true` con el esquema del reglamento) | Sí (revalida nombre, tipos y rangos) |
| `objetivo` = id de un rival vivo | Sí: lo comprueba **antes** de enviar; si no, infracción y no se envía | Sí: lo revalida y responde `200` con `resultado:"rechazada"` y `codigo:"objetivo_invalido"` (no `400`) |
| Cooldowns, `desde_turno` (turno 6), una guerra por facción, 3 acciones y 4 puntos de acción por turno, orden de actuación | **Sí, solo aquí** (el puente no los revalida) | No |
| Cupos del reglamento (10 unidades confirmadas, 10 poderes, 100 recursos) | Sí (descuenta lo confirmado en `efecto.creadas`) | **Topes de seguridad** de 10 unidades, 10 poderes y 100 recursos por facción y partida |
| `crear_unidades` todo o nada | Cuenta solo `efecto.creadas`; sin ese campo descuenta 0 y deja una anomalía | Si no caben las pedidas: `rechazada/sin_espacio`, sin modificar el mundo |
| Precondiciones del juego (recursos, almacén, guerra previa, 30 s de guerra…) | No | Sí |
| Idempotencia por `id_solicitud` | Conserva el id en los reintentos | Devuelve la respuesta anterior sin repetir el efecto |
| Formato, rangos, ids, token, loopback | Cliente estricto | Servidor estricto |

El puente **confía en un orquestador autenticado por token**: un cliente con el token podría saltarse cooldowns, la puerta del
turno 6 o la regla de una guerra, porque esas reglas de competencia viven en Node. Si se quisiera defender el juego contra otros
clientes, habría que moverlas al mod.

## Operaciones

1. `GET /v1/info`

   Responde `ok`, `protocolo`, `puente:{nombre,version}`,
   `juego:{nombre,version,build_steam,unity}`, `estado` (`cargando`, `listo` o
   `ejecutando`), `capacidades:{reiniciar,semilla,avanzar,terminal,multi_faccion}`
   (booleanos), `acciones` y `limites`.

   Cada acción: `{nombre,descripcion,verificada:true,parametros:{campo:esquema}}`, más los
   campos **opcionales** `puntos` (entero 0–100: costo en puntos de acción del turno; por
   defecto 1) y `cooldown` (entero 0–1000 turnos; por defecto 0). Nombres y campos:
   minúsculas, dígitos y `_`, 1–40 caracteres, sin `__` inicial. Cada esquema:
   `{tipo,minimo?,maximo?,valores?}`; tipos admitidos por Node: `entero`, `numero`, `cadena`,
   `booleano`. En cadenas, mínimo/máximo son longitud; `minimo ≤ maximo`; `valores`, si existe,
   no puede estar vacío. Los campos de parámetros son obligatorios y sin extras. Los límites
   contienen `max_segundos_avance` y opcionalmente `max_acciones_por_turno` (Node usa 3 si
   falta). Verificada significa implementada y probada contra el juego real, no deseada. Node
   ignora las acciones con `verificada` distinto de `true` y las cuya descripción empieza por
   «EN PRUEBA» (ensayos locales del mod); una acción verificada con nombre o esquema inválido
   invalida todo `/v1/info`. `esperar` no hace falta
   anunciarla: es la acción nula del orquestador y nunca se envía al puente.

   `capacidades.semilla` debe ser `false` mientras el mod no demuestre que la semilla determina
   el mundo (hoy no está demostrado). Con `false` la partida se juega igual, marcada
   `determinista:false`. Con `true`, Node la marca `determinista:"desconocido"`: no puede
   verificar la trayectoria completa. Las otras cuatro capacidades son obligatorias.

2. `POST /v1/escenario/reiniciar`

   Cuerpo: `{protocolo,id_solicitud,semilla,tamano_mapa,facciones,opciones}`.
   Semilla **entera de 0 a 2 147 483 647** (con signo de 32 bits, no negativa; Node y el puente validan el mismo
   rango; solo se registra, no controla el mundo); facciones `[{id,especie?}]` (Node envía `especie` cuando el reglamento la fija, p. ej.
   `human`); `tamano_mapa` entero; `opciones`: `max_acciones` y, con el reglamento del juego real,
   `velocidad` (`x10`), `plantilla` (`continent`) y `unidades_iniciales` (4). Respuesta:
   `{protocolo,ok,escenario_id,hash_mundo,semilla_usada?,facciones:[{id,nombre,especie?,calidad_sitio?,...}],mundo?:{ancho,alto,plantilla,tamano,velocidad,unidades_iniciales,intentos_mapa,...}}`.
   `hash_mundo` identifica el mundo generado y `semilla_usada` (opcional, entero) la semilla
   que el mod realmente aplicó; Node los registra en el reporte para auditar. Si difieren de
   lo pedido, la partida se marca `determinista:false`. `calidad_sitio` (entero ≥ 0, opcional) y
   `mundo` se registran tal cual (solo escalares acotados) para poder revisar la equidad del
   terreno inicial: el reglamento no la supone.

3. `GET /v1/observacion?faccion=<id>`

   Respuesta: `{protocolo,ok,tiempo_juego_s,turno_juego,faccion,rivales,mundo}`.
   Solo números, ids, nombres y campos estructurados neutrales. Mismos campos
   para todas las facciones, sin objetos internos del juego. `turno_juego` debe crecer una
   unidad por cada `/v1/avanzar`: Node valida cooldowns con su propio contador de turnos.

4. `POST /v1/accion`

   Cuerpo: `{protocolo,id_solicitud,faccion,accion,parametros:{}}`.
   Respuesta: `{protocolo,ok:true,resultado,codigo,mensaje,efecto:{...}}`.
   Resultado: `ejecutada`, `rechazada` o `sin_efecto`. El mod vuelve a validar
   lista blanca, tipos, rangos, ids, blanco rival válido, topes de seguridad y precondiciones del juego
   (recursos, almacén…); **no** revalida cooldowns, la puerta del turno 6, la regla de una guerra ni los puntos
   de acción: esas viven en el orquestador (ver «Qué garantiza cada capa»). Una orden bien formada pero inválida
   (objetivo inexistente, uno mismo, eliminado) se contesta `200` con `rechazada` y su código (`objetivo_invalido`,
   `objetivo_propio`, `sin_espacio`…); el `400 solicitud_invalida` se reserva para errores de FORMA, y Node lo
   trata como orden rechazada (una infracción) sin abortar la partida. El cliente normaliza resultado/código
   (`^[a-z0-9_]{1,60}$`, si no `sin_codigo`) y conserva en la traza privada un `efecto` ACOTADO (hasta 20 escalares:
   números, booleanos y textos de hasta 100 caracteres; lo anidado se descarta) y el `id_solicitud` enviado; el
   modelo nunca ve el `efecto`. Para `crear_unidades`, `efecto.creadas` (entero) es el dato que Node usa para descontar
   el cupo de unidades; `efecto.pedidas` y las poblaciones antes/después sirven para explicar la ejecución. Una orden
   rechazada cuesta una infracción al participante; `sin_efecto` cuenta como aceptada.

5. `POST /v1/avanzar`

   Cuerpo: `{protocolo,id_solicitud,segundos_juego}`.
   Respuesta: `{protocolo,ok,tiempo_juego_s,terminal}`. Ejecuta esa cantidad de
   tiempo y vuelve a pausar. El perfil actual avanza una unidad por turno. Node confirma el
   estado con `/v1/estado-terminal`, que manda sobre el `terminal` de esta respuesta.

6. `GET /v1/estado-terminal`

   Respuesta: `{protocolo,ok,terminal,razon,resumen_por_faccion:[{id,vivo,poblacion,
   ciudades,territorio,...}]}`. `razon`: `supervivencia`, `turnos` o `ninguna`. Debe listar a
   todas las facciones de la partida, también las eliminadas; si falta una, la partida se
   cierra como incompleta (`puente_respuesta_invalida`).

7. `POST /v1/cerrar` (opcional)

   Cuerpo: `{protocolo,id_solicitud}`. Libera el escenario, no cierra el juego.
   Si no está implementado, responde `no_soportado` con el sobre de error v1.

## Perfil de observación requerido por el núcleo Node

El cable deja abiertos los objetos de estado. Para que el orquestador puntúe, cada facción
observada y cada fila terminal debe contener:

```json
{"id":"f1","vivo":true,"poblacion":20,"ciudades":1,"territorio":3,"recursos":20,"objetivos":0,"cooldowns":{}}
```

Es un **ejemplo de forma**, no una afirmación sobre los valores reales de
WorldBox. Id: cadena de 1–40; vivo: booleano; las cinco métricas: enteros de 0 a
1 000 000 000. `cooldowns` puede faltar (equivale a `{}`); sus valores son el
primer turno de disponibilidad. El juego real no calcula cooldowns: llega siempre `{}` y el
orquestador lleva los suyos (los muestra a cada facción en `estado_orquestador`).

Campos **opcionales**, validados si llegan y conservados en este orden fijo tras los
obligatorios: `especie` (`^[a-z_]{1,20}$`), `ejercito`, `edificios`, `comida` (enteros ≥ 0),
`salud_media_pct` (número 0–1000), `rey_vivo` (booleano) y, solo en la facción propia,
`unidades_creadas` y `unidades_creables_restantes` (enteros ≥ 0). Son los que entrega el
puente real; permiten puntuar con campos que sí discriminan (ver `docs/worldbox-reglas.md`).
Un valor de tipo equivocado invalida la observación entera. `mundo:{tamano_mapa,libres}` contiene celdas
totales y libres, enteros no negativos. El turno empieza en cero y el tiempo
es un número finito no negativo. El puente debe acordar cómo calcula cada métrica
antes de un piloto (por ejemplo, qué significa «territorio» o «recursos» en el juego real);
Node rechaza campos ausentes, no inventa recursos u objetivos. La puntuación del juego real
usa estos mismos campos.

Los campos adicionales se descartan. En HTTP el origen siempre es `puente`,
independientemente de lo que diga el servidor. El catálogo de acciones sale de `/v1/info`
(ver arriba); las acciones propias del simulador nunca se habilitan por HTTP por el hecho de
compartir nombre. Hay dos perfiles de reglas sobre un puente: **`real`** (reglamento
`auge-real-1.1.0`, `docs/worldbox-reglas.md`): lista CERRADA de siete acciones; cada una se
habilita solo si el puente la anuncia `verificada:true` con EXACTAMENTE el esquema de parámetros
del reglamento (si el mod cambia un rango, la acción queda fuera hasta revisar el reglamento) y
su costo, cooldown, restricciones y texto son los del reglamento, no los anunciados; y
**`generico`** (`puente-observacion-1.0.0`, para puentes de prueba): todo lo anunciado, con la
descripción y el esquema del puente y sin inventar costos ni efectos.

## Seguridad y fallos

El cliente no sigue redirecciones, no resuelve hosts remotos y exige URL raíz
HTTP de `127.0.0.1`. Timeout/reintentos/circuito limitan bloqueos. Solicitudes y
respuestas usan protocolo 1, también los errores. Cada respuesta tiene límite de
1 MB. Una acción con estado incierto al perder la conexión causa cierre incompleto
del reporte, conservando el último snapshot confirmado.

El mod no ejecuta código, shell, scripts ni instrucciones libres del modelo, no
expone más estado a una facción y no guarda credenciales de OpenRouter. El cliente
se prueba contra servidores falsos locales (uno con su propio mundo y catálogo, otro con el
anfitrión C# de `worldbox-puente/`); esto no certifica el mod real, Unity ni
una versión concreta de WorldBox.
