// El narrador de la Guerra de territorios: decide QUE se dice en voz alta (y se subtitula) de cada turno. La lista de hechos sigue en cada beat (`lineas`) y a la vista en la pantalla (mapa, flechas,
// feed): aqui solo se elige como contarlos. Lo que es historia se dice literal, lo rutinario se resume en una frase de contexto y lo repetido se calla.
//
//   literal   privados, traiciones, batallas con tarjeta, pactos, caidas, conquistas, Maravilla, el final y los avisos de respuesta ilegible: tal cual, con su clave.
//   contexto  una frase tipo `comentario` (cursiva en los subtitulos, como en los otros juegos) que cuenta lo que pasa en general: «salen a expandirse», «se reparten siete regiones»,
//             el hambre que se alarga, el panorama cada pocos turnos. Cada cifra sale de los registros; ninguna frase lleva codigos de region.
//   silencio  la racha de expansion que ya se dijo y el hambre larga: sus hechos quedan anotados como `mudas` (nada se pierde sin que nadie lo sepa).
//
// Cada juego se publica en dos partes y en clips, asi que ninguna frase presupone algo que quien ve solo esa parte no vio: nada de «vuelve a», «sigue» ni «igual que en el turno N»; cada una dice lo que
// pasa (y cuantos turnos lleva). Todo son reglas sobre lo que ya esta guardado: sin llamadas a modelos, sin azar, mismo resultado siempre. Los ajustes editoriales estan arriba para cambiarlos sin tocar la logica.
// Sin DOM ni `window`: lo importan la linea de tiempo (navegador y Node) y las pruebas.

import { objetos } from './linea-comun.js';

export const AJUSTES = {
  PANORAMA_CADA: 5, // un panorama (quien va primero, quien cierra) en los turnos 5, 10, 15...
  MAX_CITA: 120, // largo maximo, en caracteres, de un mensaje publico que la voz cita tal cual
  PARES_LITERALES: 2, // cuantas parejas «A ataca a B» se nombran una por una; con mas parejas se cuentan los ataques
  NOMBRAR_HASTA: 3, // cuantos reinos se nombran en una lista; con mas se cuentan («cuatro reinos»)
};

