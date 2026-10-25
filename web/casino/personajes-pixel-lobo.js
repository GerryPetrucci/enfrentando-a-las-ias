// Arte nativo de Lobo en la aldea, mismo patron que pixel-fuga.js: pixeles duros, sin
// texturas externas. Un busto generico de aldeano; el pelo y los ojos base se ocultan (en
// mesa.css) cuando se revela un rol, que trae su propio tocado grande y reconocible a simple
// vista (no un detalle chico encima). El color del cuerpo usa --sc/--c (color del modelo).
const r = (x, y, w, h, color, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="var(--la-${color})" ${extra}/>`;
const g = (clase, svg) => `<g class="${clase}">${svg}</g>`;

// Viewbox ampliado hacia arriba (-9) para que quepan sombrero de bruja, capucha de vidente y
// corazon sin recortarse. El busto "real" vive entre y=0 y y=20, igual que antes.
export const ALDEANO_PIXEL = `<svg class="sil-svg-lobo pixel-aldeano" viewBox="-2 -9 20 29" shape-rendering="crispEdges" aria-hidden="true">
  ${g('cuerpo-base', r(3, 8, 10, 10, 'sc', 'style="fill:var(--sc, var(--c))"') + r(3, 8, 10, 2, 'sombraRopa'))}
  ${g('cabeza-base', r(5, 2, 6, 6, 'piel'))}
  ${g('pelo-base', r(5, 1, 6, 2, 'sombraRopa') + r(4, 2, 1, 3, 'sombraRopa') + r(11, 2, 1, 3, 'sombraRopa'))}
  ${g('ojos-base', r(6, 5, 1, 1, 'sombra') + r(9, 5, 1, 1, 'sombra'))}

  ${g('rol-lobo', ''
    /* orejas triangulares (dos escalones, mas angostas arriba) */
    + r(3, -1, 3, 2, 'pelajeLobo') + r(4, -3, 1, 2, 'pelajeLobo')
    + r(10, -1, 3, 2, 'pelajeLobo') + r(11, -3, 1, 2, 'pelajeLobo')
    /* cabeza peluda, mas ancha que la humana (tapa la cabeza humana de abajo) */
    + r(3, 0, 10, 8, 'pelajeLobo')
    /* hocico claro que sobresale, angosto hacia la nariz */
    + r(5, 4, 6, 3, 'piel') + r(6, 6, 4, 2, 'piel') + r(7, 7, 2, 1, 'hocicoLobo')
    /* ojos rasgados brillantes */
    + r(4, 2, 2, 1, 'ojoLobo') + r(10, 2, 2, 1, 'ojoLobo')
    /* colmillos blancos */
    + r(6, 7, 1, 1, 'colmilloLobo') + r(9, 7, 1, 1, 'colmilloLobo')
  )}

  ${g('rol-vidente', ''
    + r(3, -2, 10, 3, 'tunicaVidente') + r(4, -4, 8, 2, 'tunicaVidente')
    + r(3, 1, 2, 7, 'tunicaVidente') + r(11, 1, 2, 7, 'tunicaVidente')
    + r(6, 1, 4, 6, 'sombra')
    + r(6, 11, 4, 4, 'orbVidente', 'style="filter:drop-shadow(0 0 3px var(--la-orbVidenteBorde))"')
    + r(7, 12, 2, 2, 'orbVidenteBorde')
  )}

  ${g('rol-bruja', ''
    + r(2, 3, 12, 2, 'sombreroBruja') + r(4, 1, 8, 2, 'sombreroBruja') + r(6, -2, 4, 3, 'sombreroBruja') + r(7, -5, 2, 3, 'sombreroBruja')
    + r(-2, 13, 6, 5, 'calderoBruja') + r(-2, 12, 6, 1, 'calderoLuz') + r(-1, 10, 1, 2, 'arcoCazador') + r(2, 10, 1, 2, 'arcoCazador')
  )}

  ${g('rol-cazador', ''
    /* palo de la antorcha, sostenido al costado */
    + r(13, 2, 2, 11, 'arcoCazador') + r(13, 2, 1, 11, 'arcoLuz')
    /* flama arriba del palo: roja ancha abajo, naranja al medio, amarilla angosta en la punta */
    + g('flama-pixel', r(12, -1, 4, 3, 'llamaRoja') + r(13, -3, 2, 2, 'llamaNaranja') + r(13, -4, 2, 1, 'llamaAmarilla'))
  )}

  ${g('enamorado-corazon', ''
    + r(5, -8, 2, 2, 'corazon') + r(9, -8, 2, 2, 'corazon') + r(4, -6, 8, 2, 'corazon')
    + r(5, -4, 6, 2, 'corazonLuz') + r(6, -2, 4, 2, 'corazonLuz') + r(7, 0, 2, 1, 'corazonLuz')
  )}
</svg>`;
