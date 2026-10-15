// Linea de tiempo de la escena de Duda y apuesta: convierte los registros guardados en beats (lo que se ve y se dice, en orden).
// Es una funcion pura sobre partidas REALES jugadas por bots: sin DOM, sin red y sin API.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverNombres } from '../../juegos/dudaapuesta/narracion.js';
import { elegirCamara } from '../../../web/casino/camara.js';
import { MANOS } from '../../juegos/dudaapuesta/constantes.js';
import { construirLineaDeTiempo, puntuarManos, mejoresManos, nombrar, MIN_MS, MANOS_TOPE, conRazones } from '../../../web/casino/linea-de-tiempo-duda.js';
import { correrPartida } from '../../arena.js';
import dudaapuesta from '../../juegos/dudaapuesta.js';
import { jugar, muchas, agentes, CASOS } from './ayudas.js';

const nombres = (p) => (t) => resolverNombres(t, p.jugadores);
const porMano = (beats) => beats.reduce((m, b) => m.set(b.mano, [...(m.get(b.mano) ?? []), b]), new Map()); // Map.groupBy pide Node 21 y el proyecto Node 20

test('nombrar da lo mismo que resolverNombres del motor (la web no puede importarlo)', () => {
  const js = [{ nombre: 'Claude' }, { nombre: 'GPT Luna' }, null, { nombre: 'Ñandú' }];
  for (const t of ['{0} gana', '{1} y {3}: {2}', 'sin nombres', '{4} no existe', '']) assert.equal(nombrar(t, js), resolverNombres(t, js), t);
});

test('cubre todos los registros en orden y no pierde ni repite una sola linea de la narracion', async () => {
  for (const p of await muchas()) {
    const beats = construirLineaDeTiempo(p);
    const registros = beats.map((b) => b.registro);
    assert.deepEqual([...new Set(registros)], p.rondas.map((_, i) => i), 'todos los registros aparecen, cada uno una vez en orden');
    assert.ok(registros.every((r, i) => i === 0 || r >= registros[i - 1]), 'los beats siguen el orden de los registros');
    const esperadas = p.rondas.flatMap((r) => r.narracion).map((l) => nombres(p)(l.texto));
    const dichas = beats.filter((b) => b.tipo !== 'final').flatMap((b) => b.lineas.map((l) => l.texto));
    assert.deepEqual(dichas, esperadas, `seed ${p.seed}: las lineas dichas no son la narracion guardada`);
    assert.ok(dichas.every((t) => !/\{\d\}/.test(t)), 'ningun {n} sin resolver');
  }
});

test('cada mano abre con apertura y reparto, cierra con cierre despues de revelado o retirada; ids unicos y duraciones validas', async () => {
  for (const p of await muchas()) {
    const beats = construirLineaDeTiempo(p);
    assert.equal(new Set(beats.map((b) => b.id)).size, beats.length, 'ids repetidos');
    for (const b of beats) assert.ok(Number.isFinite(b.minMs) && b.minMs > 0, `${b.id}: minMs ${b.minMs}`);
    for (const [mano, bs] of porMano(beats.filter((b) => b.tipo !== 'final'))) {
      assert.deepEqual(bs.slice(0, 2).map((b) => b.tipo), ['apertura', 'reparto'], `mano ${mano}`);
      const t = bs.map((b) => b.tipo);
      assert.equal(t.at(-1), 'cierre', `mano ${mano}: una mano terminada acaba en cierre`);
      assert.ok(['revelado', 'retirada'].includes(t.at(-2)), `mano ${mano}: antes del cierre va revelado o retirada (${t.at(-2)})`);
      assert.equal(t.filter((x) => x === 'cierre').length, 1);
      assert.ok(t.slice(2, -2).every((x) => ['anuncio', 'acepta', 'duda', 'defensa'].includes(x)), `mano ${mano}: ${t}`);
    }
  }
});

