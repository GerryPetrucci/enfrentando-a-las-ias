import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { opcionesCli, main, cargarVariablesWorldbox } from '../../worldbox/correr.js';
import { leerTelemetria } from '../../worldbox/telemetria.js';
import { reconstruirReporte } from '../../worldbox/reporte.js';
import { servirPuente, servirPuenteReal } from './ayudas.js';

const CLI = fileURLToPath(new URL('../../worldbox/correr.js', import.meta.url));
// Preload que prohibe la red externa y oculta .env: el CLI con bots no necesita ninguna de las dos.
const AISLAR = pathToFileURL(fileURLToPath(new URL('./aislar-entorno.js', import.meta.url))).href;
const limpio = () => { const e = { ...process.env }; for (const k of Object.keys(e)) if (/^(OPENROUTER|WORLDBOX)_/.test(k)) delete e[k]; return e; };
// El CLI corre con cwd en una carpeta temporal vacia: si buscara un .env relativo, no existe (estas pruebas nunca leen el real).
const cli = (cwd, args, env = limpio()) => spawnSync(process.execPath, ['--import', AISLAR, CLI, ...args], { encoding: 'utf8', env, cwd });
async function conCarpeta(fn) { const c = await mkdtemp(join(tmpdir(), 'worldbox-cli-')); try { await fn(c); } finally { await rm(c, { recursive: true, force: true }); } }

