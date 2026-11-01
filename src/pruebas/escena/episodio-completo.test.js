// La pieza «episodio completo» del paquete (decidida el 31-10-2026): el juego entero de corrido, una sola grabacion de principio a fin, para subirlo AL FINAL y pasado un tiempo (cuenta el
// resultado, asi que su titulo y su descripcion pueden tener spoilers). Vive en el mismo paquete y en el mismo LEEME que las demas piezas. Partidas REALES jugadas por bots; sin DOM, sin red y sin API.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { construirPaquete } from '../../../web/casino/paquete-textos.js';
import { armarLinea, destacadasDe } from '../../../web/casino/lineas.js';
import { dividirEnDos, direccionDeGrabacion, leerParametros, planDeGrabacion } from '../../../web/casino/escena-config.js';
import { conIdentificador, IDENTIFICADOR_MS } from '../../../web/casino/gancho.js';
import { ordenDePublicacion, identificadorDePieza, MAX_TITULO, MAX_DESCRIPCION } from '../../../web/casino/editorial-paquete.js';
import { claveDeCierre, duracionDeCierre } from '../../../web/casino/cierre.js';
import { abreviarPieza, nombreDePieza } from '../../../herramientas/nombres.mjs';
import { leemeDe, escribirPaquete, guionDePaquete } from '../../../herramientas/paquete.mjs';
import { jugar as jugarDuda } from './ayudas.js';
import { jugarTD } from './ayudas-td.js';
import { jugarFuga } from './ayudas-fuga.js';
import { jugarConqBots, ESCENARIOS } from './ayudas-conq.js';

const ENLACE = 'https://gerrypetrucci.github.io/enfrentando-a-las-ias/';
const SERIE = 'grabaciones/listos/juego/2026-10-31_seed-1';
const PARTIDAS = { dudaapuesta: await jugarDuda(1), tripledado: await jugarTD(1), fuga: await jugarFuga(1), conquista: await jugarConqBots(ESCENARIOS[0].seed, ESCENARIOS[0].bots) };
const params = (url) => Object.fromEntries(new URL(url, 'http://x/').searchParams);

async function paqueteDe(id, extra = {}) {
  const partida = PARTIDAS[id], beats = await armarLinea(id, partida), destacadas = await destacadasDe(id, partida, 10);
  return { partida, beats, paquete: construirPaquete({ partida, beats, destacadas, archivo: `pruebas/${id}.json`, partidaNumero: 1, juegoNumero: 3, enlace: ENLACE, ...extra }) };
}

test('el nombre del episodio completo: ep (j1_ep), como pt, clp y hk para las otras piezas', () => {
  assert.equal(abreviarPieza('episodio-completo'), 'ep');
  assert.equal(nombreDePieza({ juego: 1, pieza: 'episodio-completo' }), 'j1_ep');
  assert.equal(abreviarPieza('parte-1'), 'pt1', 'las demas siguen igual');
});

test('el episodio completo se sube al final: despues de la parte 2 y de sus clips, en cualquier orden de entrada', () => {
  const pieza = (id, tipo, parte, desde) => ({ id, tipo, parte, grabar: { desde, hasta: desde } });
  const esperado = ['gancho-1', 'parte-1', 'clip-1', 'gancho-2', 'parte-2', 'clip-2', 'episodio-completo'];
  const piezas = [pieza('episodio-completo', 'episodio', null, 1), pieza('clip-2', 'clip', 2, 7), pieza('parte-2', 'parte', 2, 5), pieza('gancho-2', 'gancho', 2, null),
    pieza('clip-1', 'clip', 1, 2), pieza('parte-1', 'parte', 1, 1), pieza('gancho-1', 'gancho', 1, null)];
  assert.deepEqual(ordenDePublicacion(piezas).map((p) => p.id), esperado);
  assert.deepEqual(ordenDePublicacion([...piezas].reverse()).map((p) => p.id), esperado);
});

test('el titulo y la descripcion del episodio empiezan como los de todas las piezas: juego, jN, la pieza y el seed', () => {
  assert.equal(identificadorDePieza({ id: 'episodio-completo', tipo: 'episodio', parte: null }, { juego: 'Guerra de territorios', juegoNumero: 3, seed: 1704202488 }), 'Guerra de territorios J3 - Episodio completo - Seed 1704202488');
  assert.equal(identificadorDePieza({ id: 'parte-1', tipo: 'parte', parte: 1 }, { juego: 'Guerra de territorios', juegoNumero: 3, seed: 7 }), 'Guerra de territorios J3 - Parte 1/2 - Seed 7', 'las demas siguen igual');
});

test('la direccion del episodio lleva episodio=1 (y ni parte, ni de, ni clip); la pagina la lee y una direccion de parte no es un episodio', () => {
  const url = direccionDeGrabacion({ archivo: 'pruebas/x.json', desde: 1, hasta: 9, cierre: 'final', juegoNumero: 3, episodio: true });
  assert.deepEqual([params(url).episodio, params(url).numero, params(url).cierre, params(url).parte, params(url).de, params(url).clip], ['1', '3', 'final', undefined, undefined, undefined]);
  assert.deepEqual(leerParametros(new URL(url, 'http://x/').search).pieza, { parte: null, de: null, clip: null, episodio: true });
  const parte = direccionDeGrabacion({ archivo: 'pruebas/x.json', desde: 1, hasta: 4, cierre: 'parte', juegoNumero: 3, parte: 1, de: 2 });
  assert.equal(params(parte).episodio, undefined);
  assert.deepEqual(leerParametros(new URL(parte, 'http://x/').search).pieza, { parte: 1, de: 2, clip: null, episodio: false });
});

test('la tarjeta que abre el episodio dice «Juego N» y «Episodio completo», sin «Parte M de K»', async () => {
  const beats = await armarLinea('dudaapuesta', PARTIDAS.dudaapuesta);
  const tarjeta = conIdentificador(beats, { juegoId: 'dudaapuesta', juegoNumero: 3, episodio: true })[0].pasos[0];
  assert.equal(tarjeta.kicker, 'Juego 3');
  assert.equal(tarjeta.detalle, 'Episodio completo');
  assert.equal(conIdentificador(beats, { juegoId: 'dudaapuesta', juegoNumero: 3, parte: 1, de: 2 })[0].pasos[0].detalle, 'Parte 1 de 2', 'una parte sigue diciendo su parte');
});

test('cada juego trae UN episodio completo: toda la partida de corrido, con la tarjeta de identificacion y el cierre de final, y es lo ultimo que se publica', async () => {
  for (const id of Object.keys(PARTIDAS)) {
    const { partida, beats, paquete } = await paqueteDe(id);
    const episodios = paquete.piezas.filter((p) => p.tipo === 'episodio');
    assert.equal(episodios.length, 1, `${id}: una sola pieza de episodio`);
    const [e] = episodios, d = dividirEnDos(beats);
    assert.equal(e.id, 'episodio-completo');
    assert.equal(e.cierre, 'final');
    assert.deepEqual([e.grabar.desde, e.grabar.hasta], [d.parte1.mano, d.parte2.hasta], `${id}: de la primera a la ultima unidad`);
    const cierre = duracionDeCierre(claveDeCierre({ seed: partida.seed, partida: 1, desde: e.grabar.desde, hasta: e.grabar.hasta }), null, 'final');
    assert.equal(e.grabar.ms, d.parte1.ms + d.parte2.ms + IDENTIFICADOR_MS + cierre, `${id}: lo que dura es las dos partes, la tarjeta del inicio y el cierre`);
    assert.deepEqual(e.grabar.plan, planDeGrabacion(e.grabar.ms), `${id}: el plan de la grabacion sale de lo que dura`);
    const q = params(e.grabar.url);
    assert.deepEqual([q.archivo, q.partida, q.ronda, q.hasta, q.formato, q.auto, q.limpio, q.grabar, q.cierre, q.numero, q.episodio], [`pruebas/${id}.json`, '1', String(e.grabar.desde), String(e.grabar.hasta), 'hoja', '1', '1', '1', 'final', '3', '1'], id);
    assert.deepEqual([q.parte, q.de, q.clip, q.gancho], [undefined, undefined, undefined, undefined], `${id}: no es una parte, ni un clip, ni un gancho`);
    assert.equal(paquete.ordenPublicacion.at(-1), 'episodio-completo', `${id}: se sube al final`);
    assert.ok(paquete.piezas.filter((p) => p.tipo === 'parte').length === 2, `${id}: las dos partes siguen ahi`);
  }
});

test('el texto del episodio cubre todo el juego y SI cuenta el resultado (es lo ultimo que se sube); respeta el identificador, los topes y los hashtags de siempre', async () => {
  for (const id of Object.keys(PARTIDAS)) {
    const { partida, paquete } = await paqueteDe(id);
    const e = paquete.piezas.find((p) => p.tipo === 'episodio'), { titulo, descripcion } = e.publicacion;
    const empiezaIgual = `${e.titulo.split(' · ')[0]} J3 - Episodio completo - Seed ${partida.seed}`;
    assert.ok(titulo.startsWith(empiezaIgual), `${id}: ${titulo}`);
    assert.ok(descripcion.startsWith(empiezaIgual), `${id}: ${descripcion}`);
    assert.ok(titulo.length <= MAX_TITULO && descripcion.length <= MAX_DESCRIPCION, `${id}: ${titulo.length} y ${descripcion.length}`);
    const ultima = descripcion.split('\n').at(-1);
    assert.match(ultima, /^#IAvsIA( #\S+){0,4}$/, `${id}: hashtags en la ultima linea`);
    assert.match(descripcion, /gan[óo]|empat/i, `${id}: la descripcion cuenta el resultado`);
    assert.ok(!/Parte \d/.test(`${titulo}\n${descripcion}`), `${id}: no habla de partes`);
    assert.ok(e.comentarioFijado, `${id}: lleva el comentario fijado, como las partes`);
  }
  // el de las partes no cambia: la parte 1 no cuenta nada y los clips tampoco
  const { paquete } = await paqueteDe('conquista');
  assert.ok(!/gan[óo]|empat/i.test(paquete.piezas.find((p) => p.id === 'parte-1').publicacion.descripcion));
});

test('el LEEME es el mismo y agrega, al final, la seccion del episodio completo: direccion, nombre j1_ep.mkv, carpeta, recorte, texto y aviso de que se sube pasado un tiempo', async () => {
  const { paquete } = await paqueteDe('dudaapuesta');
  const texto = leemeDe(paquete, { archivo: 'pruebas/dudaapuesta.json', partidaNumero: 1, juegoNumero: 1, enlace: ENLACE, carpetaSerie: SERIE });
  const seccion = texto.indexOf('### episodio-completo');
  assert.ok(seccion > 0, 'hay una seccion para el episodio completo');
  for (const otra of paquete.piezas.filter((p) => p.tipo !== 'episodio' && p.tipo !== 'gancho-imagen')) assert.ok(texto.indexOf(`### ${otra.id}`) < seccion, `${otra.id} va antes`);
  const delEpisodio = texto.slice(seccion);
  const e = paquete.piezas.find((p) => p.tipo === 'episodio');
  assert.ok(delEpisodio.includes(`http://localhost:4321/${e.grabar.url}`), 'trae la direccion exacta');
  assert.match(delEpisodio, /```text\n\s*j1_ep\.mkv\n\s*```/, 'el nombre al que se renombra, en un bloque de codigo');
  assert.match(delEpisodio, /node herramientas\/recortar-formatos\.mjs "grabaciones\/listos\/juego\/2026-10-31_seed-1\/originales\/j1\/j1_ep\.mkv" j1_ep "--carpeta=grabaciones\/listos\/juego\/2026-10-31_seed-1\/por-subir\/j1" --audio-separado/);
  assert.match(delEpisodio, /textos\/episodio-completo\.txt/);
  assert.match(delEpisodio, /resultado/i, 'avisa que cuenta el resultado');
  assert.match(delEpisodio, /pasado un tiempo|más adelante/i, 'avisa que se sube despues');
  const resumen = texto.slice(texto.indexOf('## Resumen rápido'), texto.indexOf('## Paso 0'));
  assert.match(resumen, /j1_ep\.mkv/, 'entra en el resumen rapido');
  assert.match(resumen, /recortar-formatos\.mjs "[^"]*j1_ep\.mkv" j1_ep /, 'y su comando de recorte tambien');
  assert.match(texto, /Orden de subida:[^\n]*episodio completo/i, 'el orden de subida lo menciona al final');
});

test('escribirPaquete deja textos/episodio-completo.txt y paquete.json lo lista; al regenerar sin la pieza, su texto se aparta', async () => {
  const { paquete, beats, partida } = await paqueteDe('tripledado');
  const tmp = mkdtempSync(join(tmpdir(), 'episodio-'));
  try {
    const carpeta = join(tmp, 'p');
    escribirPaquete(paquete, carpeta, { archivo: 'pruebas/tripledado.json', partidaNumero: 1, juegoNumero: 3, enlace: ENLACE });
    const e = paquete.piezas.find((p) => p.tipo === 'episodio');
    assert.equal(readFileSync(join(carpeta, 'textos', 'episodio-completo.txt'), 'utf8'), `TÍTULO\n${e.publicacion.titulo}\n\nDESCRIPCIÓN\n${e.publicacion.descripcion}\n\nCOMENTARIO FIJADO\n${e.comentarioFijado}\n`);
    const json = JSON.parse(readFileSync(join(carpeta, 'paquete.json'), 'utf8'));
    assert.deepEqual(json.piezas.find((p) => p.id === 'episodio-completo'), { id: 'episodio-completo', tipo: 'episodio', desde: e.grabar.desde, hasta: e.grabar.hasta });
    assert.equal(json.ordenPublicacion.at(-1), 'episodio-completo');
    assert.match(guionDePaquete(paquete, beats, { seed: partida.seed, partidaNumero: 1 }), /## episodio-completo · /);
    const sinEpisodio = { ...paquete, piezas: paquete.piezas.filter((p) => p.tipo !== 'episodio') };
    escribirPaquete(sinEpisodio, carpeta, { archivo: 'pruebas/tripledado.json', partidaNumero: 1, juegoNumero: 3, enlace: ENLACE });
    assert.ok(!readdirSync(join(carpeta, 'textos')).includes('episodio-completo.txt'), 'el texto viejo ya no esta entre los vigentes');
    assert.ok(readdirSync(join(carpeta, 'textos', 'anteriores')).some((n) => n.endsWith('episodio-completo.txt')), 'quedo en anteriores/');
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
