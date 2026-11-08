// Examen de ingreso de modelos por juego (herramientas/examen-modelos.mjs). Todo con bots y llamadas falsas: nunca toca la red ni gasta credito.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { escenariosDeLobo, compararConReal, conVariante, parsearVariante, conSistema, leerSistema, veredictoDeExamen, correrExamen, candidatosDeContendientes, filaDeAptitud, fusionarAptitud } from '../../herramientas/examen-modelos.mjs';
import { PARAMETROS } from '../parametros.js';
import { correrPartida } from '../arena.js';
import { resolverAgente } from '../agentes.js';
import { construirSistema } from '../prompt.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
// ---------- veredicto ----------
const TOPE_TOKENS = 8000;
// Un intento tal como lo deja la corrida: 4 escenarios x 2 repeticiones.
const intento = (escenario, extra = {}) => ({ escenario, ok: true, motivo: null, finishReason: 'stop', tokensSalida: 1500, ordenes: { validas: 3, total: 3 }, costo: 0.001, ms: 5000, ...extra });
const bateria = (cambios = () => ({})) => ['t2', 't8', 't15', 't22'].flatMap((e) => [1, 2].map((r) => intento(e, cambios(e, r) ?? {})));
const corte = { ok: false, motivo: 'cortada por max_tokens (finish_reason=length)', finishReason: 'length', tokensSalida: TOPE_TOKENS, ordenes: { validas: 0, total: 1 } };

test('veredicto: sin fallas, con salida holgada y ordenes legales, el modelo es apto', () => {
  const v = veredictoDeExamen(bateria(), { maxTokens: TOPE_TOKENS });
  assert.equal(v.veredicto, 'apto');
  assert.deepEqual(v.motivos, []);
  assert.equal(v.metricas.llamadas, 8);
  assert.equal(v.metricas.fallas, 0);
  assert.equal(v.metricas.ordenesLegales, 1);
});

test('veredicto: un corte aislado deja al modelo con reservas, y dice cual', () => {
  const v = veredictoDeExamen(bateria((e, r) => (e === 't15' && r === 1 ? corte : {})), { maxTokens: TOPE_TOKENS });
  assert.equal(v.veredicto, 'con reservas');
  assert.equal(v.metricas.cortes, 1);
  assert.match(v.motivos.join(' '), /1 de 8.*cortada/);
});

test('veredicto: la mitad de las llamadas fallidas, o un escenario que falla siempre, es no apto', () => {
  // GLM Flash en la partida del 27-oct: bien hasta el turno 6, cortado casi siempre despues.
  const comoGlm = veredictoDeExamen(bateria((e) => (e === 't2' ? {} : corte)), { maxTokens: TOPE_TOKENS });
  assert.equal(comoGlm.veredicto, 'no apto');
  // Solo 2 de 8 fallan (25 %), pero las dos son el mismo escenario: ahi el modelo no puede jugar.
  const siempreEnUno = veredictoDeExamen(bateria((e) => (e === 't22' ? corte : {})), { maxTokens: TOPE_TOKENS });
  assert.equal(siempreEnUno.veredicto, 'no apto');
  assert.match(siempreEnUno.motivos.join(' '), /t22/);
});

test('veredicto: con una sola repeticion por escenario, una falla suelta no es «falla siempre» (diagnostico sobre turnos reales)', () => {
  // 30 turnos de una partida real, una llamada cada uno: una sola falla es un 3 %, no un modelo que no puede jugar ese turno.
  const turnos = Array.from({ length: 30 }, (_, i) => `real-t${i + 1}`);
  const una = turnos.map((e, i) => intento(e, i === 29 ? { ok: false, motivo: 'JSON invalido', finishReason: 'stop', ordenes: { validas: 0, total: 1 } } : {}));
  const v = veredictoDeExamen(una, { maxTokens: TOPE_TOKENS });
  assert.equal(v.veredicto, 'con reservas');
  assert.ok(!v.motivos.join(' ').includes('en todas sus repeticiones'));
});

