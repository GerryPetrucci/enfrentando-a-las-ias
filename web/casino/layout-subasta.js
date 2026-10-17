// Diseno de la pantalla de Subasta de tiempo: donde va cada cosa en cada formato. Todo son rectangulos {x, y, ancho, alto} en pixeles del PROPIO lienzo del formato (la escena los
// desplaza a su lugar en la hoja maestra de 3840x2160). Las medidas salen de la maqueta aprobada (privado/prototipos/maqueta-casino-subasta.png).
//
// Los subtitulos de 16:9 van en la columna libre bajo la tira (640 x 370): un resultado con varios comentarios no cabe en una franja de 110 px y quedaba cortado.
// 9:16: el titulo, la consola con el contador grande ("TIEMPO APOSTADO", luz roja "EN VIVO"), cinco FILAS (avatar, nombre y estado, el boton, el banco con su barra y las fichas), la tira
// de las 19 subastas y los subtitulos. 16:9: la consola y la tira a la izquierda y las cinco filas a la derecha. El panel del final se dibuja encima de las filas, a proposito.
//
// Sin DOM ni `window`: lo importan la mesa (navegador) y las pruebas (Node).

import { FORMATOS_ESCENA } from './layout.js';

const r = (x, y, ancho, alto) => ({ x, y, ancho, alto });

function dibujar9x16() {
  const filas = Array.from({ length: 5 }, (_, s) => {
    const y = 658 + 120 * s, x = 60;
    return { fila: r(x, y, 890, 112), avatar: r(x + 14, y + 20, 72, 72), nombre: r(x + 100, y + 14, 300, 40), estado: r(x + 100, y + 58, 300, 32), boton: r(x + 410, y + 12, 88, 88), banco: r(x + 520, y + 10, 356, 44), barra: r(x + 520, y + 58, 356, 20), fichas: r(x + 520, y + 84, 356, 20) };
  });
  return {
    etiqueta: r(60, 285, 890, 36), cabecera: r(60, 330, 890, 64),
    consola: { marco: r(60, 402, 890, 244), contador: r(100, 450, 810, 124), luz: r(760, 414, 150, 30), rotulo: r(100, 414, 520, 30), sello: r(230, 582, 620, 60) },
    filas, tira: r(60, 1256, 890, 40), casillaTira: { lado: 40, hueco: 6 }, subtitulos: r(60, 1304, 890, 196), panel: r(90, 664, 830, 560),
  };
}

function dibujar16x9() {
  const filas = Array.from({ length: 5 }, (_, s) => {
    const y = 126 + 148 * s, x = 760;
    return { fila: r(x, y, 1064, 140), avatar: r(x + 16, y + 34, 72, 72), nombre: r(x + 104, y + 20, 340, 44), estado: r(x + 104, y + 72, 340, 36), boton: r(x + 470, y + 26, 88, 88), banco: r(x + 590, y + 18, 450, 50), barra: r(x + 590, y + 76, 450, 24), fichas: r(x + 590, y + 106, 450, 24) };
  });
  return {
    etiqueta: r(96, 990, 1728, 36), cabecera: r(96, 54, 1728, 64),
    consola: { marco: r(96, 126, 640, 420), contador: r(120, 210, 592, 150), luz: r(560, 150, 152, 34), rotulo: r(120, 150, 400, 34), sello: r(140, 420, 520, 80) },
    filas, tira: r(96, 560, 640, 36), casillaTira: { lado: 28, hueco: 4 }, subtitulos: r(96, 612, 640, 370), panel: r(800, 190, 1000, 540),
  };
}

const DIBUJOS = { '9x16': dibujar9x16, '16x9': dibujar16x9 };

export function colocarSubasta(formato) {
  const f = Object.hasOwn(FORMATOS_ESCENA, formato) ? FORMATOS_ESCENA[formato] : null;
  if (!f) throw new Error(`formato desconocido: ${String(formato)}. Los formatos de la escena son ${Object.keys(FORMATOS_ESCENA).join(' y ')}.`);
  return { formato, ancho: f.ancho, alto: f.alto, zona: { ...f.zona }, mesa: r(0, 0, f.ancho, f.alto), ...DIBUJOS[formato]() };
}
