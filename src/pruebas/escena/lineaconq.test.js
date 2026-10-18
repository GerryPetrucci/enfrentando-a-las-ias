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

const IDX = { P18: 0, P61: 1, P94: 2 };
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
    for (const [turno, bs] of por(beats.filter((b) => b.tipo !== 'final'))) {
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
  const p = ejemplos[IDX.P61], beats = construirLineaDeTiempo(p);
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
  const { q, todos } = conCentinelas(ejemplos[IDX.P94]);
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
  const { q } = conCentinelas(ejemplos[IDX.P94]);
  q.rondas.forEach((r) => { r.privados = []; });
  const beats = construirLineaDeTiempo(q);
  const traiciones = beats.filter((b) => b.tipo === 'traicion');
  assert.ok(traiciones.length >= 1);
  for (const t of traiciones) { assert.ok(paso(t, 'cartel')); assert.equal(paso(t, 'flashback'), undefined); }
});

test('los privados sin traicion salen en el aviso del pacto cumplido o, a mas tardar, en la pantalla final (nunca se pierden, el final trae los 3 mas recientes)', () => {
  for (const idx of [IDX.P18, IDX.P61, IDX.P94]) {
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
  const { q, todos } = conCentinelas(ejemplos[IDX.P18]);
  const beats = construirLineaDeTiempo(q);
  const cumplidos = pasos(beats, 'cumplido');
  assert.ok(cumplidos.length >= 1);
  for (const c of cumplidos) {
    assert.ok(c.textos.length <= 2);
    for (const t of c.textos) assert.ok(todos.some((m) => m.texto === t.texto && [m.k, m.a].sort().join() === [c.k, c.con].sort().join()), 'un privado de otra pareja');
    assert.ok(c.beat.lineas.some((l) => l.clave === `ev:pacto_cumplido:${c.beat.mano}:${c.k}:${c.con}:`));
  }
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
  assert.ok(construirLineaDeTiempo(ejemplos[IDX.P18]).every((b) => b.reemplazo === false), 'una partida sana nunca marca un beat como reemplazo');
});

test('con 2 reinos no hay pactos; una partida cortada no inventa final; un reino caido deja de dar ordenes; la entrada ilegible no lanza', async () => {
  const dos = await jugarConqBots(5, ['agresivo', 'pacifico']);
  const bd = construirLineaDeTiempo(dos);
  assert.ok(bd.length > 0);
  assert.equal(pasos(bd, 'pacto').length + pasos(bd, 'cumplido').length + pasos(bd, 'cartel').length, 0);

  const corta = structuredClone(ejemplos[IDX.P18]); corta.rondas = corta.rondas.slice(0, 10); corta.truncada = true;
  const bc = construirLineaDeTiempo(corta);
  assert.equal(bc.some((b) => b.tipo === 'final'), false);
  assert.equal(bc.at(-1).tipo, 'resolucion');
  assert.equal(bc.at(-1).mano, 10);

  const p = ejemplos[IDX.P18], beats = construirLineaDeTiempo(p);
  const caida = p.rondas.flatMap((r) => r.eventos.filter((e) => e.tipo === 'caida').map((e) => ({ ...e, turno: r.turno })))[0];
  assert.ok(caida, 'la partida de ejemplo tiene una caida');
  for (const b of beats.filter((x) => x.tipo === 'ordenes' && x.mano > caida.turno)) {
    assert.ok(!paso(b, 'flechas').lista.some((f) => f.k === caida.k), `${b.id}: un reino caido no manda tropas`);
  }

  for (const raro of [null, undefined, {}, { rondas: 'x' }, { rondas: [] }, { rondas: [null, {}] }, { mapa: 7, rondas: [{}] }, 7]) assert.deepEqual(construirLineaDeTiempo(raro), []);
  const sinBandos = structuredClone(ejemplos[IDX.P18]);
  sinBandos.rondas.forEach((r) => r.combates.forEach((c) => { delete c.bandos; }));
  assert.doesNotThrow(() => construirLineaDeTiempo(sinBandos));
});

test('razon=1: la razon de cada IA sale solo en el beat de resolucion (con la consecuencia), nunca antes', () => {
  const p = structuredClone(ejemplos[IDX.P18]);
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
  const p = structuredClone(ejemplos[IDX.P18]);
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

test('mejoresTurnos elige por batallas decisivas, traiciones, caidas y Maravilla; beatsDeEstado y erroresDeEstado sirven a la herramienta de capturas', () => {
  const p = ejemplos[IDX.P94], beats = construirLineaDeTiempo(p);
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
