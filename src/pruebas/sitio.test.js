// La portada del sitio (web/index.html) lista las series con su estado y pinta el marcador por juego. Se prueba sin navegador: se extrae su script y se corre con un
// `document`, un `location`, un `history` y un `fetch` falsos. Lo que importa: una serie «por publicarse» muestra su seed pero ningun resultado, el marcador es por juego
// (nunca un ranking general) y el seed de la direccion filtra la lista.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as catalogo from '../../web/catalogo.js';

const html = readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8');
const codigo = /<script type="module">([\s\S]*?)<\/script>/.exec(html)[1].replace(/^import .*$/m, '');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function pintar(marcador, search = '') {
  const nodos = new Map();
  const nodo = (id) => {
    if (!nodos.has(id)) nodos.set(id, { innerHTML: '', textContent: '', value: '', addEventListener() {}, insertAdjacentHTML(_donde, h) { this.innerHTML += h; } });
    return nodos.get(id);
  };
  const document = { getElementById: nodo };
  const location = { search, pathname: '/', hash: '' };
  const history = { replaceState() {} };
  const fetch = async () => { if (marcador === null) throw new Error('sin red'); return { json: async () => marcador }; };
  await new AsyncFunction('document', 'location', 'history', 'fetch', ...Object.keys(catalogo), codigo)(document, location, history, fetch, ...Object.values(catalogo));
  return nodo;
}

const jugadores = [{ id: 'claude', nombre: 'Claude', color: '#D97757', inicial: 'C' }, { id: 'gpt', nombre: 'GPT', color: '#ffffff', inicial: 'G' }];
const pendiente = {
  etiqueta: 'serie-a', archivo: 'serie-a.json', fecha: '2026-10-19', juego: { id: 'conquista', nombre: 'Guerra de territorios' }, seedBase: 552912962, partidas: 2, estado: 'por-publicarse',
  versionReglas: 'conquista-1.1.0', modo: 'pago', jugadores,
  detalle: [{ n: 1, seed: 552912962, estado: 'por-publicarse', hastaTurno: 8 }, { n: 2, seed: 552912962, estado: 'por-publicarse', hastaTurno: 0 }],
};
const publicada = {
  etiqueta: 'serie-b', archivo: 'serie-b.json', fecha: '2026-10-12', juego: { id: 'mayormenor', nombre: 'Mayor o menor' }, seedBase: 2991144164, partidas: 1, estado: 'publicada',
  versionReglas: 'mayormenor-1.0.0', jugadores, detalle: [{ n: 1, seed: 2991144164, estado: 'publicada', ganador: 'GPT' }],
};
const marcador = {
  generado: '2026-10-19T12:00:00.000Z',
  juegos: [
    { id: 'conquista', nombre: 'Guerra de territorios', categoria: 'Estrategia y conquista', versionReglas: 'conquista-1.1.0', tabla: [] },
    { id: 'mayormenor', nombre: 'Mayor o menor', categoria: 'Estrategia de eliminación', versionReglas: 'mayormenor-1.0.0', tabla: [{ id: 'gpt', nombre: 'GPT', color: '#ffffff', inicial: 'G', puntosPorPartida: 4, victorias: 1, empates: 0, derrotas: 0, partidas: 1 }] },
  ],
  episodios: [pendiente, publicada],
};

test('una serie por publicarse muestra su seed y hasta donde se ha subido, y ningun resultado', async () => {
  const nodo = await pintar(marcador);
  const series = nodo('series').innerHTML;
  assert.match(series, /552912962/);
  assert.match(series, /Por publicarse/);
  assert.match(series, /hasta el turno 8/);
  assert.match(series, /serie\.html\?id=serie-a/);
  assert.match(series, /escena\.html\?archivo=publicas%2Fserie-a\.json&amp;partida=1/);
  assert.match(series, /ganó GPT/, 'la publicada si dice su ganador');
  assert.doesNotMatch(series, /partida=2/, 'la partida sin nada subido no ofrece escena: solo se conoce su seed');
  assert.equal(nodo('contador').textContent, '2 series');
});

test('el marcador es por juego, solo cuenta lo publicado y avisa que no hay ranking general', async () => {
  const nodo = await pintar(marcador);
  const juegos = nodo('juegos').innerHTML;
  assert.match(juegos, /Guerra de territorios/);
  assert.match(juegos, /Todavía no hay partidas publicadas de este juego/);
  assert.match(juegos, /<td>4<\/td>/);
  assert.match(juegos, /no es un ranking general/i);
});

test('el seed de la direccion filtra la lista (entero, en partes o con espacios)', async () => {
  for (const seed of ['552912962', '5529', '552%20912%20962']) {
    const nodo = await pintar(marcador, `?seed=${seed}`);
    assert.equal(nodo('contador').textContent, '1 serie de 2', seed);
    assert.match(nodo('series').innerHTML, /Guerra de territorios/);
    assert.doesNotMatch(nodo('series').innerHTML, /Mayor o menor/);
  }
  const ninguna = await pintar(marcador, '?seed=123456789');
  assert.match(ninguna('series').innerHTML, /Ninguna serie coincide/);
});

test('sin marcador (o sin red) la portada avisa en vez de romperse', async () => {
  const nodo = await pintar(null);
  assert.match(nodo('contador').textContent, /No pude cargar el marcador|Todavía no hay series/);
});
