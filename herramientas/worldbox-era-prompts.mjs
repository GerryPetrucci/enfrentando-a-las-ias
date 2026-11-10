#!/usr/bin/env node
// Genera los textos que PEGAS A MANO en el chat de cada modelo (formato «era»). Sin juego, sin API, sin token.
//
//   node herramientas/worldbox-era-prompts.mjs                         escribe en respuestas-era/prompts/ :
//        1-borrador-completo.txt   UN solo mensaje (sistema + las 3 etapas) -> la respuesta trae etapa1, etapa2 y etapa3   [recomendado]
//        2-solo-etapa1.txt         sistema + solo la etapa 1 (si prefieres ir etapa por etapa en el mismo chat)
//        sistema.txt               el texto de sistema solo
//        manifiesto.json           hashes, versiones, tokens estimados (la partida lo compara con lo que de verdad usa)
//   node herramientas/worldbox-era-prompts.mjs --etapa=2 --participante=a --respuestas=mi-carpeta
//        mensaje de la etapa 2 (o 3) con las elecciones YA hechas por ese modelo (salen de a/etapa1.txt...), para el modo por etapas
//
// Opciones: --salida=carpeta  y el calendario de la partida si lo cambias (--anio-muro, --intervenciones, ...): el texto de sistema depende de
// ellos, así que usa los MISMOS valores al generar los prompts y al jugar (la partida avisa si el hash difiere del manifiesto).
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { cargarAlmacen, accesoRespuestas } from '../src/worldbox/era/respuestas/almacen.js';
import { evaluarTexto } from '../src/worldbox/era/respuestas/verificar.js';
import { generarPrompts, mensajeDeEtapa } from '../src/worldbox/era/respuestas/prompts.js';
import { partidaDesdeCli } from '../src/worldbox/era/correr-era.js';
import { leerArgumentos } from './worldbox-era-verificar.mjs';

export async function main(args = process.argv.slice(2), salidaTexto = t => console.log(t)) {
  const o = leerArgumentos(args);
  const partida = partidaDesdeCli({ ...o, salida: undefined, etapa: undefined, participante: undefined, respuestas: undefined });
  const carpeta = resolve(o.salida ?? 'respuestas-era/prompts');
  if (o.etapa !== undefined) {
    const etapa = Number(o.etapa), letra = String(o.participante ?? '').toLowerCase();
    if (![2, 3].includes(etapa) || !['a', 'b'].includes(letra) || !o.respuestas) { salidaTexto('Uso: --etapa=2|3 --participante=a|b --respuestas=<carpeta con a/ y b/>  (genera el mensaje con las elecciones que ese modelo ya hizo)'); return 2; }
    const almacen = await cargarAlmacen(resolve(o.respuestas)), acceso = accesoRespuestas(almacen, letra === 'a' ? 'f1' : 'f2');
    const previas = { rasgos: {} };
    for (let e = 1; e < etapa; e++) {
      const r = acceso.obtener(`etapa${e}`, 0);
      if (!r) { salidaTexto(`Falta ${letra}/etapa${e}.txt: guarda primero la respuesta de la etapa ${e}.`); return 1; }
      const v = evaluarTexto(`etapa${e}`, r.texto, { previos: Object.values(previas.rasgos), maxFuertes: partida.maxFuertes });
      if (!v.validacion.ok) { salidaTexto(`La etapa ${e} de ${letra.toUpperCase()} es inválida:\n${v.validacion.errores.map(x => `- ${x.mensaje}`).join('\n')}`); return 1; }
      if (e === 1) Object.assign(previas, v.validacion.eleccion); else Object.assign(previas.rasgos, v.validacion.eleccion.rasgos);
    }
    const texto = mensajeDeEtapa(partida, etapa, previas);
    await mkdir(carpeta, { recursive: true });
    const archivo = join(carpeta, `2-etapa${etapa}-${letra}.txt`);
    await writeFile(archivo, texto, 'utf8');
    salidaTexto(`Escrito: ${archivo}\nPégalo en el MISMO chat donde ya enviaste la etapa ${etapa - 1}; guarda la respuesta en ${letra}/etapa${etapa}.txt`);
    return 0;
  }
  const { archivos, manifiesto } = generarPrompts({ partida });
  await mkdir(carpeta, { recursive: true });
  for (const [nombre, texto] of Object.entries(archivos)) await writeFile(join(carpeta, nombre), texto, 'utf8');
  await writeFile(join(carpeta, 'manifiesto.json'), JSON.stringify(manifiesto, null, 2) + '\n', 'utf8');
  salidaTexto([`Prompts escritos en ${carpeta}`, ...Object.entries(manifiesto.archivos).map(([n, a]) => `  ${n.padEnd(26)} ${String(a.caracteres).padStart(7)} caracteres  ~${a.tokens_estimados} tokens (estimado)`),
    '', 'Recomendado: abre un chat NUEVO con cada modelo, pega el contenido COMPLETO de 1-borrador-completo.txt y guarda su respuesta tal cual en:',
    '  <tu carpeta>/a/borrador.txt   (modelo A)   y   <tu carpeta>/b/borrador.txt   (modelo B)',
    'Luego: node herramientas/worldbox-era-verificar.mjs --respuestas=<tu carpeta>'].join('\n'));
  return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(c => { process.exitCode = c; }).catch(e => { console.error(`worldbox-era-prompts: ${e.message}`); process.exitCode = 2; });
}
