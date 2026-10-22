// Bots de control de la Guerra de territorios 2.0.0: un solo motor de decisiones con un perfil por bot. No son IAs: sirven para medir el balance (herramientas/medir-conquista.mjs) y para probar el motor.
// Leen el estado completo y NUNCA lo modifican. Para atacar usan los FRENTES (frentes.js), la misma estimacion publica que ven las IAs: quien confia en ella juega como una IA razonable.
//   lancero-masa      solo Lanceros, ataca en cuanto la estimacion pasa de 1.1, sin pactos
//   arquero-defensivo Arqueros y fortalezas, cuartel y mejoras; solo ataca con ventaja clara (1.5); acepta pactos
//   jinete-relampago  Jinetes (hacia los Caballos) que tambien saltan 2 regiones; ataca desde 1.0
//   mixto-adaptativo  mira las unidades del vecino y recluta la que lo domina; cuartel, mejoras y Maravilla
//   traidor           pacta, planta tropas de visita en tierra del aliado y las usa: rompe y ataca en sitio si gana claro, o ataca sin romper cuando el pacto vence
//   leal              contesta y renueva pactos, nunca los rompe, construye economia y Maravilla

import { nombreRegion as nr, regionesDe, pila as pilaDe, totalPila, presentes, aliado } from './conquista/estado.js';
import { enfrentar, calcularFrentes, pilaQueSale } from './conquista/frentes.js';
import { regionesAisladas } from './conquista/suministro.js';
import { COMIDA, MARAVILLA, MEJORAS, FORTALEZA, EDIFICIOS, CUARTEL, MAX_ORDENES, HONOR, TIERRA } from './conquista/constantes.js';
import { costoDePila, racionesDe, sumaPila } from './conquista/unidades.js';

const PERFILES = {
  'lancero-masa': { prioridad: ['L'], umbral: 1.1, fortificar: 0, construir: ['granja', 'mercado'], pactos: 'ninguno', expandir: 3, porTurno: 10 },
  'arquero-defensivo': { prioridad: ['A', 'L'], umbral: 1.5, fortificar: 2, construir: ['granja', 'cuartel', 'mercado'], pactos: 'vecino', expandir: 2, porTurno: 8, mejorar: 1 },
  'jinete-relampago': { prioridad: ['J', 'L'], umbral: 1.0, fortificar: 0, construir: ['granja'], pactos: 'ninguno', expandir: 3, porTurno: 8, saltos: true, recurso: 'Caballos' },
  'mixto-adaptativo': { prioridad: 'contra', umbral: 1.2, fortificar: 1, construir: ['granja', 'cuartel', 'mercado'], pactos: 'vecino', expandir: 2, porTurno: 9, mejorar: 'usado', maravilla: true },
  traidor: { prioridad: ['A', 'L'], umbral: 1.3, fortificar: 0, construir: ['granja'], pactos: 'traidor', expandir: 2, porTurno: 8 },
  leal: { prioridad: ['L', 'A'], umbral: 1.3, fortificar: 1, construir: ['granja', 'mercado'], pactos: 'leal', expandir: 2, porTurno: 8, maravilla: true },
};

const base = (extra) => ({ pacto_con: null, mensaje: '', privados: [], nota: '', razon: 'bot de control', ...extra });
const vecinas = (E, r) => E.mapa.regs[r].vecinos;
const LETRAS = 'LAJI';
const argmax = (xs) => xs.reduce((m, x, i) => (x > xs[m] ? i : m), 0);
// Una pila como piezas de orden: "L3 A2".
const piezas = (pila) => pila.map((n, t) => (n > 0 ? LETRAS[t] + n : '')).filter(Boolean).join(' ');
// Hasta n unidades de una pila, las mas baratas primero (la de menor indice).
function hasta(pila, n) {
  const out = [0, 0, 0, 0];
  for (let t = 0; t < 4 && n > 0; t++) { const q = Math.min(pila[t], n); out[t] = q; n -= q; }
  return out;
}
const raciones = (E, s) => { let n = 0; for (let r = 0; r < E.dueno.length; r++) n += racionesDe(pilaDe(E, r, s)); return n; };

// ---- Pasos del turno ----

// Una construccion por turno: el primer edificio de la lista del perfil que falte, en una region propia, conectada y sin edificio.
function construir(c) {
  const { E, s, p, o } = c;
  if (p.maravilla && !E.maravilla && c.puedePagar(MARAVILLA.costo)) { c.paga(MARAVILLA.costo); o.push(`construir ${nr(c.capital)} maravilla`); return; }
  for (const tipo of p.construir) {
    if (c.propias.filter((r) => E.edif[r] === tipo).length >= 2) continue;
    const sitio = tipo === 'cuartel' ? c.frente : c.propias.find((r) => !E.edif[r] && !c.aisladas.has(r) && r !== c.capital) ?? c.propias.find((r) => !E.edif[r] && !c.aisladas.has(r));
    if (sitio === undefined || E.edif[sitio] || c.aisladas.has(sitio) || !c.puedePagar(EDIFICIOS[tipo].costo)) continue;
    c.paga(EDIFICIOS[tipo].costo); o.push(`construir ${nr(sitio)} ${tipo}`);
    return;
  }
}

