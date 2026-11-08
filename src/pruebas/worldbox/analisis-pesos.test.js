import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analizarPesos, evaluarPesos, resumirCorrida, cargarCorridas } from '../../worldbox/analisis-pesos.js';

const f = (id, extra = {}) => ({ id, vivo: true, poblacion: 20, ciudades: 1, territorio: 3, recursos: 20, objetivos: 1, edificios: 5, ...extra });
// Corrida sintetica: modelos y estado final de cada reino (+ calidad de sitio).
const corrida = (modelos, finales, { turnos = 24, sitio = { f1: 500, f2: 500 } } = {}) => ({ modelos, ids: ['f1', 'f2'], final: finales.map((x, i) => f(`f${i + 1}`, x)), turnos, razon: 'turnos', completo: true, calidad_sitio: sitio, hash_mundo: null, turnosEvento: [] });
const pasivos = [corrida(['bot-pasivo', 'bot-pasivo'], [{ poblacion: 30 }, { poblacion: 20 }]), corrida(['bot-pasivo', 'bot-pasivo'], [{ poblacion: 20 }, { poblacion: 30 }]), corrida(['bot-pasivo', 'bot-pasivo'], [{ poblacion: 25 }, { poblacion: 25 }])];

test('ruido = desviacion de f1 - f2 entre pasivos; una metrica constante no tiene ruido ni peso sugerido', () => {
  const a = analizarPesos(pasivos, { metricas: ['poblacion', 'ciudades'] });
  assert.equal(a.partidas_ruido, 3); assert.equal(a.partidas_activo_contra_pasivo, 0);
  const p = a.metricas.find(m => m.metrica === 'poblacion'), c = a.metricas.find(m => m.metrica === 'ciudades');
  assert.equal(p.ruido, 8.16); assert.equal(p.diferencia_abs_media_pasivos, 6.67); assert.equal(p.peso_sugerido, 0.612); assert.equal(p.senal, null);
  assert.deepEqual([c.ruido, c.peso_sugerido, c.snr], [0, null, null], 'ciudades no varia: no discrimina nada');
});
test('las parejas de conductas deterministas identicas tambien miden ruido (A contra A), y las distintas nunca', () => {
  const exp = corrida(['bot-expansionista', 'bot-expansionista'], [{ poblacion: 60 }, { poblacion: 44 }]), mixta = corrida(['bot-pasivo', 'bot-expansionista'], [{ poblacion: 20 }, { poblacion: 60 }]);
  assert.equal(analizarPesos([...pasivos, exp, mixta], { metricas: ['poblacion'] }).partidas_ruido, 3, 'por omision solo las parejas pasivas');
  const a = analizarPesos([...pasivos, exp, mixta], { metricas: ['poblacion'], identicos: ['bot-pasivo', 'bot-expansionista'] });
  assert.equal(a.partidas_ruido, 4); assert.equal(a.metricas[0].ruido, 9.9); // diferencias 10, -10, 0, 16: media 4, varianza 98
});
test('senal y SNR comparan al que actua con el pasivo en ambos asientos', () => {
  const activo = [corrida(['bot-expansionista', 'bot-pasivo'], [{ poblacion: 50, edificios: 20 }, { poblacion: 25, edificios: 10 }]), corrida(['bot-pasivo', 'bot-expansionista'], [{ poblacion: 25, edificios: 10 }, { poblacion: 45, edificios: 18 }])];
  const a = analizarPesos([...pasivos, ...activo], { metricas: ['poblacion', 'edificios'] });
  assert.equal(a.partidas_activo_contra_pasivo, 2);
  const p = a.metricas.find(m => m.metrica === 'poblacion'); assert.equal(p.senal, 22.5); assert.equal(p.snr, 2.76);
  assert.equal(a.metricas.find(m => m.metrica === 'edificios').senal, 9);
  // Con una tabla de pesos: puntos de ruido y de senal de cada termino.
  const e = evaluarPesos([...pasivos, ...activo], { supervivencia: 100, poblacion: 1, penalizacion: 5 });
  assert.deepEqual(e.filas, [{ metrica: 'poblacion', peso: 1, puntos_de_ruido: 8.16, puntos_de_senal: 22.5 }]); assert.equal(e.ruido_total, 8.16); assert.equal(e.senal_total, 22.5);
});
test('solo cuentan las partidas COMPLETAS de la duracion pedida y se exigen datos suficientes', () => {
  const corta = { ...pasivos[0], turnos: 5 }, incompleta = { ...pasivos[1], completo: false };
  assert.throws(() => analizarPesos([corta, incompleta, pasivos[2]]), /datos_insuficientes/);
  assert.equal(analizarPesos([corta, ...pasivos], { metricas: ['poblacion'] }).partidas_ruido, 3);
  // Diferencia de calidad de sitio entre los dos reinos de cada partida.
  const conSitio = [corrida(['bot-pasivo', 'bot-pasivo'], [{}, {}], { sitio: { f1: 560, f2: 464 } }), corrida(['bot-pasivo', 'bot-pasivo'], [{}, {}], { sitio: { f1: 500, f2: 520 } })];
  assert.deepEqual(analizarPesos(conSitio, { metricas: ['poblacion'] }).sitio, { diferencia_abs_media: 58, diferencia_abs_max: 96 });
});
test('se leen corridas reales del disco: carpetas sin log o con un log sin fin se ignoran', async () => {
  const raiz = await mkdtemp(join(tmpdir(), 'worldbox-pes-'));
  try {
    const log = (extra) => [{ tipo: 'inicio', participantes: [{ id: 'f1', modelo: 'bot-pasivo' }, { id: 'f2', modelo: 'bot-pasivo' }], escenario: { calidad_sitio: { f1: 1, f2: 2 }, hash_mundo: 'h' } }, ...extra].map(e => JSON.stringify(e)).join('\n') + '\n';
    await mkdir(join(raiz, 'a')); await writeFile(join(raiz, 'a', 'eventos.jsonl'), log([{ tipo: 'fin', completo: true, razon: 'turnos', turnos: 24, snapshot: [f('f1'), f('f2')] }]));
    await mkdir(join(raiz, 'b')); await writeFile(join(raiz, 'b', 'eventos.jsonl'), log([]));
    await mkdir(join(raiz, 'c')); await writeFile(join(raiz, 'archivo.txt'), 'x');
    const corridas = await cargarCorridas([raiz]);
    assert.equal(corridas.length, 1); assert.deepEqual(corridas[0].modelos, ['bot-pasivo', 'bot-pasivo']); assert.equal(corridas[0].hash_mundo, 'h');
    assert.equal(resumirCorrida([{ tipo: 'inicio', participantes: [] }]), null);
    assert.throws(() => resumirCorrida([]), /log_sin_inicio/);
  } finally { await rm(raiz, { recursive: true, force: true }); }
});
