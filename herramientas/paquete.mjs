#!/usr/bin/env node
// Deja en una carpeta TODO lo necesario para publicar una partida guardada: un LEEME con que grabar (direccion exacta de cada pieza, duracion, nombre del archivo y la lista de revision) y un
// texto por pieza y por red (TikTok, Instagram, Facebook, YouTube y X, mas el comentario fijado). Las piezas son las dos partes y hasta 3 clips destacados; los textos salen de web/casino/paquete-textos.js
// (solo hechos de la partida, nunca privados ni razones). No llama a ningun modelo, no sube nada y no gasta saldo.
//
//   node herramientas/paquete.mjs --archivo=pruebas/NOMBRE.json [--partida=1] [--voz=RUTA/voz.json | --sinvoz] [--salida=CARPETA_DE_LA_SERIE] [--juego=N] [--enlace=URL] [--formato=hoja|9x16|16x9] [--forzar]
//
// La carpeta de la serie (--salida) por omision es grabaciones/listos/<juego>/<AAAA-MM-DD>_seed-<seed>/ (herramientas/nombres.mjs): ahi nacen sus subcarpetas de estado (originales, por-subir, subidos,
// revision) y el paquete de la partida queda en `paquete-j<N>/`. Los videos se nombran j1_pt1_9x16_fb-ig-tk-yt.mp4 (numero de juego, pieza, formato y redes).
// El numero de juego jN sube de uno en uno en cada partida que se empaqueta en la carpeta del juego (aunque sea de otra serie); regenerar una partida con --forzar conserva el suyo (paquete.json) y --juego=N lo fija a mano.
// El formato por omision es `hoja`: la hoja maestra de 3840 x 2160 que graba el OBS del proyecto (el vertical y el horizontal juntos; despues se recorta con herramientas/recortar-formatos.mjs).
// Todas las direcciones llevan grabar=1: la pagina arranca en negro, se aclara, cuenta la pieza, vuelve a negro y se queda en negro (margenes para empezar y detener la grabacion).
//
// La voz: si ya corriste herramientas/narrar.mjs para esa partida, se usa sola (la ruta que ese programa deja en data/voz/); --voz la indica a mano y --sinvoz no usa ninguna.
// Escribe `<serie>/paquete-j<N>/` (LEEME.md, paquete.json y textos/). Si la carpeta ya existe se niega, a menos que pases --forzar (que vuelve a escribir los archivos del paquete; lo que sobre de una corrida anterior se queda). `grabaciones/` no se versiona.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, relative, isAbsolute, basename, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { armarLinea, destacadasDe, motivoDeNoReproducible } from '../web/casino/lineas.js';
import { construirPaquete } from '../web/casino/paquete-textos.js';
import { FUNDIDOS, segundos } from '../web/casino/escena-config.js';
import { formatoDeTiempo } from './partes.mjs';
import { carpetaDeVoz } from './narrar.mjs';
import { FORMATOS } from './formatos.mjs';
import { REDES, SUBCARPETAS, fechaDe, nombreDePieza, nombreDeVideo, carpetaDeSerie, juegoDeCarpeta, elegirJuego } from './nombres.mjs';

const ENLACE_DEL_SITIO = 'https://gerrypetrucci.github.io/enfrentando-a-las-ias/';
const SERVIDOR = 'http://localhost:4321';
const REDES_DE_TEXTO = ['tiktok', 'instagram', 'facebook', 'x', 'youtube'];
const LIMITE_X_MS = 140000; // lo que admite X con una cuenta gratis (por verificar en la pantalla de X)

// Los paquetes (paquete-jN) que ya hay en una serie: [{ serie, juego, partida }]; la partida sale de su paquete.json.
export function paquetesDeSerie(rutaSerie) {
  const serie = resolve(rutaSerie);
  if (!existsSync(serie)) return [];
  const salida = [];
  for (const d of readdirSync(serie, { withFileTypes: true })) {
    const juego = d.isDirectory() ? juegoDeCarpeta(d.name) : null;
    if (juego === null) continue;
    let partida = null;
    // el JSON se lee sin BOM (PowerShell 5 y algunos editores lo agregan)
    try { partida = JSON.parse(readFileSync(join(serie, d.name, 'paquete.json'), 'utf8').replace(String.fromCharCode(0xFEFF), '')).partida ?? null; } catch { /* un paquete sin paquete.json cuenta para la numeracion pero no se reconoce por partida */ }
    salida.push({ serie, juego, partida });
  }
  return salida;
}

// Los de todas las series de la carpeta de un juego (grabaciones/listos/<juego>/): de ahi sale la cuenta de numeros de juego.
export function paquetesDelJuego(rutaJuego) {
  const raiz = resolve(rutaJuego);
  if (!existsSync(raiz)) return [];
  return readdirSync(raiz, { withFileTypes: true }).filter((d) => d.isDirectory()).flatMap((d) => paquetesDeSerie(join(raiz, d.name)));
}

