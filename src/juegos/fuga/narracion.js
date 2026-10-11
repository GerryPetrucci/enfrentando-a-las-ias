// La historia publica de La Fuga. Se cuenta desde lo que registro el motor, con frases de plantilla que varian segun el seed:
// no hay llamadas extra a modelos y lo que se ve es lo que paso. Los nombres de las IAs son {0} y {1} (el asiento): el
// reproductor los reemplaza con resolverNombres. El texto es PUBLICO (lleva acentos); lo que ven las IAs vive en vista.js.
//
// La narracion usa su PROPIO flujo aleatorio (derivado de estado.semillaNarracion): cambiar una frase nunca cambia los dados.

import { crearRng } from '../../rng.js';
import { RONDAS, PUNTOS, nivelAlerta } from './constantes.js';

const elegir = (rng, lista) => lista[Math.floor(rng() * lista.length)];
const pct = (p) => `${Math.round(p * 100)} %`;

const POSTURA = {
  ayudar: (n) => `${n} ayuda a su compañero`,
  avanzar: (n) => `${n} sigue adelante junto a su compañero`,
  sacrificarse: (n) => `${n} se ofrece a cargar con el riesgo`,
  separarse: (n) => `${n} suelta a su compañero y se lanza solo`,
};
const METODO = { sigilo: 'en silencio', fuerza: 'a la fuerza', engano: 'con un engaño', esperar: 'esperando el momento justo' };
const METODO_NOMBRE = { sigilo: 'el sigilo', fuerza: 'la fuerza', engano: 'el engaño', esperar: 'esperar' };
const RESULTADO = {
  limpio: ['{n} pasa sin un rasguño.', '{n} cruza limpio, sin hacer ruido.', 'A {n} todo le sale bien.'],
  tropezo: ['{n} tropieza: pasa herido y salta una alarma.', '{n} se golpea al pasar y deja un rastro de ruido.', 'A {n} se le complica: pasa, pero herido.'],
  cayo: ['{n} cae en manos de los guardias.', 'Los guardias atrapan a {n}.', '{n} no lo logra y queda capturado.'],
};

// ctx: ver la descripcion de la tarea 5. `E` ya trae la alarma y la cohesion DESPUES de la ronda.
export function narrarRonda({ E, num, sit, def, jugadas, fallos, resultados, tentacion, salen = [false, false], alarmaAntes, cohesionAntes }) {
  const rng = crearRng((E.semillaNarracion ^ Math.imul(num, 0x9e3779b1)) >>> 0);
  const lineas = [];
  const agregar = (tipo, texto) => lineas.push({ tipo, texto });
  const activos = [0, 1].filter((i) => jugadas[i]);

  agregar('apertura', `Situación ${num} de ${RONDAS} · ${def.titulo}. ${elegir(rng, def.aperturas)}`);

  for (const i of activos) {
    const n = `{${i}}`;
    const sujeto = activos.length === 1 ? `${n} sigue solo` : POSTURA[jugadas[i].postura](n);
    agregar('decision', `${sujeto} ${METODO[jugadas[i].metodo]}.`);
  }

  const reales = activos.map((i) => `{${i}} ${pct(fallos[i])}`).join(', ');
  agregar('verdad', `Probabilidad real de fallar: ${reales}. La pista ${sit.pistaFiable ? 'decía la verdad' : 'engañaba'}: lo mejor era ${METODO_NOMBRE[def.mejor]}.`);

  for (const i of activos) agregar('resultado', elegir(rng, RESULTADO[resultados[i]]).replaceAll('{n}', `{${i}}`));

  // salida anticipada: quien se separo y encontro su ruta propia deja la partida
  const fuera = [0, 1].filter((i) => salen[i]);
  if (fuera.length === 2) agregar('consecuencia', 'Los dos encuentran su propia ruta y escapan por separado.');
  else if (fuera.length === 1) agregar('consecuencia', `{${fuera[0]}} encuentra una ruta propia y escapa por su cuenta; {${1 - fuera[0]}} se queda atrás.`);

  // el objeto viene en la tentacion del registro: en solitario puede ser uno que el catalogo no trae para esa situacion
  if (tentacion?.tipo === 'botin') {
    agregar('consecuencia', tentacion.tomo === null ? `Nadie se atreve a tomar ${tentacion.objeto}.` : `{${tentacion.tomo}} se queda con ${tentacion.objeto}.`);
  } else if (tentacion?.tipo === 'oferta') {
    agregar('consecuencia', tentacion.delataron.length === 0
      ? 'Nadie acepta la oferta del guardia.'
      : tentacion.delataron.map((i) => `{${i}} acepta la oferta del guardia y delata a su compañero.`).join(' '));
  }

  const antes = nivelAlerta(alarmaAntes), ahora = nivelAlerta(E.alarma);
  if (antes !== ahora) agregar('consecuencia', `La alerta ${E.alarma > alarmaAntes ? 'sube' : 'baja'} a «${ahora}».`);
  if (E.cohesion < cohesionAntes - 1) agregar('consecuencia', 'La confianza entre los dos se resquebraja.');
  else if (E.cohesion > cohesionAntes) agregar('consecuencia', 'Su confianza crece.');

  return lineas;
}

