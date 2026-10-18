// El narrador de la Guerra de territorios (web/casino/narracion-conquista.js): resume lo rutinario y cuenta el contexto, deja literal lo que es historia. Puro: sin DOM, sin red, sin API.
// Aqui se prueba con datos sinteticos que cada frase diga lo que los datos dicen; que las frases de verdad salgan de los registros de las partidas lo prueba lineaconq.test.js.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AJUSTES, enPalabras, listaDeNombres, crearNarrador } from '../../../web/casino/narracion-conquista.js';

const NOMBRES = ['Ana', 'Beto', 'Cira', 'Dani', 'Eli'];
const nombre = (k) => NOMBRES[k];
const nuevo = (reinos = 4) => crearNarrador({ nombre, reinos });
const ataque = (k, a, libre = true, contra = -1, n = 3) => ({ k, n, de: 0, a, libre, contra: libre ? -1 : contra });
const literalDeAtaque = (turno, k, a) => ({ tipo: 'ataque', texto: `${nombre(k)} manda 3 tropas de R01 a R${a}.`, clave: `ord:${turno}:${k}:0:${a}` });
const ordenes = (n, turno, ataques, extra = {}) => n.ordenes({ turno, ataques, literales: ataques.map((a, i) => literalDeAtaque(turno, a.k, a.a)).slice(0, 2), mensajes: [], vivos: 4, ...extra });
const textos = (r) => r.dicho.map((l) => l.texto);
const sinCodigos = (r) => { for (const l of r.dicho.filter((x) => x.tipo === 'comentario')) assert.doesNotMatch(l.texto, /\bR\d+\b/, `una frase de contexto no lleva codigos de region: ${l.texto}`); };

test('los numeros pequenos se dicen en palabras (una region, un turno) y los grandes en cifras; las listas de nombres suenan a lista', () => {
  assert.deepEqual([0, 1, 2, 7, 10].map((n) => enPalabras(n)), ['cero', 'una', 'dos', 'siete', 'diez']);
  assert.equal(enPalabras(1, 'm'), 'un');
  assert.equal(enPalabras(11), '11');
  assert.equal(enPalabras(2.5), '2.5');
  assert.equal(enPalabras('x'), 'x');
  assert.equal(listaDeNombres([]), '');
  assert.equal(listaDeNombres(['Ana']), 'Ana');
  assert.equal(listaDeNombres(['Ana', 'Beto']), 'Ana y Beto');
  assert.equal(listaDeNombres(['Ana', 'Beto', 'Cira']), 'Ana, Beto y Cira');
});

test('los ajustes editoriales estan a la vista y con valores sensatos', () => {
  assert.deepEqual(AJUSTES, { PANORAMA_CADA: 5, MAX_CITA: 120, PARES_LITERALES: 2, NOMBRAR_HASTA: 3 });
});

test('ordenes: la primera vez que unos reinos salen a regiones sin dueno se dice en una frase, sin codigos de region ni tropas, y esa frase cubre los hechos que reemplaza', () => {
  const n = nuevo();
  const r = ordenes(n, 1, [ataque(0, '07'), ataque(1, '02'), ataque(2, '12')]);
  assert.deepEqual(textos(r), ['Ana, Beto y Cira salen a expandirse: mandan tropas a regiones sin dueño.']);
  assert.equal(r.dicho[0].tipo, 'comentario');
  assert.deepEqual(r.dicho[0].cubre, ['ord:1:0:0:07', 'ord:1:1:0:02'], 'cubre las lineas de ataque que dejan de decirse');
  assert.deepEqual(r.mudas, []);
  sinCodigos(r);
});

