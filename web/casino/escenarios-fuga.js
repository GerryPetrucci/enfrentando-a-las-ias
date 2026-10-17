// Las mini escenas de La Fuga: una por situacion del catalogo (24). Cada una es una COMPOSICION de piezas reutilizables dibujadas con SVG (puerta, guardia, camara...), con su propia
// disposicion; los movimientos (pasar, tropezar, caer, separarse...) los pone la silueta (siluetas.js) y valen para todas. Sin DOM: se prueba en Node.
//
// Una pieza: { ratio, svg() }: ratio = ancho / alto y svg() = el dibujo (viewBox propio; todo con el color de la camara: currentColor, nunca el color de una IA).
// Una escena: { id, fase, generica, piezas: [{ pieza, x, y, alto }], carril: { desde, hasta } }
//   x    centro de la pieza como fraccion del ancho de la imagen        y   la base de la pieza como fraccion del alto (el suelo esta en 0.8)
//   alto el alto de la pieza como fraccion del alto de la imagen (su ancho sale de su ratio)
//   carril por donde camina la silueta (fracciones del ancho). Las piezas van DETRAS de la silueta.
//
// La escena depende solo de la situacion: la pista enganosa y el metodo mejor nunca se dibujan (escenaDe recibe nada mas el id). Una situacion sin dibujar, o un id raro, da la escena generica
// (el titulo del obstaculo sobre el cuadro): la escena nunca falla.

const trazo = (cuerpo, vista, extra = '') => `<svg viewBox="0 0 ${vista}" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"${extra}>${cuerpo}</svg>`;
const pieza = (ratio, vista, cuerpo) => ({ ratio, svg: () => trazo(cuerpo, vista) });

export const PIEZAS = {
  puerta: pieza(60 / 110, '60 110', '<rect x="4" y="4" width="52" height="102" rx="3"/><rect x="12" y="14" width="36" height="34" rx="2" opacity=".6"/><rect x="12" y="58" width="36" height="40" rx="2" opacity=".6"/><circle cx="46" cy="56" r="3.5" fill="currentColor"/>'),
  cerradura: pieza(1, '40 40', '<rect x="6" y="4" width="28" height="32" rx="4"/><circle cx="20" cy="17" r="5" fill="currentColor"/><path d="M20 22 v8" stroke-width="4"/>'),
  guardia: pieza(40 / 100, '40 100', '<path d="M8 14 h24 l-3 -8 h-18z" fill="currentColor" opacity=".5"/><circle cx="20" cy="22" r="9"/><rect x="9" y="33" width="22" height="34" rx="6"/><path d="M9 52 h22" opacity=".6"/><path d="M13 67 v28 M27 67 v28"/><path d="M31 40 l7 14" />'),
  cocinero: pieza(40 / 100, '40 100', '<path d="M10 14 q-2 -12 10 -12 q12 0 10 12 z" opacity=".7"/><circle cx="20" cy="23" r="8"/><rect x="9" y="33" width="22" height="34" rx="6"/><path d="M14 40 h12 v12 h-12z" opacity=".5"/><path d="M13 67 v28 M27 67 v28"/>'),
  linterna: pieza(2, '120 60', '<path d="M118 28 L2 2 L2 58 L118 32z" fill="currentColor" opacity=".18" stroke="none"/><path d="M118 28 L2 2 M118 32 L2 58" opacity=".5" stroke-dasharray="4 5"/><circle cx="116" cy="30" r="5" fill="currentColor"/>'),
  camara: pieza(1.4, '70 50', '<path d="M2 4 v22 M2 14 h14" /><path d="M16 8 l40 10 l-6 20 l-40 -10z" fill="currentColor" opacity=".25"/><circle cx="52" cy="28" r="6" fill="currentColor"/>'),
  foco: pieza(0.6, '60 100', '<path d="M30 0 L4 98 L56 98z" fill="currentColor" opacity=".16" stroke="none"/><path d="M30 0 L4 98 M30 0 L56 98" opacity=".45" stroke-dasharray="4 5"/>'),
  mesa: pieza(100 / 60, '100 60', '<path d="M4 8 h92 v6 h-92z" fill="currentColor" opacity=".35"/><path d="M12 14 v42 M88 14 v42"/><path d="M12 36 h76" opacity=".5"/>'),
  llavero: pieza(1, '40 40', '<circle cx="20" cy="10" r="6"/><path d="M20 16 v6"/><path d="M10 22 h8 v14 h-4 v-4 h-4z M24 22 h8 v10 h-8z" opacity=".8"/>'),
  lavadora: pieza(60 / 70, '60 70', '<rect x="4" y="4" width="52" height="62" rx="4"/><circle cx="30" cy="40" r="15"/><circle cx="30" cy="40" r="8" opacity=".5"/><circle cx="14" cy="14" r="3" fill="currentColor"/><path d="M26 12 h22" opacity=".6"/>'),
  camilla: pieza(2, '120 60', '<path d="M4 22 h112 v10 h-112z" fill="currentColor" opacity=".3"/><path d="M4 22 q0 -10 14 -10 h12 v10" /><path d="M16 32 v18 M104 32 v18"/><circle cx="16" cy="54" r="4"/><circle cx="104" cy="54" r="4"/>'),
  cruz: pieza(1, '40 40', '<rect x="4" y="4" width="32" height="32" rx="4"/><path d="M20 10 v20 M10 20 h20" stroke-width="5"/>'),
  panel: pieza(40 / 60, '40 60', '<rect x="3" y="3" width="34" height="54" rx="4"/><rect x="8" y="8" width="24" height="10" rx="1" opacity=".6"/><path d="M10 26 h4 M18 26 h4 M26 26 h4 M10 34 h4 M18 34 h4 M26 34 h4 M10 42 h4 M18 42 h4 M26 42 h4" stroke-width="4"/>'),
  botin: pieza(1, '40 40', '<path d="M10 36 q-6 -14 4 -20 l-2 -8 h16 l-2 8 q10 6 4 20z" fill="currentColor" opacity=".35"/><path d="M14 10 h12" /><path d="M20 20 v10 M16 24 h8" stroke-width="2.5"/>'),
  escalera: pieza(60 / 110, '60 110', '<path d="M10 2 v106 M50 2 v106"/><path d="M10 14 h40 M10 30 h40 M10 46 h40 M10 62 h40 M10 78 h40 M10 94 h40" opacity=".8"/>'),
};

