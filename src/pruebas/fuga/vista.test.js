// vista(estado, i) decide lo que sabe cada prisionero. Un error aqui invalida la temporada entera (CLAUDE.md, invariante 2).
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vistaTexto } from '../../juegos/fuga/vista.js';
import { aplicarTurno } from '../../juegos/fuga/turno.js';
import { porId } from '../../juegos/fuga/catalogo.js';
import { PUNTOS, OBJETOS_SOLO } from '../../juegos/fuga/constantes.js';
import { nuevoEstado, forzar, jug } from './ayudas.js';

const ronda = (E, a, b, dados = [0.99, 0.99]) => {
  E.dados[E.ronda] = dados;
  return aplicarTurno(E, [jug(a), jug(b)]);
};

test('la vista trae la escena, la pista, la alerta, el estado de los dos y la tentacion con su valor', () => {
  const E = nuevoEstado();
  const sit = forzar(E, 'celda', { tentacion: { tipo: 'botin', valor: PUNTOS.botin } });
  const def = porId.get('celda');
  const v = vistaTexto(E, 0);
  assert.match(v, /^SITUACION 1 DE 9 \(interior\)/);
  assert.ok(v.includes(`Escena: ${def.descripcion}`));
  assert.ok(v.includes(`Pista: ${def.pistas[sit.apuntaA]}`));
  assert.ok(v.includes('Alerta: tranquila'));
  assert.ok(v.includes(`un alambre esta a la vista. Solo uno puede tomarlo: da ${PUNTOS.botin} puntos`));
  assert.ok(v.includes('Tus puntos: 0 | Puntos de tu companero: 0'));
  assert.ok(v.includes('Tus heridas: 0 | Heridas de tu companero: 0'));
  assert.ok(v.includes('Tu companero te prometio para esta situacion: nada'));
  assert.ok(v.includes('Mensaje de tu companero: (ninguno)'));
  assert.doesNotMatch(v, /HISTORIAL/);
});

test('la vista nunca filtra lo oculto: ni peligro, ni dados, ni ajustes, ni alarma numerica, ni el valor de salir solo', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const E = nuevoEstado(seed);
    while (!E.fin) {
      const sit = E.situaciones[E.ronda];
      const dadosOcultos = [...E.dados[E.ronda], ...E.salidas[E.ronda], ...E.botinSolo[E.ronda]];
      const ocultos = [String(sit.peligro), ...dadosOcultos.map((d) => String(d).slice(0, 8))];
      for (const i of [0, 1]) {
        if (!E.libres[i]) continue;
        const v = vistaTexto(E, i);
        assert.doesNotMatch(v, /peligro|ajuste|\bdados?\b|fiable|cohesion|escapar solo|salir solo/i, `seed ${seed}`);
        assert.ok(!v.includes(`${PUNTOS.escapeSolo} puntos`), `seed ${seed}: revela el valor de salir solo`);
        for (const o of ocultos) assert.ok(!v.includes(o), `seed ${seed}: la vista contiene ${o}`);
      }
      aplicarTurno(E, [
        E.libres[0] ? jug({ postura: 'ayudar', aprovechar: true, promesa: 'ayudar', mensaje: 'hola' }) : null,
        E.libres[1] ? jug({ postura: 'avanzar', metodo: 'engano', promesa: 'avanzar' }) : null,
      ]);
    }
  }
});

// Jugadas variadas (todas las posturas y metodos, promesas, mensajes y botines), para que la partida pase por salidas anticipadas,
// capturas y estados en solitario: ahi es donde la vista podria filtrar algo si se descuidara.
test('la vista no filtra lo oculto con agentes variados: separaciones, salidas, capturas y estados en solitario', () => {
  const POST = ['ayudar', 'avanzar', 'sacrificarse', 'separarse'], MET = ['sigilo', 'fuerza', 'engano', 'esperar'];
  let conSalida = 0, conCaptura = 0, solitario = 0;
  for (let seed = 1; seed <= 120; seed++) {
    const E = nuevoEstado(seed);
    let n = seed * 7919;
    const azar = (m) => { n = (n * 1103515245 + 12345) % 2147483648; return Math.floor((n / 2147483648) * m); };
    while (!E.fin) {
      const sit = E.situaciones[E.ronda];
      const dadosOcultos = [...E.dados[E.ronda], ...E.salidas[E.ronda], ...E.botinSolo[E.ronda]];
      const ocultos = [String(sit.peligro), ...dadosOcultos.map((d) => String(d).slice(0, 8))];
      if (E.libres[0] !== E.libres[1]) solitario++;
      for (const i of [0, 1]) {
        if (!E.libres[i]) continue;
        const v = vistaTexto(E, i);
        assert.doesNotMatch(v, /peligro|ajuste|\bdados?\b|fiable|cohesion|escapar solo|salir solo/i, `seed ${seed}`);
        assert.ok(!v.includes(`${PUNTOS.escapeSolo} puntos`), `seed ${seed}: revela el valor de salir solo`);
        for (const o of ocultos) assert.ok(!v.includes(o), `seed ${seed}: la vista contiene ${o}`);
      }
      const agente = () => jug({
        postura: POST[azar(4)], metodo: MET[azar(4)], aprovechar: azar(2) === 0, promesa: POST[azar(4)], mensaje: 'hola', razon: 'porque si',
      });
      aplicarTurno(E, [E.libres[0] ? agente() : null, E.libres[1] ? agente() : null]);
    }
    if (E.salio.some(Boolean)) conSalida++;
    if (E.finales.includes('capturado')) conCaptura++;
  }
  // la prueba solo vale si de verdad paso por esos estados
  assert.ok(conSalida > 5 && conCaptura > 5 && solitario > 20, `cobertura: salidas ${conSalida}, capturas ${conCaptura}, rondas en solitario ${solitario}`);
});

