export const VERSION = 'lobo-1.2.0';
export const CONFIGURACIONES = {
  8: { lobos: 2, videntes: 1, aldeanos: 2, rondas: 6 },
  12: { lobos: 3, videntes: 2, aldeanos: 4, rondas: 6 },
};
export const ROLES = ['lobo', 'vidente', 'bruja', 'cazador', 'cupido', 'aldeano'];
export const bandoDe = (rol) => rol === 'lobo' ? 'lobos' : 'aldea';
