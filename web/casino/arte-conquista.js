// PNG locales (la hoja de iconos del usuario, recortada por herramientas/recortar-iconos-conquista.mjs); el motor y sus registros no dependen de ellos. Canvas conserva
// sus dibujos como alternativa si las imágenes todavía no cargan o fallan. Roca no viene en la hoja: se sigue dibujando por código.
export const PNG_RECURSOS = Object.freeze({
  Comida:'comida.png', Madera:'madera.png', Oro:'oro.png', Hierro:'hierro.png', Caballos:'caballos.png', Tropas:'tropas.png', Maravilla:'maravilla.png',
});

export function encajarSprite(origen, x, y, ancho, alto, anclaje = 'centro') {
  const escala = Math.min(ancho / origen.ancho, alto / origen.alto);
  const w = origen.ancho * escala, h = origen.alto * escala;
  return { x: x - w / 2, y: anclaje === 'base' ? y - h : y - h / 2, ancho: w, alto: h };
}

// Un icono que se dibuja mucho mas chico que su PNG (el marcador, las fichas) se promedia: sin suavizado el vecino mas cercano salta pixeles y el dibujo se ve roto.
// Uno que se agranda o queda parecido conserva los pixeles duros. `anchoDestino` va en las unidades del contexto: se cuenta su escala (ctx.scale) para saber los pixeles reales.
export function suavizarAlReducir(ctx, anchoDestino, anchoOrigen) {
  const k = typeof ctx?.getTransform === 'function' ? Math.abs(ctx.getTransform().a) || 1 : 1;
  return anchoDestino * k < anchoOrigen * 0.75;
}

const dibujos = new Map();
function cargar(nombre) {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise(resolve => {
    const imagen = new Image();
    imagen.onload = () => resolve(imagen);
    imagen.onerror = () => resolve(null);
    imagen.src = new URL('../arte/conquista/' + nombre, import.meta.url).href;
  });
}

// Se recorta únicamente el margen transparente al dibujar; no se modifica el PNG.
function contenido(imagen, celda) {
  try {
    const c = document.createElement('canvas'); c.width = celda.ancho; c.height = celda.alto;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(imagen, celda.x, celda.y, celda.ancho, celda.alto, 0, 0, c.width, c.height);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    let izquierda = c.width, arriba = c.height, derecha = -1, abajo = -1;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (px[(y * c.width + x) * 4 + 3] < 24) continue;
      izquierda = Math.min(izquierda, x); derecha = Math.max(derecha, x);
      arriba = Math.min(arriba, y); abajo = Math.max(abajo, y);
    }
    return derecha < 0 ? null : { x: celda.x + izquierda, y: celda.y + arriba, ancho: derecha - izquierda + 1, alto: abajo - arriba + 1 };
  } catch { return celda; }
}

export const arteListo = Promise.all(Object.entries(PNG_RECURSOS).map(async ([tipo,nombre])=>{
  const imagen=await cargar(nombre);
  if(imagen) dibujos.set(tipo,{imagen,origen:contenido(imagen,{x:0,y:0,ancho:imagen.naturalWidth,alto:imagen.naturalHeight})});
}));

export function pintarArte(ctx, tipo, x, y, ancho, alto, anclaje = 'centro') {
  const sprite = dibujos.get(tipo);
  if (!sprite?.origen) return false;
  const o = sprite.origen, d = encajarSprite(o, x, y, ancho, alto, anclaje);
  const reduce = suavizarAlReducir(ctx, d.ancho, o.ancho);
  ctx.save(); ctx.imageSmoothingEnabled = reduce; if (reduce) ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sprite.imagen, o.x, o.y, o.ancho, o.alto, d.x, d.y, d.ancho, d.alto);
  ctx.restore();
  return true;
}
