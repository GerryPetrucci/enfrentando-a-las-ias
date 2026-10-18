// La herramienta herramientas/paquete.mjs: escribe en disco la carpeta lista para publicar una partida (LEEME.md y un texto por pieza y por red). Se prueba como las demas
// herramientas: lanzandola de verdad con `spawnSync` y escribiendo solo en un directorio temporal (--salida). Sin API, sin red.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { escribirPaquete, leemeDe } from '../../../herramientas/paquete.mjs';
import { formatoDeTiempo } from '../../../herramientas/partes.mjs';
import { construirPaquete } from '../../../web/casino/paquete-textos.js';
import { armarLinea, destacadasDe } from '../../../web/casino/lineas.js';
import { jugarConqBots, ESCENARIOS } from './ayudas-conq.js';
import { jugarTD } from './ayudas-td.js';

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url));
const PARTIDA = await jugarConqBots(ESCENARIOS[0].seed, ESCENARIOS[0].bots);
const ENLACE = 'https://gerrypetrucci.github.io/enfrentando-a-las-ias/';

function lanzar(args, { cwd = RAIZ } = {}) {
  return spawnSync(process.execPath, [join(RAIZ, 'herramientas', 'paquete.mjs'), ...args], { encoding: 'utf8', timeout: 30000, cwd });
}
function conTemporal(fn) {
  const carpeta = mkdtempSync(join(tmpdir(), 'paquete-'));
  try { return fn(carpeta); } finally { rmSync(carpeta, { recursive: true, force: true }); }
}
const guardar = (carpeta, partida, nombre = 'guerra.json') => {
  const ruta = join(carpeta, nombre);
  writeFileSync(ruta, JSON.stringify({ juego: partida.juego, partidas: [partida] }));
  return ruta;
};

test('paquete.mjs escribe el LEEME y los textos de cada pieza y de cada red, y el LEEME trae las direcciones exactas para grabar', () => conTemporal((tmp) => {
  const archivo = guardar(tmp, PARTIDA), salida = join(tmp, 'salida');
  const r = lanzar([`--archivo=${archivo}`, `--salida=${salida}`, `--enlace=${ENLACE}`]);
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  const carpeta = join(salida, 'guerra-p1');
  assert.ok(existsSync(join(carpeta, 'LEEME.md')));
  const archivos = readdirSync(join(carpeta, 'textos')).sort();
  for (const pieza of ['parte-1', 'parte-2', 'clip-1']) for (const red of ['tiktok', 'instagram', 'x', 'youtube']) assert.ok(archivos.includes(`${pieza}-${red}.txt`), `falta ${pieza}-${red}.txt`);
  for (const pieza of ['parte-1', 'parte-2']) assert.ok(archivos.includes(`${pieza}-comentario.txt`), `falta el comentario fijado de ${pieza}`);
  assert.ok(!archivos.includes('clip-1-comentario.txt'), 'un clip no lleva comentario fijado');
  const leeme = readFileSync(join(carpeta, 'LEEME.md'), 'utf8');
  for (const pieza of ['parte-1', 'parte-2', 'clip-1']) assert.match(leeme, new RegExp(`### .*${pieza}`), `el LEEME no habla de ${pieza}`);
  assert.match(leeme, /http:\/\/localhost:4321\/escena\.html\?archivo=[^\s)]*ronda=\d+&hasta=\d+/, 'direccion exacta con ronda= y hasta=');
  assert.match(leeme, /node src\/servidor\.js/, 'dice como abrir el servidor');
  assert.match(leeme, /\[GANCHO/, 'avisa que hay que confirmar la linea de gancho');
  assert.match(leeme, /bots|control/i, 'la advertencia de que es una partida de bots sale en el LEEME');
}));

test('escribirPaquete deja cada texto tal cual (lo que se copia es exactamente lo que construyo el paquete) y el de YouTube lleva titulo y descripcion', async () => conTemporal(async (tmp) => {
  const beats = await armarLinea('conquista', PARTIDA), destacadas = await destacadasDe('conquista', PARTIDA, 10);
  const paquete = construirPaquete({ partida: PARTIDA, beats, destacadas, archivo: 'pruebas/guerra.json', partidaNumero: 1, enlace: ENLACE });
  const carpeta = join(tmp, 'p');
  const escritos = escribirPaquete(paquete, carpeta, { archivo: 'pruebas/guerra.json', partidaNumero: 1, enlace: ENLACE });
  assert.ok(Array.isArray(escritos) && escritos.length >= 1 + 4 * paquete.piezas.length);
  const p = paquete.piezas[1];
  assert.equal(readFileSync(join(carpeta, 'textos', 'parte-2-instagram.txt'), 'utf8'), `${p.textos.instagram}\n`);
  assert.equal(readFileSync(join(carpeta, 'textos', 'parte-2-tiktok.txt'), 'utf8'), `${p.textos.tiktok}\n`);
  assert.equal(readFileSync(join(carpeta, 'textos', 'parte-2-x.txt'), 'utf8'), `${p.textos.x}\n`);
  assert.equal(readFileSync(join(carpeta, 'textos', 'parte-2-comentario.txt'), 'utf8'), `${p.comentarioFijado}\n`);
  assert.equal(readFileSync(join(carpeta, 'textos', 'parte-2-youtube.txt'), 'utf8'), `TÍTULO\n${p.textos.youtube.titulo}\n\nDESCRIPCIÓN\n${p.textos.youtube.descripcion}\n`);
}));

