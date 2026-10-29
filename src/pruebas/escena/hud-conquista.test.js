// Lo que la escena de Guerra de territorios deja PUESTO en pantalla (el HUD, el zoom del mapa y lo que se apaga: tarjetas, feed y subtitulos) no depende de ninguna animacion del navegador.
//
// Los dos fallos que se corrigen (grabaciones de Guerra j3 en OBS, 28 de octubre de 2026; OBS 33 con Chromium 150 y aceleracion por hardware, 4K):
//   1. 18-31-06: despues del zoom de la 2.ª batalla del turno 6 el HUD (cabecera con la marca y el turno, aviso de IA, marcador), el feed y los subtitulos desaparecieron ~27 s (4:12-4:39), otra vez de 4:51 a 5:17 y al final.
//   2. 19-31-37: con el HUD ya arreglado, al terminar el zoom el mapa se quedo con el zoom puesto y sin recorte, cubriendo toda la hoja.
// En los dos el DOM estaba bien (se midio en una reproduccion en tiempo real) y en un Chrome de escritorio a 4K se pintaba bien: una animacion de Web Animations (fill:'forwards') cancelada dejaba su valor viejo en
// el compositor de OBS. En los otros juegos no se nota porque el valor viejo coincide con el final; en Guerra no (el HUD debe volver a 1, el mapa a escala 1). Por eso aqui el estado final es siempre el estilo en linea
// y los fundidos y el zoom los mueve el animador de requestAnimationFrame (animador-estilo.js), sin Web Animations con fill ni transiciones de CSS.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Mesa } from '../../../web/casino/mesa-conquista.js';
import { crearAnimador } from '../../../web/casino/animador-estilo.js';

globalThis.getComputedStyle = (n) => ({ opacity: String(n.style.opacity === undefined || n.style.opacity === '' ? 1 : n.style.opacity) }); // lo que el navegador diria de un nodo sin hoja de estilos
const HUD = ['cabecera', 'etiqueta', 'cMarcador'];
const op = (n) => (n.style.opacity === undefined || n.style.opacity === '' ? 1 : Number(n.style.opacity));

function nodo() {
  const n = { animaciones: [], clases: new Set(), style: {}, dataset: {}, animate(frames, opciones) { n.animaciones.push({ frames, opciones }); return { cancel() {}, finished: Promise.resolve() }; }, getAnimations() { return []; } };
  n.classList = { add: (c) => n.clases.add(c), remove: (c) => n.clases.delete(c), contains: (c) => n.clases.has(c) };
  return n;
}
function relojFalso() {
  let t = 0, sig = 1; const cola = new Map();
  return { ahora: () => t, raf: (f) => { const id = sig++; cola.set(id, f); return id; }, cancelarRaf: (id) => cola.delete(id), tic(ms) { t += ms; const hoy = [...cola.values()]; cola.clear(); for (const f of hoy) f(t); } };
}
// Una mesa de Guerra de verdad (sus metodos reales) sin DOM: solo los nodos que esos metodos tocan.
function mesaFalsa({ rapido = false, vel = 1 } = {}) {
  const m = Object.create(Mesa.prototype), reloj = relojFalso();
  Object.assign(m, { rapido, vel, formato: '16x9', L: { ancho: 1920, alto: 1080, zoomVentana: { x: 0, y: 0, ancho: 1920, alto: 700 } }, enCinematica: false, feedPendiente: null, feedTimer: null, avisos: [], zoomVisto: undefined });
  m.animador = crearAnimador(reloj);
  m.reloj = reloj;
  for (const k of ['raiz', ...HUD, 'feedEl', 'subtitulos', 'flashEl', 'cartelEl', 'tarjetaEl', 'vsEl', 'finalEl', 'vela', 'mapaZoom', 'mapaMarco']) m[k] = nodo();
  m.cancelarFeedCola = () => {}; m.agregarFeed = (l) => m.avisos.push(l);
  return m;
}
const correr = (m, ms = 1000, paso = 16) => { for (let t = 0; t < ms; t += paso) m.reloj.tic(paso); };
const animacionesDeNodos = (m) => Object.values(m).filter((v) => v && typeof v === 'object' && Array.isArray(v.animaciones)).reduce((n, v) => n + v.animaciones.length, 0);
const escala = (m) => { const x = /scale\(([\d.]+)\)/.exec(m.mapaZoom.style.transform ?? ''); return m.mapaZoom.style.transform === 'none' ? 1 : x ? Number(x[1]) : NaN; };
const DESTINO = { x: 900, y: 500 };

