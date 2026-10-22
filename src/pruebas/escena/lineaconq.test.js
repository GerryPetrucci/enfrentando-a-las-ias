// Linea de tiempo de la escena de la Guerra de territorios: convierte los registros guardados (uno por turno) en beats. Funcion pura sobre partidas REALES jugadas por bots
// (ayudas-conq.js): sin DOM, sin red y sin API.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TURNOS } from '../../juegos/conquista/constantes.js';
import {
  construirLineaDeTiempo, puntuarTurnos, mejoresTurnos, beatsDeEstado, erroresDeEstado, esDecisiva, textoDeBatalla, ritmoDeTurno,
  MIN_MS, MOTIVOS, TURNOS_TOPE, JUGADORES_TOPE, CAMARA_POR_DEFECTO,
} from '../../../web/casino/linea-de-tiempo-conquista.js';
import { ESCENARIOS, partidasDeEjemplo, jugarConqBots, jugarConqConCaido } from './ayudas-conq.js';
import { enPalabras } from '../../../web/casino/narracion-conquista.js';
import { duracionDeBeat } from '../../../web/casino/escena-config.js';

// Cada prueba pide la partida de ejemplo por lo que necesita (la lista sale de herramientas/buscar-escenarios-conquista.mjs y cambia cuando cambian el motor o los bots).
const idx = (escenario) => { const i = ESCENARIOS.findIndex((e) => e.cubre.includes(escenario)); assert.ok(i >= 0, `ninguna partida de ejemplo cubre "${escenario}"`); return i; };
const IDX = { PACTO: idx('pacto cumplido'), CUATRO: idx('maximo 4 combates en un turno'), RUPTURA: idx('ruptura con privado previo') };
const ejemplos = await partidasDeEjemplo();
const por = (beats) => beats.reduce((m, b) => m.set(b.mano, [...(m.get(b.mano) ?? []), b]), new Map());
const paso = (beat, tipo) => beat.pasos.find((p) => p.tipo === tipo);
const pasos = (beats, tipo) => beats.flatMap((b) => b.pasos.filter((p) => p.tipo === tipo).map((p) => ({ ...p, beat: b })));
const f2 = (n) => String(Math.round(n * 100) / 100);

test('las constantes de la escena son las del motor y la camara no oculta nada', () => {
  assert.equal(TURNOS_TOPE, TURNOS);
  assert.equal(JUGADORES_TOPE, 5);
  assert.equal(CAMARA_POR_DEFECTO, 0);
});

test('cada turno cuenta su historia en orden (ordenes, traiciones, batallas, resolucion), con ids unicos y tiempos minimos', () => {
  for (const [i, p] of ejemplos.entries()) {
    const beats = construirLineaDeTiempo(p);
    assert.equal(new Set(beats.map((b) => b.id)).size, beats.length, `${ESCENARIOS[i].id}: ids unicos`);
    for (const [turno, bs] of por(beats.filter((b) => b.tipo !== 'final' && b.tipo !== 'rasgos'))) {
      const tipos = bs.map((b) => b.tipo).join(',');
      assert.match(tipos, turno === 1 ? /^apertura,ordenes(,traicion)*(,batalla)*,resolucion$/ : /^ordenes(,traicion)*(,batalla)*,resolucion$/, `${ESCENARIOS[i].id} turno ${turno}`);
    }
    for (const b of beats) {
      assert.ok(Number.isFinite(b.minMs) && b.minMs >= 1000, `${b.id}: minMs`);
      assert.ok(b.mano >= 1 && b.mano <= TURNOS_TOPE && Array.isArray(b.lineas) && Array.isArray(b.pasos) && Array.isArray(b.camara));
    }
    const finales = beats.filter((b) => b.tipo === 'final');
    assert.equal(finales.length, p.truncada ? 0 : 1);
    if (finales.length) assert.equal(beats.at(-1).tipo, 'final');
  }
});

test('el ritmo de un turno: tranquilo 2.5 s, con actividad 5 s, con una batalla normal 5 s y con una decisiva 7.5 s (a velocidad 1, sin voz)', () => {
  const suma = (r, batallas) => r.ordenes + r.resolucion + batallas;
  assert.equal(suma(ritmoDeTurno({}), 0), 2500);
  assert.equal(suma(ritmoDeTurno({ actividad: true }), 0), 5000);
  assert.equal(suma(ritmoDeTurno({ batallas: 1 }), MIN_MS.batalla), 5000);
  assert.equal(suma(ritmoDeTurno({ batallas: 1, decisivas: 1 }), MIN_MS.vs), 7500);
  assert.ok(MIN_MS.vs > MIN_MS.batalla);
});

test('ninguna linea de hecho se pierde ni se repite: cada evento sale una sola vez, en una linea o dentro de la tarjeta de su batalla', () => {
  const CON_LINEA = ['conquista', 'repelido', 'pacto', 'pacto_cumplido', 'ruptura', 'caida', 'hambre', 'comercio', 'maravilla', 'maravilla_cae', 'maravilla_gana', 'deshonra'];
  for (const [i, p] of ejemplos.entries()) {
    const beats = construirLineaDeTiempo(p);
    const dichas = [...beats.flatMap((b) => b.lineas.map((l) => l.clave)), ...pasos(beats, 'tarjeta').flatMap((t) => t.cubre ?? [])].filter(Boolean);
    const cuenta = new Map(); dichas.forEach((c) => cuenta.set(c, (cuenta.get(c) ?? 0) + 1));
    for (const r of p.rondas) for (const e of r.eventos.filter((x) => CON_LINEA.includes(x.tipo))) {
      const clave = `ev:${e.tipo}:${e.t}:${e.k}:${e.con ?? e.contra ?? e.por ?? e.de ?? ''}:${e.r ?? ''}`;
      assert.equal(cuenta.get(clave), 1, `${ESCENARIOS[i].id}: el evento ${clave} se dijo ${cuenta.get(clave) ?? 0} veces`);
    }
    for (const [clave, n] of cuenta) assert.equal(n, 1, `${ESCENARIOS[i].id}: ${clave} se repite ${n} veces`);
  }
});

test('la tarjeta usa los numeros del registro: bandos, fuerzas, terreno, fortaleza, resultado y tropas que quedan', () => {
  let vistas = 0;
  for (const p of ejemplos) {
    const beats = construirLineaDeTiempo(p);
    for (const { beat, ...t } of pasos(beats, 'tarjeta')) {
      const combate = p.rondas[beat.registro].combates.find((c) => c.d === t.d);
      assert.ok(combate, `${beat.id}: la tarjeta no corresponde a un combate del registro`);
      assert.deepEqual(t.bandos, combate.bandos);
      assert.deepEqual([t.terr, t.fort, t.resultado, t.quedan], [combate.terr, combate.fort, combate.resultado, combate.quedan]);
      assert.equal(t.nombre, p.mapa.regs[t.d].nombre);
      for (const b of combate.bandos) assert.ok(beat.texto.includes(f2(b.f)), `${beat.id}: el texto no dice la fuerza ${b.f}`);
      assert.equal(t.variante, t.decisiva ? 'C' : 'A');
      vistas++;
    }
  }
  assert.ok(vistas >= 10, `cobertura: solo ${vistas} tarjetas`);
});

