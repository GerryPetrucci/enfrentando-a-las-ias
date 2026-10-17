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
// Una linea repetida a lo ancho (alambre de puas, olas): n tramos de `paso` de ancho que empiezan en (0, y) y siguen `tramo`.
const repetir = (n, y, paso, tramo) => 'M0 ' + y + ' ' + Array.from({ length: n }, () => tramo.replaceAll('P', String(paso))).join(' ');

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
  // ---- piezas del patio y del perimetro ----
  torre: pieza(0.5, '50 100', '<rect x="4" y="4" width="42" height="26" rx="3"/><circle cx="12" cy="17" r="6" fill="currentColor"/><path d="M10 30 l-4 68 M40 30 l4 68 M8 60 h34 M7 80 h36"/>'),
  preso: pieza(0.45, '40 90', '<circle cx="20" cy="12" r="8"/><rect x="10" y="22" width="20" height="30" rx="5"/><path d="M10 28 l-8 -10 M30 28 l8 -10 M14 52 v34 M26 52 v34"/>'),
  perro: pieza(1.5, '90 60', '<ellipse cx="42" cy="28" rx="28" ry="13"/><circle cx="76" cy="20" r="9"/><path d="M82 14 l6 -8 l-2 12z" fill="currentColor"/><path d="M22 38 v18 M34 40 v16 M52 40 v16 M62 38 v18 M14 24 q-8 -8 -10 -16"/>'),
  reja: pieza(1.2, '80 66', '<path d="M4 6 h72 M4 60 h72 M10 6 v54 M24 6 v54 M38 6 v54 M52 6 v54 M66 6 v54"/>'),
  candado: pieza(1, '40 40', '<rect x="8" y="18" width="24" height="18" rx="3"/><path d="M13 18 v-6 a7 7 0 0 1 14 0 v6"/><circle cx="20" cy="27" r="2.5" fill="currentColor"/>'),
  herramientas: pieza(1.4, '80 56', '<rect x="3" y="3" width="74" height="50" rx="3" opacity=".6"/><path d="M16 12 v30 M10 12 h12 M34 12 l10 30 M44 12 l-10 30 M56 12 v30 M62 12 v22 M62 34 a5 5 0 0 1 -8 0"/>'),
  camion: pieza(2.2, '132 60', '<rect x="4" y="4" width="84" height="40" rx="3"/><path d="M88 18 h20 l14 14 v12 h-34z"/><path d="M94 22 h12 l8 10 h-20z" opacity=".6"/><circle cx="28" cy="50" r="8"/><circle cx="104" cy="50" r="8"/>'),
  muro: pieza(3.4, '204 60', '<rect x="3" y="3" width="198" height="54" rx="2"/><path d="M3 20 h198 M3 38 h198 M40 3 v17 M110 3 v17 M170 3 v17 M75 20 v18 M140 20 v18 M40 38 v19 M110 38 v19 M170 38 v19" opacity=".6"/>'),
  gancho: pieza(0.5, '30 60', '<path d="M15 4 v34 a12 12 0 0 1 -12 12"/><circle cx="15" cy="6" r="3" fill="currentColor"/>'),
  alambrada: pieza(6, '240 40', '<path d="' + repetir(12, 20, 20, 'l10 -14 l10 28') + '"/><path d="M0 20 h240" opacity=".5"/>'),
  zanja: pieza(6, '240 40', '<path d="M0 4 L24 36 H216 L240 4z" fill="currentColor" opacity=".16"/><path d="M0 4 L24 36 H216 L240 4"/><path d="' + repetir(8, 20, 30, 'q8 -6 15 0 t15 0') + '" opacity=".5"/>'),
  cuerda: pieza(0.4, '30 70', '<path d="M15 2 c-12 10 12 14 0 24 c-12 10 12 14 0 24 c-6 6 -4 12 0 16"/>'),
  rejilla: pieza(3, '120 40', '<ellipse cx="60" cy="20" rx="56" ry="14"/><path d="M20 20 h80 M28 13 h64 M28 27 h64 M40 8 v24 M60 6 v28 M80 8 v24" opacity=".7"/>'),
  palanca: pieza(2.4, '90 38', '<path d="M6 32 L72 8 q10 -3 14 6" stroke-width="5"/>'),
  porton: pieza(1.5, '120 80', '<rect x="3" y="3" width="114" height="74" rx="3"/><path d="M60 3 v74 M3 40 h114 M3 3 L60 40 M117 3 L60 40" opacity=".6"/>'),
  foso: pieza(6, '240 40', '<path d="M0 4 L20 36 H220 L240 4z" fill="currentColor" opacity=".22"/><path d="' + repetir(8, 14, 30, 'q8 -8 15 0 t15 0') + '"/><path d="' + repetir(8, 26, 30, 'q8 -8 15 0 t15 0') + '" opacity=".5"/>'),
  camioneta: pieza(2.4, '120 50', '<path d="M4 36 V12 h54 v8 l14 4 h10 l6 12 v6 h-84z"/><path d="M62 20 h14 l8 8 h-22z" opacity=".6"/><circle cx="26" cy="42" r="7"/><circle cx="86" cy="42" r="7"/>'),
  espejo: pieza(0.7, '28 40', '<ellipse cx="14" cy="16" rx="11" ry="14"/><path d="M14 30 v8 M8 38 h12"/><path d="M8 10 q4 -4 8 -3" opacity=".6"/>'),
  radio: pieza(0.6, '24 40', '<rect x="4" y="12" width="16" height="26" rx="3"/><path d="M12 12 v-10"/><circle cx="12" cy="26" r="4" opacity=".6"/>'),
};

