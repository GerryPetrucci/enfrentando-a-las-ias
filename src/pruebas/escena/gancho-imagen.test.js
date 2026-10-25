// El gancho en IMAGEN (web/casino/gancho-imagen.js + web/gancho-imagen.html): lo que dice, su arte por juego, la zona segura de cada formato y que use la marca del sitio. Sin navegador ni red:
// el renderizado real (captura PNG y autocomprobacion de la zona) se prueba en src/pruebas/gancho-imagen-herramienta.test.js.
//
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { textosDeGanchoImagen, modeloDeGanchoImagen, direccionDeGanchoImagen, htmlDeGanchoImagen, ARTE_GANCHO, FORMATOS_IMAGEN } from '../../../web/casino/gancho-imagen.js';
import { FORMATOS_ESCENA } from '../../../web/casino/layout.js';
import { PERSONAJES_ANIMADOS } from '../../../web/casino/lobo-personajes-animados.js';
import { juegosConEscena } from '../../../web/casino/lineas.js';

const web = (ruta) => new URL(`../../../web/${ruta}`, import.meta.url);

test('textos: PRÓXIMAMENTE, el juego, «Juego N · Parte M de K» y el aviso de IA; la ultima parte pide seguir para ver el desenlace', () => {
  const t = textosDeGanchoImagen({ juegoId: 'lobo', juegoNumero: 3, parte: 1, de: 2 });
  assert.deepEqual(t, { kicker: 'PRÓXIMAMENTE', nombre: 'Lobo en la aldea', detalle: 'Juego 3 · Parte 1 de 2', cta: 'Síguenos para no perdértela', aviso: 'Contenido generado por IA · Proyecto independiente' });
  assert.equal(textosDeGanchoImagen({ juegoId: 'lobo', juegoNumero: 3, parte: 2, de: 2 }).cta, 'Síguenos para ver el desenlace');
  assert.equal(textosDeGanchoImagen({ juegoId: 'lobo', juegoNumero: 3, parte: 1, de: 1 }).detalle, 'Juego 3', 'con una sola parte no se habla de partes');
  assert.equal(textosDeGanchoImagen({ juegoId: 'no-existe' }).nombre, 'Enfrentando a las IAs', 'un juego desconocido cae a la marca');
  assert.equal(textosDeGanchoImagen().detalle, 'Juego 1 · Parte 1 de 2');
});

test('el modelo trae el tamano y la zona segura de su formato; un formato o un numero invalido lanza (nunca se dibuja algo que se saldria de la zona)', () => {
  for (const formato of FORMATOS_IMAGEN) {
    const m = modeloDeGanchoImagen({ juegoId: 'lobo', juegoNumero: 1, parte: 2, de: 2, formato });
    assert.deepEqual([m.ancho, m.alto, m.zona], [FORMATOS_ESCENA[formato].ancho, FORMATOS_ESCENA[formato].alto, FORMATOS_ESCENA[formato].zona]);
    assert.notEqual(m.zona, FORMATOS_ESCENA[formato].zona, 'es una copia: no se comparte el objeto');
  }
  assert.deepEqual(FORMATOS_IMAGEN, ['9x16', '16x9']);
  assert.throws(() => modeloDeGanchoImagen({ juegoId: 'lobo', formato: '4x5' }), /Formato desconocido: "4x5"/);
  assert.throws(() => modeloDeGanchoImagen({ juegoId: 'lobo', parte: 3, de: 2 }), /La parte 3 no existe/);
  for (const malo of [{ juegoNumero: 0 }, { parte: 0 }, { de: 1.5 }, { juegoNumero: '2' }]) assert.throws(() => modeloDeGanchoImagen({ juegoId: 'lobo', ...malo }), /entero de 1 en adelante/, JSON.stringify(malo));
});

test('Lobo tiene arte: el panorama de la aldea y los seis personajes en su pose de accion, con los archivos y tamanos reales; los demas juegos solo llevan la marca', () => {
  const a = ARTE_GANCHO.lobo;
  assert.equal(a.plantel.length, 6);
  assert.deepEqual(a.plantel.map((p) => p.rol).sort(), Object.keys(PERSONAJES_ANIMADOS).sort());
  for (const p of a.plantel) {
    assert.deepEqual([p.cuadros, p.ancho, p.alto, p.archivo], [PERSONAJES_ANIMADOS[p.rol].cuadros, PERSONAJES_ANIMADOS[p.rol].ancho, PERSONAJES_ANIMADOS[p.rol].alto, PERSONAJES_ANIMADOS[p.rol].archivo]);
    assert.equal(p.cuadro, 3, 'el 4.o cuadro es la pose de accion');
    assert.ok(existsSync(web(p.archivo)), p.archivo);
  }
  const png = readFileSync(web(a.panel.archivo));
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [a.panel.ancho, a.panel.alto], 'el panorama mide lo que dice');
  assert.equal(modeloDeGanchoImagen({ juegoId: 'lobo' }).arte, a);
  for (const id of juegosConEscena().filter((j) => !ARTE_GANCHO[j])) assert.equal(modeloDeGanchoImagen({ juegoId: id }).arte, null, id);
});

