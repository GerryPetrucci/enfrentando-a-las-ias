// Por que fallan las llamadas de los modelos en Lobo: cada respuesta invalida guarda su motivo y el principio del texto crudo (en el registro privado), la arena
// no pierde el texto de las respuestas cortadas o sin JSON ni sus tokens, y la consola y analizar-invalidas.mjs lo cuentan. Todo sin red.
//
//   npm test

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import juego from '../../juegos/lobo.js';
import { ROLES } from '../../juegos/lobo/constantes.js';
import { motivoInvalido } from '../../juegos/lobo/turno.js';
import { activosDe } from '../../juegos/lobo/estado.js';
import { BOTS, ARQUETIPOS } from '../../juegos/lobo-bots.js';
import { crearRng } from '../../rng.js';
import { resolverAgente } from '../../agentes.js';
import { correrPartida } from '../../arena.js';
import { llamadasInvalidasDe, resumenPorModelo, causaDe } from '../../invalidas.js';
import { analizar } from '../../../herramientas/analizar-invalidas.mjs';

const RAIZ = fileURLToPath(new URL('../../..', import.meta.url));

// La validacion de antes (booleana), copiada tal cual: la nueva debe aceptar y rechazar exactamente lo mismo.
function validarAntes(E, i, r) {
  const objetivoValido = (j, yo) => Number.isInteger(j) && E.vivos[j] === true && j !== yo;
  if (r.invalida || r.error) return false;
  const objetivo = () => objetivoValido(r.objetivo, i);
  switch (E.fase) {
    case 'cupido': return Array.isArray(r.enamorados) && r.enamorados.length === 2 && r.enamorados[0] !== r.enamorados[1] && r.enamorados.every((j) => objetivoValido(j, null));
    case 'lobos': return r.accion === 'matar' && objetivo() && E.roles[r.objetivo] !== 'lobo';
    case 'vidente': return r.accion === 'inspeccionar' && objetivo();
    case 'bruja': return typeof r.salvar === 'boolean' && (!r.salvar || (E.pociones.salvar && E.victima !== null)) && (r.matar === null || (E.pociones.matar && objetivoValido(r.matar, i)));
    case 'cazador': return r.accion === 'disparar' && objetivo();
    case 'dia': return objetivoValido(r.voto, i) && typeof r.mensaje === 'string' && r.mensaje.length <= 1000 && (r.afirmaRol === undefined || ROLES.includes(r.afirmaRol));
    default: return false;
  }
}

// Estados de partidas con bots en TODAS las fases, para probar con respuestas de todo tipo.
function estados() {
  const salida = [];
  for (let seed = 1; seed <= 12; seed++) {
    const rng = crearRng(seed), E = juego.crear(rng, { jugadores: seed % 2 ? 8 : 12 });
    for (let paso = 0; paso < 60 && !E.fin; paso++) {
      salida.push(structuredClone(E));
      const actores = activosDe(E);
      juego.aplicar(E, E.roles.map((_, i) => (actores[i] ? BOTS[ARQUETIPOS[i % ARQUETIPOS.length]](E, i, rng) : null)));
    }
  }
  return salida;
}

// Una respuesta valida del bot, estropeada de muchas maneras (tipo equivocado, fuera de rango, ausente, el propio asiento, un muerto...).
function variantes(E, i, buena) {
  const salida = [buena, null, 'texto', [], {}, { invalida: true }, { ...buena, error: 'OpenRouter 500' }];
  for (const campo of Object.keys(buena)) {
    for (const malo of [undefined, null, '3', 3.5, -1, 99, true, false, [], {}, 'x'.repeat(1001), 'vidente', 'rey', i, E.vivos.findIndex((v) => !v), E.roles.findIndex((r) => r === 'lobo')]) salida.push({ ...buena, [campo]: malo });
  }
  if (buena.enamorados) salida.push({ enamorados: [1, 1] }, { enamorados: [0] }, { enamorados: [0, 1, 2] }, { enamorados: [0, '1'] });
  salida.push({ ...buena, accion: 'inspeccionar' }, { ...buena, accion: 'matar' }, { ...buena, accion: 'disparar' }, { ...buena, salvar: true }, { ...buena, matar: i });
  return salida;
}

