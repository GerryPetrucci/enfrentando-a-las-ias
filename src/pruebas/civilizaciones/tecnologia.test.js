import test from 'node:test';
import assert from 'node:assert/strict';
import { costoVigente, disponible, disponibles, investigar, resolverInvestigacion, actualizarEra, previaDe } from '../../juegos/civilizaciones/tecnologia.js';
import { crearCivilizacion } from '../../juegos/civilizaciones/estado.js';
import { TECNOLOGIAS, COSTO_TECNOLOGIA } from '../../juegos/civilizaciones/constantes.js';
import { nombreRegion } from '../../juegos/civilizaciones/mundo.js';
import { turno, fundado } from './ayudas.js';

const civ = (extra = {}) => ({ ...crearCivilizacion(0), fundada: true, ...extra });
const rivalSin = () => ({ tecnologiasCierre: [] });

test('C09: el costo con difusion es (costo x 7 + 9) div 10 en enteros, siempre hacia arriba (con la escalera 9-17-29-43-63-86: 7, 12, 21, 31, 45, 61)', () => {
  const rival = { tecnologiasCierre: TECNOLOGIAS.map((t) => t.id) };
  assert.deepEqual(['T1', 'S2', 'T3', 'T4', 'M5', 'D6'].map((id) => costoVigente(id, rival)), [7, 12, 21, 31, 45, 61]);
  assert.deepEqual(['T1', 'S2', 'T3', 'T4', 'M5', 'D6'].map((id) => costoVigente(id, rivalSin())), COSTO_TECNOLOGIA);
  // la aritmetica es entera: 0.7 x 19 = 13.3 sube a 14 (con la escalera 1.2.0), 0.7 x 70 = 49 exacto no sube, y 0.7 x 10 = 7 tampoco
  const difundido = (c) => Math.floor((c * 7 + 9) / 10);
  assert.deepEqual([19, 70, 10, 29].map(difundido), [14, 49, 7, 21]);
});

test('solo se investiga lo que esta a tu alcance: no conocida, de tu era o anterior y con la previa de su rama', () => {
  const c = civ();
  assert.deepEqual(disponibles(c).sort(), ['C1', 'D1', 'E1', 'M1', 'S1', 'T1'], 'en la era 1 las seis de la era 1');
  assert.equal(disponible(c, 'T2'), false, 'Riego pide Cultivo y la era 2');
  assert.equal(investigar(c, 'T2', 1), 'es de la era 2 y estas en la 1');
  const c2 = civ({ era: 2, tecnologias: ['S1'] });
  assert.equal(investigar(c2, 'T2', 1), 'te falta Cultivo');
  assert.equal(investigar(c2, 'S1', 1), 'ya la conoces');
  assert.equal(investigar(c2, 'S2', 1), null);
  assert.equal(investigar(c2, 'nada', 1), 'tecnologia desconocida');
  assert.equal(previaDe('S2'), 'S1');
  assert.equal(previaDe('S1'), null);
});

test('investigar: un proyecto que ya lo es no hace nada; con el cupo lleno reemplaza al mas nuevo y su progreso vuelve a la reserva (nada se pierde en silencio)', () => {
  const c = civ({ proyectos: [{ tec: 'T1', progreso: 4 }], reservaCiencia: 0 });
  assert.equal(investigar(c, 'T1', 1), null);
  assert.deepEqual(c.proyectos, [{ tec: 'T1', progreso: 4 }], 'idempotente');
  assert.equal(investigar(c, 'M1', 1), null);
  assert.deepEqual(c.proyectos, [{ tec: 'M1', progreso: 0 }]);
  assert.equal(c.reservaCiencia, 4, 'el progreso del reemplazado vuelve a la reserva');
  const dos = civ({ proyectos: [{ tec: 'T1', progreso: 4 }, { tec: 'M1', progreso: 3 }] });
  investigar(dos, 'C1', 2);
  assert.deepEqual(dos.proyectos.map((p) => p.tec), ['T1', 'C1'], 'reemplaza al mas nuevo, no al mas viejo');
  assert.equal(dos.reservaCiencia, 3);
});

test('la Ciencia se reparte en los proyectos en orden: el primero hasta completarse, el resto despues, y lo que sobra se guarda', () => {
  const e1 = COSTO_TECNOLOGIA[0];                                // costo de una tecnologia de la era 1
  const c = civ({ reservaCiencia: 25, proyectos: [{ tec: 'T1', progreso: 0 }, { tec: 'M1', progreso: 0 }] });
  assert.deepEqual(resolverInvestigacion(c, rivalSin()), ['T1', 'M1']);
  assert.deepEqual(c.tecnologias, ['T1', 'M1']);
  assert.equal(c.reservaCiencia, 25 - 2 * e1);
  assert.deepEqual(c.proyectos, []);
  const justo = civ({ reservaCiencia: e1 + 2, proyectos: [{ tec: 'T1', progreso: 0 }, { tec: 'M1', progreso: 0 }] });
  assert.deepEqual(resolverInvestigacion(justo, rivalSin()), ['T1']);
  assert.deepEqual(justo.proyectos, [{ tec: 'M1', progreso: 2 }], 'lo que sobro del primero avanza el segundo');
  assert.equal(justo.reservaCiencia, 0);
});