test('ordenes: con todos los reinos vivos se dice «todos», con mas de tres «N reinos», con uno solo «sale a expandirse»', () => {
  assert.equal(textos(ordenes(nuevo(), 1, [ataque(0, '1'), ataque(1, '2'), ataque(2, '3'), ataque(3, '4')], { vivos: 4 }))[0], 'Todos los reinos salen a expandirse: mandan tropas a regiones sin dueño.');
  assert.equal(textos(ordenes(nuevo(5), 1, [ataque(0, '1'), ataque(1, '2'), ataque(2, '3'), ataque(3, '4')], { vivos: 5 }))[0], 'Cuatro reinos salen a expandirse: mandan tropas a regiones sin dueño.');
  assert.equal(textos(ordenes(nuevo(), 1, [ataque(0, '1'), ataque(0, '2')]))[0], 'Ana sale a expandirse: manda tropas a regiones sin dueño.');
  assert.equal(textos(ordenes(nuevo(2), 1, [ataque(0, '1'), ataque(1, '2')], { vivos: 2 }))[0], 'Los dos reinos salen a expandirse: mandan tropas a regiones sin dueño.');
});

test('ordenes: la racha de expansion se dice una vez; los turnos siguientes callan (y sus hechos quedan como mudos), y tras una pausa una racha nueva se dice completa otra vez', () => {
  const n = nuevo();
  assert.equal(textos(ordenes(n, 1, [ataque(0, '1'), ataque(1, '2'), ataque(2, '3')])).length, 1);
  const segundo = ordenes(n, 2, [ataque(0, '4'), ataque(1, '5')]);
  assert.deepEqual(textos(segundo), [], 'la racha sigue: no se repite');
  assert.deepEqual(segundo.mudas, ['ord:2:0:0:4', 'ord:2:1:0:5'], 'lo que no se dice queda anotado: nada se pierde sin que nadie lo sepa');
  assert.deepEqual(textos(ordenes(n, 3, [])), [], 'un turno sin ataques no dice nada');
  assert.deepEqual(textos(ordenes(n, 4, [ataque(0, '6'), ataque(1, '7'), ataque(2, '8')])), ['Ana, Beto y Cira salen a expandirse: mandan tropas a regiones sin dueño.'], 'una racha nueva se dice completa: una parte o un clip que empieza ahi no sabe de la anterior');
  assert.deepEqual(textos(ordenes(n, 5, [])), []);
  assert.deepEqual(textos(ordenes(n, 6, [ataque(0, '9')])), ['Ana sale a expandirse: manda tropas a regiones sin dueño.']);
});

test('ordenes: un ataque contra otro reino se nombra por parejas (hasta 2) y con mas se cuenta; el detalle lo dan las tarjetas de batalla', () => {
  assert.deepEqual(textos(ordenes(nuevo(), 1, [ataque(0, '1', false, 1)])), ['Ana lanza un ataque contra Beto.']);
  assert.deepEqual(textos(ordenes(nuevo(), 1, [ataque(0, '1', false, 1), ataque(0, '2', false, 1)])), ['Ana lanza dos ataques contra Beto.']);
  assert.deepEqual(textos(ordenes(nuevo(), 1, [ataque(0, '1', false, 1), ataque(2, '2', false, 3)])), ['Ana lanza un ataque contra Beto. Cira lanza un ataque contra Dani.']);
  const tres = ordenes(nuevo(), 1, [ataque(0, '1', false, 1), ataque(2, '2', false, 3), ataque(1, '3', false, 0)]);
  assert.deepEqual(textos(tres), ['Hay tres ataques contra otros reinos.']);
  sinCodigos(tres);
});

test('ordenes: si no se sabe cuantos reinos siguen en pie no se dice «todos» (podria incluir a uno caido): se nombra o se cuenta', () => {
  const sin = { turno: 1, ataques: [ataque(0, '1'), ataque(1, '2'), ataque(2, '3'), ataque(3, '4')], literales: [], mensajes: [] };
  assert.equal(nuevo(4).ordenes(sin).dicho[0].texto, 'Cuatro reinos salen a expandirse: mandan tropas a regiones sin dueño.');
  assert.equal(nuevo(4).ordenes({ ...sin, vivos: 4 }).dicho[0].texto, 'Todos los reinos salen a expandirse: mandan tropas a regiones sin dueño.');
  assert.equal(nuevo(4).ordenes({ ...sin, ataques: sin.ataques.slice(0, 2), vivos: 'x' }).dicho[0].texto, 'Ana y Beto salen a expandirse: mandan tropas a regiones sin dueño.');
});

