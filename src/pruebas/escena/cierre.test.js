// El cierre de cada video (web/casino/cierre.js): una frase de la voz que cambia de un video a otro ("No olvides seguirnos y reaccionar" y parecidas) y una tarjeta con el logo, el @ de cada red y
// la pagina de los resultados. Lo puro: las frases, cual toca (con seed, nunca Math.random), el beat que se agrega al final y el HTML de la tarjeta.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRASES_CIERRE, FRASES_POR_TIPO, TIPOS_CIERRE, MIN_MS_CIERRE, claveDeCierre, indiceDeCierre, beatDeCierre, conCierre, esCierre, vozSoloCierre, planDeFrases, duracionDeCierre, htmlDeCierre } from '../../../web/casino/cierre.js';
import { REDES, SITIO } from '../../../web/redes.js';
import { duracionDeBeat, TIPOS_DE_CIERRE } from '../../../web/casino/escena-config.js';

const beats = [{ id: 'a', mano: 1, tipo: 'x', minMs: 1000 }, { id: 'b', mano: 3, tipo: 'x', minMs: 1000 }];
const SEGUIR = /s[ií]guenos|seguirnos/i; // «síguenos» / «seguirnos», no «siguiente»

test('hay varias frases, distintas y lo bastante cortas para decirse en unos segundos', () => {
  assert.ok(FRASES_CIERRE.length >= 40, 'para que no se repitan seguido');
  assert.equal(new Set(FRASES_CIERRE).size, FRASES_CIERRE.length);
  assert.ok(FRASES_POR_TIPO.final.includes('No olvides seguirnos y reaccionar.'), 'la frase que pidio el usuario, tal cual');
  for (const f of FRASES_CIERRE) {
    assert.ok(f.length <= 90, `${f}: ${f.length} caracteres`);
    assert.match(f, /[.?!]$/, f);
  }
});

test('hay frases para cada tipo de pieza y los tipos de las frases son los de la direccion de la escena', () => {
  assert.deepEqual(TIPOS_CIERRE, TIPOS_DE_CIERRE);
  assert.deepEqual(Object.keys(FRASES_POR_TIPO), TIPOS_DE_CIERRE);
  for (const tipo of TIPOS_CIERRE) assert.ok(FRASES_POR_TIPO[tipo].length >= 10, `${tipo}: pocas frases`);
  assert.deepEqual(FRASES_CIERRE.slice(0, 12), FRASES_POR_TIPO.final.slice(0, 12), 'cierre-0..11 siguen siendo las de siempre: las voces ya generadas valen');
  assert.equal(FRASES_CIERRE[0], 'No olvides seguirnos y reaccionar.');
});

test('cada frase es coherente con su pieza: el final invita a seguir, la parte a medias promete la siguiente, el clip manda a la partida completa y el gancho pide estar al pendiente', () => {
  for (const f of FRASES_POR_TIPO.final) assert.match(f, /s[ií]gu|reacci|seguirnos|coment|resultado|enfrentar|ponemos/i, f);
  for (const f of FRASES_POR_TIPO.parte) {
    assert.match(f, /siguiente parte|desenlace|termina|ganador|ganando|gana\b|partida/i, f);
    assert.doesNotMatch(f, /pr[oó]xima partida|más partidas|gracias por ver|completa/i, `una parte que no termina no se despide: ${f}`);
  }
  for (const f of FRASES_POR_TIPO.clip) {
    assert.match(f, /completa|entera|resto|fragmento|momento|contexto|llegó/i, f);
    assert.doesNotMatch(f, /siguiente parte|pr[oó]xima partida|pronto|próximamente/i, `un clip manda a la partida completa: ${f}`);
  }
  for (const f of FRASES_POR_TIPO.gancho) {
    assert.match(f, /pronto|pendiente|llega|viene|próximamente|prepárate|notificaciones|adelanto|cuenta regresiva|por llegar|comienza|empezó|sabrás/i, f);
    assert.doesNotMatch(f, /siguiente parte|gracias por ver|completa ya/i, `un gancho anuncia lo que viene: ${f}`);
  }
});

