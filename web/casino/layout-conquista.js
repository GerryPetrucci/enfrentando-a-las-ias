// Diseno de pantalla de la escena de la Guerra de territorios: donde va cada cosa en cada formato. Todo son rectangulos {x, y, ancho, alto} en pixeles del PROPIO lienzo del formato
// (la escena los desplaza a su lugar en la hoja maestra de 3840x2160). Las medidas del formato y de la zona salen de layout.js.
//
// 9:16 (el mapa aprobado, mundo-regiones-feed.png): cabecera arriba, el mapa a todo el ancho (celda del motor: 30, 24, 20 o 18 px), el marcador de reinos al pie y el feed
//   abajo a la izquierda SOBRE el mapa. Lo que hay que leer (tarjeta, cartel de traicion, flashback, subtitulos, pantalla final) va dentro de la zona segura de las redes; el mapa y
//   el marcador siguen la maqueta aprobada (el riesgo de que la interfaz de las redes tape el marcador esta anotado en el spec).
// 16:9: el mapa (vertical) a la izquierda con una celda entera que quepa en la zona; a la derecha la cabecera, el marcador, el feed y los subtitulos. La tarjeta A cubre esa columna
//   mientras se muestra y la banda VS cubre todo el ancho.
// `tarjetaAbajo` y `vsAbajo` son la misma tarjeta o banda en la mitad de abajo: la mesa elige arriba o abajo para no tapar la batalla (en 16:9 son iguales a las de arriba).
//
// Sin DOM ni `window`: lo importan la mesa (navegador) y las pruebas (Node).

import { FORMATOS_ESCENA } from './layout.js';

const r = (x, y, ancho, alto) => ({ x, y, ancho, alto });

// Dibuja el mapa dentro de `espacio` con la celda entera mas grande que quepa, centrado.
function ajustarMapa(espacio, mapa) {
  const { ancho, alto } = mapa ?? {};
  if (![ancho, alto].every((v) => Number.isInteger(v) && v > 0)) throw new Error(`mapa ilegible: hacen falta ancho y alto en celdas (recibi ${JSON.stringify(mapa)})`);
  const celda = Math.max(1, Math.floor(Math.min(espacio.ancho / ancho, espacio.alto / alto)));
  const w = ancho * celda, h = alto * celda;
  return { celda, rect: r(espacio.x + Math.floor((espacio.ancho - w) / 2), espacio.y + Math.floor((espacio.alto - h) / 2), w, h) };
}

function dibujar9x16(mapa) {
  const m = ajustarMapa(r(0, 200, 1080, 1500), mapa);
  return {
    escalaCelda: m.celda, mapa: m.rect,
    etiqueta: r(60, 150, 960, 36), cabecera: r(60, 20, 960, 126),
    marcador: r(30, 1700, 1020, 200), feed: r(22, 1290, 590, 392), subtitulos: r(620, 1290, 330, 210),
    cartel: r(60, 300, 890, 80), flashback: r(60, 395, 890, 200),
    tarjeta: r(60, 300, 890, 590), tarjetaAbajo: r(60, 910, 890, 590),
    vs: r(0, 300, 1080, 620), vsAbajo: r(0, 880, 1080, 620),
    panelFinal: r(60, 300, 890, 1180),
  };
}

function dibujar16x9(mapa) {
  const m = ajustarMapa(r(96, 54, 660, 930), mapa);
  return {
    escalaCelda: m.celda, mapa: m.rect,
    etiqueta: r(96, 990, 1728, 36), cabecera: r(784, 54, 1040, 90),
    marcador: r(784, 150, 1040, 240), feed: r(784, 400, 1040, 420), subtitulos: r(784, 830, 1040, 150),
    cartel: r(784, 160, 1040, 80), flashback: r(784, 250, 1040, 200),
    tarjeta: r(784, 90, 1040, 730), tarjetaAbajo: r(784, 90, 1040, 730),
    vs: r(96, 200, 1728, 640), vsAbajo: r(96, 200, 1728, 640),
    panelFinal: r(96, 100, 1728, 880),
  };
}

const DIBUJOS = { '9x16': dibujar9x16, '16x9': dibujar16x9 };

// `mapa` solo necesita `ancho` y `alto` en celdas (el mapa leido de la partida sirve tal cual).
export function colocarConquista(formato, mapa) {
  const f = Object.hasOwn(FORMATOS_ESCENA, formato) ? FORMATOS_ESCENA[formato] : null;
  if (!f) throw new Error(`formato desconocido: ${String(formato)}. Los formatos de la escena son ${Object.keys(FORMATOS_ESCENA).join(' y ')}.`);
  return { formato, ancho: f.ancho, alto: f.alto, zona: { ...f.zona }, mesa: r(0, 0, f.ancho, f.alto), ...DIBUJOS[formato](mapa) };
}
