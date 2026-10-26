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
import { escribirPaquete, leemeDe, paquetesDeSerie } from '../../../herramientas/paquete.mjs';
import { formatoDeTiempo } from '../../../herramientas/partes.mjs';
import { fechaDe, nombreDePieza, nombreDeVideo, SUBCARPETAS } from '../../../herramientas/nombres.mjs';
import { FORMATOS } from '../../../herramientas/formatos.mjs';
import { carpetaDeVoz } from '../../../herramientas/narrar.mjs';
import { construirPaquete } from '../../../web/casino/paquete-textos.js';
import { armarLinea, destacadasDe } from '../../../web/casino/lineas.js';
import { jugarConqBots, ESCENARIOS } from './ayudas-conq.js';
import { jugarTD } from './ayudas-td.js';

const RAIZ = fileURLToPath(new URL('../../../', import.meta.url));
const PARTIDA = await jugarConqBots(ESCENARIOS[0].seed, ESCENARIOS[0].bots);
const ENLACE = 'https://gerrypetrucci.github.io/enfrentando-a-las-ias/';
const FECHA = fechaDe('2026-10-19-guerra.json'), SERIE = 'grabaciones/listos/guerra-de-territorios/2026-10-19_seed-777';
const CTX = { archivo: 'pruebas/guerra.json', partidaNumero: 1, juegoNumero: 1, enlace: ENLACE, fecha: FECHA, carpetaSerie: SERIE }; // lo que paquete.mjs le pasa a leemeDe
const REDES_DE_TEXTO = ['tiktok', 'instagram', 'facebook', 'x', 'youtube'];

function lanzar(args, { cwd = RAIZ } = {}) {
  return spawnSync(process.execPath, [join(RAIZ, 'herramientas', 'paquete.mjs'), ...args], { encoding: 'utf8', timeout: 30000, cwd });
}
function conTemporal(fn) {
  const carpeta = mkdtempSync(join(tmpdir(), 'paquete-'));
  try { return fn(carpeta); } finally { rmSync(carpeta, { recursive: true, force: true }); }
}
// lo mismo para pruebas async: espera a que `fn` termine antes de borrar la carpeta (con conTemporal se borraba al primer await y la prueba volvia a crearla, dejando basura en el temporal del sistema)
async function conTemporalAsync(fn) {
  const carpeta = mkdtempSync(join(tmpdir(), 'paquete-'));
  try { return await fn(carpeta); } finally { rmSync(carpeta, { recursive: true, force: true }); }
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
  const carpeta = join(salida, 'paquete-j1');
  assert.ok(existsSync(join(carpeta, 'LEEME.md')));
  for (const sub of SUBCARPETAS) assert.ok(existsSync(join(salida, sub, 'j1')), `la serie nace con su carpeta ${sub}/j1/`);
  const archivos = readdirSync(join(carpeta, 'textos')).sort();
  for (const pieza of ['parte-1', 'parte-2', 'clip-1']) assert.ok(archivos.includes(`${pieza}.txt`), `falta ${pieza}.txt`);
  assert.ok(!archivos.some((n) => /-(facebook|instagram|youtube|tiktok|x|comentario)\.txt$/.test(n)));
  assert.ok(!archivos.includes('clip-1-comentario.txt'), 'un clip no lleva comentario fijado');
  const leeme = readFileSync(join(carpeta, 'LEEME.md'), 'utf8');
  for (const pieza of ['parte-1', 'parte-2', 'clip-1']) assert.match(leeme, new RegExp(`### .*${pieza}`), `el LEEME no habla de ${pieza}`);
  assert.match(leeme, /http:\/\/localhost:4321\/escena\.html\?archivo=[^\s)]*ronda=\d+&hasta=\d+/, 'direccion exacta con ronda= y hasta=');
  assert.match(leeme, /node src\/servidor\.js/, 'dice como abrir el servidor');
  assert.match(leeme, /Texto único/, 'hay un solo texto por pieza');
  assert.match(readFileSync(join(carpeta, 'guion.md'), 'utf8'), /Guion propuesto/);
  assert.match(leeme, /bots|control/i, 'la advertencia de que es una partida de bots sale en el LEEME');
}));

test('sin --enlace, el comentario fijado manda al sitio con el seed de la partida para buscarlo (?seed=)', () => conTemporal((tmp) => {
  const archivo = guardar(tmp, PARTIDA), salida = join(tmp, 'salida');
  const r = lanzar([`--archivo=${archivo}`, `--salida=${salida}`]);
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  const comentario = readFileSync(join(salida, 'paquete-j1', 'textos', 'parte-1.txt'), 'utf8');
  assert.ok(comentario.includes(`${ENLACE}?seed=${PARTIDA.seed}`), comentario);
}));

