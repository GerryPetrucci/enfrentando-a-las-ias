// Lo que la mesa de Mayor o menor (web/casino/mesa-mayormenor.js) deja a la vista y cuando lo quita. Visto en la grabacion del 21 de octubre de 2026: la caja «X apuesta N fichas a que sera M» (y el sello y la flecha)
// se quedaban en pantalla hasta que empezaba la ronda siguiente, y todavia unos instantes despues (la cabecera decia «Ronda 2» mientras la voz decia «Ronda 3»). Ahora se apagan cuando la ronda se resuelve
// (ya pagadas las fichas, con los contadores a la vista) y la ronda nueva lo cambia todo a la vez. Un DOM falso minimo, sin navegador (la pagina se verifica con capturas).
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Mesa, ESTADOS, APAGADO_MS, LECTURA_MS, momentoDeLimpieza } from '../../../web/casino/mesa-mayormenor.js';

function nodo() {
  const n = { style: {}, animaciones: [], hijos: [], innerHTML: '', textContent: '', quitado: false, clases: new Set(), sub: {} };
  n.classList = { add: (c) => n.clases.add(c), remove: (c) => n.clases.delete(c), toggle: (c, on) => (on ? n.clases.add(c) : n.clases.delete(c)), contains: (c) => n.clases.has(c) };
  n.animate = (frames, opciones) => { const a = { frames, opciones, cancelada: false, cancel() { a.cancelada = true; } }; n.animaciones.push(a); return a; };
  n.getAnimations = () => n.animaciones.filter((a) => !a.cancelada);
  n.querySelector = (sel) => (n.sub[sel] ??= nodo());
  n.append = (...h) => { n.hijos.push(...h); };
  n.remove = () => { n.quitado = true; };
  return n;
}

const R = { x: 100, y: 100, ancho: 200, alto: 100 };
const JUGADORES = [{ nombre: 'Ana', color: '#fff' }, { nombre: 'Beto', color: '#000' }];

// Una mesa sin pasar por el constructor (no toca el DOM real): solo lo que usan los metodos que se prueban; lo demas, espias.
function mesaFalsa({ rapido = false } = {}) {
  const m = Object.create(Mesa.prototype);
  m.registro = [];
  m.programadas = [];
  Object.assign(m, {
    formato: '9x16', vel: 1, rapido, sfx: {}, razon: false, partida: { jugadores: JUGADORES }, activo: 0,
    apuesta: nodo(), sello: nodo(), indicador: nodo(), visibles: new Set(),
    raiz: { pastillas: [nodo(), nodo()], querySelectorAll(sel) { return sel === '.pastilla-camara' ? this.pastillas : []; }, append() {} },
    cabecera: nodo(),
    ranuraCrupier: { children: [nodo()], innerHTML: '<carta>' }, ranuraJugada: { children: [nodo()], innerHTML: '<carta>', firstElementChild: null },
    asientos: [0, 1].map(() => ({ placa: nodo(), tira: nodo(), ahora: null, disponibles: [], inicial: [], rol: '', reemplazo: false, turno: false, actua: false, fichas: 0 })),
    L: { centro: { banca: R, apuesta: R, sello: R, pastilla: R } },
  });
  m.esperar = async (ms) => { m.registro.push(['esperar', ms]); };
  m.programar = (ms, fn) => { m.programadas.push({ ms, fn }); };
  m.sonar = () => {};
  m.volarFichas = () => {};
  m.centroPlaca = () => ({ x: 0, y: 0 });
  m.pintarPlaca = () => {};
  m.pintarTira = () => {};
  m.mostrarMazo = () => {};
  m.mostrarEstadoInicial = (b) => m.registro.push(['estado', b.mano]);
  m.aplicarEstado = () => m.registro.push(['contadores']);
  return m;
}

async function conDom(fn) {
  const anterior = globalThis.document;
  globalThis.document = { createElement: () => nodo() };
  try { return await fn(); } finally { if (anterior === undefined) delete globalThis.document; else globalThis.document = anterior; }
}

const aVista = (m) => { m.visibles = new Set(['apuesta', 'sello', 'indicador']); };

