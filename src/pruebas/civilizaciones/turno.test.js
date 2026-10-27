import test from 'node:test';
import assert from 'node:assert/strict';
import { aplicarTurno } from '../../juegos/civilizaciones/turno/index.js';
import { normalizarRespuesta } from '../../juegos/civilizaciones/ordenes.js';
import { modificadores, espacioDe } from '../../juegos/civilizaciones/economia.js';
import { indiceDe } from '../../juegos/civilizaciones/indice.js';
import { comprobarInvariantes } from '../../juegos/civilizaciones/estado.js';
import { fronteraDe, nombreRegion } from '../../juegos/civilizaciones/mundo.js';
import { rngDe } from '../../juegos/civilizaciones/rng.js';
import { TURNOS, TECNOLOGIAS } from '../../juegos/civilizaciones/constantes.js';
import { nuevoEstado, fundado, turno, FUNDACION, resp } from './ayudas.js';

const ceroComida = (E) => E.mundo.regs.forEach((r) => { r.flujo.Comida = 0; });

test('fase 1, fundacion: nombre, lema, rasgos, sitio, capital y 3 regiones; Estabilidad inicial 50 mas los rasgos', () => {
  const E = nuevoEstado();
  const r = turno(E, [{ fundacion: { ...FUNDACION, nombre: 'Atlantida', sitio: 2, rasgos: ['devotos', 'guerreros'] } }, { fundacion: { ...FUNDACION, nombre: 'Mu', rasgos: ['pioneros', 'agricultores'] } }]);
  const [a, b] = E.civs;
  assert.deepEqual([a.nombre, a.lema, a.rasgos, a.sitio, a.fundada, a.invalida], ['Atlantida', 'Lema de prueba', ['devotos', 'guerreros'], 1, true, false]);
  assert.equal(a.capital, E.mundo.sitios[1]);
  assert.equal(a.regiones.length, 3);
  assert.equal(b.regiones.length, 4, 'pioneros');
  assert.equal(r.civs[0].fundacion.valida, true);
  assert.equal(a.stats.fundacionValida, true);
  assert.deepEqual(r.eventos.filter((e) => e.tipo === 'fundacion').map((e) => e.s), [0, 1]);
});

test('fundacion ausente o invalida: nombre Civilizacion A/B, lema vacio, rasgos 1 y 2, primer sitio, marcada invalida y la partida sigue', () => {
  const E = nuevoEstado();
  turno(E, [null, { fundacion: { nombre: '', sitio: 99, rasgos: ['nada'] } }]);
  const [a, b] = E.civs;
  assert.deepEqual([a.nombre, a.lema, a.rasgos, a.sitio, a.invalida, a.fundada], ['Civilizacion A', '', ['agricultores', 'forjadores'], 0, true, true]);
  assert.deepEqual([b.nombre, b.rasgos, b.invalida], ['Civilizacion B', ['agricultores', 'forjadores'], true]);
  assert.equal(E.turno, 1);
  assert.deepEqual(comprobarInvariantes(E), []);
});

test('una jugada ausente (null) cuenta como respuesta vacia: el turno se juega igual', () => {
  const E = nuevoEstado();
  aplicarTurno(E, [null, undefined]);
  assert.equal(E.turno, 1);
  assert.equal(E.civs[0].stats.invalidas, 1);
});

test('las ordenes se resuelven en el orden de la fase 3 (asignar, colonizar, construir...) sin importar como las escribio la IA', () => {
  const E = fundado();
  const c = E.civs[0];
  c.tecnologias.push('T1');
  const nueva = fronteraDe(E.mundo, c.regiones)[0];
  // construir en la region que se coloniza en el MISMO turno: solo funciona si colonizar va primero
  const r = turno(E, [{ ordenes: [`construir ${nombreRegion(nueva)} granero`, `colonizar ${nombreRegion(nueva)}`, 'asignar granjeros 50 lenadores 20 mineros 10 mercaderes 10 sabios 10 artistas 0'] }, {}]);
  assert.deepEqual(r.civs[0].ordenes.map((o) => [o.tipo, o.estado]), [['asignar', 'aplicada'], ['colonizar', 'aplicada'], ['construir', 'aplicada']]);
  assert.ok(c.regiones.includes(nueva));
  assert.equal(c.edificios[nueva].tipo, 'granero');
  assert.deepEqual(c.reparto, [50, 20, 10, 10, 10, 0]);
});

