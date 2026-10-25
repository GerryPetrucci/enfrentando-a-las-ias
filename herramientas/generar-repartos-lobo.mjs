// Catálogo público derivado del motor, nunca del reparto secreto de una partida.
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { CONFIGURACIONES } from '../src/juegos/lobo/constantes.js';
import { crearEstado } from '../src/juegos/lobo/estado.js';
import { crearRng } from '../src/rng.js';
export function repartosPublicos() {
  return Object.fromEntries(Object.keys(CONFIGURACIONES).map((n) => [n, crearEstado(crearRng(0), { jugadores:Number(n) }).roles.sort()]));
}
export async function generarRepartosLobo() {
  await writeFile(new URL('../web/casino/lobo-repartos-publicos.js', import.meta.url), `// Generado por herramientas/generar-repartos-lobo.mjs desde CONFIGURACIONES y crearEstado.\n// No editar a mano; no contiene asientos ni secretos de una partida.\nexport const REPARTOS_PUBLICOS = ${JSON.stringify(repartosPublicos(), null, 2)};\n`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await generarRepartosLobo();
