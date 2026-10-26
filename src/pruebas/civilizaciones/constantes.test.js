import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TECNOLOGIAS, EDIFICIOS, RASGOS, DILEMAS, EVENTOS, INVASIONES, MARAVILLAS, INDICE, INDICE_MAXIMO, RAMAS, ERAS, COSTO_TECNOLOGIA, TEC, REPARTO_INICIAL, OFICIOS, LIMITES_TEXTO,
  ALMACEN_INICIAL, PUNTOS,
} from '../../juegos/civilizaciones/constantes.js';
import { describir } from '../../juegos/civilizaciones/efectos.js';

test('36 tecnologias: 6 ramas x 6 eras, cada una con su previa y con ids unicos', () => {
  assert.equal(TECNOLOGIAS.length, 36);
  assert.equal(RAMAS.length, 6);
  assert.equal(new Set(TECNOLOGIAS.map((t) => t.id)).size, 36);
  for (const r of RAMAS) assert.deepEqual(TECNOLOGIAS.filter((t) => t.rama === r.id).map((t) => t.era), [1, 2, 3, 4, 5, 6], r.nombre);
  assert.equal(TECNOLOGIAS.reduce((s, t) => s + t.era, 0), INDICE.tecnologia.referencia, 'las 36 suman la referencia del pilar de Tecnologia (126)');
  assert.deepEqual(COSTO_TECNOLOGIA, [9, 17, 29, 43, 63, 86], 'escalera calibrada en la capa 1 (la spec partia de 10-19-32-48-70-96)');
  assert.equal(ERAS, 6);
});

test('26 tipos de edificio, 8 rasgos, 5 dilemas de 3 opciones, 11 eventos (2 repentinos), 4 invasiones y 6 Maravillas', () => {
  assert.equal(EDIFICIOS.length, 26);
  assert.equal(new Set(EDIFICIOS.map((e) => e.id)).size, 26);
  assert.equal(RASGOS.length, 8);
  assert.deepEqual(Object.keys(DILEMAS).map(Number), [2, 3, 4, 5, 6]);
  for (const d of Object.values(DILEMAS)) assert.equal(d.opciones.length, 3);
  assert.equal(EVENTOS.length, 11);
  assert.deepEqual(EVENTOS.filter((e) => e.repentino).map((e) => e.id), ['terremoto', 'incendio']);
  assert.deepEqual(INVASIONES, [{ turno: 8, fuerza: 6 }, { turno: 14, fuerza: 14 }, { turno: 20, fuerza: 26 }, { turno: 26, fuerza: 44 }]);
  assert.equal(MARAVILLAS.length, 6);
  for (const m of MARAVILLAS) assert.ok(TEC[m.tec], `${m.id}: su tecnologia existe`);
});

test('el Indice maximo es 100 (1.2.0: 2.5 por Maravilla, maximo 15 con las seis)', () => {
  assert.equal(INDICE_MAXIMO, 100);
  assert.equal(INDICE.maravillas.porMaravilla * MARAVILLAS.length, INDICE.maravillas.puntos);
});

test('el reparto inicial suma 100 en decenas y los numeros iniciales son los de la spec', () => {
  assert.equal(REPARTO_INICIAL.length, OFICIOS.length);
  assert.equal(REPARTO_INICIAL.reduce((a, b) => a + b, 0), 100);
  assert.ok(REPARTO_INICIAL.every((x) => x % 10 === 0));
  assert.deepEqual(ALMACEN_INICIAL, { Comida: 20, Madera: 10, Roca: 6, Hierro: 0, Oro: 6 });
  assert.deepEqual(LIMITES_TEXTO, { nombre: 24, lema: 60, mensaje: 140, nota: 250, razon: 160 });
  assert.deepEqual(PUNTOS, { ganador: 3, empate: 1, perdedor: 0 });
});

test('todo efecto tiene frase: ninguna lista de efectos del juego lanza al describirse y ninguna sale vacia (salvo los ocultos)', () => {
  const listas = [
    ...RASGOS.map((r) => r.efectos), ...EDIFICIOS.map((e) => e.efectos), ...TECNOLOGIAS.map((t) => t.efectos).filter((e) => e.some((x) => !x.oculto)),
    ...MARAVILLAS.map((m) => m.efectos), ...Object.values(DILEMAS).flatMap((d) => d.opciones.map((o) => o.efectos)),
  ];
  for (const l of listas) assert.ok(describir(l).length > 0);
});

test('el texto de los efectos sale de los numeros: 0.15 se escribe 15% (sin errores de coma flotante)', () => {
  assert.equal(describir([{ t: 'pct', rec: ['Cultura'], v: -0.15 }]), '-15% Cultura');
  assert.equal(describir([{ t: 'pct', rec: ['Roca', 'Hierro'], v: 0.29 }]), '+29% Roca y Hierro');
  assert.equal(describir([{ t: 'pct', rec: ['Madera', 'Roca', 'Hierro'], v: 0.2 }, { t: 'estabilidad', v: -5 }]), '+20% Madera, Roca y Hierro, -5 Estabilidad');
});
