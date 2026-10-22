// Guerra 2.0.0, etapa 7: las lineas CAPACIDAD y FRENTES de la vista. Se calculan con las mismas funciones de fuerza que el motor y SOLO con datos publicos (las mejoras ajenas no se ven).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevoEstado, contexto, R, frontera, fijarTropas } from './ayudas.js';
import { sumarUni, limpiarRegion } from '../../juegos/conquista/estado.js';
import { calcularFrentes, lineasDeFrentes, lineasDeCapacidad } from '../../juegos/conquista/frentes.js';
import { ordenesEconomicas } from '../../juegos/conquista/turno/economia.js';
import { rupturas } from '../../juegos/conquista/turno/diplomacia.js';
import { movimientos } from '../../juegos/conquista/turno/movimiento.js';
import { vistaTexto } from '../../juegos/conquista/vista.js';
import { HEGEMON } from '../../juegos/conquista/constantes.js';

const turno = (E, porReino) => { const ctx = contexto(E, porReino); ordenesEconomicas(ctx); rupturas(ctx); movimientos(ctx); return ctx; };
const f1 = (x) => x.toFixed(1);
const pacto = (E, a, b, hasta = 30) => { E.reinos[a].pactos[b] = E.reinos[b].pactos[a] = hasta; };
// El reino 0 tiene `tropasA` Lanceros en `a`; la region vecina `d` es del reino 1 con `tropasD` Lanceros (llanura, sin fortaleza ni edificio).
function escenario({ tropasA = 14, tropasD = 8 } = {}) {
  const E = nuevoEstado(4), [a, d] = frontera(E, 0, -1);
  E.dueno[d] = 1; E.fort[d] = 0; E.edif[d] = null; E.mapa.regs[d].terr = 'll';
  fijarTropas(E, d, tropasD); fijarTropas(E, a, tropasA);
  return { E, a, d };
}
// Deja solo las regiones del reino 0 y 1 en el mapa, para que no haya otros frentes.
function soloDos(E, mantener = []) {
  for (let r = 0; r < E.dueno.length; r++) if (E.dueno[r] >= 0 && ![0, 1].includes(E.dueno[r]) && !mantener.includes(r)) { limpiarRegion(E, r); E.dueno[r] = -1; E.fort[r] = 0; E.edif[r] = null; }
}

// ---- FRENTES de ataque ----

test('un frente de ataque dice con que atacas (todo lo que puedes mover desde tus regiones vecinas) y contra que defensa, y coincide con la batalla real', () => {
  const { E, a, d } = escenario({ tropasA: 14, tropasD: 8 });
  soloDos(E);
  const ataque = calcularFrentes(E, 0).ataques.find((x) => x.d === d);
  assert.ok(ataque, 'hay un frente contra la region del reino 1');
  assert.deepEqual(ataque.desde, [a]);
  assert.equal(+ataque.f.toFixed(4), 11.05, '13 Lanceros que pueden salir x 0.85 de tierra ajena');
  assert.equal(+ataque.def.toFixed(4), 8);
  const real = turno(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} todo`] } }); // lo mismo que dice el frente: salir con todo menos 1
  assert.deepEqual(real.combates[0].bandos.map((b) => +b.f.toFixed(4)), [ataque.f, ataque.def].map((x) => +x.toFixed(4)));
});

test('la linea de un frente tiene el formato «R18 Reino desde R12 R14: ataque 22.5 vs defensa 14.0 (x1.61)» y suma las regiones vecinas que pueden atacar', () => {
  const { E, a, d } = escenario({ tropasA: 14, tropasD: 8 });
  const b = E.mapa.regs[d].vecinos.find((v) => v !== a && !E.reinos.some((r) => r.capital === v));
  E.dueno[b] = 0; fijarTropas(E, b, 10); E.fort[b] = 0;
  soloDos(E, [a, b]);
  const linea = lineasDeFrentes(E, 0).find((l) => l.startsWith(`${R(d)} Ambar`));
  assert.ok(linea, lineasDeFrentes(E, 0).join('\n'));
  assert.equal(linea, `${R(d)} Ambar desde ${R(Math.min(a, b))} ${R(Math.max(a, b))}: ataque ${f1((13 + 9) * 0.85)} vs defensa 8.0 (x${((13 + 9) * 0.85 / 8).toFixed(2)})`);
});

test('el dominio, el terreno y la fortaleza cuentan en los frentes igual que en el combate', () => {
  const { E, a, d } = escenario({ tropasA: 1, tropasD: 12 });
  sumarUni(E, a, 0, 1, 11); // 1 Lancero y 11 Arqueros: pueden salir los 11 Arqueros y 0 Lanceros (queda el Lancero)
  E.fort[d] = 1; E.mapa.regs[d].terr = 'bo'; // defensa de 12 Lanceros x 1.5 x 1.25
  soloDos(E);
  const ataque = calcularFrentes(E, 0).ataques.find((x) => x.d === d);
  assert.equal(+ataque.f.toFixed(4), +(11 * 2 * 2 * 0.85).toFixed(4), '11 Arqueros x fuerza 2 x dominio 2 (el rival son Lanceros) x tierra ajena');
  assert.equal(+ataque.def.toFixed(4), +(12 * 1.5 * 1.25).toFixed(4), 'los Lanceros no dominan a los Arqueros: defensa 12 x fortaleza x bosque');
  const real = turno(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} A11`] } });
  assert.deepEqual(real.combates[0].bandos.map((b) => +b.f.toFixed(4)), [ataque.f, ataque.def].map((x) => +x.toFixed(4)));
});