test('no todas las frases piden «síguenos»: cada tipo mezcla avisos, preguntas y llamadas a ver la partida', () => {
  for (const tipo of TIPOS_CIERRE) {
    const piden = FRASES_POR_TIPO[tipo].filter((f) => SEGUIR.test(f)).length, total = FRASES_POR_TIPO[tipo].length;
    assert.ok(piden >= 1, `${tipo}: alguna sí invita a seguir`);
    assert.ok(piden / total <= 0.75, `${tipo}: ${piden} de ${total} piden seguir`);
  }
});

test('la frase sale del tipo de la pieza: el mismo video siempre dice la misma y cada tipo usa su bloque de frases', () => {
  let desde = 0;
  for (const tipo of TIPOS_CIERRE) {
    const bloque = FRASES_POR_TIPO[tipo];
    for (let i = 0; i < 40; i++) {
      const clave = `seed:p1:${i}-${i + 5}`, indice = indiceDeCierre(clave, tipo);
      assert.ok(indice >= desde && indice < desde + bloque.length, `${tipo}: ${indice}`);
      assert.equal(beatDeCierre(clave, 1, tipo).texto, FRASES_CIERRE[indice]);
      assert.equal(beatDeCierre(clave, 1, tipo).id, `cierre-${indice}`);
      assert.equal(conCierre(beats, clave, tipo).at(-1).texto, bloque[indice - desde]);
    }
    assert.ok(new Set(Array.from({ length: 40 }, (_, i) => indiceDeCierre(`k${i}`, tipo))).size >= 5, `${tipo}: se repite demasiado`);
    desde += bloque.length;
  }
  assert.equal(indiceDeCierre('x'), indiceDeCierre('x', 'final'), 'sin tipo, la frase de siempre');
  assert.equal(indiceDeCierre('x', 'desconocido'), indiceDeCierre('x', 'final'), 'un tipo desconocido tampoco lanza');
  assert.equal(beatDeCierre('x').id, beatDeCierre('x', 0, 'final').id);
});

test('la duracion del cierre depende de la frase del tipo (su voz es la de esa frase)', () => {
  const clave = 'k', id = `cierre-${indiceDeCierre(clave, 'clip')}`;
  const voz = { [id]: { ms: 9000, archivo: 'a.ogg', fuente: beatDeCierre(clave, 0, 'clip').texto } };
  assert.equal(duracionDeCierre(clave, voz, 'clip'), 9000);
  assert.equal(duracionDeCierre(clave, voz, 'parte'), MIN_MS_CIERRE, 'la voz de la frase de un clip no sirve en una parte');
});

test('la clave de cada pieza distingue partidas con el mismo seed y piezas de la misma partida', () => {
  const k = (o) => claveDeCierre({ seed: 552912962, ...o });
  assert.notEqual(k({ partida: 1, desde: 1, hasta: 9 }), k({ partida: 2, desde: 1, hasta: 9 }));
  assert.notEqual(k({ partida: 1, desde: 1, hasta: 9 }), k({ partida: 1, desde: 10, hasta: 18 }));
  assert.notEqual(k({ partida: 1, gancho: 1 }), k({ partida: 1, gancho: 2 }));
  assert.notEqual(k({ partida: 1, gancho: 1 }), k({ partida: 1, desde: 1, hasta: 9 }));
  assert.equal(k({ partida: 1, desde: 1, hasta: 9 }), k({ partida: 1, desde: 1, hasta: 9 }), 'estable');
  assert.doesNotThrow(() => claveDeCierre(null));
});

test('la frase que toca sale de la clave (misma clave, misma frase: la voz y la pagina coinciden) y varia de un video a otro', () => {
  assert.equal(indiceDeCierre('x'), indiceDeCierre('x'));
  const indices = Array.from({ length: 40 }, (_, i) => indiceDeCierre(`seed:p1:${i}-${i + 5}`));
  for (const i of indices) assert.ok(Number.isInteger(i) && i >= 0 && i < FRASES_CIERRE.length);
  assert.ok(new Set(indices).size >= 6, `solo ${new Set(indices).size} frases distintas en 40 videos`);
  assert.ok(Math.max(...Array.from(indices.reduce((m, i) => m.set(i, (m.get(i) ?? 0) + 1), new Map()).values())) <= 10, 'ninguna frase domina');
});

