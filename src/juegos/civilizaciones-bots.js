// Bots de control de la Carrera de civilizaciones (spec 9.1). No son IAs: son politicas con parametros que sirven para probar el motor y calibrar el balance.
// Un solo `jugar(E, s, perfil, rng)` escribe las ordenes COMO LAS ESCRIBIRIA UNA IA (texto que pasa por el parser). Leen solo SU civilizacion y el mundo (nunca la nota ni el
// mensaje del rival: no hay modelo de lenguaje) y no modifican el estado. Todo lo aleatorio sale del rng que reciben.

import { OFICIOS, TEC, TECNOLOGIAS, EDIFICIO, RECURSOS_ALMACEN, CRISIS, TRIBUTO_POR_FUERZA, INDICE, GUARDIAS, COSTO_TECNOLOGIA } from './civilizaciones/constantes.js';
import { avisosDe, opcionesEvento } from './civilizaciones/avisos.js';
import { defensaDe } from './civilizaciones/turno/invasion.js';
import { nombreRegion, fronteraDe } from './civilizaciones/mundo.js';
import { modificadores } from './civilizaciones/economia.js';
import { costoColonizar, costoEdificio } from './civilizaciones/edificios.js';
import { disponibles } from './civilizaciones/tecnologia.js';
import { tieneTipo } from './civilizaciones/estado.js';
import { MARAVILLAS } from './civilizaciones/constantes.js';
import { construida } from './civilizaciones/turno/maravillas.js';
import { edificioDisponible } from './civilizaciones/temporada.js';
import { planDelBot } from './civilizaciones/plan-bot.js';

const COMUNES = ['granero', 'templo', 'biblioteca', 'acueducto', 'academia', 'mercado', 'aserradero', 'cantera', 'universidad', 'anfiteatro', 'hospital', 'imprenta', 'laboratorio', 'museo', 'parlamento'];
export const VERSION_BOTS = 'civilizaciones-bots-2.5'; // default conserva politica 2.2; sondas explicitas

export const PERFILES = {
  cientifico: { reparto: [30, 10, 10, 0, 40, 10], ramas: ['S', 'E', 'T', 'C', 'M', 'D'], edificios: ['biblioteca', 'templo', 'academia', 'granero', 'universidad', 'imprenta', 'laboratorio', 'acueducto'], hasta: 8, rasgos: ['eruditos', 'constructores'] },
  expansionista: { reparto: [40, 20, 10, 10, 10, 10], ramas: ['T', 'C', 'E', 'S', 'M', 'D'], edificios: ['granero', 'acueducto', 'templo', 'mercado', 'hospital'], hasta: 12, rasgos: ['agricultores', 'pioneros'] },
  equilibrado: { reparto: [30, 10, 10, 20, 20, 10], ramas: ['S', 'E', 'T', 'C', 'M', 'D'], edificios: COMUNES, hasta: 8, minEstabilidad: 60, rotar: true, rasgos: ['eruditos', 'constructores'] },
  pasivo: { pasivo: true, rasgos: ['agricultores', 'constructores'] },
  maravillero: { reparto: [20, 20, 30, 20, 10, 0], ramas: ['E', 'S', 'C', 'M', 'T', 'D'], edificios: ['templo'], hasta: 7, rasgos: ['constructores', 'devotos'], carrera: true },
  comerciante: { reparto: [30, 10, 10, 30, 10, 10], ramas: ['C', 'S', 'E', 'T', 'M', 'D'], edificios: ['mercado', 'puerto', 'gremio', 'banco', 'templo'], hasta: 9, rasgos: ['comerciantes', 'constructores'] },
};
// Sondas (C10): no cuentan como nuevos arquetipos del juego.
PERFILES.voraz = { ...PERFILES.cientifico, reparto: [20, 10, 10, 0, 60, 0], hasta: 8 };
PERFILES.adaptativa = { ...PERFILES.equilibrado, adaptar: true };

export const INFO_BOTS = {
  cientifico: { nombre: 'Científico', color: '#5A8FB8' },
  expansionista: { nombre: 'Expansionista', color: '#6FA86F' },
  equilibrado: { nombre: 'Equilibrado', color: '#C9A24B' },
  pasivo: { nombre: 'Pasivo', color: '#9C8FB8' },
  azar: { nombre: 'Al azar', color: '#B8544A' },
  voraz: { nombre: 'Sonda voraz', color: '#5A8FB8' },
  adaptativa: { nombre: 'Sonda adaptativa', color: '#C9A24B' },
  maravillero: { nombre: 'Maravillero', color: '#9C8FB8' },
  comerciante: { nombre: 'Comerciante', color: '#6FA86F' },
};

