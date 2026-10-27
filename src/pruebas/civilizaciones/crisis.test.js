import test from 'node:test';
import assert from 'node:assert/strict';
import { fundado, turno, nuevoEstado, tokens, promptDe } from './ayudas.js';
import { calendarioEventos, avisosDe } from '../../juegos/civilizaciones/avisos.js';
import { resolverEvento } from '../../juegos/civilizaciones/turno/eventos.js';
import { resolverDilema } from '../../juegos/civilizaciones/turno/dilemas.js';
import { reclutar, defensaDe, resolverInvasion } from '../../juegos/civilizaciones/turno/invasion.js';
import { modificadores } from '../../juegos/civilizaciones/economia.js';
import { costoEdificio, construir } from '../../juegos/civilizaciones/edificios.js';
import { EVENTO, DILEMAS, GUARDIAS } from '../../juegos/civilizaciones/constantes.js';

const rc = () => ({ eventos: [] });
const datos = (seed = 7) => { const E = fundado({ seed }); return [E, E.civs[0]]; };
const aplicar = (E, c, id, n = 1, t = 9) => { const r = rc(); resolverEvento(E, c, { turno: t, id }, n, false, r); return r.eventos[0]; };

test('calendario: determinista, 10 eventos, sin repetir anterior, sin peste antes de T9', () => {
  for (let seed = 0; seed < 100; seed++) {
    const cs = calendarioEventos(seed);
    assert.deepEqual(cs, calendarioEventos(seed));
    assert.equal(cs.length, 10);
    cs.forEach((e, i) => {
      assert.equal(e.turno, (i + 1) * 3);
      assert.ok(EVENTO[e.id]);
      if (i) assert.notEqual(e.id, cs[i - 1].id);
      if (e.id === 'peste') assert.ok(e.turno >= 9);
    });
  }
});

test('avisos puros: repentinos solo hoy; evento e invasion conservan claves independientes', () => {
  const E = nuevoEstado();
  E.calendario = [{ turno: 3, id: 'terremoto' }, { turno: 9, id: 'sequia' }];
  const antes = structuredClone(E);
  assert.equal(avisosDe(E, 2).evento, null);
  assert.equal(avisosDe(E, 3).evento.id, 'terremoto');
  assert.equal(avisosDe(E, 8).evento.id, 'sequia');
  assert.equal(avisosDe(E, 8).invasion.fuerza, 6);
  assert.equal(avisosDe(E, 7).invasion.turno, 8);
  assert.deepEqual(E, antes);
});

test('cada dilema aplica exactamente su opcion y queda permanente; Colonias elige mayor Comida y menor id', () => {
  for (const [era, d] of Object.entries(DILEMAS)) for (const opcion of d.opciones) {
    const [E, c] = datos();
    c.dilemaPendiente = Number(era);
    const r = rc();
    resolverDilema(E, c, opcion.n, true, r);
    assert.equal(c.dilemas[era], opcion.n);
    assert.equal(c.dilemaPendiente, null);
    assert.equal(r.eventos[0].predeterminada, false);
    const despues = structuredClone(c);
    resolverDilema(E, c, 1, false, r);
    assert.deepEqual(c, despues);
  }
  const [E, c] = datos();
  const libres = E.mundo.regs.filter((r) => !c.regiones.includes(r.id) && r.vecinos.some((id) => c.regiones.includes(id)));
  // La frontera se obtiene del mismo grafo que usa colonizar.
  assert.ok(libres.length);
  for (const r of E.mundo.regs) r.flujo.Comida = 0;
  const esperado = libres.map((r) => r.id).sort((a, b) => a - b)[0];
  E.mundo.regs[esperado].flujo.Comida = 100;
  c.dilemaPendiente = 5;
  resolverDilema(E, c, 2, true, rc());
  assert.ok(c.regiones.includes(esperado));
});

test('fase 2: ultima respuesta cuenta desde presagio; paga una vez antes de producir; duracion inclusiva', () => {
  const [E, c] = datos(); E.calendario = [{ turno: 3, id: 'sequia' }];
  turno(E, [{ ordenes: ['responder 3', 'responder sequia 1'] }, {}]);
  assert.equal(c.respuestasEventos[3], 1);
  const madera = c.stock.Madera;
  const r = turno(E);
  assert.equal(c.stock.Madera, madera - 6 + c.produccion.Madera);
  assert.equal(r.eventos.filter((e) => e.s === 0 && e.tipo === 'evento').length, 1);
  assert.ok(Math.abs(modificadores(c, 3).pct.Comida + 0.3) < 1e-9, 'constructores -10% y sequia -20%');
  assert.ok(c.temporales.some((x) => x.desde === 3 && x.hasta === 4));
  assert.equal(c.respuestasEventos[3], undefined);
  turno(E);
  assert.equal(c.temporales.length, 0, 'caduca despues del cierre inclusivo de T4');
  assert.equal(modificadores(c, 5).pct.Comida, -0.1);
});

