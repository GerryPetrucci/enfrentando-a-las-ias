import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { correrCompetencia } from '../../worldbox/orquestador.js';
import { crearAdaptadorSimulado } from '../../worldbox/adaptador-simulado.js';
import { crearBot } from '../../worldbox/bots.js';
import { main, opcionesCli, crearEsperaEnter } from '../../worldbox/correr.js';

// Modo manual del modo grabacion (docs/worldbox-grabacion.md): la voz del usuario manda el ritmo; la partida espera un Enter por decision.
async function conCarpeta(fn) { const c = await mkdtemp(join(tmpdir(), 'worldbox-manual-')); try { await fn(c); } finally { await rm(c, { recursive: true, force: true }); } }
const bots = (...n) => n.map((modelo, i) => ({ id: `f${i + 1}`, modelo, decidir: crearBot(modelo, 1 + i) }));
const simulado = () => ({ adaptador: crearAdaptadorSimulado(), participantes: bots('bot-voraz', 'bot-aleatorio'), semilla: 1, turnos: 4, presupuesto: 0 });
const dormirReal = ms => new Promise(r => setTimeout(r, ms));
const tty = () => Object.assign(new PassThrough(), { isTTY: true });

test('modo manual en el orquestador: se detiene con la decision a la vista ANTES de ejecutarla, sin pausa de lectura y sin gastar tiempo de partida', async () => {
  const a = crearAdaptadorSimulado(), ejecutadas = [], fases = [], esperas = [], dormidas = [];
  const ejecutar = a.ejecutar.bind(a); a.ejecutar = async x => { ejecutadas.push(x.accion); return ejecutar(x); };
  let t = 5_000_000;
  const { reporte } = await correrCompetencia({ ...simulado(), adaptador: a, maxTiempoMs: 1000, ahora: () => t, observador: e => { fases.push(e.fase); },
    presentacion: { lecturaMs: 4000, finMs: 0, dormir: async ms => { dormidas.push(ms); }, esperar: async x => { esperas.push({ ...x, fase: fases.at(-1), ejecutadasHasta: ejecutadas.length }); t += 600_000; } } });
  assert.equal(reporte.completo, true); assert.equal(reporte.razon, 'turnos', 'diez minutos de espera por decision no cortan la partida');
  assert.equal(esperas.length, 8); assert.ok(esperas.every(e => e.fase === 'esperando'));
  assert.deepEqual(esperas.slice(0, 2).map(e => [e.turno, e.participante, e.modelo]), [[1, 'f1', 'bot-voraz'], [1, 'f2', 'bot-aleatorio']]);
  assert.equal(esperas[0].ejecutadasHasta, 0, 'la primera espera ocurre antes de ejecutar nada');
  assert.deepEqual(dormidas, [], 'en modo manual no hay pausa de lectura');
  assert.deepEqual(fases.slice(2, 7), ['pensando', 'decidio', 'esperando', 'aplicando', 'pensando']);
  // Las reglas y la puntuacion son las mismas que sin modo manual.
  const sin = await correrCompetencia(simulado());
  assert.equal(reporte.hash_final, sin.reporte.hash_final);
  assert.deepEqual(reporte.ranking.map(f => [f.participant_id, f.puntos]), sin.reporte.ranking.map(f => [f.participant_id, f.puntos]));
  // Si la consola falla, la partida sigue.
  const roto = await correrCompetencia({ ...simulado(), presentacion: { lecturaMs: 0, finMs: 0, esperar: async () => { throw new Error('stdin cerrado'); } }, observador: () => {} });
  assert.equal(roto.reporte.completo, true);
});

test('crearEsperaEnter: cada espera termina con el siguiente Enter, descarta los adelantados y no bloquea si la entrada se cierra', async () => {
  const entrada = new PassThrough(), lector = crearEsperaEnter(entrada);
  entrada.write('\n'); await dormirReal(20); // Enter pulsado sin que nadie espere: se descarta
  let listo = false; const p = lector.esperar().then(() => { listo = true; });
  await dormirReal(30); assert.equal(listo, false, 'sigue esperando');
  entrada.write('\n'); await p; assert.equal(listo, true);
  let segunda = false; const q = lector.esperar().then(() => { segunda = true; });
  await dormirReal(20); assert.equal(segunda, false);
  entrada.end(); await q; await lector.esperar(); // entrada cerrada: ya no espera
  lector.cerrar();
});

test('opcionesCli: --manual solo con --grabacion y sin valor', () => {
  assert.equal(opcionesCli(['--grabacion', '--manual']).manual, true);
  for (const mal of [['--manual'], ['--grabacion', '--manual=1'], ['--grabacion', '--manual', '--manual']]) assert.throws(() => opcionesCli(mal), /argumento_invalido/, mal.join(' '));
});

test('CLI --grabacion --manual en consola interactiva: avisa turno y modelo, expone «esperando» y avanza con cada Enter', async () => {
  await conCarpeta(async c => {
    const ruta = join(c, 'v.json'), entrada = tty(), dichos = [], estados = [], dormidas = [];
    const deps = { entrada, dormir: async ms => { dormidas.push(ms); }, avisar: t => {
      dichos.push(t);
      if (/Pulsa Enter/.test(t)) (async () => { await dormirReal(60); estados.push(JSON.parse(await readFile(ruta, 'utf8'))); entrada.write('\n'); })();
    } };
    const [r] = await main(['--grabacion', '--manual', '--cuenta=0', '--fin-ms=0', '--turnos=2', `--vivo=${ruta}`, `--salida=${join(c, 's')}`], deps);
    assert.equal(r.completo, true);
    const pulsa = dichos.filter(x => /Pulsa Enter para continuar/.test(x));
    assert.equal(pulsa.length, 4, 'una espera por decision (2 turnos x 2)');
    assert.match(pulsa[0], /^Turno 1 de 2 - Bot Voraz: .+\nPulsa Enter para continuar$/);
    assert.match(pulsa[1], /^Turno 1 de 2 - Bot Aleatorio: /);
    assert.ok(!pulsa.join('').match(/\bf[12]\b/), 'la consola nombra al modelo, no al asiento');
    assert.equal(estados.length, 4); assert.ok(estados.every(s => s.fase === 'esperando' && s.decision && s.activo));
    assert.deepEqual(dormidas, [], 'sin cuenta, sin pausas de lectura ni final');
    assert.equal(JSON.parse(await readFile(ruta, 'utf8')).fase, 'fin');
  });
});

test('CLI --grabacion --manual sin consola interactiva: se ignora con aviso y se usa la pausa de lectura', async () => {
  await conCarpeta(async c => {
    const dichos = [], dormidas = [];
    const [r] = await main(['--grabacion', '--manual', '--cuenta=0', '--lectura-ms=700', '--fin-ms=0', '--turnos=2', `--vivo=${join(c, 'v.json')}`, `--salida=${join(c, 's')}`], { entrada: new PassThrough(), dormir: async ms => { dormidas.push(ms); }, avisar: t => dichos.push(t) });
    assert.equal(r.completo, true);
    assert.equal(dichos.filter(x => /^Aviso: --manual necesita una consola interactiva/.test(x)).length, 1);
    assert.deepEqual(dormidas, Array(4).fill(700));
    assert.ok(!dichos.some(x => /Pulsa Enter/.test(x)));
  });
});