const base = (extra) => ({ mensaje: '', nota: '', razon: 'bot de control', ...extra });
const textoReparto = (r) => `asignar ${OFICIOS.map((o, i) => `${o} ${r[i]}`).join(' ')}`;
const valor = (E, c, r) => { const f = E.mundo.regs[r].flujo; return f.Comida * 2 + f.Madera * 1.5 + f.Hierro + (c.tecnologias.includes('S1') ? 1 : 0); };

export function jugar(E, s, perfil, rng) {
  const c = E.civs[s];
  if (!c.fundada) {
    const fundacion = { nombre: perfil.pasivo ? 'Pasiva' : `Bot ${perfil.id}`, lema: 'Control del experimento', sitio: 1, rasgos: perfil.rasgos };
    return base({ fundacion, ordenes: perfil.pasivo ? [] : [textoReparto(perfil.reparto)] });
  }
  if (perfil.pasivo) return base({ ordenes: [] });
  const t = E.turno + 1, m = modificadores(c, t), o = [];
  const stock = { ...c.stock };
  const pagar = (costo) => { for (const [r, n] of Object.entries(costo)) stock[r] -= n; };
  const alcanza = (costo) => Object.entries(costo).every(([r, n]) => stock[r] >= n);
  const { evento, invasion } = avisosDe(E, t);
  // Tabla fija, con presupuesto de fase 2 para que ninguna obra se financie
  // con un recurso que se gastara antes en responder al evento.
  if (E.capas?.crisis !== false && c.dilemaPendiente !== null) o.push(`dilema ${{ 2: 2, 3: 2, 4: 2, 5: 1, 6: 2 }[c.dilemaPendiente]}`);
  if (evento) {
    const p = CRISIS[evento.id];
    let n = 1;
    switch (evento.id) {
      case 'sequia': n = stock.Madera >= p.madera ? 1 : 2; if (evento.turno === t && n === 1) stock.Madera -= p.madera; break;
      case 'peste': n = stock.Oro >= p.oro ? 1 : 2; if (evento.turno === t && n === 1) stock.Oro -= p.oro; break;
      case 'terremoto': {
        n = opcionesEvento(c, evento.id).some((op) => op.n === 2) ? 2 : 1;
        if (n === 1 && evento.turno === t && c.edificios[c.capital]) {
          const costo = costoEdificio(c.edificios[c.capital].tipo, modificadores({ ...c, descuentoIngeniero: false }, t));
          if (alcanza(costo)) pagar(costo);
        }
        break;
      }
      case 'inundacion': n = stock.Madera >= p.madera ? 1 : 2; if (evento.turno === t && n === 1) stock.Madera -= p.madera; break;
      case 'revuelta': n = stock.Oro >= p.oro ? 2 : 3; if (evento.turno === t && n === 2) stock.Oro -= p.oro; break;
      case 'mercader': n = 3; break;
      case 'incendio':
        n = stock.Oro >= p.oro ? 1 : 2;
        if (evento.turno === t) { if (n === 1) stock.Oro -= p.oro; stock.Madera -= Math.ceil(stock.Madera * Math.round((n === 1 ? p.apagado : p.perdida) * 100) / 100); }
        break;
    }
    o.push(`responder ${evento.id} ${n}`);
  }
  // Se reserva el tributo antes de presupuestar obras; se paga en fase 7.
  // El equilibrado prepara Guardias si puede cubrir la fuerza completa.
  // Politica del bot: aparta lo ofrecido ayer hasta su vencimiento. El motor
  // no lo reserva: un jugador puede gastarlo y la liquidacion detectara el fallo.
  if (E.capas?.comercio !== false) for (const oferta of c.ofertas.filter((x) => x.vence === t)) stock[oferta.da] = Math.max(0, stock[oferta.da] - oferta.nDa);
  let reclutas = 0;
  if (invasion) {
    const porGuardia = defensaDe({ ...c, guardias: 1 }, t, m);
    const faltan = Math.max(0, Math.ceil(invasion.fuerza / porGuardia) - c.guardias);
    const divisor = m.baratoGuardias ? 2 : 1;
    const costo = Math.ceil(faltan / divisor);
    const prepara = ['equilibrado', 'adaptativa'].includes(perfil.id)
      || (perfil.id === 'expansionista' && t > 20);
    if (prepara && faltan <= GUARDIAS.maxPorTurno && stock.Comida >= costo + c.poblacion && stock.Hierro >= costo) {
      reclutas = faltan; stock.Comida -= costo; stock.Hierro -= costo;
    }
    const resiste = defensaDe(c, t, m) >= invasion.fuerza || reclutas > 0;
    const n = resiste ? 1 : 2;
    o.push(`responder invasion ${n}`);
    if (invasion.turno === t && n === 2 && stock.Oro >= invasion.fuerza * TRIBUTO_POR_FUERZA) stock.Oro -= invasion.fuerza * TRIBUTO_POR_FUERZA;
  }

  const plan = c.temporada ? planDelBot(c, perfil) : null;
  const listaEdificios = plan ? [...new Set([...plan.filter((n) => n.tipo === 'edificio').map((n) => n.nombre), ...perfil.edificios])] : perfil.edificios;
  const centroPendiente = plan?.find((n) => n.tipo === 'edificio'
    && !c.construidos.includes(n.nombre) && edificioDisponible(c, n.nombre));
  const reservaCentro = centroPendiente ? costoEdificio(centroPendiente.nombre, m) : {};
  const sinInvestigacion = c.proyectos.length === 0 && disponibles(c).length === 0;
  // Ajuste temporal: evita acumular Ciencia mientras falta el recurso del centro.
  // Al desaparecer el cuello vuelve al reparto del perfil; hambre tiene prioridad.
  const reparto = t === 1 || c.temporada ? [...perfil.reparto] : [...c.reparto];
  if (perfil.adaptar) {
    const saturada = c.culturaAcumulada >= INDICE.cultura.referencia;
    reparto.splice(0, 6, ...(c.stock.Comida < c.poblacion * 2 ? [50, 10, 10, 10, 20, 0]
      : saturada ? [30, 10, 10, 20, 30, 0] : perfil.reparto));
  }
  // Restaurar el perfil no debe borrar los aumentos de granjeros que evitaron
  // hambre. Una escasez persistente puede exigir mas de diez puntos adicionales.
  if (c.temporada && !perfil.adaptar) {
    for (const k of [4, 5, 3, 1, 2]) {
      while (reparto[0] < c.reparto[0] && reparto[k] >= 10) { reparto[k] -= 10; reparto[0] += 10; }
    }
  }
  if (c.hambre) { const j = [4, 5, 3].find((k) => reparto[k] >= 10); if (j !== undefined) { reparto[j] -= 10; reparto[0] += 10; } }
  if (c.temporada && !c.hambre && sinInvestigacion && reparto[4] >= 20
    && c.reservaCiencia >= COSTO_TECNOLOGIA[c.era - 1]) {
    const oficio = stock.Madera < (reservaCentro.Madera ?? 0) ? 1
      : stock.Roca < (reservaCentro.Roca ?? 0) || stock.Hierro < (reservaCentro.Hierro ?? 0) ? 2 : null;
    if (oficio !== null) { reparto[4] -= 10; reparto[oficio] += 10; }
  }
  if (t === 1 || c.hambre || perfil.adaptar || reparto.some((n, i) => n !== c.reparto[i])) o.push(textoReparto(reparto));

  // Reserva primero el centro que abre la ruta elegida. Sin esto, reponer
  // colonias perdidas consume la Madera y deja Ciencia sin usar indefinidamente.
  const alcanzaTrasReserva = (costo) => [...new Set([...Object.keys(costo), ...Object.keys(reservaCentro)])]
    .every((r) => stock[r] >= (costo[r] ?? 0) + (reservaCentro[r] ?? 0));
  // Expansion: coloniza la vecina mas rica sin consumir el presupuesto del centro.
  const regiones = [...c.regiones];
  const terremoto = evento?.turno === t && evento.id === 'terremoto';
  for (let n = 0; !terremoto && n < 2 && regiones.length < perfil.hasta && c.estabilidad >= (perfil.minEstabilidad ?? 0); n++) {
    const costo = costoColonizar({ ...c, regiones }, m);
    if (!alcanzaTrasReserva(costo)) break;
    const r = fronteraDe(E.mundo, regiones).sort((a, b) => valor(E, c, b) - valor(E, c, a) || a - b)[0];
    if (r === undefined) break;
    pagar(costo); regiones.push(r); o.push(`colonizar ${nombreRegion(r)}`);
  }

  // Un edificio por turno: el primero de su lista desbloqueado, que no tenga y que alcance, en una region sin edificio.
  // Los hitos sobreviven al reemplazo: si falta espacio, cambia un edificio
  // que no es prioritario para la politica, conservando la investigacion lograda.
  const prioridadEdificio = (r) => { const k = perfil.edificios.indexOf(c.edificios[r].tipo); return k < 0 ? 100 : k; };
  const libre = regiones.find((r) => !c.edificios[r]) ?? (plan
    ? [...regiones].sort((a, b) => prioridadEdificio(b) - prioridadEdificio(a))[0] : undefined);
  let edificioNuevo = null;
  if (libre !== undefined && !terremoto) {
    const tipo = listaEdificios.find((e) => (c.temporada ? edificioDisponible(c, e) && !c.construidos.includes(e) : c.tecnologias.includes(EDIFICIO[e].tec)) && !tieneTipo(c, e) && alcanza(costoEdificio(e, m))
      && (!centroPendiente || plan.some((n) => n.tipo === 'edificio' && n.nombre === e) || alcanzaTrasReserva(costoEdificio(e, m))));
    if (tipo) { pagar(costoEdificio(tipo, m)); o.push(`construir ${nombreRegion(libre)} ${tipo}`); edificioNuevo = tipo; }
  }
  if (reclutas > 0) o.push(`reclutar ${reclutas}`);

  if (E.capas?.carrera !== false) {
    const ids = perfil.id === 'cientifico' || perfil.id === 'voraz' ? ['biblioteca mayor', 'observatorio']
      : perfil.id === 'expansionista' ? ['piramide'] : perfil.id === 'comerciante' ? ['faro', 'catedral mayor'] : MARAVILLAS.map((w) => w.id);
    const candidatas = MARAVILLAS.filter((w) => ids.includes(w.id) && c.tecnologias.includes(w.tec) && !construida(E, w.id))
      .sort((a, b) => Number(Boolean(c.proyectosMaravillas[b.id])) - Number(Boolean(c.proyectosMaravillas[a.id]))
        || Object.values(a.costo).reduce((x,n) => x+n,0) - Object.values(b.costo).reduce((x,n) => x+n,0));
    const w = candidatas.find((w) => {
      const falta = Object.entries(w.costo).reduce((a,[r,n]) => a + n - (c.proyectosMaravillas[w.id]?.invertido[r] ?? 0),0);
      const disponible = Object.entries(w.costo).reduce((a,[r,n]) => a + Math.min(stock[r], n - (c.proyectosMaravillas[w.id]?.invertido[r] ?? 0)),0);
      return disponible > 0 && (!['equilibrado','adaptativa'].includes(perfil.id) || disponible >= falta * 0.6);
    });
    if (w) for (const [r,n] of Object.entries(w.costo)) {
      const cantidad = Math.floor(Math.min(stock[r], n - (c.proyectosMaravillas[w.id]?.invertido[r] ?? 0)));
      if (cantidad > 0 && o.length < 10) { o.push(`invertir ${w.id} ${r} ${cantidad}`); stock[r] -= cantidad; }
    }
  }

  // Investigacion: llena los proyectos libres con la tecnologia mas barata de su rama preferida (rotando ramas si `rotar`).
  const enCurso = new Set(c.proyectos.map((p) => p.tec));
  const objetivo = (id) => {
    const k = MARAVILLAS.findIndex((w) => !c.tecnologias.includes(w.tec) && TEC[w.tec].rama === TEC[id].rama && TEC[w.tec].era >= TEC[id].era);
    return k < 0 ? 100 : k;
  };
  const orden = (a, b) => (perfil.carrera ? objetivo(a) - objetivo(b) || TEC[a].era - TEC[b].era
    : perfil.rotar ? TEC[a].era - TEC[b].era || perfil.ramas.indexOf(TEC[a].rama) - perfil.ramas.indexOf(TEC[b].rama)
    : perfil.ramas.indexOf(TEC[a].rama) - perfil.ramas.indexOf(TEC[b].rama) || TEC[a].era - TEC[b].era);
  const proyectada = edificioNuevo ? { ...c, construidos: [...c.construidos, edificioNuevo] } : c;
  const prioridad = new Set(plan?.filter((n) => n.tipo === 'tecnologia').map((n) => n.id) ?? []);
  const quedan = disponibles(proyectada).filter((id) => !enCurso.has(id))
    .sort((a, b) => Number(prioridad.has(b)) - Number(prioridad.has(a)) || orden(a, b));
  for (let libres = m.proyectos - c.proyectos.length; libres > 0 && quedan.length; libres--) o.push(`investigar ${TEC[quedan.shift()].nombre}`);
  let mensaje = '';
  if (E.capas?.comercio !== false) {
    const valor = { Comida: 1, Madera: 1, Roca: 1, Hierro: 1.5, Oro: 1.5 };
    const oferta = E.civs[1 - s].ofertas.find((x) => x.vence === t && stock[x.pide] >= x.nPide && x.nDa * valor[x.da] >= x.nPide * valor[x.pide]);
    if (oferta && o.length < 12) { o.push(`aceptar ${oferta.n}`); stock[oferta.pide] -= oferta.nPide; }
    if (perfil.id === 'comerciante' && t % 3 === 0 && stock.Madera >= 6 && o.length < 12) {
      o.push('ofrecer Madera 6 Oro 4'); mensaje = 'Ofrezco 6 Madera por 4 Oro para el siguiente turno.';
    }
  }
  return base({ ordenes: o.slice(0, 12), nota: `Plan: ${perfil.id}.`, mensaje });
}

