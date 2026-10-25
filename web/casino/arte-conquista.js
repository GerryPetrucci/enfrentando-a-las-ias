// PNG locales; el motor y sus registros no dependen de ellos. Canvas conserva
// sus dibujos como alternativa si las imágenes todavía no cargan o fallan.
export const PNG_RECURSOS = Object.freeze({ Madera:'madera-haz-lena.png', Tropas:'tropas-maza.png' });

export function encajarSprite(origen, x, y, ancho, alto, anclaje = 'centro') {
  const escala = Math.min(ancho / origen.ancho, alto / origen.alto);
  const w = origen.ancho * escala, h = origen.alto * escala;
  return { x: x - w / 2, y: anclaje === 'base' ? y - h : y - h / 2, ancho: w, alto: h };
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
  ctx.save(); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite.imagen, o.x, o.y, o.ancho, o.alto, d.x, d.y, d.ancho, d.alto);
  ctx.restore();
  return true;
}
