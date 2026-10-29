// Sonido de la escena: que cada paso de la animacion tenga su efecto, que cada efecto tenga muestras grabadas Y un respaldo sintetizado,
// y que el motor de audio no rompa nada donde no hay audio (Node, un navegador sin AudioContext, sonido apagado).
//
//   npm test

import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { EVENTOS, VOLUMEN, eventosDePaso, crearSonido, calendarioDeGolpes } from '../../../web/casino/sonido.js';
import { construirLineaDeTiempo } from '../../../web/casino/linea-de-tiempo-duda.js';
import { muchas } from './ayudas.js';

test('cada paso de la animacion tiene su efecto: nada suena de mas ni se queda mudo', () => {
  assert.deepEqual(eventosDePaso({ tipo: 'repartir' }), ['carta']);
  assert.deepEqual(eventosDePaso({ tipo: 'revelar' }), ['voltear']);
  assert.deepEqual(eventosDePaso({ tipo: 'anuncio' }), ['anuncio']);
  assert.deepEqual(eventosDePaso({ tipo: 'duda' }), ['duda']);
  assert.deepEqual(eventosDePaso({ tipo: 'apuesta' }), ['ficha']);
  assert.deepEqual(eventosDePaso({ tipo: 'fichas' }), ['ficha']);
  assert.deepEqual(eventosDePaso({ tipo: 'pago' }), ['ficha']);
  assert.deepEqual(eventosDePaso({ tipo: 'compra' }), ['ficha']);
  assert.deepEqual(eventosDePaso({ tipo: 'contar' }), ['tic']);
  assert.deepEqual(eventosDePaso({ tipo: 'sello', sello: 'justo' }), ['gana']);
  assert.deepEqual(eventosDePaso({ tipo: 'sello', sello: 'cumplido' }), ['gana']);
  assert.deepEqual(eventosDePaso({ tipo: 'sello', sello: 'farol' }), ['pierde']);
  assert.deepEqual(eventosDePaso({ tipo: 'sello', sello: 'retirada' }), ['pierde']);
  assert.deepEqual(eventosDePaso({ tipo: 'sello', sello: 'incumplido' }), ['pierde']);
  for (const mudo of [{ tipo: 'iguala' }, { tipo: 'pliega' }, { tipo: 'estado' }, { tipo: 'compraFallida' }, { tipo: 'final' }, { tipo: 'raro' }, {}, null, undefined, 7]) {
    assert.deepEqual(eventosDePaso(mudo), [], JSON.stringify(mudo));
  }
});

test('todos los pasos de partidas reales dan efectos que existen', async () => {
  const vistos = new Set();
  for (const p of await muchas()) {
    for (const b of construirLineaDeTiempo(p)) {
      for (const paso of b.pasos) {
        for (const ev of eventosDePaso(paso)) { assert.ok(EVENTOS[ev], `${paso.tipo} pide el efecto ${ev}, que no existe`); vistos.add(ev); }
      }
    }
  }
  assert.deepEqual([...vistos].sort(), ['anuncio', 'carta', 'duda', 'ficha', 'gana', 'pierde', 'tic', 'voltear'], 'cada efecto se usa en alguna partida');
});

test('cada efecto trae muestras grabadas (para la web) y un respaldo sintetizado bien formado', () => {
  for (const [nombre, ev] of Object.entries(EVENTOS)) {
    assert.ok(Array.isArray(ev.muestras) && ev.muestras.length >= 1, `${nombre}: sin muestras`);
    for (const m of ev.muestras) assert.match(m, /^audio\/[a-z0-9-]+\.ogg$/, `${nombre}: ${m}`);
    assert.equal(new Set(ev.muestras).size, ev.muestras.length);
    const { ruidos = [], tonos = [] } = ev.sintetico;
    assert.ok(ruidos.length + tonos.length >= 1, `${nombre}: el respaldo sintetizado esta vacio`);
    for (const r of ruidos) for (const k of ['dur', 'f0', 'f1', 'vol']) assert.ok(Number.isFinite(r[k]) && r[k] > 0, `${nombre} ruido ${k}`);
    for (const t of tonos) for (const k of ['freq', 'dur', 'vol']) assert.ok(Number.isFinite(t[k]) && t[k] > 0, `${nombre} tono ${k}`);
    for (const x of [...ruidos, ...tonos]) assert.ok(x.retraso === undefined || (Number.isFinite(x.retraso) && x.retraso >= 0));
  }
});

test('el volumen de los efectos queda unos 12 dB bajo la voz', () => {
  const dB = 20 * Math.log10(VOLUMEN);
  assert.ok(dB < -10 && dB > -14, `${dB.toFixed(1)} dB`);
});

test('el motor de sonido no rompe donde no hay audio: sonido apagado, Node sin AudioContext, entrada ilegible', async () => {
  for (const opciones of [{ activo: false }, { activo: true }, {}, undefined]) {
    const sfx = crearSonido(opciones);
    for (const nombre of Object.keys(EVENTOS)) assert.equal(typeof sfx[nombre], 'function', nombre);
    for (const nombre of Object.keys(EVENTOS)) assert.doesNotThrow(() => sfx[nombre]());
    await assert.doesNotReject(async () => sfx.preparar());
    assert.equal(sfx.disponible, false, 'en Node no hay AudioContext');
  }
});

