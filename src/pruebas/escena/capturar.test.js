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

test('los console.error de la escena cuentan como errores aunque Chrome los escriba como INFO (se vio: un fallo de la escena pasaba por limpio)', () => {
  const salida = [
    '[1:2:1015/101010.000:INFO:CONSOLE(113)] "escena: la reproduccion se detuvo TypeError: this[metodo] is not a function", source: http://localhost:4321/casino/escena.js (113)',
    '[1:2:1015/101010.000:INFO:CONSOLE(45)] "hola", source: http://localhost:4321/casino/escena.js (45)',
    '[1:2:1015/101010.000:INFO:CONSOLE(99)] "escena: no se pudo armar Error: x", source: http://localhost:4321/casino/escena.js (99)',
  ].join('\n');
  const errores = erroresDeConsola(salida);
  assert.equal(errores.length, 2);
  assert.match(errores[0], /la reproduccion se detuvo/);
  assert.match(errores[1], /no se pudo armar/);
});

import { leerFundido } from '../../../herramientas/capturar-escena.mjs';

test('la URL de captura solo lleva grabar=1 cuando se pide: las capturas y --completa de siempre no cambian', () => {
  const normal = new URL(urlDeCaptura({ base: 'http://x', archivo: 'a.json', formato: 'hoja' }));
  assert.equal(normal.searchParams.has('grabar'), false);
  const grabando = new URL(urlDeCaptura({ base: 'http://x', archivo: 'a.json', formato: 'hoja', grabar: true, vel: 8 }));
  assert.equal(grabando.searchParams.get('grabar'), '1');
  assert.equal(grabando.searchParams.get('auto'), '1', 'grabar solo vale con auto');
  assert.equal(grabando.searchParams.get('vel'), '8');
});

import { presupuestosDeGrabar } from '../../../herramientas/capturar-escena.mjs';
import { FUNDIDOS } from '../../../web/casino/escena-config.js';

test('los momentos que mide --grabar salen de FUNDIDOS, no de numeros escritos a mano: uno dentro del margen y otro ya con la partida corriendo', () => {
  const normal = presupuestosDeGrabar();
  assert.ok(normal.margen > 0 && normal.margen < FUNDIDOS.margenMs, 'el primer momento cae dentro del margen de negro');
  assert.ok(normal.contenido > FUNDIDOS.margenMs + FUNDIDOS.fundidoMs, 'el segundo cae despues del fundido de entrada');
  const largo = presupuestosDeGrabar({ margenMs: 6000, fundidoMs: 1000, colaMs: 2000 });
  assert.ok(largo.margen < 6000 && largo.contenido > 7000, 'si cambian los tiempos, cambian los momentos');
});

test('leerFundido lee en que punto de la grabacion esta la pagina y si ya se cerro en negro', () => {
  assert.deepEqual(leerFundido('<body data-fundido="margen">'), { fundido: 'margen', cerrada: false });
  assert.deepEqual(leerFundido('<body data-fundido="negro" data-cierre="1" data-terminada="1">'), { fundido: 'negro', cerrada: true });
  assert.deepEqual(leerFundido('<body data-fundido="contenido" data-cierre="0">'), { fundido: 'contenido', cerrada: false });
  assert.equal(leerFundido('<body>'), null, 'sin modo grabacion no hay nada que leer');
  assert.equal(leerFundido(undefined), null);
});

import { pngEsNegro } from '../../../herramientas/capturar-escena.mjs';
import { deflateSync } from 'node:zlib';

// Un PNG de color solido (RGBA de 8 bits, sin entrelazar, filtro 0) armado a mano: el lector no verifica los CRC, asi que van en cero.
function pngSolido(ancho, alto, [r, g, b, a = 255], filas = null) {
  const fila = Buffer.alloc(1 + ancho * 4);
  for (let x = 0; x < ancho; x++) fila.set([r, g, b, a], 1 + x * 4);
  const crudo = Buffer.concat(Array.from({ length: alto }, (_, y) => (filas?.[y] ?? fila)));
  const trozo = (nombre, cuerpo) => { const t = Buffer.alloc(12 + cuerpo.length); t.writeUInt32BE(cuerpo.length, 0); t.write(nombre, 4, 'ascii'); cuerpo.copy(t, 8); return t; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4); ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), trozo('IHDR', ihdr), trozo('IDAT', deflateSync(crudo)), trozo('IEND', Buffer.alloc(0))]);
}

