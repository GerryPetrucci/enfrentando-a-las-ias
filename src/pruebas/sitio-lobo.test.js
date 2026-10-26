// Lobo en la aldea en el sitio y las tarjetas de juego en carrusel (26 de octubre de 2026): la conversacion publica de una partida de Lobo, la pagina de la partida, y el carrusel de la portada
// (web/carrusel.js, web/index.html, web/sitio.css). Sin navegador: la pagina corre con los falsos de ayudas-sitio.js.
//
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { correrPagina, MARCADOR } from './ayudas-sitio.js';
import { conversacionDeLobo } from '../../web/casino/conversacion-lobo.js';
import { estadoDelCarrusel, pasoDelCarrusel, montarCarrusel } from '../../web/carrusel.js';
import { unidadDeJuego, resumenDePartida } from '../../web/catalogo.js';
import { partidaParcial, ultimaRonda } from '../publicacion.js';
import { jugarLobo } from './escena/ayudas-lobo.js';

const web = (f) => readFileSync(new URL(`../../web/${f}`, import.meta.url), 'utf8');
const NOMBRES = ['Grok', 'Qwen', 'Mistral', 'MiniMax', 'GLM', 'Kimi', 'Phi-4', 'DeepSeek'];
// Una partida de Lobo de bots de 3 o mas rondas con los modelos de la partida real, publicada «hasta la ronda 2».
const lobo = (() => {
  const p = [3, 4, 5, 6, 7, 8, 9, 10].map((s) => jugarLobo(s, 8, { declaraciones: true })).find((x) => ultimaRonda(x) >= 3);
  return { ...p, juego: { id: 'lobo', nombre: 'Lobo en la aldea' }, jugadores: p.jugadores.map((j, i) => ({ ...j, id: NOMBRES[i].toLowerCase(), nombre: NOMBRES[i], tipo: 'modelo' })) };
})();
const serie = (partida) => ({ etiqueta: 'serie-lobo', fecha: '2026-10-25', seedBase: partida.seed, juego: { id: 'lobo', nombre: 'Lobo en la aldea', categoria: 'Identidad oculta' }, prompt: { reglas: 'lobo-1.2.0', sistema: 'REGLAS' }, partidas: [partida] });

test('la conversacion de Lobo sale de los eventos publicos: mensajes con el nombre de quien habla, votos, muertes y nada de lo privado', () => {
  const parcial = partidaParcial(lobo, 2);
  const rondas = conversacionDeLobo(parcial);
  assert.deepEqual(rondas.map((r) => r.ronda), [1, 2]);
  const hechos = rondas.flatMap((r) => r.hechos);
  assert.ok(hechos.some((h) => h.tipo === 'mensaje' && NOMBRES.includes(h.quien) && h.texto), 'hay mensajes con su autor');
  assert.ok(hechos.some((h) => h.tipo === 'votos' && h.filas.length > 0 && h.filas.every((f) => NOMBRES.includes(f.de) && NOMBRES.includes(f.a))), 'hay votaciones con nombres');
  assert.ok(hechos.some((h) => h.tipo === 'hecho' && /su rol era (Lobo|Vidente|Bruja|Cazador|Cupido|Aldeano)/.test(h.texto)), 'una muerte revela su rol');
  const texto = JSON.stringify(rondas);
  assert.doesNotMatch(texto, /asiento \d|invalidas|privado|camara/i, 'ni numeros de asiento ni campos privados');
  // quienes siguen vivos no tienen rol en ninguna parte
  const muertos = new Set(hechos.filter((h) => h.tipo === 'hecho' && /su rol era/.test(h.texto)).map((h) => NOMBRES.find((n) => h.texto.startsWith(`${n} `))));
  for (const e of parcial.rondas.flatMap((r) => r.publico.eventos)) if (e.tipo === 'muerte') assert.ok(muertos.has(NOMBRES[e.asiento]));
  assert.deepEqual(conversacionDeLobo(null), []);
  assert.deepEqual(conversacionDeLobo({ jugadores: [], rondas: [{ ronda: 1, publico: { eventos: [{ tipo: 'mensaje', asiento: 3, mensaje: 'x' }, null, { tipo: 'raro' }] } }] }), [], 'un registro raro no lanza');
});