function fortificar(c) {
  const { E, p, o } = c;
  if (!p.fortificar) return;
  const r = c.propias.filter((x) => !c.aisladas.has(x) && c.enemigas(x) > 0 && E.fort[x] < p.fortificar).sort((a, b) => c.enemigas(b) - c.enemigas(a))[0];
  if (r === undefined || !c.puedePagar(FORTALEZA[E.fort[r] + 1])) return;
  c.paga(FORTALEZA[E.fort[r] + 1]); o.push(`fortificar ${nr(r)}`);
}

function mejorar(c) {
  const { E, s, p, o } = c;
  if (p.mejorar === undefined || !c.propias.some((r) => E.edif[r] === 'cuartel' && !c.aisladas.has(r))) return;
  const total = [0, 0, 0, 0];
  for (const r of regionesDe(E, s)) pilaDe(E, r, s).forEach((n, t) => { total[t] += n; });
  const tipo = p.mejorar === 'usado' ? argmax(total) : p.mejorar, nivel = E.reinos[s].mejoras[tipo];
  if (nivel >= MEJORAS.maximo || !c.puedePagar(MEJORAS.costo[nivel])) return;
  c.paga(MEJORAS.costo[nivel]); o.push(`mejorar ${LETRAS[tipo]}`);
}

// Que reclutar contra lo que tengo enfrente: el tipo que domina a la mezcla de las tropas enemigas que tocan mi territorio (contra L: A; contra A: J; contra J: L; contra I: J) y, con un cuartel
// al lado de una fortaleza enemiga, hasta 3 Ingenios que la debilitan. Sin informacion, Arqueros y Lanceros. Cada entrada es "TIPO" o "TIPO:tope".
function contra(c) {
  const { E, s, t } = c, mezcla = [0, 0, 0, 0], vistas = new Set();
  let fortaleza = false;
  for (const r of c.propias) for (const v of vecinas(E, r)) {
    if (vistas.has(v)) continue;
    vistas.add(v);
    for (const k of presentes(E, v)) if (k !== s && !aliado(E, s, k, t)) { pilaDe(E, v, k).forEach((n, ti) => { mezcla[ti] += n; }); if (E.dueno[v] === k && E.fort[v] >= 1) fortaleza = true; }
  }
  const asedio = fortaleza && c.cuartel ? ['I:3'] : [];
  if (!sumaPila(mezcla)) return [...asedio, 'A', 'L'];
  const respuesta = ['A', 'J', 'L', 'J'][argmax(mezcla)];
  if (respuesta === 'J') c.recurso = 'Caballos'; // y que la expansion busque Caballos
  return [...asedio, respuesta, 'L'];
}

function reclutar(c) {
  const { E, s, p, st, o } = c, sitio = c.sitio, cuartel = E.edif[sitio] === 'cuartel';
  const factor = cuartel ? (E.dan[sitio] ? CUARTEL.danado : CUARTEL.entero) : 1;
  const libre = Math.min(p.porTurno, st.Comida - Math.ceil(raciones(E, s) / COMIDA.tropasPorRacion) - 1);
  if (libre < 1) return;
  const pila = [0, 0, 0, 0];
  c.cuartel = cuartel;
  for (const entrada of p.prioridad === 'contra' ? contra(c) : p.prioridad) {
    const [letra, tope = Infinity] = entrada.split(':'), tipo = LETRAS.indexOf(letra);
    if (tipo === 3 && !cuartel) continue;
    while (sumaPila(pila) < libre && pila[tipo] < tope) {
      pila[tipo]++;
      if (!c.puedePagar(costoDePila(pila, factor))) { pila[tipo]--; break; }
    }
  }
  if (!sumaPila(pila)) return;
  c.paga(costoDePila(pila, factor)); o.push(`reclutar ${nr(sitio)} ${piezas(pila)}`);
}

// Ataca los frentes cuya estimacion pasa del umbral con TODO lo que sale de las regiones vecinas, sin reusar una region de origen.
function atacar(c) {
  const { E, s, p, o } = c;
  for (const x of calcularFrentes(E, s).ataques) {
    if (x.enSitio || x.razon < p.umbral || x.desde.some((r) => c.usadas.has(r))) continue;
    for (const r of x.desde) { o.push(`mover ${nr(r)} ${nr(x.d)} todo`); c.usadas.add(r); }
  }
}