test('cada orden se aplica o se descarta CON MOTIVO y el resto se aplica; las leidas cuentan para la obediencia', () => {
  const E = fundado();
  E.calendario = []; // aisla esta prueba de los presagios generados
  const r = turno(E, [{ ordenes: ['construir R99 granero', `colonizar ${nombreRegion(E.civs[0].regiones[0])}`, 'investigar riego', 'reclutar 3', 'dilema 1', 'responder 2', 'hola', 'investigar cultivo'] }, {}]);
  const por = Object.fromEntries(r.civs[0].ordenes.map((o) => [o.tipo + (o.motivo ? '!' : ''), o.motivo ?? o.estado]));
  assert.equal(r.civs[0].ordenes.filter((o) => o.estado === 'aplicada').length, 1, 'solo investigar cultivo');
  assert.match(por['investigar!'], /era 2/);
  assert.match(por['dilema!'], /no hay un dilema pendiente/);
  assert.match(por['responder!'], /no hay un evento/);
  assert.match(por['reclutar!'], /no alcanzan Comida o Hierro/);
  assert.equal(r.civs[0].descartadas.length, 2, 'R99 no existe y "hola" no es una orden');
  const st = E.civs[0].stats;
  assert.deepEqual([st.validas, st.total, st.descartadas], [1, 8, 7]);
});

test('hambre: si no alcanza la Comida, Comida 0, la gente baja 10 % (hacia arriba), la Estabilidad -10 y no hay crecimiento', () => {
  const E = fundado();
  ceroComida(E);
  const c = E.civs[0];
  c.stock.Comida = 5; c.reparto = [0, 50, 50, 0, 0, 0];
  const r = turno(E, [{}, {}]);
  assert.equal(c.stock.Comida, 0);
  assert.equal(c.poblacion, 9, '10 - ceil(1.0)');
  assert.equal(c.hambre, true);
  assert.equal(c.hambres, 1);
  assert.equal(c.estabilidad, 40, '50 + 0 de Cultura - 10 de hambre');
  assert.ok(r.eventos.some((e) => e.tipo === 'hambre' && e.s === 0));
  assert.ok(!r.eventos.some((e) => e.tipo === 'crece' && e.s === 0));
});

test('C08: la gente nunca baja de 1, ni por hambre con Poblacion 1', () => {
  const E = fundado();
  ceroComida(E);
  const c = E.civs[0];
  c.poblacion = 1; c.stock.Comida = 0; c.reparto = [0, 100, 0, 0, 0, 0];
  turno(E, [{}, {}]);
  assert.equal(c.poblacion, 1);
  assert.deepEqual(comprobarInvariantes(E), []);
});

test('crecimiento: si sobra Comida despues de comer y hay espacio la gente crece 1; con la Comida justa o sin espacio no', () => {
  const E = fundado();
  const c = E.civs[0];
  const m = modificadores(c, 2), espacio = espacioDe(c, m);
  const antes = c.poblacion;
  c.stock.Comida = 50;
  turno(E, [{}, {}]);
  assert.equal(c.poblacion, antes + 1);
  const F = fundado();
  const d = F.civs[0];
  ceroComida(F);
  d.reparto = [0, 100, 0, 0, 0, 0];
  d.poblacion = 10; d.stock.Comida = 10; // come exactamente 10 y queda en 0: no sobra
  turno(F, [{}, {}]);
  assert.equal(d.poblacion, 10);
  assert.equal(d.hambre, false);
  const G = fundado();
  G.civs[0].poblacion = espacio; G.civs[0].stock.Comida = 99;
  turno(G, [{}, {}]);
  assert.equal(G.civs[0].poblacion, espacio, 'sobre el espacio no crece ni muere');
});

