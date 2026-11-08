// publicarParte (src/publicar.js): lo que pasa en el disco cuando se sube una parte de un video. Se prueba en carpetas temporales con partidas reales del motor (bots): sin red ni API.
// Lobo (el juego publico) cubre el recorte por rondas y el registro privado; el juego de prueba (src/pruebas/ayudas-juego.js, fuera del registro publico) cubre la reconstruccion
// de los prompts por turno, que Lobo no hace.
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
import { construirSistema, construirUsuario } from '../prompt.js';
import { correrPartida } from '../arena.js';
import lobo from '../juegos/lobo.js';
import prueba, { agenteBase } from './ayudas-juego.js';
import { jugarLobo } from './escena/ayudas-lobo.js';
import { ultimaRonda } from '../publicacion.js';

const RAIZ_REPO = fileURLToPath(new URL('../..', import.meta.url));
const hashDe = (juego) => createHash('sha256').update(construirSistema(juego)).digest('hex');

// ---- Lobo: dos partidas de bots, la primera de al menos 3 rondas ----
const l1 = [3, 4, 5, 6, 7, 8, 9].map((s) => jugarLobo(s)).find((p) => ultimaRonda(p) >= 3), l2 = jugarLobo(19);
const ULTIMA_L1 = ultimaRonda(l1);
const crudoLobo = () => ({
  etiqueta: 'serie-x', fecha: '2026-10-19T10:00:00.000Z', seedBase: l1.seed, juego: { id: 'lobo', nombre: lobo.nombre, categoria: lobo.categoria },
  prompt: { version: 'v1.0.0', reglas: lobo.versionReglas, hash: hashDe(lobo) },
  modo: 'pago', destino: 'oficial', jugadores: l1.jugadores.map((j) => j.id), serie: { partidas: 2 },
  evaluacion: { partidas: 2, comentario: [{ tipo: 'resumen', texto: 'x' }] }, partidas: [structuredClone(l1), structuredClone(l2)],
});

// ---- Juego de prueba con prompts reconstruibles: rejuega las jugadas guardadas y devuelve lo que vio cada asiento en cada turno ----
const conPrompts = {
  ...prueba,
  reconstruirPrompts(partida, hasta) {
    const E = prueba.crear();
    const turnos = [];
    let fiel = true;
    for (const r of partida.rondas) {
      if (r.ronda > hasta) break;
      turnos.push({ turno: r.ronda, prompts: [0, 1].map((i) => construirUsuario(prueba.vista(E, i))) });
      const rejugado = prueba.aplicar(E, r.jugadas.map((jugada, i) => ({ jugada, promesa: r.promesasNuevas[i], mensaje: r.mensajes[i], razon: r.razones[i], invalida: r.invalidas[i] })));
      if (JSON.stringify(rejugado.puntosAcumulados) !== JSON.stringify(r.puntosAcumulados)) fiel = false;
    }
    return { fiel, turnos };
  },
};
const obtener = (id) => { if (id !== conPrompts.id) throw new Error(`Juego desconocido: ${id}`); return conPrompts; };
const q1 = await correrPartida({ juego: conPrompts, agentes: [agenteBase('tomaydaca'), agenteBase('azar')], seed: 18 });
const q2 = await correrPartida({ juego: conPrompts, agentes: [agenteBase('azar'), agenteBase('tomaydaca')], seed: 19 });
const ULTIMA_Q1 = ultimaRonda(q1);
const crudoPrueba = () => ({
  etiqueta: 'serie-x', fecha: '2026-10-19T10:00:00.000Z', seedBase: 18, juego: { id: conPrompts.id, nombre: conPrompts.nombre, categoria: conPrompts.categoria },
  prompt: { version: 'v1.0.0', reglas: 'prueba-1.0.0', hash: hashDe(conPrompts) },
  modo: 'pago', destino: 'oficial', jugadores: ['tomaydaca', 'azar'], serie: { partidas: 2, rotar: true },
  evaluacion: { partidas: 2, comentario: [{ tipo: 'resumen', texto: 'x' }] }, partidas: [structuredClone(q1), structuredClone(q2)],
});

function entorno({ privado = true, crudo = crudoLobo() } = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'publicar-'));
  mkdirSync(join(raiz, 'data'), { recursive: true });
  mkdirSync(join(raiz, 'web'), { recursive: true });
  if (privado) mkdirSync(join(raiz, 'privado'), { recursive: true });
  writeFileSync(join(raiz, 'data', 'serie-x.json'), JSON.stringify(crudo));
  const leer = (ruta) => JSON.parse(readFileSync(join(raiz, ruta), 'utf8'));
  return { raiz, leer, limpiar: () => rmSync(raiz, { recursive: true, force: true }) };
}