// Los Jinetes saltan 2 regiones por una region libre, propia o aliada y caen sobre una region enemiga que no toca a la de salida.
function saltar(c) {
  const { E, s, t, p, o } = c;
  for (const r of c.propias) {
    const alli = pilaDe(E, r, s), n = Math.min(alli[2], sumaPila(alli) - 1);
    if (c.usadas.has(r) || n < 2) continue;
    const pila = [0, 0, n, 0];
    objetivo: for (const w of vecinas(E, r)) {
      const O = E.dueno[w];
      if (!(O < 0 || O === s || aliado(E, s, O, t))) continue;
      for (const d of vecinas(E, w)) {
        const X = E.dueno[d];
        if (X < 0 || X === s || aliado(E, s, X, t) || vecinas(E, r).includes(d)) continue;
        if (enfrentar(E, s, pila, d, s, t).razon < p.umbral) continue;
        o.push(`mover ${nr(r)} ${nr(d)} ${piezas(pila)}`); c.usadas.add(r);
        break objetivo;
      }
    }
  }
}

// Manda unos pocos a cada region libre vecina (con preferencia por las que traen recurso) y acerca al frente, o a donde queda tierra libre, a los que se quedan atras.
function expandir(c) {
  const { E, s, p, o } = c, libresAdy = (r) => vecinas(E, r).filter((v) => E.dueno[v] < 0).length;
  const peso = (v) => (c.recurso && E.mapa.regs[v].rec === c.recurso ? 2 : E.mapa.regs[v].rec ? 1 : 0);
  for (const r of c.propias) {
    if (c.usadas.has(r) || o.length >= MAX_ORDENES - 1) continue;
    const alli = pilaDe(E, r, s);
    let spare = sumaPila(alli) - 1;
    const libres = vecinas(E, r).filter((v) => E.dueno[v] < 0).sort((a, b) => peso(b) - peso(a) || a - b);
    let queda = pilaQueSale(alli);
    for (const f of libres) {
      if (spare < p.expandir || o.length >= MAX_ORDENES - 1) break;
      const pila = hasta(queda, p.expandir);
      o.push(`mover ${nr(r)} ${nr(f)} ${piezas(pila)}`); c.usadas.add(r);
      queda = queda.map((n, t) => n - pila[t]); spare -= p.expandir;
    }
    if (libres.length || c.enemigas(r) > 0 || spare < 3) continue; // un frente se queda como esta; los interiores empujan hacia donde hay enemigos o tierra libre
    const valor = (v) => 2 * c.enemigas(v) + libresAdy(v);
    const mejor = vecinas(E, r).filter((v) => E.dueno[v] === s && valor(v) > valor(r)).sort((a, b) => valor(b) - valor(a))[0];
    if (mejor !== undefined) { o.push(`mover ${nr(r)} ${nr(mejor)} todo`); c.usadas.add(r); }
  }
}

// El pacto que se propone: contestar a quien me propuso; si no, al vecino con el que mas frontera comparto. Un reino deshonrado no firma pactos.
function diplomacia(c) {
  const { E, s, t, p } = c;
  if (p.pactos === 'ninguno' || E.reinos[s].honor <= HONOR.deshonrado) return null;
  const candidatos = E.reinos.filter((x) => x.vivo && x.s !== s && x.honor > HONOR.deshonrado && !(E.reinos[s].pactos[x.s] >= t + 1));
  const propuso = candidatos.find((x) => x.propuestaPrevia === s);
  if (propuso) return propuso.nombre;
  const contacto = (x) => c.propias.reduce((n, r) => n + vecinas(E, r).filter((v) => E.dueno[v] === x.s).length, 0);
  const vecino = candidatos.filter((x) => contacto(x) > 0).sort((a, b) => contacto(b) - contacto(a) || a.s - b.s)[0];
  return (vecino ?? candidatos[0])?.nombre ?? null;
}

