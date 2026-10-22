// Lo que la escena de la Guerra de territorios necesita saber del motor y la web no puede importar de src/ (el sitio publica solo web/ y data/): las constantes de las reglas que se
// muestran, el lector del mapa guardado en la partida, el estado con el que empieza una partida y los colores del terreno de cada bioma. Todo lo copiado lo vigila
// src/pruebas/escena/datosconq.test.js contra src/juegos/conquista/ y src/mapa.js.
// Sin DOM ni `window`: lo importan la linea de tiempo, el dibujo, la mesa y las pruebas (Node).

// ---- constantes del motor (src/juegos/conquista/constantes.js) ----
export const TURNOS_TOPE = 30;
export const TROPAS_CAPITAL = 10;
export const TROPAS_VECINA = 3;
export const ALMACEN_INICIAL = { Comida: 6, Madera: 4, Roca: 2, Hierro: 0, Oro: 4, Caballos: 0 };
export const RECURSOS = ['Comida', 'Madera', 'Roca', 'Hierro', 'Oro', 'Caballos'];
export const HONOR_INICIAL = 5;
export const HONOR_MAXIMO = 10;
export const HONOR_ROTURA = 3;
export const PACTO_TURNOS = 2;
export const MARAVILLA_TURNOS = 9;
export const PUNTOS_POSICION = [5, 3, 1, 0, 0];
export const TERRENO = { ll: 1, bo: 1.25, mo: 1.5 }; // multiplicador de defensa por terreno
export const BONO_ARMAS = 0.25; // por nivel de mejora de un tipo de unidad (en 1.x era el nivel de armas; la tarjeta aun lo llama «Armas»)
export const BONO_FORTALEZA = 0.5; // por nivel de fortaleza (la formula de ctx.defensa del motor)
// Guerra 2.0.0: los tipos de unidad (constantes.js, UNIDADES: Lancero, Arquero, Jinete e Ingenio) y los numeros de los eventos del mundo y del Hegemon que la escena cuenta en pantalla.
export const LETRAS_DE_UNIDAD = ['L', 'A', 'J', 'I'];
export const NOMBRES_DE_UNIDAD = ['Lanceros', 'Arqueros', 'Jinetes', 'Ingenios'];
export const SEQUIA_TURNOS = 2; // EVENTOS.sequiaTurnos
export const CARAVANA = { Oro: 6, Caballos: 3 }; // EVENTOS.caravana
export const PESTE_PORCIENTO = 15; // EVENTOS.peste (15 %)
export const HEGEMON_BONO = 50; // HEGEMON.bonoAtaque: los demas lo atacan con +50 %
export const LETRA_DE_EDIFICIO = { g: 'granja', m: 'mercado', c: 'cuartel' }; // lo que guarda registro.estado.edif

// Los multiplicadores que muestra la tarjeta de batalla ("Armas x1.25", "Fortaleza x1.5"): la misma cuenta que hace el motor al calcular las fuerzas.
export const multiplicadorDeArmas = (nivel) => 1 + BONO_ARMAS * (Number(nivel) || 0);
export const multiplicadorDeFortaleza = (nivel) => 1 + BONO_FORTALEZA * (Number(nivel) || 0);

// Todas las unidades de un reino: las de `estado.uni` (tambien las que tiene de visita en tierra de otros). Sin `uni` (partida de formato anterior) o con `uni` roto, la guarnicion de sus regiones.
export function tropasDeReino(estado, s) {
  if (!estado || typeof estado !== 'object') return 0;
  if (Array.isArray(estado.uni)) return estado.uni.reduce((a, f) => (Array.isArray(f) && f.length >= 6 && f[1] === s ? a + [2, 3, 4, 5].reduce((b, i) => b + (Number(f[i]) || 0), 0) : a), 0);
  return (Array.isArray(estado.dueno) ? estado.dueno : []).reduce((a, d, r) => (d === s ? a + (Number(estado.tropas?.[r]) || 0) : a), 0);
}

// Una pila [L, A, J, I] como «L5 A3» (solo los tipos que hay); vacia o rota, ''.
export function composicionTexto(pila) {
  if (!Array.isArray(pila)) return '';
  return LETRAS_DE_UNIDAD.map((l, t) => ((Number(pila[t]) || 0) > 0 ? `${l}${Number(pila[t])}` : '')).filter(Boolean).join(' ');
}

