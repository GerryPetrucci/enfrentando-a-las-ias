// Movimientos simultaneos, ataques en sitio, batallas (con visitas, defensa conjunta y coaliciones), herencia de edificios, traspaso de la Maravilla y caida de reinos.
//
// Cada region guarda las unidades de cada reino presente: el dueno y, a veces, invitados (aliados con pacto, u hostiles cuyo pacto termino). Quien pelea en una region:
//   - ATACANTES: los que llegan de fuera sin ser el dueno ni sus aliados, y los que dan `atacar REGION` donde ya estan (con las unidades que comprometen);
//   - OBJETIVOS: el dueno si lo ataca alguien de fuera; los enemigos (sin pacto) presentes de quien ataca en sitio; y los aliados invitados de un objetivo que no sean aliados de ningun atacante
//     (defensa conjunta). Un objetivo pelea con TODAS sus unidades en la region. Un aliado de los dos lados no participa.
// Los participantes con pacto entre si forman un bando (coalicion). El dueno y los suyos defienden con la fortaleza y el terreno de la region; quien lucha en tierra ajena sin pacto con el dueno rinde TIERRA_AJENA.

import { aliado, contarEdificios, regionesDe, pila as pilaDe, ponerPila, sumarPila, sumarUni, presentes, totalPila } from '../estado.js';
import { RECURSOS, MAX_EDIFICIOS_POR_TIPO, N_TIPOS, TIERRA_AJENA, HEGEMON, RECONQUISTA, PATRIA } from '../constantes.js';
import { resolverBatalla } from '../batalla.js';
import { sumaPila, sumarPilas, dejarUna, pilaVacia } from '../unidades.js';

const anotar = (mapa, clave, x) => { if (!mapa.has(clave)) mapa.set(clave, []); mapa.get(clave).push(x); };

// Lo que pide una orden `mover`: su pila, o con `todo` todo lo que hay; en una region propia debe quedar 1 unidad (la mas barata), una tropa de visita puede irse entera.
function pedida(E, s, o, propia) {
  if (!o.todo) return o.pila;
  const pide = [...pilaDe(E, o.de, s)];
  if (propia) for (let t = 0; t < N_TIPOS; t++) if (pide[t] > 0) { pide[t]--; break; }
  return pide;
}

// Devuelve un texto (motivo) si el movimiento no vale, o { pila, n } si vale (ya resuelve la palabra `todo`).
function validar(ctx, s, o) {
  const { E, regs, NR } = ctx;
  const hay = Number.isInteger(o.de) && o.de >= 0 && o.de < NR ? pilaDe(E, o.de, s) : null, propia = hay !== null && E.dueno[o.de] === s;
  if (hay === null || (!propia && sumaPila(hay) < 1)) return 'la region de origen no es tuya'; // ni tuya ni con tropas tuyas de visita
  if (o.a >= NR) return 'la region de destino no existe';
  if (o.de === o.a) return 'origen y destino son la misma region';
  const pila = pedida(E, s, o, propia), n = sumaPila(pila);
  if (n < 1) return propia ? 'no hay tropas de sobra: debe quedar al menos 1 en la region de origen' : 'no tienes tropas en la region de origen';
  if (pila.some((x, t) => x > hay[t])) return 'no tienes esas unidades en la region de origen';
  if (propia && sumaPila(hay) - n < 1) return 'debe quedar al menos 1 tropa en la region de origen';
  if (!regs[o.de].vecinos.includes(o.a)) {
    // A 2 regiones llegan solo los Jinetes; la region del medio (vecina de las dos) debe ser tuya, libre o de un aliado con pacto vigente; nunca de otro reino (22 de octubre de 2026).
    if (pila.some((x, t) => t !== 2 && x > 0)) return 'solo los Jinetes llegan a 2 regiones';
    const medios = regs[o.de].vecinos.filter((w) => regs[w].vecinos.includes(o.a));
    if (!medios.length) return 'la region de destino no es vecina';
    if (!medios.some((w) => E.dueno[w] < 0 || E.dueno[w] === s || aliado(E, s, E.dueno[w], ctx.t))) return 'no puedes cruzar territorio de otro reino';
  }
  const duenoDestino = E.dueno[o.a];
  if (duenoDestino >= 0 && duenoDestino !== s && aliado(E, s, duenoDestino, ctx.t) && o.a === ctx.R[duenoDestino].capital) return 'la capital de un aliado esta cerrada';
  return { pila, n };
}

