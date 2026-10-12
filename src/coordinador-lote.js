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
// - El tope se revisa ANTES de cada lote nuevo, no durante: la primera ronda sale entera (correr.js lo previene con
//   errorDePrimeraRonda). Y se falla CERRADO: si despues de enviar un lote se pierde su seguimiento, o termina sin costo
//   informado, o trae resultados ilegibles, no sale ningun lote mas (`detenido`): el gasto ya no se puede vigilar. Ese lote sigue
//   en OpenRouter y se cobra; su id queda en estadisticas().ids y en el evento 'aviso'.

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
  const est = { lotes: 0, peticiones: 0, sincronas: 0, esperaMs: 0, fallosDeSeguimiento: 0, costoNoInformado: 0, ids: [], porModelo: {} };
  const deModelo = (m) => (est.porModelo[m] ??= { lotes: 0, peticiones: 0, gasto: 0 });
  let detenido = null; // motivo por el que ya no se envia nada (null = todo en orden)

  const errorDeTope = () => new Error(`tope de gasto alcanzado ($${tope.toFixed(2)}): no se envian mas peticiones`);
  const errorDeParada = () => new Error(`envios detenidos: ${detenido}`);
  const pasoElTope = () => {
    if (tope !== null && gasto >= tope) { topeAlcanzado = true; return true; }
    return false;
  };
  // un costo solo cuenta si es un numero positivo (puede llegar como texto, faltar o ser 0)
  const sumarCosto = (modelo, valor) => {
    const c = Number(valor);
    if (!Number.isFinite(c) || c <= 0) return false;
    gasto += c; deModelo(modelo).gasto += c;
    return true;
  };

  async function procesar(modelo, items) {
    if (pasoElTope()) { items.forEach((i) => i.rechazar(errorDeTope())); return; }
    if (detenido) { items.forEach((i) => i.rechazar(errorDeParada())); return; }
    const inicio = Date.now();
    let lote = null, final;
    try {
      lote = await cliente.enviar({ modelo, peticiones: items.map((i) => ({ id: i.id, cuerpo: i.cuerpo })) });
      est.lotes++; deModelo(modelo).lotes++;
      est.ids.push({ id: lote.id, modelo, n: items.length });
      alEvento({ tipo: 'enviado', modelo, n: items.length, id: lote.id });
      final = await cliente.esperar(lote.id, { cadaMs, alCambiar: (estado) => alEvento({ tipo: 'estado', modelo, id: lote.id, estado }) });
    } catch (err) {
      if (lote) {
        // el lote ya esta en OpenRouter y se cobra: no se pierde de vista ni se sigue enviando
        est.fallosDeSeguimiento++;
        detenido = `se perdio el seguimiento del lote ${lote.id} (${err.message}); sigue en OpenRouter`;
        alEvento({ tipo: 'aviso', texto: `Se perdio el seguimiento del lote ${lote.id} (${modelo}): ${err.message}. Sigue en OpenRouter y se cobra; no salen mas lotes. Consultalo: node herramientas/ver-lote.mjs ${lote.id} --resultados` });
      } else {
        detenido = `fallo el envio de un lote (${err.message})`;
      }
      items.forEach((i) => i.rechazar(err));
      return;
    }
    try {
      const segundos = Math.round((Date.now() - inicio) / 1000);
      est.esperaMs += Date.now() - inicio;
      const conCosto = sumarCosto(modelo, final.usage?.cost);
      if (!conCosto && (final.request_counts?.completed ?? 0) > 0) {
        // OpenRouter no informo el costo: sin el, el tope no puede vigilar nada, asi que no se envia mas
        est.costoNoInformado++;
        detenido = `el lote ${lote.id} termino sin costo informado: no se puede vigilar el tope`;
        alEvento({ tipo: 'aviso', texto: `El lote ${lote.id} (${modelo}) termino sin costo informado. No salen mas lotes: el tope no puede vigilar lo que no ve.` });
      }
      const resultados = leerResultados(final);
      const uso = repartirUso(final);
      for (const i of items) {
        const r = resultados.get(i.id);
        if (!r) i.rechazar(new Error(`sin resultado: el lote termino como "${final.status}"`));
        else if (r.error) i.rechazar(new Error(r.error));
        else i.resolver({ texto: r.texto, finishReason: r.finishReason, uso });
      }
      alEvento({ tipo: 'listo', modelo, n: items.length, estado: final.status, segundos, costo: conCosto ? Number(final.usage.cost) : 0 });
    } catch (err) {
      // resultados ilegibles: nada se queda colgado y el proceso no se cae despues de haber pagado
      detenido = `no se pudieron leer los resultados del lote ${lote.id} (${err.message})`;
      items.forEach((i) => i.rechazar(err));
    }
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
      if (detenido) throw errorDeParada();
      est.peticiones++; deModelo(modelo).peticiones++;
      if (!usaLote) {
        est.sincronas++;
        const r = await sincrono({ modelo, sistema, usuario, razonamiento });
        sumarCosto(modelo, r.uso?.cost);
        return r;
      }
      return new Promise((resolver, rechazar) => {
        if (!cola.has(modelo)) cola.set(modelo, []);
        cola.get(modelo).push({ id: `p${++contador}`, cuerpo: cuerpoDeLlamada({ sistema, usuario, razonamiento }), resolver, rechazar });
        clearTimeout(temporizador);
        temporizador = setTimeout(vaciar, ventanaMs);
      });
    },
    estadisticas: () => ({ ...est, ids: [...est.ids], gasto, topeAlcanzado, detenido, porModelo: { ...est.porModelo } }),
  };
}