test('Lobo: subir la parte 1 deja la serie «por publicarse»: su seed, las rondas publicas hasta la subida y nada del resultado ni de lo privado', () => {
  const e = entorno();
  try {
    const r = publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 1, parte: 1, hasta: 1, fecha: '2026-11-07' });
    assert.deepEqual([r.final, r.estadoPartida, r.estadoSerie, r.hasta, r.seed], [false, 'por-publicarse', 'por-publicarse', 1, l1.seed]);
    const pub = e.leer('data/publicas/serie-x.json'), [a, b] = pub.partidas;
    assert.equal(pub.publicacion.estado, 'por-publicarse');
    assert.equal(pub.prompt.sistema, construirSistema(lobo), 'el prompt de sistema es publico');
    assert.equal(pub.evaluacion, undefined);
    assert.equal(a.rondas.length, l1.rondas.filter((x) => x.ronda <= 1).length, 'todas las fases de la ronda 1');
    assert.ok(a.rondas.every((x) => x.ronda === 1 && x.privado === undefined && x.invalidas === undefined));
    assert.equal(a.prompts, undefined, 'Lobo no reconstruye prompts');
    for (const k of ['puntos', 'ganador', 'ganadorBando', 'metricas', 'orden', 'turnos', 'tokensUsados']) assert.equal(a[k], undefined, k);
    assert.deepEqual([b.seed, b.rondas.length, b.estadoPublicacion], [l2.seed, 0, 'por-publicarse']);
    assert.deepEqual(e.leer('data/publicas/registro.json').series['serie-x'].partidas[1], { estado: 'por-publicarse', hastaTurno: 1, partes: [{ parte: 1, hastaTurno: 1, final: false, fecha: '2026-11-07' }] });
    const marcador = e.leer('web/marcador.json');
    assert.equal(marcador.episodios[0].estado, 'por-publicarse');
    assert.deepEqual(marcador.episodios[0].detalle.map((d) => [d.seed, d.hastaTurno]), [[l1.seed, 1], [l2.seed, 0]]);
    assert.deepEqual(marcador.juegos[0].tabla, [], 'ningun resultado en las tablas');
    assert.ok(existsSync(join(e.raiz, 'privado/datos-oficiales/serie-x.json')), 'respaldo privado de los datos completos');
  } finally { e.limpiar(); }
});

test('Lobo: la parte final publica la partida completa (con su registro privado) y la evaluacion espera a la otra partida', () => {
  const e = entorno();
  try {
    publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 1, parte: 1, hasta: 1 });
    const r = publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 1, parte: 2, hasta: ULTIMA_L1 });
    assert.deepEqual([r.final, r.estadoPartida, r.estadoSerie, r.detectada], [true, 'publicada', 'por-publicarse', true]);
    let pub = e.leer('data/publicas/serie-x.json');
    assert.equal(pub.partidas[0].estadoPublicacion, 'publicada');
    assert.deepEqual(pub.partidas[0].puntos, l1.puntos);
    assert.deepEqual(pub.partidas[0].rondas, l1.rondas, 'completa: con lo privado');
    assert.equal(pub.partidas[1].estadoPublicacion, 'por-publicarse');
    assert.equal(pub.evaluacion, undefined);
    const tabla = e.leer('web/marcador.json').juegos[0].tabla;
    assert.equal(tabla.reduce((s, f) => s + f.partidas, 0), l1.jugadores.length, 'la partida 1 cuenta para cada asiento');
    const fin = publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 2, parte: 1, hasta: ultimaRonda(l2) });
    assert.equal(fin.estadoSerie, 'publicada', 'una sola parte que llega al final publica la partida entera');
    pub = e.leer('data/publicas/serie-x.json');
    assert.equal(pub.publicacion.estado, 'publicada');
    assert.deepEqual(pub.evaluacion, crudoLobo().evaluacion);
  } finally { e.limpiar(); }
});

test('la herramienta detecta si una parte es la final, y si lo que dices no cuadra con lo guardado, se niega sin dejar archivos a medias', () => {
  const e = entorno();
  try {
    const base = { raiz: e.raiz, archivo: 'serie-x.json', partida: 1, parte: 1 };
    assert.throws(() => publicarParte({ ...base, hasta: 1, final: true }), /no llega al ultimo turno/);
    assert.throws(() => publicarParte({ ...base, hasta: ULTIMA_L1, final: false }), /es la final/);
    assert.throws(() => publicarParte({ ...base, partida: 3, hasta: 1 }), /no tiene la partida 3/);
    for (const hasta of [0, -1, 1.5]) assert.throws(() => publicarParte({ ...base, hasta }), /hasta/);
    assert.throws(() => publicarParte({ ...base, archivo: 'nada.json', hasta: 1 }), /No encuentro/);
    assert.ok(!existsSync(join(e.raiz, 'data/publicas/serie-x.json')), 'ninguna negativa deja archivos a medias');
    const r = publicarParte({ ...base, hasta: ULTIMA_L1 + 40 });
    assert.deepEqual([r.hasta, r.final], [ULTIMA_L1, true], 'pasarse del ultimo turno es llegar al final');
  } finally { e.limpiar(); }
});