// El LEEME de una carpeta de paquete: pasos numerados y precisos. `contexto`: { archivo, partidaNumero, juegoNumero, enlace, carpetaSerie }
// (juegoNumero: el jN del juego, que da el nombre de los videos; carpetaSerie: la carpeta de la serie tal como se muestra en los comandos, con barras normales).
export function leemeDe(paquete, contexto = {}) {
  const juegoNumero = contexto.juegoNumero ?? contexto.partidaNumero ?? 1, serie = contexto.carpetaSerie ?? 'grabaciones/listos';
  const nombreJuego = paquete.piezas[0]?.titulo.split(' · ')[0] ?? paquete.juego ?? 'juego';
  const { margenMs, colaMs } = paquete.piezas[0]?.grabar.plan ?? FUNDIDOS; // los margenes que se le piden a quien graba: los del plan de las piezas (que salen de FUNDIDOS)
  const piezas = paquete.piezas.map((p) => {
    const base = nombreDePieza({ juego: juegoNumero, pieza: p.id });
    return [
      `### ${p.id} · ${p.titulo}`,
      `- Dirección para abrir y grabar: ${SERVIDOR}/${p.grabar.url}`,
      `- Dura: ${formatoDeTiempo(p.grabar.ms)} de pieza; la grabación completa dura ${formatoDeTiempo(p.grabar.plan.totalMs)} contando ${segundos(p.grabar.plan.margenMs)} s de negro al empezar, los dos fundidos y ${segundos(p.grabar.plan.colaMs)} s de negro al final. Detén la grabación con la pantalla en negro, al menos ${segundos(p.grabar.plan.colaMs)} s después del fundido final (la página se queda negra: no hay prisa).`,
      `- Guarda la grabación (OBS graba la hoja en MKV): renómbrala ${base}.mkv y muévela a ${serie}/originales/`,
      `- Recórtala (quita el negro sobrante, deja los fundidos y saca el 9:16 y el 16:9): node herramientas/recortar-formatos.mjs "${serie}/originales/${base}.mkv" ${base} --carpeta=${serie}/por-subir`,
      `- Quedan en ${serie}/por-subir/ (el nombre dice el formato y las redes a las que sirve):`,
      ...Object.entries(FORMATOS).map(([k, f]) => `  - ${nombreDeVideo(base, k)}.mp4 → ${f.redes.map((r) => REDES[r]).join(', ')}`),
      `- Nota: ${p.grabar.nota}`,
      ...(p.grabar.ms > LIMITE_X_MS ? [`- ⚠ Dura más de ${formatoDeTiempo(LIMITE_X_MS)}: no cabe en X con una cuenta gratis (en X sube un clip en su lugar).`] : []),
      `- Textos: ${REDES_DE_TEXTO.map((red) => `textos/${p.id}-${red}.txt`).join(', ')}${p.comentarioFijado ? `, textos/${p.id}-comentario.txt` : ''}`,
      '',
    ].join('\n');
  });
  return [
    `# Paquete de publicación · ${nombreJuego} · partida ${contexto.partidaNumero ?? 1} · juego j${juegoNumero}`,
    '',
    `Partida: data/${contexto.archivo ?? '?'} · generado el ${new Date().toISOString().slice(0, 10)}. Esta carpeta se puede borrar y volver a generar con \`node herramientas/paquete.mjs\` (con --forzar).`,
    '',
    ...(paquete.advertencias.length ? ['## Avisos antes de empezar', ...paquete.advertencias.map((a) => `- ${a}`), ''] : []),
    '## Paso 0 · Antes de grabar',
    `1. En una terminal, en la carpeta del proyecto, corre \`node src/servidor.js\` y déjala abierta mientras grabas (es lo que sirve las direcciones ${SERVIDOR}/...).`,
    '2. OBS ya debe estar en el perfil «Enfrentando-Hoja4K»: la hoja maestra de 3840 × 2160 a 30 fps, con una fuente de navegador de 3840 × 2160 (sin «Archivo local») que tenga marcado «Controlar audio mediante OBS». Si algo no coincide, mira el paso 0.1 de privado/contenido/guia-paso-a-paso.md.',
    '',
    `## Paso 1 · Grabar las ${paquete.piezas.length} piezas`,
    'Para cada pieza: (a) pon su dirección en la *URL* de la fuente de navegador de OBS (la página arranca sola al cargar y termina en negro: no pasa nada si se reproduce una vez antes de grabar); (b) pulsa «Iniciar grabación»; (c) en las propiedades de la fuente pulsa «Actualizar caché de la página actual»: la pantalla se queda en negro ' + segundos(margenMs) + ' segundos, se aclara y empieza la pieza; (d) al terminar verás un fundido a negro: espera a ver la pantalla en negro al menos ' + segundos(colaMs) + ' segundos (la página se queda negra: no hay prisa; el recorte necesita ese negro para encontrar el final) y entonces detén la grabación; (e) renombra el `.mkv` que dejó OBS como se indica y muévelo a `originales/`; (f) recórtalo con el comando de la pieza (necesita ffmpeg; si no encuentra el negro de los márgenes, no recorta ese lado y lo dice).',
    '',
    ...piezas,
    '## Paso 2 · Revisar cada video (no publiques ninguno sin marcar todo)',
    '- [ ] Los primeros 3 segundos: la parte 1 abre con la tarjeta de arranque (se lee entera); un clip arranca directo en la jugada; un gancho abre con la tarjeta «Próximamente».',
    '- [ ] Un gancho no adelanta el resultado ni lleva el último turno, y su voz solo dice el cierre (los cortes no se narran): le pones tu música (que no tenga derechos) al subirlo.',
    '- [ ] Se lee bien en una pantalla pequeña (míralo en tu teléfono) y el texto no se corta.',
    '- [ ] Revisé a mano los mensajes y las razones de las IAs de esta partida. Si algo es ofensivo o raro, elegí otra partida y anoté por qué.',
    '- [ ] La etiqueta «Contenido generado por IA» se ve en el video.',
    '- [ ] No lleva marca de agua de otra app ni música con derechos: es el archivo limpio que grabó OBS. Revisa el `_9x16` de `por-subir/` (el de TikTok, Reels y Shorts): arranca dentro del fundido y termina en negro, sin segundos de negro de sobra.',
    '',
    '## Paso 3 · Poner el gancho, publicar y fijar el comentario',
    '0. Orden de subida: primero el gancho (hk), luego la parte (pt) y al final los clips (clp). El gancho de una parte va antes que esa parte.',
    '1. Abre cada archivo de `textos/` y sustituye la línea `[GANCHO: ...]` por una frase tuya (o deja la sugerida si te convence, quitando los corchetes y la palabra GANCHO). **Nunca publiques un texto que todavía contenga «[GANCHO».**',
    '2. Cada red recibe el archivo cuyo nombre la lleva (las siglas del final: fb Facebook, ig Instagram, tk TikTok, x X, yt YouTube); el texto de cada red está en su archivo. Marca la opción de «contenido generado con IA» de cada red.',
    `3. X: el post lleva el video y el texto de \`-x.txt\` (sin enlace). Publica luego, como respuesta a tu propio post, el enlace al marcador: ${contexto.enlace || ENLACE_DEL_SITIO}`,
    '4. Después de publicar una parte, publica y fija el comentario de su archivo `-comentario.txt` (los clips no llevan).',
    '5. Responde los comentarios de la primera hora.',
    '6. Cuando un archivo ya esté en todas las redes de su nombre, muévelo de `por-subir/` a `subidos/` (o avísame y lo muevo yo).',
    '',
    'El orden y los días de publicación están en privado/contenido/estrategia-de-publicacion.md.',
    '',
  ].join('\n');
}