test('esDecisiva: solo por las cuatro reglas (capital que cae, diferencia menor al 10 %, tres bandos o ataque tras romper un pacto)', () => {
  const dos = (fa, fd) => ({ d: 7, k: 0, bandos: [{ k: 0, n: 5, f: fa, defensor: false }, { k: 1, n: 5, f: fd, defensor: true }] });
  assert.deepEqual(esDecisiva(dos(12, 9)), { decisiva: false, motivos: [], diferencia: 0.25 });
  assert.deepEqual(esDecisiva(dos(10, 9.001)).motivos, [MOTIVOS.diferencia]);
  assert.equal(esDecisiva(dos(10, 9)).decisiva, false, 'justo 10 % no cuenta');
  assert.deepEqual(esDecisiva(dos(8, 8)).motivos, [MOTIVOS.diferencia], 'un empate es la diferencia mas chica');
  const tres = { d: 7, k: 0, bandos: [{ k: 0, n: 9, f: 20, defensor: false }, { k: 1, n: 5, f: 5, defensor: false }, { k: 2, n: 3, f: 3, defensor: true }] };
  assert.deepEqual(esDecisiva(tres).motivos, [MOTIVOS.tres]);
  assert.deepEqual(esDecisiva(dos(20, 5), { eventos: [{ tipo: 'caida', k: 1, por: 0 }], capitales: [3, 7] }).motivos, [MOTIVOS.capital]);
  assert.equal(esDecisiva(dos(20, 5), { eventos: [{ tipo: 'caida', k: 1, por: 0 }], capitales: [3, 9] }).decisiva, false, 'cae otra region, no esta');
  assert.deepEqual(esDecisiva(dos(20, 5), { eventos: [{ tipo: 'ruptura', k: 0, contra: 1 }] }).motivos, [MOTIVOS.ruptura]);
  assert.equal(esDecisiva(dos(20, 5), { eventos: [{ tipo: 'ruptura', k: 1, contra: 0 }] }).decisiva, false, 'rompio el defensor, no el atacante');
  assert.equal(esDecisiva(null).decisiva, false);
  assert.equal(esDecisiva({}).decisiva, false);
});

test('maximo 3 tarjetas por turno, de mayor a menor importancia; las demas batallas siguen diciendose en la resolucion', () => {
  const p = ejemplos[IDX.CUATRO], beats = construirLineaDeTiempo(p);
  const turnoCon4 = p.rondas.find((r) => r.combates.length >= 4);
  assert.ok(turnoCon4, 'la partida de ejemplo debe tener un turno con 4 combates');
  const delTurno = por(beats).get(turnoCon4.turno);
  const tarjetas = delTurno.filter((b) => b.tipo === 'batalla');
  assert.equal(tarjetas.length, 3);
  const nivel = (t) => (t.decisiva ? 2 : t.resultado === 'captura' ? 1 : 0);
  const niveles = tarjetas.map((b) => nivel(paso(b, 'tarjeta')));
  assert.deepEqual(niveles, [...niveles].sort((a, b) => b - a), 'de mayor a menor importancia');
  const sinTarjeta = turnoCon4.combates.filter((c) => !tarjetas.some((b) => paso(b, 'tarjeta').d === c.d));
  assert.equal(sinTarjeta.length, turnoCon4.combates.length - 3);
  const resolucion = delTurno.at(-1);
  for (const c of sinTarjeta) {
    const eventos = turnoCon4.eventos.filter((e) => (e.tipo === 'conquista' || e.tipo === 'repelido') && e.r === c.d);
    for (const e of eventos) assert.ok(resolucion.lineas.some((l) => l.clave?.startsWith(`ev:${e.tipo}:${e.t}:${e.k}:`) && l.clave.endsWith(`:${e.r}`)), `el combate de la region ${c.d} sin tarjeta debe decirse en la resolucion`);
  }
});

// ---- el privado de una traicion: se revela en la ruptura, nunca antes ----
// Cada mensaje privado se reemplaza por un texto unico: asi se ve exactamente donde aparece cada uno.
function conCentinelas(p) {
  const q = structuredClone(p), todos = [];
  q.rondas.forEach((r) => r.privados.forEach((m, i) => { m.texto = `CENTINELA-${r.turno}-${m.k}-${m.a}-${i}`; todos.push({ turno: r.turno, k: m.k, a: m.a, texto: m.texto }); }));
  return { q, todos };
}
const dondeSale = (beats, texto) => beats.filter((b) => JSON.stringify(b).includes(texto)).map((b) => b.tipo);

test('el privado de una traicion NO aparece antes de la ruptura y SI en ella; los privados de los beats de ordenes no llevan texto', () => {
  const { q, todos } = conCentinelas(ejemplos[IDX.RUPTURA]);
  const beats = construirLineaDeTiempo(q);
  const rupturas = q.rondas.flatMap((r) => r.eventos.filter((e) => e.tipo === 'ruptura').map((e) => ({ ...e, turno: r.turno })));
  assert.ok(rupturas.length >= 1);
  for (const rp of rupturas) {
    const previos = todos.filter((m) => m.k === rp.k && m.a === rp.contra && m.turno <= rp.turno);
    if (!previos.length) continue;
    const ultimo = previos.at(-1);
    const idxTraicion = beats.findIndex((b) => b.tipo === 'traicion' && b.mano === rp.turno && paso(b, 'cartel')?.k === rp.k);
    assert.ok(idxTraicion >= 0, 'debe haber un beat de traicion');
    const flash = paso(beats[idxTraicion], 'flashback');
    assert.ok(flash, 'la ruptura con privado previo trae flashback');
    assert.deepEqual([flash.de, flash.a, flash.texto, flash.turnoDelMensaje], [rp.k, rp.contra, ultimo.texto, ultimo.turno]);
    assert.ok(beats[idxTraicion].lineas.some((l) => l.texto.includes(ultimo.texto)));
    assert.deepEqual(beats.slice(0, idxTraicion).filter((b) => JSON.stringify(b).includes(ultimo.texto)), [], `el privado ${ultimo.texto} se vio antes de la ruptura`);
  }
  for (const b of beats.filter((x) => x.tipo === 'ordenes')) {
    for (const pr of paso(b, 'privados')?.pares ?? []) assert.deepEqual(Object.keys(pr).sort(), ['a', 'k'], 'un par de privados solo dice quien le escribio a quien');
    assert.ok(!JSON.stringify(b).includes('CENTINELA'), `${b.id}: un texto privado se filtro al beat de ordenes`);
  }
});

test('una ruptura sin privado previo muestra el cartel sin flashback', () => {
  const { q } = conCentinelas(ejemplos[IDX.RUPTURA]);
  q.rondas.forEach((r) => { r.privados = []; });
  const beats = construirLineaDeTiempo(q);
  const traiciones = beats.filter((b) => b.tipo === 'traicion');
  assert.ok(traiciones.length >= 1);
  for (const t of traiciones) { assert.ok(paso(t, 'cartel')); assert.equal(paso(t, 'flashback'), undefined); }
});

