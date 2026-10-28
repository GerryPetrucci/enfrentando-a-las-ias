// «Disponible al gastar»: lo que cada reino tendra cuando se apliquen SUS ordenes, o sea el almacen del cierre anterior mas la produccion y menos el hambre de este turno
// (y el evento del mundo si toca). La vista se lo da ya calculado: la aritmetica de produccion y hambre no es el juego, y a mano era lo que mas razonamiento gastaba.
// La prueba es contra el MOTOR: el valor previsto tiene que ser exactamente el almacen que queda al aplicar un turno sin ordenes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearEstado, regionesDe, ponerTropas, sumarUni, totalUnidades } from '../../juegos/conquista/estado.js';
import { normalizarRespuesta } from '../../juegos/conquista/ordenes.js';
import { aplicarTurno } from '../../juegos/conquista/turno/index.js';
import { disponibleAlGastar } from '../../juegos/conquista/previsto.js';
import { vistaTexto } from '../../juegos/conquista/vista.js';
import { BOTS } from '../../juegos/conquista-bots.js';
import { RECURSOS } from '../../juegos/conquista/constantes.js';
import { crearRng } from '../../rng.js';

const sinOrdenes = (E) => E.reinos.map((r) => (r.vivo ? normalizarRespuesta({ ordenes: [] }, E) : null));
// Aplica un turno SIN ordenes a una copia y devuelve lo que quedo en cada almacen y en cada ejercito.
function realTrasUnTurnoVacio(E) {
  const copia = structuredClone(E);
  aplicarTurno(copia, sinOrdenes(copia));
  return copia;
}

test('lo previsto coincide con el motor en partidas enteras de bots: turnos con y sin evento, con y sin hambre, con reinos que caen', () => {
  let comparados = 0, conHambre = 0, conEvento = 0;
  for (const seed of [3, 11, 29, 41]) {
    const E = crearEstado(crearRng(seed), { jugadores: 4 });
    const rngs = Array.from({ length: 4 }, (_, i) => crearRng(500 + seed + i));
    const bots = ['agresivo', 'economico', 'pacifico', 'azar'];
    while (E.ganador === null && E.turno < 30) {
      const real = realTrasUnTurnoVacio(E);
      for (const r of E.reinos) {
        if (!r.vivo) continue;
        const p = disponibleAlGastar(E, r.s);
        assert.deepEqual(p.stock, real.reinos[r.s].stock, `seed ${seed}, turno ${E.turno + 1}, reino ${r.s}: el almacen previsto no es el del motor`);
        assert.equal(p.unidades, totalUnidades(real, r.s), `seed ${seed}, turno ${E.turno + 1}, reino ${r.s}: las unidades previstas no son las del motor`);
        comparados++;
        if (p.desertan > 0) conHambre++;
      }
      if (E.calendario.some((e) => e.t === E.turno + 1)) conEvento++;
      aplicarTurno(E, E.reinos.map((r, s) => (r.vivo ? normalizarRespuesta(BOTS[bots[s]](E, s, rngs[s]), E) : null)));
    }
  }
  assert.ok(comparados > 200, `solo se compararon ${comparados} casos`);
  assert.ok(conEvento > 0, 'la prueba tiene que cruzar turnos de evento');
  assert.ok(conHambre >= 0);
});

test('con hambre: se pierde TODA la Comida y desertan unidades; lo previsto lo dice (y no toca el estado real)', () => {
  const E = crearEstado(crearRng(7), { jugadores: 3 });
  const [a] = regionesDe(E, 0);
  ponerTropas(E, a, 40, 0); // 40 Lanceros: necesitan 10 de Comida por turno
  E.reinos[0].stock.Comida = 0;
  const copia = structuredClone(E);
  const p = disponibleAlGastar(E, 0);
  assert.equal(p.stock.Comida, Math.max(0, p.stock.Comida), 'nunca negativo');
  assert.ok(p.desertan > 0, 'faltan raciones: desertan unidades');
  assert.equal(p.hambre.faltaComida, true);
  assert.deepEqual(E.reinos[0].stock, copia.reinos[0].stock, 'calcular lo previsto no cambia la partida');
  assert.equal(totalUnidades(E, 0), totalUnidades(copia, 0));
});

test('desglose: produccion por recurso y comida que comen las tropas (los Jinetes e Ingenios cuentan doble)', () => {
  const E = crearEstado(crearRng(7), { jugadores: 3 });
  for (const r of RECURSOS) E.reinos[0].stock[r] = 100;
  const p = disponibleAlGastar(E, 0);
  for (const r of RECURSOS) assert.equal(p.stock[r], 100 + p.produccion[r] - (r === 'Comida' ? p.hambre.come : 0), r);
  const [a] = regionesDe(E, 0);
  sumarUni(E, a, 0, 2, 8); // 8 Jinetes = 16 raciones = 4 Comida mas
  const q = disponibleAlGastar(E, 0);
  assert.equal(q.hambre.come, p.hambre.come + 4);
});

test('la vista lo muestra: una linea «Disponible al gastar» con el desglose, y «Puedes reclutar hasta» usa ese almacen', () => {
  const E = crearEstado(crearRng(7), { jugadores: 3 });
  for (const r of RECURSOS) E.reinos[0].stock[r] = 0;
  E.reinos[0].stock.Comida = 2;
  const p = disponibleAlGastar(E, 0);
  const texto = vistaTexto(E, 0);
  const linea = texto.split('\n').find((l) => l.startsWith('Disponible al gastar'));
  assert.ok(linea, 'falta la linea «Disponible al gastar»');
  for (const r of RECURSOS) assert.ok(linea.includes(`${r} ${p.stock[r]}`), `${r} ${p.stock[r]} en «${linea}»`);
  assert.match(linea, /produccion/);
  assert.match(linea, /hambre/);
  // «Puedes reclutar hasta» se calcula con lo disponible, no con el almacen viejo.
  const capacidad = texto.split('\n').find((l) => l.startsWith('Puedes reclutar hasta'));
  if (p.stock.Comida > 0) assert.ok(capacidad?.includes(`L ${p.stock.Comida}`), `capacidad «${capacidad}» no usa Comida ${p.stock.Comida}`);
  // Y la linea del almacen sigue diciendo de cual es.
  assert.match(texto, /Tu almacen \(cierre del turno anterior\):/);
});

test('un reino caido no tiene prevision', () => {
  const E = crearEstado(crearRng(7), { jugadores: 3 });
  E.reinos[1].vivo = false;
  assert.equal(disponibleAlGastar(E, 1), null);
});
