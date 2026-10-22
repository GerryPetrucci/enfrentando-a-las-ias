// Mide el balance de la Guerra de territorios con bots de control (sin API ni dinero): partidas con los asientos rotados y las metricas de privado/spec/guerra-2.0.0-diseno.md (seccion 9).
//   node herramientas/medir-conquista.mjs [--partidas=200] [--jugadores=4] [--mezcla=tipos|clasicos|diplomacia|todos|a,b,c,d] [--semilla=1] [--sin=hegemon,eventos,tierra]
//        [--tierra=0.85] [--hegemon=entra,sale,bono] [--maravilla=turnos,factorDeCosto] [--json]
//
// Metricas (definiciones de la linea base de 1.1.0: el que va arriba = unico con mas regiones; "gana" = el ganador de la partida):
//   lider T10/T15/T20 gana · cambios de lider por partida · victorias por bot · % que termina por Maravilla · turnos por partida · unidades reclutadas por tipo y bot · % de ordenes validas por bot.
// Objetivos 2.0.0: lider T10 <= 65 %, T15 <= 75 %, T20 <= 85 %; cambios de lider >= 1.5; mejor bot <= 40 %; peor bot no aleatorio >= 12 %; Maravilla <= 25 %.
// `--sin=` apaga una pieza del paquete de equilibrio para medir cuanto aporta (ablacion); `--tierra=` cambia el factor de tierra ajena.
import { crearRng } from '../src/rng.js';
import conquista from '../src/juegos/conquista.js';
import { regionesDe, clasificar } from '../src/juegos/conquista/estado.js';
import { HEGEMON, EVENTOS, TIERRA, MARAVILLA, PUNTOS_POSICION } from '../src/juegos/conquista/constantes.js';

const arg = (nombre, defecto) => { const a = process.argv.find((x) => x.startsWith(`--${nombre}=`)); return a ? a.split('=')[1] : defecto; };
const partidas = Number(arg('partidas', 200)), jugadores = Number(arg('jugadores', 4)), semilla = Number(arg('semilla', 1)), json = process.argv.includes('--json');
const MEZCLAS = {
  tipos: ['lancero-masa', 'arquero-defensivo', 'jinete-relampago', 'mixto-adaptativo', 'agresivo'],
  clasicos: ['agresivo', 'pacifico', 'economico', 'azar', 'agresivo'],
  diplomacia: ['traidor', 'leal', 'mixto-adaptativo', 'lancero-masa', 'arquero-defensivo'],
  todos: ['lancero-masa', 'arquero-defensivo', 'jinete-relampago', 'mixto-adaptativo', 'traidor', 'leal', 'agresivo', 'economico', 'pacifico', 'azar'],
};
const mezcla = (MEZCLAS[arg('mezcla', 'tipos')] ?? arg('mezcla', '').split(',')).filter(Boolean);
const sin = new Set(arg('sin', '').split(',').filter(Boolean));
if (sin.has('hegemon')) HEGEMON.activo = false;
if (sin.has('eventos')) EVENTOS.activo = false;
if (sin.has('tierra')) TIERRA.factor = 1;
if (arg('tierra', null) !== null) TIERRA.factor = Number(arg('tierra'));
if (arg('maravilla', null) !== null) { const [turnos, costo] = arg('maravilla').split(',').map(Number); MARAVILLA.turnos = turnos; if (costo) for (const r of Object.keys(MARAVILLA.costo)) MARAVILLA.costo[r] = Math.round(MARAVILLA.costo[r] * costo); }
if (arg('hegemon', null) !== null) { const [entra, sale, bono] = arg('hegemon').split(',').map(Number); Object.assign(HEGEMON, { entra, sale, bonoAtaque: bono }); }
for (const id of mezcla) if (!conquista.bots[id]) { console.error(`bot desconocido: ${id}. Bots: ${Object.keys(conquista.bots).join(', ')}`); process.exit(2); }

