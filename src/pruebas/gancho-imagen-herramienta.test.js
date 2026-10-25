// herramientas/gancho-imagen.mjs: el servidor de web/, el nombre de cada imagen, la generacion de las de un paquete y, si hay Chrome o Edge en el equipo, el renderizado real
// (PNG del tamano exacto de cada formato y la autocomprobacion de zona segura de la pagina). Sin red ni API.
//
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { servirWeb, nombreDeImagen, generarImagenesDeGancho, renderizarGanchoImagen, medidasDePng } from '../../herramientas/gancho-imagen.mjs';
import { buscarChrome } from '../../herramientas/capturar-escena.mjs';
import { direccionDeGanchoImagen } from '../../web/casino/gancho-imagen.js';

const ejecutar = promisify(execFile);
const pedir = (puerto, ruta) => new Promise((ok, no) => http.get({ host: '127.0.0.1', port: puerto, path: ruta }, (r) => { const trozos = []; r.on('data', (t) => trozos.push(t)); r.on('end', () => ok({ estado: r.statusCode, tipo: r.headers['content-type'], cuerpo: Buffer.concat(trozos).toString('utf8') })); }).on('error', no));
const conServidor = async (fn) => { const s = await servirWeb(); try { return await fn(s); } finally { await s.cerrar(); } };

test('el nombre de cada imagen es el de los videos (jN, hkM, formato y redes) con extension png', () => {
  assert.equal(nombreDeImagen({ juegoNumero: 1, parte: 1, formato: '9x16' }), 'j1_hk1_9x16_fb-ig-tk-yt.png');
  assert.equal(nombreDeImagen({ juegoNumero: 12, parte: 2, formato: '16x9' }), 'j12_hk2_16x9_fb-x-yt.png');
});

test('el servidor sirve solo web/: la pagina, sus modulos y sus fuentes con su tipo, 404 si no existe y nada fuera de web/', () => conServidor(async ({ puerto }) => {
  const pagina = await pedir(puerto, '/gancho-imagen.html');
  assert.equal(pagina.estado, 200); assert.match(pagina.tipo, /text\/html/); assert.match(pagina.cuerpo, /Próximamente/);
  assert.match((await pedir(puerto, '/casino/gancho-imagen.js')).tipo, /text\/javascript/);
  assert.match((await pedir(puerto, '/sitio.css')).tipo, /text\/css/);
  assert.equal((await pedir(puerto, '/no-existe.png')).estado, 404);
  assert.equal((await pedir(puerto, '/favicon.ico')).estado, 404);
  for (const ruta of ['/../package.json', '/..%2fpackage.json', '/%2e%2e/%2e%2e/AGENTS.md']) assert.ok([403, 404].includes((await pedir(puerto, ruta)).estado), `${ruta} no debe servirse`);
  assert.equal((await pedir(puerto, '/../package.json')).cuerpo.includes('enfrentando-a-las-ias'), false);
}));

test('generarImagenesDeGancho hace una imagen por formato para cada pieza gancho-imagen (con un solo servidor) y deja las demas piezas en paz', async () => {
  const llamadas = [];
  const render = async (o) => { llamadas.push(o); return { destino: o.destino, formato: o.formato, ancho: 1, alto: 1 }; };
  const piezas = [{ tipo: 'gancho-imagen', parte: 1 }, { tipo: 'parte', parte: 1 }, { tipo: 'gancho-imagen', parte: 2 }, { tipo: 'gancho', parte: 1 }];
  const r = await generarImagenesDeGancho({ piezas, juegoId: 'lobo', juegoNumero: 4, de: 2, carpeta: '/x/por-subir/j4', chrome: '/falso/chrome', render });
  assert.equal(r.error, null);
  assert.deepEqual(llamadas.map((l) => [l.parte, l.formato, l.destino.replaceAll('\\', '/')]), [
    [1, '9x16', '/x/por-subir/j4/j4_hk1_9x16_fb-ig-tk-yt.png'], [1, '16x9', '/x/por-subir/j4/j4_hk1_16x9_fb-x-yt.png'],
    [2, '9x16', '/x/por-subir/j4/j4_hk2_9x16_fb-ig-tk-yt.png'], [2, '16x9', '/x/por-subir/j4/j4_hk2_16x9_fb-x-yt.png'],
  ]);
  assert.ok(llamadas.every((l) => l.juegoId === 'lobo' && l.juegoNumero === 4 && l.de === 2 && l.servidor && l.servidor === llamadas[0].servidor));
  assert.equal(r.hechas.length, 4);
  assert.deepEqual(await generarImagenesDeGancho({ piezas: [{ tipo: 'parte', parte: 1 }], juegoId: 'lobo', juegoNumero: 1, carpeta: 'x', render }), { hechas: [], error: null }, 'sin piezas de imagen no hace nada');
  assert.equal(llamadas.length, 4);
});

