#!/usr/bin/env node
// Deja en una carpeta TODO lo necesario para publicar una partida guardada: un LEEME con que grabar (direccion exacta de cada pieza, duracion, nombre del archivo y la lista de revision) y un
// texto por pieza y por red (TikTok, Instagram, YouTube y X, mas el comentario fijado). Las piezas son las dos partes y hasta 3 clips destacados; los textos salen de web/casino/paquete-textos.js
// (solo hechos de la partida, nunca privados ni razones). No llama a ningun modelo, no sube nada y no gasta saldo.
//
//   node herramientas/paquete.mjs --archivo=pruebas/NOMBRE.json [--partida=1] [--voz=RUTA/voz.json | --sinvoz] [--salida=grabaciones/paquetes] [--enlace=URL] [--formato=9x16] [--forzar]
//
// La voz: si ya corriste herramientas/narrar.mjs para esa partida, se usa sola (la ruta que ese programa deja en data/voz/); --voz la indica a mano y --sinvoz no usa ninguna.
// Escribe `<salida>/<NOMBRE>-p<N>/` (LEEME.md y textos/). Si la carpeta ya existe se niega, a menos que pases --forzar (que vuelve a escribir los archivos del paquete; lo que sobre de una corrida anterior se queda). `grabaciones/` no se versiona.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { armarLinea, destacadasDe, motivoDeNoReproducible } from '../web/casino/lineas.js';
import { construirPaquete } from '../web/casino/paquete-textos.js';
import { formatoDeTiempo } from './partes.mjs';
import { carpetaDeVoz } from './narrar.mjs';

const ENLACE_DEL_SITIO = 'https://gerrypetrucci.github.io/enfrentando-a-las-ias/';
const SERVIDOR = 'http://localhost:4321';
const REDES = ['tiktok', 'instagram', 'x', 'youtube'];
const LIMITE_X_MS = 140000; // lo que admite X con una cuenta gratis (por verificar en la pantalla de X)