test('el beat de cierre va al final, lleva la frase y su id dice cual (la voz se busca por id)', () => {
  const conc = conCierre(beats, 'clave-1');
  assert.equal(conc.length, 3);
  assert.deepEqual(conc.slice(0, 2), beats, 'los beats de antes quedan como estaban');
  const c = conc.at(-1);
  assert.equal(c.tipo, 'cierre');
  assert.equal(c.id, `cierre-${indiceDeCierre('clave-1')}`);
  assert.equal(c.texto, FRASES_CIERRE[indiceDeCierre('clave-1')]);
  assert.equal(c.mano, 3, 'de la ultima unidad: un recorte por unidades no lo pierde');
  assert.ok(c.minMs >= MIN_MS_CIERRE, 'tiempo para leer los arrobas');
  assert.equal(esCierre(c.id), true);
  assert.equal(esCierre('intro'), false);
  assert.equal(c.pasos[0].tipo, 'cierre');
  assert.equal(c.pasos[0].frase, c.texto);
});

test('el cierre no se duplica ni se agrega a nada vacio ni a basura', () => {
  const una = conCierre(beats, 'k');
  assert.equal(conCierre(una, 'otra').length, 3, 'si ya trae cierre, se queda con ese');
  assert.deepEqual(conCierre([], 'k'), []);
  assert.deepEqual(conCierre(null, 'k'), []);
  assert.deepEqual(conCierre('x', 'k'), []);
});

test('la tarjeta trae el logo, TODAS las redes con su @ y la pagina de los resultados', () => {
  const h = htmlDeCierre(beatDeCierre('k', 1).pasos[0]);
  assert.match(h, /logo\.svg/);
  for (const r of REDES) {
    assert.ok(h.includes(r.nombre), r.nombre);
    assert.ok(h.includes(r.usuario), `${r.nombre}: ${r.usuario}`);
    assert.ok(h.includes(r.icono), `${r.nombre}: su icono`);
  }
  assert.ok(h.includes('@enfrentandoalasias') && h.includes('@enfrentandoias') && h.includes('Facebook'));
  assert.ok(h.includes(SITIO.texto));
  assert.ok(h.includes(esc(beatDeCierre('k', 1).texto)), 'la frase tambien se lee');
  assert.doesNotThrow(() => htmlDeCierre(null));
});

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');

test('la voz de un gancho solo dice el cierre: los cortes de la partida no se narran', () => {
  const voz = { 'cierre-2': { ms: 3000, archivo: 'x/cierre-2.ogg', fuente: FRASES_CIERRE[2] }, 'mano-1-0': { ms: 4000, archivo: 'x/otro.ogg' }, intro: { ms: 1, archivo: 'x/i.ogg' } };
  assert.deepEqual(Object.keys(vozSoloCierre(voz)), ['cierre-2']);
  assert.equal(vozSoloCierre(null), null);
  assert.deepEqual(vozSoloCierre({}), {});
});

test('la voz se genera para TODAS las frases (cada video usa una distinta): un audio por frase, con su id y su texto', () => {
  const plan = planDeFrases();
  assert.equal(plan.length, FRASES_CIERRE.length);
  plan.forEach((p, i) => { assert.equal(p.id, `cierre-${i}`); assert.equal(p.texto, FRASES_CIERRE[i]); assert.equal(esCierre(p.id), true); });
});

test('la duracion del cierre cuenta la voz si la hay, y nunca baja del minimo', () => {
  const clave = 'k';
  const id = `cierre-${indiceDeCierre(clave)}`;
  assert.equal(duracionDeCierre(clave, null), MIN_MS_CIERRE);
  assert.equal(duracionDeCierre(clave, { [id]: { ms: 9000, archivo: 'a.ogg', fuente: FRASES_CIERRE[indiceDeCierre(clave)] } }), 9000);
  assert.equal(duracionDeCierre(clave, { [id]: { ms: 2000, archivo: 'a.ogg' } }), MIN_MS_CIERRE);
  assert.equal(duracionDeCierre(clave, { [id]: { ms: 9000, archivo: 'a.ogg', fuente: 'otra frase' } }), MIN_MS_CIERRE, 'una voz de otro texto no cuenta');
  assert.equal(duracionDeBeat(beatDeCierre(clave), null, 1), MIN_MS_CIERRE);
});