test('veredicto: pasar el turno a proposito (cero ordenes) no baja el porcentaje de ordenes legales', () => {
  const v = veredictoDeExamen(bateria((e, r) => (e === 't22' && r === 1 ? { ordenes: { validas: 0, total: 0 } } : {})), { maxTokens: TOPE_TOKENS });
  assert.equal(v.veredicto, 'apto');
  assert.equal(v.metricas.ordenesLegales, 1);
});

test('veredicto: gastar mas de la mitad del tope de tokens, o dar pocas ordenes legales, deja con reservas', () => {
  const pesado = veredictoDeExamen(bateria(() => ({ tokensSalida: 5200 })), { maxTokens: TOPE_TOKENS });
  assert.equal(pesado.veredicto, 'con reservas');
  assert.match(pesado.motivos.join(' '), /mitad del tope/);
  const ilegal = veredictoDeExamen(bateria(() => ({ ordenes: { validas: 1, total: 4 } })), { maxTokens: TOPE_TOKENS });
  assert.equal(ilegal.veredicto, 'con reservas');
  assert.match(ilegal.motivos.join(' '), /órdenes son legales/);
});

test('veredicto: un error de la API cuenta como falla, y sin intentos no se juzga', () => {
  const v = veredictoDeExamen(bateria((e, r) => (e === 't8' && r === 2 ? { ok: false, motivo: 'error de la llamada: OpenRouter 502', finishReason: null, tokensSalida: null, ordenes: { validas: 0, total: 1 } } : {})), { maxTokens: TOPE_TOKENS });
  assert.equal(v.metricas.fallas, 1);
  assert.equal(v.metricas.cortes, 0);
  assert.equal(v.veredicto, 'con reservas');
  assert.equal(veredictoDeExamen([], { maxTokens: TOPE_TOKENS }).veredicto, 'incompleto');
});

// ---------- corredor ----------
// Asiento 0: ahi el bot de referencia juega todas sus ordenes legales (en el 2 su bot pasivo se queda sin jugadas y el fixture no seria "un modelo que juega bien").
const escenariosChicos = () => ['t2', 't8'].map(id => ({ id, jugadaDeReferencia: { ordenes: ['acción'] }, sistema: 'Reglas del fixture', usuario: `Estado ${id}`, tokensEstimados: 200, evaluar: r => ({ ok: Array.isArray(r?.ordenes), ordenes: { validas: r?.ordenes?.length ?? 0, total: r?.ordenes?.length ?? 0 } }) }));
const candidato = (extra = {}) => ({ clave: 'x', nombre: 'Modelo X', modelo: 'proveedor/x', razonamiento: 'low', precio: { entrada: 1, salida: 1 }, ...extra });
// Un "modelo" que contesta con la jugada del bot de referencia de cada escenario (indexado por el usuario del prompt).
const respondeBien = (escenarios, uso = { prompt_tokens: 4000, completion_tokens: 1500, cost: 0.001 }) => async ({ usuario }) => {
  const e = escenarios.find((x) => x.usuario === usuario);
  return { texto: JSON.stringify(e.jugadaDeReferencia), uso, finishReason: 'stop', razonamiento: 'pienso un poco' };
};

test('el corredor llama cada escenario las veces pedidas, con la configuracion de produccion, y juzga al modelo', async () => {
  const escenarios = escenariosChicos();
  const llamadas = [];
  const llamar = async (args) => { llamadas.push(args); return respondeBien(escenarios)(args); };
  const r = await correrExamen({ candidatos: [candidato()], escenarios, repeticiones: 2, llamar, topeUsd: 1 });
  assert.equal(llamadas.length, 4);
  for (const l of llamadas) {
    assert.equal(l.modelo, 'proveedor/x');
    assert.equal(l.razonamiento, 'low');
    assert.equal(l.reintentos, 0, 'una llamada contada es una solicitud HTTP');
    assert.equal(l.maxTokens, undefined, 'usa el tope de produccion (PARAMETROS.maxTokens), no uno propio');
  }
  assert.equal(r.modelos[0].veredicto, 'apto');
  assert.equal(r.modelos[0].intentos.length, 4);
  assert.deepEqual(r.modelos[0].intentos.map((i) => [i.escenario, i.repeticion]), [['t2', 1], ['t2', 2], ['t8', 1], ['t8', 2]]);
  assert.equal(r.maxTokens, PARAMETROS.maxTokens);
  assert.equal(r.llamadas, 4);
});

