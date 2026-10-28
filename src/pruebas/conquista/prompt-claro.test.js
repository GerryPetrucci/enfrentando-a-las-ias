// El prompt de Guerra de territorios 2.3.0 (docs/guia-de-prompts.md): cada afirmacion poco obvia del texto se prueba contra el MOTOR. Si el motor cambia, el texto
// miente; si el texto cambia, el motor ya no lo respalda. Los casos son los de privado/spec/guerra-prompt-2.3.0.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import conquista from '../../juegos/conquista.js';
import { construirSistema } from '../../prompt.js';
import { crearEstado, pila, totalPila, regionesDe, ponerTropas, sumarUni } from '../../juegos/conquista/estado.js';
import { normalizarRespuesta } from '../../juegos/conquista/ordenes.js';
import { aplicarTurno } from '../../juegos/conquista/turno/index.js';
import { resolverBatalla, fuerzasDeBandos } from '../../juegos/conquista/batalla.js';
import { actualizarHegemon } from '../../juegos/conquista/equilibrio.js';
import { MAX_ORDENES, LARGO_MENSAJE, LARGO_NOTA, LARGO_RAZON, TERRENO, TIERRA_AJENA, MARAVILLA } from '../../juegos/conquista/constantes.js';
import { crearRng } from '../../rng.js';

const SISTEMA = construirSistema(conquista);
const nuevo = (k = 3, seed = 7) => {
  const E = crearEstado(crearRng(seed), { jugadores: k, bioma: 'continente' });
  for (const r of E.reinos) r.stock = { Comida: 50, Madera: 50, Roca: 50, Hierro: 50, Oro: 50, Caballos: 50 };
  return E;
};
const jug = (E, ...resp) => E.reinos.map((r, s) => normalizarRespuesta(resp[s] ?? { ordenes: [] }, E));
const vecinaPropia = (E, s) => { for (const r of regionesDe(E, s)) for (const v of E.mapa.regs[r].vecinos) if (E.dueno[v] === s) return [r, v]; return null; };
const R = (n) => 'R' + String(n + 1).padStart(2, '0');
const mesaDeFrontera = () => {
  for (let seed = 1; seed < 400; seed++) {
    const E = nuevo(3, seed);
    const objetivo = regionesDe(E, 0).find((r) => E.mapa.regs[r].terr === 'll' && E.fort[r] === 0 && E.mapa.regs[r].vecinos.some((v) => E.dueno[v] === 1));
    if (objetivo !== undefined) return { E, objetivo, desde: E.mapa.regs[objetivo].vecinos.find((v) => E.dueno[v] === 1) };
  }
  throw new Error('sin mesa de frontera');
};

// ---------- estructura ----------
test('el prompt completo tiene las secciones de la guia, en orden, y todo en ASCII', () => {
  assert.match(SISTEMA, /^[\x00-\x7F]*$/);
  const orden = ['Tu objetivo es MAXIMIZAR TU PROPIO PUNTAJE', 'Eres el gobernante de un reino', '=== REGLAS DEL JUEGO: Guerra de territorios ===', '1. LO ESENCIAL', '2. COMO SE RESUELVE UN TURNO', '3. RECURSOS Y PRODUCCION',
    '4. UNIDADES, DOMINIO Y HAMBRE', '5. ORDENES', '6. MOVER Y ATACAR', '7. COMBATE', '8. REGIONES', '9. PACTOS, HONOR', '10. EQUILIBRIO Y EVENTOS', '11. MARAVILLA', '12. FIN DE LA PARTIDA',
    '=== COMO LEER TU ESTADO ===', '=== COMO RESPONDER ===', 'Ejemplo del formato', '=== ERRORES FRECUENTES ===', 'No expliques nada fuera del JSON'];
  orden.forEach((s, i) => { assert.ok(SISTEMA.includes(s), `falta «${s}»`); if (i) assert.ok(SISTEMA.indexOf(s) > SISTEMA.indexOf(orden[i - 1]), `«${s}» debe ir despues de «${orden[i - 1]}»`); });
  assert.ok(!SISTEMA.includes('ESPACIO PARA RESPONDER'), 'el aviso de espacio no se uso: no hizo falta (0 cortes de 30 sin el, 28-10-2026)');
});

