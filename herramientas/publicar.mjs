#!/usr/bin/env node
// Registra que se subio una parte de un video y deja listo lo que se publica en el sitio (politica del usuario, 19 de octubre de 2026):
//   - si la parte es la FINAL de la partida (llega a su ultimo turno): se publica su resultado completo;
//   - si no: la serie queda «por publicarse», con su seed y los fragmentos de la conversacion y los prompts hasta el turno que cubre la parte.
//
//   node herramientas/publicar.mjs --archivo=NOMBRE.json --partida=1 --hasta=8 [--parte=1] [--final=si|no] [--fecha=AAAA-MM-DD] [--forzar]
//
// --archivo   la serie completa en data/ (no se publica tal cual: sale un archivo nuevo en data/publicas/)    --hasta   el ultimo turno que cubre la parte (el `hasta=` de su direccion en el LEEME)
// --final     por omision se detecta (la parte llega al ultimo turno de la partida); con si/no se afirma y, si no cuadra con lo guardado, se niega
// Escribe data/publicas/NOMBRE.json y data/publicas/registro.json, respalda el completo en privado/datos-oficiales/ y regenera web/marcador.json. NO hace commit ni push.

import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parsearArgumentos } from '../src/serie.js';
import { publicarParte } from '../src/publicar.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const salir = (m) => { console.error(`\n  ${m}\n`); process.exit(1); };

function principal() {
  const o = parsearArgumentos(process.argv.slice(2));
  const num = (x) => (x === undefined || x === true ? undefined : Number(x));
  if (typeof o.archivo !== 'string' || o.partida === undefined || o.hasta === undefined) {
    salir('Uso: node herramientas/publicar.mjs --archivo=NOMBRE.json --partida=1 --hasta=8 [--parte=1] [--final=si|no] [--fecha=AAAA-MM-DD] [--forzar]');
  }
  const final = o.final === undefined ? null : o.final === true || ['si', 'sí', 'true', '1'].includes(String(o.final).toLowerCase());
  let r;
  try {
    r = publicarParte({ raiz: typeof o.raiz === 'string' ? resolve(o.raiz) : RAIZ, archivo: o.archivo, partida: num(o.partida), parte: num(o.parte) ?? null, hasta: num(o.hasta), final, fecha: typeof o.fecha === 'string' ? o.fecha : undefined, forzar: o.forzar === true });
  } catch (err) {
    salir(err.message);
  }
  console.log(`\n  Serie ${r.etiqueta} · partida ${r.partida} · parte ${r.parte} (hasta el turno ${r.hasta})${r.detectada ? ' · se detecto' : ''}`);
  console.log(r.final
    ? `  Es la parte FINAL: la partida ${r.partida} queda PUBLICADA con su resultado.`
    : `  No es la parte final: la partida ${r.partida} queda POR PUBLICARSE (seed ${r.seed}), con los fragmentos y los prompts hasta el turno ${r.hasta}.`);
  console.log(`  La serie entera queda: ${r.publicadaEntera ? 'PUBLICADA (con su evaluacion)' : 'por publicarse (le faltan partidas por publicar)'}.`);
  console.log(`  Archivos: ${r.archivoPublico}, data/publicas/registro.json, web/marcador.json${r.respaldo ? ' y el respaldo en privado/datos-oficiales/' : ' (sin respaldo: no hay carpeta privado/)'}`);
  for (const a of r.avisos) console.log(`  AVISO: ${a}`);
  console.log('  Siguiente: git add data/publicas web/marcador.json, commit y push (CLAUDE.md, «Publicacion de resultados»).\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
