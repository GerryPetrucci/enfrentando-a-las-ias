import { exigir, entero, hash, objeto, RE_NOMBRE } from './util.js';

// Perfil de facción que el núcleo exige a cualquier adaptador (ver docs/worldbox-protocolo.md).
// Obligatorios: id, vivo, poblacion, ciudades, territorio, recursos, objetivos. Opcionales y validados si llegan
// (los anuncia el juego real): especie, ejercito, edificios, comida, salud_media_pct, rey_vivo y, solo en la facción
// propia, unidades_creadas / unidades_creables_restantes. Todo lo demás se descarta: el modelo nunca ve objetos internos.
export const CAMPOS_ENTEROS_OPCIONALES = ['ejercito', 'edificios', 'comida'];
const RE_ESPECIE = /^[a-z_]{1,20}$/;
export function faccionNormalizada(f) {
  exigir(objeto(f) && typeof f.id === 'string' && f.id.length > 0 && f.id.length <= 40 && typeof f.vivo === 'boolean', 'respuesta_invalida');
  const r = { id: f.id, vivo: f.vivo };
  if (f.especie !== undefined) { exigir(typeof f.especie === 'string' && RE_ESPECIE.test(f.especie), 'respuesta_invalida'); r.especie = f.especie; }
  for (const k of ['poblacion', 'ciudades', 'territorio', 'recursos', 'objetivos']) {
    exigir(entero(f[k], 0, 1e9), 'respuesta_invalida'); r[k] = f[k];
  }
  for (const k of CAMPOS_ENTEROS_OPCIONALES) if (f[k] !== undefined) { exigir(entero(f[k], 0, 1e9), 'respuesta_invalida'); r[k] = f[k]; }
  if (f.salud_media_pct !== undefined) { exigir(Number.isFinite(f.salud_media_pct) && f.salud_media_pct >= 0 && f.salud_media_pct <= 1000, 'respuesta_invalida'); r.salud_media_pct = f.salud_media_pct; }
  if (f.rey_vivo !== undefined) { exigir(typeof f.rey_vivo === 'boolean', 'respuesta_invalida'); r.rey_vivo = f.rey_vivo; }
  r.cooldowns = {};
  const cooldowns = f.cooldowns ?? {};
  exigir(objeto(cooldowns), 'respuesta_invalida');
  for (const k of Object.keys(cooldowns).sort()) {
    exigir(RE_NOMBRE.test(k) && entero(cooldowns[k], 0, 1e9), 'respuesta_invalida');
    Object.defineProperty(r.cooldowns, k, { value: cooldowns[k], enumerable: true, writable: true });
  }
  for (const k of ['unidades_creadas', 'unidades_creables_restantes']) if (f[k] !== undefined) { exigir(entero(f[k], 0, 1e9), 'respuesta_invalida'); r[k] = f[k]; }
  return r;
}
export function construirObservacion(raw) {
  exigir(objeto(raw) && entero(raw.turno_juego, 0, 1e9) && Number.isFinite(raw.tiempo_juego_s) && raw.tiempo_juego_s >= 0 && Array.isArray(raw.rivales), 'respuesta_invalida');
  exigir(objeto(raw.mundo) && entero(raw.mundo.tamano_mapa, 2, 1e9) && entero(raw.mundo.libres, 0, raw.mundo.tamano_mapa), 'respuesta_invalida');
  // Orden por unidades de codigo (no por locale): el hash no puede depender de la maquina.
  const faccion = faccionNormalizada(raw.faccion), rivales = raw.rivales.map(faccionNormalizada).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  // Ids unicos y propia faccion fuera de los rivales: una vista ambigua no se entrega.
  exigir(new Set([faccion.id, ...rivales.map(r => r.id)]).size === rivales.length + 1, 'respuesta_invalida');
  const observation = {
    origen: raw.origen === 'simulado' ? 'simulado' : 'puente',
    turno_juego: raw.turno_juego, tiempo_juego_s: raw.tiempo_juego_s,
    faccion, rivales,
    mundo: { tamano_mapa: raw.mundo.tamano_mapa, libres: raw.mundo.libres },
  };
  return { observation, observation_hash: hash(observation) };
}