test('el formato de respuesta es un JSON real con los seis campos, y cada campo esta explicado con sus limites', () => {
  const ejemplo = JSON.parse(conquista.formatoRespuesta);
  assert.deepEqual(Object.keys(ejemplo), ['ordenes', 'pacto_con', 'mensaje', 'privados', 'nota', 'razon']);
  for (const campo of Object.keys(ejemplo)) assert.ok(conquista.explicacionDeRespuesta.includes(`"${campo}"`), `el campo ${campo} no esta explicado`);
  for (const n of [MAX_ORDENES, LARGO_MENSAJE, LARGO_NOTA, LARGO_RAZON]) assert.ok(conquista.explicacionDeRespuesta.includes(String(n)), `falta el limite ${n}`);
  assert.match(conquista.explicacionDeRespuesta, /pierdes el turno entero/);
  assert.match(conquista.explicacionDeRespuesta, /No copies los numeros de region/);
  // El ejemplo lleva cosas inventadas y NUNCA un reino real de la partida ni una orden que dependa de una region concreta en estado "listo para copiar".
  assert.ok(ejemplo.ordenes.length >= 4 && ejemplo.ordenes.every((o) => typeof o === 'string'));
});

test('el ejemplo de formato se entiende con el parser del motor: cada orden del ejemplo es sintaxis valida (otra cosa es que sea legal en una mesa)', () => {
  const E = nuevo();
  const del = JSON.parse(conquista.formatoRespuesta);
  const { ordenes, descartadas } = normalizarRespuesta(del, E);
  assert.deepEqual(descartadas, [], 'ninguna orden del ejemplo es sintaxis invalida');
  assert.equal(ordenes.length, del.ordenes.length);
  assert.equal(normalizarRespuesta(del, E).invalida, false);
});

// ---------- el orden del turno y lo que implica ----------
test('lo reclutado existe al instante y se puede mover ese mismo turno (el prompt lo dice)', () => {
  const E = nuevo(); const [a, b] = vecinaPropia(E, 0);
  const antes = totalPila(E, b, 0);
  aplicarTurno(E, jug(E, { ordenes: [`reclutar ${R(a)} L5`, `mover ${R(a)} ${R(b)} L5`] }));
  assert.equal(totalPila(E, b, 0), antes + 5);
  assert.match(SISTEMA, /Lo que reclutas, fortificas o construyes existe AL INSTANTE/);
  assert.match(SISTEMA, /las tropas nuevas empiezan a comer el turno siguiente/);
});

test('el hambre se paga antes de gastar y una orden sin recursos se descarta sin frenar a las siguientes (el prompt lo dice)', () => {
  const E = nuevo(); const [a] = vecinaPropia(E, 0);
  E.reinos[0].stock = { Comida: 14, Madera: 0, Roca: 0, Hierro: 0, Oro: 0, Caballos: 0 };
  const antes = totalPila(E, a, 0);
  const reg = aplicarTurno(E, jug(E, { ordenes: [`reclutar ${R(a)} L40`, `reclutar ${R(a)} L1`] }));
  assert.equal(totalPila(E, a, 0), antes + 1);
  assert.equal(reg.descartes[0].length, 1);
  assert.match(SISTEMA, /Tus ordenes de gasto se pagan de este ultimo, que ya viene calculado: no tienes que calcular la produccion ni el hambre/);
  assert.match(SISTEMA, /cada una es TODO O NADA: si no alcanzan los recursos o no se cumple una condicion, esa orden se descarta y el juego sigue con la siguiente/);
});

test('solo valen las primeras 14 ordenes (el prompt lo dice con el numero de constantes.js)', () => {
  const E = nuevo(); const [a] = vecinaPropia(E, 0);
  const antes = totalPila(E, a, 0);
  aplicarTurno(E, jug(E, { ordenes: Array.from({ length: MAX_ORDENES + 2 }, () => `reclutar ${R(a)} L1`) }));
  assert.equal(totalPila(E, a, 0), antes + MAX_ORDENES);
  assert.ok(SISTEMA.includes(`Solo se aplican las primeras ${MAX_ORDENES}; las demas se ignoran.`));
});

