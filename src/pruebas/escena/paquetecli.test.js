// La herramienta herramientas/paquete.mjs: escribe en disco la carpeta lista para publicar una partida (LEEME.md y un texto por pieza y por red). Se prueba como las demas
// herramientas: lanzandola de verdad con `spawnSync` y escribiendo solo en un directorio temporal (--salida). Sin API, sin red.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { escribirPaquete, leemeDe } from '../../../herramientas/paquete.mjs';
import { formatoDeTiempo } from '../../../herramientas/partes.mjs';
import { carpetaDeVoz } from '../../../herramientas/narrar.mjs';
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
    assert.ok(texto.includes(`guerra-p1-${p.id}.mkv`), `${p.id}: falta el nombre de la grabacion (OBS graba la hoja en MKV)`);
    assert.ok(texto.includes(`Dura: ${formatoDeTiempo(p.grabar.ms)} `), `${p.id}: falta la duracion`);
    assert.ok(texto.includes(`la grabación completa dura ${formatoDeTiempo(p.grabar.plan.totalMs)}`), `${p.id}: falta lo que dura todo lo grabado, con los margenes`);
    assert.ok(texto.includes(`node herramientas/recortar-formatos.mjs "grabaciones/guerra-p1-${p.id}.mkv" guerra-p1-${p.id} --carpeta=grabaciones/listos`), `${p.id}: falta el comando exacto de recorte`);
  }
  assert.doesNotMatch(texto, /guerra-p1-[\w-]+\.mp4/, 'lo que se guarda de OBS es la hoja en MKV: el MP4 sale del recorte (y esos si se nombran _9x16.mp4, no asi)');
  assert.doesNotMatch(texto, /1080 × 1920/, 'la fuente de OBS es la hoja de 3840 × 2160');
  assert.match(texto, /3840 × 2160/, 'dice como esta la fuente de OBS');
  assert.match(texto, /negro/i, 'explica el margen y el fundido de negro');
  assert.match(texto, /Actualizar caché de la página actual/, 'dice como arrancar la grabacion');
  for (const frase of ['generado por IA', 'primeros 3 segundos', 'GANCHO']) assert.ok(texto.toLowerCase().includes(frase.toLowerCase()), `la lista de revision no dice: ${frase}`);
  assert.ok(texto.includes(PARTIDA.juego.nombre));
});

test('el LEEME dice los margenes de FUNDIDOS (no un «2 s» escrito a mano): si cambian los tiempos, cambia lo que se le pide a quien graba', async () => {
  const { FUNDIDOS } = await import('../../../web/casino/escena-config.js');
  const guardado = { ...FUNDIDOS };
  try {
    Object.assign(FUNDIDOS, { margenMs: 3000, colaMs: 4000 });
    const paquete = construirPaquete({ partida: PARTIDA, beats: await armarLinea('conquista', PARTIDA), destacadas: [], archivo: 'pruebas/guerra.json', partidaNumero: 1, enlace: ENLACE });
    const texto = leemeDe(paquete, { archivo: 'pruebas/guerra.json', partidaNumero: 1, enlace: ENLACE, nombreBase: 'guerra-p1' });
    assert.match(texto, /3 s de negro al empezar/);
    assert.match(texto, /4 s de negro al final/);
    assert.match(texto, /hay 4 segundos de margen/);
    assert.match(texto, /negro 3 segundos/);
  } finally {
    Object.assign(FUNDIDOS, guardado);
  }
});

