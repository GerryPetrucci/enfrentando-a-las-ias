import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { correrCompetencia } from '../../worldbox/orquestador.js';
import { crearAdaptadorHttp } from '../../worldbox/adaptador-http.js';
import { crearAdaptadorSimulado } from '../../worldbox/adaptador-simulado.js';
import { crearBot } from '../../worldbox/bots.js';
import { main, opcionesCli } from '../../worldbox/correr.js';
import { servirPuenteReal } from './ayudas.js';

// Orden de preparacion del modo grabacion: interfaz oculta, mundo generado, camara lejos, espera del aviso del juego, «Listo para grabar»,
// cuenta atras y SOLO entonces el turno 1. Lo que el usuario graba es un mundo ya generado y limpio.
async function conCarpeta(fn) { const c = await mkdtemp(join(tmpdir(), 'worldbox-prep-')); try { await fn(c); } finally { await rm(c, { recursive: true, force: true }); } }
const bots = (...n) => n.map((modelo, i) => ({ id: `f${i + 1}`, modelo, decidir: crearBot(modelo, 1 + i) }));
const ZOOMS = { cerca: 60, medio: 110, lejos: 211 };
const PARTIDA = ['/v1/observacion', '/v1/accion', '/v1/avanzar'];
const urls = p => p.peticiones.map(x => x.url.split('?')[0]);
const real = async (t, opciones = { presentacion: true }, extra = {}) => {
  const puente = await servirPuenteReal(t, opciones);
  return { puente, config: { adaptador: crearAdaptadorHttp({ url: puente.url, token: puente.token }), participantes: bots('bot-expansionista', 'bot-voraz'), reglas: 'real', semilla: 1, turnos: 2, presupuesto: 0, ...extra } };
};

test('orquestador: el preludio ocurre con el mundo ya generado, la interfaz oculta y la camara lejos, antes de cualquier observacion o decision', async t => {
  const { puente, config } = await real(t);
  let antes = null, despues = null;
  const { reporte } = await correrCompetencia({ ...config, observador: () => {}, presentacion: { lecturaMs: 0, finMs: 0, zooms: ZOOMS,
    preludio: async () => { antes = puente.peticiones.map(x => ({ url: x.url.split('?')[0], cuerpo: x.cuerpo })); } } });
  assert.equal(reporte.completo, true);
  assert.ok(antes, 'el preludio se llamo');
  const hasta = antes.map(x => x.url);
  assert.deepEqual(hasta.filter(u => PARTIDA.includes(u) && u !== '/v1/observacion'), [], 'ni acciones ni avance antes del preludio');
  assert.ok(!hasta.includes('/v1/observacion'), 'ni observaciones: se capturan despues, con el turno 1');
  const i0 = hasta.indexOf('/v1/interfaz'), reinicio = hasta.indexOf('/v1/escenario/reiniciar');
  assert.ok(i0 >= 0 && i0 < reinicio, 'la interfaz se oculta ANTES de generar el mundo');
  assert.equal(antes[i0].cuerpo.visible, false);
  const ultimas = antes.slice(-3);
  assert.deepEqual(ultimas.map(x => x.url), ['/v1/interfaz', '/v1/interfaz', '/v1/camara'], 'despues de generar: la interfaz se muestra y se oculta de nuevo (cambio de estado) y luego la camara');
  assert.deepEqual([ultimas[0].cuerpo.visible, ultimas[1].cuerpo.visible, ultimas[2].cuerpo.zoom, ultimas[2].cuerpo.faccion], [true, false, 211, 'f1']);
  assert.equal(urls(puente)[antes.length], '/v1/observacion', 'lo primero tras el preludio es el turno 1');
});

test('el preludio no cuenta contra el tiempo de la partida ni cambia nada: mismo ranking, hash y eventos', async () => {
  const simulado = () => ({ adaptador: crearAdaptadorSimulado(), participantes: bots('bot-voraz', 'bot-aleatorio'), semilla: 1, turnos: 4, presupuesto: 0 });
  let t = 7_000_000;
  const con = await correrCompetencia({ ...simulado(), maxTiempoMs: 1000, ahora: () => t, observador: () => {}, presentacion: { lecturaMs: 0, finMs: 0, preludio: async () => { t += 3_600_000; } } });
  assert.equal(con.reporte.completo, true); assert.equal(con.reporte.razon, 'turnos', 'una hora de preludio no corta la partida');
  const sin = await correrCompetencia(simulado());
  assert.equal(con.reporte.hash_final, sin.reporte.hash_final);
  assert.deepEqual(con.reporte.ranking.map(f => [f.participant_id, f.puntos, f.puesto]), sin.reporte.ranking.map(f => [f.participant_id, f.puntos, f.puesto]));
  assert.deepEqual(con.eventos.map(e => e.tipo), sin.eventos.map(e => e.tipo));
  // Un preludio que falla no impide jugar.
  const roto = await correrCompetencia({ ...simulado(), observador: () => {}, presentacion: { lecturaMs: 0, finMs: 0, preludio: async () => { throw new Error('x'); } } });
  assert.equal(roto.reporte.completo, true);
});

