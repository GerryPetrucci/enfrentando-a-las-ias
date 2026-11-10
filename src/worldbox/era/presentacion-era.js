import { PALETA } from '../../../web/paleta.js';
import { MODELO_A_PALETA, identidades } from '../vivo.js';

// E10: nombre y color de cada reino. UNA fuente de colores: web/paleta.js (nada se duplica aquí). El mismo resultado se envía al puente
// (`opciones.era.facciones`), a la capa de OBS (`facciones[].color/reino`) y a la evidencia, para que se vea igual en los tres sitios.
//
// Regla de colores (documentada en docs/worldbox-era.md):
//  1. Cada reino toma el color de la paleta del repositorio de SU modelo (Claude naranja, GPT marfil...).
//  2. Si los dos modelos son de la MISMA familia (Claude Sonnet vs Claude Haiku, GPT vs GPT Luna) o los dos colores quedan a menos de
//     SEPARACION_MINIMA en Lab (CIE76, la métrica de src/pruebas/paleta.test.js), el reino B usa una variante del color de SU familia
//     mezclada con negro o con blanco (lo que más lo aleje de A), la primera con la separación pedida; así sigue siendo «de ese modelo».
//  3. Los modelos que no están en la paleta (y los bots de prueba) usan colores neutros distintos por posición.
//  4. `--color-a/--color-b` (hex) mandan sobre todo lo anterior; `--colores-juego` no envía color: el juego pone los suyos.
export const SEPARACION_MINIMA = 30;
export const NOMBRE_REINO_MAX = 24;
const NEUTROS = Object.freeze(['#7FA6C9', '#C9A27F']);
const PROVEEDOR_A_FAMILIA = Object.freeze({ anthropic: 'claude', openai: 'gpt', google: 'gemini', 'x-ai': 'grok', deepseek: 'deepseek', mistralai: 'mistral', qwen: 'qwen', 'z-ai': 'glm', moonshotai: 'kimi', minimax: 'minimax', 'meta-llama': 'llama', microsoft: 'phi4' });
const HEX = /^#[0-9a-f]{6}$/i;
const NOMBRE_OK = /^[\p{L}\p{N}](?:[\p{L}\p{N} .'-]*[\p{L}\p{N}.'])?$/u;