test('sin navegador avisa (con el comando) y no revienta; si una captura falla devuelve lo que ya hizo y el motivo', async () => {
  const piezas = [{ tipo: 'gancho-imagen', parte: 1 }];
  const sinNavegador = await generarImagenesDeGancho({ piezas, juegoId: 'lobo', juegoNumero: 1, carpeta: 'x', chrome: null, render: async () => assert.fail('no debe capturar') });
  assert.deepEqual(sinNavegador.hechas, []);
  assert.match(sinNavegador.error, /No encontré Chrome ni Edge.*herramientas\/gancho-imagen\.mjs/);
  let n = 0;
  const falla = await generarImagenesDeGancho({ piezas, juegoId: 'lobo', juegoNumero: 1, carpeta: 'x', chrome: '/falso', render: async (o) => { if (n++) throw new Error('se cayó'); return { destino: o.destino, formato: o.formato }; } });
  assert.equal(falla.hechas.length, 1);
  assert.match(falla.error, /No pude generar las imágenes de gancho: se cayó/);
});

test('renderizarGanchoImagen valida antes de abrir nada: formato, numeros y partes', async () => {
  await assert.rejects(renderizarGanchoImagen({ juegoId: 'lobo', formato: '4x5', destino: 'x.png', chrome: '/falso' }), /Formato desconocido/);
  await assert.rejects(renderizarGanchoImagen({ juegoId: 'lobo', parte: 3, de: 2, destino: 'x.png', chrome: '/falso' }), /no existe/);
  await assert.rejects(renderizarGanchoImagen({ juegoId: 'lobo', destino: 'x.png', chrome: null }), /No encontré Chrome ni Edge/);
});

const CHROME = buscarChrome();
test('con navegador: cada imagen sale del tamano exacto de su formato y la pagina dice que lista y con NADA fuera de la zona segura (con y sin arte)', { skip: !CHROME && 'no hay Chrome ni Edge en este equipo', timeout: 120000 }, async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'gancho-img-'));
  try {
    await conServidor(async (servidor) => {
      for (const juegoId of ['lobo', 'conquista']) for (const [formato, ancho, alto] of [['9x16', 1080, 1920], ['16x9', 1920, 1080]]) {
        const destino = join(tmp, `${juegoId}-${formato}.png`);
        const r = await renderizarGanchoImagen({ juegoId, juegoNumero: 2, parte: 1, de: 2, formato, destino, chrome: CHROME, servidor });
        assert.deepEqual([r.ancho, r.alto], [ancho, alto]);
        assert.ok(existsSync(destino));
        assert.deepEqual(medidasDePng(destino), { ancho, alto });
        // la autocomprobacion de la pagina: lista y 0 elementos fuera de la zona
        // Con toda la suite corriendo en paralelo el navegador a veces vuelca el DOM antes de terminar de dibujar (en solitario sale a la primera): se reintenta hasta 3 veces.
        let dom = '';
        for (let intento = 0; intento < 3 && !/data-lista="1"/.test(dom); intento++) {
          dom = (await ejecutar(CHROME, ['--headless=new', '--disable-gpu', `--window-size=${ancho},${alto}`, '--virtual-time-budget=8000', '--dump-dom',
            `http://127.0.0.1:${servidor.puerto}/${direccionDeGanchoImagen({ juegoId, juegoNumero: 2, parte: 1, de: 2, formato })}`], { maxBuffer: 32 * 1024 * 1024 })).stdout;
        }
        assert.match(dom, /data-lista="1"/, `${juegoId} ${formato}: la pagina no termino de dibujarse`);
        assert.match(dom, /data-fuera="0"/, `${juegoId} ${formato}: hay elementos fuera de la zona segura o con texto desbordado`);
        assert.match(dom, /Juego 2 · Parte 1 de 2/);
      }
    });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
