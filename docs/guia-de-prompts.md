# Cómo se escribe el prompt de un juego

Regla decidida el 28 de octubre de 2026 (está en `AGENTS.md`). Vale para los juegos ya hechos y para los futuros.

## El principio

Los modelos tienen que jugar **el juego que diseñamos**. Si el prompt es escaso y el modelo gasta su pensamiento en adivinar qué significa `g`, cuándo se gasta la Comida o si un empate favorece al defensor, no está jugando
una parte del juego: está jugando a descifrarlo, y eso sesga el resultado (castiga a los modelos que razonan más caro o que se quedan sin espacio, no a los que juegan peor).

- **La claridad va primero. El costo se analiza después.** Nunca se recorta claridad para caber en un tope de tokens. El tope de tokens del prompt (hoy 6 500 estimados en Guerra) es una medida de seguridad que se sube con orden del usuario
  cuando el texto lo pide, no un presupuesto de diseño.
- **Un prompt largo no es automáticamente claro.** Se mide (ver «Medir antes de adoptar»): lo que cuenta es si los modelos entienden, no cuántas líneas hay.
- **Todos los modelos reciben exactamente el mismo texto** (el contrato de `src/prompt.js`). Nada de prompts a la medida de un modelo.
- **No se les dice cómo jugar bien.** Se les explica cómo funciona el juego. Una lista de «consejos de estrategia» sesga igual que un prompt escaso.

## Qué debe contener el prompt de un juego

Lista de verificación. Cada punto responde a una duda real que un modelo planteó en su razonamiento (se sacaron de las partidas de Guerra de territorios).

1. **Papel y objetivo:** quién eres, contra quién juegas, qué se puntúa y cómo (puntos por posición, desempates). Que el motor valida las respuestas y que lo imposible se descarta.
2. **Lo esencial en pocas líneas:** duración, simultaneidad (quién ve qué antes de decidir), formas de ganar, cuándo caes.
3. **Orden exacto de resolución del turno,** numerado, con sus consecuencias (qué se ve antes y qué después de producir, comer o gastar; si lo reclutado existe ya).
4. **Cada regla con sus cifras** (costos, límites, redondeos, qué pasa en un empate, qué pasa al llegar a cero). Con un ejemplo **calculado por el motor** donde haya aritmética (no a mano).
5. **Cada orden, una por una:** sintaxis exacta, ejemplo, condiciones, costo, qué hace, cuándo se descarta, y el límite de órdenes por turno.
6. **Qué ve el modelo y qué no ve** (información oculta de los demás, notas propias, mensajes privados).
7. **Cómo leer el estado:** un recorrido, línea por línea y en el orden en que llegan, con un fragmento de estado real (generado por el motor, con textos neutros) y la notación explicada (`L5A3`, `f1`, `g-`, `x1.32`...), diciendo qué números ya están calculados y qué
   ignoran.
8. **Cómo responder:** un ejemplo de FORMATO con valores **inventados** y la advertencia de no copiarlos, y debajo una lista **campo por campo** con su tipo, sus límites y su significado, y qué pasa si falta.
9. **Errores frecuentes que hacen perder órdenes o turnos,** sacados de los motivos de descarte reales del motor.
10. **Afirmaciones sobre lo que el modelo NO recibe,** dichas con honestidad (por ejemplo, que una orden descartada no se le avisa). Si un día el estado empieza a avisar, se corrige la frase.

Lo que NO entra: consejos de estrategia, valoraciones («esto conviene»), nombres de bots, ni nada que revele cómo se evalúa a cada modelo más allá de las reglas.

## Cómo se verifica

1. **Cada afirmación se comprueba contra el motor,** no contra la memoria de quien escribe. Las poco obvias (orden de fases, redondeos, empates, límites) se prueban con un caso mínimo en el motor y se anotan en el spec.
   Para Guerra: `privado/spec/guerra-prompt-2.3.0.md` lista las comprobaciones.
2. **Los números salen de las constantes y los ejemplos se calculan con el motor.** La plantilla del texto es código (`src/juegos/<id>/reglas-texto.js`): si un número cambia, el prompt cambia solo y sube `versionReglas`.
3. **Los textos de ejemplo del estado se generan con el motor** y se limpian (los bots escriben cosas como «Plan: lancero-masa»; en el prompt van textos inventados y neutros).
4. **Acentos:** los prompts van sin acentos ni eñe (es parte del contrato). Esta guía sí los lleva.

