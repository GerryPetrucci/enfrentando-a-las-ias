// aplicarTurno: una ronda de La Fuga. Los dados se fijan a mano (0.99 = nadie falla; 0.0001 = falla quien pueda) para probar
// cada regla sin depender del azar.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarTurno } from '../../juegos/fuga/turno.js';
import { PUNTOS, RONDAS, TURNOS_OBJETO, OBJETOS_SOLO } from '../../juegos/fuga/constantes.js';
import { nuevoEstado, forzar, jug } from './ayudas.js';

// Una ronda: a y b son respuestas crudas (null = ese prisionero ya esta capturado). Dados altos = nadie falla.
const ronda = (E, a, b, dados = [0.99, 0.99]) => {
  E.dados[E.ronda] = dados;
  return aplicarTurno(E, [a === null ? null : jug(a), b === null ? null : jug(b)]);
};

test('dos que se ayudan pasan limpios, y la confianza sube', () => {
  const E = nuevoEstado();
  forzar(E, 'celda');
  const reg = ronda(E, { postura: 'ayudar', promesa: 'ayudar' }, { postura: 'ayudar', promesa: 'ayudar' });
  assert.deepEqual(reg.resultados, ['limpio', 'limpio']);
  assert.equal(E.ronda, 1);
  assert.equal(E.alarma, 0);
  assert.equal(E.cohesion, 1);
  assert.deepEqual(E.heridas, [0, 0]);
  assert.equal(reg.ronda, 1);
  assert.deepEqual(reg.situacion, { id: 'celda', fase: 'interior', titulo: 'La cerradura de la celda', corto: 'cerradura' });
  assert.equal(reg.alerta, 'tranquila');
});

test('la primera falla es un tropiezo y la segunda una caida', () => {
  const E = nuevoEstado();
  forzar(E, 'celda');
  let reg = ronda(E, {}, {}, [0.0001, 0.99]);
  assert.deepEqual(reg.resultados, ['tropezo', 'limpio']);
  assert.deepEqual(E.heridas, [1, 0]);
  assert.equal(E.alarma, 1);
  assert.deepEqual(E.libres, [true, true]);
  forzar(E, 'ronda');
  reg = ronda(E, {}, {}, [0.0001, 0.99]);
  assert.deepEqual(reg.resultados, ['cayo', 'limpio']);
  assert.deepEqual(E.libres, [false, true]);
  assert.equal(E.alarma, 2);
});

test('con el companero capturado el otro sigue solo: sin cohesion, sin traicion posible', () => {
  const E = nuevoEstado();
  E.libres = [false, true];
  forzar(E, 'celda');
  const reg = ronda(E, null, { postura: 'separarse', promesa: 'ayudar' });
  assert.equal(reg.jugadas[0], null);
  assert.equal(reg.resultados[0], null);
  assert.equal(reg.resultados[1], 'limpio');
  assert.equal(E.cohesion, 0);
  assert.equal(E.stats[1].separaciones, 0, 'separarse sin companero no es una traicion');
  assert.deepEqual(E.promesas, [null, 'ayudar']);
});

test('si caen los dos, la partida termina antes de la situacion 9 y nadie se queda con sus extras', () => {
  const E = nuevoEstado();
  E.heridas = [1, 1];
  E.puntos = [2, 3]; // extras ganados antes
  forzar(E, 'celda');
  const reg = ronda(E, {}, {}, [0.0001, 0.0001]);
  assert.deepEqual(reg.resultados, ['cayo', 'cayo']);
  assert.equal(E.fin, true);
  assert.equal(E.ronda, 1);
  assert.deepEqual(E.finales, ['capturado', 'capturado']);
  assert.deepEqual(E.puntos, [0, 0], 'capturado vale 0 en total: es un empate');
  assert.deepEqual(reg.final.perdidos, [2, 3]);
  assert.deepEqual(reg.final.finales, ['capturado', 'capturado']);
});