// Al azar: de 1 a 12 ordenes tomadas de la gramatica, algunas con basura. Solo prueba el motor y el parser; no entra a la tabla de balance.
const BASURA = ['', 'hola', 'asignar', 'construir', 'colonizar R99', 'investigar nada', 'invertir x', 'responder 9', 'aceptar 9', 'reclutar -3', 'regalar Oro 1.5', 'ofrecer Oro', 'dilema'];
export function azar(E, s, rng) {
  const c = E.civs[s], elige = (xs) => xs[Math.floor(rng() * xs.length)];
  const fundacion = c.fundada ? undefined : { nombre: elige(['Azar', '', 'N'.repeat(40)]), lema: elige(['', 'lema']), sitio: elige([1, 2, 3, 9, 'R07']), rasgos: [elige(TECNOLOGIAS).nombre, elige(['eruditos', 'pioneros', 'devotos'])] };
  const plantillas = [
    () => `asignar ${OFICIOS.map((of) => `${of} ${Math.floor(rng() * 12) * 10 - 10}`).join(' ')}`,
    () => `colonizar R${1 + Math.floor(rng() * 30)}`,
    () => `construir R${1 + Math.floor(rng() * 30)} ${elige(Object.keys(EDIFICIO))}`,
    () => `investigar ${elige(TECNOLOGIAS).nombre}`,
    () => `reclutar ${Math.floor(rng() * 50)}`,
    () => `invertir piramide ${elige(RECURSOS_ALMACEN)} ${1 + Math.floor(rng() * 20)}`,
    () => `regalar ${elige(RECURSOS_ALMACEN)} ${1 + Math.floor(rng() * 12)}`,
    () => `ofrecer ${elige(RECURSOS_ALMACEN)} ${1 + Math.floor(rng() * 13)} ${elige(RECURSOS_ALMACEN)} ${1 + Math.floor(rng() * 13)}`,
    () => `aceptar ${elige(['', '1', '2'])}`,
    () => elige(BASURA),
  ];
  const n = 1 + Math.floor(rng() * 12);
  return { ...(fundacion ? { fundacion } : {}), ordenes: Array.from({ length: n }, () => elige(plantillas)()), mensaje: 'x', nota: 'azar', razon: 'azar' };
}

export const BOTS = {
  ...Object.fromEntries(Object.entries(PERFILES).map(([id, perfil]) => [id, (E, s, rng) => jugar(E, s, { ...perfil, id }, rng)])),
  azar,
};
