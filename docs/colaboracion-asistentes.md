# Trabajo entre asistentes

`AGENTS.md` contiene las reglas comunes. Codex lo lee como instrucciones del
repositorio; `CLAUDE.md` apunta a el para compartir el mismo contrato con Claude.
Esto organiza el relevo. Para coordinar procesos automáticamente se necesita
además una llamada entre CLI; no conecta por sí solo las conversaciones abiertas.
El historial completo se consulta por tema en `docs/contexto-historico.md`;
no se carga por rutina. La skill local `contexto-proyecto` ayuda a seleccionar
documentacion y comprobaciones (ver `docs/contexto-eficiente.md`).

## Una tarea, un responsable

1. Definir un resultado comprobable y archivos de alcance acotado.
2. Elegir responsable segun la tarea y la cuota que el usuario consulte. Un
   reparto inicial posible: implementacion y pruebas con Codex; revision de
   mecanicas, narrativa y enfoque editorial con Claude. Se puede intercambiar.
3. Implementar y verificar localmente. No pedir al segundo asistente que repita
   toda la investigacion: darle el diff, decisiones y limites conocidos.
4. El revisor registra problemas concretos y evidencia; el responsable corrige.
5. Dejar el relevo en `privado/planes/relevo-asistentes.md`. Si el usuario autorizó
   trabajo conjunto, el coordinador puede iniciar revisiones acotadas y recoger
   respuestas sin que el usuario copie mensajes. Sin esa autorización, no invocar
   otro asistente. Evitar ciclos indefinidos de revisión entre modelos.

## Coordinación en vivo desde este proyecto

El 24 de octubre de 2026 el usuario autorizó volver a trabajar con Claude.
Codex puede coordinar la implementación y pedir a Claude una revisión concreta.
Un responsable edita; el segundo revisa. Para trabajo paralelo con escrituras,
asignar archivos separados o worktrees y un único integrador. No crear commits
o fusiones sin la orden que exige `AGENTS.md`.

La herramienta local prepara una revisión sin consumir cuota:

```powershell
node herramientas/revisar-con-claude.mjs --paquete=privado/revisiones/entrada.md --salida=privado/revisiones/respuesta.json
```

El coordinador añade `--ejecutar` para realizarla cuando esté dentro de la tarea
autorizada. Lee el resultado y aplica las correcciones justificadas; el usuario
permanece en una sola conversación. El paquete debe incluir objetivo, fragmentos
necesarios y preguntas específicas; nunca llaves o toda la conversación.

El proceso usa Claude Code con sesión de suscripción, un turno, Sonnet y sin
herramientas. No puede editar ni explorar archivos: solo recibe el paquete.
Desactiva hooks, skills y MCP para esa revisión; no cambia la configuración global.
No usa `--bare`: la documentación actual de Claude indica que ese modo omite
la autenticación de suscripción. No hay reintentos automáticos ni sustitución
por API. Un límite de turnos y caracteres no garantiza un gasto fijo de cuota.

Esto inicia una revisión independiente de Claude; no inserta mensajes en un chat
de Claude que ya estuviera abierto. La respuesta se guarda en privado y Codex la
recibe. La dirección inversa puede coordinarse desde Claude usando `codex exec`
con autenticación guardada y permisos mínimos. Mantener un solo coordinador por
tarea para evitar que ambos se invoquen mutuamente sin terminar.

