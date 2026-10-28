// Cupido oculto (lobo-1.3.0, spec 7-ter): la escena, la voz y la conversacion del sitio muestran de Cupido SOLO lo que dice el evento publico `enamorados` (segun el modo del seed)
// y lo descubren cuando muere un enamorado o llega el final. Las partidas de lobo-1.2.0 (evento sin `revela`, con todo) se narran igual que antes.
//
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { jugarLobo } from './ayudas-lobo.js';
import { MODOS_CUPIDO } from '../../juegos/lobo/constantes.js';
import { construirLineaDeTiempo } from '../../../web/casino/linea-de-tiempo-lobo.js';
import { conversacionDeLobo } from '../../../web/casino/conversacion-lobo.js';
import { Mesa } from '../../../web/casino/mesa-lobo.js';

const NOMBRES = ['Grok', 'Qwen', 'Mistral', 'MiniMax', 'GLM', 'Kimi', 'Gemini', 'DeepSeek'];
const jugadores = NOMBRES.map((nombre, i) => ({ id: `m${i}`, nombre }));
const ronda = (r, fase, eventos) => ({ ronda: r, fase, publico: { eventos: eventos.map((e) => ({ ronda: r, ...e })) } });
const partida = (rondas, extra = {}) => ({ seed: 5, jugadores, truncada: false, rondas, ...extra });
const ROLES = ['lobo', 'lobo', 'vidente', 'bruja', 'cazador', 'cupido', 'aldeano', 'aldeano'];
const voz = (b) => b.dicho.map((l) => l.texto).join(' ');
const beatDe = (beats, tipo, i = 0) => beats.filter((b) => b.tipo === tipo)[i];

const noche1 = (evento) => ronda(1, 'cupido', [evento]);
const amanecerCon = (...muertes) => ronda(1, 'vidente', [{ tipo: 'amanecer' }, ...muertes]);
const muerte = (asiento, extra = {}) => ({ tipo: 'muerte', asiento, rol: ROLES[asiento], causa: 'noche', ...extra });

test('[ambos] y los eventos de lobo-1.2.0 sin `revela`: Cupido y la pareja, como siempre', () => {
  for (const evento of [{ tipo: 'enamorados', asientos: [6, 7], cupido: 5, revela: 'ambos' }, { tipo: 'enamorados', asientos: [6, 7], cupido: 5 }]) {
    const b = beatDe(construirLineaDeTiempo(partida([noche1(evento)])), 'enamorados');
    assert.equal(b.texto, 'Kimi se revela como Cupido. Cupido une a Gemini y a DeepSeek: si uno cae, el otro cae con él.');
    assert.deepEqual(b.pasos[2].enamorados, [6, 7]);
    assert.equal(b.pasos[2].jugadores[5].rol, 'cupido');
    assert.match(b.lineas[0].texto, /^Kimi · 6 se revela como Cupido\. Gemini · 7 y DeepSeek · 8 quedan unidos/);
  }
});

test('[pareja] se dice quiénes son los enamorados, no quién es Cupido', () => {
  const b = beatDe(construirLineaDeTiempo(partida([noche1({ tipo: 'enamorados', asientos: [6, 7], revela: 'pareja' })])), 'enamorados');
  assert.equal(b.texto, 'Cupido une a Gemini y a DeepSeek: si uno cae, el otro cae con él.');
  assert.deepEqual(b.pasos[2].enamorados, [6, 7]);
  assert.equal(b.pasos[2].jugadores[5].rol, undefined);
  assert.doesNotMatch(b.texto + b.lineas[0].texto, /Kimi/);
});

test('[cupido] se dice quién es Cupido, no a quién eligió', () => {
  const b = beatDe(construirLineaDeTiempo(partida([noche1({ tipo: 'enamorados', cupido: 5, revela: 'cupido' })])), 'enamorados');
  assert.match(b.texto, /^Kimi se revela como Cupido\. /);
  assert.match(b.texto, /ha elegido a sus enamorados/);
  assert.doesNotMatch(b.texto, /Gemini|DeepSeek/);
  assert.deepEqual(b.pasos[2].enamorados, []);
  assert.equal(b.pasos[2].jugadores[5].rol, 'cupido');
  assert.equal(b.pasos[1].cupido, 5);
});

