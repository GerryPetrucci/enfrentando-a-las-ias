// El fragmento de estado de EJEMPLO del prompt (src/juegos/conquista/ejemplo-estado.js) tiene que seguir siendo lo que el motor produce hoy. Si cambia la vista
// (vista.js, frentes.js...), esta prueba falla y hay que regenerarlo A PROPOSITO: el prompt es un contrato y su huella no se mueve sola.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAGMENTO_DE_ESTADO } from '../../juegos/conquista/ejemplo-estado.js';
import { fragmentoDeEstado } from '../../../herramientas/ejemplo-estado-conquista.mjs';

test('el estado de ejemplo del prompt es el que genera el motor hoy (regenerar con herramientas/ejemplo-estado-conquista.mjs si cambia la vista)', () => {
  assert.equal(FRAGMENTO_DE_ESTADO, fragmentoDeEstado());
});

test('el estado de ejemplo no lleva acentos ni textos de bots, y trae cada tipo de linea que el prompt explica', () => {
  assert.match(FRAGMENTO_DE_ESTADO, /^[\x00-\x7F]*$/);
  assert.ok(!/lancero-masa|mixto-adaptativo|Voy por todo/.test(FRAGMENTO_DE_ESTADO), 'los textos de los bots se sustituyen por textos neutros');
  for (const linea of ['MAPA (', 'Turno ', 'Capitales:', 'Honor:', 'Maravilla:', 'Tu almacen (cierre del turno anterior):', 'Disponible al gastar (', 'Puedes reclutar hasta', 'Pactos vigentes:', 'Hegemon:', 'Evento de este turno:', 'Tu nota del turno anterior', 'Mensajes publicos:', 'OCUPACION (', 'FRENTES (', 'Sucedio el turno anterior:']) {
    assert.ok(FRAGMENTO_DE_ESTADO.includes(linea), `falta la linea «${linea}»`);
  }
});
