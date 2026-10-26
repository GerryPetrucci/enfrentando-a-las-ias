import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarRespuesta, normalizarTexto, limpiar, entero, regionDe, resolver, leerFundacion } from '../../juegos/civilizaciones/ordenes.js';
import { MAX_ORDENES } from '../../juegos/civilizaciones/constantes.js';
import { crearRng } from '../../rng.js';

const leer = (texto) => normalizarRespuesta({ ordenes: [texto] });
const una = (texto) => { const r = leer(texto); return r.ordenes[0] ?? null; };
const motivo = (texto) => leer(texto).descartadas[0]?.motivo ?? null;

test('cada orden se lee de su forma de texto', () => {
  assert.deepEqual(una('asignar granjeros 30 lenadores 10 mineros 10 mercaderes 20 sabios 20 artistas 10').reparto, { granjeros: 30, lenadores: 10, mineros: 10, mercaderes: 20, sabios: 20, artistas: 10 });
  assert.equal(una('investigar escritura').tec, 'S2');
  assert.deepEqual([una('construir R03 granero').region, una('construir R03 granero').edificio], [2, 'granero']);
  assert.equal(una('colonizar R10').region, 9);
  assert.equal(una('reclutar 12').n, 12);
  assert.deepEqual({ ...una('invertir piramide Roca 8'), texto: undefined }, { tipo: 'invertir', texto: undefined, maravilla: 'piramide', recurso: 'Roca', n: 8 });
  assert.equal(una('dilema 2').n, 2);
  assert.deepEqual([una('responder 2').clave, una('responder 2').n], [null, 2]);
  assert.deepEqual([una('responder invasion 1').clave, una('responder invasion 1').n], ['invasion', 1]);
  assert.deepEqual([una('responder peste 3').clave, una('responder peste 3').n], ['peste', 3]);
  assert.deepEqual({ ...una('regalar Madera 5'), texto: undefined }, { tipo: 'regalar', texto: undefined, recurso: 'Madera', n: 5 });
  assert.deepEqual({ ...una('ofrecer Madera 6 Oro 6'), texto: undefined }, { tipo: 'ofrecer', texto: undefined, da: 'Madera', nDa: 6, pide: 'Oro', nPide: 6 });
  assert.equal(una('aceptar').n, null);
  assert.equal(una('aceptar 2').n, 2);
});

test('mayusculas, acentos, plurales y R3 / R03 / 3 valen lo mismo', () => {
  assert.equal(una('INVESTIGAR  Metodo Científico').tec, 'S6');
  assert.equal(una('Asignar Leñadores 20 granjero 80').reparto.lenadores, 20);
  assert.deepEqual([regionDe('R3'), regionDe('R03'), regionDe('3'), regionDe('r003')], [2, 2, 2, 2]);
  assert.equal(regionDe('R27'), null);
  assert.equal(regionDe('R0'), null);
  assert.equal(una('construir 3 granero').region, 2);
});

test('nombres compuestos completos, por id o por prefijo unico dentro de su catalogo (C07)', () => {
  assert.equal(una('investigar arado pesado').tec, 'T4');
  assert.equal(una('investigar arado_pesado').tec, 'T4');
  assert.equal(una('investigar metodo').tec, 'S6', 'prefijo unico');
  assert.equal(una('investigar M2').tec, 'M2', 'por id');
  assert.equal(una('construir R01 muralla de madera').edificio, 'muralla de madera');
  assert.equal(una('construir R01 muralla').edificio, 'muralla', 'la coincidencia exacta gana al prefijo de "muralla de madera"');
  assert.equal(una('invertir biblioteca mayor Madera 5').maravilla, 'biblioteca mayor');
  assert.equal(una('invertir palacio de cristal Oro 60').maravilla, 'palacio de cristal');
  assert.equal(una('invertir faro 8 Oro').recurso, 'Oro', 'cantidad y recurso al reves tambien se leen');
  assert.equal(motivo('investigar ar'), 'tecnologia desconocida', 'un prefijo de menos de 3 letras no vale');
  assert.equal(motivo('investigar m'), 'tecnologia desconocida');
  assert.equal(resolver('es', [{ id: 'x', claves: ['escritura'] }]), null);
});