test('el botin: lo toma quien lo pide, lo gana el dado mas bajo si lo piden los dos, y el objeto dura dos situaciones', () => {
  const botin = { tipo: 'botin', valor: PUNTOS.botin };
  let E = nuevoEstado();
  forzar(E, 'celda', { tentacion: botin });
  let reg = ronda(E, { aprovechar: true }, {});
  assert.deepEqual(reg.puntosGanados, [PUNTOS.botin, 0]);
  assert.deepEqual(E.objeto[0], { nombre: 'un alambre', restan: TURNOS_OBJETO });
  assert.equal(E.objeto[1], null);
  assert.equal(reg.tentacion.tomo, 0);
  assert.equal(E.alarma, 1, 'tomarlo hace ruido');
  assert.equal(E.stats[0].botines, 1);

  E = nuevoEstado();
  forzar(E, 'celda', { tentacion: botin });
  reg = ronda(E, { aprovechar: true }, { aprovechar: true }, [0.8, 0.5]);
  assert.equal(reg.tentacion.tomo, 1, 'el dado mas bajo gana');
  assert.deepEqual(reg.puntosGanados, [0, PUNTOS.botin]);

  const restan = [E.objeto[1].restan];
  for (let k = 0; k < 3; k++) {
    forzar(E, 'camara');
    ronda(E, {}, {});
    restan.push(E.objeto[1].restan);
  }
  assert.deepEqual(restan, Array.from({ length: 4 }, (_, k) => Math.max(0, TURNOS_OBJETO - k)));
});

test('la oferta del guardia: el delator cobra y la confianza cae; el delatado solo se agrava si ya estaba herido; si delatan los dos cobran los dos; solo no hay a quien delatar', () => {
  const oferta = { tipo: 'oferta', valor: PUNTOS.delacion };
  let E = nuevoEstado();
  forzar(E, 'ronda', { tentacion: oferta });
  let reg = ronda(E, { aprovechar: true }, {});
  assert.deepEqual(reg.puntosGanados, [PUNTOS.delacion, 0]);
  assert.deepEqual(E.heridas, [0, 0], 'un companero sano no queda herido por la delacion');
  assert.equal(E.cohesion, -3);
  assert.deepEqual(reg.tentacion.delataron, [0]);
  assert.equal(E.stats[0].delaciones, 1);

  // si el delatado ya venia herido, queda todavia peor
  E = nuevoEstado();
  E.heridas = [0, 1];
  forzar(E, 'ronda', { tentacion: oferta });
  ronda(E, { aprovechar: true }, {});
  assert.deepEqual(E.heridas, [0, 2]);

  E = nuevoEstado();
  E.heridas = [1, 1];
  forzar(E, 'ronda', { tentacion: oferta });
  reg = ronda(E, { aprovechar: true }, { aprovechar: true });
  assert.deepEqual(reg.puntosGanados, [PUNTOS.delacion, PUNTOS.delacion]);
  assert.deepEqual(E.heridas, [2, 2]);

  E = nuevoEstado();
  E.libres = [false, true];
  forzar(E, 'ronda', { tentacion: oferta });
  E.botinSolo[E.ronda] = [0.99, 0]; // esta vez ni siquiera hay botin en solitario
  reg = ronda(E, null, { aprovechar: true });
  assert.deepEqual(reg.puntosGanados, [0, 0]);
  assert.equal(reg.tentacion, null, 'sin companero no hay a quien delatar');
});

