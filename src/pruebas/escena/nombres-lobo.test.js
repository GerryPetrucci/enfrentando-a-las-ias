// Como se nombra a cada jugador de Lobo en la voz y en los subtitulos (decidido por el usuario el 25 de octubre de 2026): con 8 modelos distintos solo el nombre del modelo
// («Grok»); si un modelo ocupa varios asientos, una letra por orden de asiento («Grok A», «Grok B», «Grok C»); el numero de asiento nunca se dice, ni siquiera cuando un modelo
// cita a otro en su mensaje («asiento 5» se vuelve el nombre de ese jugador). El hecho visible (`lineas`) si lleva el numero en pantalla: desde 1, sin cero a la izquierda.
//
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { jugarLobo } from './ayudas-lobo.js';
import { nombresDeEscena, etiquetaAsiento, traducirAsientos } from '../../../web/casino/lobo-nombres.js';
import { construirLineaDeTiempo } from '../../../web/casino/linea-de-tiempo-lobo.js';

const OCHO = ['Grok', 'Qwen', 'Mistral', 'MiniMax', 'GLM', 'Kimi', 'Phi-4', 'DeepSeek'];
const conNombres = (partida, nombres) => ({ ...partida, jugadores: partida.jugadores.map((j, i) => ({ ...j, nombre: nombres[i] })) });
const dicho = (beats) => beats.flatMap((b) => b.dicho.map((l) => l.texto)).join('\n');
// Lo que dice el narrador sin el digito del nombre «Phi-4» (el unico numero legitimo).
const propio = (texto) => texto.replaceAll('Phi-4', 'Phi');

test('nombresDeEscena: 8 modelos distintos conservan su nombre; el que se repite lleva letra por orden de asiento', () => {
  assert.deepEqual(nombresDeEscena(OCHO), OCHO);
  assert.deepEqual(nombresDeEscena(['Grok', 'Qwen', 'Grok', 'Qwen', 'Kimi', 'Kimi', 'GLM', 'Phi-4']), ['Grok A', 'Qwen A', 'Grok B', 'Qwen B', 'Kimi A', 'Kimi B', 'GLM', 'Phi-4']);
  assert.deepEqual(nombresDeEscena(['Grok', 'Qwen', 'Kimi', 'Grok', 'Qwen', 'Kimi', 'Grok', 'Qwen', 'Kimi', 'GLM', 'Phi-4', 'Mistral']).slice(0, 9), ['Grok A', 'Qwen A', 'Kimi A', 'Grok B', 'Qwen B', 'Kimi B', 'Grok C', 'Qwen C', 'Kimi C']);
});

test('nombresDeEscena: ya con letras no cambia, es estable y nunca lanza con datos raros', () => {
  const con = ['Claude A', 'GPT A', 'Claude B', 'GPT B'];
  assert.deepEqual(nombresDeEscena(con), con);
  assert.deepEqual(nombresDeEscena(nombresDeEscena(['Grok', 'Grok', 'Qwen'])), ['Grok A', 'Grok B', 'Qwen']);
  assert.deepEqual(nombresDeEscena(['Grok', ' Grok ']), ['Grok A', 'Grok B'], 'los espacios sobrantes no distinguen a un modelo de otro');
  assert.deepEqual(nombresDeEscena([undefined, null, '', 7]), ['Jugador A', 'Jugador B', 'Jugador C', 'Jugador D']);
  assert.deepEqual(nombresDeEscena(undefined), []);
  assert.deepEqual(nombresDeEscena(Array(30).fill('X')).slice(24, 28), ['X Y', 'X Z', 'X 27', 'X 28'], 'pasada la Z sigue con numeros en lugar de fallar');
});

test('el numero de asiento se escribe desde 1 y sin cero a la izquierda', () => {
  assert.deepEqual([0, 1, 5, 11].map(etiquetaAsiento), ['1', '2', '6', '12']);
});

