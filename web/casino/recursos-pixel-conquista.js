import { ARTE_CONQUISTA as A } from '../paleta.js';

// Bloques duros de 18×18: sin imágenes generadas, curvas ni degradados.
// Los PNG de leña/maza conservan aquí una alternativa ante fallos de carga.
export function pintarRecursoPixel(ctx, tipo, x, y, radio) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(radio / 9, radio / 9);
  const b = (color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
  if (tipo === 'Comida') {
    for (const [dx, dy] of [[-5, 0], [0, -2], [5, 0]]) {
      b(A.oroOscuro, dx, -6 + dy, 2, 14 - dy);
      for (let i = 0; i < 3; i++) {
        b(A.oro, dx - 3, -5 + dy + i * 3, 3, 2);
        b(A.marfil, dx + 2, -6 + dy + i * 3, 3, 2);
      }
    }
    b(A.corteza, -5, 4, 11, 2); // atadura de la gavilla
  } else if (tipo === 'Caballos') {
    // Herradura abierta arriba; agujeros y remaches distinguibles a 16px.
    b(A.bordeAcero, -7, -8, 5, 13); b(A.bordeAcero, 2, -8, 5, 13);
    b(A.bordeAcero, -5, 3, 10, 5); b(A.acero, -6, -7, 3, 11);
    b(A.luzRoca, 3, -7, 3, 11); b(A.luzRoca, -4, 4, 8, 3);
    for (const dx of [-5, 4]) for (const dy of [-5, -1, 3]) b(A.bordeRoca, dx, dy, 1, 2);
  } else if (tipo === 'Roca') {
    b(A.bordeRoca, -8, -1, 8, 8); b(A.roca, -7, -3, 6, 8); b(A.luzRoca, -6, -3, 3, 2);
    b(A.bordeRoca, -2, -7, 8, 13); b(A.roca, -1, -6, 6, 9); b(A.luzRoca, 0, -6, 3, 3);
    b(A.bordeRoca, 2, 1, 7, 7); b(A.roca, 3, 1, 5, 5); b(A.luzRoca, 3, 1, 3, 2);
  } else if (tipo === 'Hierro') {
    for (const [dx, dy] of [[-8, 1], [0, 2], [-4, -6]]) {
      b(A.bordeRoca, dx, dy + 2, 9, 5); b(A.roca, dx + 1, dy + 1, 7, 4);
      b(A.luzRoca, dx + 2, dy, 6, 2); b(A.acero, dx + 1, dy + 4, 7, 1);
    }
  } else if (tipo === 'Oro') {
    for (const [dx, dy] of [[-8, 1], [0, -2], [-4, -7]]) {
      b(A.oroOscuro, dx, dy + 1, 8, 6); b(A.oro, dx + 1, dy, 6, 5);
      b(A.marfil, dx + 2, dy, 4, 1); b(A.oroOscuro, dx + 1, dy + 4, 6, 1);
    }
  } else if (tipo === 'Madera') {
    for (const [dx, dy] of [[-8, 0], [-2, 2], [-4, -5]]) {
      b(A.bordeTronco, dx, dy, 11, 5); b(A.tronco, dx + 1, dy, 9, 3); b(A.veta, dx + 1, dy, 2, 4);
    }
  } else if (tipo === 'Tropas') {
    b(A.corteza, -6, 2, 3, 7); b(A.roca, -3, -5, 8, 8);
    b(A.luzRoca, -1, -4, 4, 3); b(A.bordeRoca, -5, -3, 2, 3);
    for (const [dx, dy] of [[0, -8], [5, -4], [3, 3], [-4, -6]]) b(A.luzRoca, dx, dy, 2, 3);
  }
  ctx.restore();
}