test('motivoInvalido acepta y rechaza EXACTAMENTE lo mismo que la validacion de antes, en todas las fases', () => {
  const vistas = new Set();
  let comparadas = 0;
  for (const E of estados()) {
    const rng = crearRng(7), actores = activosDe(E);
    E.roles.forEach((_, i) => {
      if (!actores[i]) return;
      vistas.add(E.fase);
      for (const r of variantes(E, i, BOTS.agresivo(E, i, rng))) {
        const original = r && typeof r === 'object' && !Array.isArray(r) ? { ...r, invalida: r.invalida === true } : { invalida: true };
        assert.equal(motivoInvalido(E, i, original) === null, validarAntes(E, i, original), `${E.fase} asiento ${i}: ${JSON.stringify(r)}`);
        comparadas++;
      }
    });
  }
  assert.deepEqual([...vistas].sort(), ['bruja', 'cazador', 'cupido', 'dia', 'lobos', 'vidente']);
  assert.ok(comparadas > 5000, `solo ${comparadas} comparaciones`);
});

test('cada motivo dice que campo fallo y que se recibio', () => {
  const E = juego.crear(crearRng(2));
  E.roles = ['lobo', 'lobo', 'vidente', 'bruja', 'cazador', 'cupido', 'aldeano', 'aldeano'];
  E.vivos[6] = false;
  const motivo = (fase, i, r) => { E.fase = fase; return motivoInvalido(E, i, { ...r, invalida: false }); };
  assert.match(motivo('dia', 7, { mensaje: 'hola', voto: '3' }), /voto debe ser un asiento entero \(recibió "3"\)/);
  assert.match(motivo('dia', 7, { mensaje: 'hola', voto: 7 }), /voto: no puede elegirse a sí mismo \(asiento 7\)/);
  assert.match(motivo('dia', 7, { mensaje: 'hola', voto: 6 }), /voto: el asiento 6 ya murió/);
  assert.match(motivo('dia', 7, { mensaje: 'hola', voto: 40 }), /el asiento 40 no existe \(hay 8\)/);
  assert.match(motivo('dia', 7, { mensaje: 5, voto: 1 }), /mensaje debe ser texto \(recibió 5\)/);
  assert.match(motivo('dia', 7, { mensaje: 'x'.repeat(1200), voto: 1 }), /mensaje de 1200 caracteres: el máximo es 1000/);
  assert.match(motivo('dia', 7, { mensaje: 'hola', voto: 1, afirmaRol: 'rey' }), /afirmaRol debe ser uno de .*aldeano \(recibió "rey"\)/);
  assert.match(motivo('lobos', 0, { accion: 'matar', objetivo: 1 }), /el asiento 1 es de la manada/);
  assert.match(motivo('lobos', 0, { accion: 'inspeccionar', objetivo: 2 }), /accion debe ser "matar" \(recibió "inspeccionar"\)/);
  assert.match(motivo('vidente', 2, { accion: 'inspeccionar' }), /objetivo debe ser un asiento entero \(recibió nada\)/);
  assert.match(motivo('cazador', 4, { accion: 'disparar', objetivo: 4 }), /no puede elegirse a sí mismo/);
  assert.match(motivo('cupido', 5, { enamorados: [1, 1] }), /los dos enamorados deben ser distintos/);
  assert.match(motivo('cupido', 5, { enamorados: 'a' }), /enamorados debe ser una lista de 2 asientos \(recibió "a"\)/);
  assert.match(motivo('bruja', 3, { salvar: 'si', matar: null }), /salvar debe ser true o false \(recibió "si"\)/);
  assert.match(motivo('bruja', 3, { salvar: true, matar: null }), /no hay víctima/);
  E.victima = 1; E.pociones.salvar = false;
  assert.match(motivo('bruja', 3, { salvar: true, matar: null }), /la poción de salvar ya se usó/);
  E.pociones.matar = false;
  assert.match(motivo('bruja', 3, { salvar: false, matar: 1 }), /la poción de matar ya se usó/);
  assert.match(motivo('bruja', 3, { salvar: false }), /matar debe ser null o un asiento entero \(recibió nada\)/);
  assert.equal(motivo('bruja', 3, { salvar: false, matar: null }), null);
  assert.match(motivoInvalido(E, 0, { invalida: false, error: 'OpenRouter 500: boom' }), /^error de API: OpenRouter 500: boom/);
  assert.match(motivoInvalido(E, 0, { invalida: true }), /no era un objeto JSON/);
});

