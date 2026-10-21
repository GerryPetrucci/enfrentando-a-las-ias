// El menu del sitio (web/menu.js): una barra fija arriba con Inicio, Juegos (desplegable), Cómo se mide y Proponer. Se prueba lo puro: el HTML que arma y la carga del marcador.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { menuHtml, cargarMarcador, esc } from '../../web/menu.js';

const juegos = [{ id: 'conquista', nombre: 'Guerra de territorios', publicadas: 1 }, { id: 'mayormenor', nombre: 'Mayor o menor', publicadas: 0 }];

test('la barra trae la marca, el menu y un enlace por juego', () => {
  const h = menuHtml(juegos, { pagina: 'inicio' });
  assert.match(h, /<a class="marca" href="\.\/">/);
  for (const j of juegos) assert.ok(h.includes(`href="juego.html?id=${j.id}"`), j.id);
  assert.match(h, /href="metodo\.html"/);
  assert.match(h, /href="proponer\.html"/);
  assert.match(h, /href="\.\/\?buscar=1#buscar"|href="\.\/#buscar"/);
  assert.match(h, /aria-expanded="false"/, 'los desplegables nacen cerrados');
});

test('la pagina actual se marca con aria-current, y en un juego se marca ese juego', () => {
  assert.equal((menuHtml(juegos, { pagina: 'inicio' }).match(/aria-current="page"/g) ?? []).length, 1);
  const m = menuHtml(juegos, { pagina: 'metodo' });
  assert.match(m, /href="metodo\.html" aria-current="page"/);
  const j = menuHtml(juegos, { pagina: 'juego', juegoId: 'mayormenor' });
  assert.match(j, /href="juego\.html\?id=mayormenor" aria-current="page"/);
  assert.doesNotMatch(j, /href="juego\.html\?id=conquista" aria-current/);
  assert.match(menuHtml(juegos, { pagina: 'proponer' }), /href="proponer\.html"[^>]*aria-current="page"/);
});

test('los nombres se escapan y sin juegos la barra sigue entera', () => {
  const h = menuHtml([{ id: 'x"><b>', nombre: '<img src=x onerror=1>' }], {});
  assert.doesNotMatch(h, /<img src=x/);
  assert.doesNotMatch(h, /id=x"><b>/);
  assert.equal(esc(`<&"'>`), '&lt;&amp;&quot;&#39;&gt;');
  for (const raro of [[], null, undefined]) assert.match(menuHtml(raro, {}), /Proponer/);
  assert.match(menuHtml([], {}), /Todavía no hay juegos/);
});

test('cargarMarcador devuelve los datos, o un marcador vacio si no hay red o el archivo esta roto', async () => {
  const datos = { juegos: [1], partidas: [2] };
  assert.deepEqual(await cargarMarcador(async () => ({ ok: true, json: async () => datos })), datos);
  assert.deepEqual(await cargarMarcador(async () => { throw new Error('sin red'); }), { juegos: [], partidas: [], error: true });
  assert.deepEqual(await cargarMarcador(async () => ({ ok: false })), { juegos: [], partidas: [], error: true });
  assert.deepEqual(await cargarMarcador(async () => ({ ok: true, json: async () => { throw new Error('json'); } })), { juegos: [], partidas: [], error: true });
});

// Un DOM de mentira: lo justo para ver que los botones abren y cierran el menu.
function domFalso() {
  const botones = {};
  const nodo = (nombre) => (botones[nombre] ??= { atributos: {}, manejadores: {}, hidden: nombre === 'lista', setAttribute(k, v) { this.atributos[k] = v; }, addEventListener(t, f) { this.manejadores[t] = f; }, focus() { this.enfocado = true; } });
  const clases = new Set();
  const barra = {
    innerHTML: '', contains: (x) => x === 'dentro',
    classList: { toggle: (c, on) => (on ? clases.add(c) : clases.delete(c)), contains: (c) => clases.has(c), remove: (c) => clases.delete(c) },
    querySelector: (s) => nodo({ '.menu-boton': 'menu', '.juegos-boton': 'juegos', '#lista-juegos': 'lista' }[s]),
    querySelectorAll: () => [],
  };
  const eventos = {};
  const document = { getElementById: (id) => (id === 'barra' ? barra : null), addEventListener: (t, f) => { eventos[t] = f; } };
  return { document, barra, botones, clases, eventos };
}

test('montarMenu pinta la barra y los botones abren y cierran el menu y la lista de juegos; Escape y un clic fuera lo cierran', async () => {
  const d = domFalso();
  globalThis.document = d.document;
  try {
    const { montarMenu } = await import('../../web/menu.js');
    montarMenu({ juegos }, { pagina: 'inicio' });
    assert.match(d.barra.innerHTML, /juego\.html\?id=conquista/);
    d.botones.menu.manejadores.click();
    assert.equal(d.botones.menu.atributos['aria-expanded'], 'true');
    assert.ok(d.clases.has('abierto'));
    d.botones.juegos.manejadores.click();
    assert.equal(d.botones.lista.hidden, false);
    assert.equal(d.botones.juegos.atributos['aria-expanded'], 'true');
    d.eventos.keydown({ key: 'Escape' });
    assert.equal(d.botones.lista.hidden, true);
    assert.equal(d.clases.has('abierto'), false);
    assert.equal(d.botones.menu.atributos['aria-expanded'], 'false');
    d.botones.menu.manejadores.click();
    d.eventos.click({ target: 'fuera' });
    assert.equal(d.clases.has('abierto'), false, 'un clic fuera de la barra la cierra');
    d.botones.menu.manejadores.click();
    d.eventos.click({ target: 'dentro' });
    assert.ok(d.clases.has('abierto'), 'un clic dentro no la cierra');
  } finally {
    delete globalThis.document;
  }
});

test('montarMenu no rompe si la pagina no tiene barra', async () => {
  globalThis.document = { getElementById: () => null, addEventListener() {} };
  try {
    const { montarMenu } = await import('../../web/menu.js');
    assert.doesNotThrow(() => montarMenu({ juegos }, {}));
  } finally {
    delete globalThis.document;
  }
});
