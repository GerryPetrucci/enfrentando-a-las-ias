// Metricas definidas ANTES de correr (fase 1 del plan). Cambiarlas exige subir la version de reglas.
// El simulador y el juego real puntuan con tablas de pesos distintas porque observan campos distintos; la tabla usada
// viaja en el log (`config.pesos`) para que el reporte se reconstruya sin depender del codigo vigente.
export const PESOS = Object.freeze({ supervivencia: 100, poblacion: 1, territorio: 5, recursos: 0.1, objetivos: 20, penalizacion: 5 });
// Juego real (reglas auge-real-1.0.0): solo campos de /v1/observacion que SI discriminan entre facciones en las mediciones
// (ver docs/worldbox-reglas.md, seccion 5: 24 partidas completas contra el juego con bots; reproducible con
// `node src/worldbox/analisis-pesos.js <carpetas de corridas>`).
// Regla: peso = 5 puntos de ruido / desviacion de (f1 - f2) entre conductas identicas, a una decima; territorio con peso simbolico (SNR 0.06); salud acotada a 0.5;
// `ciudades` y `objetivos` (= ciudades) no varian y `comida` (SNR 0.49) y `ejercito` quedan fuera.
export const PESOS_REAL = Object.freeze({ supervivencia: 100, poblacion: 0.3, territorio: 0.1, edificios: 0.8, recursos: 0.2, salud_media_pct: 0.5, penalizacion: 5 });
const FIJOS = new Set(['supervivencia', 'penalizacion']);
export function puntuar(f, penalizaciones = 0, pesos = PESOS) {
  let bruto = f.vivo ? pesos.supervivencia : 0;
  for (const k of Object.keys(pesos)) if (!FIJOS.has(k)) bruto += pesos[k] * (f[k] ?? 0);
  bruto -= pesos.penalizacion * penalizaciones;
  return Math.round(bruto * 10) / 10;
}
// Mas puntos; empate: poblacion, luego territorio; si persiste comparten puesto (el id solo estabiliza el orden).
// Con `supervivencia` (reglas auge-real-1.1.0): si queda EXACTAMENTE un reino vivo, ese gana aunque tenga menos puntos
// (las infracciones pueden dejarlo por debajo del eliminado); los puntos ordenan al resto. Con 0 o 2+ vivos, solo puntos.
export function ranking(filas, { supervivencia = false } = {}) {
  const vivos = filas.filter(f => f.vivo === true), unico = supervivencia && vivos.length === 1 ? vivos[0] : null;
  const resto = unico ? filas.filter(f => f !== unico) : filas, base = unico ? 2 : 1;
  const orden = [...resto].sort((a, b) => b.puntos - a.puntos || b.poblacion - a.poblacion || b.territorio - a.territorio ||
    (a.participant_id < b.participant_id ? -1 : a.participant_id > b.participant_id ? 1 : 0));
  const mismo = (a, b) => a.puntos === b.puntos && a.poblacion === b.poblacion && a.territorio === b.territorio;
  const salida = [];
  orden.forEach((f, i) => salida.push({ ...f, puesto: i && mismo(f, orden[i - 1]) ? salida[i - 1].puesto : i + base }));
  return unico ? [{ ...unico, puesto: 1 }, ...salida] : salida;
}
// Eficiencia aparte del juego: puntos por dolar. Con costo cero no existe (null, nunca infinito).
export const eficiencia = (puntos, costo) => costo > 0 ? puntos / costo : null;
// Robustez aparte: desviacion entre las medias por semilla DISTINTA; repetir una semilla no cuenta como otra.
export function robustez(muestras) {
  const porSemilla = new Map();
  for (const { semilla, puntos } of muestras) {
    const valores = porSemilla.get(semilla) ?? []; valores.push(puntos); porSemilla.set(semilla, valores);
  }
  const medias = [...porSemilla.values()].map(a => a.reduce((s, v) => s + v, 0) / a.length);
  if (medias.length < 2) return { semillas: medias.length, media: medias[0] ?? null, desviacion: null };
  const media = medias.reduce((s, v) => s + v, 0) / medias.length;
  return { semillas: medias.length, media, desviacion: Math.sqrt(medias.reduce((s, v) => s + (v - media) ** 2, 0) / medias.length) };
}
