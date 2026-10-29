// El gancho «Próximamente» (web/casino/gancho.js): una pieza de ~20 a 25 s que se sube ANTES de una parte, con una tarjeta de apertura, 2 a 5 cortes rapidos de momentos de ESA parte
// (cada uno con su etiqueta) y una tarjeta de cierre. Funciones puras sobre los beats de una partida: sin DOM. Sin spoilers: nunca el ultimo turno (trae el resultado) ni la tarjeta de arranque.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GANCHO, GANCHO_POR_JUEGO, parametrosDeGancho, IDENTIFICADOR_MS, etiquetaDeCorte, armarCorte, cortesPedidos, elegirCortes, armarGancho, textosDeGancho, htmlDeTarjeta, conIdentificador } from '../../../web/casino/gancho.js';
import { marcarTiempos, duracionDeBeat } from '../../../web/casino/escena-config.js';

// 12 unidades de 2 beats; la unidad u dura 2 * (u * 1000) ms: la 1 es corta (2 s) y la 12 larguisima (24 s)
const beats = [];
for (let u = 1; u <= 12; u++) for (let k = 0; k < 2; k++) beats.push({ id: `u${u}b${k}`, mano: u, tipo: k ? 'resolucion' : 'apertura', minMs: u * 1000, texto: '', pasos: [] });
const dest = (unidad, puntos, motivos = ['batalla']) => ({ unidad, puntos, motivos });
const DESTACADAS = [dest(12, 30, ['final']), dest(1, 25, ['pacto']), dest(4, 20, ['traicion']), dest(2, 18), dest(3, 16, ['maravilla']), dest(5, 14), dest(6, 12), dest(7, 10), dest(11, 8)];
const unidadesDe = (cortes) => cortes.map((c) => c.unidad);

test('etiquetaDeCorte nombra el momento con su motivo mas fuerte, con acentos; sin motivos o con basura dice «Momento clave» y nunca lanza', () => {
  assert.equal(etiquetaDeCorte(['batalla decisiva', 'traicion']), 'Traición');
  assert.equal(etiquetaDeCorte(['pacto', 'maravilla']), 'La Maravilla');
  assert.equal(etiquetaDeCorte(['conquista', 'batalla decisiva']), 'Batalla decisiva');
  assert.equal(etiquetaDeCorte(['maravilla', 'traicion']), 'Traición', 'la traicion manda sobre la maravilla');
  assert.equal(etiquetaDeCorte(['caida']), 'Caída de un reino');
  assert.equal(etiquetaDeCorte(['pacto']), 'Pacto');
  for (const nada of [[], undefined, null, 'x', [null], ['motivo-raro']]) assert.equal(etiquetaDeCorte(nada), 'Momento clave', String(nada));
});

test('elegirCortes toma los mejores momentos de la parte, en orden de la partida, sin la tarjeta de arranque (primera unidad) ni el final (ultima unidad)', () => {
  const cortes = elegirCortes({ beats, destacadas: DESTACADAS, rango: { mano: 1, hasta: 12 } });
  assert.ok(cortes.length >= 2 && cortes.length <= GANCHO.MAX_CORTES, `${cortes.length} cortes`);
  assert.ok(!unidadesDe(cortes).includes(1), 'la unidad 1 lleva la tarjeta de arranque');
  assert.ok(!unidadesDe(cortes).includes(12), 'la ultima unidad trae el resultado: adelantaria el final');
  assert.deepEqual(unidadesDe(cortes), [...unidadesDe(cortes)].sort((a, b) => a - b), 'en orden cronologico');
  assert.equal(new Set(unidadesDe(cortes)).size, cortes.length, 'sin repetir');
  assert.ok(unidadesDe(cortes).includes(4), 'el momento de traicion (el mejor que cabe) entra');
});

test('elegirCortes se queda dentro de la parte que se anuncia: el gancho de la parte 2 no muestra momentos de la parte 1 ni al reves', () => {
  const p1 = unidadesDe(elegirCortes({ beats, destacadas: DESTACADAS, rango: { mano: 1, hasta: 6 } }));
  const p2 = unidadesDe(elegirCortes({ beats, destacadas: DESTACADAS, rango: { mano: 7, hasta: 12 } }));
  assert.ok(p1.length && p1.every((u) => u >= 1 && u <= 6), String(p1));
  assert.ok(p2.length && p2.every((u) => u >= 7 && u <= 12), String(p2));
});