test('los privados sin traicion salen en el aviso del pacto cumplido o, a mas tardar, en la pantalla final (nunca se pierden, el final trae los 3 mas recientes)', () => {
  for (const idx of [IDX.PACTO, IDX.CUATRO, IDX.RUPTURA]) {
    const { q, todos } = conCentinelas(ejemplos[idx]);
    const beats = construirLineaDeTiempo(q);
    const reveladosEnTraicion = pasos(beats, 'flashback').map((f) => f.texto);
    const reveladosEnCumplido = pasos(beats, 'cumplido').flatMap((c) => c.textos.map((t) => t.texto));
    const final = paso(beats.at(-1), 'final');
    const sinRevelar = todos.filter((m) => !reveladosEnTraicion.includes(m.texto) && !reveladosEnCumplido.includes(m.texto));
    assert.equal(final.sinRevelar.length, Math.min(3, sinRevelar.length), `${ESCENARIOS[idx].id}: privados sin revelar`);
    assert.deepEqual(final.sinRevelar.map((m) => m.texto), sinRevelar.slice(-3).map((m) => m.texto), 'los mas recientes');
    for (const m of final.sinRevelar) assert.deepEqual(Object.keys(m).sort(), ['a', 'k', 'texto', 'turno']);
  }
});

test('un pacto cumplido trae los privados que se cruzaron la pareja durante el pacto', () => {
  const { q, todos } = conCentinelas(ejemplos[IDX.PACTO]);
  const beats = construirLineaDeTiempo(q);
  const cumplidos = pasos(beats, 'cumplido');
  assert.ok(cumplidos.length >= 1);
  for (const c of cumplidos) {
    assert.ok(c.textos.length <= 2);
    for (const t of c.textos) assert.ok(todos.some((m) => m.texto === t.texto && [m.k, m.a].sort().join() === [c.k, c.con].sort().join()), 'un privado de otra pareja');
    assert.ok(c.beat.lineas.some((l) => l.clave === `ev:pacto_cumplido:${c.beat.mano}:${c.k}:${c.con}:`));
  }
});

test('el pacto cumplido muestra de verdad los 2 privados mas recientes de la pareja DURANTE el pacto (no los del turno del cumplimiento ni los de antes) y los marca como revelados', () => {
  const q = structuredClone(ejemplos[IDX.PACTO]);
  const rc = q.rondas.find((r) => r.eventos.some((e) => e.tipo === 'pacto_cumplido')), cumplido = rc.eventos.find((e) => e.tipo === 'pacto_cumplido');
  const mismaPareja = (e) => [e.k, e.con].sort().join() === [cumplido.k, cumplido.con].sort().join();
  const firma = q.rondas.filter((r) => r.turno < rc.turno && r.eventos.some((e) => e.tipo === 'pacto' && mismaPareja(e))).at(-1);
  assert.ok(firma, 'precondicion: el pacto se firmo en un turno anterior');
  const priv = (texto) => ({ k: cumplido.k, a: cumplido.con, texto });
  const anterior = q.rondas.find((r) => r.turno < firma.turno) ?? q.rondas[0];
  if (anterior.turno < firma.turno) anterior.privados.push(priv('CUMPLIDO-ANTES-DEL-PACTO'));
  const rAntes = q.rondas.find((r) => r.turno === rc.turno - 1);
  firma.privados.push(priv('CUMPLIDO-A'), priv('CUMPLIDO-B'));
  rAntes.privados.push(priv('CUMPLIDO-C'));
  rc.privados.push(priv('CUMPLIDO-MISMO-TURNO'));
  const beats = construirLineaDeTiempo(q);
  const c = pasos(beats, 'cumplido').find((x) => x.beat.mano === rc.turno);
  assert.deepEqual(c.textos.map((t) => t.texto), ['CUMPLIDO-B', 'CUMPLIDO-C'], 'los dos mas recientes de antes del turno del cumplimiento, en orden');
  const final = paso(beats.at(-1), 'final');
  assert.ok(!final.sinRevelar.some((m) => m.texto === 'CUMPLIDO-B' || m.texto === 'CUMPLIDO-C'), 'lo ya revelado no vuelve a salir en el final');
  const antesDelCumplido = beats.filter((b) => b.mano < rc.turno || (b.mano === rc.turno && b.tipo !== 'resolucion'));
  assert.deepEqual(dondeSale(antesDelCumplido, 'CUMPLIDO-B'), [], 'nada se adelanta al cumplimiento');
});

test('la linea de tiempo no lanza con datos raros que la lista deja pasar (JSON editado a mano o corrupto): lo ilegible se ignora', () => {
  const alteraciones = {
    'estado sin tropas': (q) => { delete q.rondas[2].estado.tropas; },
    'eventos numero': (q) => { q.rondas[2].eventos = 5; },
    'eventos objeto': (q) => { q.rondas[2].eventos = { a: 1 }; },
    'evento null': (q) => { q.rondas[2].eventos.push(null); q.rondas[q.rondas.length - 1].eventos.push(null); },
    'bando null': (q) => { q.rondas.flatMap((r) => r.combates)[0].bandos.push(null); },
    'movimiento null': (q) => { q.rondas[2].movs.push(null); },
    'privado null': (q) => { q.rondas[2].privados.push(null); },
    'mensaje null': (q) => { q.rondas[2].mensajes.push(null); },
  };
  for (const [nombre, alterar] of Object.entries(alteraciones)) {
    const q = structuredClone(ejemplos[IDX.PACTO]);
    alterar(q);
    let beats;
    assert.doesNotThrow(() => { beats = construirLineaDeTiempo(q); }, nombre);
    assert.ok(Array.isArray(beats), nombre);
  }
  // un estado ilegible (sin tropas) no llega a la mesa, que lo dibujaria: la resolucion de ese turno conserva el estado anterior
  const q = structuredClone(ejemplos[IDX.PACTO]);
  delete q.rondas[2].estado.tropas;
  const resolucion = construirLineaDeTiempo(q).find((b) => b.tipo === 'resolucion' && b.mano === q.rondas[2].turno);
  assert.ok(Array.isArray(paso(resolucion, 'estado').tropas), 'el estado de la resolucion trae tropas');
  assert.deepEqual(paso(resolucion, 'estado').dueno, ejemplos[IDX.PACTO].rondas[1].estado.dueno, 'es el estado del turno anterior');
});