test('quitarResolucion apaga la caja de la apuesta, el sello y la flecha con un fundido y los deja en cero: al terminar se cancelan TAMBIEN las animaciones de entrada (una animacion con fill forwards le gana al estilo en linea y la caja volveria a verse)', () => {
  const m = mesaFalsa();
  aVista(m);
  // lo que dejo la entrada: una animacion que se queda en su ultimo cuadro (opacidad 1)
  const entradas = [m.apuesta, m.sello, m.indicador].map((n) => n.animate([{ opacity: 0 }, { opacity: 1 }], { fill: 'forwards' }));
  m.quitarResolucion();
  for (const [i, n] of [m.apuesta, m.sello, m.indicador].entries()) {
    assert.equal(n.animaciones.length, 2);
    const a = n.animaciones[1];
    assert.deepEqual(a.frames, [{ opacity: 1 }, { opacity: 0 }]);
    assert.equal(a.opciones.fill, 'forwards');
    assert.equal(a.opciones.duration, APAGADO_MS);
    assert.equal(entradas[i].cancelada, false, 'mientras dura el fundido la entrada sigue ahi (si no, la caja desapareceria de golpe)');
    a.onfinish();
    assert.equal(String(n.style.opacity), '0', 'termina apagado');
    assert.ok(n.animaciones.every((x) => x.cancelada), 'sin ninguna animacion viva: ninguna puede volver a encender la caja');
  }
  assert.equal(m.visibles.size, 0, 'ya no hay nada de la apuesta a la vista');
});

test('quitarResolucion solo apaga lo que estaba a la vista (no enciende por un instante lo que ya estaba apagado) y no falla si no hay nada', () => {
  const m = mesaFalsa();
  m.visibles = new Set(['apuesta']);
  m.quitarResolucion();
  assert.equal(m.apuesta.animaciones.length, 1);
  assert.equal(m.sello.animaciones.length, 0);
  assert.equal(m.indicador.animaciones.length, 0);
  assert.doesNotThrow(() => m.quitarResolucion());
  const sinCampo = mesaFalsa();
  delete sinCampo.visibles;
  assert.doesNotThrow(() => sinCampo.quitarResolucion());
});

test('la velocidad acorta el fundido de apagado, como el de todo lo demas', () => {
  const m = mesaFalsa();
  m.vel = 5;
  aVista(m);
  m.quitarResolucion();
  assert.equal(m.apuesta.animaciones[0].opciones.duration, APAGADO_MS / 5);
});

test('apostar deja la caja a la vista y la marca para apagarla despues', async () => {
  const m = mesaFalsa();
  const beat = { reemplazo: false, pasos: [{ tipo: 'apuesta', asiento: 1, fichas: 6, lado: 'mayor', todo: true, maximo: true }] };
  await m.apostar(beat);
  assert.ok(m.visibles.has('apuesta'));
  assert.match(m.apuesta.innerHTML, /Beto apuesta/);
  assert.match(m.apuesta.innerHTML, /¡Máximo!/);
});

test('revelarCarta marca el sello y la flecha para apagarlos, quita la pastilla de la camara (ya se ve la carta) y apaga el brillo de quien apostaba', async () => {
  const m = mesaFalsa();
  m.asientos[1].actua = true; // el predictor acaba de apostar
  const beat = { pasos: [{ tipo: 'revelar', carta: 8 }, { tipo: 'comparar', veredicto: 'mayor', crupier: 5, carta: 8, igual: false }, { tipo: 'sello', sello: 'acierta' }] };
  await m.revelarCarta(beat, 3600);
  assert.ok(m.visibles.has('sello') && m.visibles.has('indicador'));
  assert.ok(m.raiz.pastillas.every((p) => p.quitado), 'la pastilla «Camara» no se queda sobre la carta ya revelada');
  assert.equal(m.sello.textContent, 'Acierta');
  assert.deepEqual(m.asientos.map((a) => a.actua), [false, false], 'al revelar ya nadie actua: nadie brilla');
});

test('momentoDeLimpieza: despues de actualizar los contadores y dejarlos leer, y con tiempo de apagarse antes de que acabe el beat', () => {
  // beat largo (con voz): se deja leer lo que dura LECTURA_MS despues de actualizar los contadores
  assert.equal(momentoDeLimpieza(900, 6700), 900 + 700 + LECTURA_MS);
  // beat corto (sin voz, 2.8 s): se adelanta para que el fundido termine antes del final
  const corto = momentoDeLimpieza(900, 2800);
  assert.equal(corto, 2800 - APAGADO_MS - 250);
  assert.ok(corto >= 900 + 700, 'nunca antes de que se actualicen los contadores');
  // nunca antes de pagar aunque el beat sea cortisimo
  assert.equal(momentoDeLimpieza(1350, 1000), 1350 + 700);
  for (const [retraso, ms] of [[0, 2800], [450, 3000], [1350, 6700], [1800, 9000]]) {
    const t = momentoDeLimpieza(retraso, ms);
    assert.ok(Number.isFinite(t) && t >= retraso + 700, `${retraso}/${ms}`);
  }
});