test('[nada] solo se sabe que Cupido eligió: ni él ni los enamorados aparecen', () => {
  const b = beatDe(construirLineaDeTiempo(partida([noche1({ tipo: 'enamorados', revela: 'nada' })])), 'enamorados');
  assert.ok(b, 'la noche 1 conserva su momento de Cupido');
  assert.match(b.texto, /^Cupido ha elegido a dos enamorados\. Nadie sabe quiénes son\.$/);
  assert.deepEqual(b.pasos[2].enamorados, []);
  assert.ok(b.pasos[2].jugadores.every((j) => j.rol === undefined));
  assert.equal(b.pasos[1].cupido, undefined);
  assert.equal(b.pasos[1].asientos, undefined);
  assert.ok(b.lineas[0].texto && !/\d/.test(b.lineas[0].texto), 'tampoco hay números de asiento');
});

test('un `enamorados` con asientos corruptos se sigue ignorando', () => {
  const beats = construirLineaDeTiempo(partida([noche1({ tipo: 'enamorados', asientos: [6], revela: 'pareja' })]));
  assert.equal(beatDe(beats, 'enamorados'), undefined);
});

test('al morir el primer enamorado se descubre la pareja (voz, subtítulo y estado) y la segunda muerte no lo repite', () => {
  const beats = construirLineaDeTiempo(partida([
    noche1({ tipo: 'enamorados', revela: 'nada' }),
    amanecerCon(muerte(6, { pareja: 7 }), muerte(7, { causa: 'amor' })),
  ]));
  const [primera, segunda] = beats.filter((b) => b.tipo === 'muerte');
  assert.deepEqual(primera.pasos[0].enamorados, [], 'antes de esta muerte nadie lo sabía');
  assert.deepEqual(primera.pasos[2].enamorados, [6, 7]);
  assert.equal(primera.pasos[1].pareja, 7);
  assert.match(voz(primera), /Era uno de los enamorados: su pareja era DeepSeek\./);
  assert.match(primera.lineas[0].texto, /Gemini · 7 es su pareja|DeepSeek · 8/);
  assert.equal(voz(primera), primera.texto);
  assert.deepEqual(segunda.pasos[2].enamorados, [6, 7]);
  assert.doesNotMatch(voz(segunda), /enamorados/);
});

test('si muere Cupido, su rol queda visible aunque el modo lo ocultara; la pareja sigue oculta', () => {
  const beats = construirLineaDeTiempo(partida([noche1({ tipo: 'enamorados', revela: 'nada' }), amanecerCon(muerte(5))]));
  const m = beatDe(beats, 'muerte');
  assert.equal(m.pasos[2].jugadores[5].rol, 'cupido');
  assert.deepEqual(m.pasos[2].enamorados, []);
  assert.doesNotMatch(voz(m), /enamorados/);
});

test('al final, los enamorados ocultos que sobreviven se nombran; si ya se conocían, el texto es el de siempre', () => {
  const final = { tipo: 'final', ganadorBando: 'aldea', motivo: 'eliminacion', roles: ROLES, puntos: Array(8).fill(0), enamorados: [6, 7] };
  const oculto = beatDe(construirLineaDeTiempo(partida([noche1({ tipo: 'enamorados', revela: 'nada' }), ronda(2, 'dia', [final])])), 'final');
  assert.deepEqual(oculto.pasos[2].enamorados, [6, 7]);
  assert.match(voz(oculto), /Se revelan todas las identidades\. Los enamorados eran Gemini y DeepSeek, y sobreviven: ganan su bono\.$/);
  const conocido = beatDe(construirLineaDeTiempo(partida([noche1({ tipo: 'enamorados', asientos: [6, 7], cupido: 5, revela: 'ambos' }), ronda(2, 'dia', [final])])), 'final');
  assert.match(voz(conocido), /Se revelan todas las identidades\. Los dos enamorados sobreviven y ganan su bono\.$/);
});