test('el reparto da a cada jugador tantas cartas como espacios tiene en esa mano', async () => {
  for (const p of await muchas()) {
    for (const [mano, bs] of porMano(construirLineaDeTiempo(p))) {
      const primero = p.rondas.find((r) => r.mano === mano);
      const reparto = bs.find((b) => b.tipo === 'reparto');
      for (let s = 0; s < 4; s++) {
        const dadas = reparto.pasos.filter((x) => x.tipo === 'repartir' && x.asiento === s).length;
        assert.equal(dadas, primero.oculto.cartas[s].length, `seed ${p.seed} mano ${mano} asiento ${s}`);
        assert.equal(dadas, primero.fichasEspacio[s] + 1, 'los espacios son las fichas de espacio mas una');
      }
    }
  }
});

test('con menos de 5 espacios (1, 3, 4 cartas) se reparten y se revelan solo esas cartas, y las que brillan siguen siendo las del color', async () => {
  // Los bots casi nunca apuestan fichas de espacio, asi que se recorta una partida real como la dejaria el motor: oculto.cartas ya viene corto.
  const p = structuredClone(await jugar(...CASOS.ganadoDistinto));
  const espacios = [5, 3, 1, 4];
  for (const r of p.rondas.filter((x) => x.mano >= 2)) {
    r.oculto.cartas = r.oculto.cartas.map((fila, s) => fila.slice(0, espacios[s]));
    r.fichasEspacio = espacios.map((e) => e - 1);
  }
  const beats = construirLineaDeTiempo(p);
  for (const b of beats.filter((x) => x.mano >= 2)) {
    if (b.tipo === 'reparto') for (let s = 0; s < 4; s++) assert.equal(b.pasos.filter((x) => x.asiento === s).length, espacios[s], `reparto, asiento ${s}`);
    if (b.tipo !== 'revelado') continue;
    const { cartas, brillan } = b.pasos.find((x) => x.tipo === 'revelar');
    assert.deepEqual(cartas.map((f) => f.length), espacios);
    assert.deepEqual(brillan.map((f) => f.length), espacios);
    const color = p.rondas[b.registro].resolucion.color;
    cartas.forEach((fila, s) => fila.forEach((c, k) => assert.equal(brillan[s][k], c === color || c === 'arcoiris')));
  }
});

test('revelado solo cuando hubo recuento; sus cartas, brillos y contador coinciden con lo que conto el motor', async () => {
  let recuentos = 0;
  for (const p of await muchas()) {
    const beats = construirLineaDeTiempo(p);
    p.rondas.forEach((r, i) => {
      const esperado = { recuento: 'revelado', retirada: 'retirada' }[r.resolucion?.tipo];
      const resolucion = beats.filter((b) => b.registro === i && (b.tipo === 'revelado' || b.tipo === 'retirada')).map((b) => b.tipo);
      assert.deepEqual(resolucion, esperado ? [esperado] : [], `registro ${i}`);
    });
    for (const b of beats) {
      const res = p.rondas[b.registro].resolucion;
      if (b.tipo !== 'revelado') continue;
      recuentos++;
      assert.equal(res.tipo, 'recuento');
      const revelar = b.pasos.find((x) => x.tipo === 'revelar');
      const contar = b.pasos.find((x) => x.tipo === 'contar');
      assert.deepEqual(contar.cuentas, res.cuentas);
      assert.equal(contar.real, res.real, 'el contador termina en lo que hay de verdad');
      assert.equal(contar.cantidad, res.cantidad);
      assert.equal(contar.color, res.color);
      assert.deepEqual(revelar.brillan.map((fila) => fila.filter(Boolean).length), res.cuentas, `${b.id}: las cartas que brillan no suman lo que conto el motor`);
      for (let s = 0; s < 4; s++) assert.equal(revelar.cartas[s].length, p.rondas[b.registro].oculto.cartas[s].slice(0, revelar.cartas[s].length).length);
    }
  }
  assert.ok(recuentos > 50, `solo ${recuentos} recuentos`);
});

