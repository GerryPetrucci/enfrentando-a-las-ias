import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevoEstado, contexto, R, capital } from './ayudas.js';
import { regionesDe } from '../../juegos/conquista/estado.js';
import { recoleccion, honorYPactos, hambre, ordenesEconomicas, entregas } from '../../juegos/conquista/turno/economia.js';

const vaciar = (E, s, extra = {}) => { E.reinos[s].stock = { Comida: 0, Madera: 0, Roca: 0, Hierro: 0, Oro: 0, Caballos: 0, ...extra }; };
const correr = (E, porReino) => { const ctx = contexto(E, porReino); ordenesEconomicas(ctx); entregas(ctx); return ctx; };

test('recoleccion: nodos +2, cosecha base 1 por cada 2 regiones, granja +2 y mercado danado +1', () => {
  const E = nuevoEstado(4), mias = regionesDe(E, 0);
  assert.ok(mias.length >= 3);
  vaciar(E, 0);
  mias.forEach((r) => { E.mapa.regs[r].rec = null; });
  E.mapa.regs[mias[0]].rec = 'Hierro';
  E.edif[mias[1]] = 'granja';
  E.edif[mias[2]] = 'mercado'; E.dan[mias[2]] = 1;
  recoleccion(contexto(E));
  assert.equal(E.reinos[0].stock.Hierro, 2);
  assert.equal(E.reinos[0].stock.Comida, 2 + Math.floor(mias.length / 2));
  assert.equal(E.reinos[0].stock.Oro, 1);
});

test('honor: +1 cada 3 turnos hasta 10 y +1 por pacto cumplido', () => {
  const E = nuevoEstado(3);
  E.turno = 2; // se juega el turno 3
  E.reinos[0].honor = 9; E.reinos[1].honor = 5;
  honorYPactos(contexto(E));
  assert.equal(E.reinos[0].honor, 10);
  assert.equal(E.reinos[1].honor, 6);
  E.turno = 6; // turno 7 (no multiplo de 3): un pacto cuyo ultimo turno vigente fue el 6 se cumplio
  E.reinos[0].pactos[1] = E.reinos[1].pactos[0] = 6;
  E.reinos[0].pactoOk[1] = E.reinos[1].pactoOk[0] = true;
  E.reinos[0].honor = 5; E.reinos[1].honor = 5;
  honorYPactos(contexto(E));
  assert.equal(E.reinos[0].honor, 6);
  assert.equal(E.reinos[1].honor, 6);
  assert.equal(E.reinos[0].pactoOk[1], false);
  assert.equal(E.stats[0].cumplidos, 1);
});

test('un pacto que termina cumplido deja el evento pacto_cumplido para la pareja; si se rompio (pactoOk en false) no sale', () => {
  const E = nuevoEstado(3);
  E.turno = 6; // se juega el turno 7: un pacto cuyo ultimo turno vigente fue el 6 se cumplio
  E.reinos[0].pactos[1] = E.reinos[1].pactos[0] = 6;
  E.reinos[0].pactoOk[1] = E.reinos[1].pactoOk[0] = true;
  const ctx = contexto(E);
  honorYPactos(ctx);
  assert.deepEqual(ctx.eventos.filter((e) => e.tipo === 'pacto_cumplido'), [{ tipo: 'pacto_cumplido', k: 0, con: 1, t: 7 }]);

  const roto = nuevoEstado(3);
  roto.turno = 6;
  roto.reinos[0].pactos[1] = roto.reinos[1].pactos[0] = 6;
  roto.reinos[0].pactoOk[1] = roto.reinos[1].pactoOk[0] = false; // se rompio: no hay cumplimiento
  const ctx2 = contexto(roto);
  honorYPactos(ctx2);
  assert.equal(ctx2.eventos.filter((e) => e.tipo === 'pacto_cumplido').length, 0);
});

test('muerte subita: desde el turno 29 se acaban todos los pactos', () => {
  const E = nuevoEstado(3);
  E.turno = 28;
  E.reinos[0].pactos[1] = E.reinos[1].pactos[0] = 30;
  honorYPactos(contexto(E));
  assert.deepEqual(E.reinos[0].pactos, [0, 0, 0]);
});

test('hambre: cada 4 tropas comen 1 Comida; sin Comida desertan el 10% sin tocar la ultima tropa', () => {
  const E = nuevoEstado(4), mias = regionesDe(E, 0);
  [8, 5, 3].forEach((n, i) => { E.tropas[mias[i]] = n; });
  mias.slice(3).forEach((r) => { E.tropas[r] = 1; });
  const total = 16 + (mias.length - 3);
  vaciar(E, 0, { Comida: 10 });
  hambre(contexto(E));
  assert.equal(E.reinos[0].stock.Comida, 10 - Math.ceil(total / 4));
  vaciar(E, 0);
  const ctx = contexto(E);
  hambre(ctx);
  assert.deepEqual([E.tropas[mias[0]], E.tropas[mias[1]], E.tropas[mias[2]]], [7, 4, 2]);
  mias.slice(3).forEach((r) => assert.equal(E.tropas[r], 1));
  assert.equal(ctx.eventos.find((e) => e.tipo === 'hambre' && e.k === 0).n, 3);
});

