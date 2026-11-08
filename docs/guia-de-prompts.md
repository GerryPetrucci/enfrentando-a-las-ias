# Cómo se escribe el prompt de un juego

Regla decidida el 28 de octubre de 2026 (está en `AGENTS.md`). Vale para los juegos ya hechos y para los futuros.

## El principio

Los modelos tienen que jugar **el juego que diseñamos**. Si el prompt es escaso y el modelo gasta su pensamiento en adivinar qué significa `g`, cuándo se gasta la Comida o si un empate favorece al defensor, no está jugando
una parte del juego: está jugando a descifrarlo, y eso sesga el resultado (castiga a los modelos que razonan más caro o que se quedan sin espacio, no a los que juegan peor).

- **La claridad va primero. El costo se analiza después.** Nunca se recorta claridad para caber en un tope de tokens. El tope de tokens del prompt aprobado es una medida de seguridad que se sube con orden del usuario
  cuando el texto lo pide, no un presupuesto de diseño.
- **Un prompt largo no es automáticamente claro.** Se mide (ver «Medir antes de adoptar»): lo que cuenta es si los modelos entienden, no cuántas líneas hay.
- **Todos los modelos reciben exactamente el mismo texto** (el contrato de `src/prompt.js`). Nada de prompts a la medida de un modelo.
- **No se les dice cómo jugar bien.** Se les explica cómo funciona el juego. Una lista de «consejos de estrategia» sesga igual que un prompt escaso.

## Qué debe contener el prompt de un juego

Lista de verificación. Cada punto responde a una duda real que un modelo planteó en su razonamiento verificable contra el motor.

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
2. **Los números salen de las constantes y los ejemplos se calculan con el motor.** La plantilla del texto es código (`src/juegos/<id>/reglas-texto.js`): si un número cambia, el prompt cambia solo y sube `versionReglas`.
3. **Los textos de ejemplo del estado se generan con el motor** y se limpian (los bots escriben cosas como «Plan: lancero-masa»; en el prompt van textos inventados y neutros).
4. **Acentos:** los prompts van sin acentos ni eñe (es parte del contrato). Esta guía sí los lleva.

## Medir antes de adoptar

Probar variantes sobre prompts reales de producción antes de adoptarlas, sin
alterar partidas. `herramientas/examen-modelos.mjs --juego=lobo` prepara dos vistas
reales del motor (noche y día), estima costos y permite `--sistema` y `--reemplazar`.
La reconstrucción de una partida guardada de Lobo aún no está implementada:
no presentar estas dos vistas como una rejugada de todas sus llamadas.

Las mediciones con modelos necesitan orden y presupuesto. Comparar mismas vistas,
modelos y parámetros; medir JSON válido, acciones legales, cortes por tokens y
costo, separando cambios de redacción de cambios de límites. Un resultado negativo
también se registra. Más claridad puede aumentar el razonamiento de salida.

## Costo y adopción

Analizar el costo después de escribir el texto completo. Medir entrada y salida
con `usage`, precios del catálogo y número de llamadas por fase. La caché de
prefijo configurada en `src/parametros.js` no cambia el texto que recibe cada IA.
No asumir el mismo tokenizador ni ahorro entre proveedores.

1. Borrador y comprobaciones contra el motor en `privado/spec/`.
2. Análisis de costo y aprobación de cualquier aumento del tope.
3. Variantes controladas sobre los mismos prompts; llamadas solo autorizadas.
4. Actualizar `reglas-texto.js`, `versionReglas` y pruebas tras aprobar la variante.
5. Registrar decisión y límites; no comparar como equivalentes partidas con prompts distintos.

## Estado de Lobo

El prompt completo se adoptó como `lobo-1.4.0` el 29-10-2026, ver
`docs/decisiones-detalle.md`. Por decisión del usuario no se hizo entonces una
comparación con modelos; la verificación fue contra el motor y las pruebas.
Generar un estado de ejemplo con `node herramientas/ejemplo-estado-lobo.mjs`.