test('traducirAsientos: el asiento que cita un modelo (desde 0, como dice el prompt) se vuelve el nombre de ese jugador', () => {
  const nombre = (i) => OCHO[i];
  const t = (x) => traducirAsientos(x, nombre, 8);
  assert.equal(t('Sospecho del asiento 6, es lobo.'), 'Sospecho de Phi-4, es lobo.');
  assert.equal(t('El asiento 0 votó raro.'), 'Grok votó raro.');
  assert.equal(t('Voto por el jugador 3 y por #5.'), 'Voto por MiniMax y por Kimi.');
  assert.equal(t('Fui al asiento 2'), 'Fui a Mistral', 'sin articulo ni punto');
  assert.equal(t('Los asientos 1 y 4 se cubren; asientos 2, 5 o 7 también.'), 'Qwen y GLM se cubren; Mistral, Kimi o DeepSeek también.');
  assert.equal(t('SEAT 3 y Player 4'), 'MiniMax y GLM');
  assert.equal(t('Hay 3 lobos y la ronda 2 termina; ya van 4 votos.'), 'Hay 3 lobos y la ronda 2 termina; ya van 4 votos.', 'un numero suelto no es un asiento');
  assert.equal(t('Sospecho del asiento 9 y del jugador 12.'), 'Sospecho de otro jugador y de otro jugador.', 'un numero que no es de la mesa no se deja salir');
  // las citas reales de los modelos casi nunca llevan la palabra «asiento»: «al 0», «(1)», «Lobo 4», «entre 3,6,7», «acertó con 4»
  assert.equal(t('Ronda 2. Mistral se declaró vidente e inspeccionó al 0 como aldeano, pero necesitamos verificar.'), 'Ronda 2. Mistral se declaró vidente e inspeccionó a Grok como aldeano, pero necesitamos verificar.');
  assert.equal(t('Día 2. Ayer expulsamos a un aldeano (1), sin muertes en la noche otra vez.'), 'Día 2. Ayer expulsamos a un aldeano (Qwen), sin muertes en la noche otra vez.');
  assert.equal(t('Ronda 3. Lobo 4 eliminado por veneno, excelente bruja. Queda 1 lobo entre 3,6,7. El vidente real acertó con 4.'), 'Ronda 3. Lobo GLM eliminado por veneno, excelente bruja. Queda 1 lobo entre MiniMax, Phi-4, DeepSeek. El vidente real acertó con GLM.');
  assert.equal(t('La muerte de 2 confirma que era la vidente real: acertó al señalar a 4 como lobo y su inspección de 0 fue negativa.'), 'La muerte de Mistral confirma que era la vidente real: acertó al señalar a GLM como lobo y su inspección de Grok fue negativa.');
  assert.equal(t('Mi voto es para el 3, no para el 5. Sospecho de 7 y de 2.'), 'Mi voto es para MiniMax, no para Kimi. Sospecho de DeepSeek y de Mistral.');
  assert.equal(t('Entre 1, 4 y 6 hay un lobo.'), 'Entre Qwen, GLM y Phi-4 hay un lobo.', 'una lista sigue la cita del primero');
  assert.equal(t('Kimi es Cupido y su pareja es 0-5, por lo que Grok está a salvo.'), 'Kimi es Cupido y su pareja es Grok y Kimi, por lo que Grok está a salvo.');
  assert.equal(t('Los enamorados 2 y 6 están unidos; propongo presionar al 2: si es vidente, que hable.'), 'Los enamorados Mistral y Phi-4 están unidos; propongo presionar a Mistral: si es vidente, que hable.');
  // sujetos sueltos, como los escriben de verdad (sin preposicion ni palabra de asiento)
  assert.equal(t('Ayer 3 votó a Phi-4 y DeepSeek votó a MiniMax, mientras 6 se sumó. Compararemos 3 y 7 hoy.'), 'Ayer MiniMax votó a Phi-4 y DeepSeek votó a MiniMax, mientras Phi-4 se sumó. Compararemos MiniMax y DeepSeek hoy.');
  assert.equal(t('MiniMax votó inconsistente (a 0 y a 6). Ver (3). 1) uno.'), 'MiniMax votó inconsistente (a Grok y a Phi-4). Ver (MiniMax). 1) uno.', 'un parentesis que cierra la cita no la vuelve una enumeración');
  assert.equal(t('Sus pares son 0-5 y 1-2.'), 'Sus pares son Grok y Kimi y Qwen y Mistral.', 'un par escrito con guion');
  // lo que NO es un asiento se queda como esta
  assert.equal(t('Entre 3 y 5 votos decidimos.'), 'Entre 3 y 5 votos decidimos.', 'una cuenta con «entre» no es una pareja');
  assert.equal(t('Quedan 3, 4 y 5 vivos, ronda 1-3, resultado 2-1 en votos.'), 'Quedan 3, 4 y 5 vivos, ronda 1-3, resultado 2-1 en votos.', 'las listas de cuentas y los marcadores tampoco');
  for (const intacto of ['Hay 3 lobos y quedan 2 votos; en 2 rondas termina.', 'Ronda 5, día 2, noche 3.', 'Somos 5 vivos; quedamos 3.', 'Gana con 50% o 2.5 puntos, a las 10:30; Phi-4 y GLM-5.', '1) Grok 2) Qwen 3) Kimi', 'Votos: 3 a favor, 4 en contra. Votemos por el 9.']) assert.equal(t(intacto), intacto, intacto);
  assert.equal(t(''), '');
  assert.equal(t(undefined), '');
  assert.equal(traducirAsientos('asiento 1 y asiento 2', (i) => `Grok ${'AB'[i]}`, 2), 'Grok B y otro jugador');
});

