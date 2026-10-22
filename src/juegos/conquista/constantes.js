// Constantes de la Guerra de territorios. Un solo lugar para cada numero de las reglas.

export const TURNOS = 30;
export const MAX_ORDENES = 14; // 12 hasta 1.1.0
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
// ---- Unidades (2.0.0). Indice: 0 Lancero, 1 Arquero, 2 Jinete, 3 Ingenio. La fuerza es proporcional al costo: lo que decide es la composicion contra el rival. ----
// `racion`: cuanto pesa en el hambre (cada COMIDA.tropasPorRacion raciones comen 1 Comida).
export const N_TIPOS = 4;
export const UNIDADES = [
  { id: 'L', nombre: 'Lancero', costo: { Comida: 1 }, fuerzaAtaca: 1, fuerzaDefiende: 1, racion: 1 },
  { id: 'A', nombre: 'Arquero', costo: { Comida: 1, Madera: 1 }, fuerzaAtaca: 2, fuerzaDefiende: 2, racion: 1 },
  { id: 'J', nombre: 'Jinete', costo: { Comida: 1, Caballos: 1 }, fuerzaAtaca: 3, fuerzaDefiende: 3, racion: 2 },
  { id: 'I', nombre: 'Ingenio', costo: { Comida: 1, Madera: 1, Roca: 1, Hierro: 1 }, fuerzaAtaca: 3.5, fuerzaDefiende: 1, racion: 2 },
];
// DOMINA[t] = tipos a los que domina t: Lancero > Jinete, Arquero > Lancero, Jinete > Arquero e Ingenio. Contra el tipo al que domina, una unidad rinde DOMINIO veces (de un solo lado).
export const DOMINA = [[2], [0], [1, 3], []];
export const DOMINIO = 2;
// Mejoras por tipo (reemplazan a `armar`): +bono de fuerza por nivel a TODAS las unidades de ese tipo; hace falta un cuartel propio.
export const MEJORAS = { maximo: 2, bono: 0.25, costo: [{ Hierro: 3, Oro: 2 }, { Hierro: 5, Oro: 4 }] };
// Parte de Ingenios entre las unidades atacantes con la que la fortaleza del defensor cuenta la mitad / no cuenta.
export const FORT_INGENIO = { mitad: 0.25, anula: 0.5 };
// Factor de costo al reclutar en una region con cuartel entero / danado.
export const CUARTEL = { entero: 0.5, danado: 0.75 };
export const MERCENARIOS = { maximoPorTurno: 3, costo: 2, costoDeshonrado: 3 };
export const EDIFICIOS = {
  granja: { letra: 'g', costo: { Madera: 4 } },
  mercado: { letra: 'm', costo: { Madera: 3, Roca: 3 } },
  cuartel: { letra: 'c', costo: { Madera: 4, Roca: 3 } },
};
export const MAX_EDIFICIOS_POR_TIPO = 3;
// Decidido el 18 de octubre de 2026 (antes 10/8/6/6 y 5 turnos): con modelos reales la Maravilla decidio 2 de 2 partidas (turnos 10 y 16 de 30), porque se paga hacia el turno 4 y 5 turnos casi no dan
// tiempo a una coalicion. Costo x1.5 y 8 turnos de cuenta: se construye mas tarde y los demas reinos tienen tiempo de frenarla.
export const MARAVILLA = { costo: { Roca: 15, Madera: 12, Hierro: 9, Oro: 9 }, turnos: 8 };
export const HONOR = { inicial: 5, maximo: 10, rotura: 3, cumplido: 1, cadaTurnos: 3, deshonrado: 2 };
export const PACTO_TURNOS = 2;
export const COMIDA = { tropasPorRacion: 4, regionesPorCosecha: 2, deserta: 0.1 };
export const PUNTOS_POSICION = [5, 3, 1, 0, 0];