// Un ataque en sitio vale si tienes tropas ahi (las que se quedaron, porque los movimientos ya salieron) y hay enemigos (sin pacto contigo) con unidades en esa region.
// El dueno ataca siempre con toda su guarnicion: devuelve un texto (motivo) o { pila }, las unidades que pelean.
function validarAtaque(ctx, s, o) {
  const { E, NR } = ctx;
  if (!(o.region < NR)) return 'la region no existe';
  const hay = pilaDe(E, o.region, s);
  if (sumaPila(hay) < 1) return 'no tienes tropas en esa region';
  if (!presentes(E, o.region).some((j) => j !== s && !aliado(E, s, j, ctx.t))) return 'no hay enemigos en esa region';
  if (E.dueno[o.region] === s && !o.todo) return 'en tu propia region peleas con toda tu guarnicion: escribe solo atacar REGION';
  const pila = o.todo ? hay : o.pila;
  if (pila.some((x, t) => x > hay[t])) return 'no tienes esas unidades en esa region';
  return { pila };
}

// El edificio pasa al conquistador danado (50% de su efecto); si ya tiene 3 de ese tipo, se destruye.
function heredarEdificio(ctx, d, nuevo) {
  const { E } = ctx, e = E.edif[d];
  if (!e) return;
  if (contarEdificios(E, nuevo, e, d) >= MAX_EDIFICIOS_POR_TIPO) { E.edif[d] = null; E.dan[d] = 0; return; }
  E.dan[d] = 1;
}

// La region cambia de dueno (sus unidades ya estan colocadas): `viejo` es el dueno anterior (-1 si era libre).
function capturar(ctx, d, nuevo, viejo, huboCombate) {
  const { E, R } = ctx;
  E.dueno[d] = nuevo;
  if (huboCombate) E.fort[d] = Math.max(0, E.fort[d] - 1);
  heredarEdificio(ctx, d, nuevo);
  if (viejo < 0) return;
  E.perdidas[d] = { k: viejo, t: ctx.t }; // Reconquista: quien la perdio la ataca con bono los proximos turnos
  ctx.evt({ tipo: 'conquista', k: nuevo, contra: viejo, r: d });
  if (E.maravilla && E.maravilla.r === d) { // la Maravilla pasa intacta y su cuenta de turnos empieza de cero
    E.maravilla.k = nuevo; E.maravilla.n = 0; E.maravilla.t0 = ctx.t;
    ctx.evt({ tipo: 'maravilla_cae', k: nuevo, de: viejo });
  }
  if (d === R[viejo].capital && R[viejo].vivo) ctx.caidas.push({ k: viejo, por: nuevo });
}

// Nivel de mejora mas alto entre los tipos que de verdad pelean (lo que la escena muestra como «armas»).
const nivelMaximo = (ctx, miembros) => miembros.reduce((m, x) => x.pila.reduce((mm, n, t) => (n > 0 ? Math.max(mm, ctx.R[x.k].mejoras[t]) : mm), m), 0);

// El reino con mas unidades en la lista (empate: el de menor asiento).
const jefe = (lista) => lista.reduce((m, x) => (sumaPila(x.pila) > sumaPila(m.pila) || (sumaPila(x.pila) === sumaPila(m.pila) && x.k < m.k) ? x : m)).k;

// Una region sin dueno que aun tiene unidades de visita (pasa si el dueno se quedo sin ellas y nadie gano): se la queda el reino que tenga mas.
function asegurarDueno(ctx, d) {
  const { E } = ctx;
  if (E.dueno[d] >= 0) return;
  const lista = presentes(E, d).map((k) => ({ k, pila: pilaDe(E, d, k) }));
  if (lista.length) E.dueno[d] = jefe(lista);
}