// ---- biomas: como se llaman en pantalla y de que color es su terreno [mar hondo, agua, arena, llano, bosque, montana] ----
export const NOMBRES_BIOMA = { continente: 'Continente', arido: 'Árido', mares: 'Mucho mar', interior: 'Mar interior', cordillera: 'Cordillera', istmo: 'Istmo', golfo: 'Golfo', peninsulas: 'Penínsulas' };
const PALETA_VERDE = ['#17304f', '#21507d', '#cdb67f', '#528f42', '#2e6a37', '#80828c'];
const PALETAS = {
  continente: PALETA_VERDE,
  arido: ['#17304f', '#21507d', '#e0c88f', '#c29a58', '#8a8a45', '#8b7a68'],
  mares: PALETA_VERDE,
  interior: PALETA_VERDE,
  cordillera: ['#17304f', '#21507d', '#cdb67f', '#5c9647', '#2e6a37', '#b3b7c4'], // montanas claras (nieve): se leen aun con el tinte de los reinos
  istmo: ['#12363f', '#1b6275', '#e6d3a0', '#6cab4f', '#357a3f', '#8a8d96'],
  golfo: ['#13294f', '#2c6fb5', '#d8c185', '#5f9a3f', '#2f6431', '#7f7f88'],
  peninsulas: ['#16304a', '#2a6f8f', '#e8d9a8', '#58a65a', '#2c7a48', '#75808c'],
};
export const paletaDe = (bioma) => [...(Object.hasOwn(PALETAS, bioma) ? PALETAS[bioma] : PALETA_VERDE)];
export const TINTE_DE_REINO = 0.35; // cuanto cubre el color del reino al terreno: lo bastante para leer quien manda y lo bastante poco para leer el bioma

// ---- el mapa guardado en la partida (src/mapa.js: serializarMapa / restaurarMapa) ----
// Devuelve el mapa con arreglos tipados, o null si lo guardado no es un mapa completo (otro formato, truncado, roto): nunca lanza.
export function leerMapa(o) {
  try {
    const n = o?.ancho * o?.alto;
    const ok = o && typeof o === 'object' && Number.isInteger(n) && n > 0
      && typeof o.terreno === 'string' && o.terreno.length === n && /^[0-5]+$/.test(o.terreno)
      && Array.isArray(o.region) && o.region.length === n
      && Array.isArray(o.regs) && o.regs.every((r) => r && typeof r === 'object' && Array.isArray(r.vecinos))
      && o.inicio && Array.isArray(o.inicio.dueno) && Array.isArray(o.inicio.capitales);
    if (!ok) return null;
    return {
      k: o.k, seed: o.seed, bioma: o.bioma, ancho: o.ancho, alto: o.alto, tile: o.tile,
      terreno: Uint8Array.from(o.terreno, Number),
      region: Int16Array.from(o.region),
      regs: o.regs.map((r) => ({ ...r, vecinos: [...r.vecinos] })),
      inicio: { dueno: Int8Array.from(o.inicio.dueno), capitales: [...o.inicio.capitales] },
    };
  } catch {
    return null;
  }
}

// El estado del turno 0, con la misma forma que `registro.estado` (la foto al cierre de cada turno): duenos de `mapa.inicio`, tropas de capital y vecinas, fortaleza 1 en la capital,
// almacen y honor iniciales. null si la partida no trae un mapa legible.
export function estadoInicial(partida) {
  try {
    const m = leerMapa(partida?.mapa);
    if (!m) return null;
    const NR = m.regs.length, k = m.k, dueno = Array.from(m.inicio.dueno), capitales = m.inicio.capitales;
    return {
      dueno,
      tropas: dueno.map((d, r) => (d < 0 ? 0 : r === capitales[d] ? TROPAS_CAPITAL : TROPAS_VECINA)),
      fort: Array.from({ length: NR }, (_, r) => (capitales.includes(r) ? 1 : 0)),
      edif: Array(NR).fill(null),
      dan: Array(NR).fill(0),
      stock: Array.from({ length: k }, () => ({ ...ALMACEN_INICIAL })),
      armas: Array(k).fill(0),
      mejoras: Array.from({ length: k }, () => [0, 0, 0, 0]),
      // unidades por region y reino ([region, reino, L, A, J, I], solo las pilas que existen): al empezar, solo Lanceros del dueno
      uni: dueno.flatMap((d, r) => (d < 0 ? [] : [[r, d, r === capitales[d] ? TROPAS_CAPITAL : TROPAS_VECINA, 0, 0, 0]])),
      aisladas: [], // al empezar, cada region toca la capital de su dueno
      hegemon: -1, sequia: false, // al empezar nadie es Hegemon y no hay sequia
      honor: Array(k).fill(HONOR_INICIAL),
      vivo: Array(k).fill(true),
      pactos: Array.from({ length: k }, () => Array(k).fill(0)),
      maravilla: null,
      notas: Array(k).fill(''),
    };
  } catch {
    return null;
  }
}
