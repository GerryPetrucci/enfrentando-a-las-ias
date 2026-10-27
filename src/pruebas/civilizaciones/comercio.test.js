import test from 'node:test';
import assert from 'node:assert/strict';
import { fundado, turno, civilizaciones } from './ayudas.js';
import { nuevoComercio, regalar, ofrecer, aceptar, liquidarComercio } from '../../juegos/civilizaciones/turno/comercio.js';

const preparar = () => {
  const E = fundado(); E.calendario = [];
  E.civs.forEach((c) => { for (const r in c.stock) c.stock[r] = 20; });
  return E;
};
const fila = () => ({ estado: 'pendiente' });
const oferta = (n, da, nDa, pide, nPide, vence = 2) => ({ n, da, nDa, pide, nPide, vence });
const o = (n) => ({ n });

test('ofertas: maximo dos y 10 por lado, recursos distintos, no reserva fondos, numeros estables y caducidad', () => {
  const E = preparar(), ctx = nuevoComercio(E, 2), c = E.civs[0], stock = { ...c.stock };
  assert.match(ofrecer(ctx, c, oferta(0, 'Oro', 11, 'Madera', 1)), /10/);
  assert.match(ofrecer(ctx, c, oferta(0, 'Oro', 1, 'Oro', 1)), /distintos/);
  assert.equal(ofrecer(ctx, c, oferta(0, 'Oro', 5, 'Madera', 4)), null);
  assert.equal(ofrecer(ctx, c, oferta(0, 'Roca', 3, 'Hierro', 2)), null);
  assert.match(ofrecer(ctx, c, oferta(0, 'Roca', 1, 'Hierro', 1)), /dos|2/);
  assert.deepEqual(c.stock, stock);
  assert.equal(aceptar(ctx, E.civs[1], o(1), fila()), 'la oferta caduco o no existe');
  liquidarComercio(ctx, { eventos: [] });
  assert.deepEqual(c.ofertas.map((x) => [x.n, x.vence]), [[1, 3], [2, 3]]);
  const siguiente = nuevoComercio(E, 3), f = fila();
  assert.match(aceptar(siguiente, E.civs[1], o(null), f), /numero/);
  assert.equal(aceptar(siguiente, E.civs[1], o(2), f), null);
  liquidarComercio(siguiente, { eventos: [] });
  assert.equal(f.estado, 'aplicada'); assert.deepEqual(c.ofertas, []);
});

test('regalo: descuento inmediato, llegada despues de aceptar; no financia ordenes ni tratos de este turno', () => {
  const E = preparar(), ctx = nuevoComercio(E, 2);
  E.civs[0].stock.Oro = 10; E.civs[1].stock.Oro = 0;
  E.civs[0].ofertas = [oferta(1, 'Madera', 5, 'Oro', 5)];
  assert.equal(regalar(ctx, E.civs[0], 'Oro', 10), null);
  assert.equal(E.civs[0].stock.Oro, 0); assert.equal(E.civs[1].stock.Oro, 0);
  const f = fila(); assert.equal(aceptar(ctx, E.civs[1], o(null), f), null);
  liquidarComercio(ctx, { eventos: [] });
  assert.equal(f.estado, 'descartada'); assert.match(f.motivo, /fondos/);
  assert.equal(E.civs[1].stock.Oro, 10);
});

test('sin fondos se descarta atomicamente: sin pago parcial ni inferir recursos entrantes', () => {
  const E = preparar(), ctx = nuevoComercio(E, 2);
  E.civs[0].ofertas = [oferta(1, 'Oro', 10, 'Madera', 10)];
  E.civs[0].stock.Oro = 9;
  const antes = E.civs.map((c) => ({ ...c.stock })), f = fila();
  aceptar(ctx, E.civs[1], o(1), f); liquidarComercio(ctx, { eventos: [] });
  assert.equal(f.estado, 'descartada'); assert.deepEqual(E.civs.map((c) => c.stock), antes);
});

test('aceptaciones que exceden un saldo comun se rechazan todas, sin prioridad de asiento', () => {
  for (const invertirOrden of [false, true]) {
    const E = preparar(), ctx = nuevoComercio(E, 2);
    E.civs[0].stock.Oro = 10;
    E.civs[0].ofertas = [oferta(1, 'Oro', 8, 'Madera', 2)];
    E.civs[1].ofertas = [oferta(1, 'Roca', 2, 'Oro', 8)];
    const a = fila(), b = fila(), antes = E.civs.map((c) => ({ ...c.stock }));
    const registrar = invertirOrden ? [1, 0] : [0, 1];
    for (const s of registrar) aceptar(ctx, E.civs[s], o(1), s ? b : a);
    liquidarComercio(ctx, { eventos: [] });
    assert.deepEqual([a.estado, b.estado], ['descartada', 'descartada']);
    assert.match(a.motivo, /conflicto/); assert.deepEqual(E.civs.map((c) => c.stock), antes);
  }
});