test('C07: cantidades enteras, finitas y positivas de hasta 1,000,000; un decimal, un negativo o un texto se descartan con motivo', () => {
  assert.equal(entero('1'), 1);
  assert.equal(entero('1000000'), 1000000);
  for (const mal of ['0', '1000001', '-3', '2.5', '1e3', 'abc', '', '99999999999999999999', ' 5', '+5']) assert.equal(entero(mal), null, mal);
  assert.match(motivo('reclutar 2.5'), /cantidad invalida/);
  assert.match(motivo('reclutar -3'), /cantidad invalida/);
  assert.match(motivo('invertir piramide Roca 1.5'), /cantidad invalida/);
  assert.match(motivo('regalar Oro 0'), /cantidad invalida/);
  assert.match(motivo('invertir piramide Roca 99999999999999999999'), /cantidad invalida/);
});

test('asignar: los porcentajes se leen tal cual (la normalizacion los acota); un oficio sin numero se ignora; sin ningun oficio se descarta', () => {
  assert.deepEqual(una('asignar granjeros -10 sabios 999 artistas 4.5').reparto, { granjeros: -10, sabios: 999, artistas: 4.5 });
  assert.deepEqual(una('asignar granjeros 50% sabios: 50').reparto, { granjeros: 50, sabios: 50 });
  assert.deepEqual(una('asignar granjeros sabios 40').reparto, { sabios: 40 });
  assert.equal(motivo('asignar'), 'asignar no trae ningun oficio con su porcentaje');
  assert.equal(motivo('asignar mucho'), 'asignar no trae ningun oficio con su porcentaje');
});

test('ordenes mal formadas se descartan con su motivo y el resto se lee', () => {
  const r = normalizarRespuesta({ ordenes: ['hola', 'construir R99 granero', 'construir R03 castillo', 'invertir x', 'responder 9', 'aceptar 9', 'ofrecer Oro', 'investigar escritura', 42, null, { orden: 'colonizar R04' }] });
  assert.deepEqual(r.ordenes.map((o) => o.tipo), ['investigar', 'colonizar']);
  assert.deepEqual(r.descartadas.map((d) => d.motivo), ['orden desconocida', 'region inexistente', 'edificio desconocido', 'invertir pide MARAVILLA RECURSO CANTIDAD', 'responder pide una opcion de 1 a 3', 'aceptar pide el numero de la oferta (1 o 2)', 'ofrecer pide RECURSO N RECURSO N', 'orden ilegible', 'orden ilegible']);
  assert.equal(r.invalida, false);
});

test(`maximo ${MAX_ORDENES} ordenes: las que sobran se descartan con motivo`, () => {
  const r = normalizarRespuesta({ ordenes: Array.from({ length: 15 }, () => 'reclutar 1') });
  assert.equal(r.ordenes.length, MAX_ORDENES);
  assert.equal(r.descartadas.length, 3);
  assert.match(r.descartadas[0].motivo, /mas de 12 ordenes/);
});

test('fundacion: nombre y lema se limpian y recortan; sitio ordinal 1 a 3 o id de uno de los sitios; rasgos repetidos pasan al siguiente de la lista', () => {
  const f = leerFundacion({ nombre: '  Roma\n\tAntigua  ' + 'x'.repeat(40), lema: 'L'.repeat(100), sitio: 3, rasgos: ['Eruditos', 'erudito'] }, { idsSitios: [4, 9, 17] });
  assert.equal(f.nombre.length, 24);
  assert.ok(!/[\n\t]/.test(f.nombre));
  assert.equal(f.lema.length, 60);
  assert.equal(f.sitio, 2);
  assert.deepEqual(f.rasgos, ['eruditos', 'agricultores'], 'el repetido pasa al primer rasgo de la lista no elegido');
  assert.equal(f.valida, false, 'con un rasgo repetido la fundacion no es del todo valida');
  assert.equal(leerFundacion({ nombre: 'A', sitio: 'R10', rasgos: ['pioneros', 'devotos'] }, { idsSitios: [4, 9, 17] }).sitio, 1, 'el id R10 es el sitio 2');
  assert.equal(leerFundacion({ nombre: 'A', sitio: 4, rasgos: ['pioneros', 'devotos'] }).sitio, 0, 'sitio fuera de 1..3: el primero');
  assert.equal(leerFundacion({ nombre: 'A', sitio: 2, rasgos: 'guerreros, constructores' }).valida, true, 'rasgos como texto separado por comas');
});

