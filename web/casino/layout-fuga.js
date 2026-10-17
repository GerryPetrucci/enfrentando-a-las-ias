// Diseno de la pantalla de La Fuga (sala de control): donde va cada cosa en cada formato. Todo son rectangulos {x, y, ancho, alto} en pixeles del PROPIO lienzo del formato (la escena los
// desplaza a su lugar en la hoja maestra de 3840x2160). El estilo sale de la maqueta aprobada (privado/prototipos/maqueta-escena-fuga-estilos.html, opcion C); las medidas no son las de la
// maqueta x3 porque su pantalla de 640 de alto no es la zona segura de 9:16 (1215 px): dos camaras de ~570 px no caben.
//
// 9:16: el titulo, una barra con la alarma y la cohesion, las dos camaras una sobre otra y los subtitulos. 16:9: las dos camaras lado a lado, la barra de medidores y los subtitulos debajo.
// Cada camara es un cuadro con una banda de arriba (CAM n, puntos y heridas, luz REC), la IMAGEN (la mini escena de la situacion) y una banda de abajo (la decision y la hora); encima de la
// imagen caen el mensaje de la IA, el riesgo real y el aviso de la oferta del guardia.
//
// Sin DOM ni `window`: lo importan la mesa (navegador) y las pruebas (Node).

import { FORMATOS_ESCENA } from './layout.js';

const r = (x, y, ancho, alto) => ({ x, y, ancho, alto });

// Las piezas de una camara a partir de su cuadro. Banda de arriba: 44 px. Banda de abajo: 52 px.
function camara(x, y, ancho, alto) {
  const arriba = 44, abajo = 52;
  return {
    cuadro: r(x, y, ancho, alto),
    escena: r(x, y + arriba, ancho, alto - arriba - abajo),
    rotulo: r(x + 16, y + 6, Math.round(ancho * 0.5), 32), puntos: r(x + Math.round(ancho * 0.5) + 24, y + 6, Math.round(ancho * 0.5) - 214, 32), rec: r(x + ancho - 160, y + 6, 144, 32),
    sello: r(x + 16, y + alto - 46, ancho - 240, 40), hora: r(x + ancho - 210, y + alto - 44, 194, 36),
    mensaje: r(x + 16, y + arriba + 8, Math.round(ancho * 0.62), 66), riesgo: r(x + ancho - 276, y + arriba + 8, 260, 48), aviso: r(x + 120, y + arriba + 112, ancho - 240, 56),
  };
}

function dibujar9x16() {
  const cams = [camara(60, 486, 890, 396), camara(60, 892, 890, 396)];
  return {
    etiqueta: r(60, 285, 890, 36), cabecera: r(60, 330, 890, 64),
    panel: { marco: r(60, 402, 890, 76), alarma: { rotulo: r(76, 408, 420, 28), barra: r(76, 444, 408, 18) }, cohesion: { rotulo: r(526, 408, 400, 28), barra: r(526, 444, 408, 18) } },
    camaras: cams, subtitulos: r(60, 1296, 890, 204), regla: r(60, 486, 890, 802),
  };
}

function dibujar16x9() {
  const cams = [camara(96, 134, 852, 452), camara(972, 134, 852, 452)];
  return {
    etiqueta: r(96, 990, 1728, 36), cabecera: r(96, 54, 1728, 64),
    panel: { marco: r(96, 606, 1728, 92), alarma: { rotulo: r(116, 612, 780, 30), barra: r(116, 652, 780, 20) }, cohesion: { rotulo: r(960, 612, 840, 30), barra: r(960, 652, 780, 20) } },
    camaras: cams, subtitulos: r(96, 712, 1728, 258), regla: r(96, 134, 1728, 452),
  };
}

const DIBUJOS = { '9x16': dibujar9x16, '16x9': dibujar16x9 };

export function colocarFuga(formato) {
  const f = Object.hasOwn(FORMATOS_ESCENA, formato) ? FORMATOS_ESCENA[formato] : null;
  if (!f) throw new Error(`formato desconocido: ${String(formato)}. Los formatos de la escena son ${Object.keys(FORMATOS_ESCENA).join(' y ')}.`);
  const dibujo = DIBUJOS[formato]();
  return { formato, ancho: f.ancho, alto: f.alto, zona: { ...f.zona }, mesa: r(0, 0, f.ancho, f.alto), ...dibujo };
}
