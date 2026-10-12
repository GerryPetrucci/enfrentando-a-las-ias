// Piezas puras de la consola (src/correr.js): argumentos, series de rotacion, estimacion de llamadas, modo y destino
// de los archivos. Aqui no se llama a ninguna API ni se corre ninguna partida, por eso se prueba con npm test.

import { existsSync } from 'node:fs';

export function parsearArgumentos(argv) {
  const o = {};
  for (const a of argv) {
    const m = a.match(/^--([^=]+)=?(.*)$/);
    if (m) o[m[1]] = m[2] === '' ? true : m[2];
  }
  return o;
}

// `--jugadores=a,b,c,d` (de 2 a 5 reinos) o, para un duelo, `--a=... --b=...`.
export function jugadoresDe(o) {
  if (typeof o.jugadores === 'string') return o.jugadores.split(',').map((s) => s.trim()).filter(Boolean);
  return [o.a || 'tomaydaca', o.b || 'siempre-t'];
}

export function errorDeCantidad(juego, n) {
  const min = juego.minJugadores ?? juego.jugadores, max = juego.maxJugadores ?? juego.jugadores;
  if (n >= min && n <= max) return null;
  return `${juego.nombre} se juega con ${min === max ? min : `entre ${min} y ${max}`} jugadores y llegaron ${n}.`;
}

// Serie de rotacion: en la partida n el asiento s lo ocupa el jugador (s + n) % k, asi que en k partidas cada jugador
// pasa por cada asiento una vez. Con `mismoSeed` el mapa es el mismo en todas; sin el, cada partida usa otro seed.
export function planDeSerie({ claves, partidas, seedBase, rotar = true, mismoSeed = false }) {
  const k = claves.length;
  return Array.from({ length: partidas }, (_, n) => {
    const rotacion = rotar ? n % k : 0;
    return {
      n,
      rotacion,
      claves: Array.from({ length: k }, (_, s) => claves[(s + rotacion) % k]),
      seed: mismoSeed ? seedBase >>> 0 : (seedBase + n * 7919) >>> 0,
    };
  });
}

// Las dos trampas de la tabla: asientos repartidos a medias y asientos sin rotar (docs/metodologia.md, secciones 2 y 7).
export function avisosDeSerie({ k, partidas, rotar, mismoSeed = false }) {
  const avisos = [];
  if (mismoSeed) {
    avisos.push(`Todas las partidas de esta serie comparten el mismo mundo (mismo seed): son ${k} combinaciones distintas, no ${partidas} muestras independientes. Para publicar, suma varias series con --seed distintos.`);
  }
  if (rotar && partidas % k !== 0) {
    avisos.push(`La serie queda desbalanceada: ${partidas} partida(s) con ${k} jugadores no reparten los asientos por igual (usa multiplos de ${k}).`);
  }
  if (!rotar && partidas > 1 && k > 1) {
    avisos.push('Sin rotar los asientos, este resultado no sirve para publicar (docs/metodologia.md, seccion 2).');
  }
  return avisos;
}

// Tope de llamadas si nadie cae antes: partidas x rondas x jugadores. Solo orienta; la arena cuenta las reales.
// Un juego por turnos (decide un solo jugador en cada turno) declara `llamadasMax` por partida y no se multiplica por los jugadores.
export const estimarLlamadas = (juego, k, partidas) => {
  if (juego.llamadasMax) return partidas * juego.llamadasMax;
  return juego.rondas ? partidas * juego.rondas * k : null;
};

// Donde se guarda: los modelos gratis y los economicos de practica (practica: true en src/modelos.js) son practica
// (data/pruebas/, que el marcador no lee); lo demas es oficial. Un resultado de practica no puede mandarse a oficial ni pidiendolo.
export function destinoDe({ modo, destino, practica = false }) {
  if (destino === undefined) return modo === 'gratis' || practica ? 'pruebas' : 'oficial';
  if (destino !== 'oficial' && destino !== 'pruebas') throw new Error('--destino debe ser "oficial" o "pruebas".');
  if (practica && destino === 'oficial') throw new Error('Los modelos economicos de practica (practica: true en src/modelos.js) no pueden mandar su resultado a --destino=oficial.');
  return destino;
}