test('leemeDe explica, para cada pieza, que grabar, cuanto dura, con que direccion y como nombrar el archivo, y trae la lista de revision de cada video', async () => {
  const beats = await armarLinea('conquista', PARTIDA), destacadas = await destacadasDe('conquista', PARTIDA, 10);
  const paquete = construirPaquete({ partida: PARTIDA, beats, destacadas, archivo: 'pruebas/guerra.json', partidaNumero: 1, enlace: ENLACE });
  const texto = leemeDe(paquete, { archivo: 'pruebas/guerra.json', partidaNumero: 1, enlace: ENLACE, nombreBase: 'guerra-p1' });
  for (const p of paquete.piezas) {
    assert.ok(texto.includes(`http://localhost:4321/${p.grabar.url}`), `${p.id}: falta su direccion`);
    assert.ok(texto.includes(`guerra-p1-${p.id}.mp4`), `${p.id}: falta el nombre del archivo`);
    assert.ok(texto.includes(`Dura: ${formatoDeTiempo(p.grabar.ms)} `), `${p.id}: falta la duracion`);
  }
  for (const frase of ['generado por IA', 'primeros 3 segundos', 'GANCHO']) assert.ok(texto.toLowerCase().includes(frase.toLowerCase()), `la lista de revision no dice: ${frase}`);
  assert.ok(texto.includes(PARTIDA.juego.nombre));
});

test('el LEEME avisa de las piezas que duran mas de 2:20 (lo que admite X con una cuenta gratis) y no avisa de las que caben', async () => {
  const construir = async (id, partida) => construirPaquete({ partida, beats: await armarLinea(id, partida), destacadas: await destacadasDe(id, partida, 10), archivo: 'pruebas/x.json', partidaNumero: 1, enlace: ENLACE });
  const largo = leemeDe(await construir('tripledado', await jugarTD(1)), { archivo: 'pruebas/x.json', partidaNumero: 1, nombreBase: 'x-p1' });
  assert.match(largo, /### parte-1[\s\S]*?no cabe en X con una cuenta gratis/);
  const pieza = (texto, id) => texto.split('### ').find((s) => s.startsWith(id));
  const corto = leemeDe(await construir('conquista', PARTIDA), { archivo: 'pruebas/x.json', partidaNumero: 1, nombreBase: 'x-p1' });
  assert.doesNotMatch(pieza(corto, 'clip-1'), /no cabe en X/, 'un clip de 23 s cabe en X');
});

test('paquete.mjs no pisa una carpeta existente sin --forzar; con --forzar la reescribe', () => conTemporal((tmp) => {
  const archivo = guardar(tmp, PARTIDA), salida = join(tmp, 'salida'), leeme = join(salida, 'guerra-p1', 'LEEME.md');
  assert.equal(lanzar([`--archivo=${archivo}`, `--salida=${salida}`]).status, 0);
  writeFileSync(leeme, 'MIS NOTAS');
  const otra = lanzar([`--archivo=${archivo}`, `--salida=${salida}`]);
  assert.equal(otra.status, 1);
  assert.match(otra.stderr, /ya existe/);
  assert.match(otra.stderr, /--forzar/);
  assert.equal(readFileSync(leeme, 'utf8'), 'MIS NOTAS', 'no toco nada');
  assert.equal(lanzar([`--archivo=${archivo}`, `--salida=${salida}`, '--forzar']).status, 0);
  assert.notEqual(readFileSync(leeme, 'utf8'), 'MIS NOTAS', 'con --forzar la reescribe');
}));

test('paquete.mjs sale con 1 y dice por que ante: sin --archivo, archivo inexistente, partida inexistente, otro juego, partida cortada y una salida con ..', () => conTemporal((tmp) => {
  const salida = join(tmp, 'salida');
  const casos = [
    [[`--salida=${salida}`], /Falta --archivo/],
    [[`--archivo=${join(tmp, 'no-existe.json')}`, `--salida=${salida}`], /no se pudo leer|no existe|ENOENT/i],
    [[`--archivo=${guardar(tmp, PARTIDA)}`, '--partida=2', `--salida=${salida}`], /no tiene la partida 2/],
    [[`--archivo=${guardar(tmp, { juego: { id: 'dilema', nombre: 'x', categoria: 'y' }, jugadores: [], rondas: [{}] }, 'dilema.json')}`, `--salida=${salida}`], /dilema.*no tiene escena/],
    [[`--archivo=${guardar(tmp, { ...structuredClone(PARTIDA), truncada: true }, 'cortada.json')}`, `--salida=${salida}`], /cortada|truncada/i],
    [[`--archivo=${guardar(tmp, PARTIDA, 'otra.json')}`, `--salida=${tmp}/../fuera-${basename(tmp)}`], /\.\./],
  ];
  for (const [args, patron] of casos) {
    const r = lanzar(args);
    assert.equal(r.status, 1, `${args.join(' ')}: ${r.stdout}${r.stderr}`);
    assert.match(r.stderr, patron, args.join(' '));
  }
  assert.ok(!existsSync(join(tmp, '..', `fuera-${basename(tmp)}`)), 'una salida con .. no escribe nada fuera');
  assert.ok(!existsSync(salida) || readdirSync(salida).length === 0, 'un error no deja carpetas a medias');
}));
