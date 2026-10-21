// Las paginas del sitio (landing, un juego, propuestas), sin navegador (ayudas-sitio.js). Lo que importa: no hay series (solo juegos y partidas), una partida
// «por publicarse» muestra su seed pero ningun resultado, cada juego tiene su propia tabla (nunca un ranking general), la busqueda y los filtros viajan en la direccion,
// y todo lo que viene de datos o de la direccion se escapa.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { correrPagina, MARCADOR } from './ayudas-sitio.js';

const web = (f) => readFileSync(new URL(`../../web/${f}`, import.meta.url), 'utf8');

test('la landing muestra un cuadro por juego con sus numeros, las ultimas partidas y el menu de inicio', async () => {
  const r = await correrPagina('index.html', { marcador: MARCADOR });
  const juegos = r.nodo('juegos').innerHTML;
  assert.match(juegos, /juego\.html\?id=conquista/);
  assert.match(juegos, /juego\.html\?id=mayormenor/);
  assert.match(juegos, /Guerra de territorios/);
  assert.match(juegos, /1 partida publicada/);
  assert.match(juegos, /1 por publicarse/);
  assert.match(juegos, /De 2 a 5 reinos/, 'la descripcion publica del juego');
  const partidas = r.nodo('partidas').innerHTML;
  assert.match(partidas, /partida\.html\?id=s1&partida=2/);
  assert.equal(r.nodo('t-partidas').textContent, 'Últimas partidas');
  assert.match(partidas, /Partida 1 · mismo seed que la 2, con los asientos rotados/, 'dos partidas con el mismo seed se distinguen');
  assert.match(partidas, /Partida 2 · mismo seed que la 1, con los asientos rotados/);
  assert.equal((partidas.match(/Partida \d ·/g) ?? []).length, 2, 'la partida que va sola en su tanda no lleva etiqueta');
  assert.deepEqual(r.llamadasMenu.map((o) => o.pagina), ['inicio']);
  assert.doesNotMatch(web('index.html'), /serie/i, 'en la landing ya no se habla de series');
});

test('una partida por publicarse no dice su resultado en ninguna parte de la landing', async () => {
  const r = await correrPagina('index.html', { marcador: MARCADOR });
  const todo = r.nodo('partidas').innerHTML + r.nodo('juegos').innerHTML;
  assert.match(todo, /Por publicarse · subida hasta el turno 8/);
  assert.doesNotMatch(todo, /NO DEBE SALIR/);
  assert.match(todo, /Ganó GPT/, 'la publicada si dice su ganador');
});

test('la busqueda escribe la direccion y filtra juegos y partidas; los enlaces viejos ?seed= siguen sirviendo', async () => {
  const por = await correrPagina('index.html', { marcador: MARCADOR, search: '?q=mayor' });
  assert.match(por.nodo('juegos').innerHTML, /Mayor o menor/);
  assert.doesNotMatch(por.nodo('juegos').innerHTML, /conquista/);
  assert.equal(por.nodo('t-partidas').textContent, 'Partidas que coinciden');
  assert.equal(por.nodo('contador').textContent, '1 juego y 1 partida');
  assert.equal(por.nodo('q').value, 'mayor');
  const viejo = await correrPagina('index.html', { marcador: MARCADOR, search: '?seed=552912962' });
  assert.equal(viejo.nodo('contador').textContent, '1 juego y 2 partidas');
  assert.equal(viejo.nodo('q').value, '552912962');
  const nada = await correrPagina('index.html', { marcador: MARCADOR, search: '?q=zzz' });
  assert.match(nada.nodo('juegos').innerHTML, /Ningún juego coincide/);
  assert.match(nada.nodo('partidas').innerHTML, /Ninguna partida coincide con «zzz»/);
  por.nodo('q').value = 'gemini';
  por.nodo('q').manejadores.input[0]();
  assert.equal(por.history.ultima, '/pagina.html?q=gemini');
});

test('lo que se busca se escapa y desde el menu #buscar enfoca el buscador', async () => {
  const r = await correrPagina('index.html', { marcador: MARCADOR, search: '?q=%3Cimg%20src%3Dx%3E' });
  assert.doesNotMatch(r.nodo('partidas').innerHTML, /<img src=x>/);
  assert.match(r.nodo('partidas').innerHTML, /&lt;img src=x&gt;/);
  const enfoca = await correrPagina('index.html', { marcador: MARCADOR, hash: '#buscar' });
  assert.equal(enfoca.nodo('q').focuseado, true);
  assert.equal((await correrPagina('index.html', { marcador: MARCADOR })).nodo('q').focuseado, false);
});

