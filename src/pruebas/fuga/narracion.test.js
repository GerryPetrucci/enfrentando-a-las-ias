// La historia publica de La Fuga: se cuenta desde lo que registro el motor, con frases de plantilla. Los nombres de las IAs se
// ponen despues ({0} y {1}) porque cambian de asiento en cada partida de una serie.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { narrarRonda, narrarEpilogo, resolverNombres } from '../../juegos/fuga/narracion.js';
import { porId } from '../../juegos/fuga/catalogo.js';
import { POSTURAS, METODOS, PUNTOS } from '../../juegos/fuga/constantes.js';
import { nuevoEstado, forzar, jug } from './ayudas.js';

// Un contexto de ronda listo para narrar. `opciones` cambia lo que haga falta.
function ctx(opciones = {}) {
  const E = nuevoEstado(opciones.seed ?? 7);
  const sit = forzar(E, opciones.def ?? 'celda', { fiable: opciones.fiable ?? true });
  const jugadas = opciones.jugadas ?? [jug({ postura: 'ayudar', metodo: 'sigilo' }), jug({ postura: 'avanzar', metodo: 'engano' })];
  return {
    E, num: 1, sit, def: porId.get(sit.id), jugadas,
    fallos: opciones.fallos ?? [0.12, 0.14],
    resultados: opciones.resultados ?? ['limpio', 'limpio'],
    tentacion: opciones.tentacion ?? null,
    salen: opciones.salen ?? [false, false],
    alarmaAntes: opciones.alarmaAntes ?? 0,
    cohesionAntes: opciones.cohesionAntes ?? 0,
  };
}
const textos = (lineas) => lineas.map((l) => l.texto);

test('cuenta la situacion: apertura, decisiones, la verdad oculta y el resultado de cada uno', () => {
  const L = narrarRonda(ctx());
  assert.deepEqual(L.map((l) => l.tipo), ['apertura', 'decision', 'decision', 'verdad', 'resultado', 'resultado']);
  assert.match(L[0].texto, /^Situación 1 de 9 · La cerradura de la celda\. /);
  assert.equal(L[1].texto, '{0} ayuda a su compañero en silencio.');
  assert.equal(L[2].texto, '{1} sigue adelante junto a su compañero con un engaño.');
  assert.equal(L[3].texto, 'Probabilidad real de fallar: {0} 12 %, {1} 14 %. La pista decía la verdad: lo mejor era el sigilo.');
});

test('si la pista engañaba, la narracion lo dice', () => {
  const L = narrarRonda(ctx({ fiable: false }));
  assert.match(L[3].texto, /La pista engañaba: lo mejor era el sigilo\.$/);
});

test('el mismo contexto da las mismas lineas, las variantes cambian con la semilla y no se toca el estado', () => {
  assert.deepEqual(narrarRonda(ctx()), narrarRonda(ctx()));
  const aperturas = new Set();
  for (let seed = 1; seed <= 30; seed++) aperturas.add(narrarRonda(ctx({ seed }))[0].texto);
  assert.ok(aperturas.size >= 3, `solo ${aperturas.size} aperturas distintas`);
  const c = ctx();
  const antes = JSON.stringify(c.E);
  narrarRonda(c);
  assert.equal(JSON.stringify(c.E), antes, 'narrar no debe modificar el estado');
});

test('ninguna combinacion de postura, metodo y resultado produce texto vacio, undefined ni marcadores sueltos', () => {
  const resultados = [['limpio', 'limpio'], ['tropezo', 'cayo'], ['cayo', 'limpio']];
  for (const pa of POSTURAS) for (const ma of METODOS) for (const pb of POSTURAS) for (const res of resultados) {
    const L = narrarRonda(ctx({ jugadas: [jug({ postura: pa, metodo: ma }), jug({ postura: pb, metodo: 'fuerza' })], resultados: res }));
    for (const l of L) {
      assert.ok(l.texto.length > 5, l.texto);
      assert.doesNotMatch(l.texto, /undefined|null|NaN|\{n\}/);
      assert.doesNotMatch(l.texto, /\{(?![01]\})/, `marcador suelto en: ${l.texto}`);
    }
  }
  // un prisionero solo (el otro ya cayo)
  const sola = narrarRonda(ctx({ jugadas: [jug(), null], fallos: [0.1, null], resultados: ['limpio', null] }));
  assert.equal(sola.filter((l) => l.tipo === 'decision').length, 1);
  assert.equal(sola.find((l) => l.tipo === 'decision').texto, '{0} sigue solo en silencio.');
  assert.doesNotMatch(sola.find((l) => l.tipo === 'verdad').texto, /\{1\}/);
});