test('los frentes usan el bono del Hegemon como el combate', () => {
  const { E, a, d } = escenario({ tropasA: 14, tropasD: 8 });
  soloDos(E);
  E.hegemon = 1;
  const ataque = calcularFrentes(E, 0).ataques[0];
  assert.equal(+ataque.f.toFixed(4), +(13 * 0.85 * HEGEMON.bonoAtaque).toFixed(4));
  const real = turno(E, { 0: { ordenes: [`mover ${R(a)} ${R(d)} todo`] } });
  assert.deepEqual(real.combates[0].bandos.map((b) => +b.f.toFixed(4)), [ataque.f, ataque.def].map((x) => +x.toFixed(4)));
});

test('los frentes no usan nada secreto: las mejoras de los rivales no se ven, las propias si', () => {
  const { E } = escenario({ tropasA: 14, tropasD: 8 });
  soloDos(E);
  const sin = calcularFrentes(E, 0).ataques[0];
  E.reinos[1].mejoras[0] = 2; // el rival mejoro sus Lanceros: no se ve
  const con = calcularFrentes(E, 0).ataques[0];
  assert.equal(con.def, sin.def, 'la defensa visible no cambia con las mejoras ajenas');
  E.reinos[0].mejoras[0] = 2; // las propias si cuentan
  assert.ok(calcularFrentes(E, 0).ataques[0].f > con.f);
});

test('un aliado con pacto no es un frente; y sus tropas de visita defienden con el dueno si no son aliadas tuyas', () => {
  const { E, d } = escenario({ tropasA: 14, tropasD: 8 });
  soloDos(E);
  pacto(E, 0, 1);
  assert.equal(calcularFrentes(E, 0).ataques.length, 0, 'con pacto vigente no hay frente');
  E.reinos[0].pactos[1] = E.reinos[1].pactos[0] = 0;
  sumarUni(E, d, 2, 0, 6); // un invitado del reino 2, aliado del dueno (1) y no tuyo: defiende con el
  pacto(E, 1, 2);
  assert.equal(+calcularFrentes(E, 0).ataques[0].def.toFixed(4), 14);
  pacto(E, 0, 2); // si tambien es aliado tuyo, es neutral
  assert.equal(+calcularFrentes(E, 0).ataques[0].def.toFixed(4), 8);
});

test('una region libre no es un frente (no tiene defensa); un reino sin tropas de sobra no ataca desde esa region', () => {
  const { E } = escenario({ tropasA: 1, tropasD: 8 });
  soloDos(E);
  assert.deepEqual(calcularFrentes(E, 0).ataques, [], 'con 1 sola unidad no hay nada que mover');
});

test('las tropas de visita hostiles tienen su frente «en sitio» con todo lo que tienen ahi', () => {
  const { E, d } = escenario({ tropasA: 14, tropasD: 6 });
  soloDos(E);
  sumarUni(E, d, 0, 0, 10); // 10 Lanceros del reino 0 en la region del reino 1, sin pacto
  const enSitio = calcularFrentes(E, 0).ataques.find((x) => x.enSitio);
  assert.ok(enSitio);
  assert.equal(enSitio.d, d);
  assert.equal(+enSitio.f.toFixed(4), 8.5);
  assert.equal(+enSitio.def.toFixed(4), 6);
  assert.ok(lineasDeFrentes(E, 0).some((l) => l === `${R(d)} Ambar en sitio: ataque 8.5 vs defensa 6.0 (x1.42)`), lineasDeFrentes(E, 0).join('\n'));
});

// ---- FRENTES de amenaza ----

