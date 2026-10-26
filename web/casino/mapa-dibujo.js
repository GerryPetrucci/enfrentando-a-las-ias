import { pintarRecursoPixel } from './recursos-pixel-conquista.js';
import { pintarArte } from './arte-conquista.js';
// El dibujo del mapa de la Guerra de territorios en canvas: terreno de pixel art, tinte y bordes de cada reino, fichas por region (recurso, tropas, fortaleza, capital, edificio,
// Maravilla), flechas de ordenes y el estallido de una batalla. La web no puede importar de src/, asi que el mapa llega ya leido de la partida (conquista-datos.js: leerMapa).
// El aspecto es el del prototipo aprobado (privado/prototipos/mundo-regiones.html); las funciones puras (geometria, centros, bordes) se prueban en Node y el dibujo se verifica con
// capturas (herramientas/capturar-escena.mjs). Cada funcion de dibujo recibe el contexto 2D y no toca nada fuera del espacio del mapa.
//
// `colores[k]` es el color del reino k: un texto, o una lista de textos para uno multicolor (Gemini: se alternan por celda).
// Guerra 2.0.0 (etapa 11): cada ficha muestra ademas la composicion del ejercito por tipo (una barra de colores bajo la ficha), un pip por cada reino de visita, un anillo punteado si la region esta aislada
// y una corona en la capital del Hegemon. Todo sale de la foto del turno (`estado.uni`, `estado.aisladas`, `estado.hegemon`): una partida de formato anterior no trae esos datos y se ve como siempre.

import { ARTE_CONQUISTA as A } from '../paleta.js';
import { TINTE_DE_REINO, LETRA_DE_EDIFICIO, MARAVILLA_TURNOS } from './conquista-datos.js';

const FUENTE = 'ui-sans-serif, system-ui, "Segoe UI", sans-serif';
const BOSQUE = 4, MONTANA = 5;

function hash2(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const sombrear = (hex, f) => { const n = parseInt(hex.slice(1), 16), q = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f))); return `rgb(${q(16)},${q(8)},${q(0)})`; };
const colorDe = (colores, k, x = 0, y = 0) => { const c = colores?.[k]; return Array.isArray(c) ? c[(x + y) % c.length] : (c ?? '#888888'); };
export const colorSolido = (colores, k) => { const c = colores?.[k]; return Array.isArray(c) ? c[0] : (c ?? '#888888'); };

// ---- Guerra 2.0.0: unidades por tipo [Lancero, Arquero, Jinete, Ingenio] ----
export const COLOR_DE_TIPO = ['#c9ccd4', '#74c68a', '#f0a43a', '#5fd0d0'];
export const LETRA_DE_TIPO = ['L', 'A', 'J', 'I'];
export const COLOR_CORONA = '#ffd23f';

// Las pilas de unidades que hay en una region, una por reino presente (el dueno y los de visita): [{ k, pila: [L, A, J, I], total }]. Sale de `estado.uni` (filas [region, reino, L, A, J, I]); sin `uni`
// (partida de formato anterior), con filas rotas o con pilas vacias no inventa nada.
export function pilasDeRegion(estado, region) {
  const uni = estado?.uni;
  if (!Array.isArray(uni)) return [];
  const pilas = [];
  for (const f of uni) {
    if (!Array.isArray(f) || f.length < 6 || f[0] !== region) continue;
    const pila = [2, 3, 4, 5].map((i) => Number(f[i]) || 0), total = pila.reduce((a, b) => a + b, 0);
    if (total > 0) pilas.push({ k: f[1], pila, total });
  }
  return pilas;
}

// ---- lo puro ----
// La celda entera (T) y el desplazamiento (ox, oy) con que el mapa cabe, centrado, en `rect`.
export function geometriaDelMapa(mapa, rect) {
  const T = Math.max(1, Math.floor(Math.min(rect.ancho / mapa.ancho, rect.alto / mapa.alto)));
  return { T, ox: rect.x + Math.floor((rect.ancho - mapa.ancho * T) / 2), oy: rect.y + Math.floor((rect.alto - mapa.alto * T) / 2) };
}

