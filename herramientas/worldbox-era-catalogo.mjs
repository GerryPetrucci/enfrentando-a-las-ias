// Genera src/worldbox/era/catalogo-era.json (catalogo VERSIONADO y legible por maquina del formato «era», reglamento era-1.0).
// Fuentes (solo lectura, en privado/): catalogo del juego (E1), compatibilidad raza-bioma (E2) y la investigacion FINAL de efectos de E3
// (privado/worldbox/era-fase0/e3/rasgos-efecto.json, 301 filas). El catalogo generado SE VERSIONA en el repositorio; este script solo se corre cuando
// cambia la evidencia o la oferta. Uso:  node herramientas/worldbox-era-catalogo.mjs [--e3=RUTA] [--salida=RUTA]
//
// E5 (8-11-2026): el catalogo se reconstruye sobre el JSON final de E3. Cada rasgo ofrecido DEBE tener su fila en E3 (si no, el script falla); el texto en
// espanol dice lo que E3 MIDIO (o lo que leyo en el codigo del juego y no pudo medir). Etiquetas para el prompt:
//   «efecto medido»                  clase medido    : se midio el cambio de una estadistica (E2/E3); no se demostro que decida una partida.
//   «conducta (efecto no medido)»    clase conducta  : cambia lo que hacen las unidades o la cultura; su efecto en la partida NO se midio. Cuesta 1 punto.
//   «sabor»                          clase cosmetico : solo se ve (o su efecto no se distingue del ruido). Cuesta 0.
// `fuerte:true` = valor muy grande segun E3 («acotar»/«valores absurdos»): cada civilizacion puede tener A LO SUMO UN rasgo fuerte entre el borrador y los extras.
// Quedan FUERA: lo que E3 marca `no_ofrecer`, los rasgos letales o autodestructivos, los de valor absurdo y los dones de combate de la subespecie
// (gift_of_fire / thunder / death / void / blood) hasta medirlos (decision del usuario). Lo excluido va en `excluidos` con su motivo.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = /^--([^=]+)=(.*)$/.exec(a); return m ? [m[1], m[2]] : [a.replace(/^--/, ''), true]; }));
const base = resolve('privado/worldbox/era-fase0');
const salida = resolve(args.salida ?? 'src/worldbox/era/catalogo-era.json');
const rutaE3 = resolve(args.e3 ?? `${base}/e3/rasgos-efecto.json`);
const leer = r => JSON.parse(readFileSync(r, 'utf8'));
const juego = leer(`${base}/catalogo.json`);
const compat = leer(`${base}/e2/evidencia/compatibilidad-especie-bioma.json`);
const pot = leer(`${base}/e2/evidencia/biomas-pot.json`);
const BASE_RAREZA = { R0_Common: 1, R0_Normal: 1, R1_Rare: 2, R2_Epic: 3, R3_Legendary: 4 };

// ---- razas (39) ----
const RAZAS = { human: 'Humano', elf: 'Elfo', orc: 'Orco', dwarf: 'Enano', civ_cat: 'Gato', civ_dog: 'Perro', civ_chicken: 'Gallina', civ_rabbit: 'Conejo', civ_monkey: 'Mono', civ_fox: 'Zorro',
  civ_sheep: 'Oveja', civ_cow: 'Vaca', civ_armadillo: 'Armadillo', civ_wolf: 'Lobo', civ_bear: 'Oso', civ_rhino: 'Rinoceronte', civ_buffalo: 'Búfalo', civ_hyena: 'Hiena', civ_rat: 'Rata', civ_alpaca: 'Alpaca',
  civ_capybara: 'Capibara', civ_goat: 'Cabra', civ_scorpion: 'Escorpión', civ_crab: 'Cangrejo', civ_penguin: 'Pingüino', civ_turtle: 'Tortuga', civ_crocodile: 'Cocodrilo', civ_snake: 'Serpiente',
  civ_frog: 'Rana', civ_piranha: 'Piraña', civ_liliar: 'Liliar', civ_garlic_man: 'Hombre ajo', civ_lemon_man: 'Hombre limón', civ_acid_gentleman: 'Caballero ácido', civ_crystal_golem: 'Gólem de cristal',
  civ_candy_man: 'Hombre caramelo', civ_beetle: 'Escarabajo', civ_seal: 'Foca', civ_unicorn: 'Unicornio' };

