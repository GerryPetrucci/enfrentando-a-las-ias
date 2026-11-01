// El prompt de Lobo en la aldea 1.4.0 (docs/guia-de-prompts.md): cada afirmacion poco obvia del texto se prueba contra el MOTOR. Si el motor cambia, el texto miente;
// si el texto cambia, el motor ya no lo respalda. Sin red ni modelos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import lobo from '../../juegos/lobo.js';
import { construirSistema } from '../../prompt.js';
import { crearRng } from '../../rng.js';
import { vistaDe } from '../../juegos/lobo/vista.js';
import { activosDe } from '../../juegos/lobo/estado.js';
import { motivoInvalido } from '../../juegos/lobo/turno.js';
import { normalizarRespuesta } from '../../juegos/lobo/ordenes.js';
import { CONFIGURACIONES, ROLES, LARGO_MENSAJE, PUNTOS, LIMITE_LLAMADAS, VERSION } from '../../juegos/lobo/constantes.js';
import { BOTS, ARQUETIPOS } from '../../juegos/lobo-bots.js';

const SISTEMA = construirSistema(lobo);
// Mesa de 12 con los roles en un orden fijo: 0-2 lobos, 3-4 videntes, 5 bruja, 6 cazador, 7 cupido, 8-11 aldeanos.
const ROLES12 = ['lobo', 'lobo', 'lobo', 'vidente', 'vidente', 'bruja', 'cazador', 'cupido', 'aldeano', 'aldeano', 'aldeano', 'aldeano'];
const mesa = (roles = ROLES12) => {
  const E = lobo.crear(crearRng(7), { jugadores: roles.length, modoCupido: 'nada' });
  E.roles = [...roles];
  return E;
};
const paso = (E, fn) => lobo.aplicar(E, lobo.activos(E).map((activo, i) => (activo ? fn(i) : null)));
const cupido = (E, par = [8, 9]) => paso(E, () => ({ enamorados: par }));
const lobos = (E, objetivo) => paso(E, () => ({ accion: 'matar', objetivo }));
const bruja = (E, r = { salvar: false, matar: null }) => paso(E, () => r);
const videntes = (E, objetivo = 11) => paso(E, () => ({ accion: 'inspeccionar', objetivo }));
// Deja vivos solo a `vivos` y pone la fase y la ronda: atajo para armar un caso sin jugar toda la partida.
const situar = (E, { vivos, fase, ronda = 1, enamorados = [] }) => {
  E.vivos = E.roles.map((_, i) => vivos.includes(i));
  Object.assign(E, { fase, ronda, enamorados });
  return E;
};
const tipos = (E) => E.eventos.filter((e) => e.tipo !== 'enamorados');
const invalido = (E, i, r) => motivoInvalido(E, i, normalizarRespuesta(r));

// ---------- estructura ----------
test('el prompt completo tiene las secciones de la guia, en orden, y todo en ASCII', () => {
  assert.match(SISTEMA, /^[\x00-\x7F]*$/);
  const orden = ['Tu objetivo es MAXIMIZAR TU PROPIO PUNTAJE', 'Eres un jugador de "Lobo en la aldea"', '=== REGLAS DEL JUEGO: Lobo en la aldea ===', '1. LO ESENCIAL', '2. ROLES Y PODERES', '3. COMO SE RESUELVE UNA RONDA',
    '4. EL DIA', '\n5. PUNTAJE\n', '6. LO QUE SABES Y LO QUE NO SABES', '7. RESPUESTAS DESCARTADAS Y FIN', '=== COMO LEER TU ESTADO ===', '=== COMO RESPONDER ===', 'Ejemplo del formato', '=== ERRORES FRECUENTES ===',
    'No expliques nada fuera del JSON'];
  orden.forEach((s, i) => { assert.ok(SISTEMA.includes(s), `falta «${s}»`); if (i) assert.ok(SISTEMA.indexOf(s) > SISTEMA.indexOf(orden[i - 1]), `«${s}» debe ir despues de «${orden[i - 1]}»`); });
  assert.ok(!SISTEMA.includes('ESPACIO PARA RESPONDER'), 'no se usa el aviso de espacio generico');
  assert.equal(VERSION, 'lobo-1.4.0');
});

