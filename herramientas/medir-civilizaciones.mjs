// Mide el balance de la Carrera de civilizaciones con bots de control (sin API ni dinero): privado/spec/civilizaciones-diseno.md, seccion 9.
//   node herramientas/medir-civilizaciones.mjs [--mundos=200] [--semilla=1] [--bots=a,b,c] [--bioma=continente|arido|mares|interior|cordillera|istmo|golfo|peninsulas]
//        [--indice=300,80,1500] [--costos=10,19,32,48,70,96] [--espejos] [--invariantes] [--json]
//
// Round-robin de los bots activos con los dos asientos en mundos con seeds consecutivos (y cada uno contra el pasivo, que es un control y no un participante).
// La tasa de victoria de un bot es (victorias) / (partidas contra los otros activos) con IC95 agrupado por mundo. `--indice=` cambia las referencias del Indice
// (Cultura, Poblacion, Economia) y `--costos=` la escalera de costos de tecnologia, para probar candidatas SIN adoptarlas. `--espejos` juega cada bot contra si mismo
// en el mismo mundo para ver si el asiento importa (con mundos gemelos solo puede decidir el sorteo del desempate: ~50 %).
import { medir, BOTS_ACTIVOS } from '../src/juegos/civilizaciones/medicion.js';
import { INDICE, COSTO_TECNOLOGIA } from '../src/juegos/civilizaciones/constantes.js';
import civilizaciones from '../src/juegos/civilizaciones.js';
import { BIOMAS } from '../src/mapa.js';

const arg = (nombre, defecto) => { const a = process.argv.find((x) => x.startsWith(`--${nombre}=`)); return a ? a.slice(nombre.length + 3) : defecto; };
const bandera = (nombre) => process.argv.includes(`--${nombre}`);
const bioma = arg('bioma', undefined);
if (bioma !== undefined && !BIOMAS.includes(bioma)) { console.error(`bioma desconocido: ${bioma}. Biomas: ${BIOMAS.join(', ')}`); process.exit(2); }
const bots = arg('bots', BOTS_ACTIVOS.join(',')).split(',').filter(Boolean);
for (const id of bots) if (!civilizaciones.bots[id] || id === 'pasivo' || id === 'azar') { console.error(`bot no valido: ${id}. Activos: ${BOTS_ACTIVOS.join(', ')}`); process.exit(2); }
if (arg('indice', null) !== null) { const [c, p, e] = arg('indice').split(',').map(Number); INDICE.cultura.referencia = c; INDICE.poblacion.referencia = p; INDICE.economia.referencia = e; }
if (arg('costos', null) !== null) { const cs = arg('costos').split(',').map(Number); if (cs.length !== 6 || cs.some((x) => !(x > 0))) { console.error('--costos requiere 6 numeros positivos'); process.exit(2); } cs.forEach((x, i) => { COSTO_TECNOLOGIA[i] = x; }); }

const R = medir({ mundos: Number(arg('mundos', 200)), semilla: Number(arg('semilla', 1)), bots, bioma, espejos: bandera('espejos'), invariantes: bandera('invariantes') });
if (bandera('json')) { console.log(JSON.stringify(R, null, 1)); process.exit(0); }

const pc = (x) => (x === null || x === undefined ? '  -  ' : `${(100 * x).toFixed(1)}%`.padStart(6));
const n1 = (x) => (x === null ? '-' : x.toFixed(1)).padStart(6);
console.log(`\n  Carrera de civilizaciones: ${R.mundos} mundos (semilla ${R.semilla}, bioma ${R.bioma}), ${R.partidas} partidas, bots ${bots.join(', ')} (+ pasivo como control)\n`);
console.log('  bot            victorias (IC95)         vs pasivo   tecnologias (min-max)   era  pob  reg  Indice  agotado  validas');
for (const id of bots) {
  const b = R.porBot[id], v = b.victorias;
  console.log(`  ${id.padEnd(14)} ${pc(v.media)} [${pc(v.bajo)},${pc(v.alto)}]   ${pc(b.contraPasivo.media)}    ${n1(b.tecnologias.media)} (${b.tecnologias.min}-${b.tecnologias.max})`.padEnd(88)
    + ` ${n1(b.era)}${n1(b.poblacion)}${n1(b.regiones)}  ${n1(b.indice)}  ${pc(b.arbolAgotado)}  ${pc(b.ordenesValidas)}`);
}
console.log('\n  Indice por pilar (media) y % de partidas con el pilar al 98 % de su tope (saturado):');
console.log('  bot            ' + ['tecnologia', 'cultura', 'poblacion', 'economia', 'maravillas', 'estabilidad'].map((k) => k.slice(0, 7).padStart(15)).join(''));
for (const id of bots) {
  const b = R.porBot[id];
  console.log(`  ${id.padEnd(14)} ` + ['tecnologia', 'cultura', 'poblacion', 'economia', 'maravillas', 'estabilidad'].map((k) => `${n1(b.pilares[k])} (${pc(b.saturados[k]).trim()})`.padStart(15)).join(''));
}
console.log(`\n  El lider del Indice en el turno 10 gana: ${pc(R.liderT10.gana)} (${R.liderT10.partidas} partidas con lider)   en el 20: ${pc(R.liderT20.gana)} (${R.liderT20.partidas})   cambios de lider por partida: ${n1(R.cambiosDeLider)}`);
console.log(`  Asiento 0 gana ${pc(R.asiento0.gana)} de ${R.asiento0.partidas} partidas entre activos (los bots rotan, asi que lo que sobra de 50 % es del mundo o del desempate)`);
console.log(`  Partidas decididas por desempate (mismo Indice a un decimal): ${pc(R.empatesAntesDelDesempate)}`);
if (R.espejos) console.log(`  Espejos: ${R.espejos.partidas} (uno por mundo); el asiento 0 gana ${pc(R.espejos.asiento0)} +-${(100 * R.espejos.mitad).toFixed(1)} puntos; decididas por sorteo ${pc(R.espejos.porSorteo)} (la spec pide >= 1,000 espejos: +-3 puntos)`);
if (R.invariantesRotos !== null) console.log(`  Invariantes rotos: ${R.invariantesRotos}`);
console.log('');