// ---- biomas (21) ----
const BIOMAS = { biome_grass: 'Pastizal', biome_savanna: 'Sabana', biome_jungle: 'Jungla', biome_desert: 'Desierto', biome_lemon: 'Limonar', biome_permafrost: 'Permafrost', biome_swamp: 'Pantano',
  biome_crystal: 'Cristal', biome_enchanted: 'Encantado', biome_corrupted: 'Corrupto', biome_infernal: 'Infernal', biome_candy: 'Caramelo', biome_mushroom: 'Hongos', biome_wasteland: 'Yermo',
  biome_birch: 'Abedul', biome_maple: 'Arce', biome_rocklands: 'Rocas', biome_garlic: 'Ajo', biome_flower: 'Flores', biome_celestial: 'Celestial', biome_clover: 'Trébol' };
// E6 (9-11-2026): razas podadas tras la tanda de bots (privado/revisiones/E6-entrega.md). [id, motivo]. Siguen en el catalogo con ofrecible:false; el prompt y la validacion no las ofrecen.
const PODADAS = {
  civ_beetle: 'E6: 0 de 14 guerras contra humano (40 y 120 años de desarrollo) y se extinguió sola antes de la guerra en 3 de 16 partidas (el humano, 1 de 308)',
  civ_piranha: 'E6: 1 de 16 guerras contra humano; población 35 a 55 % menor que la del humano a los 40 y a los 120 años de desarrollo',
  civ_candy_man: 'E6: 1 de 16 guerras contra humano, con población parecida a la del humano a los 120 años (esperadas ≈ 6)',
};
const PASO = { biome_desert: 0.7, biome_permafrost: 0.8, biome_swamp: 0.6 };
const BIOMA_CARO = new Set(['biome_celestial', 'biome_infernal']); // mineral raro que el juego dice que crece solo (no medido): 1 punto

// ---- minerales (8): costo = lo que dan al explotarse (E2: un deposito es de un solo uso) ----
const MINERALES = [
  ['mineral_stone', 'Piedra', 0, 'cada depósito da 3 de piedra'],
  ['mineral_gems', 'Gemas', 0, 'cada depósito da 1 gema y 1 de piedra (sin equipo asociado)'],
  ['mineral_metals', 'Metales comunes', 1, 'cada depósito da 2 metales comunes y 1 de piedra (hierro, bronce, acero: 3 a 4 por pieza de equipo)'],
  ['mineral_gold', 'Oro', 1, 'cada depósito da 20 de oro y 20 de piedra'],
  ['mineral_silver', 'Plata', 2, 'cada depósito da 1 de plata (1 pieza de equipo: armadura 5, arma 5)'],
  ['mineral_bones', 'Huesos', 2, 'cada depósito da 3 de huesos (anillos y amuletos de crítico +2 %)'],
  ['mineral_mythril', 'Mythril', 3, 'cada depósito da 1 de mythril (1 pieza de equipo: armadura 8, arma 8)'],
  ['mineral_adamantine', 'Adamantino', 4, 'cada depósito da 1 de adamantino (1 pieza de equipo: armadura 10, arma 10, +15 % crítico)'],
];