test('los numeros del prompt salen de las constantes del motor', () => {
  for (const [n, c] of Object.entries(CONFIGURACIONES)) {
    assert.ok(SISTEMA.includes(`Mesa de ${n}: ${c.lobos} lobos, ${c.videntes} ${c.videntes === 1 ? 'vidente' : 'videntes'}, 1 bruja, 1 cazador, 1 cupido, ${c.aldeanos} aldeanos.`));
    assert.equal(c.rondas, 6);
    assert.equal(c.lobos + c.videntes + c.aldeanos + 3, Number(n));
  }
  assert.ok(SISTEMA.includes('Dura como maximo 6 rondas'));
  assert.ok(SISTEMA.includes(`+${PUNTOS.bando} a todos los asientos del bando ganador`));
  assert.ok(SISTEMA.includes(`+${PUNTOS.enamorados} a cada uno de los dos enamorados`));
  assert.ok(SISTEMA.includes(`+${PUNTOS.acierto} por cada acierto de tu rol`));
  assert.ok(SISTEMA.includes(`hasta ${LARGO_MENSAJE} caracteres`));
  assert.ok(SISTEMA.includes(`la partida tiene ${LIMITE_LLAMADAS} llamadas en total`));
  assert.equal(lobo.limiteLlamadasDuro, LIMITE_LLAMADAS);
  assert.deepEqual(ROLES, ['lobo', 'vidente', 'bruja', 'cazador', 'cupido', 'aldeano']);
  for (const r of ROLES) assert.ok(SISTEMA.includes(`"${r}"`) || SISTEMA.includes(r), r);
});

test('el formato es una linea por fase con JSON real, y cada campo esta explicado', () => {
  const lineas = lobo.formatoRespuesta.split('\n');
  assert.equal(lineas.length, 6);
  const claves = { cupido: ['enamorados'], lobos: ['accion', 'objetivo'], bruja: ['salvar', 'matar'], vidente: ['accion', 'objetivo'], cazador: ['accion', 'objetivo'], dia: ['mensaje', 'voto', 'afirmaRol'] };
  for (const linea of lineas) {
    const [, fase, json] = /^fase (\w+): (\{.*\})$/.exec(linea);
    assert.deepEqual(Object.keys(JSON.parse(json)), claves[fase], fase);
    assert.ok(lobo.explicacionDeRespuesta.includes(`fase ${fase}`), `la fase ${fase} no esta explicada`);
    for (const campo of claves[fase]) assert.ok(lobo.explicacionDeRespuesta.includes(`"${campo}"`), `el campo ${campo} de ${fase} no esta explicado`);
  }
  assert.match(lobo.explicacionDeRespuesta, /no los copies/);
  assert.match(lobo.explicacionDeRespuesta, /se descarta ENTERA/);
  assert.match(lobo.explicacionDeRespuesta, /limite de tokens/);
});

test('cada ejemplo del formato lo acepta el motor en una mesa donde sus asientos son legales (la sintaxis del prompt es la del parser)', () => {
  const ejemplo = (fase) => JSON.parse(lobo.formatoRespuesta.split('\n').find((l) => l.startsWith(`fase ${fase}:`)).replace(/^fase \w+: /, ''));
  // roles elegidos para que los asientos inventados del ejemplo sean legales: 6 y 3 y 8 y 4 son no lobos vivos; 2 y 9 vivos; 5 vivo.
  const roles = ['aldeano', 'aldeano', 'lobo', 'vidente', 'aldeano', 'aldeano', 'aldeano', 'aldeano', 'aldeano', 'aldeano', 'bruja', 'lobo'];
  const E = mesa(roles);
  const caso = (fase, i, ajuste = () => {}) => { Object.assign(E, { fase }); ajuste(); return invalido(E, i, ejemplo(fase)); };
  assert.equal(caso('cupido', 0), null);
  assert.equal(caso('lobos', 2), null);
  assert.equal(caso('bruja', 10, () => { E.victima = 4; }), null);
  assert.equal(caso('vidente', 4), null);
  assert.equal(caso('cazador', 1), null);
  assert.equal(caso('dia', 0), null);
  assert.deepEqual(ROLES.includes(ejemplo('dia').afirmaRol), true);
});

