// Diseno de la pantalla de la escena de Duda y apuesta: donde va cada cosa en cada formato. Todo son rectangulos {x, y, ancho, alto}
// en pixeles del PROPIO lienzo del formato (la escena los desplaza a su lugar en la hoja maestra de 3840x2160).
//
// La web no puede importar de herramientas/ (el sitio publica solo web/ y data/), asi que las medidas de los formatos y de la zona
// segura se repiten aqui; src/pruebas/escena/layout.test.js las compara con herramientas/formatos.mjs.
//
// Sin DOM ni `window`: lo importan la escena (navegador) y las pruebas (Node).

// zona = donde tiene que caber todo lo que el espectador debe leer. En 9:16 es la zona segura de las redes (arriba 285, abajo 420,
// izquierda 60, derecha 130); en 16:9 es un margen del 5 %.
export const FORMATOS_ESCENA = {
  '9x16': { ancho: 1080, alto: 1920, zona: { x: 60, y: 285, ancho: 890, alto: 1215 } },
  '16x9': { ancho: 1920, alto: 1080, zona: { x: 96, y: 54, ancho: 1728, alto: 972 } },
};

const r = (x, y, ancho, alto) => ({ x, y, ancho, alto });

// Un asiento: la placa (nombre, fichas) arriba y debajo el area de las cartas. Las cartas miden 5:7.
function asiento(x, y, ancho, alturaPlaca, alturaCartas, carta) {
  const hueco = 8;
  return {
    caja: r(x, y, ancho, alturaPlaca + hueco + alturaCartas),
    placa: r(x, y, ancho, alturaPlaca),
    cartas: r(x, y + alturaPlaca + hueco, ancho, alturaCartas),
    carta,
  };
}

// Los asientos van en sentido de las manecillas del reloj, como pasa el turno: 0 arriba izquierda, 1 arriba derecha, 2 abajo derecha,
// 3 abajo izquierda.
function dibujar9x16() {
  const carta = { ancho: 100, alto: 140 };
  const [izq, der, ancho] = [60, 515, 435];
  const [arriba, abajo] = [406, 1016];
  const a = (x, y) => asiento(x, y, ancho, 64, 144, carta);
  return {
    etiqueta: r(60, 285, 890, 36),
    cabecera: r(60, 330, 890, 64),
    asientos: [a(izq, arriba), a(der, arriba), a(der, abajo), a(izq, abajo)],
    anuncio: r(60, 640, 890, 240),
    pozo: r(60, 892, 430, 112),
    mazo: r(520, 892, 430, 112),
    subtitulos: r(60, 1252, 890, 248),
  };
}

function dibujar16x9() {
  const carta = { ancho: 120, alto: 168 };
  const [izq, der, ancho] = [96, 1184, 640];
  const [arriba, abajo] = [130, 620];
  const a = (x, y) => asiento(x, y, ancho, 72, 176, carta);
  return {
    etiqueta: r(96, 990, 1728, 36),
    cabecera: r(96, 54, 1728, 64),
    asientos: [a(izq, arriba), a(der, arriba), a(der, abajo), a(izq, abajo)],
    anuncio: r(760, 130, 400, 480),
    pozo: r(760, 630, 400, 110),
    mazo: r(760, 752, 400, 124),
    subtitulos: r(96, 890, 1728, 92),
  };
}

const DIBUJOS = { '9x16': dibujar9x16, '16x9': dibujar16x9 };

export function colocar(formato) {
  const f = FORMATOS_ESCENA[formato];
  if (!f) throw new Error(`formato desconocido: ${String(formato)}. Los formatos de la escena son ${Object.keys(FORMATOS_ESCENA).join(' y ')}.`);
  return { formato, ancho: f.ancho, alto: f.alto, zona: { ...f.zona }, mesa: r(0, 0, f.ancho, f.alto), ...DIBUJOS[formato]() };
}

// Donde cae cada una de las n cartas (1 a 5, de izquierda a derecha) dentro del area de cartas de un asiento: centradas, separadas
// 6 px si caben y encimadas por igual si no. Una entrada ilegible no devuelve cartas.
export function abanico(area, carta, n) {
  if (!Number.isInteger(n) || n < 1) return [];
  const paso = n === 1 ? 0 : Math.floor(Math.min(carta.ancho + 6, (area.ancho - carta.ancho) / (n - 1)));
  const total = carta.ancho + paso * (n - 1);
  const x0 = area.x + Math.floor((area.ancho - total) / 2);
  const y = area.y + Math.floor((area.alto - carta.alto) / 2);
  return Array.from({ length: n }, (_, i) => r(x0 + paso * i, y, carta.ancho, carta.alto));
}
