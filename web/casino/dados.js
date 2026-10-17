// La fisica de los dados de Triple dado: un dado que se lanza rebota, gira y termina en la cara que dice el registro. El resultado esta FIJADO de antemano (viene de la partida
// guardada); aqui solo se decide el camino, y sale del seed de la partida y del id del dado (`b1`..`b9`, `rojo`, `azul`): el mismo archivo se ve siempre igual. Nunca usa el azar del navegador ni
// el reloj del equipo. Sin DOM ni `window`: lo importan la mesa (navegador) y las pruebas (Node).
//
// El dado se ve DESDE ARRIBA: el rebote no cambia su altura en pantalla sino su tamano (`escala` sube cuando esta en el aire y vuelve a 1 al tocar el suelo). Mientras rueda muestra
// caras al azar y en el ultimo cuadro muestra la pedida.

import { azarDesdeTexto } from './azar.js';

export const MARGEN_DADO = 24; // medio dado: el centro nunca se acerca mas que esto a un borde de la caja

const entero = (x) => Number.isInteger(x);

// semilla: la de la partida; id: el dado; cara: 1..6 (la que tiene que salir); caja: { ancho, alto } del lugar donde rueda; cuadros: cuantos cuadros tiene la animacion (30 por defecto).
// Devuelve { cuadros: [{ t (0..1), x, y, giro (grados), escala, cara }], final: { x, y, giro, cara } }. Una entrada ilegible no lanza: da un dado quieto en el centro con la cara 1.
export function trayectoria(semilla, id, cara, caja, { cuadros = 30 } = {}) {
  const n = entero(cuadros) && cuadros >= 2 ? Math.min(cuadros, 240) : 30;
  const cabe = caja && Number.isFinite(caja.ancho) && Number.isFinite(caja.alto) && caja.ancho > 2 * MARGEN_DADO && caja.alto > 2 * MARGEN_DADO;
  if (!(entero(cara) && cara >= 1 && cara <= 6) || !cabe) {
    const x = Number.isFinite(caja?.ancho) ? caja.ancho / 2 : 0, y = Number.isFinite(caja?.alto) ? caja.alto / 2 : 0;
    const quieto = { x, y, giro: 0, escala: 1, cara: 1 };
    return { cuadros: Array.from({ length: n }, (_, i) => ({ t: i / (n - 1), ...quieto })), final: { x, y, giro: 0, cara: 1 } };
  }

  const azar = azarDesdeTexto(`dado:${String(semilla)}:${String(id)}`);
  const dentro = (largo) => MARGEN_DADO + azar() * (largo - 2 * MARGEN_DADO);
  const x1 = dentro(caja.ancho), y1 = dentro(caja.alto);
  // sale del lado contrario al de su destino, asi nunca nace encima de donde termina
  const x0 = x1 < caja.ancho / 2 ? caja.ancho / 2 + azar() * (caja.ancho / 2 - MARGEN_DADO) : MARGEN_DADO + azar() * (caja.ancho / 2 - MARGEN_DADO);
  const y0 = dentro(caja.alto);
  const vueltas = 90 * (4 + Math.floor(azar() * 6)) * (azar() < 0.5 ? -1 : 1); // el giro total: multiplo de 90, para terminar derecho
  const aire = 0.45; // cuanto se agranda el dado en lo alto de un rebote

  // la cara que se ve mientras rueda: cambia cada 2 o 3 cuadros y nunca repite la anterior
  const caras = [];
  let actual = 1 + Math.floor(azar() * 6), restan = 0;
  for (let i = 0; i < n - 1; i++) {
    if (restan === 0) { let nueva = actual; while (nueva === actual) nueva = 1 + Math.floor(azar() * 6); actual = nueva; restan = 2 + Math.floor(azar() * 2); }
    caras.push(actual); restan--;
  }
  caras.push(cara);

  const lista = Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1);
    const llegada = 1 - (1 - t) ** 3; // frena al llegar
    const ultimo = i === n - 1;
    return {
      t,
      x: ultimo ? x1 : x0 + (x1 - x0) * llegada,
      y: ultimo ? y1 : y0 + (y1 - y0) * llegada,
      giro: ultimo ? vueltas : vueltas * (1 - (1 - t) ** 2),
      escala: ultimo ? 1 : 1 + aire * Math.abs(Math.sin(3 * Math.PI * t)) * (1 - t) ** 1.5, // tres rebotes que se apagan
      cara: caras[i],
    };
  });
  return { cuadros: lista, final: { x: x1, y: y1, giro: vueltas, cara } };
}
