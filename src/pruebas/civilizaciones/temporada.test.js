import test from 'node:test';
import assert from 'node:assert/strict';
import J from '../../juegos/civilizaciones.js';
import { crearRng } from '../../rng.js';
import { crearTemporada, hitosDe, cumpleNodo, textoTemporada } from '../../juegos/civilizaciones/temporada.js';
import { progreso } from '../../juegos/civilizaciones/arbol.js';
import { disponibles, investigar, actualizarEra } from '../../juegos/civilizaciones/tecnologia.js';
import { construir } from '../../juegos/civilizaciones/edificios.js';
import { modificadores } from '../../juegos/civilizaciones/economia.js';
import { comprobarInvariantes } from '../../juegos/civilizaciones/estado.js';
import { construirSistema, construirUsuario } from '../../prompt.js';
import { LIMITES_TEXTO, TOPE_TOKENS_ENTRADA } from '../../juegos/civilizaciones/constantes.js';
import { correrPartida } from '../../arena.js';

test('200 catalogos reproducibles, distintos y alcanzables; no se simulan partidas', () => {
  const huellas = new Set();
  for (let seed = 0; seed < 200; seed++) {
    const a = crearTemporada(seed);
    assert.deepEqual(a, crearTemporada(seed));
    huellas.add(JSON.stringify(a.nodos.map((n) => n.requiere)));
    assert.equal(a.nodos.length, 68);
    for (let era = 1; era <= 6; era++) {
      const centros = a.nodos.filter((n) => n.tipo === 'tecnologia' && n.era === era).map((n) => a.centros[n.id]);
      assert.equal(new Set(centros).size, 6, 'cada rama de una edad tiene un edificio distinto');
    }
    const hechos = new Set();
    for (let pasada = 0; pasada < a.nodos.length; pasada++) {
      for (const n of a.nodos) if (progreso(n.requiere, hechos).cumple) hechos.add(n.id);
    }
    assert.equal(hechos.size, a.nodos.length, `temporada ${seed}`);
    assert.throws(() => { a.nodos[0].era = 99; }, TypeError);
  }
  assert.equal(huellas.size, 200, 'cambian enlaces, no solo nombres o seed');
  for (const seed of [-1, 1.5, '1', NaN, 2 ** 32]) assert.throws(() => crearTemporada(seed));
});

test('temporada independiente del mapa, comun a ambos jugadores y guardada en el resultado', () => {
  const a = J.crear(crearRng(4), { seedTemporada: 12 });
  const b = J.crear(crearRng(8), { seedTemporada: 12 });
  const c = J.crear(crearRng(4), { seedTemporada: 13 });
  assert.deepEqual(a.temporada, b.temporada);
  assert.equal(a.seedMundo, c.seedMundo);
  assert.deepEqual(a.calendario, c.calendario);
  assert.equal(a.civs[0].temporada, a.civs[1].temporada);
  assert.notDeepEqual(a.temporada.nodos, c.temporada.nodos);
  assert.deepEqual(J.resultado(a).temporada, a.temporada);
  assert.notEqual(J.resultado(a).temporada, a.temporada);
  assert.match(J.vista(a, 0), /TEMPORADA 12/);
  assert.throws(() => J.crear(crearRng(4), { seedTemporada: null }), /requiere temporada/);
});

test('construir habilita investigar; reemplazar edificio conserva hitos sin regalar el edificio futuro', () => {
  const E = J.crear(crearRng(3));
  J.aplicar(E, [0, 1].map((s) => J.normalizar(J.bots.equilibrado.fn(E, s, crearRng(s)), E)));
  const c = E.civs[0], centro = E.temporada.nodos.find((n) => n.id === E.temporada.centros.T1);
  assert.deepEqual(disponibles(c), []);
  assert.match(investigar(c, 'T1', 1), /requisitos/);
  const region = c.regiones[0];
  const porId = J.normalizar({ ordenes: [`construir R01 ${centro.id}`] }, E);
  assert.equal(porId.ordenes[0].edificio, centro.nombre);
  assert.equal(construir(c, region, centro.nombre, 2, modificadores(c, 2)), null);
  assert.ok(disponibles(c).includes('T1'));
  delete c.edificios[region];
  assert.equal(investigar(c, 'T1', 1), null);
  assert.ok(hitosDe(c).has(centro.id));
  const futuro = E.temporada.nodos.find((n) => n.tipo === 'edificio' && n.era === 2);
  assert.match(construir(c, region, futuro.nombre, 2, modificadores(c, 2)), /requisitos/);
});