test('una region tuya vecina de un reino enemigo con tropas de sobra aparece como amenazada, con su ataque contra tu defensa', () => {
  const { E, a, d } = escenario({ tropasA: 5, tropasD: 15 });
  soloDos(E);
  const amenaza = calcularFrentes(E, 0).amenazas.find((x) => x.a === a);
  assert.ok(amenaza);
  assert.equal(amenaza.atacante, 1);
  assert.deepEqual(amenaza.desde, [d]);
  assert.equal(+amenaza.f.toFixed(4), +(14 * 0.85).toFixed(4));
  assert.equal(+amenaza.def.toFixed(4), 5);
  assert.ok(lineasDeFrentes(E, 0).some((l) => l === `${R(a)} amenazada por Ambar desde ${R(d)}: ataque ${f1(14 * 0.85)} vs tu defensa 5.0 (x${(14 * 0.85 / 5).toFixed(2)})`), lineasDeFrentes(E, 0).join('\n'));
});

// ---- Limites y orden ----

test('hay a lo sumo 5 frentes de ataque y 3 de amenaza, de mayor a menor razon, y el titulo sale en la vista cuando hay alguno', () => {
  const E = nuevoEstado(5);
  for (let r = 0; r < E.dueno.length; r++) { E.dueno[r] = r % 5; fijarTropas(E, r, 4 + (r % 7)); E.fort[r] = 0; E.edif[r] = null; } // todos pegados a todos
  const lineas = lineasDeFrentes(E, 0), amenazas = lineas.filter((l) => l.includes('amenazada')), ataques = lineas.filter((l) => !l.includes('amenazada'));
  assert.ok(ataques.length >= 1 && ataques.length <= 5, `${ataques.length} ataques`);
  assert.ok(amenazas.length >= 1 && amenazas.length <= 3, `${amenazas.length} amenazas`);
  const razon = (l) => +/\(x([\d.]+)\)$/.exec(l)[1];
  for (const grupo of [ataques, amenazas]) assert.deepEqual(grupo.map(razon), grupo.map(razon).sort((x, y) => y - x), 'de mayor a menor');
  assert.ok(vistaTexto(E, 0).includes('FRENTES (tu ataque con lo que puedes mover contra la defensa visible, sin mejoras ajenas):'));
});

test('sin frentes la vista no trae el titulo', () => {
  const E = nuevoEstado(4);
  assert.equal(lineasDeFrentes(E, 0).length, 0, 'al empezar nadie toca a nadie');
  assert.ok(!vistaTexto(E, 0).includes('FRENTES'));
});

// ---- CAPACIDAD ----

test('CAPACIDAD: cuantas unidades de cada tipo alcanzan con tu almacen, sin cuartel; los tipos que no alcanzan no salen', () => {
  const E = nuevoEstado(4);
  E.reinos[0].stock = { Comida: 10, Madera: 4, Roca: 1, Hierro: 2, Oro: 0, Caballos: 3 };
  assert.deepEqual(lineasDeCapacidad(E, 0), ['Puedes reclutar hasta (sin cuartel): L 10, A 4, J 3.']);
  E.reinos[0].stock = { Comida: 10, Madera: 0, Roca: 0, Hierro: 0, Oro: 0, Caballos: 0 };
  assert.deepEqual(lineasDeCapacidad(E, 0), ['Puedes reclutar hasta (sin cuartel): L 10.']);
  E.reinos[0].stock = { Comida: 0, Madera: 9, Roca: 9, Hierro: 9, Oro: 9, Caballos: 9 };
  assert.deepEqual(lineasDeCapacidad(E, 0), [], 'sin Comida no se recluta nada');
});

test('CAPACIDAD con un cuartel (no aislado): una linea mas con el alcance a mitad de costo (tres cuartos si esta danado, redondeo hacia arriba) y los Ingenios', () => {
  const E = nuevoEstado(4), c = E.reinos[0].capital;
  E.edif[c] = 'cuartel'; E.dan[c] = 0;
  E.reinos[0].stock = { Comida: 10, Madera: 4, Roca: 3, Hierro: 2, Oro: 0, Caballos: 3 };
  assert.deepEqual(lineasDeCapacidad(E, 0), [
    'Puedes reclutar hasta (sin cuartel): L 10, A 4, J 3.',
    'En tu cuartel (cuesta la mitad): L 20, A 8, J 6, I 4.', // Ingenio: min(20, 8, 6, 4 por el Hierro)
  ]);
  E.dan[c] = 1; // ceil(0.75 n) <= almacen: Comida 13, Madera 5, Caballos 4, Ingenio min(13, 5, 4, 2) = 2
  assert.equal(lineasDeCapacidad(E, 0)[1], 'En tu cuartel (cuesta tres cuartos): L 13, A 5, J 4, I 2.');
  const F = nuevoEstado(4);
  assert.equal(lineasDeCapacidad(F, 0).length, 1, 'sin cuartel una sola linea');
});

test('la linea de CAPACIDAD sale en la vista del propio reino', () => {
  const E = nuevoEstado(4);
  assert.ok(vistaTexto(E, 0).includes('Puedes reclutar hasta (sin cuartel): L 6, A 4.'), 'almacen inicial: 6 Comida, 4 Madera, sin Caballos');
});