// Un agente que contesta lo que se le diga (texto crudo), para ver que queda guardado.
const agenteDe = (texto, { uso = null, falla = null } = {}) => ({
  id: 'raro', nombre: 'Raro', color: '#888888', inicial: 'R', tipo: 'modelo', modelo: 'x/raro',
  async jugar() { if (falla) throw falla; return { respuesta: JSON.parse(texto), crudo: texto, uso }; },
});

test('una respuesta invalida guarda su motivo y su texto crudo (400 caracteres) en el registro privado, y solo ella', async () => {
  const mensaje = 'x'.repeat(900);
  const crudo = JSON.stringify({ mensaje, voto: '2' }); // el voto en texto, tras un mensaje largo
  const agentes = ARQUETIPOS.map((a, i) => (i === 6 ? agenteDe(crudo) : resolverAgente(a, juego)));
  const p = await correrPartida({ juego, agentes, seed: 5 });
  const dias = p.rondas.filter((r) => r.fase === 'dia' && r.privado.acciones.some((a) => a.asiento === 6));
  assert.ok(dias.length > 0);
  for (const r of dias) {
    const a = r.privado.acciones.find((x) => x.asiento === 6);
    assert.equal(a.invalida, true);
    assert.match(a.motivo, /voto debe ser un asiento entero \(recibió "2"\)/);
    assert.equal(a.crudo.length, 400);
    assert.equal(a.crudo, crudo.slice(0, 400));
    assert.ok(r.privado.acciones.filter((x) => x.asiento !== 6).every((x) => x.motivo === undefined && x.crudo === undefined), 'las validas no llevan motivo ni crudo');
  }
  // y la escena no lo ve: nada de eso esta en el registro publico
  assert.ok(!JSON.stringify(p.rondas.map((r) => r.publico)).includes('xxxxxxxx'));
});

test('la arena conserva el texto de una respuesta sin JSON o cortada por max_tokens y cuenta sus tokens', async () => {
  const cortada = Object.assign(new Error('Respuesta cortada por max_tokens (finish_reason=length): el modelo se quedó sin espacio antes de dar su jugada.'), { crudo: 'Voy a pensar quien... ', finishReason: 'length', uso: { prompt_tokens: 1200, completion_tokens: 4000, total_tokens: 5200 } });
  const agentes = ARQUETIPOS.map((a, i) => (i === 3 ? agenteDe('{}', { falla: cortada }) : resolverAgente(a, juego)));
  const p = await correrPartida({ juego, agentes, seed: 5 });
  const llamadas = p.usoPorJugador[3].llamadas;
  assert.ok(llamadas > 0);
  assert.equal(p.usoPorJugador[3].tokensSalida, 4000 * llamadas, 'las llamadas cortadas tambien cobran');
  assert.equal(p.usoPorJugador[3].tokensEntrada, 1200 * llamadas);
  assert.ok(p.tokensUsados >= 5200 * llamadas);
  const invalidas = llamadasInvalidasDe(p).filter((c) => c.asiento === 3);
  assert.equal(invalidas.length, llamadas);
  assert.ok(invalidas.every((c) => /finish_reason=length/.test(c.motivo) && c.crudo === 'Voy a pensar quien... ' && /finish_reason=length/.test(c.error)));
});

