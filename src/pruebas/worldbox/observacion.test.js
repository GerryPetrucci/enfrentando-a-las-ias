import test from 'node:test';
import assert from 'node:assert/strict';
import { construirObservacion, faccionNormalizada } from '../../worldbox/observacion.js';
import { hash, canonico } from '../../worldbox/util.js';

const f = (id, extra = {}) => ({ id, vivo: true, poblacion: 20, ciudades: 1, territorio: 3, recursos: 20, objetivos: 0, cooldowns: {}, ...extra });
const crudo = (extra = {}) => ({ origen: 'simulado', turno_juego: 0, tiempo_juego_s: 0, faccion: f('b'), rivales: [f('d'), f('c')], mundo: { tamano_mapa: 64, libres: 55 }, ...extra });

test('la observacion tiene un orden fijo de campos, rivales ordenados y hash sha256 del JSON canonico', () => {
  const { observation, observation_hash } = construirObservacion(crudo());
  assert.deepEqual(Object.keys(observation), ['origen', 'turno_juego', 'tiempo_juego_s', 'faccion', 'rivales', 'mundo']);
  assert.deepEqual(Object.keys(observation.faccion), ['id', 'vivo', 'poblacion', 'ciudades', 'territorio', 'recursos', 'objetivos', 'cooldowns']);
  assert.deepEqual(observation.rivales.map(r => r.id), ['c', 'd']);
  assert.match(observation_hash, /^[0-9a-f]{64}$/); assert.equal(observation_hash, hash(observation));
  // El hash no depende del orden en que el adaptador escriba sus claves ni de en que orden entreguen los rivales.
  const desordenado = { mundo: { libres: 55, tamano_mapa: 64 }, rivales: [f('c'), f('d')].map(x => Object.fromEntries(Object.entries(x).reverse())), faccion: Object.fromEntries(Object.entries(f('b')).reverse()), tiempo_juego_s: 0, turno_juego: 0, origen: 'simulado' };
  assert.equal(construirObservacion(desordenado).observation_hash, observation_hash);
  assert.equal(canonico({ b: 1, a: [2, { d: 1, c: 2 }] }), canonico({ a: [2, { c: 2, d: 1 }], b: 1 }));
  // Cualquier cambio visible cambia el hash.
  for (const cambio of [{ turno_juego: 1 }, { faccion: f('b', { recursos: 21 }) }, { rivales: [f('d'), f('c', { vivo: false })] }, { mundo: { tamano_mapa: 64, libres: 54 } }, { tiempo_juego_s: 1 }]) {
    assert.notEqual(construirObservacion(crudo(cambio)).observation_hash, observation_hash, JSON.stringify(Object.keys(cambio)));
  }
});
test('toda vista tiene los mismos campos para cualquier faccion (equidad) y descarta lo interno', () => {
  const a = construirObservacion(crudo({ faccion: f('c'), rivales: [f('b'), f('d')] })).observation, b = construirObservacion(crudo()).observation;
  assert.deepEqual(Object.keys(a.faccion), Object.keys(b.faccion)); assert.deepEqual(Object.keys(a.rivales[0]), Object.keys(b.rivales[0]));
  const ruido = construirObservacion(crudo({ secreto: 1, faccion: f('b', { rng: 5, objeto_unity: { x: 1 } }), rivales: [f('c', { oculto: true })], mundo: { tamano_mapa: 64, libres: 55, interno: [] } })).observation;
  assert.ok(!JSON.stringify(ruido).match(/secreto|rng|objeto_unity|oculto|interno/));
  assert.equal(construirObservacion(crudo({ origen: 'otra-cosa' })).observation.origen, 'puente');
  assert.equal(construirObservacion(crudo()).observation.origen, 'simulado');
});
test('la vista es una copia: modificar el crudo despues no la altera', () => {
  const raw = crudo({ faccion: f('b', { cooldowns: { fundar: 3 } }) });
  const { observation, observation_hash } = construirObservacion(raw);
  raw.faccion.cooldowns.fundar = 99; raw.faccion.recursos = 1; raw.rivales[0].poblacion = 0;
  assert.equal(observation.faccion.cooldowns.fundar, 3); assert.equal(hash(observation), observation_hash);
});
test('una vista malformada o ambigua se rechaza, nunca se corrige', () => {
  const malas = [crudo({ turno_juego: -1 }), crudo({ turno_juego: 1.5 }), crudo({ tiempo_juego_s: -1 }), crudo({ tiempo_juego_s: NaN }), crudo({ tiempo_juego_s: '1' }), crudo({ rivales: 'x' }), crudo({ rivales: [] , mundo: { tamano_mapa: 64, libres: 65 } }),
    crudo({ mundo: { tamano_mapa: 1, libres: 0 } }), crudo({ mundo: { tamano_mapa: 64, libres: -1 } }), crudo({ mundo: null }), crudo({ faccion: null }), crudo({ faccion: f('b', { vivo: 1 }) }), crudo({ faccion: f('b', { poblacion: -1 }) }),
    crudo({ faccion: f('b', { poblacion: 1.5 }) }), crudo({ faccion: f('b', { recursos: '20' }) }), crudo({ faccion: f('b', { objetivos: undefined }) }), crudo({ faccion: f('') }), crudo({ faccion: f('x'.repeat(41)) }), crudo({ faccion: f('b', { cooldowns: [] }) }),
    crudo({ faccion: f('b', { cooldowns: { Fundar: 1 } }) }), crudo({ faccion: f('b', { cooldowns: { fundar: -1 } }) }), crudo({ faccion: f('b', { cooldowns: { fundar: 'x' } }) }),
    crudo({ rivales: [f('b')] }), crudo({ rivales: [f('c'), f('c')] }), null, [], 'vista'];
  for (const m of malas) assert.throws(() => construirObservacion(m), /respuesta_invalida/, JSON.stringify(m)?.slice(0, 80));
  assert.throws(() => faccionNormalizada({ id: 'a', vivo: true }), /respuesta_invalida/);
  assert.deepEqual(faccionNormalizada({ id: 'a', vivo: false, poblacion: 0, ciudades: 0, territorio: 0, recursos: 5, objetivos: 1 }).cooldowns, {}, 'cooldowns ausente equivale a vacio');
});
test('los campos opcionales del juego real se validan y se conservan en un orden fijo; lo desconocido se descarta', () => {
  const real = { id: 'f1', vivo: true, especie: 'human', poblacion: 4, ciudades: 1, territorio: 9, recursos: 0, objetivos: 1, ejercito: 0, edificios: 2, comida: 3, salud_media_pct: 87, rey_vivo: true, cooldowns: {}, unidades_creadas: 5, unidades_creables_restantes: 25, interno: { x: 1 } };
  const norm = faccionNormalizada(real);
  assert.deepEqual(Object.keys(norm), ['id', 'vivo', 'especie', 'poblacion', 'ciudades', 'territorio', 'recursos', 'objetivos', 'ejercito', 'edificios', 'comida', 'salud_media_pct', 'rey_vivo', 'cooldowns', 'unidades_creadas', 'unidades_creables_restantes']);
  assert.deepEqual(Object.keys(faccionNormalizada({ ...real, unidades_creadas: undefined, unidades_creables_restantes: undefined, interno: undefined })).slice(-1), ['cooldowns']);
  // Sin opcionales la forma es la del simulador (los campos no se inventan).
  assert.deepEqual(Object.keys(faccionNormalizada({ id: 'a', vivo: true, poblacion: 1, ciudades: 1, territorio: 1, recursos: 1, objetivos: 1 })), ['id', 'vivo', 'poblacion', 'ciudades', 'territorio', 'recursos', 'objetivos', 'cooldowns']);
  for (const mal of [{ especie: 'Human' }, { especie: 5 }, { especie: 'x'.repeat(21) }, { ejercito: -1 }, { edificios: 1.5 }, { comida: '3' }, { salud_media_pct: -1 }, { salud_media_pct: 1001 }, { salud_media_pct: NaN }, { rey_vivo: 'si' },
    { unidades_creadas: -1 }, { unidades_creables_restantes: 1.5 }]) assert.throws(() => faccionNormalizada({ ...real, ...mal }), /respuesta_invalida/, JSON.stringify(mal));
  // El hash de la vista cambia con un campo opcional (nada se ignora sin avisar).
  const a = construirObservacion(crudo({ faccion: f('b', { edificios: 2 }) })), b = construirObservacion(crudo({ faccion: f('b', { edificios: 3 }) }));
  assert.notEqual(a.observation_hash, b.observation_hash);
});
test('las claves de cooldown se ordenan y una clave peligrosa no contamina el prototipo', () => {
  const x = faccionNormalizada(f('a', { cooldowns: { fundar: 3, atacar: 1 } }));
  assert.deepEqual(Object.keys(x.cooldowns), ['atacar', 'fundar']);
  const malicioso = JSON.parse('{"id":"a","vivo":true,"poblacion":1,"ciudades":1,"territorio":1,"recursos":1,"objetivos":1,"cooldowns":{"__proto__":5}}');
  assert.throws(() => faccionNormalizada(malicioso), /respuesta_invalida/);
  assert.equal({}.polluted, undefined);
});