test('cuenta el botin y la oferta del guardia, y cuando nadie los toma', () => {
  // el objeto viene en la tentacion del registro (en solitario puede ser uno que el catalogo no trae para esa situacion)
  const botin = (tomo, objeto = 'un alambre', def = 'celda') => narrarRonda(ctx({ def, tentacion: { tipo: 'botin', tomo, delataron: [], objeto } })).at(-1).texto;
  assert.equal(botin(1), '{1} se queda con un alambre.');
  assert.equal(botin(null), 'Nadie se atreve a tomar un alambre.');
  assert.equal(botin(0, 'una mochila abandonada', 'ronda'), '{0} se queda con una mochila abandonada.');
  const oferta = (delataron) => narrarRonda(ctx({ def: 'ronda', tentacion: { tipo: 'oferta', tomo: null, delataron } })).at(-1).texto;
  assert.equal(oferta([0]), '{0} acepta la oferta del guardia y le cuenta lo que planea su compañero.');
  assert.equal(oferta([]), 'Nadie acepta la oferta del guardia.');
  assert.equal(oferta([0, 1]), '{0} acepta la oferta del guardia y le cuenta lo que planea su compañero. {1} acepta la oferta del guardia y le cuenta lo que planea su compañero.');
});

test('avisa cuando cambia el nivel de alerta y cuando la confianza se rompe o crece', () => {
  const sube = ctx({ alarmaAntes: 1 });
  sube.E.alarma = 3;
  assert.ok(textos(narrarRonda(sube)).includes('La alerta sube a «en alerta».'));
  const baja = ctx({ alarmaAntes: 4 });
  baja.E.alarma = 1;
  assert.ok(textos(narrarRonda(baja)).includes('La alerta baja a «tranquila».'));
  const igual = ctx({ alarmaAntes: 0 });
  igual.E.alarma = 1; // tranquila -> tranquila
  assert.ok(!textos(narrarRonda(igual)).some((t) => t.startsWith('La alerta')));

  const rota = ctx({ cohesionAntes: 1 });
  rota.E.cohesion = -1;
  assert.ok(textos(narrarRonda(rota)).includes('La confianza entre los dos se resquebraja.'));
  const crece = ctx({ cohesionAntes: 0 });
  crece.E.cohesion = 1;
  assert.ok(textos(narrarRonda(crece)).includes('Su confianza crece.'));
  const leve = ctx({ cohesionAntes: 0 });
  leve.E.cohesion = -1;
  assert.ok(!textos(narrarRonda(leve)).some((t) => t.includes('confianza')));
});

test('el epilogo cuenta como termino, revela el valor de salir solo y usa los nombres al final', () => {
  const E = nuevoEstado();
  assert.deepEqual(narrarEpilogo(E), [], 'sin terminar no hay epilogo');

  E.fin = true;
  E.finales = ['conjunto', 'conjunto'];
  E.puntos = [10, 12];
  let t = textos(narrarEpilogo(E));
  assert.equal(t[0], 'Los dos cruzan la reja final. Escapan juntos.');
  assert.match(t.at(-1), /^Puntos finales: \{0\} 10, \{1\} 12\. Gana \{1\}\.$/);

  E.finales = ['capturado', 'solo'];
  E.puntos = [0, PUNTOS.escapeSolo];
  t = textos(narrarEpilogo(E));
  assert.equal(t[0], '{1} cruza la reja final. Escapa solo; {0} se queda atrás.');
  assert.equal(t[1], `Lo que ninguno sabía: salir solo valía ${PUNTOS.escapeSolo} puntos.`);

  E.finales = ['capturado', 'capturado'];
  E.puntos = [2, 2];
  t = textos(narrarEpilogo(E));
  assert.equal(t[0], 'Nadie logra salir. La prisión se cierra sobre los dos.');
  assert.match(t.at(-1), /Empate\.$/);

  assert.equal(resolverNombres('{0} cruza; {1} cae. {0}', [{ nombre: 'Claude' }, { nombre: 'GPT' }]), 'Claude cruza; GPT cae. Claude');
  assert.equal(resolverNombres('{1}', []), 'Prisionero 2');
});

