// Estado inicial de una partida de Triple dado. TODO lo aleatorio sale de aqui y del seed: los dados de las 4 rondas (se lanzan de antemano; la vista
// solo muestra lo que ya toca), las jugadas de reemplazo de una respuesta ilegal y la semilla de la narracion. Despues no se vuelve a tocar el rng.
// Todos los puntos del estado estan en DOCEAVOS enteros (ver constantes.js).

import { JUGADORES, RONDAS, ENFRENTAMIENTOS, IDS_BLANCOS } from './constantes.js';

const por = (v) => Array.from({ length: JUGADORES }, () => (typeof v === 'function' ? v() : v));
const d6 = (rng) => 1 + Math.floor(rng() * 6);
const statsVacias = () => ({
  respuestas: 0, validas: 0, invalidas: 0, // obediencia
  predicciones: 0, aciertos: 0, ceros: 0, // tarjetas que eligio la IA (la de la ronda 4 y las de reemplazo no cuentan)
  ocultosUsados: 0, // dados rojo o azul que uso en enfrentamientos que eligio la IA
  puntosDeDados: 0, // docenos ganados en enfrentamientos, sin premios
});

export function crearEstado(rng) {
  const dados = Array.from({ length: RONDAS }, () => por(() => ({
    blancos: Array.from({ length: IDS_BLANCOS.length }, () => d6(rng)),
    rojo: d6(rng),
    azul: d6(rng),
  })));
  const azar = {
    tarjeta: Array.from({ length: RONDAS }, () => por(() => rng())),
    dados: Array.from({ length: RONDAS }, () => Array.from({ length: ENFRENTAMIENTOS }, () => por(() => [rng(), rng(), rng()]))),
  };
  const semillaNarracion = Math.floor(rng() * 4294967296);
  return {
    ronda: 1,
    fase: 'prediccion', // 'prediccion' | 'jugada'
    enfrentamiento: 0, // 0 en la prediccion; 1 a 3 en los enfrentamientos
    fin: false,
    final: null,
    dados, // dados[ronda - 1][jugador] = { blancos[9], rojo, azul }
    tarjetasUsadas: por(() => []), // tarjetas de rondas ya cerradas (publicas)
    tarjetaActual: por(null), // tarjeta elegida en la ronda en curso (secreta hasta el cierre)
    eligio: por(false), // true si esa tarjeta la eligio la IA (no es de reemplazo ni la forzada de la ronda 4)
    gastados: por(() => ({ blancos: [], rojo: false, azul: false })), // dados gastados en la ronda en curso (publico)
    puntosRonda: por(0), // docenos de los enfrentamientos de la ronda en curso (antes del premio)
    puntos: por(0), // docenos acumulados de rondas cerradas (con premios)
    puntosBase: por(0), // docenos de dados acumulados, sin premios
    rondaPuntos: por(() => []), // docenos de cada ronda cerrada, con premio
    historial: [], // una entrada PUBLICA por enfrentamiento y por cierre de ronda
    puesto: por(null), // 'pieza' | 'medio' | 'eliminado' al terminar
    azar,
    semillaNarracion,
    stats: por(statsVacias),
  };
}

// Ids de los dados que el jugador s aun no ha gastado en la ronda en curso.
export function disponibles(E, s) {
  const g = E.gastados[s];
  return [...IDS_BLANCOS.filter((id) => !g.blancos.includes(id)), ...(g.rojo ? [] : ['rojo']), ...(g.azul ? [] : ['azul'])];
}

// Los blancos que le quedan (publicos).
export const blancosRestantes = (E, s) => disponibles(E, s).filter((id) => IDS_BLANCOS.includes(id));

// Valor de un dado del jugador s en la ronda en curso.
export function valorDe(E, s, id) {
  const d = E.dados[E.ronda - 1][s];
  if (id === 'rojo') return d.rojo;
  if (id === 'azul') return d.azul;
  return d.blancos[Number(id.slice(1)) - 1];
}