import { MAPA, RAICES, gananciaPara, recorteDe, filtroDe, rmsMaximoDb, gananciaPorRms } from '../../../herramientas/preparar-sonidos.mjs';

const audio = (r) => new URL(`../../../web/audio/${r}`, import.meta.url);

test('cada muestra de cada efecto existe de verdad en web/audio: es un OGG chico', () => {
  for (const [nombre, ev] of Object.entries(EVENTOS)) {
    for (const m of ev.muestras) {
      const ruta = audio(m.replace('audio/', ''));
      assert.ok(existsSync(ruta), `${nombre}: falta web/${m}`);
      const bytes = readFileSync(ruta);
      assert.equal(bytes.subarray(0, 4).toString('latin1'), 'OggS', `${m} no es un OGG`);
      assert.ok(bytes.length > 1000 && bytes.length < 100 * 1024, `${m} pesa ${bytes.length} bytes`); // las camas de la batalla (de 8 a 9 s) son las mas grandes: ~70 KB
    }
  }
});

test('el mapa de preparacion cubre exactamente las muestras de los efectos, cada una de un paquete CC0 conocido', () => {
  const destinos = Object.keys(MAPA).sort();
  const esperadas = Object.values(EVENTOS).flatMap((ev) => ev.muestras.map((m) => m.replace('audio/', ''))).sort();
  assert.deepEqual(destinos, esperadas);
  for (const [destino, { paquete, origen }] of Object.entries(MAPA)) {
    assert.ok(Object.keys(RAICES).includes(paquete), `${destino}: paquete ${paquete}`);
    assert.match(origen, /\.(ogg|mp3)$/, destino);
  }
});

// El id de Freesound de cada muestra (el numero con que empieza el nombre del archivo original en MAPA).
const idDe = (muestra) => MAPA[muestra.replace('audio/', '')].origen.split('_')[0];

test('gana y pierde suenan con grabaciones REALES de multitudes (no un jingle ni un sonido de interfaz)', () => {
  const de = (nombre) => EVENTOS[nombre].muestras.map((m) => m.replace('audio/', ''));
  for (const nombre of ['gana', 'pierde']) {
    assert.ok(de(nombre).length >= 2, `${nombre}: al menos dos opciones para elegir de oido`);
    for (const m of de(nombre)) assert.equal(MAPA[m].paquete, 'freesound', `${nombre}: ${m} es una grabacion real (Freesound, CC0), no de los paquetes de Kenney`);
  }
});

test('la batalla suena con las cinco grabaciones que escogio el usuario —florianreichelt y Jofae de fondo; JohnBuhr, Christopherderp y spycrah, los espadazos— y la Maravilla con DeVern al construirse y JensZygar al quedar construida', () => {
  const b = EVENTOS.batalla, p = b.paisaje;
  assert.equal(b.muestras.length, 5);
  assert.deepEqual([...p.camas, ...p.golpes].sort(), [0, 1, 2, 3, 4], 'cada muestra tiene un papel: cama o golpe');
  assert.deepEqual(p.camas.map((i) => idDe(b.muestras[i])), ['563011', '353185'], 'las camas: la carga de la tropa (florianreichelt) y la multitud (Jofae)');
  assert.deepEqual(p.golpes.map((i) => idDe(b.muestras[i])), ['326868', '364531', '471095'], 'los espadazos: JohnBuhr, Christopherderp y spycrah');
  assert.ok(p.golpes.every((i) => MAPA[b.muestras[i].replace('audio/', '')].dur <= 0.7), 'un golpe es corto (<= 0.7 s): asi caben 6 o 7 en 6 s sin encimarse');
  assert.equal(new Set(p.golpes.map((i) => MAPA[b.muestras[i].replace('audio/', '')].rms)).size, 1, 'los tres golpes se llevan a la MISMA fuerza real (rms de sus 100 ms mas fuertes): antes uno sonaba 10 dB mas que otro y parecia que solo habia uno');
  assert.ok(Number.isFinite(MAPA[b.muestras[p.golpes[0]].replace('audio/', '')].rms));
  assert.ok(p.camas.every((i) => MAPA[b.muestras[i].replace('audio/', '')].dur >= 6), 'una cama es larga: se repite con cruce, no a cada rato');
  assert.ok(Array.isArray(p.golpesPorSegundo) && p.golpesPorSegundo[0] >= 0.8 && p.golpesPorSegundo[1] <= 1.2 && p.golpesPorSegundo[1] > p.golpesPorSegundo[0], 'cerca de un espadazo por segundo (6 o 7 en 6 s), no 19');
  assert.ok(p.pausaMin >= 0.05, 'entre un espadazo y el siguiente siempre hay una pausa');
  assert.equal(p.cadaMin, undefined, 'el diseno anterior (intervalos de 0.3 a 1.1 s) ya no esta');
  assert.deepEqual(EVENTOS.obra.muestras.map(idDe), ['512490'], 'DeVern: el cuerno de guerra lejano, cada turno que la Maravilla esta en obra');
  assert.deepEqual(EVENTOS.construida.muestras.map(idDe), ['486629'], 'JensZygar: el gong, cuando queda construida');
  for (const viejo of ['choque', 'grito', 'maravilla']) assert.equal(EVENTOS[viejo], undefined, `${viejo}: el diseno anterior ya no esta`);
  for (const nombre of ['batalla', 'obra', 'construida']) assert.equal(typeof crearSonido()[nombre], 'function', `sfx.${nombre}`);
  assert.deepEqual(eventosDePaso({ tipo: 'tarjeta' }), [], 'el paso de la batalla no suena solo: la mesa lanza el paisaje con la duracion del zoom');
});