## Medir antes de adoptar

Un texto nuevo no se adopta porque «se lee mejor». Se prueba como variante sobre los mismos prompts reales, con los mismos modelos, antes y después:

- `node herramientas/examen-modelos.mjs --juego=<id> --modelos=<lista> --partida=pruebas/<archivo>.json --jugador=<id> --sistema=privado/spec/<borrador>.txt` repite los prompts REALES de una partida guardada con un prompt de sistema
  distinto (el borrador); `--reemplazar="viejo=>nuevo"` cambia solo una frase del prompt de usuario en memoria; `--max-tokens=N` prueba otro tope de salida (ver `docs/agregar-un-juego.md`, «Examen de ingreso de modelos»).
  El examen imprime si el prompt de sistema usado es IGUAL al de la partida real (misma huella): así se sabe que una línea base es de verdad la de entonces. Para rehacerla, el prompt viejo se reconstruye como archivo
  (`privado/spec/generar-prompt-guerra-2.2.0.mjs`) y se comprueba con esa huella.
- Qué se mira: respuestas cortadas por `max_tokens`, tokens de salida, órdenes legales, costo, y cuántos modelos copian los valores del ejemplo. Siempre contra una línea base medida con el prompt anterior, con varios modelos (no solo con el que dio el problema).
- Una prueba negativa también vale: el 28-10-2026 se descartó que la falta de leyenda de `g/m/c/fN` causara los cortes de GLM Flash (con la leyenda dejó de descifrar siglas y se cortó igual), y que el aviso de espacio ayudara (0 cortes con y sin él).
- Un prompt más completo **hace razonar más a algunos modelos**: lo que se les explica lo usan. En Guerra, Haiku pasó de 2 577 a ~5 300 tokens de salida mediana y Gemini de 3 157 a ~5 500; sus órdenes legales subieron (Gemini 92 % → 99 %). Por eso el tope de tokens de salida
  se sube junto con el prompt (8 000 → 16 000 el 28-10-2026): no es un gasto, solo se cobra lo que cada llamada usa.

## Costo

Se analiza **después** de escribir el prompt. Cuenta que: (a) la entrada se paga en cada llamada (30 turnos × reinos); (b) la salida, sobre todo el razonamiento, suele pesar más que la entrada, y un prompt más claro puede acortarla; (c) el prefijo fijo (reglas + mapa) es idéntico
en todas las llamadas, así que los proveedores con caché lo cobran más barato. Procedimiento: tokens medidos de una llamada real (`usage.prompt_tokens`), precios del catálogo, costo por partida de una mezcla cara y de una barata.

**Caché de prefijo (medida el 28-10-2026 con el prompt de Guerra de ~25 000 caracteres):** OpenAI (Luna, GPT Sol) y GLM cachean solos (la segunda llamada cobró 9 veces menos en GPT Sol: $0.0226 → $0.0015); Anthropic y Google **solo cachean si la petición
marca el prefijo** (`cache_control`), y `llamarModelo` ya lo hace para los modelos `anthropic/` y `google/` (`src/parametros.js`, `cuerpoDeLlamada`): Claude Sonnet pasó de $0.0342 a $0.0056 por llamada y Haiku de $0.0017 a $0.00034. Es solo metadatos de la petición: el
texto que recibe el modelo es el mismo. DeepSeek cachea de forma irregular. Los tokenizadores difieren: el mismo prompt mide 13 791 tokens en Claude, 9 390 en Gemini y 8 769 en OpenAI.

## Proceso para un juego (el orden importa)

1. **Borrador en `privado/spec/`:** generador (`generar-prompt-<id>-<versión>.mjs`) que produce el texto a partir de las constantes y el motor, más el spec (`<id>-prompt-<versión>.md`) con las verificaciones, lo que cambió y las decisiones abiertas.
2. **Análisis de costo** del borrador (tokens, precio por modelo, partida cara y barata).
3. **Aprobación del usuario** (incluye subir el tope de tokens del prompt si hace falta).
4. **Variantes sobre prompts reales** con GLM Flash y al menos un modelo de control, una palanca a la vez.
5. **Se aplica al código:** el texto pasa a `reglas-texto.js`, sube `versionReglas`, se actualizan las pruebas que fijan el texto y el tope, y se anota en `docs/decisiones-detalle.md`. Las partidas jugadas con el prompt anterior no se comparan con las nuevas.
6. Siguiente juego.

