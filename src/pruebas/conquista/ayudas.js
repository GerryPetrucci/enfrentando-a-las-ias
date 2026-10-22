// Ayudas compartidas por las pruebas de la Guerra de territorios. No es un archivo de pruebas.
import { crearRng } from '../../rng.js';
import { crearMapa } from '../../mapa.js';
import { crearEstado, nombreRegion, regionesDe, contarEdificios, tropasDe, ponerTropas, limpiarRegion, totalPila, N_TIPOS } from '../../juegos/conquista/estado.js';
import { normalizarRespuesta } from '../../juegos/conquista/ordenes.js';
import { nuevoContexto } from '../../juegos/conquista/turno/contexto.js';
import assert from 'node:assert/strict';
import { EDIFICIOS } from '../../juegos/conquista/constantes.js';
import { aplicarTurno } from '../../juegos/conquista/turno/index.js';
import { BOTS } from '../../juegos/conquista-bots.js';
import { construirSistema, construirUsuario } from '../../prompt.js';
import conquista from '../../juegos/conquista.js';
import { vistaTexto } from '../../juegos/conquista/vista.js';

const cacheMapas = new Map();
export function mapaDe(seed, k, bioma = 'continente') {
  const c = `${seed}|${k}|${bioma}`;
  if (!cacheMapas.has(c)) cacheMapas.set(c, crearMapa(seed, k, { bioma }));
  return cacheMapas.get(c);
}
// Estado nuevo con una COPIA de las regiones, para que cada prueba pueda cambiarles terreno o recurso sin afectar a las demas.
export function nuevoEstado(k = 4, seed = 7, bioma = 'continente') {
  const m = mapaDe(seed, k, bioma);
  const copia = { ...m, regs: m.regs.map((r) => ({ ...r, vecinos: [...r.vecinos] })) };
  return crearEstado(crearRng(seed), { jugadores: k, mapa: copia });
}
export const R = nombreRegion; // R(0) === 'R01'
// Semantica de la antigua asignacion E.tropas[r] = n (antes del modelo de unidades): deja en la region EXACTAMENTE n Lanceros de su dueno y nada mas (borra cualquier otra pila).
// Con n > 0 la region ya debe tener dueno (si no, ponerTropas lanza: asi una prueba mal ordenada falla fuerte en vez de dejar unidades huerfanas).
export function fijarTropas(E, r, n) { limpiarRegion(E, r); if (n > 0) ponerTropas(E, r, n); }
export { tropasDe };
export const capital = (E, s) => E.reinos[s].capital;
export const resp = (extra = {}) => ({ ordenes: [], pacto_con: null, mensaje: '', privados: [], razon: '', ...extra });
// jugadas normalizadas: porReino = { 0: { ordenes: [...] }, 2: {...} }; los reinos sin entrada no dan ordenes; los caidos son null
export function jugadasDe(E, porReino = {}) {
  return E.reinos.map((r, s) => (r.vivo ? normalizarRespuesta(resp(porReino[s] ?? {})) : null));
}
// una region que tiene dos vecinas A y C que no son vecinas entre si (para 2 pasos de distancia): devuelve [a, w, c]
export function dosPasos(E) {
  const regs = E.mapa.regs;
  for (const w of regs) for (const a of w.vecinos) for (const c of w.vecinos) if (a < c && !regs[a].vecinos.includes(c)) return [a, w.id, c];
  throw new Error('el mapa no tiene dos regiones a 2 pasos');
}
// una region d con dos vecinas distintas a y b: devuelve [a, d, b]
export function vecinaComun(E) {
  for (const d of E.mapa.regs) if (d.vecinos.length >= 2) return [d.vecinos[0], d.id, d.vecinos[1]];
  throw new Error('el mapa no tiene una region con dos vecinas');
}

// contexto de un turno con las jugadas indicadas ya normalizadas
export const contexto = (E, porReino = {}) => nuevoContexto(E, jugadasDe(E, porReino));
// [a, d]: una region a del reino s con una vecina d que pertenece a `quien` (-1 = sin dueno)
export function frontera(E, s, quien = -1) {
  for (const a of regionesDe(E, s)) for (const d of E.mapa.regs[a].vecinos) if (E.dueno[d] === quien) return [a, d];
  throw new Error(`el reino ${s} no tiene vecina de ${quien}`);
}

