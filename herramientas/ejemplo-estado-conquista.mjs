#!/usr/bin/env node
// Fragmento de estado de EJEMPLO que el prompt de Guerra de territorios usa en «COMO LEER TU ESTADO» (src/juegos/conquista/ejemplo-estado.js).
// Sale del motor real: una partida de bots hasta el turno 9, la vista del reino 2, recortada a las lineas que se explican y con los textos de los bots
// (que dicen cosas como «Plan: lancero-masa») cambiados por textos neutros. El prompt lleva el resultado como texto FIJO (una huella estable); la prueba
// src/pruebas/conquista/ejemplo-estado.test.js lo regenera y avisa si la vista del motor cambio, para que se vuelva a generar a proposito:
//   node herramientas/ejemplo-estado-conquista.mjs        (imprime el fragmento; pegarlo en src/juegos/conquista/ejemplo-estado.js)

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import conquista from '../src/juegos/conquista.js';
import { crearEstado } from '../src/juegos/conquista/estado.js';
import { vistaTexto } from '../src/juegos/conquista/vista.js';
import { normalizarRespuesta } from '../src/juegos/conquista/ordenes.js';
import { aplicarTurno } from '../src/juegos/conquista/turno/index.js';
import { crearRng } from '../src/rng.js';

const INVENTADAS = {
  'Tu nota del turno anterior': 'Tu nota del turno anterior: "Plan: tomar R20 y reforzar R10."',
  'Mensajes publicos': 'Mensajes publicos: Marfil: "Propongo paz a quien no me ataque."',
};
const corta = (l, n) => (l.length > n ? `${l.slice(0, n).replace(/\s+\S*$/, '')} ...` : l);

export function fragmentoDeEstado() {
  const E = crearEstado(crearRng(11), { jugadores: 4, bioma: 'cordillera', nombres: ['Azur', 'Ambar', 'Marfil', 'Iris'] });
  const rngs = Array.from({ length: 4 }, (_, i) => crearRng(100 + i));
  const bots = ['mixto-adaptativo', 'lancero-masa', 'agresivo', 'mixto-adaptativo'];
  while (E.turno < 8) aplicarTurno(E, E.reinos.map((r, s) => (r.vivo ? normalizarRespuesta(conquista.bots[bots[s]].fn(E, s, rngs[s]), E) : null)));
  const L = vistaTexto(E, 1).split('\n').map((l) => { const k = Object.keys(INVENTADAS).find((p) => l.startsWith(p)); return k ? INVENTADAS[k] : l; });
  const i0 = L.findIndex((l) => l.startsWith('Turno '));
  const iOcup = L.findIndex((l) => l.startsWith('OCUPACION'));
  const iFrentes = L.findIndex((l) => l.startsWith('FRENTES'));
  return [
    ...L.slice(0, 3).map((l) => corta(l, 70)), '...(una linea por region)...', '',
    ...L.slice(i0, iOcup - 1).map((l) => corta(l, 300)), '',
    L[iOcup], ...L.slice(iOcup + 1, iOcup + 3).map((l) => corta(l, 150)), '...',
    '', ...(iFrentes > 0 ? L.slice(iFrentes, iFrentes + 3) : []), '', L.at(-1),
  ].join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(fragmentoDeEstado());