test('la nota omitida se conserva y la vacia se borra (el prompt lo dice)', () => {
  const E = nuevo();
  aplicarTurno(E, jug(E, { ordenes: [], nota: 'mi plan' }));
  assert.equal(E.reinos[0].nota, 'mi plan');
  aplicarTurno(E, jug(E, { ordenes: [] }));
  assert.equal(E.reinos[0].nota, 'mi plan', 'sin campo se conserva');
  aplicarTurno(E, jug(E, { ordenes: [], nota: '' }));
  assert.equal(E.reinos[0].nota, '', 'vacia se borra');
  assert.match(SISTEMA, /Si no escribes "nota", se conserva la anterior; si la dejas vacia \(""\), se borra/);
});

// ---------- hambre, mover, combate ----------
test('mover todo deja 1 unidad del primer tipo que haya, en el orden L, A, J, I (el prompt lo dice)', () => {
  const E = nuevo(); const [a, b] = vecinaPropia(E, 0);
  sumarUni(E, a, 0, 1, 2);
  aplicarTurno(E, jug(E, { ordenes: [`mover ${R(a)} ${R(b)} todo`] }));
  assert.deepEqual(pila(E, a, 0), [1, 0, 0, 0]);
  assert.match(SISTEMA, /"todo" mueve todas menos 1 \(se queda 1 unidad del primer tipo que tengas, en el orden L, A, J, I\)/);
});

test('sin Comida desertan el 10 % POR REGION, redondeado y con minimo 1, y nunca la ultima unidad (el prompt lo dice igual)', () => {
  const E = nuevo(); const [a] = vecinaPropia(E, 0);
  ponerTropas(E, a, 20, 0);
  E.reinos[0].stock.Comida = 0;
  aplicarTurno(E, jug(E));
  assert.equal(totalPila(E, a, 0), 18);
  assert.match(SISTEMA, /pierdes TODA la que tengas y en cada region donde tengas tropas desertan el 10% \(redondeado, minimo 1; empezando por los Lanceros\); en una region tuya nunca deserta la ultima unidad/);
  assert.ok(!/10% de cada pila/.test(SISTEMA), 'el texto 2.2.0 decia «por pila»: era inexacto');
});

test('empate exacto de fuerzas: el dueno conserva 1 unidad y el atacante desaparece (el prompt lo dice)', () => {
  const { E, objetivo, desde } = mesaDeFrontera();
  ponerTropas(E, objetivo, 17, 0); ponerTropas(E, desde, 21, 1); // 20 Lanceros x 0.85 de tierra ajena = 17 contra 17
  aplicarTurno(E, jug(E, {}, { ordenes: [`mover ${R(desde)} ${R(objetivo)} L20`] }));
  assert.equal(E.dueno[objetivo], 0);
  assert.equal(totalPila(E, objetivo, 0), 1);
  assert.equal(totalPila(E, objetivo, 1), 0);
  assert.match(SISTEMA, /EMPATE exacto de fuerzas: el dueno se queda con 1 unidad y los atacantes desaparecen; si el dueno no peleaba, desaparecen todos y la region queda libre/);
});

test('el ganador conserva piso(n x (1 - fuerza del perdedor / fuerza del ganador)) (el prompt lo dice con la formula)', () => {
  const { E, objetivo, desde } = mesaDeFrontera();
  ponerTropas(E, objetivo, 17, 0); ponerTropas(E, desde, 31, 1); // 30 L x 0.85 = 25.5 contra 17 -> conservan 1 - 17/25.5 = 1/3 = 10
  aplicarTurno(E, jug(E, {}, { ordenes: [`mover ${R(desde)} ${R(objetivo)} L30`] }));
  assert.equal(E.dueno[objetivo], 1);
  assert.equal(totalPila(E, objetivo, 1), 10);
  assert.match(SISTEMA, /piso\(cantidad x \(1 - fuerza del perdedor \/ fuerza del ganador\)\)/);
  assert.match(SISTEMA, /si ganas con razon 2 \(el doble de fuerza\) conservas la mitad de tus unidades/);
});

