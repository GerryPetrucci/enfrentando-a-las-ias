// Las lineas CAPACIDAD y FRENTES de la vista (Guerra 2.0.0): lo que un reino puede reclutar y como se ven sus batallas posibles. Funciones puras sobre el estado que usan la MISMA formula de fuerza que el
// motor (batalla.js, equilibrio.js) y SOLO datos publicos: las mejoras de los rivales no se ven, asi que se cuentan en cero (el titulo de la linea lo dice).

import { UNIDADES, CUARTEL, N_TIPOS } from './constantes.js';
import { fuerzasDeBandos } from './batalla.js';
import { modificadorDeReino, bonoDePatria } from './equilibrio.js';
import { aliado, pila as pilaDe, presentes, regionesDe, nombreRegion } from './estado.js';
import { sumaPila, sumarPilas } from './unidades.js';
import { regionesAisladas } from './suministro.js';

const SIN_MEJORAS = [0, 0, 0, 0];
const MAX_ATAQUES = 5, MAX_AMENAZAS = 3;

// La pila que sale de una region propia con `todo`: todas las unidades menos una, la mas barata (la de menor indice).
function pilaQueSale(pila) {
  const sale = [...pila];
  for (let t = 0; t < N_TIPOS; t++) if (sale[t] > 0) { sale[t]--; break; }
  return sale;
}

// El bando que defiende la region d: su dueno con todo lo que tiene ahi y los invitados aliados del dueno que no son aliados del atacante `contra` (defensa conjunta). `yo`: el reino que mira
// (sus mejoras son las unicas que se conocen).
function bandoDefensor(E, d, contra, yo, t) {
  const O = E.dueno[d], miembros = [];
  for (const k of presentes(E, d)) {
    if (k !== O && !(aliado(E, k, O, t) && !aliado(E, k, contra, t))) continue;
    miembros.push({ k, pila: pilaDe(E, d, k), mejoras: k === yo ? E.reinos[k].mejoras : SIN_MEJORAS, mod: 1 });
  }
  return { miembros, defensor: true, ataca: false, defensaMod: bonoDePatria(O, regionesDe(E, O).length) };
}

// Fuerza del ataque de `atacante` con la pila `pila` sobre la region d, y defensa de la region contra esa mezcla.
function enfrentar(E, atacante, pila, d, yo, t) {
  const bandos = [
    { miembros: [{ k: atacante, pila, mejoras: atacante === yo ? E.reinos[atacante].mejoras : SIN_MEJORAS, mod: modificadorDeReino(E, atacante, d, t) }], defensor: false, ataca: true },
    bandoDefensor(E, d, atacante, yo, t),
  ];
  const [f, def] = fuerzasDeBandos(bandos, { terr: E.mapa.regs[d].terr, fort: E.fort[d] });
  return { f, def, razon: def > 0 ? f / def : Infinity };
}

