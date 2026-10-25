// Decorados para el resto del recorrido. Solo presentación, cuadrícula 256x96.
const r = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="var(--fa-${c})"/>`;
const g = (clase, contenido) => `<g class="${clase}">${contenido}</g>`;
const caja = (x, y, w, h) => r(x, y, w, h, 'sombra') + r(x + 1, y + 1, w - 2, h - 2, 'madera') + r(x + 2, y + 3, w - 4, 2, 'maderaLuz') + r(x + 3, y + 2, 2, h - 4, 'maderaLuz');
export function decoradoExtendido(familia) {
  let s = '';
  if (familia === 'control') {
    s += r(180, 14, 66, 62, 'sombra') + r(182, 16, 62, 58, 'acero') + r(186, 21, 54, 28, 'cielo');
    for (let x = 199; x < 241; x += 14) s += r(x, 21, 2, 28, 'metal');
    s += r(182, 50, 63, 4, 'metal') + r(190, 59, 29, 2, 'linea') + r(229, 59, 7, 10, 'sombra');
    s += r(20, 27, 34, 23, 'sombra') + r(22, 29, 30, 17, 'acero') + g('monitor-pixel', r(24, 32, 17, 1, 'borrado') + r(24, 36, 24, 1, 'borrado') + r(24, 40, 11, 1, 'borrado'));
  } else if (familia === 'archivo') {
    for (const x of [18, 57, 188, 221]) {
      s += r(x, 16, 29, 59, 'sombra') + r(x + 1, 17, 27, 56, 'acero');
      for (let y = 20; y < 72; y += 13) s += r(x + 3, y, 23, 10, 'linea') + r(x + 11, y + 4, 7, 2, 'metal');
    }
    s += r(101, 23, 41, 20, 'sombra') + r(103, 25, 37, 16, 'papel') + r(107, 29, 22, 2, 'acero') + r(107, 34, 17, 1, 'linea');
    s += g('papel-pixel', r(89, 70, 8, 2, 'papel'));
  } else if (familia === 'galeria') {
    for (const x of [24, 83, 189]) {
      s += r(x, 18, 35, 58, 'sombra') + r(x + 2, 20, 31, 55, 'acero') + r(x + 5, 24, 25, 12, 'cielo');
      for (let j = 0; j < 4; j++) s += r(x + 8 + j * 6, 24, 1, 12, 'linea');
      s += r(x + 27, 46, 3, 2, 'metal');
    }
    s += r(0, 12, 256, 2, 'linea');
  } else if (familia === 'almacen') {
    for (const [x, y, w, h] of [[16, 52, 35, 23], [18, 32, 29, 20], [53, 58, 24, 17], [187, 45, 28, 30], [215, 52, 34, 23], [218, 29, 28, 23]]) s += caja(x, y, w, h);
    s += r(84, 22, 85, 3, 'acero') + r(87, 25, 2, 19, 'linea') + r(163, 25, 2, 19, 'linea');
  } else if (familia === 'tunel') {
    s += r(0, 0, 256, 76, 'sombra');
    for (let i = 0; i < 5; i++) {
      s += r(i * 5, 23 - i * 4, 5, 53 + i * 4, 'acero') + r(251 - i * 5, 23 - i * 4, 5, 53 + i * 4, 'acero');
    }
    s += r(25, 3, 206, 5, 'acero') + r(31, 12, 194, 2, 'linea') + r(42, 20, 172, 1, 'pared');
    s += r(0, 76, 256, 8, 'agua') + g('agua-pixel', r(35, 79, 23, 1, 'linea') + r(103, 81, 33, 1, 'linea') + r(196, 79, 17, 1, 'linea'));
    s += g('gota-pixel', r(61, 27, 1, 3, 'aguaLuz'));
  } else if (familia === 'muro') {
    s += r(0, 0, 256, 20, 'cielo') + r(0, 20, 256, 4, 'metal');
    for (let x = 5; x < 256; x += 15) s += r(x, 17, 8, 1, 'linea') + r(x + 3, 14, 2, 7, 'linea');
    for (let y = 27; y < 73; y += 14) for (let x = 0; x < 256; x += 31) s += r(x + y % 6, y, 28, 11, 'ladrillo') + r(x + 4, y + 3, 9, 1, 'linea');
  } else if (familia === 'vehiculos') {
    s += r(0, 0, 256, 22, 'cielo') + r(176, 17, 76, 59, 'sombra') + r(179, 20, 70, 54, 'acero');
    for (let y = 23; y < 74; y += 5) s += r(180, y, 68, 1, 'linea');
    s += r(15, 54, 61, 15, 'ropa') + r(47, 45, 21, 10, 'ropa') + r(50, 47, 15, 7, 'cielo') + r(13, 63, 64, 4, 'metal');
    s += r(22, 65, 10, 10, 'sombra') + r(58, 65, 10, 10, 'sombra') + g('baliza-pixel', r(72, 57, 3, 3, 'rastro'));
  } else if (familia === 'foso') {
    s += r(0, 0, 256, 22, 'cielo') + r(0, 25, 256, 48, 'sombra') + r(0, 24, 256, 3, 'acero');
    for (let x = 0; x < 256; x += 20) s += r(x, 28, 1, 42, 'pared');
    s += r(20, 70, 216, 12, 'agua') + r(0, 73, 33, 9, 'linea') + r(222, 73, 34, 9, 'linea');
    s += g('agua-pixel', r(44, 74, 27, 1, 'aguaLuz') + r(126, 79, 22, 1, 'linea') + r(174, 75, 32, 1, 'linea'));
  } else if (familia === 'exterior') {
    s += r(0, 0, 256, 76, 'cielo');
    for (const [x, y] of [[10, 9], [62, 13], [113, 4], [171, 19], [237, 11]]) s += r(x, y, 1, 1, 'metal');
    for (let x = 0; x < 256; x += 13) s += r(x, 54 + x % 11, 13, 23 - x % 11, 'sombraRopa');
    s += r(0, 72, 256, 4, 'ropa') + r(26, 40, 17, 4, 'acero') + r(29, 44, 3, 28, 'acero') + r(37, 44, 3, 28, 'acero');
  }
  return s;
}