// ---------- la noche ----------
test('solo hay victima si TODOS los lobos vivos eligen el mismo asiento; un amanecer sin muertos puede ser desacuerdo o pocion y el estado no distingue (el prompt lo dice)', () => {
  const A = mesa(); cupido(A);
  paso(A, (i) => ({ accion: 'matar', objetivo: i === 0 ? 8 : 10 }));
  assert.equal(A.victima, null);
  assert.equal(vistaDe(A, 5).victima, null);
  bruja(A); videntes(A);
  const B = mesa(); cupido(B); lobos(B, 10);
  assert.equal(vistaDe(B, 5).victima, 10);
  bruja(B, { salvar: true, matar: null }); videntes(B);
  assert.ok(A.vivos.every(Boolean) && B.vivos.every(Boolean));
  assert.deepEqual(vistaDe(A, 9).eventos, vistaDe(B, 9).eventos);
  assert.match(SISTEMA, /Hay victima SOLO si todos los lobos vivos eligen el mismo asiento; si no coinciden, esa noche no hay victima/);
  assert.match(SISTEMA, /puede deberse a que los lobos no coincidieron o a que la bruja salvo a la victima; el estado no te dice cual fue/);
});

test('una respuesta de lobo descartada se reemplaza por un no lobo al azar y no se avisa (el prompt lo dice)', () => {
  const E = mesa(); cupido(E);
  const reg = paso(E, (i) => (i === 0 ? { accion: 'matar', objetivo: 1 } : { accion: 'matar', objetivo: 10 }));
  const a0 = reg.privado.acciones.find((x) => x.asiento === 0);
  assert.equal(a0.invalida, true);
  assert.equal(a0.accion, 'matar');
  assert.notEqual(E.roles[a0.objetivo], 'lobo');
  assert.match(a0.motivo, /manada/);
  assert.equal(vistaDe(E, 0).hasOwnProperty('motivo'), false, 'el estado no trae ningun aviso de descarte');
  assert.match(SISTEMA, /El motor no te avisa si una respuesta tuya fue descartada y reemplazada/);
});

test('la vidente recibe su resultado aunque muera esa noche: las inspecciones se resuelven antes del amanecer (el prompt lo dice)', () => {
  const E = mesa(); cupido(E); lobos(E, 3); bruja(E);
  paso(E, (i) => ({ accion: 'inspeccionar', objetivo: i === 3 ? 0 : 11 }));
  assert.equal(E.vivos[3], false);
  assert.deepEqual(E.inspecciones[3], [{ ronda: 1, objetivo: 0, esLobo: true }]);
  assert.equal(E.puntos[3], PUNTOS.acierto);
  assert.match(SISTEMA, /una vidente que esa misma noche va a morir recibe igual su resultado/);
});

test('solo un lobo da true al inspeccionar; se puede inspeccionar dos veces al mismo asiento (el prompt lo dice)', () => {
  const E = mesa(); cupido(E); lobos(E, 11); bruja(E);
  paso(E, () => ({ accion: 'inspeccionar', objetivo: 7 })); // Cupido
  assert.equal(E.inspecciones[3][0].esLobo, false);
  paso(E, (i) => ({ mensaje: '', voto: i === 8 ? 9 : 8 }));
  lobos(E, 9); bruja(E);
  assert.equal(invalido(E, 3, { accion: 'inspeccionar', objetivo: 7 }), null, 'repetir un asiento ya inspeccionado vale');
  assert.match(SISTEMA, /la bruja, el cazador, Cupido, las videntes y los aldeanos dan false/);
  assert.match(SISTEMA, /Puedes inspeccionar otra vez a un asiento ya inspeccionado/);
});

test('al amanecer caen a la vez la victima y el veneno, luego la pareja por amor y despues dispara el cazador (el prompt lo dice)', () => {
  const E = mesa(); cupido(E, [9, 10]); lobos(E, 9); bruja(E, { salvar: false, matar: 6 }); videntes(E);
  assert.equal(E.fase, 'cazador');
  assert.deepEqual(lobo.activos(E).flatMap((a, i) => (a ? [i] : [])), [6], 'solo el cazador muerto actua');
  assert.deepEqual(tipos(E).map((e) => [e.tipo, e.causa ?? null]), [['amanecer', null], ['muerte', 'noche'], ['muerte', 'veneno'], ['muerte', 'amor']]);
  assert.deepEqual(tipos(E).filter((e) => e.tipo === 'muerte').map((e) => e.asiento), [9, 6, 10]);
  assert.equal(E.vivos[11], true);
  paso(E, () => ({ accion: 'disparar', objetivo: 11 }));
  assert.deepEqual(tipos(E).slice(-2).map((e) => [e.tipo, e.causa ?? null]), [['disparo', null], ['muerte', 'disparo']]);
  assert.equal(E.fase, 'dia');
  assert.match(SISTEMA, /5\) AMANECER: caen a la vez la victima de los lobos \(salvo que la bruja la haya salvado\) y el asiento envenenado/);
  assert.match(SISTEMA, /si un muerto era enamorado, su pareja muere tambien \(causa "amor"\); si un muerto era el cazador, dispara/);
});