test('pagar (en vivo) programa el apagado de la apuesta despues de pagar; el apagado llama a quitarResolucion', async () => {
  const m = mesaFalsa();
  let apagadas = 0;
  m.quitarResolucion = () => { apagadas++; };
  const beat = { pasos: [{ tipo: 'cobra', asiento: 0, fichas: 3 }, { tipo: 'devuelve', asiento: 1, fichas: 6 }, { tipo: 'estado', fichas: [13, 16], disponibles: [[], []], crupierQuedan: [8, 8] }] };
  await m.pagar(beat, 6700);
  const retraso = 450 * 2; // un paso de pago cada 450 ms (el de estado no cuenta)
  const apagado = m.programadas.find((p) => p.ms === momentoDeLimpieza(retraso, 6700));
  assert.ok(apagado, `se programa a los ${momentoDeLimpieza(retraso, 6700)} ms; programadas: ${m.programadas.map((p) => p.ms)}`);
  assert.ok(apagado.ms > m.programadas.find((p) => p.ms === retraso + 700).ms - 1, 'despues de actualizar los contadores');
  assert.equal(apagadas, 0, 'todavia no se apago: se programo');
  apagado.fn();
  assert.equal(apagadas, 1);
});

test('pagar con modo rapido (capturas que se detienen en un beat) NO apaga nada: la captura del resultado conserva lo que se ve', async () => {
  const m = mesaFalsa({ rapido: true });
  let apagadas = 0;
  m.quitarResolucion = () => { apagadas++; };
  m.programar = (ms, fn) => fn(); // en rapido los temporizadores corren al instante
  await m.pagar({ pasos: [{ tipo: 'cobra', asiento: 0, fichas: 3 }, { tipo: 'estado', fichas: [13, 16], disponibles: [[], []], crupierQuedan: [8, 8] }] }, 3000);
  assert.equal(apagadas, 0);
});

test('nuevaRonda apaga YA lo que quedara de la ronda anterior y cambia la cabecera y los papeles en el mismo instante, antes de retirar las cartas', async () => {
  const m = mesaFalsa();
  aVista(m);
  const pillas = m.raiz.pastillas;
  const crupier = m.ranuraCrupier.children[0], jugada = m.ranuraJugada.children[0];
  // lo que haya a medias (una animacion de entrada que sigue en pie) se corta
  m.apuesta.animate([], {}); m.sello.animate([], {}); m.indicador.animate([], {});
  await m.nuevaRonda({ mano: 3 });
  assert.deepEqual(m.registro.map((x) => x[0]), ['estado', 'esperar'], 'primero la ronda nueva, despues la espera de las cartas viejas');
  assert.equal(m.registro[0][1], 3);
  for (const n of [m.apuesta, m.sello, m.indicador]) {
    assert.ok(n.animaciones.every((a) => a.cancelada), 'sin animaciones vivas');
    assert.equal(String(n.style.opacity), '0');
  }
  assert.equal(m.visibles.size, 0);
  assert.ok(pillas.every((p) => p.quitado));
  assert.ok([crupier, jugada].every((c) => c.animaciones.length === 1 && c.animaciones[0].frames[1].opacity === 0), 'las cartas viejas se apagan con un fundido');
  assert.equal(m.ranuraCrupier.innerHTML, '');
  assert.equal(m.ranuraJugada.innerHTML, '');
});