// Un dia de la partida con un solo mensaje (el primero, que el narrador siempre cita): asi el texto de la prueba es el unico que se lee.
function diaConUnMensaje(partida, mensaje, extra = {}) {
  const registro = partida.rondas.findIndex((r) => r.fase === 'dia'), eventos = partida.rondas[registro].publico.eventos.filter((e) => e.tipo === 'mensaje');
  eventos.forEach((e) => { e.mensaje = ''; });
  Object.assign(eventos[0], { mensaje, ...extra });
  return { registro, evento: eventos[0] };
}

test('lo que un modelo cita en su mensaje se traduce a nombres: voz, subtitulos y tarjeta nunca dicen «asiento N»', () => {
  const partida = conNombres(jugarLobo(3, 8), OCHO);
  const { registro, evento } = diaConUnMensaje(partida, 'Detecté lobo en el asiento 6 y descarto al jugador 1.');
  const beats = construirLineaDeTiempo(partida).filter((b) => b.tipo === 'mensaje' && b.registro === registro && b.asiento === evento.asiento);
  assert.equal(beats.length, 1);
  assert.equal(beats[0].pasos[1].mensaje, 'Detecté lobo en Phi-4 y descarto a Qwen.');
  assert.equal(beats[0].texto, `${OCHO[evento.asiento]} dice: «Detecté lobo en Phi-4 y descarto a Qwen.»`);
  for (const b of construirLineaDeTiempo(partida).filter((b) => b.tipo === 'mensaje')) assert.doesNotMatch(propio(b.texto), /asiento \d|jugador \d|#\d/i, b.texto);
});

test('un mensaje de varias tarjetas dice «X dice» una sola vez: las que lo continúan se leen sin repetir el nombre', () => {
  const partida = conNombres(jugarLobo(3, 8), OCHO);
  const { registro, evento } = diaConUnMensaje(partida, 'Mi plan es simple: voto por quien más cambió de opinión esta ronda, porque quien duda tanto suele esconder algo y la aldea no puede permitirse perder otra ronda. '.repeat(2).trim());
  const tarjetas = construirLineaDeTiempo(partida).filter((b) => b.tipo === 'mensaje' && b.registro === registro && b.asiento === evento.asiento);
  assert.ok(tarjetas.length >= 3, `${tarjetas.length} tarjetas`);
  assert.deepEqual(tarjetas.map((b) => b.pasos[1].parte), tarjetas.map((_, i) => i + 1));
  assert.match(tarjetas[0].texto, new RegExp(`^${OCHO[evento.asiento]} dice: «`));
  for (const b of tarjetas.slice(1)) {
    assert.doesNotMatch(b.texto, /dice|Grok|Qwen|Mistral|MiniMax|GLM|Kimi|DeepSeek/, `la continuación no lleva el nombre: ${b.texto}`);
    assert.match(b.texto, /^«.+»$/);
    assert.ok(b.lineas[0].texto.startsWith(`${OCHO[evento.asiento]} · ${evento.asiento + 1} dice:`), 'el hecho visible sí conserva quién habla');
  }
  assert.equal(tarjetas.map((b) => b.pasos[1].mensaje).join(' '), evento.mensaje);
});

test('la declaración de rol de un mensaje largo se dice al terminar de leerlo, no entre dos de sus tarjetas', () => {
  const partida = conNombres(jugarLobo(3, 8), OCHO);
  const { registro, evento } = diaConUnMensaje(partida, 'Soy la vidente y vengo a decirlo todo: la primera noche miré a alguien, la segunda a otro, y ninguno de los dos me convenció de nada, así que voten con cuidado hoy.', { afirmaRol: 'vidente' });
  const tarjetas = construirLineaDeTiempo(partida).filter((b) => b.tipo === 'mensaje' && b.registro === registro && b.asiento === evento.asiento);
  assert.ok(tarjetas.length >= 2);
  const frase = `${OCHO[evento.asiento]} afirma ser Vidente.`;
  tarjetas.slice(0, -1).forEach((b) => assert.ok(!b.texto.includes('afirma ser'), `no se interrumpe el mensaje: ${b.texto}`));
  assert.ok(tarjetas.at(-1).texto.endsWith(frase), tarjetas.at(-1).texto);
  assert.equal(tarjetas.filter((b) => b.texto.includes('afirma ser')).length, 1, 'se dice una sola vez');
  assert.equal(tarjetas[0].pasos[1].afirmaRol, 'vidente', 'la escena sí marca la declaración desde la primera tarjeta');
});

test('con 8 modelos distintos la voz y los subtitulos dicen solo el nombre: ningun numero de asiento ni separador', () => {
  const partida = conNombres(jugarLobo(3, 8, { declaraciones: true, modoCupido: 'ambos' }), OCHO); // 'ambos': Cupido y la pareja con nombre (los otros modos: cupido-oculto-lobo.test.js)
  const beats = construirLineaDeTiempo(partida);
  assert.ok(beats.length > 20);
  for (const b of beats.filter((b) => b.tipo !== 'mensaje')) {
    const voz = b.dicho.map((l) => l.texto).join(' ');
    assert.doesNotMatch(propio(voz), / · |\d/, `${b.tipo}: «${voz}»`);
    assert.equal(b.texto, voz, 'los subtitulos siguen exactamente a la voz');
  }
  const cupido = beats.find((b) => b.tipo === 'enamorados');
  assert.match(cupido.texto, /^(\p{L}[\p{L}\d-]*) se revela como Cupido\. Cupido une a \p{L}[\p{L}\d-]* y a \p{L}[\p{L}\d-]*: si uno cae, el otro cae con él\.$/u);
  // las citas de los modelos empiezan por su nombre, sin numero
  const citas = beats.filter((b) => b.tipo === 'mensaje' && b.dicho.some((l) => / dice: «/.test(l.texto)));
  assert.ok(citas.length > 0);
  for (const b of citas) assert.match(b.texto, new RegExp(`^(${OCHO.join('|').replace(/-/g, '\\-')}) dice: «`));
});

test('el hecho visible lleva el numero de asiento en pantalla (desde 1, sin cero a la izquierda) junto al nombre', () => {
  const partida = conNombres(jugarLobo(3, 8), OCHO);
  const beats = construirLineaDeTiempo(partida);
  const muertes = beats.filter((b) => b.tipo === 'muerte');
  assert.ok(muertes.length > 0);
  for (const b of muertes) assert.ok(b.lineas[0].texto.startsWith(`${OCHO[b.asiento]} · ${b.asiento + 1} `), b.lineas[0].texto);
  assert.ok(beats.every((b) => b.lineas.every((l) => !/ · 0\b/.test(l.texto))), 'ningun asiento se rotula con 0');
  assert.ok(beats.every((b) => b.lineas.every((l) => !/ · 0\d\b/.test(l.texto))), 'ninguna etiqueta lleva cero a la izquierda');
});

test('un modelo en varios asientos: la voz dice «Grok A», «Grok B»; y los pares y tercias de 8 y 12 jugadores quedan con letras distintas', () => {
  for (const [n, m] of [[8, 4], [12, 4], [12, 6]]) {
    const modelos = ['Grok', 'Qwen', 'Kimi', 'GLM', 'Mistral', 'Phi-4'].slice(0, m);
    const nombres = Array.from({ length: n }, (_, i) => modelos[i % m]);
    const partida = conNombres(jugarLobo(3, n), nombres);
    const unicos = nombresDeEscena(nombres);
    assert.equal(new Set(unicos).size, n, 'cada asiento queda con un nombre distinto');
    const beats = construirLineaDeTiempo(partida);
    const voz = dicho(beats);
    assert.match(voz, /\b(Grok|Qwen|Kimi|GLM|Mistral|Phi-4) [A-C]\b/);
    assert.doesNotMatch(propio(voz), / · |asiento \d|\d/i);
    for (const b of beats.filter((b) => Number.isInteger(b.asiento) && b.tipo === 'muerte')) assert.ok(b.lineas[0].texto.startsWith(`${unicos[b.asiento]} · ${b.asiento + 1} `), b.lineas[0].texto);
  }
});

test('construir la linea de tiempo no cambia la partida ni lee mas datos que antes', () => {
  const partida = conNombres(jugarLobo(3, 8), OCHO), copia = structuredClone(partida);
  construirLineaDeTiempo(partida);
  assert.deepEqual(partida, copia);
});