test('el cazador dispara por cualquier causa (voto o amor) y su disparo propaga el amor (el prompt lo dice)', () => {
  const V = mesa(); cupido(V); lobos(V, 11); bruja(V); videntes(V, 7);
  paso(V, (i) => ({ mensaje: '', voto: i === 6 ? 0 : 6 }));
  assert.equal(V.fase, 'cazador');
  assert.deepEqual(tipos(V).filter((e) => e.tipo === 'muerte').map((e) => e.causa), ['noche', 'voto']);
  const A = mesa(); cupido(A, [6, 9]); lobos(A, 9); bruja(A); videntes(A, 7);
  assert.equal(A.fase, 'cazador');
  assert.deepEqual(tipos(A).filter((e) => e.tipo === 'muerte').map((e) => e.causa), ['noche', 'amor']);
  paso(A, () => ({ accion: 'disparar', objetivo: 0 }));
  assert.equal(A.puntos[6], PUNTOS.acierto, 'disparar a un lobo suma 1');
  assert.match(SISTEMA, /Cuando muere, por la causa que sea \(lobos, veneno, voto o amor\)/);
});

test('el cazador dispara ANTES de comprobar la victoria (el prompt lo dice)', () => {
  const E = situar(mesa(), { vivos: [0, 6], fase: 'lobos' });
  lobos(E, 6);
  assert.equal(E.fase, 'cazador', 'con un solo lobo vivo y el cazador muerto aun no se declara a los lobos ganadores');
  paso(E, () => ({ accion: 'disparar', objetivo: 0 }));
  assert.equal(E.fin, true);
  assert.equal(E.motivoFin, 'extincion');
  assert.equal(E.ganadorBando, null);
  assert.match(SISTEMA, /dispara \(fase CAZADOR\) y su victima tambien muere[^.]*\. Solo entonces se comprueba si algun bando gano/);
});

test('una fase sin actores se salta (la bruja muerta) y los muertos ya no reciben turnos (el prompt lo dice)', () => {
  const E = situar(mesa(), { vivos: [0, 1, 2, 3, 8, 9, 10, 11], fase: 'lobos' });
  lobos(E, 8);
  assert.equal(E.fase, 'vidente', 'no hay bruja viva: la fase se salta sin que nadie responda');
  const activos = lobo.activos(E);
  for (const [i, v] of E.vivos.entries()) if (!v) assert.equal(activos[i], false, `el asiento muerto ${i} no actua`);
  assert.match(SISTEMA, /Si en una fase no queda nadie que deba actuar \(por ejemplo, la bruja ya murio\), esa fase se salta/);
});

// ---------- el dia ----------
test('empate en el maximo: no muere nadie; todos los votos y el conteo pasan a ser publicos (el prompt lo dice)', () => {
  const E = situar(mesa(), { vivos: [0, 1, 8, 9], fase: 'dia' });
  const votos = { 0: 8, 1: 9, 8: 1, 9: 0 };
  paso(E, (i) => ({ mensaje: `m${i}`, voto: votos[i] }));
  assert.equal(E.vivos.filter(Boolean).length, 4);
  const v = vistaDe(E, 9).eventos.find((e) => e.tipo === 'votacion');
  assert.deepEqual(v.votos, [{ asiento: 0, voto: 8 }, { asiento: 1, voto: 9 }, { asiento: 8, voto: 1 }, { asiento: 9, voto: 0 }]);
  assert.equal(v.conteo.length, 12);
  assert.equal(v.empate, true);
  assert.equal(v.expulsado, null);
  assert.equal(vistaDe(E, 9).eventos.filter((e) => e.tipo === 'mensaje').length, 4);
  assert.match(SISTEMA, /si hay empate en el maximo, no muere nadie/);
});

test('nadie ve los mensajes ni los votos del dia antes de votar (el prompt lo dice)', () => {
  const E = mesa(); cupido(E); lobos(E, 11); bruja(E); videntes(E, 7);
  const antes = vistaDe(E, 8).eventos;
  assert.ok(!antes.some((e) => e.tipo === 'mensaje' || e.tipo === 'votacion'));
  assert.match(SISTEMA, /Nadie ve los mensajes ni los votos de ese dia antes de votar/);
});

