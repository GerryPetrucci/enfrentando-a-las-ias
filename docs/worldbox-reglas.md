# Reglamento «Auge de reinos» sobre el WorldBox real — `auge-real-1.1.0`

Versión de reglas: **`rules_version = auge-real-1.1.0`**. Versión del texto que reciben los modelos:
`prompt_version = worldbox-1.2.0`. Todo lo que sigue sale de mediciones en el juego real (WorldBox
0.51.2, build interno 719, Unity 2022.3.60f1) hechas por el puente propio de `worldbox-puente/`
(`privado/revisiones/W5-entrega.md`) y por las partidas completas con bots de este lote; donde no hay
medición, el reglamento lo dice. **Cambiar una cifra de esta tabla es cambiar el reglamento:** se
sube la versión, se actualizan `src/worldbox/reglas.js`, `src/worldbox/puntuacion.js` y este
documento, y los resultados de versiones distintas no se comparan como equivalentes. El código que
aplica estas reglas es `src/worldbox/reglas.js` (perfil `real`); las pruebas
`src/pruebas/worldbox/real.test.js` fijan cada cifra.

**Historial de versiones.** `auge-real-1.0.0` (W6): primera versión; el ranking ordenaba solo por puntos.
`auge-real-1.1.0` (X1, revisión independiente R1): (1) **el único superviviente gana** aunque tenga menos puntos
(sección 6); (2) `crear_unidades` es **todo o nada** y su cupo de 10 descuenta solo lo que el juego confirma como creado
(sección 4); (3) el prompt (`worldbox-1.2.0`) describe la **configuración efectiva** del escenario; (4) la semilla pedida es un entero
de **0 a 2 147 483 647**. Los logs `1.0.0` se reconstruyen con su propia regla (la marca `victoria_supervivencia` viaja en el log):
no se comparan como equivalentes con los `1.1.0`. El reporte y la telemetría llevan `rules_version` y `prompt_version`.

## 1. Modo y participantes

- **Modo:** supervivencia y expansión de un reino. Mundo compartido; las facciones actúan en cada turno
  estratégico y el juego avanza después. Gana quien puntúa más al terminar o quien queda como único reino vivo.
- **Facciones:** 2 por defecto (se admiten 2-4; las anclas simétricas del puente cubren 2, 3 y 4).
- **Especie:** **todas `human`.** El equilibrio entre `human`, `elf`, `orc` y `dwarf` no está medido:
  las cuatro especies fundan y viven, pero no se sabe si son equivalentes, así que no se mezclan.
- **Dotación inicial igual para todos:** 1 ciudad fundada por el puente y 4 habitantes, 0 recursos
  almacenados. Mismo mapa, mismo tamaño, mismos topes y mismos puntos de acción para todas.
- **Mapa:** plantilla `continent`, tamaño `small` (192 × 192 casillas = 24 × 24 zonas de 8 × 8 = 576 zonas;
  el parámetro del orquestador es `--mapa=192`). Cada partida genera un mapa **nuevo** (ver sección 7).
- **Quién juega:** modelos por la pasarela (con pago explícito) o bots de prueba. Los bots no gastan tokens.

## 2. Tiempo

- **Turno estratégico = 50 s de juego**, **24 turnos = 1200 s de juego**, velocidad **x10**
  (`opciones.velocidad`). Una partida completa de 24 turnos con bots dura unos **100 s reales** (medido: 102-104 s en todas
  las partidas de 24 turnos de este lote; las llamadas a modelos, 24 por modelo, la alargan).
- `/v1/avanzar` corre el tiempo pedido y vuelve a pausar el juego. El sobrepaso es un cuadro de
  tiempo de mundo (0,02 s × velocidad = 0,2 s a x10) y no se acumula entre turnos (el puente apunta al
  tiempo acumulado del escenario; deriva constante medida de 0,1 s a x5). Entre turnos el juego está
  pausado y la observación queda byte a byte idéntica (W5, sección 5).