// ---------- el HUD ----------
test('ocultar el HUD para el zoom: pone la clase del zoom y lo desvanece con el animador hasta opacidad 0 EXACTA; sin animate() de ningun tipo', () => {
  const m = mesaFalsa();
  m.ocultarUIDeMapa();
  assert.ok(m.raiz.clases.has('cinematica-conq')); assert.equal(m.enCinematica, true);
  correr(m, 400);
  for (const k of HUD) assert.equal(op(m[k]), 0, `${k} invisible`);
  assert.equal(animacionesDeNodos(m), 0, 'ninguna animacion del navegador');
});

test('restaurar el HUD (fin del zoom) lo devuelve a opacidad 1 EXACTA sin animate(); restaurar al instante (cambio de beat) lo deja en 1 ya, y a mitad de un fundido arranca desde donde iba', () => {
  const m = mesaFalsa();
  m.ocultarUIDeMapa(); correr(m, 400);
  m.restaurarUIDeMapa(); correr(m, 400);
  for (const k of HUD) assert.equal(op(m[k]), 1, `${k} visible`);
  assert.equal(m.raiz.clases.has('cinematica-conq'), false);
  const n = mesaFalsa();
  n.ocultarUIDeMapa(); correr(n, 400);
  n.restaurarUIDeMapaInstante();
  for (const k of HUD) assert.equal(op(n[k]), 1, `${k} al instante`);
  correr(n, 1000); for (const k of HUD) assert.equal(op(n[k]), 1, `${k} sigue en 1: ningun fundido pendiente lo vuelve a apagar`);
  const p = mesaFalsa();
  p.ocultarUIDeMapa(); p.reloj.tic(16); p.reloj.tic(100); const medio = op(p.cabecera);
  assert.ok(medio > 0 && medio < 1, 'a mitad del fundido');
  p.restaurarUIDeMapa(); const arranque = op(p.cabecera);
  assert.ok(Math.abs(arranque - medio) < 0.05, 'vuelve a subir desde donde iba, sin saltar');
  correr(p, 400); assert.equal(op(p.cabecera), 1);
  assert.equal(animacionesDeNodos(n) + animacionesDeNodos(p) + animacionesDeNodos(m), 0);
});

test('con la escena en modo rapido (capturas) el HUD se apaga y se enciende en el acto', () => {
  const m = mesaFalsa({ rapido: true });
  m.ocultarUIDeMapa(); for (const k of HUD) assert.equal(op(m[k]), 0);
  m.restaurarUIDeMapa(); for (const k of HUD) assert.equal(op(m[k]), 1);
});

test('el feed y los subtitulos quedan apagados (opacidad 0 en linea) al ocultar y siguen apagados al restaurar; el feed que quedo pendiente se pinta', () => {
  const m = mesaFalsa();
  m.feedPendiente = [{ icono: 'espada', partes: ['x'] }];
  m.ocultarUIDeMapa();
  for (const k of ['feedEl', 'subtitulos']) assert.equal(op(m[k]), 0, `${k} apagado`);
  m.restaurarUIDeMapa(); correr(m, 400);
  for (const k of ['feedEl', 'subtitulos']) assert.equal(op(m[k]), 0, `${k} sigue apagado hasta que mostrarFeed / aparecerSubtitulos lo enciendan`);
  assert.equal(m.avisos.length, 1);
});