// Un AudioContext de mentira: guarda cuando empieza cada fuente, sus rampas de volumen y la tasa, para comprobar el CALENDARIO del paisaje sin navegador.
function audioFalso(duraciones) {
  const fuentes = [];
  class Param { constructor(v = 1) { this.value = v; this.eventos = []; } setValueAtTime(v, t) { this.eventos.push(['fija', v, t]); } linearRampToValueAtTime(v, t) { this.eventos.push(['rampa', v, t]); } exponentialRampToValueAtTime(v, t) { this.eventos.push(['rampa', v, t]); } }
  class Ctx {
    constructor() { this.currentTime = 0; this.sampleRate = 44100; this.destination = {}; }
    async resume() {}
    createGain() { return { gain: new Param(1), connect() {} }; }
    createStereoPanner() { return { pan: { value: 0 }, connect() {} }; }
    createBufferSource() { const f = { buffer: null, playbackRate: new Param(1), inicio: null, fin: null, salida: null, connect(nodo) { f.salida = nodo; }, start(t = 0, desfase = 0) { f.inicio = t; f.desfase = desfase; }, stop(t) { f.fin = t; } }; fuentes.push(f); return f; }
    async decodeAudioData(bytes) { const nombre = Buffer.from(bytes).toString(); return { nombre, duration: duraciones[nombre] ?? 1 }; }
  }
  return { Ctx, fuentes };
}
const generador = (semilla) => { let s = semilla >>> 0; const siguiente = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; }; for (let i = 0; i < 8; i++) siguiente(); return siguiente; }; // se descartan las primeras salidas: las de semillas vecinas casi no se distinguen
async function paisajeCon(ms, semilla = 7) {
  const duraciones = {};
  for (const m of EVENTOS.batalla.muestras) { const n = m.replace('audio/', ''); duraciones[m] = MAPA[n].dur ?? 1; }
  const { Ctx, fuentes } = audioFalso(duraciones);
  const antes = { AudioContext: globalThis.AudioContext, fetch: globalThis.fetch };
  globalThis.AudioContext = Ctx;
  globalThis.fetch = async (url) => ({ ok: true, arrayBuffer: async () => { const u = String(url); const bytes = new TextEncoder().encode(u.slice(u.indexOf('audio/'))); return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); } });
  try {
    const sfx = crearSonido({ activo: true, azar: generador(semilla) });
    await sfx.preparar();
    assert.equal(sfx.disponible, true);
    sfx.batalla(ms);
    const picoDe = (f) => { const g = f.salida?.gain; const picos = (g?.eventos ?? []).map((e) => e[1]); return picos.length ? Math.max(...picos) : g?.value ?? 1; }; // el volumen al que suena (lo mas alto de su rampa)
    return fuentes.map((f) => ({ nombre: f.buffer.nombre, inicio: f.inicio, fin: f.fin, tasa: f.playbackRate.value, desfase: f.desfase ?? 0, dur: f.buffer.duration, vol: picoDe(f) }));
  } finally { Object.assign(globalThis, antes); if (antes.AudioContext === undefined) delete globalThis.AudioContext; }
}

test('el paisaje de la batalla: las dos camas suenan TODO el zoom (se repiten con cruce, sin huecos) y los espadazos caen al azar, separados y no a la vez', async () => {
  const camas = EVENTOS.batalla.paisaje.camas.map((i) => EVENTOS.batalla.muestras[i]), golpes = EVENTOS.batalla.paisaje.golpes.map((i) => EVENTOS.batalla.muestras[i]);
  const ms = 6000, todo = await paisajeCon(ms);
  for (const cama of camas) {
    const v = todo.filter((f) => f.nombre === cama).sort((a, b) => a.inicio - b.inicio);
    assert.ok(v.length >= 1, `${cama}: suena`);
    assert.ok(v[0].inicio <= 0.01, `${cama}: empieza con el zoom`);
    for (let i = 1; i < v.length; i++) assert.ok(v[i].inicio < v[i - 1].inicio + (v[i - 1].dur - v[i - 1].desfase) - 0.05, `${cama}: la repeticion ${i} entra antes de que se acabe la anterior (sin hueco)`);
    assert.ok(v.at(-1).fin >= ms / 1000 - 0.05 && v.at(-1).fin <= ms / 1000 + 0.2, `${cama}: dura lo que el zoom (termina en ${v.at(-1).fin})`);
  }
  const g = todo.filter((f) => golpes.includes(f.nombre)).sort((a, b) => a.inicio - b.inicio);
  assert.ok(g.length >= 6 && g.length <= 7, `${g.length} espadazos en 6 s (se pidieron 6 o 7, maximo 7)`);
  for (let i = 0; i < g.length; i++) {
    assert.ok(g[i].inicio >= 0 && g[i].inicio + g[i].dur / g[i].tasa <= ms / 1000, `espadazo ${i} entero dentro del zoom`);
    assert.ok(g[i].tasa >= 0.94 && g[i].tasa <= 1.06, `espadazo ${i}: tasa ${g[i].tasa}`);
    if (i) assert.ok(g[i].inicio >= g[i - 1].inicio + g[i - 1].dur / g[i - 1].tasa, `el espadazo ${i} empieza cuando el ${i - 1} todavia suena: nunca dos a la vez`);
  }
  assert.ok(new Set(g.slice(1).map((x, i) => (x.inicio - g[i].inicio).toFixed(2))).size > 1, 'los intervalos no son todos iguales: son al azar');
  assert.equal(new Set(g.map((x) => x.nombre)).size, 3, 'suenan los tres espadazos distintos');
  assert.deepEqual(await paisajeCon(ms, 7), todo, 'con el mismo azar de la escena, suena igual (el video siempre es el mismo)');
  assert.notDeepEqual(await paisajeCon(ms, 8), todo, 'con otro azar, los espadazos caen en otros momentos');
  const corto = await paisajeCon(1200);
  assert.ok(corto.every((f) => (f.fin ?? 0) <= 1.4 && f.inicio < 1.2), 'un zoom corto (acelerado) acorta todo el paisaje');
  assert.ok(corto.filter((f) => golpes.includes(f.nombre)).length <= 1, 'en 1.2 s cabe a lo mas un espadazo');
});

