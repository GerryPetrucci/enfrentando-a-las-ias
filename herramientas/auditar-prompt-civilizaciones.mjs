// Revision offline de UN registro guardado. No consulta modelos ni juega una serie.
// --archivo=privado/pruebas/...json --sistema=privado/spec/...txt
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import J from '../src/juegos/civilizaciones.js';
import { reconstruirVistas } from '../src/juegos/civilizaciones/revision-contrato.js';
import { construirSistema, construirUsuario } from '../src/prompt.js';
import { TOPE_TOKENS_ENTRADA, CARACTERES_POR_TOKEN } from '../src/juegos/civilizaciones/constantes.js';

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const m = /^--(archivo|sistema)=(.+)$/.exec(arg);
  if (!m || args.has(m[1])) throw new Error(`argumento invalido: ${arg}`);
  args.set(m[1], m[2]);
}
if (!args.has('archivo') || !args.has('sistema')) throw new Error('requiere --archivo y --sistema');
const doc = JSON.parse((await readFile(args.get('archivo'), 'utf8')).replace(/^\uFEFF/, ''));
if (doc.diagnostico?.version !== J.versionReglas) throw new Error('version del registro distinta del motor actual');
const vistas = reconstruirVistas(doc.partida);
const sistema = await readFile(args.get('sistema'), 'utf8'), activo = construirSistema(J);
const huella = (s) => createHash('sha256').update(s).digest('hex');
const medir = (texto, vista) => Math.ceil((texto + '\n' + construirUsuario(vista)).length / CARACTERES_POR_TOKEN);
const filas = vistas.map((v) => ({ ...v, tokensActivo: medir(activo, v.vista), tokensCandidato: medir(sistema, v.vista) }));
const informe = {
  motor: J.versionReglas, origen: args.get('archivo'), sistema: args.get('sistema'),
  tipoOrigen: doc.partida.jugadores.every((j) => j.tipo === 'bot') ? 'bots; no valida comprension de modelos' : 'registro de modelos',
  turnosVerificados: doc.partida.rondas.length, decisiones: filas.length,
  huellaActiva: huella(activo), huellaCandidata: huella(sistema),
  mismoSistema: sistema === activo, topeActivo: TOPE_TOKENS_ENTRADA,
  maximoActivo: Math.max(0, ...filas.map((f) => f.tokensActivo)),
  maximoCandidato: Math.max(0, ...filas.map((f) => f.tokensCandidato)),
  decisionesSobreTope: filas.filter((f) => f.tokensCandidato > TOPE_TOKENS_ENTRADA).length,
  metodo: `caracteres/${CARACTERES_POR_TOKEN}; no tokenizer ni usage real`,
  modificaContrato: false, llamadasAPI: 0,
};
const carpeta = new URL('../privado/revisiones/', import.meta.url);
await mkdir(carpeta, { recursive: true });
const archivo = new URL(`civilizaciones-prompt-${Date.now()}.json`, carpeta);
await writeFile(archivo, JSON.stringify({ informe, filas }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ archivo: fileURLToPath(archivo), ...informe }, null, 2));