test('en la conversacion, un asiento que cita un modelo es el nombre de ese jugador y un mensaje vacio es un silencio', () => {
  const p = structuredClone(partidaParcial(lobo, 1));
  const dia = p.rondas.find((r) => r.fase === 'dia');
  dia.publico.eventos = [
    { ronda: 1, tipo: 'mensaje', asiento: 0, mensaje: 'Voto por el asiento 2 y sospecho del 5.', afirmaRol: 'vidente' },
    { ronda: 1, tipo: 'mensaje', asiento: 1, mensaje: '' },
    { ronda: 1, tipo: 'mensaje', asiento: 3, mensaje: 'Algo', afirmaRol: 'inventado' },
  ];
  const [r] = conversacionDeLobo({ ...p, rondas: [dia] });
  assert.deepEqual(r.hechos[0], { tipo: 'mensaje', asiento: 0, quien: 'Grok', texto: 'Voto por Mistral y sospecho de Kimi.', nota: 'afirma ser Vidente' });
  assert.deepEqual(r.hechos[1], { tipo: 'silencio', asiento: 1, quien: 'Qwen' });
  assert.equal(r.hechos[2].nota, undefined, 'un rol que no existe no se anota');
  const repetidos = conversacionDeLobo({ ...p, jugadores: p.jugadores.map((j, i) => ({ ...j, nombre: i % 2 ? 'Grok' : 'Qwen' })), rondas: [dia] });
  assert.equal(repetidos[0].hechos[0].quien, 'Qwen A');
  assert.equal(repetidos[0].hechos[1].quien, 'Grok A', 'un modelo en varios asientos lleva letra, como en la voz');
});

test('la pagina de una partida de Lobo por publicarse muestra la conversacion por rondas, dice hasta que ronda y no adelanta el resultado', async () => {
  const parcial = partidaParcial(lobo, 2);
  const r = await correrPagina('partida.html', { search: '?id=serie-lobo&partida=1', marcador: MARCADOR, publicas: { 'serie-lobo': serie(parcial) } });
  const html = r.nodo('contenido').innerHTML;
  assert.match(html, /<h1 class="titulo-pagina">Lobo en la aldea<\/h1>/);
  assert.match(html, /Por publicarse/);
  assert.match(html, /hasta la ronda 2/, 'la unidad de Lobo es la ronda, no el turno');
  assert.match(html, /<h3>Ronda 1<\/h3>/);
  assert.match(html, /<h3>Ronda 2<\/h3>/);
  assert.doesNotMatch(html, /<h3>Ronda 3<\/h3>/, 'lo que viene despues no sale');
  assert.match(html, /dice en público/);
  assert.match(html, /votó por/);
  assert.doesNotMatch(html, /Resultado|puesto \d|Turno \d|lo que recibió cada IA/, 'sin resultado ni vocabulario de otro juego');
  assert.doesNotMatch(html, /asiento \d/i);
  assert.equal(r.llamadasMenu[0].juegoId, 'lobo');
});

test('una partida de Lobo ya publicada sigue mostrando su resultado y la conversacion completa', async () => {
  const completa = { ...structuredClone(lobo), estadoPublicacion: 'publicada' };
  const r = await correrPagina('partida.html', { search: '?id=serie-lobo&partida=1', marcador: MARCADOR, publicas: { 'serie-lobo': serie(completa) } });
  const html = r.nodo('contenido').innerHTML;
  assert.match(html, /Resultado/);
  assert.doesNotMatch(html, /no se publican hasta la parte final/, 'ya es la parte final');
  assert.match(html, new RegExp(`<h3>Ronda ${ultimaRonda(lobo)}</h3>`));
});

