// Arte nativo en una cuadrícula de 256x96: píxeles duros, sin texturas externas.
import { decoradoExtendido } from './lugares-pixel-fuga.js';
export const OBSTACULOS_PIXEL = ['celda', 'ronda', 'camara', 'cocina', 'lavanderia', 'enfermeria', 'panel', 'escalera', 'patio', 'perros', 'taller', 'reja', 'turno', 'foco', 'zanja', 'basura', 'muro', 'alambre', 'reflectores', 'alcantarilla', 'vehiculos', 'foso', 'final', 'camioneta'];
const rect = (x, y, w, h, color, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="var(--fa-${color})" ${extra}/>`;
const grupo = (clase, svg) => `<g class="${clase}">${svg}</g>`;

export const PERSONA_PIXEL = `<svg class="sil-svg pixel-persona" viewBox="0 0 16 32" shape-rendering="crispEdges" aria-hidden="true">
  <g class="busto-pixel"><path d="M5 1H11V2H13V7H12V10H4V7H3V3H5Z" fill="var(--fa-sombra)"/>
  <path d="M5 3H11V4H12V7H11V9H5V7H4V4H5Z" fill="var(--fa-piel)"/><path d="M4 3H12V4H10V3H5V5H4Z" fill="var(--fa-sombraRopa)"/>
  <path d="M10 5H11V6H10Z" fill="var(--fa-sombra)"/><path d="M5 10H11V11H13V21H3V11H5Z" fill="var(--sc, var(--c))"/>
  <path d="M3 12H5V20H11V21H3Z" fill="var(--fa-sombra)" opacity=".35"/><path d="M5 12H11V13H5ZM5 15H11V16H5Z" fill="var(--fa-metal)" opacity=".3"/>
  <g class="brazo"><path d="M11 12H14V19H13V21H11Z" fill="var(--sc, var(--c))"/><path d="M11 19H13V22H11Z" fill="var(--fa-piel)"/></g></g>
  <g class="pierna pi"><path d="M4 21H8V29H9V31H3V29H4Z" fill="var(--fa-sombraRopa)"/><path d="M3 29H9V31H3Z" fill="var(--fa-sombra)"/></g>
  <g class="pierna pd"><path d="M9 21H12V29H14V31H9Z" fill="var(--fa-ropa)"/><path d="M9 29H14V31H9Z" fill="var(--fa-sombra)"/></g>
  <g class="venda-pixel"><path d="M5 5H10V7H5Z" fill="var(--fa-papel)"/><path d="M7 5H8V7H7Z" fill="var(--fa-patrulla)"/></g>
  <g class="objeto-credencial"><path d="M12 13H16V19H12Z" fill="var(--fa-papel)"/><path d="M13 14H15V16H13Z" fill="var(--fa-borrado)"/><path d="M13 17H15V18H13Z" fill="var(--fa-acero)"/></g>
  <g class="objeto-cuerda"><path d="M1 18H5V19H6V23H5V24H1V23H0V19H1ZM1 20V22H5V20Z" fill="var(--fa-rastro)" fill-rule="evenodd"/></g></svg>`;

export const BOTIN_PIXEL = `<svg viewBox="0 0 16 16" shape-rendering="crispEdges" aria-hidden="true"><path d="M2 5H14V15H2Z" fill="var(--fa-sombra)"/><path d="M3 6H13V14H3Z" fill="var(--fa-rastro)"/><path d="M5 2H11V5H9V3H7V5H5Z" fill="var(--fa-metal)"/><path d="M3 9H13V10H3ZM7 7H9V12H7Z" fill="var(--fa-madera)"/></svg>`;

function obstaculo(id) {
  if (id === 'panel') return rect(126, 39, 17, 28, 'sombra') + rect(128, 41, 13, 24, 'acero') + rect(130, 43, 9, 4, 'borrado')
    + [0, 1, 2].map((y) => [0, 1, 2].map((x) => rect(130 + x * 3, 51 + y * 4, 2, 2, 'metal')).join('')).join('');
  if (id === 'camara') return rect(115, 16, 3, 10, 'metal') + rect(117, 22, 8, 2, 'metal') + rect(124, 21, 12, 7, 'acero') + rect(135, 22, 3, 4, 'borrado');
  if (id === 'escalera') return Array.from({ length: 6 }, (_, i) => rect(118 + i * 7, 74 - i * 5, 7, i * 5 + 2, i % 2 ? 'acero' : 'linea')).join('');
  if (id === 'lavanderia') return rect(119, 53, 30, 22, 'sombra') + rect(121, 55, 26, 18, 'acero') + [0, 1, 2].map((i) => rect(124 + i * 8, 59, 4, 2, 'sombra') + rect(124 + i * 8, 65, 4, 2, 'sombra')).join('') + rect(122, 51, 19, 4, 'ropa');
  if (id === 'taller') return rect(116, 57, 40, 4, 'metal') + rect(119, 61, 3, 15, 'acero') + rect(149, 61, 3, 15, 'acero') + rect(127, 51, 8, 6, 'rastro');
  if (id === 'zanja') return rect(92, 75, 93, 7, 'sombra') + Array.from({ length: 10 }, (_, i) => rect(95 + i * 9, 76 + i % 2, 5, 1, 'linea')).join('');
  if (id === 'reja') return rect(125, 27, 32, 3, 'metal') + rect(125, 73, 32, 3, 'acero') + Array.from({ length: 5 }, (_, i) => rect(126 + i * 7, 30, 2, 43, 'linea')).join('');
  if (id === 'ronda' || id === 'final') return rect(135, 39, 9, 3, 'ropa') + rect(136, 42, 7, 7, 'piel') + rect(134, 49, 12, 17, 'sombraRopa') + rect(134, 66, 4, 10, 'sombra') + rect(142, 66, 4, 10, 'sombra') + rect(138, 52, 2, 2, 'rastro');
  if (id === 'cocina') return rect(119, 55, 32, 3, 'metal') + rect(122, 58, 3, 15, 'acero') + rect(146, 58, 3, 15, 'acero') + rect(125, 47, 19, 8, 'acero') + rect(123, 46, 23, 2, 'metal');
  if (id === 'enfermeria') return rect(116, 58, 40, 7, 'acero') + rect(120, 55, 31, 5, 'papel') + rect(116, 65, 3, 10, 'metal') + rect(153, 65, 3, 10, 'metal') + rect(141, 44, 13, 11, 'papel') + rect(146, 46, 3, 7, 'patrulla') + rect(144, 48, 7, 3, 'patrulla');
  if (id === 'patio') return rect(118, 63, 32, 4, 'linea') + rect(121, 67, 3, 8, 'acero') + rect(145, 67, 3, 8, 'acero') + rect(122, 56, 24, 3, 'acero');
  if (id === 'perros') return grupo('perro-pixel', rect(123, 60, 25, 9, 'madera') + rect(144, 55, 10, 11, 'maderaLuz') + rect(146, 52, 3, 5, 'madera') + rect(154, 59, 4, 4, 'sombra') + rect(149, 57, 1, 1, 'papel') + rect(126, 68, 3, 8, 'sombra') + rect(143, 68, 3, 8, 'sombra') + rect(119, 57, 4, 7, 'madera'));
  if (id === 'turno') return rect(124, 28, 23, 23, 'sombra') + rect(126, 30, 19, 19, 'papel') + rect(134, 33, 2, 8, 'sombraRopa') + rect(134, 39, 7, 2, 'sombraRopa') + rect(134, 51, 3, 24, 'acero');
  if (id === 'foco' || id === 'reflectores') return rect(132, 32, 3, 43, 'acero') + rect(125, 29, 19, 7, 'sombra') + rect(128, 31, 13, 3, 'luz') + grupo('reflector-pixel', rect(116, 70, 39, 1, 'luz', 'opacity=".2"'));
  if (id === 'basura' || id === 'camioneta') return rect(115, 49, 37, 21, 'ropa') + rect(148, 55, 15, 15, 'acero') + rect(150, 57, 9, 7, 'cielo') + rect(118, 51, 29, 2, 'metal') + rect(121, 68, 9, 8, 'sombra') + rect(149, 68, 9, 8, 'sombra') + rect(160, 65, 3, 2, 'rastro');
  if (id === 'muro') return rect(118, 43, 37, 32, 'linea') + rect(118, 51, 37, 1, 'sombra') + rect(118, 63, 37, 1, 'sombra') + rect(129, 43, 1, 9, 'sombra') + rect(142, 52, 1, 12, 'sombra');
  if (id === 'alambre') return Array.from({ length: 6 }, (_, i) => rect(115 + i * 8, 53 + i % 2, 6, 1, 'metal') + rect(118 + i * 8, 50 + i % 2, 1, 7, 'metal')).join('') + rect(115, 52, 2, 23, 'acero') + rect(161, 52, 2, 23, 'acero');
  if (id === 'alcantarilla') return rect(118, 58, 37, 18, 'sombra') + rect(120, 57, 33, 3, 'linea') + Array.from({ length: 6 }, (_, i) => rect(121 + i * 6, 61, 2, 14, 'acero')).join('');
  if (id === 'vehiculos') return rect(122, 47, 5, 28, 'linea') + rect(122, 47, 42, 3, 'papel') + [0, 1, 2, 3].map((i) => rect(130 + i * 8, 47, 4, 3, 'patrulla')).join('');
  if (id === 'foso') return rect(109, 74, 61, 8, 'sombra') + grupo('agua-pixel', rect(117, 77, 47, 2, 'agua') + rect(129, 78, 18, 1, 'aguaLuz'));
  return ''; // La cerradura ya pertenece a la puerta del bloque.
}

export function fondoPixel(familia, situacion) {
  let s = rect(0, 0, 256, 96, 'sombra') + rect(0, 0, 256, 76, 'pared');
  for (let y = 8; y < 76; y += 12) for (let x = -(y % 24 ? 0 : 12); x < 256; x += 24) {
    s += rect(x, y, 23, 10, (x + y) % 5 ? 'pared' : 'ladrillo') + rect(x, y + 10, 24, 1, 'sombra');
    if ((x + y) % 7 === 0) s += rect(x + 4, y + 3, 4, 1, 'linea', 'opacity=".25"');
  }
  s += rect(0, 76, 256, 20, 'piso') + rect(0, 75, 256, 1, 'linea');
  for (let x = 0; x < 256; x += 16) s += rect(x, 84 + x % 3, 7, 1, 'sombra');
  if (familia === 'bloque') {
    s += rect(181, 9, 64, 67, 'sombra') + rect(182, 10, 2, 65, 'metal') + rect(184, 10, 60, 2, 'metal') + rect(242, 12, 2, 64, 'linea');
    let puerta = rect(186, 14, 53, 61, 'acero') + rect(188, 16, 49, 2, 'metal') + rect(188, 67, 49, 2, 'sombra');
    for (let x = 190; x < 239; x += 8) puerta += rect(x, 19, 2, 47, 'metal') + rect(x + 2, 19, 1, 47, 'sombra');
    puerta += rect(188, 37, 49, 3, 'linea') + rect(230, 43, 6, 8, 'sombra') + rect(232, 45, 2, 3, 'rastro');
    s += grupo('puerta-intacta', puerta);
    let rota = rect(186, 14, 37, 60, 'acero');
    for (let x = 191; x < 219; x += 8) rota += rect(x, 20, 2, 20, 'metal') + rect(x + 3, 40, 2, 9, 'metal') + rect(x + 5, 49, 2, 20, 'metal');
    rota += rect(223, 39, 3, 3, 'rastro') + rect(226, 42, 3, 3, 'rastro') + rect(223, 45, 3, 4, 'rastro');
    s += grupo('puerta-danada', rota);
    s += rect(18, 22, 44, 34, 'sombra') + rect(20, 24, 40, 30, 'cielo');
    for (let x = 23; x < 60; x += 9) s += rect(x, 24, 2, 30, 'acero');
  } else if (familia === 'servicio') {
    s += rect(0, 8, 173, 6, 'sombra') + rect(0, 8, 170, 2, 'metal') + rect(167, 10, 6, 65, 'acero') + rect(167, 10, 1, 65, 'metal');
    for (let x = 184; x < 246; x += 20) s += rect(x, 22, 18, 53, 'sombra') + rect(x + 1, 23, 16, 50, 'acero') + rect(x + 3, 27, 12, 1, 'linea') + rect(x + 3, 30, 12, 1, 'linea') + rect(x + 3, 33, 12, 1, 'linea') + rect(x + 12, 45, 2, 7, 'metal');
    s += rect(65, 18, 22, 22, 'sombra') + rect(67, 20, 18, 18, 'acero');
    s += grupo('ventilador-pixel', rect(75, 22, 3, 14, 'metal') + rect(69, 27, 14, 3, 'metal') + rect(74, 26, 5, 5, 'sombra'));
    s += grupo('vapor-pixel', rect(162, 57, 2, 3, 'linea') + rect(159, 52, 3, 2, 'linea') + rect(161, 46, 2, 3, 'linea'));
  } else if (familia === 'patio') {
    s += rect(0, 0, 256, 23, 'cielo') + rect(7, 8, 1, 1, 'metal') + rect(117, 4, 1, 1, 'metal') + rect(212, 13, 1, 1, 'metal');
    for (let x = 10; x < 256; x += 29) s += rect(x, 23, 2, 52, 'linea');
    for (let y = 28; y < 75; y += 6) for (let x = 10; x < 256; x += 8) s += rect(x + y % 8, y, 2, 1, 'acero') + rect(x + (y + 3) % 8, y + 3, 2, 1, 'acero');
    s += rect(0, 22, 256, 2, 'metal') + rect(0, 71, 256, 2, 'acero');
  } else s += decoradoExtendido(familia);
  s += rect(30, 2, 36, 5, 'sombra') + grupo('lampara-pixel', rect(32, 3, 32, 2, 'luz'));
  s += obstaculo(situacion);
  s += grupo('rastro-puerta', rect(177, 76, 3, 2, 'rastro') + rect(163, 79, 4, 1, 'rastro') + rect(153, 81, 4, 1, 'rastro') + rect(143, 79, 4, 1, 'rastro') + rect(133, 82, 4, 1, 'rastro'));
  let guardia = rect(235, 43, 9, 2, 'sombra') + rect(237, 40, 6, 3, 'ropa') + rect(236, 45, 7, 6, 'piel') + rect(235, 51, 10, 16, 'sombraRopa') + rect(235, 54, 10, 1, 'metal') + rect(238, 53, 2, 2, 'rastro');
  guardia += rect(235, 67, 3, 8, 'sombra') + rect(242, 67, 3, 8, 'sombra') + rect(230, 54, 7, 3, 'ropa') + rect(228, 54, 3, 2, 'luz');
  s += grupo('patrulla-visual', grupo('haz-patrulla', '<path d="M229 54H200V52H174V50H150V48H124V46H105V71H124V69H150V67H174V64H200V60H229Z" fill="var(--fa-luz)" opacity=".13"/>') + grupo('guardia-pixel', guardia));
  return `<svg class="fondo-arquitectura pixel-escenario" viewBox="0 0 256 96" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true">${s}</svg>`;
}