- Por qué 50 s × 24: W5 sugirió 30-60 s por turno a x10 y 20 turnos ≈ 1-2 min reales. En 1200 s la
  población natural pasa de 4 a unos 28 habitantes, el territorio de 11 a unas 39 zonas y aparecen
  edificios y almacenes (tabla de la sección 8): hay tiempo para ver el efecto de las decisiones sin
  que la partida dure más que una llamada lenta.

## 3. Turno

0. **Antes del turno 1** se genera el mundo con las opciones del escenario; si la diferencia de calidad de sitio entre
   facciones supera 30 se genera otro (hasta 10 veces; sección 7).
1. Se congela una observación por facción **antes** de cualquier acción; todas ven los mismos campos de todas.
2. Cada facción propone de **1 a 3 acciones** y dispone de **4 puntos de acción** (no se acumulan). El
   orden de actuación rota: la primera facción en actuar es `(índicePartida + turno − 1) mod n`.
3. Cada acción se valida (lista blanca, esquema, cooldown, restricciones, puntos) y se ejecuta con el
   juego pausado; las condiciones se revalidan al ejecutar. Lo inválido pasa a `esperar` + una infracción.
4. El juego avanza 50 s; el orquestador confirma el estado terminal; se reinician puntos de acción.
5. Corte de seguridad: presupuesto, tokens, tiempo o fallo del puente dejan la partida **incompleta**
   (se publica, no se excluye) con su último estado confirmado y sin infracción para nadie.

`ejecutada` significa «el juego hizo lo pedido» (para poderes: **las gotas se crearon, no que ya
hicieran daño**); `sin_efecto`, «el juego lo aceptó y no cambió nada» (donar sin almacén, ninguna
unidad a la que afectar); `rechazada`, «el reglamento o el juego lo descartó» (infracción de −5).
Ejecutada y sin_efecto gastan puntos y activan cooldown; **solo `ejecutada` cuenta para los topes**.

## 4. Catálogo, costos y restricciones

Lista **cerrada**: una acción solo existe en la competencia si el puente la anuncia con
`verificada:true` **y** con exactamente el esquema de parámetros de esta tabla. Los costos y
cooldowns los aplica el orquestador (el puente aún no los anuncia). Cooldown C: ejecutada en T,
disponible de nuevo en T + C + 1. El juego real no calcula cooldowns: el orquestador los recuerda y se
los muestra a cada facción en `estado_orquestador`.

| Acción | Parámetros | Puntos | Cooldown | Restricciones del reglamento | Efecto medido (W5) |
|---|---|---:|---:|---|---|
| `esperar` | — | 0 | 0 | Siempre disponible; nunca viaja al puente | Nada |
| `crear_unidades` | `cantidad` 1-5 | 2 | 1 | **Todo o nada** (si no caben las pedidas: `rechazada/sin_espacio`, no se crea ninguna). Cupo de **10** unidades por facción y partida: solo descuentan las que el puente confirma en `efecto.creadas` (sin ese campo se descuenta 0 y la anomalía queda en la traza) | Adultos de la especie propia junto a la ciudad: población +4…+5 de inmediato y se mantiene |
| `bendecir` | `gotas` 1-3 | 1 | 1 | Comparte el tope de **10 poderes** | Rasgo `blessed` en unidades propias (más salud máxima) tras ~6 s de juego |
| `maldecir` | `objetivo`, `gotas` 1-3 | 2 | 2 | Tope de 10 poderes; **desde el turno 6** | Estado `cursed` en unidades rivales (pierden salud) |
| `incendiar` | `objetivo`, `gotas` 1-3 | 2 | 2 | Tope de 10 poderes; **desde el turno 6** | Estado `burning`; salud media rival 1,000 → ~0,92 con 2 gotas |
| `donar_recursos` | `recurso` ∈ wood, stone, gold, common_metals; `cantidad` 1-10 | 1 | 0 | Suma de `cantidad` ejecutada ≤ **100** | +1…+10 al almacén; sin almacén → `sin_efecto/sin_almacen` |
| `declarar_guerra` | `objetivo` | 3 | 5 | **Desde el turno 6** y **una sola vez** por facción y partida | `wars.newWar`; las unidades de ambos reinos pelean |
| `pedir_paz` | `objetivo` | 1 | 0 | El juego la rechaza con guerra de menos de 30 s | Termina la guerra (unilateral) |

