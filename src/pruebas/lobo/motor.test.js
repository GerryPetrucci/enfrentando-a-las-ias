import test from 'node:test';
import assert from 'node:assert/strict';
import juego from '../../juegos/lobo.js';
import { crearRng } from '../../rng.js';
import { vistaDe, vistaCamara } from '../../juegos/lobo/vista.js';
import { correrPartida } from '../../arena.js';
import { simular } from '../../../herramientas/medir-lobo.mjs';

function estado() {
  const E = juego.crear(crearRng(7));
  E.roles = ['lobo', 'lobo', 'vidente', 'bruja', 'cazador', 'cupido', 'aldeano', 'aldeano'];
  return E;
}
function paso(E, respuestas) {
  return juego.aplicar(E, E.roles.map((_, i) => respuestas[i] ?? null));
}
function abrir(E, pareja = [5, 6]) { paso(E, { 5: { enamorados: pareja } }); }
function noche(E, victima, { salvar = false, matar = null, inspeccionar = 0 } = {}) {
  paso(E, Object.fromEntries(E.roles.flatMap((r, i) => r === 'lobo' && E.vivos[i] ? [[i, { accion: 'matar', objetivo: victima }]] : [])));
  if (E.fase === 'bruja') paso(E, { 3: { salvar, matar } });
  if (E.fase === 'vidente') paso(E, { 2: { accion: 'inspeccionar', objetivo: inspeccionar } });
}
function dia(E, voto) {
  return paso(E, Object.fromEntries(E.vivos.flatMap((v, i) => v ? [[i, { mensaje: '', voto: i === voto ? (voto === 0 ? 1 : 0) : voto }]] : [])));
}

test('reparto reproducible y composición exacta de ambas mesas; solo 8/12', () => {
  for (const jugadores of [8, 12]) {
    const a = juego.crear(crearRng(123), { jugadores });
    assert.deepEqual(a, juego.crear(crearRng(123), { jugadores }));
    assert.equal(a.roles.filter((r) => r === 'lobo').length, jugadores === 8 ? 2 : 3);
    assert.equal(a.roles.filter((r) => r === 'aldeano').length, jugadores === 8 ? 2 : 4);
    assert.equal(a.roles.filter((r) => r === 'vidente').length, jugadores === 8 ? 1 : 2);
    for (const rol of ['bruja', 'cazador', 'cupido']) assert.equal(a.roles.filter((r) => r === rol).length, 1);
  }
  for (const jugadores of [0, 9, 10, 11, 13]) assert.throws(() => juego.crear(crearRng(0), { jugadores }));
  assert.notDeepEqual(juego.crear(crearRng(1)).roles, juego.crear(crearRng(2)).roles);
});

test('lobos requieren consenso: desacuerdo no mata; bruja conoce null', () => {
  const E = estado(); abrir(E);
  paso(E, { 0: { accion: 'matar', objetivo: 6 }, 1: { accion: 'matar', objetivo: 7 } });
  assert.equal(E.victima, null);
  assert.equal(vistaDe(E, 3).victima, null);
  paso(E, { 3: { salvar: false, matar: null } });
  paso(E, { 2: { accion: 'inspeccionar', objetivo: 0 } });
  assert.ok(E.vivos.every(Boolean)); assert.equal(E.fase, 'dia');
});

test('bruja puede salvarse y usar ambas pociones; cada una una sola vez', () => {
  const E = estado(); abrir(E);
  noche(E, 3, { salvar: true, matar: 0 });
  assert.equal(E.vivos[3], true); assert.equal(E.vivos[0], false);
  assert.deepEqual(E.pociones, { salvar: false, matar: false });
  assert.equal(E.stats[3].aciertos, 2);
  dia(E, 7);
  paso(E, { 1: { accion: 'matar', objetivo: 3 } });
  const r = paso(E, { 3: { salvar: true, matar: 1 } });
  assert.equal(r.invalidas[3], true);
  assert.equal(E.salvada, false); assert.equal(E.veneno, null);
  paso(E, { 2: { accion: 'inspeccionar', objetivo: 1 } });
  assert.equal(E.vivos[3], false);
});

test('vidente inspecciona antes de morir; resultado solo en su vista privada', () => {
  const E = estado(); abrir(E);
  noche(E, 2);
  assert.equal(E.vivos[2], false);
  assert.deepEqual(vistaDe(E, 2).inspecciones, [{ ronda: 1, objetivo: 0, esLobo: true }]);
  assert.deepEqual(vistaDe(E, 6).inspecciones, []);
  assert.equal(E.stats[2].aciertos, 1);
});

test('amor encadena muerte y cazador dispara antes de declarar victoria', () => {
  const E = estado(); abrir(E, [0, 4]);
  noche(E, 4, { matar: 1 });
  assert.equal(E.vivos[0], false); assert.equal(E.vivos[1], false);
  assert.equal(E.fin, false); assert.equal(E.fase, 'cazador');
  assert.deepEqual(juego.activos(E), [false, false, false, false, true, false, false, false]);
  paso(E, { 4: { accion: 'disparar', objetivo: 7 } });
  assert.equal(E.fin, true); assert.equal(E.ganadorBando, 'aldea');
  assert.equal(E.vivos[7], false); assert.ok(E.puntos[7] >= 10);
  assert.equal(E.puntos[0], 0); assert.deepEqual(juego.resultado(E).enamoradosGanadores, []);
});