test('cada corte se acelera para durar cerca de GANCHO.CORTE_MS (entre 1x y VEL_MAX) y el gancho completo cabe en el presupuesto', () => {
  const cortes = elegirCortes({ beats, destacadas: DESTACADAS, rango: { mano: 1, hasta: 12 } });
  let total = 0;
  for (const c of cortes) {
    assert.ok(c.vel >= 1 && c.vel <= GANCHO.VEL_MAX, `${c.unidad}: vel ${c.vel}`);
    assert.ok(Math.abs(c.ms - c.duracionMs / c.vel) < 5, 'ms = lo que dura la unidad entre su velocidad (que se guarda con 3 decimales)');
    assert.ok(c.ms <= GANCHO.MAX_CORTE_MS, `${c.unidad}: dura ${c.ms}`);
    total += c.ms + GANCHO.ETIQUETA_MS;
  }
  assert.ok(total <= GANCHO.PRESUPUESTO_MS, `los cortes suman ${total}`);
  // una unidad que ya dura menos que un corte no se frena: se queda a 1x
  const cortos = [1, 2, 3, 4].flatMap((u) => [0, 1].map((k) => ({ id: `c${u}${k}`, mano: u, tipo: 'resolucion', minMs: 1000, texto: '', pasos: [] })));
  const corta = elegirCortes({ beats: cortos, destacadas: [dest(2, 5)], rango: { mano: 1, hasta: 4 } })[0];
  assert.deepEqual([corta.vel, corta.ms], [1, 2000]);
});

test('armarCorte: la unidad entera acelerada para durar ~CORTE_MS; una unidad que no existe da un corte vacio sin lanzar (la pagina lo rechaza)', () => {
  const c = armarCorte(beats, 4, ['traicion']); // 8 s a 1x
  assert.deepEqual([c.unidad, c.etiqueta, c.duracionMs], [4, 'Traición', 8000]);
  assert.ok(Math.abs(c.vel - 8000 / GANCHO.CORTE_MS) < 0.001 && Math.abs(c.ms - GANCHO.CORTE_MS) < 1);
  assert.equal(armarCorte(beats, 11, []).vel, 6.286, '22 s entre 3.5 s');
  const larga40 = [0, 1].map((k) => ({ id: `z${k}`, mano: 7, tipo: 'resolucion', minMs: 20000, texto: '', pasos: [] }));
  assert.equal(armarCorte(larga40, 7, []).vel, GANCHO.VEL_MAX, '40 s no caben en un corte ni a la maxima: se quedan en el tope');
  const vacio = armarCorte(beats, 99, null);
  assert.deepEqual([vacio.duracionMs, vacio.vel, vacio.ms], [0, 1, 0]);
  assert.deepEqual(armarCorte(null, 1, []).duracionMs, 0);
});

test('los parametros del gancho son los de siempre para todos los juegos y mas lentos solo para Guerra de territorios (pedido del usuario: «en los clips de Guerra casi no se ve nada»)', () => {
  assert.deepEqual([GANCHO.CORTE_MS, GANCHO.VEL_MAX, GANCHO.MAX_CORTE_MS, GANCHO.MAX_CORTES, GANCHO.PRESUPUESTO_MS], [3500, 8, 6000, 5, 20000]);
  for (const otro of ['dudaapuesta', 'tripledado', 'lobo', null, undefined]) assert.deepEqual(parametrosDeGancho(otro), GANCHO, `${otro}: los de siempre`);
  const g = parametrosDeGancho('conquista');
  assert.ok(g.VEL_MAX <= 3 && g.CORTE_MS >= 6000 && g.MAX_CORTE_MS >= 12000, 'Guerra: aceleracion baja, cortes largos');
  assert.equal(g.APERTURA_MS, GANCHO.APERTURA_MS, 'lo demas (las tarjetas) no cambia');
  assert.deepEqual(Object.keys(GANCHO_POR_JUEGO), ['conquista']);
});

