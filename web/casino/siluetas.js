// Las acciones de la silueta de La Fuga: cada una es una funcion PURA del tiempo (t de 0 a 1) que dice donde esta la silueta y que pose tiene. La mesa (mesa-fuga.js) las recorre con su propio
// reloj de pantalla y solo pone lo que devuelven; aqui no hay DOM. Se prueban en Node (src/pruebas/escena/siluetas.test.js).
//
//   (t, ctx) -> { x, y, pose: { rot, paso, brazo, agacha }, color }
//   x    posicion horizontal como fraccion del ancho de la imagen (la silueta mide la mitad de su alto: x es el centro). Fuera de 0..1 esta fuera del cuadro.
//   y    desplazamiento vertical como fraccion del alto de la imagen (0 = pisando el suelo; positivo = mas abajo)
//   pose rot: grados (positivo = hacia adelante) · paso: fase de la caminata, 0 a 1 (0 = de pie) · brazo: 0 (abajo) a 1 (arriba) · agacha: 0 a 1
//   ctx  { desde, hasta, color, colorCaido, objeto }: de donde sale, a donde va, el color de su IA (llega de web/paleta.js, nunca esta aqui), el color de quien cae y donde esta el objeto
//
// Una accion antes de empezar vale lo de t = 0 y despues de terminar lo de t = 1; con basura, t = 0. Ninguna cambia el contexto.

const acotar = (t) => (Number.isFinite(t) ? Math.max(0, Math.min(1, t)) : 0);
const mezcla = (a, b, t) => a + (b - a) * t;
const suave = (t) => t * t * (3 - 2 * t);
const bulto = (t) => 4 * t * (1 - t); // sube de 0 a 1 en la mitad y baja a 0
const contexto = (ctx) => ({ desde: 0.12, hasta: 0.8, color: '#888888', colorCaido: '#ff5a4d', objeto: 0.5, ...(ctx && typeof ctx === 'object' ? ctx : {}) });
const paso = (t, ciclos) => (t * ciclos) % 1;
const pose = (extra = {}) => ({ rot: 0, paso: 0, brazo: 0, agacha: 0, ...extra });

function pasa(t, ctx) {
  const c = contexto(ctx), u = acotar(t);
  return { x: mezcla(c.desde, c.hasta, suave(u)), y: -0.01 * Math.abs(Math.sin(u * Math.PI * 6)), pose: pose({ paso: paso(u, 6) }), color: c.color };
}

// Camina y, a mitad de camino, tropieza: se inclina hacia adelante y se agacha un momento antes de enderezarse y seguir.
function tropieza(t, ctx) {
  const c = contexto(ctx), u = acotar(t);
  const s = acotar((u - 0.5) / 0.2), golpe = bulto(s);
  return { x: mezcla(c.desde, c.hasta, suave(u)), y: 0.03 * golpe, pose: pose({ paso: paso(u, 6), rot: 14 * golpe }), color: c.color };
}

// Camina hasta un poco mas de la mitad del camino y cae: queda tumbado, sin llegar a la meta y con el color de quien cae.
function cae(t, ctx) {
  const c = contexto(ctx), u = acotar(t);
  const corre = acotar(u / 0.7), q = acotar((u - 0.7) / 0.3);
  const tope = mezcla(c.desde, c.hasta, 0.6);
  return { x: mezcla(c.desde, tope, suave(corre)) + 0.05 * suave(q), y: 0.02 * q, pose: pose({ paso: q > 0 ? 0 : paso(corre, 4), rot: 88 * suave(q) }), color: q > 0.5 ? c.colorCaido : c.color };
}

// Sale por su ruta propia: camina hasta fuera del cuadro.
function sale(t, ctx) {
  const c = contexto(ctx), u = acotar(t);
  return { x: mezcla(c.desde, 1.12, suave(u)), y: -0.01 * Math.abs(Math.sin(u * Math.PI * 7)), pose: pose({ paso: paso(u, 7) }), color: c.color };
}

// Ayudar: da un paso atras y tiende la mano (levanta el brazo y lo baja).
function ayuda(t, ctx) {
  const c = contexto(ctx), u = acotar(t);
  return { x: c.desde - 0.03 * bulto(u), y: 0, pose: pose({ brazo: bulto(u) }), color: c.color };
}

// Por su cuenta: se adelanta unos pasos al frente del carril.
function separa(t, ctx) {
  const c = contexto(ctx), u = acotar(t);
  return { x: c.desde + 0.08 * suave(u), y: 0, pose: pose({ paso: paso(u, 2) }), color: c.color };
}

// Tomar el botin: se acerca al objeto, se agacha y lo levanta.
function toma(t, ctx) {
  const c = contexto(ctx), u = acotar(t);
  return { x: mezcla(c.desde, c.objeto, suave(acotar(u / 0.6))), y: 0.02 * bulto(u), pose: pose({ paso: paso(acotar(u / 0.6), 3), agacha: bulto(u), brazo: bulto(u) }), color: c.color };
}

// Aceptar la oferta del guardia: se queda donde esta y se lleva la mano al oido, como quien escucha.
function acepta(t, ctx) {
  const c = contexto(ctx), u = acotar(t);
  return { x: c.desde, y: 0, pose: pose({ brazo: suave(u), rot: -4 * suave(u) }), color: c.color };
}

export const ACCIONES = { pasa, tropieza, cae, sale, ayuda, separa, toma, acepta };
export const NOMBRES_DE_ACCION = Object.keys(ACCIONES);

// La accion que le toca a un prisionero segun lo que registro el motor: quien sale, sale; los demas pasan, tropiezan o caen.
export function accionDeResultado(paso) {
  if (paso?.sale === true) return 'sale';
  return { tropezo: 'tropieza', cayo: 'cae' }[paso?.resultado] ?? 'pasa';
}
