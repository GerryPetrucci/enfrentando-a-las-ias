// Los nombres de reino de la Guerra de territorios dependen del modelo que ocupa el asiento y no del asiento (decidido el 18 de octubre de 2026): el nombre de color de cada reino coincide con el color
// global de su IA (Claude naranja = Ambar, GPT blanco = Marfil, DeepSeek azul = Azur, Llama magenta = Rosa, Gemini multicolor = Iris). Los demas jugadores (bots, modelos sin color propio) toman los
// nombres que sobran, en el orden de siempre, asi una partida solo de bots queda igual que antes.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearRng } from '../../rng.js';
import { crearEstado } from '../../juegos/conquista/estado.js';
import { normalizarRespuesta } from '../../juegos/conquista/ordenes.js';
import { vistaTexto } from '../../juegos/conquista/vista.js';
import { resumenPublico } from '../../juegos/conquista/texto.js';
import { aplicarTurno } from '../../juegos/conquista/turno/index.js';
import { economico } from '../../juegos/conquista-bots.js';
import { MARAVILLA } from '../../juegos/conquista/constantes.js';
import { nombresDeReinos, NOMBRES_POSIBLES, REINO_POR_MODELO } from '../../juegos/conquista/nombres.js';
import conquista from '../../juegos/conquista.js';
import { correrPartida } from '../../arena.js';
import { resolverAgente } from '../../agentes.js';
import { PALETA } from '../../../web/paleta.js';

const estadoCon = (nombres, k = nombres.length) => crearEstado(crearRng(7), { jugadores: k, nombres });

test('cada modelo con color propio recibe el reino de su color; el resto toma los nombres que sobran en el orden de siempre', () => {
  assert.deepEqual(nombresDeReinos(['claude', 'gpt', 'gemini', 'deepseek']), ['Ambar', 'Marfil', 'Iris', 'Azur']);
  assert.deepEqual(nombresDeReinos(['gpt', 'gemini', 'deepseek', 'claude']), ['Marfil', 'Iris', 'Azur', 'Ambar'], 'rotar los asientos no cambia el reino de cada modelo');
  assert.deepEqual(nombresDeReinos(['llama', 'claude']), ['Rosa', 'Ambar']);
  assert.deepEqual(nombresDeReinos(['agresivo', 'pacifico', 'economico', 'azar']), ['Azur', 'Ambar', 'Violeta', 'Rosa'], 'solo bots: los nombres por asiento de siempre');
  assert.deepEqual(nombresDeReinos(['agresivo', 'claude', 'pacifico', 'gpt']), ['Azur', 'Ambar', 'Violeta', 'Marfil'], 'mezcla: los bots toman los que sobran');
});

test('los nombres nunca se repiten: el segundo del mismo color (o el mismo modelo dos veces) toma uno libre', () => {
  assert.deepEqual(nombresDeReinos(['claude', 'haiku']), ['Ambar', 'Azur']);
  assert.deepEqual(nombresDeReinos(['gpt', 'gpt', 'gpt']), ['Marfil', 'Azur', 'Ambar']);
  for (const ids of [['claude', 'gpt', 'gemini', 'deepseek', 'llama'], ['x', 'y', 'z', 'w', 'v'], [undefined, null, 'claude'], ['nemotron-ultra', 'laguna']]) {
    const n = nombresDeReinos(ids);
    assert.equal(new Set(n).size, ids.length, `repetidos en ${JSON.stringify(n)}`);
    for (const x of n) assert.ok(NOMBRES_POSIBLES.includes(x), x);
  }
});

test('el reino de cada modelo es del color de su IA en la paleta global (si no, el publico no entiende de quien se habla)', () => {
  const COLOR_DE_NOMBRE = { Ambar: 'naranja', Marfil: 'blanco', Azur: 'azul', Rosa: 'magenta', Iris: 'multicolor' };
  assert.deepEqual(Object.entries(REINO_POR_MODELO).filter(([id]) => ['claude', 'gpt', 'gemini', 'deepseek', 'llama'].includes(id)).map(([id, n]) => `${id}:${COLOR_DE_NOMBRE[n]}`),
    ['claude:naranja', 'gpt:blanco', 'gemini:multicolor', 'llama:magenta', 'deepseek:azul']);
  for (const id of Object.keys(REINO_POR_MODELO)) assert.ok(PALETA[id], `${id} no esta en la paleta global`);
  assert.ok(Array.isArray(PALETA.gemini.multi) && PALETA.gemini.multi.length > 2, 'Gemini es multicolor');
});

test('crearEstado usa los nombres que recibe (uno por asiento, distintos y de la lista) y, si no sirven, los de siempre', () => {
  assert.deepEqual(estadoCon(['Ambar', 'Marfil', 'Iris']).reinos.map((r) => r.nombre), ['Ambar', 'Marfil', 'Iris']);
  assert.deepEqual(crearEstado(crearRng(7), { jugadores: 3 }).reinos.map((r) => r.nombre), ['Azur', 'Ambar', 'Violeta']);
  for (const mal of [['Ambar'], ['Ambar', 'Ambar', 'Rosa'], ['Ambar', 'Narnia', 'Rosa'], 'Ambar', [1, 2, 3], null]) {
    assert.deepEqual(crearEstado(crearRng(7), { jugadores: 3, nombres: mal }).reinos.map((r) => r.nombre), ['Azur', 'Ambar', 'Violeta'], JSON.stringify(mal));
  }
});