test('un edificio se paga ahora y su bono rige desde el turno siguiente', () => {
  const E = fundado();
  const c = E.civs[0];
  c.tecnologias.push('T1');
  const region = c.regiones[0];
  const antes = { ...c.stock };
  const r = turno(E, [{ ordenes: [`construir ${nombreRegion(region)} granero`] }, {}]);
  assert.equal(r.civs[0].ordenes[0].estado, 'aplicada');
  assert.equal(c.edificios[region].desde, 3, 'se construye en el turno 2: rige desde el 3');
  const bono = (t) => modificadores(c, t).pct.Comida;
  assert.equal(bono(2), bono(1), 'este turno todavia no');
  assert.ok(Math.abs(bono(3) - bono(2) - 0.2) < 1e-9, 'desde el siguiente, +20 % Comida');
  assert.ok(c.stock.Madera < antes.Madera + 100 && c.construidos.includes('granero'));
  assert.deepEqual(c.construidos, ['granero']);
});

test('construir: un tipo que ya tienes se descarta, y construir otro tipo sobre un edificio lo reemplaza sin devolver nada', () => {
  const E = fundado();
  const c = E.civs[0];
  c.tecnologias.push('T1', 'M1');
  c.stock.Madera = 50; c.stock.Roca = 50;
  const [a, b] = c.regiones;
  turno(E, [{ ordenes: [`construir ${nombreRegion(a)} granero`] }, {}]);
  const r = turno(E, [{ ordenes: [`construir ${nombreRegion(b)} granero`, `construir ${nombreRegion(a)} aserradero`] }, {}]);
  assert.match(r.civs[0].ordenes[0].motivo, /ya tienes ese tipo/);
  assert.equal(r.civs[0].ordenes[1].estado, 'aplicada');
  assert.equal(c.edificios[a].tipo, 'aserradero', 'el granero fue demolido');
  assert.deepEqual(c.construidos.sort(), ['aserradero', 'granero'], 'los construidos alguna vez se conservan');
});

test('colonizar: vecina libre, maximo 2 por turno y el costo sube con cada region', () => {
  const E = fundado();
  const c = E.civs[0];
  c.stock.Comida = 100; c.stock.Madera = 100;
  const gente = c.poblacion;
  const libres = fronteraDe(E.mundo, c.regiones);
  const r = turno(E, [{ ordenes: libres.slice(0, 3).map((x) => `colonizar ${nombreRegion(x)}`) }, {}]);
  assert.deepEqual(r.civs[0].ordenes.map((o) => o.estado), ['aplicada', 'aplicada', 'descartada']);
  assert.match(r.civs[0].ordenes[2].motivo, /maximo 2 colonizaciones/);
  assert.equal(c.regiones.length, 5);
  // pagas 6 (con 3 regiones) y despues 8 (con 4); la gente (10) come con la Comida de la produccion de este turno
  assert.equal(c.stock.Madera, 100 - 6 - 8 + c.produccion.Madera);
  assert.equal(c.stock.Comida, 100 - 6 - 8 + c.produccion.Comida - gente);
  const lejana = turno(E, [{ ordenes: ['colonizar R26'] }, {}]);
  assert.ok(['la region no es una vecina libre de las tuyas', 'la region ya es tuya'].includes(lejana.civs[0].ordenes[0].motivo));
});