test('si la preparacion falla (el mundo no se genera), la interfaz vuelve a mostrarse y no se llega al preludio', async t => {
  const { puente, config } = await real(t, { presentacion: true, gancho: async req => req.url === '/v1/escenario/reiniciar' ? { status: 503, body: { protocolo: 1, ok: false, error: { codigo: 'no_listo', mensaje: 'x' } } } : undefined });
  let llamado = false;
  await assert.rejects(correrCompetencia({ ...config, observador: () => {}, presentacion: { lecturaMs: 0, finMs: 0, zooms: ZOOMS, preludio: async () => { llamado = true; } } }));
  assert.equal(llamado, false);
  const visibles = puente.peticiones.filter(p => p.url === '/v1/interfaz').map(p => p.cuerpo.visible);
  assert.deepEqual(visibles, [false, true], 'oculta, falla el mundo, la devuelve');
});

test('opcionesCli: --aviso-ms solo con --grabacion y de 0 a 60000', () => {
  assert.equal(opcionesCli(['--grabacion', '--aviso-ms=2500'])['aviso-ms'], '2500');
  for (const mal of [['--aviso-ms=1000'], ['--grabacion', '--aviso-ms=-1'], ['--grabacion', '--aviso-ms=60001'], ['--grabacion', '--aviso-ms=x'], ['--grabacion', '--aviso-ms=1.5']]) assert.throws(() => opcionesCli(mal), /argumento_invalido/, mal.join(' '));
});

test('CLI --grabacion: estado «preparando» al instante, luego mundo generado, espera del aviso, «Listo para grabar», cuenta atras de 15 s y turno 1', async t => {
  await conCarpeta(async c => {
    const ruta = join(c, 'v.json'); let estadoAlInfo = null;
    const puente = await servirPuenteReal(t, { presentacion: true, gancho: async req => { if (req.url === '/v1/info') { try { estadoAlInfo = JSON.parse(readFileSync(ruta, 'utf8')); } catch { /* aun no existe */ } } } });
    const linea = [], dichos = [];
    const vistas = () => urls(puente);
    const deps = { env: { WORLDBOX_PUENTE_URL: puente.url, WORLDBOX_PUENTE_TOKEN: puente.token }, envRuta: join(c, 'no-existe.env'),
      dormir: async ms => { await new Promise(r => setTimeout(r, 25)); let fase = null; try { fase = JSON.parse(readFileSync(ruta, 'utf8')).fase; } catch { /* sin archivo */ } linea.push({ dormir: ms, peticiones: vistas().length, fase }); },
      avisar: txt => { dichos.push(txt); linea.push({ aviso: txt, peticiones: vistas().length }); } };
    const [r] = await main(['--adaptador=http', '--participantes=bot-expansionista,bot-voraz', '--grabacion', '--lectura-ms=0', '--fin-ms=0', '--turnos=2', `--vivo=${ruta}`, `--salida=${join(c, 's')}`], deps);
    assert.equal(r.completo, true);
    assert.equal(estadoAlInfo?.fase, 'preparando', 'el estado en vivo existe antes de hablar con el juego');
    // Orden: espera del aviso -> Listo para grabar -> cuenta 15..1 -> empieza.
    const secuencia = linea.map(x => x.dormir !== undefined ? `dormir ${x.dormir}` : x.aviso.startsWith('Listo') ? 'LISTO' : /empieza en (\d+)/.exec(x.aviso) ? `cuenta ${/empieza en (\d+)/.exec(x.aviso)[1]}` : x.aviso.startsWith('Empieza') ? 'EMPIEZA' : x.aviso);
    assert.deepEqual(secuencia.slice(0, 3), ['dormir 6000', 'LISTO', 'cuenta 15']);
    assert.equal(secuencia.filter(s => s.startsWith('cuenta')).length, 15); assert.equal(secuencia.at(-1), 'EMPIEZA');
    assert.deepEqual(secuencia.filter(s => s.startsWith('dormir')), ['dormir 6000', ...Array(15).fill('dormir 1000')]);
    // Todo eso ocurre con el mundo ya generado y SIN haber empezado la partida.
    const hasta = linea.at(-1).peticiones, previas = vistas().slice(0, hasta);
    assert.ok(previas.includes('/v1/escenario/reiniciar')); assert.ok(!previas.some(u => PARTIDA.includes(u)), 'ningun turno antes de «Empieza la partida»');
    assert.ok(linea.filter(x => x.dormir !== undefined).every(x => x.fase === 'preparando'), 'durante la espera y la cuenta el estado en vivo dice «preparando»');
    assert.ok(linea.every(x => vistas().slice(0, x.peticiones).includes('/v1/escenario/reiniciar')), 'el mundo se genera antes de la espera, del aviso y de la cuenta');
    assert.equal(vistas()[hasta], '/v1/observacion');
    // Opciones: aviso y cuenta configurables; --aviso-ms=0 no espera.
    linea.length = 0;
    await main(['--adaptador=http', '--participantes=bot-expansionista,bot-voraz', '--grabacion', '--aviso-ms=2500', '--cuenta=2', '--lectura-ms=0', '--fin-ms=0', '--turnos=1', `--vivo=${join(c, 'v2.json')}`, `--salida=${join(c, 's2')}`], deps);
    assert.deepEqual(linea.filter(x => x.dormir !== undefined).map(x => x.dormir), [2500, 1000, 1000]);
    linea.length = 0;
    await main(['--adaptador=http', '--participantes=bot-expansionista,bot-voraz', '--grabacion', '--aviso-ms=0', '--cuenta=0', '--lectura-ms=0', '--fin-ms=0', '--turnos=1', `--vivo=${join(c, 'v3.json')}`, `--salida=${join(c, 's3')}`], deps);
    assert.deepEqual(linea.filter(x => x.dormir !== undefined), []);
  });
});