`objetivo` es el `id` de un rival de la lista `rivales` (no uno mismo, no uno eliminado).
No se anuncian ni se permiten: alianzas, lluvia, plaga, curar/inspirar, fundar ciudades, terraformar
(implementadas o probadas a medias en la sonda, sin verificar en vivo; ver W5, sección 3).

**Quién garantiza qué.** El **orquestador** (Node) aplica el reglamento: lista cerrada, cooldowns, puerta del turno 6, una guerra
por facción, 4 puntos y 3 acciones por turno, cupos y objetivos válidos; lo inválido no llega al puente. El **puente** (mod) garantiza
formato, rangos, ids, blanco rival válido, las precondiciones del juego y **topes de seguridad de 10 unidades, 10 poderes y 100 recursos**
por facción y partida (encargo X2: antes era 30 unidades); confía en un orquestador autenticado por token. Los topes del orquestador y
del puente coinciden a propósito: el primero evita infracciones, el segundo protege el juego aunque otro cliente hable con el mod.

### Por qué se restringen las acciones hostiles (datos)

- W5 midió que **`declarar_guerra` en t = 0 decide la partida**: el rival pasó de 4 a 1 habitantes en 200 s y
  fue eliminado a los **987 s** de juego (turno 20), mientras el agresor llegaba a 37 habitantes.
- Este lote midió que **los poderes hostiles son todavía más rápidos**. Con un bot agresivo (`bot-voraz`: guerra y
  `incendiar` + `maldecir` de 3 gotas desde el turno 1) y SIN puerta, el agresor ganó **4 de 4 partidas, todas por
  eliminación**: un reino pasivo de 4 habitantes cayó en los turnos **5 y 7** (250 y 350 s de juego, sin guerra
  declarada), y reinos que crecían con `bot-expansionista` cayeron en los turnos **17 y 22** (el agresor terminó con
  71 habitantes y 2 ciudades). Una estrategia que gana siempre y en pocos turnos deja de medir otra cosa.
- Por eso el reglamento aplica **la misma puerta (`desde_turno = 6`) a `declarar_guerra`, `maldecir` e `incendiar`**:
  durante los turnos 1-5 todos pueden crecer y defenderse, y desde el 6 el conflicto es posible. La guerra,
  además, solo una vez por facción (cuesta 3 de los 4 puntos y su cooldown es 5). **Con la puerta el agresor ganó 3 de 6
  partidas** (contra el expansionista ganó 1 —eliminación en el turno 23— y perdió 2, una por 2,7 puntos; contra
  pasivos ganó 1 —eliminación en el turno 21— y perdió 1: fue ELIMINADO en el turno 7 tras declarar la guerra con 5
  habitantes a un reino pasivo que ya tenía 17; contra el aleatorio ganó 1): atacar deja de ser dominante y pasa a ser
  una apuesta.

> Nota de versión: la tabla de decisiones recibida pedía la restricción solo para `declarar_guerra`; los datos
> de arriba extienden la puerta a los dos poderes hostiles. Es una sola línea (`desde_turno` en
> `ACCIONES_REAL`, `src/worldbox/reglas.js`) y se revierte subiendo la versión de reglas. La comparación es con
> pocas partidas y un solo bot agresivo: no prueba que el equilibrio sea el correcto para modelos.

## 5. Puntuación

Se define antes de correr y no depende de lo que haga ningún participante. **Puntuación del juego**,
**eficiencia** (puntos por dólar) y **robustez** (consistencia entre mundos distintos) se calculan y se
informan por separado; las dos últimas no cambian el ganador.

```text
puntos = 100·(vivo) + 0,3·población + 0,1·territorio + 0,8·edificios + 0,2·recursos
         + 0,5·salud_media_pct − 5·infracciones          (redondeo a una decimal)
```

