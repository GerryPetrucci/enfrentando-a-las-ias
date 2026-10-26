import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { jugarLobo } from './ayudas-lobo.js';
import { construirLineaDeTiempo, fragmentarMensaje, erroresDeEstado, mejoresRondas } from '../../../web/casino/linea-de-tiempo-lobo.js';
import { colocarLobo } from '../../../web/casino/layout-lobo.js';
import { fotogramasDe, NOCHES, ASAMBLEA } from '../../../web/casino/lobo-arte.js';
import { armarLinea, motivoDeNoReproducible, escenaDe } from '../../../web/casino/lineas.js';
import { recortarClip } from '../../../web/casino/escena-config.js';
import { Mesa } from '../../../web/casino/mesa-lobo.js';

test('8/12: escena registrada, intro, rondas y estado final coinciden con el registro público', async () => {
  for (const n of [8, 12]) {
    const partida = jugarLobo(3, n), copia = structuredClone(partida);
    assert.equal(motivoDeNoReproducible('lobo', partida), null);
    const beats = await armarLinea('lobo', partida, { camara: 12 });
    assert.equal(beats[0].tipo, 'intro');
    for (const b of beats.filter((b) => Number.isInteger(b.asiento))) assert.ok(b.lineas.some((l) => l.texto.includes(`${partida.jugadores[b.asiento].nombre} · ${b.asiento + 1}`)), 'El hecho visible lleva el número de asiento en pantalla (desde 1, sin cero a la izquierda), aunque la voz lo resuma o calle.');
    assert.ok(beats.every((b) => !b.camara.length)); // La opción camara no levanta el secreto.
    const ultimo = beats.at(-1).pasos.find((p) => p.tipo === 'estado-final');
    assert.equal(ultimo.fin, true);
    assert.deepEqual(ultimo.puntos, partida.puntos);
    assert.deepEqual(ultimo.jugadores.map((j) => j.rol), partida.rondas.at(-1).publico.camara.jugadores.map((j) => j.rol));
    assert.deepEqual(partida, copia);
    const clip = recortarClip(beats, 2, 2);
    assert.ok(clip.every((b) => b.mano === 2));
    assert.deepEqual(clip[0].pasos[0], beats.find((b) => b.mano === 2).pasos[0]);
  }
  assert.match(motivoDeNoReproducible('lobo', { jugadores: [], rondas: [{}] }), /formato/);
  assert.equal(escenaDe('lobo').camaraPorDefecto, 0);
});

test('no lee acciones privadas, instantáneas futuras ni métricas finales para construir la cámara', () => {
  const p = jugarLobo();
  for (const r of p.rondas) {
    Object.defineProperty(r, 'privado', { get: () => { throw new Error('Filtración privada'); } });
    Object.defineProperty(r.publico, 'camara', { get: () => { throw new Error('Adelanto de instantánea'); } });
  }
  Object.defineProperty(p, 'metricas', { get: () => { throw new Error('Filtración de roles finales'); } });
  assert.ok(construirLineaDeTiempo(p).length);
});

test('cada identidad aparece solo en su muerte; otros muertos del mismo turno esperan su beat', () => {
  for (const n of [8, 12]) for (let seed = 0; seed < 20; seed++) {
    const beats = construirLineaDeTiempo(jugarLobo(seed, n));
    const conocidos = new Map();
    let muertes = 0;
    for (const beat of beats) {
      const [antes, paso, despues] = beat.pasos;
      for (const j of antes.jugadores) assert.equal(j.rol, conocidos.get(j.asiento));
      if (paso.tipo === 'enamorados' && Number.isInteger(paso.cupido)) conocidos.set(paso.cupido, 'cupido');
      if (paso.tipo === 'muerte') { conocidos.set(paso.asiento, paso.rol); muertes++; }
      if (paso.tipo === 'final') despues.jugadores.forEach((j) => conocidos.set(j.asiento, j.rol));
      for (const j of despues.jugadores) assert.equal(j.rol, conocidos.get(j.asiento));
      if (paso.tipo === 'noche') assert.ok(fotogramasDe(paso).every((ruta) => ruta.includes('misteriosa')));
      if (paso.tipo === 'disparo') assert.equal(conocidos.get(paso.asiento), 'cazador');
    }
    assert.ok(muertes > 0);
  }
});

test('noches privadas colapsan en una sola escena genérica por ronda, sin actores ni víctimas', () => {
  const p = jugarLobo(), beats = construirLineaDeTiempo(p);
  const noches = beats.filter((b) => b.tipo === 'noche');
  assert.equal(new Set(noches.map((b) => b.mano)).size, noches.length);
  for (const b of noches) {
    assert.equal(b.asiento, null);
    assert.deepEqual(b.pasos[1], { tipo: 'noche' });
    assert.doesNotMatch(b.texto, /bruja|vidente|objetivo|víctima/i);
  }
  const cupido = beats.find((b) => b.tipo === 'enamorados');
  assert.equal(cupido.pasos[1].asiento, undefined);
  assert.equal(cupido.pasos[1].asientos.length, 2);
  assert.ok(fotogramasDe(cupido.pasos[1]).every((r) => r.includes('cupido')));
});

test('votación conserva todos los votos públicos; no mata antes del siguiente beat', () => {
  const beats = construirLineaDeTiempo(jugarLobo());
  for (const b of beats.filter((b) => b.tipo === 'votacion')) {
    assert.deepEqual(b.pasos[0].jugadores, b.pasos[2].jugadores);
    assert.ok(b.pasos[1].votos.length > 0);
    assert.ok(b.pasos[1].votos.every((v) => Number.isInteger(v.asiento) && Number.isInteger(v.voto)));
  }
});