test('el grito de la batalla (florianreichelt) suena MAS fuerte que la multitud (Jofae), que queda de fondo pero se oye (pedido del usuario, 28 oct: la multitud parecia ninos en un receso)', async () => {
  const [iGrito, iMultitud] = EVENTOS.batalla.paisaje.camas;
  assert.deepEqual([idDe(EVENTOS.batalla.muestras[iGrito]), idDe(EVENTOS.batalla.muestras[iMultitud])], ['563011', '353185'], 'la primera cama es el grito y la segunda la multitud');
  const vol = EVENTOS.batalla.paisaje.volumenCamas;
  assert.ok(Array.isArray(vol) && vol.length === 2 && vol.every(Number.isFinite), 'cada cama lleva su volumen');
  const todo = await paisajeCon(6000);
  const picos = (muestra) => todo.filter((f) => f.nombre === muestra).map((f) => f.vol);
  const grito = Math.max(...picos(EVENTOS.batalla.muestras[iGrito])), multitud = Math.max(...picos(EVENTOS.batalla.muestras[iMultitud]));
  assert.ok(grito >= multitud * 1.6, `el grito (${grito}) suena al menos 4 dB por encima de la multitud (${multitud})`);
  assert.ok(grito <= 1.6, 'sin pasarse: el grito sube un poco, no se dispara');
  assert.ok(multitud >= 0.35, `la multitud se sigue oyendo de fondo (${multitud})`);
  for (const f of todo.filter((x) => EVENTOS.batalla.paisaje.golpes.map((i) => EVENTOS.batalla.muestras[i]).includes(x.nombre))) assert.ok(f.vol >= 0.7 && f.vol <= 1, 'los espadazos no cambian: siguen entre 0.75 y 1');
});

test('el paisaje no rompe sin audio: con el sonido apagado, en Node, sin preparar o con una duracion rara', async () => {
  for (const sfx of [crearSonido({ activo: false }), crearSonido({ activo: true }), crearSonido()]) for (const ms of [undefined, 0, -5, NaN, 4000]) assert.doesNotThrow(() => sfx.batalla(ms), String(ms));
  const nada = await paisajeCon(0);
  assert.equal(nada.length, 0, 'un zoom de 0 ms no programa nada');
});


