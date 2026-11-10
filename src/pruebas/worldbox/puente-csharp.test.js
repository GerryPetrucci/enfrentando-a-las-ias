// Prueba de extremo a extremo del puente C# (worldbox-puente/): compila con construir.ps1, arranca
// Anfitrion.exe (el MISMO servidor que ira dentro de WorldBox, con un mundo simulado) y lo ejerce por HTTP.
// No abre WorldBox ni toca su carpeta. Sin csc.exe (.NET Framework 4.x) la prueba se omite limpiamente.
//
//   node --test src/pruebas/worldbox/puente-csharp.test.js
//
// Protocolo: privado/worldbox/protocolo-puente-v1.md. Cliente de W3: src/worldbox/adaptador-http.js.

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('../../..', import.meta.url));
const CONSTRUIR = join(RAIZ, 'worldbox-puente', 'construir.ps1');

function buscarCsc() {
  if (process.platform !== 'win32') return null;
  const candidatos = [process.env.CSC_EXE];
  if (process.env.WINDIR) {
    candidatos.push(join(process.env.WINDIR, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'));
    candidatos.push(join(process.env.WINDIR, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'));
  }
  return candidatos.find(c => c && existsSync(c)) ?? null;
}
const CSC = buscarCsc();
const OMITIR = CSC ? false : 'no hay csc.exe (.NET Framework 4.x): prueba del puente C# omitida';

const esperar = ms => new Promise(r => setTimeout(r, ms));
const HEX64 = /^[0-9a-f]{64}$/;

let carpetaSalida, EXE;
const procesos = new Set();

// --- Ayudas -------------------------------------------------------------------------------------

/** Arranca Anfitrion.exe y espera su linea LISTO. Siempre llamar a cerrar() (finally / after). */
async function lanzar(args = [], { vigilar = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'puente-t-'));
  const argv = [`--carpeta=${dir}`, '--verboso', ...(vigilar ? ['--vigilar-stdin'] : []), ...args];
  const proc = spawn(EXE, argv, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  procesos.add(proc);
  const a = { proc, dir, log: '', stdout: '' };
  proc.stderr.on('data', d => { a.log += d; });
  const salida = new Promise(r => proc.once('exit', code => r(code)));
  const m = await new Promise((resolve, reject) => {
    const plazo = setTimeout(() => reject(new Error(`Anfitrion no dijo LISTO. stdout=${a.stdout} log=${a.log}`)), 15000);
    proc.stdout.on('data', d => {
      a.stdout += d;
      const x = /^LISTO puerto=(\d+) token_archivo=(.+?)\r?$/m.exec(a.stdout);
      if (x) { clearTimeout(plazo); resolve(x); }
    });
    proc.once('error', reject);
    proc.once('exit', code => { clearTimeout(plazo); reject(new Error(`Anfitrion salio con ${code}. stderr=${a.log}`)); });
  }).catch(async e => { proc.kill(); rmSync(dir, { recursive: true, force: true }); throw e; });
  a.puerto = Number(m[1]);
  a.tokenArchivo = m[2];
  a.token = readFileSync(a.tokenArchivo, 'utf8');
  a.base = `http://127.0.0.1:${a.puerto}`;
  a.cerrar = async () => {
    try { proc.stdin.end(); } catch { /* ya cerrado */ }
    const code = await Promise.race([salida, esperar(4000).then(() => 'colgado')]);
    if (code === 'colgado') proc.kill();
    procesos.delete(proc);
    rmSync(dir, { recursive: true, force: true });
    return code;
  };
  return a;
}

/** fetch contra el anfitrion; devuelve { estado, json, texto, cab }. */
async function pedir(a, metodo, ruta, { cuerpo, token = a.token, cab = {} } = {}) {
  const headers = { ...(token === null ? {} : { 'X-Puente-Token': token }), ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }), ...cab };
  const res = await fetch(a.base + ruta, {
    method: metodo, headers,
    body: cuerpo === undefined ? undefined : (typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo)),
    signal: AbortSignal.timeout(20000),
  });
  const texto = await res.text();
  let json; try { json = JSON.parse(texto); } catch { /* no es JSON */ }
  return { estado: res.status, json, texto, cab: res.headers };
}
let contadorId = 0;
const POST = (a, ruta, datos = {}, extra = {}) => pedir(a, 'POST', ruta, { cuerpo: { protocolo: 1, id_solicitud: `t${++contadorId}-${Date.now()}`, ...datos }, ...extra });
const GET = (a, ruta, extra = {}) => pedir(a, 'GET', ruta, extra);

const FACCIONES = [{ id: 'a', especie: 'humano' }, { id: 'b', especie: 'orco' }];
async function reiniciar(a, semilla = 1, extra = {}) {
  const r = await POST(a, '/v1/escenario/reiniciar', { semilla, tamano_mapa: 64, facciones: FACCIONES, opciones: {}, ...extra });
  assert.equal(r.estado, 200, r.texto);
  return r.json;
}
const observar = async (a, f = 'a') => { const r = await GET(a, `/v1/observacion?faccion=${f}`); assert.equal(r.estado, 200, r.texto); return r.json; };
const error = (r, estado, codigo) => {
  assert.equal(r.estado, estado, r.texto);
  assert.equal(r.json?.ok, false, r.texto);
  assert.equal(r.json.protocolo, 1);
  assert.equal(r.json.error.codigo, codigo, r.texto);
  assert.equal(typeof r.json.error.mensaje, 'string');
};

/** Socket crudo para HTTP mal formado. Devuelve { texto, estado, cuerpo, motivo }. */
function crudo(puerto, datos, { esperarMs = 4000 } = {}) {
  return new Promise(resolve => {
    const s = net.connect({ host: '127.0.0.1', port: puerto });
    const trozos = [];
    let listo = false;
    const fin = motivo => {
      if (listo) return;
      listo = true; clearTimeout(t); s.destroy();
      const texto = Buffer.concat(trozos).toString('latin1');
      const m = /^HTTP\/1\.1 (\d{3})/.exec(texto);
      resolve({ texto, estado: m ? Number(m[1]) : null, cuerpo: texto.split('\r\n\r\n').slice(1).join('\r\n\r\n'), motivo });
    };
    const t = setTimeout(() => fin('plazo'), esperarMs);
    s.on('data', d => trozos.push(d));
    s.on('end', () => fin('fin'));
    s.on('close', () => fin('cierre'));
    s.on('error', () => fin('error'));
    for (const d of [].concat(datos)) s.write(d);
  });
}
const peticion = (a, linea, { token = a.token, host = `127.0.0.1:${a.puerto}`, extra = [], cuerpo = '', cl = true } = {}) =>
  [linea, ...(host === null ? [] : [`Host: ${host}`]), ...(token === null ? [] : [`X-Puente-Token: ${token}`]),
    ...(cl && cuerpo !== null ? [`Content-Length: ${Buffer.byteLength(cuerpo)}`] : []), ...extra].join('\r\n') + '\r\n\r\n' + (cuerpo ?? '');

// --- Suite --------------------------------------------------------------------------------------

describe('puente C# (worldbox-puente)', { skip: OMITIR, timeout: 240000 }, () => {
  let A; // anfitrion principal, compartido

  before(async () => {
    carpetaSalida = mkdtempSync(join(tmpdir(), 'puente-salida-'));
    const r = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', CONSTRUIR, '-Salida', carpetaSalida],
      { encoding: 'utf8', windowsHide: true, timeout: 180000 });
    assert.equal(r.status, 0, `construir.ps1 fallo:\n${r.stdout}\n${r.stderr}`);
    EXE = join(carpetaSalida, 'Anfitrion.exe');
    assert.ok(existsSync(join(carpetaSalida, 'PuenteWorldBox.dll')), 'falta PuenteWorldBox.dll');
    assert.ok(existsSync(EXE), 'falta Anfitrion.exe');
    A = await lanzar();
  });

  after(async () => {
    if (A) await A.cerrar();
    for (const p of procesos) p.kill();
    if (carpetaSalida) rmSync(carpetaSalida, { recursive: true, force: true });
  });

  // ------------------------------------------------------------------------------------------
  it('autoprueba en C#: JSON hostil, cola del hilo principal, analizador HTTP y servidor con mundos defectuosos', () => {
    const r = spawnSync(EXE, ['--autoprueba'], { encoding: 'utf8', windowsHide: true, timeout: 120000 });
    const lineas = r.stdout.split(/\r?\n/);
    const malas = lineas.filter(l => l.startsWith('FALLO'));
    assert.deepEqual(malas, [], `autoprueba con fallos:\n${r.stdout}`);
    const resumen = /^AUTOPRUEBA total=(\d+) fallos=0$/m.exec(r.stdout);
    assert.ok(resumen, r.stdout);
    assert.ok(Number(resumen[1]) >= 100, `pocas pruebas C#: ${resumen[1]}`); // 92 antes de X2, 100 con las ocho de X2
    assert.equal(r.status, 0);
  });

  it('arranque: linea LISTO, puerto efimero y token de 32 bytes en un archivo', () => {
    assert.match(A.stdout, /^LISTO puerto=\d+ token_archivo=.+/);
    assert.ok(A.puerto > 0 && A.puerto < 65536);
    assert.equal(realpathSync.native(A.tokenArchivo), realpathSync.native(join(A.dir, 'puente-token.txt')));
    assert.match(A.token, HEX64);
    const otro = A.token;
    assert.equal(readFileSync(A.tokenArchivo, 'utf8'), otro);
  });

  it('el token cambia en cada arranque y vive en el archivo de la carpeta indicada', async () => {
    const B = await lanzar();
    try {
      assert.match(B.token, HEX64);
      assert.notEqual(B.token, A.token);
      assert.notEqual(B.puerto, A.puerto);
    } finally { await B.cerrar(); }
  });

  // ------------------------------------------------------------------------------------------
  describe('autenticacion', () => {
    it('sin token: 401 no_autorizado en las siete rutas y tambien en una ruta que no existe', async () => {
      for (const [m, r] of [['GET', '/v1/info'], ['POST', '/v1/escenario/reiniciar'], ['GET', '/v1/observacion?faccion=a'], ['POST', '/v1/accion'],
        ['POST', '/v1/avanzar'], ['GET', '/v1/estado-terminal'], ['POST', '/v1/cerrar'], ['GET', '/v1/no-existe']]) {
        const x = await pedir(A, m, r, { token: null, cuerpo: m === 'POST' ? { protocolo: 1 } : undefined });
        error(x, 401, 'no_autorizado');
      }
    });

    it('token malo: 401 (distinto, mas corto, mas largo, vacio, mayusculas, con relleno)', async () => {
      const t = A.token;
      const malos = [t.replace(/.$/, c => (c === '0' ? '1' : '0')), t.slice(0, -1), t + '0', '', t.toUpperCase(), ` ${t}x`, 'x'.repeat(300), '0'.repeat(64)];
      for (const mal of malos) {
        const r = await GET(A, '/v1/info', { token: mal === '' ? '' : mal });
        error(r, 401, 'no_autorizado');
        assert.ok(!r.texto.includes(t), 'la respuesta no debe repetir el token');
      }
    });

    it('token duplicado o con el nombre de cabecera repetido: se rechaza', async () => {
      const r = await crudo(A.puerto, peticion(A, 'GET /v1/info HTTP/1.1', { cuerpo: null, extra: [`X-Puente-Token: ${A.token}`] }));
      assert.equal(r.estado, 400);
    });

    it('403 si llega Origin (una pagina web) o un Host que no es 127.0.0.1/localhost con el puerto del servidor', async () => {
      for (const extra of [['Origin: http://evil.example'], ['Origin: null'], ['origin: http://127.0.0.1']]) {
        const r = await crudo(A.puerto, peticion(A, 'GET /v1/info HTTP/1.1', { cuerpo: null, extra }));
        assert.equal(r.estado, 403, r.texto);
        assert.match(r.cuerpo, /"codigo":"no_autorizado"/);
      }
      for (const host of ['evil.example', `evil.example:${A.puerto}`, '127.0.0.1', `127.0.0.1:${A.puerto + 1}`, `[::1]:${A.puerto}`, `127.0.0.1.evil.example:${A.puerto}`, null]) {
        const r = await crudo(A.puerto, peticion(A, 'GET /v1/info HTTP/1.1', { cuerpo: null, host }));
        assert.equal(r.estado, 403, `host=${host}: ${r.texto}`);
      }
      // localhost con el puerto correcto SI es valido (el cliente puede configurar WORLDBOX_PUENTE_URL con ese nombre).
      const ok = await crudo(A.puerto, peticion(A, 'GET /v1/info HTTP/1.1', { cuerpo: null, host: `localhost:${A.puerto}` }));
      assert.equal(ok.estado, 200, ok.texto);
    });

    it('un token valido con Origin sigue siendo 403 (Origin se comprueba antes que el token)', async () => {
      const r = await crudo(A.puerto, peticion(A, 'GET /v1/info HTTP/1.1', { cuerpo: null, extra: ['Origin: http://evil.example'] }));
      assert.equal(r.estado, 403);
    });
  });

  // ------------------------------------------------------------------------------------------
  describe('rutas y metodos', () => {
    it('ruta desconocida: 404 solicitud_invalida (con token)', async () => {
      for (const ruta of ['/v1/nada', '/', '/v2/info', '/v1/info/', '/V1/info', '/v1/INFO', '/v1/info%2e', '/v1//info', '/v1/escenario']) {
        const r = await GET(A, ruta);
        error(r, 404, 'solicitud_invalida');
      }
      // fetch normaliza los tramos relativos antes de enviar: estos se mandan en crudo
      for (const ruta of ['/v1/../v1/info', '/v1/./info', '/v1/info/.', '/v1/info?x=1/../']) {
        const r = await crudo(A.puerto, peticion(A, `GET ${ruta} HTTP/1.1`, { cuerpo: null }));
        assert.ok(r.estado === 404 || r.estado === 400, `tramo relativo ${ruta}: ${r.texto}`);
      }
    });

    it('metodo no permitido: 405 con Allow', async () => {
      for (const [m, ruta, allow] of [['POST', '/v1/info', 'GET'], ['GET', '/v1/accion', 'POST'], ['GET', '/v1/avanzar', 'POST'], ['DELETE', '/v1/info', 'GET'],
        ['PUT', '/v1/accion', 'POST'], ['GET', '/v1/escenario/reiniciar', 'POST'], ['POST', '/v1/observacion', 'GET'], ['POST', '/v1/estado-terminal', 'GET'],
        ['OPTIONS', '/v1/info', 'GET'], ['HEAD', '/v1/info', 'GET'], ['GET', '/v1/cerrar', 'POST']]) {
        const r = await crudo(A.puerto, peticion(A, `${m} ${ruta} HTTP/1.1`, { cuerpo: null }));
        assert.equal(r.estado, 405, `${m} ${ruta}: ${r.texto}`);
        assert.match(r.texto, new RegExp(`^Allow: ${allow}\\r?$`, 'm'));
      }
    });

    it('la respuesta no autoriza a paginas web (sin CORS) y no se cachea', async () => {
      const r = await GET(A, '/v1/info');
      assert.equal(r.cab.get('access-control-allow-origin'), null);
      assert.equal(r.cab.get('cache-control'), 'no-store');
      assert.equal(r.cab.get('x-content-type-options'), 'nosniff');
      assert.match(r.cab.get('content-type'), /^application\/json; charset=utf-8$/);
      assert.equal(r.cab.get('connection'), 'close');
    });
  });

  // ------------------------------------------------------------------------------------------
  describe('protocolo y cuerpo', () => {
    it('protocolo incompatible: 400 protocolo_incompatible; ausente o mal tipado: solicitud_invalida', async () => {
      error(await pedir(A, 'POST', '/v1/accion', { cuerpo: { protocolo: 2, id_solicitud: 'p2', faccion: 'a', accion: 'esperar', parametros: {} } }), 400, 'protocolo_incompatible');
      error(await pedir(A, 'POST', '/v1/avanzar', { cuerpo: { protocolo: 0, id_solicitud: 'p0', segundos_juego: 1 } }), 400, 'protocolo_incompatible');
      error(await pedir(A, 'POST', '/v1/accion', { cuerpo: { id_solicitud: 'p3', faccion: 'a', accion: 'esperar' } }), 400, 'solicitud_invalida');
      error(await pedir(A, 'POST', '/v1/accion', { cuerpo: { protocolo: '1', id_solicitud: 'p4', faccion: 'a', accion: 'esperar' } }), 400, 'solicitud_invalida');
      error(await pedir(A, 'POST', '/v1/accion', { cuerpo: { protocolo: 1.5, id_solicitud: 'p5', faccion: 'a', accion: 'esperar' } }), 400, 'solicitud_invalida');
      error(await GET(A, '/v1/info?protocolo=2'), 400, 'protocolo_incompatible');
      assert.equal((await GET(A, '/v1/info?protocolo=1')).estado, 200);
    });

    it('JSON invalido: roto, no-objeto, claves repetidas, demasiado profundo, UTF-8 invalido, vacio', async () => {
      for (const cuerpo of ['{"protocolo":1,', '{', 'esto no es json', '[1,2,3]', '"texto"', '42', 'null', '{"protocolo":1,"protocolo":1}',
        '{"protocolo":1,"id_solicitud":"x",}', "{'protocolo':1}", '{"protocolo":01}', `{"protocolo":1,"x":${'['.repeat(40)}${']'.repeat(40)}}`,
        '{"protocolo":1,"id_solicitud":"x","faccion":"a","accion":"esperar"} {}', '']) {
        const r = await pedir(A, 'POST', '/v1/accion', { cuerpo });
        error(r, 400, 'solicitud_invalida');
      }
      const mal = await crudo(A.puerto, [peticion(A, 'POST /v1/accion HTTP/1.1', { cuerpo: '', extra: ['Content-Type: application/json'] }).replace('Content-Length: 0', 'Content-Length: 3'), Buffer.from([0xff, 0xfe, 0xfd])]);
      assert.equal(mal.estado, 400, mal.texto);
      assert.match(mal.cuerpo, /UTF-8/);
    });

    it('demasiado grande: 413 sin leer todo el cuerpo (tope de 64 KB)', async () => {
      const grande = JSON.stringify({ protocolo: 1, id_solicitud: 'g', faccion: 'a', accion: 'esperar', relleno: 'a'.repeat(70000) });
      error(await pedir(A, 'POST', '/v1/accion', { cuerpo: grande }), 413, 'solicitud_invalida');
      // justo en el limite si pasa la cabecera (65536 bytes): no es 413
      const limite = JSON.stringify({ protocolo: 1, id_solicitud: 'l', faccion: 'a', accion: 'esperar', parametros: {}, relleno: 'a'.repeat(65536 - 110) });
      assert.ok(Buffer.byteLength(limite) <= 65536);
      const r = await pedir(A, 'POST', '/v1/accion', { cuerpo: limite });
      assert.notEqual(r.estado, 413);
      // un Content-Length enorme se rechaza sin esperar los bytes
      const enorme = await crudo(A.puerto, peticion(A, 'POST /v1/accion HTTP/1.1', { cuerpo: null, cl: false, extra: ['Content-Length: 4000000000'] }));
      assert.equal(enorme.estado, 413, enorme.texto);
    });

    it('Content-Length faltante: 411; Transfer-Encoding o Content-Length mal formado: 400', async () => {
      const sin = await crudo(A.puerto, peticion(A, 'POST /v1/accion HTTP/1.1', { cuerpo: '{"protocolo":1}', cl: false }));
      assert.equal(sin.estado, 411, sin.texto);
      assert.match(sin.cuerpo, /"codigo":"solicitud_invalida"/);
      const chunked = await crudo(A.puerto, peticion(A, 'POST /v1/accion HTTP/1.1', { cuerpo: '0\r\n\r\n', cl: false, extra: ['Transfer-Encoding: chunked'] }));
      assert.equal(chunked.estado, 400, chunked.texto);
      for (const cl of ['-1', '12abc', '1.5', ' ', '99999999999999999999']) {
        const r = await crudo(A.puerto, peticion(A, 'POST /v1/accion HTTP/1.1', { cuerpo: null, cl: false, extra: [`Content-Length: ${cl}`] }));
        assert.equal(r.estado, 400, `cl=${cl}: ${r.texto}`);
      }
      const doble = await crudo(A.puerto, peticion(A, 'POST /v1/accion HTTP/1.1', { cuerpo: '{}', cl: false, extra: ['Content-Length: 2', 'Content-Length: 2'] }));
      assert.equal(doble.estado, 400);
      const get = await crudo(A.puerto, peticion(A, 'GET /v1/info HTTP/1.1', { cuerpo: '{}' }));
      assert.equal(get.estado, 400, 'GET con cuerpo');
    });

    it('HTTP basura: no tumba el servidor y se sigue respondiendo', async () => {
      const casos = [
        'basura sin forma\r\n\r\n', 'GET\r\n\r\n', 'GET /v1/info HTTP/9.9\r\n\r\n', 'GET /v1/info HTTP/1.1\nHost: x\n\n',
        `GET /v1/info HTTP/1.1\r\n${'A'.repeat(20000)}\r\n\r\n`, `GET /${'a'.repeat(5000)} HTTP/1.1\r\n\r\n`,
        'GET /v1/info HTTP/1.1\r\n folded\r\n\r\n', Buffer.from([0, 1, 2, 3, 255, 254, 253, 13, 10, 13, 10]),
        `GET /v1/info HTTP/1.1\r\n${Array.from({ length: 100 }, (_, i) => `H${i}: v`).join('\r\n')}\r\n\r\n`,
        'GET http://127.0.0.1/v1/info HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n',
      ];
      for (const c of casos) {
        const r = await crudo(A.puerto, c, { esperarMs: 3000 });
        assert.ok(r.estado === null || (r.estado >= 400 && r.estado < 500), `esperaba 4xx o cierre, llego ${r.estado}: ${String(c).slice(0, 40)}`);
      }
      assert.equal((await GET(A, '/v1/info')).estado, 200);
    });
  });

  // ------------------------------------------------------------------------------------------
  describe('contrato del juego', () => {
    it('GET /v1/info: forma completa del protocolo v1', async () => {
      const r = await GET(A, '/v1/info');
      assert.equal(r.estado, 200, r.texto);
      const j = r.json;
      assert.equal(j.ok, true);
      assert.equal(j.protocolo, 1);
      assert.deepEqual(Object.keys(j.puente), ['nombre', 'version']);
      assert.equal(j.puente.nombre, 'anfitrion-simulado');
      assert.deepEqual(Object.keys(j.juego), ['nombre', 'version', 'build_steam', 'unity']);
      assert.equal(j.origen, 'simulado');
      assert.equal(j.estado, 'listo');
      assert.deepEqual(j.capacidades, { reiniciar: true, semilla: true, avanzar: true, terminal: true, multi_faccion: true, camara: false, interfaz: false, era: true, era_velocidad: true, era_mantener: true }); // V1: el simulado no controla camara ni interfaz; E2: si anuncia el formato era
      assert.deepEqual(j.limites, { max_segundos_avance: 600, max_acciones_por_turno: 10 });
      assert.deepEqual(j.acciones.map(a => a.nombre), ['esperar', 'crear_unidad', 'fundar_ciudad', 'dormir', 'atacar']);
      for (const a of j.acciones) {
        assert.equal(a.verificada, true);
        assert.equal(typeof a.descripcion, 'string');
        assert.match(a.nombre, /^[a-z_]{1,40}$/);
      }
      // X2: puntos y cooldown son OPCIONALES y solo informativos; solo aparecen donde la accion los declara.
      const costos = Object.fromEntries(j.acciones.map(a => [a.nombre, [a.puntos, a.cooldown]]));
      assert.deepEqual(costos, { esperar: [0, 0], crear_unidad: [2, 1], fundar_ciudad: [undefined, undefined], dormir: [1, 0], atacar: [3, 5] });
      assert.ok(!('puntos' in j.acciones.find(a => a.nombre === 'fundar_ciudad')), 'sin costo declarado no se anuncia ninguno');
      const cu = j.acciones.find(a => a.nombre === 'crear_unidad');
      // El ORDEN de las claves importa: el cliente compara JSON.stringify de los parametros.
      assert.equal(JSON.stringify(cu.parametros), '{"tipo":{"tipo":"cadena","minimo":0,"maximo":7,"valores":["aldeano","soldado"]},"cantidad":{"tipo":"entero","minimo":1,"maximo":5}}');
      assert.deepEqual(j.acciones.find(a => a.nombre === 'esperar').parametros, {});
      assert.ok(!r.texto.includes(A.token));
    });

    it('POST /v1/escenario/reiniciar: valido; mismo seed = mismo hash_mundo; otro seed = otro', async () => {
      const x = await reiniciar(A, 11);
      assert.equal(x.ok, true);
      assert.equal(x.protocolo, 1);
      assert.match(x.escenario_id, /^anfitrion-11-\d+$/);
      assert.match(x.hash_mundo, HEX64);
      assert.deepEqual(x.facciones.map(f => f.id), ['a', 'b']);
      for (const f of x.facciones) for (const k of ['poblacion', 'ciudades', 'territorio', 'recursos', 'objetivos']) assert.ok(Number.isInteger(f[k]), k);
      assert.equal(x.semilla_usada, 11);
      const y = await reiniciar(A, 11);
      assert.equal(y.hash_mundo, x.hash_mundo);
      assert.notEqual(y.escenario_id, x.escenario_id);
      const z = await reiniciar(A, 12);
      assert.notEqual(z.hash_mundo, x.hash_mundo);
    });

    it('reiniciar invalido: semilla, facciones, tamano, duracion', async () => {
      const base = { semilla: 1, facciones: FACCIONES };
      const casos = [
        { ...base, semilla: undefined }, { ...base, semilla: '1' }, { ...base, semilla: 1.5 }, { ...base, semilla: 2 ** 40 },
        // X2: rango unico 0..2147483647 (32 bits con signo, sin negativos); el cliente Node usa el mismo
        { ...base, semilla: -1 }, { ...base, semilla: -(2 ** 31) }, { ...base, semilla: 2 ** 31 }, { ...base, semilla: 2 ** 32 - 1 },
        { ...base, facciones: [] }, { ...base, facciones: [{ id: 'a' }] }, { ...base, facciones: [{ id: 'a' }, { id: 'a' }] },
        { ...base, facciones: [{ id: 'a' }, { id: 'b c' }] }, { ...base, facciones: [{ id: 'a' }, { id: '../x' }] }, { ...base, facciones: [{ id: 'a' }, 7] },
        { ...base, facciones: 'a,b' }, { ...base, facciones: Array.from({ length: 17 }, (_, i) => ({ id: `f${i}` })) },
        { ...base, facciones: ['a', 'b'].map(id => ({ id })).concat([{ id: 'c' }, { id: 'd' }, { id: 'e' }]) },
        { ...base, tamano_mapa: 5 }, { ...base, tamano_mapa: 'enorme' }, { ...base, tamano_mapa: [] },
        { ...base, opciones: { duracion_s: 1 } }, { ...base, opciones: { duracion_s: 'x' } }, { ...base, opciones: [] },
      ];
      for (const c of casos) {
        const r = await POST(A, '/v1/escenario/reiniciar', c);
        error(r, 400, 'solicitud_invalida');
      }
      error(await pedir(A, 'POST', '/v1/escenario/reiniciar', { cuerpo: { protocolo: 1, semilla: 1, facciones: FACCIONES } }), 400, 'solicitud_invalida'); // sin id_solicitud
      const rango = await POST(A, '/v1/escenario/reiniciar', { ...base, semilla: -1 });
      assert.match(rango.json.error.mensaje, /semilla.*0\.\.2147483647/, 'el mensaje dice el rango');
    });

    it('semilla: los extremos 0 y 2147483647 se aceptan y se devuelven tal cual', async () => {
      for (const semilla of [0, 2 ** 31 - 1]) {
        const x = await reiniciar(A, semilla);
        assert.equal(x.semilla_usada, semilla);
      }
    });

    it('GET /v1/observacion: campos, equidad entre facciones y validacion de la faccion', async () => {
      await reiniciar(A, 5);
      const a = await observar(A, 'a'), b = await observar(A, 'b');
      for (const o of [a, b]) {
        assert.equal(o.ok, true);
        assert.equal(o.protocolo, 1);
        assert.equal(o.tiempo_juego_s, 0);
        assert.equal(o.turno_juego, 0);
        assert.ok(Array.isArray(o.rivales) && o.rivales.length === 1);
        assert.ok(o.mundo && Number.isInteger(o.mundo.tamano_mapa) && Number.isInteger(o.mundo.libres));
      }
      assert.equal(a.faccion.id, 'a'); assert.equal(a.rivales[0].id, 'b');
      assert.equal(b.faccion.id, 'b'); assert.equal(b.rivales[0].id, 'a');
      // equidad: mismo metodo y mismos campos para todas las facciones
      assert.deepEqual(Object.keys(a), Object.keys(b));
      assert.deepEqual(Object.keys(a.faccion), Object.keys(b.faccion));
      assert.deepEqual(Object.keys(a.faccion), Object.keys(a.rivales[0]));

      error(await GET(A, '/v1/observacion?faccion=zzz'), 400, 'solicitud_invalida');
      error(await GET(A, '/v1/observacion'), 400, 'solicitud_invalida');
      error(await GET(A, '/v1/observacion?faccion='), 400, 'solicitud_invalida');
      error(await GET(A, '/v1/observacion?faccion=a&otra=1'), 400, 'solicitud_invalida');
      error(await GET(A, '/v1/observacion?faccion=a&faccion=b'), 400, 'solicitud_invalida');
      error(await GET(A, `/v1/observacion?faccion=${encodeURIComponent('../../x')}`), 400, 'solicitud_invalida');
      error(await GET(A, `/v1/observacion?faccion=${encodeURIComponent('a b')}`), 400, 'solicitud_invalida');
      error(await GET(A, '/v1/observacion?faccion=%ff'), 400, 'solicitud_invalida');
      error(await GET(A, '/v1/observacion?faccion=%'), 400, 'solicitud_invalida');
    });

    it('ninguna logica del juego corre en el hilo de red (ni con peticiones concurrentes)', async () => {
      await reiniciar(A, 5);
      const o = await observar(A);
      assert.equal(o.mundo.hilo_llamada, o.mundo.hilo_principal, 'el mundo se ejecuto en otro hilo que el principal');
      // Rafagas concurrentes: algunas reciben juego_ocupado, ninguna debe ejecutarse fuera del hilo principal.
      for (let ronda = 0; ronda < 5; ronda++) {
        const res = await Promise.all(Array.from({ length: 6 }, () => GET(A, '/v1/observacion?faccion=a').catch(e => ({ estado: 0, error: e }))));
        for (const r of res) {
          if (r.estado === 200) assert.equal(r.json.mundo.hilo_llamada, r.json.mundo.hilo_principal);
          else assert.ok([409, 0].includes(r.estado), `estado inesperado ${r.estado}: ${r.texto}`);
        }
        assert.ok(res.some(r => r.estado === 200), 'al menos una debe atenderse');
      }
      const fin = await observar(A);
      assert.equal(fin.mundo.llamadas_fuera_de_hilo, 0);
    });

    it('POST /v1/accion valida: efecto real en el mundo y forma de la respuesta', async () => {
      await reiniciar(A, 5);
      const antes = (await observar(A)).faccion;
      const r = await POST(A, '/v1/accion', { faccion: 'a', accion: 'crear_unidad', parametros: { tipo: 'soldado', cantidad: 2 } });
      assert.equal(r.estado, 200, r.texto);
      assert.deepEqual(Object.keys(r.json), ['ok', 'protocolo', 'resultado', 'codigo', 'mensaje', 'efecto']);
      assert.equal(r.json.resultado, 'ejecutada');
      assert.equal(r.json.codigo, 'ok');
      const despues = (await observar(A)).faccion;
      assert.equal(despues.poblacion, antes.poblacion + 2);
      assert.equal(despues.recursos, antes.recursos - 10);
      const rival = (await observar(A, 'b')).rivales[0];
      assert.equal(rival.poblacion, despues.poblacion, 'la otra faccion ve el mismo dato');

      const e = await POST(A, '/v1/accion', { faccion: 'b', accion: 'esperar', parametros: {} });
      assert.equal(e.json.resultado, 'sin_efecto');
      const sinParametros = await POST(A, '/v1/accion', { faccion: 'b', accion: 'esperar' });
      assert.equal(sinParametros.json.resultado, 'sin_efecto');
    });

    it('POST /v1/accion invalida: rechazada con codigo estable (lista blanca, tipos, rangos, recursos)', async () => {
      await reiniciar(A, 5);
      const rechazo = async (datos, codigo) => {
        const r = await POST(A, '/v1/accion', datos);
        assert.equal(r.estado, 200, r.texto);
        assert.equal(r.json.ok, true);
        assert.equal(r.json.resultado, 'rechazada', r.texto);
        assert.equal(r.json.codigo, codigo, r.texto);
        return r.json;
      };
      await rechazo({ faccion: 'a', accion: 'volar', parametros: {} }, 'accion_desconocida');
      await rechazo({ faccion: 'a', accion: 'Esperar', parametros: {} }, 'accion_desconocida');
      await rechazo({ faccion: 'a', accion: 'esperar; calc.exe', parametros: {} }, 'accion_desconocida');
      await rechazo({ faccion: 'a', accion: 'esperar', parametros: { extra: 1 } }, 'parametro_invalido');
      await rechazo({ faccion: 'a', accion: 'crear_unidad', parametros: { tipo: 'soldado' } }, 'parametro_invalido');
      await rechazo({ faccion: 'a', accion: 'crear_unidad', parametros: { tipo: 'dragon', cantidad: 1 } }, 'parametro_invalido');
      await rechazo({ faccion: 'a', accion: 'crear_unidad', parametros: { tipo: 'soldado', cantidad: 6 } }, 'parametro_invalido');
      await rechazo({ faccion: 'a', accion: 'crear_unidad', parametros: { tipo: 'soldado', cantidad: 0 } }, 'parametro_invalido');
      await rechazo({ faccion: 'a', accion: 'crear_unidad', parametros: { tipo: 'soldado', cantidad: 1.5 } }, 'parametro_invalido');
      await rechazo({ faccion: 'a', accion: 'crear_unidad', parametros: { tipo: 'soldado', cantidad: '2' } }, 'parametro_invalido');
      await rechazo({ faccion: 'a', accion: 'crear_unidad', parametros: { tipo: 'soldado', cantidad: null } }, 'parametro_invalido');
      await rechazo({ faccion: 'a', accion: 'crear_unidad', parametros: { tipo: 7, cantidad: 1 } }, 'parametro_invalido');
      await rechazo({ faccion: 'a', accion: 'crear_unidad', parametros: { tipo: 'soldado', cantidad: 1, ms: 5 } }, 'parametro_invalido');
      await rechazo({ faccion: 'a', accion: 'fundar_ciudad', parametros: { x: 64, y: 0 } }, 'parametro_invalido');
      await rechazo({ faccion: 'a', accion: 'fundar_ciudad', parametros: { x: -1, y: 0 } }, 'parametro_invalido');
      // regla del juego (no del registro): hasta agotar los recursos
      let ultimo;
      for (let i = 0; i < 20; i++) {
        ultimo = await POST(A, '/v1/accion', { faccion: 'a', accion: 'crear_unidad', parametros: { tipo: 'aldeano', cantidad: 5 } });
        if (ultimo.json.resultado === 'rechazada') break;
      }
      assert.equal(ultimo.json.resultado, 'rechazada');
      assert.equal(ultimo.json.codigo, 'recursos_insuficientes');
      // errores de forma o de faccion: 400
      error(await POST(A, '/v1/accion', { faccion: 'zzz', accion: 'esperar', parametros: {} }), 400, 'solicitud_invalida');
      error(await POST(A, '/v1/accion', { faccion: 'a', parametros: {} }), 400, 'solicitud_invalida');
      error(await POST(A, '/v1/accion', { faccion: 'a', accion: 5 }), 400, 'solicitud_invalida');
      error(await POST(A, '/v1/accion', { faccion: 'a', accion: 'esperar', parametros: 'x' }), 400, 'solicitud_invalida');
      error(await POST(A, '/v1/accion', { id_solicitud: '', faccion: 'a', accion: 'esperar' }), 400, 'solicitud_invalida');
    });

    it('X2: un objetivo inexistente, propio u hostil es rechazada/objetivo_invalido (HTTP 200) y no toca el mundo', async () => {
      await reiniciar(A, 5);
      const antes = await observar(A);
      const atacar = objetivo => POST(A, '/v1/accion', { faccion: 'a', accion: 'atacar', parametros: { objetivo } });
      for (const objetivo of ['fantasma', 'B', 'a b', '..\\x', 'x'.repeat(40), '<script>', 'a;b']) {
        const r = await atacar(objetivo);
        assert.equal(r.estado, 200, `${JSON.stringify(objetivo)}: ${r.texto}`);
        assert.equal(r.json.resultado, 'rechazada', r.texto);
        assert.equal(r.json.codigo, 'objetivo_invalido', r.texto);
        assert.ok(r.json.mensaje.length < 200, 'el mensaje no crece con el objetivo');
      }
      const propio = await atacar('a');
      assert.equal(propio.estado, 200);
      assert.equal(propio.json.codigo, 'objetivo_propio');
      // un objetivo de 41 caracteres o con caracteres de control lo rechaza el registro (parametro_invalido), tambien con 200
      for (const objetivo of ['x'.repeat(41), 'a\u0001']) {
        const raro = await atacar(objetivo);
        assert.equal(raro.estado, 200, raro.texto);
        assert.equal(raro.json.resultado, 'rechazada');
        assert.equal(raro.json.codigo, 'parametro_invalido');
      }
      assert.deepEqual(await observar(A), antes, 'ningun rechazo modifica el mundo');
      // un nombre de ACCION vacio, enorme o con controles es accion_desconocida (200), no una solicitud rota (400)
      for (const accion of ['', 'x'.repeat(81), 'x'.repeat(5000), 'esperar\u0001', 'esperar\n', 'esperar\u007f']) {
        const r = await POST(A, '/v1/accion', { faccion: 'a', accion, parametros: {} });
        assert.equal(r.estado, 200, `${JSON.stringify(accion.slice(0, 12))}: ${r.texto.slice(0, 200)}`);
        assert.equal(r.json.resultado, 'rechazada');
        assert.equal(r.json.codigo, 'accion_desconocida');
      }
      assert.deepEqual(await observar(A), antes);
      // lo que SIGUE siendo 400 es la estructura rota: accion que no es texto o ausente, parametros que no es objeto
      error(await POST(A, '/v1/accion', { faccion: 'a', accion: 5, parametros: {} }), 400, 'solicitud_invalida');
      error(await POST(A, '/v1/accion', { faccion: 'a', parametros: {} }), 400, 'solicitud_invalida');
      error(await POST(A, '/v1/accion', { faccion: 'a', accion: 'atacar', parametros: [] }), 400, 'solicitud_invalida');
      // y un objetivo valido si ejecuta
      const ok = await atacar('b');
      assert.equal(ok.json.resultado, 'ejecutada', ok.texto);
      assert.equal((await observar(A, 'b')).faccion.poblacion, antes.rivales[0].poblacion - 2);
    });

    it('X2: crear_unidad es todo o nada: sin espacio o sobre el tope se rechaza sin cambiar el mundo ni el cupo', async () => {
      await reiniciar(A, 5, { opciones: { casillas: 3, tope_unidades: 100 } });
      const crear = cantidad => POST(A, '/v1/accion', { faccion: 'a', accion: 'crear_unidad', parametros: { tipo: 'aldeano', cantidad } });
      const f0 = (await observar(A)).faccion, m0 = (await observar(A)).mundo;
      assert.equal(m0.casillas, 3);
      let r = await crear(5);
      assert.equal(r.estado, 200, r.texto);
      assert.equal(r.json.resultado, 'rechazada');
      assert.equal(r.json.codigo, 'sin_espacio');
      assert.deepEqual((await observar(A)).faccion, f0, 'sin_espacio no crea nada ni cobra recursos');
      assert.equal((await observar(A)).mundo.casillas, 3, 'ni consume casillas');
      r = await crear(3);
      assert.equal(r.json.resultado, 'ejecutada', r.texto);
      const f1 = (await observar(A)).faccion;
      assert.equal(f1.poblacion, f0.poblacion + 3);
      assert.equal((await observar(A)).mundo.casillas, 0);
      r = await crear(1);
      assert.equal(r.json.codigo, 'sin_espacio');
      assert.deepEqual((await observar(A)).faccion, f1);

      // tope por faccion y partida (10 en el reglamento; aqui 4)
      await reiniciar(A, 5, { opciones: { casillas: 100, tope_unidades: 4 } });
      assert.equal((await crear(3)).json.resultado, 'ejecutada');
      const f2 = (await observar(A)).faccion;
      r = await crear(2);
      assert.equal(r.json.resultado, 'rechazada');
      assert.equal(r.json.codigo, 'tope_unidades');
      assert.deepEqual((await observar(A)).faccion, f2, 'sobre el tope no se crea parte');
      assert.equal((await crear(1)).json.resultado, 'ejecutada', 'llegar justo al tope es valido');
      assert.equal((await crear(1)).json.codigo, 'tope_unidades');

      for (const opciones of [{ casillas: -1 }, { casillas: 1.5 }, { casillas: 'x' }, { tope_unidades: 100001 }]) {
        error(await POST(A, '/v1/escenario/reiniciar', { semilla: 1, tamano_mapa: 64, facciones: FACCIONES, opciones }), 400, 'solicitud_invalida');
      }
    });

    it('X2: solicitudes identicas simultaneas se ejecutan UNA vez y todas reciben la misma respuesta', async () => {
      await reiniciar(A, 5);
      const dormir = { protocolo: 1, id_solicitud: 'conc-dormir', faccion: 'a', accion: 'dormir', parametros: { ms: 300 } };
      let res = await Promise.all(Array.from({ length: 6 }, () => pedir(A, 'POST', '/v1/accion', { cuerpo: dormir })));
      for (const r of res) { assert.equal(r.estado, 200, r.texto); assert.equal(r.texto, res[0].texto); }
      assert.equal(res.filter(r => r.cab.get('x-puente-idempotente') === 'repetida').length, 5, 'una ejecucion y cinco repeticiones');
      // con efecto observable: la poblacion sube una sola vez
      const antes = (await observar(A)).faccion;
      const crear = { protocolo: 1, id_solicitud: 'conc-crear', faccion: 'a', accion: 'crear_unidad', parametros: { tipo: 'soldado', cantidad: 2 } };
      res = await Promise.all(Array.from({ length: 6 }, () => pedir(A, 'POST', '/v1/accion', { cuerpo: crear })));
      for (const r of res) { assert.equal(r.estado, 200, r.texto); assert.equal(r.json.resultado, 'ejecutada'); }
      const despues = (await observar(A)).faccion;
      assert.equal(despues.poblacion, antes.poblacion + 2);
      assert.equal(despues.recursos, antes.recursos - 10);
    });

    it('idempotencia: el mismo id_solicitud devuelve la respuesta anterior sin repetir el efecto', async () => {
      await reiniciar(A, 5);
      const antes = (await observar(A)).faccion;
      const cuerpo = { protocolo: 1, id_solicitud: 'idem-1', faccion: 'a', accion: 'crear_unidad', parametros: { tipo: 'aldeano', cantidad: 3 } };
      const r1 = await pedir(A, 'POST', '/v1/accion', { cuerpo });
      const r2 = await pedir(A, 'POST', '/v1/accion', { cuerpo });
      const r3 = await pedir(A, 'POST', '/v1/accion', { cuerpo: JSON.stringify(cuerpo) });
      assert.equal(r1.estado, 200);
      assert.equal(r1.cab.get('x-puente-idempotente'), null);
      for (const r of [r2, r3]) {
        assert.equal(r.estado, 200);
        assert.equal(r.cab.get('x-puente-idempotente'), 'repetida');
        assert.equal(r.texto, r1.texto);
      }
      const despues = (await observar(A)).faccion;
      assert.equal(despues.poblacion, antes.poblacion + 3, 'el efecto se aplico una sola vez');
      assert.equal(despues.recursos, antes.recursos - 15);

      // mismo id con OTRO cuerpo: error del cliente, no se reutiliza ni se ejecuta
      error(await pedir(A, 'POST', '/v1/accion', { cuerpo: { ...cuerpo, parametros: { tipo: 'aldeano', cantidad: 1 } } }), 400, 'solicitud_invalida');
      assert.equal((await observar(A)).faccion.poblacion, despues.poblacion);
      // el id es por ruta: el mismo texto en otra ruta es otra solicitud
      const av = await pedir(A, 'POST', '/v1/avanzar', { cuerpo: { protocolo: 1, id_solicitud: 'idem-1', segundos_juego: 1 } });
      assert.equal(av.estado, 200);
      assert.equal(av.cab.get('x-puente-idempotente'), null);
      // una respuesta de error NO se guarda: reintentar con el mismo id vuelve a evaluar
      const mal = { protocolo: 1, id_solicitud: 'idem-err', faccion: 'zzz', accion: 'esperar', parametros: {} };
      error(await pedir(A, 'POST', '/v1/accion', { cuerpo: mal }), 400, 'solicitud_invalida');
      error(await pedir(A, 'POST', '/v1/accion', { cuerpo: mal }), 400, 'solicitud_invalida');
    });

    it('POST /v1/avanzar: avanza el tiempo y vuelve a pausar; valida segundos_juego', async () => {
      await reiniciar(A, 5);
      const r = await POST(A, '/v1/avanzar', { segundos_juego: 5 });
      assert.equal(r.estado, 200, r.texto);
      assert.deepEqual(Object.keys(r.json), ['ok', 'protocolo', 'tiempo_juego_s', 'terminal']);
      assert.equal(r.json.tiempo_juego_s, 5);
      assert.equal(r.json.terminal, false);
      const o = await observar(A);
      assert.equal(o.tiempo_juego_s, 5);
      assert.equal(o.turno_juego, 1);
      assert.ok(o.faccion.recursos > 20, 'la simulacion corrio');
      await esperar(80);
      assert.equal((await observar(A)).tiempo_juego_s, 5, 'entre turnos el tiempo queda pausado');
      const fraccion = await POST(A, '/v1/avanzar', { segundos_juego: 0.5 });
      assert.equal(fraccion.json.tiempo_juego_s, 5.5);
      for (const malo of [0, -1, 601, '5', null, true, 1e999, [1]]) {
        error(await POST(A, '/v1/avanzar', { segundos_juego: malo }), 400, 'solicitud_invalida');
      }
      error(await POST(A, '/v1/avanzar', {}), 400, 'solicitud_invalida');
      error(await pedir(A, 'POST', '/v1/avanzar', { cuerpo: { protocolo: 1, segundos_juego: 1 } }), 400, 'solicitud_invalida');
      assert.equal((await POST(A, '/v1/avanzar', { segundos_juego: 600 })).estado, 200);
    });

    it('estado terminal: se alcanza al agotar la duracion y bloquea nuevas acciones', async () => {
      await reiniciar(A, 5, { opciones: { duracion_s: 10 } });
      let t = await GET(A, '/v1/estado-terminal');
      assert.equal(t.estado, 200, t.texto);
      assert.equal(t.json.terminal, false);
      assert.equal(t.json.razon, 'ninguna');
      assert.equal(t.json.resumen_por_faccion.length, 2);
      const r = await POST(A, '/v1/avanzar', { segundos_juego: 25 });
      assert.equal(r.json.tiempo_juego_s, 10, 'no pasa de la duracion del escenario');
      assert.equal(r.json.terminal, true);
      t = await GET(A, '/v1/estado-terminal');
      assert.equal(t.json.terminal, true);
      assert.equal(t.json.razon, 'turnos');
      for (const f of t.json.resumen_por_faccion) {
        assert.equal(typeof f.id, 'string'); assert.equal(typeof f.vivo, 'boolean');
        for (const k of ['poblacion', 'ciudades', 'territorio']) assert.ok(Number.isInteger(f[k]));
      }
      const a = await POST(A, '/v1/accion', { faccion: 'a', accion: 'esperar', parametros: {} });
      assert.equal(a.json.resultado, 'rechazada');
      assert.equal(a.json.codigo, 'partida_terminada');
    });

    it('POST /v1/cerrar libera el escenario; es idempotente y admite cuerpo vacio', async () => {
      await reiniciar(A, 5);
      const c = await POST(A, '/v1/cerrar');
      assert.equal(c.estado, 200, c.texto);
      assert.deepEqual(c.json, { ok: true, protocolo: 1 });
      error(await GET(A, '/v1/observacion?faccion=a'), 503, 'no_listo');
      error(await GET(A, '/v1/estado-terminal'), 503, 'no_listo');
      error(await POST(A, '/v1/accion', { faccion: 'a', accion: 'esperar', parametros: {} }), 503, 'no_listo');
      error(await POST(A, '/v1/avanzar', { segundos_juego: 1 }), 503, 'no_listo');
      const vacio = await pedir(A, 'POST', '/v1/cerrar', { cuerpo: '' });
      assert.equal(vacio.estado, 200, vacio.texto);
      const sinCuerpo = await crudo(A.puerto, peticion(A, 'POST /v1/cerrar HTTP/1.1', { cuerpo: null, cl: false }));
      assert.equal(sinCuerpo.estado, 200, sinCuerpo.texto);
      error(await pedir(A, 'POST', '/v1/cerrar', { cuerpo: { protocolo: 2 } }), 400, 'protocolo_incompatible');
      // el servidor sigue sano y se puede reiniciar de nuevo
      await reiniciar(A, 6);
      assert.equal((await observar(A)).faccion.id, 'a');
    });
  });

  // ------------------------------------------------------------------------------------------
  describe('red', () => {
    it('solo escucha en 127.0.0.1: ninguna IP propia que no sea de bucle local acepta conexiones', async () => {
      const intentar = (host, puerto) => new Promise(resolve => {
        const s = net.connect({ host, port: puerto });
        const t = setTimeout(() => { s.destroy(); resolve('plazo'); }, 1500);
        s.on('connect', () => { clearTimeout(t); s.destroy(); resolve('conectado'); });
        s.on('error', e => { clearTimeout(t); resolve(e.code); });
      });
      // Control: por 127.0.0.1 si conecta (si no, la prueba de abajo no demostraria nada).
      assert.equal(await intentar('127.0.0.1', A.puerto), 'conectado');

      // Cada direccion propia fuera del bucle local (LAN, IPv6 global) debe rechazar la conexion al mismo puerto.
      const propias = Object.values(os.networkInterfaces()).flat()
        .filter(i => i && !i.internal && !i.address.startsWith('fe80')).map(i => i.address);
      const resultados = await Promise.all(propias.map(async ip => [ip, await intentar(ip, A.puerto)]));
      for (const [ip, r] of resultados) assert.notEqual(r, 'conectado', `no debe aceptar conexiones por ${ip}`);
      // IPv6 de bucle local tampoco: el servidor es solo IPv4 127.0.0.1.
      assert.notEqual(await intentar('::1', A.puerto), 'conectado');

      // netstat, si en este entorno muestra el socket (en entornos aislados no lo hace): debe ser solo 127.0.0.1.
      const ns = spawnSync('netstat', ['-ano'], { encoding: 'utf8', windowsHide: true });
      for (const l of ns.stdout.split(/\r?\n/)) {
        const m = new RegExp(`^\\s*TCP\\s+(\\S+:${A.puerto})\\s`).exec(l); // sockets cuyo puerto LOCAL es el del puente
        if (m) assert.equal(m[1], `127.0.0.1:${A.puerto}`, `netstat: ${l.trim()}`);
      }
    });
    it('conexiones colgadas vencen (408) y el tope de conexiones no deja sin servicio', async () => {
      const D = await lanzar(['--tiempo-lectura-ms=500', '--max-conexiones=4']);
      try {
        const parcial = await crudo(D.puerto, 'GET /v1/info HTTP/1.1\r\nHost: 127.0', { esperarMs: 4000 });
        assert.equal(parcial.estado, 408, parcial.texto);
        const silencio = await crudo(D.puerto, [], { esperarMs: 4000 });
        assert.equal(silencio.estado, 408, 'una conexion que no manda nada recibe 408');
        const corto = await crudo(D.puerto, peticion(D, 'POST /v1/accion HTTP/1.1', { cuerpo: '{"x":1}' }).replace('Content-Length: 7', 'Content-Length: 100'), { esperarMs: 4000 });
        assert.equal(corto.estado, 408, 'cuerpo mas corto que Content-Length');

        const mudos = await Promise.all(Array.from({ length: 4 }, () => new Promise(resolve => { const s = net.connect({ host: '127.0.0.1', port: D.puerto }, () => resolve(s)); s.on('error', () => {}); })));
        await esperar(100);
        const rechazado = await GET(D, '/v1/info').catch(e => ({ estado: 0, error: e }));
        assert.notEqual(rechazado.estado, 200, 'con los 4 cupos ocupados no se atiende una quinta');
        await esperar(900);
        for (const s of mudos) s.destroy();
        assert.equal((await GET(D, '/v1/info')).estado, 200, 'los cupos se liberan al vencer');
        for (let i = 0; i < 20; i++) assert.equal((await GET(D, '/v1/info')).estado, 200);
      } finally { await D.cerrar(); }
    });
  });

  // ------------------------------------------------------------------------------------------
  describe('ocupacion, plazos y arranque del juego', () => {
    it('juego_ocupado durante un avance largo; info dice "ejecutando"; luego todo vuelve a listo', async () => {
      const L = await lanzar(['--ms-por-segundo=10', '--tiempo-avance-ms=8000']);
      try {
        await reiniciar(L, 3);
        const avance = POST(L, '/v1/avanzar', { segundos_juego: 100 }); // ~1 s reales
        await esperar(250);
        error(await GET(L, '/v1/observacion?faccion=a'), 409, 'juego_ocupado');
        error(await POST(L, '/v1/accion', { faccion: 'a', accion: 'esperar', parametros: {} }), 409, 'juego_ocupado');
        error(await POST(L, '/v1/cerrar'), 409, 'juego_ocupado');
        const info = await GET(L, '/v1/info');
        assert.equal(info.json.estado, 'ejecutando');
        assert.ok(info.json.acciones.length > 0, 'info se contesta aun ocupado');
        const r = await avance;
        assert.equal(r.estado, 200, r.texto);
        assert.equal(r.json.tiempo_juego_s, 100);
        assert.equal((await GET(L, '/v1/info')).json.estado, 'listo');
        assert.equal((await observar(L)).tiempo_juego_s, 100);
      } finally { await L.cerrar(); }
    });

    it('tiempo_agotado: la operacion sigue, el juego queda ocupado y reintentar con el mismo id da el resultado real', async () => {
      const L = await lanzar(['--tiempo-operacion-ms=300']);
      try {
        await reiniciar(L, 3);
        const cuerpo = { protocolo: 1, id_solicitud: 'dormir-1', faccion: 'a', accion: 'dormir', parametros: { ms: 1000 } };
        const t0 = Date.now();
        const r = await pedir(L, 'POST', '/v1/accion', { cuerpo });
        error(r, 504, 'tiempo_agotado');
        assert.ok(Date.now() - t0 < 900, 'el cliente no espera a que termine la accion');
        error(await GET(L, '/v1/observacion?faccion=a'), 409, 'juego_ocupado');
        assert.equal((await GET(L, '/v1/info')).json.estado, 'ejecutando');
        await esperar(900);
        const rep = await pedir(L, 'POST', '/v1/accion', { cuerpo });
        assert.equal(rep.estado, 200, rep.texto);
        assert.equal(rep.cab.get('x-puente-idempotente'), 'repetida');
        assert.equal(rep.json.resultado, 'ejecutada');
        assert.equal((await GET(L, '/v1/info')).json.estado, 'listo');
        assert.equal((await observar(L)).mundo.llamadas_fuera_de_hilo, 0);
      } finally { await L.cerrar(); }
    });

    it('mientras el juego carga: info dice "cargando", el resto no_listo, y despues pasa a listo', async () => {
      const C = await lanzar(['--retraso-mundo-ms=700', '--retraso-bombeo-ms=2200', '--tolerancia-ms=400']);
      try {
        const t0 = Date.now();
        const primera = await GET(C, '/v1/info');
        assert.equal(primera.estado, 200);
        assert.equal(primera.json.estado, 'cargando');
        assert.equal(primera.json.acciones, undefined, 'sin mundo no se anuncian acciones');
        assert.equal(primera.json.puente.nombre, 'anfitrion-simulado');
        error(await POST(C, '/v1/escenario/reiniciar', { semilla: 1, facciones: FACCIONES }), 503, 'no_listo');
        error(await GET(C, '/v1/observacion?faccion=a'), 503, 'no_listo');
        // con el mundo ya puesto pero el hilo principal sin bombear: sigue cargando y rechaza rapido
        let medio;
        for (let i = 0; i < 60 && !medio; i++) { const x = await GET(C, '/v1/info'); if (x.json.acciones) medio = x; else await esperar(50); }
        assert.ok(medio, 'el mundo se asocio');
        if (Date.now() - t0 < 2000) {
          assert.equal(medio.json.estado, 'cargando');
          const t1 = Date.now();
          error(await POST(C, '/v1/escenario/reiniciar', { semilla: 1, facciones: FACCIONES }), 503, 'no_listo');
          assert.ok(Date.now() - t1 < 1000, 'no_listo es inmediato, no espera al plazo');
        }
        let listo;
        for (let i = 0; i < 100 && !listo; i++) { const x = await GET(C, '/v1/info'); if (x.json.estado === 'listo') listo = x; else await esperar(50); }
        assert.ok(listo, 'termina por estar listo');
        assert.equal((await reiniciar(C, 2)).ok, true);
      } finally { await C.cerrar(); }
    });
  });

  // ------------------------------------------------------------------------------------------
  describe('registro y cierre', () => {
    it('el log del puente nunca contiene el token y si registra las solicitudes', async () => {
      await GET(A, '/v1/info');
      await GET(A, '/v1/info', { token: A.token.replace(/.$/, c => (c === '0' ? '1' : '0')) });
      await esperar(100);
      assert.ok(A.log.includes('Escuchando en 127.0.0.1:'), A.log.slice(0, 300));
      assert.match(A.log, /GET \/v1\/info -> 200 \(\d+ ms\)/);
      assert.match(A.log, /GET \/v1\/info -> 401 \(\d+ ms\)/);
      assert.ok(!A.log.includes(A.token), 'el token no debe aparecer en el log');
      assert.ok(!A.stdout.includes(A.token), 'ni en stdout');
    });

    it('al cerrar stdin el anfitrion sale limpio, borra el token y libera el puerto', async () => {
      const B = await lanzar();
      const archivo = B.tokenArchivo;
      assert.ok(existsSync(archivo));
      const code = await B.cerrar();
      assert.equal(code, 0);
      assert.ok(!existsSync(archivo), 'el token se borra al detener');
      await assert.rejects(() => new Promise((res, rej) => { const s = net.connect({ host: '127.0.0.1', port: B.puerto }, () => { s.destroy(); res(); }); s.on('error', rej); }));
    });

    it('sin --carpeta usa una carpeta temporal propia y la retira al salir', async () => {
      const proc = spawn(EXE, ['--vigilar-stdin'], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      procesos.add(proc);
      let out = '';
      proc.stdout.on('data', d => { out += d; });
      proc.stderr.resume();
      const salida = new Promise(r => proc.once('exit', r));
      for (let i = 0; i < 100 && !/LISTO/.test(out); i++) await esperar(50);
      const m = /^LISTO puerto=(\d+) token_archivo=(.+?)\r?$/m.exec(out);
      assert.ok(m, out);
      assert.ok(existsSync(m[2]));
      proc.stdin.end();
      assert.equal(await Promise.race([salida, esperar(4000).then(() => 'colgado')]), 0);
      procesos.delete(proc);
      assert.ok(!existsSync(m[2]));
    });

    it('argumentos invalidos o puerto ocupado: error claro y codigo 2', async () => {
      const mal = spawnSync(EXE, ['--puerto=abc'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
      assert.equal(mal.status, 2);
      assert.match(mal.stderr, /--puerto/);
      const carpetaO = mkdtempSync(join(tmpdir(), 'puente-o-'));
      const ocupado = spawnSync(EXE, [`--puerto=${A.puerto}`, `--carpeta=${carpetaO}`], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
      rmSync(carpetaO, { recursive: true, force: true });
      assert.equal(ocupado.status, 2);
      assert.match(ocupado.stderr, /No se pudo abrir 127\.0\.0\.1/);
      assert.equal((await GET(A, '/v1/info')).estado, 200, 'el servidor original no se vio afectado');
    });
  });

  // ------------------------------------------------------------------------------------------
  describe('formato era (E2): /v1/era/* contra el anfitrion C#', () => {
    it('requiere token y el catalogo se pide por tipo', async () => {
      error(await GET(A, '/v1/era/catalogo', { token: null }), 401, 'no_autorizado');
      const resumen = await GET(A, '/v1/era/catalogo');
      assert.equal(resumen.estado, 200, resumen.texto);
      assert.equal(resumen.json.version, 1);
      assert.deepEqual(Object.keys(resumen.json.rasgos).sort(), ['clan', 'cultura', 'idioma', 'reino', 'religion', 'subespecie']);
      const clan = await GET(A, '/v1/era/catalogo?tipo=clan');
      assert.deepEqual(clan.json.rasgos.map(r => r.id), ['stonefists', 'iron_will', 'magic_blood', 'cursed_blood']);
      assert.equal(clan.json.rasgos.find(r => r.id === 'cursed_blood').ofrecible, false);
      error(await GET(A, '/v1/era/catalogo?tipo=planeta'), 400, 'solicitud_invalida');
      error(await GET(A, '/v1/era/catalogo?tipo=CLAN'), 400, 'solicitud_invalida');
    });

    it('rasgos: rechaza ids desconocidos y no ofrecidos sin aplicar nada (atomico) y respeta el tope', async () => {
      await reiniciar(A);
      let r = await POST(A, '/v1/era/rasgos', { faccion: 'a', tipo: 'clan', agregar: ['stonefists', 'no_existe'] });
      assert.equal(r.estado, 200, r.texto);
      assert.equal(r.json.resultado, 'rechazada');
      assert.deepEqual(r.json.aplicados, []);
      assert.deepEqual(r.json.rechazados.map(x => x.codigo), ['rasgo_desconocido']);
      r = await POST(A, '/v1/era/rasgos', { faccion: 'a', tipo: 'clan', agregar: ['cursed_blood'] });
      assert.deepEqual(r.json.rechazados.map(x => x.codigo), ['rasgo_no_ofrecido']);
      r = await POST(A, '/v1/era/rasgos', { faccion: 'a', tipo: 'clan', agregar: ['stonefists', 'no_existe'], parcial: true });
      assert.equal(r.json.resultado, 'parcial');
      assert.deepEqual(r.json.aplicados, ['stonefists']);
      r = await POST(A, '/v1/era/rasgos', { faccion: 'a', tipo: 'clan', agregar: ['iron_will', 'magic_blood'] });
      assert.equal(r.json.resultado, 'ejecutada');
      assert.deepEqual(r.json.rasgos_actuales.sort(), ['iron_will', 'magic_blood', 'stonefists']);
      assert.equal(r.json.tope, 3);
      r = await POST(A, '/v1/era/rasgos', { faccion: 'a', tipo: 'idioma', agregar: ['elegant_words'] });
      assert.equal(r.json.resultado, 'ejecutada', 'el tope es por tipo y faccion');
      r = await POST(A, '/v1/era/rasgos', { faccion: 'a', tipo: 'clan', quitar: ['stonefists'] });
      assert.deepEqual(r.json.quitados, ['stonefists']);
      r = await POST(A, '/v1/era/rasgos', { faccion: 'a', tipo: 'idioma', agregar: ['foolish_glyphs', 'enlightening_script'] });
      assert.deepEqual(r.json.rechazados.map(x => x.codigo), ['rasgo_opuesto']);
    });

    it('rasgos: forma invalida es 400 y faccion inexistente tambien', async () => {
      await reiniciar(A);
      error(await POST(A, '/v1/era/rasgos', { faccion: 'a', tipo: 'clan' }), 400, 'solicitud_invalida');
      error(await POST(A, '/v1/era/rasgos', { faccion: 'a', tipo: 'clan', agregar: 'stonefists' }), 400, 'solicitud_invalida');
      error(await POST(A, '/v1/era/rasgos', { faccion: 'zz', tipo: 'clan', agregar: ['stonefists'] }), 400, 'solicitud_invalida');
      error(await POST(A, '/v1/era/rasgos', { faccion: 'a', tipo: 'planeta', agregar: ['x'] }), 400, 'solicitud_invalida');
    });

    it('rasgos: una solicitud repetida (mismo id_solicitud) no se ejecuta dos veces', async () => {
      await reiniciar(A);
      const cuerpo = { protocolo: 1, id_solicitud: 'era-rep-1', faccion: 'a', tipo: 'clan', agregar: ['magic_blood'] };
      const a = await pedir(A, 'POST', '/v1/era/rasgos', { cuerpo });
      const b = await pedir(A, 'POST', '/v1/era/rasgos', { cuerpo });
      assert.equal(b.cab.get('x-puente-idempotente'), 'repetida');
      assert.deepEqual(a.json, b.json);
      const c = await POST(A, '/v1/era/rasgos', { faccion: 'a', tipo: 'clan', agregar: ['magic_blood'] });
      assert.deepEqual(c.json.rechazados.map(x => x.codigo), ['ya_presente'], 'el rasgo quedo una sola vez');
    });

    it('muro y estado: quitar el muro queda en la lista de eventos y el estado lleva el indice siguiente', async () => {
      await reiniciar(A);
      let e = await GET(A, '/v1/era/estado');
      assert.equal(e.estado, 200, e.texto);
      assert.equal(e.json.hay_era, true);
      const n0 = e.json.siguiente_evento;
      const m = await POST(A, '/v1/era/muro', { operacion: 'quitar' });
      assert.equal(m.json.muro_puesto, false);
      e = await GET(A, '/v1/era/estado?desde=' + n0);
      assert.deepEqual(e.json.eventos.map(x => x.tipo), ['muro_quitado']);
      error(await POST(A, '/v1/era/muro', { operacion: 'derribar' }), 400, 'solicitud_invalida');
      error(await POST(A, '/v1/era/muro', { operacion: 'poner', ancho: 99 }), 400, 'solicitud_invalida');
      error(await GET(A, '/v1/era/estado?desde=-3'), 400, 'solicitud_invalida');
    });

    it('minerales: valida mineral, faccion y cantidad', async () => {
      await reiniciar(A);
      const ok = await POST(A, '/v1/era/minerales', { faccion: 'a', mineral: 'mineral_gold', cantidad: 3, espejo: true });
      assert.equal(ok.estado, 200, ok.texto);
      assert.equal(ok.json.colocados, 3);
      error(await POST(A, '/v1/era/minerales', { faccion: 'a', mineral: 'mineral_gold', cantidad: 0 }), 400, 'solicitud_invalida');
      error(await POST(A, '/v1/era/minerales', { faccion: 'a', mineral: 'oro', cantidad: 1 }), 400, 'solicitud_invalida');
      error(await POST(A, '/v1/era/minerales', { faccion: 'zz', mineral: 'mineral_gold', cantidad: 1 }), 400, 'solicitud_invalida');
    });

    it('mantener (E5): mantener/soltar por HTTP contra el anfitrion C#; el estado informa rasgos_mantenidos y el costo; la ruta antigua no cambia', async () => {
      await reiniciar(A);
      const info = await GET(A, '/v1/info');
      assert.equal(info.json.capacidades.era_mantener, true);
      let r = await POST(A, '/v1/era/rasgos', { faccion: 'a', tipo: 'idioma', agregar: ['elegant_words', 'powerful_words'], mantener: true });
      assert.equal(r.estado, 200, r.texto);
      assert.equal(r.json.resultado, 'ejecutada'); assert.equal(r.json.mantener, true); assert.deepEqual(r.json.pendientes, []); assert.deepEqual(r.json.aplicados.sort(), ['elegant_words', 'powerful_words']);
      let e = await GET(A, '/v1/era/estado');
      assert.equal(e.json.mantenimiento.deseados_activos, 2); assert.equal(e.json.mantenimiento.deseados_pendientes, 0);
      assert.ok('ms_total' in e.json.mantenimiento && 'ms_medio' in e.json.mantenimiento && 'opuestos_quitados' in e.json.mantenimiento);
      r = await POST(A, '/v1/era/rasgos', { faccion: 'a', tipo: 'idioma', soltar: ['elegant_words', 'no_estaba'] });
      assert.equal(r.estado, 200, r.texto); assert.deepEqual(r.json.soltados, ['elegant_words']);
      e = await GET(A, '/v1/era/estado');
      assert.equal(e.json.mantenimiento.deseados_activos, 1);
      r = await POST(A, '/v1/era/rasgos', { faccion: 'a', tipo: 'clan', agregar: ['stonefists'] });
      assert.equal(r.json.mantener, undefined, 'sin mantener ni soltar, la respuesta es la de siempre');
      error(await POST(A, '/v1/era/rasgos', { faccion: 'a', tipo: 'idioma', agregar: ['elegant_words'], mantener: 'si' }), 400, 'solicitud_invalida');
      error(await POST(A, '/v1/era/rasgos', { faccion: 'a', tipo: 'idioma', soltar: [7] }), 400, 'solicitud_invalida');
    });

    it('velocidad (E4): cambia entre avances, valida la forma y el valor, y la repeticion no se ejecuta dos veces', async () => {
      await reiniciar(A);
      const ok = await POST(A, '/v1/era/velocidad', { velocidad: 'x40', id_solicitud: 'vel-1' });
      assert.equal(ok.estado, 200, ok.texto);
      assert.equal(ok.json.velocidad, 'x40');
      const repetida = await POST(A, '/v1/era/velocidad', { velocidad: 'x40', id_solicitud: 'vel-1' });
      assert.equal(repetida.estado, 200); assert.deepEqual(repetida.json, ok.json);
      error(await POST(A, '/v1/era/velocidad', { velocidad: 'rapido' }), 400, 'solicitud_invalida');
      error(await POST(A, '/v1/era/velocidad', { velocidad: 'x7' }), 400, 'solicitud_invalida');
      error(await POST(A, '/v1/era/velocidad', {}), 400, 'solicitud_invalida');
      const estado = await GET(A, '/v1/era/estado?desde=0');
      assert.ok(estado.json.eventos.some(e => e.tipo === 'velocidad_cambiada'));
    });
  });

  // ------------------------------------------------------------------------------------------
  describe('cliente Node de W3 (src/worldbox/adaptador-http.js) contra el anfitrion C#', () => {
    it('comprobarAdaptador de punta a punta: info, reiniciar, observar, ejecutar, avanzar, terminal, cerrar', async t => {
      let modulos;
      try {
        modulos = {
          http: await import('../../worldbox/adaptador-http.js'),
          base: await import('../../worldbox/adaptador.js'),
        };
      } catch (e) { return t.skip(`cliente W3 no disponible: ${e.message}`); }
      const W = await lanzar();
      try {
        const ad = modulos.http.crearAdaptadorHttp({ url: W.base, token: W.token, reintentos: 0 });
        const info = await modulos.base.comprobarAdaptador(ad, { escenario: { semilla: 1, tamano_mapa: 64, facciones: [{ id: 'a' }, { id: 'b' }], opciones: {} } });
        assert.equal(info.estado, 'listo');
        assert.equal(info.origen, 'puente', 'el cliente de W3 no se fia del origen que declare el servidor');
        assert.ok(info.acciones.some(a => a.nombre === 'esperar'));
        const o = await ad.observar('a');
        assert.equal(o.faccion.id, 'a');
        assert.deepEqual(o.rivales.map(r => r.id), ['b']);
        assert.equal((await ad.ejecutar({ faccion: 'a', accion: 'esperar', parametros: {} })).resultado, 'sin_efecto');
        assert.equal((await ad.ejecutar({ faccion: 'a', accion: 'volar', parametros: {} })).resultado, 'rechazada');
        assert.equal((await ad.avanzar({ segundos_juego: 2 })).tiempo_juego_s >= 2, true);
        assert.equal((await ad.estadoTerminal()).terminal, false);
        await assert.rejects(() => ad.observar('zzz'), e => e.codigo === 'solicitud_invalida');
        assert.deepEqual(await ad.cerrar(), { cerrado: true });
        await assert.rejects(() => modulos.http.crearAdaptadorHttp({ url: W.base, token: 'x'.repeat(64), reintentos: 0 }).info(), e => e.codigo === 'no_autorizado');
      } finally { await W.cerrar(); }
    });
  });
});