test('no hay victoria por paridad: 2 lobos contra 1 aldeano sigue; ganan los lobos cuando solo quedan lobos (el prompt lo dice)', () => {
  const E = situar(mesa(), { vivos: [0, 1, 8, 9], fase: 'lobos' });
  lobos(E, 8);
  assert.equal(E.fin, false);
  assert.equal(E.fase, 'dia');
  assert.deepEqual(E.vivos.flatMap((v, i) => (v ? [i] : [])), [0, 1, 9]);
  paso(E, (i) => ({ mensaje: '', voto: i === 9 ? 0 : 9 }));
  assert.equal(E.fin, true);
  assert.equal(E.ganadorBando, 'lobos');
  assert.equal(E.motivoFin, 'eliminacion');
  assert.match(SISTEMA, /no hay victoria por paridad: mientras quede un solo asiento que no sea lobo, la partida sigue/);
});

test('el tope de 6 rondas termina en empate despues de la votacion de la ronda 6, y los enamorados vivos suman 5 aunque haya empate (el prompt lo dice)', () => {
  const E = situar(mesa(), { vivos: [0, 1, 8, 9], fase: 'dia', ronda: 6, enamorados: [8, 9] });
  const votos = { 0: 8, 1: 9, 8: 1, 9: 0 };
  paso(E, (i) => ({ mensaje: '', voto: votos[i] }));
  assert.equal(E.fin, true);
  assert.equal(E.ganadorBando, null);
  assert.equal(E.motivoFin, 'tope');
  assert.equal(E.puntos[0], 0, 'los lobos no suman 10 en un empate');
  assert.equal(E.puntos[8], PUNTOS.enamorados + PUNTOS.acierto, '5 de la pareja + 1 por votar a un lobo');
  assert.match(SISTEMA, /Si nadie gano y era la ronda 6, la partida termina en empate/);
  assert.match(SISTEMA, /Cuenta tambien si hay empate o si los enamorados son de bandos distintos/);
});

// ---------- puntaje ----------
test('puntaje: aciertos de vidente, bruja, aldeanos y lobos, tal como lo dice el prompt', () => {
  const E = mesa(); cupido(E, [10, 11]);
  lobos(E, 8); bruja(E, { salvar: true, matar: 1 });
  paso(E, (i) => ({ accion: 'inspeccionar', objetivo: i === 3 ? 0 : 9 }));
  assert.equal(E.puntos[5], 2 * PUNTOS.acierto, 'bruja: salvar suma 1 y envenenar a un lobo suma 1');
  assert.equal(E.puntos[3], PUNTOS.acierto, 'vidente: inspeccion sobre un lobo');
  assert.equal(E.puntos[4], 0, 'vidente: inspeccion sobre un no lobo no suma');
  assert.equal(E.vivos[1], false);
  paso(E, (i) => ({ mensaje: '', voto: E.roles[i] === 'lobo' ? 8 : 0 }));
  assert.equal(E.puntos[0], 0, 'el lobo mas votado no suma');
  assert.equal(E.puntos[2], PUNTOS.acierto, 'el lobo que no esta entre los mas votados suma 1');
  assert.equal(E.puntos[6], PUNTOS.acierto, 'un aldeano que vota a un lobo suma 1');
  assert.equal(E.puntos[3], 2 * PUNTOS.acierto, 'los aciertos de rol se suman con los de voto');
  assert.equal(E.puntos[5], 3 * PUNTOS.acierto);
  assert.equal(E.puntos[1], 0, 'el lobo muerto no suma');
  assert.match(SISTEMA, /Los aciertos de rol se suman entre si/);
});

test('si un lobo empata en el maximo esta entre los mas votados y no suma', () => {
  const E = situar(mesa(), { vivos: [0, 1, 8, 9], fase: 'dia' });
  const votos = { 0: 8, 1: 8, 8: 0, 9: 0 };
  paso(E, (i) => ({ mensaje: '', voto: votos[i] }));
  assert.equal(E.puntos[0], 0, 'empata en el maximo con el asiento 8: esta entre los mas votados');
  assert.equal(E.puntos[1], PUNTOS.acierto, 'sin votos: no esta entre los mas votados');
  assert.match(SISTEMA, /si empata en el maximo, si esta entre los mas votados/);
});

