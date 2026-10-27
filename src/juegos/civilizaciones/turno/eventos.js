// Fase 2: pagos y efectos una sola vez, antes de producir. Los premios de
// Cultura van al acumulado, sin fingir que son produccion del turno.
import { CRISIS, EVENTO } from '../constantes.js';
import { rngDe } from '../rng.js';
import { modificadores, espacioDe } from '../economia.js';
import { costoEdificio } from '../edificios.js';

// Las tasas de la spec tienen precision porcentual entera: evita ceil(100*.07)=8.
const perdida = (n, tasa) => Math.ceil(n * Math.round(tasa * 100) / 100);
const perderGente = (c, tasa) => { c.poblacion = Math.max(1, c.poblacion - perdida(c.poblacion, tasa)); };
const pagar = (c, costo) => {
  if (!Object.entries(costo).every(([r, n]) => c.stock[r] >= n)) return false;
  for (const [r, n] of Object.entries(costo)) c.stock[r] -= n;
  return true;
};

export function resolverEvento(E, civ, evento, solicitada, explicita, rc) {
  const { id, turno: t } = evento, p = CRISIS[id];
  let opcion = solicitada, region = null;
  const temporal = (efectos, turnos = 1) => civ.temporales.push({ origen: id, desde: t, hasta: t + turnos - 1, efectos });
  const estabilidad = (v, turnos = 1) => temporal([{ t: 'estabilidad', v }], turnos);
  const pctComida = (v, turnos) => temporal([{ t: 'pct', rec: ['Comida'], v }], turnos);
  switch (id) {
    case 'sequia':
      if (opcion === 1 && !pagar(civ, { Madera: p.madera })) opcion = 2;
      if (opcion === 3) perderGente(civ, p.migracion);
      else {
        pctComida(opcion === 1 ? p.conPozos : p.golpe, p.turnos);
        if (opcion === 2) estabilidad(p.estabilidad, p.turnos);
      }
      break;
    case 'peste': {
      if (opcion === 1 && !pagar(civ, { Oro: p.oro })) opcion = 2;
      const hospital = modificadores(civ, t).pesteMitad;
      perderGente(civ, opcion === 1 ? (hospital ? p.hospitalCuarentena : p.cuarentena)
        : (opcion === 2 && hospital ? p.hospitalPlegarias : p.plegarias));
      if (opcion === 2) civ.culturaAcumulada += p.cultura;
      if (opcion === 3) estabilidad(p.estabilidad);
      break;
    }
    case 'terremoto': {
      let regiones = Object.keys(civ.edificios).map(Number).filter((r) => r !== civ.capital).sort((a, b) => a - b);
      if (!regiones.length && civ.edificios[civ.capital]) regiones = [civ.capital];
      if (!regiones.length) break;
      region = regiones[Math.floor(rngDe(E.seedMundo, t, 'terremoto')() * regiones.length)];
      const edificio = civ.edificios[region];
      // Genio reserva su descuento para el siguiente `construir` (11.7).
      const costo = costoEdificio(edificio.tipo, modificadores({ ...civ, descuentoIngeniero: false }, t));
      delete civ.edificios[region];
      if (opcion === 1) {
        if (pagar(civ, costo)) {
          civ.edificios[region] = { tipo: edificio.tipo, desde: t + 1 };
        } else opcion = 'perder';
      } else if (region !== civ.capital) civ.regiones = civ.regiones.filter((r) => r !== region);
      break;
    }
    case 'inundacion':
      if (opcion === 1 && !pagar(civ, { Madera: p.madera })) opcion = 2;
      if (opcion === 1) pctComida(p.comida, p.turnos);
      break;
    case 'genio':
      if (opcion === 1) civ.reservaCiencia += p.ciencia;
      if (opcion === 2) civ.culturaAcumulada += p.cultura;
      if (opcion === 3) civ.descuentoIngeniero = true;
      break;
    case 'yacimiento':
      if (opcion === 1) { civ.stock.Hierro += p.hierro; civ.stock.Roca += p.roca; }
      else civ.stock.Oro += p.oro;
      break;
    case 'revuelta':
      if (opcion === 1) {
        if (civ.guardias < p.guardias) opcion = 2; // se exigen, no se gastan (11.8)
      }
      if (opcion === 2 && !pagar(civ, { Oro: p.oro })) opcion = 3;
      estabilidad(opcion === 2 ? p.estabilidad : -p.estabilidad);
      break;
    case 'mercader':
      if (opcion === 1) {
        if (pagar(civ, { Oro: p.oroComprar })) { civ.stock.Madera += p.maderaComprar; civ.stock.Roca += p.rocaComprar; }
        else opcion = 3;
      } else if (opcion === 2) {
        if (pagar(civ, { Madera: p.maderaVender })) civ.stock.Oro += p.oroVender;
        else opcion = 3;
      }
      break;
    case 'incendio':
      if (opcion === 1 && !pagar(civ, { Oro: p.oro })) opcion = 2;
      civ.stock.Madera -= perdida(civ.stock.Madera, opcion === 1 ? p.apagado : p.perdida);
      break;
    case 'cometa':
      if (opcion === 1) {
        const bueno = rngDe(E.seedMundo, t, 'cometa')() < p.probBueno;
        if (bueno) civ.culturaAcumulada += p.cultura;
        estabilidad(bueno ? p.estabilidad : -p.estabilidad);
      }
      break;
    case 'exodo':
      if (opcion === 1) {
        const espacio = espacioDe(civ, modificadores(civ, t));
        civ.poblacion = Math.max(civ.poblacion, Math.min(espacio, civ.poblacion + p.gente));
        if (civ.estabilidad < p.umbral) estabilidad(p.estabilidad);
      }
      break;
    default: throw new Error(`evento desconocido: ${id}`);
  }
  rc.eventos.push({ tipo: 'evento', s: civ.s, id, nombre: EVENTO[id].nombre, solicitada, opcion,
    predeterminada: !explicita, fallback: opcion !== solicitada, ...(region !== null ? { region } : {}) });
}