`territorio` son zonas de 8 × 8 casillas; `recursos` = madera + piedra + oro + metales comunes guardados en las
ciudades; `salud_media_pct` va de 0 a 100. **No puntúan** `ciudades` y `objetivos` (el puente entrega
`objetivos = ciudades`, casi siempre 1: 2 tras una conquista o fundación y 0 en el eliminado), `ejercito` ni `comida`. Ejemplo calculado por el motor:
vivo, población 10, territorio 12, edificios 5, recursos 30 y salud 80 → 100 + 3 + 1,2 + 4 + 6 + 40 = **154,2**.
La tabla de pesos viaja en el log (`config.pesos`): el reporte se reconstruye con ella, no con el código vigente.

### Cómo se eligieron los pesos (datos reales)

W5 midió que `ciudades`, `ejercito` y `objetivos` casi no discriminan. Este lote lo cuantificó con **24 partidas
completas con bots contra el juego real** (`data/pruebas/worldbox/serie-w6` y `serie2-w6`, ignoradas por git;
12 + 12, dos bots por partida, ~102 s cada una): 9 partidas **pasivo–pasivo** y 2 **expansionista–expansionista**
(dos reinos que hacen lo mismo: lo que se separan es ruido de mapa y de azar del juego), 2 **expansionista–pasivo**
completas (la señal de «hacer algo»), y las partidas con otros bots. Reproducible con
`node src/worldbox/analisis-pesos.js data/pruebas/worldbox/serie-w6 data/pruebas/worldbox/serie2-w6`.

| Métrica | Ruido σ(f1 − f2), n = 11 | Señal expansionista − pasivo (n = 2) | SNR | Peso | Puntos de ruido | Puntos de señal |
|---|---:|---:|---:|---:|---:|---:|
| `poblacion` | 19,3 | +26 | 1,35 | **0,3** | 5,8 | 7,8 |
| `edificios` | 6,3 | +7 | 1,12 | **0,8** | 5,0 | 5,6 |
| `recursos` | 25,4 | +24,5 | 0,97 | **0,2** | 5,1 | 4,9 |
| `salud_media_pct` | 5,1 | +4,5 | 0,89 | **0,5** | 2,5 | 2,3 |
| `territorio` | 17,8 | +1 | 0,06 | **0,1** | 1,8 | 0,1 |
| `comida` | 83,8 | +41 | 0,49 | 0 | — | — |
| `ejercito` | 2,6 | +4,5 | 1,70 | 0 | — | — |
| `ciudades`, `objetivos` | 0 | 0 | — | 0 | — | — |

Regla (fijada antes de mirar el resultado de ningún modelo): **peso = 5 puntos de ruido ÷ σ**, a una cifra decimal;
`salud_media_pct` se acota a 0,5 porque su rango es 0-100 (ningún término puede valer más de la mitad de
sobrevivir); `territorio` conserva un peso simbólico porque la expansión es el nombre del modo, aunque ninguna
acción disponible lo mueve (SNR 0,06: es sobre todo mapa); `comida` (SNR < 0,5) queda fuera; `ejercito` tiene
buena SNR pero casi siempre vale 0 (media 1,9 guerreros) y no es el objetivo de ninguna acción: candidato para
la versión 1.1.0. Resultado: ruido total √Σ = **9,7 puntos** y señal total **20,7**; una infracción (−5)
equivale a medio σ de ruido. La eliminación (−100 y todo a 0) domina cualquier otra cosa.

Limitaciones honestas: la señal sale de solo 2 partidas expansionista–pasivo y se debe repetir con modelos;
los pesos son de **bots**, no de modelos. La calidad del sitio inicial explica parte del «ruido» (sección 7).

## 6. Victoria, derrota y desempates

- **Derrota (eliminación):** un reino con **población 0** queda eliminado. Pierde los 100 puntos de
  supervivencia; el puente entrega todos sus contadores a 0 (población, territorio, edificios,
  recursos, salud), de modo que un eliminado puntúa 0 (menos sus infracciones). No vuelve a actuar.
