// El gancho en VIDEO DE IMAGEN FIJA (herramientas/gancho-imagen.mjs, decidido el 28-10-2026): donde una parte no puede tener gancho en video (Lobo, o un juego muy corto), en vez de un PNG el paquete genera un video corto
// que repite la imagen en cada cuadro, para poder compartirlo como short de YouTube. Sin red ni API; con ffmpeg en el equipo, tambien se prueba la conversion real.
//
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nombreDeVideoDeGancho, argumentosDeFfmpeg, generarVideosDeGancho, convertirImagenEnVideo, DURACION_GANCHO_IMAGEN_S } from '../../herramientas/gancho-imagen.mjs';
import { codificarPNG } from '../../herramientas/recortar-elenco-lobo.mjs';

test('el video de un gancho de imagen fija se llama como los demas videos (jN, hkM, formato y redes) con extension mp4, y dura lo justo para un short', () => {
  assert.equal(nombreDeVideoDeGancho({ juegoNumero: 1, parte: 1, formato: '9x16' }), 'j1_hk1_9x16_fb-ig-tk-yt.mp4');
  assert.equal(nombreDeVideoDeGancho({ juegoNumero: 12, parte: 2, formato: '16x9' }), 'j12_hk2_16x9_fb-x-yt.mp4');
  assert.ok(DURACION_GANCHO_IMAGEN_S >= 3 && DURACION_GANCHO_IMAGEN_S <= 10, 'un video corto');
});

test('argumentosDeFfmpeg: la MISMA imagen en cada cuadro (loop), H.264 listo para subir, una pista de audio en silencio y la duracion pedida', () => {
  const a = argumentosDeFfmpeg({ imagen: 'in.png', salida: 'out.mp4', duracionS: 6 });
  const junto = a.join(' ');
  assert.equal(a.at(-1), 'out.mp4', 'la salida va al final');
  assert.ok(junto.includes('-loop 1') && junto.includes('-i in.png'), 'repite la imagen');
  assert.ok(junto.includes('-t 6'), 'dura 6 s');
  assert.ok(junto.includes('-c:v libx264') && junto.includes('-pix_fmt yuv420p') && junto.includes('-tune stillimage'), 'H.264 compatible con todas las redes');
  assert.ok(junto.includes('anullsrc') && junto.includes('-c:a aac') && a.includes('-shortest'), 'con una pista de audio en silencio (la musica la pone quien lo sube)');
  assert.ok(junto.includes('-movflags +faststart') && a.includes('-y'));
  assert.ok(argumentosDeFfmpeg({ imagen: 'a.png', salida: 'b.mp4' }).join(' ').includes(`-t ${DURACION_GANCHO_IMAGEN_S}`), 'sin duracion: la de siempre');
});

test('generarVideosDeGancho hace un VIDEO por formato para cada pieza gancho-imagen, con la imagen en una carpeta temporal que no se queda: en por-subir solo quedan los mp4', async () => {
  const renders = [], videos = [];
  const render = async (o) => { renders.push(o); return { destino: o.destino, formato: o.formato, ancho: 1080, alto: 1920 }; };
  const convertir = ({ imagen, salida, duracionS }) => { videos.push({ imagen, salida, duracionS }); return { destino: salida }; };
  const piezas = [{ tipo: 'gancho-imagen', parte: 1 }, { tipo: 'parte', parte: 1 }, { tipo: 'gancho-imagen', parte: 2 }, { tipo: 'gancho', parte: 1 }];
  const r = await generarVideosDeGancho({ piezas, juegoId: 'lobo', juegoNumero: 4, de: 2, carpeta: '/x/por-subir/j4', chrome: '/falso/chrome', render, convertir, duracionS: 5 });
  assert.equal(r.error, null);
  assert.deepEqual(videos.map((v) => v.salida.replaceAll('\\', '/')), [
    '/x/por-subir/j4/j4_hk1_9x16_fb-ig-tk-yt.mp4', '/x/por-subir/j4/j4_hk1_16x9_fb-x-yt.mp4', '/x/por-subir/j4/j4_hk2_9x16_fb-ig-tk-yt.mp4', '/x/por-subir/j4/j4_hk2_16x9_fb-x-yt.mp4']);
  assert.ok(videos.every((v) => v.duracionS === 5 && v.imagen.endsWith('.png') && !v.imagen.replaceAll('\\', '/').startsWith('/x/')), 'la imagen es temporal, no va a por-subir');
  assert.deepEqual(r.hechas.map((h) => [h.formato, h.destino.replaceAll('\\', '/').split('/').at(-1), h.duracionS]), [['9x16', 'j4_hk1_9x16_fb-ig-tk-yt.mp4', 5], ['16x9', 'j4_hk1_16x9_fb-x-yt.mp4', 5], ['9x16', 'j4_hk2_9x16_fb-ig-tk-yt.mp4', 5], ['16x9', 'j4_hk2_16x9_fb-x-yt.mp4', 5]]);
  assert.equal(existsSync(join(renders[0].destino, '..')), false, 'la carpeta temporal se borra al terminar');
  assert.deepEqual(await generarVideosDeGancho({ piezas: [{ tipo: 'parte', parte: 1 }], juegoId: 'lobo', juegoNumero: 1, carpeta: 'x', render, convertir }), { hechas: [], error: null }, 'sin piezas de imagen no hace nada');
});

