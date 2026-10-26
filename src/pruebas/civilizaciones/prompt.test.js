import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { construirSistema } from '../../prompt.js';
import { REGLAS, FORMATO } from '../../juegos/civilizaciones/reglas-texto.js';
import { TECNOLOGIAS, EDIFICIOS, MARAVILLAS, RASGOS, TOPE_TOKENS_ENTRADA, COSTO_TECNOLOGIA, INVASIONES } from '../../juegos/civilizaciones/constantes.js';
import { normalizarTexto } from '../../juegos/civilizaciones/ordenes.js';
import { civilizaciones, tokens } from './ayudas.js';

// EL CONTRATO: el texto de reglas es igual para todas las IAs. Si cambia, cambia `versionReglas` (las partidas de versiones distintas no se comparan). Esta prueba ata las dos cosas:
// al cambiar el texto hay que subir la version y anotar aqui su huella, a proposito.
const HUELLAS = { 'civilizaciones-1.2.1': '9817be32260cdac0' };
const huella = () => createHash('sha256').update(civilizaciones.reglas + '\n' + civilizaciones.formatoRespuesta).digest('hex').slice(0, 16);

test('el texto de reglas y su version van juntos: cambiar el contrato obliga a subir `versionReglas` y anotar su huella', () => {
  assert.ok(HUELLAS[civilizaciones.versionReglas], `la version ${civilizaciones.versionReglas} no tiene huella anotada`);
  assert.equal(huella(), HUELLAS[civilizaciones.versionReglas], 'el texto de reglas cambio: sube la version y anota la huella nueva');
});

test('el contrato es solo ASCII (sin acentos), tiene el formato de respuesta y se genera de las constantes', () => {
  for (const [nombre, texto] of [['reglas', REGLAS], ['formato', FORMATO]]) assert.ok(/^[\x20-\x7e\n]*$/.test(texto), `${nombre} tiene caracteres que no son ASCII`);
  assert.equal(civilizaciones.reglas, REGLAS);
  const f = JSON.parse(FORMATO);
  assert.deepEqual(Object.keys(f), ['fundacion', 'ordenes', 'mensaje', 'nota', 'razon']);
});

test('el texto dice todo lo que la IA necesita: cada tecnologia, edificio, Maravilla y rasgo, los costos y las invasiones', () => {
  const texto = normalizarTexto(REGLAS);
  for (const t of TECNOLOGIAS) assert.ok(texto.includes(normalizarTexto(t.nombre)), t.nombre);
  for (const e of EDIFICIOS) assert.ok(texto.includes(normalizarTexto(e.id)), e.id);
  for (const m of MARAVILLAS) assert.ok(texto.includes(normalizarTexto(m.nombre)), m.nombre);
  for (const r of RASGOS) assert.ok(texto.includes(r.id), r.id);
  assert.ok(REGLAS.includes(`Costo en Ciencia por era: ${COSTO_TECNOLOGIA.join(', ')}`));
  for (const i of INVASIONES) assert.ok(REGLAS.includes(String(i.fuerza)) && REGLAS.includes(String(i.turno)));
  for (const orden of ['asignar', 'investigar', 'construir', 'colonizar', 'reclutar', 'invertir', 'dilema', 'responder', 'regalar', 'ofrecer', 'aceptar']) assert.ok(REGLAS.includes(orden), orden);
});

test('las reglas de 1.2.0 estan escritas: tributo completo, sitio 1 a 3, aceptar N, maximo 12 ordenes y el Indice de 100', () => {
  assert.match(REGLAS, /paga el tributo completo \(2 Oro por punto de fuerza; sin Oro suficiente se resuelve como resistir\)/);
  assert.match(REGLAS, /sitio de tu capital \(1, 2 o 3 de los que se ofrecen\)/);
  assert.match(REGLAS, /la acepta con aceptar N; luego caduca/);
  assert.match(REGLAS, /ORDENES \(maximo 12 por turno; basta con 3 a 6\)/);
  assert.match(REGLAS, /INDICE DE AVANCE \(100\)/);
  assert.match(REGLAS, /Maravillas 15 \(2\.5 cada una\)/);
  assert.match(REGLAS, /3,000 de recursos producidos/);
});

test('presupuesto: la parte fija del prompt (reglas + formato + instrucciones) cabe con margen en el tope de entrada de 6,000 tokens', () => {
  const fijo = tokens(construirSistema(civilizaciones));
  assert.ok(fijo <= 4100, `la parte fija mide ${fijo} tokens (pasa de 4,100: recorta antes de pedir subir el tope)`);
  assert.ok(fijo < TOPE_TOKENS_ENTRADA);
});