test('el Indice: seis pilares, maximo 100, y se publica en los turnos 10, 20 y 30', () => {
  const E = fundado();
  for (let t = 2; t <= 10; t++) turno(E, [{}, {}]);
  assert.equal(E.turno, 10);
  assert.equal(E.indices.length, 1);
  assert.equal(E.indices[0].turno, 10);
  assert.deepEqual(E.indices[0].publicado, E.civs.map((c) => indiceDe(c).publicado));
  const ind = indiceDe(E.civs[0]);
  assert.deepEqual(Object.keys(ind.pilares), ['tecnologia', 'cultura', 'poblacion', 'economia', 'maravillas', 'estabilidad']);
  assert.ok(ind.total > 0 && ind.total <= 100);
  const lleno = E.civs[0];
  lleno.tecnologias = TECNOLOGIAS.map((t) => t.id); lleno.culturaAcumulada = 9999; lleno.poblacion = 999; lleno.produccionTotal = 99999;
  lleno.maravillas = ['piramide', 'biblioteca mayor', 'faro', 'catedral mayor', 'observatorio', 'palacio de cristal'].map((id) => ({ id, desde: 1 }));
  lleno.sumaEstabilidad = 100 * lleno.cierres;
  assert.equal(Math.round(indiceDe(lleno).total * 1e9) / 1e9, 100, 'todo al maximo suma exactamente 100');
  assert.equal(indiceDe(lleno).publicado, 100);
});

test('C02: cada Maravilla vale 2.5 puntos del Indice y el pilar nunca pasa de 15', () => {
  const c = fundado().civs[0];
  const con = (n) => { c.maravillas = ['piramide', 'biblioteca mayor', 'faro', 'catedral mayor', 'observatorio', 'palacio de cristal', 'faro'].slice(0, n).map((id) => ({ id, desde: 1 })); return indiceDe(c).pilares.maravillas; };
  assert.deepEqual([0, 1, 2, 6, 7].map(con), [0, 2.5, 5, 15, 15]);
});

test('el pilar de Estabilidad es el promedio de todos los cierres de turno', () => {
  const E = fundado();
  const c = E.civs[0];
  c.sumaEstabilidad = 50 + 70; c.cierres = 2; c.estabilidad = 70;
  assert.equal(indiceDe(c).pilares.estabilidad, 6);
});

test('termina en el turno 30 y gana el mayor Indice a un decimal; con el mismo Indice, mas tecnologias; con todo igual, un sorteo con el seed', () => {
  const lista = (E) => { E.turno = TURNOS - 1; E.civs.forEach((c) => { c.fundada = true; }); return E; };
  const jugar30 = (E) => aplicarTurno(E, [normalizarRespuesta(resp()), normalizarRespuesta(resp())]);
  const A = lista(nuevoEstado(9));
  A.civs[0].culturaAcumulada = 100;
  jugar30(A);
  assert.equal(A.turno, 30);
  assert.equal(A.ganador, 0);
  assert.equal(A.desempate, null);

  const C = lista(nuevoEstado(9));
  jugar30(C);
  assert.equal(indiceDe(C.civs[0]).publicado, indiceDe(C.civs[1]).publicado, 'dos civilizaciones iguales');
  assert.equal(C.desempate, 'sorteo');
  assert.equal(C.ganador, rngDe(C.seedMundo, TURNOS, 'desempate')() < 0.5 ? 0 : 1, 'el sorteo sale del seed del mundo');

  // mismo Indice (los puntos de tecnologia suman las eras: T2 = T1 + M1 = 2) pero distinto numero de tecnologias: gana la que tiene mas
  for (const [conMas, conMenos] of [[0, 1], [1, 0]]) {
    const D = lista(nuevoEstado(9));
    D.civs[conMas].tecnologias = ['T1', 'M1']; D.civs[conMenos].tecnologias = ['T2'];
    jugar30(D);
    assert.equal(indiceDe(D.civs[0]).publicado, indiceDe(D.civs[1]).publicado);
    assert.deepEqual([D.ganador, D.desempate], [conMas, 'tecnologias']);
  }
});

test('el turno no depende del orden de asiento: dos civilizaciones iguales con las mismas ordenes dan el mismo estado', () => {
  const E = fundado();
  const ordenes = ['investigar cultivo', 'asignar granjeros 40 lenadores 20 mineros 10 mercaderes 10 sabios 20 artistas 0'];
  turno(E, [{ ordenes }, { ordenes }]);
  const [a, b] = E.civs;
  const sin = (c) => ({ ...c, s: 0, nombre: '' });
  assert.deepEqual(sin(a), sin(b));
});