test('calendarioDeGolpes: de 6 a 7 espadazos en 6 s (nunca mas), NUNCA dos a la vez, los tres por turnos, con cadencia irregular; muchas semillas', () => {
  const durs = [0.5, 0.6, 0.55], P = EVENTOS.batalla.paisaje;
  const configuracion = { golpesPorSegundo: P.golpesPorSegundo, pausaMin: P.pausaMin };
  const cuentas = new Map(), primeros = new Set(), huecos = new Set();
  for (let semilla = 1; semilla <= 300; semilla++) {
    const c = calendarioDeGolpes({ ms: 6000, duraciones: durs, azar: generador(semilla), ...configuracion });
    assert.ok(c.length >= 6 && c.length <= 7, `semilla ${semilla}: ${c.length} espadazos`);
    cuentas.set(c.length, (cuentas.get(c.length) ?? 0) + 1);
    c.forEach((g, i) => {
      assert.ok(g.inicio >= 0 && g.inicio + g.dur <= 6, `semilla ${semilla}: el espadazo ${i} cabe en el zoom`);
      assert.ok(Math.abs(g.dur - durs[g.indice] / g.tasa) < 1e-9);
      assert.ok(g.tasa >= 0.94 && g.tasa <= 1.06 && g.vol >= 0.75 && g.vol <= 1);
      if (i) {
        assert.ok(g.inicio >= c[i - 1].inicio + c[i - 1].dur + P.pausaMin - 1e-9, `semilla ${semilla}: el ${i} se encima con el ${i - 1}`);
        assert.notEqual(g.indice, c[i - 1].indice, `semilla ${semilla}: el mismo espadazo dos veces seguidas`);
        huecos.add((g.inicio - c[i - 1].inicio).toFixed(2));
      }
    });
    for (let k = 0; k < 3; k++) assert.ok(c.filter((g) => g.indice === k).length >= 2, `semilla ${semilla}: el espadazo ${k} suena al menos dos veces (suenan los tres)`);
    primeros.add(c[0].inicio.toFixed(2));
  }
  assert.ok(cuentas.get(6) > 20 && cuentas.get(7) > 20, `unas veces 6 y otras 7: ${JSON.stringify([...cuentas])}`);
  assert.ok(primeros.size > 40, 'el primero cae en momentos muy distintos (mas de 40 distintos en 300 semillas)');
  assert.ok(huecos.size > 30, 'los intervalos entre espadazos son de muchos tamanos: cadencia irregular');
  for (let semilla = 1; semilla <= 300; semilla++) {
    const c = calendarioDeGolpes({ ms: 6000, duraciones: durs, azar: generador(semilla), ...configuracion });
    assert.ok(new Set(c.slice(1).map((g, i) => (g.inicio - c[i].inicio).toFixed(2))).size >= 3, 'los intervalos de un mismo calendario no son todos iguales (semilla ' + semilla + ')');
  }
  // determinista, y el azar manda
  const a = calendarioDeGolpes({ ms: 6000, duraciones: durs, azar: generador(5), ...configuracion });
  assert.deepEqual(calendarioDeGolpes({ ms: 6000, duraciones: durs, azar: generador(5), ...configuracion }), a);
  assert.notDeepEqual(calendarioDeGolpes({ ms: 6000, duraciones: durs, azar: generador(6), ...configuracion }), a);
  // el zoom real de una disputa dura unos 3.4 s (a 1.8x): 3 o 4; lo que cabe en un zoom corto; y lo invalido no lanza
  for (let semilla = 1; semilla <= 50; semilla++) {
    const m = calendarioDeGolpes({ ms: 3382, duraciones: durs, azar: generador(semilla), ...configuracion });
    assert.ok(m.length >= 3 && m.length <= 4, `${m.length} en 3.4 s`);
    assert.ok(calendarioDeGolpes({ ms: 1200, duraciones: durs, azar: generador(semilla), ...configuracion }).length <= 1);
  }
  for (const raro of [{ ms: 0 }, { ms: -4 }, { ms: NaN }, { ms: 400, duraciones: durs }, { ms: 6000, duraciones: [] }, {}, undefined]) assert.deepEqual(calendarioDeGolpes({ azar: generador(1), duraciones: durs, ...raro }), [], JSON.stringify(raro));
  // golpes largos que no caben: se quitan los ultimos en vez de encimarlos
  const largos = calendarioDeGolpes({ ms: 3000, duraciones: [1.4, 1.4, 1.4], azar: generador(3), ...configuracion });
  assert.ok(largos.length <= 2);
  largos.forEach((g, i) => { if (i) assert.ok(g.inicio >= largos[i - 1].inicio + largos[i - 1].dur); });
});

test('la fuerza de un golpe se mide por sus 100 ms mas fuertes (no por la media del archivo), asi el clink seco de JohnBuhr y el golpe ancho de spycrah quedan parejos', () => {
  const hz = 1000, muestras = new Float32Array(1000); // 1 s: silencio salvo 100 ms al 0.5 (-6 dB)
  for (let i = 400; i < 500; i++) muestras[i] = i % 2 ? 0.5 : -0.5;
  assert.ok(Math.abs(rmsMaximoDb(muestras, hz, 100) - 20 * Math.log10(0.5)) < 0.01, 'la ventana de 100 ms mas fuerte');
  const ancho = new Float32Array(1000), seco = new Float32Array(1000);
  for (let i = 300; i < 400; i++) ancho[i] = i % 2 ? 0.7 : -0.7; // un golpe ancho (100 ms al 0.7)
  for (let i = 0; i < 10; i++) seco[i] = i % 2 ? 1 : -1; // un clink seco (10 ms al maximo: pico mas alto)
  assert.ok(rmsMaximoDb(ancho, hz, 100) > rmsMaximoDb(seco, hz, 100) + 5, 'el clink seco tiene mas pico pero pesa mucho menos: por eso se nivela por rms y no por pico ni por la media del archivo');
  assert.equal(rmsMaximoDb(new Float32Array(0), hz), -Infinity);
  assert.equal(rmsMaximoDb(null, hz), -Infinity);
  assert.equal(gananciaPorRms(-26, -18), 8, 'sube lo flojo');
  assert.equal(gananciaPorRms(-8, -18), -10, 'baja lo fuerte');
  assert.equal(gananciaPorRms(-60, -18), 14, 'sin pasarse de la subida maxima (un clink seco no se amplifica hasta romperse)');
  for (const mala of [-Infinity, NaN, undefined]) assert.equal(gananciaPorRms(mala, -18), 0, 'medida ilegible: sin cambios');
  assert.match(filtroDe(8, { dur: 0.5, fundido: 0.2, rms: true }), /alimiter=limit=0\.89:attack=0\.5:release=20/, 'con rms, el limitador es rapido: el golpe se amplifica sin que el pico se rompa');
});

