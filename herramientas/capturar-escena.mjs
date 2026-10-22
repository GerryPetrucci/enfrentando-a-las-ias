#!/usr/bin/env node
// Verificacion visual de la escena de casino de cualquier juego registrado (web/casino/lineas.js): abre web/escena.html con Chrome sin cabeza, toma capturas de los momentos clave en cada
// formato y falla si la consola de la pagina trae errores. No juzga si "se ve bien": eso lo hace quien mira las capturas.
//
//   node src/servidor.js                      (en otra terminal: sirve web/ y data/)
//   node herramientas/capturar-escena.mjs --archivo=pruebas/mi-partida.json
//   node herramientas/capturar-escena.mjs --archivo=NOMBRE.json --formato=9x16 --beats=1,6,43 --salida=grabaciones/capturas
//   node herramientas/capturar-escena.mjs --archivo=NOMBRE.json --completa      (reproduce toda la partida a velocidad 8 y comprueba que termina)
//   node herramientas/capturar-escena.mjs --archivo=NOMBRE.json --grabar        (el modo de grabacion con OBS: negro de entrada, contenido, fundido y cierre en negro)
//
// --archivo   partida de un juego con escena dentro de data/ (obligatorio)      --partida   cual del archivo (1 = la primera)
// --formato   9x16, 16x9 o hoja, separados por coma (por defecto 9x16,16x9) --beats     auto (los momentos clave) o los numeros separados por coma
// --gancho=auto|10,6,14  captura el gancho «Proximamente» (con auto elige los cortes de la parte; --parte=1 --de=2): sus tarjetas y el primer momento de cada corte
// --voz=data/voz/NOMBRE-pN/voz.json   con --completa, reproduce con la voz (herramientas/narrar.mjs) y comprueba que lo medido coincide con la linea de tiempo con voz
// --estado    en el reparto de cada mano desde la segunda comprueba que no queda nada de la anterior (sello, anuncio, pastillas, medallas); --manos=N cuantas
// --grabar    modo grabar=1: comprueba que la pagina empieza en negro (margen), pasa al contenido y termina cerrada en negro (data-fundido, data-cierre)
// --salida    carpeta de las capturas (por defecto grabaciones/capturas; grabaciones/ no se versiona)
// --base      direccion del servidor (por defecto http://localhost:4321)   --chrome    ruta de Chrome (o la variable CHROME_PATH)
// Salida 0 si no hubo errores de consola; 1 si los hubo o algo no se pudo capturar.

