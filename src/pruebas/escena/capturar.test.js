// Herramienta de capturas de la escena (herramientas/capturar-escena.mjs): lo puro de ella. El navegador y el servidor no se prueban aqui:
// eso es la verificacion visual que la herramienta misma hace.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { urlDeCaptura, erroresDeConsola, beatsClave, tamanoDeFormato, buscarChrome } from '../../../herramientas/capturar-escena.mjs';
import { construirLineaDeTiempo } from '../../../web/casino/linea-de-tiempo-duda.js';
import { jugar, CASOS } from './ayudas.js';

test('el tamano de ventana de cada formato es el del lienzo', () => {
  assert.equal(tamanoDeFormato('9x16'), '1080,1920');
  assert.equal(tamanoDeFormato('16x9'), '1920,1080');
  assert.equal(tamanoDeFormato('hoja'), '3840,2160');
  assert.throws(() => tamanoDeFormato('1x1'), /formato/i);
});

test('la URL de captura apaga el sonido, oculta la barra, arranca sola y se detiene en el beat pedido', () => {
  const u = new URL(urlDeCaptura({ base: 'http://localhost:4321', archivo: 'pruebas/mi partida.json', formato: '16x9', beat: 6 }));
  assert.equal(u.origin + u.pathname, 'http://localhost:4321/escena.html');
  assert.equal(u.searchParams.get('archivo'), 'pruebas/mi partida.json');
  assert.equal(u.searchParams.get('formato'), '16x9');
  assert.equal(u.searchParams.get('detener'), '6');
  for (const [k, v] of [['limpio', '1'], ['auto', '1'], ['sonido', '0'], ['escala', '1']]) assert.equal(u.searchParams.get(k), v, k);
  const completa = new URL(urlDeCaptura({ base: 'http://x', archivo: 'a.json', formato: '9x16', beat: null, vel: 8 }));
  assert.equal(completa.searchParams.has('detener'), false, 'sin beat se reproduce toda la partida');
  assert.equal(completa.searchParams.get('vel'), '8');
});

test('de la salida de Chrome solo cuentan los errores de la consola de la pagina; los 404 de las muestras de audio opcionales no', () => {
  const salida = [
    '[1:2:1015/101010.000:INFO:CONSOLE(45)] "hola", source: http://localhost:4321/casino/escena-duda.js (45)',
    '[1:2:1015/101010.000:WARNING:CONSOLE(46)] "aviso", source: http://localhost:4321/x.js (46)',
    '[1:2:1015/101010.000:ERROR:CONSOLE(47)] "Uncaught TypeError: no se puede leer x", source: http://localhost:4321/casino/escena-duda.js (47)',
    '[1:2:1015/101010.000:ERROR:gpu_process_host.cc(995)] GPU process exited unexpectedly',
    '[1:2:1015/101010.000:ERROR:CONSOLE(0)] "Failed to load resource: the server responded with a status of 404 (Not Found)", source: http://localhost:4321/audio/carta-1.ogg (0)',
    '[1:2:1015/101010.000:ERROR:CONSOLE(12)] "Failed to load resource: the server responded with a status of 404 (Not Found)", source: http://localhost:4321/data/falta.json (12)',
    'otra linea cualquiera',
  ].join('\n');
  const errores = erroresDeConsola(salida);
  assert.equal(errores.length, 2);
  assert.match(errores[0], /Uncaught TypeError/);
  assert.match(errores[1], /data\/falta\.json/);
  assert.deepEqual(erroresDeConsola(''), []);
  assert.deepEqual(erroresDeConsola(undefined), []);
});

test('los beats clave de una partida: el primer reparto, anuncio, duda, revelado y retirada, y el final', async () => {
  const beats = construirLineaDeTiempo(await jugar(...CASOS.retirada));
  const clave = beatsClave(beats);
  assert.deepEqual(clave, [...new Set(clave)].sort((a, b) => a - b), 'sin repetir y en orden');
  const tipos = clave.map((i) => beats[i].tipo);
  for (const t of ['reparto', 'anuncio', 'duda', 'revelado', 'retirada', 'final']) assert.ok(tipos.includes(t), `falta ${t}: ${tipos}`);
  assert.equal(beats[clave.at(-1)].tipo, 'final');
  assert.deepEqual(beatsClave([]), []);
  assert.deepEqual(beatsClave(null), []);
});