test('ordenes: expansion y ofensiva en el mismo turno se dicen juntas (primero la expansion); la ofensiva se dice cada turno, la expansion solo al empezar la racha', () => {
  const n = nuevo();
  const t1 = ordenes(n, 1, [ataque(0, '1'), ataque(1, '2'), ataque(2, '3', false, 3)]);
  assert.deepEqual(textos(t1), ['Ana y Beto salen a expandirse: mandan tropas a regiones sin dueño. Cira lanza un ataque contra Dani.']);
  assert.equal(t1.dicho.length, 1, 'una sola linea de contexto');
  const t2 = ordenes(n, 2, [ataque(0, '4'), ataque(2, '5', false, 3)]);
  assert.deepEqual(textos(t2), ['Cira lanza un ataque contra Dani.']);
});

test('citas: un mensaje publico por turno, tal cual, del reino menos citado; no repite uno ya citado, ni cita uno de mas de 120 caracteres o vacio', () => {
  const n = nuevo();
  const mensajes = [{ k: 0, texto: 'Voy por todo.' }, { k: 1, texto: 'Busco la paz.' }, { k: 2, texto: 'hola' }];
  const t1 = ordenes(n, 1, [], { mensajes });
  assert.deepEqual(textos(t1), ['Ana dice: «Voy por todo.»']);
  assert.deepEqual(t1.dicho[0], { tipo: 'hecho', texto: 'Ana dice: «Voy por todo.»', clave: 'msg:1:0:0' });
  assert.deepEqual(t1.extras, [{ texto: 'Ana dice: «Voy por todo.»', clave: 'msg:1:0:0' }], 'es un hecho nuevo: el beat lo suma a sus lineas');
  assert.deepEqual(textos(ordenes(n, 2, [], { mensajes })), ['Beto dice: «Busco la paz.»'], 'el menos citado');
  assert.deepEqual(textos(ordenes(n, 3, [], { mensajes })), ['Cira dice: «hola»']);
  assert.deepEqual(textos(ordenes(n, 4, [], { mensajes })), [], 'todos ya citados');
  const largo = 'x'.repeat(AJUSTES.MAX_CITA + 1), justo = 'y'.repeat(AJUSTES.MAX_CITA);
  const m = nuevo();
  assert.deepEqual(textos(ordenes(m, 1, [], { mensajes: [{ k: 0, texto: largo }, { k: 1, texto: '   ' }, { k: 2, texto: justo }] })), [`Cira dice: «${justo}»`], 'ni el largo ni el vacio');
});

test('citas: se elige por reparto parejo y no por el orden de la lista (si no, siempre hablaria el primer reino), y los mensajes raros se ignoran', () => {
  const n = nuevo();
  const cita = (turno, mensajes) => textos(ordenes(n, turno, [], { mensajes }))[0];
  assert.equal(cita(1, [{ k: 0, texto: 'a1' }, { k: 1, texto: 'b1' }]), 'Ana dice: «a1»');
  assert.equal(cita(2, [{ k: 0, texto: 'a2' }, { k: 1, texto: 'b2' }]), 'Beto dice: «b2»', 'Ana ya hablo: le toca a Beto aunque Ana vaya primera');
  assert.equal(cita(3, [{ k: 1, texto: 'b3' }, { k: 0, texto: 'a3' }]), 'Ana dice: «a3»', 'empatan en citas: el de menor asiento, no el primero de la lista');
  assert.equal(cita(4, [null, { k: 'x', texto: 'raro' }, { k: 2, texto: 42 }, { k: 2 }, undefined]), undefined);
  assert.doesNotThrow(() => ordenes(nuevo(), 1, [], { mensajes: 'no es una lista' }));
});