import { existsSync, readFileSync, mkdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { inflateSync } from 'node:zlib';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { escenaDe, motivoDeNoReproducible, armarLinea, destacadasDe } from '../web/casino/lineas.js';
import { FUNDIDOS, segundos, dividirEnDos } from '../web/casino/escena-config.js';
import { elegirCortes, cortesPedidos, armarGancho } from '../web/casino/gancho.js';

const TAMANOS = { '9x16': '1080,1920', '16x9': '1920,1080', hoja: '3840,2160' };
export function tamanoDeFormato(formato) {
  if (!TAMANOS[formato]) throw new Error(`formato desconocido: ${formato}. Usa ${Object.keys(TAMANOS).join(', ')}.`);
  return TAMANOS[formato];
}

// La direccion de la escena lista para capturar: sin sonido ni barra, arranca sola y (con `beat`) avanza al instante hasta ese momento y se queda ahi.
export function urlDeCaptura({ base, archivo, formato, beat = null, partida = 1, vel = null, voz = null, grabar = false, sonido = false, gancho = null }) {
  const q = new URLSearchParams({ archivo, partida: String(partida), formato, limpio: '1', auto: '1', sonido: sonido ? '1' : '0', escala: '1' });
  if (gancho) { q.set('gancho', '1'); q.set('cortes', gancho.cortes.join(',')); q.set('parte', String(gancho.parte)); q.set('de', String(gancho.de)); } // el gancho «Proximamente»: los beats son los suyos (gancho.js)
  if (grabar) q.set('grabar', '1');
  if (beat !== null && beat !== undefined) q.set('detener', String(beat));
  if (vel) q.set('vel', String(vel));
  if (voz) q.set('voz', voz);
  return `${base}/escena.html?${q}`;
}

// Los errores de la consola de la pagina que Chrome escribe en su salida de errores. Los fallos de Chrome mismo (GPU...) no cuentan, ni los 404 de las
// muestras de audio, que son opcionales (web/audio/LEEME.md).
export function erroresDeConsola(salida) {
  return String(salida ?? '').split(/\r?\n/)
    // Chrome escribe los console.error como INFO: la escena marca los suyos con "escena:" y tambien cuentan
    .filter((l) => /:ERROR:CONSOLE\(/.test(l) || /:CONSOLE\(\d+\)\] "escena: /.test(l))
    .filter((l) => !(/404/.test(l) && /\/audio\//.test(l)))
    .map((l) => l.replace(/^\[[^\]]*\]\s*/, ''));
}

// Los momentos que vale la pena mirar, de cualquier juego: el primer beat de cada tipo, el primero de cada tipo en una ronda posterior (ahi se ve lo que una ronda le deja
// a la siguiente: se vieron fallos justo ahi) y el final.
export function beatsClave(beats) {
  if (!Array.isArray(beats)) return [];
  const indices = new Set();
  const primerosDeCadaTipo = (lista) => {
    const vistos = new Set();
    for (const { b, i } of lista) if (!vistos.has(b.tipo)) { vistos.add(b.tipo); indices.add(i); }
  };
  const todos = beats.map((b, i) => ({ b, i }));
  primerosDeCadaTipo(todos);
  const rondas = [...new Set(beats.map((b) => b.mano))];
  const posterior = rondas[2] ?? rondas[1];
  if (posterior !== undefined) primerosDeCadaTipo(todos.filter(({ b }) => b.mano === posterior));
  const final = beats.findLastIndex((b) => b.tipo === 'final');
  if (final >= 0) indices.add(final);
  return [...indices].sort((a, b) => a - b);
}

export function leerEstado(dom) {
  const m = /data-estado="([^"]*)"/.exec(String(dom ?? ''));
  if (!m) return null;
  try { return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')); } catch { return null; }
}

// Cuanto duro la reproduccion (medida por la pagina) contra lo que dice la linea de tiempo exportada.
export function leerDesfase(dom) {
  const texto = String(dom ?? '');
  const medido = /data-duracion-ms="([\d.]+)"/.exec(texto), esperado = /data-esperada-ms="([\d.]+)"/.exec(texto);
  if (!medido || !esperado) return null;
  return { medidoMs: Number(medido[1]), esperadoMs: Number(esperado[1]), desfaseMs: Number(medido[1]) - Number(esperado[1]) };
}
export const desfaseAceptable = (d) => !!d && Math.abs(d.desfaseMs) <= Math.max(1500, 0.04 * d.esperadoMs);

const UMBRAL_NEGRO = 8; // el mayor de R, G y B que aun cuenta como negro en una captura (el ruido de compresion)
const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };

// ¿Una captura PNG (RGB o RGBA de 8 bits, sin entrelazar: lo que escribe Chrome) es toda negra? Sin dependencias: se descomprime con zlib y se deshacen los filtros en sitio, mirando cada color al
// reconstruirlo (el alfa no cuenta). Lo que no se puede leer no es negro (false): asi una captura rota nunca pasa por la cortina.
export function pngEsNegro(buffer) {
  try {
    const b = Buffer.isBuffer(buffer) ? buffer : null;
    if (!b || b.length < 33 || b.readUInt32BE(0) !== 0x89504e47) return false;
    let pos = 8, ancho = 0, alto = 0, prof = 0, tipo = 0, entrelazado = 1;
    const datos = [];
    while (pos + 8 <= b.length) {
      const largo = b.readUInt32BE(pos), nombre = b.toString('ascii', pos + 4, pos + 8), cuerpo = b.subarray(pos + 8, pos + 8 + largo);
      if (nombre === 'IHDR') { ancho = cuerpo.readUInt32BE(0); alto = cuerpo.readUInt32BE(4); prof = cuerpo[8]; tipo = cuerpo[9]; entrelazado = cuerpo[12]; } else if (nombre === 'IDAT') datos.push(cuerpo); else if (nombre === 'IEND') break;
      pos += 12 + largo;
    }
    const canales = tipo === 2 ? 3 : tipo === 6 ? 4 : 0;
    if (!canales || prof !== 8 || entrelazado !== 0 || !ancho || !alto) return false;
    const crudo = inflateSync(Buffer.concat(datos)), fila = ancho * canales;
    if (crudo.length < alto * (fila + 1)) return false;
    for (let y = 0; y < alto; y++) {
      const ini = y * (fila + 1) + 1, filtro = crudo[ini - 1];
      if (filtro > 4) return false;
      for (let i = 0; i < fila; i++) {
        const izq = i >= canales ? crudo[ini + i - canales] : 0, arr = y ? crudo[ini + i - fila - 1] : 0, arrIzq = y && i >= canales ? crudo[ini + i - fila - 1 - canales] : 0;
        const base = filtro === 1 ? izq : filtro === 2 ? arr : filtro === 3 ? (izq + arr) >> 1 : filtro === 4 ? paeth(izq, arr, arrIzq) : 0;
        const v = crudo[ini + i] = (crudo[ini + i] + base) & 255;
        if (v > UMBRAL_NEGRO && i % canales !== 3) return false; // el cuarto canal de un RGBA es el alfa
      }
    }
    return true;
  } catch { return false; }
}

// Los momentos (ms de tiempo virtual) en que --grabar mira la pagina, sacados de FUNDIDOS: uno a la mitad del margen de negro y otro con la partida ya corriendo (pasados el margen, el fundido y un rato mas).
export function presupuestosDeGrabar(f = FUNDIDOS) {
  return { margen: Math.round(f.margenMs / 2), contenido: f.margenMs + f.fundidoMs + 1500 };
}

// En que punto de la grabacion esta la pagina (data-fundido: margen, entrando, contenido, saliendo o negro) y si ya se cerro en negro (data-cierre); null si no esta en modo grabar.
export function leerFundido(dom) {
  const texto = String(dom ?? '');
  const f = /data-fundido="([a-z]+)"/.exec(texto);
  if (!f) return null;
  return { fundido: f[1], cerrada: /data-cierre="1"/.test(texto) };
}

const CANDIDATOS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
];
export function buscarChrome(env = process.env, existe = existsSync) {
  if (env.CHROME_PATH && existe(env.CHROME_PATH)) return env.CHROME_PATH;
  return CANDIDATOS.find((r) => existe(r)) ?? null;
}