test('fundacion ausente o invalida: valores fijos (rasgos 1 y 2, primer sitio) y marcada no valida', () => {
  const f = leerFundacion(null);
  assert.deepEqual([f.valida, f.sitio, f.rasgos], [false, 0, ['agricultores', 'forjadores']]);
  assert.equal(normalizarRespuesta({ ordenes: [] }).fundacion, null);
  assert.equal(leerFundacion({ nombre: 5, lema: 7, rasgos: [1, 2] }).nombre, '5', 'un numero se vuelve texto');
});

test('respuestas raras: lista en vez de objeto, JSON con comillas simples, cadena en ordenes, texto suelto y null', () => {
  assert.equal(normalizarRespuesta(['reclutar 3', 'colonizar R05']).ordenes.length, 2);
  assert.equal(normalizarRespuesta("{'ordenes': ['reclutar 3'], 'nota': 'plan'}").ordenes.length, 1);
  assert.equal(normalizarRespuesta({ ordenes: 'reclutar 3\ncolonizar R05; investigar escritura' }).ordenes.length, 3);
  for (const nada of [null, undefined, 'hola mundo', 42, true, {}]) {
    const r = normalizarRespuesta(nada);
    assert.deepEqual([r.invalida, r.ordenes], [true, []], String(nada));
    assert.ok(r.motivo);
  }
  for (const vacia of [[], { ordenes: 7 }, { ordenes: [] }]) assert.equal(normalizarRespuesta(vacia).invalida, false, JSON.stringify(vacia));
  assert.equal(normalizarRespuesta({ mensaje: 'x'.repeat(300) }).mensaje.length, 140);
  assert.equal(normalizarRespuesta({ nota: 'n'.repeat(500) }).nota.length, 250);
});

test('NUNCA LANZA: 3,000 respuestas basura al azar siempre dan una jugada legal', () => {
  const rng = crearRng(99);
  const trozos = ['asignar', 'granjeros', 'construir', 'R3', 'R99', '-5', '1e999', 'NaN', 'invertir', 'piramide', 'Roca', '\u0000', '😀', 'x'.repeat(500), '30', '0', 'responder', 'peste', 'ofrecer', 'Oro', '9007199254740993', '{', 'null'];
  const valor = () => {
    const k = Math.floor(rng() * 7);
    if (k === 0) return null;
    if (k === 1) return trozos.slice(0, 1 + Math.floor(rng() * 6)).map(() => trozos[Math.floor(rng() * trozos.length)]).join(' ');
    if (k === 2) return Array.from({ length: Math.floor(rng() * 20) }, () => trozos[Math.floor(rng() * trozos.length)]);
    if (k === 3) return { ordenes: Array.from({ length: Math.floor(rng() * 20) }, () => trozos.map(() => trozos[Math.floor(rng() * trozos.length)]).slice(0, 4).join(' ')), fundacion: { nombre: valor1(), lema: valor1(), sitio: valor1(), rasgos: valor1() } };
    if (k === 4) return { ordenes: valor1(), mensaje: valor1(), nota: valor1(), razon: valor1() };
    if (k === 5) return Number.NaN;
    return { get ordenes() { throw new Error('getter hostil'); } };
  };
  const valor1 = () => [null, undefined, 3, -1, 'x', ['a', 1], { a: 1 }, Number.POSITIVE_INFINITY][Math.floor(rng() * 8)];
  for (let i = 0; i < 3000; i++) {
    const r = normalizarRespuesta(valor());
    assert.ok(Array.isArray(r.ordenes) && Array.isArray(r.descartadas));
    assert.ok(r.ordenes.length <= MAX_ORDENES);
    assert.equal(typeof r.mensaje, 'string');
    assert.ok(r.mensaje.length <= 140 && r.nota.length <= 250 && r.razon.length <= 160);
  }
});

test('limpiar y normalizarTexto', () => {
  assert.equal(limpiar('  a\n\n b\tc ', 10), 'a b c');
  assert.equal(limpiar('😀😀😀', 2), '😀😀', 'recorta por caracteres, sin partir un par sustituto');
  assert.equal(limpiar({}, 5), '');
  assert.equal(normalizarTexto('  Científico_Ñandú-X '), 'cientifico nandu x');
});