// Comprueba lo que NUNCA debe pasar, turno a turno.
export function verificarInvariantes(E) {
  const NR = E.mapa.regs.length;
  for (let r = 0; r < NR; r++) {
    const d = E.dueno[r];
    assert.ok(d >= -1 && d < E.k, `dueno invalido en R${r + 1}`);
    assert.ok(Number.isInteger(tropasDe(E, r)) && tropasDe(E, r) >= 0, `tropas invalidas en R${r + 1}`);
    if (d === -1) { assert.equal(tropasDe(E, r), 0, `region sin dueno con tropas R${r + 1}`); assert.equal(E.edif[r], null, `edificio sin dueno R${r + 1}`); }
    else assert.ok(tropasDe(E, r) >= 1, `region del reino ${d} sin tropas R${r + 1}`);
    assert.ok(E.fort[r] >= 0 && E.fort[r] <= 3);
    for (let k = 0; k < E.k; k++) if (k !== d) assert.equal(totalPila(E, r, k), 0, `unidades del reino ${k} en R${r + 1}, que es de ${d} (todavia no hay invitados)`);
  }
  E.reinos.forEach((r, s) => {
    assert.ok(r.honor >= 0 && r.honor <= 10, `honor fuera de rango en ${r.nombre}`);
    assert.ok(r.mejoras.length === 4 && r.mejoras.every((x) => Number.isInteger(x) && x >= 0 && x <= 2), `mejoras fuera de rango en ${r.nombre}`);
    for (const [rec, v] of Object.entries(r.stock)) assert.ok(Number.isInteger(v) && v >= 0, `${r.nombre} ${rec}=${v}`);
    if (r.vivo) assert.equal(E.dueno[r.capital], s, `la capital de ${r.nombre} no es suya y sigue vivo`);
    else assert.equal(regionesDe(E, s).length, 0, `${r.nombre} cayo y conserva regiones`);
    for (const tipo of Object.keys(EDIFICIOS)) assert.ok(contarEdificios(E, s, tipo) <= 3, `${r.nombre} pasa de 3 edificios de ${tipo}`);
  });
  if (E.maravilla) assert.ok(E.mapa.inicio.capitales.includes(E.maravilla.r), 'la Maravilla no esta en una capital');
}

// Juega una partida entera con bots de control. Solo pregunta a los reinos vivos.
export function jugarCompleta(k, seed, nombresBots = ['agresivo', 'pacifico', 'economico', 'azar']) {
  const E = crearEstado(crearRng(seed), { jugadores: k, mapa: mapaDe(seed, k) }), rngBots = crearRng((seed ^ 0xb07) >>> 0), registros = [];
  let llamadas = 0;
  while (E.ganador === null) {
    const jugadas = E.reinos.map((r, s) => {
      if (!r.vivo) return null;
      llamadas++;
      return normalizarRespuesta(BOTS[nombresBots[s % nombresBots.length]](E, s, rngBots));
    });
    registros.push(aplicarTurno(E, jugadas));
    verificarInvariantes(E);
    if (E.turno > 31) throw new Error('la partida no termina');
  }
  return { E, llamadas, registros };
}

// Todo el texto que ven las IAs en una partida completa de bots: la vista de cada reino vivo en cada turno, antes de que juegue. Lo usa la huella de vista.test.js,
// que protege el prompt de cualquier cambio de datos del motor (la escena de la Guerra de territorios agrega campos a los registros: el texto no se puede mover).
export function vistasDePartida(seed, k = 4, nombresBots = ['agresivo', 'pacifico', 'economico', 'azar']) {
  const E = crearEstado(crearRng(seed), { jugadores: k, mapa: mapaDe(seed, k) }), rngBots = crearRng((seed ^ 0xb07) >>> 0), vistas = [];
  while (E.ganador === null) {
    const jugadas = E.reinos.map((r, s) => {
      if (!r.vivo) return null;
      vistas.push(vistaTexto(E, s));
      return normalizarRespuesta(BOTS[nombresBots[s % nombresBots.length]](E, s, rngBots));
    });
    aplicarTurno(E, jugadas);
    if (E.turno > 31) throw new Error('la partida no termina');
  }
  return vistas;
}

// --- Tamano del prompt: lo usan prompt.test.js y herramientas/medir-prompt.mjs, para medir lo mismo ---
export const CARACTERES_POR_TOKEN = 1.97; // Claude en espanol (los demas modelos cuentan menos tokens)
export const TOPE_TOKENS_ENTRADA = 6000;  // excepcion de la Guerra de territorios (CLAUDE.md): 4,450 hasta 1.1.0; 6,000 desde el 22 de octubre de 2026 (2.0.0, decision delegada por el usuario)
export const tokensDelPrompt = (E, i = 0) =>
  Math.round((construirSistema(conquista).length + construirUsuario(vistaTexto(E, i)).length) / CARACTERES_POR_TOKEN);
// El peor caso de 5 reinos: mapa lleno de tropas y edificios, y los 4 rivales mandando mensaje, privado y nota al largo maximo.
export function estadoPeorCaso(seed = 7, bioma = 'continente') {
  const E = nuevoEstado(5, seed, bioma);
  E.turno = 13;
  for (let r = 0; r < E.dueno.length; r++) { E.dueno[r] = r % 5; fijarTropas(E, r, 12); E.fort[r] = 1; if (r % 3 === 0) { E.edif[r] = 'granja'; E.dan[r] = r % 2; } }
  E.reinos[0].nota = 'n'.repeat(250);
  E.reinos[0].privIn = [1, 2, 3, 4].map((de) => ({ de, texto: 'p'.repeat(140) }));
  E.reinos[0].ofertasIn = [{ de: 1, doy: 'Hierro', dc: 10, pido: 'Madera', pc: 10 }, { de: 2, doy: 'Hierro', dc: 10, pido: 'Madera', pc: 10 }];
  E.reinos[0].pactos[1] = 20; E.reinos[0].propuestaPrevia = 3;
  E.mensajesPrevios = [1, 2, 3, 4].map((k) => ({ k, texto: 'm'.repeat(140) }));
  E.resumenPrevio = Array.from({ length: 8 }, (_, i) => `Azur conquisto R${i + 10} de Ambar`);
  E.regalosPrevios[0] = [{ de: 1, a: 0, recurso: 'Madera', n: 3 }];
  E.maravilla = { r: E.reinos[1].capital, k: 1, n: 2, t0: 3 };
  return E;
}
