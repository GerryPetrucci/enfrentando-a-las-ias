// publicarParte (src/publicar.js): lo que pasa en el disco cuando se sube una parte de un video. Se prueba en carpetas temporales con partidas reales del motor (bots): sin red ni API.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { publicarParte } from '../publicar.js';
import { construirSistema } from '../prompt.js';
import conquista from '../juegos/conquista.js';
import { jugarConqBots } from './escena/ayudas-conq.js';

const RAIZ_REPO = fileURLToPath(new URL('../..', import.meta.url));
const bots = ['agresivo', 'pacifico', 'economico', 'azar'];
const p1 = await jugarConqBots(18, bots), p2 = await jugarConqBots(19, bots);
const ULTIMA1 = p1.rondas.at(-1).turno;

const crudo = () => ({
  etiqueta: 'serie-x', fecha: '2026-10-19T10:00:00.000Z', seedBase: 18, juego: { id: 'conquista', nombre: 'Guerra de territorios', categoria: 'Estrategia y conquista' },
  prompt: { version: 'v1.0.0', reglas: conquista.versionReglas, hash: createHash('sha256').update(construirSistema(conquista)).digest('hex') },
  modo: 'pago', destino: 'oficial', jugadores: bots, serie: { partidas: 2, rotar: true, mismoSeed: true },
  evaluacion: { partidas: 2, comentario: [{ tipo: 'resumen', texto: 'x' }] }, partidas: [structuredClone(p1), structuredClone(p2)],
});

function entorno({ privado = true } = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'publicar-'));
  mkdirSync(join(raiz, 'data'), { recursive: true });
  mkdirSync(join(raiz, 'web'), { recursive: true });
  if (privado) mkdirSync(join(raiz, 'privado'), { recursive: true });
  writeFileSync(join(raiz, 'data', 'serie-x.json'), JSON.stringify(crudo()));
  const leer = (ruta) => JSON.parse(readFileSync(join(raiz, ruta), 'utf8'));
  return { raiz, leer, limpiar: () => rmSync(raiz, { recursive: true, force: true }) };
}

test('subir la parte 1 deja la serie «por publicarse»: su seed y los fragmentos hasta ese turno, con los prompts reconstruidos, y nada del resultado', () => {
  const e = entorno();
  try {
    const r = publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 1, parte: 1, hasta: 5, fecha: '2026-10-19' });
    assert.deepEqual([r.final, r.estadoPartida, r.estadoSerie, r.hasta], [false, 'por-publicarse', 'por-publicarse', 5]);
    const pub = e.leer('data/publicas/serie-x.json');
    assert.equal(pub.publicacion.estado, 'por-publicarse');
    assert.equal(pub.seedBase, 18);
    assert.equal(pub.evaluacion, undefined);
    assert.equal(pub.prompt.sistema, construirSistema(conquista), 'el prompt de sistema es publico');
    const [a, b] = pub.partidas;
    assert.equal(a.rondas.length, 5);
    assert.equal(a.prompts.turnos.length, 5);
    assert.equal(a.prompts.turnos[0].prompts.length, 4);
    assert.match(a.prompts.turnos[0].prompts[0], /^Estado actual de la partida:/);
    for (const clave of ['puntos', 'ganador', 'metricas', 'orden', 'turnos', 'tokensUsados']) assert.equal(a[clave], undefined, clave);
    assert.deepEqual([b.seed, b.rondas.length, b.estadoPublicacion], [p2.seed, 0, 'por-publicarse']);
    assert.equal(b.prompts, undefined);
    assert.deepEqual(e.leer('data/publicas/registro.json').series['serie-x'].partidas[1], { estado: 'por-publicarse', hastaTurno: 5, partes: [{ parte: 1, hastaTurno: 5, final: false, fecha: '2026-10-19' }] });
    const marcador = e.leer('web/marcador.json');
    assert.equal(marcador.episodios[0].estado, 'por-publicarse');
    assert.deepEqual(marcador.episodios[0].detalle.map((d) => [d.seed, d.hastaTurno]), [[p1.seed, 5], [p2.seed, 0]]);
    assert.deepEqual(marcador.juegos[0].tabla, [], 'ningun resultado en las tablas');
    assert.ok(existsSync(join(e.raiz, 'privado/datos-oficiales/serie-x.json')), 'respaldo privado de los datos completos');
  } finally { e.limpiar(); }
});

test('subir la parte final publica el resultado de esa partida (completa, con sus prompts) y la otra sigue por publicarse', () => {
  const e = entorno();
  try {
    publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 1, parte: 1, hasta: 5, fecha: '2026-10-19' });
    const r = publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 1, parte: 2, hasta: ULTIMA1, fecha: '2026-10-22' });
    assert.deepEqual([r.final, r.estadoPartida, r.estadoSerie, r.detectada], [true, 'publicada', 'por-publicarse', true]);
    const pub = e.leer('data/publicas/serie-x.json');
    assert.equal(pub.partidas[0].estadoPublicacion, 'publicada');
    assert.deepEqual(pub.partidas[0].puntos, p1.puntos);
    assert.equal(pub.partidas[0].rondas.length, p1.rondas.length);
    assert.equal(pub.partidas[0].prompts.turnos.length, p1.rondas.length);
    assert.equal(pub.partidas[1].estadoPublicacion, 'por-publicarse');
    assert.equal(pub.evaluacion, undefined, 'la de la serie espera a la otra partida');
    const m = e.leer('web/marcador.json');
    assert.equal(m.juegos[0].tabla.reduce((s, f) => s + f.partidas, 0), 4, 'la partida 1 cuenta para sus 4 jugadores');
    const fin = publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 2, parte: 1, hasta: ultimaDe(p2), fecha: '2026-10-26' });
    assert.equal(fin.estadoSerie, 'publicada', 'una sola parte que llega al final publica la partida entera');
    assert.deepEqual(e.leer('data/publicas/serie-x.json').evaluacion, crudo().evaluacion);
  } finally { e.limpiar(); }
});
const ultimaDe = (p) => p.rondas.at(-1).turno;

