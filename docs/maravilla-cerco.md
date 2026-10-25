# Guerra de territorios 2.1.0: cerco de la Maravilla

La Maravilla mantiene el costo 21 Roca, 17 Madera, 13 Hierro y 13 Oro y necesita
nueve turnos de avance. La nueva regla permite interrumpirla **sin conquistar
la capital ni eliminar a su propietario**:

- Un ejercito enemigo de al menos tres unidades, situado en una region vecina,
  bloquea el avance mientras siga ahi. No se suman pilas menores de reinos distintos.
- Un pacto vigente con el propietario impide que ese reino forme el cerco.
- El progreso queda pausado; no desaparece. Al despejar todos los cercos o pactar,
  vuelve a avanzar. La captura de la Maravilla sigue reiniciando el contador.
- El comienzo y fin del cerco se registran, se anuncian a los jugadores y aparecen
  en la narracion/feed de la escena. No se adelanta el resultado de ninguna accion.

Se usan movimientos, defensa y diplomacia existentes; no hay que aprender otra
orden. La version del juego y el prompt cambian a `conquista-2.1.0`.
Las partidas nuevas guardan el umbral para la reconstruccion; en registros sin
ese campo se reconstruye el comportamiento anterior sin cerco. La fidelidad de
la rejugada comprueba tambien el contador y el estado de la Maravilla.

## Comparar sin gastar API

```powershell
node herramientas/medir-conquista.mjs --partidas=300 --mezcla=tipos --cerco=0 --json
node herramientas/medir-conquista.mjs --partidas=300 --mezcla=tipos --cerco=3 --json
node herramientas/medir-conquista.mjs --partidas=300 --mezcla=diplomacia --cerco=0 --json
node herramientas/medir-conquista.mjs --partidas=300 --mezcla=diplomacia --cerco=3 --json
```

La opcion 0 sirve como control de la regla; no es el valor del juego actual.
Comparar mismas semillas y mezclas. Los bots son controles, no evidencia de
superioridad de modelos ni garantia de frecuencia en sus partidas. Las nuevas
partidas con modelos necesitan orden expresa y presupuesto.