test('buscarChrome usa CHROME_PATH si existe, luego los sitios conocidos, y devuelve null si no hay ninguno', () => {
  const existen = new Set(['/ruta/propia/chrome', 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe']);
  const existe = (r) => existen.has(r);
  assert.equal(buscarChrome({ CHROME_PATH: '/ruta/propia/chrome' }, existe), '/ruta/propia/chrome');
  assert.equal(buscarChrome({ CHROME_PATH: '/no/existe' }, existe), 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
  assert.equal(buscarChrome({}, existe), 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe');
  assert.equal(buscarChrome({}, () => false), null);
});

import { leerEstado, leerDesfase, desfaseAceptable } from '../../../herramientas/capturar-escena.mjs';
import { beatsDeEstado, erroresDeEstado } from '../../../web/casino/linea-de-tiempo-duda.js';

test('los beats clave miran tambien una mano posterior: el estado que arrastra una mano a la siguiente es donde se vieron los fallos', async () => {
  const beats = construirLineaDeTiempo(await jugar(...CASOS.retirada));
  const clave = beatsClave(beats);
  const posteriores = clave.map((i) => beats[i]).filter((b) => b.mano >= 2);
  assert.ok(posteriores.some((b) => b.tipo === 'reparto'), 'falta el reparto de una mano posterior');
  assert.ok(posteriores.some((b) => b.tipo === 'anuncio'), 'falta el primer anuncio de una mano posterior');
});

test('beatsDeEstado: el reparto de cada mano desde la segunda, con un tope de manos', async () => {
  const beats = construirLineaDeTiempo(await jugar(...CASOS.retirada));
  const todos = beatsDeEstado(beats, 99);
  assert.ok(todos.length >= 5);
  assert.ok(todos.every((i) => beats[i].tipo === 'reparto' && beats[i].mano >= 2));
  assert.deepEqual(new Set(todos.map((i) => beats[i].mano)).size, todos.length, 'una por mano');
  assert.equal(beatsDeEstado(beats, 3).length, 3);
  assert.deepEqual(beatsDeEstado(null, 3), []);
});

test('erroresDeEstado: al repartir una mano no queda sello ni anuncio de la anterior, y las pastillas son las de la camara de esa mano', () => {
  const beat = { id: 'm3-1-reparto', camara: [1, 3] };
  assert.deepEqual(erroresDeEstado({ sello: 0, anuncio: 0, pastillas: 2, medallas: 0 }, beat), []);
  assert.match(erroresDeEstado({ sello: 1, anuncio: 0, pastillas: 2, medallas: 0 }, beat).join(), /sello/);
  assert.match(erroresDeEstado({ sello: 0, anuncio: 1, pastillas: 2, medallas: 0 }, beat).join(), /anuncio/);
  assert.match(erroresDeEstado({ sello: 0, anuncio: 0, pastillas: 4, medallas: 0 }, beat).join(), /pastillas/);
  assert.match(erroresDeEstado({ sello: 0, anuncio: 0, pastillas: 2, medallas: 1 }, beat).join(), /medalla/);
  assert.match(erroresDeEstado(null, beat).join(), /estado/);
  assert.equal(erroresDeEstado({ sello: 0.004, anuncio: 0, pastillas: 2, medallas: 0 }, beat).length, 0, 'una opacidad casi cero no se ve');
});

test('leerEstado y leerDesfase leen lo que la escena deja en el DOM', () => {
  const dom = '<body data-estado="{&quot;sello&quot;:0,&quot;anuncio&quot;:0,&quot;pastillas&quot;:2,&quot;medallas&quot;:0}" data-duracion-ms="61000.5" data-esperada-ms="60000">';
  assert.deepEqual(leerEstado(dom), { sello: 0, anuncio: 0, pastillas: 2, medallas: 0 });
  assert.equal(leerEstado('<body>'), null);
  assert.equal(leerEstado('<body data-estado="no es json">'), null);
  assert.deepEqual(leerDesfase(dom), { medidoMs: 61000.5, esperadoMs: 60000, desfaseMs: 1000.5 });
  assert.equal(leerDesfase('<body>'), null);
});

test('un desfase de reproduccion es aceptable hasta 1.5 s o el 4 % de lo esperado', () => {
  assert.equal(desfaseAceptable({ medidoMs: 61000, esperadoMs: 60000, desfaseMs: 1000 }), true);
  assert.equal(desfaseAceptable({ medidoMs: 30000, esperadoMs: 20000, desfaseMs: 10000 }), false);
  assert.equal(desfaseAceptable({ medidoMs: 200000, esperadoMs: 190000, desfaseMs: 10000 }), false, '5 % de 190 s son 9.5 s');
  assert.equal(desfaseAceptable({ medidoMs: 197000, esperadoMs: 190000, desfaseMs: 7000 }), true, '4 % de 190 s son 7.6 s');
  assert.equal(desfaseAceptable({ medidoMs: 59000, esperadoMs: 60000, desfaseMs: -1000 }), true);
  assert.equal(desfaseAceptable(null), false);
});

test('beatsClave es generica (sirve a cualquier juego): el primer beat de cada tipo, el primero de cada tipo en una ronda posterior y el final, sin repetir', () => {
  const b = (tipo, mano) => ({ tipo, mano });
  const beats = [b('apertura', 1), b('mira', 1), b('apertura', 2), b('mira', 2), b('cierre', 2), b('apertura', 3), b('mira', 3), b('final', 3)];
  assert.deepEqual(beatsClave(beats), [0, 1, 4, 5, 6, 7]);
  assert.deepEqual(beatsClave([b('apertura', 1), b('mira', 1), b('final', 1)]), [0, 1, 2], 'con una sola ronda no hay ronda posterior');
  assert.deepEqual(beatsClave([b('apertura', 1), b('x', 1), b('apertura', 2), b('x', 2)]), [0, 1, 2, 3], 'con dos rondas la posterior es la segunda');
  assert.deepEqual(beatsClave([]), []);
});
