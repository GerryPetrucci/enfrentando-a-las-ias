// Diseno de la pantalla de El numero solitario: donde va cada cosa en cada formato. Todo son rectangulos {x, y, ancho, alto} en pixeles del PROPIO lienzo del formato
// (la escena los desplaza a su lugar en la hoja maestra de 3840x2160). Las medidas salen de la maqueta aprobada (privado/prototipos/maqueta-escenas-solitario-*.png).
//
// 9:16: el titulo, el banner de ronda y fase, cinco FILAS (una por jugador: placa a la izquierda, sus dos cartas en el centro y su estado a la derecha) y los subtitulos.
// 16:9: lo mismo con cinco COLUMNAS (placa arriba, las dos cartas debajo y el estado al pie). El panel del corte y del final se dibuja encima de las filas, a proposito.
//
// Sin DOM ni `window`: lo importan la mesa (navegador) y las pruebas (Node).

import { FORMATOS_ESCENA } from './layout.js';

const r = (x, y, ancho, alto) => ({ x, y, ancho, alto });

function dibujar9x16() {
  const filas = Array.from({ length: 5 }, (_, s) => {
    const y = 466 + 156 * s;
    return { fila: r(60, y, 890, 150), placa: r(76, y + 8, 330, 134), cartas: [r(430, y + 12, 90, 126), r(530, y + 12, 90, 126)], estado: r(640, y + 10, 294, 130) };
  });
  return {
    etiqueta: r(60, 285, 890, 36),
    cabecera: r(60, 330, 890, 64),
    banner: r(60, 402, 890, 56),
    subtitulos: r(60, 1252, 890, 248),
    carta: { ancho: 90, alto: 126 },
    filas,
    panel: r(90, 520, 830, 680),
  };
}

function dibujar16x9() {
  const filas = Array.from({ length: 5 }, (_, s) => {
    const x = 96 + 350 * s;
    return { fila: r(x, 194, 328, 680), placa: r(x + 8, 202, 312, 128), cartas: [r(x + 20, 350, 130, 182), r(x + 178, 350, 130, 182)], estado: r(x + 8, 560, 312, 140) };
  });
  return {
    etiqueta: r(96, 990, 1728, 36),
    cabecera: r(96, 54, 1728, 64),
    banner: r(96, 126, 1728, 56),
    subtitulos: r(96, 890, 1728, 92),
    carta: { ancho: 130, alto: 182 },
    filas,
    panel: r(300, 210, 1320, 650),
  };
}

const DIBUJOS = { '9x16': dibujar9x16, '16x9': dibujar16x9 };

export function colocarSolitario(formato) {
  const f = Object.hasOwn(FORMATOS_ESCENA, formato) ? FORMATOS_ESCENA[formato] : null;
  if (!f) throw new Error(`formato desconocido: ${String(formato)}. Los formatos de la escena son ${Object.keys(FORMATOS_ESCENA).join(' y ')}.`);
  return { formato, ancho: f.ancho, alto: f.alto, zona: { ...f.zona }, mesa: r(0, 0, f.ancho, f.alto), ...DIBUJOS[formato]() };
}