test('una respuesta ilegible o un reino caido de la API no se cuenta como decision: se dice que no respondio y pasa el turno', async () => {
  const p = await jugarConqConCaido(5, 4, 1), beats = construirLineaDeTiempo(p), nombre = p.jugadores[1].nombre;
  const conAviso = beats.filter((b) => b.tipo === 'ordenes' && b.reemplazo === true);
  assert.ok(conAviso.length >= 5, 'el reino caido debe fallar en muchos turnos');
  for (const b of conAviso) {
    assert.ok(b.lineas.some((l) => l.texto === `${nombre} no respondió bien: pasa el turno.`), b.id);
    assert.ok(!paso(b, 'flechas').lista.some((f) => f.k === 1), 'un reino que no respondio no manda tropas');
    assert.ok(!paso(b, 'privados').pares.some((x) => x.k === 1));
  }
  assert.ok(construirLineaDeTiempo(ejemplos[IDX.PACTO]).every((b) => b.reemplazo === false), 'una partida sana nunca marca un beat como reemplazo');
});

test('con 2 reinos no hay pactos; una partida cortada no inventa final; un reino caido deja de dar ordenes; la entrada ilegible no lanza', async () => {
  const dos = await jugarConqBots(5, ['agresivo', 'pacifico']);
  const bd = construirLineaDeTiempo(dos);
  assert.ok(bd.length > 0);
  assert.equal(pasos(bd, 'pacto').length + pasos(bd, 'cumplido').length + pasos(bd, 'cartel').length, 0);

  const corta = structuredClone(ejemplos[IDX.PACTO]); corta.rondas = corta.rondas.slice(0, 10); corta.truncada = true;
  const bc = construirLineaDeTiempo(corta);
  assert.equal(bc.some((b) => b.tipo === 'final'), false);
  assert.equal(bc.at(-1).tipo, 'resolucion');
  assert.equal(bc.at(-1).mano, 10);

  const p = ejemplos[IDX.PACTO], beats = construirLineaDeTiempo(p);
  const caida = p.rondas.flatMap((r) => r.eventos.filter((e) => e.tipo === 'caida').map((e) => ({ ...e, turno: r.turno })))[0];
  assert.ok(caida, 'la partida de ejemplo tiene una caida');
  for (const b of beats.filter((x) => x.tipo === 'ordenes' && x.mano > caida.turno)) {
    assert.ok(!paso(b, 'flechas').lista.some((f) => f.k === caida.k), `${b.id}: un reino caido no manda tropas`);
  }

  for (const raro of [null, undefined, {}, { rondas: 'x' }, { rondas: [] }, { rondas: [null, {}] }, { mapa: 7, rondas: [{}] }, 7]) assert.deepEqual(construirLineaDeTiempo(raro), []);
  const sinBandos = structuredClone(ejemplos[IDX.PACTO]);
  sinBandos.rondas.forEach((r) => r.combates.forEach((c) => { delete c.bandos; }));
  assert.doesNotThrow(() => construirLineaDeTiempo(sinBandos));
});

test('razon=1: la razon de cada IA sale solo en el beat de resolucion (con la consecuencia), nunca antes', () => {
  const p = structuredClone(ejemplos[IDX.PACTO]);
  p.rondas.forEach((r) => r.respuestas.forEach((x, s) => { if (x) x.razon = `RAZON-${r.turno}-${s}`; }));
  const beats = construirLineaDeTiempo(p);
  for (const b of beats) {
    const tiene = JSON.stringify(b).includes('RAZON-');
    assert.equal(tiene, b.tipo === 'resolucion', `${b.id}: la razon debe salir solo en la resolucion`);
  }
  const res = beats.find((b) => b.tipo === 'resolucion');
  assert.deepEqual(paso(res, 'razones').lista.map((x) => x.texto), p.rondas[0].respuestas.flatMap((x, s) => (x ? [`RAZON-1-${s}`] : [])));
});

test('las flechas de ordenes son los ataques y capturas mas los 5 movimientos de mas tropas, maximo 10', () => {
  for (const p of ejemplos) {
    const beats = construirLineaDeTiempo(p).filter((b) => b.tipo === 'ordenes');
    for (const b of beats) {
      const { lista } = paso(b, 'flechas');
      assert.ok(lista.length <= 10, `${b.id}: ${lista.length} flechas`);
      assert.ok(lista.filter((f) => !f.ataque).length <= 5, `${b.id}: demasiadas flechas que no son ataque`);
      const movs = p.rondas[b.registro].movs;
      for (const f of lista) assert.ok(movs.some((m) => m.f === f.de && m.d === f.a && m.n === f.n && m.k === f.k), `${b.id}: una flecha que no esta en los movimientos`);
    }
  }
});

test('con muchos movimientos solo se dibujan 10: los ataques mas grandes primero y, si sobra sitio, hasta 5 movimientos propios de mas tropas', () => {
  const p = structuredClone(ejemplos[IDX.PACTO]);
  // un turno y un reino con regiones de sobra para armar los movimientos: el registro i trae el estado de ANTES del turno i + 1
  let sitio = null;
  for (let i = 0; i < p.rondas.length - 1 && !sitio; i++) for (let k = 0; k < p.jugadores.length && !sitio; k++) {
    if (p.rondas[i].estado.dueno.filter((d) => d === k).length >= 10) sitio = { i, k };
  }
  assert.ok(sitio, 'la partida de ejemplo debe tener un reino con 10 regiones o mas');
  const { k } = sitio, antes = p.rondas[sitio.i].estado.dueno, r = p.rondas[sitio.i + 1];
  const propias = antes.flatMap((d, id) => (d === k ? [id] : [])), ajenas = antes.flatMap((d, id) => (d !== k ? [id] : []));
  assert.ok(propias.length >= 10 && ajenas.length >= 12, 'hacen falta regiones propias y ajenas para armar los movimientos');
  const interno = (n, j) => ({ f: propias[0], d: propias[1 + (j % (propias.length - 1))], n, k });
  const ataque = (n, j) => ({ f: propias[0], d: ajenas[j], n, k });

  r.movs = [...Array.from({ length: 12 }, (_, j) => ataque(2 + j, j)), ...Array.from({ length: 9 }, (_, j) => interno(20 + j, j))];
  const lista1 = paso(construirLineaDeTiempo(p).find((b) => b.tipo === 'ordenes' && b.mano === r.turno), 'flechas').lista;
  assert.equal(lista1.length, 10);
  assert.deepEqual(lista1.map((f) => f.n), [13, 12, 11, 10, 9, 8, 7, 6, 5, 4], 'los 10 ataques mas grandes, sin movimientos propios');
  assert.ok(lista1.every((f) => f.ataque));

  r.movs = [...Array.from({ length: 3 }, (_, j) => ataque(5 + j, j)), ...Array.from({ length: 9 }, (_, j) => interno(20 + j, j))];
  const lista2 = paso(construirLineaDeTiempo(p).find((b) => b.tipo === 'ordenes' && b.mano === r.turno), 'flechas').lista;
  assert.equal(lista2.length, 8, '3 ataques mas los 5 movimientos propios de mas tropas');
  assert.deepEqual(lista2.filter((f) => !f.ataque).map((f) => f.n), [28, 27, 26, 25, 24]);
});