// Los argumentos de Chrome sin cabeza de toda captura: ventana del tamano del formato y `presupuesto` ms de tiempo virtual; `resto` agrega lo propio (--dump-dom, --screenshot=..., la direccion).
// Como root (contenedores y sesiones en la nube) Chrome se niega a abrir sin --no-sandbox.
const COMO_ROOT = typeof process.getuid === 'function' && process.getuid() === 0;
const argsChrome = (formato, presupuesto, ...resto) => ['--headless=new', ...(COMO_ROOT ? ['--no-sandbox'] : []), '--disable-gpu', '--hide-scrollbars', '--enable-logging=stderr', '--v=0', `--window-size=${tamanoDeFormato(formato)}`, `--virtual-time-budget=${presupuesto}`, ...resto];

function ejecutarChrome(chrome, argumentos) {
  const r = spawnSync(chrome, argumentos, { encoding: 'utf8', timeout: 180000, maxBuffer: 64 * 1024 * 1024 });
  return { salida: r.stdout ?? '', consola: r.stderr ?? '', estado: r.status };
}

async function principal() {
  const a = Object.fromEntries(process.argv.slice(2).map((x) => { const [k, ...v] = x.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : 'true']; }));
  if (!a.archivo) { console.error('Falta --archivo=NOMBRE.json (una partida de un juego con escena de casino dentro de data/).'); process.exit(1); }
  const base = a.base ?? 'http://localhost:4321';
  const formatos = (a.formato ?? '9x16,16x9').split(',');
  formatos.forEach(tamanoDeFormato);
  const chrome = a.chrome ?? buscarChrome();
  if (!chrome) { console.error('No encontre Chrome ni Edge. Pasa --chrome=RUTA o define CHROME_PATH.'); process.exit(1); }

  const datos = JSON.parse(readFileSync(resolve('data', a.archivo), 'utf8'));
  const partida = Number(a.partida ?? 1);
  const guardada = datos.partidas?.[partida - 1];
  const juego = guardada?.juego?.id ?? datos.juego?.id;
  if (!guardada) { console.error(`El archivo no tiene la partida ${partida}.`); process.exit(1); }
  const motivo = motivoDeNoReproducible(juego, guardada); // antes de buscar el servidor: una partida que la escena no puede reproducir no merece capturas
  if (motivo) { console.error(`La partida ${partida} no se puede capturar: ${motivo}.`); process.exit(1); }
  try { await fetch(`${base}/escena.html`); } catch { console.error(`No hay servidor en ${base}. Abre otra terminal y corre: node src/servidor.js`); process.exit(1); }
  let linea;
  try { linea = await escenaDe(juego).linea(); } catch (e) { console.error(e.message); process.exit(1); }
  const beats = await armarLinea(juego, guardada); // la misma lista (con la tarjeta de arranque) que arma la pagina: si no, el indice de un beat no coincide
  if (!beats.length) { console.error(`El archivo no tiene la partida ${partida}.`); process.exit(1); }
  const carpeta = resolve(a.salida ?? 'grabaciones/capturas');
  mkdirSync(carpeta, { recursive: true });
  const nombre = a.archivo.replace(/[^\w.-]+/g, '_').replace(/\.json$/, '');
  let fallos = 0;
  const revisar = (etiqueta, consola) => {
    const errores = erroresDeConsola(consola);
    for (const e of errores) console.error(`  ERROR en ${etiqueta}: ${e}`);
    fallos += errores.length;
  };

  // con --gancho, los beats son los del gancho «Proximamente» (apertura, etiquetas, cortes y cierre) y no los de la partida
  let gancho = null, beatsDeCaptura = beats;
  if (a.gancho) {
    const parte = Number(a.parte ?? 1), de = Number(a.de ?? 2), destacadas = await destacadasDe(juego, guardada, 10);
    let unidades = a.gancho === 'auto' ? null : a.gancho.split(',').map(Number);
    if (!unidades) {
      const partes = dividirEnDos(beats);
      if (!partes) { console.error('La partida es muy corta para partirla en dos: no hay gancho que elegir.'); process.exit(1); }
      unidades = elegirCortes({ beats, destacadas, rango: parte === 1 ? partes.parte1 : partes.parte2 }).map((c) => c.unidad);
    }
    const cortes = cortesPedidos(beats, unidades, destacadas);
    if (!cortes.length) { console.error('El gancho no tiene cortes validos.'); process.exit(1); }
    gancho = { cortes: cortes.map((c) => c.unidad), parte, de };
    beatsDeCaptura = armarGancho(beats, cortes, { juegoId: juego, partidaNumero: partida, parte, de });
    console.log(`  Gancho de la parte ${parte}: cortes ${gancho.cortes.join(', ')} (${cortes.map((c) => c.etiqueta).join(' · ')})`);
  }

  if (a.completa) {
    for (const formato of formatos) {
      const vel = Number(a.vel ?? 8);
      const r = ejecutarChrome(chrome, argsChrome(formato, 600000, '--dump-dom', urlDeCaptura({ base, archivo: a.archivo, formato, partida, vel, voz: a.voz, gancho })));
      const termino = /data-terminada="1"/.test(r.salida);
      console.log(`  ${formato}: ${termino ? 'la partida termino de reproducirse' : 'NO termino de reproducirse'}`);
      if (!termino) fallos++;
      const d = leerDesfase(r.salida);
      if (d) {
        console.log(`  ${formato}: duro ${(d.medidoMs / 1000).toFixed(1)} s y la linea de tiempo decia ${(d.esperadoMs / 1000).toFixed(1)} s (a velocidad ${vel})`);
        if (!desfaseAceptable(d)) { console.error(`  ERROR en ${formato}: la reproduccion se desfasa ${(d.desfaseMs / 1000).toFixed(1)} s de su linea de tiempo`); fallos++; }
      }
      revisar(`${formato} (completa)`, r.consola);
    }
  } else if (a.grabar) {
    // el modo de grabacion con OBS, medido en tiempo virtual: a mitad del margen la pagina sigue en negro, pasados el margen y el fundido ya corre el contenido y al final queda cerrada en negro.
    // Ademas del estado que dice la pagina (data-fundido) se mira el pixel: la cortina tiene que cubrir TODO el margen y el cierre (un destello de escena antes de aclararse arruinaria el primer cuadro grabado).
    const vel = Number(a.vel ?? 8), t = presupuestosDeGrabar(), alSegundo = (ms) => `a ${segundos(ms)} s`;
    // el ultimo momento es igual al de «al final» pero CON sonido: Chrome sin cabeza no tiene audio listo (como un navegador que exige un clic) y la pagina no puede quedarse en negro esperandolo
    const momentos = [ // cuando, ms de tiempo virtual, velocidad, data-fundido esperado, ¿la captura es toda negra?, sufijo del PNG, ¿con sonido?
      [alSegundo(t.margen), t.margen, 1, 'margen', true, 'margen', false], [alSegundo(t.contenido), t.contenido, 1, 'contenido', false, 'contenido', false], ['al final', 600000, vel, 'negro', true, 'final', false],
      ['al final, con sonido', 600000, vel, 'negro', true, 'final-sonido', true]];
    const informar = (bien, texto) => { console.log(`  ${bien ? 'ok   ' : 'FALLO'} ${texto}`); if (!bien) fallos++; };
    for (const formato of formatos) {
      for (const [cuando, ms, velocidad, fundido, negra, sufijo, conSonido] of momentos) {
        const ruta = join(carpeta, `${nombre}-${formato}-grabar-${sufijo}.png`);
        const r = ejecutarChrome(chrome, argsChrome(formato, ms, '--dump-dom', `--screenshot=${ruta}`, urlDeCaptura({ base, archivo: a.archivo, formato, partida, vel: velocidad, voz: a.voz, grabar: true, sonido: conSonido })));
        const visto = leerFundido(r.salida);
        informar(visto?.fundido === fundido, `${formato} ${cuando}: ${visto?.fundido ?? 'sin modo grabar'} (esperado ${fundido})`);
        if (fundido === 'negro' && !visto?.cerrada) { console.error(`  ERROR en ${formato}: la pagina no marco el cierre (data-cierre)`); fallos++; }
        const png = existsSync(ruta) ? readFileSync(ruta) : null, esNegra = png !== null && pngEsNegro(png);
        informar(png !== null && esNegra === negra, `${formato} ${cuando}: la captura ${png === null ? 'no se pudo tomar' : esNegra ? 'es toda negra' : 'tiene contenido'} (esperado ${negra ? 'toda negra' : 'con contenido'})`);
        revisar(`${formato} (grabar ${cuando})`, r.consola);
      }
    }
  } else if (a.estado) {
    for (const formato of formatos) {
      for (const beat of linea.beatsDeEstado(beats, Number(a.manos ?? 6))) {
        const r = ejecutarChrome(chrome, argsChrome(formato, 10000, '--dump-dom', urlDeCaptura({ base, archivo: a.archivo, formato, beat, partida })));
        const errores = linea.erroresDeEstado(leerEstado(r.salida), beats[beat]);
        console.log(`  ${errores.length ? 'FALLO' : 'ok   '} ${formato} ${beats[beat].id}`);
        for (const e of errores) console.error(`  ERROR: ${e}`);
        fallos += errores.length;
        revisar(`${formato} estado ${beat}`, r.consola);
      }
    }
  } else {
    // con --gancho se capturan las tarjetas del gancho y el primer momento de cada corte
    const claves = (lista) => lista.flatMap((b, i) => (b.tipo === 'tarjeta-gancho' || (b.corte !== undefined && lista[i - 1]?.corte !== b.corte) ? [i] : []));
    const lista = a.beats && a.beats !== 'auto' ? a.beats.split(',').map(Number) : gancho ? claves(beatsDeCaptura) : beatsClave(beats);
    for (const formato of formatos) {
      for (const beat of lista) {
        const archivo = join(carpeta, `${nombre}-${formato}-${gancho ? 'gancho-' : ''}beat${String(beat).padStart(3, '0')}-${beatsDeCaptura[beat]?.tipo ?? 'x'}.png`);
        const r = ejecutarChrome(chrome, argsChrome(formato, 10000, `--screenshot=${archivo}`, urlDeCaptura({ base, archivo: a.archivo, formato, beat, partida, gancho })));
        const hecho = existsSync(archivo) && statSync(archivo).size > 5000;
        console.log(`  ${hecho ? 'ok ' : 'FALLO'} ${archivo}`);
        if (!hecho) fallos++;
        revisar(`${formato} beat ${beat}`, r.consola);
      }
    }
  }
  console.log(fallos ? `\n  ${fallos} problema(s).\n` : '\n  Sin errores de consola.\n');
  process.exit(fallos ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
