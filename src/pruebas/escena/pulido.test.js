// Los menores que la revision independiente dejo diferidos, ya resueltos. Cada prueba nombra el problema que cierra.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { construirLineaDeTiempo, puntuarManos } from '../../../web/casino/linea-de-tiempo-duda.js';
import { leerParametros, rolDeJugada, etiquetaDeJugada, esRutaRelativa } from '../../../web/casino/escena-config.js';
import { eventosDePaso } from '../../../web/casino/sonido.js';
import { CARTAS, gemaDe } from '../../../web/casino/kit.js';
import { jugarConCaido, muchas } from './ayudas.js';

const leer = (r) => readFileSync(new URL(`../../../web/${r}`, import.meta.url), 'utf8');
async function todas() {
  const reemplazos = [];
  for (let seed = 1; seed <= 12; seed++) reemplazos.push(await jugarConCaido(seed, seed % 4));
  return [...await muchas(), ...reemplazos];
}

test('puntuarManos cuenta "pasa al frente" exactamente cuando la narracion del motor lo dice (antes arrastraba un lider viejo con los empates)', async () => {
  let dichas = 0;
  for (const p of await todas()) {
    const beats = construirLineaDeTiempo(p);
    for (const m of puntuarManos(p)) {
      const dice = beats.some((b) => b.mano === m.mano && b.tipo === 'cierre' && b.lineas.some((l) => /pasa al frente/.test(l.texto)));
      assert.equal(m.motivos.includes('pasa al frente'), dice, `seed ${p.seed} mano ${m.mano}`);
      if (dice) dichas++;
    }
  }
  assert.ok(dichas > 0, 'la prueba no vio ningun cambio de lider');
});

test('"apuesta grande" tambien se cuenta en registros viejos que no traen `ganado` (usa lo movido)', async () => {
  let grandes = 0;
  for (const p of await muchas()) {
    const vieja = structuredClone(p);
    for (const r of vieja.rondas) if (r.resolucion) delete r.resolucion.ganado;
    // los bots casi nunca apuestan tanto: a la primera mano resuelta se le pone una apuesta de 2 fichas y 1 de espacio
    const primera = vieja.rondas.find((r) => r.resolucion);
    if (primera) primera.resolucion.movidas = { fichas: 2, espacios: 1 };
    for (const m of puntuarManos(vieja)) {
      const res = vieja.rondas.slice(m.registros[0], m.registros[1] + 1).find((r) => r.resolucion)?.resolucion;
      const esperado = !!res && res.movidas.fichas + res.movidas.espacios >= 3;
      assert.equal(m.motivos.includes('apuesta grande'), esperado, `seed ${p.seed} mano ${m.mano}`);
      if (esperado) grandes++;
    }
  }
  assert.ok(grandes > 0, 'la prueba no vio ninguna apuesta grande');
});

test('al aceptar, quien anuncio antes recupera su apuesta: el beat trae primero el paso `recupera` con sus fichas (el pozo ya no exagera lo apostado)', async () => {
  let aceptados = 0;
  for (const p of await todas()) {
    const beats = construirLineaDeTiempo(p);
    for (const b of beats.filter((x) => x.tipo === 'acepta')) {
      aceptados++;
      const r = p.rondas[b.registro];
      const previo = p.rondas.slice(0, b.registro).filter((x) => x.mano === r.mano && (x.accion === 'anunciar' || x.accion === 'aceptar')).at(-1);
      assert.equal(b.pasos[0].tipo, 'recupera', b.id);
      assert.equal(b.pasos[0].asiento, previo.asiento, `${b.id}: recupera quien anuncio antes`);
      assert.deepEqual({ fichas: b.pasos[0].fichas, espacios: b.pasos[0].espacios }, previo.apuesta, `${b.id}: lo que habia apostado`);
    }
    assert.ok(beats.filter((x) => x.tipo !== 'acepta').every((x) => !x.pasos.some((q) => q.tipo === 'recupera')), 'solo aceptar devuelve una apuesta');
  }
  assert.ok(aceptados > 10, `solo ${aceptados} aceptados`);
  assert.deepEqual(eventosDePaso({ tipo: 'recupera' }), ['ficha']);
});

