// E10: nombre y color de cada reino. Colores de web/paleta.js (una sola fuente), variante si son de la misma familia o se parecen, nombres validados,
// y todo viaja al puente (opciones.era.facciones), a la capa de OBS y a la evidencia.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PALETA } from '../../../web/paleta.js';
import { claveDePaleta, colorearReinos, resolverPresentacion, separacion, SEPARACION_MINIMA, validarNombreReino } from '../../worldbox/era/presentacion-era.js';
import { correrEra } from '../../worldbox/era/orquestador-era.js';
import { crearAdaptadorEraSimulado } from '../../worldbox/era/adaptador-era-simulado.js';
import { crearBotEra } from '../../worldbox/era/bots-era.js';
import { crearEstadoVivoEra } from '../../worldbox/era/vivo-era.js';
import { main as mundo } from '../../../herramientas/worldbox-era-mundo.mjs';

const CLAUDE = 'anthropic/claude-sonnet-5.5', GPT = 'openai/gpt-6.1-sol', GEMINI = 'google/gemini-3.8-flash';
const CORTA_P = { anioMuro: 60, anioLimite: 90, aniosBorrador: 5, intervencionesDesarrollo: [20, 35, 50], intervencionesGuerra: [1, 3], aniosEsperaRasgos: 5 };

test('la clave de paleta sale del id del modelo (tabla exacta, o proveedor para ids nuevos)', () => {
  assert.equal(claveDePaleta(CLAUDE), 'claude');
  assert.equal(claveDePaleta('anthropic/claude-haiku-5.5'), 'haiku');
  assert.equal(claveDePaleta('anthropic/claude-opus-9'), 'claude');
  assert.equal(claveDePaleta('x-ai/grok-9'), 'grok');
  assert.equal(claveDePaleta('mistralai/mistral-large-9'), 'mistral');
  assert.equal(claveDePaleta('mi-modelo'), null);
  assert.equal(claveDePaleta('bot-era-militar'), null);
});

test('cada reino toma el color de la paleta de su modelo, sin copiarlo', () => {
  const [a, b] = colorearReinos([CLAUDE, GPT]);
  assert.equal(a.color, PALETA.claude.color.toUpperCase()); assert.equal(b.color, PALETA.gpt.color.toUpperCase());
  assert.deepEqual([a.regla, b.regla], ['marca', 'marca']);
  const [g, h] = colorearReinos([GPT, GEMINI]);
  assert.equal(g.color, PALETA.gpt.color.toUpperCase()); assert.equal(h.color, PALETA.gemini.color.toUpperCase());
  assert.ok(separacion(g.color, h.color) >= SEPARACION_MINIMA);
});

test('misma familia (o colores parecidos): el segundo usa una variante claramente distinta, determinista', () => {
  for (const par of [[CLAUDE, CLAUDE], [GPT, GPT], [CLAUDE, 'anthropic/claude-haiku-5.5'], [GPT, 'openai/gpt-6-luna'], [GEMINI, GEMINI]]) {
    const [a, b] = colorearReinos(par);
    assert.equal(a.color, PALETA[a.clave].color.toUpperCase(), 'A conserva el color de marca');
    assert.notEqual(a.color, b.color);
    assert.equal(b.regla, 'familia');
    assert.ok(separacion(a.color, b.color) >= SEPARACION_MINIMA, `${par}: ${separacion(a.color, b.color)}`);
    assert.deepEqual(colorearReinos(par), [a, b].map(x => ({ ...x })));
  }
  // Mistral y Claude de familias distintas pero naranjas parecidos: el B se separa por la regla de parecido.
  const [m, c] = colorearReinos(['mistralai/mistral-medium-3-5', CLAUDE]);
  assert.ok(separacion(m.color, c.color) >= SEPARACION_MINIMA);
});

test('modelos desconocidos y bots: neutros distintos; --color-a/--color-b mandan', () => {
  const [a, b] = colorearReinos(['bot-era-militar', 'bot-era-economico']);
  assert.ok(a.regla === 'neutro' && b.regla === 'neutro' && separacion(a.color, b.color) >= SEPARACION_MINIMA);
  const m = colorearReinos([CLAUDE, GPT], ['#112233', '#445566']);
  assert.deepEqual(m.map(x => x.color), ['#112233', '#445566']); assert.equal(m[0].regla, 'manual');
  assert.throws(() => colorearReinos([CLAUDE, GPT], ['rojo']), { codigo: 'color_invalido' });
});

