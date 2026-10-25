# Instrucciones y ahorro de contexto

Codex descubre `AGENTS.md`; Claude entra por `CLAUDE.md`, que remite al contrato
comun. Ambos archivos son breves. El contenido anterior completo de CLAUDE se
conserva en `docs/contexto-historico.md`, con las modificaciones que habia al
iniciar esta tarea. No se elimino ninguna decision.

El mapa de `AGENTS.md` selecciona una entrada por tema. El historial se consulta
por busqueda y seccion, no como lectura obligatoria. La politica de publicacion
se puede consultar directamente en `docs/politica-publicacion.md` al avisar una
subida; la orden mas reciente del usuario y el flujo actual prevalecen.

La skill del repositorio `.agents/skills/contexto-proyecto/SKILL.md` aplica este
flujo al retomar o cambiar de area. Se puede invocar como `$contexto-proyecto`.
Estara disponible en la siguiente interaccion; si el selector no se actualiza,
reiniciar la sesion de Codex. No necesita servicios externos ni llaves.

Se consultaron el catalogo oficial de skills y el directorio de plugins; no se
identifico un ahorro especifico que justificara instalar servicios adicionales.
La skill local mantiene el conocimiento junto al proyecto y se carga cuando
corresponde. La busqueda de plugins no instalo ni conecto cuentas.

Para el trabajo diario: acotar la tarea, usar herramientas locales, resumir logs,
reutilizar evidencia valida y dejar un relevo corto. No omitir comprobaciones
necesarias para ahorrar. Ninguna de estas medidas aumenta los limites de Plus
o Pro ni garantiza un porcentaje de ahorro en la cuota real.
Los cambios reducen contexto futuro; no recuperan tokens ya usados en este chat.

Referencias oficiales: [AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md),
[descubrimiento de skills](https://learn.chatgpt.com/docs/build-skills).