test('el bando ganador suma 10 aunque haya muerto y la pareja viva suma 5 (el prompt lo dice)', () => {
  const E = situar(mesa(), { vivos: [0, 3, 8, 9], fase: 'dia', enamorados: [8, 9] });
  paso(E, (i) => ({ mensaje: '', voto: i === 0 ? 8 : 0 }));
  assert.equal(E.fin, true);
  assert.equal(E.ganadorBando, 'aldea');
  for (const i of [4, 5, 6, 7, 10, 11]) assert.equal(E.puntos[i], PUNTOS.bando, `el asiento ${i} (${E.roles[i]}) estaba muerto y suma ${PUNTOS.bando}`);
  assert.equal(E.puntos[8], PUNTOS.bando + PUNTOS.enamorados + PUNTOS.acierto);
  assert.equal(E.puntos[1], 0);
  assert.match(SISTEMA, /aunque hayan muerto/);
});

test('los lobos ganan cuando solo quedan lobos y suman 10 (los muertos tambien)', () => {
  const E = situar(mesa(), { vivos: [0, 1, 8], fase: 'dia' });
  paso(E, (i) => ({ mensaje: '', voto: i === 8 ? 0 : 8 }));
  assert.equal(E.ganadorBando, 'lobos');
  assert.equal(E.puntos[2], PUNTOS.bando, 'el lobo muerto suma 10');
  assert.equal(E.puntos[0], PUNTOS.bando + PUNTOS.acierto, '10 del bando + 1 por no estar entre los mas votados');
  assert.equal(E.puntos[8], PUNTOS.acierto, 'el aldeano pierde pero su voto a un lobo suma 1; no suma los 10');
});

// ---------- respuestas invalidas ----------
test('lo que invalida una respuesta, tal como lo dice ERRORES FRECUENTES', () => {
  const E = mesa(); cupido(E); lobos(E, 10);
  assert.match(invalido(E, 5, { salvar: false }), /matar debe ser null/, 'omitir "matar" invalida');
  assert.equal(invalido(E, 5, { salvar: false, matar: null }), null);
  assert.equal(invalido(E, 5, { salvar: true, matar: null }), null);
  assert.match(invalido(E, 5, { salvar: 'true', matar: null }), /salvar debe ser true o false/);
  E.victima = null;
  assert.match(invalido(E, 5, { salvar: true, matar: null }), /no hay v[ií]ctima/);
  E.victima = 10; E.pociones.salvar = false;
  assert.match(invalido(E, 5, { salvar: true, matar: null }), /ya se us/);
  E.pociones.matar = false;
  assert.match(invalido(E, 5, { salvar: false, matar: 4 }), /ya se us/);
  Object.assign(E, { fase: 'dia', pociones: { salvar: true, matar: true } });
  const buena = { mensaje: 'hola', voto: 8 };
  assert.equal(invalido(E, 4, buena), null);
  assert.match(invalido(E, 4, { ...buena, voto: '8' }), /voto debe ser un asiento entero/);
  assert.match(invalido(E, 4, { ...buena, voto: 4 }), /no puede elegirse a s[ií] mismo/);
  assert.match(invalido(E, 4, { mensaje: 'hola' }), /voto/);
  E.vivos[8] = false;
  assert.match(invalido(E, 4, buena), /ya muri/);
  E.vivos[8] = true;
  assert.match(invalido(E, 4, { ...buena, mensaje: 'x'.repeat(LARGO_MENSAJE + 1) }), new RegExp(`el m.ximo es ${LARGO_MENSAJE}`));
  assert.equal(invalido(E, 4, { ...buena, mensaje: 'x'.repeat(LARGO_MENSAJE) }), null);
  assert.equal(invalido(E, 4, { ...buena, mensaje: '' }), null);
  assert.equal(invalido(E, 4, { ...buena, afirmaRol: 'cupido' }), null);
  for (const malo of [null, '', 'Vidente', 'rey']) assert.match(invalido(E, 4, { ...buena, afirmaRol: malo }), /afirmaRol debe ser uno de/, `afirmaRol ${JSON.stringify(malo)}`);
  Object.assign(E, { fase: 'lobos' });
  assert.match(invalido(E, 0, { accion: 'matar', objetivo: 1 }), /manada/);
  assert.match(invalido(E, 0, { accion: 'matar', objetivo: 0 }), /s[ií] mismo/);
  assert.match(invalido(E, 0, { accion: 'Matar', objetivo: 8 }), /accion debe ser "matar"/);
  assert.equal(invalido(E, 0, { accion: 'matar', objetivo: 8 }), null);
  Object.assign(E, { fase: 'cupido' });
  assert.equal(invalido(E, 7, { enamorados: [7, 8] }), null, 'Cupido puede elegirse a si mismo');
  assert.match(invalido(E, 7, { enamorados: [8, 8] }), /distintos/);
  assert.match(invalido(E, 7, { enamorados: [8] }), /lista de 2/);
  for (const [clave, texto] of [['null', /Dejar el voto en null/], ['mensaje', /mas de 1000 caracteres/], ['afirmaRol', /con null, vacio, con mayusculas/], ['salvar', /"salvar":true cuando "victima" es null/]]) assert.match(lobo.erroresFrecuentes, texto, clave);
});