test('dos tratos compatibles se liquidan juntos; una misma oferta nunca se cobra dos veces', () => {
  const E = preparar(), ctx = nuevoComercio(E, 2);
  E.civs[0].ofertas = [oferta(1, 'Oro', 5, 'Madera', 3)];
  E.civs[1].ofertas = [oferta(1, 'Roca', 4, 'Hierro', 2)];
  const a = fila(), b = fila();
  aceptar(ctx, E.civs[0], o(1), a); aceptar(ctx, E.civs[1], o(1), b);
  const rc = { eventos: [] }; liquidarComercio(ctx, rc);
  assert.equal(rc.eventos.length, 2); assert.deepEqual([a.estado, b.estado], ['aplicada', 'aplicada']);
  assert.deepEqual(E.civs[0].stock, { Comida: 20, Madera: 23, Roca: 24, Hierro: 18, Oro: 15 });
  assert.deepEqual(E.civs[1].stock, { Comida: 20, Madera: 17, Roca: 16, Hierro: 22, Oro: 25 });
  const F = preparar(), cx = nuevoComercio(F, 2); F.civs[0].ofertas = [oferta(1, 'Oro', 1, 'Madera', 1)];
  const q = fila(), w = fila(); aceptar(cx, F.civs[1], o(1), q); aceptar(cx, F.civs[1], o(1), w);
  liquidarComercio(cx, { eventos: [] });
  assert.deepEqual([q.estado,w.estado], ['descartada','descartada']);
});

test('compartir recurso es valido si el saldo cubre los dos pagos; liquidacion no se repite', () => {
  const E = preparar(), ctx = nuevoComercio(E, 2);
  E.civs[0].ofertas = [oferta(1,'Oro',8,'Madera',2)];
  E.civs[1].ofertas = [oferta(1,'Roca',2,'Oro',8)];
  const a = fila(), b = fila(); aceptar(ctx,E.civs[0],o(1),a); aceptar(ctx,E.civs[1],o(1),b);
  const r = { eventos: [] }; liquidarComercio(ctx,r);
  assert.deepEqual([a.estado,b.estado],['aplicada','aplicada']); assert.equal(E.civs[0].stock.Oro,4);
  const despues = structuredClone(E); liquidarComercio(ctx,r);
  assert.deepEqual(E,despues); assert.equal(r.eventos.length,2);
});

test('el regalo llega antes de comer; gastar lo ofrecido descarta aceptar y cuenta como orden descartada', () => {
  const E = preparar(); E.civs[1].stock.Comida = 0; E.civs[1].reparto = [0,100,0,0,0,0];
  turno(E,[{ ordenes:['regalar Comida 10'] },{}]);
  assert.equal(E.civs[1].hambre,false);
  const F = preparar(); F.civs[0].stock.Oro=5; F.civs[0].ofertas=[oferta(1,'Oro',5,'Madera',4)];
  const r = turno(F,[{ordenes:['regalar Oro 5']},{ordenes:['aceptar']}]);
  assert.equal(r.civs[1].ordenes[0].estado,'descartada');
  assert.equal(F.civs[1].stats.validas,0); assert.equal(F.civs[1].stats.descartadas,1);
});

test('turno real: un regalo no financia construir, pero llega antes de comer; estadisticas cuentan despues de liquidar', () => {
  const E = preparar(); E.civs[1].stock.Madera = 0; E.civs[1].tecnologias = ['T1'];
  const r = turno(E, [{ ordenes: ['regalar Madera 10'] }, { ordenes: [`construir ${E.civs[1].capital + 1} granero`] }]);
  assert.equal(r.civs[1].ordenes[0].estado, 'descartada');
  assert.equal(E.civs[1].stock.Madera, 10 + E.civs[1].produccion.Madera);
  const F = preparar(); F.civs[0].ofertas = [oferta(1, 'Oro', 5, 'Madera', 4)];
  const x = turno(F, [{}, { ordenes: ['aceptar'] }]);
  assert.equal(x.civs[1].ordenes[0].estado, 'aplicada'); assert.equal(F.civs[1].stats.validas, 1);
  assert.equal(x.eventos.filter((e) => e.tipo === 'comercio').length, 1);
});

test('vista numera ofertas y solo muestra las vigentes; mensajes son publicos al turno siguiente', () => {
  const E = preparar();
  turno(E, [{ ordenes: ['ofrecer Oro 5 Madera 4', 'ofrecer Roca 3 Hierro 2'], mensaje: 'Podemos comerciar' }, {}]);
  const v = civilizaciones.vista(E, 1);
  assert.match(v, /aceptar 1/); assert.match(v, /aceptar 2/); assert.match(v, /Podemos comerciar/);
  turno(E); assert.doesNotMatch(civilizaciones.vista(E, 1), /aceptar 1/);
});

test('sin=comercio rechaza regalo y oferta sin transferir ni reservar nada', () => {
  const E = preparar(); E.capas.comercio = false;
  const antes = { ...E.civs[0].stock }, ctx = nuevoComercio(E, 2);
  assert.match(regalar(ctx, E.civs[0], 'Oro', 1), /desactivado/);
  assert.match(ofrecer(ctx, E.civs[0], oferta(0,'Oro',1,'Madera',1)), /desactivado/);
  assert.deepEqual(E.civs[0].stock, antes);
});
