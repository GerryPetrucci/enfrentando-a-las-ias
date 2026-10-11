// La consola con --lote de punta a punta: cliente de lote falso, carpeta temporal y consola capturada. Sin red y sin gastar nada.
// Los errores de uso (--lote sin tope, sin modo pago...) se prueban antes de crear el cliente: ahi no sale nada a la red.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { correr, ErrorDeUso } from '../correr.js';
import { clienteFalso } from './ayudas-lote.js';

const JUGADA = '{"ordenes": [], "pacto_con": null, "mensaje": "", "privados": [], "razon": "paso el turno"}';
const MODELOS_DE_PRACTICA = 'haiku,luna,flash-lite,deepseek';
const sincronoFalso = async () => ({ texto: JUGADA, finishReason: 'stop', uso: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } });
const sinCliente = () => { throw new Error('no debio crearse el cliente de lote'); };

// Corre la consola contra una carpeta temporal y devuelve lo que paso. Siempre limpia la carpeta.
async function correrAqui(argv, { cliente = clienteFalso({ responder: () => ({ texto: JUGADA }) }), crearCliente = () => cliente, sincrono = sincronoFalso } = {}) {
  const raiz = mkdtempSync(join(tmpdir(), 'enfrentando-lote-'));
  let texto = '';
  const consola = { log: (...a) => { texto += `${a.join(' ')}\n`; }, escribir: (t) => { texto += t; } };
  try {
    const { ruta, salida } = await correr(argv, { raiz, crearCliente, sincrono, consola });
    return { ruta, rel: ruta.slice(raiz.length + 1).replaceAll('\\', '/'), datos: JSON.parse(readFileSync(ruta, 'utf8')), salida, texto, cliente };
  } finally {
    rmSync(raiz, { recursive: true, force: true });
  }
}
const fallaCon = async (argv, patron, opciones) => {
  const cliente = clienteFalso();
  await assert.rejects(correrAqui(argv, { cliente, crearCliente: sinCliente, ...opciones }), (err) => err instanceof ErrorDeUso && patron.test(err.message), `esperaba un error de uso ${patron}`);
  assert.equal(cliente.enviados.length, 0);
};

test('serie por lote con la mezcla de practica: un lote por modelo y por turno, y el resto de llamadas normales', async () => {
  const { datos, cliente, texto, rel } = await correrAqui([
    '--juego=conquista', `--jugadores=${MODELOS_DE_PRACTICA}`, '--partidas=4', '--modo=pago', '--lote', '--tope=0.50', '--turnos=2', '--seed=7',
  ]);
  // 2 turnos x 3 modelos con variante de lote = 6 lotes, cada uno con las 4 partidas; DeepSeek no tiene lote: 2 x 4 llamadas normales
  assert.equal(cliente.enviados.length, 6);
  assert.ok(cliente.enviados.every((e) => e.n === 4));
  assert.deepEqual([...new Set(cliente.enviados.map((e) => e.modelo))].sort(), ['anthropic/claude-haiku-5.5', 'google/gemini-3.5-flash-lite', 'openai/gpt-6-luna']);
  assert.equal(datos.lote.lotes, 6);
  assert.equal(datos.lote.sincronas, 8);
  assert.equal(+datos.lote.gasto.toFixed(4), 0.06);
  assert.equal(datos.lote.topeAlcanzado, false);
  // lo que se guarda: partidas cortadas, a pruebas, con los parametros con que se midio
  assert.equal(rel.startsWith('data/pruebas/'), true);
  assert.equal(datos.destino, 'pruebas');
  assert.equal(datos.modo, 'pago');
  assert.equal(datos.turnos, 2);
  assert.equal(datos.partidas.length, 4);
  assert.ok(datos.partidas.every((p) => p.truncada && p.rondas.length === 2 && p.seed === 7));
  assert.deepEqual(datos.partidas.map((p) => p.jugadores[0].id), ['haiku', 'luna', 'flash-lite', 'deepseek']);
  assert.deepEqual(datos.parametros, { temperatura: 0.7, maxTokens: 4000, razonamiento: { haiku: 'medium', luna: 'medium', 'flash-lite': 'medium', deepseek: null } });
  // lo que se ve: el saldo, cada envio y el resumen
  assert.match(texto, /Saldo de OpenRouter: \$10\.00/);
  assert.match(texto, /\[lote\] enviado lote-1 · anthropic\/claude-haiku-5\.5 · 4 peticion/);
  assert.match(texto, /Partida 4\/4 {2}cortada a 2 turno/);
  assert.match(texto, /Lotes: 6 \(24 peticiones\) · llamadas normales: 8 · gasto informado por OpenRouter: \$0\.0600 de \$0\.5000/);
});

test('--turnos manda el resultado a pruebas aunque nadie lo pida, y no deja mandarlo a oficial', async () => {
  const { datos } = await correrAqui(['--juego=conquista', '--jugadores=haiku,luna,flash-lite,claude', '--partidas=1', '--modo=pago', '--lote', '--tope=1', '--turnos=1']);
  assert.equal(datos.destino, 'pruebas');
  await fallaCon(['--juego=conquista', '--jugadores=haiku,luna,flash-lite,claude', '--partidas=1', '--modo=pago', '--lote', '--tope=1', '--turnos=1', '--destino=oficial'], /practica/, { crearCliente: sinCliente });
});

