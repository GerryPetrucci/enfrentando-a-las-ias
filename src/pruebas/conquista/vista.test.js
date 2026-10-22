import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { nuevoEstado, R, vistasDePartida } from './ayudas.js';
import { vistaTexto } from '../../juegos/conquista/vista.js';
import { sumarUni, regionesDe } from '../../juegos/conquista/estado.js';
import { resumenPublico } from '../../juegos/conquista/texto.js';
import { MARAVILLA } from '../../juegos/conquista/constantes.js';

test('la vista trae lo tuyo y lo publico', () => {
  const E = nuevoEstado(4), v = vistaTexto(E, 0);
  assert.match(v, /^MAPA \(terreno/, 'lo fijo de la partida va primero (prefijo cacheable)');
  assert.match(v, /\nTurno 1 de 30\. Eres Azur\./);
  assert.match(v, /Capitales: Azur R\d\d/);
  assert.ok(v.includes('Honor: Azur 5 | Ambar 5 | Violeta 5 | Rosa 5'));
  assert.match(v, /Maravilla: ninguna/);
  assert.ok(v.includes('Tu almacen: Comida 6 | Madera 4 | Roca 2 | Hierro 0 | Oro 4 | Caballos 0 | mejoras L0 A0 J0 I0'));
  assert.match(v, /Pactos vigentes: ninguno/);
  assert.match(v, /Tu nota del turno anterior: \(ninguna\)/);
  assert.match(v, /MAPA \(terreno, recurso y vecinas por numero: 5 = R05\):\nR01 /);
  assert.match(v, /\nR01 (ll|bo|mo)(\+\w+)?: \d+( \d+)*\n/, 'las vecinas van como numeros de region');
  assert.match(v, /OCUPACION[^\n]*\nAzur \(tu\): R\d\d\(/);
  assert.match(v, /Sucedio el turno anterior: nada notable\./);
});

test('lo fijo de la partida (el mapa) va primero y es identico para todos los reinos y en todos los turnos: es el prefijo del prompt que los proveedores pueden guardar en cache', () => {
  const E = nuevoEstado(4), fijo = (v) => v.slice(0, v.indexOf('\n\nTurno '));
  const base = fijo(vistaTexto(E, 0));
  assert.ok(base.startsWith('MAPA (terreno') && base.split('\n').length === E.mapa.regs.length + 1);
  for (const i of [1, 2, 3]) assert.equal(fijo(vistaTexto(E, i)), base, `el reino ${i} ve otro comienzo`);
  E.turno = 7; E.reinos[0].stock.Comida = 99; E.hegemon = 2; E.mensajesPrevios = [{ k: 1, texto: 'hola' }];
  assert.equal(fijo(vistaTexto(E, 0)), base, 'el comienzo no cambia con el turno ni con lo que pasa en la partida');
});

test('la ocupacion muestra las unidades por tipo, la fortaleza y el edificio, y marca el danado', () => {
  const E = nuevoEstado(4), c = E.reinos[0].capital;
  E.edif[c] = 'granja'; E.dan[c] = 1;
  assert.ok(vistaTexto(E, 1).includes(`${R(c)}(L10,f1,g-)`));
  sumarUni(E, c, 0, 1, 4); sumarUni(E, c, 0, 3, 1);
  assert.ok(vistaTexto(E, 1).includes(`${R(c)}(L10A4I1,f1,g-)`), 'los tipos que no hay no aparecen');
});

// ---- Guerra 2.0.0, etapa 4: tropas de visita (invitados) ----

test('la ocupacion muestra a los invitados de cada region con su reino y sus unidades, y la leyenda lo explica', () => {
  const E = nuevoEstado(4), d = regionesDe(E, 1).find((r) => r !== E.reinos[1].capital);
  sumarUni(E, d, 0, 0, 2); sumarUni(E, d, 2, 1, 3);
  const v = vistaTexto(E, 3);
  assert.ok(v.includes(`${R(d)}(L3 +Azur L2 +Violeta A3)`), v.split('\n').find((l) => l.startsWith('Ambar')));
  assert.match(v, /OCUPACION \(region\(unidades, fN, edificio; - = danado\); \+Reino L2 = tropas de visita\)/);
  assert.ok(!vistaTexto(nuevoEstado(4), 3).includes(' +Azur '), 'sin invitados no aparece nada');
});

test('"Tus tropas de visita" lista donde estan las tuyas, y marca como hostiles las que ya no tienen pacto con el dueno', () => {
  const E = nuevoEstado(4), d = regionesDe(E, 1).find((r) => r !== E.reinos[1].capital), e = regionesDe(E, 2).find((r) => r !== E.reinos[2].capital);
  assert.ok(!vistaTexto(E, 0).includes('Tus tropas de visita'));
  sumarUni(E, d, 0, 0, 2); sumarUni(E, e, 0, 1, 1); sumarUni(E, e, 0, 2, 4);
  E.reinos[0].pactos[1] = E.reinos[1].pactos[0] = 5; // vigente con Ambar, no con Violeta
  const v = vistaTexto(E, 0);
  assert.ok(v.includes(`Tus tropas de visita: ${R(d)} de Ambar (L2) | ${R(e)} de Violeta (A1J4, hostiles)`), v.split('\n').find((l) => l.startsWith('Tus tropas')));
  assert.ok(!vistaTexto(E, 1).includes('Tus tropas de visita'), 'las visitas de otro reino no son tuyas');
});

test('la vista de un reino no contiene secretos de los rivales', () => {
  const E = nuevoEstado(4);
  E.reinos[1].stock.Comida = 7771; E.reinos[1].nota = 'CENTINELA-NOTA-1';
  E.reinos[2].privIn = [{ de: 3, texto: 'CENTINELA-PRIV-2' }];
  E.reinos[2].ofertasIn = [{ de: 0, doy: 'Hierro', dc: 7, pido: 'Madera', pc: 7772 }];
  E.reinos[3].stock.Oro = 7773; E.reinos[3].mejoras[0] = 2;
  const v0 = vistaTexto(E, 0);
  for (const c of ['7771', 'CENTINELA-NOTA-1', 'CENTINELA-PRIV-2', '7772', '7773']) assert.ok(!v0.includes(c), `la vista del reino 0 filtra ${c}`);
  assert.equal((v0.match(/mejoras L/g) ?? []).length, 1);
  assert.ok(!/mejoras L2/.test(v0));
  // cada reino si ve lo suyo
  assert.ok(vistaTexto(E, 1).includes('7771'));
  assert.ok(vistaTexto(E, 1).includes('CENTINELA-NOTA-1'));
  assert.ok(vistaTexto(E, 2).includes('CENTINELA-PRIV-2'));
  assert.ok(vistaTexto(E, 2).includes('Azur te da 7 Hierro por 7772 Madera'));
  assert.ok(vistaTexto(E, 3).includes('7773'));
  assert.ok(vistaTexto(E, 3).includes('mejoras L2 A0 J0 I0'));
});

test('lo publico lo ve todo el mundo: mensajes, resumen y estado de la Maravilla; los regalos solo su destinatario', () => {
  const E = nuevoEstado(4);
  E.mensajesPrevios = [{ k: 1, texto: 'Paz a todos' }];
  E.resumenPrevio = ['Azur conquisto R05 de Ambar'];
  E.maravilla = { r: E.reinos[2].capital, k: 2, n: 2, t0: 3 };
  E.regalosPrevios[0] = [{ de: 1, a: 0, recurso: 'Madera', n: 3 }];
  for (const i of [0, 1, 2, 3]) {
    const v = vistaTexto(E, i);
    assert.ok(v.includes('Ambar: "Paz a todos"'));
    assert.ok(v.includes('Sucedio el turno anterior: Azur conquisto R05 de Ambar.'));
    assert.ok(v.includes(`Maravilla de Violeta en ${R(E.reinos[2].capital)} (faltan ${MARAVILLA.turnos - 2} turnos)`)); // lleva 2 de la cuenta
  }
  assert.ok(vistaTexto(E, 0).includes('Ambar te regalo 3 Madera'));
  assert.ok(!vistaTexto(E, 2).includes('te regalo'));
});

test('pactos, propuesta abierta, ofertas y privados recibidos aparecen solo para su dueno', () => {
  const E = nuevoEstado(4);
  E.turno = 4; // se juega el turno 5
  E.reinos[0].pactos[1] = 6; E.reinos[0].propuestaPrevia = 2;
  E.reinos[0].ofertasIn = [{ de: 3, doy: 'Oro', dc: 4, pido: 'Roca', pc: 4 }];
  E.reinos[0].privIn = [{ de: 1, texto: 'ven conmigo' }];
  E.reinos[0].nota = 'tomar R12';
  const v = vistaTexto(E, 0);
  assert.ok(v.includes('Pactos vigentes: Ambar (hasta el turno 6). Tu propuesta abierta: Violeta.'));
  assert.ok(v.includes('Ofertas recibidas: Rosa te da 4 Oro por 4 Roca'));
  assert.ok(v.includes('Privados recibidos: Ambar: "ven conmigo"'));
  assert.ok(v.includes('Tu nota del turno anterior: "tomar R12"'));
  assert.ok(!vistaTexto(E, 1).includes('ven conmigo'));
});

test('el resumen publico cuenta el duelo entre dos reinos de visita dentro de la region de un tercero', () => {
  assert.deepEqual(resumenPublico([{ tipo: 'duelo', k: 0, contra: 2, r: 4, t: 3 }]), ['Azur derroto a Violeta dentro de R05']);
});

test('el resumen publico (lo que ven las IAs del turno anterior) ignora el evento pacto_cumplido', () => {
  assert.deepEqual(resumenPublico([{ tipo: 'pacto_cumplido', k: 0, con: 1, t: 7 }]), []);
  assert.deepEqual(resumenPublico([{ tipo: 'pacto', k: 0, con: 1, t: 5 }, { tipo: 'pacto_cumplido', k: 0, con: 1, t: 7 }]).length, 1);
});

// Huellas calculadas el 17 de octubre de 2026 con el motor de ANTES de los datos de la escena (bandos de cada combate, evento pacto_cumplido): lo que ven las IAs es EL CONTRATO y esos
// cambios de datos no pueden mover ni un caracter. Cada huella cubre la vista de cada reino vivo en cada turno de una partida completa de bots.
// 18 de octubre de 2026: la huella 2 cambio a proposito con la Maravilla nueva (costo x1.5, 8 turnos; el bot economico la construye cuando alcanza el costo de constantes.js): en esa partida un bot la
// construye y la vista dice «faltan N turnos» con otra cuenta. Con los valores viejos puestos a mano las tres huellas siguen siendo estas de origen, y los nombres de reino por modelo (nombres.js) no
// mueven nada en partidas solo de bots: no cambio nada mas de lo que ven las IAs.
// 22 de octubre de 2026 (Guerra 2.0.0, etapa 3): las huellas cambian A PROPOSITO. La vista ahora muestra las unidades por tipo (R07(L5A3,f1,g)) y las mejoras en vez de las armas, el bot al azar
// manda ordenes nuevas (mejorar, tipos, todo) y por eso las tres partidas son otras. Huellas anteriores: 53a109e7..., c3ca496d..., 59cba0a4... Cada cambio del texto de las vistas vuelve a mover estas huellas.
// 22 de octubre de 2026 (etapa 4, alianzas): vuelven a cambiar A PROPOSITO: la leyenda de OCUPACION explica «+Reino L2» (tropas de visita), el combate cuenta tierra ajena (x0.85) y los aliados ya pueden
// visitarse. Huellas anteriores: c405e106..., 69a040b4..., 27fe1742...
// 22 de octubre de 2026 (etapa 6, equilibrio): vuelven a cambiar A PROPOSITO: las vecinas del MAPA van como numeros, hay lineas de Hegemon, Evento, Presagio, Reconquista y Patria, y los eventos del
// mundo, el Hegemon y la Reconquista cambian las partidas. Huellas anteriores: 1df82098..., 0d3c2c44..., d0e8e968...
// 22 de octubre de 2026 (etapa 7): el mapa pasa al principio de la vista (prefijo cacheable) y se agregan CAPACIDAD y FRENTES. Huellas anteriores: 8296b274..., cf5a43e7..., 171ab1f2...
// 22 de octubre de 2026 (etapa 8, calibracion con bots): Maravilla 21/17/13/13 y 9 turnos, Hegemon +50 %, y se quitan la Reconquista y la Patria (ya no hay sus lineas). Huellas anteriores: a6bbe609..., 02564353..., d5a4c3a2...
// (la 2 y la 3 no cambiaron con la poda de la Reconquista y la Patria: en esas partidas las vistas nunca llevaron esas lineas).
const HUELLAS_DE_LAS_VISTAS = {
  1: '48593316e5fe995d7fafacd835f74146c323e808',
  2: '595d4ce454a0ad3a4ad16742afa254a0959a7e13',
  3: 'fc152e4d7d11692f7869e9fc1b7b1149d8bfc23a',
};

test('el texto que ven las IAs no cambia: la huella de todas las vistas de 3 partidas coincide con la de antes de los datos de la escena', () => {
  for (const [seed, esperada] of Object.entries(HUELLAS_DE_LAS_VISTAS)) {
    const huella = createHash('sha1').update(vistasDePartida(Number(seed)).join('\u0000')).digest('hex');
    assert.equal(huella, esperada, `seed ${seed}: lo que ven las IAs cambio`);
  }
});
