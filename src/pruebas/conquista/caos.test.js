// Partidas al azar con ordenes de todo tipo (mover a aliados y enemigos, atacar en sitio, romper pactos, reclutar...): lo que NUNCA debe pasar, turno a turno, aunque los reinos hagan locuras.
// Es la prueba de estres de las alianzas, las visitas y las batallas de coalicion (Guerra 2.0.0, etapa 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearRng } from '../../rng.js';
import { crearEstado, pila as pilaDe, totalPila, totalUnidades, regionesDe, presentes, aliado } from '../../juegos/conquista/estado.js';
import { normalizarRespuesta } from '../../juegos/conquista/ordenes.js';
import { aplicarTurno } from '../../juegos/conquista/turno/index.js';
import { mapaDe, verificarInvariantes, R } from './ayudas.js';

// Un bot que manda ordenes validas e invalidas al azar. Los reinos pares e impares de a dos son «amigos»: se proponen pacto casi cada turno, asi que hay aliados, visitas, rupturas y traiciones;
// ademas los dos amigos se juntan a veces sobre una misma region (ataques de coalicion) y atacan en sitio donde hay enemigos.
function caos(E, s, rng) {
  const NR = E.mapa.regs.length, t = E.turno + 1, entero = (n) => Math.floor(rng() * n), elegir = (a) => a[entero(a.length)];
  const conTropas = [], duenas = [], conEnemigos = [];
  for (let r = 0; r < NR; r++) {
    if (totalPila(E, r, s) === 0) continue;
    conTropas.push(r);
    if (E.dueno[r] === s) duenas.push(r);
    if (presentes(E, r).some((j) => j !== s && !aliado(E, s, j, t))) conEnemigos.push(r);
  }
  const pilaAlAzar = (r) => {
    const hay = pilaDe(E, r, s), partes = [];
    hay.forEach((n, ti) => { if (n > 0 && rng() < 0.7) partes.push('LAJI'[ti] + (1 + entero(n))); });
    return partes.length ? partes.join(' ') : 'todo';
  };
  const amigo = s % 2 === 0 ? s + 1 : s - 1;
  const frontera = (k) => { const f = new Set(); for (let r = 0; r < NR; r++) if (totalPila(E, r, k) > 0) for (const v of E.mapa.regs[r].vecinos) f.add(v); return f; };
  // Regiones ajenas a los dos amigos que tocan a ambos: los dos eligen la misma cada turno (la cuenta sale del mismo estado), asi atacan juntos.
  const comunes = amigo < E.k && E.reinos[amigo].vivo ? [...frontera(s)].filter((r) => frontera(amigo).has(r) && E.dueno[r] !== s && E.dueno[r] !== amigo).sort((a, b) => a - b) : [];
  const objetivoComun = comunes.length ? comunes[(t * 7) % comunes.length] : -1;
  const ordenes = [];
  for (let i = 0, n = 2 + entero(8); i < n; i++) {
    const p = rng();
    if (p < 0.2 && objetivoComun >= 0) { // juntarse sobre la region del turno
      const a = conTropas.find((r) => E.mapa.regs[r].vecinos.includes(objetivoComun));
      if (a !== undefined) ordenes.push(`mover ${R(a)} ${R(objetivoComun)} ${pilaAlAzar(a)}`);
    } else if (p < 0.4 && conTropas.length) { // mover (a veces a la region del amigo, a veces a 2 pasos)
      const a = elegir(conTropas), vecinos = E.mapa.regs[a].vecinos, delAmigo = vecinos.filter((v) => E.dueno[v] === amigo);
      const b = delAmigo.length && rng() < 0.4 ? elegir(delAmigo) : rng() < 0.15 ? elegir(E.mapa.regs[elegir(vecinos)].vecinos) : elegir(vecinos);
      ordenes.push(`mover ${R(a)} ${R(b)} ${rng() < 0.2 ? 'todo' : pilaAlAzar(a)}`);
    } else if (p < 0.6 && conTropas.length) { // atacar en sitio, casi siempre donde hay enemigos
      const a = conEnemigos.length && rng() < 0.85 ? elegir(conEnemigos) : elegir(conTropas);
      ordenes.push(rng() < 0.5 ? `atacar ${R(a)}` : `atacar ${R(a)} ${pilaAlAzar(a)}`);
    } else if (p < 0.63) { // romper (casi siempre un pacto que existe)
      const pactos = E.reinos.filter((x) => x.s !== s && aliado(E, s, x.s, t));
      ordenes.push(`romper ${(pactos.length && rng() < 0.8 ? elegir(pactos) : E.reinos[elegir([...Array(E.k).keys()])]).nombre}`);
    } else if (p < 0.9 && duenas.length) ordenes.push(`reclutar ${R(elegir(duenas))} L${1 + entero(5)}`);
    else if (duenas.length) ordenes.push(`mercenarios ${R(elegir(duenas))} ${1 + entero(3)}`);
  }
  const socio = rng() < 0.75 ? amigo : entero(E.k); // casi siempre el amigo; a veces otro, para que haya alianzas cruzadas
  return { ordenes, pacto_con: socio < E.k && socio !== s && rng() < 0.85 ? E.reinos[socio].nombre : null, mensaje: '', privados: [], razon: 'caos' };
}

