---
name: colaboracion-por-lotes
description: Coordinar encargos aprobados entre Codex y Claude mediante paquetes y entregas por lote, con un responsable y contexto acotado. Usar al planear o ejecutar trabajo conjunto en este repositorio.
---

# Colaboración por lotes

Aplicar AGENTS.md. Leer `privado/planes/estado-compartido.md`, el lote elegido
y la sección de lotes en `docs/colaboracion-asistentes.md`. No cargar todos los
planes o repetir la exploración del otro asistente.

- Un coordinador, un responsable de escritura y un revisor por lote. Definir
  archivos, resultado visible, entradas y aceptación antes de empezar.
- Preferir un encargo sustancial y una devolución consolidada. Segunda vuelta
  solo por hallazgos bloqueantes; no conversar por cada función.
- Contexto suficiente y seleccionado. «Por lotes» no significa enviar todo el
  historial. Dividir por resultados independientes cuando el paquete sea excesivo.
- Si Codex es el recurso escaso, priorizar trabajo autónomo de Claude y reservar
  Codex para integración, casos difíciles y revisión acotada. Es reparto por
  presupuesto, no una superioridad demostrada de los modelos.
- Sin llamadas periódicas, observadores ni ping-pong automático. Ejecutar las
  verificaciones deterministas sin pedir a los modelos que las repitan o narren.
- Una entrega con resultado, archivos, pruebas/capturas, límites y siguiente acción.
  Actualizar el estado único e indicar quién puede retomar.
- El usuario elige el primer lote antes de ejecutar producto. El plan no autoriza
  API pagada, commit, publicación o integración de cambios ajenos.

Adapta alcance, memoria y compacción de ECC según la revisión local
`privado/planes/revision-ecc-2026-10-24.md`; no requiere instalar ECC.

## Protocolo corregido por el usuario (24-10-2026)

Un encargo y una entrega final con aviso de terminación/bloqueo. No consultar repetidamente estados, archivos ni diffs durante el trabajo del otro modelo. La espera del proceso debe resolverse por evento, sin turnos del modelo para sondear. Revisar integración al final y no duplicar pruebas ya comprobadas salvo exigencia pendiente o fallo concreto.
