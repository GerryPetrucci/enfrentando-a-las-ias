// Las 24 situaciones de La Fuga. Cada prisionero ve `descripcion` y UNA pista (la del metodo al que apunta la pista de esa
// partida); `titulo` y `aperturas` son texto publico (con acentos) para la narracion. Lo que ven las IAs va sin acentos.
//
//   mejor: el metodo que mas ayuda (x0.6)      malo: el que mas estorba (x1.5)      el tercero es normal (x1.0)
//   tentacion: null | { tipo: 'botin', objeto } | { tipo: 'oferta', texto }  (si sale o no, lo sortea estado.js)

export const CATALOGO = [
  // ---------- INTERIOR ----------
  {
    id: 'celda', fase: 'interior', titulo: 'La cerradura de la celda', corto: 'cerradura',
    descripcion: 'La puerta de la celda tiene una cerradura vieja y oxidada. Afuera se oye a un guardia caminar despacio.',
    mejor: 'sigilo', malo: 'engano',
    pistas: {
      sigilo: 'El mecanismo parece fragil: con paciencia podria ceder sin hacer ruido.',
      fuerza: 'Los goznes de la puerta se ven flojos y la madera esta podrida.',
      engano: 'Quiza el guardia abra si cree que hay una emergencia dentro de la celda.',
    },
    tentacion: { tipo: 'botin', objeto: 'un alambre' },
    aperturas: [
      'La puerta de la celda lleva años cerrada con una cerradura oxidada.',
      'Del otro lado de los barrotes, los pasos del guardia se alejan y vuelven.',
      'Solo una cerradura vieja separa a los dos del pasillo.',
    ],
  },
  {
    id: 'ronda', fase: 'interior', titulo: 'El guardia de ronda', corto: 'guardia de ronda',
    descripcion: 'Un guardia recorre el pasillo con una linterna y se detiene en cada puerta. Hay una esquina oscura donde esconderse.',
    mejor: 'engano', malo: 'fuerza',
    pistas: {
      sigilo: 'La esquina oscura queda a pocos pasos y el guardia mira hacia otro lado.',
      fuerza: 'El guardia esta solo y cansado, aunque lleva un garrote en la mano.',
      engano: 'El guardia parece aburrido: quiza se crea una historia sobre una pelea en la cocina.',
    },
    tentacion: { tipo: 'oferta', texto: 'El guardia te hace un gesto: quiere saber lo que planea tu companero y sabra agradecerlo.' },
    aperturas: [
      'Una linterna barre el pasillo: el guardia de ronda se acerca.',
      'Los pasos del guardia retumban en el corredor vacío.',
      'El guardia se detiene justo frente a su puerta, murmurando para sí mismo.',
    ],
  },
  {
    id: 'camara', fase: 'interior', titulo: 'La cámara del pasillo', corto: 'camara',
    descripcion: 'Una camara de vigilancia gira lentamente y cubre todo el pasillo. Cada vuelta tarda unos segundos.',
    mejor: 'sigilo', malo: 'fuerza',
    pistas: {
      sigilo: 'Si se mueven pegados a la pared, la camara los deja sin cubrir un instante.',
      fuerza: 'La camara esta fijada con un soporte debil.',
      engano: 'Podrian tapar el lente con algo para que parezca una falla.',
    },
    tentacion: null,
    aperturas: [
      'Una cámara gira sobre el pasillo con un zumbido constante.',
      'El ojo rojo de la cámara recorre el corredor de lado a lado.',
      'Entre ellos y la escalera, una cámara no pierde detalle.',
    ],
  },
  {
    id: 'cocina', fase: 'interior', titulo: 'La cocina', corto: 'cocina',
    descripcion: 'La cocina esta casi vacia: un cocinero da la espalda mientras corta verduras. Hay una puerta de servicio con un candado viejo y, sobre la mesa, un llavero.',
    mejor: 'engano', malo: 'sigilo',
    pistas: {
      sigilo: 'El cocinero escucha musica y parece no oir nada a su alrededor.',
      fuerza: 'El candado de la puerta de servicio esta oxidado y se rompe de un golpe.',
      engano: 'El cocinero creeria que son parte del personal si llevan algo en las manos.',
    },
    tentacion: { tipo: 'botin', objeto: 'un llavero' },
    aperturas: [
      'El olor a guiso llena la cocina; el cocinero ni se vuelve.',
      'Entre ollas y cuchillos, una puerta de servicio parece la salida.',
      'El cocinero tararea una canción mientras los dos cruzan la cocina con el corazón en la boca.',
    ],
  },
  {
    id: 'lavanderia', fase: 'interior', titulo: 'La lavandería', corto: 'lavanderia',
    descripcion: 'En la lavanderia hay montones de ropa, maquinas ruidosas y un uniforme colgado de un gancho. Dos presos limpian al fondo.',
    mejor: 'fuerza', malo: 'sigilo',
    pistas: {
      sigilo: 'Las maquinas hacen tanto ruido que nadie oiria unos pasos.',
      fuerza: 'Las pilas de ropa pesan mucho: con empuje se abre un hueco hacia la salida.',
      engano: 'Los presos del fondo podrian cubrirlos si les prometen algo.',
    },
    tentacion: { tipo: 'botin', objeto: 'un uniforme' },
    aperturas: [
      'Vapor, ruido de máquinas y una montaña de ropa sucia llenan la lavandería.',
      'Un uniforme de guardia cuelga de un gancho, al alcance de la mano.',
      'La lavandería zumba como un enjambre: nadie oye nada aquí dentro.',
    ],
  },
  {
    id: 'enfermeria', fase: 'interior', titulo: 'La enfermería', corto: 'enfermeria',
    descripcion: 'La enfermeria esta en penumbra. Una enfermera revisa papeles junto a la unica puerta que lleva al patio.',
    mejor: 'engano', malo: 'fuerza',
    pistas: {
      sigilo: 'La enfermera lleva auriculares y se concentra en sus papeles.',
      fuerza: 'La puerta al patio tiene un cerrojo simple, pero hace mucho ruido al abrirse.',
      engano: 'La enfermera creeria que uno de los dos esta enfermo y necesita salir al aire.',
    },
    tentacion: { tipo: 'oferta', texto: 'La enfermera susurra que le interesa cualquier cosa comprometedora sobre tu companero.' },
    aperturas: [
      'La enfermería huele a alcohol y a papel viejo.',
      'Una enfermera cansada revisa expedientes junto a la puerta del patio.',
      'Una lámpara parpadea sobre la camilla vacía.',
    ],
  },
  {
    id: 'panel', fase: 'interior', titulo: 'El panel de la puerta', corto: 'panel',
    descripcion: 'Una puerta metalica se abre con un panel electronico. El panel tiene cables a la vista y una pequena luz roja.',
    mejor: 'fuerza', malo: 'engano',
    pistas: {
      sigilo: 'Con cuidado se podrian cruzar los cables sin que salte nada.',
      fuerza: 'La carcasa del panel esta floja y se desprende de un golpe seco.',
      engano: 'Alguien podria teclear un codigo de mantenimiento si acierta con el.',
    },
    tentacion: null,
    aperturas: [
      'La luz roja del panel parpadea, indiferente.',
      'Cables al aire: el panel electrónico guarda la puerta de acero.',
      'Sin la clave, la puerta metálica no se mueve ni un milímetro.',
    ],
  },
  {
    id: 'escalera', fase: 'interior', titulo: 'La escalera de servicio', corto: 'escalera',
    descripcion: 'Una escalera de servicio baja hacia el patio. Un guardia fuma abajo, de espaldas, junto a una linterna olvidada en un escalon.',
    mejor: 'sigilo', malo: 'fuerza',
    pistas: {
      sigilo: 'Los escalones son de goma y el humo le nubla la vista al guardia.',
      fuerza: 'El guardia esta solo y distraido: un empujon podria sacarlo del camino.',
      engano: 'Si fingen venir de limpiar, el guardia quiza ni pregunte.',
    },
    tentacion: { tipo: 'botin', objeto: 'una linterna' },
    aperturas: [
      'Una escalera estrecha desciende hacia el patio en la oscuridad.',
      'Abajo, la brasa de un cigarro marca dónde está el guardia.',
      'Cada escalón cruje un poco... o eso les parece a ellos.',
    ],
  },
  // ---------- PATIO ----------
  {
    id: 'patio', fase: 'patio', titulo: 'El patio a la vista', corto: 'patio abierto',
    descripcion: 'El patio es un gran espacio abierto con focos y presos haciendo ejercicio. Hay que cruzarlo sin llamar la atencion.',
    mejor: 'engano', malo: 'fuerza',
    pistas: {
      sigilo: 'Hay zonas de sombra entre los focos si se mueven pegados a las paredes.',
      fuerza: 'Los presos del patio no avisarian a los guardias si se abren paso con decision.',
      engano: 'Si se mezclan con los presos que hacen ejercicio, nadie notaria a dos mas.',
    },
    tentacion: { tipo: 'oferta', texto: 'Un guardia del patio te hace una senal: quiere un chisme sobre tu companero y sabra pagarlo.' },
    aperturas: [
      'El patio se extiende bajo los focos como un escenario.',
      'Presos que trotan, guardias que miran: cruzar el patio parece imposible.',
      'El viento levanta polvo en el patio y los focos dibujan círculos de luz.',
    ],
  },
  {
    id: 'perros', fase: 'patio', titulo: 'Los perros guardianes', corto: 'perros',
    descripcion: 'Dos perros guardianes olfatean el borde del patio. Su cuidador los suelta cada cierto tiempo.',
    mejor: 'engano', malo: 'sigilo',
    pistas: {
      sigilo: 'El viento sopla en contra y los perros no huelen desde donde estan.',
      fuerza: 'Los perros estan atados con una correa corta.',
      engano: 'Los perros se distraerian con comida lanzada lejos.',
    },
    tentacion: { tipo: 'botin', objeto: 'un trozo de carne' },
    aperturas: [
      'Dos perros gruñen al borde del patio, atentos a cada ruido.',
      'El cuidador de los perros bosteza mientras los animales olfatean el aire.',
      'Una correa tensa y un hocico húmedo: los perros han olido algo.',
    ],
  },
  {
    id: 'taller', fase: 'patio', titulo: 'El taller de herramientas', corto: 'taller',
    descripcion: 'El taller esta abierto pero con poca luz. Hay cadenas, tijeras de metal y una reja baja que da al muro.',
    mejor: 'fuerza', malo: 'engano',
    pistas: {
      sigilo: 'El taller esta vacio y las herramientas estan engrasadas: no chirrian.',
      fuerza: 'Las tijeras de metal cortarian la reja baja sin demasiado esfuerzo.',
      engano: 'El encargado del taller se va a comer si cree que no hay nada raro.',
    },
    tentacion: { tipo: 'botin', objeto: 'unas cizallas' },
    aperturas: [
      'Herramientas colgadas en la pared brillan en la penumbra del taller.',
      'Una reja baja separa el taller del muro exterior.',
      'El taller huele a aceite y a metal frío.',
    ],
  },
  {
    id: 'reja', fase: 'patio', titulo: 'La reja interior', corto: 'reja interior',
    descripcion: 'Una reja de barras gruesas separa el patio de la zona del muro. Tiene una puerta pequena con una cadena.',
    mejor: 'fuerza', malo: 'sigilo',
    pistas: {
      sigilo: 'La cadena esta floja y podria soltarse sin ruido.',
      fuerza: 'Las barras estan corroidas en la base y cederian con una palanca.',
      engano: 'Alguien podria hacerse pasar por el guardia que tiene la llave.',
    },
    tentacion: null,
    aperturas: [
      'Una reja de barras gruesas corta el paso hacia el muro.',
      'La cadena de la puertecilla tintinea con el viento.',
      'Del otro lado de la reja, el muro exterior parece estar al alcance.',
    ],
  },
  {
    id: 'turno', fase: 'patio', titulo: 'El cambio de turno', corto: 'cambio de turno',
    descripcion: 'Los guardias estan cambiando de turno: unos se van y otros llegan. Durante unos minutos hay confusion en el patio.',
    mejor: 'sigilo', malo: 'engano',
    pistas: {
      sigilo: 'En la confusion nadie vigila los rincones del patio.',
      fuerza: 'Con tanto desorden, un empujon pasaria por una pelea comun.',
      engano: 'Los guardias nuevos no conocen a todos los presos: podrian pasar por trabajadores.',
    },
    tentacion: { tipo: 'oferta', texto: 'Un guardia recien llegado pide un favor: quiere que le cuentes algo util sobre tu companero.' },
    aperturas: [
      'Los guardias se cruzan, se saludan, se distraen: es el cambio de turno.',
      'Silbatos, órdenes a medias y papeles que cambian de mano.',
      'Por unos minutos nadie está seguro de quién vigila qué.',
    ],
  },
  {
    id: 'foco', fase: 'patio', titulo: 'El reflector de la torre', corto: 'reflector',
    descripcion: 'Un reflector sobre la torre barre el patio de lado a lado. Hay un espejo viejo tirado cerca de la pared.',
    mejor: 'sigilo', malo: 'fuerza',
    pistas: {
      sigilo: 'El haz tarda unos segundos en volver: hay tiempo para cruzar entre barridos.',
      fuerza: 'El reflector esta atornillado a un soporte endeble.',
      engano: 'Un reflejo con el espejo podria confundir al vigilante de la torre.',
    },
    tentacion: { tipo: 'botin', objeto: 'un espejo' },
    aperturas: [
      'El haz del reflector barre el patio como un faro.',
      'Desde la torre, un vigilante sigue la luz con los ojos.',
      'Cada barrido de luz deja una sombra más larga que la anterior.',
    ],
  },
  {
    id: 'zanja', fase: 'patio', titulo: 'La zanja con lodo', corto: 'zanja',
    descripcion: 'Una zanja llena de lodo cruza el patio trasero. Es profunda y huele muy mal, pero nadie vigila ese lado.',
    mejor: 'fuerza', malo: 'engano',
    pistas: {
      sigilo: 'El lodo amortigua cada paso sin hacer ruido.',
      fuerza: 'Con un buen impulso se podria saltar la zanja de un solo salto.',
      engano: 'Si fingen estar limpiando, nadie les dira nada.',
    },
    tentacion: null,
    aperturas: [
      'Una zanja de lodo oscuro bloquea el camino.',
      'El lodo burbujea y huele a podrido en el patio trasero.',
      'Del otro lado de la zanja, el muro parece más cerca.',
    ],
  },
  {
    id: 'basura', fase: 'patio', titulo: 'El camión de la basura', corto: 'camion de basura',
    descripcion: 'Un camion de la basura espera con el motor encendido junto al patio trasero. El conductor charla con un guardia. Hay una cuerda atada a la caja.',
    mejor: 'engano', malo: 'fuerza',
    pistas: {
      sigilo: 'El motor tapa cualquier ruido y la caja esta en sombra.',
      fuerza: 'La compuerta trasera esta floja: se abre de un golpe.',
      engano: 'El conductor ayuda a cualquiera que parezca de la limpieza.',
    },
    tentacion: { tipo: 'botin', objeto: 'una cuerda' },
    aperturas: [
      'El motor del camión de la basura retumba junto al patio trasero.',
      'Un conductor y un guardia charlan junto a la cabina, sin mirar atrás.',
      'La caja del camión está abierta, oscura, a pocos pasos.',
    ],
  },
  // ---------- PERIMETRO ----------
  {
    id: 'muro', fase: 'perimetro', titulo: 'El muro exterior', corto: 'muro',
    descripcion: 'El muro exterior mide unos cinco metros. Hay un gancho oxidado clavado en la base y alambre de puas arriba.',
    mejor: 'fuerza', malo: 'sigilo',
    pistas: {
      sigilo: 'Con paciencia, la sombra del muro permite avanzar sin ser vistos.',
      fuerza: 'Los ladrillos estan flojos: con fuerza se pueden usar de escalones.',
      engano: 'Un guardia podria dejarlos pasar si cree que son trabajadores de mantenimiento.',
    },
    tentacion: { tipo: 'botin', objeto: 'un gancho' },
    aperturas: [
      'El muro exterior se alza ante ellos como una pared de cielo.',
      'Cinco metros de ladrillo gris separan la prisión de la libertad.',
      'En lo alto del muro, el alambre brilla con la luz de la luna.',
    ],
  },
  {
    id: 'alambre', fase: 'perimetro', titulo: 'La alambrada', corto: 'alambrada',
    descripcion: 'Sobre el muro hay una alambrada con puntas afiladas. Un guardia pasa cada tanto con una radio.',
    mejor: 'fuerza', malo: 'engano',
    pistas: {
      sigilo: 'Entre ronda y ronda hay tiempo suficiente para pasar.',
      fuerza: 'El alambre esta oxidado y se rompe si se tira con ganas.',
      engano: 'Si dejan una bolsa en el suelo, el guardia podria ir a revisarla.',
    },
    tentacion: null,
    aperturas: [
      'Alambre de puntas afiladas corona el muro.',
      'El guardia de la radio pasa y vuelve a pasar sobre la alambrada.',
      'Unas púas oxidadas brillan sobre el muro exterior.',
    ],
  },
  {
    id: 'reflectores', fase: 'perimetro', titulo: 'Los reflectores del perímetro', corto: 'reflectores',
    descripcion: 'Varios reflectores cubren el perimetro. Cuando uno se apaga por un instante, otro se enciende.',
    mejor: 'sigilo', malo: 'fuerza',
    pistas: {
      sigilo: 'Hay un punto ciego entre dos reflectores si cruzan agachados.',
      fuerza: 'Los cables de los reflectores estan a la vista y se pueden cortar.',
      engano: 'Alguien en la torre ignoraria un movimiento si cree que es un animal.',
    },
    tentacion: { tipo: 'oferta', texto: 'Desde la torre, un guardia ofrece pagar por saber algo de tu companero.' },
    aperturas: [
      'Los reflectores pintan de blanco todo el perímetro.',
      'Un reflector se apaga un instante y otro lo reemplaza de inmediato.',
      'Sombras largas y luz brutal: el perímetro está vigilado.',
    ],
  },
  {
    id: 'alcantarilla', fase: 'perimetro', titulo: 'La alcantarilla', corto: 'alcantarilla',
    descripcion: 'Una rejilla de alcantarilla en el suelo da a un tunel de desague. Esta atornillada, pero hay una palanca olvidada cerca.',
    mejor: 'sigilo', malo: 'engano',
    pistas: {
      sigilo: 'El desague arrastra el sonido: nadie oiria nada desde arriba.',
      fuerza: 'Con la palanca, la rejilla saltaria de sus tornillos.',
      engano: 'Si cubren la rejilla con un trapo, un guardia distraido no la notaria.',
    },
    tentacion: { tipo: 'botin', objeto: 'una palanca' },
    aperturas: [
      'Una rejilla oxidada se abre al suelo del perímetro.',
      'Abajo, el desagüe huele a humedad y a libertad.',
      'El agua corre por un túnel oscuro bajo sus pies.',
    ],
  },
  {
    id: 'vehiculos', fase: 'perimetro', titulo: 'La puerta de vehículos', corto: 'puerta de vehiculos',
    descripcion: 'La puerta de vehiculos esta cerrada con un porton grande. Un guardia revisa los papeles de un camion que sale.',
    mejor: 'engano', malo: 'fuerza',
    pistas: {
      sigilo: 'Los camiones tapan la vista: se puede ir pegado a uno sin ser visto.',
      fuerza: 'El porton esta atascado y se abriria con un empujon fuerte.',
      engano: 'El guardia no mira bien a quienes van en la cabina del camion.',
    },
    tentacion: { tipo: 'oferta', texto: 'El guardia de la puerta te propone un trato: quiere saber que hara tu companero despues.' },
    aperturas: [
      'Un portón enorme guarda la salida de los vehículos.',
      'Un camión espera su turno; el guardia revisa papeles sin prisa.',
      'Más allá del portón, la carretera se pierde en la noche.',
    ],
  },
  {
    id: 'foso', fase: 'perimetro', titulo: 'El foso con agua', corto: 'foso',
    descripcion: 'Un foso con agua fria rodea la ultima parte del muro. Es ancho, pero el agua esta oscura y los reflectores no llegan bien.',
    mejor: 'sigilo', malo: 'fuerza',
    pistas: {
      sigilo: 'Con calma y sin chapotear, el agua oscura los ocultaria.',
      fuerza: 'Un tronco flota cerca: con empuje podrian usarlo como puente.',
      engano: 'Podrian lanzar algo lejos para que el guardia mire hacia otro lado.',
    },
    tentacion: null,
    aperturas: [
      'El agua oscura del foso refleja un cielo sin estrellas.',
      'Un foso frío rodea el último tramo del muro.',
      'No se ve el fondo del foso ni se sabe qué hay en él.',
    ],
  },
  {
    id: 'final', fase: 'perimetro', titulo: 'El guardia junto a la salida', corto: 'guardia final',
    descripcion: 'Un solo guardia vigila la ultima salida, sentado en una silla. Su radio esta sobre una mesa, al lado.',
    mejor: 'engano', malo: 'sigilo',
    pistas: {
      sigilo: 'El guardia dormita y respira hondo: un paso por detras podria pasar inadvertido.',
      fuerza: 'El guardia esta solo: un golpe rapido lo dejaria fuera de combate.',
      engano: 'El guardia parece ansioso por charlar: una buena historia lo distraeria.',
    },
    tentacion: { tipo: 'botin', objeto: 'una radio' },
    aperturas: [
      'Un único guardia custodia la última salida.',
      'La silla del guardia crujió: sigue medio dormido, pero atento.',
      'Una luz amarilla ilumina la puerta de la libertad... y a su guardián.',
    ],
  },
  {
    id: 'camioneta', fase: 'perimetro', titulo: 'La camioneta de reparto', corto: 'camioneta',
    descripcion: 'Una camioneta de reparto esta estacionada junto a la salida, con la puerta trasera entreabierta. El repartidor firma un papel con un guardia.',
    mejor: 'engano', malo: 'fuerza',
    pistas: {
      sigilo: 'Con cuidado, la puerta entreabierta permite subir sin ruido.',
      fuerza: 'La cerradura trasera esta rota y se abre de un tiron.',
      engano: 'Si fingen ser parte de la entrega, el repartidor los dejaria subir.',
    },
    tentacion: { tipo: 'oferta', texto: 'El guardia de la puerta te susurra que pagara por saber algo de tu companero.' },
    aperturas: [
      'Una camioneta de reparto espera, con la puerta trasera entreabierta.',
      'El repartidor firma un papel y el guardia lo lee con calma.',
      'Detrás de la camioneta, la carretera parece interminable.',
    ],
  },
];

export const porId = new Map(CATALOGO.map((s) => [s.id, s]));
