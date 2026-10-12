// Constantes de la Guerra de territorios. Un solo lugar para cada numero de las reglas.

export const TURNOS = 30;
export const MAX_ORDENES = 12;
export const MAX_PRIVADOS = 2;
export const LARGO_MENSAJE = 140;
export const LARGO_NOTA = 250;
export const LARGO_RAZON = 300;

export const RECURSOS = ['Comida', 'Madera', 'Roca', 'Hierro', 'Oro', 'Caballos'];
// Nombres neutros de los reinos: el prompt nunca dice que modelo juega cada uno.
export const NOMBRES_REINOS = ['Azur', 'Ambar', 'Violeta', 'Rosa', 'Marfil'];

export const ALMACEN_INICIAL = { Comida: 6, Madera: 4, Roca: 2, Hierro: 0, Oro: 4, Caballos: 0 };
export const TROPAS_CAPITAL = 10;
export const TROPAS_VECINA = 3;

export const TERRENO = { ll: 1, bo: 1.25, mo: 1.5 }; // multiplicador de defensa
// FORTALEZA[n] = costo de subir al nivel n (el 3 es la muralla)
export const FORTALEZA = [null, { Madera: 3, Roca: 2 }, { Roca: 4, Madera: 3 }, { Roca: 6, Hierro: 3 }];
export const ARMAS = { maximo: 2, costo: { Hierro: 4, Madera: 2 }, bono: 0.25 };
export const MERCENARIOS = { maximoPorTurno: 3, costo: 2, costoDeshonrado: 3 };
export const EDIFICIOS = {
  granja: { letra: 'g', costo: { Madera: 4 } },
  mercado: { letra: 'm', costo: { Madera: 3, Roca: 3 } },
  cuartel: { letra: 'c', costo: { Madera: 4, Roca: 3 } },
};
export const MAX_EDIFICIOS_POR_TIPO = 3;
export const MARAVILLA = { costo: { Roca: 10, Madera: 8, Hierro: 6, Oro: 6 }, turnos: 5 };
export const HONOR = { inicial: 5, maximo: 10, rotura: 3, cumplido: 1, cadaTurnos: 3, deshonrado: 2 };
export const PACTO_TURNOS = 2;
export const COMIDA = { tropasPorRacion: 4, regionesPorCosecha: 2, deserta: 0.1 };
export const PUNTOS_POSICION = [5, 3, 1, 0, 0];