- **Victoria por supervivencia (1.1.0):** si queda **exactamente un reino vivo**, la partida termina en ese turno
  (`razon: "supervivencia"`, partida **completa**) y **ese reino GANA aunque tenga menos puntos** que un eliminado:
  las infracciones pueden dejarlo en negativo, pero no le quitan la victoria (caso medido en la revisión R1: 72 infracciones
  y −177,5 puntos contra un eliminado con 0). Los puntos ordenan a los demás (el eliminado más cercano queda segundo). Lo mismo
  vale si al terminar los 24 turnos solo queda uno vivo porque los demás cayeron antes.
- **Victoria por puntos:** si tras el turno 24 siguen vivos **dos o más**, gana quien tenga **más puntos**
  (sección 5). Si todos quedan eliminados a la vez (guerra simultánea), la partida termina y el orden es el de puntos
  (todos 0 menos sus infracciones): quien tenga menos infracciones queda primero y los iguales comparten puesto.
- **Desempates, en orden:** más puntos → mayor población → mayor territorio → si siguen iguales
  **comparten puesto** (el `id` solo estabiliza el orden de la tabla). Con tres o cuatro
  facciones, tras un empate el puesto siguiente salta (1, 1, 3).
- **Infracciones:** −5 puntos cada una. Se cuentan por orden rechazada o descartada y por decisión
  perdida por contenido inválido (JSON roto, respuesta cortada por longitud o vacía, esquema de respuesta incorrecto,
  más acciones de las permitidas): ese contenido **no se reintenta**. Un objetivo que no es un rival vivo de la lista
  también es contenido inválido (la orden no llega al puente). Los fallos técnicos del proveedor (timeout, 429, 5xx, red,
  error a media respuesta) se reintentan de forma limitada y **no** son infracciones, igual que los cortes de seguridad
  (la decisión se pierde: `esperar`). Un `400 solicitud_invalida` del puente en una orden cuenta como orden rechazada
  (infracción) y la partida continúa; cualquier otro error del puente deja la partida incompleta.
- **Partidas incompletas** (presupuesto, tokens, tiempo, fallo del puente): se publican con
  `completo:false`, su motivo y su último estado confirmado; no se excluyen ni se rellenan.

## 7. Equidad: cada partida es un mundo distinto

- **La semilla no controla el mundo** (se pide un entero de **0 a 2 147 483 647**, el mismo rango en Node y en el puente, y solo se registra).
  `capacidades.semilla` es `false` y es un hallazgo medido: la misma
  semilla y las mismas facciones dieron hashes de mundo distintos en cada reinicio. Cada partida es
  **otro mapa**. El reglamento no promete que dos partidas puedan repetirse ni compararse mapa a mapa;
  `determinista` queda `false` en todos los reportes del juego real.
- **El terreno inicial no es simétrico y pesa.** El puente coloca las anclas de forma simétrica, pero elige la zona
  más cercana que el juego da por buena; la calidad de sitio (suma de suelo en 3 × 3 zonas, máx. 576) de las dos
  facciones de una misma partida difirió en **8 a 125 puntos** (mediana 42; 24 partidas). Entre reinos que hacen lo
  mismo (n = 11), cada punto de ventaja de sitio dio +0,14 habitantes y +0,065 edificios al final (r = 0,38 y 0,54):
  con 96 puntos de diferencia, unos 13 habitantes, cerca de 0,7 σ del ruido de la población. No explica recursos ni
  salud (r ≈ 0).
- **Regla de mundo equilibrado (`umbralSitio = 30`, `intentosMapa = 10`).** Si la diferencia de calidad de sitio entre
  la mejor y la peor facción supera **30**, el orquestador pide otro mundo (sin jugar nada entre medias), hasta 10
  veces. Solo mira datos previos a cualquier decisión, así que no favorece a nadie. Con las 24 partidas medidas
  habría aceptado el 37 % de los mundos a la primera (9 de 24 con diferencia ≤ 30), unos 2,7 reinicios de media a ~1 s
  cada uno; en la corrida final de este lote hicieron falta 3 (diferencias 136, 32 y 21). Si tras los 10 intentos
  sigue sin cumplirse, se juega el último mundo y `equidad_sitio.cumple = false` queda en el log y en el reporte. Con
  `--umbral-sitio` / `--intentos-mapa` se cambia (`--intentos-mapa=1` la desactiva). La regla no hace «justo» el mapa:
  reduce una causa medida de desigualdad, no todas.