test('mensajes largos se conservan en fragmentos legibles; una afirmación no confirma identidad', () => {
  const mensaje = 'Soy vidente. <img src=x onerror=alert(1)> '.repeat(20);
  const p = jugarLobo();
  const evento = p.rondas.flatMap((r) => r.publico.eventos).find((e) => e.tipo === 'mensaje');
  evento.mensaje = mensaje;
  const partes = fragmentarMensaje(mensaje);
  assert.ok(partes.length > 1); assert.ok(partes.every((p) => p.length <= 180));
  assert.equal(partes.join(' '), mensaje.trim());
  for (const b of construirLineaDeTiempo(p).filter((b) => b.tipo === 'mensaje' && b.asiento === evento.asiento)) {
    assert.equal(b.pasos[1].rol, undefined);
    assert.deepEqual(b.pasos[0].jugadores, b.pasos[2].jugadores);
  }
  assert.equal(fragmentarMensaje('x'.repeat(1000)).join(''), 'x'.repeat(1000));
});

test('una partida truncada no inventa final ni revela roles vivos', () => {
  const p = jugarLobo(); p.truncada = true;
  const beats = construirLineaDeTiempo(p);
  assert.ok(!beats.some((b) => b.tipo === 'final'));
  for (const j of beats.at(-1).pasos[2].jugadores.filter((j) => j.vivo && j.rol !== 'cupido')) assert.equal(j.rol, undefined);
});

test('las cuatro combinaciones de formato y mesa caben; no se solapan escenario, asientos y subtítulos', () => {
  for (const f of ['9x16', '16x9']) for (const n of [8, 12]) {
    const L = colocarLobo(f, n), z = L.zona;
    const cajas = [L.escenario, L.subtitulos, ...L.asientos];
    assert.equal(L.asientos.length, n);
    for (const r of cajas) {
      assert.ok(r.x >= z.x && r.y >= z.y);
      assert.ok(r.x + r.ancho <= z.x + z.ancho + 0.001 && r.y + r.alto <= z.y + z.alto + 0.001);
      for (const q of cajas) if (q !== r) assert.ok(r.x + r.ancho <= q.x || q.x + q.ancho <= r.x || r.y + r.alto <= q.y || q.y + q.alto <= r.y);
    }
  }
  assert.throws(() => colocarLobo('hoja', 8)); assert.throws(() => colocarLobo('9x16', 10));
});

test('7 recortes manuales (la noche misteriosa y la asamblea) con dimensiones exactas y fuente; noche y día usan selección segura', () => {
  const recortes = JSON.parse(readFileSync(new URL('../../../web/arte/lobo/recortes.json', import.meta.url), 'utf8').replace(/^﻿/, ''));
  const rutas = [...Object.values(NOCHES).flat(), ...ASAMBLEA];
  assert.equal(recortes.length, 7);
  assert.equal(rutas.length, recortes.length, 'cada imagen de la escena tiene su recorte y viceversa');
  for (const ruta of rutas) {
    const png = readFileSync(new URL(`../../../web/${ruta}`, import.meta.url));
    const datos = recortes.find((r) => ruta.endsWith('/' + r.archivo));
    assert.equal(png.readUInt32BE(16), datos.ancho); assert.equal(png.readUInt32BE(20), datos.alto);
    assert.ok(existsSync(new URL(`../../../privado/prototipos/lobo-assets/${datos.origen}`, import.meta.url)));
  }
  assert.equal(fotogramasDe({ tipo: 'muerte', rol: 'lobo' })[0], ASAMBLEA[0]);
  assert.deepEqual(fotogramasDe({ tipo: 'mensaje' }), [ASAMBLEA[0]]);
});

test('verificación de estado detecta identidades adelantadas y restos de votos al volver a noche', () => {
  const b = construirLineaDeTiempo(jugarLobo()).find((b) => b.tipo === 'noche');
  const visible = { jugadores: b.pasos[2].jugadores, votos: 0, mensaje: false };
  assert.deepEqual(erroresDeEstado(visible, b), []);
  assert.ok(erroresDeEstado({ ...visible, votos: 1 }, b).length);
  assert.ok(erroresDeEstado({ ...visible, jugadores: [] }, b).length);
  assert.ok(erroresDeEstado(null, b).length);
  assert.deepEqual(mejoresRondas(null), []);
});

test('escena de producción admite dos Videntes: retratos independientes, ocultos hasta su revelación pública', () => {
  const p = jugarLobo(3, 12), beats = construirLineaDeTiempo(p);
  const mesa = { asientos: Array.from({ length: 12 }, () => ({
    nodo: { classList: { toggle() {} }, dataset: {} }, retrato: { className: '' }, rol: { textContent: '' },
  })) };
  Mesa.prototype.aplicarEstado.call(mesa, beats[0].pasos[0]);
  assert.ok(mesa.asientos.every((a) => !a.retrato.className.includes('revelado-vidente')));
  for (const b of beats) {
    const estado = b.pasos.find((p) => p.tipo === 'estado-final');
    Mesa.prototype.aplicarEstado.call(mesa, estado);
    for (const j of estado.jugadores) {
      assert.equal(mesa.asientos[j.asiento].retrato.className.includes('revelado-vidente'), j.rol === 'vidente');
      if (j.vivo && !estado.fin) assert.equal(mesa.asientos[j.asiento].nodo.dataset.rol, j.rol === 'cupido' ? 'cupido' : '');
    }
  }
  assert.equal(mesa.asientos.filter((a) => a.retrato.className.includes('revelado-vidente')).length, 2);
  for (const formato of ['9x16', '16x9']) assert.equal(colocarLobo(formato, 12).asientos.length, 12);
  assert.ok(beats.filter((b) => b.tipo === 'noche').every((b) => fotogramasDe(b.pasos[1]).every((ruta) => ruta.includes('misteriosa'))));
});
