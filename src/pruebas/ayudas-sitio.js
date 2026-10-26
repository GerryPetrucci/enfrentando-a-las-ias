// Ayuda para probar las paginas del sitio sin navegador: se extrae el script de la pagina y se corre con un `document`, un `location`, un `history`, un `fetch` y un `window` falsos.
// Las importaciones de la pagina (una por linea) se quitan y sus nombres se pasan como parametros, tomados de los modulos de web/.
// Los nodos del `document` falso nacen al pedirlos por id: guardan lo que la pagina les escribe (innerHTML, textContent, value, hidden) y los manejadores que registra.

import { readFileSync } from 'node:fs';
import * as catalogo from '../../web/catalogo.js';
import * as menu from '../../web/menu.js';
import * as propuestas from '../../web/propuestas.js';
import * as textos from '../../web/casino/textos-juego.js';
import * as redes from '../../web/redes.js';
import * as carrusel from '../../web/carrusel.js';
import * as evaluacion from '../../web/casino/evaluacion-conquista.js';
import * as conversacionLobo from '../../web/casino/conversacion-lobo.js';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

export const codigoDe = (archivo) => {
  const html = readFileSync(new URL(`../../web/${archivo}`, import.meta.url), 'utf8');
  return /<script type="module">([\s\S]*?)<\/script>/.exec(html)[1].replace(/^import .*$/gm, '');
};

// opciones: { search, hash, marcador (null = sin red), issues (lo que devuelve la API de GitHub; null = falla), tipoElegido, formulario: { campo: { value } } (los campos del formulario de proponer),
//   publicas: { [id]: serie } (los archivos de data/publicas/ que pide la pagina de una partida) }
export async function correrPagina(archivo, { search = '', hash = '', marcador = { juegos: [], partidas: [] }, issues = [], tipoElegido = 'juego', formulario = {}, publicas = {} } = {}) {
  const nodos = new Map();
  const manejadores = [];
  const llamadasMenu = [];
  const abiertas = [];
  const nodo = (id) => {
    if (!nodos.has(id)) {
      const n = { id, innerHTML: '', textContent: '', value: '', hidden: false, options: [], manejadores: {}, focuseado: false, ...(id === 'form' ? formulario : {}) };
      n.addEventListener = (tipo, fn) => { (n.manejadores[tipo] ??= []).push(fn); };
      n.insertAdjacentHTML = (_donde, h) => { n.innerHTML += h; };
      n.focus = () => { n.focuseado = true; };
      nodos.set(id, n);
    }
    return nodos.get(id);
  };
  const document = {
    title: '',
    getElementById: nodo,
    querySelector: (sel) => (sel.includes(':checked') ? { value: tipoElegido } : { checked: false }),
    querySelectorAll: () => [],
    addEventListener() {},
  };
  const location = { search, hash, pathname: '/pagina.html' };
  const history = { replaceState(_a, _b, url) { history.ultima = url; } };
  const fetch = async (url) => {
    if (String(url).includes('api.github.com')) {
      if (issues === null) throw new Error('sin red');
      return { ok: true, json: async () => issues };
    }
    const publica = /^data\/publicas\/([^?]+)\.json/.exec(String(url));
    if (publica) { const serie = publicas[decodeURIComponent(publica[1])]; return serie ? { ok: true, status: 200, json: async () => structuredClone(serie) } : { ok: false, status: 404, json: async () => null }; }
    throw new Error(`fetch inesperado: ${url}`);
  };
  const window = { open: (...a) => abiertas.push(a) };
  const modulos = {
    ...catalogo, ...menu, ...propuestas, ...textos, ...redes, ...carrusel, ...evaluacion, ...conversacionLobo,
    cargarMarcador: async () => (marcador === null ? { juegos: [], partidas: [], error: true } : marcador),
    montarMenu: (datos, opciones) => llamadasMenu.push(opciones),
  };
  const addEventListener = (tipo, fn) => manejadores.push([tipo, fn]);
  const nombres = Object.keys(modulos);
  await new AsyncFunction('document', 'location', 'history', 'fetch', 'window', 'addEventListener', ...nombres, codigoDe(archivo))(document, location, history, fetch, window, addEventListener, ...nombres.map((k) => modulos[k]));
  return { nodo, document, history, llamadasMenu, abiertas, manejadores };
}

// Datos de ejemplo del marcador con la forma que arma src/marcador.js.
const ia = (id, nombre, color = '#111') => ({ id, nombre, color, inicial: nombre[0] });
const IAS = [ia('claude', 'Claude'), ia('gpt', 'GPT'), ia('gemini', 'Gemini')];
const partida = (serie, n, juego, seed, fecha, estado, extra = {}) => ({ serie, n, juego, fecha, seed, estado, hastaTurno: estado === 'publicada' ? null : 8, turnos: estado === 'publicada' ? 18 : null, jugadores: IAS, ganador: null, puntos: null, ...extra });
const CONQ = { id: 'conquista', nombre: 'Guerra de territorios', categoria: 'Estrategia y conquista' };
const MAYOR = { id: 'mayormenor', nombre: 'Mayor o menor', categoria: 'Estrategia de eliminación' };

export const MARCADOR = {
  generado: '2026-10-21T16:48:55.317Z',
  juegos: [
    { ...CONQ, versionReglas: 'conquista-1.1.0', sistema: 'REGLAS DE LA GUERRA', tabla: [{ ...IAS[0], partidas: 1, victorias: 1, empates: 0, derrotas: 0, puntos: 5, puntosPorPartida: 5 }] },
    { ...MAYOR, versionReglas: 'mayormenor-1.0.0', sistema: null, tabla: [] },
  ],
  partidas: [
    partida('s2', 1, MAYOR, 2991144164, '2026-10-21', 'publicada', { ganador: 'GPT', puntos: [0, 4, 0] }),
    partida('s1', 1, CONQ, 552912962, '2026-10-19', 'publicada', { ganador: 'Claude', puntos: [4, 2, 0] }),
    partida('s1', 2, CONQ, 552912962, '2026-10-19', 'por-publicarse', { jugadores: [IAS[1], IAS[2], IAS[0]], ganador: 'NO DEBE SALIR', puntos: [9, 9, 9] }),
  ],
};