test('un tope de tokens pedido se manda a cada llamada, se usa para el peor caso y para juzgar si el modelo gasta mas de la mitad', async () => {
  const escenarios = ['a', 'b'].map((id) => ({ id, sistema: 'S', usuario: 'U', tokensEstimados: 5000, evaluar: () => ({ ok: true, motivo: null, ordenes: { validas: 1, total: 1 } }) }));
  const recibidos = [];
  const salida = Math.round(PARAMETROS.maxTokens * 0.9), pedido = PARAMETROS.maxTokens * 3; // el modelo gasta el 90 % del tope de siempre
  const llamar = async (args) => { recibidos.push(args); return { texto: '{"ordenes":["x"]}', uso: { prompt_tokens: 4000, completion_tokens: salida, cost: 0.001 }, finishReason: 'stop' }; };
  const r = await correrExamen({ candidatos: [candidato()], escenarios, repeticiones: 1, llamar, topeUsd: 1, maxTokens: pedido });
  assert.ok(recibidos.every((a) => a.maxTokens === pedido), 'cada llamada lleva el tope pedido');
  assert.equal(r.maxTokens, pedido);
  assert.equal(r.modelos[0].veredicto, 'apto', 'el 30 % del tope pedido no pasa de la mitad');
  const conTopeDeSiempre = await correrExamen({ candidatos: [candidato()], escenarios, repeticiones: 1, llamar, topeUsd: 1 });
  assert.equal(conTopeDeSiempre.maxTokens, PARAMETROS.maxTokens);
  assert.equal(conTopeDeSiempre.modelos[0].veredicto, 'con reservas', 'el 90 % del tope de siempre si pasa de la mitad');
});

test('el corredor cuenta como falla un corte, un error de red y un texto que no es JSON, y guarda el razonamiento', async () => {
  const escenarios = escenariosChicos();
  const respuestas = [
    { texto: '', finishReason: 'length', razonamiento: 'Primero reviso el mapa. Primero reviso el mapa.', uso: { prompt_tokens: 4000, completion_tokens: PARAMETROS.maxTokens, cost: 0.002 } },
    new Error('OpenRouter 502: mala puerta de enlace'),
    { texto: 'no se me ocurre nada', finishReason: 'stop', uso: { prompt_tokens: 4000, completion_tokens: 50, cost: 0.001 } },
    null, // este si juega bien
  ];
  let n = 0;
  const llamar = async (args) => {
    const r = respuestas[n++];
    if (r instanceof Error) throw r;
    return r ?? respondeBien(escenarios)(args);
  };
  const r = await correrExamen({ candidatos: [candidato()], escenarios, repeticiones: 2, llamar, topeUsd: 1 });
  const [corte, red, texto, bien] = r.modelos[0].intentos;
  assert.match(corte.motivo, /max_tokens/);
  assert.equal(corte.razonamiento, 'Primero reviso el mapa. Primero reviso el mapa.');
  assert.match(red.motivo, /error de la llamada.*502/);
  assert.match(texto.motivo, /JSON/);
  assert.equal(bien.ok, true);
  assert.equal(r.modelos[0].veredicto, 'no apto');
});