const PALABRAS = ['cero', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'];
// Hasta diez en palabras (una region, un turno); mas, o lo que no es un entero, en cifras.
export function enPalabras(n, genero = 'f') {
  if (!Number.isInteger(n) || n < 0 || n > 10) return String(n);
  if (n === 1) return genero === 'm' ? 'un' : 'una';
  return PALABRAS[n];
}

// «A», «A y B», «A, B y C».
export function listaDeNombres(nombres) {
  const l = Array.isArray(nombres) ? nombres.filter((x) => typeof x === 'string' && x) : [];
  return l.length <= 1 ? l.join('') : `${l.slice(0, -1).join(', ')} y ${l.at(-1)}`;
}

const regiones = (n) => `${enPalabras(n)} ${n === 1 ? 'región' : 'regiones'}`;
const tropasEnPalabras = (n) => `${enPalabras(n)} ${n === 1 ? 'tropa' : 'tropas'}`;
const mayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const entero = (x) => Number.isInteger(x) && x >= 0;

// Un narrador por partida: recuerda de un turno al siguiente si la expansion ya se dijo, a quien se ha citado, quien lleva hambre, si ya se dijo (o ya hubo) una batalla y si el mapa se movio. Los turnos se le piden EN ORDEN.
//   nombre(k) -> nombre del reino k · reinos -> cuantos reinos tiene la partida
export function crearNarrador({ nombre = (k) => `Jugador ${Number(k) + 1}`, reinos = 0 } = {}) {
  const nom = (k) => String(nombre(k));
  const memoria = {
    expansion: false, // ¿el turno anterior hubo salidas a regiones sin dueño? (una racha se dice una vez)
    citas: new Map(), // reino -> los textos de el que ya se citaron
    hambre: new Map(), // reino -> { turno, racha, total }
    avisoBatalla: false, // ya hubo una batalla o ya se dijo «todavia no hay una sola»: no se dice (mas)
    huella: null, ultimoCambio: 0, cambios: false, // el dueño de cada region al cierre del turno anterior (como texto), el ultimo turno en que algo cambio, y ¿cambio algo desde el ultimo panorama?
    panorama: null, // el ultimo panorama dicho: { sinCambios } (¿ya se dijo que el mapa no se mueve?)
  };

  // «Ana, Beto y Cira salen a expandirse: mandan tropas a regiones sin dueño.» «Todos» solo si se sabe que son todos los que siguen en pie (`vivos`).
  function fraseDeExpansion(quienes, vivos) {
    const todos = quienes.length >= 2 && quienes.length === vivos;
    const sujeto = todos ? (vivos === 2 ? 'Los dos reinos' : 'Todos los reinos')
      : quienes.length <= AJUSTES.NOMBRAR_HASTA ? listaDeNombres(quienes.map(nom)) : `${mayuscula(enPalabras(quienes.length, 'm'))} reinos`;
    const uno = quienes.length === 1;
    return `${sujeto} ${uno ? 'sale' : 'salen'} a expandirse: ${uno ? 'manda' : 'mandan'} tropas a regiones sin dueño.`;
  }

  // Los ataques contra regiones de otro reino: por parejas (hasta PARES_LITERALES) o contados; el detalle lo dan las tarjetas de batalla.
  function fraseDeOfensiva(ajenos) {
    const pares = new Map();
    for (const a of ajenos) { const id = `${a.k}|${a.contra}`, p = pares.get(id) ?? { k: a.k, contra: a.contra, n: 0 }; p.n++; pares.set(id, p); }
    if (pares.size <= AJUSTES.PARES_LITERALES) return [...pares.values()].map((p) => `${nom(p.k)} lanza ${p.n === 1 ? 'un ataque' : `${enPalabras(p.n)} ataques`} contra ${nom(p.contra)}.`).join(' ');
    return `Hay ${enPalabras(ajenos.length)} ataques contra otros reinos.`;
  }

  // Un mensaje publico por turno, tal cual: el del reino al que menos se ha citado (reparto parejo; empata el de menor asiento), nunca uno ya citado, vacio o demasiado largo.
  function elegirCita(mensajes, turno) {
    const dichas = (k) => memoria.citas.get(k) ?? new Set();
    const candidatos = mensajes
      .map((m, i) => ({ k: m.k, texto: typeof m.texto === 'string' ? m.texto.trim() : '', i }))
      .filter((m) => entero(m.k) && m.texto && m.texto.length <= AJUSTES.MAX_CITA && !dichas(m.k).has(m.texto))
      .sort((a, b) => dichas(a.k).size - dichas(b.k).size || a.k - b.k || a.i - b.i);
    if (!candidatos.length) return null;
    const m = candidatos[0];
    memoria.citas.set(m.k, dichas(m.k).add(m.texto));
    return { texto: `${nom(m.k)} dice: «${m.texto}»`, clave: `msg:${turno}:${m.k}:${m.i}` };
  }

  // ctx: { turno, ataques: [{ k, contra }] (TODOS los ataques del turno: `contra` es el dueño de la region atacada, -1 si no tiene), literales: [{ tipo: 'ataque' | 'privado' | 'ilegible', texto, clave }]
  // (las lineas de hecho de hoy), mensajes: [{ k, texto }] (los publicos), vivos: reinos en pie al empezar el turno (si no se sabe, no se dice «todos») }  ->  { dicho, mudas, extras }
  //   dicho  lo que se dice: [{ tipo: 'hecho' | 'comentario', texto, clave?, cubre? }]; `cubre` lista los hechos que la frase reemplaza
  //   mudas  claves de hechos que no se dicen (la racha de expansion que ya se dijo)
  //   extras hechos NUEVOS que el narrador cito (los mensajes publicos): el beat los suma a sus lineas
  function ordenes(c) {
    const ctx = c && typeof c === 'object' ? c : {};
    const ataques = objetos(ctx.ataques).filter((a) => entero(a.k)), literales = objetos(ctx.literales), mensajes = objetos(ctx.mensajes);
    const dicho = [], mudas = [], extras = [];
    const reemplazadas = literales.filter((l) => l.tipo === 'ataque' && typeof l.clave === 'string').map((l) => l.clave);
    const quienes = [...new Set(ataques.filter((a) => a.contra === -1).map((a) => a.k))].sort((a, b) => a - b);
    const ajenos = ataques.filter((a) => entero(a.contra));
    const frases = [];
    if (quienes.length && !memoria.expansion) frases.push(fraseDeExpansion(quienes, ctx.vivos));
    memoria.expansion = quienes.length > 0;
    if (ajenos.length) frases.push(fraseDeOfensiva(ajenos));
    if (frases.length) dicho.push({ tipo: 'comentario', texto: frases.join(' '), cubre: reemplazadas });
    else mudas.push(...reemplazadas);
    const cita = elegirCita(mensajes, ctx.turno);
    if (cita) { dicho.push({ tipo: 'hecho', ...cita }); extras.push(cita); }
    for (const l of literales.filter((x) => x.tipo !== 'ataque' && typeof x.texto === 'string')) dicho.push({ tipo: 'hecho', texto: l.texto, clave: l.clave });
    return { dicho, mudas, extras };
  }

  // El hambre en escalones por reino: la primera vez, el segundo turno seguido, al tercero cuantos lleva y cuanto ha perdido; despues solo cada cinco (el feed la sigue mostrando). null = callada.
  function textoDeHambre(h, turno) {
    if (!entero(h.k) || !Number.isFinite(h.n) || !Number.isInteger(turno)) return h.texto;
    const previa = memoria.hambre.get(h.k), seguida = previa?.turno === turno - 1;
    const racha = seguida ? previa.racha + 1 : 1, total = (seguida ? previa.total : 0) + h.n;
    memoria.hambre.set(h.k, { turno, racha, total });
    if (racha === 1) return `${nom(h.k)} pasa hambre y pierde ${tropasEnPalabras(h.n)}.`;
    if (racha === 2) return `${nom(h.k)} pasa hambre por segundo turno seguido y pierde ${tropasEnPalabras(h.n)}.`;
    if (racha === 3 || racha % 5 === 0) return `${nom(h.k)} lleva ${enPalabras(racha, 'm')} turnos con hambre y ya perdió ${tropasEnPalabras(total)}.`;
    return null;
  }

  // Las regiones sin dueno que se tomaron sin lucha, por reino. «Todavia no hay una sola batalla» una vez, y solo si de verdad no ha habido ningun combate.
  function fraseDeTomas(tomas) {
    const cuenta = new Map();
    for (const t of tomas) cuenta.set(t.k, (cuenta.get(t.k) ?? 0) + 1);
    const ranking = [...cuenta].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    const mayor = ranking[0][1], solo = ranking.length === 1;
    let frase = ranking.every(([, n]) => n === mayor)
      ? `${listaDeNombres(ranking.map(([k]) => nom(k)))} ${solo ? 'toma' : 'toman'} ${regiones(mayor)} sin dueño${solo ? '' : ' cada uno'}.`
      : `Se reparten ${regiones(tomas.length)} sin dueño: ${listaDeNombres(ranking.map(([k, n], i) => `${nom(k)} ${i === 0 ? 'se queda con' : 'con'} ${enPalabras(n)}`))}.`;
    if (!memoria.avisoBatalla) { memoria.avisoBatalla = true; frase += ' Todavía no hay una sola batalla.'; }
    return { texto: frase, porReino: ranking };
  }

  // Quien va primero y quien cierra, con las regiones que se ven en el marcador (las sin dueno no cuentan, los reinos caidos tampoco). null si no hay con quien compararse.
  // Si ninguna region cambio de dueno desde el ultimo panorama, no se repite: se dice UNA vez cuantos turnos lleva el mapa sin cambios y se calla hasta que algo cambie.
  function panorama(turno, estado) {
    const dueno = Array.isArray(estado?.dueno) ? estado.dueno : null;
    if (!dueno) return null;
    const cuentas = Array.from({ length: Number.isInteger(reinos) ? reinos : 0 }, (_, k) => [k, dueno.filter((d) => d === k).length]).filter(([k]) => estado.vivo?.[k] !== false);
    if (cuentas.length < 2) return null;
    if (memoria.panorama && !memoria.cambios) {
      if (memoria.panorama.sinCambios) return null;
      memoria.panorama.sinCambios = true;
      const n = turno - memoria.ultimoCambio;
      return { tipo: 'comentario', texto: `Turno ${turno}: el mapa lleva ${enPalabras(n, 'm')} ${n === 1 ? 'turno' : 'turnos'} sin cambios.`, datos: { turno, cuentas, sinCambios: true } };
    }
    memoria.cambios = false;
    memoria.panorama = { sinCambios: false };
    const tope = Math.max(...cuentas.map(([, n]) => n)), piso = Math.min(...cuentas.map(([, n]) => n));
    const lideres = cuentas.filter(([, n]) => n === tope).map(([k]) => k), ultimos = cuentas.filter(([, n]) => n === piso).map(([k]) => k);
    let texto;
    if (lideres.length === cuentas.length) texto = `Turno ${turno}: los ${enPalabras(cuentas.length, 'm')} reinos empatan con ${regiones(tope)}.`;
    else if (lideres.length === 1) texto = `Turno ${turno}: ${nom(lideres[0])} va primero con ${regiones(tope)}${ultimos.length === 1 ? ` y ${nom(ultimos[0])} cierra con ${enPalabras(piso)}` : ''}.`;
    else texto = `Turno ${turno}: ${listaDeNombres(lideres.map(nom))} empatan arriba con ${regiones(tope)}.`;
    return { tipo: 'comentario', texto, datos: { turno, cuentas } };
  }

  // ctx: { turno, hechos: [{ tipo, k, n?, clave, texto }] (los hechos de la resolucion: tipo 'toma' para una region sin dueno tomada sin lucha, y el tipo del evento en los demas), combates: cuantos
  // hubo este turno, despues: el estado al cierre, ultimo: true si es el ultimo turno de una partida terminada (viene el final: no hay panorama) }  ->  { dicho, mudas, extras }
  function resolucion(c) {
    const ctx = c && typeof c === 'object' ? c : {};
    const turno = ctx.turno;
    const hechos = objetos(ctx.hechos).filter((h) => typeof h.clave === 'string' && typeof h.texto === 'string');
    if (Number(ctx.combates) > 0) memoria.avisoBatalla = true;
    const huella = Array.isArray(ctx.despues?.dueno) ? ctx.despues.dueno.join() : null; // ¿cambio alguna region de dueno desde el turno anterior? (lo mira el panorama)
    if (huella !== null) {
      if (huella !== memoria.huella) { memoria.cambios = true; memoria.ultimoCambio = turno; }
      memoria.huella = huella;
    }
    const esToma = (h) => h.tipo === 'toma' && entero(h.k);
    const tomas = hechos.filter(esToma), comercios = hechos.filter((h) => h.tipo === 'comercio');
    const agrupar = comercios.length >= 2;
    const dicho = [], mudas = [];
    for (const h of hechos) {
      if (esToma(h) || (h.tipo === 'comercio' && agrupar)) continue;
      const texto = h.tipo === 'hambre' ? textoDeHambre(h, turno) : h.texto;
      if (texto === null) mudas.push(h.clave); else dicho.push({ tipo: 'hecho', texto, clave: h.clave });
    }
    if (agrupar) dicho.push({ tipo: 'comentario', texto: `Hay ${enPalabras(comercios.length)} intercambios comerciales entre los reinos.`, cubre: comercios.map((h) => h.clave) });
    if (tomas.length) {
      const f = fraseDeTomas(tomas);
      dicho.push({ tipo: 'comentario', texto: f.texto, cubre: tomas.map((h) => h.clave), datos: { porReino: f.porReino } }); // `datos`: las cifras que dice la frase, para que una prueba las compare con los registros
    }
    if (Number.isInteger(turno) && turno > 0 && turno % AJUSTES.PANORAMA_CADA === 0 && ctx.ultimo !== true) {
      const p = panorama(turno, ctx.despues);
      if (p) dicho.push(p);
    }
    return { dicho, mudas, extras: [] };
  }

  return { ordenes, resolucion };
}
