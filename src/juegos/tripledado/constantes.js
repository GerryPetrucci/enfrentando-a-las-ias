// Constantes de Triple dado. Las reglas son las dictadas por el usuario el 11 de octubre de 2026: aqui no hay perillas de balance.
// Los PUNTOS viven como enteros en DOCEAVOS de punto (1 punto = 12): los repartos por empate dan tercios y mitades, y con enteros no hay error de
// coma flotante (3 x 3.33 = 10 exacto) ni una tarjeta cambia de categoria por un 6.9999.

export const JUGADORES = 4;
export const RONDAS = 4;
export const ENFRENTAMIENTOS = 3;
export const TURNOS = RONDAS * (1 + ENFRENTAMIENTOS); // 16: por ronda, 1 de prediccion + 3 enfrentamientos
export const TARJETAS = ['ZERO', 'MIN', 'MORE', 'MAX'];
export const IDS_BLANCOS = Array.from({ length: 9 }, (_, i) => `b${i + 1}`);
export const IDS_DADOS = [...IDS_BLANCOS, 'rojo', 'azul'];
export const PUNTOS_POSICION = [6, 3, 1, 0]; // 1.o, 2.o, 3.o y 4.o lugar de un enfrentamiento
export const DOCEAVOS = 12;
export const PREMIO_ZERO = 40;
// Puntos del marcador por puesto (no son los puntos de dados): pieza = el mas alto en solitario; eliminado = el mas bajo en solitario.
export const PUNTOS = { pieza: 4, medio: 2, eliminado: 0 };
export const LARGO_RAZON = 300;
// Rango de cada tarjeta en docenos (inclusivo). MIN: mas de 0 y menos de 7; MORE: de 7 a menos de 11; MAX: 11 o mas.
export const RANGOS = { ZERO: [0, 0], MIN: [1, 83], MORE: [84, 131], MAX: [132, Infinity] };