test('el LEEME avisa de las piezas que duran mas de 2:20 (lo que admite X con una cuenta gratis) y no avisa de las que caben', async () => {
  const construir = async (id, partida) => construirPaquete({ partida, beats: await armarLinea(id, partida), destacadas: await destacadasDe(id, partida, 10), archivo: 'pruebas/x.json', partidaNumero: 1, enlace: ENLACE });
  const largo = leemeDe(await construir('tripledado', await jugarTD(1)), { archivo: 'pruebas/x.json', partidaNumero: 1, nombreBase: 'x-p1' });
  assert.match(largo, /### parte-1[\s\S]*?no cabe en X con una cuenta gratis/);
  const pieza = (texto, id) => texto.split('### ').find((s) => s.startsWith(id));
  const corto = leemeDe(await construir('conquista', PARTIDA), { archivo: 'pruebas/x.json', partidaNumero: 1, nombreBase: 'x-p1' });
  assert.doesNotMatch(pieza(corto, 'clip-1'), /no cabe en X/, 'un clip de 23 s cabe en X');
});

test('paquete.mjs usa solo la voz que narrar.mjs dejo para esa partida (sin que haya que escribir su ruta), y con --sinvoz no la usa', () => conTemporal((tmp) => {
  const archivo = guardar(tmp, PARTIDA), salida = join(tmp, 'salida');
  const carpetaVoz = join(tmp, carpetaDeVoz(archivo, 1));
  mkdirSync(carpetaVoz, { recursive: true });
  writeFileSync(join(carpetaVoz, 'voz.json'), '{}');
  const con = lanzar([`--archivo=${archivo}`, `--salida=${salida}`], { cwd: tmp });
  assert.equal(con.status, 0, `${con.stdout}${con.stderr}`);
  assert.match(con.stdout, /voz/i, 'dice que uso la voz que encontro');
  const leeme = readFileSync(join(salida, 'guerra-p1', 'LEEME.md'), 'utf8');
  assert.match(leeme, /voz=data%2Fvoz%2F/, 'la direccion lleva la voz');
  const sin = lanzar([`--archivo=${archivo}`, `--salida=${join(tmp, 'salida2')}`, '--sinvoz'], { cwd: tmp });
  assert.equal(sin.status, 0, `${sin.stdout}${sin.stderr}`);
  assert.doesNotMatch(readFileSync(join(tmp, 'salida2', 'guerra-p1', 'LEEME.md'), 'utf8'), /voz=/);
  const ninguna = lanzar([`--archivo=${archivo}`, `--salida=${join(tmp, 'salida3')}`], { cwd: join(tmp, 'salida') });
  assert.equal(ninguna.status, 0, `${ninguna.stdout}${ninguna.stderr}`);
  assert.doesNotMatch(readFileSync(join(tmp, 'salida3', 'guerra-p1', 'LEEME.md'), 'utf8'), /voz=/, 'sin voz generada no se pone ninguna');
}));

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

test('paquete.mjs arma por omision las direcciones para la hoja maestra de OBS (formato=hoja y grabar=1); --formato=9x16 las deja verticales', () => conTemporal((tmp) => {
  const archivo = guardar(tmp, PARTIDA);
  const hoja = lanzar([`--archivo=${archivo}`, `--salida=${join(tmp, 's1')}`]);
  assert.equal(hoja.status, 0, `${hoja.stdout}${hoja.stderr}`);
  const leemeHoja = readFileSync(join(tmp, 's1', 'guerra-p1', 'LEEME.md'), 'utf8');
  const direcciones = leemeHoja.match(/http:\/\/localhost:4321\/escena\.html\?[^\s)]+/g) ?? [];
  assert.ok(direcciones.length >= 3, 'las direcciones de las piezas salen en el LEEME');
  for (const d of direcciones) { const q = new URL(d).searchParams; assert.equal(q.get('formato'), 'hoja', d); assert.equal(q.get('grabar'), '1', d); assert.equal(q.get('auto'), '1', d); }
  const vertical = lanzar([`--archivo=${archivo}`, `--salida=${join(tmp, 's2')}`, '--formato=9x16']);
  assert.equal(vertical.status, 0, `${vertical.stdout}${vertical.stderr}`);
  assert.match(readFileSync(join(tmp, 's2', 'guerra-p1', 'LEEME.md'), 'utf8'), /formato=9x16/);
}));
