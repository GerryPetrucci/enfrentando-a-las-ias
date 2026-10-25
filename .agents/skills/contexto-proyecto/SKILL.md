---
name: contexto-proyecto
description: Retomar o acotar trabajo en Enfrentando a las IAs seleccionando contexto, pruebas y relevo por tema. Usar al iniciar una tarea del repositorio o cambiar de area; no para consultas generales fuera del proyecto.
---

# Contexto del proyecto bajo demanda

Aplicar `AGENTS.md` sin duplicarlo en la respuesta. No cargar por rutina
`CLAUDE.md`, el historial de decisiones, todos los planes ni todas las partidas.

- Consultar `git status --short` y `privado/planes/estado-compartido.md`.
  El relevo histórico solo se consulta cuando falte una decisión del tema actual.
- Elegir la entrada del mapa de `AGENTS.md`. Buscar simbolos con `rg -n` y leer
  funciones o secciones acotadas. Una referencia no implica leerla entera.
- Ampliar a otras areas solo cuando imports, fallos o reglas lo requieran.
  Si una salida se trunca, reducir el alcance; no repetir un volcado mayor.
- Usar las herramientas existentes para medicion/capturas. Para probar graficos,
  elegir una ronda representativa y ambos formatos; ampliar por un hallazgo real.
- Ejecutar pruebas afectadas y despues la suite requerida al cerrar codigo.
  Guardar logs extensos en privado y leer su resumen; investigar solo los fallos.
- Registrar objetivo, cambios, pruebas, limites y siguiente comando al relevar.
  Archivar detalles anteriores si el encabezado empieza a crecer; no borrar hechos.

No convertir bytes o palabras en porcentajes de cuota. Medir volumen de contexto
por separado de uso real del proveedor. Este flujo reduce lecturas repetidas;
no cambia limites del plan ni autoriza llamadas pagadas o nuevos agentes.