// El centro (en pixeles del lienzo) de una region, o null si no existe: la celda que el motor eligio como su centro.
export function centroDeRegion(mapa, id, g) {
  const r = mapa.regs[id];
  if (!r) return null;
  return { x: g.ox + (r.centro % mapa.ancho) * g.T + g.T / 2, y: g.oy + Math.floor(r.centro / mapa.ancho) * g.T + g.T / 2 };
}

// Los bordes entre celdas de regiones distintas (o de una region y el mar), una sola vez cada uno, en unidades de celda: un borde vertical esta en la linea x entre las
// celdas (x - 1, y) y (x, y); uno horizontal, en la linea y entre (x, y - 1) y (x, y). r1 es la region de la izquierda o de arriba, r2 la de la derecha o de abajo.
const CACHE_BORDES = new WeakMap(); // los bordes de un mapa no cambian: se calculan una vez (los pide cada repintado de reinos y cada contorno)
export function bordesDeRegion(mapa) {
  if (CACHE_BORDES.has(mapa)) return CACHE_BORDES.get(mapa);
  const { ancho, alto, region } = mapa, bordes = [];
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) {
    const a = region[y * ancho + x];
    if (x < ancho - 1) { const b = region[y * ancho + x + 1]; if (a !== b && (a >= 0 || b >= 0)) bordes.push({ x: x + 1, y, horizontal: false, r1: a, r2: b }); }
    if (y < alto - 1) { const b = region[(y + 1) * ancho + x]; if (a !== b && (a >= 0 || b >= 0)) bordes.push({ x, y: y + 1, horizontal: true, r1: a, r2: b }); }
  }
  CACHE_BORDES.set(mapa, bordes);
  return bordes;
}

// ---- terreno ----
export function pintarTerreno(ctx, mapa, g, paleta) {
  const { ancho, terreno } = mapa, T = g.T;
  for (let i = 0; i < terreno.length; i++) {
    const x = g.ox + (i % ancho) * T, y = g.oy + Math.floor(i / ancho) * T, v = terreno[i];
    ctx.fillStyle = sombrear(paleta[v] ?? paleta[0], 1 + (hash2(i, 77, 5) - 0.5) * 2 * (v >= 2 ? 0.09 : 0.05));
    ctx.fillRect(x, y, T, T);
    if (v === BOSQUE) { ctx.fillStyle = '#1f4d28'; ctx.fillRect(x + T * 0.2, y + T * 0.25, T * 0.2, T * 0.2); ctx.fillRect(x + T * 0.55, y + T * 0.5, T * 0.2, T * 0.2); }
    if (v === MONTANA) { ctx.fillStyle = '#b9bbc4'; ctx.beginPath(); ctx.moveTo(x + T / 2, y + T * 0.15); ctx.lineTo(x + T * 0.85, y + T * 0.8); ctx.lineTo(x + T * 0.15, y + T * 0.8); ctx.closePath(); ctx.fill(); }
  }
}

