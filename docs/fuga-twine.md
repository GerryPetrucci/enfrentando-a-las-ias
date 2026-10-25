# La Fuga: historias ramificadas con Twine

La versión **2.1.0** usa un arco de **22 lugares conectados**, en nueve rondas
máximas. Sustituye el grafo 2.0.0 de 73 nodos y salidas genéricas. Cada lugar
tiene de una a tres salidas propias; los tramos con una salida reúnen caminos
o conectan zonas. Las condiciones filtran los accesos según hechos y resultados.
Conserva las 24 escenas base como recursos para los obstáculos; todavía no se
han creado ilustraciones nuevas. El azar se prepara con seed al crear el mundo.

El motor conserva posturas, métodos, puntos y riesgos originales, y añade
consecuencias locales acotadas. Estar solo, herido o con alarma modifica el estado
sin sustituir el lugar. Elegir un método no garantiza conseguir el acceso:
las rutas que requieren éxito exigen pasar sin tropiezos con ese mismo método.

## Qué cambia en la partida

- Forzar con éxito la salida del bloque abre mantenimiento, pero deja una
  puerta dañada. En el patio ese rastro aumenta el riesgo en 6 puntos porcentuales,
  antes del límite general de probabilidad. Sigilo exitoso en los tramos indicados
  permite borrar el rastro antes de que los guardias lo encuentren.
- Engañar con éxito en el control del personal consigue una credencial individual.
  Facilita engaño en controles compatibles: reduce el riesgo en 7 puntos
  porcentuales antes de los límites. Caduca al terminar la situación 6; si falla
  mientras la usa, la detectan y deja de servir. Una credencial de un capturado
  no abre accesos al compañero.
- En el almacén, cubrir al compañero y pasar sin tropiezos recupera una cuerda.
  Es individual, facilita sigilo o fuerza en pasos compatibles en 6 puntos
  porcentuales antes de los límites, y se consume al usarla, incluso si falla.
  Elegir ayudar cuando se está solo no da esta recompensa.

Las condiciones conocidas se explican antes de actuar. Los hechos del arco son
públicos para ambos participantes y guardan autor, lugar, ronda y duración.
La narración y el guion reciben los eventos reales con su causa; no requieren
una llamada a un modelo para inventar consecuencias. Los datos viejos se siguen
reproduciendo tal como fueron guardados.

## Abrir y editar en Twine

```powershell
node herramientas/fuga-twine.mjs
```

Genera `privado/historias/fuga-2.1.0.html`. En el editor de
[Twine](https://twinery.org/2/), importar ese archivo. No es un video ni una
partida: es un archivo de autoria del grafo. No hay que instalar paquetes del
motor, pagar una API ni conectar cuentas. Guardar siempre una exportacion local.

Cada pasaje representa un nodo. Su nombre es su id; `Inicio` guarda nombre,
version e IFID de la historia. Los enlaces se llaman `salida-1`, `salida-2`, etc.
para asociarlos con las condiciones que figuran en el JSON del mismo pasaje.

El cuerpo de cada nodo permite editar:

- `ronda` y `fase`: interior 1-3, patio 4-6, perimetro 7-9.
- `escenas`: al menos tres ids distintos del catalogo de esa fase; el motor evita
  repetir una escena base dentro de la partida.
- `contexto`: frases alternativas que conectan con lo sucedido anteriormente.
- `lugar` y `objetivo`: ubicación y alternativas que se informan antes de actuar.
- `salidas`: `si`, `prioridad` y `peso`. El destino se edita en el enlace Twine
  correspondiente, no duplicandolo dentro del JSON.
- `reglas`: condiciones sobre método, postura, resultado y hechos, con un efecto
  permitido, texto y duración. El efecto se entrega después de resolver la ronda;
  una recompensa nueva no activa otra regla de esa misma ronda.
- `modificadores`: ajustes locales al riesgo condicionados por hechos anteriores,
  aplicables al actor o al grupo. Cada ajuste está limitado a ±0.10 y la suma de
  magnitudes por nodo a 0.15; no cambian directamente puntos, heridas o capturas.

Las condiciones permitidas son `alarmaMin`, `cohesionMin`, `metodo`, `postura`,
`solo`, `heridos`, `objeto`, `exito`, `hecho` y `sinHecho`.
`exito` corresponde al participante que ejecutó el método de esa condición,
no al éxito de otra persona. Todas las condiciones de una salida deben cumplirse.
Entre las elegibles se usa la prioridad mayor y luego un sorteo ponderado con
datos ya preparados. Siempre debe existir una salida por defecto (`si: {}`,
prioridad 0). Cada enlace avanza exactamente una ronda; la novena no tiene salidas.

Twine se usa para editar y revisar la red. El boton Play del formato Harlowe
no simula automaticamente los guardias, recursos o riesgos: la simulacion oficial
la hace el motor Node. No escribir macros Harlowe ni JavaScript en estos pasajes;
el importador solo admite datos del contrato y nunca ejecuta el HTML.

## Traer una historia editada al repositorio

Exportar la historia desde Twine a un archivo HTML y ejecutar:

```powershell
node herramientas/fuga-twine.mjs --importar=privado/historias/fuga-editada.html --version=fuga-2.2.0 --salida=privado/historias/fuga-2.2.0.json
```

Primero se valida sin tocar la historia activa. Si el contenido cambia se exige
una version distinta. Para adoptar la historia revisada, usar como salida
`src/juegos/fuga/historia.json` con `--forzar`, conservando una copia del borrador.
La version de reglas del juego toma la version de ese archivo automaticamente.
Luego ejecutar las pruebas y medir con bots antes de usar modelos reales:

```powershell
node --test src/pruebas/fuga/*.test.js src/pruebas/escena/lineafuga.test.js
node herramientas/medir-fuga-historias.mjs --partidas=400 --salida=privado/planes/medicion-fuga.json
```

El resultado de cada partida guarda la version, huella del grafo y recorrido;
cada ronda guarda su nodo y contexto. Las series rotadas comparten el mismo
mundo y dados; pueden tomar caminos diferentes si sus acciones o consecuencias
difieren. Los registros viejos conservan su historia original al reproducirlos.

Los hechos permitidos son `puerta_forzada`, `rastro_borrado`, `credencial`,
`credencial_detectada`, `cuerda` y `cuerda_gastada`. Una regla registra un hecho
por actor una sola vez; `duracion` cuenta rondas a partir de su adquisición,
sin superar la novena. Ampliar este vocabulario requiere código y pruebas.
Twine no permite introducir efectos arbitrarios ni código ejecutable.

Formato de intercambio: [especificacion oficial de Twine 2](https://github.com/iftechfoundation/twine-specs/blob/master/twine-2-archive-spec.md).