// Gratis o pago se elige en CADA ejecucion con modelos. Devuelve el texto del error, o null si todo esta bien.
export function errorDeModo({ modo, agentes, contendientes }) {
  if (!agentes.some((a) => a.tipo === 'modelo')) return null;
  const lista = (gratis) => Object.entries(contendientes).filter(([, c]) => !!c.gratis === gratis).map(([k]) => k).join(', ');
  if (modo !== 'gratis' && modo !== 'pago') {
    return (
      'Elige el modo de esta ejecucion:\n' +
      '    --modo=gratis   solo modelos gratis, no gasta credito  (' + lista(true) + ')\n' +
      '    --modo=pago     puede gastar credito de OpenRouter    (' + lista(false) + ')'
    );
  }
  const caros = [...new Set(agentes.filter((a) => a.tipo === 'modelo' && !a.gratis).map((a) => a.id))];
  if (modo === 'gratis' && caros.length) {
    return `Modo gratis: ${caros.join(' y ')} gasta credito.\n    Usa modelos gratis (${lista(true)}) o corre con --modo=pago.`;
  }
  return null;
}

// Un resultado de pago cuesta dinero: nunca se escribe encima de otro. Si el archivo existe, se agrega -2, -3...
export function rutaLibre(ruta, existe = existsSync) {
  if (!existe(ruta)) return ruta;
  const base = ruta.replace(/\.json$/, '');
  for (let n = 2; ; n++) {
    const candidata = `${base}-${n}.json`;
    if (!existe(candidata)) return candidata;
  }
}

// --lote manda las jugadas por la Batch API de OpenRouter: mitad de precio, sin prisa. Devuelve el texto del error, o null si todo
// esta bien. Exige modo pago y un tope de gasto en dolares: el coordinador deja de enviar lotes nuevos cuando el gasto informado lo
// alcanza. OJO: el tope se revisa ANTES de cada lote, no durante; un lote ya enviado se cobra completo y la primera ronda sale
// entera (ver errorDePrimeraRonda). `contendientes` es opcional: permite revisar que algun modelo tenga variante de lote.
export function errorDeLote({ lote, modo, tope, agentes, contendientes = null, juego = null }) {
  if (!lote) return null;
  const modelos = agentes.filter((a) => a.tipo === 'modelo');
  if (!modelos.length) return '--lote solo aplica a modelos: con bots o estrategias base no hay nada que mandar a la API.';
  // un juego por turnos mandaria un lote por cada turno, de uno en uno: hasta 96 esperas seguidas (cada una puede tardar horas)
  if (juego?.soloEnVivo) return `${juego.nombre} se juega por turnos, de uno en uno (hasta ${juego.llamadasMax ?? juego.rondas} turnos seguidos): no admite --lote porque cada turno esperaria su propio lote. Corre en vivo.`;
  if (modo !== 'pago') return '--lote gasta credito de OpenRouter: agrega --modo=pago.';
  if (!(Number.isFinite(tope) && tope > 0)) return '--lote exige --tope=DOLARES (mayor que 0): el gasto a partir del cual ya no se envian lotes nuevos, por ejemplo --tope=0.50.';
  if (contendientes && !modelos.some((a) => contendientes[a.id]?.lote === true)) {
    return 'Ninguno de los modelos tiene variante de lote (:batch): --lote no ahorraria nada. Quitalo o suma un modelo con lote.';
  }
  return null;
}

// Cota generosa (no un precio) de lo que puede costar UNA peticion por lote en el peor caso: 4000 tokens de salida al precio de
// lote mas alto del registro (Gemini Flash-Lite, ~$1.25 por millon) mas la entrada. Sirve para que el tope no sea solo una promesa.
export const COSTO_MAXIMO_PETICION = 0.006;

// La primera ronda de un lote sale ENTERA antes de conocer ningun costo (el tope se revisa entre rondas): si en el peor caso ya
// cuesta mas que el tope, no tiene sentido empezar. `peticiones` = partidas x modelos con variante de lote.
export function errorDePrimeraRonda({ lote, tope, peticiones }) {
  if (!lote || !(peticiones > 0)) return null;
  const peor = peticiones * COSTO_MAXIMO_PETICION;
  if (peor <= tope) return null;
  return `La primera ronda envia ${peticiones} peticiones de golpe y, en el peor caso (~$${COSTO_MAXIMO_PETICION} cada una), podria costar $${peor.toFixed(2)}: mas que --tope=${tope}. El tope se revisa entre rondas, no durante una. Baja --partidas o sube --tope.`;
}
