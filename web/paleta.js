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
  ling:     { nombre: 'Ling',     color: '#E11D48', texto: '#FB7185', gratis: true },
};

// Variantes economicas de practica: usan el color de la FAMILIA de su proveedor y solo cambian el nombre. `familia` le dice a
// src/pruebas/paleta.test.js que no las compare con su propia familia (sino con las demas).
const variante = (familia, nombre) => ({ ...PALETA[familia], nombre, familia, practica: true });
PALETA.haiku = variante('claude', 'Claude Haiku');
PALETA.luna = variante('gpt', 'GPT Luna');
PALETA['flash-lite'] = variante('gemini', 'Gemini Flash-Lite');

const NEUTRO = '#888888';

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