test('nombres de reino: por omisión el del modelo, validados y sin duplicados', () => {
  const p = [{ id: 'f1', modelo: CLAUDE }, { id: 'f2', modelo: GPT }];
  const r = resolverPresentacion({ participantes: p });
  assert.deepEqual(r.participantes.map(x => x.reino), ['Claude', 'GPT']);
  assert.deepEqual(r.facciones, [{ faccion: 'f1', nombre_reino: 'Claude', color: '#D97757' }, { faccion: 'f2', nombre_reino: 'GPT', color: '#F4F4F2' }]);
  const n = resolverPresentacion({ participantes: p, o: { 'nombre-reino-a': 'Tierra de Fuego', 'nombre-reino-b': "N'Dar", 'nombre-a': 'Claude Sonnet' } });
  assert.deepEqual(n.participantes.map(x => x.reino), ['Tierra de Fuego', "N'Dar"]);
  assert.equal(n.participantes[0].nombre, 'Claude Sonnet', '--nombre-a es el nombre del MODELO en pantalla, no el del reino');
  const mismo = resolverPresentacion({ participantes: [{ id: 'f1', modelo: CLAUDE }, { id: 'f2', modelo: CLAUDE }] });
  assert.deepEqual(mismo.participantes.map(x => x.reino), ['Claude A', 'Claude B']);
  assert.throws(() => resolverPresentacion({ participantes: p, o: { 'nombre-reino-a': 'Igual', 'nombre-reino-b': 'igual' } }), { codigo: 'nombre_reino_repetido' });
  for (const malo of ['', 'x'.repeat(25), '<b>', 'Dos  espacios', ' Reino', 'Reino ']) assert.throws(() => validarNombreReino(malo), { codigo: 'nombre_reino_invalido' }, malo);
  validarNombreReino('x'.repeat(24)); validarNombreReino('Ñandú-2');
});

test('--colores-juego no envía color al puente (el nombre sí)', () => {
  const r = resolverPresentacion({ participantes: [{ id: 'f1', modelo: CLAUDE }, { id: 'f2', modelo: GPT }], o: { 'colores-juego': true } });
  assert.deepEqual(r.facciones, [{ faccion: 'f1', nombre_reino: 'Claude' }, { faccion: 'f2', nombre_reino: 'GPT' }]);
  assert.equal(r.participantes[0].regla_color, 'juego');
});

test('la partida de la era envía facciones al puente y la capa recibe el nombre del reino y el color', async () => {
  const pedidos = [], sim = crearAdaptadorEraSimulado();
  const participantes = [CLAUDE, GPT].map((m, i) => ({ id: `f${i + 1}`, modelo: m, decidir: crearBotEra('bot-era-militar', 1 + i) }));
  const reinos = resolverPresentacion({ participantes: participantes.map(({ id, modelo }) => ({ id, modelo })), o: { 'nombre-reino-b': 'Imperio Marfil' } });
  const escrituras = [];
  const vivo = crearEstadoVivoEra({ ruta: 'x', participantes: reinos.participantes.map(r => ({ id: r.id, modelo: r.modelo, nombre: r.nombre, reino: r.reino, color: r.color_marca })), partida: { anioLimite: 90, anioMuro: 60 }, escribir: async (_, v) => { escrituras.push(v); } });
  const res = await correrEra({ adaptador: { ...sim, era: sim.era, reiniciarEscenario: async d => { pedidos.push(d); return sim.reiniciarEscenario(d); } }, participantes, semilla: 7, partida: CORTA_P, reinos,
    observador: { emitir: vivo.emitir, colores: vivo.fijarColores, nombre: id => vivo.ids.get(id).nombre } });
  assert.deepEqual(pedidos[0].opciones.era.facciones, [{ faccion: 'f1', nombre_reino: 'Claude', color: '#D97757' }, { faccion: 'f2', nombre_reino: 'Imperio Marfil', color: '#F4F4F2' }]);
  const inicio = res.eventos.find(e => e.tipo === 'inicio');
  assert.deepEqual(inicio.reinos.map(r => [r.id, r.reino, r.color]), [['f1', 'Claude', '#D97757'], ['f2', 'Imperio Marfil', '#F4F4F2']]);
  const caras = escrituras.at(-1).facciones;
  assert.deepEqual(caras.map(f => [f.nombre, f.reino, f.color]), [['Claude', 'Claude', '#D97757'], ['GPT', 'Imperio Marfil', '#F4F4F2']]);
});

test('«solo mirar el mapa» acepta nombre y color de reino', async () => {
  const pedidos = [], sim = crearAdaptadorEraSimulado();
  await mundo(['--sin-esperar', '--modelo-a=' + CLAUDE, '--modelo-b=' + CLAUDE, '--nombre-reino-a=Norte', '--color-b=#00FF00'], { salida: () => {}, adaptador: { ...sim, era: sim.era, reiniciarEscenario: async d => { pedidos.push(d); return sim.reiniciarEscenario(d); } } });
  assert.deepEqual(pedidos[0].opciones.era.facciones, [{ faccion: 'f1', nombre_reino: 'Norte', color: '#D97757' }, { faccion: 'f2', nombre_reino: 'Claude B', color: '#00FF00' }]);
});