test('la herramienta detecta si una parte es la final, y si lo que dices no cuadra con lo guardado, se niega', () => {
  const e = entorno();
  try {
    assert.throws(() => publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 1, parte: 1, hasta: 3, final: true }), /no llega al ultimo turno/);
    assert.throws(() => publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 1, parte: 1, hasta: ULTIMA1, final: false }), /es la final/);
    assert.throws(() => publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 3, parte: 1, hasta: 3 }), /no tiene la partida 3/);
    assert.throws(() => publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 1, parte: 1, hasta: 0 }), /hasta/);
    assert.throws(() => publicarParte({ raiz: e.raiz, archivo: 'nada.json', partida: 1, parte: 1, hasta: 3 }), /No encuentro/);
    assert.ok(!existsSync(join(e.raiz, 'data/publicas/serie-x.json')), 'ninguna negativa deja archivos a medias');
    const r = publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 1, parte: 1, hasta: ULTIMA1 + 40 });
    assert.deepEqual([r.hasta, r.final], [ULTIMA1, true], 'pasarse del ultimo turno es llegar al final');
  } finally { e.limpiar(); }
});

test('si las reglas del juego cambiaron desde la corrida no se publica (los prompts no serian los que vieron las IAs), salvo --forzar', () => {
  const e = entorno();
  try {
    const mal = crudo();
    mal.prompt.hash = 'otro';
    writeFileSync(join(e.raiz, 'data', 'serie-x.json'), JSON.stringify(mal));
    assert.throws(() => publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 1, parte: 1, hasta: 3 }), /reglas del juego cambiaron/);
    const r = publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 1, parte: 1, hasta: 3, forzar: true });
    assert.ok(r.avisos.some((a) => /reglas/.test(a)));
  } finally { e.limpiar(); }
});

test('si la rejugada no coincide con lo guardado los prompts NO se publican y se avisa; sin carpeta privada no hay respaldo y tampoco falla', () => {
  const e = entorno({ privado: false });
  try {
    const raro = crudo();
    raro.partidas[0].rondas[1].estado.dueno[0] = raro.partidas[0].rondas[1].estado.dueno[0] === 3 ? 2 : 3;
    writeFileSync(join(e.raiz, 'data', 'serie-x.json'), JSON.stringify(raro));
    const r = publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 1, parte: 1, hasta: 4 });
    assert.ok(r.avisos.some((a) => /prompts/.test(a)), r.avisos.join(' | '));
    assert.equal(e.leer('data/publicas/serie-x.json').partidas[0].prompts, undefined);
    assert.equal(r.respaldo, false);
    assert.ok(!existsSync(join(e.raiz, 'privado')));
  } finally { e.limpiar(); }
});

test('volver a subir una parte la reemplaza, y el numero de parte por omision es el siguiente', () => {
  const e = entorno();
  try {
    publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 1, parte: 1, hasta: 4, fecha: '2026-10-19' });
    const r = publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 1, hasta: 6, fecha: '2026-10-20' });
    assert.equal(r.parte, 2);
    const reg = e.leer('data/publicas/registro.json').series['serie-x'].partidas[1];
    assert.deepEqual(reg.partes.map((p) => [p.parte, p.hastaTurno]), [[1, 4], [2, 6]]);
    publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 1, parte: 1, hasta: 5 });
    assert.deepEqual(e.leer('data/publicas/registro.json').series['serie-x'].partidas[1].partes.map((p) => [p.parte, p.hastaTurno]), [[1, 5], [2, 6]]);
  } finally { e.limpiar(); }
});

test('el comando publica desde la linea de comandos y dice que sigue; sin argumentos explica como se usa', () => {
  const e = entorno();
  try {
    const ok = spawnSync(process.execPath, [join(RAIZ_REPO, 'herramientas/publicar.mjs'), '--archivo=serie-x.json', '--partida=1', '--hasta=4', `--raiz=${e.raiz}`, '--fecha=2026-10-19'], { encoding: 'utf8' });
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /por publicarse/i);
    assert.match(ok.stdout, /seed 18/);
    assert.match(ok.stdout, /data\/publicas/);
    const mal = spawnSync(process.execPath, [join(RAIZ_REPO, 'herramientas/publicar.mjs')], { encoding: 'utf8' });
    assert.equal(mal.status, 1);
    assert.match(mal.stderr, /Uso:/);
    const final = spawnSync(process.execPath, [join(RAIZ_REPO, 'herramientas/publicar.mjs'), '--archivo=serie-x.json', '--partida=1', '--hasta=3', '--final', `--raiz=${e.raiz}`], { encoding: 'utf8' });
    assert.equal(final.status, 1);
    assert.match(final.stderr, /no llega al ultimo turno/);
  } finally { e.limpiar(); }
});