// El cierre de la historia. Solo existe cuando la partida termino.
export function narrarEpilogo(E) {
  if (!E.fin) return [];
  const [a, b] = E.finales;
  const lineas = [];
  const agregar = (texto) => lineas.push({ tipo: 'epilogo', texto });
  if (a === 'conjunto') {
    agregar('Los dos cruzan la reja final. Escapan juntos.');
  } else if (a === 'solo' || b === 'solo') {
    const quien = a === 'solo' ? 0 : 1;
    agregar(`{${quien}} cruza la reja final. Escapa solo; {${1 - quien}} se queda atrás.`);
  } else if (a === 'capturado' && b === 'capturado') {
    agregar('Nadie logra salir. La prisión se cierra sobre los dos.');
  } else {
    // al menos uno escapo por su cuenta a mitad de camino
    for (const i of [0, 1]) {
      const f = E.finales[i];
      if (f === 'anticipada') agregar(`{${i}} escapó por su cuenta a mitad de camino.`);
      else if (f === 'abandonado') agregar(`{${i}}, abandonado, siguió solo y logró salir.`);
      else agregar(`{${i}} no logra salir.`);
    }
  }
  // los extras (botin y delacion) solo cuentan si escapas: quien fue capturado los pierde
  for (const i of [0, 1]) {
    const n = E.perdidos?.[i] ?? 0;
    if (n > 0) agregar(`Se pierden los extras de {${i}} (${n} punto${n === 1 ? '' : 's'}): no logró salir.`);
  }
  // la revelacion: lo que valia salir por su cuenta, y el premio de quien se quedaba atras y aun asi salia
  if (E.finales.some((f) => f === 'solo' || f === 'anticipada' || f === 'abandonado')) {
    agregar(`Lo que ninguno sabía: salir solo valía ${PUNTOS.escapeSolo} puntos.`);
  }
  if (E.finales.includes('abandonado')) agregar(`Y quien se quedaba atrás y aun así lograba salir cobraba ${PUNTOS.escapeAbandonado}.`);
  const [p0, p1] = E.puntos;
  agregar(`Puntos finales: {0} ${p0}, {1} ${p1}. ${p0 === p1 ? 'Empate.' : `Gana {${p0 > p1 ? 0 : 1}}.`}`);
  return lineas;
}

// {0} y {1} -> los nombres de las IAs de esa partida (jugadores = lo que guarda la arena en cada partida)
export const resolverNombres = (texto, jugadores) =>
  String(texto).replace(/\{([01])\}/g, (_, k) => jugadores?.[k]?.nombre ?? `Prisionero ${Number(k) + 1}`);
