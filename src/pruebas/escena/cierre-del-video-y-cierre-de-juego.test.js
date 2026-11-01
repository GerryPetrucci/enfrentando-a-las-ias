// Duda y apuesta y Triple dado llaman `cierre` a su propio fin de mano o de ronda (tipo de beat `cierre`, con su animacion en METODOS), y el cierre de cada VIDEO (web/casino/cierre.js) tambien
// era un beat de tipo `cierre`. La mesa base los confundia: el fin de mano mostraba la tarjeta del video VACIA sobre la mesa (y su animacion nunca corria), y `conCierre` creia que la pieza ya
// traia su cierre cuando el ultimo beat era el del juego, asi que la tarjeta final (logo, redes, sitio) no se agregaba. Se vio en las grabaciones de OBS del 29 de octubre de 2026
// («en la mano 2 las cartas se ven negras y ya nada se ve»). El cierre del video se reconoce por su id (`cierre-N`), nunca por el tipo.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conCierre, beatDeCierre, esBeatDeCierre, esCierre, claveDeCierre } from '../../../web/casino/cierre.js';
import { construirLineaDeTiempo as lineaDuda } from '../../../web/casino/linea-de-tiempo-duda.js';
import { construirLineaDeTiempo as lineaTD } from '../../../web/casino/linea-de-tiempo-tripledado.js';
import { MesaBase } from '../../../web/casino/mesa-base.js';
import { muchas } from './ayudas.js';
import { muchasTD } from './ayudas-td.js';

const clave = (p) => claveDeCierre({ seed: p.seed, partida: 1, desde: 1, hasta: 3 });

test('el cierre del video se reconoce por su id y el `cierre` de mano o de ronda de un juego no se confunde con el', () => {
  const video = beatDeCierre('1:p1:1-3', 3, 'parte');
  assert.equal(video.tipo, 'cierre');
  assert.ok(esBeatDeCierre(video) && esCierre(video.id));
  assert.ok(!esBeatDeCierre({ id: 'm1-9-cierre', tipo: 'cierre' }), 'el fin de mano de Duda y apuesta');
  assert.ok(!esBeatDeCierre({ id: 'r2-14-cierre', tipo: 'cierre' }), 'el fin de ronda de Triple dado');
  assert.ok(!esBeatDeCierre(null) && !esBeatDeCierre({}));
});

for (const [juego, construir, muestras] of [['Duda y apuesta', lineaDuda, muchas], ['Triple dado', lineaTD, muchasTD]]) {
  test(`${juego}: aunque el ultimo beat sea el cierre de su ronda, la pieza recibe la tarjeta de cierre del video (una sola, al final)`, async () => {
    let conBeatDeJuego = 0;
    for (const p of (await muestras()).slice(0, 6)) {
      const beats = construir(p);
      const cierresDeJuego = beats.filter((b) => b.tipo === 'cierre');
      assert.ok(cierresDeJuego.length > 0, `${juego}: la partida debe traer algun cierre de ronda para que la prueba valga`);
      assert.ok(cierresDeJuego.every((b) => !esCierre(b.id)), 'los ids de los beats del juego no pueden parecerse a los del cierre del video (cierre-N)');
      // El corte que mas se parece a una pieza real: hasta el cierre de una ronda, que deja un beat `cierre` del juego al final.
      const hasta = beats.findLastIndex((b) => b.tipo === 'cierre');
      const pieza = beats.slice(0, hasta + 1);
      assert.equal(pieza.at(-1).tipo, 'cierre');
      conBeatDeJuego++;
      const cerrada = conCierre(pieza, clave(p), 'parte');
      assert.equal(cerrada.length, pieza.length + 1, `${juego}: falta la tarjeta de cierre del video`);
      assert.ok(esBeatDeCierre(cerrada.at(-1)));
      assert.equal(cerrada.filter(esBeatDeCierre).length, 1);
      assert.deepEqual(conCierre(cerrada, clave(p), 'parte'), cerrada, 'si ya lo trae, tal cual');
    }
    assert.ok(conBeatDeJuego > 0);
  });
}

test('la mesa base manda al `cierre` de un juego a su METODOS y solo el beat `cierre-N` a la tarjeta del video', async () => {
  const llamadas = [];
  const mesa = {
    ganchoEl: null, vel: 1, rapido: true,
    constructor: { METODOS: { cierre: 'cerrar' } },
    mostrarSubtitulos() {}, esperar: async () => {},
    cerrar: async (b) => { llamadas.push(['cerrar-del-juego', b.id]); },
    ejecutarCierre: async (b) => { llamadas.push(['cierre-del-video', b.id]); },
  };
  await MesaBase.prototype.ejecutar.call(mesa, { id: 'm1-9-cierre', tipo: 'cierre', pasos: [] }, 1200);
  await MesaBase.prototype.ejecutar.call(mesa, beatDeCierre('1:p1:1-3', 3, 'parte'), 6500);
  assert.deepEqual(llamadas, [['cerrar-del-juego', 'm1-9-cierre'], ['cierre-del-video', llamadas[1][1]]]);
  assert.match(llamadas[1][1], /^cierre-\d+$/);
});