test('reclutar paga 1 Comida por tropa y falla sin Comida o en una region ajena', () => {
  const E = nuevoEstado(4), c = capital(E, 0), ajena = capital(E, 1);
  vaciar(E, 0, { Comida: 5 });
  const ctx = correr(E, { 0: { ordenes: [`reclutar ${R(c)} 4`, `reclutar ${R(c)} 4`, `reclutar ${R(ajena)} 1`] } });
  assert.equal(E.tropas[c], 14);
  assert.equal(E.reinos[0].stock.Comida, 1);
  assert.deepEqual(ctx.descartes[0].map((d) => d.motivo), ['Comida insuficiente', 'la region no es tuya']);
  assert.deepEqual(ctx.obed[0], { validas: 1, total: 3 });
});

test('reclutar con cuartel cuesta la mitad y con cuartel danado tres cuartos (redondeo hacia arriba)', () => {
  const E = nuevoEstado(4), c = capital(E, 0);
  E.edif[c] = 'cuartel';
  vaciar(E, 0, { Comida: 10 });
  correr(E, { 0: { ordenes: [`reclutar ${R(c)} 5`] } });
  assert.equal(E.reinos[0].stock.Comida, 7); // ceil(2.5) = 3
  E.dan[c] = 1;
  vaciar(E, 0, { Comida: 10 });
  correr(E, { 0: { ordenes: [`reclutar ${R(c)} 5`] } });
  assert.equal(E.reinos[0].stock.Comida, 6); // ceil(3.75) = 4
});

test('mercenarios: maximo 3 por turno y 3 Oro cada uno con honor 2 o menos', () => {
  const E = nuevoEstado(4), c = capital(E, 0);
  vaciar(E, 0, { Oro: 20 });
  const ctx = correr(E, { 0: { ordenes: [`mercenarios ${R(c)} 2`, `mercenarios ${R(c)} 2`] } });
  assert.equal(E.reinos[0].stock.Oro, 16);
  assert.equal(ctx.descartes[0][0].motivo, 'maximo 3 mercenarios por turno');
  E.reinos[0].honor = 2;
  vaciar(E, 0, { Oro: 20 });
  correr(E, { 0: { ordenes: [`mercenarios ${R(c)} 3`] } });
  assert.equal(E.reinos[0].stock.Oro, 11);
});

test('fortificar sube nivel a nivel y la muralla (nivel 3) cuesta 6 Roca + 3 Hierro', () => {
  const E = nuevoEstado(4), c = capital(E, 0); // la capital empieza en nivel 1
  vaciar(E, 0, { Madera: 10, Roca: 20, Hierro: 6 });
  const ctx = correr(E, { 0: { ordenes: [`fortificar ${R(c)}`, `fortificar ${R(c)}`, `fortificar ${R(c)}`] } });
  assert.equal(E.fort[c], 3);
  assert.deepEqual(E.reinos[0].stock, { Comida: 0, Madera: 7, Roca: 10, Hierro: 3, Oro: 0, Caballos: 0 });
  assert.equal(ctx.descartes[0].length, 1); // la tercera: ya esta al maximo
});

test('armar: cuesta 4 Hierro + 2 Madera y se puede 2 veces', () => {
  const E = nuevoEstado(4);
  vaciar(E, 0, { Hierro: 20, Madera: 20 });
  const ctx = correr(E, { 0: { ordenes: ['armar', 'armar', 'armar'] } });
  assert.equal(E.reinos[0].armas, 2);
  assert.equal(E.reinos[0].stock.Hierro, 12);
  assert.equal(E.reinos[0].stock.Madera, 16);
  assert.equal(ctx.descartes[0].length, 1);
});

test('construir edificios: uno por region, maximo 3 de cada tipo, con su costo', () => {
  const E = nuevoEstado(4), mias = regionesDe(E, 0);
  const libres = E.dueno.map((d, r) => (d === -1 ? r : -1)).filter((r) => r >= 0).slice(0, 2);
  libres.forEach((r) => { E.dueno[r] = 0; });
  const reg = [...mias, ...libres];
  assert.ok(reg.length >= 5);
  vaciar(E, 0, { Madera: 40, Roca: 40 });
  const ordenes = [0, 1, 2, 3].map((i) => `construir ${R(reg[i])} granja`);
  ordenes.push(`construir ${R(reg[0])} mercado`); // ya hay un edificio ahi
  const ctx = correr(E, { 0: { ordenes } });
  assert.equal(E.edif[reg[0]], 'granja');
  assert.equal(E.edif[reg[2]], 'granja');
  assert.equal(E.edif[reg[3]], null); // la cuarta granja pasa el maximo de 3
  assert.equal(E.reinos[0].stock.Madera, 40 - 4 * 3);
  assert.deepEqual(ctx.descartes[0].map((d) => d.motivo), ['maximo 3 edificios de ese tipo', 'ya hay un edificio en esa region']);
  assert.equal(E.stats[0].edificios, 3);
});