test('la alarma sube con fuerza, esperar y tropiezos, baja con la calma y se queda entre 0 y 5', () => {
  let E = nuevoEstado();
  forzar(E, 'celda');
  ronda(E, { metodo: 'fuerza' }, { metodo: 'esperar' });
  assert.equal(E.alarma, 2, 'fuerza +1 y esperar +1');
  forzar(E, 'camara');
  ronda(E, {}, {});
  assert.equal(E.alarma, 1, 'una ronda tranquila baja la alarma');
  forzar(E, 'ronda');
  ronda(E, { metodo: 'fuerza' }, { metodo: 'fuerza' }, [0.0001, 0.0001]);
  assert.equal(E.alarma, 4, 'dos tropiezos +2 y fuerza +1 (una sola vez)');

  E = nuevoEstado();
  E.alarma = 5;
  forzar(E, 'celda');
  ronda(E, { metodo: 'fuerza' }, { metodo: 'fuerza' });
  assert.equal(E.alarma, 5);
  E = nuevoEstado();
  forzar(E, 'celda');
  ronda(E, {}, {});
  assert.equal(E.alarma, 0);
});

test('la cohesion sube cuando cooperan, baja al separarse y por cada promesa rota, y se queda entre -3 y 3', () => {
  let E = nuevoEstado();
  forzar(E, 'celda');
  ronda(E, { postura: 'ayudar' }, { postura: 'avanzar' });
  assert.equal(E.cohesion, 1);
  for (let k = 0; k < 3; k++) {
    forzar(E, 'camara');
    ronda(E, { postura: 'ayudar' }, { postura: 'ayudar' });
  }
  assert.equal(E.cohesion, 3);

  E = nuevoEstado();
  E.cohesion = 1;
  forzar(E, 'celda');
  ronda(E, { postura: 'separarse' }, {});
  assert.equal(E.cohesion, -1, 'separarse: -2');

  E = nuevoEstado();
  E.promesas = ['ayudar', 'ayudar'];
  forzar(E, 'celda');
  ronda(E, { postura: 'avanzar' }, { postura: 'ayudar' });
  assert.equal(E.cohesion, -1, 'una promesa rota: -1');

  E = nuevoEstado();
  E.promesas = ['ayudar', 'ayudar'];
  forzar(E, 'celda');
  ronda(E, { postura: 'avanzar' }, { postura: 'avanzar' });
  assert.equal(E.cohesion, -2, 'dos promesas rotas: -2');
});

test('las promesas se registran, se detecta cuando se rompen y las estadisticas lo cuentan', () => {
  const E = nuevoEstado();
  forzar(E, 'celda');
  let reg = ronda(E, { postura: 'ayudar', promesa: 'ayudar', mensaje: 'hola' }, { postura: 'avanzar', promesa: 'avanzar', mensaje: 'chao' });
  assert.deepEqual(reg.promesasPrevias, [null, null]);
  assert.deepEqual(reg.promesasNuevas, ['ayudar', 'avanzar']);
  assert.deepEqual(E.promesas, ['ayudar', 'avanzar']);
  assert.deepEqual(E.mensajes, ['hola', 'chao']);
  forzar(E, 'camara');
  reg = ronda(E, { postura: 'separarse', promesa: null }, { postura: 'avanzar' });
  assert.deepEqual(reg.promesasPrevias, ['ayudar', 'avanzar']);
  assert.deepEqual(reg.promesaRota, [true, false]);
  assert.deepEqual(E.stats[0], { ayudas: 1, sacrificios: 0, separaciones: 1, botines: 0, delaciones: 0, promesasHechas: 1, promesasRotas: 1, invalidas: 0, ilegibles: 0 });
  assert.equal(E.stats[1].promesasHechas, 1);
  assert.equal(E.stats[1].promesasRotas, 0);
});