// ---- rasgos ofrecidos. [tipo, id, casilla, nombre, clase, intensidad, efecto en espanol (lo que E3 midio o leyo), fuerte?]
// Costo = base de rareza del juego + intensidad si es `medido`; 1 si es `conducta`; 0 si es `cosmetico`. Intensidad: 0 efecto pequeno, 1 moderado, 2 grande.
const CLAN = ' (solo afecta a los miembros del clan del rey: 3 a 20 individuos)';
const OFERTA = [
  // ---- etapa 2: cognitivo (dones de la subespecie; los dones de fuego, trueno, muerte, vacio y sangre estan fuera hasta medirlos) ----
  ['subespecie', 'gift_of_water', 'cognitivo', 'Don del agua', 'conducta', 0, 'Todos los individuos de tu subespecie pueden lanzar en combate un escudo-burbuja propio (20 % por acción de combate, 5 de maná). Medido en 24 duelos pareados (E6): ganó 14 de 24 frente a 12 de 24 sin rasgo: no se distinguió del azar.'],
  ['subespecie', 'gift_of_life', 'cognitivo', 'Don de la vida', 'conducta', 0, 'Todos los individuos pueden lanzar hechizos que crean hierba y plantas (no son de combate). Medido en 24 duelos pareados (E6): ganó 15 de 24 frente a 12 de 24 sin rasgo: no se distinguió del azar.'],
  ['subespecie', 'gift_of_harmony', 'cognitivo', 'Don de la armonía', 'conducta', 0, 'Todos los individuos pueden lanzar hechizos de curación (curar, y lluvia de sangre al bajar su salud del 90 %). Medido en 12 duelos pareados (E6): ganó 5 de 12 frente a 12 de 24 sin rasgo: no se distinguió del azar.'],
  ['subespecie', 'gift_of_air', 'cognitivo', 'Don del aire', 'conducta', 0, 'Todos los individuos pueden lanzar en combate un tornado sobre el enemigo (10 % por acción de combate, 10 de maná). Medido en 24 duelos pareados (E6): ganó 14 de 24 frente a 12 de 24 sin rasgo: no se distinguió del azar.'],
  // ---- mente ----
  ['clan', 'silver_tongues', 'mente', 'Lenguas de plata', 'medido', 0, `Diplomacia +5 y opinión +20 de otros reinos hacia los miembros${CLAN}.`],
  ['clan', 'iron_will', 'mente', 'Voluntad de hierro', 'medido', 0, `Inteligencia +5 (3 → 8) e inmunidad a los efectos que afectan a la mente${CLAN}.`],
  ['clan', 'combat_instincts', 'mente', 'Instintos de combate', 'medido', 1, `Guerra +10 (5 → 15): si el líder es del clan puede conducir ejércitos más grandes${CLAN}.`],
  ['subespecie', 'hyper_intelligence', 'mente', 'Hiperinteligencia', 'medido', 2, 'Inteligencia +30 (medido 7 → 37) en TODOS los individuos de tu subespecie. Valor muy grande.', true],
  ['subespecie', 'telepathic_link', 'mente', 'Vínculo telepático', 'conducta', 0, 'Se comunican con otros a larga distancia y socializan con aliados lejanos. Efecto en la partida no medido.'],
  ['subespecie', 'inquisitive_nature', 'mente', 'Naturaleza inquisitiva', 'conducta', 0, 'Muy curiosos: exploran y se acercan a cosas desconocidas. Efecto en la partida no medido.'],
  ['subespecie', 'fast_builders', 'mente', 'Constructores rápidos', 'medido', 0, 'Velocidad de construcción +2 en todos los individuos (valor leído del juego; no se midió cuánto acelera las ciudades).'],
  ['clan', 'masters_of_propaganda', 'mente', 'Maestros de la propaganda', 'conducta', 0, `Lealtad de las ciudades +20 (valor del juego, no medido): menos rebeliones, y las rebeliones están apagadas en esta partida${CLAN}.`],
  ['idioma', 'strict_spelling', 'mente', 'Ortografía estricta', 'medido', 1, 'Idioma: guerra +10 (5 → 15) a quienes lo hablan: más tamaño del ejército que puede liderar un jefe.'],
  ['idioma', 'enlightening_script', 'mente', 'Escritura iluminadora', 'medido', 1, 'Idioma: inteligencia +10 (3 → 13) a quienes lo hablan.'],
  // ---- espiritu (idioma spirit, clan spirit, religion) ----
  ['idioma', 'elegant_words', 'espiritu', 'Palabras elegantes', 'medido', 1, 'Idioma: descendencia máxima +4 (5 → 9) de quienes lo hablan: más hijos por embarazo.'],
  ['clan', 'gods_chosen', 'espiritu', 'Hijos de lo divino', 'medido', 2, `Armadura +20, administración +10 y diplomacia +5 para los miembros. Valor muy grande${CLAN}.`, true],
  ['clan', 'deathbound', 'espiritu', 'Ligados a la muerte', 'medido', 0, `Guerra +5 (5 → 10); traicionar al jefe del clan da muerte instantánea. Opuesto a blood_pact${CLAN}.`],
  ['clan', 'blood_pact', 'espiritu', 'Pacto de sangre', 'conducta', 0, `Guerra +1; traicionar al jefe del clan significa exilio permanente. Opuesto a deathbound${CLAN}. Efecto en la partida no medido.`],
  ['clan', 'magic_blood', 'espiritu', 'Sangre mágica', 'medido', 0, `Maná ×3 para los miembros${CLAN}.`],
  ['religion', 'spawn_vegetation', 'espiritu', 'Conjurar vegetación', 'conducta', 0, 'Religión: los seguidores pueden lanzar «Crear vegetación» fuera de combate (gasta maná). Efecto en la partida no medido.'],
  ['religion', 'cast_shield', 'espiritu', 'Escudo burbuja', 'conducta', 0, 'Religión: los seguidores pueden lanzar «Escudo» (burbuja protectora temporal) en combate, gastando maná y con cierta probabilidad. En la arena ganó 2 de 3: no se distinguió del azar.'],
  ['religion', 'cast_cure', 'espiritu', 'Conjurar cura', 'conducta', 0, 'Religión: los seguidores pueden lanzar «Curar» fuera de combate (quita enfermedades y maldiciones). En la arena ganó 0 de 3: no se distinguió del azar.'],
  ['religion', 'cast_grass_seeds', 'espiritu', 'Crear hierba', 'conducta', 0, 'Religión: los seguidores pueden lanzar «Semillas de hierba» fuera de combate (cubre de hierba la tierra estéril). Efecto en la partida no medido.'],
  // ---- fisico ----
  ['clan', 'stonefists', 'fisico', 'Puños de piedra', 'medido', 2, `Daño +30 a los miembros (≈ ×3,6 en el rey). Valor muy grande${CLAN}.`, true],
  ['clan', 'gaia_shield', 'fisico', 'Escudo de Gaia', 'medido', 1, `Armadura +10 y salud +10 % para los miembros${CLAN}.`],
  ['clan', 'bonebreakers', 'fisico', 'Rompehuesos', 'medido', 1, `Daño +5 (×1,4 en el rey); los golpes pueden paralizar al oponente${CLAN}.`],
  ['clan', 'flesh_weavers', 'fisico', 'Tejecarnes', 'medido', 1, `Salud +20 % y regeneración para los miembros${CLAN}.`],
  ['clan', 'blood_of_sea', 'fisico', 'Sangre del mar', 'conducta', 0, `Aguante (stamina) +20: nadan rápido y no se cansan${CLAN}. Efecto en la partida no medido.`],
  ['subespecie', 'long_lifespan', 'fisico', 'Larga vida', 'medido', 1, 'Vida +100 años (medido 70 → 170) en todos los individuos de tu subespecie.'],
  ['subespecie', 'high_fecundity', 'fisico', 'Alta fecundidad', 'medido', 2, 'Natalidad +5 (medido 3 → 8) en todos los individuos: más bebés por embarazo. Valor muy grande.', true],
  ['subespecie', 'exoskeleton', 'fisico', 'Exoesqueleto', 'medido', 1, 'Armadura +10 (medido 1 → 11) en todos los individuos de tu subespecie.'],
  ['subespecie', 'enhanced_strength', 'fisico', 'Fuerza mejorada', 'medido', 2, 'Daño +50 (≈ ×3) en todos los individuos. En 12 duelos pareados de guerra (E6) ganó 11 frente a 12 de 24 sin rasgo (cuota de bajas causadas 0,76): es el único rasgo medido con efecto de combate claro. Valor muy grande.', true],
  ['subespecie', 'accelerated_healing', 'fisico', 'Curación acelerada', 'conducta', 0, 'Se curan solos de heridas y enfermedades curables con el tiempo. Efecto en la partida no medido.'],
  // ---- apariencia (fenotipos de fantasia: solo color) ----
  ...[['toxic_green', 'verde tóxico'], ['skin_blue', 'azul'], ['skin_purple', 'violeta'], ['skin_pink', 'rosada'], ['magical', 'mágica'], ['infernal', 'infernal']]
    .map(([k, n]) => ['subespecie', `phenotype_skin_${k}`, 'apariencia', `Piel ${n}`, 'cosmetico', 0, 'Solo cambia el color de piel o pelaje (3 corridas con fenotipo: sin diferencia).']),
  // ---- etapa 3: arquitectura, plano, edificios ----
  ['cultura', 'roads', 'arquitectura', 'Caminos', 'conducta', 0, 'Cultura: la ciudad construye caminos entre edificios, que aceleran el paso de las unidades dentro de la ciudad. Efecto en la partida no medido.'],
  ...[['rings', 'Anillos'], ['parallels', 'Paralelos'], ['cross', 'Cruz'], ['stone_garden', 'Jardín de piedras'], ['diamond', 'Diamante'], ['pebbles', 'Cuadrícula compacta']]
    .map(([k, n]) => ['cultura', `city_layout_${k}`, 'plano', `Plano: ${n}`, 'cosmetico', 0, 'Cultura: fija en qué zonas de 8×8 casillas se pueden levantar edificios (la forma de la ciudad). En 22 corridas de 30 años ningún plano se distinguió del ruido en población o edificios.']),
  ['cultura', 'tower_lovers', 'edificios', 'Amantes de las torres', 'conducta', 0, 'Cultura: +4 al límite de torres de vigilancia de cada ciudad. Efecto en la partida no medido.'],
  ['cultura', 'statue_lovers', 'edificios', 'Amantes de las estatuas', 'cosmetico', 0, 'Cultura: +4 al límite de estatuas de cada ciudad (decoración).'],
  ['cultura', 'buildings_spread', 'edificios', 'Edificios dispersos', 'cosmetico', 0, 'Cultura: sin plan urbano, los edificios se levantan dispersos (equivale al comportamiento normal).'],
  ['cultura', 'dense_dwellings', 'edificios', 'Viviendas densas', 'medido', 1, 'Cultura: el límite de casas por zona se multiplica por ×2 (medido 9 → 18). El límite de casas no es lo que frena la población en 100 años. Opuesto a hive_society.'],
  ['cultura', 'hive_society', 'edificios', 'Sociedad de colmena', 'medido', 2, 'Cultura: el límite de casas por zona se multiplica por ×3 (medido 9 → 27): la mayor palanca de población del catálogo (aunque el límite de casas no frena la población en 100 años). Opuesto a dense_dwellings.', true],
  // ---- etapa 3: politicas (cultura kingdom/warfare/knowledge, sucesion, impuestos) ----
  ['cultura', 'expansionists', 'politica', 'Expansionistas', 'conducta', 0, 'Cultura: los ciudadanos del borde de la ciudad reclaman zonas vecinas con más frecuencia. Efecto en la partida no medido (en 50 años sin efecto claro, n=2).'],
  ['cultura', 'tiny_legends', 'politica', 'Pequeñas leyendas', 'conducta', 0, 'Cultura: los niños empiezan a trabajar desde pequeños. Efecto en la partida no medido.'],
  ['cultura', 'conscription_male_only', 'politica', 'Conscripción masculina', 'conducta', 0, 'Cultura: solo los varones adultos pueden ser reclutados como soldados; reduce a casi la mitad el grupo de posibles reclutas. Efecto en la guerra no medido.'],
  ['cultura', 'conscription_female_only', 'politica', 'Conscripción femenina', 'conducta', 0, 'Cultura: solo las mujeres adultas pueden ser reclutadas como soldados; reduce a casi la mitad el grupo de posibles reclutas. Efecto en la guerra no medido.'],
  ['cultura', 'weaponsmith_mastery', 'politica', 'Maestría armera', 'conducta', 0, 'Cultura: +5 a la habilidad de fabricación de los herreros: más probabilidad de forjar armas legendarias. Efecto en la guerra no medido.'],
  ['cultura', 'fast_learners', 'politica', 'Aprendices rápidos', 'medido', 1, 'Cultura: la experiencia que ganan las unidades se multiplica por ×2 (medido 10 → 20).'],
  ['cultura', 'training_potential', 'politica', 'Potencial de entrenamiento', 'medido', 1, 'Cultura: al subir de nivel una unidad avanza un nivel extra (medido: 1 → 3 niveles tras dos subidas).'],
  ['cultura', 'warriors_ascension', 'sucesion', 'Ascenso de guerreros', 'conducta', 0, 'Cultura, sucesión: hereda el trono el mejor guerrero (mayor guerra). Efecto en la partida no medido.'],
  ['cultura', 'diplomatic_ascension', 'sucesion', 'Ascenso diplomático', 'conducta', 0, 'Cultura, sucesión: hereda el trono el más diplomático. Efecto en la partida no medido.'],
  ['cultura', 'golden_rule', 'sucesion', 'Regla de oro', 'conducta', 0, 'Cultura, sucesión: hereda el trono el heredero más rico. Efecto en la partida no medido.'],
  ['cultura', 'fames_crown', 'sucesion', 'Corona de la fama', 'conducta', 0, 'Cultura, sucesión: hereda el trono el heredero más renombrado. Efecto en la partida no medido.'],
  ['cultura', 'unbroken_chain', 'sucesion', 'La cadena intacta', 'conducta', 0, 'Cultura, sucesión: si no quedan herederos se nombra un nuevo clan real y el reino no se parte (la ley de rebeliones está apagada en esta partida). Efecto no medido.'],
  ['reino', 'tax_rate_local_low', 'impuestos', 'Impuesto local bajo', 'medido', 0, 'Reino: tasa de impuesto local 0,5 → 0,2 (medido): ciudadanos más felices, menos oro.'],
  ['reino', 'tax_rate_local_high', 'impuestos', 'Impuesto local alto', 'medido', 0, 'Reino: tasa de impuesto local 0,5 → 0,7 (medido): más oro de las ciudades, ciudadanos menos felices.'],
  ['reino', 'tax_rate_tribute_low', 'impuestos', 'Tributo bajo', 'medido', 0, 'Reino: tasa de tributo a la corona 0,5 → 0,2 (medido).'],
  ['reino', 'tax_rate_tribute_high', 'impuestos', 'Tributo alto', 'medido', 0, 'Reino: tasa de tributo a la corona 0,5 → 0,7 (medido).'],
];
const ETIQUETA = { medido: 'efecto medido', declarado: 'conducta (efecto no medido)', conducta: 'conducta (efecto no medido)', cosmetico: 'sabor' };

