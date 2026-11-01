// Los estados de EJEMPLO del prompt (src/juegos/lobo/ejemplo-estado.js) tienen que seguir siendo lo que el motor produce hoy. Si cambia la vista (vista.js, turno.js...),
// esta prueba falla y hay que regenerarlos A PROPOSITO con herramientas/ejemplo-estado-lobo.mjs: el prompt es un contrato y su huella no se mueve sola.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESTADO_BRUJA, ESTADO_DIA, EVENTOS, CAMPOS_DE_ROL } from '../../juegos/lobo/ejemplo-estado.js';
import { fragmentosDeEjemplo } from '../../../herramientas/ejemplo-estado-lobo.mjs';

test('los estados de ejemplo del prompt son los que genera el motor hoy (regenerar con herramientas/ejemplo-estado-lobo.mjs si cambia la vista)', () => {
  const f = fragmentosDeEjemplo();
  assert.equal(ESTADO_BRUJA, f.bruja);
  assert.equal(ESTADO_DIA, f.dia);
  assert.equal(EVENTOS, f.eventos);
  assert.equal(CAMPOS_DE_ROL, f.campos);
});

test('los ejemplos son JSON real, sin acentos, con textos neutros y con cada forma de evento que el prompt explica', () => {
  for (const texto of [ESTADO_BRUJA, ESTADO_DIA, EVENTOS, CAMPOS_DE_ROL]) assert.match(texto, /^[\x00-\x7F]*$/);
  for (const estado of [ESTADO_BRUJA, ESTADO_DIA]) assert.ok(Array.isArray(JSON.parse(estado).eventos));
  const eventos = EVENTOS.split('\n').map((l) => JSON.parse(l));
  assert.deepEqual([...new Set(eventos.map((e) => e.tipo))].sort(), ['amanecer', 'disparo', 'mensaje', 'muerte', 'votacion']);
  for (const causa of ['noche', 'veneno', 'voto', 'disparo', 'amor']) {
    // El ejemplo no incluye veneno (la bruja no actua en el guion), pero la guia lo explica con las cinco causas.
    if (causa !== 'veneno') assert.ok(eventos.some((e) => e.causa === causa), `falta una muerte por ${causa}`);
  }
  assert.ok(eventos.some((e) => e.comprobacion) && eventos.some((e) => e.pareja !== undefined) && eventos.some((e) => e.afirmaRol));
  assert.ok(!/lobo-masa|Mensaje de bot/.test(EVENTOS));
});