// El unico reino con mas regiones entre los vivos (-1 si hay empate en la punta).
const lider = (E) => { let m = -1, q = -1, empate = false; for (const r of E.reinos) { if (!r.vivo) continue; const n = regionesDe(E, r.s).length; if (n > m) { m = n; q = r.s; empate = false; } else if (n === m) empate = true; } return empate ? -1 : q; };
const cuenta = (ids) => Object.fromEntries(ids.map((i) => [i, 0]));
const ids = [...new Set(mezcla)];
const R = {
  partidas: 0, turnos: 0, maravilla: 0, hastaT30: 0, cambiosLider: 0, lideres: { 10: [0, 0], 15: [0, 0], 20: [0, 0] }, // [gana el lider, partidas con lider unico]
  gana: cuenta(ids), asientos: cuenta(ids), puntos: cuenta(ids), reclutadas: Object.fromEntries(ids.map((i) => [i, [0, 0, 0, 0]])), ordenes: Object.fromEntries(ids.map((i) => [i, [0, 0]])),
  rupturas: cuenta(ids), pactos: cuenta(ids), eventos: 0, hegemones: 0, caidas: 0, caidasAntesT10: 0, turnoPrimeraCaida: 0, conCaida: 0,
};

for (let g = 0; g < partidas; g++) {
  const seed = semilla + g, rot = g % mezcla.length;
  const asientos = Array.from({ length: jugadores }, (_, s) => mezcla[(s + rot) % mezcla.length]);
  const E = conquista.crear(crearRng(seed * 7919 + 13), { jugadores });
  const rngs = asientos.map((_, i) => crearRng((seed * 31 + i * 977) >>> 0));
  const lideres = {};
  let previo = -1, cambios = 0;
  while (!conquista.terminado(E)) {
    const jugadas = E.reinos.map((r, s) => (r.vivo ? conquista.normalizar(conquista.bots[asientos[s]].fn(E, s, rngs[s]), E) : null));
    jugadas.forEach((j, s) => {
      if (!j || j.invalida) return;
      for (const o of j.ordenes) if (o.tipo === 'reclutar') o.pila.forEach((n, t) => { R.reclutadas[asientos[s]][t] += n; });
    });
    const reg = conquista.aplicar(E, jugadas);
    reg.obediencia.forEach((ob, s) => { R.ordenes[asientos[s]][0] += ob.validas; R.ordenes[asientos[s]][1] += ob.total; });
    R.eventos += reg.eventos.filter((e) => e.tipo === 'evento').length; R.hegemones += reg.eventos.filter((e) => e.tipo === 'hegemon').length;
    const l = lider(E);
    if (E.turno in R.lideres) lideres[E.turno] = l;
    if (l >= 0 && previo >= 0 && l !== previo) cambios++;
    if (l >= 0) previo = l;
  }
  R.partidas++; R.turnos += E.turno; R.cambiosLider += cambios;
  const caidos = E.reinos.filter((r) => !r.vivo);
  R.caidas += caidos.length;
  if (caidos.length) { R.conCaida++; const primera = Math.min(...caidos.map((r) => r.cayoEn)); R.turnoPrimeraCaida += primera; if (primera < 10) R.caidasAntesT10++; }
  if (E.ganoPorMaravilla) R.maravilla++;
  if (E.turno >= 30) R.hastaT30++;
  R.gana[asientos[E.ganador]]++;
  asientos.forEach((a) => { R.asientos[a]++; });
  clasificar(E).forEach((fila, pos) => { R.puntos[asientos[fila.s]] += PUNTOS_POSICION[pos] ?? 0; });
  asientos.forEach((a, s) => { R.rupturas[a] += E.stats[s].rupturas; R.pactos[a] += E.stats[s].pactos; });
  for (const t of [10, 15, 20]) if (lideres[t] !== undefined && lideres[t] >= 0) { R.lideres[t][1]++; if (lideres[t] === E.ganador) R.lideres[t][0]++; }
}

