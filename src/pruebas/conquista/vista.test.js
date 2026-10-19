import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { nuevoEstado, R, vistasDePartida } from './ayudas.js';
import { vistaTexto } from '../../juegos/conquista/vista.js';
import { resumenPublico } from '../../juegos/conquista/texto.js';

test('la vista trae lo tuyo y lo publico', () => {
  const E = nuevoEstado(4), v = vistaTexto(E, 0);
  assert.match(v, /^Turno 1 de 30\. Eres Azur\./);
  assert.match(v, /Capitales: Azur R\d\d/);
  assert.ok(v.includes('Honor: Azur 5 | Ambar 5 | Violeta 5 | Rosa 5'));
  assert.match(v, /Maravilla: ninguna/);
  assert.ok(v.includes('Tu almacen: Comida 6 | Madera 4 | Roca 2 | Hierro 0 | Oro 4 | Caballos 0 | armas nivel 0'));
  assert.match(v, /Pactos vigentes: ninguno/);
  assert.match(v, /Tu nota del turno anterior: \(ninguna\)/);
  assert.match(v, /MAPA \(terreno, recurso y vecinas\):\nR01 /);
  assert.match(v, /OCUPACION[^\n]*\nAzur \(tu\): R\d\d\(/);
  assert.match(v, /Sucedio el turno anterior: nada notable\./);
});

test('la ocupacion muestra tropas, fortaleza y edificio, y marca el danado', () => {
  const E = nuevoEstado(4), c = E.reinos[0].capital;
  E.edif[c] = 'granja'; E.dan[c] = 1;
  assert.ok(vistaTexto(E, 1).includes(`${R(c)}(10,f1,g-)`));
});

test('la vista de un reino no contiene secretos de los rivales', () => {
  const E = nuevoEstado(4);
  E.reinos[1].stock.Comida = 7771; E.reinos[1].nota = 'CENTINELA-NOTA-1';
  E.reinos[2].privIn = [{ de: 3, texto: 'CENTINELA-PRIV-2' }];
  E.reinos[2].ofertasIn = [{ de: 0, doy: 'Hierro', dc: 7, pido: 'Madera', pc: 7772 }];
  E.reinos[3].stock.Oro = 7773; E.reinos[3].armas = 2;
  const v0 = vistaTexto(E, 0);
  for (const c of ['7771', 'CENTINELA-NOTA-1', 'CENTINELA-PRIV-2', '7772', '7773']) assert.ok(!v0.includes(c), `la vista del reino 0 filtra ${c}`);
  assert.equal((v0.match(/armas nivel/g) ?? []).length, 1);
  assert.ok(!/armas nivel 2/.test(v0));
  // cada reino si ve lo suyo
  assert.ok(vistaTexto(E, 1).includes('7771'));
  assert.ok(vistaTexto(E, 1).includes('CENTINELA-NOTA-1'));
  assert.ok(vistaTexto(E, 2).includes('CENTINELA-PRIV-2'));
  assert.ok(vistaTexto(E, 2).includes('Azur te da 7 Hierro por 7772 Madera'));
  assert.ok(vistaTexto(E, 3).includes('7773'));
  assert.ok(vistaTexto(E, 3).includes('armas nivel 2'));
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
    assert.ok(v.includes(`Maravilla de Violeta en ${R(E.reinos[2].capital)} (faltan 6 turnos)`)); // cuenta de 8 turnos, lleva 2
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

test('el resumen publico (lo que ven las IAs del turno anterior) ignora el evento pacto_cumplido', () => {
  assert.deepEqual(resumenPublico([{ tipo: 'pacto_cumplido', k: 0, con: 1, t: 7 }]), []);
  assert.deepEqual(resumenPublico([{ tipo: 'pacto', k: 0, con: 1, t: 5 }, { tipo: 'pacto_cumplido', k: 0, con: 1, t: 7 }]).length, 1);
});

// Huellas calculadas el 17 de octubre de 2026 con el motor de ANTES de los datos de la escena (bandos de cada combate, evento pacto_cumplido): lo que ven las IAs es EL CONTRATO y esos
// cambios de datos no pueden mover ni un caracter. Cada huella cubre la vista de cada reino vivo en cada turno de una partida completa de bots.
// 18 de octubre de 2026: la huella 2 cambio a proposito con la Maravilla nueva (costo x1.5, 8 turnos; el bot economico la construye cuando alcanza el costo de constantes.js): en esa partida un bot la
// construye y la vista dice «faltan N turnos» con otra cuenta. Con los valores viejos puestos a mano las tres huellas siguen siendo estas de origen, y los nombres de reino por modelo (nombres.js) no
// mueven nada en partidas solo de bots: no cambio nada mas de lo que ven las IAs.
const HUELLAS_DE_LAS_VISTAS = {
  1: '53a109e7cc9331e97936615ae0125ecc66ded444',
  2: 'c3ca496d3cfaa029cb8386408d4c80d064f3f4dc',
  3: '59cba0a43a22a2b3a200b453ae063968feb626fa',
};

test('el texto que ven las IAs no cambia: la huella de todas las vistas de 3 partidas coincide con la de antes de los datos de la escena', () => {
  for (const [seed, esperada] of Object.entries(HUELLAS_DE_LAS_VISTAS)) {
    const huella = createHash('sha1').update(vistasDePartida(Number(seed)).join('\u0000')).digest('hex');
    assert.equal(huella, esperada, `seed ${seed}: lo que ven las IAs cambio`);
  }
});