// ---- excluidos a mano (ademas de lo que E3 marca no_ofrecer): [id, motivo]. El motivo cita la medicion de E3. ----
const EXCLUIDOS_MANUAL = [
  ['blood_of_eons', 'clan: vida +1 000 000 000 años (valor absurdo)'], ['eternal_text', 'idioma: vida +500 años (medido 123 → 623; valor absurdo)'], ['endurance_of_titans', 'clan: aguante ×3 (E2: ×4; desproporcionado)'],
  ['foolish_glyphs', 'idioma: inteligencia −5 (rasgo trampa)'], ['shattered_crown', 'cultura: parte el reino entre herederos'], ['unmoving', 'subespecie: población −90 % a los 30 años (replicado; letal)'],
  ['population_minimal', 'subespecie: tope de 50 habitantes'], ['population_small', 'subespecie: tope de 100 habitantes (medido 99 a los 100 años)'], ['population_moderate', 'subespecie: tope de 500 habitantes'],
  ['population_large', 'subespecie: tope de 1000 habitantes'], ['population_expansive', 'subespecie: tope de 3000 habitantes'], ['rapid_aging', 'subespecie: reduce la vida'], ['hydrophobia', 'subespecie: daño por lluvia'],
  ['genetic_psychosis', 'subespecie: los ancianos enloquecen (0 de 2 victorias en la arena)'], ['voracious', 'subespecie: metabolismo +10'], ['slow_builders', 'subespecie: velocidad de construcción −1'], ['prolonged_rest', 'subespecie: reduce el trabajo'],
  ['scribble', 'idioma: ×0,5 (rasgo trampa)'], ['diet_cannibalism', 'subespecie: dieta autodestructiva'], ['solitude_seekers', 'cultura: límite de casas ÷3 (medido 9 → 3)'],
  ['patriarchy', 'cultura: lealtad −50 si el rey es mujer (trampa a ciegas)'], ['matriarchy', 'cultura: lealtad −50 si el rey es varón (trampa a ciegas)'], ['hovering', 'subespecie: flotan; cruzar el muro NO se verificó'],
  ['bioproduct_gold', 'subespecie: oro ×4 a ×14 en 30 años (replicado; valor absurdo)'], ['repeated_sentences', 'idioma: leer puede clonar al lector (población gratis; no medido)'], ['death_grow_mythril', 'subespecie: cada muerte puede dejar un depósito de mithril (no medido)'],
  ['dreamweavers', 'subespecie: convierten cultura, idioma o religión a distancia (no medido)'], ['join_or_die', 'cultura: los enemigos casi muertos cambian de bando'],
  ['gift_of_fire', 'subespecie: don de combate (cast_fire). Medido en E6 (24 duelos pareados): ganó 13 de 24 frente a 12 de 24 sin rasgo; sin efecto detectable. Fuera hasta que el usuario decida (propuesta: costo 1, conducta)'], ['gift_of_thunder', 'subespecie: don de combate (rayo). Medido en E6 (24 duelos pareados): ganó 13 de 24 frente a 12 de 24 sin rasgo; sin efecto detectable. Fuera hasta que el usuario decida (propuesta: costo 1, conducta)'],
  ['gift_of_death', 'subespecie: don de combate. Medido en E6: ganó 10 de 12 duelos pareados (12 de 24 sin rasgo), pero porque invoca esqueletos que el juego cuenta como población y soldados del reino (a los 30 años 21 de 50 unidades; +40 % de población, que pesa el 40 % del puntaje): infla el puntaje. Fuera'], ['gift_of_void', 'subespecie: don de combate (teletransporte). Medido en E6 (12 duelos pareados): ganó 6 de 12 frente a 12 de 24 sin rasgo; sin efecto detectable. Fuera hasta que el usuario decida (propuesta: costo 1, conducta)'],
  ['gift_of_blood', 'subespecie: don de combate (lluvia de sangre). Medido en E6 (24 duelos pareados): ganó 13 de 24 frente a 12 de 24 sin rasgo; sin efecto detectable. Fuera hasta que el usuario decida (propuesta: costo 1, conducta)'],
  ['zeal_of_conquest', 'religión: promete +10 de guerra pero ningún método del juego lee las estadísticas de una religión (inerte; E3)'], ['path_of_unity', 'religión: promete +10 de diplomacia; inerte (E3)'],
  ['minds_awakening', 'religión: promete +10 de inteligencia; inerte (E3)'], ['hand_of_order', 'religión: promete +10 de administración; inerte (E3)'],
  ['cast_curse', 'religión: hechizo de combate (maldición); fuera hasta medirlo, como los dones de combate'], ['cast_blood_rain', 'religión: hechizo de combate (lluvia de sangre); fuera hasta medirlo, como los dones de combate'],
];
const SLOTS = [
  { id: 'cognitivo', etapa: 2, nombre: 'Cognitivo', descripcion: 'Dones de la subespecie (talentos).' },
  { id: 'mente', etapa: 2, nombre: 'Mente', descripcion: 'Rasgos de mente del clan, de la subespecie o del idioma.' },
  { id: 'espiritu', etapa: 2, nombre: 'Espíritu', descripcion: 'Rasgos de espíritu del idioma o del clan, o la religión.' },
  { id: 'fisico', etapa: 2, nombre: 'Físico', descripcion: 'Rasgos de cuerpo del clan o de la subespecie.' },
  { id: 'apariencia', etapa: 2, nombre: 'Apariencia', descripcion: 'Fenotipo: color de piel o pelaje de la subespecie.' },
  { id: 'arquitectura', etapa: 3, nombre: 'Arquitectura', descripcion: 'Cultura: arquitectura.' },
  { id: 'plano', etapa: 3, nombre: 'Plano de ciudad', descripcion: 'Cultura: cómo se ordenan los edificios.' },
  { id: 'edificios', etapa: 3, nombre: 'Edificios', descripcion: 'Cultura: gustos de construcción y límite de viviendas.' },
  { id: 'politica', etapa: 3, nombre: 'Política del reino', descripcion: 'Cultura: expansión, ejército, armas y aprendizaje.' },
  { id: 'sucesion', etapa: 3, nombre: 'Sucesión', descripcion: 'Cultura: quién hereda el trono.' },
  { id: 'impuestos', etapa: 3, nombre: 'Impuestos', descripcion: 'Rasgos del reino: tasas de impuesto y tributo.' },
];