test('si se alcanza el tope de gasto, la serie incompleta se guarda en pruebas aunque fuera oficial y lo dice', async () => {
  const cliente = clienteFalso({ costoPorLote: 0.02 });
  const { datos, texto } = await correrAqui(
    ['--juego=conquista', '--jugadores=claude,gpt,gemini,llama', '--partidas=2', '--modo=pago', '--lote', '--tope=0.05', '--destino=oficial', '--seed=3'],
    { cliente },
  );
  assert.equal(datos.lote.topeAlcanzado, true);
  assert.equal(datos.destino, 'pruebas');
  assert.match(texto, /Se alcanzo el tope de gasto/);
  assert.ok(cliente.enviados.length < 30 * 4, 'no envio todos los lotes de una partida completa');
  const errores = datos.partidas.flatMap((p) => p.rondas.flatMap((r) => r.errores.filter(Boolean)));
  assert.ok(errores.some((e) => /tope de gasto/.test(e)), 'lo que no se pudo pedir queda anotado como error de API');
});

test('con saldo menor que el tope, o sin poder consultarlo, no se envia nada', async () => {
  const base = ['--juego=conquista', '--jugadores=haiku,luna,flash-lite,claude', '--partidas=1', '--modo=pago', '--lote', '--turnos=1'];
  for (const [cliente, patron] of [
    [clienteFalso({ saldo: 0.1 }), /Saldo insuficiente: quedan \$0\.1000 en OpenRouter y --tope=0\.5/],
    [clienteFalso({ saldo: 0 }), /Saldo insuficiente/],
    [clienteFalso({ falloDeCredito: 'OpenRouter 401: llave invalida' }), /No pude consultar el saldo.*401/],
  ]) {
    await assert.rejects(correrAqui([...base, '--tope=0.50'], { cliente }), (err) => err instanceof ErrorDeUso && patron.test(err.message));
    assert.equal(cliente.enviados.length, 0);
  }
});

test('errores de uso de --lote, todos antes de crear el cliente', async () => {
  const modelos = '--jugadores=haiku,luna,flash-lite,claude';
  const conq = ['--juego=conquista', modelos, '--partidas=1', '--turnos=1'];
  await fallaCon([...conq, '--lote', '--tope=1'], /--modo=pago/);                               // sin modo
  await fallaCon([...conq, '--lote', '--tope=1', '--modo=gratis'], /gasta credito|--modo=pago/); // modo gratis
  await fallaCon([...conq, '--lote', '--modo=pago'], /--tope=/);                                // sin tope
  await fallaCon([...conq, '--lote', '--modo=pago', '--tope=0'], /--tope=/);                    // tope cero
  await fallaCon([...conq, '--lote', '--modo=pago', '--tope=mucho'], /--tope=/);                // tope que no es numero
  await fallaCon([...conq, '--lote', '--modo=pago', '--tope'], /--tope=/);                      // --tope sin valor no es "1 dolar"
  await fallaCon([...conq, '--modo=pago', '--turnos'], /--turnos/);                             // --turnos sin valor no es "1 turno"
  await fallaCon([...conq, '--lote', '--modo=pago', '--tope=1', '--sondeo'], /--sondeo/);       // --sondeo sin valor no es "1 segundo"
  await fallaCon([...conq, '--modo=pago', '--tope=1'], /solo se usa con --lote/);               // tope sin lote
  await fallaCon(['--juego=conquista', '--jugadores=agresivo,pacifico,economico,azar', '--lote', '--modo=pago', '--tope=1'], /solo aplica a modelos/);
  await fallaCon(['--a=deepseek', '--b=llama', '--partidas=1', '--lote', '--modo=pago', '--tope=1'], /variante de lote/);
  await fallaCon([...conq, '--modo=pago', '--turnos=0'], /--turnos/);
  await fallaCon([...conq, '--lote', '--modo=pago', '--tope=1', '--sondeo=0'], /--sondeo/);
});

test('sin --lote la consola sigue igual: una partida tras otra, con puntos, y sin lote en lo guardado', async () => {
  const { datos, texto } = await correrAqui(['--juego=conquista', '--jugadores=agresivo,pacifico,economico,azar', '--partidas=2', '--destino=pruebas', '--seed=7'], { crearCliente: sinCliente });
  assert.match(texto, /Partida 1\/2 \.+ {2}(gana|empate)/);
  assert.match(texto, /Partida 2\/2 \.+ {2}(gana|empate)/);
  assert.equal('lote' in datos, false);
  assert.equal('turnos' in datos, false);
  assert.deepEqual(datos.parametros.razonamiento, {}, 'sin modelos no hay razonamiento que anotar');
  assert.equal(datos.modo, null);
});

test('los modelos economicos de practica van a pruebas por defecto y no se dejan mandar a oficial', async () => {
  const base = ['--juego=conquista', '--jugadores=haiku,luna,flash-lite,claude', '--partidas=1', '--modo=pago', '--lote', '--tope=1'];
  const { datos, rel } = await correrAqui(base);
  assert.equal(datos.destino, 'pruebas');
  assert.equal(rel.startsWith('data/pruebas/'), true);
  await fallaCon([...base, '--destino=oficial'], /practica/, { crearCliente: sinCliente });
});
