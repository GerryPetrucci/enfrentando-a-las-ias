#!/usr/bin/env node
// CLI para correr un duelo o una serie y guardar el resultado en data/.
//
//   node src/correr.js --juego=dilema --a=claude --b=gpt --partidas=4 --modo=pago
//   node src/correr.js --juego=dilema --a=laguna --b=nemotron-super --partidas=4 --modo=gratis
//   node src/correr.js --a=tomaydaca --b=siempre-t --partidas=2   (estrategias base: sin API, sin modo)
//   node src/correr.js --juego=conquista --jugadores=claude,gpt,gemini,deepseek --partidas=4 --modo=pago
//   node src/correr.js --juego=conquista --jugadores=agresivo,pacifico,economico,azar --partidas=4   (bots de control)
//   node src/correr.js --juego=conquista --jugadores=haiku,luna,flash-lite,deepseek --partidas=4 --modo=pago --lote --tope=0.50 --destino=pruebas
//
//   node src/correr.js --juego=conquista --jugadores=agresivo,pacifico,economico,azar --partidas=4 --bioma=arido   (fuerza la forma del mapa)
//
// BIOMA (solo Guerra de territorios): `--bioma=continente|arido|mares|interior|cordillera|istmo|golfo|peninsulas` fuerza la forma del mapa; sin el, sale del seed (una serie de rotacion
// usa el mismo seed y por eso el mismo mapa). Cada partida guarda su mapa completo y su bioma, y la consola dice cual se jugo.
//
// MODO (obligatorio en cada ejecucion con modelos, no hay valor por defecto):
//   --modo=gratis  solo modelos gratis ($0 por llamada, no tocan tu saldo)
//   --modo=pago    permite modelos que gastan credito de OpenRouter
//
// SERIE DE ROTACION: por defecto los asientos rotan entre partidas (con 2 jugadores, se alternan; con k jugadores, en k
// partidas cada uno pasa por cada asiento). Si la partida 1 la empieza A en la posicion 0, la 2 la empieza B. Esto mata
// el argumento de "le tocaba mejor lugar" antes de que aparezca en los comentarios. En la Guerra de territorios todas las
// partidas de la serie usan el mismo mapa. `--alternar=no` lo desactiva (no sirve para publicar).
//
// DESTINO: los resultados con modelos gratis son de practica y van a data/pruebas/ (el marcador no los lee). El resto va a
// data/. `--destino=oficial|pruebas` lo cambia.
//
// RITMO: con modelos gratis las llamadas salen a 18 por minuto (el tope de OpenRouter es 20); `--ritmo=N` lo cambia.
//
// LOTE (--lote): las jugadas van por la Batch API de OpenRouter, a MITAD de precio y sin prisa (de minutos a horas). Todas las
// partidas de la serie corren a la vez, turno por turno, y cada ronda es un solo envio por modelo. Exige:
//   --modo=pago        porque gasta credito
//   --tope=DOLARES     gasto maximo de la ejecucion; al alcanzarlo no se envian mas lotes y el resultado se guarda en pruebas
//   --sondeo=SEGUNDOS  cada cuanto se pregunta si el lote termino (por defecto 15)
// Un modelo sin variante de lote (Llama, DeepSeek) se llama normal dentro de la misma ejecucion.
//
// TURNOS: `--turnos=N` corta cada partida a los N turnos (para practicar barato). Son partidas incompletas: van a pruebas.

import { writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { obtenerJuego } from './juegos/index.js';
import { VERSION_PROMPT, construirSistema } from './prompt.js';
import { resolverAgente, agenteModeloEnLote } from './agentes.js';
import { CONTENDIENTES, fijarModo } from './modelos.js';
import { PARAMETROS } from './parametros.js';
import { ejecutarSerie } from './ejecutar-serie.js';
import { crearLimitador } from './limitador.js';
import { crearClienteLote } from './lote.js';
import { crearCoordinador } from './coordinador-lote.js';
import { seedDesdeTexto } from './rng.js';
import { BIOMAS } from './mapa.js';
import {
  parsearArgumentos, jugadoresDe, errorDeCantidad, planDeSerie, avisosDeSerie, estimarLlamadas, destinoDe, errorDeModo, errorDeLote,
  errorDePrimeraRonda, rutaLibre,
} from './serie.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Un error de uso (argumentos mal puestos) se muestra corto y sale con codigo 1; cualquier otro error es un fallo de verdad.
export class ErrorDeUso extends Error {}
const salir = (msg) => { throw new ErrorDeUso(msg); };

// Una bandera sin valor (--tope) llega como true, y Number(true) es 1: se trata como numero invalido, no como un dolar.
const numero = (v) => (v === true ? NaN : Number(v));
const dolares = (n) => `$${Number(n).toFixed(n < 1 ? 4 : 2)}`;

// `raiz` es donde se guarda data/. Las pruebas inyectan una carpeta temporal, un cliente de lote falso (`crearCliente`), la llamada
// normal para los modelos sin lote (`sincrono`) y la consola, para correr de punta a punta sin red ni gasto.
export async function correr(argv, {
  raiz = RAIZ,
  crearCliente = crearClienteLote,
  sincrono = null,
  consola = { log: (...a) => console.log(...a), escribir: (t) => process.stdout.write(t) },
} = {}) {
  const o = parsearArgumentos(argv);
  const idJuego = o.juego || 'dilema';
  const juego = obtenerJuego(idJuego);
  const claves = jugadoresDe(o);
  const k = claves.length;

  const errCantidad = errorDeCantidad(juego, k);
  if (errCantidad) salir(errCantidad);

  // --bioma=continente|arido|mares|interior|cordillera|istmo|golfo|peninsulas fuerza la forma del mapa de la Guerra de territorios; sin el, sale del seed. Se valida antes de cualquier llamada.
  if (o.bioma !== undefined) {
    if (juego.id !== 'conquista') salir('--bioma solo vale para la Guerra de territorios (--juego=conquista).');
    if (!BIOMAS.includes(o.bioma)) salir(`--bioma debe ser uno de: ${BIOMAS.join(', ')}.`);
  }
  const opcionesDeJuego = o.bioma !== undefined ? { bioma: o.bioma } : {};

  let agentesPorClave;
  try {
    agentesPorClave = new Map(claves.map((c) => [c, resolverAgente(c, juego)]));
  } catch (err) {
    salir(err.message);
  }
  const todos = claves.map((c) => agentesPorClave.get(c));

  // Gratis o pago se decide en CADA ejecucion. Se valida antes de la primera llamada a la API.
  const usaModelos = todos.some((a) => a.tipo === 'modelo');
  const modo = o.modo === true ? '' : o.modo;
  const errModo = errorDeModo({ modo, agentes: todos, contendientes: CONTENDIENTES });
  if (errModo) salir(errModo);

  // --lote no lleva valor: "--lote=si" se ignoraba en silencio y corria en vivo, a precio completo y sin tope
  if (o.lote !== undefined && o.lote !== true) salir('--lote no lleva valor: escribelo solo, sin "=" (por ejemplo --lote --tope=0.50).');
  const lote = o.lote === true;
  if (o.tope !== undefined && !lote) salir('--tope solo se usa con --lote.');
  if (o.sondeo !== undefined && !lote) salir('--sondeo solo se usa con --lote.');
  if (lote && o.ritmo !== undefined) salir('--ritmo no se combina con --lote: espaciaria las peticiones y cada una saldria en su propio lote.');
  const tope = o.tope === undefined ? null : numero(o.tope);
  const errLote = errorDeLote({ lote, modo, tope, agentes: todos, contendientes: CONTENDIENTES, juego });
  if (errLote) salir(errLote);
  if (usaModelos) fijarModo(modo);

  const turnos = o.turnos === undefined ? null : numero(o.turnos);
  if (turnos !== null && (!Number.isInteger(turnos) || turnos < 1)) salir('--turnos debe ser un numero entero de 1 o mas.');
  if (turnos !== null && o.destino === 'oficial') salir('--turnos corta las partidas a la mitad: su resultado es de practica y no puede ir a --destino=oficial.');

  const sondeo = o.sondeo === undefined ? 15 : numero(o.sondeo);
  if (!(Number.isFinite(sondeo) && sondeo >= 1 && sondeo <= 3600)) salir('--sondeo debe estar entre 1 y 3600 segundos (cada cuanto se pregunta si el lote termino).');

  // Los modelos economicos son de practica: su resultado nunca va a data/ (el marcador lo leeria).
  const practica = todos.some((a) => CONTENDIENTES[a.id]?.practica === true);
  let destino;
  try {
    destino = destinoDe({ modo: usaModelos ? modo : null, destino: o.destino ?? (turnos !== null ? 'pruebas' : undefined), practica });
  } catch (err) {
    salir(err.message);
  }

  const partidas = Number(o.partidas || (k > 2 ? k : 2));
  if (!Number.isInteger(partidas) || partidas < 1) salir('--partidas debe ser un numero entero de 1 o mas.');
  const rotar = o.alternar !== 'no';
  const mismoSeed = !!juego.mismoSeedEnSerie;

  // La primera ronda sale entera antes de conocer ningun costo: el tope solo se revisa entre rondas (coordinador-lote.js).
  const peticionesPrimeraRonda = lote ? partidas * claves.filter((c) => agentesPorClave.get(c).tipo === 'modelo' && CONTENDIENTES[c]?.lote === true).length : 0;
  const errPrimera = errorDePrimeraRonda({ lote, tope, peticiones: peticionesPrimeraRonda });
  if (errPrimera) salir(errPrimera);

  const ritmo = o.ritmo !== undefined ? Number(o.ritmo) : usaModelos && modo === 'gratis' ? 18 : null;
  if (ritmo !== null && !(ritmo > 0)) salir('--ritmo debe ser un numero mayor que 0 (llamadas por minuto).');
  const limitador = ritmo ? crearLimitador({ porMinuto: ritmo }) : null;

  const fecha = new Date().toISOString().slice(0, 10);
  const etiquetaBase = `${fecha}-${idJuego}-${claves.join('-vs-')}`;

  // Con lote, los modelos que tienen variante de lote piden por el coordinador; los demas siguen llamando normal.
  let coordinador = null;
  if (lote) {
    const cliente = crearCliente();
    let saldo;
    try {
      saldo = await cliente.credito();
    } catch (err) {
      salir(`No pude consultar el saldo de OpenRouter (${err.message}). Sin saldo confirmado no se envia ningun lote.`);
    }
    if (saldo.restante < tope) {
      salir(`Saldo insuficiente: quedan ${dolares(saldo.restante)} en OpenRouter y --tope=${tope}. Carga credito o baja el tope.`);
    }
    consola.log(`\n  Saldo de OpenRouter: ${dolares(saldo.restante)}`);
    // Cada lote enviado se anota EN DISCO al instante (un renglon por evento): si la consola se cierra o el equipo se suspende
    // a las 3 horas, el lote sigue en OpenRouter y se cobra, y aqui quedan sus ids para leerlo con herramientas/ver-lote.mjs.
    const hora = new Date().toISOString().slice(11, 19).replaceAll(':', '');
    const rutaLog = resolve(raiz, 'data', 'pruebas', `${etiquetaBase}.${hora}.lotes.jsonl`);
    mkdirSync(dirname(rutaLog), { recursive: true });
    consola.log(`  Registro de lotes (se escribe al enviar cada uno): data/pruebas/${basename(rutaLog)}`);
    coordinador = crearCoordinador({
      cliente,
      cadaMs: sondeo * 1000,
      tope,
      ...(sincrono ? { sincrono } : {}),
      alEvento: (e) => {
        if (e.tipo !== 'estado') appendFileSync(rutaLog, `${JSON.stringify({ t: new Date().toISOString(), ...e })}\n`);
        if (e.tipo === 'enviado') consola.log(`  [lote] enviado ${e.id} · ${e.modelo} · ${e.n} peticion(es)`);
        if (e.tipo === 'listo') consola.log(`  [lote] ${e.modelo}: ${e.estado} en ${e.segundos}s · ${dolares(e.costo)}`);
        if (e.tipo === 'aviso') consola.log(`  ! ${e.texto}`);
      },
    });
    for (const c of claves) if (agentesPorClave.get(c).tipo === 'modelo') agentesPorClave.set(c, agenteModeloEnLote(c, coordinador));
  }

  const seedBase = o.seed ? Number(o.seed) : seedDesdeTexto(etiquetaBase);
  const plan = planDeSerie({ claves, partidas, seedBase, rotar, mismoSeed });

  consola.log(`\n  ${juego.nombre}`);
  consola.log(`  ${todos.map((a) => a.nombre).join('  vs  ')}`);
  consola.log(`  ${partidas} partida(s) · seed base ${seedBase}${mismoSeed ? ' · mismo mapa en toda la serie' : ''} · destino ${destino}${turnos !== null ? ` · cortadas a ${turnos} turno(s)` : ''}`);
  if (usaModelos) {
    const llamadas = estimarLlamadas(juego, k, partidas);
    const hasta = llamadas ? ` · hasta ~${turnos !== null ? Math.min(llamadas, turnos * k * partidas) : llamadas} llamadas` : '';
    consola.log(
      lote
        ? `  MODO PAGO POR LOTE: mitad de precio, tarda de minutos a horas · tope ${dolares(tope)} (se revisa entre rondas) · primera ronda: ${peticionesPrimeraRonda} peticiones${hasta}`
        : modo === 'gratis'
          ? `  MODO GRATIS: no gasta credito (tope de OpenRouter: 20 por minuto y 1,000 por dia con 10 USD comprados; 50 por dia sin comprar)${hasta}`
          : `  MODO PAGO: esta ejecucion puede gastar credito de OpenRouter${hasta}`
    );
  }
  for (const aviso of avisosDeSerie({ k, partidas, rotar, mismoSeed })) consola.log(`  ! ${aviso}`);
  consola.log('');

  // En serie se ve avanzar cada partida con puntos ("Partida 2/4 ....  gana X"); en lote todas corren a la vez y cada una
  // avisa una sola linea al terminar.
  const alTerminar = (r, p) => {
    const nombres = r.jugadores.map((j) => j.nombre);
    const texto = r.truncada ? `cortada a ${r.rondas.length} turno(s)` : r.empate ? `empate ${r.puntos.join('-')}` : `gana ${nombres[r.ganador]} ${r.puntos.join('-')}`;
    consola.log(`${lote ? `  Partida ${p.n + 1}/${partidas}` : ''}  ${texto}${r.mapa?.bioma ? ` · bioma ${r.mapa.bioma}` : ''}`);
    const fallos = r.rondas.flatMap((x) => x.errores.filter(Boolean));
    if (fallos.length) consola.log(`     ! ${fallos.length} error(es) de API: ${fallos[0].slice(0, 90)}`);
    for (const aviso of r.avisos) consola.log(`     ! ${aviso}`);
  };
  const resultados = await ejecutarSerie({
    juego, plan, agentesPorClave, paralelo: lote, maxRondas: turnos, limitador, alTerminar, opciones: opcionesDeJuego,
    ...(lote ? {} : { alEmpezar: (p) => consola.escribir(`  Partida ${p.n + 1}/${partidas} `), alRegistrar: () => consola.escribir('.') }),
  });

  // Evaluacion al final de la serie (opcional, la ofrece cada juego): caracteristicas de las IAs y un comentario del resultado, calculados
  // de los datos guardados. Si falla no se pierde la serie: solo se avisa.
  let evaluacion = null;
  if (typeof juego.evaluar === 'function') {
    try {
      evaluacion = juego.evaluar(resultados);
    } catch (err) {
      consola.log(`  ! No se pudo armar la evaluación: ${String(err?.message ?? err).slice(0, 120)}`);
    }
  }

  const estadisticas = coordinador?.estadisticas() ?? null;
  // Con el tope alcanzado, o con los envios detenidos por un fallo de infraestructura, hay turnos que no se pudieron pedir:
  // esa serie no es un resultado, aunque quede guardada.
  if ((estadisticas?.topeAlcanzado || estadisticas?.detenido) && destino === 'oficial') destino = 'pruebas';

  const carpeta = destino === 'pruebas' ? resolve(raiz, 'data', 'pruebas') : resolve(raiz, 'data');
  const ruta = rutaLibre(resolve(carpeta, `${etiquetaBase}.json`));
  const etiqueta = basename(ruta, '.json');

  const salida = {
    etiqueta,
    fecha: new Date().toISOString(),
    juego: { id: juego.id, nombre: juego.nombre, categoria: juego.categoria },
    seedBase,
    // Con que prompt se midio: version global, version de las reglas de este juego y la huella del prompt de sistema completo
    // (si algo del texto cambia, la huella cambia: dos resultados con huellas distintas no se comparan).
    prompt: { version: VERSION_PROMPT, reglas: juego.versionReglas ?? null, hash: createHash('sha256').update(construirSistema(juego)).digest('hex') },
    // "gratis" | "pago" | null (solo estrategias base, sin API). Los resultados de modelos gratis son de practica.
    modo: usaModelos ? modo : null,
    destino,
    jugadores: claves,
    serie: { partidas, rotar, mismoSeed },
    // Con que parametros se midio (se congelan junto con el prompt): el razonamiento que se le pidio a cada modelo.
    parametros: {
      temperatura: PARAMETROS.temperatura,
      maxTokens: PARAMETROS.maxTokens,
      razonamiento: Object.fromEntries(claves.filter((c) => agentesPorClave.get(c).tipo === 'modelo').map((c) => [c, CONTENDIENTES[c].razonamiento ?? null])),
    },
    ...(lote ? { lote: estadisticas } : {}),
    ...(turnos !== null ? { turnos } : {}),
    ...(evaluacion?.partidas ? { evaluacion } : {}),
    partidas: resultados,
  };

  mkdirSync(carpeta, { recursive: true });
  writeFileSync(ruta, JSON.stringify(salida, null, 2));

  const tokens = resultados.reduce((s, r) => s + r.tokensUsados, 0);
  const llamadas = resultados.reduce((s, r) => s + r.llamadas, 0);
  const rel = `data/${destino === 'pruebas' ? 'pruebas/' : ''}${etiqueta}.json`;
  consola.log(`\n  Guardado: ${rel}`);
  consola.log(`  Llamadas: ${llamadas}${tokens ? ` · Tokens usados: ${tokens.toLocaleString('es-MX')}` : ''}`);
  if (evaluacion?.comentario?.length) {
    consola.log('\n  EVALUACION DE LA SERIE');
    for (const l of evaluacion.comentario) consola.log(`  ${l.texto}`);
  }
  if (estadisticas) {
    consola.log(`  Lotes: ${estadisticas.lotes} (${estadisticas.peticiones - estadisticas.sincronas} peticiones) · llamadas normales: ${estadisticas.sincronas} · gasto informado por OpenRouter: ${dolares(estadisticas.gasto)} de ${dolares(tope)}`);
    if (estadisticas.topeAlcanzado) consola.log('  ! Se alcanzo el tope de gasto: faltaron turnos por pedir. Es una serie incompleta; se guardo en pruebas.');
    if (estadisticas.detenido) consola.log(`  ! Envios detenidos: ${estadisticas.detenido}. Es una serie incompleta; se guardo en pruebas.`);
    if (estadisticas.gasto > tope) consola.log(`  ! El gasto informado (${dolares(estadisticas.gasto)}) paso el tope (${dolares(tope)}): el tope se revisa entre rondas, no durante una.`);
  }
  consola.log(
    destino === 'pruebas'
      ? '  Practica: el marcador no lo lee (para verlo: node src/marcador.js --data=data/pruebas --salida=marcador-pruebas.json)\n'
      : '  Siguiente: node src/marcador.js  ·  luego abre web/replay.html\n'
  );
  return { ruta, salida };
}

// Solo corre como programa, no al importarlo desde las pruebas.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await correr(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof ErrorDeUso)) throw err;
    console.error(`\n  ${err.message}\n`);
    process.exit(1);
  }
}
