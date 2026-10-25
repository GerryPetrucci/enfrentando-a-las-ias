import { FORMATOS_ESCENA } from './layout.js';
const r = (x, y, ancho, alto) => ({ x, y, ancho, alto });

export function colocarLobo(formato, jugadores = 8) {
  const f = Object.hasOwn(FORMATOS_ESCENA, formato) ? FORMATOS_ESCENA[formato] : null;
  if (!f) throw new Error(`formato desconocido: ${String(formato)}`);
  if (![8, 12].includes(jugadores)) throw new Error('La escena de Lobo admite 8 o 12 asientos.');
  const vertical = formato === '9x16';
  const escenario = vertical ? r(130, 410, 820, 472) : r(96, 138, 1040, 624);
  const aldea = vertical ? r(130, 902, 820, 354) : r(1160, 138, 664, 624);
  const columnas = vertical ? 4 : (jugadores === 8 ? 2 : 3);
  const filas = Math.ceil(jugadores / columnas), hueco = 10;
  const ancho = (aldea.ancho - hueco * (columnas - 1)) / columnas;
  const alto = (aldea.alto - hueco * (filas - 1)) / filas;
  return {
    formato, ancho: f.ancho, alto: f.alto, zona: { ...f.zona }, mesa: r(0, 0, f.ancho, f.alto),
    etiqueta: vertical ? r(130, 285, 820, 36) : r(96, 990, 1728, 36),
    cabecera: vertical ? r(130, 330, 820, 64) : r(96, 54, 1728, 64),
    escenario, aldea,
    panorama: vertical ? r(130, 410, 820, 846) : r(96, 138, 1728, 624),
    subtitulos: vertical ? r(130, 1276, 820, 224) : r(96, 790, 1728, 180),
    asientos: Array.from({ length: jugadores }, (_, i) => r(aldea.x + (i % columnas) * (ancho + hueco), aldea.y + Math.floor(i / columnas) * (alto + hueco), ancho, alto)),
  };
}

export function ordenarPorVotos(conteo, jugadores) {
  return Array.from({ length: jugadores }, (_, i) => i).sort((a, b) => (conteo[b] ?? 0) - (conteo[a] ?? 0) || a - b);
}