test('la camara oculta: el publico ve las cartas de dos jugadores por mano y de los otros dos nada hasta el recuento; una retirada no revela nada', async () => {
  let retiradas = 0;
  for (const p of await muchas()) {
    const beats = construirLineaDeTiempo(p);
    for (const [mano, bs] of porMano(beats.filter((b) => b.tipo !== 'final'))) {
      const esperada = elegirCamara(p.seed, mano, 2);
      assert.ok(bs.every((b) => JSON.stringify(b.camara) === JSON.stringify(esperada)), `mano ${mano}: camara distinta de elegirCamara`);
      for (const x of bs.find((b) => b.tipo === 'reparto').pasos.filter((q) => q.tipo === 'repartir')) {
        assert.equal(x.color === null, !esperada.includes(x.asiento), `mano ${mano}: carta del asiento ${x.asiento} ${x.color}`);
      }
      const final = bs.find((b) => b.tipo === 'revelado' || b.tipo === 'retirada');
      for (const b of bs.slice(0, bs.indexOf(final))) {
        assert.ok(!b.pasos.some((x) => 'cartas' in x || 'brillan' in x), `${b.id}: muestra cartas antes del recuento`);
      }
      if (final.tipo === 'retirada') {
        retiradas++;
        assert.ok(bs.every((b) => !b.pasos.some((x) => x.tipo === 'revelar' || x.tipo === 'contar')), `mano ${mano}: una retirada nunca revela`);
      }
    }
  }
  assert.ok(retiradas > 5, 'la prueba no vio retiradas');
});

test('la camara se puede apagar (0) o abrir del todo (4)', async () => {
  const p = await jugar(...CASOS.retirada);
  const reparto = (camara) => construirLineaDeTiempo(p, { camara }).find((b) => b.tipo === 'reparto').pasos.filter((x) => x.tipo === 'repartir');
  assert.ok(reparto(0).every((x) => x.color === null));
  assert.ok(reparto(4).every((x) => typeof x.color === 'string'));
});

test('las fichas vuelan por lo que GANA el ganador, no por lo que pierde el otro, y el perdedor pierde lo movido', async () => {
  const [seed, claves] = CASOS.ganadoDistinto;
  let distintos = 0;
  for (const p of [await jugar(seed, claves), ...await muchas()]) {
    for (const b of construirLineaDeTiempo(p)) {
      const res = p.rondas[b.registro].resolucion;
      if (b.tipo !== 'revelado' && b.tipo !== 'retirada') continue;
      const vuelo = b.pasos.find((x) => x.tipo === 'fichas');
      assert.deepEqual(vuelo.ganado, res.ganado);
      assert.deepEqual(vuelo.pierde, res.movidas);
      assert.equal(vuelo.a, res.ganador);
      assert.equal(vuelo.de, res.perdedor);
      if (JSON.stringify(res.ganado) !== JSON.stringify(res.movidas)) distintos++;
    }
  }
  assert.ok(distintos > 0, 'la prueba no vio ningun caso donde lo ganado difiera de lo movido');
});

test('una retirada trae su sello y los textos se reparten bien: nada de la mano se dice en el cierre', async () => {
  for (const p of await muchas()) {
    for (const b of construirLineaDeTiempo(p)) {
      if (b.tipo === 'retirada') assert.ok(b.pasos.some((x) => x.tipo === 'sello' && x.sello === 'retirada'), b.id);
      if (b.tipo === 'revelado') assert.match(b.lineas[0].texto, /^Se revelan las cartas/, b.id);
      if (b.tipo === 'retirada') assert.match(b.lineas[0].texto, / gana /, b.id);
      if (b.tipo === 'defensa') assert.match(b.lineas[0].texto, /iguala la subida|se retira/, b.id);
      if (b.tipo === 'cierre') for (const l of b.lineas) assert.match(l.texto, /paga una ficha|cambia una ficha|no puede comprar|una sola carta|pasa al frente/, `${b.id}: ${l.texto}`);
    }
  }
});