- **Qué se registra para poder revisarlo:** `hash_mundo`, `escenario_id`, `hash_estado_inicial`,
  `calidad_sitio` por facción, `equidad_sitio` (umbral, intentos, diferencia, `cumple` y todos los mundos
  probados), tamaño, plantilla, velocidad, `intentos_mapa` del puente y la semilla pedida (`semilla_usada: null`).
  Quien lea un resultado puede ver si una facción tuvo un sitio peor.
- **Cómo se compensa:** (1) reglas, especie, dotación, puntos y topes idénticos; (2) mundo equilibrado en calidad de
  sitio (arriba); (3) **rotación del orden de actuación** cada turno y entre partidas; (4) **varias partidas**
  cuando se quiere separar el azar del mapa de la habilidad: la robustez se mide entre mundos distintos
  (`hash_mundo`), no entre «semillas»; (5) puntuación con pesos bajos en lo que más depende del mapa (sección 5).
- **Una partida por corrida.** El valor por omisión es `--partidas=1`, siempre explícito. Las series
  (varias partidas, asientos invertidos) solo se hacen si el usuario las pide.
- **Opciones sin probar** para igualar el terreno de verdad (cargar un mismo guardado con
  `SaveManager.loadMapFromBytes` y asientos invertidos, o terraformar un parche idéntico por facción):
  quedan como mejora futura del puente, no como parte de este reglamento.

## 8. Dinámica natural medida (referencia, 2 facciones `human`, sin acciones)

Media de **18 reinos** en 9 partidas pasivo–pasivo de 24 turnos (cada reino no hace nada salvo existir);
sirve para ubicar las cifras de la puntuación, no como objetivo:

| Turno | s de juego | Población | Territorio (zonas) | Edificios | Recursos | Comida | Salud media % |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 50 | 4,0 | 11,6 | 1,2 | 0 | 0 | 100 |
| 4 | 200 | 5,4 | 15,8 | 2,2 | 4,1 | 9,5 | 94,4 |
| 8 | 400 | 10,3 | 21,4 | 4,6 | 20,6 | 32,9 | 96,4 |
| 12 | 600 | 14,3 | 27,3 | 7,2 | 33,1 | 54,2 | 94,2 |
| 16 | 800 | 19,6 | 32,7 | 10,3 | 42,7 | 75,5 | 95,3 |
| 20 | 1000 | 23,9 | 38,3 | 12,4 | 52,3 | 93,6 | 94,4 |
| 24 | 1200 | 28,6 | 42,7 | 14,9 | 54,2 | 113,4 | 94,7 |

Sin acciones nadie se elimina (0 de 9 partidas). Con `bot-expansionista` (10 unidades creadas, donaciones,
bendiciones) la población final media fue 47 contra 24 de los pasivos (medias de todas las partidas, eliminados
incluidos). El almacén (sin el cual `donar_recursos` no tiene efecto) apareció entre el primer y el segundo avance
en las partidas observadas.

## 9. Registro y auditoría

Cada decisión escribe un evento JSONL con los 23 campos de la sección 8 del plan (`docs/worldbox.md`) y,
además: `orden`, `estado_orquestador` (cooldowns y restricciones que vio la facción), `usos`,
`sistema_hash` y `prompt_hash`, `acciones_invalidas` y `acciones_rechazadas`. El evento `inicio` guarda
la configuración completa, la tabla de pesos y el catálogo anunciado; `fin` guarda el consumo.

```powershell
node src/worldbox/auditar.js data/pruebas/worldbox/<corrida> --replay
```

Comprueba, solo desde el log, hashes, coherencia de turnos, puntos recalculados, costos, que
`reporte.json` sea idéntico al reconstruido y que cada prompt enviado se reconstruya idéntico. Un
log manipulado falla con código 1. Con bots el consumo es 0 tokens y 0 USD.

## 10. Costo con modelos reales (estimación; no se llamó a ninguna API)