// ---- reinos: tinte sobre sus regiones y bordes (oscuros entre regiones del mismo dueno, del color del reino donde cambia de dueno) ----
export function pintarReinos(ctx, mapa, g, dueno, colores, tinte = TINTE_DE_REINO) {
  const { ancho, region } = mapa, T = g.T;
  ctx.globalAlpha = tinte;
  for (let i = 0; i < region.length; i++) {
    const r = region[i], k = r >= 0 ? dueno[r] : -1;
    if (!(k >= 0)) continue;
    const cx = i % ancho, cy = Math.floor(i / ancho);
    ctx.fillStyle = colorDe(colores, k, cx, cy);
    ctx.fillRect(g.ox + cx * T, g.oy + cy * T, T, T);
  }
  ctx.globalAlpha = 1;
  const oscuros = [], porColor = new Map();
  const duenoDe = (r) => (r >= 0 ? dueno[r] ?? -1 : -1);
  const linea = (b, lado) => { // lado: -1 hacia r1 (izquierda o arriba), +1 hacia r2
    const px = g.ox + b.x * T + (b.horizontal ? 0 : lado * 1.5), py = g.oy + b.y * T + (b.horizontal ? lado * 1.5 : 0);
    return b.horizontal ? [px, py, px + T, py] : [px, py, px, py + T];
  };
  for (const b of bordesDeRegion(mapa)) {
    const k1 = duenoDe(b.r1), k2 = duenoDe(b.r2);
    if (k1 >= 0 && k1 === k2) { oscuros.push(linea(b, 0)); continue; }
    if (k1 < 0 && k2 < 0) { oscuros.push(linea(b, 0)); continue; }
    for (const [k, lado] of [[k1, -1], [k2, 1]]) if (k >= 0) { const c = colorSolido(colores, k); if (!porColor.has(c)) porColor.set(c, []); porColor.get(c).push(linea(b, lado)); }
  }
  const trazar = (lineas, estilo, ancho) => {
    ctx.strokeStyle = estilo; ctx.lineWidth = ancho; ctx.beginPath();
    for (const [x1, y1, x2, y2] of lineas) { ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
    ctx.stroke();
  };
  trazar(oscuros, 'rgba(0,0,0,.45)', 1);
  for (const [c, lineas] of porColor) trazar(lineas, c, 3);
}

// El contorno de una region (para resaltarla en una batalla): un solo trazo con todos sus bordes. Una region que no existe no dibuja nada.
export function pintarContorno(ctx, mapa, g, id, color, grosor = 4) {
  if (!mapa.regs[id]) return;
  const T = g.T;
  ctx.strokeStyle = color; ctx.lineWidth = grosor; ctx.lineCap = 'square'; ctx.beginPath();
  for (const b of bordesDeRegion(mapa)) {
    if (b.r1 !== id && b.r2 !== id) continue;
    const x = g.ox + b.x * T, y = g.oy + b.y * T;
    ctx.moveTo(x, y); ctx.lineTo(b.horizontal ? x + T : x, b.horizontal ? y : y + T);
  }
  ctx.stroke();
}

// ---- fichas por region ----
// Los iconos de la hoja del usuario (arte-conquista.js) para los seis recursos (comida, madera, roca, oro, hierro y caballos) y las tropas; cualquier icono que no cargue usa bloques pixel art.
export function pintarIcono(ctx,tipo,x,y,r) {
  if(pintarArte(ctx,tipo,x,y,r*2.2,r*2.2)) return;
  pintarRecursoPixel(ctx,tipo,x,y,r);
}
// El rotulo chico del recurso, debajo de su ilustracion (alto contraste): el sexto recurso (Caballos) es el que mas lo necesita, pero se rotulan los seis igual.
export function pintarRotuloRecurso(ctx, nombre, x, y, tam) {
  ctx.save(); ctx.font = `800 ${tam}px ${FUENTE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, tam / 5); ctx.strokeStyle = '#0b0b0e'; ctx.strokeText(nombre, x, y);
  ctx.fillStyle = '#f2f0ed'; ctx.fillText(nombre, x, y);
  ctx.restore();
}
function torre(ctx, x, y, nivel, color, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = '#0b0b0e'; ctx.fillRect(-9, -9, 18, 18); ctx.fillStyle = color; ctx.fillRect(-7, -4, 14, 12); ctx.fillRect(-7, -9, 4, 5); ctx.fillRect(-2, -9, 4, 5); ctx.fillRect(3, -9, 4, 5);
  ctx.fillStyle = '#fff3c4'; for (let i = 0; i < nivel; i++) ctx.fillRect(-5 + i * 6, 5, 4, 3);
  ctx.restore();
}
function estrella(ctx, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = '#fff3c4'; ctx.strokeStyle = '#0b0b0e'; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 6 : 13; if (i) ctx.lineTo(r * Math.cos(a), r * Math.sin(a)); else ctx.moveTo(r * Math.cos(a), r * Math.sin(a)); }
  ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
}
export function pintarCorona(ctx, x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.fillStyle = COLOR_CORONA; ctx.strokeStyle = '#0b0b0e'; ctx.lineWidth = 2; ctx.beginPath();
  ctx.moveTo(-12, 8); ctx.lineTo(-12, -6); ctx.lineTo(-6, 0); ctx.lineTo(0, -10); ctx.lineTo(6, 0); ctx.lineTo(12, -6); ctx.lineTo(12, 8); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
}
// La barra de composicion: un tramo por tipo presente, de ancho proporcional a sus unidades.
function barraDeComposicion(ctx, cx, y, ancho, alto, pila) {
  const total = pila.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return;
  ctx.save(); ctx.fillStyle = '#0b0b0e'; ctx.fillRect(cx - ancho / 2 - 1.5, y - 1.5, ancho + 3, alto + 3);
  let x = cx - ancho / 2;
  pila.forEach((n, t) => { if (n <= 0) return; const w = (ancho * n) / total; ctx.fillStyle = COLOR_DE_TIPO[t]; ctx.fillRect(x, y, w, alto); x += w; });
  ctx.restore();
}
function pipDeVisita(ctx, x, y, r, color, total) {
  ctx.save(); ctx.fillStyle = '#0b0b0e'; ctx.beginPath(); ctx.arc(x, y, r + 2, 0, 7); ctx.fill(); ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.restore();
  texto(ctx, total, x, y + 1, r * 1.15, 800, '#0b0b0e');
}
function anilloAislado(ctx, x, y, r) {
  ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = '#d8584e'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
}
// El numero de la casilla, siempre visible y de alto contraste, en una esquina libre (no se cruza con tropas, recursos ni edificio): lo pide el usuario para poder
// identificar cada region aunque tenga dueno y fichas encima.
function pintarNumeroCasilla(ctx, x, y, rad, nombre) {
  const w = Math.max(30, rad * 1.5), h = Math.max(20, rad * 0.95), cx = x + rad * 1.35, cy = y + rad * 1.35;
  ctx.save();
  ctx.fillStyle = 'rgba(8,8,12,.92)'; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.roundRect(cx - w / 2, cy - h / 2, w, h, h * 0.3); ctx.fill(); ctx.stroke();
  texto(ctx, nombre, cx, cy + 1, h * 0.72, 800, '#fff3c4');
  ctx.restore();
}
// La Maravilla: grande e identificable (un monumento con pedestal, mas alto que cualquier otra ficha), siempre encima de la region sin tapar la casilla ni las tropas.
function pintarMaravilla(ctx,x,y,rad,n,tope) {
  const u=rad/12, base=y-rad*1.7;
  ctx.save();ctx.translate(x,base);ctx.scale(u,u);
  // El icono de la Maravilla (maravilla.png, de la hoja del usuario) apoyado sobre el contador; sin el (aun no carga o falla) queda el monumento de bloques de siempre.
  if(!pintarArte(ctx,'Maravilla',0,6,58,56,'base')){
    ctx.fillStyle='#0b0b0e';ctx.fillRect(-23,-44,46,49);
    ctx.fillStyle=A.oroOscuro;ctx.fillRect(-22,0,44,4);ctx.fillRect(-20,-4,40,4);
    ctx.fillStyle=A.oro;ctx.fillRect(-18,-8,36,4);ctx.fillRect(-17,-31,34,5);
    ctx.fillStyle=A.marfil;for(const cx of[-14,-5,4,13]){ctx.fillRect(cx-2,-26,4,18);ctx.fillStyle=A.caballo;ctx.fillRect(cx+1,-26,1,18);ctx.fillStyle=A.marfil;}
    ctx.fillStyle=A.oroOscuro;ctx.beginPath();ctx.moveTo(-21,-32);ctx.lineTo(0,-46);ctx.lineTo(21,-32);ctx.closePath();ctx.fill();
    ctx.fillStyle=A.oro;ctx.beginPath();ctx.moveTo(-17,-34);ctx.lineTo(0,-44);ctx.lineTo(17,-34);ctx.closePath();ctx.fill();
    ctx.fillStyle='#fff3c4';ctx.fillRect(-1,-51,2,8);ctx.fillRect(-4,-48,8,2);
    ctx.fillStyle=A.acero;ctx.fillRect(-3,-39,6,5);
  }
  ctx.fillStyle='#0b0b0e';ctx.fillRect(-14,5,28,11);texto(ctx,(n??0)+'/'+tope,0,11,9,800,'#fff3c4');ctx.restore();
}

// La leyenda de los colores de la barra: cuatro cuadros con la letra de cada tipo, en la esquina del mapa que se le indique.
export function pintarLeyendaUnidades(ctx, x, y, tam) {
  const paso = tam * 1.7, ancho = paso * 4 - tam * 0.7 + 10;
  ctx.save(); ctx.fillStyle = 'rgba(8,8,12,.8)'; ctx.beginPath(); ctx.roundRect(x - 5, y - 5, ancho, tam + 10, 6); ctx.fill();
  LETRA_DE_TIPO.forEach((letra, t) => { const cx = x + t * paso; ctx.fillStyle = COLOR_DE_TIPO[t]; ctx.fillRect(cx, y, tam, tam); texto(ctx, letra, cx + tam / 2, y + tam / 2 + 1, tam * 0.78, 800, '#0b0b0e'); });
  ctx.restore();
}
function texto(ctx, s, x, y, tam, peso = 800, color = '#f2f0ed', alineacion = 'center') {
  ctx.fillStyle = color; ctx.font = `${peso} ${tam}px ${FUENTE}`; ctx.textAlign = alineacion; ctx.textBaseline = 'middle'; ctx.fillText(String(s), x, y);
}

// `estado` es la foto del mapa (registro.estado o estadoInicial): duenos, tropas, fortaleza, edificios (letra) y si estan danados, y la Maravilla.
export function pintarFichas(ctx, mapa, g, estado, colores) {
  const T = g.T, rad = Math.max(13, T * 0.62), capitales = mapa.inicio.capitales, aisladas = new Set((Array.isArray(estado?.aisladas) ? estado.aisladas : []).filter(Number.isInteger));
  // Distancias pensadas para que los circulos de tropas, recursos, visitas y la insignia de edificio no se encimen entre si (separadas a pedido del usuario).
  const OFF_RECURSO = 1.95, OFF_EDIFICIO = 1.8, OFF_PIP_X = 1.32, OFF_PIP_Y = 0.95;
  for (const reg of mapa.regs) {
    const c = centroDeRegion(mapa, reg.id, g), x = c.x, y = c.y, k = estado?.dueno?.[reg.id] ?? -1;
    if (reg.rec) {
      const ry = y - rad * OFF_RECURSO;
      const rx = x;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.arc(rx, ry, rad * 0.72, 0, 7); ctx.fill(); pintarIcono(ctx, reg.rec, rx, ry, rad * 0.5);
      pintarRotuloRecurso(ctx, reg.rec, rx, ry + rad * 0.95, Math.max(9, rad * 0.32));
    }
    if (k >= 0) {
      const col = colorSolido(colores, k);
      ctx.fillStyle = 'rgba(8,8,12,.9)'; ctx.beginPath(); ctx.arc(x, y + rad * 0.3, rad, 0, 7); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke();
      texto(ctx, estado.tropas?.[reg.id] ?? 0, x, y + rad * 0.34, rad * 1.15);
      const pilas = pilasDeRegion(estado, reg.id), mia = pilas.find((p) => p.k === k);
      if (mia && mia.pila.some((n, t) => t > 0 && n > 0)) barraDeComposicion(ctx, x, y + rad * 1.42, rad * 1.7, Math.max(3, rad * 0.24), mia.pila); // solo Lanceros: sin barra (es lo normal)
      pilas.filter((p) => p.k !== k).slice(0, 2).forEach((v, i) => pipDeVisita(ctx, x + (i ? -1 : 1) * rad * OFF_PIP_X, y - rad * OFF_PIP_Y, rad * 0.48, colorSolido(colores, v.k), v.total));
      if (aisladas.has(reg.id)) anilloAislado(ctx, x, y + rad * 0.3, rad * 1.22);
      const fort = estado.fort?.[reg.id] ?? 0;
      if (fort > 0) torre(ctx, x - rad * OFF_EDIFICIO, y + rad * 0.3, fort, col, rad / 24);
      if (capitales.includes(reg.id)) {
        const cy = y - rad * (reg.rec ? OFF_RECURSO + 1.05 : 1.55);
        if (estado.hegemon === k) pintarCorona(ctx, x, cy, rad / 20);
        else estrella(ctx, x, cy, rad / 20);
      }
      const letra = estado.edif?.[reg.id];
      if (letra) {
        const ex = x + rad * OFF_EDIFICIO, ey = y + rad * 0.3;
        ctx.fillStyle = '#0b0b0e'; ctx.fillRect(ex - rad * 0.45, ey - rad * 0.45, rad * 0.9, rad * 0.9); texto(ctx, (LETRA_DE_EDIFICIO[letra] ?? letra)[0].toUpperCase(), ex, ey + 1, rad * 0.75, 800, '#fff3c4');
        if (estado.dan?.[reg.id]) { ctx.strokeStyle = '#d8584e'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(ex - rad * 0.5, ey + rad * 0.5); ctx.lineTo(ex + rad * 0.5, ey - rad * 0.5); ctx.stroke(); }
      }
    } else if (!reg.rec) {
      // El identificador se pinta una sola vez, en su insignia de alto contraste.
    }
    const m = estado?.maravilla;
    if (m && m.r === reg.id) pintarMaravilla(ctx, x, y, rad, m.n, MARAVILLA_TURNOS);
    pintarNumeroCasilla(ctx, x, y, rad, reg.nombre); // siempre, con dueno o sin el: alto contraste y nunca se cruza con tropas/recursos/edificio
  }
}

// ---- ordenes y batalla ----
// Una flecha fina y curva (no una recta rigida): se arquea levemente hacia un lado, perpendicular al trazo, para verse mas estetica sobre el mapa.
export function pintarFlecha(ctx, desde, hasta, color, n, rad = 13) {
  const dx = hasta.x - desde.x, dy = hasta.y - desde.y, L = Math.hypot(dx, dy);
  if (!(L > 0)) return;
  const ux = dx / L, uy = dy / L, sx = desde.x + ux * rad * 1.5, sy = desde.y + uy * rad * 1.5, ex = hasta.x - ux * rad * 1.7, ey = hasta.y - uy * rad * 1.7;
  const px = -uy, py = ux, curva = Math.min(L * 0.12, 46);
  const mx = (sx + ex) / 2 + px * curva, my = (sy + ey) / 2 + py * curva;
  ctx.save(); ctx.lineCap = 'round';
  ctx.strokeStyle = '#0b0b0e'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = 2.8; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
  ctx.fillStyle = color; ctx.strokeStyle = '#0b0b0e'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(ex + ux * 12, ey + uy * 12); ctx.lineTo(ex - uy * 8, ey + ux * 8); ctx.lineTo(ex + uy * 8, ey - ux * 8); ctx.closePath(); ctx.fill(); ctx.stroke();
  const bx = (sx + ex) / 2 + px * curva * 0.5, by = (sy + ey) / 2 + py * curva * 0.5; // la etiqueta del numero va en el punto medio de la curva, no de la recta
  ctx.fillStyle = 'rgba(8,8,12,.92)'; ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.roundRect(bx - 19, by - 14, 38, 28, 14); ctx.fill(); ctx.stroke();
  texto(ctx, n, bx, by + 1, 19);
  ctx.restore();
}

export function pintarEstallido(ctx, x, y, r) {
  ctx.save(); ctx.fillStyle = 'rgba(255,230,140,.95)'; ctx.strokeStyle = '#0b0b0e'; ctx.lineWidth = 3; ctx.beginPath();
  for (let i = 0; i < 18; i++) { const a = (Math.PI * 2 * i) / 18, rr = i % 2 ? r * 0.5 : r; if (i) ctx.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); else ctx.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a)); }
  ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, r * 0.25, 0, 7); ctx.fill(); ctx.restore();
}