const CARRIL = { desde: 0.12, hasta: 0.8 };
const P = (nombre, x, y, alto) => ({ pieza: nombre, x, y, alto });
const SUELO = 0.8;

// Las composiciones, por situacion (interior, patio y perimetro).
const ESCENAS = {
  // ---- interior ----
  celda: [P('puerta', 0.55, SUELO, 0.66), P('cerradura', 0.6, 0.52, 0.1)],
  ronda: [P('linterna', 0.34, 0.66, 0.34), P('guardia', 0.62, SUELO, 0.62)],
  camara: [P('camara', 0.5, 0.32, 0.26), P('foco', 0.54, SUELO, 0.48)],
  cocina: [P('mesa', 0.5, SUELO, 0.38), P('llavero', 0.5, 0.44, 0.12), P('cocinero', 0.78, SUELO, 0.6)],
  lavanderia: [P('lavadora', 0.4, SUELO, 0.46), P('lavadora', 0.56, SUELO, 0.46), P('lavadora', 0.72, SUELO, 0.46)],
  enfermeria: [P('camilla', 0.5, SUELO, 0.34), P('cruz', 0.8, 0.4, 0.2)],
  panel: [P('puerta', 0.64, SUELO, 0.66), P('panel', 0.44, 0.62, 0.24)],
  escalera: [P('escalera', 0.55, SUELO, 0.72)],
  // ---- patio ----
  patio: [P('torre', 0.88, SUELO, 0.7), P('foco', 0.74, SUELO, 0.7), P('preso', 0.4, SUELO, 0.4), P('preso', 0.52, SUELO, 0.4)],
  perros: [P('perro', 0.5, SUELO, 0.26), P('perro', 0.64, SUELO, 0.26), P('guardia', 0.86, SUELO, 0.6)],
  taller: [P('herramientas', 0.46, 0.55, 0.4), P('mesa', 0.46, SUELO, 0.3), P('reja', 0.8, SUELO, 0.4)],
  reja: [P('reja', 0.6, SUELO, 0.66), P('candado', 0.6, 0.5, 0.1)],
  turno: [P('guardia', 0.36, SUELO, 0.6), P('guardia', 0.56, SUELO, 0.6), P('guardia', 0.78, SUELO, 0.6)],
  foco: [P('torre', 0.88, SUELO, 0.7), P('foco', 0.7, SUELO, 0.7), P('espejo', 0.34, SUELO, 0.22)],
  zanja: [P('zanja', 0.52, 0.99, 0.22)],
  basura: [P('camion', 0.58, SUELO, 0.5), P('guardia', 0.88, SUELO, 0.5), P('cuerda', 0.28, SUELO, 0.3)],
  // ---- perimetro ----
  muro: [P('muro', 0.6, SUELO, 0.5), P('gancho', 0.34, SUELO, 0.2)],
  alambre: [P('muro', 0.6, SUELO, 0.44), P('alambrada', 0.6, 0.36, 0.2), P('guardia', 0.9, SUELO, 0.5)],
  reflectores: [P('torre', 0.3, SUELO, 0.6), P('foco', 0.4, SUELO, 0.6), P('torre', 0.78, SUELO, 0.6), P('foco', 0.68, SUELO, 0.6)],
  alcantarilla: [P('rejilla', 0.55, 0.95, 0.2), P('palanca', 0.28, SUELO, 0.16)],
  vehiculos: [P('porton', 0.52, SUELO, 0.66), P('guardia', 0.86, SUELO, 0.55)],
  foso: [P('foso', 0.52, 0.99, 0.22), P('muro', 0.52, SUELO, 0.36)],
  final: [P('mesa', 0.44, SUELO, 0.3), P('radio', 0.44, 0.5, 0.12), P('guardia', 0.74, SUELO, 0.55)],
  camioneta: [P('camioneta', 0.52, SUELO, 0.42), P('guardia', 0.84, SUELO, 0.55)],
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