test('los tres golpes de espada ya no tienen una diferencia de fuerza: en web/audio sus 100 ms mas fuertes quedan en el mismo nivel (con ffmpeg)', { skip: spawnSync('ffmpeg', ['-version']).status !== 0 && 'no hay ffmpeg en este equipo' }, () => {
  const niveles = ['choque-1.ogg', 'choque-2.ogg', 'choque-3.ogg'].map((f) => {
    const r = spawnSync('ffmpeg', ['-v', 'error', '-i', fileURLToPath(audio(f)), '-ac', '1', '-ar', '22050', '-f', 'f32le', '-'], { maxBuffer: 64 * 1024 * 1024 });
    return rmsMaximoDb(new Float32Array(r.stdout.buffer, r.stdout.byteOffset, Math.floor(r.stdout.byteLength / 4)), 22050, 100);
  });
  assert.ok(Math.max(...niveles) - Math.min(...niveles) <= 2.5, `los tres golpes difieren ${(Math.max(...niveles) - Math.min(...niveles)).toFixed(1)} dB: ${niveles.map((n) => n.toFixed(1)).join(' / ')}`);
});

import { sonidoDeMaravilla } from '../../../web/casino/sonido-conquista.js';
import { MARAVILLA_OBRA } from '../../../web/casino/conquista-datos.js';

test('la Maravilla suena cada turno de obra (DeVern) y, al terminar la obra, cuando queda construida (JensZygar); nada mas: ni de pie, ni cercada, ni al cambiar de dueno', () => {
  const m = (n, extra = {}) => ({ k: 0, r: 5, n, ...extra });
  assert.equal(MARAVILLA_OBRA, 3);
  assert.equal(sonidoDeMaravilla(m(0), m(1)), 'obra', 'primer turno contado: la obra avanza');
  assert.equal(sonidoDeMaravilla(m(1), m(2)), 'obra', 'segundo turno de obra');
  assert.equal(sonidoDeMaravilla(m(2), m(3)), 'construida', 'la obra termina: queda construida');
  assert.equal(sonidoDeMaravilla(m(3), m(4)), null, 'de pie: ya no suena');
  assert.equal(sonidoDeMaravilla(m(9), m(10)), null);
  assert.equal(sonidoDeMaravilla(m(1), m(1, { cercada: true })), null, 'cercada: la cuenta se pausa, no avanza la obra');
  assert.equal(sonidoDeMaravilla(m(1), m(2, { k: 1 })), null, 'cambio de dueno: lo cuenta la conquista');
  assert.equal(sonidoDeMaravilla(m(1), m(2, { r: 6 })), null);
  assert.equal(sonidoDeMaravilla(m(2), m(0, { k: 2 })), null, 'la Maravilla conquistada reinicia su cuenta');
  for (const raro of [[null, null], [undefined, m(1)], [m(1), null], [m(1), undefined], [{}, {}], ['x', 3], [m(1), { k: 0, r: 5, n: 'tres' }]]) assert.equal(sonidoDeMaravilla(...raro), null, JSON.stringify(raro));
});

test('el recorte, el fundido y el nivel de cada muestra se arman bien: sin recorte no hay -ss ni -t; el fundido de salida cierra justo al final; un nivel propio cambia la ganancia', () => {
  assert.deepEqual(recorteDe({}), []);
  assert.deepEqual(recorteDe({ desde: 0 }), []);
  assert.deepEqual(recorteDe({ desde: 0.6, dur: 3.8 }), ['-ss', '0.6', '-t', '3.8']);
  assert.deepEqual(recorteDe({ dur: 1.5 }), ['-t', '1.5']);
  assert.equal(filtroDe(-3.2, {}), 'volume=-3.20dB,alimiter=limit=0.89', 'sin recorte ni fundido: solo ganancia y limitador');
  assert.equal(filtroDe(2, { dur: 4, fundido: 1 }), 'volume=2.00dB,afade=t=in:d=0.01,afade=t=out:st=3.000:d=1.000,alimiter=limit=0.89');
  assert.equal(filtroDe(0, { dur: 1, fundido: 2 }), 'volume=0.00dB,afade=t=in:d=0.01,alimiter=limit=0.89', 'un fundido mas largo que la muestra no se pone');
  assert.equal(gananciaPara(-30, -20, -17), 13, 'con nivel propio (un choque va mas fuerte que un aplauso)');
  assert.equal(gananciaPara(-30, -5, -17), 4, 'y el pico sigue mandando');
});

test('la ganancia lleva cada muestra al nivel comun sin pasarse del pico permitido', () => {
  assert.equal(gananciaPara(-27, -1.5), 0.5, 'una muestra baja sube solo hasta que su pico llega a -1 dB');
  assert.equal(gananciaPara(-11, -0.9), -9, 'una muestra fuerte baja hasta el nivel comun');
  assert.equal(gananciaPara(-20, -6), 0, 'ya esta en el nivel comun');
  assert.equal(gananciaPara(-30, -12), 10, 'baja y con pico lejano: sube hasta el nivel comun');
  for (const mala of [[NaN, -1], [-20, undefined], [null, null]]) assert.equal(gananciaPara(...mala), 0, 'medida ilegible: sin cambios');
});