test('sin navegador o sin ffmpeg el video no revienta: dice por que (con el comando) y devuelve lo que ya hizo', async () => {
  const piezas = [{ tipo: 'gancho-imagen', parte: 1 }];
  const render = async (o) => ({ destino: o.destino, formato: o.formato });
  const sinNavegador = await generarVideosDeGancho({ piezas, juegoId: 'lobo', juegoNumero: 1, carpeta: 'x', chrome: null, render: async () => assert.fail('no debe capturar'), convertir: () => assert.fail('no debe convertir') });
  assert.deepEqual(sinNavegador.hechas, []);
  assert.match(sinNavegador.error, /No encontré Chrome ni Edge.*herramientas\/gancho-imagen\.mjs/);
  let n = 0;
  const sinFfmpeg = await generarVideosDeGancho({ piezas, juegoId: 'lobo', juegoNumero: 1, carpeta: 'x', chrome: '/falso', render, convertir: () => { if (n++) throw new Error('ffmpeg no pudo hacer el video: spawn ffmpeg ENOENT'); return { destino: 'x' }; } });
  assert.equal(sinFfmpeg.hechas.length, 1);
  assert.match(sinFfmpeg.error, /No pude hacer los videos de gancho.*ffmpeg/);
  assert.throws(() => convertirImagenEnVideo({ imagen: 'no-existe.png', salida: join(tmpdir(), 'x.mp4'), ffmpeg: 'ffmpeg-que-no-existe-xyz' }), /ffmpeg no pudo hacer el video/);
});

const hayFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0 && spawnSync('ffprobe', ['-version']).status === 0;
test('con ffmpeg: la imagen se vuelve un mp4 H.264 de la duracion pedida, del mismo tamano, con 30 cuadros por segundo y audio', { skip: !hayFfmpeg && 'no hay ffmpeg en este equipo' }, () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gancho-ffmpeg-'));
  try {
    const ancho = 64, alto = 96, datos = new Uint8Array(ancho * alto * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 7) % 255));
    const imagen = join(tmp, 'img.png'), salida = join(tmp, 'sub', 'v.mp4');
    writeFileSync(imagen, codificarPNG({ ancho, alto, datos }));
    convertirImagenEnVideo({ imagen, salida, duracionS: 2 });
    assert.ok(existsSync(salida));
    const sondeo = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_name,codec_type,width,height,nb_read_frames,r_frame_rate:format=duration', '-of', 'json', salida], { encoding: 'utf8' }).stdout);
    const video = sondeo.streams.find((s) => s.codec_type === 'video'), audio = sondeo.streams.find((s) => s.codec_type === 'audio');
    assert.deepEqual([video.codec_name, video.width, video.height, video.r_frame_rate], ['h264', ancho, alto, '30/1']);
    assert.equal(Number(video.nb_read_frames), 60, '2 s a 30 cuadros por segundo');
    assert.equal(audio?.codec_name, 'aac', 'con pista de audio');
    assert.ok(Math.abs(Number(sondeo.format.duration) - 2) < 0.2, `dura ${sondeo.format.duration} s`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