// El LEEME de una carpeta de paquete: pasos numerados y precisos. `contexto`: { archivo, partidaNumero, enlace, nombreBase }.
export function leemeDe(paquete, contexto = {}) {
  const base = contexto.nombreBase ?? 'paquete';
  const nombreJuego = paquete.piezas[0]?.titulo.split(' · ')[0] ?? paquete.juego ?? 'juego';
  const piezas = paquete.piezas.map((p) => [
    `### ${p.id} · ${p.titulo}`,
    `- Dirección para abrir y grabar: ${SERVIDOR}/${p.grabar.url}`,
    `- Dura: ${formatoDeTiempo(p.grabar.ms)} (la escena termina sola; detén la grabación 2 segundos después de que acabe).`,
    `- Guarda el video como: ${base}-${p.id}.mp4`,
    `- Nota: ${p.grabar.nota}`,
    ...(p.grabar.ms > LIMITE_X_MS ? [`- ⚠ Dura más de ${formatoDeTiempo(LIMITE_X_MS)}: no cabe en X con una cuenta gratis (en X sube un clip en su lugar).`] : []),
    `- Textos: textos/${p.id}-tiktok.txt, textos/${p.id}-instagram.txt, textos/${p.id}-youtube.txt, textos/${p.id}-x.txt${p.comentarioFijado ? `, textos/${p.id}-comentario.txt` : ''}`,
    '',
  ].join('\n'));
  return [
    `# Paquete de publicación · ${nombreJuego} · partida ${contexto.partidaNumero ?? 1}`,
    '',
    `Partida: data/${contexto.archivo ?? '?'} · generado el ${new Date().toISOString().slice(0, 10)}. Esta carpeta se puede borrar y volver a generar con \`node herramientas/paquete.mjs\` (con --forzar).`,
    '',
    ...(paquete.advertencias.length ? ['## Avisos antes de empezar', ...paquete.advertencias.map((a) => `- ${a}`), ''] : []),
    '## Paso 0 · Antes de grabar',
    `1. En una terminal, en la carpeta del proyecto, corre \`node src/servidor.js\` y déjala abierta mientras grabas (es lo que sirve las direcciones ${SERVIDOR}/...).`,
    '2. Si es la primera vez que grabas, configura OBS siguiendo la sección «Configurar OBS» de privado/contenido/guia-paso-a-paso.md (fuente Navegador de 1080 × 1920).',
    '',
    `## Paso 1 · Grabar las ${paquete.piezas.length} piezas`,
    'Para cada pieza: (a) pon su dirección en la fuente Navegador de OBS; (b) pulsa «Iniciar grabación»; (c) en las propiedades de la fuente pulsa «Actualizar caché de la página actual» (la escena arranca sola al cargar); (d) cuando termine, espera 2 segundos y pulsa «Detener grabación»; (e) renombra el archivo como se indica.',
    '',
    ...piezas,
    '## Paso 2 · Revisar cada video (no publiques ninguno sin marcar todo)',
    '- [ ] Los primeros 3 segundos: la parte 1 abre con la tarjeta de arranque (se lee entera); un clip arranca directo en la jugada.',
    '- [ ] Se lee bien en una pantalla pequeña (míralo en tu teléfono) y el texto no se corta.',
    '- [ ] Revisé a mano los mensajes y las razones de las IAs de esta partida. Si algo es ofensivo o raro, elegí otra partida y anoté por qué.',
    '- [ ] La etiqueta «Contenido generado por IA» se ve en el video.',
    '- [ ] No lleva marca de agua de otra app ni música con derechos: es el archivo limpio que grabó OBS.',
    '',
    '## Paso 3 · Poner el gancho, publicar y fijar el comentario',
    '1. Abre cada archivo de `textos/` y sustituye la línea `[GANCHO: ...]` por una frase tuya (o deja la sugerida si te convence, quitando los corchetes y la palabra GANCHO). **Nunca publiques un texto que todavía contenga «[GANCHO».**',
    '2. TikTok, Reels y Shorts reciben el mismo archivo de video; el texto de cada red está en su archivo. Marca la opción de «contenido generado con IA» de cada red.',
    `3. X: el post lleva el video y el texto de \`-x.txt\` (sin enlace). Publica luego, como respuesta a tu propio post, el enlace al marcador: ${contexto.enlace || ENLACE_DEL_SITIO}`,
    '4. Después de publicar una parte, publica y fija el comentario de su archivo `-comentario.txt` (los clips no llevan).',
    '5. Responde los comentarios de la primera hora.',
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
  escribir(join(carpeta, 'LEEME.md'), leemeDe(paquete, { ...contexto, nombreBase: basename(carpeta) }));
  for (const p of paquete.piezas) {
    for (const red of REDES) escribir(join(textos, `${p.id}-${red}.txt`), red === 'youtube' ? formatoYoutube(p.textos.youtube) : `${p.textos[red]}\n`);
    if (p.comentarioFijado) escribir(join(textos, `${p.id}-comentario.txt`), `${p.comentarioFijado}\n`);
  }
  return escritos;
}

async function principal() {
  const a = Object.fromEntries(process.argv.slice(2).map((x) => { const [k, ...v] = x.replace(/^--/, '').split('='); return [k, v.length ? v.join('=') : 'true']; }));
  const salir = (m) => { console.error(m); process.exit(1); };
  if (!a.archivo) salir('Falta --archivo=NOMBRE.json (una partida guardada en data/, por ejemplo pruebas/NOMBRE.json).');
  if (String(a.salida ?? '').split(/[\\/]/).includes('..')) salir('La salida no puede contener «..»: indica una carpeta dentro del proyecto, por ejemplo --salida=grabaciones/paquetes.');
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

  const beats = await armarLinea(juegoId, partida), destacadas = await destacadasDe(juegoId, partida, 10);
  const enlace = a.enlace ?? ENLACE_DEL_SITIO;
  const paquete = construirPaquete({ partida, beats, destacadas, archivo: a.archivo, partidaNumero: numero, voz, rutaVoz, formato: a.formato ?? '9x16', enlace, totalPartidas: datos.partidas.length });
  if (!paquete.piezas.length) salir(`No se puede publicar esta partida: ${paquete.advertencias.join(' ')}`);

  const nombreBase = `${basename(a.archivo).replace(/[^\w.-]+/g, '_').replace(/\.json$/, '')}-p${numero}`;
  const carpeta = join(resolve(a.salida ?? 'grabaciones/paquetes'), nombreBase);
  if (existsSync(carpeta) && !a.forzar) salir(`La carpeta ${carpeta} ya existe: usa --forzar para reescribirla (se pierden los cambios que hayas hecho en ella).`);
  escribirPaquete(paquete, carpeta, { archivo: a.archivo, partidaNumero: numero, enlace });
  console.log(`Paquete de ${paquete.piezas[0].titulo.split(' · ')[0]} listo en ${carpeta}`);
  for (const p of paquete.piezas) console.log(`  ${p.id.padEnd(8)} ${formatoDeTiempo(p.grabar.ms)}  ${p.titulo}`);
  for (const adv of paquete.advertencias) console.log(`  AVISO: ${adv}`);
  console.log('Empieza por LEEME.md.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
