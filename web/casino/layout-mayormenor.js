// Diseno de la pantalla de Mayor o menor: donde va cada cosa en cada formato. Todo son rectangulos {x, y, ancho, alto} en pixeles del PROPIO lienzo del formato
// (la escena los desplaza a su lugar en la hoja maestra de 3840x2160). Las medidas salen de la maqueta aprobada (privado/prototipos/maqueta-escenas-mayormenor-*.png).
//
// 9:16: el jugador 0 arriba y el 1 abajo, cada uno con su placa y su tira de numeros (las cartas que le quedan), y el escenario al centro. 16:9: el 0 a la izquierda y el 1 a la
// derecha, con la tira en dos filas, y el escenario en medio. El escenario trae: la carta del crupier, el indicador (?, ▲, ▼ o =), la carta jugada, la caja de la apuesta, el sello,
// la banca (de donde salen las fichas que se ganan) y el mazo del crupier.
//
// Sin DOM ni `window`: lo importan la mesa (navegador) y las pruebas (Node).

import { FORMATOS_ESCENA } from './layout.js';

const r = (x, y, ancho, alto) => ({ x, y, ancho, alto });

function dibujar9x16() {
  const { x, ancho } = FORMATOS_ESCENA['9x16'].zona;
  const forma = { columnas: 11, filas: 1, ancho: 68, alto: 66 };
  return {
    etiqueta: r(x, 285, ancho, 36),
    cabecera: r(x, 330, ancho, 64),
    subtitulos: r(x, 1262, ancho, 238),
    asientos: [
      { placa: r(x, 406, ancho, 64), tira: r(x, 478, ancho, 66), tiraForma: forma },
      { placa: r(x, 1182, ancho, 64), tira: r(x, 1108, ancho, 66), tiraForma: forma },
    ],
    escenario: r(x, 556, ancho, 540),
    carta: { ancho: 150, alto: 210 },
    centro: {
      rotuloCrupier: r(265, 568, 200, 30), rotuloJugada: r(615, 568, 200, 30),
      cartaCrupier: r(290, 604, 150, 210), indicador: r(440, 604, 200, 210), cartaJugada: r(640, 604, 150, 210),
      pastilla: r(662, 820, 110, 28), apuesta: r(130, 850, 820, 112), sello: r(390, 990, 300, 80),
      banca: r(x, 650, 140, 150), mazo: r(800, 650, 150, 170),
    },
  };
}

function dibujar16x9() {
  const forma = { columnas: 6, filas: 2, ancho: 86, alto: 60 };
  return {
    etiqueta: r(96, 990, 1728, 36),
    cabecera: r(96, 54, 1728, 64),
    subtitulos: r(96, 890, 1728, 92),
    asientos: [
      { placa: r(96, 130, 560, 72), tira: r(96, 214, 560, 132), tiraForma: forma },
      { placa: r(1264, 130, 560, 72), tira: r(1264, 214, 560, 132), tiraForma: forma },
    ],
    escenario: r(680, 130, 560, 700),
    carta: { ancho: 170, alto: 238 },
    centro: {
      rotuloCrupier: r(690, 150, 200, 30), rotuloJugada: r(1030, 150, 200, 30),
      cartaCrupier: r(705, 190, 170, 238), indicador: r(880, 190, 160, 238), cartaJugada: r(1045, 190, 170, 238),
      pastilla: r(1075, 436, 110, 28), apuesta: r(700, 480, 520, 116), sello: r(790, 610, 340, 80),
      banca: r(700, 710, 250, 115), mazo: r(970, 710, 250, 120),
    },
  };
}

const DIBUJOS = { '9x16': dibujar9x16, '16x9': dibujar16x9 };

export function colocarMayorMenor(formato) {
  const f = FORMATOS_ESCENA[formato];
  if (!f) throw new Error(`formato desconocido: ${String(formato)}. Los formatos de la escena son ${Object.keys(FORMATOS_ESCENA).join(' y ')}.`);
  return { formato, ancho: f.ancho, alto: f.alto, zona: { ...f.zona }, mesa: r(0, 0, f.ancho, f.alto), ...DIBUJOS[formato]() };
}