test('pngEsNegro: una captura toda negra lo es; un solo pixel con contenido o un gris del tapiz ya no; lo que no es un PNG que Chrome escribiria no se juzga como negro', () => {
  assert.equal(pngEsNegro(pngSolido(64, 32, [0, 0, 0])), true);
  assert.equal(pngEsNegro(pngSolido(64, 32, [4, 4, 4])), true, 'el ruido de compresion cuenta como negro');
  assert.equal(pngEsNegro(pngSolido(64, 32, [16, 16, 20])), false, 'el tapiz de la mesa (#101014) no es el negro de la cortina');
  assert.equal(pngEsNegro(pngSolido(64, 32, [0, 0, 0, 0])), true, 'el canal alfa no cuenta');
  const fila = Buffer.alloc(1 + 64 * 4); fila.set([200, 40, 40, 255], 1 + 10 * 4);
  assert.equal(pngEsNegro(pngSolido(64, 32, [0, 0, 0], { 20: fila })), false, 'un pixel rojo en la fila 20');
  for (const basura of [null, undefined, Buffer.alloc(0), Buffer.from('no es un png'), 'x']) assert.equal(pngEsNegro(basura), false);
});

test('pngEsNegro deshace los cinco filtros de PNG (Ninguno, Sub, Up, Promedio y Paeth) sobre una imagen con ruido de hasta 8, y ve un pixel claro escondido bajo cualquiera', () => {
  const ancho = 24, alto = 10, canales = 4, fila = ancho * canales;
  let semilla = 7;
  const azar = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return (semilla >> 8) % 9; };
  const imagen = Buffer.alloc(alto * fila);
  for (let i = 0; i < imagen.length; i++) imagen[i] = i % canales === 3 ? 255 : azar(); // ruido oscuro, alfa opaco
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  // el codificador de referencia de PNG: cada fila con su filtro (`tipos[y % tipos.length]`), restando el predictor
  const codificar = (pixeles, tipos) => Object.fromEntries(Array.from({ length: alto }, (_, y) => {
    const bytes = Buffer.alloc(1 + fila); bytes[0] = tipos[y % tipos.length];
    for (let i = 0; i < fila; i++) {
      const izq = i >= canales ? pixeles[y * fila + i - canales] : 0, arr = y ? pixeles[(y - 1) * fila + i] : 0, arrIzq = y && i >= canales ? pixeles[(y - 1) * fila + i - canales] : 0;
      const predictor = [0, izq, arr, (izq + arr) >> 1, paeth(izq, arr, arrIzq)][bytes[0]];
      bytes[1 + i] = (pixeles[y * fila + i] - predictor) & 255;
    }
    return [y, bytes];
  }));
  const claro = Buffer.from(imagen); claro.set([200, 3, 3], 7 * fila + 13 * canales); // un pixel rojo en la fila 7
  for (const tipos of [[0], [1], [2], [3], [4], [0, 1, 2, 3, 4]]) {
    assert.equal(pngEsNegro(pngSolido(ancho, alto, [0, 0, 0], codificar(imagen, tipos))), true, `ruido oscuro con los filtros ${tipos}`);
    assert.equal(pngEsNegro(pngSolido(ancho, alto, [0, 0, 0], codificar(claro, tipos))), false, `un pixel claro con los filtros ${tipos}`);
  }
  assert.equal(pngEsNegro(pngSolido(ancho, alto, [0, 0, 0], { 3: Buffer.from([7, ...new Uint8Array(fila)]) })), false, 'un filtro que no existe no se juzga como negro');
});

test('pngEsNegro entiende los filtros de PNG (Sub y Up): Chrome comprime con ellos', () => {
  // fila 0 con filtro Sub (1): los bytes son diferencias con el pixel de la izquierda; todo cero = negro. fila 1 con filtro Up (2): diferencias con la fila de arriba.
  const ancho = 8, alto = 2;
  const sub = Buffer.alloc(1 + ancho * 4); sub[0] = 1;
  const up = Buffer.alloc(1 + ancho * 4); up[0] = 2;
  assert.equal(pngEsNegro(pngSolido(ancho, alto, [0, 0, 0], { 0: sub, 1: up })), true);
  const conRojo = Buffer.from(sub); conRojo[1 + 4 * 2] = 200; // en la fila Sub, el pixel 2 suma 200 al rojo y arrastra a los siguientes
  assert.equal(pngEsNegro(pngSolido(ancho, alto, [0, 0, 0], { 0: conRojo, 1: up })), false);
});