test('mostrarEstadoInicial cambia de una vez la cabecera («Ronda N / 18», y «· DOBLE ×2» resaltado si es doble), los papeles y las fichas, sin arrastrar nada de la ronda anterior', () => {
  const m = mesaFalsa();
  delete m.mostrarEstadoInicial; delete m.aplicarEstado; // las de verdad, no los espias
  const mano = m.cabecera.sub['.mano'] = nodo();
  const estado = { tipo: 'estado', fichas: [13, 7], disponibles: [[1, 2], [3]], crupierQuedan: [4, 4], manoInicial: [[1, 2, 5], [3, 6]] };
  m.asientos[0].ahora = 5; m.asientos[0].reemplazo = true; m.asientos[1].ahora = 6; m.asientos[1].actua = true; // lo que dejo la ronda anterior
  m.mostrarEstadoInicial({ mano: 18, pasos: [{ tipo: 'roles', activo: 1, predictor: 0, doble: true }, estado] });
  assert.equal(mano.textContent, 'Ronda 18 / 18 · DOBLE ×2');
  assert.ok(mano.clases.has('doble'), 'la ronda doble se resalta');
  assert.deepEqual(m.asientos.map((a) => [a.rol, a.turno, a.ahora, a.reemplazo, a.actua, a.fichas]), [['predictor', false, null, false, false, 13], ['activo', true, null, false, false, 7]], 'al empezar la ronda nadie actua todavia');
  assert.deepEqual(m.asientos.map((a) => a.inicial), [[1, 2, 5], [3, 6]], 'las cartas repartidas');
  m.mostrarEstadoInicial({ mano: 7, pasos: [{ tipo: 'roles', activo: 0, predictor: 1 }, estado] });
  assert.equal(mano.textContent, 'Ronda 7 / 18', 'una ronda normal no dice doble');
  assert.ok(!mano.clases.has('doble'), 'ni se queda resaltada');
});

test('los estados de la barra de cada jugador: «Activo · juega una carta» y «Predictor · apuesta», con su variante cuando la jugada la puso el juego', () => {
  assert.deepEqual(ESTADOS.activo, { papel: 'Activo', accion: 'juega una carta', accionJuego: 'carta del juego' });
  assert.deepEqual(ESTADOS.predictor, { papel: 'Predictor', accion: 'apuesta', accionJuego: 'apuesta del juego' });
  assert.deepEqual(Object.keys(ESTADOS), ['activo', 'predictor'], 'no hay papeles de mas');
});

test('jugarCarta pone al activo en su papel y apostar al predictor en el suyo; si la respuesta de la IA no sirvio y la puso el juego, el papel se conserva y la jugada se marca como del juego (nunca se le atribuye a la IA)', async () => {
  const m = mesaFalsa();
  await m.jugarCarta({ asiento: 0, reemplazo: false, pasos: [] });
  assert.deepEqual([m.asientos[0].rol, m.asientos[0].reemplazo], ['activo', false]);
  assert.deepEqual(m.asientos.map((a) => a.actua), [true, false], 'al jugar su carta brilla la pastilla del activo');
  await m.jugarCarta({ asiento: 0, reemplazo: true, pasos: [] });
  assert.deepEqual([m.asientos[0].rol, m.asientos[0].reemplazo], ['activo', true], 'sigue siendo el activo: el publico no pierde quien hace que');
  const apuesta = (reemplazo) => ({ reemplazo, pasos: [{ tipo: 'apuesta', asiento: 1, fichas: 4, lado: 'menor', todo: false, maximo: false }] });
  await m.apostar(apuesta(false));
  assert.deepEqual([m.asientos[1].rol, m.asientos[1].reemplazo], ['predictor', false]);
  assert.deepEqual(m.asientos.map((a) => a.actua), [false, true], 'al apostar brilla la del predictor y se apaga la del activo');
  await m.apostar(apuesta(true));
  assert.deepEqual([m.asientos[1].rol, m.asientos[1].reemplazo], ['predictor', true]);
});

test('actuaAhora hace brillar la pastilla de quien actua (con un destello al encenderla) y apaga la de los demas; con null no brilla nadie; solo se repintan las barras que cambian', () => {
  const m = mesaFalsa();
  const pintadas = [];
  m.pintarPlaca = (s) => pintadas.push(s);
  const pastilla = (s) => m.asientos[s].placa.sub['.estado-pill'];
  m.actuaAhora(1);
  assert.deepEqual(m.asientos.map((a) => a.actua), [false, true]);
  assert.deepEqual(pintadas.splice(0), [1], 'solo la barra de quien actua cambia');
  assert.equal(pastilla(1).animaciones.length, 1, 'la pastilla que se enciende hace un destello');
  assert.deepEqual(pastilla(1).animaciones[0].frames.map((f) => f.transform), ['scale(1)', 'scale(1.1)', 'scale(1)']);
  assert.equal(pastilla(0)?.animaciones.length ?? 0, 0, 'la otra no se anima');
  m.actuaAhora(0);
  assert.deepEqual(m.asientos.map((a) => a.actua), [true, false]);
  assert.deepEqual(pintadas.splice(0).sort(), [0, 1], 'una se enciende y la otra se apaga');
  assert.equal(pastilla(0).animaciones.length, 1);
  m.actuaAhora(null);
  assert.deepEqual(m.asientos.map((a) => a.actua), [false, false]);
  assert.deepEqual(pintadas.splice(0), [0], 'solo la que dejo de brillar');
  assert.equal(pastilla(0).animaciones.length, 1, 'apagar no hace destello');
  m.actuaAhora(null);
  assert.deepEqual(pintadas.splice(0), [], 'si nada cambia no se repinta');
});

