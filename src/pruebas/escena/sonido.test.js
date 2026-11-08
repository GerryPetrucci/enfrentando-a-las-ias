// Sonido de la escena: que cada paso de la animacion tenga su efecto, que cada efecto tenga muestras grabadas Y un respaldo sintetizado,
// y que el motor de audio no rompa nada donde no hay audio (Node, un navegador sin AudioContext, sonido apagado).
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENTOS, VOLUMEN, crearSonido, eventosDePaso } from '../../../web/casino/sonido.js';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

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


test('cada muestra de cada efecto existe de verdad en web/audio: es un OGG chico', () => {
  for (const [nombre, ev] of Object.entries(EVENTOS)) {
    for (const m of ev.muestras) {
      const ruta = audio(m.replace('audio/', ''));
      assert.ok(existsSync(ruta), `${nombre}: falta web/${m}`);
      const bytes = readFileSync(ruta);
      assert.equal(bytes.subarray(0, 4).toString('latin1'), 'OggS', `${m} no es un OGG`);
      assert.ok(bytes.length > 1000 && bytes.length < 100 * 1024, `${m} pesa ${bytes.length} bytes`);
    }
  }
});

// Todos los tipos de paso que la escena hace sonar (el vocabulario de eventosDePaso, con la variante que cambia el efecto).
const PASOS_QUE_SUENAN = ['repartir', 'crupier', 'jugar', 'elegir', 'subir', 'revelar', 'voltear', 'lanzar', 'anuncio', 'duda', 'apuesta', 'recupera', 'fichas', 'pago', 'compra',
  'cobra', 'paga', 'devuelve', 'ficha', 'pagar', 'contar', 'marcar', 'anula', 'oprimir', 'pregunta', 'nadie', 'premio', 'ganar', 'anular', 'corte', 'armar', 'decidir', 'riesgo', 'medidor']
  .map((tipo) => ({ tipo })).concat([{ tipo: 'actuar', sale: true }, { tipo: 'actuar', resultado: 'tropezo' }, { tipo: 'actuar', resultado: 'cayo' }, { tipo: 'tentacion', clase: 'oferta' },
    { tipo: 'tentacion', clase: 'botin' }, { tipo: 'sello', sello: 'justo' }, { tipo: 'sello', sello: 'farol' }]);

test('todo paso que suena pide efectos que existen, y cada efecto lo pide algun paso (ninguno queda sin uso)', () => {
  const vistos = new Set();
  for (const paso of PASOS_QUE_SUENAN) {
    const eventos = eventosDePaso(paso);
    assert.ok(eventos.length >= 1, `${JSON.stringify(paso)} deberia sonar`);
    for (const ev of eventos) { assert.ok(EVENTOS[ev], `${paso.tipo} pide el efecto ${ev}, que no existe`); vistos.add(ev); }
  }
  assert.deepEqual([...vistos].sort(), Object.keys(EVENTOS).sort(), 'cada efecto se usa con algun paso');
});

test('los pasos de una partida real de Lobo nunca piden un efecto inexistente (Lobo es mudo a proposito: el texto y los personajes hablan solos)', async () => {
  const { construirLineaDeTiempo } = await import('../../../web/casino/linea-de-tiempo-lobo.js');
  const { jugarLobo } = await import('./ayudas-lobo.js');
  let pasos = 0;
  for (const [seed, jugadores] of [[3, 8], [11, 12]]) {
    for (const b of construirLineaDeTiempo(jugarLobo(seed, jugadores))) {
      for (const paso of b.pasos ?? []) { pasos++; for (const ev of eventosDePaso(paso)) assert.ok(EVENTOS[ev], `${b.id}: ${paso.tipo} pide ${ev}`); }
    }
  }
  assert.ok(pasos > 20, `solo ${pasos} pasos`);
});

// Un AudioContext de mentira: guarda cada fuente que suena (su buffer) para comprobar que se tocan las muestras grabadas, sin navegador.
function audioFalso() {
  const fuentes = [];
  class Param { constructor(v = 1) { this.value = v; } setValueAtTime() {} linearRampToValueAtTime() {} exponentialRampToValueAtTime() {} }
  class Ctx {
    constructor() { this.currentTime = 0; this.sampleRate = 44100; this.destination = {}; }
    async resume() {}
    createGain() { return { gain: new Param(1), connect() {} }; }
    createStereoPanner() { return { pan: { value: 0 }, connect() {} }; }
    createBufferSource() { const f = { buffer: null, connect() {}, start() { f.sono = true; } }; fuentes.push(f); return f; }
    async decodeAudioData(bytes) { return { nombre: Buffer.from(bytes).toString(), duration: 1 }; }
  }
  return { Ctx, fuentes };
}

test('con audio, preparar carga las muestras grabadas de cada efecto y cada efecto toca una de las suyas (no el respaldo sintetizado)', async () => {
  const { Ctx, fuentes } = audioFalso();
  const antes = { AudioContext: globalThis.AudioContext, fetch: globalThis.fetch };
  globalThis.AudioContext = Ctx;
  globalThis.fetch = async (url) => ({ ok: true, arrayBuffer: async () => { const u = String(url); const b = new TextEncoder().encode(u.slice(u.indexOf('audio/'))); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); } });
  try {
    const sfx = crearSonido({ activo: true, azar: () => 0.99 });
    await sfx.preparar();
    assert.equal(sfx.disponible, true);
    assert.deepEqual(sfx.cuantas(), Object.fromEntries(Object.entries(EVENTOS).map(([n, ev]) => [n, ev.muestras.length])), 'cargaron todas las muestras');
    for (const [nombre, ev] of Object.entries(EVENTOS)) {
      const n = fuentes.length;
      sfx[nombre]();
      assert.equal(fuentes.length, n + 1, `${nombre}: suena una sola fuente`);
      assert.ok(fuentes.at(-1).sono && ev.muestras.includes(fuentes.at(-1).buffer.nombre), `${nombre}: toca una de sus muestras`);
    }
    const apagado = crearSonido({ activo: false });
    await apagado.preparar();
    const n = fuentes.length;
    for (const nombre of Object.keys(EVENTOS)) apagado[nombre]();
    assert.equal(fuentes.length, n, 'con el sonido apagado no suena nada');
  } finally { Object.assign(globalThis, antes); if (antes.AudioContext === undefined) delete globalThis.AudioContext; }
});

test('la fuerza de un golpe se mide por sus 100 ms mas fuertes (no por la media del archivo), asi un clink seco y un golpe ancho quedan parejos', () => {
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



test('el efecto de dados trae dos muestras grabadas (para elegir de oido) y un respaldo sintetizado de tres golpes', () => {
  assert.deepEqual(EVENTOS.dado.muestras, ['audio/dado-1.ogg', 'audio/dado-2.ogg']);
  assert.equal(EVENTOS.dado.sintetico.ruidos.length, 3);
  assert.ok(readFileSync(audio('LEEME.md'), 'utf8').includes('dado-1.ogg'), 'el LEEME dice de donde sale cada muestra de dados');
});