test('cada juego dice hasta donde se subio con su propia unidad (turno, ronda o mano)', () => {
  assert.equal(unidadDeJuego('conquista').hasta, 'hasta el turno');
  assert.equal(unidadDeJuego('lobo').hasta, 'hasta la ronda');
  assert.equal(unidadDeJuego('dudaapuesta').hasta, 'hasta la mano');
  assert.equal(unidadDeJuego('juego-nuevo').hasta, 'hasta el turno', 'un juego desconocido, «turno» como siempre');
  assert.equal(resumenDePartida({ estado: 'por-publicarse', hastaTurno: 2, juego: { id: 'lobo' } }), 'Por publicarse · subida hasta la ronda 2');
  assert.equal(resumenDePartida({ estado: 'por-publicarse', hastaTurno: 8, juego: { id: 'conquista' } }), 'Por publicarse · subida hasta el turno 8');
  assert.equal(resumenDePartida({ estado: 'por-publicarse', hastaTurno: 8 }), 'Por publicarse · subida hasta el turno 8', 'sin juego tampoco lanza');
  assert.equal(resumenDePartida({ estado: 'por-publicarse' }), 'Por publicarse');
});

test('el carrusel sabe cuando desborda y cuanto avanza una flecha', () => {
  assert.deepEqual(estadoDelCarrusel({ scrollLeft: 0, clientWidth: 748, scrollWidth: 940 }), { desborde: true, alInicio: true, alFinal: false });
  assert.deepEqual(estadoDelCarrusel({ scrollLeft: 192, clientWidth: 748, scrollWidth: 940 }), { desborde: true, alInicio: false, alFinal: true });
  assert.deepEqual(estadoDelCarrusel({ scrollLeft: 0, clientWidth: 1004, scrollWidth: 1004 }), { desborde: false, alInicio: true, alFinal: true }, 'si caben, no hay carrusel');
  assert.equal(estadoDelCarrusel({ scrollLeft: 0, clientWidth: 1000, scrollWidth: 1001.6 }).desborde, false, 'un decimal de diferencia no es desborde');
  assert.deepEqual(estadoDelCarrusel(), { desborde: false, alInicio: true, alFinal: true });
  assert.deepEqual(estadoDelCarrusel({ scrollLeft: 'x', clientWidth: null, scrollWidth: NaN }), { desborde: false, alInicio: true, alFinal: true });
  assert.equal(pasoDelCarrusel({ clientWidth: 748, anchoTarjeta: 300, separacion: 14 }), 636);
  assert.equal(pasoDelCarrusel({ clientWidth: 200, anchoTarjeta: 300, separacion: 14 }), 314, 'como minimo una tarjeta');
  assert.equal(pasoDelCarrusel(), 1);
});

test('montarCarrusel muestra los controles solo cuando desborda, apaga la flecha del extremo y mueve la fila', () => {
  const guardado = Object.fromEntries(['requestAnimationFrame', 'getComputedStyle', 'matchMedia', 'addEventListener', 'removeEventListener'].map((k) => [k, globalThis[k]]));
  Object.assign(globalThis, { requestAnimationFrame: (f) => { f(); return 0; }, getComputedStyle: () => ({ columnGap: '14px' }), matchMedia: () => ({ matches: false }), addEventListener() {}, removeEventListener() {} });
  try {
    const boton = (dir) => ({ dataset: { dir: String(dir) }, disabled: false, addEventListener(_t, f) { this.alPulsar = f; }, removeEventListener() {} });
    const anterior = boton(-1), siguiente = boton(1);
    const pista = { scrollLeft: 0, clientWidth: 748, scrollWidth: 940, saltos: [], scrollBy(o) { this.saltos.push(o); }, addEventListener(_t, f) { this.alDesplazar = f; }, removeEventListener() {}, querySelector: () => ({ offsetWidth: 300 }) };
    const raiz = { dataset: {}, querySelector: (s) => (s === '.carrusel-pista' ? pista : null), querySelectorAll: () => [anterior, siguiente] };
    const c = montarCarrusel(raiz);
    assert.equal(raiz.dataset.desborde, 'si');
    assert.deepEqual([anterior.disabled, siguiente.disabled], [true, false], 'al principio no se puede ir atras');
    siguiente.alPulsar({ currentTarget: siguiente });
    assert.deepEqual(pista.saltos.at(-1), { left: 636, behavior: 'smooth' });
    anterior.alPulsar({ currentTarget: anterior });
    assert.equal(pista.saltos.at(-1).left, -636);
    pista.scrollLeft = 192; pista.alDesplazar();
    assert.deepEqual([anterior.disabled, siguiente.disabled], [false, true], 'al final no se puede seguir');
    pista.scrollWidth = 748; c.actualizar();
    assert.equal(pista.scrollLeft, 0, 'una busqueda nueva vuelve al principio');
    assert.equal(raiz.dataset.desborde, 'no');
    assert.deepEqual([anterior.disabled, siguiente.disabled], [true, true], 'sin desborde no hay nada que mover');
    globalThis.matchMedia = () => ({ matches: true });
    pista.scrollWidth = 940; c.actualizar(); siguiente.alPulsar({ currentTarget: siguiente });
    assert.equal(pista.saltos.at(-1).behavior, 'auto', 'con movimiento reducido no se anima');
    c.soltar();
  } finally { Object.assign(globalThis, guardado); }
  for (const raro of [null, undefined, {}, { querySelector: () => null }]) assert.doesNotThrow(() => montarCarrusel(raro).actualizar());
});

