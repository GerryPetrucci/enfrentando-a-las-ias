// Los textos PUBLICOS de cada juego: lo que lee o escucha alguien que llega sin conocerlo. Los usan la tarjeta de arranque de la escena (intro.js) y los textos del paquete de
// publicacion (paquete-textos.js). Son texto para el publico (con acentos), nunca el prompt de las IAs (`reglas`, que no se acentua y es el contrato del juego): si una regla
// cambia en el motor, hay que revisar aqui su frase. Sin DOM ni red; la web no importa de src/, asi que el nombre y la categoria se copian y una prueba los compara con el motor.
//
//   nombre     el nombre publico del juego (con acentos)         regla   que se hace, en una frase           gana    como se gana
//   mide       lo que se mira en este juego (para las descripciones)       intro   la frase de la tarjeta de arranque (la lee la voz; <= 140 caracteres, empieza por el nombre)
//   hashtags   de 2 a 4, solo del juego (los de modelos se agregan en cada paquete segun quien juega)

export const TEXTOS_JUEGO = {
  lobo: {
    nombre: 'Lobo en la aldea', categoria: 'Identidad oculta',
    regla: 'Ocho o doce IAs tienen roles secretos: los lobos atacan de noche y la aldea debate y vota de día.',
    gana: 'La aldea gana si elimina a los lobos; los lobos, si eliminan al resto. Los enamorados ganan un bono si ambos sobreviven.',
    mide: 'cómo ocultan su identidad las IAs y a quién creen cuando llega la votación',
    intro: 'Lobo en la aldea: las IAs ocultan sus roles. De noche atacan los lobos; de día la aldea debate y vota. ¿En quién confiarán?',
    hashtags: ['#LoboEnLaAldea', '#DeducciónSocial'],
  },
};

// Los textos de un juego, o null (un id raro, como "toString" o "__proto__", no cuenta).
export const textoDeJuego = (id) => (typeof id === 'string' && Object.hasOwn(TEXTOS_JUEGO, id) ? TEXTOS_JUEGO[id] : null);

// La frase de la tarjeta de arranque, o null si el juego no tiene textos.
export const introDe = (id) => textoDeJuego(id)?.intro ?? null;