test('una respuesta invalida del dia se reemplaza ENTERA: mensaje vacio, sin afirmacion y voto al azar a un vivo (el prompt lo dice)', () => {
  const E = situar(mesa(), { vivos: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], fase: 'dia' });
  const reg = paso(E, (i) => (i === 8 ? { mensaje: 'x'.repeat(LARGO_MENSAJE + 1), voto: 2, afirmaRol: 'vidente' } : { mensaje: 'bien', voto: 2 }));
  const a = reg.privado.acciones.find((x) => x.asiento === 8);
  assert.equal(a.invalida, true);
  assert.equal(a.mensaje, '');
  assert.equal(a.afirmaRol, undefined);
  assert.ok(Number.isInteger(a.voto) && a.voto !== 8);
  assert.deepEqual(E.declaraciones, [], 'la afirmacion de una respuesta descartada no se guarda');
  assert.match(SISTEMA, /DIA: mensaje vacio, sin afirmacion de rol y voto a un asiento vivo al azar/);
});

test('el reemplazo de cada fase es el que dice el prompt', () => {
  const casos = [
    { fase: 'cupido', actor: 7, ok: (a) => Array.isArray(a.enamorados) && a.enamorados.length === 2 && a.enamorados[0] !== a.enamorados[1] },
    { fase: 'bruja', actor: 5, ok: (a) => a.salvar === false && a.matar === null, prepara: (E) => { E.victima = 8; } },
    { fase: 'vidente', actor: 3, ok: (a, E) => a.accion === 'inspeccionar' && E.vivos[a.objetivo] && a.objetivo !== 3 },
    { fase: 'lobos', actor: 0, ok: (a, E) => a.accion === 'matar' && E.roles[a.objetivo] !== 'lobo' },
  ];
  for (const c of casos) {
    const E = mesa(); E.fase = c.fase; c.prepara?.(E);
    const reg = lobo.aplicar(E, E.roles.map(() => 'esto no es json'));
    const a = reg.privado.acciones.find((x) => x.asiento === c.actor);
    assert.equal(a.invalida, true, c.fase);
    assert.ok(c.ok(a, E), `${c.fase}: ${JSON.stringify(a)}`);
  }
  const H = mesa(); H.vivos[6] = false; Object.assign(H, { fase: 'cazador', cazadoresPendientes: [6], despuesCazador: 'dia' });
  const reg = lobo.aplicar(H, H.roles.map(() => 'esto no es json'));
  const a = reg.privado.acciones[0];
  assert.equal(a.invalida, true);
  assert.ok(a.accion === 'disparar' && H.vivos[a.objetivo] === false && a.objetivo !== 6, 'dispara a un vivo al azar (ya murio al aplicarse)');
  assert.match(SISTEMA, /CUPIDO: dos enamorados al azar\. LOBO: un asiento vivo que no es lobo, al azar\. BRUJA: no salvar y no envenenar\./);
});

// ---------- el estado ----------
test('el orden y el contenido de las claves del estado son los de la guia', () => {
  const E = mesa();
  const claves = (i) => Object.keys(vistaDe(E, i));
  const comun = ['asiento', 'rol', 'ronda', 'fase', 'activo', 'jugadores', 'declaraciones', 'pareja', 'inspecciones'];
  assert.deepEqual(claves(7), [...comun, 'enamoradosElegidos', 'eventos']);
  assert.deepEqual(claves(0), [...comun, 'manada', 'eventos']);
  assert.deepEqual(claves(5), [...comun, 'pociones', 'victima', 'eventos']);
  assert.deepEqual(claves(3), [...comun, 'eventos']);
  assert.deepEqual(claves(8), [...comun, 'eventos']);
  for (const k of [...comun, 'enamoradosElegidos', 'manada', 'pociones', 'victima', 'eventos']) assert.ok(lobo.guiaDelEstado.includes(`"${k}"`), `la guia no explica "${k}"`);
  // La guia las explica en el mismo orden en que llegan.
  const orden = [...comun, 'enamoradosElegidos', 'manada', 'pociones', 'victima', 'eventos'];
  orden.forEach((k, i) => { if (i) assert.ok(lobo.guiaDelEstado.indexOf(`"${k}":`) > lobo.guiaDelEstado.indexOf(`"${orden[i - 1]}":`), `"${k}" debe ir despues de "${orden[i - 1]}"`); });
});