test('elecciones explicitas y predeterminadas se registran; responder y dilema no se ejecutan dos veces', () => {
  const [E, c] = datos(); E.calendario = [{ turno: 3, id: 'genio' }];
  c.dilemaPendiente = 2;
  const r = turno(E, [{ ordenes: ['dilema 2', 'dilema 3', 'responder 2'] }, {}]);
  assert.equal(c.dilemas[2], 3);
  assert.equal(r.civs[0].ordenes.length, 3);
  assert.equal(c.stats.total, 3, 'las tres ordenes se cuentan una sola vez');
  assert.equal(r.eventos.find((e) => e.tipo === 'dilema').predeterminada, false);
  E.civs[1].dilemaPendiente = 2;
  const s = turno(E);
  assert.equal(E.civs[1].dilemas[2], 1);
  assert.equal(s.eventos.find((e) => e.tipo === 'dilema').predeterminada, true);
  assert.equal(s.eventos.find((e) => e.s === 0 && e.tipo === 'evento').opcion, 2);
  assert.equal(s.eventos.find((e) => e.s === 1 && e.tipo === 'evento').predeterminada, true);
});

test('respuestas descartan opcion ajena o clave ausente: sin clave nunca responde invasion', () => {
  const [E] = datos(); E.turno = 7; E.calendario = [{ turno: 9, id: 'inundacion' }];
  const r = turno(E, [{ ordenes: ['responder 3', 'responder invasion 3', 'responder peste 2', 'dilema 1', 'responder 2', 'responder invasion 2'] }, {}]);
  assert.deepEqual(r.civs[0].ordenes.map((o) => o.estado), ['descartada', 'descartada', 'descartada', 'descartada', 'aplicada', 'aplicada']);
  assert.equal(E.civs[0].respuestasEventos[9], 2);
});

test('Sequia: pozos, racionar por insolvencia y migracion sin golpe; duracion 2', () => {
  const [E, c] = datos(); c.stock.Madera = 0;
  const e = aplicar(E, c, 'sequia');
  assert.equal(e.opcion, 2); assert.equal(e.solicitada, 1);
  assert.equal(e.fallback, true);
  assert.equal(modificadores(c, 9).estabilidad, -5);
  assert.equal(modificadores(c, 10).pct.Comida, -0.5);
  assert.equal(modificadores(c, 11).estabilidad, 0);
  c.temporales = []; c.poblacion = 1;
  aplicar(E, c, 'sequia', 3);
  assert.equal(c.poblacion, 1); assert.equal(c.temporales.length, 0);
});

test('Peste: pagos, fallback, hospital activo y piso 1; porcentajes redondean arriba', () => {
  for (const [opcion, hospital, esperada] of [[1, false, 92], [1, true, 96], [2, false, 85], [2, true, 93], [3, true, 85]]) {
    const [E, c] = datos(); c.poblacion = 100; c.stock.Oro = 6;
    if (hospital) c.edificios[c.capital] = { tipo: 'hospital', desde: 9 };
    aplicar(E, c, 'peste', opcion);
    assert.equal(c.poblacion, esperada);
    if (opcion === 1) assert.equal(c.stock.Oro, 0);
  }
  const [E, c] = datos(); c.stock.Oro = 0; c.poblacion = 1;
  const cultura = c.culturaAcumulada;
  assert.equal(aplicar(E, c, 'peste').opcion, 2);
  assert.equal(c.culturaAcumulada, cultura + 10);
  assert.equal(c.poblacion, 1);
});