test('la placa dice lo que hizo el jugador: aceptar no se llama "Anuncia", y una jugada del juego lo dice', () => {
  assert.equal(rolDeJugada({ tipo: 'anuncio', pasos: [] }), 'Anuncia');
  assert.equal(rolDeJugada({ tipo: 'acepta', pasos: [{ tipo: 'recupera' }, { tipo: 'apuesta' }, { tipo: 'anuncio' }] }), 'Acepta');
  assert.equal(rolDeJugada({ tipo: 'duda', pasos: [{ tipo: 'duda' }] }), 'Duda');
  assert.equal(rolDeJugada({ tipo: 'defensa', pasos: [{ tipo: 'iguala' }] }), 'Iguala');
  assert.equal(rolDeJugada({ tipo: 'defensa', pasos: [{ tipo: 'pliega' }] }), 'Se retira');
  assert.equal(rolDeJugada({ tipo: 'duda', reemplazo: true, pasos: [] }), 'Jugada del juego');
  for (const basura of [null, undefined, {}, { tipo: 'raro' }, 7]) assert.equal(rolDeJugada(basura), '');
});

test('el recuadro del anuncio no le atribuye a la IA una jugada que puso el juego', () => {
  const e = (beat, nombre = 'Claude') => etiquetaDeJugada(beat, nombre);
  assert.deepEqual(e({ tipo: 'anuncio', pasos: [] }), { texto: 'Claude anuncia', alerta: false });
  assert.deepEqual(e({ tipo: 'acepta', pasos: [] }), { texto: 'Claude acepta y sube', alerta: false });
  assert.deepEqual(e({ tipo: 'duda', pasos: [] }), { texto: 'Claude duda', alerta: true });
  assert.deepEqual(e({ tipo: 'defensa', pasos: [{ tipo: 'iguala' }] }), { texto: 'Claude iguala la subida', alerta: false });
  assert.deepEqual(e({ tipo: 'defensa', pasos: [{ tipo: 'pliega' }] }), { texto: 'Claude se retira', alerta: true });
  for (const tipo of ['anuncio', 'acepta', 'duda', 'defensa']) assert.deepEqual(e({ tipo, reemplazo: true, pasos: [] }), { texto: 'El juego juega por Claude', alerta: false }, tipo);
  assert.deepEqual(e(null), { texto: '', alerta: false });
});

test('?voz= y los audios de voz.json solo aceptan rutas relativas de este mismo sitio (nada de URL de otro dominio en la pagina publicada)', () => {
  for (const bien of ['voz.json', 'voz/ep1/voz.json', 'a-b_c.1/x.ogg']) assert.equal(esRutaRelativa(bien), true, bien);
  for (const mal of ['https://x.com/a.json', 'http://x.com/a', '//x.com/a.json', '/abs/a.json', '../a.json', 'a/../b.json', 'a\\b', 'voz.json?x=1', 'a b.json', '', null, undefined, 7]) assert.equal(esRutaRelativa(mal), false, String(mal));
  assert.equal(leerParametros('voz=voz/ep1.json').voz, 'voz/ep1.json');
  assert.equal(leerParametros('voz=https://x.com/a.json').voz, null);
  assert.equal(leerParametros('voz=../secreto.json').voz, null);
});

test('un color de carta desconocido no rompe el recuadro del anuncio: la forma sale vacia', () => {
  assert.equal(gemaDe('rojo'), CARTAS.rojo.gema);
  for (const raro of ['negro', undefined, null, '', 7]) assert.equal(gemaDe(raro), '');
});

test('los textos que ve el publico en la barra de la escena llevan acentos (la pagina se publica)', () => {
  const cadenas = leer('casino/escena-duda.js').match(/'[^'\n]*'|`[^`\n]*`|"[^"\n]*"/g) ?? [];
  const sinAcento = cadenas.filter((c) => /\b(pagina|Parametros|minimos|abrio|valido)\b/.test(c));
  assert.deepEqual(sinAcento, [], 'cadenas sin acento');
});

test('mesa.css: la medalla "Pieza" no se sale de la zona segura y las cartas de la mano giran sobre su centro (no sobre un punto lejano)', () => {
  const css = leer('casino/mesa.css');
  const medalla = /\.medalla \{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.ok(medalla.includes('position:absolute'), 'no se encontro la regla de la medalla');
  assert.doesNotMatch(medalla, /(left|right)\s*:\s*-/, 'la medalla se sale por un lado');
  assert.match(css, /\.mano-cartas \.carta \{[^}]*transform-origin:\s*50% 50%/);
});

test('el pozo se llama "Apuestas": ahi no se juntan los pagos a la banca', () => {
  assert.match(leer('casino/escena-duda.js'), /<span>Apuestas<\/span>/);
  assert.doesNotMatch(leer('casino/escena-duda.js'), /<span>Banca<\/span>/);
});
