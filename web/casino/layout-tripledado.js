// Diseno de la pantalla de Triple dado: donde va cada cosa en cada formato. Todo son rectangulos {x, y, ancho, alto} en pixeles del PROPIO lienzo del formato (la escena los
// desplaza a su lugar en la hoja maestra de 3840x2160). Las medidas salen de la maqueta aprobada (privado/prototipos/maqueta-casino-dados.png).
//
// 9:16: el titulo, el banner de ronda y enfrentamiento, cuatro FILAS (una por jugador: placa y casillas de tarjetas arriba; abajo sus tres dados grandes con la combinacion y los puntos
// a un lado, y a la derecha la bandeja de sus 11 dados y la barra de puntos de la ronda) y los subtitulos. 16:9: cuatro COLUMNAS con lo mismo apilado. El panel del cierre y del final
// se dibuja encima de las filas, a proposito.
//
// Sin DOM ni `window`: lo importan la mesa (navegador) y las pruebas (Node).

import { FORMATOS_ESCENA } from './layout.js';

const r = (x, y, ancho, alto) => ({ x, y, ancho, alto });

function dibujar9x16() {
  const filas = Array.from({ length: 4 }, (_, s) => {
    const y = 466 + 196 * s, x = 60;
    return {
      fila: r(x, y, 890, 188),
      placa: r(x + 8, y + 8, 430, 52),
      tarjetas: r(x + 446, y + 8, 436, 52),
      dados: [0, 1, 2].map((i) => r(x + 16 + i * 108, y + 76, 96, 96)),
      combinacion: r(x + 340, y + 76, 170, 44),
      puntos: r(x + 340, y + 128, 170, 44),
      bandeja: r(x + 518, y + 76, 364, 34),
      barra: r(x + 518, y + 128, 364, 18),
    };
  });
  return {
    etiqueta: r(60, 285, 890, 36), cabecera: r(60, 330, 890, 64), banner: r(60, 402, 890, 56), subtitulos: r(60, 1252, 890, 248),
    dado: { lado: 96 }, bandejaLado: 28, filas, panel: r(90, 520, 830, 680),
  };
}

function dibujar16x9() {
  const filas = Array.from({ length: 4 }, (_, s) => {
    const x = 96 + 438 * s, y = 194;
    return {
      fila: r(x, y, 414, 520),
      placa: r(x + 8, y + 8, 398, 52),
      tarjetas: r(x + 8, y + 82, 398, 44),
      dados: [0, 1, 2].map((i) => r(x + 15 + i * 130, y + 142, 120, 120)),
      combinacion: r(x + 8, y + 274, 398, 44),
      puntos: r(x + 8, y + 324, 398, 44),
      bandeja: r(x + 8, y + 384, 398, 34),
      barra: r(x + 8, y + 436, 398, 20),
    };
  });
  return {
    etiqueta: r(96, 990, 1728, 36), cabecera: r(96, 54, 1728, 64), banner: r(96, 126, 1728, 56), subtitulos: r(96, 730, 1728, 252),
    dado: { lado: 120 }, bandejaLado: 30, filas, panel: r(300, 210, 1320, 500),
  };
}

const DIBUJOS = { '9x16': dibujar9x16, '16x9': dibujar16x9 };

export function colocarTripleDado(formato) {
  const f = Object.hasOwn(FORMATOS_ESCENA, formato) ? FORMATOS_ESCENA[formato] : null;
  if (!f) throw new Error(`formato desconocido: ${String(formato)}. Los formatos de la escena son ${Object.keys(FORMATOS_ESCENA).join(' y ')}.`);
  return { formato, ancho: f.ancho, alto: f.alto, zona: { ...f.zona }, mesa: r(0, 0, f.ancho, f.alto), ...DIBUJOS[formato]() };
}
