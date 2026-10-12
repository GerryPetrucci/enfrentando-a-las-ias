// El marcador agrega resultados de cualquier juego sin conocerlos. Se prueba con episodios inventados: no hay red ni API.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { armarMarcador, leerEpisodios } from '../marcador.js';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const jug = (id, tipo = 'bot') => ({ id, nombre: id.toUpperCase(), color: '#111111', tipo, modelo: tipo === 'modelo' ? `x/${id}` : null });

const episodioDilema = {
  etiqueta: '2026-10-09-dilema-a-vs-b', fecha: '2026-10-09T10:00:00.000Z', seedBase: 1,
  juego: { id: 'dilema', nombre: 'Dilema', categoria: 'Traición y confianza' },
  partidas: [
    { jugadores: [jug('a'), jug('b')], puntos: [20, 15], ganador: 0, empate: false,
      metricas: [{ traiciones: 2, promesasHechas: 9, promesasRotas: 1, jugadasInvalidas: 0 }, { traiciones: 5, promesasHechas: 9, promesasRotas: 3, jugadasInvalidas: 1 }] },
    { jugadores: [jug('b'), jug('a')], puntos: [10, 10], ganador: null, empate: true,
      metricas: [{ traiciones: 1, promesasHechas: 9, promesasRotas: 0, jugadasInvalidas: 0 }, { traiciones: 1, promesasHechas: 9, promesasRotas: 0, jugadasInvalidas: 0 }] },
  ],
};

const fila = (m, categoria, id) => m.categorias.find((c) => c.nombre === categoria).tabla.find((f) => f.id === id);

test('el Dilema se agrega como siempre: puntos por partida, V-E-D, traiciones y fiabilidad', () => {
  const m = armarMarcador([{ archivo: 'dilema.json', ep: episodioDilema }], '2026-10-09T12:00:00.000Z');
  const a = fila(m, 'Traición y confianza', 'a'), b = fila(m, 'Traición y confianza', 'b');
  assert.equal(a.partidas, 2);
  assert.deepEqual([a.victorias, a.empates, a.derrotas], [1, 1, 0]);
  assert.equal(a.puntosPorPartida, 15);
  assert.equal(a.traiciones, 3);
  assert.equal(a.fiabilidad, +(1 - 1 / 18).toFixed(3));
  assert.deepEqual([b.victorias, b.empates, b.derrotas], [0, 1, 1]);
  assert.equal(b.jugadasInvalidas, 1);
  assert.equal(a.obediencia, null);
  assert.deepEqual(m.categorias[0].tabla.map((f) => f.id), ['a', 'b']);
  assert.equal(m.generado, '2026-10-09T12:00:00.000Z');
});

test('la obediencia es el porcentaje de ordenes validas de todas las partidas, no el promedio de promedios', () => {
  const conquista = {
    etiqueta: '2026-10-09-conquista-a-vs-b', fecha: '2026-10-10T10:00:00.000Z', seedBase: 7,
    juego: { id: 'conquista', nombre: 'Guerra de territorios', categoria: 'Estrategia y conquista' },
    serie: { partidas: 2, rotar: true, mismoSeed: true },
    partidas: [
      { jugadores: [jug('a'), jug('b')], puntos: [5, 3], ganador: 0, empate: false,
        metricas: [{ traiciones: 1, promesasHechas: 2, promesasRotas: 1, jugadasInvalidas: 0, ordenesValidas: 9, ordenesTotal: 10 }, { traiciones: 0, promesasHechas: 2, promesasRotas: 0, jugadasInvalidas: 2, ordenesValidas: 0, ordenesTotal: 0 }] },
      { jugadores: [jug('b'), jug('a')], puntos: [3, 5], ganador: 1, empate: false,
        metricas: [{ traiciones: 0, promesasHechas: 0, promesasRotas: 0, jugadasInvalidas: 0, ordenesValidas: 1, ordenesTotal: 10 }, { traiciones: 0, promesasHechas: 0, promesasRotas: 0, jugadasInvalidas: 0, ordenesValidas: 10, ordenesTotal: 10 }] },
    ],
  };
  const m = armarMarcador([{ archivo: 'c.json', ep: conquista }]);
  const a = fila(m, 'Estrategia y conquista', 'a'), b = fila(m, 'Estrategia y conquista', 'b');
  assert.equal(a.obediencia, +(19 / 20).toFixed(3));   // 9+10 de 10+10
  assert.equal(b.obediencia, +(1 / 10).toFixed(3));    // la partida con 0 de 0 no cuenta
  assert.equal(a.traiciones, 1);
  assert.equal(a.fiabilidad, 0.5);
  assert.equal(b.jugadasInvalidas, 2);
});

test('cada episodio trae su juego, su serie y el enfrentamiento, del mas nuevo al mas viejo', () => {
  const nuevo = { ...episodioDilema, etiqueta: 'nuevo', fecha: '2026-10-11T00:00:00.000Z', serie: { partidas: 2, rotar: true, mismoSeed: false } };
  const m = armarMarcador([{ archivo: 'viejo.json', ep: episodioDilema }, { archivo: 'nuevo.json', ep: nuevo }]);
  assert.deepEqual(m.episodios.map((e) => e.archivo), ['nuevo.json', 'viejo.json']);
  assert.equal(m.episodios[0].juego.id, 'dilema');
  assert.equal(m.episodios[0].enfrentamiento, 'A vs B');
  assert.deepEqual(m.episodios[0].serie, { partidas: 2, rotar: true, mismoSeed: false });
  assert.equal(m.episodios[1].serie, null);
  assert.equal(m.episodios[0].partidas, 2);
});

test('un archivo sin partidas se ignora', () => {
  const m = armarMarcador([{ archivo: 'raro.json', ep: { algo: 1 } }]);
  assert.deepEqual(m.categorias, []);
  assert.deepEqual(m.episodios, []);
});

test('leerEpisodios solo lee los .json de la carpeta: no entra a data/pruebas ni lee otros archivos', () => {
  const dir = mkdtempSync(join(tmpdir(), 'marcador-'));
  try {
    writeFileSync(join(dir, 'a.json'), JSON.stringify(episodioDilema));
    writeFileSync(join(dir, 'notas.txt'), 'no soy un resultado');
    mkdirSync(join(dir, 'pruebas'));
    writeFileSync(join(dir, 'pruebas', 'practica.json'), JSON.stringify(episodioDilema));
    const leidos = leerEpisodios(dir);
    assert.deepEqual(leidos.map((x) => x.archivo), ['a.json']);
    assert.equal(leidos[0].ep.etiqueta, '2026-10-09-dilema-a-vs-b');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('la consola puede revisar otra carpeta (por ejemplo data/pruebas) sin tocar web/marcador.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'marcador-'));
  const real = join(RAIZ, 'web', 'marcador.json');
  const antes = existsSync(real) ? readFileSync(real, 'utf8') : null;
  try {
    writeFileSync(join(dir, 'practica.json'), JSON.stringify(episodioDilema));
    const r = spawnSync(process.execPath, ['src/marcador.js', `--data=${dir}`, `--salida=${join(dir, 'salida.json')}`], { cwd: RAIZ, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const salida = JSON.parse(readFileSync(join(dir, 'salida.json'), 'utf8'));
    assert.equal(salida.categorias[0].tabla.length, 2);
    assert.equal(existsSync(real) ? readFileSync(real, 'utf8') : null, antes, 'web/marcador.json cambio');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