test('cazador linchado dispara; el disparo propaga amor y puntúa lobo', () => {
  const E = estado(); abrir(E, [0, 1]); noche(E, 7);
  dia(E, 4);
  assert.equal(E.fase, 'cazador');
  paso(E, { 4: { accion: 'disparar', objetivo: 0 } });
  assert.equal(E.ganadorBando, 'aldea'); assert.equal(E.vivos[1], false);
  assert.equal(E.stats[4].aciertos, 2); assert.equal(E.puntos[4], 12); // Votó al lobo antes de morir y luego disparó.
});

test('paridad no termina; lobos ganan solo al eliminar a todos los demás', () => {
  const E = estado(); abrir(E, [0, 1]);
  E.vivos = [true, true, false, false, false, false, true, true];
  noche(E, 6);
  assert.equal(E.fin, false); assert.equal(E.fase, 'dia');
  dia(E, 7);
  assert.equal(E.ganadorBando, 'lobos');
  assert.deepEqual(juego.resultado(E).ganadores, [0, 1]);
  assert.deepEqual(juego.resultado(E).enamoradosGanadores, [0, 1]);
  assert.equal(E.puntos[0], 16); assert.equal(E.puntos[1], 16);
});

test('empate de votación no elimina; lobos empatados como más votados no suman', () => {
  const E = estado(); abrir(E); E.fase = 'dia';
  const r = paso(E, Object.fromEntries(E.roles.map((_, i) => [i, { mensaje: '', voto: i % 2 === 0 ? 1 : 0 }])));
  assert.ok(E.vivos.every(Boolean));
  assert.equal(r.publico.eventos.find((e) => e.tipo === 'votacion').empate, true);
  assert.equal(E.stats[0].aciertos, 0); assert.equal(E.stats[1].aciertos, 0);
  assert.equal(E.stats[5].aciertos, 1); // Cupido pertenece a aldea.
});

test('tope sin ganador es empate; enamorados vivos ganan bono aparte', () => {
  const E = estado(); abrir(E, [0, 1]); E.ronda = E.maxRondas; E.fase = 'dia';
  paso(E, Object.fromEntries(E.roles.map((_, i) => [i, { mensaje: '', voto: (i + 1) % E.jugadores }])));
  assert.equal(E.fin, true); assert.equal(E.motivoFin, 'tope'); assert.equal(E.ganadorBando, null);
  assert.equal(E.puntos[0], 5); assert.equal(E.puntos[1], 5);
  assert.equal(juego.resultado(E).empate, true);
  assert.throws(() => paso(E, {}));
});

test('extinción por amor tras último disparo: empate sin ganador principal', () => {
  const E = estado(); abrir(E, [0, 4]);
  E.vivos = [true, false, false, false, true, false, false, false];
  noche(E, 4);
  assert.equal(E.fin, true); assert.equal(E.motivoFin, 'extincion');
  assert.equal(E.ganadorBando, null); assert.equal(E.cazadoresPendientes.length, 0);
});

test('respuestas ausentes o malformadas reemplazadas con seed; estado sobrevive JSON', () => {
  const a = estado(), b = JSON.parse(JSON.stringify(a));
  for (let t = 0; !a.fin; t++) {
    const r = paso(a, {}); paso(b, {});
    assert.deepEqual(a, b);
    assert.ok(r.privado.acciones.every((x) => x.invalida));
    assert.ok(t < 32);
  }
  assert.ok(a.stats.every((s) => s.acciones === s.invalidas));
});

test('rechaza objetivos muertos, propios, fraccionarios, pociones sin víctima y mensajes excesivos', () => {
  const E = estado(); abrir(E);
  paso(E, { 0: { accion: 'matar', objetivo: 0 }, 1: { accion: 'matar', objetivo: 1.5 } });
  assert.equal(E.historial.at(-1).invalidas[0], true);
  assert.equal(E.historial.at(-1).invalidas[1], true);
  E.victima = null;
  assert.equal(paso(E, { 3: { salvar: true, matar: null } }).invalidas[3], true);
  paso(E, { 2: { accion: 'inspeccionar', objetivo: 2 } });
  const r = paso(E, { 0: { voto: 0, mensaje: '' }, 1: { voto: 2, mensaje: 'x'.repeat(1001) } });
  assert.equal(r.invalidas[0], true); assert.equal(r.invalidas[1], true);
});

