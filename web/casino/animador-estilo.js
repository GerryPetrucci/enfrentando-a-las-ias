// Un animador de estilos en linea con requestAnimationFrame: lleva un valor de 0 a 1 y quien lo llama escribe el estilo en cada cuadro (`alCuadro(p)`). No crea animaciones de Web Animations ni de CSS.
//
// Por que existe: en OBS (Chromium 150, 4K, aceleracion por hardware) una animacion del navegador que se cancela puede dejar su valor viejo en el compositor. En la grabacion de Guerra j3 (28 de octubre de 2026)
// el encabezado, el marcador, el feed y los subtitulos se quedaron invisibles unos 27 s, y despues el mapa se quedo con el zoom puesto y sin recorte, aunque el DOM estaba bien. En los otros juegos no se ve porque
// el valor viejo coincide con el final. Aqui el estado final es siempre el estilo en linea que escribe `alCuadro(1)`, asi que ninguna animacion del navegador puede contradecirlo.
// Se puede importar en Node (no toca el DOM): el reloj y requestAnimationFrame se pueden inyectar en las pruebas.

export const EASING = Object.freeze({
  lineal: (p) => p,
  salida: (p) => 1 - (1 - p) * (1 - p), // arranca rapido y frena (el «ease-out» del zoom hacia la batalla)
  entrada: (p) => p * p, // arranca lento y acelera (el «ease-in» de la vuelta al mapa)
});

export function crearAnimador({
  raf = (f) => requestAnimationFrame(f),
  cancelarRaf = (id) => cancelAnimationFrame(id),
  ahora = () => performance.now(),
} = {}) {
  const activas = new Map(); // clave -> { id } (la clave puede ser un texto o un nodo)

  function cancelar(clave) {
    const a = activas.get(clave);
    if (!a) return;
    activas.delete(clave);
    cancelarRaf(a.id);
  }

  // Una animacion por clave: pedir otra con la misma clave cancela la anterior (sin avisar su final).
  // `alCuadro(v)` recibe el avance ya con la curva aplicada; el primer cuadro (v = 0) se pinta de inmediato y el ultimo (v = 1) es exacto.
  function animar(clave, { ms, ease = EASING.lineal, alCuadro, alTerminar }) {
    cancelar(clave);
    if (!(ms > 0)) { alCuadro(1); alTerminar?.(); return; }
    const inicio = ahora(), a = { id: 0 };
    alCuadro(ease(0));
    const paso = () => {
      if (activas.get(clave) !== a) return;
      const p = Math.min(1, (ahora() - inicio) / ms);
      alCuadro(p >= 1 ? 1 : ease(p));
      if (p >= 1) { activas.delete(clave); alTerminar?.(); } else a.id = raf(paso);
    };
    activas.set(clave, a);
    a.id = raf(paso);
  }

  function cancelarTodo() { for (const clave of [...activas.keys()]) cancelar(clave); }

  return { animar, cancelar, cancelarTodo, activas: () => activas.size };
}