test('ordenes: los privados y los avisos de respuesta ilegible se dicen tal cual, con su clave, despues del contexto y de la cita', () => {
  const n = nuevo();
  const literales = [literalDeAtaque(1, 0, '1'), { tipo: 'privado', texto: 'Cira le escribe en privado a Dani.', clave: 'priv:1:2:3:0' }, { tipo: 'ilegible', texto: 'Eli no respondió bien: pasa el turno.', clave: 'ilegible:1:4' }];
  const r = n.ordenes({ turno: 1, ataques: [ataque(0, '1')], literales, mensajes: [{ k: 1, texto: 'hola' }], vivos: 4 });
  assert.deepEqual(textos(r), ['Ana sale a expandirse: manda tropas a regiones sin dueño.', 'Beto dice: «hola»', 'Cira le escribe en privado a Dani.', 'Eli no respondió bien: pasa el turno.']);
  assert.deepEqual(r.dicho.slice(2), [{ tipo: 'hecho', texto: 'Cira le escribe en privado a Dani.', clave: 'priv:1:2:3:0' }, { tipo: 'hecho', texto: 'Eli no respondió bien: pasa el turno.', clave: 'ilegible:1:4' }]);
});

const toma = (turno, k, r) => ({ tipo: 'toma', k, clave: `toma:${turno}:${r}`, texto: `${nombre(k)} toma R${r}.` });
const resolucion = (n, turno, hechos, extra = {}) => n.resolucion({ turno, hechos, combates: 0, despues: null, ultimo: false, ...extra });

test('resolucion: las tomas de regiones sin dueno se cuentan por reino, sin codigos, y la frase cubre los hechos de cada toma', () => {
  const uno = resolucion(nuevo(), 3, [toma(3, 0, '18')]);
  assert.equal(textos(uno)[0].startsWith('Ana toma una región sin dueño.'), true, textos(uno)[0]);
  assert.deepEqual(uno.dicho[0].cubre, ['toma:3:18']);
  assert.equal(textos(resolucion(nuevo(), 3, [toma(3, 0, '18'), toma(3, 0, '19'), toma(3, 0, '20')]))[0].startsWith('Ana toma tres regiones sin dueño.'), true);
  const desiguales = resolucion(nuevo(), 1, [toma(1, 0, '07'), toma(1, 1, '02'), toma(1, 1, '12'), toma(1, 1, '15'), toma(1, 2, '27'), toma(1, 2, '30'), toma(1, 2, '39')]);
  assert.equal(textos(desiguales)[0].startsWith('Se reparten siete regiones sin dueño: Beto se queda con tres, Cira con tres y Ana con una.'), true, textos(desiguales)[0]);
  assert.equal(desiguales.dicho[0].cubre.length, 7);
  const iguales = resolucion(nuevo(), 2, [toma(2, 0, '1'), toma(2, 1, '2'), toma(2, 2, '3')]);
  assert.equal(textos(iguales)[0].startsWith('Ana, Beto y Cira toman una región sin dueño cada uno.'), true, textos(iguales)[0]);
  for (const r of [uno, desiguales, iguales]) sinCodigos(r);
});

test('resolucion: «todavia no hay una sola batalla» se dice una vez y solo si es verdad (ningun combate hasta ahora)', () => {
  const n = nuevo();
  const t1 = resolucion(n, 1, [toma(1, 0, '1')]);
  assert.match(textos(t1)[0], /Todavía no hay una sola batalla\.$/);
  assert.doesNotMatch(textos(resolucion(n, 2, [toma(2, 0, '2')]))[0], /batalla/, 'solo una vez');
  const conBatalla = nuevo();
  resolucion(conBatalla, 1, [], { combates: 2 });
  assert.doesNotMatch(textos(resolucion(conBatalla, 2, [toma(2, 0, '2')]))[0], /batalla/, 'ya hubo batallas: seria falso');
  assert.doesNotMatch(textos(resolucion(nuevo(), 1, [toma(1, 0, '1')], { combates: 1 }))[0], /batalla/, 'con un combate este mismo turno tampoco');
});

