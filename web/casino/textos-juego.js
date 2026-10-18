// Los textos PUBLICOS de cada juego: lo que lee o escucha alguien que llega sin conocerlo. Los usan la tarjeta de arranque de la escena (intro.js) y los textos del paquete de
// publicacion (paquete-textos.js). Son texto para el publico (con acentos), nunca el prompt de las IAs (`reglas`, que no se acentua y es el contrato de la temporada): si una regla
// cambia en el motor, hay que revisar aqui su frase. Sin DOM ni red; la web no importa de src/, asi que el nombre y la categoria se copian y una prueba los compara con el motor.
//
//   nombre     el nombre publico del juego (con acentos)         regla   que se hace, en una frase           gana    como se gana
//   mide       lo que se mira en este juego (para las descripciones)       intro   la frase de la tarjeta de arranque (la lee la voz; <= 140 caracteres, empieza por el nombre)
//   hashtags   de 2 a 4, solo del juego (los de modelos se agregan en cada paquete segun quien juega)

export const TEXTOS_JUEGO = {
  dilema: {
    nombre: 'Dilema del Prisionero Negociado', categoria: 'Traición y confianza',
    regla: 'En cada ronda dos IAs eligen cooperar o traicionar y prometen en público lo que harán después.',
    gana: 'Gana quien suma más puntos en 10 rondas.',
    mide: 'cuánto cumple cada IA lo que promete',
    intro: 'Dilema del Prisionero Negociado: dos IAs eligen cooperar o traicionar y prometen lo que harán. ¿Cumplirán?',
    hashtags: ['#DilemaDelPrisionero', '#TeoríaDeJuegos'],
  },
  dudaapuesta: {
    nombre: 'Duda y apuesta', categoria: 'Engaño y deducción',
    regla: 'Cuatro IAs anuncian cuántas cartas de un color hay entre todos y apuestan fichas; la siguiente acepta o duda.',
    gana: 'Quien se queda sin fichas sale; gana quien termina con más.',
    mide: 'quién se atreve a dudar y cuánto apuesta cada IA',
    intro: 'Duda y apuesta: cuatro IAs anuncian cuántas cartas de un color hay en la mesa, apuestan fichas y las demás aceptan o dudan.',
    hashtags: ['#JuegosDeCartas', '#TeoríaDeJuegos'],
  },
  mayormenor: {
    nombre: 'Mayor o menor', categoria: 'Estrategia de eliminación',
    regla: 'Dos IAs juegan 18 rondas: una juega una carta contra la del crupier y la otra apuesta fichas a si será mayor o menor.',
    gana: 'Gana quien termina con más fichas.',
    mide: 'cómo reparte cada IA el riesgo entre jugar cartas y apostar',
    intro: 'Mayor o menor: una IA juega una carta contra la del crupier y la otra apuesta fichas a si será mayor o menor.',
    hashtags: ['#JuegosDeCartas', '#Apuestas'],
  },
  solitario: {
    nombre: 'El número solitario', categoria: 'Estrategia de eliminación',
    regla: 'Cinco IAs eligen dos cartas y marcan en secreto cuál juegan; las que chocan se anulan y gana la ronda el número más bajo que queda solo.',
    gana: 'Tras 12 rondas gana quien tiene más puntos y sale eliminado quien tiene menos.',
    mide: 'si las IAs logran elegir un número que nadie más elija',
    intro: 'El número solitario: cinco IAs eligen una carta en secreto; si dos eligen el mismo número se anulan y gana el más bajo que queda solo.',
    hashtags: ['#JuegosDeCartas', '#TeoríaDeJuegos'],
  },
  tripledado: {
    nombre: 'Triple dado', categoria: 'Estrategia de eliminación',
    regla: 'Cuatro IAs juegan 4 rondas con 11 dados cada una, dos de ellos ocultos: forman combinaciones de tres dados y antes predicen cuántos puntos sumarán.',
    gana: 'Gana quien suma más puntos y sale eliminado quien suma menos.',
    mide: 'cómo combinan las IAs sus dados a la vista con los ocultos y cuánto se atreven a predecir',
    intro: 'Triple dado: cuatro IAs forman combinaciones de tres dados, con dos dados ocultos, y antes predicen cuántos puntos sumarán.',
    hashtags: ['#JuegosDeDados', '#Estrategia'],
  },
  subasta: {
    nombre: 'Subasta de tiempo', categoria: 'Estrategia de eliminación',
    regla: 'Cinco IAs apuestan en secreto cuántos segundos aguantan de un banco de 10 minutos; todas las apuestas se pagan y gana cada subasta quien apuesta más.',
    gana: 'Tras 19 subastas gana quien reúne más fichas y sale eliminado quien tiene menos.',
    mide: 'cuánto tiempo está dispuesta a gastar cada IA y cuándo se retira',
    intro: 'Subasta de tiempo: cinco IAs apuestan en secreto segundos de su banco de diez minutos. Todas pagan; gana la apuesta más alta.',
    hashtags: ['#Subasta', '#TeoríaDeJuegos'],
  },
  fuga: {
    nombre: 'La Fuga', categoria: 'Lealtad bajo riesgo',
    regla: 'Dos IAs planean escapar juntas de una cárcel y en cada situación deciden en secreto si se ayudan, avanzan solas o se separan.',
    gana: 'Gana quien acumula más puntos al final.',
    mide: 'cuánto se ayudan las IAs cuando el riesgo sube',
    intro: 'La Fuga: dos IAs planean escapar juntas de una cárcel y en cada situación deciden en secreto si se ayudan o se separan.',
    hashtags: ['#LaFuga', '#Estrategia'],
  },
  conquista: {
    nombre: 'Guerra de territorios', categoria: 'Estrategia y conquista',
    regla: 'De 2 a 5 reinos de IA se disputan un mapa durante 30 turnos: reclutan, atacan, negocian en público y en privado, y pueden romper sus pactos.',
    gana: 'Gana el último reino en pie, quien complete la Maravilla o, al turno 30, quien controle más regiones.',
    mide: 'cómo reparten las IAs su esfuerzo entre atacar, construir, pactar y romper pactos',
    intro: 'Guerra de territorios: reinos de IA se disputan un mapa en 30 turnos, atacan, negocian y pactan, y pueden romper su palabra.',
    hashtags: ['#Estrategia', '#JuegosDeEstrategia'],
  },
};

// Los textos de un juego, o null (un id raro, como "toString" o "__proto__", no cuenta).
export const textoDeJuego = (id) => (typeof id === 'string' && Object.hasOwn(TEXTOS_JUEGO, id) ? TEXTOS_JUEGO[id] : null);

// La frase de la tarjeta de arranque, o null si el juego no tiene textos.
export const introDe = (id) => textoDeJuego(id)?.intro ?? null;
