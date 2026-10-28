// Busca las partidas de ejemplo de la escena de Guerra de territorios: juega partidas de bots de control (sin red y sin API) y elige, con una busqueda golosa, las pocas que entre todas
// cubren los escenarios que la escena tiene que saber dibujar (src/pruebas/escena/ayudas-conq.js, ESCENARIOS_NECESARIOS). Guarda la lista en src/pruebas/escena/escenarios-conquista.json.
// Hay que volver a correrlo cuando el motor o los bots cambian lo bastante para que alguna partida de ejemplo deje de cubrir lo que dice (una prueba avisa).
//   node herramientas/buscar-escenarios-conquista.mjs [--desde=1] [--hasta=300] [--minimo=3] [--seco]     (--seco: solo imprime, no escribe el archivo)
import { writeFileSync } from 'node:fs';
import { correrPartida } from '../src/arena.js';
import { resolverAgente } from '../src/agentes.js';
import conquista from '../src/juegos/conquista.js';
import { escenariosDe, ESCENARIOS_NECESARIOS } from '../src/pruebas/escena/ayudas-conq.js';

const arg = (nombre, defecto) => { const a = process.argv.find((x) => x.startsWith(`--${nombre}=`)); return a ? Number(a.split('=')[1]) : defecto; };
const desde = arg('desde', 1), hasta = arg('hasta', 300), minimo = arg('minimo', 3), seco = process.argv.includes('--seco');

// Mezclas de bots que se prueban (de 2 a 5 reinos). Si algun escenario no sale con estas, hay que agregar mezclas.
const MEZCLAS = [
  ['azar', 'azar', 'agresivo', 'economico', 'pacifico'],
  ['agresivo', 'agresivo', 'agresivo', 'agresivo', 'azar'],
  ['agresivo', 'agresivo', 'agresivo', 'azar', 'azar'],
  ['agresivo', 'azar', 'azar', 'azar', 'azar'],
  ['azar', 'azar', 'azar', 'azar', 'azar'],
  ['agresivo', 'agresivo', 'agresivo', 'agresivo', 'agresivo'],
  ['agresivo', 'economico', 'pacifico', 'azar'],
  ['agresivo', 'agresivo', 'azar', 'azar'],
  ['agresivo', 'agresivo', 'azar'],
  // Con la Maravilla de 25 de cada recurso (2.2.0) los bots de arriba casi nunca llegan a construirla: estos si (bots-v2, con `maravilla: true`).
  ['leal', 'leal', 'leal', 'mixto-adaptativo'],
  ['leal', 'leal', 'leal'],
];

const candidatos = [];
for (let seed = desde; seed <= hasta; seed++) {
  for (const bots of MEZCLAS) {
    const partida = await correrPartida({ juego: conquista, agentes: bots.map((c) => resolverAgente(c, conquista)), seed });
    const cubre = [...escenariosDe(partida)].filter((c) => ESCENARIOS_NECESARIOS.includes(c));
    if (cubre.length) candidatos.push({ seed, bots, cubre });
  }
  if (seed % 50 === 0) console.error(`seed ${seed}/${hasta}: ${candidatos.length} partidas con algo que cubrir`);
}

// Busqueda golosa: en cada paso, la partida que cubre mas escenarios todavia sin cubrir (empate: la que cubre mas en total, luego el seed menor).
const pendientes = new Set(ESCENARIOS_NECESARIOS), elegidos = [];
const gana = (a, b, nuevo) => { const x = a.cubre.filter(nuevo).length, y = b.cubre.filter(nuevo).length; return x !== y ? x > y : a.cubre.length !== b.cubre.length ? a.cubre.length > b.cubre.length : a.seed < b.seed; };
while (pendientes.size) {
  const mejor = candidatos.filter((c) => !elegidos.includes(c)).reduce((m, c) => (!m || gana(c, m, (x) => pendientes.has(x)) ? c : m), null);
  if (!mejor || !mejor.cubre.some((c) => pendientes.has(c))) break;
  elegidos.push(mejor); mejor.cubre.forEach((c) => pendientes.delete(c));
}
// Las pruebas usan algunas partidas por posicion y necesitan varias: si faltan, se agregan las que cubren mas.
while (elegidos.length < minimo) {
  const mejor = candidatos.filter((c) => !elegidos.includes(c)).reduce((m, c) => (!m || c.cubre.length > m.cubre.length ? c : m), null);
  if (!mejor) break;
  elegidos.push(mejor);
}
elegidos.sort((a, b) => b.cubre.length - a.cubre.length || a.seed - b.seed); // la primera es la que mas cubre

const escenarios = elegidos.map((e) => ({ id: `guerra-${e.seed}`, seed: e.seed, bots: e.bots, cubre: e.cubre }));
const texto = `{\n "reglas": ${JSON.stringify(conquista.versionReglas)},\n "escenarios": [\n${escenarios.map((e) => '  ' + JSON.stringify(e)).join(',\n')}\n ]\n}\n`;
console.log(texto);
if (pendientes.size) console.error(`FALTAN ESCENARIOS: ${[...pendientes].join(', ')} (probar mas seeds o mas mezclas)`);
if (!seco && !pendientes.size) {
  writeFileSync(new URL('../src/pruebas/escena/escenarios-conquista.json', import.meta.url), texto);
  console.error('escrito src/pruebas/escena/escenarios-conquista.json');
}
process.exit(pendientes.size ? 1 : 0);