test('el final trae el ranking, quien cayo y cuando, los momentos clave y la marca de la Maravilla; solo si la partida termino', () => {
  for (const [i, p] of ejemplos.entries()) {
    const f = paso(construirLineaDeTiempo(p).at(-1), 'final');
    assert.deepEqual(f.ranking.map((x) => x.k), p.orden, ESCENARIOS[i].id);
    f.ranking.forEach((x, pos) => assert.deepEqual([x.posicion, x.puntos, x.regiones], [pos + 1, p.puntos[x.k], p.metricas[x.k].regiones]));
    assert.equal(f.ganoPorMaravilla, p.ganoPorMaravilla === true);
    assert.equal(f.bioma, p.mapa.bioma);
    const cayeron = f.ranking.filter((x) => x.cayoEn !== null).map((x) => x.k).sort();
    assert.deepEqual(cayeron, p.rondas.flatMap((r) => r.eventos.filter((e) => e.tipo === 'caida').map((e) => e.k)).sort());
    assert.ok(f.momentos.length >= 1 && f.momentos.length <= 6);
    assert.deepEqual(f.momentos.map((m) => m.turno), [...f.momentos.map((m) => m.turno)].sort((a, b) => a - b));
  }
});

// ---- la narracion con interpretacion (narracion-conquista.js): lo que se dice y se subtitula es `dicho`; los hechos completos siguen en `lineas` ----
import { estadoInicial } from '../../../web/casino/conquista-datos.js';
const CON_DICHO = ['ordenes', 'resolucion'];
const duenoAntes = (p, turno) => (turno === 1 ? estadoInicial(p).dueno : p.rondas[turno - 2].estado.dueno);

test('ordenes y resolucion llevan lo que se dice (`dicho`); `texto` es eso mismo unido, `lineas` sigue siendo la lista de hechos y los demas beats no cambian', () => {
  for (const [i, p] of ejemplos.entries()) {
    for (const b of construirLineaDeTiempo(p)) {
      const id = `${ESCENARIOS[i].id} ${b.id}`;
      assert.equal(Array.isArray(b.dicho), [...CON_DICHO, 'rasgos'].includes(b.tipo), `${id}: solo ordenes, resolucion y las fichas del final narran con interpretacion`);
      assert.equal(b.texto, (b.dicho ?? b.lineas).map((l) => l.texto).join(' '), `${id}: texto = lo que se dice`);
      assert.ok(b.lineas.every((l) => l.tipo === 'hecho' && typeof l.texto === 'string'), `${id}: lineas son hechos`);
      if (b.dicho) {
        assert.ok(Array.isArray(b.mudas), `${id}: mudas`);
        assert.ok(b.dicho.every((l) => ['hecho', 'comentario'].includes(l.tipo) && l.texto.length > 0), `${id}: cada linea dicha es un hecho o un comentario con texto`);
      }
    }
  }
});

test('ninguna linea de hecho se pierde: cada clave de lineas se dice, la cubre una frase de contexto o queda anotada como muda, y solo una vez', () => {
  let cubiertas = 0, mudas = 0;
  for (const [i, p] of ejemplos.entries()) {
    for (const b of construirLineaDeTiempo(p).filter((x) => x.dicho)) {
      const hechos = b.lineas.map((l) => l.clave).sort();
      const cuentan = [...b.dicho.filter((l) => l.tipo === 'hecho').map((l) => l.clave), ...b.dicho.flatMap((l) => l.cubre ?? []), ...b.mudas].sort();
      assert.deepEqual(cuentan, hechos, `${ESCENARIOS[i].id} ${b.id}: lo dicho, lo cubierto y lo mudo tienen que ser exactamente los hechos`);
      cubiertas += b.dicho.reduce((s, l) => s + (l.cubre?.length ?? 0), 0);
      mudas += b.mudas.length;
    }
  }
  assert.ok(cubiertas > 0, 'cobertura: alguna frase de contexto tiene que reemplazar hechos en las partidas de ejemplo');
});

test('las frases de contexto no llevan codigos de region ni nombres de regiones, y las citas son mensajes publicos de ese turno, tal cual, y tambien un hecho de sus lineas', () => {
  let citas = 0, comentarios = 0;
  for (const [i, p] of ejemplos.entries()) {
    const nombres = (k) => p.jugadores[k].nombre;
    for (const b of construirLineaDeTiempo(p).filter((x) => x.dicho)) {
      for (const l of b.dicho.filter((x) => x.tipo === 'comentario')) { comentarios++; assert.doesNotMatch(l.texto, /\bR\d+\b/, `${ESCENARIOS[i].id} ${b.id}: ${l.texto}`); }
      for (const l of b.dicho.filter((x) => x.clave?.startsWith('msg:'))) {
        const [, turno, k, n] = l.clave.split(':').map((x, j) => (j ? Number(x) : x));
        const m = p.rondas[turno - 1].mensajes[n];
        assert.ok(m && m.k === k && b.mano === turno, `${l.clave}: el mensaje no existe en ese turno`);
        assert.equal(l.texto, `${nombres(k)} dice: «${m.texto.trim()}»`);
        assert.ok(b.lineas.some((x) => x.clave === l.clave && x.texto === l.texto), `${l.clave}: la cita es un hecho nuevo y va tambien en las lineas`);
        citas++;
      }
    }
  }
  assert.ok(comentarios > 0 && citas > 0, `cobertura: ${comentarios} frases de contexto y ${citas} citas`);
});

test('las cifras de las frases de contexto son las de los registros: las tomas por reino (region sin dueno antes, de ese reino despues) y el panorama (regiones del marcador de los reinos en pie)', () => {
  let tomas = 0, panoramas = 0;
  for (const [i, p] of ejemplos.entries()) {
    for (const b of construirLineaDeTiempo(p).filter((x) => x.dicho)) {
      const id = `${ESCENARIOS[i].id} ${b.id}`;
      for (const l of b.dicho.filter((x) => x.cubre?.length && x.cubre.every((c) => c.startsWith('toma:')))) {
        const porReino = new Map();
        for (const clave of l.cubre) {
          const [, turno, d] = clave.split(':').map(Number);
          assert.equal(turno, b.mano, `${id}: una toma de otro turno`);
          assert.equal(duenoAntes(p, turno)[d], -1, `${id}: ${clave} no era una region sin dueño`);
          const k = p.rondas[turno - 1].estado.dueno[d];
          assert.ok(k >= 0, `${id}: ${clave} no quedo de nadie`);
          porReino.set(k, (porReino.get(k) ?? 0) + 1);
        }
        assert.deepEqual([...porReino].sort((a, c) => c[1] - a[1] || a[0] - c[0]), l.datos.porReino, `${id}: las tomas por reino`);
        tomas++;
      }
      for (const l of b.dicho.filter((x) => x.datos?.cuentas)) {
        const estado = p.rondas[b.mano - 1].estado, ks = estado.dueno.length ? p.jugadores.map((_, k) => k).filter((k) => estado.vivo[k] !== false) : [];
        assert.deepEqual(l.datos.cuentas, ks.map((k) => [k, estado.dueno.filter((d) => d === k).length]), `${id}: el panorama no coincide con el marcador`);
        assert.equal(l.datos.turno, b.mano);
        assert.ok(b.mano % 5 === 0 && b.tipo === 'resolucion', `${id}: un panorama solo cada 5 turnos y en la resolucion`);
        panoramas++;
      }
    }
  }
  assert.ok(tomas > 0 && panoramas > 0, `cobertura: ${tomas} resumenes de tomas y ${panoramas} panoramas`);
});