// ---------- el zoom del mapa ----------
test('aplicar el zoom: el mapa crece de escala 1 a la del zoom y SE QUEDA exactamente ahi (transform en linea, recorte de la ventana puesto), sin animate()', () => {
  const m = mesaFalsa();
  m.aplicarZoom(DESTINO, 3);
  assert.match(m.mapaMarco.style.clipPath, /^inset\(/);
  assert.equal(m.mapaZoom.style.transformOrigin, '0 0');
  const vistas = []; for (let i = 0; i < 60; i++) { m.reloj.tic(16); vistas.push(escala(m)); }
  assert.ok(vistas.every((v, i) => i === 0 || v >= vistas[i - 1]), 'crece sin retroceder');
  assert.equal(m.mapaZoom.style.transform, m.transformDeZoom(DESTINO, 3), 'termina exactamente en el destino');
  assert.equal(animacionesDeNodos(m), 0);
});

test('quitar el zoom: baja hasta transform none y recorte none EXACTOS; el recorte se quita al FINAL (no antes), y sin zoom puesto no hace nada raro', () => {
  const m = mesaFalsa();
  m.aplicarZoom(DESTINO, 3); correr(m, 1000);
  m.quitarZoomMapa();
  m.reloj.tic(16); m.reloj.tic(100);
  assert.ok(escala(m) < 3 && escala(m) > 1, 'a mitad de la vuelta');
  assert.match(m.mapaMarco.style.clipPath, /^inset\(/, 'el recorte sigue puesto mientras baja');
  correr(m, 1000);
  assert.equal(m.mapaZoom.style.transform, 'none'); assert.equal(m.mapaMarco.style.clipPath, 'none');
  const q = mesaFalsa(); q.quitarZoomMapa();
  assert.equal(q.mapaZoom.style.transform, 'none'); assert.equal(q.mapaMarco.style.clipPath, 'none');
  assert.equal(animacionesDeNodos(m) + animacionesDeNodos(q), 0);
});

test('restablecer el zoom al instante (cambio de beat) lo deja en none YA y ningun cuadro pendiente lo vuelve a poner; quitar a mitad de la subida arranca de la escala que llevaba', () => {
  const m = mesaFalsa();
  m.aplicarZoom(DESTINO, 3); m.reloj.tic(16); m.reloj.tic(200);
  m.restablecerZoomInstante();
  assert.equal(m.mapaZoom.style.transform, 'none'); assert.equal(m.mapaMarco.style.clipPath, 'none');
  correr(m, 2000);
  assert.equal(m.mapaZoom.style.transform, 'none', 'el zoom no resucita'); assert.equal(m.mapaMarco.style.clipPath, 'none');
  const n = mesaFalsa();
  n.aplicarZoom(DESTINO, 3); n.reloj.tic(16); n.reloj.tic(200);
  const llevaba = escala(n); assert.ok(llevaba > 1 && llevaba < 3);
  n.quitarZoomMapa(); n.reloj.tic(16);
  assert.ok(escala(n) <= llevaba + 0.05, 'baja desde donde iba, sin saltar al zoom completo');
  correr(n, 1000); assert.equal(n.mapaZoom.style.transform, 'none');
});

test('con la escena en modo rapido el zoom se pone y se quita en el acto', () => {
  const m = mesaFalsa({ rapido: true });
  m.aplicarZoom(DESTINO, 3); assert.equal(m.mapaZoom.style.transform, m.transformDeZoom(DESTINO, 3));
  m.quitarZoomMapa(); assert.equal(m.mapaZoom.style.transform, 'none'); assert.equal(m.mapaMarco.style.clipPath, 'none');
});

test('propiedad: cualquier secuencia de zooms, vueltas, reinicios de beat y cuadros termina EXACTAMENTE en lo que pidio la ultima orden, y tras un reinicio nada resucita el zoom', () => {
  let semilla = 5; const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
  for (let ronda = 0; ronda < 60; ronda++) {
    const m = mesaFalsa(); let ultima = 'inicio';
    for (let i = 0; i < 50; i++) {
      const op_ = ['aplicar', 'quitar', 'restablecer', 'cuadros', 'cuadros'][Math.floor(azar() * 5)];
      if (op_ === 'aplicar') { m.aplicarZoom(DESTINO, 2 + Math.floor(azar() * 2)); ultima = 'aplicar'; }
      else if (op_ === 'quitar') { m.quitarZoomMapa(); ultima = 'quitar'; }
      else if (op_ === 'restablecer') { m.restablecerZoomInstante(); ultima = 'restablecer'; assert.equal(m.mapaZoom.style.transform, 'none'); }
      else m.reloj.tic(8 + Math.floor(azar() * 120));
      if (ultima === 'restablecer') assert.equal(m.mapaZoom.style.transform, 'none', 'tras un reinicio el zoom no resucita con los cuadros siguientes');
    }
    m.reloj.tic(5000);
    if (ultima === 'aplicar') assert.notEqual(m.mapaZoom.style.transform, 'none', 'termino con el zoom puesto');
    else if (ultima !== 'inicio') { assert.equal(m.mapaZoom.style.transform, 'none'); assert.equal(m.mapaMarco.style.clipPath, 'none'); }
    assert.equal(animacionesDeNodos(m), 0);
  }
});

// ---------- lo que se apaga: tarjetas, feed y subtitulos ----------
test('apagar una tarjeta baja su opacidad a 0 EXACTA con el animador; mostrarla a mitad de la bajada la deja encendida (nada pendiente la vuelve a apagar)', () => {
  const m = mesaFalsa();
  m.ocultar(m.tarjetaEl); m.reloj.tic(16); m.reloj.tic(100);
  assert.ok(op(m.tarjetaEl) > 0 && op(m.tarjetaEl) < 1, 'a mitad de la bajada');
  correr(m, 500); assert.equal(op(m.tarjetaEl), 0);
  m.mostrar(m.tarjetaEl, 400); assert.equal(op(m.tarjetaEl), 1);
  m.ocultar(m.vsEl); m.reloj.tic(16); m.reloj.tic(100); m.mostrar(m.vsEl, 400);
  correr(m, 1000); assert.equal(op(m.vsEl), 1, 'encendida a mitad de la bajada: queda encendida');
  m.cartelEl.style.opacity = 0; m.ocultar(m.cartelEl); assert.equal(op(m.cartelEl), 0, 'una tarjeta que ya estaba invisible se queda en 0 en el acto');
  m.reloj.tic(16); assert.equal(m.animador.activas(), 0, 'y no deja ningun fundido pendiente');
  for (const a of [m.tarjetaEl, m.vsEl, m.cartelEl]) assert.ok(a.animaciones.every((x) => !('fill' in x.opciones)), 'las animaciones que quedan (mostrar) no llevan fill');
});

test('el feed y los subtitulos se apagan solos con el animador (opacidad 0 exacta) y encenderlos a mitad del fundido los deja encendidos', () => {
  const m = mesaFalsa();
  m.feedEl.style.opacity = 1; m.subtitulos.style.opacity = 1;
  m.apagarFeed(); m.reloj.tic(16); m.reloj.tic(100);
  assert.ok(op(m.feedEl) < 1 && op(m.feedEl) > 0);
  correr(m, 2000); assert.equal(op(m.feedEl), 0); assert.equal(op(m.subtitulos), 0); assert.equal(m.feedEl.dataset.feed, 'oculto');
  m.feedEl.style.opacity = 1; m.subtitulos.style.opacity = 1;
  m.apagarSubtitulos(); m.reloj.tic(16); m.reloj.tic(60);
  m.subtitulos.innerHTML = 'hola'; m.aparecerSubtitulos(2000); // formato 16x9: no toca nada
  m.formato = '9x16'; m.apagarSubtitulos(); m.reloj.tic(16); m.reloj.tic(60); m.aparecerSubtitulos(2000);
  correr(m, 600); assert.equal(op(m.subtitulos), 1, 'si vuelven a pedir el subtitulo, no se apaga por un fundido viejo');
  assert.equal(animacionesDeNodos(m) <= 1, true, 'solo la entrada del subtitulo (sin fill) usa animate()');
});

// ---------- el codigo ----------
test('mesa-conquista.js no pide ningun fill (forwards/both) en sus animaciones y el CSS ya no anima el HUD: lo que queda puesto lo escribe el animador', () => {
  const sinComentarios = (t) => t.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
  const js = sinComentarios(readFileSync(new URL('../../../web/casino/mesa-conquista.js', import.meta.url), 'utf8'));
  assert.doesNotMatch(js, /fill\s*:/, 'ninguna animacion con fill');
  assert.doesNotMatch(js, /onfinish/, 'nada depende del evento de fin de una animacion del navegador');
  assert.match(js, /from '\.\/animador-estilo\.js'/);
  const css = sinComentarios(readFileSync(new URL('../../../web/casino/mesa-conquista.css', import.meta.url), 'utf8'));
  assert.doesNotMatch(css, /transition\s*:[^;}]*(opacity|transform|all)/, 'sin transiciones de CSS de opacidad ni de transform en la escena de Guerra (la barra de fuerzas de la tarjeta usa flex-grow: no cuenta)');
  assert.doesNotMatch(css, /cinematica-conq[^{]*\.(cabecera|etiqueta-ia)|cinematica-conq[^{]*l-marcador/, 'el HUD no se apaga por CSS: lo apaga el animador');
});