test('Terremoto: mismo dado, reconstruye con costo o pierde edificio; abandonar protege capital', () => {
  for (let seed = 0; seed < 20; seed++) {
    const [E, c] = datos(seed);
    const periferia = c.regiones.find((r) => r !== c.capital);
    c.edificios = { [periferia]: { tipo: 'aserradero', desde: 1 }, [c.capital]: { tipo: 'granero', desde: 1 } };
    const e = aplicar(E, c, 'terremoto', 2);
    assert.equal(e.region, periferia, 'la capital solo es candidata si no hay otro edificio');
    assert.ok(c.edificios[c.capital]);
  }
  for (const opcion of [1, 2]) {
    const [E, c] = datos();
    const region = c.regiones.find((r) => r !== c.capital);
    c.edificios = { [region]: { tipo: 'granero', desde: 1 } };
    c.stock.Madera = 20; c.stock.Roca = 20;
    const costo = costoEdificio('granero', modificadores(c, 9));
    const e = aplicar(E, c, 'terremoto', opcion);
    assert.equal(e.region, region);
    if (opcion === 1) {
      assert.equal(c.stock.Madera, 20 - costo.Madera);
      assert.equal(c.edificios[region].desde, 10);
    } else { assert.ok(!c.regiones.includes(region)); assert.equal(c.edificios[region], undefined); }
  }
  const [E, c] = datos(); c.edificios = { [c.capital]: { tipo: 'granero', desde: 1 } };
  c.stock.Madera = 0;
  assert.equal(aplicar(E, c, 'terremoto').fallback, true);
  assert.ok(c.regiones.includes(c.capital)); assert.equal(c.edificios[c.capital], undefined);
  c.edificios[c.capital] = { tipo: 'granero', desde: 1 };
  aplicar(E, c, 'terremoto', 2);
  assert.ok(c.regiones.includes(c.capital), 'abandonar nunca pierde la capital');
  assert.doesNotThrow(() => aplicar(E, c, 'terremoto', 2));
});

test('capital sola: la vista omite abandonar; motor descarta la opcion y conserva el descuento de Genio', () => {
  const [E, c] = datos(); E.turno = 2; E.calendario = [{ turno: 3, id: 'terremoto' }];
  c.edificios = { [c.capital]: { tipo: 'granero', desde: 1 } }; c.descuentoIngeniero = true;
  c.stock.Madera = 100; c.stock.Roca = 100;
  const v = civilizaciones.vista(E, 0);
  assert.match(v, /responder terremoto 1/); assert.doesNotMatch(v, /responder terremoto 2/);
  const r = turno(E, [{ ordenes: ['responder terremoto 2'] }, {}]);
  assert.equal(r.civs[0].ordenes[0].estado, 'descartada');
  assert.equal(c.descuentoIngeniero, true);
  assert.equal(c.edificios[c.capital].desde, 4);
});

test('Inundacion, Yacimiento, Mercader e Incendio: costos atomicos y fallbacks gratuitos', () => {
  const [E, c] = datos(); c.stock.Madera = 4;
  aplicar(E, c, 'inundacion'); assert.equal(c.stock.Madera, 0);
  assert.equal(modificadores(c, 11).pct.Comida, 0.4);
  assert.equal(modificadores(c, 12).pct.Comida, -0.1);
  assert.equal(aplicar(E, c, 'inundacion').opcion, 2);
  const hierro = c.stock.Hierro, roca = c.stock.Roca;
  aplicar(E, c, 'yacimiento'); assert.equal(c.stock.Hierro, hierro + 8); assert.equal(c.stock.Roca, roca + 4);
  const oro = c.stock.Oro; aplicar(E, c, 'yacimiento', 2); assert.equal(c.stock.Oro, oro + 12);
  c.stock.Oro = 7; assert.equal(aplicar(E, c, 'mercader').opcion, 3); assert.equal(c.stock.Oro, 7);
  c.stock.Oro = 8; aplicar(E, c, 'mercader'); assert.equal(c.stock.Oro, 0); assert.equal(c.stock.Madera, 8);
  aplicar(E, c, 'mercader', 2); assert.equal(c.stock.Madera, 0); assert.equal(c.stock.Oro, 10);
  c.stock.Madera = 11; c.stock.Oro = 3;
  assert.equal(aplicar(E, c, 'incendio').opcion, 2); assert.equal(c.stock.Madera, 7);
  c.stock.Madera = 11; c.stock.Oro = 4;
  aplicar(E, c, 'incendio'); assert.equal(c.stock.Madera, 9); assert.equal(c.stock.Oro, 0);
});

test('Genio: Ciencia y Cultura instantaneas; descuento persiste hasta construccion valida y se consume una vez', () => {
  const [E, c] = datos();
  const ciencia = c.reservaCiencia, cultura = c.culturaAcumulada;
  aplicar(E, c, 'genio'); assert.equal(c.reservaCiencia, ciencia + 15);
  aplicar(E, c, 'genio', 2); assert.equal(c.culturaAcumulada, cultura + 15);
  aplicar(E, c, 'genio', 3);
  const region = c.capital; c.tecnologias = ['T1', 'M1']; c.stock.Madera = 100; c.stock.Roca = 100;
  assert.match(construir(c, 999, 'granero', 10, modificadores(c, 10)), /no es tuya/);
  const antes = c.stock.Madera;
  assert.equal(construir(c, region, 'granero', 10, modificadores(c, 10)), null);
  assert.equal(c.stock.Madera, antes - 2, 'constructores -20% y genio -30% sumados: ceil(1.5)');
  assert.equal(modificadores(c, 11).edificiosCosto, -0.2);
});

