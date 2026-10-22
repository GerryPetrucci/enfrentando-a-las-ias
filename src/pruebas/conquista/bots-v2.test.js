// Guerra 2.0.0, etapa 8: los bots de control nuevos (lancero-masa, arquero-defensivo, jinete-relampago, mixto-adaptativo, traidor, leal). No son IAs: miden el balance, asi que tienen que jugar limpio
// (casi sin ordenes invalidas), no tocar nunca el estado y hacer lo que dice su perfil.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearRng } from '../../rng.js';
import { crearEstado, regionesDe, sumarUni, limpiarRegion } from '../../juegos/conquista/estado.js';
import { normalizarRespuesta } from '../../juegos/conquista/ordenes.js';
import { aplicarTurno } from '../../juegos/conquista/turno/index.js';
import { BOTS, INFO_BOTS } from '../../juegos/conquista-bots.js';
import { nuevoEstado, mapaDe, verificarInvariantes, R, frontera, fijarTropas } from './ayudas.js';

const NUEVOS = ['lancero-masa', 'arquero-defensivo', 'jinete-relampago', 'mixto-adaptativo', 'traidor', 'leal'];
const huella = (E) => JSON.stringify([Array.from(E.dueno), Array.from(E.uni), Array.from(E.fort), E.edif, Array.from(E.dan), E.reinos.map((r) => [r.stock, r.mejoras, r.honor, r.pactos, r.propuestaPrevia, r.vivo]), E.turno, E.hegemon, E.sequiaHasta]);
const ordenesDe = (bot, E, s = 0) => normalizarRespuesta(BOTS[bot](E, s, crearRng(1)), E);
const textos = (j) => j.ordenes.map((o) => o.texto);

// Una partida completa: el bot de `bot` en el asiento 0 y los otros cuatro de siempre. Devuelve las validas y el total de ordenes del bot, y lo que reclutó.
function jugar(bot, k, seed) {
  const E = crearEstado(crearRng(seed), { jugadores: k, mapa: mapaDe(seed, k) }), rng = crearRng((seed ^ 0xb07) >>> 0), nombres = [bot, 'agresivo', 'economico', 'pacifico', 'agresivo'];
  const cuenta = { validas: 0, total: 0, reclutadas: [0, 0, 0, 0], ataques: 0, rupturas: 0, sitio: 0 };
  while (E.ganador === null) {
    const antes = huella(E);
    const jugadas = E.reinos.map((r, s) => {
      if (!r.vivo) return null;
      const j = normalizarRespuesta(BOTS[nombres[s]](E, s, rng), E);
      assert.equal(huella(E), antes, `${nombres[s]} cambio el estado al decidir`);
      if (s === 0) for (const o of j.ordenes) { if (o.tipo === 'reclutar') o.pila.forEach((n, t) => { cuenta.reclutadas[t] += n; }); if (o.tipo === 'romper') cuenta.rupturas++; if (o.tipo === 'atacar') cuenta.sitio++; if (o.tipo === 'mover') cuenta.ataques++; }
      return j;
    });
    const reg = aplicarTurno(E, jugadas);
    verificarInvariantes(E);
    cuenta.validas += reg.obediencia[0].validas; cuenta.total += reg.obediencia[0].total;
    if (E.turno > 31) throw new Error('la partida no termina');
  }
  return { E, cuenta };
}