test('pintarPlaca hace brillar la pastilla del que actua (y solo la suya)', () => {
  const m = mesaFalsa();
  delete m.pintarPlaca;
  m.asientos[0].rol = 'activo'; m.asientos[0].actua = true;
  m.asientos[1].rol = 'predictor';
  m.pintarPlaca(0); m.pintarPlaca(1);
  assert.match(m.asientos[0].placa.innerHTML, /class="estado-pill ahora"><b>Activo</);
  assert.doesNotMatch(m.asientos[1].placa.innerHTML, /ahora/);
  m.asientos[0].reemplazo = true;
  m.pintarPlaca(0);
  assert.match(m.asientos[0].placa.innerHTML, /class="estado-pill juego ahora"/, 'la jugada del juego tambien brilla, en dorado');
});

test('pintarPlaca dibuja la pastilla del papel del jugador (distinta si la jugada la puso el juego) y ninguna si no tiene papel; el aro dorado sigue siendo del activo', () => {
  const m = mesaFalsa();
  delete m.pintarPlaca; // la de verdad
  const a = m.asientos[0];
  a.fichas = 13; a.rol = 'predictor';
  m.pintarPlaca(0);
  assert.match(a.placa.innerHTML, /class="placa con-estado"/);
  assert.match(a.placa.innerHTML, /<div class="estado-pill"><b>Predictor<\/b><span>apuesta<\/span><\/div>/);
  assert.match(a.placa.innerHTML, />Ana</);
  assert.match(a.placa.innerHTML, /<span class="cuenta">13<\/span>/);
  a.rol = 'activo'; a.turno = true;
  m.pintarPlaca(0);
  assert.match(a.placa.innerHTML, /<div class="estado-pill"><b>Activo<\/b><span>juega una carta<\/span><\/div>/);
  assert.ok(a.placa.clases.has('turno'));
  a.reemplazo = true;
  m.pintarPlaca(0);
  assert.match(a.placa.innerHTML, /class="placa reemplazo con-estado"/);
  assert.match(a.placa.innerHTML, /<div class="estado-pill juego"><b>Activo<\/b><span>carta del juego<\/span><\/div>/, 'conserva el papel y dice que la carta la puso el juego');
  a.rol = 'predictor';
  m.pintarPlaca(0);
  assert.match(a.placa.innerHTML, /<div class="estado-pill juego"><b>Predictor<\/b><span>apuesta del juego<\/span><\/div>/);
  a.rol = ''; a.reemplazo = false; a.turno = false;
  m.pintarPlaca(0);
  assert.doesNotMatch(a.placa.innerHTML, /estado-pill|con-estado/, 'sin papel no hay pastilla (el final, el reparto)');
  assert.ok(!a.placa.clases.has('turno'));
  a.rol = 'inventado';
  assert.doesNotThrow(() => m.pintarPlaca(0), 'un papel desconocido no lanza: sin pastilla');
  assert.doesNotMatch(a.placa.innerHTML, /estado-pill/);
});

