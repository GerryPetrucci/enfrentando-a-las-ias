// Ayudas compartidas por las pruebas de WorldBox. No es una prueba: solo se importa.
// Un servidor loopback (node:http) hace de puente FALSO con su propio mundo de juguete; no usa el simulador del
// nucleo, asi las pruebas demuestran que el catalogo de acciones sale de lo que el puente anuncia.
import { createServer } from 'node:http';

export async function servidor(t, responder) {
  const s = createServer(async (req, res) => {
    try {
      let texto = ''; for await (const b of req) texto += b;
      const body = texto ? JSON.parse(texto) : null;
      const r = await responder(req, body);
      if (!r) return;
      res.writeHead(r.status ?? 200, { 'Content-Type': 'application/json', ...(r.headers ?? {}) });
      res.end(JSON.stringify(r.body));
    } catch { res.writeHead(500); res.end('{}'); }
  });
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  t.after(async () => { s.closeAllConnections(); await new Promise(r => s.close(r)); });
  return `http://127.0.0.1:${s.address().port}`;
}
const err = (status, codigo) => ({ status, body: { protocolo: 1, ok: false, error: { codigo, mensaje: 'detalle interno que no debe viajar' } } });
const ok = body => ({ body: { protocolo: 1, ok: true, ...body } });
export const ACCIONES_PUENTE = [
  { nombre: 'reunir', descripcion: 'Suma 5 recursos.', verificada: true, parametros: {} },
  { nombre: 'construir', descripcion: 'Gasta 5*nivel recursos y suma nivel al territorio; tipo es torre o muro.', verificada: true, puntos: 2, cooldown: 1,
    parametros: { tipo: { tipo: 'cadena', valores: ['torre', 'muro'] }, nivel: { tipo: 'entero', minimo: 1, maximo: 3 } } },
  { nombre: 'hechizo', descripcion: 'No implementada todavia.', verificada: false, parametros: {} },
];
// Puente falso del protocolo v1 con idempotencia por id_solicitud. `opciones.semilla` anuncia o no la capacidad de semilla.
export function crearPuenteFalso({ token = 'token-local', semilla = false, acciones = ACCIONES_PUENTE, facciones = null, turnoMax = 1000, hashMundo = 'mundo-0001', gancho } = {}) {
  let mundo = null; const cache = new Map(), peticiones = [];
  const resumen = f => ({ id: f.id, vivo: f.poblacion > 0, poblacion: f.poblacion, ciudades: 1, territorio: f.territorio, recursos: f.recursos, objetivos: 0, cooldowns: f.cooldowns, interno: { objeto_unity: 'NO_EXPOSICION' } });
  async function manejar(req, body) {
    peticiones.push({ url: req.url, metodo: req.method, cuerpo: body });
    if (req.headers['x-puente-token'] !== token) return err(401, 'no_autorizado');
    if (gancho) { const g = await gancho(req, body); if (g) return g; }
    const ruta = new URL(req.url, 'http://x');
    if (body?.id_solicitud && cache.has(body.id_solicitud)) return cache.get(body.id_solicitud);
    const guardar = r => { if (body?.id_solicitud) cache.set(body.id_solicitud, r); return r; };
    if (ruta.pathname === '/v1/info') return ok({ puente: { nombre: 'puente-falso', version: '0.0.1' }, juego: { nombre: 'WorldBox (falso)', version: 'prueba' }, estado: 'listo',
      capacidades: { reiniciar: true, semilla, avanzar: true, terminal: true, multi_faccion: true }, acciones, limites: { max_segundos_avance: 5, max_acciones_por_turno: 5 } });
    if (ruta.pathname === '/v1/escenario/reiniciar') {
      mundo = { semilla: body.semilla, turno: 0, facciones: (facciones ?? body.facciones).map(f => ({ id: f.id, poblacion: 10, territorio: 2, recursos: 10, cooldowns: {} })) };
      return guardar(ok({ escenario_id: 'esc-1', hash_mundo: hashMundo, ...(semilla ? { semilla_usada: body.semilla } : {}), facciones: mundo.facciones.map(f => ({ id: f.id, nombre: `Reino ${f.id}` })) }));
    }
    if (!mundo) return err(409, 'no_listo');
    if (ruta.pathname === '/v1/observacion') {
      const f = mundo.facciones.find(f => f.id === ruta.searchParams.get('faccion'));
      if (!f) return err(400, 'solicitud_invalida');
      return ok({ tiempo_juego_s: mundo.turno, turno_juego: mundo.turno, faccion: resumen(f), rivales: mundo.facciones.filter(r => r !== f).map(resumen), mundo: { tamano_mapa: 100, libres: 100 - mundo.facciones.reduce((s, x) => s + x.territorio, 0) }, secreto: 'NO_EXPOSICION' });
    }
    if (ruta.pathname === '/v1/accion') {
      const f = mundo.facciones.find(f => f.id === body.faccion), p = body.parametros;
      if (!f) return err(400, 'solicitud_invalida');
      if (body.accion === 'reunir') { f.recursos += 5; return guardar(ok({ resultado: 'ejecutada', codigo: 'ok', mensaje: 'x', efecto: { interno: 1 } })); }
      if (body.accion === 'construir') {
        if (f.recursos < 5 * p.nivel) return guardar(ok({ resultado: 'rechazada', codigo: 'recursos_insuficientes' }));
        f.recursos -= 5 * p.nivel; f.territorio += p.nivel; f.cooldowns.construir = mundo.turno + 3;
        return guardar(ok({ resultado: 'ejecutada', codigo: 'ok' }));
      }
      return guardar(err(400, 'no_soportado'));
    }
    if (ruta.pathname === '/v1/avanzar') { mundo.turno++; for (const f of mundo.facciones) f.poblacion += 1; return guardar(ok({ tiempo_juego_s: mundo.turno, terminal: mundo.turno >= turnoMax })); }
    if (ruta.pathname === '/v1/estado-terminal') return ok({ terminal: mundo.turno >= turnoMax, razon: mundo.turno >= turnoMax ? 'turnos' : 'ninguna', resumen_por_faccion: mundo.facciones.map(resumen) });
    if (ruta.pathname === '/v1/cerrar') { mundo = null; return guardar(ok({})); }
    return err(404, 'no_soportado');
  }
  return { manejar, peticiones, cache, token, estado: () => mundo };
}
export async function servirPuente(t, opciones) {
  const puente = crearPuenteFalso(opciones);
  const url = await servidor(t, (req, body) => puente.manejar(req, body));
  return { ...puente, url };
}

