// Reproduce ordenes ya registradas para revisar vistas, sin volver a decidir.
// Se limita a registros integros de control: nunca rellena respuestas ausentes.
import { isDeepStrictEqual } from 'node:util';
import { crearRng } from '../../rng.js';
import J from '../civilizaciones.js';

export function reconstruirVistas(partida) {
  if (partida?.juego?.id !== J.id || !Number.isInteger(partida.seed)
    || !partida.temporada || !Array.isArray(partida.rondas)
    || partida.fundaciones?.length !== J.jugadores) throw new Error('registro de Civilizaciones incompleto');
  const E = J.crear(crearRng(partida.seed), { seedTemporada: partida.temporada.seed, bioma: partida.bioma });
  if (!isDeepStrictEqual(E.temporada, partida.temporada)
    || E.seedMundo !== partida.seedMundo || !isDeepStrictEqual(J.resultado(E).mapa, partida.mapa)) {
    throw new Error('el catalogo o mundo guardado no coincide con el motor actual');
  }
  const vistas = [];
  for (const r of partida.rondas) {
    if (r.turno !== E.turno + 1 || r.civs?.length !== J.jugadores
      || r.respuestas?.length !== J.jugadores || !r.instantanea
      || r.errores?.some(Boolean) || r.civs.some((c) => c.invalida || c.descartadas?.length
        || c.ordenes?.some((o) => o.estado !== 'aplicada'))) throw new Error(`registro no reconstruible en turno ${r.turno}`);
    const jugadas = E.civs.map((_, s) => {
      const f = partida.fundaciones[s], respuesta = r.respuestas[s];
      if (!respuesta || !f.valida) throw new Error('solo se admiten controles con respuestas y fundaciones validas');
      vistas.push({ turno: r.turno, s, vista: J.vista(E, s) });
      return J.normalizar({
        ...(r.turno === 1 ? { fundacion: { nombre: f.nombre, lema: f.lema, rasgos: [...f.rasgos], sitio: f.sitio + 1 } } : {}),
        ordenes: r.civs[s].ordenes.map((o) => o.texto),
        nota: respuesta.nota, mensaje: respuesta.mensaje, razon: respuesta.razon,
      }, E);
    });
    const nuevo = J.aplicar(E, jugadas);
    if (!isDeepStrictEqual(nuevo.instantanea, r.instantanea)
      || !isDeepStrictEqual(nuevo.eventos, r.eventos)) throw new Error(`reproduccion divergente en turno ${r.turno}`);
  }
  return vistas;
}