const formatoYoutube = (y) => `TÍTULO\n${y.titulo}\n\nDESCRIPCIÓN\n${y.descripcion}\n`;

// Escribe la carpeta (LEEME.md y textos/) y devuelve la lista de archivos escritos.
export function escribirPaquete(paquete, carpeta, contexto = {}) {
  const textos = join(carpeta, 'textos'), escritos = [];
  mkdirSync(textos, { recursive: true });
  const escribir = (ruta, contenido) => { writeFileSync(ruta, contenido, 'utf8'); escritos.push(ruta); };
  escribir(join(carpeta, 'LEEME.md'), leemeDe(paquete, contexto));
  // a que partida pertenece este jN: si se regenera el paquete, la partida conserva su numero (paquetesDeSerie lo lee)
  escribir(join(carpeta, 'paquete.json'), `${JSON.stringify({ juego: contexto.juegoNumero, partida: contexto.partidaNumero, archivo: contexto.archivo })}\n`);
  for (const p of paquete.piezas) {
    for (const red of REDES_DE_TEXTO) escribir(join(textos, `${p.id}-${red}.txt`), red === 'youtube' ? formatoYoutube(p.textos.youtube) : `${p.textos[red]}\n`);
    if (p.comentarioFijado) escribir(join(textos, `${p.id}-comentario.txt`), `${p.comentarioFijado}\n`);
  }
  return escritos;
}

