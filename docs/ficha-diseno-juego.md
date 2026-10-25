# Ficha de diseno y revision de un juego

Copiar esta plantilla a `privado/spec/` antes de modificar un juego. Complementa
la spec tecnica existente: no duplicar formulas ni valores que ya tienen una
fuente unica. Anotar su ruta y version. Un borrador no es una regla aprobada.

El enfoque conecta mecanicas, dinamicas y experiencia deseada, siguiendo el
[articulo MDA de Hunicke, LeBlanc y Zubek](https://www.cs.northwestern.edu/~hunicke/MDA.pdf).
Las metricas de espectador se verifican aparte de las metricas del jugador.

## Identidad y experiencia

- Juego / version / documento de reglas:
- Participantes y rotaciones:
- Emocion principal y secundaria:
- Decision que debe entender alguien que nunca ha visto el juego:
- Que genera tension y que permite al rival responder:
- Duracion de simulacion y duracion narrada objetivo (son distintas):

## Contrato del motor

- Estado, recursos y condiciones iniciales:
- Informacion publica, privada y momento exacto de cada revelacion:
- Acciones validas, requisitos, costos y efectos:
- Resolucion simultanea, orden y prioridad:
- Azar reproducible y limites de turnos:
- Victoria, derrota y empates:
- Politica de accion invalida, errores del proveedor y partida truncada:
- Fuentes del codigo que definen lo anterior:

## Dinamicas que hay que comprobar

| Hipotesis | Bot o escenario de control | Medicion | Criterio fijado antes de probar |
|---|---|---|---|
| Una estrategia domina sin contrajuego | | | |
| El lider temprano casi siempre gana | | | |
| Un asiento o situacion inicial da ventaja | | | |
| Una accion parece util pero nunca conviene | | | |
| El azar decide mas que las decisiones | | | |
| Una derrota temprana deja demasiado tiempo sin tension | | | |

Fijar seeds, numero de pruebas y version; medir con bots primero. Registrar
dispersion e incertidumbre. No atribuir a modelos resultados obtenidos con bots.

## Integracion y costo

- Prompt versionado y limites de informacion:
- Esquema de respuesta y validacion del motor:
- Parametros iguales entre rivales y presupuesto por llamada/partida:
- Reintentos, cache y datos de uso que se conservaran:
- Orden expresa y tope para cualquier prueba con modelos pagados:

## Historia para el espectador

- Gancho verificable en los datos, sin exagerar la evidencia:
- Regla explicable en una frase:
- Decision central, consecuencia y posible giro:
- Marcador y dato visible que ayudan a entender esa consecuencia:
- Que se omite si es resumen y como se avisa:
- Acceso al registro completo, contexto de la serie y spoilers permitidos:
- Pregunta concreta de cierre:
- Duracion medida con voz real y minutos humanos de produccion:
- Capturas vertical/horizontal y lectura en movil:

## Historial y aceptacion

- Problema observado y evidencia anterior:
- Una modificacion propuesta y comportamiento esperado:
- Pruebas que detectan el problema, medicion posterior y efecto secundario:
- Cambio de version requerido y tratamiento de partidas anteriores:
- Pendientes, responsable y estado de aprobacion:
