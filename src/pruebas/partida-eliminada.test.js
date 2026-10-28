// Una partida ELIMINADA (decision del usuario del 28-10-2026: Mayor o menor j1, Guerra j2 y Guerra j3 ya no se publican): desaparece de la pagina y de los JSON sin mover los numeros de las
// demas (los enlaces, los paquetes y la carpeta de voz de una partida publicada usan su numero). Su lugar en la serie queda como una marca vacia: nada del juego, ni su seed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { armarSeriePublica, registrarParte, ELIMINADA } from '../publicacion.js';
import { armarMarcador } from '../marcador.js';
import { publicarParte } from '../publicar.js';

const jug = (id) => ({ id, nombre: id.toUpperCase(), color: '#111', inicial: id[0].toUpperCase(), tipo: 'modelo', modelo: `x/${id}` });
const completa = (seed, puntos = [5, 0], ganador = 0) => ({ seed, jugadores: [jug('a'), jug('b')], puntos, ganador, empate: false, turnos: 12, rondas: [{ turno: 1 }, { turno: 2 }], metricas: [{}, {}] });
const crudo = (partidas, extra = {}) => ({ etiqueta: 's1', fecha: '2026-10-21', seedBase: 7, juego: { id: 'dilema', nombre: 'Dilema', categoria: 'Cat' }, prompt: { reglas: 'x-1.0.0' }, serie: { partidas: partidas.length }, evaluacion: { partidas: 1, comentario: [] }, partidas, ...extra });
const REGISTRO_2_PUBLICADA = { partidas: { 1: { estado: ELIMINADA }, 2: { estado: 'publicada', hastaTurno: 2, partes: [{ parte: 1, hastaTurno: 2, final: true, fecha: '2026-10-25' }] } } };

test('la serie publica deja en su lugar una marca vacia: ni seed, ni rondas, ni jugadores de la partida eliminada', () => {
  const serie = armarSeriePublica(crudo([completa(1111), completa(2222)]), REGISTRO_2_PUBLICADA);
  assert.equal(serie.partidas.length, 2, 'el numero de la partida 2 no se mueve');
  assert.deepEqual(serie.partidas[0], { eliminada: true, estadoPublicacion: ELIMINADA, truncada: true, rondas: [] });
  assert.ok(!JSON.stringify(serie.partidas[0]).includes('1111'), 'nada del juego eliminado');
  assert.equal(serie.partidas[1].seed, 2222);
  assert.equal(serie.partidas[1].estadoPublicacion, 'publicada');
});

test('una serie con una partida eliminada y las demas publicadas queda publicada y trae su evaluacion', () => {
  const serie = armarSeriePublica(crudo([completa(1111), completa(2222)]), REGISTRO_2_PUBLICADA);
  assert.equal(serie.publicacion.estado, 'publicada');
  assert.deepEqual(serie.evaluacion, { partidas: 1, comentario: [] });
});

test('si solo hay eliminadas la serie no cuenta como publicada (nada que evaluar)', () => {
  const serie = armarSeriePublica(crudo([completa(1111)]), { partidas: { 1: { estado: ELIMINADA } } });
  assert.notEqual(serie.publicacion.estado, 'publicada');
  assert.equal(serie.evaluacion, undefined);
});

test('el marcador oculta la eliminada: no sale en el detalle ni en la lista del sitio, no cuenta, y la otra conserva su numero', () => {
  const serie = armarSeriePublica(crudo([completa(1111), completa(2222)]), REGISTRO_2_PUBLICADA);
  const m = armarMarcador([{ archivo: 's1.json', ep: serie }], 'ahora');
  const ep = m.episodios[0];
  assert.equal(ep.partidas, 1);
  assert.deepEqual(ep.detalle.map((d) => [d.n, d.seed]), [[2, 2222]]);
  assert.equal(ep.estado, 'publicada');
  assert.deepEqual(m.partidas.map((p) => [p.serie, p.n, p.seed]), [['s1', 2, 2222]]);
  assert.equal(m.juegos[0].tabla.find((f) => f.id === 'a').partidas, 1, 'solo cuenta la que se queda');
  assert.ok(!JSON.stringify(m).includes('1111'), 'el seed de la eliminada no aparece en ningun lado del marcador');
  assert.deepEqual(ep.enfrentamiento, 'A vs B');
});

test('una serie sin ninguna partida vigente desaparece del marcador, y su juego tambien si no tiene mas', () => {
  const serie = armarSeriePublica(crudo([completa(1111)]), { partidas: { 1: { estado: ELIMINADA } } });
  const m = armarMarcador([{ archivo: 's1.json', ep: serie }], 'ahora');
  assert.deepEqual([m.episodios.length, m.partidas.length, m.juegos.length, m.categorias.length], [0, 0, 0, 0]);
});

test('una partida eliminada no se puede volver a publicar: ni por la marca del archivo ni por el registro', () => {
  const raiz = mkdtempSync(join(tmpdir(), 'eliminada-'));
  try {
    mkdirSync(join(raiz, 'data', 'publicas'), { recursive: true });
    writeFileSync(join(raiz, 'data', 'x.json'), JSON.stringify(crudo([{ eliminada: true }, completa(2222)])));
    assert.throws(() => publicarParte({ raiz, archivo: 'x.json', partida: 1, hasta: 2 }), /partida 1.*eliminada/);
    writeFileSync(join(raiz, 'data', 'publicas', 'registro.json'), JSON.stringify({ series: { s1: { partidas: { 2: { estado: ELIMINADA } } } } }));
    assert.throws(() => publicarParte({ raiz, archivo: 'x.json', partida: 2, hasta: 2 }), /partida 2.*eliminada/);
  } finally { rmSync(raiz, { recursive: true, force: true }); }
});

test('la pagina de la partida: pedir una eliminada avisa que ya no se publica; la que se queda se ve igual, sin etiqueta de «hermana»', async () => {
  const { correrPagina, MARCADOR } = await import('./ayudas-sitio.js');
  const publica = armarSeriePublica(crudo([completa(1111), completa(2222)], { juego: { id: 'conquista', nombre: 'Guerra de territorios', categoria: 'Estrategia y conquista' } }), REGISTRO_2_PUBLICADA);
  const pedida = await correrPagina('partida.html', { search: '?id=s1&partida=1', marcador: MARCADOR, publicas: { s1: publica } });
  const html = pedida.nodo('contenido').innerHTML;
  assert.match(html, /Esa partida se eliminó y ya no se publica\./);
  assert.doesNotMatch(html, /1111|2222/, 'no muestra datos de ninguna partida');
  const otra = await correrPagina('partida.html', { search: '?id=s1&partida=2', marcador: MARCADOR, publicas: { s1: publica } });
  const ok = otra.nodo('contenido').innerHTML;
  assert.match(ok, /2222/);
  assert.doesNotMatch(ok, /Partida 2 · mismo seed|Esa partida se eliminó/, 'la eliminada no cuenta como partida hermana');
});

test('registrarParte no revive una partida eliminada', () => {
  assert.throws(() => registrarParte({ series: { s1: { partidas: { 1: { estado: ELIMINADA } } } } }, { etiqueta: 's1', partida: 1, parte: 1, hastaTurno: 3, final: false, fecha: '2026-10-28' }), /eliminada/);
});
