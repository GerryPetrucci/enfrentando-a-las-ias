// E9: opciones del puente que protegen el 1 vs 1 (vigilante del muro y un solo reino por civilización): por omisión no se envían (el puente las activa), se pueden apagar por CLI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { correrEra } from '../../worldbox/era/orquestador-era.js';
import { crearAdaptadorEraSimulado } from '../../worldbox/era/adaptador-era-simulado.js';
import { crearBotEra } from '../../worldbox/era/bots-era.js';
import { partidaDesdeCli } from '../../worldbox/era/correr-era.js';
import { opcionesControlEra, validarPartida, resolverPartida } from '../../worldbox/era/reglas-era.js';
import { main as mundo } from '../../../herramientas/worldbox-era-mundo.mjs';

const CORTA_P = { anioMuro: 60, anioLimite: 90, aniosBorrador: 5, intervencionesDesarrollo: [20, 35, 50], intervencionesGuerra: [1, 3], aniosEsperaRasgos: 5 };

test('opcionesControlEra: vacío por omisión; --sin-vigilante, --vigilante-modo y --sin-unico-reino se traducen a las opciones del puente', () => {
  assert.deepEqual(opcionesControlEra(resolverPartida({})), {});
  assert.deepEqual(opcionesControlEra({ vigilante: false, unicoReino: false }), { vigilante: false, unico_reino: false });
  assert.deepEqual(opcionesControlEra({ vigilanteModo: 'observar' }), { vigilante: { activo: true, modo: 'observar' } });
  const p = partidaDesdeCli({ 'sin-vigilante': true, 'sin-unico-reino': true });
  assert.equal(p.vigilante, false); assert.equal(p.unicoReino, false);
  assert.equal(partidaDesdeCli({}).vigilante, undefined);
  assert.equal(partidaDesdeCli({ 'vigilante-modo': 'eliminar' }).vigilanteModo, 'eliminar');
  assert.throws(() => validarPartida(resolverPartida({ vigilanteModo: 'otro' })), /configuracion_era_invalida/);
  validarPartida(resolverPartida({ vigilanteModo: 'devolver' }));
});

test('la partida de la era envía las opciones de control solo cuando se apagan', async () => {
  const hacer = async partida => {
    const sim = crearAdaptadorEraSimulado(), pedidos = [];
    const participantes = ['bot-era-militar', 'bot-era-economico'].map((m, i) => ({ id: `f${i + 1}`, modelo: m, decidir: crearBotEra(m, 1 + i) }));
    await correrEra({ adaptador: { ...sim, era: sim.era, reiniciarEscenario: async d => { pedidos.push(d); return sim.reiniciarEscenario(d); } }, participantes, semilla: 7, partida: { ...CORTA_P, ...partida } });
    return pedidos[0].opciones.era;
  };
  const porOmision = await hacer({});
  assert.ok(!('vigilante' in porOmision) && !('unico_reino' in porOmision));
  const apagado = await hacer({ vigilante: false, unicoReino: false });
  assert.equal(apagado.vigilante, false); assert.equal(apagado.unico_reino, false);
});

test('«solo mirar el mapa» también respeta --sin-vigilante y --sin-unico-reino', async () => {
  const pedidos = [], sim = crearAdaptadorEraSimulado();
  await mundo(['--sin-esperar', '--sin-vigilante', '--sin-unico-reino'], { salida: () => {}, adaptador: { ...sim, era: sim.era, reiniciarEscenario: async d => { pedidos.push(d); return sim.reiniciarEscenario(d); } } });
  assert.equal(pedidos[0].opciones.era.vigilante, false); assert.equal(pedidos[0].opciones.era.unico_reino, false);
});