test('el corredor no empieza una llamada que, en el peor caso, pasaria del tope: el modelo queda incompleto', async () => {
  // Escenarios sinteticos de 5000 tokens estimados (no el prompt real, para que la prueba no dependa de su tamano).
  const escenarios = ['a', 'b'].map((id) => ({ id, sistema: 'S', usuario: 'U', tokensEstimados: 5000, evaluar: () => ({ ok: true, motivo: null, ordenes: { validas: 1, total: 1 } }) }));
  // Peor caso por llamada: (5000 x 1.1 de entrada + PARAMETROS.maxTokens de salida) a $10 por millon; la primera cuesta $0.15 de verdad, mas de la mitad del tope.
  const peor = ((5000 * 1.1 + PARAMETROS.maxTokens) * 10) / 1e6, tope = +(peor * 1.4).toFixed(3);
  const llamar = async () => ({ texto: '{"ordenes":["x"]}', uso: { prompt_tokens: 4000, completion_tokens: 3000, cost: peor * 0.7 }, finishReason: 'stop' });
  const r = await correrExamen({ candidatos: [candidato({ precio: { entrada: 10, salida: 10 } })], escenarios, repeticiones: 2, llamar, topeUsd: tope });
  assert.equal(r.llamadas, 1, 'la primera cabe en el tope (peor caso); la segunda ya no: gastado + peor caso > tope');
  assert.ok(r.gastado <= tope, `gasto ${r.gastado}`);
  assert.match(r.detenido, /tope/);
  assert.equal(r.modelos[0].veredicto, 'incompleto');
});

test('con llamadas en paralelo el gasto sigue sin pasar del tope y se acaban todas las tareas si caben', async () => {
  const escenarios = escenariosChicos();
  let enVuelo = 0, maxEnVuelo = 0;
  const llamar = async (args) => {
    enVuelo++; maxEnVuelo = Math.max(maxEnVuelo, enVuelo);
    await new Promise((res) => setTimeout(res, 5));
    enVuelo--;
    return respondeBien(escenarios)(args);
  };
  const r = await correrExamen({ candidatos: [candidato()], escenarios, repeticiones: 2, llamar, topeUsd: 1, paralelo: 3 });
  assert.equal(r.llamadas, 4);
  assert.ok(maxEnVuelo > 1 && maxEnVuelo <= 3, `en vuelo a la vez: ${maxEnVuelo}`);
  assert.equal(r.modelos[0].veredicto, 'apto');
});

test('un error de llave o de credito detiene el examen entero y no se le achaca al modelo', async () => {
  const escenarios = escenariosChicos();
  const llamar = async () => { throw new Error('OpenRouter 402: credito insuficiente'); };
  const r = await correrExamen({ candidatos: [candidato(), candidato({ clave: 'y' })], escenarios, repeticiones: 2, llamar, topeUsd: 1 });
  assert.match(r.detenido, /402/);
  assert.equal(r.llamadas, 1);
  assert.equal(r.modelos.length, 1, 'no sigue con el siguiente modelo');
  assert.equal(r.modelos[0].veredicto, 'incompleto');
});

// ---------- candidatos y tabla de aptitud ----------
const catalogo = { data: [
  { id: 'z-ai/glm-5.3-flash', pricing: { prompt: '0.00000015', completion: '0.0000005' } },
  { id: 'sin/precio', pricing: { prompt: null, completion: null } },
] };

test('los candidatos del examen salen de los contendientes: su modelo y su razonamiento reales, con el precio del catalogo', () => {
  const [glm] = candidatosDeContendientes(catalogo, ['glm-flash']);
  assert.equal(glm.clave, 'glm-flash');
  assert.equal(glm.modelo, 'z-ai/glm-5.3-flash');
  assert.equal(glm.razonamiento, 'low', 'el razonamiento es el que usa la partida, no el que sugiere el catalogo');
  assert.deepEqual(glm.precio, { entrada: 0.15, salida: 0.5 });
  assert.equal(glm.problema, null);
  assert.throws(() => candidatosDeContendientes(catalogo, ['no-existe']), /Contendiente desconocido.*no-existe/);
});

test('un contendiente fuera del catalogo o sin precio valido queda marcado con su problema', () => {
  const faltante = candidatosDeContendientes({ data: [] }, ['glm-flash'])[0];
  assert.match(faltante.problema, /no está en el catálogo/);
  assert.equal(faltante.precio, null);
  const sinPrecio = candidatosDeContendientes({ data: [{ id: 'z-ai/glm-5.3-flash', pricing: {} }] }, ['glm-flash'])[0];
  assert.match(sinPrecio.problema, /precio válido/);
});