const pc = (a, b) => (b ? Math.round((100 * a) / b) : null);
const salida = {
  reglas: conquista.versionReglas, partidas: R.partidas, jugadores, mezcla, ablacion: [...sin], tierra: TIERRA.factor,
  liderGana: Object.fromEntries([10, 15, 20].map((t) => [`T${t}`, { porciento: pc(...R.lideres[t]), de: R.lideres[t][1] }])),
  cambiosDeLider: +(R.cambiosLider / R.partidas).toFixed(2), turnosPorPartida: +(R.turnos / R.partidas).toFixed(1), terminanAntesDelTurno30: pc(R.partidas - R.hastaT30, R.partidas), maravilla: pc(R.maravilla, R.partidas),
  porBot: Object.fromEntries(ids.map((i) => {
    const rec = R.reclutadas[i], tot = rec.reduce((a, b) => a + b, 0);
    return [i, {
      victorias: pc(R.gana[i], R.asientos[i]), puntosPorPartida: +(R.puntos[i] / R.asientos[i]).toFixed(2), ordenesValidas: pc(...R.ordenes[i]),
      reclutadasPorTipo: tot ? rec.map((n) => pc(n, tot)) : null, rupturas: +(R.rupturas[i] / R.asientos[i]).toFixed(2), pactos: +(R.pactos[i] / R.asientos[i]).toFixed(2),
    }];
  })),
  eventosPorPartida: +(R.eventos / R.partidas).toFixed(2), hegemonesPorPartida: +(R.hegemones / R.partidas).toFixed(2),
  caidasPorPartida: +(R.caidas / R.partidas).toFixed(2), conCaidaAntesDelT10: pc(R.caidasAntesT10, R.partidas), turnoMedioDeLaPrimeraCaida: R.conCaida ? +(R.turnoPrimeraCaida / R.conCaida).toFixed(1) : null,
};

if (json) console.log(JSON.stringify(salida, null, 1));
else {
  const f = (x) => (x === null ? 'n/d' : `${x}%`);
  console.log(`Guerra ${salida.reglas}: ${salida.partidas} partidas de ${jugadores} bots (${mezcla.join(', ')}; asientos rotados)${sin.size ? `  SIN: ${[...sin].join(', ')}` : ''}${TIERRA.factor !== 0.85 ? `  tierra ajena x${TIERRA.factor}` : ''}`);
  console.log(`  el que va arriba en regiones gana: T10 ${f(salida.liderGana.T10.porciento)} (de ${salida.liderGana.T10.de})  T15 ${f(salida.liderGana.T15.porciento)} (de ${salida.liderGana.T15.de})  T20 ${f(salida.liderGana.T20.porciento)} (de ${salida.liderGana.T20.de})   [objetivo <= 65 / 75 / 85]`);
  console.log(`  cambios de lider por partida: ${salida.cambiosDeLider} [objetivo >= 1.5]   turnos por partida: ${salida.turnosPorPartida}   terminan antes del turno 30: ${f(salida.terminanAntesDelTurno30)}   Maravilla decide: ${f(salida.maravilla)} [objetivo <= 25]`);
  console.log(`  eventos del mundo por partida: ${salida.eventosPorPartida}   cambios de Hegemon por partida: ${salida.hegemonesPorPartida}   reinos caidos por partida: ${salida.caidasPorPartida}   con alguna caida antes del turno 10: ${f(salida.conCaidaAntesDelT10)}   turno medio de la primera caida: ${salida.turnoMedioDeLaPrimeraCaida ?? 'n/d'}`);
  console.log('  bot                  victorias  puntos/partida  ordenes validas   reclutadas L/A/J/I      rupturas  pactos');
  for (const [i, b] of Object.entries(salida.porBot)) console.log(`  ${i.padEnd(20)} ${String(f(b.victorias)).padStart(9)}  ${String(b.puntosPorPartida).padStart(14)}  ${String(f(b.ordenesValidas)).padStart(15)}   ${(b.reclutadasPorTipo ? b.reclutadasPorTipo.map((n) => `${n}%`).join('/') : '-').padEnd(22)} ${String(b.rupturas).padStart(8)} ${String(b.pactos).padStart(7)}`);
}