test('la direccion de la pagina lleva juego, numero, parte, cuantas partes y formato; la misma que usa la herramienta', () => {
  const u = new URL(direccionDeGanchoImagen({ juegoId: 'lobo', juegoNumero: 12, parte: 2, de: 2, formato: '16x9' }), 'http://x/');
  assert.equal(u.pathname, '/gancho-imagen.html');
  assert.deepEqual(Object.fromEntries(u.searchParams), { juego: 'lobo', numero: '12', parte: '2', de: '2', formato: '16x9' });
  assert.equal(new URL(direccionDeGanchoImagen({ juegoId: 'conquista' }), 'http://x/').searchParams.get('formato'), '9x16');
});

test('el HTML dice lo que debe, usa el logo de la marca, escapa el texto y solo trae panorama y personajes si el juego tiene arte', () => {
  const lobo = htmlDeGanchoImagen(modeloDeGanchoImagen({ juegoId: 'lobo', juegoNumero: 1, parte: 1 }));
  for (const texto of ['PRÓXIMAMENTE', 'Lobo en la aldea', 'Juego 1 · Parte 1 de 2', 'Síguenos para no perdértela', 'Contenido generado por IA', 'Enfrentando a las IAs']) assert.ok(lobo.includes(texto), texto);
  assert.match(lobo, /src="logo\.svg"/);
  assert.equal([...lobo.matchAll(/class="gi-figura"/g)].length, 6);
  assert.match(lobo, /<figure class="gi-panel"><img src="arte\/lobo\/dia-asamblea-01\.png"/);
  const sin = htmlDeGanchoImagen(modeloDeGanchoImagen({ juegoId: 'conquista', juegoNumero: 2, parte: 2 }));
  assert.ok(!sin.includes('gi-panel') && !sin.includes('gi-plantel') && sin.includes('Guerra de territorios') && sin.includes('Síguenos para ver el desenlace'));
  const malo = htmlDeGanchoImagen({ ...modeloDeGanchoImagen({ juegoId: 'conquista' }), nombre: '<img src=x onerror=alert(1)>', detalle: '"&' });
  assert.ok(!malo.includes('<img src=x') && malo.includes('&lt;img src=x onerror=alert(1)&gt;') && malo.includes('&quot;&amp;'));
});

test('la pagina usa la marca del sitio (sitio.css: Barlow Condensed, Inter, --oro, --hueso, --noche...) y no un estilo aparte, y todo se lee dentro de la zona segura', () => {
  const html = readFileSync(web('gancho-imagen.html'), 'utf8'), css = readFileSync(web('gancho-imagen.css'), 'utf8');
  assert.match(html, /<link rel="stylesheet" href="sitio\.css">/);
  assert.match(html, /<link rel="stylesheet" href="gancho-imagen\.css">/);
  for (const token of ['--oro', '--hueso', '--noche', '--suave', '--titulos', '--texto']) assert.ok(css.includes(`var(${token}`), `el CSS no usa ${token}`);
  assert.doesNotMatch(css, /font-family|font:[^;]*['"]/, 'las tipografias vienen de los tokens, no se nombran aqui');
  assert.match(css, /\.gi-zona\s*\{[^}]*left:var\(--zx\);[^}]*top:var\(--zy\);[^}]*width:var\(--zw\);[^}]*height:var\(--zh\)/, 'el contenido vive en la zona segura');
  assert.match(html, /dataset\.fuera/, 'la pagina se autocomprueba: cuenta lo que se sale de la zona');
  const sitio = readFileSync(web('sitio.css'), 'utf8');
  for (const fuente of ['barlow-condensed-800.woff2', 'inter-variable.woff2']) assert.ok(sitio.includes(fuente) && existsSync(web(`fonts/${fuente}`)), `fuente local ${fuente}`);
});