test('el cierre de la mano fija el estado de las placas con lo que registro el motor, incluido el pago a la banca', async () => {
  const p = await jugar(...CASOS.pago);
  const cierres = construirLineaDeTiempo(p).filter((b) => b.tipo === 'cierre');
  const conPago = cierres.filter((b) => b.pasos.some((x) => x.tipo === 'pago'));
  assert.ok(conPago.length >= 1, 'esta partida debia tener pago');
  for (const b of cierres) {
    const r = p.rondas[b.registro];
    const estado = b.pasos.find((x) => x.tipo === 'estado');
    assert.deepEqual(estado.fichas, r.fichas);
    assert.deepEqual(estado.fichasEspacio, r.fichasEspacio);
    assert.equal(b.pasos.some((x) => x.tipo === 'pago'), r.pago, b.id);
  }
});

test('las compras de espacio (y las que no se pudieron) llegan al cierre', async () => {
  const p = structuredClone(await jugar(3));
  const i = p.rondas.findIndex((r) => r.finMano);
  p.rondas[i].compras = [2];
  p.rondas[i].comprasFallidas = [1];
  const cierre = construirLineaDeTiempo(p).find((b) => b.tipo === 'cierre');
  assert.deepEqual(cierre.pasos.filter((x) => x.tipo === 'compra').map((x) => x.asiento), [2]);
  assert.deepEqual(cierre.pasos.filter((x) => x.tipo === 'compraFallida').map((x) => x.asiento), [1]);
});

test('el final solo existe en una partida terminada y dice el epilogo guardado; una partida cortada no inventa ni final ni mano completa', async () => {
  const p = await jugar(3);
  const beats = construirLineaDeTiempo(p);
  assert.equal(beats.at(-1).tipo, 'final');
  assert.equal(beats.filter((b) => b.tipo === 'final').length, 1);
  assert.equal(beats.at(-1).texto, p.epilogo.map((l) => nombres(p)(l.texto)).join(' '));
  assert.deepEqual(beats.at(-1).lineas.map((l) => l.tipo), p.epilogo.map(() => 'epilogo'));
  const corta = await jugar(3, undefined, { maxRondas: 10 });
  assert.equal(corta.truncada, true);
  const bs = construirLineaDeTiempo(corta);
  assert.ok(bs.every((b) => b.tipo !== 'final'), 'no hay final inventado');
  assert.equal(bs.at(-1).registro, 9, 'llega hasta el ultimo registro que existe');
  assert.ok(bs.length > 0 && bs.every((b) => b.registro <= 9));
});

test('una jugada que puso el juego por una respuesta ilegal queda marcada y no se atribuye a la IA', async () => {
  const caido = { id: 'caido', nombre: 'Caido', color: '#888888', inicial: 'C', tipo: 'modelo', modelo: 'x/y', async jugar() { throw new Error('HTTP 500'); } };
  const p =await correrPartida({ juego: dudaapuesta, agentes: [caido, ...agentes(['calculador', 'retador', 'prudente'])], seed: 3 });
  const beats = construirLineaDeTiempo(p);
  const marcados = beats.filter((b) => b.reemplazo);
  assert.ok(marcados.length > 0, 'el modelo caido tiene que dejar jugadas de reemplazo');
  for (const b of beats) {
    const r = p.rondas[b.registro];
    const esAccion = ['anuncio', 'acepta', 'duda', 'defensa'].includes(b.tipo);
    assert.equal(b.reemplazo === true, esAccion && r.invalidas[r.asiento] === true, b.id);
  }
});

test('puntuarManos: una entrada por mano, en orden, con motivos; los hechos raros pesan mas', async () => {
  const p = await jugar(...CASOS.retirada);
  const manos = puntuarManos(p);
  assert.deepEqual(manos.map((m) => m.mano), [...new Set(p.rondas.map((r) => r.mano))]);
  assert.ok(manos.every((m) => Number.isFinite(m.puntos) && m.puntos >= 0 && Array.isArray(m.motivos)));
  const retirada = manos.find((m) => m.mano === 6);
  assert.ok(retirada.motivos.includes('retirada tras subida'), JSON.stringify(retirada));
  const ultima = manos.at(-1);
  assert.ok(ultima.motivos.includes('eliminación'), 'la mano que elimina a alguien');
  assert.ok(ultima.motivos.includes('farol descubierto'), 'la ultima mano de esta partida fue un farol descubierto');
  assert.equal(mejoresManos(p, 1)[0].mano, ultima.mano, 'la eliminacion es lo mas interesante');
  const dos = mejoresManos(p, 2);
  assert.equal(dos.length, 2);
  assert.ok(dos[0].puntos >= dos[1].puntos);
  assert.notEqual(dos[0].mano, dos[1].mano);
  assert.deepEqual(mejoresManos(p, 0), []);
});

