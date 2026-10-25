// Colores de cada IA: UNA sola fuente para todos los juegos, el sitio, el reproductor y el codigo.
// Nunca pongas el color de una IA dentro de un juego o de una escena: pidelo aqui con su id
// (la clave de CONTENDIENTES, la misma que trae cada jugador en los resultados).
//
// Se usan colores, nunca logos ni marcas (regla de marca del proyecto). Los codigos salen de las guias
// de marca que circulan para cada proveedor, no de documentos oficiales; Llama no tiene color propio y
// el magenta se eligio por ser el que mas se separa del resto (ver src/pruebas/paleta.test.js).
//
//   color  relleno principal (territorios, discos, barras)
//   texto  la misma identidad, legible sobre fondo oscuro (nombres, avisos)
//   multi  solo si la IA es multicolor: lista de colores para franjas o degradados
//
// Archivo ES module: lo importan Node (src/modelos.js) y las paginas del sitio.

export const PALETA = {
  claude:   { nombre: 'Claude',   color: '#D97757', texto: '#D97757' },
  gpt:      { nombre: 'GPT',      color: '#F4F4F2', texto: '#F4F4F2' },
  gemini:   { nombre: 'Gemini',   color: '#4285F4', texto: '#8AB4F8', multi: ['#4285F4', '#EA4335', '#FBBC05', '#34A853'] },
  deepseek: { nombre: 'DeepSeek', color: '#4D6BFE', texto: '#8CA0FF' },
  llama:    { nombre: 'Llama',    color: '#D946EF', texto: '#E879F9' },
  // Modelos gratis (no gastan credito). Sin guia de marca: colores propios, elegidos para no confundirse con los de arriba.
  'nemotron-ultra': { nombre: 'Nemotron Ultra', color: '#84CC16', texto: '#84CC16', gratis: true },
  'nemotron-super': { nombre: 'Nemotron Super', color: '#FACC15', texto: '#FACC15', gratis: true },
  laguna:   { nombre: 'Laguna',   color: '#06B6D4', texto: '#22D3EE', gratis: true },
  ling:     { nombre: 'Ling',     color: '#E11D48', texto: '#FB7185' }, // ya no es gratis (17 oct 2026): se conserva su color propio
  // Modelos sumados el 25 de octubre de 2026 tras la prueba de humo (privado/planes/plan-probar-modelos-nuevos.md). Sin guia de marca: tonos
  // propios, repartidos por el circulo cromatico en los huecos que dejaban los de arriba y con luminosidad de fondo oscuro (L* >= 48); los eligio
  // un optimizador con la misma metrica de src/pruebas/paleta.test.js (separacion en Lab sobre cada terreno del mapa) y se revisaron a ojo.
  mistral:  { nombre: 'Mistral',  color: '#F08C19', texto: '#F08C19' },
  grok:     { nombre: 'Grok',     color: '#84F1D0', texto: '#84F1D0' },
  qwen:     { nombre: 'Qwen',     color: '#B2A0E3', texto: '#B2A0E3' },
  minimax:  { nombre: 'MiniMax',  color: '#F1279A', texto: '#F55DB3' },
  glm:      { nombre: 'GLM',      color: '#E9F580', texto: '#E9F580' },
  kimi:     { nombre: 'Kimi',     color: '#AA65D2', texto: '#BF8BDD' },
  // Phi-4 es economico y no tiene version de gama media entre los contendientes: color propio, y de practica como las variantes de abajo.
  phi4:     { nombre: 'Phi-4',    color: '#52F48E', texto: '#52F48E', practica: true },
};

// Variantes economicas de practica: usan el color de la FAMILIA de su proveedor y solo cambian el nombre. `familia` le dice a
// src/pruebas/paleta.test.js que no las compare con su propia familia (sino con las demas).
const variante = (familia, nombre) => ({ ...PALETA[familia], nombre, familia, practica: true });
PALETA.haiku = variante('claude', 'Claude Haiku');
PALETA.luna = variante('gpt', 'GPT Luna');
PALETA['flash-lite'] = variante('gemini', 'Gemini Flash-Lite');
PALETA.ministral = variante('mistral', 'Ministral 8B');
PALETA['qwen-flash'] = variante('qwen', 'Qwen Flash');
PALETA['glm-flash'] = variante('glm', 'GLM Flash');