test('los bots nuevos estan registrados con nombre y color, y estan en el juego', () => {
  for (const id of NUEVOS) {
    assert.equal(typeof BOTS[id], 'function', id);
    assert.ok(INFO_BOTS[id].nombre && /^#[0-9a-f]{6}$/i.test(INFO_BOTS[id].color), id);
  }
  assert.equal(new Set(Object.values(INFO_BOTS).map((b) => b.color)).size, Object.keys(INFO_BOTS).length, 'colores distintos');
  assert.equal(new Set(Object.values(INFO_BOTS).map((b) => b.nombre)).size, Object.keys(INFO_BOTS).length, 'nombres distintos');
});

test('cada bot nuevo juega partidas completas de 2 a 5 reinos sin romper los invariantes, sin tocar el estado al decidir y casi sin ordenes invalidas', () => {
  for (const bot of NUEVOS) {
    let validas = 0, total = 0;
    for (const k of [2, 3, 4, 5]) for (let seed = 1; seed <= 5; seed++) { const { cuenta } = jugar(bot, k, seed); validas += cuenta.validas; total += cuenta.total; }
    assert.ok(total > 0, bot);
    assert.ok(validas / total >= 0.9, `${bot}: solo ${(100 * validas / total).toFixed(1)} % de sus ordenes valieron (${validas} de ${total})`);
  }
});

test('lancero-masa recluta solo Lanceros; arquero-defensivo, Arqueros mientras alcance la Madera; jinete-relampago, Jinetes mientras haya Caballos', () => {
  const E = nuevoEstado(4); E.reinos[0].stock = { Comida: 30, Madera: 10, Roca: 0, Hierro: 0, Oro: 0, Caballos: 0 };
  assert.ok(textos(ordenesDe('lancero-masa', E)).filter((t) => t.startsWith('reclutar')).every((t) => /^reclutar R\d+ L\d+$/.test(t)));
  const arq = textos(ordenesDe('arquero-defensivo', E)).find((t) => t.startsWith('reclutar'));
  assert.match(arq, /^reclutar R\d+ L\d+ A\d+$|^reclutar R\d+ A\d+$/);
  assert.ok(/A\d+/.test(arq), 'hay Madera: recluta Arqueros');
  assert.ok(!/J\d/.test(textos(ordenesDe('jinete-relampago', E)).find((t) => t.startsWith('reclutar'))), 'sin Caballos no hay Jinetes');
  E.reinos[0].stock.Caballos = 6;
  assert.match(textos(ordenesDe('jinete-relampago', E)).find((t) => t.startsWith('reclutar')), /J\d+/);
});

test('mixto-adaptativo recluta lo que domina a lo que tiene el vecino: contra Lanceros, Arqueros; contra Arqueros, Jinetes; contra Jinetes, Lanceros', () => {
  for (const [enemigo, esperado] of [[0, 'A'], [1, 'J'], [2, 'L']]) {
    const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
    E.dueno[d] = 1; fijarTropas(E, d, 0); sumarUni(E, d, 1, enemigo, 12); E.fort[d] = 0;
    E.reinos[0].stock = { Comida: 40, Madera: 10, Roca: 0, Hierro: 0, Oro: 0, Caballos: 10 };
    E.dueno[a] = 0; fijarTropas(E, a, 6);
    const orden = textos(ordenesDe('mixto-adaptativo', E)).find((t) => t.startsWith('reclutar'));
    assert.ok(orden, `recluta algo contra el tipo ${enemigo}`);
    assert.match(orden, new RegExp(`${esperado}\\d+`), `contra el tipo ${enemigo}: ${orden}`);
    assert.ok(!orden.startsWith('reclutar') || orden.indexOf(esperado) < orden.length, orden);
  }
});

test('el que ataca lo hace con todo lo que sale de las regiones vecinas cuando la estimacion pasa de su umbral, y se queda quieto si no', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.dueno[d] = 1; fijarTropas(E, d, 3); E.fort[d] = 0; fijarTropas(E, a, 14); E.mapa.regs[d].terr = 'll';
  for (const bot of ['lancero-masa', 'jinete-relampago', 'mixto-adaptativo']) assert.ok(textos(ordenesDe(bot, E)).includes(`mover ${R(a)} ${R(d)} todo`), `${bot} debia atacar`);
  const F = nuevoEstado(4), [a2, d2] = frontera(F, 0, -1);
  F.dueno[d2] = 1; fijarTropas(F, d2, 40); fijarTropas(F, a2, 5);
  for (const bot of NUEVOS) assert.ok(!textos(ordenesDe(bot, F)).includes(`mover ${R(a2)} ${R(d2)} todo`), `${bot} no debia atacar con 5 contra 40`);
});