test('resolucion: el hambre se cuenta en tres escalones por reino y se reinicia si hay un turno sin hambre', () => {
  const n = nuevo();
  const hambre = (turno, k, c) => ({ tipo: 'hambre', k, n: c, clave: `ev:hambre:${turno}:${k}::`, texto: `${nombre(k)} pasa hambre: -${c} tropas.` });
  const dice = (turno, ...hs) => textos(resolucion(n, turno, hs));
  assert.deepEqual(dice(3, hambre(3, 0, 3)), ['Ana pasa hambre y pierde tres tropas.']);
  assert.deepEqual(dice(4, hambre(4, 0, 3)), ['Ana pasa hambre por segundo turno seguido y pierde tres tropas.']);
  assert.deepEqual(dice(5, hambre(5, 0, 1)), ['Ana lleva tres turnos con hambre y ya perdió siete tropas.']);
  const cuarto = resolucion(n, 6, [hambre(6, 0, 1)]);
  assert.deepEqual(textos(cuarto), [], 'a partir del cuarto turno seguido no se repite cada turno: el hambre sigue a la vista en el feed');
  assert.deepEqual(cuarto.mudas, ['ev:hambre:6:0::'], 'pero queda anotada como muda: nada se pierde sin que nadie lo sepa');
  assert.deepEqual(dice(7, hambre(7, 0, 1)), ['Ana lleva cinco turnos con hambre y ya perdió nueve tropas.'], 'el quinto turno seguido se vuelve a decir (cada cinco)');
  assert.deepEqual(dice(8, hambre(8, 0, 1)), [], 'sexto turno seguido: callado');
  assert.deepEqual(dice(9), [], 'un turno sin hambre');
  assert.deepEqual(dice(10, hambre(10, 0, 2)), ['Ana pasa hambre y pierde dos tropas.'], 'la racha se reinicio');
  assert.deepEqual(dice(11, hambre(11, 0, 1), hambre(11, 1, 1)), ['Ana pasa hambre por segundo turno seguido y pierde una tropa.', 'Beto pasa hambre y pierde una tropa.'], 'cada reino lleva su cuenta');
  const r = resolucion(nuevo(), 3, [hambre(3, 0, 3)]);
  assert.equal(r.dicho[0].tipo, 'hecho', 'el hambre sigue siendo un hecho (con su clave), solo que dicho de otra forma');
  assert.equal(r.dicho[0].clave, 'ev:hambre:3:0::');
});

test('resolucion: dos o mas comercios en un turno se cuentan; uno solo se dice tal cual', () => {
  const comercio = (k, con) => ({ tipo: 'comercio', k, clave: `ev:comercio:1:${k}:${con}:`, texto: `${nombre(k)} y ${nombre(con)} comercian.` });
  const uno = resolucion(nuevo(), 1, [comercio(0, 1)]);
  assert.deepEqual(textos(uno), ['Ana y Beto comercian.']);
  const dos = resolucion(nuevo(), 1, [comercio(0, 1), comercio(2, 3)]);
  assert.deepEqual(textos(dos), ['Hay dos intercambios comerciales entre los reinos.']);
  assert.deepEqual(dos.dicho[0].cubre, ['ev:comercio:1:0:1:', 'ev:comercio:1:2:3:']);
});

test('resolucion: todo lo que es historia (pactos, rupturas, caidas, conquistas, Maravilla) se dice tal cual, en su orden y con su clave', () => {
  const hechos = [
    { tipo: 'pacto', k: 0, clave: 'ev:pacto:2:0:1:', texto: 'Ana y Beto firman un pacto.' },
    { tipo: 'conquista', k: 2, clave: 'ev:conquista:2:2:3:09', texto: 'Cira conquista R09 de Dani.' },
    { tipo: 'caida', k: 3, clave: 'ev:caida:2:3:2:', texto: 'Dani cae: su capital fue tomada por Cira.' },
    { tipo: 'maravilla', k: 0, clave: 'ev:maravilla:2:0::04', texto: 'Ana construye la Maravilla en R04.' },
  ];
  const r = resolucion(nuevo(), 2, hechos);
  assert.deepEqual(r.dicho, hechos.map((h) => ({ tipo: 'hecho', texto: h.texto, clave: h.clave })));
  assert.deepEqual(r.mudas, []);
});