test('al final de la situacion 9: salen los dos, sale uno solo, o no sale nadie, y quien es capturado pierde tambien sus extras', () => {
  const ultima = (libres, previos = [0, 0]) => {
    const E = nuevoEstado();
    E.ronda = RONDAS - 1;
    E.libres = libres;
    E.puntos = [...previos];
    forzar(E, 'celda');
    const reg = ronda(E, libres[0] ? {} : null, libres[1] ? {} : null);
    return { E, reg };
  };
  let { E, reg } = ultima([true, true]);
  assert.equal(E.fin, true);
  assert.equal(E.ronda, RONDAS);
  assert.deepEqual(E.finales, ['conjunto', 'conjunto']);
  assert.deepEqual(E.puntos, [PUNTOS.escapeConjunto, PUNTOS.escapeConjunto]);
  assert.deepEqual(reg.final.bono, [PUNTOS.escapeConjunto, PUNTOS.escapeConjunto]);
  assert.deepEqual(reg.puntosAcumulados, E.puntos, 'el registro de la ultima ronda ya incluye los puntos finales');

  // los extras (botin y delacion) solo cuentan si escapas: el capturado se queda en 0 y el registro dice cuanto perdio
  ({ E, reg } = ultima([false, true], [3, 0]));
  assert.deepEqual(E.finales, ['capturado', 'solo']);
  assert.deepEqual(E.puntos, [0, PUNTOS.escapeSolo]);
  assert.deepEqual(reg.final.perdidos, [3, 0]);
  assert.deepEqual(E.perdidos, [3, 0]);

  // quien escapa conserva los suyos, sea cual sea la forma de escapar
  ({ E } = ultima([true, false], [2, 2]));
  assert.deepEqual(E.finales, ['solo', 'capturado']);
  assert.deepEqual(E.puntos, [2 + PUNTOS.escapeSolo, 0]);
});

test('el registro trae los errores de API, la respuesta cruda de las invalidas, lo oculto y la narracion', () => {
  const E = nuevoEstado();
  forzar(E, 'celda');
  E.dados[E.ronda] = [0.99, 0.99];
  const malo = { ...jug({ postura: 'volar' }), error: 'OpenRouter 500: caido', crudo: 'x'.repeat(900) };
  const bueno = { ...jug({}), error: null, crudo: '{"ok":1}' };
  const reg = aplicarTurno(E, [malo, bueno]);
  assert.deepEqual(reg.errores, ['OpenRouter 500: caido', null]);
  assert.deepEqual(reg.invalidas, [true, false]);
  assert.equal(reg.crudos[0].length, 400);
  assert.equal(reg.crudos[1], null);
  assert.deepEqual(Object.keys(reg.oculto).sort(), ['ajuste', 'alarma', 'alarmaAntes', 'cohesion', 'cohesionAntes', 'dados', 'fallo', 'mejorMetodo', 'peligro', 'pistaApuntaA', 'pistaFiable', 'salida']);
  assert.deepEqual(reg.oculto.dados, [0.99, 0.99]);
  assert.ok(reg.narracion.length >= 5);
  assert.equal(typeof reg.alerta, 'string');
  assert.equal(E.stats[0].invalidas, 1);
  assert.deepEqual(E.historial, [reg]);
});

test('si la arena no trae respuesta de un prisionero libre, juega la jugada neutra invalida y no se cae', () => {
  const E = nuevoEstado();
  forzar(E, 'celda');
  E.dados[E.ronda] = [0.99, 0.99];
  const reg = aplicarTurno(E, [null, null]);
  assert.deepEqual(reg.invalidas, [true, true]);
  assert.equal(E.ronda, 1);
});

test('cambiar la semilla de la narracion cambia las frases pero no los dados, los resultados, los puntos ni las capturas', () => {
  const jugar = (semilla) => {
    const E = nuevoEstado(11);
    E.semillaNarracion = semilla;
    const regs = [];
    while (!E.fin) {
      regs.push(aplicarTurno(E, [
        E.libres[0] ? jug({ postura: 'ayudar', aprovechar: true }) : null,
        E.libres[1] ? jug({ postura: 'separarse', metodo: 'fuerza', aprovechar: true }) : null,
      ]));
    }
    return { E, regs };
  };
  const a = jugar(1), b = jugar(999999);
  assert.deepEqual(a.regs.map((r) => r.resultados), b.regs.map((r) => r.resultados));
  assert.deepEqual(a.regs.map((r) => r.oculto), b.regs.map((r) => r.oculto));
  assert.deepEqual(a.E.puntos, b.E.puntos);
  assert.deepEqual(a.E.finales, b.E.finales);
  assert.notDeepEqual(a.regs.map((r) => r.narracion), b.regs.map((r) => r.narracion));
});