const rasgosJuego = tipo => new Map(juego[`rasgos_${tipo}`].items.map(i => [i.id, i]));
const indice = Object.fromEntries(['reino', 'cultura', 'idioma', 'clan', 'subespecie', 'religion'].map(t => [t, rasgosJuego(t)]));
const costoDe = (clase, rareza, intensidad) => clase === 'cosmetico' ? 0 : clase === 'conducta' || clase === 'declarado' ? 1 : (BASE_RAREZA[rareza] ?? 2) + intensidad;

// ---- E3 final: toda fila ofrecida debe existir; lo que E3 marca no_ofrecer sale de la oferta ----
const CONFIANZA = { A: 'alta', B: 'media', C: 'baja' };
const crudo = leer(rutaE3), listaE3 = Array.isArray(crudo) ? crudo : crudo.rasgos ?? [];
const mapaE3 = new Map(listaE3.map(x => [`${x.tipo}/${x.id}`, x]));
const primeraFrase = s => String(s ?? '').split(/(?<=[.;])\s/)[0].replace(/\s*\([^)]*(Actor|Beh|asset|stat)[^)]*\)/g, '').slice(0, 160);
const e3 = { archivo: 'privado/worldbox/era-fase0/e3/rasgos-efecto.json', entradas: listaE3.length, quitados: [], acotados: [], sin_fila: [] };
const rasgos = [], excluidos = new Map();
for (const [tipo, id, slot, nombre, clase, intensidad, efecto, fuerte] of OFERTA) {
  const j = indice[tipo].get(id), x = mapaE3.get(`${tipo}/${id}`);
  if (!j) throw new Error(`El juego no tiene ${tipo}/${id}`);
  if (!x) { e3.sin_fila.push(id); throw new Error(`E3 no trae la fila ${tipo}/${id}`); }
  if (x.ofrecible === false) throw new Error(`E3 dice que ${id} no se puede ofrecer (el juego lo rechaza)`);
  if (x.recomendacion === 'no_ofrecer') { excluidos.set(id, `E3: ${primeraFrase(x.efecto_es)}`); e3.quitados.push(id); continue; }
  if (fuerte) e3.acotados.push(id);
  rasgos.push({ id, tipo, slot, nombre, grupo: j.grupo, rareza: j.rareza, clase, etiqueta: ETIQUETA[clase], intensidad, costo: costoDe(clase, j.rareza, intensidad), efecto_es: efecto, ...(fuerte ? { fuerte: true } : {}),
    confianza: `E3: ${CONFIANZA[x.confianza] ?? x.confianza}`, recomendacion: x.recomendacion, e3: { recomendacion: x.recomendacion, confianza: CONFIANZA[x.confianza] ?? x.confianza, magnitud: x.magnitud ?? null },
    opuestos: (j.opuestos ?? []), ofrecible: true });
}
for (const [id, motivo] of EXCLUIDOS_MANUAL) { if (!rasgos.some(r => r.id === id)) excluidos.set(id, motivo); else throw new Error(`${id} esta ofrecido y excluido a la vez`); }
for (const r of rasgos) r.opuestos = r.opuestos.filter(o => rasgos.some(y => y.id === o));
// E3 dice que el resto de lo recomendado "ofrecer"/"acotar" queda como candidato (no cambia costos ni equilibrio solo).
const GRUPOS_CON_CASILLA = new Set(['subespecie/talents', 'subespecie/mind', 'subespecie/body', 'clan/mind', 'clan/spirit', 'clan/body', 'idioma/spirit', 'idioma/knowledge', 'cultura/architecture', 'cultura/town_plan', 'cultura/buildings',
  'cultura/kingdom', 'cultura/warfare', 'cultura/succession', 'cultura/harmony', 'cultura/knowledge', 'reino/tribute', 'reino/local_tax']);