test('maravilla: solo en la propia capital, una sola, 10 Roca + 8 Madera + 6 Hierro + 6 Oro', () => {
  const E = nuevoEstado(4), c = capital(E, 0), otra = regionesDe(E, 0).find((r) => r !== c);
  vaciar(E, 0, { Roca: 30, Madera: 30, Hierro: 30, Oro: 30 });
  const ctx = correr(E, { 0: { ordenes: [`construir ${R(otra)} maravilla`, `construir ${R(c)} maravilla`, `construir ${R(c)} maravilla`] } });
  assert.deepEqual(E.maravilla, { r: c, k: 0, n: 0, t0: 1 });
  assert.deepEqual(ctx.descartes[0].map((d) => d.motivo), ['la maravilla solo se construye en tu capital', 'ya existe una maravilla']);
  assert.deepEqual(E.reinos[0].stock, { Comida: 0, Madera: 22, Roca: 20, Hierro: 24, Oro: 24, Caballos: 0 });
  assert.ok(ctx.eventos.some((e) => e.tipo === 'maravilla' && e.k === 0));
});

test('regalar descuenta ya y entrega al final de la fase; a un reino que no existe se descarta', () => {
  const E = nuevoEstado(3);
  vaciar(E, 0, { Oro: 10 }); vaciar(E, 1);
  const ctx = correr(E, { 0: { ordenes: ['regalar oro 4 Ambar', 'regalar oro 1 Marfil', 'regalar oro 99 Ambar'] } });
  assert.equal(E.reinos[0].stock.Oro, 6);
  assert.equal(E.reinos[1].stock.Oro, 4);
  assert.deepEqual(ctx.descartes[0].map((d) => d.motivo), ['el reino no existe, ya cayo o eres tu', 'no tienes lo que regalas']);
  assert.equal(ctx.regalos.length, 1);
});

test('ofrecer valida los limites y aceptar intercambia todo o nada', () => {
  const E = nuevoEstado(3);
  vaciar(E, 0, { Hierro: 10 }); vaciar(E, 1, { Madera: 10 });
  let ctx = correr(E, { 0: { ordenes: ['ofrecer Ambar Hierro 4 Madera 4', 'ofrecer Ambar Hierro 99 Madera 1', 'ofrecer Azur Oro 1 Roca 1', 'ofrecer Ambar Oro 9 Oro 9'] } });
  assert.equal(ctx.pend.ofertas[1].length, 1);
  assert.deepEqual(ctx.descartes[0].map((d) => d.motivo), ['maximo 10 por lado', 'el reino no existe, ya cayo o eres tu', 'los dos recursos son iguales']);
  assert.equal(E.reinos[0].stock.Hierro, 10); // ofrecer no cobra: solo si lo aceptan
  // el turno siguiente el reino 1 ve la oferta y la acepta
  E.reinos[1].ofertasIn = ctx.pend.ofertas[1];
  ctx = correr(E, { 1: { ordenes: ['aceptar Azur'] } });
  assert.deepEqual([E.reinos[0].stock.Hierro, E.reinos[0].stock.Madera, E.reinos[1].stock.Hierro, E.reinos[1].stock.Madera], [6, 4, 4, 6]);
  assert.ok(ctx.eventos.some((e) => e.tipo === 'comercio'));
  assert.equal(E.reinos[1].ofertasIn.length, 0);
  assert.equal(E.stats[0].comercios, 1);
  // si alguno ya no tiene lo ofrecido, no se cumple nada
  E.reinos[1].ofertasIn = [{ de: 0, doy: 'Hierro', dc: 4, pido: 'Madera', pc: 4 }];
  vaciar(E, 0, { Hierro: 1 });
  ctx = correr(E, { 1: { ordenes: ['aceptar Azur'] } });
  assert.equal(E.reinos[0].stock.Hierro, 1);
  assert.match(ctx.descartes[1][0].motivo, /no se cumple/);
});

test('una respuesta invalida pasa el turno: se anota y no cuesta nada', () => {
  const E = nuevoEstado(4);
  const ctx = contexto(E);
  ctx.jugadas[2] = { ordenes: [], descartadas: [], pactoCon: null, mensaje: '', privados: [], nota: undefined, razon: '', invalida: true, motivo: 'JSON ilegible' };
  const antes = JSON.stringify(E.reinos[2].stock);
  ordenesEconomicas(ctx);
  assert.equal(JSON.stringify(E.reinos[2].stock), antes);
  assert.equal(E.stats[2].invalidas, 1);
  assert.equal(ctx.descartes[2][0].motivo, 'JSON ilegible');
});