test('opcionesCli: solo argumentos conocidos, una vez, con valor; una partida por defecto', () => {
  assert.equal(opcionesCli([]).partidas, 1); assert.equal(opcionesCli(['--partidas=3']).partidas, 3);
  for (const mal of [['--desconocido=1'], ['--semilla'], ['--semilla='], ['semilla=1'], ['--semilla=1', '--semilla=2'], ['--partidas=0'], ['--partidas=1.5'], ['--partidas=101'], ['--partidas=x'], ['--adaptador=otro'], ['--modo=regalo'],
    ['--modelos=a/b,c/d'], ['--modelos=a/b,c/d', '--modo=gratis'], ['--modelos=a/b,c/d', '--modo=pago', '--participantes=bot-pasivo,bot-voraz']]) {
    assert.throws(() => opcionesCli(mal), /argumento_invalido|partidas_invalidas|adaptador_invalido|pago_no_autorizado|participantes_ambiguos/, mal.join(' '));
  }
  assert.throws(() => opcionesCli(['--modelos=a/b,c/d', '--modo=gratis']), /pago_no_autorizado/, 'los modelos reales exigen --modo=pago aunque sean gratuitos');
  assert.doesNotThrow(() => opcionesCli(['--modelos=a/b,c/d', '--modo=pago']));
});
test('partida de ejemplo con bots de punta a punta: salida, archivos, reporte y determinismo', async () => {
  await conCarpeta(async c => {
    const args = ['--adaptador=simulado', '--participantes=bot-voraz,bot-aleatorio', '--semilla=7', '--turnos=5', '--presupuesto=0', '--partidas=1'];
    const a = cli(c, [...args, `--salida=${join(c, 'a')}`]), b = cli(c, [...args, `--salida=${join(c, 'b')}`]);
    assert.equal(a.status, 0, a.stderr); assert.equal(a.stderr, '');
    const [ra] = JSON.parse(a.stdout), [rb] = JSON.parse(b.stdout);
    assert.deepEqual([ra.origen, ra.determinista, ra.completo, ra.razon, ra.turnos], ['simulado', true, true, 'turnos', 5]);
    assert.equal(ra.hash_final, rb.hash_final); assert.equal(ra.hash_final, '5a00c540c6826dde93adce4007f1750b9dd6c5efc0a2c2afc5f4934c4c8fe1d6');
    assert.deepEqual(ra.ranking.map(x => [x.modelo, x.puesto, x.puntos]), [['bot-voraz', 1, 192], ['bot-aleatorio', 2, 161.9]]);
    assert.deepEqual((await readdir(ra.carpeta)).sort(), ['decisiones.csv', 'eventos.jsonl', 'modelos.csv', 'ranking.csv', 'reporte.json', 'turnos.csv']);
    // El reporte se puede reconstruir identico desde el log, sin simulador ni modelos.
    const reporte = JSON.parse(await readFile(join(ra.carpeta, 'reporte.json'), 'utf8'));
    assert.deepEqual(reconstruirReporte(await leerTelemetria(join(ra.carpeta, 'eventos.jsonl'))), reporte);
    const eventos = await leerTelemetria(join(ra.carpeta, 'eventos.jsonl'));
    assert.equal(eventos[0].tipo, 'inicio'); assert.equal(eventos.at(-1).tipo, 'fin');
    assert.deepEqual(['decision', 'turno'].map(t => eventos.filter(e => e.tipo === t).length), [10, 5]);
    assert.ok(!/sk-|Bearer|OPENROUTER/.test(await readFile(join(ra.carpeta, 'eventos.jsonl'), 'utf8')));
  });
});
test('otra semilla cambia la partida; --partidas=2 rota el orden de actuacion y comparte la semilla', async () => {
  await conCarpeta(async c => {
    const base = ['--participantes=bot-voraz,bot-pasivo', '--turnos=8', '--presupuesto=0'];
    const s1 = JSON.parse(cli(c, [...base, '--semilla=1', '--partidas=1', `--salida=${join(c, 's1')}`]).stdout)[0], s2 = JSON.parse(cli(c, [...base, '--semilla=2', '--partidas=1', `--salida=${join(c, 's2')}`]).stdout)[0];
    assert.notEqual(s1.hash_final, s2.hash_final);
    const dos = JSON.parse(cli(c, [...base, '--semilla=1', '--partidas=2', `--salida=${join(c, 'dos')}`]).stdout);
    assert.equal(dos.length, 2);
    const primero = async r => (await leerTelemetria(join(r.carpeta, 'eventos.jsonl'))).find(e => e.tipo === 'decision').participant_id;
    assert.deepEqual([await primero(dos[0]), await primero(dos[1])], ['f1', 'f2']);
    assert.equal((await leerTelemetria(join(dos[1].carpeta, 'eventos.jsonl'))).find(e => e.tipo === 'inicio').escenario.semilla_pedida, 1);
  });
});
test('el CLI rechaza lo peligroso con un codigo corto, sin crear salida y sin tocar la red', async () => {
  await conCarpeta(async c => {
    const salida = join(c, 'no-debe-existir');
    for (const [args, codigo] of [[['--modelos=lab/uno,lab/dos'], 'pago_no_autorizado'], [['--modelos=lab/uno,lab/dos', '--modo=gratis'], 'pago_no_autorizado'], [['--modelos=lab/uno,lab/dos', '--modo=pago'], 'presupuesto_y_tarifas_requeridos'],
      [['--modelos=lab/uno,lab/dos', '--modo=pago', '--presupuesto=1'], 'presupuesto_y_tarifas_requeridos'], [['--modelos=lab/uno,lab/dos', '--modo=pago', '--presupuesto=0', '--tarifa-entrada=1', '--tarifa-salida=1'], 'presupuesto_y_tarifas_requeridos'],
      [['--participantes=bot-inexistente,bot-pasivo'], 'participantes_invalidos'], [['--participantes=bot-pasivo'], 'participantes_invalidos'], [['--participantes=a,b,c,d,e'], 'participantes_invalidos'],
      [['--turnos=0'], 'solicitud_invalida'], [['--semilla=-3'], 'solicitud_invalida'], [['--mapa=5'], 'solicitud_invalida'], [['--adaptador=http'], 'no_autorizado'], [['--argumento-raro=1'], 'argumento_invalido']]) {
      const r = cli(c, [...args, `--salida=${salida}`]);
      assert.equal(r.status, 1, args.join(' ')); assert.equal(r.stderr.trim(), `WorldBox: ${codigo}`, args.join(' ')); assert.equal(r.stdout, '');
    }
    assert.equal(existsSync(salida), false, 'un rechazo no deja carpetas a medias');
  });
});
test('modelos reales: con --modo=pago, presupuesto y tarifas corre completo usando la pasarela (llamada inyectada, sin red)', async () => {
  await conCarpeta(async c => {
    const llamadas = [], texto = JSON.stringify({ actions: [{ action: 'recolectar', parameters: {} }], reasoning_summary: 'ok' });
    const llamar = async o => { llamadas.push(o); return { texto, uso: { cost: 0.001, prompt_tokens: 100, completion_tokens: 10 }, finishReason: 'stop' }; };
    const args = ['--modelos=lab/uno,lab/dos', '--modo=pago', '--presupuesto=1', '--tarifa-entrada=1', '--tarifa-salida=2', '--turnos=2', '--partidas=1', '--semilla=3', `--salida=${join(c, 's')}`];
    const [r] = await main(args, { llamar, limitador: { esperar: async () => {} }, env: {}, envRuta: join(c, 'no-hay-env') });
    assert.deepEqual([r.completo, r.turnos, r.origen], [true, 2, 'simulado']);
    assert.equal(llamadas.length, 4); assert.ok(llamadas.every(l => l.modo === 'pago' && l.reintentos === 0 && /^lab\/(uno|dos)$/.test(l.modelo)));
    assert.deepEqual(r.ranking.map(x => x.modelo).sort(), ['lab/dos', 'lab/uno']);
    assert.ok(r.ranking.every(x => Math.abs(x.costo - 0.002) < 1e-12));
    const reporte = JSON.parse(await readFile(join(r.carpeta, 'reporte.json'), 'utf8'));
    assert.deepEqual(reporte.modelos.map(m => m.model_id).sort(), ['lab/dos', 'lab/uno']);
    assert.equal(reporte.config.presupuesto, 1); assert.equal(reporte.config.parametros_modelo.tarifas['lab/uno'].salida, 2);
    assert.ok(!(await readFile(join(r.carpeta, 'eventos.jsonl'), 'utf8')).includes('sk-'));
    // Sin la bandera nunca se llega a la pasarela.
    await assert.rejects(() => main(args.filter(a => a !== '--modo=pago'), { llamar, env: {} }), /pago_no_autorizado/);
    assert.equal(llamadas.length, 4);
  });
});
test('cargarVariablesWorldbox lee SOLO WORLDBOX_* y no pisa lo ya definido', async () => {
  await conCarpeta(async c => {
    const ruta = join(c, '.env'); await writeFile(ruta, ['OPENROUTER_API_KEY=sk-or-v1-NOLEER', '# comentario', 'WORLDBOX_PUENTE_URL=http://127.0.0.1:47600', 'WORLDBOX_PUENTE_TOKEN="abc 123"', 'WORLDBOX_PRESUPUESTO_USD=5', 'SITIO_URL=x', ''].join('\r\n'));
    const env = { WORLDBOX_PRESUPUESTO_USD: '2' };
    await cargarVariablesWorldbox(env, ruta);
    assert.deepEqual(env, { WORLDBOX_PRESUPUESTO_USD: '2', WORLDBOX_PUENTE_URL: 'http://127.0.0.1:47600', WORLDBOX_PUENTE_TOKEN: 'abc 123' });
    const vacio = {}; await cargarVariablesWorldbox(vacio, join(c, 'no-existe')); assert.deepEqual(vacio, {});
  });
});
test('CLI contra un puente con la forma del real: el reglamento real es el predeterminado y cada opcion lo sobrescribe', async t => {
  const puente = await servirPuenteReal(t);
  await conCarpeta(async c => {
    const env = { ...limpio(), WORLDBOX_PUENTE_URL: puente.url, WORLDBOX_PUENTE_TOKEN: puente.token }, ejecutar = args => promisify(execFile)(process.execPath, ['--import', AISLAR, CLI, '--adaptador=http', '--participantes=bot-expansionista,bot-expansionista', '--partidas=1', ...args], { env, cwd: c });
    const [r] = JSON.parse((await ejecutar([`--salida=${join(c, 'a')}`])).stdout);
    assert.deepEqual([r.reglas, r.rules_version, r.origen, r.determinista, r.completo, r.turnos], ['real', 'auge-real-1.1.0', 'puente', false, true, 24]);
    const reinicio = puente.peticiones.find(p => p.url === '/v1/escenario/reiniciar').cuerpo;
    assert.deepEqual([reinicio.tamano_mapa, reinicio.opciones], [192, { max_acciones: 3, velocidad: 'x10', plantilla: 'continent', unidades_iniciales: 4 }]);
    assert.ok(puente.peticiones.filter(p => p.url === '/v1/avanzar').every(p => p.cuerpo.segundos_juego === 50));
    const antes = puente.peticiones.length;
    const [s] = JSON.parse((await ejecutar(['--turnos=3', '--segundos-turno=30', '--velocidad=x5', '--especie=elf', '--unidades-iniciales=6', '--mapa=256', '--puntos-turno=3', '--acciones=2', `--salida=${join(c, 'b')}`])).stdout);
    assert.equal(s.turnos, 3);
    const nuevas = puente.peticiones.slice(antes), reinicio2 = nuevas.find(p => p.url === '/v1/escenario/reiniciar').cuerpo;
    assert.deepEqual(reinicio2.facciones, [{ id: 'f1', especie: 'elf' }, { id: 'f2', especie: 'elf' }]);
    assert.deepEqual([reinicio2.tamano_mapa, reinicio2.opciones], [256, { max_acciones: 2, velocidad: 'x5', plantilla: 'continent', unidades_iniciales: 6 }]);
    assert.ok(nuevas.filter(p => p.url === '/v1/avanzar').every(p => p.cuerpo.segundos_juego === 30));
    const reporte = JSON.parse(await readFile(join(s.carpeta, 'reporte.json'), 'utf8'));
    assert.deepEqual([reporte.config.puntosPorTurno, reporte.config.maxAcciones, reporte.config.segundosPorTurno], [3, 2, 30]);
    // El log de la corrida se audita desde la linea de comandos.
    const auditoria = JSON.parse((await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../../worldbox/auditar.js', import.meta.url)), r.carpeta])).stdout);
    assert.equal(auditoria.ok, true); assert.equal(auditoria.resumen.prompts_verificados, 48);
  });
});
test('el CLI rechaza reglamentos y opciones de escenario desconocidos', async () => {
  await conCarpeta(async c => {
    for (const args of [['--reglas=inventado'], ['--especie=Humano!'], ['--velocidad=muy rapido'], ['--plantilla=../../x'], ['--segundos-turno=0'], ['--puntos-turno=0'], ['--unidades-iniciales=x']]) {
      const r = cli(c, [...args, `--salida=${join(c, 'x')}`]);
      assert.equal(r.status, 1, args.join(' ')); assert.match(r.stderr.trim(), /^WorldBox: (argumento_invalido|solicitud_invalida)$/, args.join(' ')); assert.equal(existsSync(join(c, 'x')), false);
    }
    // Pedir el reglamento real con el simulador es incoherente y se rechaza antes de empezar.
    const r = cli(c, ['--reglas=real', '--turnos=2', `--salida=${join(c, 'x')}`]);
    assert.equal(r.status, 1); assert.equal(r.stderr.trim(), 'WorldBox: no_soportado'); assert.deepEqual(existsSync(join(c, 'x')) ? await readdir(join(c, 'x')) : [], []);
  });
});
test('CLI con --adaptador=http contra un puente falso: usa variables de entorno, el token y el catalogo anunciado', async t => {
  const puente = await servirPuente(t, { semilla: false });
  await conCarpeta(async c => {
    const env = { ...limpio(), WORLDBOX_PUENTE_URL: puente.url, WORLDBOX_PUENTE_TOKEN: puente.token };
    const { stdout } = await promisify(execFile)(process.execPath, ['--import', AISLAR, CLI, '--adaptador=http', '--reglas=generico', '--participantes=bot-aleatorio,bot-pasivo,bot-voraz', '--semilla=9', '--turnos=4', '--partidas=1', '--presupuesto=0', `--salida=${join(c, 's')}`], { env, cwd: c });
    const [r] = JSON.parse(stdout);
    assert.deepEqual([r.origen, r.determinista, r.completo, r.turnos], ['puente', false, true, 4]);
    const reporte = JSON.parse(await readFile(join(r.carpeta, 'reporte.json'), 'utf8'));
    assert.deepEqual(reporte.config.acciones_habilitadas, ['esperar', 'reunir', 'construir']); assert.equal(reporte.escenario.hash_mundo, 'mundo-0001');
    assert.ok(puente.peticiones.every(p => p.cuerpo === null || p.cuerpo.protocolo === 1));
    assert.ok(!(await readFile(join(r.carpeta, 'eventos.jsonl'), 'utf8')).includes(puente.token), 'el token no se registra');
    // Token incorrecto: aborta con un codigo, sin dejar carpeta de salida.
    // Asincrono: el puente falso vive en este proceso y no puede atender mientras spawnSync lo bloquea.
    const x = join(c, 'x'), mal = await promisify(execFile)(process.execPath, ['--import', AISLAR, CLI, '--adaptador=http', '--turnos=1', `--salida=${x}`], { env: { ...env, WORLDBOX_PUENTE_TOKEN: 'otro' }, cwd: c }).then(() => null, e => e);
    assert.equal(mal.code, 1); assert.equal(mal.stderr.trim(), 'WorldBox: no_autorizado');
    assert.deepEqual(existsSync(x) ? await readdir(x) : [], [], 'un arranque fallido no deja una carpeta de corrida vacia');
  });
});