e3.candidatos = listaE3.filter(x => ['ofrecer', 'acotar'].includes(x.recomendacion) && x.ofrecible && !rasgos.some(r => r.id === x.id) && !excluidos.has(x.id) && GRUPOS_CON_CASILLA.has(`${x.tipo}/${x.grupo}`)).map(x => `${x.tipo}/${x.id}:${x.recomendacion}`);

// ---- compatibilidad raza-bioma (E2): 15 biomas seguros para toda raza; el resto, solo para las razas listadas ----
const todas = Object.keys(RAZAS);
const seguros = Object.keys(BIOMAS).filter(b => todas.every(r => compat[r].fundar.includes(b)));
const excepciones = {};
for (const r of todas) { const extra = compat[r].fundar.filter(b => !seguros.includes(b)); if (extra.length) excepciones[r] = extra; }
const catalogo = {
  catalogo_version: 'era-1.0.catalogo-2',
  fuente: { juego: juego.meta.juego, evidencia: ['privado/revisiones/E1-entrega.md', 'privado/revisiones/E2-entrega.md', 'privado/revisiones/E3-entrega.md', 'privado/revisiones/E5-entrega.md'], e3 },
  nota: 'Generado por herramientas/worldbox-era-catalogo.mjs. Cambiar una opcion, un costo o un presupuesto es cambiar el reglamento: sube rules_version y prompt_version. catalogo-2 (E5, 8-11-2026) reemplaza a catalogo-1 antes de la primera partida con modelos.',
  razas: todas.map(id => ({ id, nombre: RAZAS[id], ofrecible: !PODADAS[id], ...(PODADAS[id] ? { motivo: PODADAS[id] } : {}) })),
  biomas: Object.keys(BIOMAS).map(id => ({ id, nombre: BIOMAS[id], costo: BIOMA_CARO.has(id) ? 1 : 0, paso: PASO[id] ?? 1, comida: pot[id]?.food ?? null, minerales_naturales: [...new Set(pot[id]?.pot_minerals_spawn ?? [])] })),
  compatibilidad: { biomas_seguros: seguros, excepciones, nota: 'Una raza solo funda ciudad en los biomas seguros y en los de su lista de excepciones.' },
  minerales: MINERALES.map(([id, nombre, costo, efecto_es]) => ({ id, nombre, costo, efecto_es })),
  slots: SLOTS,
  rasgos,
  excluidos: [...excluidos].map(([id, motivo]) => ({ id, motivo })),
};
writeFileSync(salida, JSON.stringify(catalogo, null, 1) + '\n', 'utf8');
const porCasilla = Object.fromEntries(SLOTS.map(s => [s.id, rasgos.filter(r => r.slot === s.id).length]));
const porEtiqueta = Object.fromEntries(Object.values(ETIQUETA).filter((v, i, a) => a.indexOf(v) === i).map(e => [e, rasgos.filter(r => r.etiqueta === e).length]));
console.log(JSON.stringify({ salida, razas: todas.length, seguros: seguros.length, excepciones: Object.keys(excepciones).length, rasgos: rasgos.length, por_casilla: porCasilla, por_etiqueta: porEtiqueta,
  fuertes: rasgos.filter(r => r.fuerte).map(r => r.id), excluidos: excluidos.size, e3 }, null, 1));