// Todo lo que pasa en la region `d` este turno. `llegadas` y `ataques`: [{ k, pila }] (los que llegan de fuera y los que atacan donde ya estan, con las unidades que comprometen).
function resolverRegion(ctx, d, llegadas, ataques) {
  const { E, R, regs } = ctx, t = ctx.t, O = E.dueno[d];
  const amigo = (k) => O >= 0 && (k === O || aliado(E, k, O, t));

  // Los refuerzos del dueno y las visitas de sus aliados entran en paz (y, si atacan la region, defienden); los demas son atacantes.
  const fuera = new Map(), sitio = new Map();
  for (const g of llegadas) {
    if (amigo(g.k)) sumarPila(E, d, g.k, g.pila);
    else fuera.set(g.k, sumarPilas([fuera.get(g.k) ?? pilaVacia(), g.pila]));
  }
  for (const a of ataques) sitio.set(a.k, sumarPilas([sitio.get(a.k) ?? pilaVacia(), a.pila]));
  const ini = new Set([...fuera.keys(), ...sitio.keys()]);
  if (!ini.size) return;

  // Objetivos: el dueno (si tiene unidades) cuando lo atacan de fuera, los enemigos presentes de quien ataca en sitio, y los aliados invitados de un objetivo que no lo son de ningun atacante.
  const obj = new Set();
  if (fuera.size && O >= 0 && totalPila(E, d, O) > 0) obj.add(O);
  for (const k of sitio.keys()) for (const j of presentes(E, d)) if (j !== k && !aliado(E, k, j, t)) obj.add(j);
  for (const g of presentes(E, d)) {
    if (ini.has(g) || obj.has(g)) continue;
    if ([...obj].some((j) => aliado(E, g, j, t)) && ![...ini].some((k) => aliado(E, g, k, t))) obj.add(g);
  }

  // Lo que mete cada participante: los objetivos todas las unidades que tienen ahi; los atacantes lo que comprometen (mas lo que llega). Todo eso sale de la region mientras se pelea.
  const part = [...new Set([...ini, ...obj])].sort((a, b) => a - b);
  const miembros = part.map((k) => {
    const sale = obj.has(k) ? pilaDe(E, d, k) : sitio.get(k) ?? pilaVacia();
    return { k, sale, pila: sumarPilas([sale, fuera.get(k) ?? pilaVacia()]) };
  });
  for (const m of miembros) for (let ti = 0; ti < N_TIPOS; ti++) if (m.sale[ti]) sumarUni(E, d, m.k, ti, -m.sale[ti]);
  const colocar = (lista) => { for (const x of lista) sumarPila(E, d, x.k, x.pila); };

  // Coaliciones: los participantes con pacto entre si pelean del mismo lado.
  const raiz = new Map(part.map((k) => [k, k]));
  const buscar = (k) => { while (raiz.get(k) !== k) k = raiz.get(k); return k; };
  for (const a of part) for (const b of part) if (a < b && aliado(E, a, b, t) && buscar(a) !== buscar(b)) raiz.set(buscar(b), buscar(a));
  const grupos = new Map();
  for (const m of miembros) anotar(grupos, buscar(m.k), m);
  // Modificadores de quien pelea en la region de un dueno con quien no tiene pacto: tierra ajena; si el dueno es el Hegemon, +25 %; si la region era suya y la perdio hace poco, Reconquista.
  const perdida = E.perdidas[d];
  const modDe = (k) => {
    if (!(O >= 0 && k !== O && !aliado(E, k, O, t))) return 1;
    let m = TIERRA_AJENA;
    if (HEGEMON.activo && E.hegemon === O) m *= HEGEMON.bonoAtaque;
    if (RECONQUISTA.activo && perdida && perdida.k === k && t - perdida.t <= RECONQUISTA.turnos) m *= RECONQUISTA.bonoAtaque;
    return m;
  };
  const patria = O >= 0 && PATRIA.activo && ctx.regionesIniciales[O] <= PATRIA.maxRegiones ? PATRIA.bonoDefensa : 1; // Patria: con pocas regiones al empezar el turno, las del reino defienden con bono
  const bandos = [...grupos.values()].map((ms) => ({
    miembros: ms.map((m) => ({ k: m.k, pila: m.pila, mejoras: R[m.k].mejoras, mod: modDe(m.k) })),
    defensor: O >= 0 && ms.some((m) => m.k === O),
    defensaMod: patria,
    ataca: ms.some((m) => ini.has(m.k)),
  }));

  if (bandos.length === 1) { // nadie se opone: se toma la region (libre, o de un dueno sin unidades) y el que lleva mas unidades queda de dueno; los demas, de visita
    const lista = bandos[0].miembros.map(({ k, pila }) => ({ k, pila }));
    colocar(lista);
    const nuevo = jefe(lista);
    if (nuevo !== O) capturar(ctx, d, nuevo, O, false);
    return;
  }

  const res = resolverBatalla(bandos, { terr: regs[d].terr, fort: E.fort[d], dueno: O });
  // Lo que el combate le deja a la escena del video (solo datos): el dueno, el terreno y la fortaleza de ANTES de la batalla (la conquista la baja despues), cada bando con su fuerza, sus unidades por tipo,
  // su nivel de mejoras («armas») y sus miembros. Los campos de siempre ({ d, k, perdidas }) no cambian.
  const datos = {
    dueno: O, terr: regs[d].terr, fort: E.fort[d],
    bandos: res.fichas.map((x) => ({ k: x.k, n: x.n, f: x.f, defensor: x.defensor, armas: nivelMaximo(ctx, x.miembros), uni: x.uni, miembros: x.miembros.map((m) => ({ k: m.k, uni: m.pila })) })),
  };
  const [, segundo] = res.fichas, duenoPeleo = miembros.find((m) => m.k === O);
  const duenoPasivo = O >= 0 && !duenoPeleo && totalPila(E, d, O) > 0; // los invitados pelean entre si dentro de su region
  if (res.empate) { // empate: el dueno resiste con 1 unidad; sin el en la pelea, ambos bandos desaparecen (y una region sin unidades de su dueno queda libre)
    if (duenoPeleo) {
      sumarPila(E, d, O, dejarUna(duenoPeleo.pila));
      ctx.combates.push({ d, k: O, perdidas: res.todos - 1, ...datos, resultado: 'empate', quedan: 1 });
      ctx.evt({ tipo: 'repelido', k: segundo.k, contra: O, r: d });
    } else {
      if (O >= 0 && !duenoPasivo) { E.dueno[d] = -1; E.fort[d] = 0; E.edif[d] = null; E.dan[d] = 0; E.perdidas[d] = null; }
      ctx.combates.push({ d, k: duenoPasivo ? O : -1, perdidas: res.todos, ...datos, resultado: 'empate', quedan: 0 });
    }
    asegurarDueno(ctx, d);
    return;
  }
  const ganador = res.ganador, quedan = res.supervivientes.reduce((s, x) => s + sumaPila(x.pila), 0);
  colocar(res.supervivientes);
  if (ganador.defensor) { // el bando del dueno repele
    ctx.combates.push({ d, k: ganador.k, perdidas: res.perdidas, ...datos, resultado: 'repelido', quedan });
    ctx.evt({ tipo: 'repelido', k: segundo.k, contra: ganador.k, r: d });
  } else if (duenoPasivo) { // duelo entre invitados: la region sigue siendo de su dueno
    const k = jefe(res.supervivientes);
    ctx.combates.push({ d, k, perdidas: res.perdidas, ...datos, resultado: 'duelo', quedan });
    ctx.evt({ tipo: 'duelo', k, contra: segundo.k, r: d });
  } else {
    const nuevo = jefe(res.supervivientes);
    ctx.combates.push({ d, k: nuevo, perdidas: res.perdidas, ...datos, resultado: 'captura', quedan });
    capturar(ctx, d, nuevo, O, true);
  }
  asegurarDueno(ctx, d);
}