test('edad exige tres pares de su grupo, no tres tecnologias cualesquiera', () => {
  const E = J.crear(crearRng(4)), c = E.civs[0];
  const puerta = E.temporada.nodos.find((n) => n.id === 'A2').requiere.opciones[1];
  const seleccion = puerta.opciones.slice(0, 3);
  c.tecnologias = seleccion.map((p) => p.opciones[1]);
  assert.equal(cumpleNodo(c, 'A2'), false);
  assert.deepEqual(actualizarEra(c), []);
  c.construidos = seleccion.map((p) => E.temporada.nodos.find((n) => n.id === p.opciones[0]).nombre);
  assert.match(textoTemporada(c), /3\/3 ramas completas/);
  assert.deepEqual(actualizarEra(c), [2]);
});

test('una partida: bots leen el arbol, progresan sin violaciones y entrada cabe con textos maximos', () => {
  const E = J.crear(crearRng(5)), bots = ['cientifico', 'equilibrado'];
  const estados = [], registros = [];
  let maximo = 0;
  while (!J.terminado(E)) {
    for (const s of [0, 1]) {
      const copia = structuredClone(E);
      copia.civs[s].nota = 'n'.repeat(LIMITES_TEXTO.nota);
      copia.civs[1 - s].mensaje = 'm'.repeat(LIMITES_TEXTO.mensaje);
      copia.civs[1 - s].lema = 'l'.repeat(LIMITES_TEXTO.lema);
      const tokens = Math.ceil((construirSistema(J) + '\n' + construirUsuario(J.vista(copia, s))).length / 1.97);
      maximo = Math.max(maximo, tokens);
    }
    const r = J.aplicar(E, bots.map((b, s) => J.normalizar(J.bots[b].fn(E, s, crearRng(s)), E)));
    registros.push(r);
    assert.deepEqual(comprobarInvariantes(E), []);
    estados.push(E.civs.map((c) => c.era));
  }
  assert.ok(maximo <= TOPE_TOKENS_ENTRADA, `maximo ${maximo}`);
  assert.ok(E.civs.every((c) => c.era >= 3 && c.construidos.length >= 3));
  assert.equal(registros.flatMap((r) => r.civs.flatMap((c) => c.ordenes)).filter((o) => o.estado === 'descartada').length, 0);
  assert.equal(estados.length, 30);
});

test('ensayo de interfaz con modelos simulados: reciben texto, construyen e investigan sin acceso al estado', async () => {
  const simulado = (id) => {
    let llamadas = 0;
    return { id, nombre: id, tipo: 'modelo', async jugar(entrada) {
      assert.equal(entrada.estado, undefined);
      assert.equal(entrada.i, undefined);
      assert.match(entrada.vista, /TEMPORADA 1/);
      llamadas++;
      if (llamadas > 1) return { respuesta: { ordenes: [] } };
      const region = /^1: (R\d+)/m.exec(entrada.vista)[1];
      const centro = /^T1:\(A1\+(B\d+)\)/m.exec(entrada.vista)[1];
      return { respuesta: JSON.stringify({
        fundacion: { nombre: id, lema: '', sitio: 1, rasgos: ['eruditos', 'constructores'] },
        ordenes: [`construir ${region} ${centro}`, 'investigar T1'],
      }) };
    } };
  };
  const p = await correrPartida({ juego: J, agentes: [simulado('A'), simulado('B')], seed: 5, maxRondas: 4 });
  assert.equal(p.llamadas, 8);
  assert.ok(p.metricas.every((m) => m.tecnologias >= 1 && m.ordenesValidas === m.ordenesTotal));
  assert.ok(p.rondas.every((r) => r.errores.every((e) => e === null)));
});