// -> { ataques: [{ d, dueno, desde: [regiones], enSitio, f, def, razon }], amenazas: [{ a, atacante, desde: [regiones], f, def, razon }] }, cada lista de mayor a menor razon (sin recortar).
export function calcularFrentes(E, i) {
  const t = E.turno + 1, NR = E.dueno.length, ataques = [], amenazas = [];
  const enemigo = (k) => k >= 0 && k !== i && !aliado(E, i, k, t);
  // Ataques: cada region de un reino sin pacto contigo que toca a una tuya, con la suma de lo que puede salir de tus regiones vecinas; y las visitas hostiles tuyas (en sitio).
  for (let d = 0; d < NR; d++) {
    const O = E.dueno[d];
    if (!enemigo(O)) continue;
    const desde = E.mapa.regs[d].vecinos.filter((a) => E.dueno[a] === i && sumaPila(pilaDe(E, a, i)) > 1);
    if (desde.length) ataques.push({ d, dueno: O, desde: [...desde].sort((x, y) => x - y), enSitio: false, ...enfrentar(E, i, sumarPilas(desde.map((a) => pilaQueSale(pilaDe(E, a, i)))), d, i, t) });
    const alli = pilaDe(E, d, i);
    if (sumaPila(alli) > 0) ataques.push({ d, dueno: O, desde: [], enSitio: true, ...enfrentar(E, i, alli, d, i, t) });
  }
  // Amenazas: cada region tuya que toca a regiones de un reino sin pacto contigo, con lo que ese reino puede mandar contra ella.
  for (const a of regionesDe(E, i)) {
    const porReino = new Map();
    for (const b of E.mapa.regs[a].vecinos) {
      const X = E.dueno[b];
      if (!enemigo(X) || sumaPila(pilaDe(E, b, X)) <= 1) continue;
      if (!porReino.has(X)) porReino.set(X, []);
      porReino.get(X).push(b);
    }
    for (const [X, orig] of porReino) {
      const pila = sumarPilas(orig.map((b) => pilaQueSale(pilaDe(E, b, X))));
      const bandos = [
        { miembros: [{ k: X, pila, mejoras: SIN_MEJORAS, mod: modificadorDeReino(E, X, a, t) }], defensor: false, ataca: true },
        bandoDefensor(E, a, X, i, t),
      ];
      const [f, def] = fuerzasDeBandos(bandos, { terr: E.mapa.regs[a].terr, fort: E.fort[a] });
      amenazas.push({ a, atacante: X, desde: [...orig].sort((x, y) => x - y), f, def, razon: def > 0 ? f / def : Infinity });
    }
  }
  const porRazon = (x, y) => y.razon - x.razon || (x.d ?? x.a) - (y.d ?? y.a);
  return { ataques: ataques.sort(porRazon), amenazas: amenazas.sort(porRazon) };
}

const num = (x) => x.toFixed(1), razon = (x) => (Number.isFinite(x) ? x.toFixed(2) : 'inf');
const nombre = (E, k) => E.reinos[k].nombre;

// Las lineas de FRENTES (sin el titulo): hasta 5 ataques y 3 amenazas.
export function lineasDeFrentes(E, i) {
  const { ataques, amenazas } = calcularFrentes(E, i);
  return [
    ...ataques.slice(0, MAX_ATAQUES).map((x) => `${nombreRegion(x.d)} ${nombre(E, x.dueno)} ${x.enSitio ? 'en sitio' : `desde ${x.desde.map(nombreRegion).join(' ')}`}: ataque ${num(x.f)} vs defensa ${num(x.def)} (x${razon(x.razon)})`),
    ...amenazas.slice(0, MAX_AMENAZAS).map((x) => `${nombreRegion(x.a)} amenazada por ${nombre(E, x.atacante)} desde ${x.desde.map(nombreRegion).join(' ')}: ataque ${num(x.f)} vs tu defensa ${num(x.def)} (x${razon(x.razon)})`),
  ];
}

// Cuantas unidades de cada tipo alcanzan con un almacen, a `factor` del costo normal (redondeo hacia arriba por recurso, como al reclutar): L, A, J (y I si `conIngenios`).
function alcance(stock, factor, conIngenios) {
  const out = [];
  UNIDADES.forEach((u, t) => {
    if (t === 3 && !conIngenios) return;
    const n = Math.min(...Object.entries(u.costo).map(([rec, c]) => Math.floor((stock[rec] + 1e-9) / (c * factor))));
    if (n > 0) out.push(`${u.id} ${n}`);
  });
  return out;
}

// CAPACIDAD: lo que puedes reclutar con tu almacen (cada tipo por separado). Con un cuartel entero o danado y no aislado, otra linea a su costo (aqui tambien los Ingenios).
export function lineasDeCapacidad(E, i) {
  const stock = E.reinos[i].stock, t = E.turno + 1, aisladas = new Set(regionesAisladas(E, i, t));
  const lineas = [], normal = alcance(stock, 1, false);
  if (normal.length) lineas.push(`Puedes reclutar hasta (sin cuartel): ${normal.join(', ')}.`);
  const cuarteles = regionesDe(E, i).filter((r) => E.edif[r] === 'cuartel' && !aisladas.has(r));
  if (cuarteles.length) {
    const entero = cuarteles.some((r) => !E.dan[r]), factor = entero ? CUARTEL.entero : CUARTEL.danado;
    const conCuartel = alcance(stock, factor, true);
    if (conCuartel.length) lineas.push(`En tu cuartel (cuesta ${entero ? 'la mitad' : 'tres cuartos'}): ${conCuartel.join(', ')}.`);
  }
  return lineas;
}
