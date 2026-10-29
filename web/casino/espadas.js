// Las dos espadas REALES que chocan sobre el territorio disputado cuando se acerca el mapa a una batalla de Guerra de territorios (mesa-conquista.js). La espada es la de la hoja de iconos del usuario
// (web/arte/conquista/espada.png, recortada con herramientas/recortar-iconos-conquista.mjs): una sola imagen, la derecha en espejo. Aqui solo hay funciones puras (los cuadros de cada animacion): sin DOM ni audio.
// El sonido de la batalla es aparte (sonido.js: sfx.batalla), a proposito: los espadazos caen al azar y NO van al compas de estas espadas.
//
// Cada vuelta (650 ms) las espadas parten del REPOSO (cruzadas en el centro), se echan atras para tomar vuelo, golpean (el choque) y rebotan de vuelta al reposo. Como la animacion termina donde el CSS
// las dibuja en reposo, no hay un salto al ultimo cuadro. Y el conjunto se centra en su punto con un `translate(-50%,-50%)` de la hoja de estilos: la animacion solo toca su opacidad, nunca su transform.

export const RUTA_ESPADA = 'arte/conquista/espada.png';
export const ESPADAS = { cicloMs: 650, vueltas: 4, golpe: 0.52 }; // `golpe`: en que parte de la vuelta (0 a 1) chocan

// Los cuadros de UNA espada: lado -1 la izquierda y 1 la derecha (esta va en espejo dentro de su envoltorio, asi que gira al reves). 'none' = el reposo cruzado.
export function cuadrosDeEspada(lado) {
  const atras = `translate(${lado * 34}%, 10%) rotate(${lado * 30}deg)`, rebote = `translate(${lado * 5}%, 0) rotate(${lado * -6}deg)`;
  return [
    { transform: 'none', offset: 0, easing: 'ease-out' },
    { transform: atras, offset: 0.3, easing: 'ease-in' }, // toma vuelo
    { transform: 'none', offset: ESPADAS.golpe, easing: 'ease-out' }, // el golpe: cruzadas en el centro
    { transform: rebote, offset: 0.62, easing: 'ease-in-out' },
    { transform: 'none', offset: 1 },
  ];
}

// La chispa del choque: aparece en el golpe, crece y se apaga. En reposo es invisible, como en el primer y el ultimo cuadro.
export const cuadrosDeChispa = () => [
  { opacity: 0, transform: 'scale(.3)', offset: 0 },
  { opacity: 0, transform: 'scale(.3)', offset: ESPADAS.golpe - 0.02 },
  { opacity: 1, transform: 'scale(1)', offset: ESPADAS.golpe + 0.02 },
  { opacity: 0, transform: 'scale(1.5)', offset: 0.72 },
  { opacity: 0, transform: 'scale(.3)', offset: 1 },
];

// El conjunto de las dos espadas (el contenedor): entra rapido, se ve casi todo el tiempo y se apaga al final. SOLO opacidad.
export const cuadrosDeEspadas = () => [{ opacity: 0, offset: 0 }, { opacity: 1, offset: 0.06 }, { opacity: 1, offset: 0.88 }, { opacity: 0, offset: 1 }];

// Dos envoltorios (los que se animan), cada uno con la imagen real de la espada, y la chispa.
export const htmlDeEspadas = () => `<div class="par izq"><img class="espada" src="${RUTA_ESPADA}" alt=""></div><div class="par der"><img class="espada espejo" src="${RUTA_ESPADA}" alt=""></div><i class="chispa"></i>`;