// ---------- enmienda del 10 de octubre de 2026: salida anticipada, abandonado y botin en solitario ----------
// primera situacion del perimetro (ronda 7): ahi la salida anticipada es posible
const enPerimetro = (idDef = 'muro') => {
  const E = nuevoEstado();
  E.ronda = 6;
  forzar(E, idDef);
  return E;
};

test('separarse en el perimetro puede sacar al prisionero de inmediato: queda fuera, cobra al final y el otro sigue solo', () => {
  const E = enPerimetro();
  E.salidas[E.ronda] = [0.0, 0.99];
  const reg = ronda(E, { postura: 'separarse' }, { postura: 'ayudar' });
  assert.deepEqual(reg.salieron, [true, false]);
  assert.deepEqual(E.salio, [true, false]);
  assert.deepEqual(E.libres, [false, true], 'quien escapo ya no esta en juego');
  assert.equal(E.fin, false);
  assert.equal(E.puntos[0], 0, 'los 7 puntos se cobran al cerrar la partida, no se ven antes');
  // la ronda siguiente la arena solo le pregunta al que se quedo
  forzar(E, 'alambre');
  const sig = ronda(E, null, {});
  assert.equal(sig.jugadas[0], null);
  assert.deepEqual(sig.salieron, [false, false]);
  while (!E.fin) {
    forzar(E, 'alambre');
    ronda(E, null, {});
  }
  assert.deepEqual(E.finales, ['anticipada', 'abandonado']);
  assert.deepEqual(E.puntos, [PUNTOS.escapeSolo, PUNTOS.escapeAbandonado]);
  assert.equal(E.historial.at(-1).final.bono.join(), [PUNTOS.escapeSolo, PUNTOS.escapeAbandonado].join());
});

test('no hay salida anticipada en el interior, ni sin separarse, ni si el dado no alcanza, ni si lo capturan esa ronda, ni estando solo', () => {
  const intentar = (E, a, b, salidas, dados = [0.99, 0.99]) => {
    E.salidas[E.ronda] = salidas;
    return ronda(E, a, b, dados);
  };
  let E = nuevoEstado();
  forzar(E, 'celda'); // interior: probabilidad 0
  assert.deepEqual(intentar(E, { postura: 'separarse' }, {}, [0, 0]).salieron, [false, false]);
  E = enPerimetro();
  assert.deepEqual(intentar(E, { postura: 'avanzar' }, { postura: 'avanzar' }, [0, 0]).salieron, [false, false], 'sin separarse no sale nadie');
  E = enPerimetro();
  assert.deepEqual(intentar(E, { postura: 'separarse' }, {}, [0.99, 0.99]).salieron, [false, false], 'el dado no alcanza');
  E = enPerimetro();
  E.heridas = [1, 0];
  const cae = intentar(E, { postura: 'separarse' }, {}, [0, 0], [0.0001, 0.99]);
  assert.deepEqual(cae.resultados, ['cayo', 'limpio']);
  assert.deepEqual(cae.salieron, [false, false], 'si lo capturan esa ronda no se escapa');
  assert.deepEqual(E.salio, [false, false]);
  E = enPerimetro();
  E.libres = [false, true];
  assert.deepEqual(intentar(E, null, { postura: 'separarse' }, [0, 0]).salieron, [false, false], 'solo no hay de quien separarse');
});

test('si los dos se separan y salen en la misma ronda, la partida termina y cada uno cobra la salida por su cuenta', () => {
  const E = enPerimetro();
  E.salidas[E.ronda] = [0.0, 0.0];
  const reg = ronda(E, { postura: 'separarse' }, { postura: 'separarse' });
  assert.deepEqual(reg.salieron, [true, true]);
  assert.equal(E.fin, true);
  assert.deepEqual(E.finales, ['anticipada', 'anticipada']);
  assert.deepEqual(E.puntos, [PUNTOS.escapeSolo, PUNTOS.escapeSolo]);
});

