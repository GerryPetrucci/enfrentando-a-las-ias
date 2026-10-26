// Los recortes son individuales: no se calculan posiciones de una grilla supuesta.
export { PERSONAJES_ANIMADOS } from './lobo-personajes-animados.js';
export const ROLES_LOBO = Object.freeze({ lobo: 'Lobo', vidente: 'Vidente', bruja: 'Bruja', cazador: 'Cazador', cupido: 'Cupido', aldeano: 'Aldeano' });
export const nombreRol = (rol) => ROLES_LOBO[rol] ?? 'Identidad oculta';
const secuencia = (prefijo, n) => Array.from({ length: n }, (_, i) => `arte/lobo/${prefijo}-${String(i + 1).padStart(2, '0')}.png`);
// La casa misteriosa («?»): entra un figurante anonimo, porque no dice quien vive ahi.
export const NOCHES = Object.freeze({ misteriosa: secuencia('noche-misteriosa', 6) });
// La casa de cada rol: entra EL personaje de ese rol (el de la insignia), de dia, al atardecer y de noche; los cuadros 4 a 6 son de noche: entra, ya dentro y puerta cerrada.
// Los recorta herramientas/recortar-entradas-lobo.mjs de las hojas del autor.
export const ENTRADAS = Object.freeze(Object.fromEntries(Object.keys(ROLES_LOBO).map((rol) => [rol, secuencia(`entrada-${rol}`, 6)])));
// Un solo plano general de la asamblea: es el unico cuadro que usa la escena (los otros once se retiraron del repositorio).
export const ASAMBLEA = Object.freeze(secuencia('dia-asamblea', 1));
// El estandarte de rol solo acompaña una revelación ya pública. El dibujo de
// la asamblea es ambientación, jamás asigna sus personajes a los asientos.
export function fotogramasDe(paso) {
  if (paso?.tipo === 'noche') return [...NOCHES.misteriosa];
  if (paso?.tipo === 'enamorados') return ENTRADAS.cupido.slice(3); // es de noche: Cupido entra en su casa, ya dentro y la puerta cerrada
  // La revelación la dan la tarjeta y el retrato: no se recorren emblemas de roles
  // como si revelaran a alguien durante el debate (ni se ampliarían los de 275–303px).
  // El plano general es el mayor recorte (516x288) y mantiene un encuadre estable.
  return [ASAMBLEA[0]];
}