test('si las reglas del juego cambiaron desde la corrida no se publica (los prompts no serian los que vieron las IAs), salvo --forzar, que publica sin el prompt de sistema', () => {
  const mal = crudoLobo();
  mal.prompt.hash = 'otro';
  const e = entorno({ crudo: mal });
  try {
    const base = { raiz: e.raiz, archivo: 'serie-x.json', partida: 1, parte: 1, hasta: 1 };
    assert.throws(() => publicarParte(base), /reglas del juego cambiaron/);
    const r = publicarParte({ ...base, forzar: true });
    assert.ok(r.avisos.some((a) => /reglas/.test(a)));
    assert.equal(e.leer('data/publicas/serie-x.json').prompt.sistema, undefined);
  } finally { e.limpiar(); }
});

test('un juego que reconstruye sus prompts los publica turno por turno: hasta lo subido mientras esta por publicarse y completos con la parte final', () => {
  const e = entorno({ crudo: crudoPrueba() });
  try {
    publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 1, parte: 1, hasta: 5, obtener });
    let [a, b] = e.leer('data/publicas/serie-x.json').partidas;
    assert.equal(a.rondas.length, 5);
    assert.deepEqual(a.prompts.turnos.map((t) => t.turno), [1, 2, 3, 4, 5]);
    assert.equal(a.prompts.turnos[0].prompts.length, 2, 'uno por asiento');
    assert.match(a.prompts.turnos[0].prompts[0], /^Estado actual de la partida:/);
    assert.match(a.prompts.turnos[4].prompts[1], /"ronda": 5/);
    assert.equal(b.prompts, undefined, 'la partida sin partes no trae prompts');
    publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 1, parte: 2, hasta: ULTIMA_Q1, obtener });
    [a] = e.leer('data/publicas/serie-x.json').partidas;
    assert.equal(a.estadoPublicacion, 'publicada');
    assert.equal(a.prompts.turnos.length, q1.rondas.length);
  } finally { e.limpiar(); }
});

test('si la rejugada no coincide con lo guardado los prompts NO se publican y se avisa; sin carpeta privada no hay respaldo y tampoco falla', () => {
  const raro = crudoPrueba();
  raro.partidas[0].rondas[1].puntosAcumulados = [99, 99];
  const e = entorno({ privado: false, crudo: raro });
  try {
    const r = publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 1, parte: 1, hasta: 4, obtener });
    assert.ok(r.avisos.some((a) => /prompts/.test(a)), r.avisos.join(' | '));
    assert.equal(e.leer('data/publicas/serie-x.json').partidas[0].prompts, undefined);
    assert.equal(r.respaldo, false);
    assert.ok(!existsSync(join(e.raiz, 'privado')), 'no inventa la carpeta privada');
  } finally { e.limpiar(); }
});

test('volver a subir una parte la reemplaza, y el numero de parte por omision es el siguiente', () => {
  const e = entorno({ crudo: crudoPrueba() });
  try {
    publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 1, parte: 1, hasta: 4, fecha: '2026-10-19', obtener });
    const r = publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 1, hasta: 6, fecha: '2026-10-20', obtener });
    assert.equal(r.parte, 2);
    const reg = e.leer('data/publicas/registro.json').series['serie-x'].partidas[1];
    assert.deepEqual(reg.partes.map((p) => [p.parte, p.hastaTurno]), [[1, 4], [2, 6]]);
    publicarParte({ raiz: e.raiz, archivo: 'serie-x.json', partida: 1, parte: 1, hasta: 5, obtener });
    assert.deepEqual(e.leer('data/publicas/registro.json').series['serie-x'].partidas[1].partes.map((p) => [p.parte, p.hastaTurno]), [[1, 5], [2, 6]]);
  } finally { e.limpiar(); }
});

test('el comando publica desde la linea de comandos (Lobo) y dice que sigue; sin argumentos explica como se usa; un final prematuro se niega', () => {
  const e = entorno();
  try {
    const cli = (...args) => spawnSync(process.execPath, [join(RAIZ_REPO, 'herramientas/publicar.mjs'), ...args], { encoding: 'utf8' });
    const ok = cli('--archivo=serie-x.json', '--partida=1', '--hasta=1', `--raiz=${e.raiz}`, '--fecha=2026-10-19');
    assert.equal(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /por publicarse/i);
    assert.match(ok.stdout, new RegExp(`seed ${l1.seed}`));
    assert.match(ok.stdout, /data[\\/]publicas/);
    assert.equal(e.leer('data/publicas/serie-x.json').partidas[0].estadoPublicacion, 'por-publicarse');
    const mal = cli();
    assert.equal(mal.status, 1);
    assert.match(mal.stderr, /Uso:/);
    const final = cli('--archivo=serie-x.json', '--partida=1', '--hasta=1', '--final', `--raiz=${e.raiz}`);
    assert.equal(final.status, 1);
    assert.match(final.stderr, /no llega al ultimo turno/);
  } finally { e.limpiar(); }
});