const NEUTRO = '#888888';

// Ambiente del primer arco visual de La Fuga, separado de los colores de modelos.
export const FUGA_AMBIENTE = {
  pared: '#1b2a36', sombra: '#0a121b', linea: '#69818d', acero: '#354b59',
  luz: '#e2c797', rastro: '#e4b76a', patrulla: '#f27b70', borrado: '#8bc9b6',
  metal: '#8c9ba3', piso: '#1b242b', ladrillo: '#34424e', cielo: '#111c32',
  piel: '#d7ae84', ropa: '#58727a', sombraRopa: '#263c49',
  madera: '#695748', maderaLuz: '#9a8060', papel: '#cfccad', agua: '#1b3c4c', aguaLuz: '#7aa8b3',
};

// Ambiente de Lobo en la aldea: aldea de noche, separado de los colores de modelos.
export const LOBO_AMBIENTE = {
  piel: '#d7ae84', ropa: '#5a4a6b', sombraRopa: '#2b2338', sombra: '#0c0a14',
  pared: '#2a2338', linea: '#746a8f', luz: '#f2d98b', cielo: '#100e1c',
  ojoLobo: '#e8c34a', pelajeLobo: '#352c38', hocicoLobo: '#1a1620', colmilloLobo: '#f5f3ec',
  tunicaVidente: '#3a2f5c', orbVidente: '#8fe0e8', orbVidenteBorde: '#1f6b73',
  sombreroBruja: '#2f3d2a', calderoBruja: '#1d1a24', calderoLuz: '#4caf6b',
  arcoCazador: '#6b4a32', arcoLuz: '#a9794f', cuerdaArco: '#cfccad',
  llamaRoja: '#c23b2e', llamaNaranja: '#f0822e', llamaAmarilla: '#ffd84a',
  corazon: '#e0556b', corazonLuz: '#f48ba0',
};

export const paletaDe = (id) => PALETA[id] ?? null;
// `respaldo` es el color que trae el resultado guardado: sirve para estrategias base y para IAs nuevas.
export const colorDe = (id, respaldo = NEUTRO) => PALETA[id]?.color ?? respaldo;
export const textoDe = (id, respaldo = NEUTRO) => PALETA[id]?.texto ?? respaldo;
export const franjasDe = (id) => PALETA[id]?.multi ?? null;
// Valor listo para `background:` en CSS (sitio y plantillas): color liso o degradado si es multicolor.
export const fondoCSS = (id, respaldo = NEUTRO) => {
  const m = franjasDe(id);
  return m ? `linear-gradient(135deg, ${m.join(', ')})` : colorDe(id, respaldo);
};

// Materiales del mapa de Guerra de territorios.
export const ARTE_CONQUISTA = Object.freeze({
  "carne": "#c96a4f",
  "sombraCarne": "#7a3524",
  "marfil": "#efe6d2",
  "sombraHueso": "#8a7f66",
  "corteza": "#7a5027",
  "sombraCorteza": "#3f260f",
  "tronco": "#9a6b3f",
  "bordeTronco": "#4a2f18",
  "veta": "#d2a56b",
  "anillo": "#7a4f28",
  "roca": "#9a9eac",
  "bordeRoca": "#4f525c",
  "luzRoca": "#c3c6d0",
  "acero": "#7ea6cc",
  "bordeAcero": "#3d5a7a",
  "luzAcero": "#9fc1e0",
  "oro": "#f1c84b",
  "oroOscuro": "#9a7412",
  "caballo": "#c99a5b",
  "bordeCaballo": "#6b4a24",
  "crin": "#4a3416"
});