async function principal() {
  const a = Object.fromEntries(process.argv.slice(2).map((x) => { const [k, ...v] = x.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : 'true']; }));
  const salir = (m) => { console.error(m); process.exit(1); };
  if (!a.archivo) salir('Falta --archivo=NOMBRE.json (una partida guardada en data/, por ejemplo pruebas/NOMBRE.json).');
  if (String(a.salida ?? '').split(/[\\/]/).includes('..')) salir('La salida no puede contener «..»: indica una carpeta dentro del proyecto, por ejemplo --salida=grabaciones/listos/guerra-de-territorios/2026-10-19_seed-552912962.');
  const numero = Number(a.partida ?? 1);
  let datos;
  try { datos = JSON.parse(readFileSync(resolve('data', a.archivo), 'utf8')); } catch (e) { salir(`No pude leer ${a.archivo}: ${e.message}`); }
  const partida = datos.partidas?.[numero - 1];
  if (!partida) salir(`El archivo no tiene la partida ${numero}.`);
  const juegoId = partida.juego?.id ?? datos.juego?.id;
  const motivo = motivoDeNoReproducible(juegoId, partida);
  if (motivo) salir(`La partida ${numero} no se puede empaquetar: ${motivo}.`);
  // la voz: la que pasas con --voz o, si no, la que narrar.mjs dejo para esta partida (sin escribir su ruta); --sinvoz no usa ninguna
  let rutaVoz = a.sinvoz ? null : a.voz ?? null, voz = null;
  if (!rutaVoz && !a.sinvoz) {
    const candidata = `${carpetaDeVoz(a.archivo, numero)}/voz.json`;
    if (existsSync(resolve(candidata))) { rutaVoz = candidata; console.log(`Usando la voz que encontré para esta partida: ${candidata} (con --sinvoz no se usa).`); }
  }
  if (rutaVoz) { try { voz = JSON.parse(readFileSync(resolve(rutaVoz), 'utf8')); } catch (e) { salir(`No pude leer la voz ${rutaVoz}: ${e.message}`); } }

  const beats = await armarLinea(juegoId, partida), destacadas = await destacadasDe(juegoId, partida, 40); // los clips toman las mejores; los ganchos buscan momentos en cada parte
  const enlace = a.enlace ?? `${ENLACE_DEL_SITIO}?seed=${partida.seed}`; // el sitio busca por seed: el enlace lleva a la serie de este video
  const paquete = construirPaquete({ partida, beats, destacadas, archivo: a.archivo, partidaNumero: numero, voz, rutaVoz, formato: a.formato ?? 'hoja', enlace, totalPartidas: datos.partidas.length });
  if (!paquete.piezas.length) salir(`No se puede publicar esta partida: ${paquete.advertencias.join(' ')}`);

  // la carpeta de la serie (por omision grabaciones/listos/<juego>/<fecha>_seed-<seed>) y, dentro, el paquete de esta partida
  const fecha = fechaDe(basename(a.archivo), datos.fecha);
  const rutaSerie = a.salida ?? carpetaDeSerie({ juego: partida.juego?.nombre ?? datos.juego?.nombre, fecha, seed: datos.seedBase ?? partida.seed });
  const serie = resolve(rutaSerie);
  // el numero de juego (jN): el que ya tiene esta partida, o el siguiente de la carpeta del juego (con --salida solo cuenta esa serie); --juego=N lo fija a mano
  const pedido = a.juego === undefined ? null : Number(a.juego);
  if (pedido !== null && !(Number.isInteger(pedido) && pedido >= 1)) salir('--juego=N pide un entero de 1 en adelante.');
  const existentes = a.salida ? paquetesDeSerie(serie) : paquetesDelJuego(dirname(serie));
  const juegoNumero = pedido ?? elegirJuego({ existentes, serie, partida: numero });
  const carpeta = join(serie, `paquete-j${juegoNumero}`);
  if (existsSync(carpeta) && !a.forzar) salir(`La carpeta ${carpeta} ya existe: usa --forzar para reescribirla (se pierden los cambios que hayas hecho en ella).`);
  for (const sub of SUBCARPETAS) mkdirSync(join(serie, sub), { recursive: true });
  const relativa = relative(process.cwd(), serie).replaceAll('\\', '/'); // en los comandos del LEEME: relativa al proyecto si cae dentro de el
  escribirPaquete(paquete, carpeta, { archivo: a.archivo, partidaNumero: numero, juegoNumero, enlace, fecha, carpetaSerie: relativa.startsWith('..') || isAbsolute(relativa) ? serie.replaceAll('\\', '/') : relativa });
  console.log(`Paquete de ${paquete.piezas[0].titulo.split(' · ')[0]} listo en ${carpeta}`);
  for (const p of paquete.piezas) console.log(`  ${p.id.padEnd(8)} ${formatoDeTiempo(p.grabar.ms)}  ${p.titulo}`);
  for (const adv of paquete.advertencias) console.log(`  AVISO: ${adv}`);
  console.log('Empieza por LEEME.md.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