const falla = (codigo, detalle) => Object.assign(new Error(`${codigo}: ${detalle}`), { codigo });
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
export function lab(h) {
  const f = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [R, G, B] = rgb(h).map(f);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const g = t => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  return [116 * g(Y) - 16, 500 * (g(X) - g(Y)), 200 * (g(Y) - g(Z))];
}
export const separacion = (a, b) => { const x = lab(a), y = lab(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
const mezclar = (h, objetivo, t) => '#' + rgb(h).map(v => Math.round(v + (objetivo - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();

// Clave de web/paleta.js de un id de modelo (null si no se conoce) y su familia (haiku -> claude).
export function claveDePaleta(modelo) {
  const m = String(modelo ?? '');
  const exacta = MODELO_A_PALETA[m];
  if (exacta) return exacta;
  const prov = m.split('/')[0];
  return Object.hasOwn(PROVEEDOR_A_FAMILIA, prov) && m.includes('/') ? PROVEEDOR_A_FAMILIA[prov] : null;
}
export const familiaDe = clave => clave ? (PALETA[clave]?.familia ?? clave) : null;

// Variante de `base` que se separa de `otro` al menos SEPARACION_MINIMA: prueba mezclas crecientes con negro y con blanco.
export function variante(base, otro) {
  let mejor = null;
  for (const t of [0.25, 0.35, 0.45, 0.55, 0.65]) {
    const c = [mezclar(base, 0, t), mezclar(base, 255, t)].map(x => ({ x, d: separacion(otro, x) })).sort((p, q) => q.d - p.d)[0];
    if (!mejor || c.d > mejor.d) mejor = c;
    if (c.d >= SEPARACION_MINIMA) return c.x;
  }
  return mejor.x;
}

// Colores de los dos reinos. `modelos`: [idA, idB]; `manuales`: [hexA|undefined, hexB|undefined]. Devuelve [{color, base, clave, regla}].
export function colorearReinos(modelos, manuales = []) {
  const claves = modelos.map(claveDePaleta);
  const base = modelos.map((_, i) => claves[i] && PALETA[claves[i]] ? PALETA[claves[i]].color.toUpperCase() : NEUTROS[i]);
  const res = base.map((b, i) => ({ color: b, base: b, clave: claves[i], regla: claves[i] ? 'marca' : 'neutro' }));
  for (let i = 0; i < 2; i++) if (manuales[i]) { exigirColor(manuales[i]); res[i] = { color: manuales[i].toUpperCase(), base: base[i], clave: claves[i], regla: 'manual' }; }
  if (!manuales[1]) {
    const misma = claves[0] && claves[1] && familiaDe(claves[0]) === familiaDe(claves[1]);
    if (misma || separacion(res[0].color, res[1].color) < SEPARACION_MINIMA) res[1] = { ...res[1], color: variante(base[1], res[0].color), regla: misma ? 'familia' : 'parecido' };
  } else if (!manuales[0] && separacion(res[0].color, res[1].color) < SEPARACION_MINIMA) res[0] = { ...res[0], color: variante(base[0], res[1].color), regla: 'parecido' };
  res.forEach(r => { r.separacion_con_rival = Math.round(separacion(res[0].color, res[1].color) * 10) / 10; });
  return res;
}

export const exigirColor = c => { if (typeof c !== 'string' || !HEX.test(c)) throw falla('color_invalido', `«${c}» no es #RRGGBB`); };
export function validarNombreReino(n) {
  if (typeof n !== 'string' || n.length < 1 || n.length > NOMBRE_REINO_MAX || !NOMBRE_OK.test(n) || n.includes('  ')) throw falla('nombre_reino_invalido', `«${n}»: 1 a ${NOMBRE_REINO_MAX} caracteres (letras, dígitos, espacio, punto, apóstrofo o guion)`);
  return n;
}
const limpiar = n => String(n).replace(/[^\p{L}\p{N} .'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, NOMBRE_REINO_MAX).trim();

// participantes: [{id, modelo}] (los dos de la partida). `o`: opciones del CLI (nombre-a/b = nombre del MODELO en pantalla; nombre-reino-a/b; color-a/b; colores-juego).
// `declarados`: nombres del modelo ya declarados (participantes.json) {f1, f2}. Devuelve
// { participantes: [{id, modelo, nombre, reino, color, ...}], facciones: [para opciones.era.facciones], porId }.
export function resolverPresentacion({ participantes, o = {}, declarados = {} }) {
  const ids = participantes.map(p => p.id);
  const lado = [['a', 0], ['b', 1]];
  const nombresModelo = ids.map((id, i) => o[`nombre-${lado[i][0]}`] ?? declarados[id] ?? null);
  const base = identidades(participantes.map((p, i) => ({ id: p.id, modelo: p.modelo, ...(nombresModelo[i] ? { nombre: nombresModelo[i] } : {}) })));
  const manuales = lado.map(([l]) => o[`color-${l}`]);
  const colores = colorearReinos(participantes.map(p => p.modelo), manuales);
  const gameColors = o['colores-juego'] === true;
  // El nombre del reino por omisión es el de la paleta del modelo («Claude», «GPT», «Claude A»), NO el nombre declarado a mano en participantes.json (p. ej. «GPT Sol (EJEMPLO)»).
  const deLaPaleta = identidades(participantes.map(p => ({ id: p.id, modelo: p.modelo })));
  const out = participantes.map((p, i) => {
    const nombre = base.get(p.id).nombre;
    const pedido = o[`nombre-reino-${lado[i][0]}`];
    const reino = pedido !== undefined ? validarNombreReino(pedido) : (limpiar(deLaPaleta.get(p.id).nombre) || `Reino ${lado[i][0].toUpperCase()}`);
    return { id: p.id, modelo: p.modelo, nombre, reino, reino_pedido: pedido !== undefined, color: gameColors ? null : colores[i].color, color_marca: colores[i].color, regla_color: gameColors ? 'juego' : colores[i].regla, clave_paleta: colores[i].clave, separacion: colores[i].separacion_con_rival };
  });
  if (out[0].reino.toLowerCase() === out[1].reino.toLowerCase()) throw falla('nombre_reino_repetido', `los dos reinos se llamarían «${out[0].reino}»; usa --nombre-reino-a / --nombre-reino-b`);
  if (out[0].color_marca === out[1].color_marca) throw falla('colores_repetidos', 'los dos reinos tendrían el mismo color');
  return { participantes: out, porId: Object.fromEntries(out.map(x => [x.id, x])),
    sinCapaReinos: o['sin-capa-reinos'] === true,
    facciones: out.map(x => ({ faccion: x.id, nombre_reino: x.reino, ...(x.color ? { color: x.color } : {}) })) };
}
