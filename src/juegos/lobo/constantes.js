export const VERSION = 'lobo-1.3.0';
// Qué ve el público (cámara y video) de lo que Cupido elige en la noche 1; las IAs no ven ninguno de los dos. Se sortea por seed (25 % cada modo).
export const MODOS_CUPIDO = Object.freeze(['pareja', 'cupido', 'ambos', 'nada']);
export const REVELA_CUPIDO = Object.freeze({ pareja: { pareja: true, cupido: false }, cupido: { pareja: false, cupido: true }, ambos: { pareja: true, cupido: true }, nada: { pareja: false, cupido: false } });
export const CONFIGURACIONES = {
  8: { lobos: 2, videntes: 1, aldeanos: 2, rondas: 6 },
  12: { lobos: 3, videntes: 2, aldeanos: 4, rondas: 6 },
};
export const ROLES = ['lobo', 'vidente', 'bruja', 'cazador', 'cupido', 'aldeano'];
export const bandoDe = (rol) => rol === 'lobo' ? 'lobos' : 'aldea';
