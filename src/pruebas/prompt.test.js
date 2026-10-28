// El envoltorio comun del prompt de sistema (src/prompt.js). Tiene dos garantias:
//  1) un juego que NO usa los campos opcionales recibe EXACTAMENTE el texto de siempre (su huella no cambia: las partidas ya jugadas siguen comparables y publicables);
//  2) los campos opcionales (docs/guia-de-prompts.md) entran en su lugar y en su orden.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { construirSistema, construirUsuario } from '../prompt.js';
import { PARAMETROS } from '../parametros.js';
import { JUEGOS } from '../juegos/index.js';

const SIMPLE = { nombre: 'Juego de prueba', reglas: 'Regla uno.\nRegla dos.', formatoRespuesta: '{"jugada": "C o T"}' };

// El texto de siempre, escrito a mano: si alguien cambia el envoltorio de los juegos simples, esta prueba falla.
const TEXTO_DE_SIEMPRE = `Estas compitiendo en un torneo entre inteligencias artificiales. Tu objetivo es MAXIMIZAR TU PROPIO PUNTAJE.

=== REGLAS DEL JUEGO: Juego de prueba ===
Regla uno.
Regla dos.

=== COMO RESPONDER ===
Responde UNICAMENTE con un objeto JSON valido, sin texto antes ni despues, sin bloques de codigo.

Formato exacto:
{"jugada": "C o T"}

No expliques nada fuera del JSON. No uses markdown. Solo el JSON.`;

test('un juego sin campos opcionales recibe exactamente el prompt de siempre', () => {
  assert.equal(construirSistema(SIMPLE), TEXTO_DE_SIEMPRE);
});

test('los campos opcionales entran en su lugar: presentacion, guia del estado, explicacion de la respuesta, errores y aviso de espacio', () => {
  const completo = construirSistema({
    ...SIMPLE, presentacion: 'PRESENTACION', guiaDelEstado: 'GUIA', explicacionDeRespuesta: 'EXPLICACION', erroresFrecuentes: 'ERRORES', avisoDeEspacio: true,
  });
  const pos = (s) => completo.indexOf(s);
  const orden = ['Tu objetivo es MAXIMIZAR', 'PRESENTACION', '=== REGLAS DEL JUEGO: Juego de prueba ===', 'Regla dos.', '=== COMO LEER TU ESTADO ===', 'GUIA', '=== COMO RESPONDER ===', 'Ejemplo del formato', '{"jugada"', 'EXPLICACION', '=== ERRORES FRECUENTES ===', 'ERRORES', '=== ESPACIO PARA RESPONDER ===', 'No expliques nada fuera del JSON'];
  orden.forEach((s, i) => { assert.ok(pos(s) >= 0, `falta «${s}»`); if (i > 0) assert.ok(pos(s) > pos(orden[i - 1]), `«${s}» debe ir despues de «${orden[i - 1]}»`); });
  assert.match(completo, new RegExp(`unos ${PARAMETROS.maxTokens} tokens`), 'el aviso de espacio dice el tope REAL de tokens, no un numero escrito a mano');
  assert.ok(completo.endsWith('No expliques nada fuera del JSON. No uses markdown. Solo el JSON.'));
});

test('una explicacion de la respuesta cambia la etiqueta del ejemplo: es un FORMATO con valores inventados, no un formato exacto', () => {
  const con = construirSistema({ ...SIMPLE, explicacionDeRespuesta: 'EXPLICACION' });
  assert.match(con, /Ejemplo del formato \(los valores son inventados; no los copies\):/);
  assert.ok(!con.includes('Formato exacto:'));
});

test('los juegos registrados que no migraron a la guia siguen con el envoltorio de siempre (sus huellas no se mueven)', () => {
  for (const [id, juego] of Object.entries(JUEGOS)) {
    if (juego.guiaDelEstado || juego.explicacionDeRespuesta || juego.presentacion || juego.erroresFrecuentes || juego.avisoDeEspacio) continue; // ya migrado: tiene su propia prueba
    const esperado = `Estas compitiendo en un torneo entre inteligencias artificiales. Tu objetivo es MAXIMIZAR TU PROPIO PUNTAJE.\n\n=== REGLAS DEL JUEGO: ${juego.nombre} ===\n${juego.reglas}\n\n=== COMO RESPONDER ===\nResponde UNICAMENTE con un objeto JSON valido, sin texto antes ni despues, sin bloques de codigo.\n\nFormato exacto:\n${juego.formatoRespuesta}\n\nNo expliques nada fuera del JSON. No uses markdown. Solo el JSON.`;
    assert.equal(createHash('sha256').update(construirSistema(juego)).digest('hex'), createHash('sha256').update(esperado).digest('hex'), `${id}: cambio el prompt de sistema`);
  }
});

test('construirUsuario no cambia', () => {
  assert.equal(construirUsuario('ESTADO'), 'Estado actual de la partida:\n\nESTADO\n\nTu turno. Responde solo con el JSON.');
});
