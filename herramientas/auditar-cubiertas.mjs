#!/usr/bin/env node
// Audita las piezas de grabacion de uno o varios paquetes: abre cada direccion de grabacion (las de su LEEME.md) en UN Chrome sin cabeza (por el protocolo de depuracion, sin dependencias),
// a velocidad 4 por omision, y en cada instante comprueba que las tarjetas que cubren la mesa (arranque `intro-juego`, gancho `tarjeta-gancho` y cierre del video `cierre-juego`) estan
// invisibles salvo durante el beat que les toca. Tambien comprueba que la pieza llegue a cerrar, sin errores de pagina ni de consola, y que traiga y muestre la tarjeta de cierre del video.
// Nacio de un fallo real (29-10-2026): el `cierre` de mano de Duda y apuesta tapaba la mesa con la tarjeta del video vacia (docs/produccion-videos.md).
//
//   node herramientas/auditar-cubiertas.mjs grabaciones/listos/<juego>/<carpeta>/paquete-jN/LEEME.md [otro LEEME.md ...] [--vel=4]
//
// Levanta su propio servidor en el puerto 4325 (PUERTO_AUDITORIA) y un Chrome con el puerto de depuracion 9336; no toca el servidor 4321 de OBS. No gasta nada ni llama a ningun modelo.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUERTO = Number(process.env.PUERTO_AUDITORIA || 4325), CDP = Number(process.env.PUERTO_CDP || 9336);
const NAVEGADORES = [process.env.CHROME_EXE, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const hasta = async (fn, ms = 20000) => { const f = Date.now() + ms; while (Date.now() < f) { try { if (await fn()) return true; } catch { /* aun no */ } await dormir(150); } return false; };

const EXPR = `JSON.stringify({ f: document.body?.dataset.fundido ?? null, c: document.body?.dataset.cierre ?? null, e: document.body?.dataset.error ?? null,
  op: Object.fromEntries(['intro-juego', 'tarjeta-gancho', 'cierre-juego'].map((k) => [k, Math.max(0, ...[...document.querySelectorAll('.' + k)].map((n) => Number(getComputedStyle(n).opacity)))])) })`;
const VENTANAS = `JSON.stringify((window.escena?.marcas ?? []).map((m, i) => { const b = window.escena.beats[i]; return [m.inicioMs, m.finMs, b.tipo, b.id]; }))`;
const esCierreDelVideo = (id) => /^cierre-\d+$/.test(String(id));

// Las direcciones de grabacion de un LEEME.md, en el orden en que aparecen y sin repetir: en su propio renglon (formato actual) o dentro de una frase («Dirección para abrir y grabar: http://...», formato antiguo).
export function direccionesDeLeeme(texto) {
  return [...new Set([...texto.matchAll(/(?:^|\s)http:\/\/localhost:\d+\/(escena\.html\?[^\s`]+)/g)].map((m) => m[1]))];
}

// Lo que se ve mal en una pieza, a partir de las muestras (puro: se prueba sin navegador). `ventanas` = [inicioMs, finMs, tipo, id] de cada beat; `muestras` = [ms, { op, c, e }].
export function problemasDePieza({ ventanas, muestras, consola = [] }) {
  const permitido = { 'intro-juego': (v) => v[2] === 'intro', 'tarjeta-gancho': (v) => v[2] === 'tarjeta-gancho', 'cierre-juego': (v) => esCierreDelVideo(v[3]) };
  const violaciones = [];
  let cierreVisto = false;
  for (const [ms, e] of muestras) {
    for (const [k, op] of Object.entries(e.op)) {
      if (k === 'cierre-juego' && op > 0.9) cierreVisto = true;
      // Con el fundido a negro de la salida (`saliendo`) o en negro, la cortina manda: la tarjeta de cierre sigue a la vista debajo mientras entra el negro y eso es lo esperado.
      if (e.f === 'saliendo' || e.f === 'negro') continue;
      const tolerado = ventanas.some((v) => ms >= v[0] - 700 && ms < v[1] + 700 && permitido[k](v));
      if (op > 0.05 && !tolerado) violaciones.push({ ms, k, op, beat: ventanas.find((v) => ms >= v[0] && ms < v[1])?.[3] ?? 'fuera de beats' });
    }
  }
  const ultimo = muestras.at(-1)?.[1];
  const problemas = [];
  if (ultimo?.e) problemas.push(`error de pagina: ${String(ultimo.e).slice(0, 80)}`);
  if (ultimo?.c !== '1') problemas.push('no llego a cerrar');
  if (violaciones.length) problemas.push(`${violaciones.length} muestras con una tarjeta cubriendo la mesa: ${[...new Set(violaciones.map((v) => `${v.k} durante ${v.beat}`))].slice(0, 3).join(' | ')} (la primera a los ${(violaciones[0].ms / 1000).toFixed(1)} s)`);
  if (!ventanas.some((v) => esCierreDelVideo(v[3]))) problemas.push('la pieza no trae el beat de cierre del video');
  else if (!cierreVisto) problemas.push('la tarjeta de cierre del video nunca se vio');
  if (consola.length) problemas.push(`errores de consola: ${[...new Set(consola)].slice(0, 2).join(' | ')}`);
  return problemas;
}

async function principal() {
  const args = process.argv.slice(2);
  const vel = Number((args.find((a) => a.startsWith('--vel=')) ?? '--vel=4').slice(6));
  const leemes = args.filter((a) => !a.startsWith('--'));
  if (!leemes.length || !(vel > 0)) { console.error('Uso: node herramientas/auditar-cubiertas.mjs RUTA/LEEME.md [otro LEEME.md ...] [--vel=4]'); process.exit(1); }
  const piezas = [];
  for (const l of leemes) {
    const ruta = resolve(RAIZ, l);
    if (!existsSync(ruta)) { console.error(`No encuentro ${l}`); process.exit(1); }
    const nombre = ruta.replace(/\\/g, '/').split('/').slice(-4).join('/').replace('/paquete-', ' ').replace('/LEEME.md', '');
    direccionesDeLeeme(readFileSync(ruta, 'utf8')).forEach((d, i) => piezas.push({ paquete: nombre, n: i + 1, ruta: d }));
  }
  if (!piezas.length) { console.error('Los LEEME no traen direcciones de grabacion.'); process.exit(1); }
  const navegador = NAVEGADORES.find((x) => existsSync(x));
  if (!navegador) { console.error('No encuentro Chrome ni Edge (CHROME_EXE=ruta lo indica).'); process.exit(1); }

  const serv = spawn(process.execPath, ['src/servidor.js'], { cwd: RAIZ, env: { ...process.env, PUERTO: String(PUERTO) }, stdio: 'ignore' });
  const perfil = mkdtempSync(join(tmpdir(), 'auditar-'));
  let chrome = null, malas = 0;
  const limpiar = () => { try { chrome?.kill(); } catch { /* ya cerro */ } try { serv.kill(); } catch { /* ya cerro */ } setTimeout(() => { try { rmSync(perfil, { recursive: true, force: true }); } catch { /* en uso */ } }, 1500); };
  process.on('SIGINT', () => { limpiar(); process.exit(1); });
  try {
    if (!await hasta(async () => (await fetch(`http://localhost:${PUERTO}/escena.html`)).ok)) throw new Error(`el servidor del ${PUERTO} no arranco`);
    chrome = spawn(navegador, ['--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=${perfil}`, '--window-size=1920,1080', '--force-device-scale-factor=1', '--autoplay-policy=no-user-gesture-required',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
    if (!await hasta(async () => (await fetch(`http://127.0.0.1:${CDP}/json/version`)).ok)) throw new Error('el navegador no abrio el puerto de depuracion');
    const objetivos = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json();
    const ws = new WebSocket(objetivos.find((t) => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((ok, mal) => { ws.onopen = ok; ws.onerror = mal; });
    let id = 0; const pend = new Map(); const consola = [];
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pend.has(d.id)) { const { ok, mal } = pend.get(d.id); pend.delete(d.id); return d.error ? mal(new Error(d.error.message)) : ok(d.result); }
      if (d.method === 'Runtime.exceptionThrown') consola.push((d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).slice(0, 200));
      if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') consola.push(d.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200));
    };
    const enviar = (method, params = {}) => new Promise((ok, mal) => { const i = ++id; pend.set(i, { ok, mal }); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async (expression) => JSON.parse((await enviar('Runtime.evaluate', { expression, returnByValue: true })).result.value ?? 'null');
    await enviar('Page.enable'); await enviar('Runtime.enable');
    await enviar('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

    for (const p of piezas) {
      consola.length = 0;
      const q = new URLSearchParams(p.ruta.split('?')[1]);
      const tipo = q.get('gancho') ? 'gancho' : q.get('clip') ? 'clip' : 'parte';
      const ruta = q.has('vel') ? p.ruta : `${p.ruta}&vel=${vel}`;
      await enviar('Page.navigate', { url: 'about:blank' });
      await enviar('Page.navigate', { url: `http://localhost:${PUERTO}/${ruta}` });
      if (!await hasta(async () => (await ev(EXPR))?.f === 'contenido', 40000)) { console.log(`X ${p.paquete} #${p.n} ${tipo}: nunca llego a contenido`); malas++; continue; }
      const t0 = Date.now();
      const ventanas = await ev(VENTANAS);
      const fin = ventanas.at(-1)?.[1] ?? 0;
      const muestras = [];
      while (Date.now() - t0 < fin + 20000) {
        await dormir(120);
        const e = await ev(EXPR);
        muestras.push([Date.now() - t0, e]);
        if (e.c === '1' || e.e || e.f === 'error') break;
      }
      const problemas = problemasDePieza({ ventanas, muestras, consola });
      console.log(`${problemas.length ? 'X' : 'OK'} ${p.paquete} #${p.n} ${tipo}: ${(fin / 1000).toFixed(0)} s a vel ${vel}${problemas.length ? ` -> ${problemas.join('; ')}` : ''}`);
      if (problemas.length) malas++;
    }
    ws.close();
  } catch (e) { console.error('ERROR del auditor:', e.message); malas++; } finally { limpiar(); }
  console.log(`\nresumen: ${piezas.length - malas} de ${piezas.length} piezas sin problemas`);
  process.exitCode = malas ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await principal();
