// Combinaciones de Triple dado: categoria y fuerza de tres dados, desempate y reparto de puntos. Todo puro (sin estado) y en docenos enteros.

import { PUNTOS_POSICION, DOCEAVOS, PREMIO_ZERO, RANGOS } from './constantes.js';

// Tres dados (1 a 6, en cualquier orden) -> categoria y una clave numerica comparable de izquierda a derecha.
// Triple [4, valor] > escalera [3, dado alto] > doble [2, pareja, dado suelto] > sencillo [1, mayor, medio, menor]. El 6 y el 1 no son consecutivos.
export function evaluarCombinacion(valores) {
  const v = [...valores].sort((a, b) => b - a);
  if (v[0] === v[2]) return { categoria: 'triple', clave: [4, v[0]] };
  if (v[0] - v[1] === 1 && v[1] - v[2] === 1) return { categoria: 'escalera', clave: [3, v[0]] };
  if (v[0] === v[1]) return { categoria: 'doble', clave: [2, v[0], v[2]] };
  if (v[1] === v[2]) return { categoria: 'doble', clave: [2, v[1], v[0]] };
  return { categoria: 'sencillo', clave: [1, v[0], v[1], v[2]] };
}

// > 0 si a es mas fuerte que b, < 0 si es mas debil, 0 si son iguales. Compara de izquierda a derecha.
export function compararClaves(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// Reparte los puntos de un enfrentamiento. entradas[s] = { clave, desempate } (desempate = el dado blanco mas alto que le sobra, 0 si ninguno).
// Los empatados en TODO se reparten el promedio de las posiciones que ocupan. Devuelve, por jugador: puntos (docenos enteros: el grupo mide 1 a 4,
// y 12 es divisible entre todos), puesto (1 a 4, el de su grupo) y porDesempate (true si otro tenia su misma combinacion y el desempate los separo).
export function repartirPuntos(entradas) {
  const n = entradas.length;
  const completa = (e) => [...e.clave, e.desempate];
  const orden = [...entradas.keys()].sort((x, y) => compararClaves(completa(entradas[y]), completa(entradas[x])) || x - y);
  const puntos = Array(n).fill(0), puesto = Array(n).fill(0), porDesempate = Array(n).fill(false);
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && compararClaves(completa(entradas[orden[j]]), completa(entradas[orden[i]])) === 0) j++;
    const grupo = orden.slice(i, j);
    const suma = PUNTOS_POSICION.slice(i, j).reduce((a, b) => a + b, 0);
    const cada = (suma * DOCEAVOS) / grupo.length; // entero
    for (const s of grupo) {
      puntos[s] = cada;
      puesto[s] = i + 1;
    }
    i = j;
  }
  for (let s = 0; s < n; s++) {
    for (let t = 0; t < n; t++) {
      if (s !== t && compararClaves(entradas[s].clave, entradas[t].clave) === 0 && entradas[s].desempate !== entradas[t].desempate) porDesempate[s] = true;
    }
  }
  return { puntos, puesto, porDesempate };
}

// totalD = puntos de dados de la ronda, en docenos. ZERO: exactamente 0. MIN: mas de 0 y menos de 7. MORE: de 7 a menos de 11. MAX: 11 o mas.
export function aciertaTarjeta(tarjeta, totalD) {
  const [lo, hi] = RANGOS[tarjeta];
  return totalD >= lo && totalD <= hi;
}

// Si acierta: ZERO paga 40 puntos; las demas duplican los puntos de la ronda. Si falla, los puntos quedan como salieron. Todo en docenos.
export function premioRonda(tarjeta, totalD) {
  if (!aciertaTarjeta(tarjeta, totalD)) return { acierto: false, puntos: totalD };
  return { acierto: true, puntos: tarjeta === 'ZERO' ? PREMIO_ZERO * DOCEAVOS : totalD * 2 };
}

// Cotas REALES de cada tarjeta en docenos, para medir cuanto se falla. minimo = primer valor que acierta por abajo (null si no hay una cota inferior
// medible: MIN pide "mas de 0" y ZERO es exactamente 0); tope = primer valor que ya NO acierta por arriba (null si no hay: MAX). OJO: no son los
// extremos de RANGOS (que estan en la cuadricula interna de docenos): sumar justo 7 puntos esta a 0 de MIN, no "a 0.08".
const COTAS = { ZERO: { minimo: null, tope: 0 }, MIN: { minimo: null, tope: 84 }, MORE: { minimo: 84, tope: 132 }, MAX: { minimo: 132, tope: null } };

// Cuanto le falta o le sobra a una tarjeta FALLIDA: { lado: 'abajo', docenos } (le falta ese tanto para llegar) o { lado: 'arriba', docenos } (se paso ese tanto
// del tope; 0 = suma justo el tope). null si acierta o si no hay una brecha medible (MIN con 0 puntos). Sirve para "se queda a un punto".
export function brechaDeTarjeta(tarjeta, totalD) {
  if (aciertaTarjeta(tarjeta, totalD)) return null;
  const { minimo, tope } = COTAS[tarjeta];
  if (minimo !== null && totalD < minimo) return { lado: 'abajo', docenos: minimo - totalD };
  if (tope !== null && totalD >= tope) return { lado: 'arriba', docenos: totalD - tope };
  return null;
}

// docenos -> puntos con hasta 2 decimales (4.5; 3.33; 0.5). Solo para mostrar o guardar para el publico.
export const aPuntos = (docenos) => Math.round((docenos / DOCEAVOS) * 100) / 100;