test('la pagina que graba el gancho pide las MISMAS destacadas que el paquete que lo planeo (cuantas: 40): si no, un corte fuera de las primeras perderia su momento (la batalla) y se grabaria como el turno entero acelerado', async () => {
  const { readFileSync } = await import('node:fs');
  const leer = (r) => readFileSync(new URL(`../../../${r}`, import.meta.url), 'utf8');
  const paginas = [['web/casino/escena.js', /destacadasDe\(entrada\.juego, partida, (\d+)\)/], ['herramientas/paquete.mjs', /destacadasDe\(juegoId, partida, (\d+)\)/], ['herramientas/capturar-escena.mjs', /destacadasDe\(juego, guardada, (\d+)\)/]];
  const cuantas = paginas.map(([ruta, re]) => [ruta, Number(re.exec(leer(ruta))?.[1])]);
  assert.deepEqual(cuantas.map(([, n]) => n), [40, 40, 40], JSON.stringify(cuantas));
});

// Un turno de Guerra de territorios: muchas ordenes y mensajes (relleno) y, dentro, el momento: una traicion, dos batallas (la 2.a decisiva, con pantalla VS) y la resolucion.
const turnoDeGuerra = (mano = 5) => [
  { id: 'o', tipo: 'ordenes', ms: 22000 }, { id: 't', tipo: 'traicion', ms: 9000 },
  { id: 'b1', tipo: 'batalla', ms: 6000, pasos: [{ tipo: 'tarjeta', variante: 'A' }] }, { id: 'b2', tipo: 'batalla', ms: 6500, pasos: [{ tipo: 'tarjeta', variante: 'C' }] },
  { id: 'r', tipo: 'resolucion', ms: 12000 },
].map(({ id, tipo, ms, pasos = [] }) => ({ id: `g${mano}${id}`, mano, tipo, minMs: ms, texto: '', pasos }));

test('en Guerra el corte muestra el MOMENTO (la batalla, la traicion) y no el turno entero acelerado: asi se distingue lo que pasa; en otro juego, o sin momento que mostrar, es la unidad entera', () => {
  const g = turnoDeGuerra(), solo = (motivos, juego = 'conquista') => armarCorte(g, 5, motivos, juego);
  assert.equal(solo(['batalla']).duracionMs, 6000, 'el corte dura lo que la batalla (6 s), no lo que el turno (55 s)');
  assert.deepEqual(solo(['batalla']).ids, ['g5b1']);
  assert.deepEqual(solo(['batalla decisiva', 'batalla']).ids, ['g5b2'], 'la decisiva (pantalla VS) va primero');
  assert.deepEqual(solo(['traicion', 'batalla']).ids, ['g5t'], 'la traicion manda sobre la batalla, como la etiqueta');
  assert.deepEqual(solo(['maravilla']).ids, ['g5r'], 'la Maravilla, la caida y la conquista se ven en la resolucion');
  assert.deepEqual(solo(['caida']).ids, ['g5r']);
  const batalla = solo(['batalla']);
  assert.deepEqual([batalla.vel, batalla.ms], [1, 6000], 'un momento que ya dura lo que un corte no se acelera: se ve a velocidad normal');
  const traicion = solo(['traicion']), P = parametrosDeGancho('conquista');
  assert.ok(traicion.vel > 1 && traicion.vel <= P.VEL_MAX && traicion.ms <= P.MAX_CORTE_MS, `${traicion.vel}x`);
  // sin foco: toda la unidad, acelerada solo hasta VEL_MAX
  for (const [motivos, juego] of [[['pacto'], 'conquista'], [[], 'conquista'], [['batalla'], 'dudaapuesta'], [['batalla'], null], [['batalla'], undefined]]) {
    const c = armarCorte(g, 5, motivos, juego);
    assert.equal(c.ids, undefined, `${JSON.stringify(motivos)} en ${juego}: sin foco`);
    assert.equal(c.duracionMs, 22000 + 9000 + 6000 + 6500 + 12000);
    assert.equal(c.vel, parametrosDeGancho(juego).VEL_MAX, 'acelerada hasta el tope de su juego (3x en Guerra, 8x en los demas)');
  }
  assert.equal(armarCorte(turnoDeGuerra().filter((b) => b.tipo !== 'batalla'), 5, ['batalla'], 'conquista').ids, undefined, 'si el turno no trae ese momento, se muestra la unidad');
  // el gancho arma SOLO esos beats, con su velocidad
  const sinFoco = armarGancho(g, [armarCorte(g, 5, ['pacto'], 'conquista')], { juegoId: 'conquista' });
  assert.equal(sinFoco.filter((b) => b.corte === 0).length, 5, 'sin foco: los cinco beats de la unidad');
  const conFoco = armarGancho(g, [batalla], { juegoId: 'conquista' }).filter((b) => b.corte === 0);
  assert.deepEqual(conFoco.map((b) => b.id), ['g5b1'], 'con foco: solo la batalla');
  assert.equal(conFoco[0].vel, 1);
});

