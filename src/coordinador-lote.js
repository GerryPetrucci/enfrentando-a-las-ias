// Coordinador de lotes. Las partidas de una serie corren a la vez; en cada ronda todas sus IAs piden una jugada casi al mismo
// tiempo. El coordinador junta esas peticiones, manda UN lote por modelo (mitad de precio), espera a que terminen y le entrega a
// cada peticion su resultado. Asi todas las partidas avanzan turno por turno juntas, sin que la arena sepa nada del lote.
//
//   const coordinador = crearCoordinador({ cliente: crearClienteLote(), tope: 1.0 });
//   const { texto, finishReason, uso } = await coordinador.pedir({ modelo, usaLote, sistema, usuario, razonamiento });
//
// - Peticiones del mismo modelo que llegan con menos de `ventanaMs` entre una y otra van en el mismo lote.
// - Un modelo sin variante de lote (`usaLote: false`) se llama normal (`sincrono`, por defecto llamarModelo) y se anota aparte.
// - `tope` (dolares): en cuanto el gasto acumulado lo alcanza, no se envia ningun lote nuevo y las peticiones nuevas rechazan.
//   El gasto es el que informa OpenRouter por lote; las llamadas normales suman su costo solo si la respuesta lo trae.
// - Una peticion que falla rechaza solo a ella: la arena la anota como error de ese reino y la partida sigue.

import { leerResultados, repartirUso } from './lote.js';
import { cuerpoDeLlamada } from './parametros.js';
import { llamarModelo } from './modelos.js';

export function crearCoordinador({
  cliente,
  sincrono = llamarModelo,
  ventanaMs = 100,
  cadaMs = 15000,
  maxPorLote = 500,
  tope = null,
  alEvento = () => {},
}) {
  const cola = new Map();   // modelo -> [{ id, cuerpo, resolver, rechazar }]
  let temporizador = null;
  let contador = 0;
  let gasto = 0;
  let topeAlcanzado = false;
  const est = { lotes: 0, peticiones: 0, sincronas: 0, esperaMs: 0, porModelo: {} };
  const deModelo = (m) => (est.porModelo[m] ??= { lotes: 0, peticiones: 0, gasto: 0 });

  const errorDeTope = () => new Error(`tope de gasto alcanzado ($${tope.toFixed(2)}): no se envian mas peticiones`);
  const pasoElTope = () => {
    if (tope !== null && gasto >= tope) { topeAlcanzado = true; return true; }
    return false;
  };

  async function procesar(modelo, items) {
    if (pasoElTope()) { items.forEach((i) => i.rechazar(errorDeTope())); return; }
    const inicio = Date.now();
    let final;
    try {
      const lote = await cliente.enviar({ modelo, peticiones: items.map((i) => ({ id: i.id, cuerpo: i.cuerpo })) });
      est.lotes++; deModelo(modelo).lotes++;
      alEvento({ tipo: 'enviado', modelo, n: items.length, id: lote.id });
      final = await cliente.esperar(lote.id, { cadaMs, alCambiar: (estado) => alEvento({ tipo: 'estado', modelo, id: lote.id, estado }) });
    } catch (err) {
      items.forEach((i) => i.rechazar(err));
      return;
    }
    const segundos = Math.round((Date.now() - inicio) / 1000);
    const costo = final.usage?.cost ?? 0;
    gasto += costo; est.esperaMs += Date.now() - inicio; deModelo(modelo).gasto += costo;
    const resultados = leerResultados(final);
    const uso = repartirUso(final);
    for (const i of items) {
      const r = resultados.get(i.id);
      if (!r) i.rechazar(new Error(`sin resultado: el lote termino como "${final.status}"`));
      else if (r.error) i.rechazar(new Error(r.error));
      else i.resolver({ texto: r.texto, finishReason: r.finishReason, uso });
    }
    alEvento({ tipo: 'listo', modelo, n: items.length, estado: final.status, segundos, costo });
  }

  function vaciar() {
    temporizador = null;
    for (const [modelo, items] of cola) {
      for (let desde = 0; desde < items.length; desde += maxPorLote) procesar(modelo, items.slice(desde, desde + maxPorLote));
    }
    cola.clear();
  }

  return {
    async pedir({ modelo, usaLote, sistema, usuario, razonamiento = null }) {
      if (pasoElTope()) throw errorDeTope();
      est.peticiones++; deModelo(modelo).peticiones++;
      if (!usaLote) {
        est.sincronas++;
        const r = await sincrono({ modelo, sistema, usuario, razonamiento });
        gasto += r.uso?.cost ?? 0;
        return r;
      }
      return new Promise((resolver, rechazar) => {
        if (!cola.has(modelo)) cola.set(modelo, []);
        cola.get(modelo).push({ id: `p${++contador}`, cuerpo: cuerpoDeLlamada({ sistema, usuario, razonamiento }), resolver, rechazar });
        clearTimeout(temporizador);
        temporizador = setTimeout(vaciar, ventanaMs);
      });
    },
    estadisticas: () => ({ ...est, gasto, topeAlcanzado, porModelo: { ...est.porModelo } }),
  };
}
