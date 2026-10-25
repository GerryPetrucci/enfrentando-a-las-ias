import { CONFIGURACIONES, VERSION } from './constantes.js';

export function crearEstado(rng, { jugadores = 8 } = {}) {
  const c = CONFIGURACIONES[jugadores];
  if (!c) throw new Error('Lobo admite exactamente 8 o 12 jugadores.');
  const roles = [...Array(c.lobos).fill('lobo'), ...Array(c.videntes).fill('vidente'), 'bruja', 'cazador', 'cupido', ...Array(c.aldeanos).fill('aldeano')];
  for (let i = roles.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [roles[i], roles[j]] = [roles[j], roles[i]];
  }
  return {
    versionReglas: VERSION, jugadores, roles, vivos: roles.map(() => true),
    ronda: 1, maxRondas: c.rondas, fase: 'cupido', fin: false, ganadorBando: null,
    motivoFin: null, enamorados: [], pociones: { salvar: true, matar: true },
    inspecciones: roles.map(() => []), puntos: roles.map(() => 0),
    stats: roles.map(() => ({ acciones: 0, invalidas: 0, aciertos: 0 })),
    victima: null, veneno: null, salvada: false, cazadoresPendientes: [], despuesCazador: null,
    historial: [], eventos: [], declaraciones: [], cupidoRevelado: null,
    // Reserva fija: reemplazos independientes de las respuestas y serializables.
    reemplazos: Array.from({ length: 80 }, () => roles.map(() => [rng(), rng()])),
  };
}

export function activosDe(E) {
  return E.roles.map((rol, i) => !E.fin && (E.fase === 'cazador'
    ? E.cazadoresPendientes[0] === i
    : E.vivos[i] && (E.fase === 'dia' || ({ cupido: 'cupido', lobos: 'lobo', bruja: 'bruja', vidente: 'vidente' }[E.fase] === rol))));
}