// El traidor: manda sus tropas sobrantes de visita a las regiones del aliado que tocan las suyas y decide que hacer con las que ya estan dentro.
function traicion(c) {
  const { E, s, t, o } = c, yo = E.reinos[s], rompe = new Set();
  for (let d = 0; d < E.dueno.length; d++) {
    const X = E.dueno[d], alli = pilaDe(E, d, s);
    if (X < 0 || X === s || sumaPila(alli) === 0) continue;
    const vigente = yo.pactos[X] >= t, { f, def } = enfrentar(E, s, alli, d, s, t), razon = (vigente ? f * TIERRA.factor : f) / def;
    if (vigente && razon >= 1.3 && !rompe.has(X)) { rompe.add(X); o.push(`romper ${E.reinos[X].nombre}`); }
    if ((vigente && razon >= 1.3) || (!vigente && razon >= 1.0)) { o.push(`atacar ${nr(d)}`); continue; }
    const casa = vecinas(E, d).find((v) => E.dueno[v] === s);
    if (!vigente && razon < 0.7 && casa !== undefined) o.push(`mover ${nr(d)} ${nr(casa)} todo`); // se retira
  }
  for (const r of c.propias) { // visitas: lo que sobra va a la region aliada mas floja que toca la propia (nunca su capital)
    if (c.usadas.has(r) || sumaPila(pilaDe(E, r, s)) < 4) continue;
    const destinos = vecinas(E, r).filter((v) => E.dueno[v] >= 0 && E.dueno[v] !== s && aliado(E, s, E.dueno[v], t) && v !== E.reinos[E.dueno[v]].capital);
    destinos.sort((a, b) => totalPila(E, a, E.dueno[a]) - totalPila(E, b, E.dueno[b]));
    if (destinos.length) { o.push(`mover ${nr(r)} ${nr(destinos[0])} todo`); c.usadas.add(r); }
  }
}

function jugar(E, s, perfil) {
  const p = PERFILES[perfil], t = E.turno + 1, yo = E.reinos[s], st = { ...yo.stock }, o = [], propias = regionesDe(E, s);
  const aisladas = new Set(regionesAisladas(E, s, t));
  const enemigas = (r) => vecinas(E, r).filter((v) => E.dueno[v] >= 0 && E.dueno[v] !== s && !aliado(E, s, E.dueno[v], t)).length;
  const conectadas = propias.filter((r) => !aisladas.has(r));
  // el sitio donde reclutar y construir el cuartel: mientras quede tierra libre al lado, la region que mas toca; si no, la que mas enemigos toca (la capital si ninguna toca a nadie)
  const libresAlLado = (r) => vecinas(E, r).filter((v) => E.dueno[v] < 0).length;
  const frente = conectadas.filter((r) => libresAlLado(r) > 0).sort((a, b) => libresAlLado(b) - libresAlLado(a) || a - b)[0]
    ?? conectadas.filter((r) => enemigas(r) > 0).sort((a, b) => enemigas(b) - enemigas(a) || totalPila(E, a, s) - totalPila(E, b, s))[0] ?? yo.capital;
  const c = {
    E, s, t, p, st, o, propias, aisladas, capital: yo.capital, frente, enemigas, usadas: new Set(),
    recurso: p.recurso, puedePagar: (costo) => Object.entries(costo).every(([r, v]) => st[r] >= v), paga: (costo) => { for (const [r, v] of Object.entries(costo)) st[r] -= v; },
  };
  c.sitio = [frente, ...conectadas].find((r) => E.edif[r] === 'cuartel') ?? frente;
  construir(c); fortificar(c); mejorar(c); reclutar(c);
  if (p.pactos === 'traidor') traicion(c);
  atacar(c);
  if (p.saltos) saltar(c);
  expandir(c);
  return base({ ordenes: o.slice(0, MAX_ORDENES), pacto_con: diplomacia(c), nota: `Plan: ${perfil}` });
}

export const lanceroMasa = (E, s) => jugar(E, s, 'lancero-masa');
export const arqueroDefensivo = (E, s) => jugar(E, s, 'arquero-defensivo');
export const jineteRelampago = (E, s) => jugar(E, s, 'jinete-relampago');
export const mixtoAdaptativo = (E, s) => jugar(E, s, 'mixto-adaptativo');
export const traidor = (E, s) => jugar(E, s, 'traidor');
export const leal = (E, s) => jugar(E, s, 'leal');

export const BOTS_V2 = { 'lancero-masa': lanceroMasa, 'arquero-defensivo': arqueroDefensivo, 'jinete-relampago': jineteRelampago, 'mixto-adaptativo': mixtoAdaptativo, traidor, leal };

// Como se muestran en el marcador y el video (texto publico: lleva acentos). Los colores son de control, no de una IA.
export const INFO_BOTS_V2 = {
  'lancero-masa': { nombre: 'Lanceros en masa', color: '#A67C52' },
  'arquero-defensivo': { nombre: 'Arqueros a la defensiva', color: '#5E8C7B' },
  'jinete-relampago': { nombre: 'Jinetes relámpago', color: '#C46F5A' },
  'mixto-adaptativo': { nombre: 'Mixto adaptativo', color: '#6D7FB5' },
  traidor: { nombre: 'Traidor', color: '#8A5A83' },
  leal: { nombre: 'Leal', color: '#7FA06A' },
};