test('elegirCortes y cortesPedidos reciben el juego: en Guerra los cortes salen con su foco; sin juego, como siempre', () => {
  const partida = [{ id: 'i', mano: 1, tipo: 'apertura', minMs: 4000, texto: '', pasos: [] }, ...turnoDeGuerra(2), ...turnoDeGuerra(3), { id: 'f', mano: 4, tipo: 'resolucion', minMs: 4000, texto: '', pasos: [] }];
  const destacadas = [dest(2, 20, ['batalla decisiva']), dest(3, 10, ['traicion'])];
  const guerra = elegirCortes({ beats: partida, destacadas, rango: { mano: 1, hasta: 4 }, juegoId: 'conquista' });
  assert.deepEqual(guerra.map((c) => [c.unidad, c.ids]), [[2, ['g2b2']], [3, ['g3t']]]);
  assert.deepEqual(cortesPedidos(partida, [2, 3], destacadas, 'conquista').map((c) => c.ids), [['g2b2'], ['g3t']], 'la pagina arma los mismos cortes que el paquete');
  assert.ok(guerra.every((c) => c.ms <= parametrosDeGancho('conquista').MAX_CORTE_MS));
  assert.deepEqual(elegirCortes({ beats: partida, destacadas, rango: { mano: 1, hasta: 4 } }), [], 'sin juego: la unidad entera, y un turno de 55 s a 8x dura 6.9 s: no cabe en un corte de 6 s (por eso el foco)');
});

test('elegirCortes descarta una unidad que ni a la maxima velocidad cabe en un corte, y sin momentos validos da lista vacia (nunca lanza)', () => {
  const larga = [];
  for (let k = 0; k < 4; k++) larga.push({ id: `l${k}`, mano: 5, tipo: 'resolucion', minMs: 60000, texto: '', pasos: [] });
  const con = [...beats.filter((b) => b.mano < 5), ...larga, ...beats.filter((b) => b.mano > 5)];
  assert.ok(!unidadesDe(elegirCortes({ beats: con, destacadas: [dest(5, 99), dest(3, 5)], rango: { mano: 1, hasta: 12 } })).includes(5), '240 s a 8x siguen siendo 30 s');
  // 50 s a la velocidad maxima (8x) son 6.25 s: caben en el presupuesto pero un corte no puede pasar de MAX_CORTE_MS
  const cincuenta = [...beats.filter((b) => b.mano < 5), ...[0, 1].map((k) => ({ id: `m${k}`, mano: 5, tipo: 'resolucion', minMs: 25000, texto: '', pasos: [] })), ...beats.filter((b) => b.mano > 5)];
  assert.ok(!unidadesDe(elegirCortes({ beats: cincuenta, destacadas: [dest(5, 99), dest(3, 5)], rango: { mano: 1, hasta: 12 } })).includes(5), 'un corte de mas de MAX_CORTE_MS no entra');
  assert.ok(unidadesDe(elegirCortes({ beats: cincuenta.map((b) => (b.mano === 5 ? { ...b, minMs: 22000 } : b)), destacadas: [dest(5, 99)], rango: { mano: 1, hasta: 12 } })).includes(5), '44 s a 8x son 5.5 s: si entra');
  assert.deepEqual(elegirCortes({ beats, destacadas: [dest(4, 0), dest(5, 0)], rango: { mano: 1, hasta: 12 } }), [], 'una unidad sin puntos (sin ningun momento destacado) no es un corte');
  for (const [b, d] of [[[], DESTACADAS], [beats, []], [null, null], [beats, [dest(99, 5)]], [beats, [dest(12, 5), dest(1, 5)]]]) assert.deepEqual(elegirCortes({ beats: b, destacadas: d, rango: { mano: 1, hasta: 12 } }), []);
  assert.deepEqual(elegirCortes({}), []);
});