test('Revuelta: reprimir exige 3 Guardias; sin ellos usa Oro o tolera; efectos valen ese cierre', () => {
  const [E, c] = datos(); c.guardias = 2; c.stock.Oro = 7;
  assert.equal(aplicar(E, c, 'revuelta').opcion, 3); assert.equal(c.guardias, 2); assert.equal(c.stock.Oro, 7);
  c.temporales = []; c.stock.Oro = 8;
  assert.equal(aplicar(E, c, 'revuelta').opcion, 2); assert.equal(c.stock.Oro, 0);
  c.temporales = []; c.guardias = 3;
  assert.equal(aplicar(E, c, 'revuelta').opcion, 1); assert.equal(c.guardias, 3, 'los Guardias no se gastan');
  assert.equal(modificadores(c, 9).estabilidad, -5);
  assert.equal(modificadores(c, 10).estabilidad, 0);
});

test('Cometa: dado comun; Exodo y cultura instantanea no alteran el flujo de Cultura', () => {
  for (let seed = 0; seed < 40; seed++) {
    const gemelos = fundado({ seed });
    gemelos.civs.forEach((c) => aplicar(gemelos, c, 'cometa'));
    assert.deepEqual(gemelos.civs[0].temporales, gemelos.civs[1].temporales);
    assert.equal(gemelos.civs[0].culturaAcumulada, gemelos.civs[1].culturaAcumulada);
  }
  const E = fundado();
  E.civs.forEach((c) => { c.cultura = 0; aplicar(E, c, 'cometa'); });
  assert.deepEqual(E.civs[0].temporales, E.civs[1].temporales);
  assert.equal(E.civs[0].culturaAcumulada, E.civs[1].culturaAcumulada);
  const c = E.civs[0], p = c.poblacion; c.estabilidad = 59;
  aplicar(E, c, 'exodo'); assert.equal(c.poblacion, p + 3);
  assert.equal(c.cultura, 0);
  assert.equal(c.temporales.at(-1).efectos[0].v, -3);
  c.poblacion = 14; aplicar(E, c, 'exodo'); assert.equal(c.poblacion, 15, 'espacio 6+3*3');
  c.poblacion = 20; aplicar(E, c, 'exodo'); assert.equal(c.poblacion, 20, 'no baja una poblacion ya sobre el espacio');
});

test('efecto de un turno cuenta en el cierre antes de caducar y no se aplica de nuevo', () => {
  const [E, c] = datos();
  E.calendario = [{ turno: 3, id: 'revuelta' }]; E.turno = 2;
  c.rasgos = []; c.stock.Oro = 8;
  turno(E, [{ ordenes: ['responder 2'] }, {}]);
  assert.equal(c.estabilidad, 55);
  assert.equal(c.temporales.length, 0);
  const oro = c.stock.Oro;
  turno(E);
  assert.equal(c.estabilidad, 50);
  assert.equal(c.stock.Oro, oro + c.produccion.Oro);
});

test('el dilema que nace al investigar espera al turno siguiente; nueva opcion rige antes de producir', () => {
  const [E, c] = datos(); E.calendario = [];
  c.tecnologias = ['T1', 'M1', 'C1']; c.proyectos = [{ tec: 'S1', progreso: 0 }]; c.reservaCiencia = 100;
  const r = turno(E, [{ ordenes: ['dilema 3'] }, {}]);
  assert.equal(r.civs[0].ordenes[0].estado, 'descartada');
  assert.equal(c.era, 2); assert.equal(c.dilemaPendiente, 2); assert.equal(c.dilemas[2], undefined);
  turno(E, [{ ordenes: ['dilema 3'] }, {}]);
  assert.equal(c.dilemas[2], 3); assert.equal(c.dilemaPendiente, null);
  assert.ok(Math.abs(modificadores(c, 3).pct.Madera - 0.15) < 1e-9);
});

