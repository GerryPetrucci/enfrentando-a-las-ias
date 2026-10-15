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
  assert.equal(tipos.filter((t) => t === 'reparto').length, 1, 'uno solo de cada tipo');
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
