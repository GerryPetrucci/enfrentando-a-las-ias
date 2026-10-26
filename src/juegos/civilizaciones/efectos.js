// Los EFECTOS de la Carrera de civilizaciones (spec 3.9): listas ordenadas de { t, ... } definidas en constantes.js.
// De la misma lista salen dos cosas, para que una cifra no pueda quedar distinta en el motor y en lo que lee la IA:
//   acumular(m, efectos)   suma los efectos a un acumulador de modificadores (lo usa el motor)
//   describir(efectos)     la frase del contrato ("+20% Comida, +2 espacio"; lo usa reglas-texto.js y la vista)

import { RECURSOS } from './constantes.js';

export const nuevosModificadores = () => ({
  pct: Object.fromEntries(RECURSOS.map((r) => [r, 0])),          // suma de los bonos porcentuales de cada recurso
  plano: Object.fromEntries(RECURSOS.map((r) => [r, 0])),        // bonos planos por turno
  planoRegion: Object.fromEntries(RECURSOS.map((r) => [r, 0])),  // bonos planos por region
  espacio: 0, estabilidad: 0, crecimiento: 0,
  defensa: 0,                // rasgos y dilemas (se suman)
  muralla: 0,                // la mejor de las murallas (vale el mayor)
  guardias: 1,               // multiplicador de Guardias (vale el mayor)
  baratoGuardias: false, edificiosCosto: 0, colonizarCosto: 0, regionInicial: 0, regionGratis: 0,
  proyectos: 1, pesteMitad: false, mineroHierro: 0, hierroMina: 0,
});

const recursosDe = (e) => (e.rec === 'todo' ? RECURSOS : e.rec);

const TIPOS = {
  pct: { aplicar: (m, e) => { for (const r of recursosDe(e)) m.pct[r] += e.v; } },
  plano: { aplicar: (m, e) => { m.plano[e.rec] += e.v; } },
  planoRegion: { aplicar: (m, e) => { m.planoRegion[e.rec] += e.v; } },
  espacio: { aplicar: (m, e) => { m.espacio += e.v; } },
  estabilidad: { aplicar: (m, e) => { m.estabilidad += e.v; } },
  crecimiento: { aplicar: (m, e) => { m.crecimiento += e.v; } },
  defensaPct: { aplicar: (m, e) => { m.defensa += e.v; } },
  muralla: { aplicar: (m, e) => { m.muralla = Math.max(m.muralla, e.v); } },
  guardias: { aplicar: (m, e) => { m.guardias = Math.max(m.guardias, e.v); } },
  baratoGuardias: { aplicar: (m) => { m.baratoGuardias = true; } },
  edificiosCosto: { aplicar: (m, e) => { m.edificiosCosto += e.v; } },
  colonizarCosto: { aplicar: (m, e) => { m.colonizarCosto += e.v; } },
  regionInicial: { aplicar: (m, e) => { m.regionInicial += e.v; } },
  regionGratis: { aplicar: (m, e) => { m.regionGratis += e.v; } },
  proyectos: { aplicar: (m, e) => { m.proyectos = Math.max(m.proyectos, e.v); } },
  peste: { aplicar: (m) => { m.pesteMitad = true; } },
  mineroHierro: { aplicar: (m, e) => { m.mineroHierro += e.v; } },
  hierroMina: { aplicar: (m, e) => { m.hierroMina += e.v; } },
};

export function acumular(m, efectos) {
  for (const e of efectos) {
    const tipo = TIPOS[e.t];
    if (!tipo) throw new Error(`efecto desconocido: ${e.t}`);
    tipo.aplicar(m, e);
  }
  return m;
}

// ---- texto ----
const signo = (v) => (v < 0 ? '-' : '+');
const porc = (v) => `${signo(v)}${Math.round(Math.abs(v) * 100)}%`;
const num = (v) => `${signo(v)}${Math.abs(v)}`;
const lista = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs.at(-1)}`);

const TEXTO = {
  pct: (e) => `${porc(e.v)} ${e.rec === 'todo' ? 'de todo' : lista(e.rec)}`,
  plano: (e) => `${num(e.v)} ${e.rec}`,
  planoRegion: (e) => `${num(e.v)} ${e.rec} por region`,
  espacio: (e) => `${num(e.v)} espacio`,
  estabilidad: (e) => `${num(e.v)} Estabilidad`,
  crecimiento: (e) => `${num(e.v)} crecimiento`,
  defensaPct: (e) => `${porc(e.v)} defensa`,
  muralla: (e) => `${porc(e.v)}${e.corto ? '' : ' defensa'}`,
  guardias: (e) => `Guardias x${e.v}`,
  baratoGuardias: () => 'Guardias a mitad de costo',
  edificiosCosto: (e) => `edificios ${porc(e.v)} de costo`,
  colonizarCosto: (e) => `colonizar ${porc(e.v)}`,
  regionInicial: (e) => `${num(e.v)} region inicial`,
  regionGratis: (e) => `${num(e.v)} region gratis`,
  proyectos: (e) => `${e.v} proyectos`,
  peste: () => 'Peste a la mitad',
  hierroMina: (e) => `${num(e.v)} Hierro por mina`,
};

// Frase de una lista de efectos, en el orden en que estan escritos; `oculto` los deja fuera (se dicen en otra regla).
export function describir(efectos, separador = ', ') {
  return efectos.filter((e) => !e.oculto).map((e) => {
    const f = TEXTO[e.t];
    if (!f) throw new Error(`efecto sin texto: ${e.t}`);
    return f(e);
  }).join(separador);
}
