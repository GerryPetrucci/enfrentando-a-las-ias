import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevoEstado, estadoPeorCaso, tokensDelPrompt, TOPE_TOKENS_ENTRADA } from './ayudas.js';
import { construirSistema, construirUsuario } from '../../prompt.js';
import conquista from '../../juegos/conquista.js';
import dilema from '../../juegos/dilema.js';
import { obtenerJuego, JUEGOS } from '../../juegos/index.js';
import { vistaTexto } from '../../juegos/conquista/vista.js';
import { BIOMAS } from '../../mapa.js';
import { TIERRA_AJENA } from '../../juegos/conquista/constantes.js';

const ASCII = /^[\x00-\x7F]*$/;

test('el texto de reglas, el formato y la vista de un estado nuevo no tienen acentos ni caracteres no ASCII', () => {
  assert.match(conquista.reglas, ASCII);
  assert.match(conquista.formatoRespuesta, ASCII);
  assert.match(vistaTexto(nuevoEstado(4), 0), ASCII);
});

test('el prompt completo de 5 reinos en el peor caso cabe en el tope de tokens de Claude (caracteres / 1.97)', () => {
  const tokens = tokensDelPrompt(estadoPeorCaso());
  assert.ok(tokens <= TOPE_TOKENS_ENTRADA, `el prompt mide ${tokens} tokens y el tope aprobado es ${TOPE_TOKENS_ENTRADA}: hay que recortar texto de las reglas; subir el tope requiere aprobacion expresa (CLAUDE.md)`);
});

test('el peor caso de 5 reinos cabe en el tope con los cuatro biomas y 100 seeds (el arido, con su tierra compacta, tiene mas vecinas por region)', () => {
  for (const bioma of BIOMAS) {
    let peor = 0, peorSeed = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const tokens = tokensDelPrompt(estadoPeorCaso(seed, bioma));
      if (tokens > peor) { peor = tokens; peorSeed = seed; }
    }
    assert.ok(peor <= TOPE_TOKENS_ENTRADA, `${bioma}: el peor caso mide ${peor} tokens (seed ${peorSeed}) y el tope aprobado es ${TOPE_TOKENS_ENTRADA}: afinar el bioma; subir el tope requiere aprobacion expresa`);
  }
});

test('el prompt escribe las reglas de movimiento que el motor aplica: quedar 1 tropa, la palabra todo y no cruzar territorio de otro reino', () => {
  // 22 de octubre de 2026: el 78 % de las ordenes descartadas de la partida publicada (112 de 144) eran "debe quedar al menos 1 tropa", una regla que el motor aplicaba y el prompt no decia.
  assert.match(conquista.reglas, /En tu region debe quedar 1 unidad/);
  assert.match(conquista.reglas, /"todo"/);
  assert.match(conquista.reglas, /nunca de otro reino/);
});

test('el prompt escribe las reglas de alianzas que el motor aplica (etapa 4): visitas, capital cerrada, defensa conjunta, atacar en sitio, hostiles al terminar el pacto y tierra ajena', () => {
  const r = conquista.reglas;
  assert.match(r, /entras de visita/);
  assert.match(r, /\(no su capital\), entras de visita/);
  assert.match(r, /tropas de visita en regiones de tu aliado \(no en su capital\)/);
  assert.match(r, /tus tropas defienden con las del dueno, con su fortaleza y terreno/);
  assert.match(r, /si eres aliado de los dos bandos no participas/);
  assert.match(r, /Dos aliados que atacan la misma region pelean juntos y se queda con ella quien conserve mas unidades/);
  assert.match(r, /- atacar REGION \[TIPO N \.\.\. \| todo\]/);
  assert.match(r, /las tropas de visita son hostiles: pueden quedarse sin pelear, irse \(mover\) o atacar \(atacar REGION\)/);
  assert.match(r, /romper REINO: terminas tu pacto con ese reino\. No te obliga a atacar/);
  assert.match(r, new RegExp(`rinde x${TIERRA_AJENA} \\(tierra ajena\\)`), 'el numero sale de constantes.js');
  assert.match(r, /En los ultimos 2 turnos no hay alianzas \(tus tropas de visita pasan a hostiles\)/);
});

test('el prompt escribe la regla de suministro que el motor aplica (etapa 5): regiones aisladas', () => {
  const r = conquista.reglas;
  assert.match(r, /AISLAMIENTO: una region tuya sin camino a tu capital \(por regiones tuyas, libres o de un aliado con pacto\) esta aislada/);
  assert.match(r, /no produce, no cuenta para la cosecha base y ahi no se recluta, fortifica ni construye; sus unidades siguen comiendo/);
});

test('el prompt escribe las reglas del paquete de equilibrio (etapa 6): Hegemon, Reconquista, Patria y eventos, con los numeros de constantes.js', () => {
  const r = conquista.reglas;
  assert.match(r, /EQUILIBRIO: el Hegemon \(el reino con mas regiones, desde el 35% de las regiones con dueno hasta que baje del 30%\) recibe el ataque de los demas con \+25%/);
  assert.match(r, /Reconquista: durante 3 turnos, quien perdio una region la ataca con \+25%/);
  assert.match(r, /Patria: con 2 regiones o menos, tus regiones defienden con \+25%/);
  assert.match(r, /EVENTOS para todos en los turnos 5, 9, 13, 17, 21 y 25, anunciados un turno antes \(Presagio\): Sequia \(cosecha base a la mitad 2 turnos\), Peste \(el reino con mas unidades pierde 15%\), Cosecha \(\+1 Comida por region\) o Caravana \(el reino con menos regiones recibe 6 Oro \+ 3 Caballos\)/);
});

test('construirUsuario no cambia para el Dilema (vista como objeto) y acepta una vista en texto', () => {
  const vista = { ronda: 1, rondasTotales: 10 };
  assert.equal(construirUsuario(vista), `Estado actual de la partida:\n\n${JSON.stringify(vista, null, 2)}\n\nTu turno. Responde solo con el JSON.`);
  assert.equal(construirUsuario('hola'), 'Estado actual de la partida:\n\nhola\n\nTu turno. Responde solo con el JSON.');
  assert.ok(construirSistema(dilema).includes(dilema.reglas));
});

test('el juego esta registrado junto al Dilema', () => {
  assert.equal(obtenerJuego('conquista'), conquista);
  assert.ok(Object.keys(JUEGOS).includes('dilema'));
});
