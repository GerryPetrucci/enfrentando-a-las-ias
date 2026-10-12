// Constantes de Subasta de tiempo. Las reglas son las oficiales dictadas por el usuario el 11 de octubre de 2026 (adaptadas a 5 jugadores):
// aqui no hay perillas de balance. El tiempo vive en DECIMAS enteras (6,000 = 10 minutos) para no arrastrar errores de decimales.

export const JUGADORES = 5;
export const SUBASTAS = 19;
export const BANCO = 6000; // decimas de segundo: 10 minutos
// Puntos del marcador por puesto (no son las fichas): la pieza = mas fichas; el eliminado = menos fichas.
export const PUESTO_PUNTOS = { pieza: 4, medio: 2, eliminado: 0 };
export const LARGO_RAZON = 300;

// decimas -> segundos (para mostrar y guardar)
export const segundos = (decimas) => decimas / 10;