const CARRIL = { desde: 0.12, hasta: 0.8 };
const P = (nombre, x, y, alto) => ({ pieza: nombre, x, y, alto });
const SUELO = 0.8;

// Las composiciones, por situacion. Se agregan por fases (interior, patio, perimetro).
const ESCENAS = {
  // ---- interior ----
  celda: [P('puerta', 0.55, SUELO, 0.66), P('cerradura', 0.6, 0.52, 0.1)],
  ronda: [P('linterna', 0.34, 0.66, 0.34), P('guardia', 0.62, SUELO, 0.62)],
  camara: [P('camara', 0.5, 0.3, 0.2), P('foco', 0.54, SUELO, 0.5)],
  cocina: [P('mesa', 0.5, SUELO, 0.38), P('llavero', 0.5, 0.44, 0.12), P('cocinero', 0.78, SUELO, 0.6)],
  lavanderia: [P('lavadora', 0.4, SUELO, 0.46), P('lavadora', 0.56, SUELO, 0.46), P('lavadora', 0.72, SUELO, 0.46)],
  enfermeria: [P('camilla', 0.5, SUELO, 0.34), P('cruz', 0.8, 0.4, 0.2)],
  panel: [P('puerta', 0.64, SUELO, 0.66), P('panel', 0.44, 0.62, 0.24)],
  escalera: [P('escalera', 0.55, SUELO, 0.72)],
};

// Los 24 ids del catalogo del motor, en su orden (una prueba los compara con src/juegos/fuga/catalogo.js).
export const IDS = ['celda', 'ronda', 'camara', 'cocina', 'lavanderia', 'enfermeria', 'panel', 'escalera',
  'patio', 'perros', 'taller', 'reja', 'turno', 'foco', 'zanja', 'basura',
  'muro', 'alambre', 'reflectores', 'alcantarilla', 'vehiculos', 'foso', 'final', 'camioneta'];
const FASE = Object.fromEntries(IDS.map((id, k) => [id, ['interior', 'patio', 'perimetro'][Math.floor(k / 8)]]));

export function escenaDe(id) {
  const conocida = typeof id === 'string' && Object.hasOwn(ESCENAS, id);
  if (!conocida) return { id: typeof id === 'string' ? id : null, fase: typeof id === 'string' && Object.hasOwn(FASE, id) ? FASE[id] : null, generica: true, piezas: [], carril: { ...CARRIL } };
  return { id, fase: FASE[id], generica: false, piezas: ESCENAS[id].map((p) => ({ ...p })), carril: { ...CARRIL } };
}