test('conversación del sitio: cada modo cuenta solo lo que revela', () => {
  const hechos = (evento) => conversacionDeLobo(partida([noche1(evento)])).flatMap((r) => r.hechos.map((h) => h.texto));
  assert.deepEqual(hechos({ tipo: 'enamorados', asientos: [6, 7], cupido: 5, revela: 'ambos' }), ['Kimi se revela como Cupido. Gemini y DeepSeek quedan unidos: si uno muere, el otro también.']);
  assert.deepEqual(hechos({ tipo: 'enamorados', asientos: [6, 7], cupido: 5 }), ['Kimi se revela como Cupido. Gemini y DeepSeek quedan unidos: si uno muere, el otro también.']);
  assert.deepEqual(hechos({ tipo: 'enamorados', asientos: [6, 7], revela: 'pareja' }), ['Cupido une a Gemini y a DeepSeek: si uno muere, el otro también.']);
  assert.deepEqual(hechos({ tipo: 'enamorados', cupido: 5, revela: 'cupido' }), ['Kimi se revela como Cupido y ha elegido a sus enamorados en secreto.']);
  assert.deepEqual(hechos({ tipo: 'enamorados', revela: 'nada' }), ['Cupido ha elegido a dos enamorados. Nadie sabe quiénes son.']);
});

test('conversación del sitio: la muerte que descubre a la pareja la nombra', () => {
  const r = conversacionDeLobo(partida([noche1({ tipo: 'enamorados', revela: 'nada' }), amanecerCon(muerte(6, { pareja: 7 }), muerte(7, { causa: 'amor' }))]));
  const textos = r.flatMap((x) => x.hechos.map((h) => h.texto));
  assert.ok(textos.includes('Gemini muere durante la noche: su rol era Aldeano. Era uno de los enamorados: su pareja era DeepSeek.'), textos.join('\n'));
  assert.ok(textos.includes('DeepSeek muere por su vínculo de amor: su rol era Aldeano.'));
});

for (const modo of MODOS_CUPIDO) {
  test(`[${modo}] partida jugada de punta a punta: antes de descubrirse, nada público delata lo oculto`, () => {
    for (const [seed, n] of [[3, 8], [12, 12], [21, 8]]) {
      const p = jugarLobo(seed, n, { modoCupido: modo });
      const { asiento: cupido, enamorados } = p.rondas[0].privado.acciones[0];
      const nombres = p.jugadores.map((j) => j.nombre);
      const beats = construirLineaDeTiempo(p);
      let paresRevelado = false;
      for (const b of beats) {
        const [antes, paso, despues] = b.pasos;
        if (paso.tipo === 'enamorados' && paso.asientos) paresRevelado = true;
        if (paso.tipo === 'muerte' && paso.pareja !== undefined) paresRevelado = true;
        if (paso.tipo === 'final') paresRevelado = true;
        if (!paresRevelado) {
          assert.deepEqual(despues.enamorados, [], `${modo}: la pareja aparece antes de tiempo en ${b.tipo}`);
        }
        // El momento de Cupido no nombra a los enamorados que el modo oculta (salvo que uno sea el propio Cupido, que sí se nombra).
        if (b.tipo === 'enamorados' && !paso.asientos) for (const e of enamorados.filter((x) => x !== cupido)) assert.ok(!voz(b).includes(nombres[e]) && !b.lineas[0].texto.includes(nombres[e]), voz(b));
        if (!['cupido', 'ambos'].includes(modo) && despues.jugadores[cupido].vivo && !despues.fin) {
          assert.equal(despues.jugadores[cupido].rol, undefined, `${modo}: se descubrió a Cupido en ${b.tipo}`);
        }
      }
      if (modo === 'nada' || modo === 'cupido') assert.ok(!beats.find((b) => b.tipo === 'enamorados').pasos[1].asientos, 'el paso no trae la pareja');
    }
  });
}