test('armarGancho: tarjeta de apertura, y por cada corte su etiqueta y los beats de la unidad (con su velocidad), y al final la tarjeta de cierre; sin tocar los beats originales', () => {
  const cortes = elegirCortes({ beats, destacadas: DESTACADAS, rango: { mano: 1, hasta: 12 } });
  const copia = JSON.parse(JSON.stringify(beats));
  const g = armarGancho(beats, cortes, { juegoId: 'conquista', juegoNumero: 2, parte: 1, de: 2 });
  assert.deepEqual(beats, copia, 'no muta la partida');
  assert.equal(g[0].tipo, 'tarjeta-gancho');
  assert.equal(g[0].pasos[0].modo, 'apertura');
  assert.equal(g.at(-1).tipo, 'tarjeta-gancho');
  assert.equal(g.at(-1).pasos[0].modo, 'cierre');
  const etiquetas = g.filter((b) => b.pasos[0]?.modo === 'etiqueta');
  assert.equal(etiquetas.length, cortes.length, 'una etiqueta por corte');
  cortes.forEach((c, i) => {
    const propios = g.filter((b) => b.tipo !== 'tarjeta-gancho' && b.corte === i);
    assert.deepEqual(propios.map((b) => b.id), beats.filter((b) => b.mano === c.unidad).map((b) => b.id), `los beats del corte ${i}`);
    assert.ok(propios.every((b) => b.vel === c.vel), 'cada beat del corte lleva la velocidad del corte');
    assert.equal(etiquetas[i].pasos[0].etiqueta, c.etiqueta);
    assert.equal(g.indexOf(etiquetas[i]) + 1, g.indexOf(propios[0]), 'la etiqueta va justo antes de su corte');
  });
  assert.equal(new Set(g.map((b) => b.id)).size, g.length, 'ids unicos');
  for (const b of g) assert.ok(Number.isFinite(b.minMs) && b.minMs > 0 && Number.isInteger(b.mano), `beat ${b.id}`);
  // la duracion real (con la velocidad de cada corte) es la del plan: apertura + (etiqueta + corte) por corte + cierre
  const total = marcarTiempos(g, null, 1).at(-1).finMs;
  const esperado = GANCHO.APERTURA_MS + GANCHO.CIERRE_MS + cortes.reduce((s, c) => s + GANCHO.ETIQUETA_MS + c.ms, 0);
  assert.ok(Math.abs(total - esperado) < 5, `dura ${total} y el plan decia ${esperado}`);
  assert.ok(total >= 12000 && total <= 26000, `un gancho dura entre 12 y 26 s, no ${total}`);
});

test('el texto de las tarjetas: «Próximamente», el juego, su numero de JUEGO (jN, no el de la partida del archivo) y la parte; nunca resultado; el cierre invita a seguir; un juego de una sola parte no dice «Parte 1 de 1»', () => {
  const t = textosDeGancho({ juegoId: 'conquista', juegoNumero: 3, parte: 1, de: 2 });
  assert.equal(t.kicker, 'PRÓXIMAMENTE');
  assert.equal(t.nombre, 'Guerra de territorios');
  assert.equal(t.detalle, 'Juego 3 · Parte 1 de 2');
  assert.equal(textosDeGancho({ juegoId: 'conquista', juegoNumero: 3, parte: 2, de: 2 }).detalle, 'Juego 3 · Parte 2 de 2', 'el numero de parte es el de la parte que anuncia');
  assert.match(t.cierre, /Síguenos/);
  assert.notEqual(textosDeGancho({ juegoId: 'conquista', juegoNumero: 3, parte: 2, de: 2 }).cierre, t.cierre, 'la ultima parte promete el desenlace, no «la siguiente»');
  assert.equal(textosDeGancho({ juegoId: 'conquista', juegoNumero: 3, parte: 1, de: 1 }).detalle, 'Juego 3');
  assert.equal(textosDeGancho({ juegoId: 'conquista', partidaNumero: 1, parte: 1, de: 2 }).detalle, 'Parte 1 de 2', 'sin numero de juego no se inventa uno (la partida del archivo no es el juego)');
  for (const rarito of [{}, { juegoId: 'no-existe' }, null, undefined]) assert.doesNotThrow(() => textosDeGancho(rarito), String(rarito));
  const todo = JSON.stringify([t, textosDeGancho({ juegoId: 'conquista', juegoNumero: 1, parte: 2, de: 2 })]);
  assert.doesNotMatch(todo, /gan[óo]|ganador|resultado|puntos/i, 'sin spoilers');
  assert.doesNotMatch(todo, /partida/i, 'ya no son partidas: son juegos');
});