function jugar(k, seed) {
  const E = crearEstado(crearRng(seed), { jugadores: k, mapa: mapaDe(seed, k) }), rng = crearRng((seed ^ 0xca05) >>> 0), cuenta = { visitas: 0, coaliciones: 0, duelos: 0, conquistas: 0, caidas: 0, tresBandos: 0, aisladas: 0, eventos: 0, hegemones: 0 };
  while (E.ganador === null) {
    const jugadas = E.reinos.map((r, s) => (r.vivo ? normalizarRespuesta(caos(E, s, rng), E) : null));
    const reg = aplicarTurno(E, jugadas);
    verificarInvariantes(E);
    for (const x of reg.estado.uni) if (E.dueno[x[0]] >= 0 && x[1] !== reg.estado.dueno[x[0]]) { cuenta.visitas++; break; }
    for (const c of reg.combates) { if (c.bandos.some((b) => b.miembros.length > 1)) cuenta.coaliciones++; if (c.resultado === 'duelo') cuenta.duelos++; if (c.bandos.length >= 3) cuenta.tresBandos++; }
    cuenta.conquistas += reg.eventos.filter((e) => e.tipo === 'conquista').length;
    cuenta.caidas += reg.eventos.filter((e) => e.tipo === 'caida').length;
    if (reg.estado.aisladas.length) cuenta.aisladas++;
    cuenta.eventos += reg.eventos.filter((e) => e.tipo === 'evento').length;
    cuenta.hegemones += reg.eventos.filter((e) => e.tipo === 'hegemon').length;
    if (E.turno > 31) throw new Error('la partida no termina');
  }
  return { E, cuenta };
}

test('partidas al azar de 2 a 5 reinos con ordenes de todo tipo: los invariantes se cumplen en todos los turnos y hay visitas, coaliciones, tres bandos, conquistas, caidas, regiones aisladas, eventos del mundo y Hegemon', () => {
  const total = { visitas: 0, coaliciones: 0, duelos: 0, conquistas: 0, caidas: 0, tresBandos: 0, aisladas: 0, eventos: 0, hegemones: 0 };
  for (const k of [2, 3, 4, 5]) for (let seed = 1; seed <= 25; seed++) {
    const { cuenta } = jugar(k, seed);
    for (const c of Object.keys(total)) total[c] += cuenta[c];
  }
  // Los duelos entre invitados (dos de visita pelean en la region de un tercero) casi no salen al azar: los cubre una prueba propia en alianzas.test.js.
  for (const [c, n] of Object.entries(total)) if (c !== 'duelos') assert.ok(n > 0, `la prueba de estres no vio ningun caso de "${c}": ya no estresa esa parte (${JSON.stringify(total)})`);
});

test('el motor es determinista con ordenes al azar: mismo seed, mismo estado final', () => {
  const huella = (E) => JSON.stringify([Array.from(E.dueno), Array.from(E.uni), E.reinos.map((r) => [r.vivo, r.honor, r.stock, r.mejoras]), E.turno, E.ganador]);
  for (const [k, seed] of [[3, 4], [4, 9], [5, 17]]) assert.equal(huella(jugar(k, seed).E), huella(jugar(k, seed).E));
});

test('un reino caido no deja unidades ni regiones en ninguna parte, y las regiones con dueno tienen unidades suyas', () => {
  for (const k of [3, 4, 5]) for (let seed = 30; seed <= 45; seed++) {
    const { E } = jugar(k, seed);
    for (const r of E.reinos.filter((x) => !x.vivo)) { assert.equal(totalUnidades(E, r.s), 0); assert.equal(regionesDe(E, r.s).length, 0); }
  }
});