## Auditoría de los juegos existentes

Tamaño del prompt de sistema el 28-10-2026 (medido con 2.71 caracteres por token en el tokenizador de GLM; otros tokenizadores difieren):

| Juego | Versión de reglas | Caracteres | ~Tokens | Estado |
|---|---|---|---|---|
| Guerra de territorios | conquista-2.3.0 | 25 560 (antes 6 628) | 9 400 (antes 2 450) | HECHO el 28-10-2026: prompt completo + estado con «Disponible al gastar» + tope de 16 000 tokens (ver `docs/decisiones-detalle.md`) |
| Civilizaciones | civilizaciones-2.0.0 | 7 815 | 2 880 | Pendiente (lo escribe Codex: coordinar) |
| Duda y apuesta | dudaapuesta-1.0.0 | 4 584 | 1 690 | Pendiente |
| Triple dado | tripledado-1.0.0 | 4 027 | 1 490 | Pendiente |
| Mayor o menor | mayormenor-2.0.0 | 3 810 | 1 410 | Pendiente |
| La Fuga | fuga-2.1.0 | 3 640 | 1 340 | Pendiente |
| Lobo | lobo-1.3.0 | 3 115 | 1 150 | Pendiente |
| El número solitario | solitario-1.0.0 | 2 398 | 885 | Pendiente |
| Subasta de tiempo | subasta-1.0.0 | 2 072 | 765 | Pendiente |
| Dilema del prisionero | (sin versión de reglas) | 1 257 | 465 | Pendiente |

Los juegos con partidas ya publicadas (Mayor o menor, Guerra, Lobo) no se pueden republicar con un prompt nuevo sin el worktree del commit anterior: el hash del prompt de sistema cambia (ver `docs/politica-publicacion.md`).

## Lecciones de Guerra de territorios (28-10-2026)

- Con prompts de bots GLM Flash casi no se cortaba (1 de 41 llamadas); con los prompts reales de su partida, 21 de 30. Los escenarios de bots no bastan para evaluar un prompt: hace falta una partida real de referencia.
- El razonamiento de las llamadas cortadas era planificación y verificación aritmética sin cerrar, no un bucle de texto; con el prompt VIEJO y prompts de bots, subir `max_tokens` a 16 000 no evitó un corte (la llamada gastó los 16 000 pensando). Lo que lo arregló fue el prompt completo: GLM Flash pasó de 21 cortes en 30 turnos reales a 0.
- El resultado fue distinto según el modelo: GLM Flash mejoró mucho; Haiku y Gemini pasaron a razonar ~2 veces más (usan lo que se les explica) y se cortaban con 8 000 tokens; Sonnet, Luna y Flash-Lite casi no cambiaron. Todos mejoraron en órdenes legales. Moraleja: probar un prompt nuevo con
  VARIOS modelos, no solo con el que dio el problema.
- Quitar bloques sueltos del prompt (errores, ejemplos, guía del estado, orden del turno) no devolvió a Haiku a su nivel anterior: el aumento de razonamiento viene del volumen de información, no de una sección. La línea «Disponible al gastar» (producción y hambre ya aplicadas) se agregó para que el modelo no calcule lo que no es el juego; no se pudo medir
  que bajara el razonamiento de Haiku (mediana 5 782 → 5 233, dentro del ruido), pero es exacta (la prueba la compara con el motor) y cerró un defecto real: «Puedes reclutar hasta» se calculaba con el almacén viejo.
- Las dudas que los modelos planteaban de verdad: qué es «Puedes reclutar hasta», el orden de resolución del turno, el desempate de combate, el redondeo de la comida, cuándo comen y mueven las tropas recién reclutadas, la sintaxis de `mover` con varios destinos,
  qué son los números de FRENTES. El prompt 2.3.0 las contesta una por una.
- El estado no le avisa al modelo qué órdenes se descartaron ni por qué (el motor lo guarda para los espectadores). Es una mejora posible del estado, no del prompt.
