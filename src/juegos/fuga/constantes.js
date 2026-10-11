// Constantes de La Fuga. Los multiplicadores de K y los puntos son valores de partida: se afinan con la simulacion de bots
// (privado/prototipos/herramientas/fuga-balance.mjs). Si cambian, las pruebas leen estos valores y no repiten los numeros.

export const RONDAS = 9;
export const POSTURAS = ['ayudar', 'avanzar', 'sacrificarse', 'separarse'];
export const METODOS = ['sigilo', 'fuerza', 'engano', 'esperar'];
// esperar no tiene ajuste propio por situacion: siempre vale K.esperar
export const METODOS_DE_SITUACION = ['sigilo', 'fuerza', 'engano'];

export const FASES = [
  { id: 'interior', nombre: 'interior', peligro: [0.04, 0.19] },
  { id: 'patio', nombre: 'patio', peligro: [0.09, 0.29] },
  { id: 'perimetro', nombre: 'perimetro', peligro: [0.19, 0.39] },
];
export const SITUACIONES_POR_FASE = 3;

export const K = {
  ajusteMejor: 0.6,
  ajusteNormal: 1.0,
  ajusteMalo: 1.5,
  esperar: 0.85,
  // multiplica el fallo de quien hace la postura
  posturaPropia: { ayudar: 1.10, avanzar: 1.0, sacrificarse: 1.8, separarse: 1.5 },
  // multiplica el fallo del OTRO prisionero segun la postura de este
  efectoCompanero: { ayudar: 0.75, avanzar: 1.0, sacrificarse: 0.45, separarse: 1.0 }, // al abandonado ya no se le castiga: ir solo es K.solo
  solo: 1.15,      // multiplica el fallo de un prisionero solo (su companero fue capturado o ya escapo): nadie lo cubre
  comboComplemento: 0.85,
  comboRepetido: 1.15,
  alarma: 0.08,    // por punto de alarma
  cohesion: 0.05,  // por punto de cohesion (positiva ayuda, negativa estorba)
  objeto: 0.9,
  herida: 0.05,    // se SUMA por herida
  minFallo: 0.03,
  maxFallo: 0.90,
};

export const PISTA_FIABLE = 0.7;
export const P_TENTACION = 0.55;
// escapeSolo: sale primero por su cuenta, o es el unico libre porque capturaron al companero.
// escapeAbandonado: sale al final despues de que su companero ya habia escapado por su cuenta (cobra mas: compensa el abandono).
export const PUNTOS = { escapeConjunto: 10, escapeSolo: 7, escapeAbandonado: 9, botin: 2, delacion: 3 };

// Salida anticipada (enmienda del 10 de octubre de 2026): quien se separa y pasa la situacion sin que lo capturen tiene esta
// probabilidad OCULTA de escapar de inmediato por su ruta propia, segun la fase.
export const SALIDA_ANTICIPADA = { interior: 0, patio: 0.15, perimetro: 0.35 };
// Un prisionero solo encuentra mas botin: toda situacion que podia traer una tentacion trae un botin con esta probabilidad
// (donde habia una oferta del guardia, que sin companero no tiene sentido, sale uno de estos objetos).
export const P_BOTIN_SOLO = 0.9;
export const OBJETOS_SOLO = ['un bolso olvidado', 'una caja de herramientas', 'un manojo de llaves', 'una mochila abandonada'];
export const ALARMA_MAX = 5;
export const COHESION_MAX = 3;
export const TURNOS_OBJETO = 2;

// Sin acentos: lo ve la IA dentro de la vista. La narracion publica pone sus propias comillas y acentos.
export const NIVELES_ALERTA = ['tranquila', 'tranquila', 'inquieta', 'en alerta', 'en alerta', 'desatada'];
export const nivelAlerta = (alarma) => NIVELES_ALERTA[Math.max(0, Math.min(ALARMA_MAX, alarma))];