test('resolucion: cada 5 turnos hay un panorama (quien va primero y quien cierra) con las regiones del marcador, al final del beat y sin cubrir ningun hecho', () => {
  const dueno = (...cuentas) => cuentas.flatMap((c, k) => Array(c).fill(k));
  const estado = (...cuentas) => ({ dueno: dueno(...cuentas), vivo: cuentas.map(() => true) });
  const n = nuevo();
  const r = resolucion(n, 5, [toma(5, 0, '1')], { despues: estado(3, 9, 5, 2) });
  assert.equal(textos(r).at(-1), 'Turno 5: Beto va primero con nueve regiones y Dani cierra con dos.');
  assert.equal(r.dicho.at(-1).tipo, 'comentario');
  assert.equal(r.dicho.at(-1).cubre, undefined);
  assert.deepEqual(textos(resolucion(nuevo(), 4, [], { despues: estado(3, 9, 5, 2) })), [], 'solo cada 5 turnos');
  assert.equal(textos(resolucion(nuevo(), 10, [], { despues: estado(4, 4, 2, 1) }))[0], 'Turno 10: Ana y Beto empatan arriba con cuatro regiones.');
  assert.equal(textos(resolucion(nuevo(), 15, [], { despues: estado(5, 2, 2, 2) }))[0], 'Turno 15: Ana va primero con cinco regiones.', 'si el ultimo lugar esta empatado no se nombra a uno solo');
  assert.equal(textos(resolucion(nuevo(), 5, [], { despues: estado(3, 3, 3, 3) }))[0], 'Turno 5: los cuatro reinos empatan con tres regiones.');
  assert.deepEqual(textos(resolucion(nuevo(), 5, [], { despues: estado(3, 9, 5, 2), ultimo: true })), [], 'en el ultimo turno de una partida terminada no hay panorama (viene el final)');
  assert.deepEqual(textos(resolucion(nuevo(), 5, [], { despues: null })), [], 'sin estado legible no se inventa nada');
});

test('resolucion: si el mapa no cambia, el panorama lo dice una sola vez («lleva N turnos sin cambios», sin depender de un turno que quien ve solo esta parte no vio) y calla hasta que algo cambie; entonces cuenta el panorama otra vez', () => {
  const estado = (...cuentas) => ({ dueno: cuentas.flatMap((c, k) => Array(c).fill(k)), vivo: cuentas.map(() => true) });
  const quieto = estado(3, 9, 5, 2), n = nuevo();
  const turno = (t, despues) => textos(resolucion(n, t, [], { despues }));
  for (const t of [1, 2, 3, 4]) assert.deepEqual(turno(t, quieto), [], `turno ${t}: sin panorama`);
  assert.deepEqual(turno(5, quieto), ['Turno 5: Beto va primero con nueve regiones y Dani cierra con dos.']);
  for (const t of [6, 7, 8, 9]) turno(t, quieto);
  assert.deepEqual(turno(10, quieto), ['Turno 10: el mapa lleva nueve turnos sin cambios.'], 'desde el turno 1 (la primera foto) no se ha movido ninguna region');
  for (const t of [11, 12, 13, 14]) turno(t, quieto);
  assert.deepEqual(turno(15, quieto), [], 'ya se dijo que no cambia: no se repite');
  for (const t of [16, 17, 18, 19]) turno(t, quieto);
  assert.deepEqual(turno(20, quieto), []);
  // una region cambia de manos en el turno 22 (y vuelve a su dueno en el 23: lo que cuenta es que hubo cambio desde el ultimo panorama)
  const movido = estado(3, 9, 5, 2); movido.dueno[0] = 1;
  turno(21, quieto); turno(22, movido); turno(23, quieto); turno(24, quieto);
  assert.deepEqual(turno(25, quieto), ['Turno 25: Beto va primero con nueve regiones y Dani cierra con dos.'], 'hubo cambios: otra vez el panorama de siempre');
  assert.deepEqual(turno(30, quieto), ['Turno 30: el mapa lleva siete turnos sin cambios.'], 'el ultimo cambio fue en el turno 23');
  // el primer panorama de un narrador es siempre el completo (no hay con que comparar)
  assert.deepEqual(textos(resolucion(nuevo(), 10, [], { despues: quieto })), ['Turno 10: Beto va primero con nueve regiones y Dani cierra con dos.']);
});

