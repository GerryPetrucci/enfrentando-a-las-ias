// Estado inicial de una partida de La Fuga. TODO lo aleatorio sale de aqui y del seed: las situaciones, su peligro oculto, la
// pista, las tentaciones y los dados (sorteados de antemano para que no dependan de las decisiones). Despues de crear el estado no
// se vuelve a tocar el rng.

import { CATALOGO } from './catalogo.js';
import { FASES, SITUACIONES_POR_FASE, K, PISTA_FIABLE, P_TENTACION, PUNTOS, METODOS_DE_SITUACION } from './constantes.js';

// n elementos al azar, sin repetir y en orden aleatorio (Fisher-Yates parcial sobre una copia)
function sortear(rng, lista, n) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia.slice(0, n);
}

function instanciar(rng, def, fase) {
  const [min, max] = fase.peligro;
  const peligro = +(min + (max - min) * rng()).toFixed(3);
  const normal = METODOS_DE_SITUACION.find((m) => m !== def.mejor && m !== def.malo);
  const ajuste = { [def.mejor]: K.ajusteMejor, [def.malo]: K.ajusteMalo, [normal]: K.ajusteNormal, esperar: K.esperar };
  const pistaFiable = rng() < PISTA_FIABLE;
  const otros = [normal, def.malo];
  const apuntaA = pistaFiable ? def.mejor : otros[Math.floor(rng() * otros.length)];
  const tentacion = def.tentacion && rng() < P_TENTACION
    ? { tipo: def.tentacion.tipo, valor: def.tentacion.tipo === 'botin' ? PUNTOS.botin : PUNTOS.delacion }
    : null;
  return { id: def.id, fase: fase.id, peligro, ajuste, pistaFiable, apuntaA, tentacion };
}

const statsVacias = () => ({ ayudas: 0, sacrificios: 0, separaciones: 0, botines: 0, delaciones: 0, promesasHechas: 0, promesasRotas: 0, invalidas: 0, ilegibles: 0 });

export function crearEstado(rng) {
  const situaciones = [];
  for (const fase of FASES) {
    for (const def of sortear(rng, CATALOGO.filter((s) => s.fase === fase.id), SITUACIONES_POR_FASE)) {
      situaciones.push(instanciar(rng, def, fase));
    }
  }
  // Todo sorteado de antemano (los dados no dependen de las decisiones): el dado de cada prisionero en cada situacion, el dado de
  // su salida anticipada si se separa, y los dos numeros del botin en solitario ([aparece, cual objeto]).
  const dados = situaciones.map(() => [rng(), rng()]);
  const salidas = situaciones.map(() => [rng(), rng()]);
  const botinSolo = situaciones.map(() => [rng(), rng()]);
  const semillaNarracion = Math.floor(rng() * 4294967296);
  return {
    ronda: 0,
    fin: false,
    finales: [null, null],
    perdidos: [0, 0], // extras que pierde quien es capturado (se calcula al cerrar la partida)
    situaciones,
    dados,
    salidas,
    botinSolo,
    semillaNarracion,
    libres: [true, true], // en juego y sin capturar; quien escapo por su cuenta tambien deja de estar aqui (ver salio)
    salio: [false, false], // escapo por su cuenta a mitad de camino (salida anticipada)
    heridas: [0, 0],
    puntos: [0, 0],
    objeto: [null, null],
    alarma: 0,
    cohesion: 0,
    promesas: [null, null],
    mensajes: [null, null],
    stats: [statsVacias(), statsVacias()],
    historial: [],
  };
}
