// Las dos espadas reales que chocan sobre el territorio disputado en el zoom de una batalla de Guerra de territorios (web/casino/espadas.js). Funciones puras: los cuadros de cada animacion y el momento de
// cada choque (para que el sonido de espadas caiga justo en el golpe). Lo que se corrige: la animacion TERMINA en la misma pose y en el mismo lugar donde la dibuja el CSS en reposo, asi que no hay un salto al
// ultimo cuadro (antes la imagen se movia de donde se agitaban las espadas porque el `translate(-50%,-50%)` solo estaba en los cuadros y se perdia al terminar).
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ESPADAS, RUTA_ESPADA, cuadrosDeEspada, cuadrosDeChispa, cuadrosDeEspadas, htmlDeEspadas } from '../../../web/casino/espadas.js';

test('el ritmo: cuatro vueltas de 650 ms, con el golpe a mitad de cada una; el sonido de la batalla NO va al compas de las espadas (es un paisaje aparte: ver sonido.test.js)', () => {
  assert.deepEqual([ESPADAS.cicloMs, ESPADAS.vueltas], [650, 4]);
  assert.ok(ESPADAS.golpe > 0.3 && ESPADAS.golpe < 0.7, 'el golpe cae a mitad de la vuelta');
  assert.equal(Object.keys(ESPADAS).sort().join(), 'cicloMs,golpe,vueltas');
});

test('cada espada termina donde empieza: su primer y su ultimo cuadro son el reposo (sin transformacion) y el golpe es el reposo cruzado, para que no haya salto al ultimo cuadro', () => {
  for (const lado of [-1, 1]) {
    const c = cuadrosDeEspada(lado);
    assert.equal(c[0].transform, 'none', 'empieza en el reposo');
    assert.equal(c.at(-1).transform, 'none', 'termina en el reposo: el mismo lugar que el CSS');
    assert.ok(c.every((x, i) => i === 0 || x.offset > c[i - 1].offset), 'offsets crecientes');
    assert.equal(c[0].offset, 0); assert.equal(c.at(-1).offset, 1);
    const golpe = c.find((x) => x.offset === ESPADAS.golpe);
    assert.equal(golpe?.transform, 'none', 'en el golpe las dos espadas estan cruzadas en el centro (el reposo)');
    const atras = c.find((x) => x.offset < ESPADAS.golpe && x.transform !== 'none');
    assert.match(atras.transform, new RegExp(`translate\\(${lado * 34}%`), 'antes del golpe se echa hacia su lado para tomar vuelo');
    assert.match(atras.transform, new RegExp(`rotate\\(${lado * 30}deg\\)`), 'y se inclina hacia afuera');
  }
  const [izq, der] = [cuadrosDeEspada(-1), cuadrosDeEspada(1)];
  assert.deepEqual(izq.map((x) => x.offset), der.map((x) => x.offset), 'las dos van al mismo compas');
});

test('la chispa del choque aparece justo despues del golpe y termina invisible (como en reposo); el conjunto solo anima la opacidad: nunca su transform, que es el que lo centra', () => {
  const ch = cuadrosDeChispa();
  assert.equal(ch[0].opacity, 0); assert.equal(ch.at(-1).opacity, 0);
  const pico = ch.reduce((m, x) => (x.opacity > m.opacity ? x : m));
  assert.equal(pico.opacity, 1);
  assert.ok(pico.offset >= ESPADAS.golpe && pico.offset <= ESPADAS.golpe + 0.05, 'el destello es en el golpe');
  const todo = cuadrosDeEspadas();
  assert.equal(todo[0].opacity, 0); assert.equal(todo.at(-1).opacity, 0, 'se apaga al final');
  for (const f of todo) assert.ok(!('transform' in f), 'el contenedor no anima transform: asi no cambia de lugar al terminar');
  assert.ok(todo.some((f) => f.opacity === 1 && f.offset < 0.2) && todo.some((f) => f.opacity === 1 && f.offset > 0.8), 'se ve casi todo el tiempo');
});

test('el HTML son dos espadas del PNG real de la hoja (la derecha en espejo) y la chispa; cada una dentro de su envoltorio, que es el que se anima', () => {
  assert.equal(RUTA_ESPADA, 'arte/conquista/espada.png');
  const h = htmlDeEspadas();
  assert.equal((h.match(new RegExp(RUTA_ESPADA.replace('.', '\\.'), 'g')) ?? []).length, 2);
  assert.match(h, /class="par izq"/); assert.match(h, /class="par der"/); assert.match(h, /class="espada espejo"/); assert.match(h, /class="chispa"/);
  assert.doesNotMatch(h, /<svg/i, 'ya no son dos rayas dibujadas con SVG');
});

test('el CSS deja el conjunto centrado en su punto desde el reposo (translate(-50%,-50%) en la hoja de estilos) y no usa las rayas SVG de antes', () => {
  const css = readFileSync(new URL('../../../web/casino/mesa-conquista.css', import.meta.url), 'utf8');
  const regla = /\.mesa-conquista \.destello-conq \{[^}]*\}/.exec(css)?.[0] ?? '';
  assert.match(regla, /transform:\s*translate\(-50%,\s*-50%\)/, 'centrado en reposo');
  assert.match(css, /\.destello-conq \.par/, 'estilo de cada espada');
  assert.doesNotMatch(css, /\.destello-conq svg/, 'sin el SVG de antes');
  const js = readFileSync(new URL('../../../web/casino/mesa-conquista.js', import.meta.url), 'utf8');
  assert.doesNotMatch(js, /<svg viewBox="0 0 80 80"/, 'las espadas ya no se dibujan con un SVG');
  // el sonido: el zoom de la batalla lanza el paisaje con lo que dura; la Maravilla suena cada turno de obra y al quedar construida; las espadas dibujadas no disparan sonido propio
  assert.match(js, /this\.sfx\.batalla\(/, 'el zoom de una disputa lanza el paisaje de guerra');
  assert.match(js, /sonidoDeMaravilla\(/);
  assert.match(js, /this\.sfx\.obra\(\)/); assert.match(js, /this\.sfx\.construida\(\)/);
  assert.doesNotMatch(js, /this\.sfx\.maravilla\(\)|this\.sfx\.choque|momentosDeChoque/, 'el diseno anterior de sonido ya no esta');
  assert.doesNotMatch(js, /this\.sonar\(t\.bandos/, 'la batalla no suena por su paso: suena el paisaje');
});
