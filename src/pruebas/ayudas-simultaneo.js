// Fixture sin reglas de producto: turnos simultáneos para probar lotes, errores y rotación.
export default {
  id: 'simultaneo', nombre: 'Fixture simultáneo', categoria: 'Pruebas', versionReglas: 'fixture-1',
  minJugadores: 2, maxJugadores: 5, rondas: 30, mismoSeedEnSerie: true,
  reglas: 'Devuelve una lista de órdenes. Fixture de pruebas.', formatoRespuesta: '{"ordenes": []}',
  bots: Object.fromEntries(['agresivo', 'pacifico', 'economico', 'azar'].map(id => [id, { nombre: id, fn: () => ({ ordenes: [] }) }])),
  crear: (rng, { jugadores, ...opciones }) => ({ turno: 0, jugadores, opciones }),
  terminado: E => E.turno >= 30,
  vista: (E, i) => ({ turno: E.turno + 1, asiento: i }),
  normalizar: r => ({ ordenes: r?.ordenes ?? [], invalida: !Array.isArray(r?.ordenes), razon: r?.razon ?? '' }),
  aplicar(E, respuestas) { return { turno: ++E.turno, respuestas }; },
  resultado: E => ({ puntos: Array(E.jugadores).fill(0), ganador: null, empate: true, metricas: Array.from({ length: E.jugadores }, () => ({})), opciones: E.opciones }),
};