test('el panorama no se dice en el turno final de una partida terminada (viene la pantalla del final) y si en una partida cortada', () => {
  // una partida que termina en el turno 10 (multiplo de 5): su ultimo turno trae el final, no el panorama
  const terminada = structuredClone(ejemplos[IDX.PACTO]);
  terminada.rondas = terminada.rondas.slice(0, 10);
  const bt = construirLineaDeTiempo(terminada);
  assert.equal(bt.at(-1).tipo, 'final', 'la partida de prueba termina en el turno 10');
  const panorama = (beats) => beats.filter((b) => b.mano === 10).some((b) => b.dicho?.some((l) => l.datos?.cuentas));
  assert.equal(panorama(bt), false, 'no hay panorama en el ultimo turno de una partida terminada');
  const corta = structuredClone(terminada);
  corta.truncada = true;
  const bc = construirLineaDeTiempo(corta);
  assert.equal(bc.some((b) => b.tipo === 'final'), false);
  assert.equal(panorama(bc), true, 'una partida cortada en el turno 10 si dice su panorama');
});

test('un turno cuya racha de expansion ya se dijo no dice nada de las ordenes y su beat dura lo minimo; un privado se sigue diciendo tal cual', () => {
  let callados = 0;
  for (const p of ejemplos) {
    for (const b of construirLineaDeTiempo(p).filter((x) => x.tipo === 'ordenes' && x.mudas.length)) {
      assert.ok(b.mudas.every((c) => c.startsWith('ord:')), `${b.id}: solo se callan los ataques de una racha`);
      assert.ok(!b.texto.includes('manda'), `${b.id}: la lista de «manda N tropas de R a R» ya no se dice`);
      callados++;
    }
    for (const b of construirLineaDeTiempo(p).filter((x) => x.dicho && x.texto === '')) {
      assert.equal(duracionDeBeat(b, null, 1), b.minMs, `${b.id}: un momento mudo dura su minimo, sin voz que lo alargue`);
      assert.ok(b.minMs >= 1000 && b.minMs <= 3000, `${b.id}: ${b.minMs} ms (el ritmo de un turno sin nada que decir)`);
    }
    for (const b of construirLineaDeTiempo(p).filter((x) => x.tipo === 'ordenes')) {
      for (const l of b.lineas.filter((x) => x.clave.startsWith('priv:'))) assert.ok(b.dicho.some((d) => d.clave === l.clave && d.texto === l.texto), `${b.id}: el privado se dice tal cual`);
    }
  }
  assert.ok(callados > 0, 'cobertura: alguna racha de expansion continua en las partidas de ejemplo');
});

test('en lo rutinario ya no se leen listas de «X manda N tropas de R a R» ni de «X toma R»: eso sigue en los hechos y en el feed, y lo que se dice es el contexto', async () => {
  const LISTA_DE_ORDENES = / manda \S+ tropas? de /, LISTA_DE_TOMAS = / toma R\d+/;
  const partidas = [...ejemplos, await jugarConqBots(7, ['agresivo', 'pacifico', 'economico', 'azar'])];
  let ordenesLiterales = 0, tomasLiterales = 0, contexto = 0;
  for (const p of partidas) {
    for (const b of construirLineaDeTiempo(p).filter((x) => CON_DICHO.includes(x.tipo))) {
      assert.doesNotMatch(b.texto, LISTA_DE_ORDENES, `${b.id}: se sigue leyendo la lista de ordenes`);
      assert.doesNotMatch(b.texto, LISTA_DE_TOMAS, `${b.id}: se sigue leyendo la lista de tomas`);
      const literal = b.lineas.map((l) => l.texto).join(' ');
      if (LISTA_DE_ORDENES.test(literal)) ordenesLiterales++;
      if (LISTA_DE_TOMAS.test(literal)) tomasLiterales++;
      contexto += b.dicho.filter((l) => l.tipo === 'comentario').length;
    }
  }
  assert.ok(ordenesLiterales > 0 && tomasLiterales > 0, `cobertura: los hechos si traen ${ordenesLiterales} listas de ordenes y ${tomasLiterales} de tomas (si no, esta prueba no prueba nada)`);
  assert.ok(contexto > 0, 'y en su lugar hay frases de contexto');
});

test('el resumen cuenta TODOS los ataques del turno, no solo los 10 que se dibujan: un ataque contra otro reino que no cabe en el dibujo igual se dice', () => {
  const p = structuredClone(ejemplos[IDX.PACTO]), i = 1, antes = p.rondas[i - 1].estado.dueno, r = p.rondas[i];
  const libres = antes.flatMap((d, id) => (d === -1 ? [id] : [])), ajenas = antes.flatMap((d, id) => (d >= 1 ? [id] : []));
  assert.ok(libres.length >= 11 && ajenas.length >= 1, 'precondicion: hacen falta 11 regiones sin dueño y una de otro reino');
  r.movs = [...libres.slice(0, 11).map((d) => ({ f: 0, d, n: 5, k: 0 })), { f: 0, d: ajenas[0], n: 1, k: 0 }];
  const b = construirLineaDeTiempo(p).find((x) => x.tipo === 'ordenes' && x.mano === r.turno);
  assert.equal(paso(b, 'flechas').lista.length, 10, 'solo se dibujan 10');
  assert.ok(paso(b, 'flechas').lista.every((f) => f.n === 5), 'el ataque pequeño contra otro reino no esta entre los dibujados');
  assert.match(b.texto, new RegExp(`${p.jugadores[0].nombre} lanza un ataque contra ${p.jugadores[antes[ajenas[0]]].nombre}\\.`), 'pero se dice');
});