// El reino que cae pierde todas sus unidades (tambien las de visita); sus regiones quedan libres, salvo donde haya invitados de otro reino vivo: el de mas unidades se la queda.
function procesarCaidas(ctx) {
  const { E, R, NR } = ctx;
  for (const c of ctx.caidas) {
    const reino = R[c.k];
    if (!reino.vivo) continue;
    reino.regsAlCaer = regionesDe(E, c.k).length; reino.vivo = false; reino.cayoEn = ctx.t;
    for (const rec of RECURSOS) { R[c.por].stock[rec] += reino.stock[rec]; reino.stock[rec] = 0; }
    for (let i = 0; i < NR; i++) {
      if (totalPila(E, i, c.k)) ponerPila(E, i, c.k, pilaVacia());
      if (E.dueno[i] !== c.k) continue;
      E.fort[i] = 0; E.edif[i] = null; E.dan[i] = 0; E.perdidas[i] = null;
      const herederos = presentes(E, i).filter((k) => R[k].vivo).map((k) => ({ k, pila: pilaDe(E, i, k) }));
      E.dueno[i] = herederos.length ? jefe(herederos) : -1;
    }
    for (const o of R) { o.pactos[c.k] = 0; o.pactoOk[c.k] = false; }
    reino.pactos.fill(0); reino.pactoOk.fill(false); reino.ofertasIn = []; reino.privIn = [];
    ctx.evt({ tipo: 'caida', k: c.k, por: c.por });
  }
}

// Fase 7 del turno: los movimientos validos salen todos a la vez (quien sale deja menos defensa); luego se validan los ataques en sitio con lo que se quedo; y se resuelve cada region
// con llegadas o ataques, en orden de id.
export function movimientos(ctx) {
  const { E } = ctx, llegan = new Map(), sitio = new Map();
  for (const { s, o } of ctx.pend.movimientos) {
    const v = validar(ctx, s, o);
    if (typeof v === 'string') { ctx.mal(s, o.texto, v); continue; }
    for (let t = 0; t < N_TIPOS; t++) if (v.pila[t]) sumarUni(E, o.de, s, t, -v.pila[t]);
    ctx.movs.push({ f: o.de, d: o.a, n: v.n, k: s, uni: v.pila });
    anotar(llegan, o.a, { k: s, pila: v.pila });
    ctx.bien(s);
  }
  const ordenados = new Set();
  for (const { s, o } of ctx.pend.ataques) {
    const v = validarAtaque(ctx, s, o);
    if (typeof v === 'string') { ctx.mal(s, o.texto, v); continue; }
    if (ordenados.has(`${s}:${o.region}`)) { ctx.mal(s, o.texto, 'ya ordenaste atacar esa region este turno'); continue; }
    ordenados.add(`${s}:${o.region}`);
    anotar(sitio, o.region, { k: s, pila: v.pila });
    ctx.bien(s);
  }
  for (const d of [...new Set([...llegan.keys(), ...sitio.keys()])].sort((a, b) => a - b)) resolverRegion(ctx, d, llegan.get(d) ?? [], sitio.get(d) ?? []);
  procesarCaidas(ctx);
}