test('llamadasInvalidasDe y resumenPorModelo agrupan por modelo y por causa; causaDe cae al error o a «sin motivo»', () => {
  const partida = {
    jugadores: [{ id: 'a', nombre: 'A', modelo: 'p/a' }, { id: 'b', nombre: 'B', modelo: null }, { id: 'c', nombre: 'C' }],
    usoPorJugador: [{ llamadas: 4 }, { llamadas: 2 }, { llamadas: 9 }],
    rondas: [
      { turno: 1, ronda: 1, fase: 'dia', invalidas: [true, false, null], errores: [null, null, null], privado: { acciones: [{ asiento: 0, invalida: true, motivo: 'voto: no existe', crudo: '{"voto":99}' }] } },
      { turno: 2, ronda: 1, fase: 'dia', invalidas: [true, false, null], errores: [null, 'OpenRouter 500: x', null], privado: { acciones: [{ asiento: 0, invalida: true, motivo: 'voto: no existe', crudo: '{"voto":98}' }, { asiento: 1, invalida: true, motivo: 'error de API: OpenRouter 500: x', crudo: null }] } },
      { turno: 3, invalidas: [false, true, false], errores: [null, null, null] }, // un juego sin registro de motivos: solo sabe que fue invalida
    ],
  };
  const llamadas = llamadasInvalidasDe(partida);
  assert.deepEqual(llamadas.map((c) => [c.turno, c.id, causaDe(c)]), [[1, 'a', 'voto: no existe'], [2, 'a', 'voto: no existe'], [2, 'b', 'error de API: OpenRouter 500: x'], [3, 'b', 'sin motivo registrado']]);
  assert.equal(llamadas[0].crudo, '{"voto":99}');
  assert.equal(llamadas[0].fase, 'dia');
  const resumen = resumenPorModelo(partida);
  assert.deepEqual(resumen.map((f) => [f.id, f.invalidas, f.llamadas]), [['a', 2, 4], ['b', 2, 2]].sort((x, y) => y[1] - x[1] || 0));
  assert.deepEqual(resumen[0].causas, [{ causa: 'voto: no existe', veces: 2 }]);
  assert.deepEqual(llamadasInvalidasDe({}), []);
  assert.deepEqual(llamadasInvalidasDe(null), []);
});

test('la consola dice por que fallaron, por modelo, al terminar la corrida; analizar-invalidas muestra cada llamada con su texto', () => {
  const dir = mkdtempSync(join(tmpdir(), 'invalidas-'));
  try {
    // Una partida de bots no tiene invalidas: la consola no inventa avisos
    const r = spawnSync(process.execPath, ['src/correr.js', '--juego=lobo', `--jugadores=${ARQUETIPOS.join(',')}`, '--partidas=1', '--destino=pruebas', '--seed=7'], { cwd: RAIZ, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.doesNotMatch(r.stdout, /llamada\(s\) inválida\(s\)/);
    const ruta = /Guardado: (data\/pruebas\/[\w.\-]+\.json)/.exec(r.stdout)[1];
    const salida = spawnSync(process.execPath, ['herramientas/analizar-invalidas.mjs', `--archivo=${ruta.replace('data/', '')}`], { cwd: RAIZ, encoding: 'utf8' });
    assert.equal(salida.status, 0, salida.stderr);
    assert.match(salida.stdout, /0 llamada\(s\) inválida\(s\)/);
    rmSync(join(RAIZ, ruta), { force: true });

    // Una serie guardada con invalidas: la herramienta las lista con causa y crudo
    const serie = { partidas: [{ juego: { nombre: 'Lobo en la aldea' }, llamadas: 10, jugadores: [{ id: 'a', nombre: 'Qwen' }], usoPorJugador: [{ llamadas: 3 }],
      rondas: [{ turno: 5, ronda: 1, fase: 'dia', invalidas: [true], errores: [null], privado: { acciones: [{ asiento: 0, invalida: true, motivo: 'voto debe ser un asiento entero (recibió "3")', crudo: '{"mensaje":"hola","voto":"3"}' }] } }] }] };
    const archivo = join(dir, 'serie.json');
    writeFileSync(archivo, JSON.stringify(serie));
    const texto = spawnSync(process.execPath, ['herramientas/analizar-invalidas.mjs', `--archivo=${archivo}`], { cwd: RAIZ, encoding: 'utf8' }).stdout;
    assert.match(texto, /1 llamada\(s\) inválida\(s\) de 10/);
    assert.match(texto, /Qwen\s+1 de 3 inválida\(s\)/);
    assert.match(texto, /causa:\s+voto debe ser un asiento entero \(recibió "3"\)/);
    assert.match(texto, /crudo:\s+"\{\\"mensaje\\":\\"hola\\",\\"voto\\":\\"3\\"\}"/);
    assert.equal(analizar(serie).llamadas.length, 1);
    assert.throws(() => analizar(serie, { partida: 2 }), /no tiene la partida 2/);
    assert.equal(spawnSync(process.execPath, ['herramientas/analizar-invalidas.mjs'], { cwd: RAIZ, encoding: 'utf8' }).status, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