test('quien recibe el estado siempre esta activo; los vivos no llevan rol y los muertos si; la pareja y Cupido solo los saben ellos (el prompt lo dice)', () => {
  const E = mesa(); cupido(E, [9, 10]); lobos(E, 11);
  assert.equal(vistaDe(E, 5).activo, true);
  assert.equal(vistaDe(E, 5).jugadores.some((j) => 'rol' in j), false);
  assert.equal(vistaDe(E, 9).pareja, 10);
  assert.equal(vistaDe(E, 10).pareja, 9);
  assert.equal(vistaDe(E, 8).pareja, null);
  assert.deepEqual(vistaDe(E, 7).enamoradosElegidos, [9, 10]);
  assert.equal('enamoradosElegidos' in vistaDe(E, 9), false);
  assert.equal(vistaDe(E, 8).eventos.some((e) => e.tipo === 'enamorados'), false, 'el estado no trae el evento de Cupido');
  assert.deepEqual(vistaDe(E, 1).manada, [0, 1, 2]);
  bruja(E); videntes(E, 7);
  assert.equal(vistaDe(E, 8).jugadores[11].rol, 'aldeano', 'el muerto lleva su rol');
  assert.equal(vistaDe(E, 5).victima, null, 'la victima solo viene en la fase bruja');
});

test('las partidas con bots solo entregan estados con activo=true y solo a quien debe actuar', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const rng = crearRng(seed), E = lobo.crear(rng, { jugadores: seed % 2 ? 8 : 12 });
    for (let n = 0; n < 60 && !E.fin; n++) {
      const act = activosDe(E);
      for (const [i, a] of act.entries()) if (a) assert.equal(vistaDe(E, i).activo, true);
      lobo.aplicar(E, E.roles.map((_, i) => (act[i] ? BOTS[ARQUETIPOS[i % ARQUETIPOS.length]](E, i, rng) : null)));
    }
    const publico = new Set(E.eventos.filter((e) => e.tipo !== 'enamorados' && e.tipo !== 'final').map((e) => e.tipo));
    for (const t of publico) assert.ok(['amanecer', 'muerte', 'mensaje', 'votacion', 'disparo'].includes(t), `tipo de evento no documentado: ${t}`);
  }
});

test('la muerte de quien afirmo un rol trae la comprobacion contra su rol real (el prompt lo dice)', () => {
  const E = mesa(); cupido(E, [9, 10]); lobos(E, 11); bruja(E); videntes(E, 7);
  paso(E, (i) => (i === 8 ? { mensaje: '', voto: 2, afirmaRol: 'vidente' } : { mensaje: '', voto: 8 }));
  const muerte = tipos(E).filter((e) => e.tipo === 'muerte').at(-1);
  assert.equal(muerte.asiento, 8);
  assert.deepEqual(muerte.comprobacion, { ronda: 1, rolDeclarado: 'vidente', rolReal: 'aldeano', coincide: false });
  assert.deepEqual(vistaDe(E, 0).declaraciones, [{ asiento: 8, ronda: 1, rol: 'vidente' }]);
  assert.match(SISTEMA, /compara tu ULTIMA afirmacion con tu rol real/);
});

// ---------- lo que el prompt NO debe tener ----------
test('el prompt no da consejos de estrategia ni nombra bots', () => {
  assert.doesNotMatch(SISTEMA, /te conviene|lo mejor es|siempre debes|nunca debes|recomend|mejor estrategia|estrategia (optima|ganadora)|sugerimos|deberias/i);
  // Los arquetipos de bot son palabras sueltas que el texto podria usar con otro sentido ("revela", "calla"): solo se vigilan los que no tienen uso normal aqui.
  assert.doesNotMatch(SISTEMA, /\b(agresivo|silencioso|rapida|guarda|mayoria|contradice)\b|Control /);
});