test('conIdentificador: toda parte y todo clip abre con una tarjeta que dice el JUEGO (jN) y la parte; no toca los beats, no se duplica y sin numero de juego no pone nada', () => {
  const copia = JSON.parse(JSON.stringify(beats));
  const parte = conIdentificador(beats, { juegoId: 'conquista', juegoNumero: 3, parte: 1, de: 2 });
  assert.deepEqual(beats, copia, 'no muta la partida');
  assert.equal(parte.length, beats.length + 1);
  assert.deepEqual(parte.slice(1), beats, 'los beats de la pieza siguen intactos y en su orden');
  const [tarjeta] = parte, paso = tarjeta.pasos[0];
  assert.deepEqual([tarjeta.id, tarjeta.tipo, tarjeta.mano, tarjeta.minMs], ['identificador', 'tarjeta-gancho', beats[0].mano, IDENTIFICADOR_MS], 'va en la unidad del primer beat, como el intro');
  assert.deepEqual([paso.tipo, paso.modo, paso.kicker, paso.nombre, paso.detalle], ['gancho', 'apertura', 'Juego 3', 'Guerra de territorios', 'Parte 1 de 2']);
  assert.match(paso.aviso, /generado por IA/i);
  const html = htmlDeTarjeta(paso);
  for (const frase of ['Juego 3', 'Guerra de territorios', 'Parte 1 de 2']) assert.ok(html.includes(frase), frase);
  assert.deepEqual(marcarTiempos(parte, null, 1).at(-1).finMs - marcarTiempos(beats, null, 1).at(-1).finMs, IDENTIFICADOR_MS, 'suma exactamente lo que dura la tarjeta');
  // un clip dice cual es y de que parte
  assert.equal(conIdentificador(beats, { juegoId: 'conquista', juegoNumero: 3, parte: 2, de: 2, clip: 4 })[0].pasos[0].detalle, 'Clip 4 · Parte 2 de 2');
  // la ultima parte se llama igual: «Parte 2 de 2»
  assert.equal(conIdentificador(beats, { juegoId: 'conquista', juegoNumero: 3, parte: 2, de: 2 })[0].pasos[0].detalle, 'Parte 2 de 2');
  // una sola parte, o sin saber la parte: solo el juego
  assert.equal(conIdentificador(beats, { juegoId: 'conquista', juegoNumero: 3, parte: 1, de: 1 })[0].pasos[0].detalle, '');
  assert.equal(conIdentificador(beats, { juegoId: 'conquista', juegoNumero: 3 })[0].pasos[0].detalle, '');
  assert.equal(conIdentificador(beats, { juegoId: 'conquista', juegoNumero: 3, clip: 2 })[0].pasos[0].detalle, 'Clip 2', 'un clip sin parte conocida dice solo su numero');
  // no se duplica
  assert.equal(conIdentificador(parte, { juegoId: 'conquista', juegoNumero: 3, parte: 1, de: 2 }).length, parte.length);
  // sin numero de juego (una direccion vieja) o sin beats: tal cual
  for (const sin of [{ juegoId: 'conquista' }, { juegoId: 'conquista', juegoNumero: 0 }, { juegoId: 'conquista', juegoNumero: 'x' }, null, undefined]) assert.deepEqual(conIdentificador(beats, sin), beats, String(JSON.stringify(sin)));
  assert.deepEqual(conIdentificador([], { juegoId: 'conquista', juegoNumero: 3, parte: 1, de: 2 }), []);
  assert.deepEqual(conIdentificador(null, { juegoNumero: 3 }), []);
  assert.doesNotMatch(JSON.stringify(parte[0]), /partida/i, 'ya no son partidas: son juegos');
});