test('sin marcador (o sin red) la landing avisa y la barra sigue montada', async () => {
  const r = await correrPagina('index.html', { marcador: null });
  assert.match(r.nodo('contador').textContent, /No pude cargar el marcador/);
  assert.match(r.nodo('juegos').innerHTML, /Todavía no hay juegos publicados/);
  assert.equal(r.llamadasMenu.length, 1);
});

test('la pagina de un juego trae su tabla propia, sus partidas y el aviso de que no hay ranking general', async () => {
  const r = await correrPagina('juego.html', { marcador: MARCADOR, search: '?id=conquista' });
  const html = r.nodo('contenido').innerHTML;
  assert.match(html, /<h1[^>]*>Guerra de territorios<\/h1>/);
  assert.match(html, /<td>1-0-0<\/td>/);
  assert.match(html, /no dice quién es «la mejor IA»/);
  assert.match(html, /REGLAS DE LA GUERRA/, 'el prompt que recibieron las IAs');
  assert.match(html, /proponer\.html\?tipo=enfrentamiento&amp;juego=Guerra%20de%20territorios/);
  assert.doesNotMatch(html, /serie/i);
  assert.deepEqual(r.llamadasMenu.map((o) => [o.pagina, o.juegoId]), [['juego', 'conquista']]);
  const lista = r.nodo('partidas').innerHTML;
  assert.match(lista, /partida\.html\?id=s1&partida=1/);
  assert.match(lista, /partida\.html\?id=s1&partida=2/);
  assert.match(lista, /Partida 2 · mismo seed que la 1, con los asientos rotados/);
  assert.doesNotMatch(lista, /Mayor o menor|s2/, 'solo las partidas de este juego');
  assert.doesNotMatch(lista + html, /NO DEBE SALIR/);
  assert.equal(r.nodo('contador').textContent, '2 partidas');
});

test('los filtros de un juego salen de la direccion y la reescriben; un juego sin partidas sigue mostrando su pagina', async () => {
  const r = await correrPagina('juego.html', { marcador: MARCADOR, search: '?id=conquista&estado=por-publicarse' });
  assert.equal(r.nodo('contador').textContent, '1 partida de 2');
  assert.doesNotMatch(r.nodo('partidas').innerHTML, /partida=1/);
  assert.equal(r.history.ultima, '/pagina.html?id=conquista&estado=por-publicarse');
  r.nodo('limpiar').manejadores.click[0]();
  assert.equal(r.nodo('contador').textContent, '2 partidas');
  assert.equal(r.history.ultima, '/pagina.html?id=conquista');
  const sin = await correrPagina('juego.html', { marcador: MARCADOR, search: '?id=mayormenor' });
  assert.match(sin.nodo('contenido').innerHTML, /Todavía no hay partidas publicadas de este juego/);
});

test('un juego que no existe, o sin id, avisa en vez de romperse, y el id de la direccion no mete HTML', async () => {
  const no = await correrPagina('juego.html', { marcador: MARCADOR, search: '?id=nada' });
  assert.match(no.nodo('contenido').innerHTML, /No encuentro ese juego/);
  const sinId = await correrPagina('juego.html', { marcador: MARCADOR });
  assert.match(sinId.nodo('contenido').innerHTML, /Falta indicar el juego/);
  const raro = await correrPagina('juego.html', { marcador: MARCADOR, search: '?id=%3Cscript%3E' });
  assert.doesNotMatch(raro.nodo('contenido').innerHTML, /<script>/);
});

