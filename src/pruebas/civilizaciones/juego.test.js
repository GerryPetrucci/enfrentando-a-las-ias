import test from 'node:test';
import assert from 'node:assert/strict';
import { JUEGOS, obtenerJuego } from '../../juegos/index.js';
import { comprobarPresupuestoLlamadas, LIMITE_LLAMADAS } from '../../arena.js';
import { resolverAgente } from '../../agentes.js';
import { crearRng } from '../../rng.js';
import { civilizaciones, jugar, nuevoEstado } from './ayudas.js';

test('esta registrado y cumple el contrato de un juego: seis funciones, 2 jugadores, 30 rondas, version de reglas y categoria', () => {
  assert.equal(JUEGOS.civilizaciones, civilizaciones);
  assert.equal(obtenerJuego('civilizaciones').nombre, 'Carrera de civilizaciones');
  assert.equal(civilizaciones.categoria, 'Desarrollo y civilización');
  for (const f of ['crear', 'terminado', 'vista', 'normalizar', 'aplicar', 'resultado']) assert.equal(typeof civilizaciones[f], 'function', f);
  assert.deepEqual([civilizaciones.jugadores, civilizaciones.minJugadores, civilizaciones.maxJugadores, civilizaciones.rondas], [2, 2, 2, 30]);
  assert.equal(civilizaciones.versionReglas, 'civilizaciones-1.3.0');
  assert.equal(typeof civilizaciones.reglas, 'string');
  assert.doesNotThrow(() => JSON.parse(civilizaciones.formatoRespuesta));
  assert.deepEqual(Object.keys(civilizaciones.bots).sort(), ['adaptativa', 'azar', 'cientifico', 'equilibrado', 'expansionista', 'pasivo', 'voraz']);
});

test('C15: declara el corte duro de 100 llamadas: la arena reserva los dos asientos antes de cada fase y los agentes no reintentan', () => {
  assert.equal(civilizaciones.limiteLlamadasDuro, 100);
  assert.equal(LIMITE_LLAMADAS, 100);
  assert.equal(comprobarPresupuestoLlamadas(civilizaciones, 60, [true, true]), null, '60 decisiones caben');
  assert.equal(comprobarPresupuestoLlamadas(civilizaciones, 99, [true, true]).motivo, 'llamadas', 'si la fase pide 2 y queda 1, se corta antes de preguntar');
  assert.deepEqual(civilizaciones.activos(nuevoEstado()), [true, true], 'nadie cae: las dos juegan siempre');
});

test('solo hay 2 civilizaciones: otra cantidad es un error de uso al crear (no al normalizar)', () => {
  assert.throws(() => civilizaciones.crear(crearRng(1), { jugadores: 3 }), /de 2 civilizaciones/);
  assert.throws(() => civilizaciones.crear(crearRng(1), { jugadores: 1 }), /de 2 civilizaciones/);
  assert.doesNotThrow(() => civilizaciones.crear(crearRng(1), { jugadores: 2 }));
});

test('una partida completa por la arena: 30 turnos, 60 llamadas, ganador y resultado con puntos 3 / 0', async () => {
  const p = await jugar('cientifico', 'equilibrado', 5);
  assert.equal(p.truncada, false);
  assert.equal(p.rondas.length, 30);
  assert.equal(p.llamadas, 60);
  assert.ok([0, 1].includes(p.ganador));
  assert.deepEqual([...p.puntos].sort(), [0, 3]);
  assert.equal(p.puntos[p.ganador], 3);
  assert.deepEqual(p.orden, [p.ganador, 1 - p.ganador]);
  assert.equal(p.metricas.length, 2);
  for (const m of p.metricas) {
    assert.ok(m.indice >= 0 && m.indice <= 100);
    assert.equal(m.ordenesValidas <= m.ordenesTotal, true);
    for (const k of ['traiciones', 'promesasHechas', 'promesasRotas', 'jugadasInvalidas', 'ordenesValidas', 'ordenesTotal']) assert.equal(typeof m[k], 'number', k);
  }
  assert.equal(p.mapa.regs.length, 26, 'el mapa viaja dentro de la partida guardada');
  assert.equal(p.fundaciones.length, 2);
  assert.equal(p.indices.length, 3, 'Indice publicado en los turnos 10, 20 y 30');
  for (const r of p.rondas) assert.deepEqual(r.errores, [null, null]);
});

test('determinista: el mismo seed y los mismos agentes dan exactamente la misma partida (sin contar el tiempo)', async () => {
  const quitar = (p) => { const { duracionMs, ...resto } = p; return JSON.stringify(resto); };
  const [a, b] = [await jugar('expansionista', 'cientifico', 17), await jugar('expansionista', 'cientifico', 17)];
  assert.equal(quitar(a), quitar(b));
  const c = await jugar('expansionista', 'cientifico', 18);
  assert.notEqual(quitar(a), quitar(c), 'otro seed, otro mundo');
});

test('los asientos rotados juegan el mismo mundo: el seed manda y quien se sienta donde solo cambia quien es quien', async () => {
  const ab = await jugar('cientifico', 'equilibrado', 21), ba = await jugar('equilibrado', 'cientifico', 21);
  assert.equal(ab.seedMundo, ba.seedMundo);
  assert.deepEqual(ab.mapa, ba.mapa);
  assert.deepEqual(ab.sitios, ba.sitios);
  // mundos gemelos: con los mismos bots el resultado no depende del asiento (el desempate por sorteo es el unico efecto del asiento y aqui no hay empate)
  assert.deepEqual(ab.metricas.map((m) => m.indice), ba.metricas.map((m) => m.indice).reverse());
});

test('un modelo caido no tumba la partida: juega la respuesta vacia y el error queda registrado', async () => {
  const caido = { id: 'caido', nombre: 'Caido', color: '#888', inicial: 'C', tipo: 'modelo', modelo: 'x/y', async jugar() { throw new Error('HTTP 500'); } };
  const { correrPartida } = await import('../../arena.js');
  const p = await correrPartida({ juego: civilizaciones, agentes: [caido, resolverAgente('cientifico', civilizaciones)], seed: 3 });
  assert.equal(p.truncada, false);
  assert.equal(p.rondas[0].errores[0], 'HTTP 500');
  assert.equal(p.rondas[0].errores[1], null);
  assert.equal(p.fundaciones[0].valida, false, 'sin respuesta no hay fundacion valida');
  assert.equal(p.metricas[0].jugadasInvalidas, 30);
  assert.equal(p.ganador, 1);
});