// ---- lo que dice el narrador de los ataques y del hambre se comprueba contra los registros con un calculo INDEPENDIENTE (no con el codigo del narrador) ----
const NUMERO = { un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
const aNumero = (palabra) => NUMERO[palabra] ?? Number(palabra);
// los objetivos distintos (reino, region) de un turno contra regiones que son de OTRO reino: los movimientos de un reino a una misma region son UN ataque (el motor los junta en un bando)
function ataquesContraOtros(p, turno) {
  const antes = duenoAntes(p, turno), objetivos = new Set();
  for (const m of p.rondas[turno - 1].movs) if (antes[m.d] >= 0 && antes[m.d] !== m.k) objetivos.add(`${m.k}|${m.d}`);
  return objetivos.size;
}
function ataquesDichos(texto) {
  const porPareja = [...texto.matchAll(/lanza (un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|\d+) ataques? contra/g)].reduce((s, m) => s + (m[1] === 'un' ? 1 : aNumero(m[1])), 0);
  const contados = /Hay (\S+) ataques contra otros reinos/.exec(texto);
  return contados ? aNumero(contados[1]) : porPareja;
}

test('el numero de ataques que se dice sale de los objetivos distintos del turno, no de los movimientos: coincide con un calculo independiente sobre los registros (las partidas de ejemplo, una de ellas con movimientos dobles)', async () => {
  const partidas = ejemplos;
  let turnosConAtaques = 0, conMovimientosDobles = 0;
  for (const p of partidas) {
    for (const b of construirLineaDeTiempo(p).filter((x) => x.tipo === 'ordenes')) {
      const total = ataquesContraOtros(p, b.mano), dicho = ataquesDichos(b.texto);
      assert.equal(dicho, total, `${p.seed} turno ${b.mano}: dice ${dicho} ataques y hay ${total} objetivos distintos (${b.texto})`);
      if (total) turnosConAtaques++;
      const movimientos = p.rondas[b.mano - 1].movs.filter((m) => duenoAntes(p, b.mano)[m.d] >= 0 && duenoAntes(p, b.mano)[m.d] !== m.k).length;
      if (movimientos > total) conMovimientosDobles++;
    }
  }
  assert.ok(turnosConAtaques >= 5, `cobertura: ${turnosConAtaques} turnos con ataques contra otros reinos`);
  assert.ok(conMovimientosDobles >= 2, `cobertura: ${conMovimientosDobles} turnos con movimientos dobles (si el motor cambio y ya no hay, volver a correr herramientas/buscar-escenarios-conquista.mjs)`);
});

test('dos movimientos de un reino a la misma region de otro se dicen como UN ataque; a dos regiones, dos', () => {
  const p = structuredClone(ejemplos[IDX.PACTO]), i = 1, antes = p.rondas[i - 1].estado.dueno, r = p.rondas[i];
  const de1 = antes.flatMap((d, id) => (d === 1 ? [id] : []));
  assert.ok(de1.length >= 2, 'precondicion: el reino 1 tiene dos regiones');
  const ataca = (...regiones) => { r.movs = regiones.map((d) => ({ f: 0, d, n: 3, k: 0 })); return construirLineaDeTiempo(p).find((x) => x.tipo === 'ordenes' && x.mano === r.turno).texto; };
  const rival = p.jugadores[1].nombre, yo = p.jugadores[0].nombre;
  assert.match(ataca(de1[0], de1[0]), new RegExp(`${yo} lanza un ataque contra ${rival}\\.`));
  assert.match(ataca(de1[0], de1[0], de1[1]), new RegExp(`${yo} lanza dos ataques contra ${rival}\\.`));
});

test('un estado ilegible en unos turnos no se da por «sin cambios»: el panorama de esos turnos calla y no afirma que ninguna region cambio de dueño', () => {
  const p = structuredClone(ejemplos[IDX.PACTO]);
  for (const idx of [5, 6, 7, 8, 9]) delete p.rondas[idx].estado.tropas; // los turnos 6 a 10 no traen un estado legible
  const beats = construirLineaDeTiempo(p);
  const panorama = (turno) => beats.filter((b) => b.mano === turno && b.dicho).flatMap((b) => b.dicho).filter((l) => l.datos?.cuentas);
  assert.deepEqual(panorama(10), [], 'sin estado legible no hay panorama');
  for (const b of beats.filter((x) => x.dicho && x.mano >= 6 && x.mano <= 15)) assert.doesNotMatch(b.texto, /ninguna región cambia de dueño/, `${b.id}: no puede afirmar que no hubo cambios`);
});

test('el hambre se cuenta en cada turno como dice el registro: primera vez, segundo turno seguido, y a partir del tercero cuantos lleva y cuanto perdio (o callada, anotada como muda)', () => {
  const tropas = (n) => `${enPalabras(n)} ${n === 1 ? 'tropa' : 'tropas'}`;
  let verificados = 0, callados = 0, largas = 0;
  for (const p of ejemplos) {
    const beats = construirLineaDeTiempo(p), previa = new Map();
    for (const r of p.rondas) {
      for (const e of r.eventos.filter((x) => x.tipo === 'hambre')) {
        const antes = previa.get(e.k), seguida = antes?.turno === r.turno - 1, racha = seguida ? antes.racha + 1 : 1, total = (seguida ? antes.total : 0) + e.n;
        previa.set(e.k, { turno: r.turno, racha, total });
        const nombre = p.jugadores[e.k].nombre, clave = `ev:hambre:${e.t}:${e.k}::`;
        const esperado = racha === 1 ? `${nombre} pasa hambre y pierde ${tropas(e.n)}.` : racha === 2 ? `${nombre} pasa hambre por segundo turno seguido y pierde ${tropas(e.n)}.`
          : racha === 3 || racha % 5 === 0 ? `${nombre} lleva ${enPalabras(racha, 'm')} turnos con hambre y ya perdió ${tropas(total)}.` : null;
        const b = beats.find((x) => x.tipo === 'resolucion' && x.mano === r.turno);
        const dicha = b.dicho.find((l) => l.clave === clave);
        if (esperado === null) { assert.ok(b.mudas.includes(clave) && !dicha, `${clave}: callada y anotada`); callados++; } else { assert.equal(dicha?.texto, esperado, clave); if (racha >= 3) largas++; }
        verificados++;
      }
    }
  }
  assert.ok(verificados >= 6 && callados >= 1 && largas >= 1, `cobertura: ${verificados} hambres, ${callados} calladas y ${largas} largas en las partidas de ejemplo`);
});

test('si todos los reinos en pie salen a las regiones sin dueño, se dice «todos» (y si uno cayo, el que cayo no cuenta)', () => {
  const p = structuredClone(ejemplos[IDX.PACTO]);
  const libres = estadoInicial(p).dueno.flatMap((d, id) => (d === -1 ? [id] : []));
  p.rondas[0].movs = p.jugadores.map((_, k) => ({ f: 0, d: libres[k], n: 3, k }));
  const turno1 = (q) => construirLineaDeTiempo(q).find((x) => x.tipo === 'ordenes' && x.mano === 1);
  assert.match(turno1(p).texto, /^Todos los reinos salen a expandirse: mandan tropas a regiones sin dueño\./);
  const sinUno = structuredClone(p);
  sinUno.rondas[0].movs = sinUno.rondas[0].movs.slice(1);
  assert.doesNotMatch(turno1(sinUno).texto, /^Todos los reinos/, 'si falta uno de los reinos ya no son todos');
});

test('si el estado del turno anterior no dice quienes siguen en pie, no se dice «todos» aunque salgan todos los reinos (podria haber uno caido)', () => {
  const p = structuredClone(ejemplos[IDX.PACTO]);
  const antes = p.rondas[0].estado;
  delete antes.vivo;
  const libres = antes.dueno.flatMap((d, id) => (d === -1 ? [id] : []));
  assert.ok(libres.length >= p.jugadores.length, 'precondicion: regiones sin dueño para todos los reinos');
  p.rondas[0].movs = []; // el turno 1 sin salidas: la de los reinos en el turno 2 empieza una racha (una racha que sigue no se dice)
  p.rondas[1].movs = p.jugadores.map((_, k) => ({ f: 0, d: libres[k], n: 3, k }));
  const b = construirLineaDeTiempo(p).find((x) => x.tipo === 'ordenes' && x.mano === 2);
  assert.doesNotMatch(b.texto, /^Todos los reinos/);
  assert.match(b.texto, /^Cinco reinos salen a expandirse/, 'se cuentan: son 5 y no se sabe si siguen en pie');
});

test('el hambre, el comercio y las tomas se cuentan como el narrador manda (con el tipo de cada hecho), y sus hechos siguen completos en las lineas', () => {
  const p = structuredClone(ejemplos[IDX.PACTO]);
  const evento = (r, e) => r.eventos.push({ ...e, t: r.turno });
  [2, 3, 4].forEach((idx) => { p.rondas[idx].eventos = p.rondas[idx].eventos.filter((e) => e.tipo !== 'hambre'); evento(p.rondas[idx], { tipo: 'hambre', k: 0, n: 2 }); }); // la partida de ejemplo ya trae hambre: se deja solo la de este reino
  evento(p.rondas[5], { tipo: 'comercio', k: 0, con: 1 }); evento(p.rondas[5], { tipo: 'comercio', k: 2, con: 3 });
  const beats = construirLineaDeTiempo(p), res = (turno) => beats.find((b) => b.tipo === 'resolucion' && b.mano === turno);
  const nombre = p.jugadores[0].nombre;
  assert.ok(res(3).dicho.some((l) => l.texto === `${nombre} pasa hambre y pierde dos tropas.`), 'primer turno de hambre');
  assert.ok(res(4).dicho.some((l) => l.texto === `${nombre} pasa hambre por segundo turno seguido y pierde dos tropas.`), 'segundo');
  assert.ok(res(5).dicho.some((l) => l.texto === `${nombre} lleva tres turnos con hambre y ya perdió seis tropas.`), 'tercero');
  for (const turno of [3, 4, 5]) assert.ok(res(turno).lineas.some((l) => /pasa hambre: -2 tropas/.test(l.texto)), `turno ${turno}: el hecho completo sigue en las lineas`);
  const comercios = res(6).dicho.find((l) => l.cubre?.every((c) => c.startsWith('ev:comercio:')));
  assert.match(comercios.texto, /^Hay dos intercambios comerciales entre los reinos\.$/);
  assert.equal(comercios.cubre.length, 2);
});

test('dichoDe: lo que se dice de un beat es su `dicho` si lo trae y, si no, sus hechos; con basura, nada', async () => {
  const { dichoDe } = await import('../../../web/casino/linea-comun.js');
  const hechos = [{ tipo: 'hecho', texto: 'a', clave: 'a' }], dicho = [{ tipo: 'comentario', texto: 'b' }];
  assert.equal(dichoDe({ lineas: hechos, dicho }), dicho);
  assert.equal(dichoDe({ lineas: hechos }), hechos);
  assert.deepEqual(dichoDe({ lineas: hechos, dicho: [] }), [], 'un dicho vacio es callar: no se cae a los hechos');
  for (const basura of [null, undefined, {}, { lineas: 'x' }, { dicho: 'x' }, 7]) assert.deepEqual(dichoDe(basura), []);
});

test('pintarSubtitulos dice lo que se dice (`dicho`): los comentarios en cursiva y, sin `dicho`, la lista de hechos de siempre', async () => {
  const { MesaBase } = await import('../../../web/casino/mesa-base.js');
  const mesa = new MesaBase('9x16', { jugadores: [{ nombre: 'Ana' }] }, { sfx: {}, vel: 1 }, {});
  mesa.subtitulos = { innerHTML: '' };
  mesa.ajustarSubtitulos = () => {};
  mesa.pintarSubtitulos({ lineas: [{ tipo: 'hecho', texto: 'Ana toma R07.' }], dicho: [{ tipo: 'comentario', texto: 'Ana toma una región sin dueño.' }, { tipo: 'hecho', texto: 'Ana dice: «hola»' }] });
  assert.equal(mesa.subtitulos.innerHTML, '<em>Ana toma una región sin dueño.</em> Ana dice: «hola»');
  mesa.pintarSubtitulos({ lineas: [{ tipo: 'hecho', texto: 'Ana toma R07.' }] });
  assert.equal(mesa.subtitulos.innerHTML, 'Ana toma R07.');
});

test('mejoresTurnos elige por batallas decisivas, traiciones, caidas y Maravilla; beatsDeEstado y erroresDeEstado sirven a la herramienta de capturas', () => {
  const p = ejemplos[IDX.RUPTURA], beats = construirLineaDeTiempo(p);
  const top = mejoresTurnos(p, 3);
  assert.equal(top.length, 3);
  assert.ok(top[0].puntos >= top[1].puntos && top[1].puntos >= top[2].puntos);
  const ruptura = p.rondas.find((r) => r.eventos.some((e) => e.tipo === 'ruptura'));
  assert.ok(puntuarTurnos(p).find((t) => t.turno === ruptura.turno).motivos.includes('traicion'));
  assert.deepEqual(mejoresTurnos(p, 0), []);
  for (const basura of [null, undefined, {}, { rondas: 'x' }]) { assert.deepEqual(puntuarTurnos(basura), []); assert.deepEqual(mejoresTurnos(basura, 3), []); }

  const idx = beatsDeEstado(beats, 4);
  assert.equal(idx.length, 4);
  assert.ok(idx.every((i) => beats[i].tipo === 'ordenes' && beats[i].mano >= 2));
  assert.deepEqual(beatsDeEstado(null), []);
  // al terminar el beat de ordenes de un turno SI estan a la vista las flechas de ese turno: lo que no puede haber son las del anterior ni nada de batalla, traicion o final
  const b = beats[idx[0]], propias = paso(b, 'flechas').lista.length;
  const limpio = { tarjetas: 0, carteles: 0, flashbacks: 0, flechas: propias, panel: 0, reinos: 5, filasMarcador: 5 };
  assert.deepEqual(erroresDeEstado(limpio, b), []);
  assert.equal(erroresDeEstado({ ...limpio, filasMarcador: 0 }, b).length, 1, 'marcador vacio: ningun reino con tinta');
  assert.equal(erroresDeEstado({ ...limpio, filasMarcador: 3 }, b).length, 1, 'al marcador le faltan filas');
  assert.equal(erroresDeEstado({ ...limpio, reinos: undefined, filasMarcador: undefined }, b).length, 1, 'la escena no informo su marcador');
  assert.ok(erroresDeEstado({ ...limpio, tarjetas: 1 }, b).length === 1);
  assert.ok(erroresDeEstado({ ...limpio, carteles: 1, flashbacks: 2 }, b).length === 2);
  assert.equal(erroresDeEstado({ ...limpio, flechas: propias + 2 }, b).length, 1, 'flechas que sobran: son del turno anterior');
  assert.equal(erroresDeEstado({ ...limpio, flechas: Math.max(0, propias - 1) }, b).length, propias > 0 ? 1 : 0, 'flechas que faltan');
  assert.equal(erroresDeEstado(null, beats[0]).length, 1);
});