test('la portada pone las tarjetas de juego en un carrusel accesible y el estilo las desliza solo cuando no caben', () => {
  const html = web('index.html'), css = web('sitio.css');
  assert.match(html, /<section class="carrusel" id="carrusel-juegos" data-desborde="no" aria-labelledby="t-juegos">/);
  assert.match(html, /<div class="carrusel-pista" id="juegos" tabindex="0" role="region" aria-label="[^"]+">/, 'la fila es una region con nombre y se puede enfocar para moverla con el teclado');
  assert.equal([...html.matchAll(/class="carrusel-flecha" type="button" data-dir="(-?1)" aria-label="[^"]+" aria-controls="juegos"/g)].map((m) => m[1]).join(), '-1,1', 'dos flechas con nombre');
  assert.match(html, /from '\.\/carrusel\.js\?v=__V__'/);
  assert.doesNotMatch(html, /rejilla tres/, 'la cuadricula fija de 3 columnas ya no existe');
  assert.match(css, /\.carrusel-pista \{[^}]*display:flex[^}]*overflow-x:auto[^}]*scroll-snap-type:x/);
  assert.match(css, /\.carrusel-pista > a\.tarjeta \{[^}]*flex:1 0 min\(300px,82%\)/, 'cada tarjeta pide 300 px (o el 82 % en un telefono, para que se asome la siguiente)');
  assert.match(css, /\.carrusel\[data-desborde="si"\] \.carrusel-controles \{ display:flex; \}/, 'las flechas solo si desborda');
  assert.match(css, /prefers-reduced-motion/);
});

test('todas las paginas son responsivas: viewport del dispositivo, sin anchos fijos mayores que la pantalla y con el contenido que puede desbordar dentro de su propio desplazamiento', () => {
  for (const f of ['index.html', 'juego.html', 'partida.html', 'metodo.html', 'proponer.html']) assert.match(web(f), /<meta name="viewport" content="width=device-width, initial-scale=1(, viewport-fit=cover)?">/, f);
  const css = web('sitio.css');
  assert.match(css, /\* \{ box-sizing:border-box; \}/);
  assert.match(css, /body \{[^}]*overflow-wrap:anywhere/, 'un seed o una direccion largos no ensanchan la pagina');
  assert.match(css, /img \{ max-width:100%; height:auto; \}/);
  assert.match(css, /\.tabla-envoltura \{ overflow-x:auto/, 'las tablas se desplazan dentro de su caja');
  assert.match(css, /pre\.prompt \{[^}]*overflow:auto/, 'los prompts largos se desplazan dentro de su caja');
  // lo unico con ancho minimo mayor que un telefono chico es la tabla (dentro de su caja que se desplaza)
  const minimos = [...css.matchAll(/(?<!\()min-width:(\d+)px/g)].map((m) => Number(m[1])).filter((n) => n > 320);
  assert.deepEqual(minimos, [420], 'solo table { min-width:420px }, que vive dentro de .tabla-envoltura');
});