// La mesa (DOM) con un `this` falso: lo que se ROTULA y quien se ilumina en cada modo, sin navegador.
async function pintar(beats, tipo, i = 0) {
  const b = beats.filter((x) => x.tipo === tipo)[i], rotulos = [], notas = [], iluminados = [];
  globalThis.document = { createElement: () => ({ textContent: '' }) };
  const mesa = {
    limpiar() {}, aplicarEstado() {}, anim() {}, async secuencia() {}, rapido: true, nombre: (a) => NOMBRES[a],
    cabecera: { querySelector: () => ({ textContent: '' }) }, escenario: { classList: { toggle() {} } }, sobretitulo: { textContent: '' },
    escenaTexto: { append: (x) => notas.push(x.textContent) },
    rotular: (titulo, detalle) => rotulos.push([titulo, detalle]),
    asientos: NOMBRES.map((_, a) => ({ nodo: { classList: { add: (c) => c === 'objetivo-lobo' && iluminados.push(a) } } })),
  };
  await Mesa.prototype.contarMomento.call(mesa, b, 1000);
  delete globalThis.document;
  return { rotulos, notas, iluminados, sobretitulo: mesa.sobretitulo.textContent };
}

test('mesa: cada modo rotula solo lo que revela e ilumina solo a quien se ve', async () => {
  const vista = async (evento) => pintar(construirLineaDeTiempo(partida([noche1(evento)])), 'enamorados');
  const ambos = await vista({ tipo: 'enamorados', asientos: [6, 7], cupido: 5, revela: 'ambos' });
  assert.deepEqual(ambos.rotulos, [['6 · Kimi · Cupido', '7 · Gemini  ♥  8 · DeepSeek']]);
  assert.deepEqual(ambos.iluminados, [6, 7]);
  const pareja = await vista({ tipo: 'enamorados', asientos: [6, 7], revela: 'pareja' });
  assert.deepEqual(pareja.rotulos, [['Unidos por el destino', '7 · Gemini  ♥  8 · DeepSeek']]);
  assert.deepEqual(pareja.iluminados, [6, 7]);
  const cupido = await vista({ tipo: 'enamorados', cupido: 5, revela: 'cupido' });
  assert.deepEqual(cupido.rotulos, [['6 · Kimi · Cupido', 'Sus enamorados son un secreto']]);
  assert.deepEqual(cupido.iluminados, []);
  const nada = await vista({ tipo: 'enamorados', revela: 'nada' });
  assert.deepEqual(nada.rotulos, [['Cupido ha elegido', 'Sus enamorados son un secreto']]);
  assert.deepEqual(nada.iluminados, []);
  assert.equal(nada.sobretitulo, 'El vínculo de Cupido');
});

test('mesa: la muerte que descubre a la pareja la anota e ilumina a la pareja; el final la nombra', async () => {
  const final = { tipo: 'final', ganadorBando: 'aldea', motivo: 'eliminacion', roles: ROLES, puntos: Array(8).fill(0), enamorados: [6, 7] };
  const beats = construirLineaDeTiempo(partida([noche1({ tipo: 'enamorados', revela: 'nada' }), amanecerCon(muerte(6, { pareja: 7 }), muerte(7, { causa: 'amor' })), ronda(2, 'dia', [final])]));
  const primera = await pintar(beats, 'muerte', 0);
  assert.deepEqual(primera.notas, ['Era uno de los enamorados · pareja: 8 · DeepSeek']);
  assert.deepEqual(primera.iluminados, [7]);
  const segunda = await pintar(beats, 'muerte', 1);
  assert.deepEqual(segunda.notas, []);
  const oculto = construirLineaDeTiempo(partida([noche1({ tipo: 'enamorados', revela: 'nada' }), ronda(2, 'dia', [final])]));
  assert.deepEqual((await pintar(oculto, 'final')).rotulos, [['Victoria de la aldea', 'Los enamorados eran 7 · Gemini  ♥  8 · DeepSeek · bono +5 cada uno']]);
  const conocido = construirLineaDeTiempo(partida([noche1({ tipo: 'enamorados', asientos: [6, 7], cupido: 5, revela: 'ambos' }), ronda(2, 'dia', [final])]));
  assert.deepEqual((await pintar(conocido, 'final')).rotulos, [['Victoria de la aldea', 'Los enamorados sobreviven · bono +5 cada uno']]);
});
