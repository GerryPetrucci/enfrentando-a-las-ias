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
  const { x, ancho } = FORMATOS_ESCENA['9x16'].zona;
  const filas = Array.from({ length: 5 }, (_, s) => {
    const y = 658 + 120 * s;
    return { fila: r(x, y, ancho, 112), avatar: r(x + 14, y + 20, 72, 72), nombre: r(x + 100, y + 14, 264, 40), estado: r(x + 100, y + 58, 264, 32), boton: r(x + 380, y + 12, 88, 88), banco: r(x + 480, y + 10, 326, 44), barra: r(x + 480, y + 58, 326, 20), fichas: r(x + 480, y + 84, 326, 20) };
  });
  return {
    etiqueta: r(x, 285, ancho, 36), cabecera: r(x, 330, ancho, 64),
    consola: { marco: r(x, 402, ancho, 244), contador: r(x + 40, 450, ancho - 80, 124), luz: r(x + ancho - 190, 414, 150, 30), rotulo: r(x + 40, 414, 520, 30), sello: r(230, 582, 620, 60) },
    filas, tira: r(x, 1256, ancho, 40), casillaTira: { lado: 36, hueco: 6 }, subtitulos: r(x, 1304, ancho, 196), panel: r(x + 30, 664, ancho - 60, 560),
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