test('escribirPaquete deja cada texto tal cual (lo que se copia es exactamente lo que construyo el paquete) y el de YouTube lleva titulo y descripcion', async () => conTemporalAsync(async (tmp) => {
  const beats = await armarLinea('conquista', PARTIDA), destacadas = await destacadasDe('conquista', PARTIDA, 10);
  const paquete = construirPaquete({ partida: PARTIDA, beats, destacadas, archivo: 'pruebas/guerra.json', partidaNumero: 1, enlace: ENLACE });
  const carpeta = join(tmp, 'p');
  const escritos = escribirPaquete(paquete, carpeta, { archivo: 'pruebas/guerra.json', partidaNumero: 1, enlace: ENLACE });
  assert.equal(escritos.length, 3 + paquete.piezas.length);
  const p = paquete.piezas[1];
  assert.equal(readFileSync(join(carpeta, 'textos', 'parte-2.txt'), 'utf8'), `TÍTULO\n${p.publicacion.titulo}\n\nDESCRIPCIÓN\n${p.publicacion.descripcion}\n\nCOMENTARIO FIJADO\n${p.comentarioFijado}\n`);
}));

test('leemeDe explica, para cada pieza, que grabar, cuanto dura, con que direccion y como nombrar el archivo, y trae la lista de revision de cada video', async () => {
  const beats = await armarLinea('conquista', PARTIDA), destacadas = await destacadasDe('conquista', PARTIDA, 10);
  const paquete = construirPaquete({ partida: PARTIDA, beats, destacadas, archivo: 'pruebas/guerra.json', partidaNumero: 1, enlace: ENLACE });
  const texto = leemeDe(paquete, CTX);
  for (const p of paquete.piezas) {
    const base = nombreDePieza({ juego: 1, pieza: p.id });
    if (p.tipo === 'gancho-imagen') { // una imagen no se graba: el LEEME da su pagina (vista previa), los PNG que ya genero y el comando para regenerarla (lo prueba paquete.test.js)
      assert.ok(texto.includes(`### ${p.id} ·`) && texto.includes(`http://localhost:4321/${p.grabar.url}`) && texto.includes(`${base}_9x16_fb-ig-tk-yt.png`), `${p.id}: falta su seccion de imagen`);
      continue;
    }
    assert.ok(texto.includes(`http://localhost:4321/${p.grabar.url}`), `${p.id}: falta su direccion`);
    assert.ok(texto.includes(`${base}.mkv`), `${p.id}: falta el nombre de la grabacion (OBS graba la hoja en MKV)`);
    assert.ok(texto.includes(`Dura: ${formatoDeTiempo(p.grabar.ms)} `), `${p.id}: falta la duracion`);
    assert.ok(texto.includes(`la grabación completa dura ${formatoDeTiempo(p.grabar.plan.totalMs)}`), `${p.id}: falta lo que dura todo lo grabado, con los margenes`);
    assert.ok(texto.includes(`node herramientas/recortar-formatos.mjs "${SERIE}/originales/j1/${base}.mkv" ${base} "--carpeta=${SERIE}/por-subir/j1" --audio-separado`), `${p.id}: falta el comando exacto de recorte`);
    for (const k of Object.keys(FORMATOS)) for (const v of ['convoz', 'sinvoz']) assert.ok(texto.includes(`${nombreDeVideo(`${base}_${v}`, k)}.mp4`));
  }
  // el nombre de cada video dice el juego, la pieza, el formato y las redes: j1_pt1_9x16_fb-ig-tk-yt.mp4
  assert.ok(texto.includes('j1_pt1_convoz_9x16_fb-ig-tk-yt.mp4') && texto.includes('j1_pt2_sinvoz_16x9_fb-x-yt.mp4'));
  for (const mp4 of texto.match(/[\w-]+\.mp4/g) ?? []) assert.match(mp4, /^j\d+_(hk|pt|clp)\d_(convoz|sinvoz)_(9x16|16x9)_[a-z]+(-[a-z]+)*\.mp4$/, `un .mp4 sin el nombre nuevo: ${mp4}`);
  assert.doesNotMatch(texto, /grabaciones\/listos\b(?!\/guerra)/, 'las rutas apuntan a la carpeta de la serie, no a grabaciones/listos suelto');
  assert.match(texto, /subidos\//, 'dice que lo subido se mueve a subidos/');
  assert.ok(texto.includes('textos/parte-1.txt'), 'lista el texto unico');
  // el gancho «Proximamente»: se explica y se dice en que orden se sube
  assert.match(texto, /### gancho-1/, 'el gancho es una pieza mas del LEEME');
  assert.match(texto, /primero el gancho \(hk\), luego la parte \(pt\) y al final los clips \(clp\)/i, 'dice el orden de subida');
  assert.match(texto, /Próximamente/, 'la lista de revision dice como abre un gancho');
  assert.ok(texto.includes('j1_hk1_convoz_9x16_fb-ig-tk-yt.mp4'));
  assert.doesNotMatch(texto, /1080 × 1920/, 'la fuente de OBS es la hoja de 3840 × 2160');
  assert.match(texto, /3840 × 2160/, 'dice como esta la fuente de OBS');
  assert.match(texto, /negro/i, 'explica el margen y el fundido de negro');
  assert.match(texto, /Actualizar caché de la página actual/, 'dice como arrancar la grabacion');
  for (const frase of ['generado por IA', 'primeros 3 segundos', 'GANCHO']) assert.ok(texto.toLowerCase().includes(frase.toLowerCase()), `la lista de revision no dice: ${frase}`);
  assert.ok(texto.includes(PARTIDA.juego.nombre));
});

test('el LEEME pone los nombres de archivo, las direcciones y los comandos en bloques de código (copiables) y los junta en un resumen al principio', async () => {
  const beats = await armarLinea('conquista', PARTIDA), destacadas = await destacadasDe('conquista', PARTIDA, 10);
  const paquete = construirPaquete({ partida: PARTIDA, beats, destacadas, archivo: 'pruebas/guerra.json', partidaNumero: 1, enlace: ENLACE });
  const texto = leemeDe(paquete, CTX);
  const lineas = texto.split('\n');
  assert.equal(lineas.filter((l) => /^\s*```/.test(l)).length % 2, 0, 'cada bloque de código se cierra');
  const bloques = [...texto.matchAll(/^( *)```(\w*)\n([\s\S]*?)\n\1```$/gm)].map((m) => ({ lenguaje: m[2], cuerpo: m[3].split('\n').map((l) => l.slice(m[1].length)).join('\n') })); // sin la sangria de la vineta
  const fuera = texto.replace(/^( *)```(\w*)\n[\s\S]*?\n\1```$/gm, '');
  // lo que se copia solo aparece dentro de bloques: nunca suelto en una frase
  assert.doesNotMatch(fuera, /\bnode herramientas\/(recortar-formatos|gancho-imagen)\.mjs/, 'un comando de recorte fuera de un bloque');
  assert.doesNotMatch(fuera, /\bj\d+_(hk|pt|clp)\d\.mkv\b/, 'el nombre de una grabación fuera de un bloque');
  assert.doesNotMatch(fuera, /http:\/\/localhost:4321\/(escena|gancho-imagen)\.html/, 'una dirección de grabación fuera de un bloque');
  const grabables = paquete.piezas.filter((p) => p.tipo !== 'gancho-imagen');
  // el resumen va antes del paso 0: los nombres (en el orden de grabacion) y los comandos, un renglon por pieza
  const iResumen = texto.indexOf('## Resumen rápido'), iPaso0 = texto.indexOf('## Paso 0');
  assert.ok(iResumen > 0 && iResumen < iPaso0, 'el resumen va antes del paso 0');
  const resumen = texto.slice(iResumen, iPaso0);
  const nombres = resumen.match(/```text\n([\s\S]*?)\n```/)[1].split('\n'), comandos = resumen.match(/```powershell\n([\s\S]*?)\n```/)[1].split('\n');
  assert.equal(nombres.length, grabables.length);
  assert.equal(comandos.length, grabables.length);
  nombres.forEach((n, i) => { assert.match(n, /^j1_(hk|pt|clp)\d\.mkv$/, n); assert.ok(comandos[i].startsWith('node herramientas/recortar-formatos.mjs "') && comandos[i].includes(` ${n.replace(/\.mkv$/, '')} `), `${n} → ${comandos[i]}`); });
  assert.ok(bloques.some((b) => b.lenguaje === 'powershell' && b.cuerpo === 'node src/servidor.js'), 'el comando del servidor tambien es un bloque');
  // cada pieza: su direccion, el nombre a ponerle y su comando de recorte, cada cosa en su propio bloque
  for (const p of grabables) {
    const base = nombreDePieza({ juego: 1, pieza: p.id });
    assert.ok(bloques.some((b) => b.cuerpo === `http://localhost:4321/${p.grabar.url}`), `${p.id}: dirección en un bloque`);
    assert.ok(nombres.includes(`${base}.mkv`) && bloques.some((b) => b.cuerpo === `${base}.mkv`), `${p.id}: el nombre, en el resumen y en su sección`);
    assert.ok(comandos.some((c) => c.includes(`/${base}.mkv" ${base} `)) && bloques.some((b) => b.lenguaje === 'powershell' && !b.cuerpo.includes('\n') && b.cuerpo.includes(`/${base}.mkv" ${base} `)), `${p.id}: el comando de recorte, en el resumen y en su sección`);
  }
  assert.ok(texto.includes('`j1_pt1_convoz_9x16_fb-ig-tk-yt.mp4` → Facebook, Instagram, TikTok, YouTube'), 'los videos que quedan, en código en línea');
  assert.ok(bloques.some((b) => b.cuerpo === `${SERIE}/originales/j1/`), 'la carpeta de originales, copiable');
});

test('el LEEME dice los margenes de FUNDIDOS (no un «2 s» escrito a mano): si cambian los tiempos, cambia lo que se le pide a quien graba', async () => {
  const { FUNDIDOS } = await import('../../../web/casino/escena-config.js');
  const guardado = { ...FUNDIDOS };
  try {
    Object.assign(FUNDIDOS, { margenMs: 3000, colaMs: 4000 });
    const paquete = construirPaquete({ partida: PARTIDA, beats: await armarLinea('conquista', PARTIDA), destacadas: [], archivo: 'pruebas/guerra.json', partidaNumero: 1, enlace: ENLACE });
    const texto = leemeDe(paquete, CTX);
    assert.match(texto, /3 s de negro al empezar/);
    assert.match(texto, /4 s de negro al final/);
    assert.match(texto, /al menos 4 segundos/, 'se pide esperar a ver el negro de salida el tiempo que el recortador necesita para encontrarlo');
    assert.match(texto, /al menos 4 s después del fundido final/);
    assert.match(texto, /negro 3 segundos/);
    assert.doesNotMatch(texto, /al terminar el fundido final\)/, 'no invita a detener justo al acabar el fundido (sin negro de salida no hay recorte del final)');
  } finally {
    Object.assign(FUNDIDOS, guardado);
  }
});

test('el LEEME avisa de las piezas que duran mas de 2:20 (lo que admite X con una cuenta gratis) y no avisa de las que caben', async () => {
  const construir = async (id, partida) => construirPaquete({ partida, beats: await armarLinea(id, partida), destacadas: await destacadasDe(id, partida, 10), archivo: 'pruebas/x.json', partidaNumero: 1, enlace: ENLACE });
  const largo = leemeDe(await construir('tripledado', await jugarTD(1)), { ...CTX, archivo: 'pruebas/x.json', enlace: undefined });
  assert.match(largo, /### parte-1[\s\S]*?no cabe en X con una cuenta gratis/);
  const pieza = (texto, id) => texto.split('### ').find((s) => s.startsWith(id));
  const corto = leemeDe(await construir('conquista', PARTIDA), { ...CTX, archivo: 'pruebas/x.json', enlace: undefined });
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
  const leeme = readFileSync(join(salida, 'paquete-j1', 'LEEME.md'), 'utf8');
  assert.match(leeme, /voz=data%2Fvoz%2F/, 'la direccion lleva la voz');
  const sin = lanzar([`--archivo=${archivo}`, `--salida=${join(tmp, 'salida2')}`, '--sinvoz'], { cwd: tmp });
  assert.equal(sin.status, 0, `${sin.stdout}${sin.stderr}`);
  assert.doesNotMatch(readFileSync(join(tmp, 'salida2', 'paquete-j1', 'LEEME.md'), 'utf8'), /voz=/);
  const ninguna = lanzar([`--archivo=${archivo}`, `--salida=${join(tmp, 'salida3')}`], { cwd: join(tmp, 'salida') });
  assert.equal(ninguna.status, 0, `${ninguna.stdout}${ninguna.stderr}`);
  assert.doesNotMatch(readFileSync(join(tmp, 'salida3', 'paquete-j1', 'LEEME.md'), 'utf8'), /voz=/, 'sin voz generada no se pone ninguna');
}));

test('paquete.mjs no pisa una carpeta existente sin --forzar; con --forzar la reescribe', () => conTemporal((tmp) => {
  const archivo = guardar(tmp, PARTIDA), salida = join(tmp, 'salida'), leeme = join(salida, 'paquete-j1', 'LEEME.md');
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

test('partes.mjs avisa si la voz no cubre los momentos con texto de la partida (si no, se grabaria sin voz sin enterarse) y no avisa con una voz al dia ni sin voz', async () => conTemporalAsync(async (tmp) => {
  const archivo = guardar(tmp, PARTIDA);
  const beats = await armarLinea('conquista', PARTIDA);
  const alDia = Object.fromEntries(beats.filter((b) => b.texto).map((b) => [b.id, { archivo: `data/voz/x-p1/${b.id}.ogg`, ms: 5000, fuente: b.texto }]));
  const vieja = { ...alDia };
  delete vieja[beats.find((b) => b.texto && b.tipo !== 'intro').id];
  const partes = (voz) => {
    const args = [`--archivo=${archivo}`];
    if (voz) { const ruta = join(tmp, 'voz.json'); writeFileSync(ruta, JSON.stringify(voz)); args.push(`--voz=${ruta}`); }
    return spawnSync(process.execPath, [join(RAIZ, 'herramientas', 'partes.mjs'), ...args], { encoding: 'utf8', timeout: 30000, cwd: RAIZ });
  };
  const conVieja = partes(vieja);
  assert.equal(conVieja.status, 0, `${conVieja.stdout}${conVieja.stderr}`);
  assert.match(conVieja.stdout, /AVISO: la voz no cubre 1 momento[^\n]*narrar\.mjs/i);
  for (const voz of [alDia, null]) { const r = partes(voz); assert.equal(r.status, 0, `${r.stdout}${r.stderr}`); assert.doesNotMatch(r.stdout, /AVISO/, voz ? 'voz al dia' : 'sin voz'); }
  // y las direcciones que imprime son las del paquete: para la hoja, sin barra y con margenes
  assert.match(partes(alDia).stdout, /escena\.html\?[^\s]*formato=hoja[^\s]*grabar=1/);
}));

test('paquete.mjs arma por omision las direcciones para la hoja maestra de OBS (formato=hoja y grabar=1); --formato=9x16 las deja verticales', () => conTemporal((tmp) => {
  const archivo = guardar(tmp, PARTIDA);
  const hoja = lanzar([`--archivo=${archivo}`, `--salida=${join(tmp, 's1')}`]);
  assert.equal(hoja.status, 0, `${hoja.stdout}${hoja.stderr}`);
  const leemeHoja = readFileSync(join(tmp, 's1', 'paquete-j1', 'LEEME.md'), 'utf8');
  const direcciones = leemeHoja.match(/http:\/\/localhost:4321\/escena\.html\?[^\s)]+/g) ?? [];
  assert.ok(direcciones.length >= 3, 'las direcciones de las piezas salen en el LEEME');
  for (const d of direcciones) { const q = new URL(d).searchParams; assert.equal(q.get('formato'), 'hoja', d); assert.equal(q.get('grabar'), '1', d); assert.equal(q.get('auto'), '1', d); }
  const vertical = lanzar([`--archivo=${archivo}`, `--salida=${join(tmp, 's2')}`, '--formato=9x16']);
  assert.equal(vertical.status, 0, `${vertical.stdout}${vertical.stderr}`);
  assert.match(readFileSync(join(tmp, 's2', 'paquete-j1', 'LEEME.md'), 'utf8'), /formato=9x16/);
}));

test('sin --salida, paquete.mjs arma la carpeta de la serie en grabaciones/listos/<juego>/<fecha>_seed-<seedBase>/ con sus subcarpetas de estado y el paquete dentro', () => conTemporal((tmp) => {
  const ruta = join(tmp, '2026-10-19-guerra.json');
  writeFileSync(ruta, JSON.stringify({ juego: PARTIDA.juego, seedBase: 777, partidas: [PARTIDA] }));
  const r = lanzar([`--archivo=${ruta}`, '--sinvoz'], { cwd: tmp });
  assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
  const serie = join(tmp, 'grabaciones', 'listos', 'guerra-de-territorios', '2026-10-19_seed-777');
  for (const sub of [...SUBCARPETAS, 'paquete-j1']) assert.ok(existsSync(join(serie, sub)), `falta ${sub}/`);
  const leeme = readFileSync(join(serie, 'paquete-j1', 'LEEME.md'), 'utf8');
  assert.match(leeme, /grabaciones\/listos\/guerra-de-territorios\/2026-10-19_seed-777\/originales\/j1\/j1_pt1\.mkv/, 'las rutas del LEEME son las de la serie y del juego');
  assert.match(r.stdout, /2026-10-19_seed-777/, 'dice donde dejo el paquete');
  const meta = JSON.parse(readFileSync(join(serie, 'paquete-j1', 'paquete.json'), 'utf8'));
  assert.deepEqual([meta.version, meta.juego, meta.partida, meta.archivo], [2, 1, 1, ruta]);
  assert.ok(meta.ordenPublicacion.length > 0);
}));

test('paquetesDeSerie lee el paquete.json de cada paquete-jN aunque lo haya escrito alguien con BOM, y cuenta tambien un paquete sin paquete.json (sin partida conocida)', () => conTemporal((tmp) => {
  mkdirSync(join(tmp, 'paquete-j1'));
  writeFileSync(join(tmp, 'paquete-j1', 'paquete.json'), '﻿{"juego":1,"partida":2}');
  mkdirSync(join(tmp, 'paquete-j4'));
  mkdirSync(join(tmp, 'paquete-p1')); // el esquema viejo no cuenta
  writeFileSync(join(tmp, 'paquete-j9'), 'esto es un archivo, no una carpeta');
  const lista = paquetesDeSerie(tmp).map(({ juego, partida }) => ({ juego, partida })).sort((a, b) => a.juego - b.juego);
  assert.deepEqual(lista, [{ juego: 1, partida: 2 }, { juego: 4, partida: null }]);
  assert.deepEqual(paquetesDeSerie(join(tmp, 'no-existe')), []);
}));

test('el numero de juego sube de uno en uno por cada partida empaquetada del juego (aunque sea de otra serie), y regenerar un paquete conserva el suyo', () => conTemporal((tmp) => {
  const escribir = (nombre, seedBase, partidas) => { const ruta = join(tmp, nombre); writeFileSync(ruta, JSON.stringify({ juego: PARTIDA.juego, seedBase, partidas })); return ruta; };
  const a = escribir('2026-10-19-guerra.json', 111, [PARTIDA, PARTIDA]), b = escribir('2026-10-20-guerra.json', 222, [PARTIDA]);
  const correr = (archivo, partida, ...extra) => { const r = lanzar([`--archivo=${archivo}`, `--partida=${partida}`, '--sinvoz', ...extra], { cwd: tmp }); assert.equal(r.status, 0, `${r.stdout}${r.stderr}`); return r; };
  const juego = (serie) => join(tmp, 'grabaciones', 'listos', 'guerra-de-territorios', serie);
  correr(a, 1);
  correr(a, 2);
  correr(b, 1);
  assert.ok(existsSync(join(juego('2026-10-19_seed-111'), 'paquete-j1', 'LEEME.md')), 'la partida 1 de la primera serie es el juego 1');
  assert.ok(existsSync(join(juego('2026-10-19_seed-111'), 'paquete-j2', 'LEEME.md')), 'la partida 2, el juego 2');
  assert.ok(existsSync(join(juego('2026-10-20_seed-222'), 'paquete-j3', 'LEEME.md')), 'otra serie del mismo juego sigue la cuenta: el juego 3');
  assert.match(readFileSync(join(juego('2026-10-20_seed-222'), 'paquete-j3', 'LEEME.md'), 'utf8'), /j3_pt1_convoz_9x16_fb-ig-tk-yt\.mp4/);
  correr(a, 1, '--forzar');
  correr(a, 2, '--forzar');
  assert.ok(!existsSync(join(juego('2026-10-19_seed-111'), 'paquete-j4')) && !existsSync(join(juego('2026-10-20_seed-222'), 'paquete-j4')), 'regenerar la partida 1 o la 2 no les da otro numero');
  const otra = lanzar([`--archivo=${a}`, '--partida=1', '--sinvoz'], { cwd: tmp });
  assert.equal(otra.status, 1);
  assert.match(otra.stderr, /paquete-j1.*ya existe/s, 'sin --forzar se niega, y dice cual carpeta');
  correr(a, 2, '--juego=9', '--forzar');
  assert.ok(existsSync(join(juego('2026-10-19_seed-111'), 'paquete-j9')), '--juego=N manda sobre la cuenta');
}));
