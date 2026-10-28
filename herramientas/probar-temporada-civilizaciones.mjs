// Una partida de bots, sin API. Guarda el resultado y el catalogo en privado.
// node herramientas/probar-temporada-civilizaciones.mjs --partidas=1 --temporada=1 --seed=5 --a=cientifico --b=equilibrado
// --plan=clasico (default) | compartido | largo: sondas explicitas, nunca una serie.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { correrPartida } from '../src/arena.js';
import J from '../src/juegos/civilizaciones.js';
import { comprobarInvariantes } from '../src/juegos/civilizaciones/estado.js';
import { construirSistema, construirUsuario } from '../src/prompt.js';
import { CARACTERES_POR_TOKEN, TOPE_TOKENS_ENTRADA } from '../src/juegos/civilizaciones/constantes.js';
import { PERFILES, VERSION_BOTS, jugar } from '../src/juegos/civilizaciones-bots.js';
import { diagnosticarDecision, resumirDiagnostico, analizarRutas, analizarBases } from '../src/juegos/civilizaciones/diagnostico.js';

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const m = /^--(partidas|temporada|seed|a|b|plan)=(.+)$/.exec(arg);
  if (!m || args.has(m[1])) throw new Error(`argumento invalido o duplicado: ${arg}`);
  args.set(m[1], m[2]);
}
if (args.get('partidas') !== '1') throw new Error('indica --partidas=1; esta herramienta no ejecuta series');
const entero = (clave, defecto) => {
  const texto = args.get(clave) ?? String(defecto), n = Number(texto);
  if (!/^\d+$/.test(texto) || !Number.isInteger(n) || n < 0 || n > 0xffffffff) throw new Error(`${clave} debe ser uint32`);
  return n;
};
const seed = entero('seed', 5), seedTemporada = entero('temporada', 1);
const ids = [args.get('a') ?? 'cientifico', args.get('b') ?? 'equilibrado'];
const plan = args.get('plan') ?? 'clasico';
if (!['clasico', 'compartido', 'largo'].includes(plan)) throw new Error('plan debe ser clasico, compartido o largo');
for (const id of ids) if (!Object.hasOwn(J.bots, id)) throw new Error(`bot desconocido: ${id}`);
let maxTokensEstimados = 0;
const decisiones = [];
const agentes = ids.map((id) => ({
  id, nombre: J.bots[id].nombre, tipo: 'bot', necesitaEstado: true,
  async jugar({ estado, i, vista, rng }) {
    const estimacion = Math.ceil((construirSistema(J) + '\n' + construirUsuario(vista)).length / CARACTERES_POR_TOKEN);
    maxTokensEstimados = Math.max(maxTokensEstimados, estimacion);
    if (estimacion > TOPE_TOKENS_ENTRADA) throw new Error(`entrada excedida: ${estimacion}`);
    const perfil = PERFILES[id] ? { ...PERFILES[id], id, plan } : null;
    const respuesta = perfil ? jugar(estado, i, perfil, rng) : J.bots[id].fn(estado, i, rng);
    if (perfil) decisiones.push(diagnosticarDecision(estado, i, perfil, respuesta));
    return { respuesta, crudo: null, uso: null };
  },
}));
const fallos = [];
const partida = await correrPartida({ juego: J, agentes, seed, opciones: { seedTemporada },
  alRegistrar: (_r, E) => fallos.push(...comprobarInvariantes(E)),
});
const diagnostico = {
  version: J.versionReglas, versionBots: VERSION_BOTS, plan, seed, seedTemporada, bots: ids, turnos: partida.rondas.length,
  ganador: partida.ganador, indices: partida.metricas.map((m) => m.indice),
  eras: partida.metricas.map((m) => m.era), tecnologias: partida.metricas.map((m) => m.tecnologias),
  ordenes: partida.metricas.map((m) => ({ validas: m.ordenesValidas, total: m.ordenesTotal })),
  rutas: partida.metricas.map((m) => m.edificios),
  desarrollo: resumirDiagnostico(decisiones),
  estructura: analizarRutas(partida.temporada.nodos),
  alternativasIniciales: analizarBases(partida.temporada.nodos),
  invariantes: fallos, maxTokensEstimados, tokensReales: null,
  errores: partida.rondas.flatMap((r) => r.errores ?? []).filter(Boolean),
};
const carpeta = new URL('../privado/pruebas/', import.meta.url);
await mkdir(carpeta, { recursive: true });
const destino = new URL(`civilizaciones-temporada-${seedTemporada}-seed-${seed}-${Date.now()}.json`, carpeta);
await writeFile(destino, JSON.stringify({ diagnostico, decisiones, partida }, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ archivo: fileURLToPath(destino), ...diagnostico }, null, 2));
if (fallos.length || diagnostico.errores.length || partida.truncada) process.exitCode = 1;
