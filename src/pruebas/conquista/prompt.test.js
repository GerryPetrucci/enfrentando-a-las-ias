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
  for (const campo of ['presentacion', 'guiaDelEstado', 'explicacionDeRespuesta', 'erroresFrecuentes']) assert.match(conquista[campo], ASCII, campo);
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
  assert.match(conquista.reglas, /En una region tuya SIEMPRE debe quedar al menos 1 unidad/);
  assert.match(conquista.reglas, /"todo"/);
  assert.match(conquista.reglas, /nunca de otro reino/);
});

test('el prompt escribe las reglas de alianzas que el motor aplica (etapa 4): visitas, capital cerrada, defensa conjunta, atacar en sitio, hostiles al terminar el pacto y tierra ajena', () => {
  const r = conquista.reglas;
  assert.match(r, /entras de visita \(no se puede entrar en su capital\)/);
  assert.match(r, /entran de visita en las regiones del otro \(no en su capital\)/);
  assert.match(r, /tus tropas defienden junto con las del dueno, con su fortaleza y su terreno \(si eres aliado de los dos bandos no participas\)/);
  assert.match(r, /Dos aliados que atacan la misma region pelean juntos y se queda con ella quien conserve mas unidades/);
  assert.match(r, /- atacar REGION \[TIPO N \.\.\. \| todo\]/);
  assert.match(r, /las tropas de visita quedan donde estaban y son hostiles: pueden quedarse sin pelear, irse \(mover\) o atacar \(atacar REGION\)/);
  assert.match(r, /- romper REINO[\s\S]*Terminas ahora el pacto que tienes con ese reino\. Pierdes 3 de Honor\. No te obliga a atacar/);
  assert.match(r, new RegExp(`TIERRA AJENA: x${TIERRA_AJENA} para quien pelea en una region cuyo dueno es OTRO reino sin pacto con el`), 'el numero sale de constantes.js');
  assert.match(r, /en los ultimos 2 turnos los pactos terminan y las tropas de visita pasan a hostiles/);
});

test('el prompt escribe la regla de suministro que el motor aplica (etapa 5): regiones aisladas', () => {
  const r = conquista.reglas;
  assert.match(r, /AISLAMIENTO: una region tuya queda AISLADA si no hay camino hasta tu capital pasando solo por regiones tuyas, libres o de un aliado con pacto/);
  assert.match(r, /no produce, no cuenta para la cosecha base y en ella no se recluta, fortifica ni construye; sus unidades siguen comiendo/);
});

test('el prompt escribe las reglas del paquete de equilibrio (etapas 6 y 8): Hegemon y eventos, con los numeros de constantes.js; ya no hay Reconquista ni Patria', () => {
  const r = conquista.reglas;
  assert.match(r, /HEGEMON: el reino con mas regiones, cuando tiene al menos el 35% de las regiones con dueno y es el unico en la punta; lo deja de ser si baja del 30%/);
  assert.match(r, /Los demas lo atacan con \+50% de fuerza/);
  assert.ok(!/Reconquista|Patria/.test(r), 'se midieron y se quitaron');
  assert.match(r, /EVENTOS: en los turnos 5, 9, 13, 17, 21, 25 ocurre uno para todos, anunciado un turno antes \(Presagio\)/);
  assert.match(r, /Sequia: la cosecha base \(la de 1 Comida por 2 regiones\) baja a la mitad 2 turnos/);
  assert.match(r, /Peste: el reino con mas unidades pierde el 15%/);
  assert.match(r, /Cosecha: \+1 Comida por cada region tuya no aislada, ese turno/);
  assert.match(r, /Caravana: el reino con menos regiones recibe 6 Oro \+ 3 Caballos/);
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