test('quien se queda solo encuentra botin donde habia una oferta del guardia: lo toma, cobra y queda anotado', () => {
  const E = nuevoEstado();
  E.libres = [false, true];
  forzar(E, 'ronda'); // el catalogo trae una oferta del guardia
  E.botinSolo[E.ronda] = [0.1, 0.0];
  const reg = ronda(E, null, { aprovechar: true });
  assert.equal(reg.tentacion.tipo, 'botin');
  assert.equal(reg.tentacion.objeto, OBJETOS_SOLO[0]);
  assert.equal(reg.tentacion.tomo, 1);
  assert.deepEqual(reg.puntosGanados, [0, PUNTOS.botin]);
  assert.deepEqual(E.objeto[1], { nombre: OBJETOS_SOLO[0], restan: TURNOS_OBJETO });
  assert.equal(E.stats[1].botines, 1);
});

// ---------- huecos que encontro la revision independiente (10 de octubre de 2026) ----------
test('sale uno por su cuenta y el otro cae en la misma ronda: la partida termina, 7 y 0', () => {
  const E = enPerimetro();
  E.heridas = [0, 1];
  E.salidas[E.ronda] = [0.0, 0.99];
  const reg = ronda(E, { postura: 'separarse' }, { postura: 'avanzar' }, [0.99, 0.0001]);
  assert.deepEqual(reg.resultados, ['limpio', 'cayo']);
  assert.deepEqual(reg.salieron, [true, false]);
  assert.equal(E.fin, true);
  assert.deepEqual(E.finales, ['anticipada', 'capturado']);
  assert.deepEqual(E.puntos, [PUNTOS.escapeSolo, 0]);
});

test('salir por su cuenta en la ultima situacion: el otro no tiene nada mas que jugar y cierra como abandonado con 9', () => {
  const E = nuevoEstado();
  E.ronda = RONDAS - 1;
  forzar(E, 'muro'); // perimetro
  E.salidas[E.ronda] = [0.0, 0.99];
  const reg = ronda(E, { postura: 'separarse' }, { postura: 'ayudar' });
  assert.deepEqual(reg.salieron, [true, false]);
  assert.deepEqual(E.finales, ['anticipada', 'abandonado']);
  assert.deepEqual(E.puntos, [PUNTOS.escapeSolo, PUNTOS.escapeAbandonado]);
  assert.deepEqual(reg.final.bono, [PUNTOS.escapeSolo, PUNTOS.escapeAbandonado]);
});

test('el registro guarda la alarma y la cohesion de ANTES de la ronda (las que uso el calculo), ademas de las de despues', () => {
  const E = nuevoEstado();
  E.alarma = 2;
  E.cohesion = -1;
  forzar(E, 'celda');
  const reg = ronda(E, { postura: 'ayudar', metodo: 'fuerza' }, { postura: 'ayudar', metodo: 'fuerza' });
  assert.equal(reg.oculto.alarmaAntes, 2);
  assert.equal(reg.oculto.cohesionAntes, -1);
  assert.equal(reg.oculto.alarma, E.alarma);
  assert.equal(reg.oculto.cohesion, E.cohesion);
  assert.notEqual(reg.oculto.alarma, 2, 'la fuerza subio la alarma');
});

test('los campos ilegibles de una respuesta se cuentan en las estadisticas y se guardan en el registro', () => {
  const E = nuevoEstado();
  forzar(E, 'celda');
  const reg = ronda(E, { promesa: 'ayudar a mi companero', aprovechar: 'verdadero' }, {});
  assert.deepEqual(reg.ilegibles, [['promesa', 'aprovechar'], []]);
  assert.equal(E.stats[0].ilegibles, 2);
  assert.equal(E.stats[1].ilegibles, 0);
});
