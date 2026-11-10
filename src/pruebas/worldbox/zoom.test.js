import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { correrCompetencia } from '../../worldbox/orquestador.js';
import { crearAdaptadorHttp } from '../../worldbox/adaptador-http.js';
import { crearBot } from '../../worldbox/bots.js';
import { main, opcionesCli, ZOOM_POR_OMISION } from '../../worldbox/correr.js';
import { servirPuenteReal } from './ayudas.js';

// Zoom por fase del modo grabacion: cerca sobre quien decide, medio mientras avanza el turno, lejos al preparar y en la tarjeta final.
async function conCarpeta(fn) { const c = await mkdtemp(join(tmpdir(), 'worldbox-zoom-')); try { await fn(c); } finally { await rm(c, { recursive: true, force: true }); } }
const bots = (...n) => n.map((modelo, i) => ({ id: `f${i + 1}`, modelo, decidir: crearBot(modelo, 1 + i) }));
const NOMBRE = { 211: 'L', 110: 'M', 60: 'C' };
// Resume las peticiones de presentacion y los hitos del turno: «L211:f1» = camara con zoom 211 sobre f1.
const secuencia = (p, nombre = z => NOMBRE[z] ?? `Z${z}`) => p.peticiones.filter(x => /^\/v1\/(camara|interfaz|escenario\/reiniciar|avanzar|cerrar)/.test(x.url)).map(x => {
  if (x.url === '/v1/camara') return x.cuerpo.liberar ? 'liberar' : `${x.cuerpo.zoom === undefined ? 'S' : nombre(x.cuerpo.zoom)}${x.cuerpo.zoom ?? ''}:${x.cuerpo.faccion}`;
  if (x.url === '/v1/interfaz') return x.cuerpo.visible ? 'I1' : 'I0';
  return x.url.slice(4);
}).join(' ');
const real = async (t, extra = {}, opciones = { presentacion: true }) => {
  const puente = await servirPuenteReal(t, opciones);
  return { puente, config: { adaptador: crearAdaptadorHttp({ url: puente.url, token: puente.token }), participantes: bots('bot-expansionista', 'bot-voraz'), reglas: 'real', semilla: 1, turnos: 3, presupuesto: 0, ...extra } };
};
const ZOOMS = { cerca: 60, medio: 110, lejos: 211 };

test('zoom por fase: lejos al preparar, cerca en cada decision, medio al avanzar el turno y lejos en la tarjeta final; la camara nunca queda libre en medio', async t => {
  const { puente, config } = await real(t);
  const { reporte } = await correrCompetencia({ ...config, observador: () => {}, presentacion: { lecturaMs: 0, finMs: 0, zooms: ZOOMS } });
  assert.equal(reporte.completo, true);
  assert.equal(secuencia(puente), 'I0 escenario/reiniciar I1 I0 L211:f1 C60:f1 C60:f2 M110:f2 avanzar C60:f2 C60:f1 M110:f1 avanzar C60:f1 C60:f2 M110:f2 avanzar L211:f2 liberar I1 cerrar',
    'el medio sigue a la ultima faccion activa del turno; solo se suelta la camara al final');
});

test('con zoom unico (sin zooms) rige el comportamiento de siempre: el mismo zoom en cada decision y la camara se suelta al cerrar cada turno', async t => {
  const { puente, config } = await real(t);
  await correrCompetencia({ ...config, observador: () => {}, presentacion: { lecturaMs: 0, finMs: 0, zoom: 80 } });
  assert.equal(secuencia(puente, z => `Z`), 'I0 escenario/reiniciar I1 I0 Z80:f1 Z80:f1 Z80:f2 avanzar liberar Z80:f2 Z80:f1 avanzar liberar Z80:f1 Z80:f2 avanzar liberar liberar I1 cerrar');
});

test('el zoom por fase elige una faccion VIVA y un fallo de camara no detiene la partida', async t => {
  const { puente, config } = await real(t, { turnos: 2 }, { presentacion: true, gancho: async req => req.url === '/v1/camara' ? { status: 500, body: { protocolo: 1, ok: false, error: { codigo: 'error_interno', mensaje: 'x' } } } : undefined });
  const { reporte } = await correrCompetencia({ ...config, observador: () => {}, presentacion: { lecturaMs: 0, finMs: 0, zooms: ZOOMS } });
  assert.equal(reporte.completo, true); assert.equal(reporte.turnos, 2);
  assert.ok(puente.peticiones.filter(p => p.url === '/v1/camara').length >= 6, 'lo intento en cada fase');
});

test('sin presentacion no se toca la camara aunque haya zooms por fase configurados en otro lado', async t => {
  const { puente, config } = await real(t);
  await correrCompetencia(config);
  assert.equal(puente.peticiones.filter(p => /camara|interfaz/.test(p.url)).length, 0);
});

test('opcionesCli: --zoom-cerca/medio/lejos solo con --grabacion y dentro del rango del juego (10 a 211)', () => {
  const o = opcionesCli(['--grabacion', '--zoom-cerca=30', '--zoom-medio=90', '--zoom-lejos=150']);
  assert.deepEqual([o['zoom-cerca'], o['zoom-medio'], o['zoom-lejos']], ['30', '90', '150']);
  assert.deepEqual(ZOOM_POR_OMISION, { cerca: 60, medio: 110, lejos: 211 });
  for (const mal of [['--zoom-cerca=30'], ['--grabacion', '--zoom-cerca=9'], ['--grabacion', '--zoom-lejos=212'], ['--grabacion', '--zoom-medio=x'], ['--grabacion', '--zoom-medio']]) assert.throws(() => opcionesCli(mal), /argumento_invalido/, mal.join(' '));
});

test('CLI --grabacion: zoom automatico por omision, ajustable por fase, y --zoom lo reemplaza por un zoom unico', async t => {
  const puente = await servirPuenteReal(t, { presentacion: true });
  await conCarpeta(async c => {
    const deps = { env: { WORLDBOX_PUENTE_URL: puente.url, WORLDBOX_PUENTE_TOKEN: puente.token }, envRuta: join(c, 'no-existe.env'), avisar: () => {}, dormir: async () => {} };
    const comun = ['--adaptador=http', '--participantes=bot-expansionista,bot-voraz', '--grabacion', '--cuenta=0', '--lectura-ms=0', '--fin-ms=0', '--turnos=2'];
    const zoomsUsados = desde => [...new Set(puente.peticiones.slice(desde).filter(p => p.url === '/v1/camara' && !p.cuerpo.liberar).map(p => p.cuerpo.zoom))].sort((a, b) => a - b);
    let n = puente.peticiones.length;
    await main([...comun, `--vivo=${join(c, 'a.json')}`, `--salida=${join(c, 'a')}`], deps);
    assert.deepEqual(zoomsUsados(n), [60, 110, 211]);
    n = puente.peticiones.length;
    await main([...comun, '--zoom-cerca=30', '--zoom-medio=90', '--zoom-lejos=150', `--vivo=${join(c, 'b.json')}`, `--salida=${join(c, 'b')}`], deps);
    assert.deepEqual(zoomsUsados(n), [30, 90, 150]);
    n = puente.peticiones.length;
    await main([...comun, '--zoom=80', '--zoom-cerca=30', `--vivo=${join(c, 'c.json')}`, `--salida=${join(c, 'c')}`], deps);
    assert.deepEqual(zoomsUsados(n), [80], '--zoom desactiva el automatico');
  });
});