test('vistas aíslan información: manada, pareja, pociones y roles ocultos', () => {
  const E = estado(); E.modoCupido = 'ambos'; abrir(E, [0, 6]); // en 'ambos' la camara ve a Cupido; las IAs nunca (cupido-oculto.test.js cubre los cuatro modos)
  const lobo = vistaDe(E, 0), aldeano = vistaDe(E, 7), amante = vistaDe(E, 6), camara = vistaCamara(E);
  assert.deepEqual(lobo.manada, [0, 1]); assert.equal(amante.pareja, 0);
  assert.equal(aldeano.manada, undefined); assert.equal(aldeano.pociones, undefined); assert.equal(aldeano.pareja, null);
  assert.ok(aldeano.eventos.every((e) => e.tipo !== 'enamorados'));
  assert.equal(aldeano.enamoradosElegidos, undefined);
  assert.deepEqual(vistaDe(E, 5).enamoradosElegidos, [0, 6]);
  assert.ok(aldeano.jugadores.every((j) => j.rol === undefined), 'las IAs no saben quien es Cupido');
  assert.ok(camara.jugadores.every((j) => j.rol === (j.asiento === 5 ? 'cupido' : undefined)));
  assert.equal(camara.roles, undefined);
  lobo.manada.push(7); camara.eventos.length = 0;
  assert.equal(E.eventos.length, 1); assert.equal(E.roles[7], 'aldeano');
});

test('registro público nocturno no revela actores, víctima ni inspección; revela muertos', () => {
  const E = estado(); E.modoCupido = 'ambos'; abrir(E, [5, 6]);
  const r = paso(E, { 0: { accion: 'matar', objetivo: 7 }, 1: { accion: 'matar', objetivo: 7 } });
  assert.equal(r.publico.acciones, undefined); assert.equal(r.publico.victima, undefined);
  assert.deepEqual(r.publico.eventos, []);
  paso(E, { 3: { salvar: false, matar: null } });
  const amanecer = paso(E, { 2: { accion: 'inspeccionar', objetivo: 0 } });
  assert.equal(amanecer.publico.inspeccion, undefined);
  assert.deepEqual(amanecer.publico.eventos.find((e) => e.tipo === 'muerte'), { ronda: 1, tipo: 'muerte', asiento: 7, rol: 'aldeano', causa: 'noche' });
  assert.ok(amanecer.publico.camara.jugadores.filter((j) => j.vivo).every((j) => j.rol === (j.asiento === 5 ? 'cupido' : undefined)));
});

test('partidas completas con bots: reproducibles, sin inválidas, ambas configuraciones', () => {
  for (const jugadores of [8, 12]) for (let seed = 0; seed < 30; seed++) {
    const config = { jugadores, seed, perfil: { lobo: 'silencioso', vidente: 'revela', bruja: 'rapida', aldeano: 'contradice' } };
    const r = simular(config);
    assert.deepEqual(r, simular(config)); assert.equal(r.invalidas, 0);
    assert.ok(r.llamadas <= 100); assert.ok(r.rondas <= 6);
  }
});

test('integración real con arena: fases activas y llamadas coinciden con métricas', async () => {
  for (const jugadores of [8, 12]) {
    const agentes = Array.from({ length: jugadores }, (_, i) => ({ id: `bot-${i}`, necesitaEstado: true,
      jugar: async ({ estado: E, i, rng }) => ({ respuesta: juego.bots.mayoria.fn(E, i, rng) }) }));
    const r = await correrPartida({ juego, agentes, seed: 123 });
    assert.equal(r.truncada, false); assert.equal(r.avisos.length, 0);
    assert.equal(r.llamadas, r.metricas.reduce((n, m) => n + m.acciones, 0));
    assert.ok(r.metricas.every((m) => m.jugadasInvalidas === 0));
  }
});

test('salvar no anula veneno sobre la misma víctima; bruja actúa antes de morir', () => {
  const E = estado(); abrir(E);
  noche(E, 7, { salvar: true, matar: 7 });
  assert.equal(E.vivos[7], false);
  assert.equal(E.eventos.find((e) => e.tipo === 'muerte').causa, 'veneno');
  const F = estado(); abrir(F);
  noche(F, 3, { matar: 0 });
  assert.equal(F.vivos[3], false); assert.equal(F.vivos[0], false);
  assert.equal(F.stats[3].aciertos, 1);
});

test('dos víctimas directas enamoradas se registran una vez y con su causa directa', () => {
  const E = estado(); abrir(E, [6, 7]);
  noche(E, 6, { matar: 7 });
  const muertes = E.eventos.filter((e) => e.tipo === 'muerte');
  assert.deepEqual(muertes.map((m) => [m.asiento, m.causa]), [[6, 'noche'], [7, 'veneno']]);
});

test('reemplazos no dependen del azar de bots y no aceptan estado enviado por la IA', () => {
  const E = estado();
  const roles = [...E.roles];
  const r = paso(E, { 5: { enamorados: [0, 1], roles: [], vivos: [], puntos: [999] } });
  assert.deepEqual(E.roles, roles); assert.ok(E.vivos.every(Boolean));
  assert.deepEqual(E.puntos, Array(8).fill(0));
  assert.equal(r.privado.acciones[0].roles, undefined);
  assert.equal(r.invalidas[5], false);
});