test('ninguna frase presupone algo que quien ve solo esa parte o ese clip no vio: ni «vuelve a», ni «sigue», ni «igual que en el turno N» (cada una dice lo que pasa y cuantos turnos lleva)', () => {
  const n = nuevo(), vistas = [];
  const estado = (...cuentas) => ({ dueno: cuentas.flatMap((c, k) => Array(c).fill(k)), vivo: cuentas.map(() => true) });
  for (let t = 1; t <= 30; t++) {
    vistas.push(...ordenes(n, t, t % 4 === 0 ? [] : [ataque(0, `${t}`), ataque(1, `${t}x`), ataque(2, `${t}y`)], { mensajes: [{ k: 0, texto: `hola ${t}` }] }).dicho);
    vistas.push(...resolucion(n, t, [toma(t, 0, `${t}`), { tipo: 'hambre', k: 1, n: 2, clave: `ev:hambre:${t}:1::`, texto: 'x' }], { despues: estado(3, 9, 5, 2), combates: t % 7 === 0 ? 1 : 0 }).dicho);
  }
  const comentarios = vistas.filter((l) => l.tipo === 'comentario').map((l) => l.texto);
  assert.ok(comentarios.length > 10, 'cobertura: hay frases de contexto que revisar');
  for (const texto of vistas.map((l) => l.texto)) {
    assert.doesNotMatch(texto, /\bvuelv(e|en) a\b/, texto);
    assert.doesNotMatch(texto, /\bsigue(n)?\b/, texto);
    assert.doesNotMatch(texto, /\b(igual|mismo|misma) que en el turno\b/, texto);
  }
});

test('resolucion: un reino caido no entra al panorama ni se nombra como el que cierra, y con un solo reino vivo no hay panorama', () => {
  const caido = resolucion(nuevo(), 5, [], { despues: { dueno: [0, 0, 0, 2, 2], vivo: [true, false, true, false] } });
  assert.deepEqual(textos(caido), ['Turno 5: Ana va primero con tres regiones y Cira cierra con dos.']);
  assert.deepEqual(textos(resolucion(nuevo(), 5, [], { despues: { dueno: [0, 0, 0], vivo: [true, false, false, false] } })), []);
  assert.deepEqual(textos(resolucion(nuevo(), 5, [], { despues: { dueno: [-1, -1, 0, 1], vivo: [true, true, true, true] } })), ['Turno 5: Ana y Beto empatan arriba con una región.'], 'las regiones sin dueño no son de nadie: no se cuentan');
});

test('el narrador no lanza con entradas raras y siempre devuelve su forma: dicho, mudas y extras', () => {
  const n = nuevo();
  for (const basura of [undefined, null, {}, { turno: 'x', ataques: 'no', literales: 7, mensajes: null, hechos: 'no', despues: 5 }]) {
    for (const r of [n.ordenes(basura), n.resolucion(basura)]) {
      assert.ok(Array.isArray(r.dicho) && Array.isArray(r.mudas) && Array.isArray(r.extras), JSON.stringify(basura));
    }
  }
  assert.deepEqual(n.ordenes({ turno: 1, ataques: [null, { k: 'x' }, undefined], literales: [null], mensajes: [], vivos: 4 }).dicho, []);
  assert.deepEqual(n.resolucion({ turno: 1, hechos: [null, { tipo: 'toma', k: 'x' }, undefined], combates: 0, despues: null, ultimo: false }).dicho, []);
});
