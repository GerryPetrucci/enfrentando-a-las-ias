// El carrusel de las tarjetas de juego de la portada: una fila que se desliza (con el dedo, la rueda, el teclado o las flechas) SOLO cuando las tarjetas no caben en el ancho de la pagina;
// si caben, quedan una junto a otra y las flechas no aparecen. `estadoDelCarrusel` es puro (se prueba en Node); `montarCarrusel` es lo unico que toca el DOM.

const MARGEN_PX = 2; // tolerancia: los anchos con decimales no cuadran al pixel

// Que se puede hacer con la fila segun lo que mide: ¿desborda?, ¿esta al principio?, ¿al final? Datos raros -> nada que mostrar.
export function estadoDelCarrusel({ scrollLeft = 0, clientWidth = 0, scrollWidth = 0 } = {}) {
  const s = Number(scrollLeft) || 0, c = Number(clientWidth) || 0, w = Number(scrollWidth) || 0;
  return { desborde: w - c > MARGEN_PX, alInicio: s <= MARGEN_PX, alFinal: s + c >= w - MARGEN_PX };
}

// Cuanto avanza una flecha: casi todo lo que se ve (para que la tarjeta de la orilla no se pierda), y como minimo una tarjeta.
export const pasoDelCarrusel = ({ clientWidth = 0, anchoTarjeta = 0, separacion = 0 } = {}) => Math.max(Math.round(clientWidth * 0.85), Math.round(anchoTarjeta + separacion), 1);

// `raiz` es el contenedor (.carrusel) con su pista (.carrusel-pista) y dos botones (.carrusel-flecha con data-dir="-1" y "1"). Devuelve { actualizar, soltar }: `actualizar` se llama cuando
// cambian las tarjetas (una busqueda) y vuelve al principio.
export function montarCarrusel(raiz) {
  const pista = typeof raiz?.querySelector === 'function' ? raiz.querySelector('.carrusel-pista') : null; // sin pista (o sin DOM de verdad, como en las pruebas de la pagina) no hay nada que mover
  if (!pista) return { actualizar() {}, soltar() {} };
  const flechas = [...raiz.querySelectorAll('.carrusel-flecha')];
  const reducido = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let pendiente = 0;
  const pintar = () => {
    pendiente = 0;
    const e = estadoDelCarrusel(pista);
    raiz.dataset.desborde = e.desborde ? 'si' : 'no';
    for (const f of flechas) { const atras = Number(f.dataset.dir) < 0; f.disabled = !e.desborde || (atras ? e.alInicio : e.alFinal); }
  };
  const programar = () => { if (!pendiente) pendiente = requestAnimationFrame(pintar); };
  const mover = (direccion) => {
    const tarjeta = pista.querySelector('.tarjeta');
    const separacion = parseFloat(getComputedStyle(pista).columnGap) || 0;
    pista.scrollBy({ left: direccion * pasoDelCarrusel({ clientWidth: pista.clientWidth, anchoTarjeta: tarjeta?.offsetWidth ?? 0, separacion }), behavior: reducido() ? 'auto' : 'smooth' });
  };
  const alPulsar = (ev) => mover(Number(ev.currentTarget.dataset.dir) || 1);
  for (const f of flechas) f.addEventListener('click', alPulsar);
  pista.addEventListener('scroll', programar, { passive: true });
  const observador = typeof ResizeObserver === 'function' ? new ResizeObserver(programar) : null;
  observador?.observe(pista);
  addEventListener('resize', programar);
  pintar();
  return {
    actualizar() { pista.scrollLeft = 0; pintar(); },
    soltar() { observador?.disconnect(); removeEventListener('resize', programar); for (const f of flechas) f.removeEventListener('click', alPulsar); pista.removeEventListener('scroll', programar); },
  };
}