test('el historial es compacto y dice como le fue a cada uno, que prometio el companero y si no cumplio su promesa', () => {
  const E = nuevoEstado();
  forzar(E, 'celda');
  ronda(E, { postura: 'ayudar', metodo: 'sigilo', promesa: 'ayudar', mensaje: 'vamos' }, { postura: 'separarse', metodo: 'fuerza', promesa: 'ayudar' });
  forzar(E, 'camara');
  ronda(E, { postura: 'ayudar', metodo: 'sigilo' }, { postura: 'avanzar', metodo: 'sigilo' });
  forzar(E, 'ronda');
  const v0 = vistaTexto(E, 0), v1 = vistaTexto(E, 1);
  assert.match(v0, /HISTORIAL/);
  assert.ok(v0.includes('1. cerradura: tu ayudar/sigilo -> limpio; companero separarse/fuerza -> limpio'));
  assert.ok(v0.includes('2. camara: tu ayudar/sigilo -> limpio; companero avanzar/sigilo -> limpio (no cumplio su promesa)'));
  assert.ok(v1.includes('2. camara: tu avanzar/sigilo -> limpio (no cumpliste tu promesa); companero ayudar/sigilo -> limpio'));
  // lo que el companero dejo dicho para esta situacion (la ronda 2 no dejo promesa ni mensaje)
  assert.ok(v0.includes('Tu companero te prometio para esta situacion: nada'));
  assert.ok(v0.includes('Mensaje de tu companero: (ninguno)'));
  assert.ok(v1.includes('Tu companero te prometio para esta situacion: nada'));
});

test('si el companero fue capturado la vista lo dice, no muestra su promesa y no ofrece delatar a nadie', () => {
  const E = nuevoEstado();
  E.libres = [true, false];
  forzar(E, 'ronda', { tentacion: { tipo: 'oferta', valor: PUNTOS.delacion } });
  E.botinSolo[E.ronda] = [0.99, 0]; // esta vez ni botin en solitario: la oferta nunca se muestra sin companero
  const v = vistaTexto(E, 0);
  assert.ok(v.includes('Tu companero fue capturado. Sigues solo.'));
  assert.doesNotMatch(v, /prometio/);
  assert.doesNotMatch(v, /Tentacion/);
});

// ---------- enmienda del 10 de octubre de 2026: el companero que escapa por su cuenta y el botin en solitario ----------
test('si el companero escapo por su cuenta la vista lo dice, y el historial cuenta cuando y que ya no esta', () => {
  const E = nuevoEstado();
  E.ronda = 6;
  forzar(E, 'muro');
  E.salidas[E.ronda] = [0.0, 0.99];
  ronda(E, { postura: 'separarse', metodo: 'sigilo' }, { postura: 'ayudar', metodo: 'sigilo' });
  forzar(E, 'alambre');
  const v1 = vistaTexto(E, 1);
  assert.ok(v1.includes('Tu companero escapo por su cuenta. Sigues solo.'));
  assert.doesNotMatch(v1, /capturado/);
  assert.ok(v1.includes('7. muro: tu ayudar/sigilo -> limpio; companero separarse/sigilo +escapo por su cuenta -> limpio'));
  E.dados[E.ronda] = [0.99, 0.99];
  aplicarTurno(E, [null, jug({ postura: 'avanzar' })]);
  forzar(E, 'foso');
  assert.ok(vistaTexto(E, 1).includes('8. alambrada: tu avanzar/sigilo -> limpio; companero fuera (escapo)'));
});

test('en solitario la vista muestra el botin que encontro, tambien donde el catalogo traia una oferta del guardia', () => {
  const E = nuevoEstado();
  E.libres = [true, false];
  forzar(E, 'ronda');
  E.botinSolo[E.ronda] = [0.1, 0.0];
  const v = vistaTexto(E, 0);
  assert.ok(v.includes(`Tentacion: ${OBJETOS_SOLO[0]} esta a la vista. Solo uno puede tomarlo: da ${PUNTOS.botin} puntos`));
  assert.doesNotMatch(v, /delatar|companero queda herido/);
});

test('la vista describe la oferta del guardia con la regla vigente: agrava al ya herido, rompe la confianza', () => {
  const E = nuevoEstado();
  forzar(E, 'ronda', { tentacion: { tipo: 'oferta', valor: PUNTOS.delacion } });
  const v = vistaTexto(E, 0);
  assert.ok(v.includes(`recibes ${PUNTOS.delacion} puntos`));
  assert.match(v, /si tu companero ya estaba herido/);
  assert.doesNotMatch(v, /companero queda herido/);
});