test('puntuarManos: el empate exacto con el anuncio ("justo") y el cambio de lider cuentan', async () => {
  let justos = 0, lideres = 0;
  for (const p of await muchas()) {
    for (const m of puntuarManos(p)) {
      if (m.motivos.includes('justo')) justos++;
      if (m.motivos.includes('pasa al frente')) lideres++;
    }
  }
  assert.ok(justos > 0 && lideres > 0, `justos ${justos}, lideres ${lideres}`);
});

test('con entrada ilegible no lanza: no hay beats ni manos', () => {
  for (const basura of [null, undefined, {}, { rondas: [] }, { rondas: 'x' }, 7]) {
    assert.deepEqual(construirLineaDeTiempo(basura), []);
    assert.deepEqual(puntuarManos(basura), []);
    assert.deepEqual(mejoresManos(basura, 3), []);
  }
});

test('los beats con texto duran al menos lo que tarda en leerse y revelado deja tiempo al conteo', async () => {
  const p = await jugar(...CASOS.retirada);
  for (const b of construirLineaDeTiempo(p)) {
    assert.ok(b.minMs >= MIN_MS[b.tipo], b.id);
    if (b.texto) assert.ok(b.minMs >= 500 + 60 * b.texto.length, `${b.id}: ${b.minMs} ms para ${b.texto.length} caracteres`);
  }
  assert.ok(MIN_MS.revelado >= 3500);
  assert.deepEqual(Object.keys(MIN_MS).sort(), ['acepta', 'anuncio', 'apertura', 'cierre', 'defensa', 'duda', 'final', 'reparto', 'retirada', 'revelado']);
});

test('el tope de manos que muestra la escena es el del motor (la web no puede importarlo)', () => {
  assert.equal(MANOS_TOPE, MANOS);
});

test('con razones (razon=1): cada jugada trae lo que penso su IA y dura lo que tarda en leerse; lo demas queda igual', async () => {
  const p = structuredClone(await jugar(...CASOS.retirada));
  const largo = 'Creo que el anuncio es falso: hay muchas cartas moradas en la mesa y pocas rojas. '.repeat(3);
  p.rondas[1].razones[p.rondas[1].asiento] = `  ${largo} `;
  const base = construirLineaDeTiempo(p);
  const con = conRazones(base, p);
  assert.equal(con.length, base.length);
  let conTexto = 0;
  con.forEach((b, k) => {
    const r = p.rondas[b.registro];
    const accion = ['anuncio', 'acepta', 'duda', 'defensa'].includes(b.tipo);
    const texto = accion && !b.reemplazo ? r.razones?.[b.asiento] : null;
    if (typeof texto === 'string' && texto.trim()) {
      conTexto++;
      assert.equal(b.razon, texto.trim());
      assert.equal(b.minMs, base[k].minMs + Math.min(6000, 500 + 45 * texto.trim().length), b.id);
    } else assert.deepEqual(b, base[k], `${b.id} no debia cambiar`);
  });
  assert.ok(conTexto > 5);
  assert.ok(con.some((b) => b.registro === 1 && b.razon === largo.trim()), 'la razon puesta a mano llega al beat de esa jugada');
  assert.ok(base.every((b) => !('razon' in b)), 'la linea de tiempo original no se modifica');
  for (const basura of [null, undefined, 'x', 7]) assert.deepEqual(conRazones(basura, p), []);
  assert.deepEqual(conRazones(base, null).map((b) => b.id), base.map((b) => b.id), 'sin partida no hay razones pero no lanza');
});
