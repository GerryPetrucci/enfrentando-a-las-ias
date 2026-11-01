#!/usr/bin/env node
// Estados de EJEMPLO que el prompt de Lobo en la aldea usa en «COMO LEER TU ESTADO» (src/juegos/lobo/ejemplo-estado.js).
// Salen del motor real: una mesa de 12 jugada con respuestas escritas a mano (no bots) y mensajes neutros. El prompt lleva el resultado como texto FIJO (una huella estable);
// la prueba src/pruebas/lobo/ejemplo-estado.test.js lo regenera y avisa si la vista del motor cambio, para que se vuelva a generar a proposito:
//   node herramientas/ejemplo-estado-lobo.mjs        (imprime los fragmentos; pegarlos en src/juegos/lobo/ejemplo-estado.js)

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { crearEstado, activosDe } from '../src/juegos/lobo/estado.js';
import { aplicarTurno } from '../src/juegos/lobo/turno.js';
import { vistaTexto, vistaDe } from '../src/juegos/lobo/vista.js';
import { crearRng } from '../src/rng.js';

const MENSAJES = ['Mensaje de ejemplo.', 'Otro mensaje de ejemplo.', 'Un tercer mensaje de ejemplo.'];
const SEED = 5;

// Guion: R1 Cupido junta a dos aldeanos, los lobos matan a un aldeano, la vidente 0 encuentra a un lobo y lo afirma de dia, todos lo votan.
// R2 los lobos matan a la vidente 0, el dia vota al cazador, que dispara a un enamorado: el otro muere de amor.
export function mesaDeEjemplo() {
  const E = crearEstado(crearRng(SEED), { jugadores: 12, modoCupido: 'nada' });
  const con = (rol) => E.roles.flatMap((r, i) => (r === rol ? [i] : []));
  const [aldeano0, aldeano1, victima1, observador, otro] = con('aldeano');
  const [lobo0, lobo1] = con('lobo');
  const [vid0, vid1] = con('vidente');
  const [bruja] = con('bruja'), [cazador] = con('cazador'), [cupido] = con('cupido');
  const vivos = () => E.vivos.flatMap((v, i) => (v ? [i] : []));
  const fotos = {};
  const decide = (i) => {
    switch (E.fase) {
      case 'cupido': return { enamorados: [aldeano0, aldeano1] };
      case 'lobos': return { accion: 'matar', objetivo: E.ronda === 1 ? victima1 : vid0 };
      case 'bruja': return { salvar: false, matar: null };
      case 'vidente': return { accion: 'inspeccionar', objetivo: E.ronda === 1 ? (i === vid0 ? lobo0 : otro) : lobo1 };
      case 'cazador': return { accion: 'disparar', objetivo: aldeano0 };
      case 'dia': {
        const mensaje = MENSAJES[i % MENSAJES.length];
        if (E.ronda === 1) return { mensaje, voto: i === lobo0 ? vivos().find((j) => j !== i) : lobo0, ...(i === vid0 ? { afirmaRol: 'vidente' } : {}) };
        return { mensaje, voto: i === cazador ? vivos().find((j) => j !== i) : cazador };
      }
      default: throw new Error(E.fase);
    }
  };
  while (!E.fin && E.ronda <= 2 && !(E.ronda === 2 && E.fase === 'lobos' && E.historial.length > 12)) {
    if (E.ronda === 1 && E.fase === 'bruja') fotos.bruja = vistaTexto(E, bruja);
    if (E.ronda === 1 && E.fase === 'dia') fotos.dia1 = vistaTexto(E, observador);
    if (E.ronda === 2 && E.fase === 'dia') fotos.dia2 = { vidente: vistaDe(E, vid1), pareja: vistaDe(E, aldeano1), cupido: vistaDe(E, cupido), lobo: vistaDe(E, lobo0) };
    aplicarTurno(E, activosDe(E).map((a, i) => (a ? decide(i) : null)));
    if (E.ronda === 3) break;
  }
  return { E, fotos, asientos: { aldeano0, aldeano1, victima1, observador, lobo0, lobo1, vid0, vid1, bruja, cazador, cupido } };
}

const unaLinea = (o) => JSON.stringify(o);

export function fragmentosDeEjemplo() {
  const { E, fotos } = mesaDeEjemplo();
  const eventos = E.eventos.filter((e) => e.tipo !== 'enamorados');
  const primero = (f) => eventos.find(f);
  const elegidos = [
    primero((e) => e.tipo === 'amanecer'),
    primero((e) => e.tipo === 'muerte' && e.causa === 'noche'),
    primero((e) => e.tipo === 'mensaje' && e.afirmaRol === undefined),
    primero((e) => e.tipo === 'mensaje' && e.afirmaRol !== undefined),
    primero((e) => e.tipo === 'votacion'),
    primero((e) => e.tipo === 'muerte' && e.causa === 'voto'),
    primero((e) => e.tipo === 'muerte' && e.comprobacion),
    primero((e) => e.tipo === 'disparo'),
    primero((e) => e.tipo === 'muerte' && e.causa === 'disparo'),
    primero((e) => e.tipo === 'muerte' && e.causa === 'amor'),
  ];
  const v = fotos.dia2;
  return {
    bruja: fotos.bruja,
    dia: fotos.dia1,
    eventos: elegidos.map(unaLinea).join('\n'),
    campos: [
      `"declaraciones":${unaLinea(v.vidente.declaraciones)}`,
      `"inspecciones":${unaLinea(v.vidente.inspecciones)}`,
      `"pareja":${unaLinea(v.pareja.pareja)}`,
      `"enamoradosElegidos":${unaLinea(v.cupido.enamoradosElegidos)}`,
      `"manada":${unaLinea(v.lobo.manada)}`,
    ].join('\n'),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const [k, texto] of Object.entries(fragmentosDeEjemplo())) console.log(`--- ${k}\n${texto}\n`);
}