test('leal contesta la propuesta de pacto de quien se la hizo y nunca rompe un pacto; arquero-defensivo tambien contesta', () => {
  const E = nuevoEstado(4); E.reinos[2].propuestaPrevia = 0;
  assert.equal(ordenesDe('leal', E).pactoCon, 2);
  assert.equal(ordenesDe('arquero-defensivo', E).pactoCon, 2);
  assert.equal(ordenesDe('lancero-masa', E).pactoCon, null, 'los agresivos no pactan');
  E.reinos[0].pactos[2] = E.reinos[2].pactos[0] = 30; E.reinos[2].propuestaPrevia = null;
  for (let i = 0; i < 3; i++) assert.ok(!textos(ordenesDe('leal', E)).some((t) => t.startsWith('romper')));
  // ni siquiera con tropas de visita y ventaja clara en tierra de su aliado (donde el traidor si rompe y ataca)
  const [a, d] = frontera(E, 0, -1);
  E.dueno[d] = 2; fijarTropas(E, d, 4); E.fort[d] = 0; E.mapa.regs[d].terr = 'll'; sumarUni(E, d, 0, 0, 15);
  const t = textos(ordenesDe('leal', E));
  assert.ok(!t.some((x) => x.startsWith('romper') || x === `atacar ${R(d)}`), t.join(' | '));
  assert.ok(a >= 0);
});

test('traidor con pacto vigente manda tropas de visita a la region aliada; con ventaja clara rompe y ataca en sitio; con el pacto vencido ataca sin romper; con desventaja se retira', () => {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.dueno[d] = 1; fijarTropas(E, d, 4); E.fort[d] = 0; E.mapa.regs[d].terr = 'll'; fijarTropas(E, a, 12);
  E.reinos[0].pactos[1] = E.reinos[1].pactos[0] = 30;
  assert.ok(textos(ordenesDe('traidor', E)).includes(`mover ${R(a)} ${R(d)} todo`), 'visita');
  sumarUni(E, d, 0, 0, 15); // 15 Lanceros de visita contra 4: 15 x 0.85 / 4 = 3.2
  const t1 = textos(ordenesDe('traidor', E));
  assert.ok(t1.includes('romper Ambar') && t1.includes(`atacar ${R(d)}`), t1.join(' | '));
  E.reinos[0].pactos[1] = E.reinos[1].pactos[0] = 0; // el pacto vencio: ya son hostiles
  const t2 = textos(ordenesDe('traidor', E));
  assert.ok(!t2.some((t) => t.startsWith('romper')) && t2.includes(`atacar ${R(d)}`), t2.join(' | '));
  const F = nuevoEstado(4), [a3, d3] = frontera(F, 0, -1);
  F.dueno[d3] = 1; fijarTropas(F, d3, 30); F.fort[d3] = 0; F.mapa.regs[d3].terr = 'll'; fijarTropas(F, a3, 3);
  sumarUni(F, d3, 0, 0, 4); // 4 de visita contra 30, sin pacto
  assert.ok(textos(ordenesDe('traidor', F)).includes(`mover ${R(d3)} ${R(a3)} todo`), 'se retira');
  F.reinos[0].pactos[1] = F.reinos[1].pactos[0] = 30; // con el pacto vigente y esa desventaja se queda quieto: ni rompe ni ataca ni se va
  const t3 = textos(ordenesDe('traidor', F));
  assert.ok(!t3.some((t) => t.startsWith('romper') || t === `atacar ${R(d3)}` || t === `mover ${R(d3)} ${R(a3)} todo`), t3.join(' | '));
});

test('ningun bot manda mas de 14 ordenes ni deja de devolver un objeto legible aunque el reino este casi muerto', () => {
  const E = nuevoEstado(5);
  for (let r = 0; r < E.dueno.length; r++) { E.dueno[r] = r % 5; fijarTropas(E, r, 8); }
  for (const bot of NUEVOS) { const j = ordenesDe(bot, E, 0); assert.equal(j.invalida, false, bot); assert.ok(j.ordenes.length <= 14, bot); }
  const solo = nuevoEstado(4);
  for (const r of regionesDe(solo, 0)) if (r !== solo.reinos[0].capital) { limpiarRegion(solo, r); solo.dueno[r] = -1; }
  fijarTropas(solo, solo.reinos[0].capital, 1);
  for (const bot of NUEVOS) assert.equal(ordenesDe(bot, solo, 0).invalida, false, bot);
});