test('reclutar en la fase 3 permite resistir hoy; los guardias nuevos comen pero no aumentan produccion', () => {
  const [E, c] = datos(); E.turno = 7; E.calendario = [];
  c.stock.Comida = 200; c.stock.Hierro = 20; c.stock.Oro = 0; c.rasgos = [];
  const antes = c.poblacion;
  const r = turno(E, [{ ordenes: ['responder invasion 1', 'reclutar 6'] }, {}]);
  assert.equal(r.eventos.find((e) => e.tipo === 'invasion' && e.s === 0).resultado, 'repelida');
  assert.equal(c.stock.Comida, 200 - 6 + c.produccion.Comida - antes - 6);
  assert.equal(c.poblacion, antes + 1, 'los Guardias no se restan a Poblacion');
});

test('reclutar: costo entero por lote, mitad no apila, 40 acumulados por turno; guardias comen y no producen', () => {
  const [E, c] = datos(); c.stock.Comida = 100; c.stock.Hierro = 100;
  assert.equal(reclutar(c, 30, modificadores(c, 2), 0), null);
  assert.match(reclutar(c, 11, modificadores(c, 2), 30), /40/);
  c.rasgos = ['guerreros']; c.dilemas[2] = 1;
  const comida = c.stock.Comida;
  assert.equal(reclutar(c, 3, modificadores(c, 2), 30), null);
  assert.equal(c.stock.Comida, comida - 2, 'ceil(3/2), sin doble descuento');
  const r = turno(E, [{ ordenes: ['reclutar 40', 'reclutar 1'] }, {}]);
  assert.deepEqual(r.civs[0].ordenes.map((o) => o.estado), ['aplicada', 'descartada']);
  assert.equal(c.guardias, 73);
  assert.equal(GUARDIAS.maxPorTurno, 40);
});

test('defensa: mayor multiplicador y mejor muralla, bonos sumados con piso; edificio nuevo espera', () => {
  const [, c] = datos(); c.guardias = 4; c.rasgos = ['guerreros', 'comerciantes'];
  c.tecnologias = ['D3', 'D5', 'D6'];
  c.edificios = { [c.capital]: { tipo: 'fortaleza', desde: 9 } };
  assert.equal(defensaDe(c, 9), 4 * 3 * (1 + 1.5 + 0.3 - 0.15));
  c.tecnologias = []; c.rasgos = [];
  assert.equal(defensaDe(c, 8), 4); assert.equal(defensaDe(c, 9), 8);
});

test('invasion: tributo completo, insolvencia resiste sin pago parcial; tres escalones y piso de gente', () => {
  for (const [guardias, resultado] of [[6, 'repelida'], [3, 'saqueo'], [0, 'derrota']]) {
    const [E, c] = datos(); c.rasgos = []; c.guardias = guardias; c.stock.Oro = 11; c.stock.Comida = 20; c.poblacion = 1;
    const r = rc(); resolverInvasion(E, c, { turno: 8, fuerza: 6 }, 2, true, r);
    assert.equal(r.eventos[0].resultado, resultado);
    assert.equal(r.eventos[0].tributoInsuficiente, true);
    assert.equal(c.poblacion, 1);
    assert.equal(c.regiones.length, resultado === 'derrota' ? 2 : 3);
    assert.equal(c.stock.Oro, resultado === 'repelida' ? 11 : 8);
    assert.equal(c.stock.Comida, resultado === 'repelida' ? 20 : 15);
  }
  const [E, c] = datos(); c.stock.Oro = 12;
  const r = rc(); resolverInvasion(E, c, { turno: 8, fuerza: 6 }, 2, true, r);
  assert.equal(r.eventos[0].resultado, 'tributo'); assert.equal(c.stock.Oro, 0); assert.equal(c.regiones.length, 3);
});

test('vista: avisos exactos, dilemas y defensa sin filtrar respuestas privadas; lecturas no mutan y prompt cabe', () => {
  const E = fundado(); E.turno = 7; E.calendario = [{ turno: 9, id: 'sequia' }];
  E.civs[0].dilemaPendiente = 2; E.civs[0].stock.Oro = 0;
  E.civs[1].respuestasEventos[9] = 3;
  const antes = structuredClone(E), v = civilizaciones.vista(E, 0);
  assert.match(v, /responder sequia 1/); assert.match(v, /responder invasion 2/);
  assert.match(v, /no te alcanza/); assert.match(v, /dilema 1/);
  assert.deepEqual(E, antes);
  assert.ok(tokens(promptDe(E, 0)) <= 6000);
});

// Se importa el juego mediante la ayuda para que esta prueba use la misma vista que la arena.
import { civilizaciones } from './ayudas.js';
