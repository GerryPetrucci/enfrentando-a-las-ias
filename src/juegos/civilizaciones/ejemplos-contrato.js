// Casos reproducibles para revisar el contrato. No se importan en el prompt
// activo: sirven al generador privado y a las pruebas, sin bots ni API.
import { crearRng } from '../../rng.js';
import { crearEstado, crearCivilizacion } from './estado.js';
import { normalizarRespuesta } from './ordenes.js';
import { aplicarTurno } from './turno/index.js';
import { vistaTexto } from './vista.js';
import { nombreRegion } from './mundo.js';
import { modificadores, personasPorOficio, produccion } from './economia.js';
import { costoEdificio, costoColonizar } from './edificios.js';
import { costoVigente } from './tecnologia.js';
import { defensaDe, reclutar } from './turno/invasion.js';
import { invertir } from './turno/maravillas.js';
import { indiceDe } from './indice.js';

export function ejemplosDeContrato(vista = vistaTexto) {
  const E = crearEstado(crearRng(101), { seedTemporada: 1 });
  const inicio = vista(E, 0);
  const region = nombreRegion(E.mundo.sitios[0]);
  const centro = E.temporada.centros.T1;
  const respuestas = [0, 1].map((s) => normalizarRespuesta({
    fundacion: { nombre: `Ejemplo ${s ? 'B' : 'A'}`, lema: 'Texto ficticio', sitio: 1, rasgos: ['eruditos', 'constructores'] },
    ordenes: s === 0 ? [`construir ${region} ${centro}`, 'investigar T1'] : [],
    nota: 'Nota ficticia de ejemplo', mensaje: 'Mensaje ficticio de ejemplo',
  }, E));
  const registro = aplicarTurno(E, respuestas);
  const c = crearCivilizacion(0);
  c.rasgos = ['constructores', 'pioneros']; c.regiones = [0, 1, 2];
  const edificio = costoEdificio('taller', modificadores(c, 1));
  const colonia = costoColonizar(c, modificadores(c, 1));
  c.descuentoIngeniero = true;
  const edificioConGenio = costoEdificio('taller', modificadores(c, 1));
  const r = crearCivilizacion(0);
  r.rasgos = ['guerreros']; r.stock.Comida = 10; r.stock.Hierro = 10;
  const antes = { ...r.stock };
  const error = reclutar(r, 3, modificadores(r, 1), 0);
  const reclutamiento = { cantidad: 3, error, comida: antes.Comida - r.stock.Comida,
    hierro: antes.Hierro - r.stock.Hierro, defensa: defensaDe(r, 1) };
  const i = crearEstado(crearRng(102));
  const a = i.civs[0];
  a.tecnologias = ['E1']; a.stock.Roca = 7;
  a.proyectosMaravillas.piramide = { inicio: 1, invertido: { Roca: 25 } };
  const inversionRechazada = invertir(i, a, 'piramide', 'Roca', 8, 2);
  const saldoTrasRechazo = a.stock.Roca;
  a.stock.Roca = 8;
  const inversionAceptada = invertir(i, a, 'piramide', 'Roca', 8, 2);
  const p = crearCivilizacion(0);
  p.poblacion = 13; p.reparto = [30, 20, 10, 10, 20, 10];
  const gente = personasPorOficio(p.poblacion, p.reparto);
  const producida = produccion(p, { regs: [] }, 1); // sin regiones ni modificadores
  return {
    version: 'ejemplos-civilizaciones-1',
    reparto: { poblacion: p.poblacion, porcentajes: p.reparto, personas: gente, produccionSinRegionesNiBonos: producida },
    costos: { edificio: 'taller', rasgos: [...c.rasgos], normal: edificio, conGenio: edificioConGenio, colonizarConTresRegiones: colonia },
    difusion: { tecnologia: 'S2', sinDifusion: costoVigente('S2', { tecnologiasCierre: [] }), conDifusion: costoVigente('S2', { tecnologiasCierre: ['S2'] }) },
    reclutamiento,
    inversion: { recurso: 'Roca', solicitado: 8, pendiente: 5, saldoInsuficiente: 7,
      inversionRechazada, saldoTrasRechazo, inversionAceptada, saldoFinal: a.stock.Roca, invertidoFinal: a.proyectosMaravillas.piramide.invertido.Roca },
    primerTurno: { region, centro, ordenes: registro.civs[0].ordenes,
      proyectos: E.civs[0].proyectos, tecnologias: E.civs[0].tecnologias, indice: indiceDe(E.civs[0]) },
    vistas: { inicio, despuesDelPrimerTurno: vista(E, 0) },
  };
}
