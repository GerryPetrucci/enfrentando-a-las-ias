// El sitio (web/index.html) pinta el marcador. Se prueba sin navegador: se extrae su script y se corre con un
// `document` y un `fetch` falsos. Lo que importa: la columna de obediencia solo aparece donde hay datos, y las
// partidas de juegos sin reproductor se listan sin enlace.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fondoCSS } from '../../web/paleta.js';

const html = readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8');
const codigo = /<script type="module">([\s\S]*?)<\/script>/.exec(html)[1].replace(/^import .*$/m, '');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function pintar(marcador) {
  const app = { innerHTML: '' };
  const document = { getElementById: () => app };
  const fetch = async () => ({ json: async () => marcador });
  await new AsyncFunction('fondoCSS', 'document', 'fetch', codigo)(fondoCSS, document, fetch);
  return app.innerHTML;
}

const fila = (extra = {}) => ({
  id: 'a', nombre: 'A', color: '#111111', tipo: 'bot', modelo: null, puntosPorPartida: 15, victorias: 1, empates: 1, derrotas: 0,
  fiabilidad: 0.94, traiciones: 3, obediencia: null, ...extra,
});
const episodio = (id, archivo, extra = {}) => ({
  archivo, juego: { id, nombre: id }, enfrentamiento: 'A vs B', fecha: '2026-10-10T10:00:00.000Z', seedBase: 7, partidas: 2, serie: null, ...extra,
});

test('la columna de obediencia aparece solo en la categoria que la mide', async () => {
  const pagina = await pintar({
    categorias: [
      { nombre: 'Traición y confianza', juegos: ['Dilema'], tabla: [fila()] },
      { nombre: 'Estrategia y conquista', juegos: ['Guerra de territorios'], tabla: [fila({ obediencia: 0.95 })] },
    ],
    episodios: [],
  });
  assert.equal(pagina.match(/<th>Obediencia<\/th>/g).length, 1);
  assert.match(pagina, /<td>95%<\/td>/);
});

test('sin datos de obediencia la tabla queda como siempre', async () => {
  const pagina = await pintar({ categorias: [{ nombre: 'Traición y confianza', juegos: ['Dilema'], tabla: [fila()] }], episodios: [] });
  assert.doesNotMatch(pagina, /Obediencia/);
  assert.match(pagina, /<td>94%<\/td>/);
});

test('los episodios del Dilema enlazan al reproductor y los de conquista, que aun no lo tiene, no', async () => {
  const pagina = await pintar({
    categorias: [{ nombre: 'X', juegos: ['X'], tabla: [fila()] }],
    episodios: [episodio('dilema', 'd.json'), episodio('conquista', 'c.json', { serie: { partidas: 4 }, partidas: 4 })],
  });
  assert.match(pagina, /replay\.html\?archivo=d\.json/);
  assert.doesNotMatch(pagina, /replay\.html\?archivo=c\.json/);
  assert.match(pagina, /serie de 4/);
});
