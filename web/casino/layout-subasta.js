// Diseno de la pantalla de Subasta de tiempo: donde va cada cosa en cada formato. Todo son rectangulos {x, y, ancho, alto} en pixeles del PROPIO lienzo del formato (la escena los
// desplaza a su lugar en la hoja maestra de 3840x2160). Las medidas salen de la maqueta aprobada (privado/prototipos/maqueta-casino-subasta.png).
//
// 9:16: el titulo, la consola con el contador grande ("TIEMPO APOSTADO", luz roja "EN VIVO"), cinco FILAS (avatar, nombre y estado, el boton, el banco con su barra y las fichas), la tira
// de las 19 subastas y los subtitulos. 16:9: la consola y la tira a la izquierda y las cinco filas a la derecha. El panel del final se dibuja encima de las filas, a proposito.
//
// Sin DOM ni `window`: lo importan la mesa (navegador) y las pruebas (Node).

import { FORMATOS_ESCENA } from './layout.js';

const r = (x, y, ancho, alto) => ({ x, y, ancho, alto });

function dibujar9x16() {
  const filas = Array.from({ length: 5 }, (_, s) => {
    const y = 616 + 124 * s, x = 60;
    return { fila: r(x, y, 890, 116), avatar: r(x + 14, y + 22, 72, 72), nombre: r(x + 100, y + 16, 300, 40), estado: r(x + 100, y + 62, 300, 34), boton: r(x + 410, y + 14, 88, 88), banco: r(x + 520, y + 12, 356, 44), barra: r(x + 520, y + 62, 356, 22), fichas: r(x + 520, y + 90, 356, 20) };
  });
  return {
    etiqueta: r(60, 285, 890, 36), cabecera: r(60, 330, 890, 64),
    consola: { marco: r(60, 402, 890, 200), contador: r(100, 452, 810, 130), luz: r(760, 414, 150, 30), rotulo: r(100, 414, 520, 30) },
    filas, tira: r(60, 1234, 890, 40), casillaTira: { lado: 40, hueco: 6 }, subtitulos: r(60, 1282, 890, 218), panel: r(90, 620, 830, 560),
  };
}

function dibujar16x9() {
  const filas = Array.from({ length: 5 }, (_, s) => {
    const y = 126 + 148 * s, x = 760;
    return { fila: r(x, y, 1064, 140), avatar: r(x + 16, y + 34, 72, 72), nombre: r(x + 104, y + 20, 340, 44), estado: r(x + 104, y + 72, 340, 36), boton: r(x + 470, y + 26, 88, 88), banco: r(x + 590, y + 18, 450, 50), barra: r(x + 590, y + 76, 450, 24), fichas: r(x + 590, y + 106, 450, 24) };
  });
  return {
    etiqueta: r(96, 990, 1728, 36), cabecera: r(96, 54, 1728, 64),
    consola: { marco: r(96, 126, 640, 420), contador: r(120, 210, 592, 150), luz: r(560, 150, 152, 34), rotulo: r(120, 150, 400, 34) },
    filas, tira: r(96, 560, 640, 36), casillaTira: { lado: 28, hueco: 4 }, subtitulos: r(96, 872, 1728, 110), panel: r(360, 200, 1200, 560),
  };
}

const DIBUJOS = { '9x16': dibujar9x16, '16x9': dibujar16x9 };

export function colocarSubasta(formato) {
  const f = Object.hasOwn(FORMATOS_ESCENA, formato) ? FORMATOS_ESCENA[formato] : null;
  if (!f) throw new Error(`formato desconocido: ${String(formato)}. Los formatos de la escena son ${Object.keys(FORMATOS_ESCENA).join(' y ')}.`);
  return { formato, ancho: f.ancho, alto: f.alto, zona: { ...f.zona }, mesa: r(0, 0, f.ancho, f.alto), ...DIBUJOS[formato]() };
}