// ---------- enmienda del 10 de octubre de 2026: salida anticipada y abandonado ----------
test('cuenta la salida anticipada: uno que escapa y deja atras al otro, o los dos por separado', () => {
  const uno = textos(narrarRonda(ctx({ salen: [false, true] })));
  assert.ok(uno.includes('{1} encuentra una ruta propia y escapa por su cuenta; {0} se queda atrás.'));
  const dos = textos(narrarRonda(ctx({ salen: [true, true] })));
  assert.ok(dos.includes('Los dos encuentran su propia ruta y escapan por separado.'));
  const ninguno = textos(narrarRonda(ctx()));
  assert.ok(!ninguno.some((t) => t.includes('ruta propia') || t.includes('por separado')));
});

test('el epilogo cuenta al que escapo antes, al abandonado que salio despues y revela lo que valia cada salida', () => {
  const E = nuevoEstado();
  E.fin = true;
  E.finales = ['anticipada', 'abandonado'];
  E.puntos = [PUNTOS.escapeSolo, PUNTOS.escapeAbandonado];
  let t = textos(narrarEpilogo(E));
  assert.equal(t[0], '{0} escapó por su cuenta a mitad de camino.');
  assert.equal(t[1], '{1}, que se quedó atrás, siguió solo y logró salir.');
  assert.ok(t.includes(`Lo que ninguno sabía: salir solo valía ${PUNTOS.escapeSolo} puntos.`));
  assert.ok(t.includes(`Y quien se quedaba atrás y aun así lograba salir cobraba ${PUNTOS.escapeAbandonado}.`));
  assert.match(t.at(-1), /Gana \{1\}\.$/);

  E.finales = ['anticipada', 'capturado'];
  E.puntos = [PUNTOS.escapeSolo, 0];
  t = textos(narrarEpilogo(E));
  assert.equal(t[0], '{0} escapó por su cuenta a mitad de camino.');
  assert.equal(t[1], '{1} no logra salir.');
  assert.ok(!t.some((x) => x.includes('cobraba')), 'sin abandonado no se menciona su premio');

  E.finales = ['anticipada', 'anticipada'];
  E.puntos = [PUNTOS.escapeSolo, PUNTOS.escapeSolo];
  t = textos(narrarEpilogo(E));
  assert.equal(t[0], '{0} escapó por su cuenta a mitad de camino.');
  assert.equal(t[1], '{1} escapó por su cuenta a mitad de camino.');
  assert.match(t.at(-1), /Empate\.$/);
});

test('el epilogo avisa de los extras que pierde quien es capturado', () => {
  const E = nuevoEstado();
  E.fin = true;
  E.finales = ['capturado', 'solo'];
  E.puntos = [0, PUNTOS.escapeSolo];
  E.perdidos = [3, 0];
  const t = textos(narrarEpilogo(E));
  assert.equal(t[0], '{1} cruza la reja final. Escapa solo; {0} se queda atrás.');
  assert.equal(t[1], 'Se pierden los extras de {0} (3 puntos): no logró salir.');
  E.perdidos = [0, 0];
  assert.ok(!textos(narrarEpilogo(E)).some((x) => x.includes('extras')), 'sin extras perdidos no se menciona nada');
});

test('la narracion publica no usa palabras duras: nadie delata, abandona ni suelta a nadie', () => {
  const dura = /delat|abandon|traici|traidor|suelta a/i;
  const todas = [];
  for (const postura of POSTURAS) {
    for (const resultado of ['limpio', 'tropezo', 'cayo']) {
      todas.push(...textos(narrarRonda(ctx({ jugadas: [jug({ postura }), jug({ postura: 'separarse' })], resultados: [resultado, 'limpio'] }))));
    }
  }
  todas.push(...textos(narrarRonda(ctx({ def: 'ronda', tentacion: { tipo: 'oferta', tomo: null, delataron: [0, 1] } }))));
  const E = nuevoEstado();
  E.fin = true;
  E.finales = ['anticipada', 'abandonado'];
  E.puntos = [PUNTOS.escapeSolo, PUNTOS.escapeAbandonado];
  todas.push(...textos(narrarEpilogo(E)));
  assert.ok(todas.length > 20);
  for (const t of todas) assert.doesNotMatch(t, dura, t);
});