test('con 3 o mas lados pelean los dos mas fuertes y los demas desaparecen (el prompt lo dice)', () => {
  const bando = (k, n) => ({ miembros: [{ k, pila: [n, 0, 0, 0], mejoras: [0, 0, 0, 0], mod: 1 }], defensor: false, ataca: true });
  const res = resolverBatalla([bando(0, 20), bando(1, 12), bando(2, 5)], { terr: 'll', fort: 0, dueno: -1 });
  assert.equal(res.ganador.k, 0);
  assert.equal(res.supervivientes.length, 1, 'solo el ganador deja unidades');
  assert.equal(res.perdidas, 20 - res.supervivientes[0].pila[0] + 12, 'las perdidas son las del duelo de los dos mas fuertes');
  assert.equal(res.bajas, 37 - res.supervivientes[0].pila[0], 'el tercero desaparece sin pelear');
  assert.match(SISTEMA, /Si coinciden 3 o mas lados, pelean los dos mas fuertes y los demas desaparecen/);
});

test('el ejemplo de combate del prompt coincide con el motor', () => {
  const ataque = { miembros: [{ k: 0, pila: [24, 12, 0, 0], mejoras: [0, 0, 0, 0], mod: TIERRA_AJENA }], defensor: false, ataca: true };
  const defensa = { miembros: [{ k: 1, pila: [6, 4, 0, 0], mejoras: [0, 0, 0, 0], mod: 1 }], defensor: true, ataca: false };
  const [fa, fd] = fuerzasDeBandos([ataque, defensa], { terr: 'bo', fort: 1 });
  const res = resolverBatalla([ataque, defensa], { terr: 'bo', fort: 1, dueno: 1 });
  assert.ok(SISTEMA.includes('atacas con 24 Lanceros y 12 Arqueros una region enemiga de bosque con fortaleza 1 y una guarnicion de 6 Lanceros y 4 Arqueros'));
  assert.ok(SISTEMA.includes(`por tierra ajena x${TIERRA_AJENA} = ${fa.toFixed(1)}`), 'fuerza del atacante');
  assert.ok(SISTEMA.includes(`bosque x${TERRENO.bo} = ${fd.toFixed(1)}`), 'fuerza del defensor');
  assert.ok(SISTEMA.includes(`Razon ${(fa / fd).toFixed(2)}: ganas`));
  assert.ok(SISTEMA.includes(`(${res.supervivientes[0].pila[0]} Lanceros y ${res.supervivientes[0].pila[1]} Arqueros)`), 'supervivientes');
});

// ---------- equilibrio ----------
test('un empate en la punta no le quita el Hegemon a quien ya lo es (el prompt lo dice)', () => {
  const E = nuevo(3);
  const propias = (s) => regionesDe(E, s);
  // Reparte las regiones con dueno a partes iguales entre 0 y 1 y deja 0 como Hegemon.
  const todas = E.dueno.map((d, r) => r).filter((r) => E.dueno[r] >= 0);
  todas.forEach((r, i) => { E.dueno[r] = i % 2; });
  E.hegemon = 0;
  assert.ok(Math.abs(propias(0).length - propias(1).length) <= 1);
  if (propias(0).length === propias(1).length) assert.equal(actualizarHegemon(E), 0, 'el empate lo conserva');
  assert.match(SISTEMA, /un empate en la punta no se lo quita/);
});

// ---------- cosas que el prompt NO debe tener ----------
test('el prompt no da consejos de estrategia ni nombra bots', () => {
  // «un juego de estrategia por turnos» es el genero; lo que no entra son consejos de como jugar.
  assert.doesNotMatch(SISTEMA, /te conviene|lo mejor es|siempre debes|nunca debes|recomend|mejor estrategia|estrategia (optima|ganadora)|sugerimos|deberias/i);
  assert.doesNotMatch(SISTEMA, /lancero-masa|mixto-adaptativo|arquero-defensivo|jinete-relampago|economico|pacifico|agresivo/);
});

test('la Maravilla del prompt coincide con constantes.js', () => {
  assert.ok(SISTEMA.includes(`Cuesta 25 de CADA uno de los seis recursos`) && MARAVILLA.costo.Comida === 25);
  assert.ok(SISTEMA.includes(`${MARAVILLA.obra} turnos de obra y luego ${MARAVILLA.enPie} de pie`));
  assert.ok(SISTEMA.includes(`ganas al cerrar el turno t+${MARAVILLA.turnos}`));
  assert.ok(SISTEMA.includes(`al menos ${MARAVILLA.cerco} unidades en una region vecina`));
});