Fuentes: [Codex no interactivo](https://learn.chatgpt.com/docs/non-interactive-mode),
[Claude programático](https://code.claude.com/docs/en/headless).

## Trabajo por lotes (acuerdo del 24 de octubre)

- Un coordinador por lote; solo él modifica `privado/planes/estado-compartido.md`.
- Contrato en un archivo: objetivo, alcance permitido/prohibido, entradas concretas,
  entrega, criterio de aceptación y momento de la revisión. No enviar todo el historial.
- Un encargo y una devolución sustancial. Una consulta al segundo asistente por
  lote, elegida antes de ejecutar: diseño previo o revisión final, no ambas por rutina.
  Segunda consulta únicamente ante un bloqueo concreto; desacuerdos de alcance los
  resuelve el usuario. No crear ciclos automáticos de mensajes o consultas periódicas.
- Un escritor por archivo. Incluye `mesa.css`, `web/paleta.js`, specs y estado.
  Paralelizar solo entregas independientes; worktrees si hacen falta. No integrar
  por commit/fusión sin la orden que requiere el contrato común.
- El responsable explora una vez, implementa y ejecuta verificaciones. El revisor
  recibe los fragmentos/diff relevantes y el resumen de evidencia; no repite toda
  la exploración o la suite salvo un cambio o un hallazgo que lo justifique.
- Al cerrar, anotar en una o dos líneas esfuerzo observado, obstáculos y si conviene
  cambiar el reparto. No transformar tokens de contexto o costos estimados de API
  en porcentajes de las cuotas de suscripción.

El usuario informó que Codex se agota antes; Claude asume por defecto specs,
narrativa/editorial y lotes funcionales autocontenidos. Codex se reserva para
integración, automatización/diagnóstico y validación visual que requiera iterar
contra navegador/CLI. Es una asignación provisional, revisable por evidencia,
no una superioridad general de un modelo. No usar «es difícil» como único criterio.

La planificación conjunta está en `privado/planes/plan-conjunto-2026-10-24.md`;
el usuario debe elegir el primer lote antes de iniciar más producto. La spec de
Civilizaciones existe y sigue pendiente de aprobación; no se autoriza implementarla
por aparecer en el plan. Adaptamos alcance, memoria y compacción de ECC sin instalar
su runtime, observadores o hooks. Ambos asistentes disponen de entradas de las
mismas skills; el procedimiento canónico vive en `.agents/skills/`.

La herramienta actual permite planificación/revisión de paquetes sin herramientas.
No se ha probado todavía un trabajador remoto de Claude que edite el repositorio.
Antes del primer lote de implementación delegado, configurar sus permisos y
archivos dentro del alcance aprobado. No confundir la revisión validada con una
infraestructura de edición paralela ya operativa.

## Presupuesto de suscripción

Anotar manualmente cuota de sesion, cuota semanal y renovacion al empezar un
bloque. Los asistentes no conocen el saldo de ambas cuentas. Como regla inicial
de organizacion, reservar un 25 % y ajustar con varios dias de consumo real.
No es una garantia de duracion ni una conversion entre tokens de proveedores.

Separar el consumo de desarrollo de las llamadas de OpenRouter del producto.
Usar bots para probar escenas y reglas; dejar partidas pagadas para una orden
con alcance y presupuesto. Reservar analisis profundo para decisiones que lo
necesiten y evitar cargar documentacion que no corresponde a la tarea.

## Relevo minimo

```text
Objetivo y alcance:
Responsable y estado:
Archivos cambiados (y cambios previos que no son nuestros):
Decisiones y motivo:
Comprobaciones y resultado:
Limitaciones / informacion pendiente:
Siguiente tarea y comando:
```

No guardar llaves, conversaciones completas ni informes de partidas ineditas en
documentacion publica. Las restricciones actuales del usuario prevalecen sobre
propuestas antiguas de revisar con otro modelo.

## Canal directo Claude→Codex (validado 24-10-2026)

El usuario instaló Codex CLI por winget. El paquete no creó el acceso corto
`codex` (la carpeta `%LOCALAPPDATA%\Microsoft\WinGet\Links` quedó vacía; el
binario real se llama `codex-x86_64-pc-windows-msvc.exe`). Se creó un
`codex.cmd` de redirección dentro de la misma carpeta del paquete
(`%LOCALAPPDATA%\Microsoft\WinGet\Packages\OpenAI.Codex_Microsoft.Winget.Source_8wekyb3d8bbwe\codex.cmd`),
que ya está en el PATH de usuario; una terminal nueva reconoce `codex` sin
pasos adicionales. El usuario se autenticó con `codex login`.

Desde Claude, el envío de una tarea ya no depende de que el usuario relaye
mensajes a mano: se invoca `codex exec "<instrucción>"` (o la ruta completa
del `.exe` si el proceso de Claude tiene el PATH en caché). Prueba de
confirmación 24-10-2026: respuesta real autenticada, `model: gpt-6.1-sol`,
`approval: never`, `sandbox: workspace-write` (puede escribir en el repo y en
/tmp sin pedir permiso paso a paso: no hay red de seguridad intermedia, así
que el encargo que se le mande debe venir ya acotado). `codex exec resume
--last "<instrucción>"` o `codex exec resume <SESSION_ID>` continúan una
sesión existente en vez de abrir una nueva. Este canal reemplaza el relevo
manual de encargos descrito abajo, pero el formato de contrato/entrega por
archivo compartido sigue vigente igual.

Forma de lanzarlo desde Claude (probada 25-10-2026): ejecutable real, no `codex.cmd`,
`exec -C <repo> -s read-only|workspace-write --json -o <entrega.md> "<prompt corto ASCII que apunta al encargo>"`,
con stdout a un `.jsonl` y en segundo plano (el aviso de fin llega como evento). No usar `--ephemeral`: la sesión
persiste y su id sale en la primera línea del `.jsonl` (`thread_id`). Las sesiones de `codex exec` quedan con
`source=exec`, no `vscode`: la extensión de VS Code no las trata como propias y una sesión no se abre a la vez
en dos sitios. Para verla, esperar a que termine y usar `codex resume <id>` en una terminal; el `.jsonl` sirve para
seguirla en vivo sin abrirla. El prompt largo va en un archivo de `privado/revisiones/` (acentos: no pasarlos
por la tubería de PowerShell 5.1, que los daña).

Cuota de Codex: el usuario reporta que se reinicia por ventanas de tiempo
(confirmado 24-10-2026, reinicio ~44 min después de cerrar el lote de
assets); no es telemetría exacta de tokens. No lanzar `codex exec` mientras el
usuario avisa que la cuota está agotada.

## Entregas por evento, sin sondeos (corrección del usuario, 24-10-2026)

- Después de enviar un lote, el coordinador no consulta archivos, diffs ni estados repetidamente para comprobar avances. No activa turnos del modelo para preguntar si ya acabó.
- El responsable escribe una entrega consolidada y avisa al terminar o al encontrar un bloqueo que requiere intervención. El proceso coordinador debe recibir la finalización como evento; una espera técnica sin inferencia no es una revisión de progreso.
- Revisar integración una sola vez después de la entrega. Usar las pruebas y evidencias del responsable; repetir solo comprobaciones requeridas que falten o por un hallazgo concreto.
- Las sesiones usadas hasta la entrega G1 fueron CLI no persistentes: no aparecieron en los chats normales de Claude. Para próximos encargos observables, usar sesión persistente y Remote Control (pestaña Code); no afirmar que una llamada CLI se sincroniza sola con la app.
- La carpeta de assets autorizada está en privado/planes/G1-aviso-assets-y-coordinacion.md. Priorizar esos dibujos antes de recrearlos.