test('estadoVisible informa cuantas barras muestran su papel y si algo de ellas quedo cortado o desbordado (un nombre largo, una pastilla que no cabe)', () => {
  const anterior = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ opacity: '0' });
  try {
    const m = mesaFalsa();
    m.cabecera.sub['.tit'] = Object.assign(nodo(), { scrollWidth: 300, clientWidth: 300 });
    // cada barra: su pastilla (o no), su nombre y la barra de adentro (.placa)
    const barra = (s, { pastilla = true, brilla = false, nombre = [100, 100], ancho = [890, 890] } = {}) => {
      const sub = { '.estado-pill': pastilla ? nodo() : null, '.estado-pill.ahora': brilla ? nodo() : null, '.nom': Object.assign(nodo(), { scrollWidth: nombre[0], clientWidth: nombre[1] }), '.placa': Object.assign(nodo(), { scrollWidth: ancho[0], clientWidth: ancho[1] }) };
      m.asientos[s].placa.querySelector = (sel) => sub[sel] ?? null;
    };
    barra(0); barra(1);
    assert.deepEqual([m.estadoVisible().papeles, m.estadoVisible().brillos, m.estadoVisible().nombreCortado, m.estadoVisible().barraDesbordada], [2, 0, false, false]);
    barra(1, { brilla: true });
    assert.equal(m.estadoVisible().brillos, 1, 'una pastilla brillando se cuenta: al empezar una ronda no deberia haber ninguna');
    barra(1);
    barra(0, { pastilla: false });
    assert.equal(m.estadoVisible().papeles, 1, 'una barra sin pastilla no cuenta');
    barra(0); barra(1, { nombre: [210, 150] });
    assert.equal(m.estadoVisible().nombreCortado, true, 'el nombre es mas ancho que su lugar: termina en puntos suspensivos');
    barra(1); barra(0, { ancho: [600, 560] });
    assert.equal(m.estadoVisible().barraDesbordada, true, 'lo que hay adentro (avatar, nombre, pastilla, fichas) no cabe en la barra');
  } finally { if (anterior === undefined) delete globalThis.getComputedStyle; else globalThis.getComputedStyle = anterior; }
});

test('estadoVisible informa si el titulo de la cabecera quedo cortado (en vertical, «RONDA 18 / 18 · DOBLE ×2» le quitaba lugar a «MAYOR O MENOR»)', () => {
  const anterior = globalThis.getComputedStyle;
  globalThis.getComputedStyle = () => ({ opacity: '0' });
  try {
    const m = mesaFalsa();
    m.cabecera.sub['.tit'] = Object.assign(nodo(), { scrollWidth: 340, clientWidth: 340 });
    assert.equal(m.estadoVisible().tituloCortado, false, 'cabe entero');
    m.cabecera.sub['.tit'] = Object.assign(nodo(), { scrollWidth: 340, clientWidth: 260 });
    assert.equal(m.estadoVisible().tituloCortado, true, 'el texto es mas ancho que su caja: se corta con puntos suspensivos');
  } finally { if (anterior === undefined) delete globalThis.getComputedStyle; else globalThis.getComputedStyle = anterior; }
});

test('terminar (el final de la partida) tambien retira las cartas de la ultima ronda y no deja nada de la apuesta ni los papeles de la ronda 18 («Predictor · apuesta», «Activo · juega una carta») ni la carta dorada de la tira', async () => {
  await conDom(async () => {
    const m = mesaFalsa();
    aVista(m);
    m.pintadas = [];
    m.pintarPlaca = (s) => { m.pintadas.push(['placa', s, m.asientos[s].rol]); };
    m.pintarTira = (s) => { m.pintadas.push(['tira', s, m.asientos[s].ahora]); };
    m.asientos[0].rol = 'predictor'; m.asientos[1].rol = 'activo';
    m.asientos[1].turno = true; m.asientos[1].ahora = 8; m.asientos[0].actua = true;
    m.cabecera.sub['.mano'] = nodo();
    m.asientos.forEach((a) => { a.placa.sub['.medalla'] = nodo(); });
    await m.terminar({ pasos: [{ final: { ganador: 1, empate: false } }] });
    assert.equal(m.cabecera.sub['.mano'].textContent, 'Final');
    assert.equal(m.visibles.size, 0);
    assert.equal(m.ranuraCrupier.innerHTML, '');
    assert.equal(m.ranuraJugada.innerHTML, '');
    assert.equal(m.asientos[1].placa.hijos.length, 1, 'la medalla del ganador');
    assert.ok(m.asientos.every((a) => a.rol === '' && a.ahora === null && a.turno === false && a.reemplazo === false && a.actua === false), 'ningun papel, brillo ni carta marcada en el final');
    assert.deepEqual(m.pintadas.filter((x) => x[0] === 'placa').map((x) => x[2]), ['', ''], 'las placas se repintan sin papel');
    assert.deepEqual(m.pintadas.filter((x) => x[0] === 'tira').map((x) => x[2]), [null, null]);
  });
});
