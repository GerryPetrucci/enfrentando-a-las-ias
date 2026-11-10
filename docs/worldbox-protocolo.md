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
   **Adiciones de la fase 0 del formato «era» (aditivas, el reglamento `auge-real-1.1.0` no las usa):** (a) `facciones[].especie`
   acepta cualquier especie civilizada del juego real (`ActorAsset.civ`, 39 en 0.51.2: `human`, `elf`, `orc`, `dwarf` y `civ_*`;
   el catálogo está en `privado/worldbox/era-fase0/catalogo.json`); una que no exista o no sea civilizada es `400`.
   (b) `opciones.mapa`: en vez de generar un mundo, carga un mapa guardado (`slotN` = ranura N de la interfaz del juego,
   `saves\saveN\`, o un nombre `[a-z0-9_-]{1,40}` = carpeta `era-mapas\NOMBRE\` dentro de los datos del juego), con `map.wbox` o
   `map.wbax`. Misma geografía en cada reinicio (medido: mismo hash de casillas); las ciudades y reinos que traiga el guardado se
   eliminan antes de fundar las facciones; el calendario del juego continúa donde lo dejó el guardado (el puente mide siempre
   relativo al escenario). Nombre inválido o inexistente: `400 solicitud_invalida`. La respuesta añade `mundo.mapa`.
   (c) `opciones.velocidad` admite además `x40` (dos ticks por cuadro; medido estable 376 años de mundo).
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

## Formato «era» (E2, aditivo)

Extensión **aditiva** para el formato «era» (dos modelos arman un borrador por etapas: raza, mineral y bioma; luego rasgos; luego
infraestructura y políticas). No cambia ni una ruta ni un campo del protocolo v1 de arriba: el reglamento `auge-real-1.1.0` no la usa.
Lo anuncia `capacidades.era` (booleano; `false` si el mundo no la implementa, y entonces todas las rutas `/v1/era/*` dan `501 no_soportado`). El reglamento que la usa es `era-1.0` ([`worldbox-era.md`](worldbox-era.md)).
Son controles de **escenario**, como la cámara: el modelo nunca los ve ni los pide; solo el orquestador, con token, y las solicitudes que
mutan llevan `id_solicitud` (idempotencia igual que arriba). Evidencia y mediciones: `privado/revisiones/E2-entrega.md`.

### `opciones.era` de `POST /v1/escenario/reiniciar`

Objeto opcional dentro de `opciones` (se valida entero; una clave o id desconocido es `400`). Exige exactamente 2 facciones si `espejo`:

| Clave | Tipo | Efecto |
|---|---|---|
| `espejo` | booleano | Copia el terreno de la mitad izquierda sobre la derecha (tipo principal y superior, 18 432 pares en 192x192; la respuesta trae `diferencias_restantes`), rehace la flora natural en posiciones espejadas y elige los dos sitios como espejo exacto (misma calidad de sitio). Facción 1 = izquierda, facción 2 = derecha. |
| `muro` | `{ancho:2..16, tipo?:"mountains"}` | Franja de montaña de punta a punta en el centro (mismo ancho par que el mapa). Se quita con `POST /v1/era/muro`. Exige `espejo`. |
| `biomas` | `{faccion: "biome_*"}` | Pinta la mitad de esa facción con el bioma (`soil_low/soil_high` → `*_low/*_high`). Solo los ofrecidos por el catálogo. Exige `espejo`. |
| `minerales` | `[{faccion, mineral, cantidad:1..24, radio:4..30}]` | Depósitos `mineral_*` alrededor de la capital de la izquierda, a lo sumo uno por zona; la derecha recibe los **mismos** puntos espejados con el mineral de su facción. Un pedido por facción y ronda. Exige `espejo`. |
| `leyes` | `{ley: booleano}` | Fija leyes del mundo (lista del catálogo). Se restauran en el siguiente `reiniciar` y en `cerrar`. |
| `edad` / `pausar_edades` | `"age_*"` / booleano | Impone una edad del mundo y/o pausa el ciclo de edades. |
| `limpiar_fauna` | booleano (def. `true`) | Quita los animales silvestres al arrancar (la fauna inicial es aleatoria). |
| `igualar_arranque` | booleano (def. `true`) | Quita los rasgos iniciales de cultura, idioma y clan (difieren por azar entre facciones). Los de subespecie no se tocan; la respuesta los lista. |
| `contar_derivados` | booleano (def. `true`) | La «facción» pasa a ser una **civilización**: `poblacion`, `ciudades`, `territorio`, `ejercito`, `vivo` y el estado terminal suman el reino fundador **y todos los derivados** (rebeliones y escisiones). Cómo se reconoce un derivado: ver `/v1/era/estado`. |
| `max_rasgos_por_tipo` | entero 1..12 (def. 6) | Tope de rasgos agregados por la API a cada tipo de cada facción. |
| `unico_reino` | booleano (def. **`true`**) | E9. Un solo reino por civilización: en cuanto el seguimiento de linaje ve un reino derivado vivo (escisión, rebelión, «reino partido», colono que funda uno), el puente le pasa **todas sus ciudades** al reino principal de esa civilización (`City.joinAnotherKingdom`; el principal es el fundador, o el primer derivado vivo si el fundador cayó), con lo que las ciudades adoptan nombre, color y bandera del principal y el derivado muere vacío. No toca conquistas de guerra: una ciudad capturada ya pertenece, por linaje, a la civilización que la tiene. Un reino sin origen reconocible (`reinos_sin_origen`) no se toca. `false` lo apaga (solo pruebas). |
| `facciones` | arreglo (≤ 16) de `{faccion, color?, nombre_reino?}` | E10 (aditivo, opcional). Color y nombre del reino de cada civilización al fundarlo. `faccion`: id de una facción de la solicitud (sin repetir); `color`: `"#RRGGBB"` (el puente acepta minúsculas y lo normaliza a mayúsculas; dos facciones no pueden pedir el mismo); `nombre_reino`: 1 a 24 caracteres (letras con acentos, dígitos, espacio, guion, apóstrofo, punto; sin espacios al borde ni dobles; sin repetir entre facciones aunque cambie la mayúscula). El juego admite **colores propios exactos**: el puente construye un `ColorAsset` con ese hex, lo añade a `AssetManager.kingdom_colors_library` (`Kingdom.updateColor` solo acepta colores de esa biblioteca) y llama `kingdom.updateColor`; el nombre va a `kingdom.data.name` con `custom_name = true`. Cada pulso (0,25 s) el reino principal de la civilización (y, con `unico_reino:false`, los derivados vivos solo en color) se compara con lo pedido y se reaplica si cambió, de modo que el color y el nombre sobreviven a la reunificación, a la caída del fundador y a la guerra (una ciudad capturada toma el color del reino que la tiene, lo esperado). Respuesta de `reiniciar` en `era.resultado.presentacion`: `[{faccion, color_pedido, color_aplicado, nombre_pedido, nombre_aplicado, ok, error}]`; `GET /v1/era/estado` suma `presentacion: {activo, capa_reinos, reaplicados, fallos, facciones[{faccion, color_pedido, color_actual, nombre_pedido, nombre_actual}]}`. Sin `facciones` no se toca el color ni el nombre del juego. |
| `mapa_reinos` | booleano (def. **`true`**, solo vale con `facciones`) | E10. Enciende la capa de mapa «reinos» del juego (`PlayerConfig.setOptionBool` sobre la `option_id` de cada `MetaTypeAsset`: queda solo `map_kingdom_layer`). Sin esa capa el mapa muestra **ciudades** (etiquetas con el nombre de la ciudad y bandera propia) y el color del reino no se ve; con ella el territorio se tiñe del color del reino y la etiqueta lleva su nombre. Es una preferencia del jugador que el puente cambia y **no restaura** (se vuelve a elegir en la barra de capas del juego). `false` la deja como esté. |
| `vigilante` | booleano o `{activo?, modo?, intervalo_s?}` (def. **activo**, `modo:"devolver"`, `intervalo_s:0.25`) | E9. Mientras exista el muro, cada `intervalo_s` reales (0,1..10) revisa toda unidad viva de una civilización: si está **sobre el muro** o del **lado contrario** (faccion 1 = izquierda, 2 = derecha), la deja donde corresponde (`devolver`: `cancelAllBeh` + `spawnOn` junto a la ciudad más cercana de su civilización en su lado; barcos o sin ciudad a donde volver: se eliminan), la elimina (`eliminar`) o solo la cuenta (`observar`, para medir). Cada 5 s reales repara además cualquier casilla del muro cuyo tipo ya no bloquee. `false` lo apaga (solo pruebas). Sin muro no hace nada. |

La respuesta añade `era:{preparacion, resultado, espejo}` (cifras de lo que se hizo: casillas espejadas, flora colocada, depósitos, rasgos
iniciales, leyes aplicadas, edad).

### `GET /v1/era/catalogo[?tipo=...]`

Sin `tipo`: resumen (conteos por tipo y grupo, categorías del formato, minerales, biomas, leyes, edades, límites). Con `tipo` (`reino`,
`cultura`, `idioma`, `clan`, `subespecie`, `religion`): `rasgos[]` con `{id, nombre, descripcion, grupo, rareza, efectos, efecto_numerico,
opuestos, requiere_logro, se_puede_quitar, ofrecible}`; **solo los `ofrecible:true` se pueden aplicar** (se excluyen los grupos que cambian la
especie o rompen la comparación y 6 rasgos de cultura que el juego rechazó al probarlos). Otros `tipo`: `minerales`, `biomas`, `leyes`,
`especies`, `categorias` y `compatibilidad` (mide, con el propio juego, qué especie puede fundar sobre qué bioma; pinta una zona de prueba y la restaura).

### `GET /v1/era/estado[?desde=N]`

`{hay_era, anio, tiempo_juego_s, tiempo_real_s, edad, muro, civilizaciones[], reinos_sin_origen[], leyes, eventos[], siguiente_evento, depositos[]}`.
Cada civilización suma sus reinos (`reinos[]` con `original`), trae `almacen` (recursos de las ciudades), `rey` (estadísticas del rey) y `rasgos_era`.
**Cómo se identifica un derivado:** el juego no guarda de dónde sale un reino, así que el puente, cada 0,25 s reales, recuerda a qué civilización
pertenece cada ciudad; un reino nuevo hereda la civilización de sus ciudades (o, si no, de su cultura). Sin origen reconocible queda en
`reinos_sin_origen`. `eventos` (`i`, `tipo`, `anio`, `t_juego_s`, `t_real_s`, ...): `era_iniciada`, `reino_nuevo`, `reino_eliminado`,
`civilizacion_eliminada`, `ciudad_fundada`, `ciudad_destruida`, `ciudad_conquistada`, `guerra_declarada` (con `guerra_civil`), `guerra_terminada`,
`muro_puesto`, `muro_quitado`, `muro_vigilante` (E9: `detectadas`, `devueltas`, `eliminadas`, `modo`, `causas`), `muro_reparado` (E9), `reino_reunificado` (E9: `faccion`, `reino`, `en`, `ciudades`, `poblacion`), `edad_cambiada`, `rasgos_aplicados`, `rasgos_pendientes`, `rasgo_perdido`, `rasgo_reaplicado`, `rasgo_aplicado_tarde`, `velocidad_cambiada`, `minerales_colocados`. Piden `desde` para leer solo los nuevos.

**Control del 1 vs 1 (E9, aditivo).** `GET /v1/era/estado` suma `vigilante` (`{activo, modo, intervalo_s, revisiones, unidades_detectadas, devueltas, eliminadas, fuera_ahora, fuera_max, casillas_reparadas,
casillas_rotas_ahora, errores, causas{barco|volador|sobre_el_muro|agua|tierra: n}, muestras[≤40 primeras detecciones: año, facción, asset, causa, x, y, casilla], ms_total, ms_max, ms_medio}`) y `unico_reino`
(`{activo, reunificados, ciudades_movidas, fallos, reinos_vivos_max_por_civilizacion, ms_total, ms_max}`). Ambos corren en el mismo pulso de 0,25 s reales del seguimiento de linaje (también durante un avance).
El muro cubre **todas las filas de punta a punta** (océano profundo incluido: la casilla pasa a `mountains`, capa `Block`, que no deja pasar ni a pie ni en barco); su ancho mínimo es 2, con las
columnas completas, de modo que no puede haber huecos diagonales. El estado terminal y el conteo por civilización no cambian.

### `POST /v1/era/rasgos`

`{id_solicitud, faccion, tipo, agregar?:[ids], quitar?:[ids], reemplazar?:bool, parcial?:bool}` (hasta 32 ids por lista, 12 en total por llamada).
Valida contra el catálogo ofrecido (`ReglasEra`, igual en el anfitrión de pruebas): rechazos con código estable `rasgo_desconocido`,
`rasgo_no_ofrecido`, `repetido`, `ya_presente`, `rasgo_opuesto`, `tope_rasgos`, `no_presente`, `no_se_puede_quitar`, `no_aplicado`.
**Atómico**: si algo se rechaza no se aplica nada (`resultado:"rechazada"`), salvo `parcial:true` (`"parcial"`); `reemplazar:true` quita antes los que
puso esta API. La religión se crea si la facción no tiene (`creo_religion`). Forma inválida, tipo o facción desconocidos: `400`.
Respuesta: `{resultado, tipo, faccion, reino, aplicados, quitados, rechazados[{id,codigo,mensaje}], rasgos_actuales, rasgos_era, tope, rey}`.

**Mantenimiento de rasgos (E5, aditivo).** Medido en vivo (E3): el juego **reemplaza por su cuenta** los objetos cultura, idioma y religión de un reino. Un rasgo de
cultura o idioma aplicado en el año 0 se pierde en 2 o 3 años; con el reino aún sin cultura, idioma o religión (años ~3 a ~16) el juego rechaza el rasgo (`no_aplicado`);
más tarde el reino puede cambiar de cultura y perder lo aplicado. Los de clan, subespecie y reino persisten. Dos campos opcionales de la misma solicitud lo resuelven:

| Campo | Tipo | Efecto |
|---|---|---|
| `mantener` | booleano (def. `false`) | Lo que se aplique con éxito queda como rasgo **deseado** de esa facción y tipo. Lo que es válido pero **no se puede aplicar todavía porque el objeto no existe** (cultura, idioma o clan ausentes; la religión se crea) no se rechaza: queda **pendiente** (`pendientes:[{id, codigo:"objeto_ausente"}]`) y el puente lo aplica en cuanto el objeto existe. Los rechazos definitivos (`rasgo_opuesto`, `ya_presente`, `tope_rasgos`, `rasgo_no_ofrecido`…) siguen en `rechazados` y no se mantienen. Los deseados y pendientes cuentan para el tope por tipo. |
| `soltar` | arreglo de ids (hasta 32) | Deja de mantener esos rasgos **sin quitarlos** del juego (también sirve para abandonar un pendiente). Una solicitud con solo `soltar` es válida. `quitar` de un rasgo mantenido también lo suelta. |

El puente comprueba lo deseado **cada 0,25 s reales** (el mismo pulso del seguimiento de linaje, también durante un avance): si a un rasgo `activo` le falta en el objeto actual, lo da por **perdido**
(evento `rasgo_perdido`) y lo vuelve a aplicar con las mismas reglas (opuestos, tope; un fallo se reintenta como máximo cada 1 s por rasgo y deja su `motivo`). Eventos nuevos: `rasgo_perdido`,
`rasgo_reaplicado` (perdido y vuelto a poner), `rasgo_aplicado_tarde` (pendiente que por fin se aplicó), `rasgos_pendientes` (en la solicitud); a lo sumo 400 por partida (los contadores siguen).
Respuesta con `mantener` o `soltar`: además `mantener`, `pendientes[]` y `soltados[]`; `resultado` es `parcial` si algo quedó pendiente o rechazado. `/v1/era/estado` suma en cada civilización
`rasgos_mantenidos` (`{tipo: [{id, estado:"activo"|"pendiente", perdidas, reaplicaciones, motivo?}]}`) y, arriba, `mantenimiento` (`{deseados_activos, deseados_pendientes, comprobaciones, perdidas,
reaplicaciones, aplicados_tarde, ms_total, ms_max, ms_medio}`: el costo medido de las comprobaciones). Lo anuncia `capacidades.era_mantener` (sin él, `mantener` y `soltar` dan `501 no_soportado` y el
orquestador juega como antes y lo anota). El mantenimiento solo toca el reino principal de la facción (el fundador, o el primer derivado vivo si cae) y se borra con cada `reiniciar`.

### `POST /v1/era/velocidad` (E4)

`{id_solicitud, velocidad}`, con `velocidad` de la forma `x5`, `x20`, `x40`… (`x1, x2, x3, x4, x5, x10, x15, x20, x40`; otro valor es `400`). Cambia la velocidad del juego **entre dos
avances** (con un avance en curso: `juego_ocupado`); el avance siguiente la usa. Respuesta `{velocidad, anterior}` y evento `velocidad_cambiada` (`de`, `a`). Lo anuncia
`capacidades.era_velocidad` (booleano; sin él la ruta da `501 no_soportado` y el orquestador juega toda la partida a la velocidad del escenario). Es un control de escenario, como la
cámara: el modelo no lo ve. Idempotente por `id_solicitud`.

### `POST /v1/era/muro` y `POST /v1/era/minerales`

`muro`: `{operacion:"quitar"|"poner", ancho?:2..16}`. Quitar restaura el tipo principal y superior de cada casilla (el mapa queda idéntico) y
registra el evento `muro_quitado`; no devuelve la vegetación que el muro borró. `minerales`: `{faccion, mineral, cantidad:1..24, radio?:4..30, espejo?:bool}`
coloca depósitos alrededor de la capital (con `espejo`, también los espejados en la otra mitad). Un depósito es de **un solo uso**: la ciudad lo agota.

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