// ---- Copia independiente de lo que anuncia el puente REAL dentro de WorldBox 0.51.2 (capturada en vivo el 2026-11-07) ----
const E = (minimo, maximo) => ({ tipo: 'entero', minimo, maximo }), OBJ = { tipo: 'cadena', minimo: 1, maximo: 40 };
export const ACCIONES_REAL_ANUNCIADAS = [
  { nombre: 'crear_unidades', descripcion: 'Crea de 1 a 5 adultos de la especie propia junto a la ciudad inicial y los une a ella (tope 30 por faccion y partida).', verificada: true, parametros: { cantidad: E(1, 5) } },
  { nombre: 'bendecir', descripcion: 'Suelta de 1 a 3 gotas de bendicion sobre tus propias unidades aun no bendecidas (rasgo blessed: mas salud maxima). Tope 10 poderes por faccion y partida.', verificada: true, parametros: { gotas: E(1, 3) } },
  { nombre: 'maldecir', descripcion: 'Suelta de 1 a 3 gotas de maldicion sobre unidades de una faccion rival (estado cursed: pierde salud). Tope 10 poderes por faccion y partida.', verificada: true, parametros: { objetivo: OBJ, gotas: E(1, 3) } },
  { nombre: 'incendiar', descripcion: 'Suelta de 1 a 3 gotas de fuego sobre unidades de una faccion rival (estado burning: pierde salud). Tope 10 poderes por faccion y partida.', verificada: true, parametros: { objetivo: OBJ, gotas: E(1, 3) } },
  { nombre: 'donar_recursos', descripcion: 'Agrega de 1 a 10 unidades de un recurso al almacen de tu ciudad (tope 100 en total por faccion y partida).', verificada: true,
    parametros: { recurso: { tipo: 'cadena', minimo: 0, maximo: 13, valores: ['wood', 'stone', 'gold', 'common_metals'] }, cantidad: E(1, 10) } },
  { nombre: 'declarar_guerra', descripcion: 'Declara la guerra de tipo normal a una faccion rival viva con la que no estes en guerra.', verificada: true, parametros: { objetivo: OBJ } },
  { nombre: 'pedir_paz', descripcion: 'Termina una guerra con un rival (solo si lleva al menos 30 s de juego).', verificada: true, parametros: { objetivo: OBJ } },
];
// Puente falso con la FORMA del real: 7 acciones, observacion con los campos reales, cooldowns siempre {}, semilla:false y
// avanzar que corre segundos de juego. Dinamica minima: territorio y edificios crecen; en guerra cada reino pierde 1 habitante por avance.
// espacio: unidades que caben junto a la ciudad (todo o nada: si no caben las pedidas, rechazada/sin_espacio y el mundo no cambia).
// creadasEfecto(cantidad): lo que la respuesta CONFIRMA en efecto.creadas (por omision, la cantidad; null = la respuesta no trae efecto).
// mundoReinicio: campos del bloque mundo que sobrescribe el puente al reiniciar (para probar discrepancias con lo pedido).
export function crearPuenteFalsoReal({ token = 'token-local', acciones = ACCIONES_REAL_ANUNCIADAS, gancho, calidades = [], espacio = Infinity, creadasEfecto = c => c, mundoReinicio = {}, especiesReinicio = null } = {}) {
  let mundo = null, contador = 0; const cache = new Map(), peticiones = [];
  const vista = (f, propia) => ({ id: f.id, vivo: f.vivo, especie: f.especie, poblacion: f.vivo ? f.poblacion : 0, ciudades: f.vivo ? 1 : 0, territorio: f.vivo ? f.territorio : 0, recursos: f.vivo ? f.recursos : 0, objetivos: f.vivo ? 1 : 0,
    ejercito: 0, edificios: f.vivo ? f.edificios : 0, comida: f.vivo ? f.comida : 0, salud_media_pct: f.vivo ? f.salud : 0, rey_vivo: f.vivo, cooldowns: {},
    ...(propia ? { unidades_creadas: f.creadas, unidades_creables_restantes: Math.max(0, 30 - f.creadas) } : {}), interno: { objeto_unity: 'NO_EXPOSICION' } });
  const vivas = () => mundo.facciones.filter(f => f.vivo);
  async function manejar(req, body) {
    peticiones.push({ url: req.url, metodo: req.method, cuerpo: body });
    if (req.headers['x-puente-token'] !== token) return err(401, 'no_autorizado');
    if (gancho) { const g = await gancho(req, body); if (g) return g; }
    const ruta = new URL(req.url, 'http://x');
    if (body?.id_solicitud && cache.has(body.id_solicitud)) return cache.get(body.id_solicitud);
    const guardar = r => { if (body?.id_solicitud) cache.set(body.id_solicitud, r); return r; };
    if (ruta.pathname === '/v1/info') return ok({ puente: { nombre: 'puente-falso-real', version: '0.2.0' }, juego: { nombre: 'WorldBox', version: '0.51.2', build_steam: '19962337', unity: '2022.3.60f1' }, estado: 'listo',
      capacidades: { reiniciar: true, semilla: false, avanzar: true, terminal: true, multi_faccion: true }, acciones, limites: { max_segundos_avance: 120, max_acciones_por_turno: 3 } });
    if (ruta.pathname === '/v1/escenario/reiniciar') {
      contador++;
      mundo = { turno: 0, t: 0, guerras: new Set(), facciones: body.facciones.map((f, i) => ({ id: f.id, especie: f.especie ?? 'human', vivo: true, poblacion: body.opciones?.unidades_iniciales ?? 4, territorio: 9, edificios: 0, recursos: 0, comida: 0, salud: 100, creadas: 0, almacen: false, poderes: 0, donado: 0, calidad: calidades[contador - 1]?.[i] ?? 500 + 10 * i })) };
      return guardar(ok({ escenario_id: `wb-${contador}`, hash_mundo: `mundo-real-${String(contador).padStart(4, '0')}`, semilla_controlada: false,
        mundo: { ancho: 192, alto: 192, plantilla: body.opciones?.plantilla ?? 'continent', tamano: 'small', velocidad: body.opciones?.velocidad ?? 'x5', unidades_iniciales: body.opciones?.unidades_iniciales ?? 4, ms_generar: 430, ms_total: 457, intentos_mapa: 1, ...mundoReinicio },
        facciones: mundo.facciones.map(f => ({ id: f.id, especie: especiesReinicio?.[f.id] ?? f.especie, nombre: `Reino ${f.id}`, sitio_x: 10, sitio_y: 10, calidad_sitio: f.calidad })) }));
    }
    if (!mundo) return err(503, 'no_listo');
    if (ruta.pathname === '/v1/observacion') {
      const f = mundo.facciones.find(x => x.id === ruta.searchParams.get('faccion'));
      if (!f) return err(400, 'solicitud_invalida');
      return ok({ tiempo_juego_s: mundo.t, turno_juego: mundo.turno, faccion: vista(f, true), rivales: mundo.facciones.filter(r => r !== f).map(r => vista(r, false)),
        mundo: { tamano_mapa: 576, libres: 266, ancho: 192, alto: 192, velocidad: 'x10' } });
    }
    if (ruta.pathname === '/v1/accion') {
      const f = mundo.facciones.find(x => x.id === body.faccion), p = body.parametros, rival = mundo.facciones.find(x => x.id === p.objetivo);
      const ya = () => `${[body.faccion, p.objetivo].sort().join('|')}`, rechazo = c => guardar(ok({ resultado: 'rechazada', codigo: c })), hecho = (r = 'ejecutada', c = 'ok') => guardar(ok({ resultado: r, codigo: c, efecto: { interno: 1 } }));
      if (!f) return err(400, 'solicitud_invalida');
      if (!f.vivo) return rechazo('eliminado');
      switch (body.accion) {
        case 'crear_unidades': {
          if (p.cantidad > espacio) return rechazo('sin_espacio');
          f.poblacion += p.cantidad; f.creadas += p.cantidad; const c = creadasEfecto(p.cantidad);
          return guardar(ok({ resultado: 'ejecutada', codigo: 'ok', ...(c === null ? {} : { efecto: { pedidas: p.cantidad, creadas: c, poblacion_antes: f.poblacion - p.cantidad, poblacion_despues: f.poblacion } }) }));
        }
        case 'bendecir': f.poderes++; f.salud = Math.min(100, f.salud + 5); return hecho();
        case 'maldecir': case 'incendiar':
          if (!rival || rival === f) return rechazo('objetivo_propio'); if (!rival.vivo) return rechazo('objetivo_eliminado');
          f.poderes++; rival.salud = Math.max(1, rival.salud - 7 * p.gotas); return hecho();
        case 'donar_recursos': if (!f.almacen) return hecho('sin_efecto', 'sin_almacen'); f.recursos += p.cantidad; f.donado += p.cantidad; return hecho();
        case 'declarar_guerra': if (!rival || rival === f) return rechazo('objetivo_propio'); if (!rival.vivo) return rechazo('objetivo_eliminado'); if (mundo.guerras.has(ya())) return rechazo('ya_en_guerra'); mundo.guerras.add(ya()); return hecho();
        case 'pedir_paz': if (!rival || !mundo.guerras.has(ya())) return rechazo('sin_guerra'); mundo.guerras.delete(ya()); return hecho();
        default: return rechazo('accion_desconocida');
      }
    }
    if (ruta.pathname === '/v1/avanzar') {
      mundo.turno++; mundo.t += body.segundos_juego;
      for (const f of vivas()) { f.territorio++; f.edificios++; f.recursos += f.almacen ? 2 : 0; if (f.edificios >= 2) f.almacen = true; }
      for (const f of vivas()) if ([...mundo.guerras].some(g => g.split('|').includes(f.id))) { f.poblacion = Math.max(0, f.poblacion - 1); if (f.poblacion === 0) f.vivo = false; }
      return guardar(ok({ tiempo_juego_s: mundo.t, terminal: vivas().length <= 1 }));
    }
    if (ruta.pathname === '/v1/estado-terminal') {
      const terminal = vivas().length <= 1;
      return ok({ terminal, razon: terminal ? 'supervivencia' : 'ninguna', resumen_por_faccion: mundo.facciones.map(f => vista(f, false)) });
    }
    if (ruta.pathname === '/v1/cerrar') { mundo = null; return guardar(ok({})); }
    return err(404, 'no_soportado');
  }
  return { manejar, peticiones, estado: () => mundo, token };
}
export async function servirPuenteReal(t, opciones) {
  const puente = crearPuenteFalsoReal(opciones);
  const url = await servidor(t, (req, body) => puente.manejar(req, body));
  return { ...puente, url };
}