test('cortesPedidos arma los cortes que pide la direccion y nunca deja pasar la primera ni la ultima unidad de la partida (la pagina no se fia de la URL)', () => {
  const c = cortesPedidos(beats, [12, 4, 1, 3, 99, 4], DESTACADAS);
  assert.deepEqual(unidadesDe(c), [4, 3], 'en el orden pedido, sin la 1 (tarjeta de arranque), la 12 (resultado), la 99 (no existe) ni la repetida');
  assert.deepEqual(c.map((x) => x.etiqueta), ['Traición', 'La Maravilla'], 'la etiqueta sale de los motivos de la destacada');
  assert.equal(cortesPedidos(beats, [5], [])[0].etiqueta, 'Momento clave', 'una unidad sin destacada tambien se puede pedir');
  for (const raro of [[null, null, null], [beats, null, null], [null, [4], null]]) assert.deepEqual(cortesPedidos(...raro), [], String(raro));
});

test('htmlDeTarjeta: lo que dice cada tarjeta (apertura, etiqueta, cierre), con el texto escapado; un modo desconocido da una tarjeta vacia sin lanzar', () => {
  const t = textosDeGancho({ juegoId: 'conquista', juegoNumero: 3, parte: 1, de: 2 });
  const apertura = htmlDeTarjeta({ tipo: 'gancho', modo: 'apertura', ...t });
  for (const frase of ['PRÓXIMAMENTE', 'Guerra de territorios', 'Juego 3 · Parte 1 de 2', 'Contenido generado por IA']) assert.ok(apertura.includes(frase), frase);
  const cierre = htmlDeTarjeta({ tipo: 'gancho', modo: 'cierre', ...t });
  for (const frase of ['NO TE LA PIERDAS', 'Parte 1 de 2', 'Guerra de territorios', 'Juego 3', 'Síguenos para no perdértela']) assert.ok(cierre.includes(frase), frase);
  assert.ok(cierre.includes('Guerra de territorios<br>Juego 3'), 'el juego y su numero van cada uno en su linea (sin un punto colgando al partirse el renglon)');
  assert.ok(!cierre.includes('Juego 3 · Parte'), 'el titulo grande del cierre es solo la parte (cabe en dos lineas limpias)');
  assert.ok(!apertura.includes('Partida') && !cierre.includes('Partida'), 'ya no son partidas: son juegos');
  const unica = htmlDeTarjeta({ tipo: 'gancho', modo: 'cierre', ...textosDeGancho({ juegoId: 'conquista', juegoNumero: 3, parte: 1, de: 1 }) });
  assert.ok(unica.includes('>Juego 3<') && !unica.includes('Parte 1 de 1'), unica);
  const etiqueta = htmlDeTarjeta({ tipo: 'gancho', modo: 'etiqueta', etiqueta: '<b>Traición</b>', numero: 2, total: 4 });
  assert.ok(etiqueta.includes('2 / 4') && etiqueta.includes('&lt;b&gt;Traición&lt;/b&gt;') && !etiqueta.includes('<b>'), etiqueta);
  for (const raro of [{ modo: 'x' }, {}, null, undefined]) assert.equal(htmlDeTarjeta(raro), '', String(raro));
});

test('duracionDeBeat no cambia (la mesa aplica la velocidad del beat); lo que cambia es marcarTiempos, que suma lo que dura de verdad cada beat con su velocidad', () => {
  const a = { id: 'a', mano: 1, tipo: 'x', minMs: 8000, texto: '' }, b = { ...a, id: 'b', vel: 4 };
  assert.equal(duracionDeBeat(b, null, 1), 8000);
  assert.equal(marcarTiempos([a], null, 1).at(-1).finMs, 8000);
  assert.equal(marcarTiempos([b], null, 1).at(-1).finMs, 2000);
  assert.equal(marcarTiempos([b], null, 2).at(-1).finMs, 1000, 'la velocidad de la pagina se multiplica con la del corte');
});