test('web/audio/LICENCIAS.txt trae el texto de licencia de cada paquete de Kenney usado y la lista de cada grabacion real (autor, pagina y CC0); el LEEME dice que se verifico', () => {
  const lic = readFileSync(audio('LICENCIAS.txt'), 'utf8');
  for (const paquete of ['Casino Audio', 'Interface Sounds', 'Music Jingles']) assert.ok(lic.includes(paquete), `LICENCIAS.txt no menciona ${paquete}`);
  assert.equal((lic.match(/Creative Commons Zero, CC0/g) ?? []).length, 3, 'un texto de licencia CC0 por paquete de Kenney');
  // cada grabacion real (Freesound) esta nombrada con su numero de sonido, su autor y la pagina donde se verifico su CC0
  for (const [destino, { paquete, origen }] of Object.entries(MAPA)) {
    if (paquete !== 'freesound') continue;
    const [id, ...resto] = origen.replace(/\.mp3$/, '').split('_'), autor = resto.join('_');
    assert.ok(lic.includes(`#${id} `) && lic.includes(`/people/${autor}/sounds/${id}/`), `LICENCIAS.txt no menciona la fuente de ${destino} (#${id} de ${autor})`);
  }
  assert.match(lic, /https:\/\/freesound\.org\/people\/[A-Za-z0-9_-]+\/sounds\/\d+\//);
  assert.doesNotMatch(lic, /StarNinjas/, 'ya no se usa ninguna muestra de OpenGameArt');
  assert.match(lic, /publicdomain\/zero\/1\.0/);
  const leeme = readFileSync(audio('LEEME.md'), 'utf8');
  assert.match(leeme, /CC0/);
  assert.match(leeme, /Revision de la licencia: 16 de octubre de 2026/);
  assert.match(leeme, /Revision de las grabaciones reales: 28 de octubre de 2026/);
  assert.doesNotMatch(leeme, /pendiente/i, 'la licencia ya se reviso');
  for (const ev of Object.values(EVENTOS)) for (const m of ev.muestras) assert.ok(leeme.includes(m.replace('audio/', '')), `LEEME.md no menciona ${m}`);
});

test('sfx.probar y sfx.cuantas existen y no rompen donde no hay audio (la pagina de prueba de sonidos las usa)', async () => {
  const sfx = crearSonido({ activo: true });
  await sfx.preparar();
  for (const nombre of Object.keys(EVENTOS)) { assert.doesNotThrow(() => sfx.probar(nombre, 0)); assert.doesNotThrow(() => sfx.probar(nombre, -1)); }
  assert.doesNotThrow(() => sfx.probar('no-existe', 0));
  assert.deepEqual(Object.keys(sfx.cuantas()).sort(), Object.keys(EVENTOS).sort());
  assert.ok(existsSync(new URL('../../../web/sonidos.html', import.meta.url)), 'falta la pagina web/sonidos.html');
});

test('en web/audio no sobra ninguna muestra: solo estan las que usan los efectos', () => {
  const usadas = Object.values(EVENTOS).flatMap((ev) => ev.muestras.map((m) => m.replace('audio/', ''))).sort();
  const enDisco = readdirSync(new URL('../../../web/audio/', import.meta.url)).filter((f) => f.endsWith('.ogg')).sort();
  assert.deepEqual(enDisco, usadas);
});

test('los pasos de Mayor o menor y de El numero solitario suenan con los efectos que ya existen (vocabulario fijado en el plan, tarea A5)', () => {
  const casos = [
    // Mayor o menor
    ['crupier', ['carta']], ['jugar', ['carta']], ['pregunta', ['duda']], ['cobra', ['ficha']], ['paga', ['ficha']],
    // El numero solitario
    ['marcar', ['tic']], ['anula', ['tic']], ['premio', ['gana']], ['corte', ['anuncio']],
  ];
  for (const [tipo, esperado] of casos) assert.deepEqual(eventosDePaso({ tipo }), esperado, tipo);
  // los sellos de cada juego: gana o pierde segun el caso, y "igual" (la carta empata con la del crupier) no premia ni castiga
  for (const [sello, esperado] of [['justo', ['gana']], ['cumplido', ['gana']], ['acierta', ['gana']], ['farol', ['pierde']], ['incumplido', ['pierde']], ['retirada', ['pierde']], ['falla', ['pierde']], ['igual', []]]) {
    assert.deepEqual(eventosDePaso({ tipo: 'sello', sello }), esperado, `sello ${sello}`);
  }
  // lo que ya sonaba sigue igual
  assert.deepEqual(eventosDePaso({ tipo: 'repartir' }), ['carta']);
  assert.deepEqual(eventosDePaso({ tipo: 'revelar' }), ['voltear']);
  assert.deepEqual(eventosDePaso({ tipo: 'apuesta' }), ['ficha']);
  assert.deepEqual(eventosDePaso({ tipo: 'estado' }), []);
  assert.deepEqual(eventosDePaso({ tipo: 'roles' }), [], 'los pasos que solo cambian el texto o el estado no suenan');
});

test('los pasos de Triple dado suenan con los efectos fijados en el plan: el lanzamiento con el efecto de dados y lo demas con los que ya existian', () => {
  const casos = [['lanzar', ['dado']], ['subir', ['carta']], ['elegir', ['carta']], ['voltear', ['voltear']], ['premio', ['gana']]];
  for (const [tipo, esperado] of casos) assert.deepEqual(eventosDePaso({ tipo }), esperado, tipo);
  for (const mudo of ['combinar', 'barra', 'estado', 'final']) assert.deepEqual(eventosDePaso({ tipo: mudo }), [], `${mudo} es mudo a proposito`);
});

test('el efecto de dados trae dos muestras grabadas (para elegir de oido) y un respaldo sintetizado de tres golpes', () => {
  assert.deepEqual(EVENTOS.dado.muestras, ['audio/dado-1.ogg', 'audio/dado-2.ogg']);
  assert.equal(EVENTOS.dado.sintetico.ruidos.length, 3);
  assert.ok(readFileSync(audio('LEEME.md'), 'utf8').includes('dado-1.ogg'), 'el LEEME dice de donde sale cada muestra de dados');
});

test('los pasos de Subasta de tiempo suenan con los efectos que ya existen (vocabulario fijado en el plan, tarea 2); el reloj lo maneja la mesa', () => {
  const casos = [['oprimir', ['tic']], ['ganar', ['gana']], ['anular', ['pierde']], ['nadie', ['duda']], ['ficha', ['ficha']], ['pagar', ['ficha']]];
  for (const [tipo, esperado] of casos) assert.deepEqual(eventosDePaso({ tipo }), esperado, tipo);
  for (const mudo of ['correr', 'retirar']) assert.deepEqual(eventosDePaso({ tipo: mudo }), [], `${mudo} es mudo a proposito`);
});

test('los pasos de La Fuga suenan con los efectos que ya existen (vocabulario fijado en el plan, tarea E1): solo el que escapa suena a victoria, el que pasa limpio sin salir es mudo a proposito', () => {
  const casos = [
    [{ tipo: 'armar' }, ['anuncio']], [{ tipo: 'decidir' }, ['carta']], [{ tipo: 'riesgo' }, ['duda']],
    [{ tipo: 'actuar', resultado: 'limpio', sale: true }, ['gana']], [{ tipo: 'actuar', resultado: 'limpio', sale: false }, []],
    [{ tipo: 'actuar', resultado: 'tropezo', sale: false }, ['tic']], [{ tipo: 'actuar', resultado: 'tropezo', sale: true }, ['gana']],
    [{ tipo: 'actuar', resultado: 'cayo', sale: false }, ['pierde']], [{ tipo: 'tentacion', clase: 'botin' }, ['ficha']], [{ tipo: 'tentacion', clase: 'oferta' }, ['duda']], [{ tipo: 'medidor' }, ['tic']],
  ];
  for (const [paso, esperado] of casos) assert.deepEqual(eventosDePaso(paso), esperado, JSON.stringify(paso));
  for (const mudo of ['estado', 'final']) assert.deepEqual(eventosDePaso({ tipo: mudo }), [], `${mudo} es mudo a proposito`);
  assert.deepEqual(eventosDePaso({ tipo: 'actuar' }), [], 'un actuar sin resultado no suena');
});

test('Guerra de territorios: cada paso de la animacion suena o es mudo a proposito, y todos los pasos de su linea de tiempo estan en el vocabulario', async () => {
  const VOCABULARIO = ['estado', 'mapa', 'flechas', 'mensajes', 'privados', 'cartel', 'flashback', 'tarjeta', 'conquistas', 'pacto', 'cumplido', 'feed', 'razones', 'rasgos', 'final', 'maravilla'];
  const casos = [
    [{ tipo: 'flechas', lista: [{ n: 3 }] }, ['carta']], [{ tipo: 'flechas', lista: [] }, []],
    [{ tipo: 'tarjeta', variante: 'A' }, []], [{ tipo: 'tarjeta', variante: 'C' }, []], // la batalla no suena por su paso: la mesa lanza el paisaje de guerra (sfx.batalla) con la duracion del zoom
    [{ tipo: 'cartel' }, ['duda']], [{ tipo: 'flashback' }, ['voltear']],
    [{ tipo: 'conquistas', lista: [{ r: 3 }] }, ['gana']], [{ tipo: 'conquistas', lista: [] }, []],
    [{ tipo: 'pacto' }, ['ficha']], [{ tipo: 'cumplido' }, ['ficha']],
  ];
  for (const [paso, esperado] of casos) assert.deepEqual(eventosDePaso(paso), esperado, JSON.stringify(paso));
  for (const mudo of ['estado', 'mapa', 'mensajes', 'privados', 'feed', 'razones', 'rasgos', 'final', 'intro', 'maravilla']) assert.deepEqual(eventosDePaso({ tipo: mudo }), [], `${mudo} es mudo a proposito`);
  const { partidasDeEjemplo } = await import('./ayudas-conq.js');
  const { construirLineaDeTiempo: lineaConq } = await import('../../../web/casino/linea-de-tiempo-conquista.js');
  for (const p of await partidasDeEjemplo()) for (const b of lineaConq(p)) for (const paso of b.pasos) assert.ok(VOCABULARIO.includes(paso.tipo), `${b.id}: paso fuera del vocabulario: ${paso.tipo}`);
});