test('proponer: valida, abre el Issue prellenado y lista las propuestas por apoyos', async () => {
  const issues = [
    { number: 3, title: '[Juego] Poker', html_url: 'https://github.com/x/y/issues/3', created_at: '2026-10-22T00:00:00Z', comments: 1, reactions: { '+1': 2 } },
    { number: 4, title: '[Enfrentamiento] Claude vs GPT', html_url: 'https://github.com/x/y/issues/4', created_at: '2026-10-23T00:00:00Z', comments: 0, reactions: { '+1': 7 } },
    { number: 5, title: 'Bug', html_url: 'https://github.com/x/y/issues/5' },
  ];
  const campos = (v) => ({ juego: { value: '' }, titulo: { value: v.titulo }, ias: { value: '' }, descripcion: { value: v.descripcion }, nombre: { value: '' } });
  const ev = { preventDefault() {} };
  const mala = await correrPagina('proponer.html', { marcador: MARCADOR, issues, formulario: campos({ titulo: 'a', descripcion: '' }) });
  const lista = mala.nodo('lista').innerHTML;
  assert.ok(lista.indexOf('Claude vs GPT') < lista.indexOf('Poker'), 'las de mas apoyo primero');
  assert.doesNotMatch(lista, /Bug/);
  mala.nodo('form').manejadores.submit[0](ev);
  assert.equal(mala.abiertas.length, 0, 'con errores no se abre nada');
  assert.equal(mala.nodo('errores').hidden, false);
  assert.match(mala.nodo('errores').innerHTML, /título/);

  const buena = await correrPagina('proponer.html', { marcador: MARCADOR, issues, formulario: campos({ titulo: 'Poker sin limite', descripcion: 'Cada IA recibe dos cartas y apuesta.' }) });
  buena.nodo('form').manejadores.submit[0](ev);
  assert.equal(buena.abiertas.length, 1);
  assert.match(buena.abiertas[0][0], /^https:\/\/github\.com\/GerryPetrucci\/enfrentando-a-las-ias\/issues\/new\?/);
  assert.equal(buena.nodo('errores').hidden, true);
  assert.deepEqual(buena.llamadasMenu.map((o) => o.pagina), ['proponer']);
});

test('proponer sigue funcionando si GitHub no responde', async () => {
  const r = await correrPagina('proponer.html', { marcador: MARCADOR, issues: null });
  assert.match(r.nodo('lista').innerHTML, /No pude cargar las propuestas/);
  assert.match(r.nodo('lista').innerHTML, /github\.com\/GerryPetrucci\/enfrentando-a-las-ias\/issues/);
  const vacia = await correrPagina('proponer.html', { marcador: MARCADOR, issues: [] });
  assert.match(vacia.nodo('lista').innerHTML, /Todavía no hay propuestas/);
});

test('la direccion vieja serie.html manda a partida.html con la misma consulta, y las paginas nuevas existen', () => {
  assert.match(web('serie.html'), /location\.replace\('partida\.html' \+ location\.search/);
  const archivos = readdirSync(new URL('../../web/', import.meta.url));
  for (const f of ['index.html', 'juego.html', 'partida.html', 'metodo.html', 'proponer.html', 'menu.js', 'catalogo.js', 'propuestas.js']) assert.ok(archivos.includes(f), f);
});

test('todas las paginas cargan la misma barra, el pie con el aviso de IA y se ven bien en el celular', () => {
  for (const f of ['index.html', 'juego.html', 'partida.html', 'metodo.html', 'proponer.html']) {
    const h = web(f);
    assert.match(h, /id="barra"/, f);
    assert.match(h, /id="pie"/, f);
    assert.match(h, /montarMenu/, f);
    assert.match(h, /name="viewport"/, f);
    assert.match(h, /generado por IA/i, f);
  }
});

test('los modulos y el estilo de cada pagina llevan ?v=__V__, y el despliegue lo cambia por el commit: asi el navegador nunca mezcla una pagina nueva con un modulo viejo de su cache', () => {
  for (const f of ['index.html', 'juego.html', 'partida.html', 'metodo.html', 'proponer.html', 'serie.html']) {
    const h = web(f);
    const locales = [...h.matchAll(/from '(\.\/[^']+\.js)(\?[^']*)?'/g)];
    for (const [, ruta, version] of locales) assert.equal(version, '?v=__V__', `${f}: ${ruta}`);
    assert.match(h, /href="sitio\.css\?v=__V__"/, f);
  }
  const flujo = readFileSync(new URL('../../.github/workflows/pages.yml', import.meta.url), 'utf8');
  assert.match(flujo, /__V__/);
  assert.match(flujo, /GITHUB_SHA/);
  assert.match(flujo, /_sitio\/\*\.html _sitio\/\*\.js/, 'tambien los .js de la raiz (menu.js importa redes.js)');
  for (const [, ruta, version] of web('menu.js').matchAll(/from '(\.\/[^']+\.js)(\?[^']*)?'/g)) assert.equal(version, '?v=__V__', `menu.js: ${ruta}`);
});