test('difusion: si el rival ya la conocia al cierre del turno anterior baja el costo, y el progreso que exceda el costo vigente vuelve a la reserva', () => {
  const c = civ({ reservaCiencia: 0, proyectos: [{ tec: 'T1', progreso: 8 }] });
  const hechas = resolverInvestigacion(c, { tecnologiasCierre: ['T1'] });
  assert.deepEqual(hechas, ['T1'], 'costaba 10 y ahora 7: con 8 de progreso se completa');
  assert.equal(c.reservaCiencia, 1, 'el exceso (8 - 7) vuelve a la reserva');
  const sin = civ({ reservaCiencia: 0, proyectos: [{ tec: 'T1', progreso: 8 }] });
  assert.deepEqual(resolverInvestigacion(sin, rivalSin()), [], 'sin el descuento faltan 2');
});

test('C03: la difusion usa la instantanea comun del cierre anterior, asi que el orden de resolucion no cambia nada (lo que aprenden los dos en el mismo turno no abarata a ninguno)', () => {
  const e1 = COSTO_TECNOLOGIA[0];
  const armar = () => { const E = fundado(); for (const c of E.civs) { c.reservaCiencia = e1; c.proyectos = [{ tec: 'T1', progreso: 0 }]; } return E; };
  const resolver = (E, orden) => { for (const s of orden) resolverInvestigacion(E.civs[s], E.civs[1 - s]); return E.civs.map((c) => [c.tecnologias, c.reservaCiencia]); };
  const a = resolver(armar(), [0, 1]), b = resolver(armar(), [1, 0]);
  assert.deepEqual(a, b);
  assert.deepEqual(a, [[['T1'], 0], [['T1'], 0]], 'las dos pagan el costo completo');
});

test('era: se pasa a la E+1 al conocer 4 de las 6 de la era E (se pueden omitir dos, incluso dos ramas enteras) y entrar a una era 2 a 6 deja un dilema pendiente', () => {
  const c = civ({ tecnologias: ['T1', 'M1', 'C1'] });
  assert.deepEqual(actualizarEra(c), []);
  assert.equal(c.era, 1);
  c.tecnologias.push('S1');
  assert.deepEqual(actualizarEra(c), [2]);
  assert.deepEqual([c.era, c.dilemaPendiente], [2, 2]);
  assert.deepEqual(actualizarEra(c), [], 'no vuelve a avanzar sin mas tecnologias');
  // especializacion: cuatro ramas completas, sin ESPIRITU ni DEFENSA, llegan a la era 6
  const e = civ({ tecnologias: TECNOLOGIAS.filter((t) => 'TMCS'.includes(t.rama)).map((t) => t.id) });
  actualizarEra(e);
  assert.equal(e.era, 6, 'con 4 ramas completas se llega a la era 6');
  assert.equal(e.dilemaPendiente, 6);
});

test('integracion: en la fase 5 la Ciencia producida completa la tecnologia y la lista de conocidas cambia solo al cierre del turno', () => {
  const E = fundado();
  const c = E.civs[0];
  c.reservaCiencia = 30; // sobra: la produccion de este turno se suma
  turno(E, [{ ordenes: ['investigar cultivo'] }, {}]);
  assert.ok(c.tecnologias.includes('T1'), 'completada este turno');
  assert.deepEqual(c.tecnologiasCierre, c.tecnologias, 'y desde el cierre es la instantanea que lee el rival');
  assert.deepEqual(E.civs[1].tecnologiasCierre, []);
  assert.ok(!E.civs[1].tecnologias.includes('T1'));
});

test('una tecnologia que se completa en la fase 5 no desbloquea ordenes de ese mismo turno', () => {
  const E = fundado();
  const c = E.civs[0];
  c.reservaCiencia = 30;
  const r = turno(E, [{ ordenes: ['investigar cultivo', `construir ${nombreRegion(c.regiones[0])} granero`] }, {}]);
  const orden = r.civs[0].ordenes.find((o) => o.tipo === 'construir');
  assert.equal(orden.estado, 'descartada');
  assert.match(orden.motivo, /te falta la tecnologia T1/);
});
