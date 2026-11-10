import test from 'node:test';
import assert from 'node:assert/strict';
import { extraerJson, esBorradorCompleto, separarBorrador } from '../../worldbox/era/respuestas/extraer-json.js';
import { interpretarNombre, claveDeLlamada } from '../../worldbox/era/respuestas/almacen.js';

const RESP = '{"actions":[{"action":"elegir_inicio","parameters":{"raza":"orc","mineral":"mineral_stone","bioma":"ninguno"}}],"reasoning_summary":"Frase de prueba."}';

test('parser: JSON limpio, con bloque ```json, con texto alrededor y con BOM/espacios invisibles', () => {
  for (const texto of [RESP, '```json\n' + RESP + '\n```', 'Claro, aquí va:\n\n```json\n' + RESP + '\n```\n\nEspero que sirva.', '﻿' + RESP, '​' + RESP + '​']) {
    const r = extraerJson(texto);
    assert.equal(r.ok, true, texto.slice(0, 30));
    assert.equal(r.valor.actions[0].action, 'elegir_inicio');
    assert.equal(JSON.parse(r.json).reasoning_summary, 'Frase de prueba.');
  }
  assert.ok(extraerJson('Claro, aquí va:\n```json\n' + RESP + '\n```').avisos.some(a => /texto fuera del JSON/.test(a)));
  assert.deepEqual(extraerJson(RESP).avisos, []);
});

test('parser: tolera comentarios, comas finales y comillas tipográficas, y lo avisa', () => {
  const conComentarios = '{\n // elegí enanos\n "actions": [ {"action":"elegir_inicio", /* x */ "parameters":{"raza":"dwarf","mineral":"mineral_gold","bioma":"ninguno",},}, ],\n "reasoning_summary": "Con // dentro de la cadena no se toca."\n}';
  const r = extraerJson(conComentarios);
  assert.equal(r.ok, true);
  assert.equal(r.valor.reasoning_summary, 'Con // dentro de la cadena no se toca.');
  assert.ok(r.avisos.some(a => /comentario/.test(a)) && r.avisos.some(a => /coma/.test(a)));
  const tipograficas = extraerJson(RESP.replace(/"/g, m => m).replace('"actions"', '“actions”').replace('"reasoning_summary"', '“reasoning_summary”'));
  assert.equal(tipograficas.ok, true);
  assert.ok(tipograficas.avisos.some(a => /tipográficas/.test(a)));
});

test('parser: varios bloques usa el último; las llaves dentro de cadenas no rompen el emparejado; una llave suelta en la prosa se ignora', () => {
  const otro = RESP.replace('orc', 'elf');
  const r = extraerJson(`Ejemplo (no lo uses): ${RESP}\n\nMi respuesta final {de verdad}:\n${otro}`);
  assert.equal(r.ok, true);
  assert.equal(r.valor.actions[0].parameters.raza, 'elf');
  assert.equal(r.bloques, 2);
  assert.ok(r.avisos.some(a => /ÚLTIMO/.test(a)));
  const llaves = extraerJson('{"actions":[{"action":"esperar","parameters":{}}],"reasoning_summary":"Uso { y } dentro del texto."}');
  assert.equal(llaves.ok, true); assert.equal(llaves.valor.reasoning_summary, 'Uso { y } dentro del texto.');
});

test('parser: errores accionables (vacío, sin JSON, cortado, roto con línea y columna, JSON que no es una respuesta)', () => {
  assert.equal(extraerJson('   \n').error.codigo, 'sin_texto');
  assert.equal(extraerJson('No puedo ayudar con eso.').error.codigo, 'sin_json');
  const cortado = extraerJson(RESP.slice(0, 60));
  assert.equal(cortado.ok, false); assert.equal(cortado.error.codigo, 'json_cortado'); assert.match(cortado.error.mensaje, /CORTADA/);
  const roto = extraerJson('{\n  "actions": [ {"action": "esperar" "parameters": {}} ],\n  "reasoning_summary": "x"\n}');
  assert.equal(roto.ok, false); assert.equal(roto.error.codigo, 'json_invalido'); assert.equal(roto.error.linea, 2); assert.match(roto.error.mensaje, /línea 2/);
  const otro = extraerJson('{"hola": 1}');
  assert.equal(otro.error.codigo, 'sin_campo_actions'); assert.match(otro.error.mensaje, /hola/);
});

test('parser: borrador completo en un solo JSON se reparte en las tres etapas; también un objeto ya parseado', () => {
  const tres = { etapa1: JSON.parse(RESP), etapa2: { actions: [], reasoning_summary: 'b' }, etapa3: { actions: [], reasoning_summary: 'c' } };
  const r = extraerJson('Aquí:\n```json\n' + JSON.stringify(tres) + '\n```');
  assert.equal(r.ok, true); assert.equal(esBorradorCompleto(r.valor), true);
  assert.deepEqual(Object.keys(separarBorrador(r.valor)), ['etapa1', 'etapa2', 'etapa3']);
  assert.equal(esBorradorCompleto(JSON.parse(RESP)), false);
  assert.equal(extraerJson(JSON.parse(RESP)).ok, true);
});

test('nombres de archivo: etapa1, Etapa 2.TXT, desarrollo1, guerra-2.correccion.json, borrador-completo; lo demás se ignora', () => {
  assert.deepEqual(interpretarNombre('etapa1.txt'), { clave: 'etapa1', correccion: false });
  assert.deepEqual(interpretarNombre('Etapa 2.TXT'), { clave: 'etapa2', correccion: false });
  assert.deepEqual(interpretarNombre('etapa_3.correccion.md'), { clave: 'etapa3', correccion: true });
  assert.deepEqual(interpretarNombre('desarrollo1.txt'), { clave: 'desarrollo-1', correccion: false });
  assert.deepEqual(interpretarNombre('guerra-2.correccion.json'), { clave: 'guerra-2', correccion: true });
  assert.deepEqual(interpretarNombre('borrador-completo.txt'), { clave: 'borrador', correccion: false });
  assert.deepEqual(interpretarNombre('borrador.corregida.txt'), { clave: 'borrador', correccion: true });
  assert.equal(interpretarNombre('notas.txt'), null); assert.equal(interpretarNombre('etapa4.txt'), null); assert.equal(interpretarNombre('etapa1.png'), null);
  assert.equal(claveDeLlamada({ tipo: 'etapa2', etapa: 2 }), 'etapa2');
  assert.equal(claveDeLlamada({ tipo: 'intervencion', fase: 'guerra', indice: 2 }), 'guerra-2');
});