test('lo que escribe una IA se entiende con los nombres de SU partida: ordenes, pacto, privados', () => {
  const E = estadoCon(['Ambar', 'Marfil', 'Iris']);
  const r = normalizarRespuesta({ ordenes: ['aceptar Iris', 'romper Marfil', 'ofrecer Iris Oro 2 Roca 2', 'regalar oro 1 Ámbar'], pacto_con: 'Marfil', privados: [{ a: 'Iris', texto: 'hola' }, { a: 'Azur', texto: 'no esta' }] }, E);
  assert.deepEqual(r.ordenes.map((o) => [o.tipo, o.reino]), [['aceptar', 2], ['romper', 1], ['ofrecer', 2], ['regalar', 0]]);
  assert.equal(r.pactoCon, 1);
  // Azur es un nombre de siempre que no esta en esta partida: se lee como un asiento que no existe (3) y las fases del turno lo descartan, igual que antes con los nombres por asiento
  assert.deepEqual(r.privados, [{ a: 2, texto: 'hola' }, { a: 3, texto: 'no esta' }]);
  assert.deepEqual(normalizarRespuesta({ privados: [{ a: 'Narnia', texto: 'x' }] }, E).descartadas.map((d) => d.motivo), ['destinatario o texto invalido'], 'un nombre que no existe en ningun lado se descarta al leer');
  // sin estado (como lo llaman las pruebas viejas) valen los nombres de siempre
  const vieja = normalizarRespuesta({ ordenes: ['aceptar Ambar'], pacto_con: 'Violeta' });
  assert.equal(vieja.ordenes[0].reino, 1);
  assert.equal(vieja.pactoCon, 2);
});

test('la vista y el resumen que ven las IAs usan los nombres de la partida', () => {
  const E = estadoCon(['Ambar', 'Marfil', 'Iris', 'Azur']);
  E.mensajesPrevios = [{ k: 2, texto: 'Paz a todos' }];
  E.resumenPrevio = resumenPublico([{ tipo: 'conquista', k: 0, contra: 3, r: 4 }, { tipo: 'pacto', k: 1, con: 2 }], E.reinos.map((r) => r.nombre));
  const v = vistaTexto(E, 1);
  assert.match(v, /Eres Marfil\./);
  assert.ok(v.includes('Iris: "Paz a todos"'), 'los mensajes publicos dicen quien los escribio con su nombre');
  assert.ok(v.includes('Ambar conquisto R05 de Azur. Marfil y Iris firmaron un pacto.'), E.resumenPrevio.join(' | '));
  assert.ok(!v.includes('Violeta'), 'ningun nombre de otro asiento');
});

test('el resumen que ven todas las IAs del turno anterior dice los reinos con los nombres de la partida', () => {
  const E = estadoCon(['Ambar', 'Marfil', 'Iris']);
  const resp = (pacto) => normalizarRespuesta({ ordenes: [], pacto_con: pacto, mensaje: '', privados: [], nota: '', razon: '' }, E);
  aplicarTurno(E, [resp('Marfil'), resp('Ambar'), resp(null)]);
  assert.ok(E.resumenPrevio.some((l) => /^(Ambar y Marfil|Marfil y Ambar) firmaron un pacto$/.test(l)), E.resumenPrevio.join(' | '));
  assert.ok(!E.resumenPrevio.join(' ').includes('Azur'), 'nada de los nombres por asiento');
  assert.match(vistaTexto(E, 2), /Sucedio el turno anterior: (Ambar y Marfil|Marfil y Ambar) firmaron un pacto\./);
});

test('los bots de control usan los nombres de la partida y la Maravilla que construyen cuesta lo que dice la regla', () => {
  const E = estadoCon(['Ambar', 'Marfil', 'Iris']);
  E.reinos[0].ofertasIn = [{ de: 2, doy: 'Oro', dc: 4, pido: 'Roca', pc: 4 }];
  assert.ok(economico(E, 0).ordenes.includes('aceptar Iris'), 'acepta al reino que le ofrecio, por su nombre en esta partida');
  const construir = (stock) => { const F = estadoCon(['Ambar', 'Marfil', 'Iris']); Object.assign(F.reinos[0].stock, stock); return economico(F, 0).ordenes.some((o) => /maravilla/.test(o)); };
  const justo = { ...MARAVILLA.costo };
  assert.equal(construir(justo), true, 'con el costo exacto la construye');
  assert.equal(construir({ Roca: 10, Madera: 8, Hierro: 6, Oro: 6 }), false, 'con el costo viejo ya no la intenta');
});

test('la arena le da al juego el nombre de cada modelo, el juego lo usa en la partida y lo guarda para la escena', async () => {
  const agentes = ['claude', 'gpt', 'pacifico', 'economico'].map((id) => ({ ...resolverAgente(id === 'claude' || id === 'gpt' ? 'pacifico' : id, conquista), id }));
  const p = await correrPartida({ juego: conquista, agentes, seed: 5, maxRondas: 4 });
  assert.deepEqual(p.reinos, ['Ambar', 'Marfil', 'Azur', 'Violeta']);
  const pacifico = p.rondas.flatMap((r) => r.respuestas).filter((x, i) => x && i % 4 === 2);
  assert.ok(pacifico.some((x) => x.pactoCon === 0), 'el pacifico (asiento 2) le propone pacto al primero que sigue vivo, Claude (asiento 0, «Ambar»): se entendio con los nombres de la partida y no con los de siempre');
  const sinModelos = await correrPartida({ juego: conquista, agentes: ['agresivo', 'pacifico', 'economico', 'azar'].map((id) => resolverAgente(id, conquista)), seed: 5, maxRondas: 2 });
  assert.deepEqual(sinModelos.reinos, ['Azur', 'Ambar', 'Violeta', 'Rosa']);
});