Con bots el consumo es **0 tokens y 0 USD** (`reporte.consumo`). La estimación sale de la corrida final
(`node src/worldbox/estimar-costo.js <corrida> --modelo=id,entrada,salida[,cache] --salidas=...`): reconstruye el prompt
exacto de cada decisión y lo mide con 3,5 bytes por token (supuesto declarado). Entrada por llamada: **≈ 4 126 tokens**
(3 734 de sistema, idénticos para todos y cacheables, + 392 de estado; máx. 407). Una competencia de 2 modelos son
**24 llamadas por modelo**. Precios del catálogo de OpenRouter registrados el 28-10-2026
(`privado/spec/civilizaciones-prompt-2.1.0-precios.json`; `src/modelos.js` no guarda precios). Costo por modelo y
partida, USD, sin / con caché de prefijo (las salidas incluyen el razonamiento; el tope por llamada es 16 000):

| Modelo (USD por millón: entrada / salida) | 500 tok. de salida | 2 000 | 6 000 | 16 000 |
|---|---:|---:|---:|---:|
| `anthropic/claude-haiku-5.5` (0,1 / 0,5) | 0,016 / 0,008 | 0,034 / 0,026 | 0,082 / 0,074 | 0,202 / 0,194 |
| `anthropic/claude-sonnet-5.5` (2 / 10) | 0,318 / 0,155 | 0,678 / 0,515 | 1,638 / 1,475 | 4,038 / 3,875 |
| `z-ai/glm-5.3-flash` (0,0285 / 0,0923) | 0,004 | 0,007 | 0,016 | 0,038 |

Ejemplo: Haiku contra Sonnet cuesta **≈ 0,71 USD con 2 000 tokens de salida por llamada** (0,33 con 500; 1,72 con 6 000; 4,24 en el
peor caso). Sin reintentos ni llamadas fallidas; la reserva de presupuesto de la pasarela es más conservadora (cota por bytes)
y debe fijarse por encima. Los precios de otros modelos hay que consultarlos antes (`herramientas/verificar-modelos.mjs`).

## 11. Verificación

- **Nota (X1):** las 26 partidas con bots y las dos corridas finales de W6 se jugaron con `auge-real-1.0.0` / `worldbox-1.1.0`;
  los cambios de 1.1.0 / 1.2.0 se verifican con el puente falso y las pruebas (`x1.test.js`) y quedan pendientes de una corrida
  en vivo cuando el puente (X2) tenga sus arreglos.
- **Verificado en vivo (WorldBox 0.51.2, 26 partidas completas con bots, sin API):** catálogo de siete acciones y
  su esquema; reinicio con `especie`, `velocidad`, `plantilla`, `unidades_iniciales`; `avanzar` de 50 s; las restricciones
  del reglamento (la guerra y los poderes hostiles nunca llegaron al puente antes del turno 6; una guerra por facción;
  topes); eliminación y fin de partida; regla de mundo equilibrado (3 mundos en la corrida final); log JSONL, reportes
  JSON/CSV y auditoría (`auditar.js` reconstruyó los 48 y 46 prompts de las dos corridas finales).
- **Verificado solo con el puente falso (pruebas):** la política de errores del proveedor, el presupuesto, el corte por tiempo,
  el reintento de mundo agotado, las llamadas a modelos reales.
- **No verificado:** cualquier partida con modelos; el equilibrio de especies; que los pesos (de bots) sirvan para modelos.

## 12. Lo que este reglamento NO afirma

- No hay evaluación con modelos reales del prompt (`docs/guia-de-prompts.md`, «Medir antes de adoptar»).
- Las especies no están equilibradas; el terreno inicial no es simétrico (solo se acota la diferencia de sitio);
  sin la puerta del turno 6 la agresión ganó siempre entre bots, y con ella el equilibrio (3 de 6) se midió con pocas
  partidas y un solo bot agresivo: con modelos puede ser distinto.
- Los poderes tienen efecto diferido y su daño no se garantiza; `ejecutada` no es «daño causado».
- `max_segundos_avance` del puente es 120; los 50 s de este reglamento están muy por debajo.
- Una actualización del juego puede romper el puente o apagar el modo experimental (W5, sección 9).