const modeloJuzgado = (extra = {}) => ({
  clave: 'glm-flash', nombre: 'GLM Flash', modelo: 'z-ai/glm-5.3-flash', veredicto: 'no apto', motivos: ['fallan 6 de 8 llamadas (la mitad o más)'],
  metricas: { llamadas: 8, fallas: 6, cortes: 6, ordenesLegales: 0.8333, salidaMediana: 8000, msMediano: 90000, costo: 0.0312 }, ...extra,
});
const CONTEXTO = { juego: 'lobo', reglas: 'lobo-2.2.0', maxTokens: 8000, fecha: '2026-10-27' };

test('la fila de aptitud resume el veredicto con su contexto (reglas, tope de tokens y fecha), porque caduca si cambian', () => {
  const f = filaDeAptitud(modeloJuzgado(), CONTEXTO);
  assert.deepEqual(f, {
    clave: 'glm-flash', juego: 'lobo', celdas: ['GLM Flash (`glm-flash`)', 'lobo', 'no apto', '2/8', '6', '83 %', '8000', '$0.0312', 'lobo-2.2.0', '8000', '2026-10-27', 'fallan 6 de 8 llamadas (la mitad o más)'],
  });
});

test('fusionarAptitud crea la tabla, reemplaza la fila del mismo modelo y juego, y conserva las demas', () => {
  const vacia = fusionarAptitud('', [filaDeAptitud(modeloJuzgado(), CONTEXTO)]);
  assert.match(vacia, /^# Aptitud de modelos por juego/);
  assert.match(vacia, /\| Modelo \| Juego \| Veredicto \|/);
  assert.equal(vacia.split('\n').filter((l) => l.startsWith('| GLM Flash')).length, 1);

  const con2 = fusionarAptitud(vacia, [filaDeAptitud(modeloJuzgado({ clave: 'haiku', nombre: 'Claude Haiku', veredicto: 'apto', motivos: [], metricas: { llamadas: 8, fallas: 0, cortes: 0, ordenesLegales: 1, salidaMediana: 2100, msMediano: 9000, costo: 0.02 } }), CONTEXTO)]);
  assert.equal(con2.split('\n').filter((l) => /^\| (GLM Flash|Claude Haiku)/.test(l)).length, 2);

  // Un examen nuevo de GLM Flash (otra fecha, ahora apto) reemplaza su fila y deja la de Haiku.
  const nuevo = fusionarAptitud(con2, [filaDeAptitud(modeloJuzgado({ veredicto: 'apto', motivos: [], metricas: { llamadas: 8, fallas: 0, cortes: 0, ordenesLegales: 1, salidaMediana: 3000, msMediano: 20000, costo: 0.01 } }), { ...CONTEXTO, fecha: '2026-11-02' })]);
  const filas = nuevo.split('\n').filter((l) => /^\| (GLM Flash|Claude Haiku)/.test(l));
  assert.equal(filas.length, 2);
  assert.ok(filas.some((l) => l.includes('2026-11-02') && l.includes('| apto |')));
  assert.equal(filas.filter((l) => l.startsWith('| GLM Flash')).length, 1, 'la fila vieja de GLM Flash ya no esta');
  // Misma clave en otro juego es otra fila.
  const otroJuego = fusionarAptitud(nuevo, [filaDeAptitud(modeloJuzgado(), { ...CONTEXTO, juego: 'otro-fixture', reglas: 'fixture-1' })]);
  assert.equal(otroJuego.split('\n').filter((l) => l.startsWith('| GLM Flash')).length, 2);
});

// ---------- el programa: nunca llama a nada sin --ejecutar, y estas pruebas siempre con catalogo guardado y sin llave (sin red) ----------
function programa(args, catalogo = { data: [{ id: 'z-ai/glm-5.3-flash', pricing: { prompt: '0.00000015', completion: '0.0000005' } }] }) {
  const dir = mkdtempSync(join(tmpdir(), 'examen-modelos-'));
  const archivo = join(dir, 'catalogo.json');
  writeFileSync(archivo, JSON.stringify(catalogo));
  try {
    return spawnSync(process.execPath, ['herramientas/examen-modelos.mjs', `--archivo=${archivo}`, ...args], { cwd: RAIZ, encoding: 'utf8', env: { ...process.env, OPENROUTER_API_KEY: '' } });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

test('programa: sin --ejecutar solo estima el costo y avisa que no llamo a ningun modelo', () => {
  const r = programa(['--juego=lobo', '--modelos=glm-flash']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /glm-flash\s+z-ai\/glm-5\.3-flash/);
  assert.match(r.stdout, /peor caso/);
  assert.match(r.stdout, /lobo-dia/);
  assert.match(r.stdout, /NO llamó a ningún modelo/);
});


test('programa: exige juego y lista de modelos, y rechaza juegos y modelos desconocidos', () => {
  assert.match(programa(['--modelos=glm-flash']).stderr, /--juego/);
  assert.match(programa(['--juego=lobo']).stderr, /--modelos/);
  assert.match(programa(['--juego=ajedrez', '--modelos=glm-flash']).stderr, /Juego sin examen: ajedrez/);
  const desconocido = programa(['--juego=lobo', '--modelos=gpt-9']);
  assert.equal(desconocido.status, 1);
  assert.match(desconocido.stderr, /Contendiente desconocido: "gpt-9"/);
});

test('programa: --ejecutar exige un tope en dolares y un modelo presente en el catalogo', () => {
  const sinTope = programa(['--juego=lobo', '--modelos=glm-flash', '--ejecutar']);
  assert.equal(sinTope.status, 1);
  assert.match(sinTope.stderr, /tope de gasto/);
  const ceroTope = programa(['--juego=lobo', '--modelos=glm-flash', '--ejecutar', '--tope-usd=0']);
  assert.equal(ceroTope.status, 1);
  const ausente = programa(['--juego=lobo', '--modelos=glm-flash'], { data: [] });
  assert.equal(ausente.status, 1);
  assert.match(ausente.stdout, /PROBLEMA: z-ai\/glm-5\.3-flash no está en el catálogo/);
});

test('el corredor se niega con un tope o un precio invalidos (sin ellos no hay control del gasto)', async () => {
  const escenarios = escenariosChicos();
  const llamar = respondeBien(escenarios);
  await assert.rejects(correrExamen({ candidatos: [candidato()], escenarios, llamar, topeUsd: 0 }), /Tope/);
  await assert.rejects(correrExamen({ candidatos: [candidato()], escenarios, llamar, topeUsd: NaN }), /Tope/);
  await assert.rejects(correrExamen({ candidatos: [candidato({ precio: null })], escenarios, llamar, topeUsd: 1 }), /precio/);
});

test('escenarios de Lobo y variantes conservan el motor y no mutan los prompts originales', () => {
  const e = escenariosDeLobo();
  assert.deepEqual(e.map(x => x.id), ['lobo-noche', 'lobo-dia']);
  assert.ok(e.every(x => x.sistema.length > 100 && x.usuario.length > 100 && x.tokensEstimados > 0));
  const nuevos = conSistema(e, 'NUEVAS REGLAS');
  assert.equal(nuevos[0].usuario, e[0].usuario); assert.equal(nuevos[0].sistema, 'NUEVAS REGLAS');
  assert.notEqual(e[0].sistema, 'NUEVAS REGLAS');
  const variante = conVariante(e, 'fase', 'FASE');
  assert.ok(variante.every(x => x.usuario.includes('FASE')));
  assert.throws(() => conVariante(e, 'texto inexistente xyz', 'otro'), /no aparece/);
  assert.deepEqual(parsearVariante('a=>b'), { de: 'a', a: 'b' });
  assert.throws(() => parsearVariante('a'), /separador/);
});
