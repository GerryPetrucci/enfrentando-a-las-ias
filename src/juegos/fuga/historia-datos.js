// Grafo declarativo. Se edita con Twine y se valida antes de entrar al motor.
import { CATALOGO, porId } from './catalogo.js';
import { FASES, RONDAS } from './constantes.js';
import { crearHistoriaCausal } from './historia-causal.js';
import { HECHOS, cumpleHechos } from './trama.js';

export const crearHistoriaInicial = crearHistoriaCausal;

const RUTAS = {
  calma: ['Eligen un acceso que todavía no han recorrido. Las decisiones anteriores han dejado otras rutas abiertas.', 'Un corredor de servicio les permite cambiar de plan antes del siguiente obstáculo.'],
  sigilo: ['El silencio les permite seguir una ruta apartada de la ronda de vigilancia.', 'Después de moverse sin ruido, encuentran un acceso que los guardias apenas revisan.'],
  fuerza: ['El ruido del acceso forzado los obliga a avanzar antes de que llegue la siguiente patrulla.', 'Tras abrirse paso a la fuerza, buscan una salida por las dependencias de mantenimiento.'],
  engano: ['La distracción anterior les abre una ruta entre los puestos del personal.', 'Una historia convincente les permite acercarse al siguiente control por otro lado.'],
  juntos: ['La coordinación anterior les permite preparar juntos el siguiente paso.', 'Al cubrirse mutuamente, encuentran un paso donde uno puede proteger al otro.'],
  solo: ['Sin su compañero al lado, el que sigue dentro debe buscar otra ruta de salida.', 'El recorrido cambia: solo queda una persona para afrontar el siguiente obstáculo.'],
  alarma: ['La vigilancia se ha reforzado. Deben cambiar de recorrido para evitar a la patrulla.', 'Los guardias cierran el paso habitual: el siguiente obstáculo está en una ruta alternativa.'],
  heridos: ['Las heridas obligan a buscar un paso distinto antes de seguir avanzando.', 'Alguien llega herido al siguiente tramo: la ruta cambia para intentar continuar.'],
  preparados: ['El objeto que conservan les anima a intentar una ruta diferente.', 'Todavía tienen una herramienta a mano y preparan con ella el siguiente paso.'],
};
const CONDICIONES = {
  calma: {}, sigilo: { metodo: 'sigilo' }, fuerza: { metodo: 'fuerza' }, engano: { metodo: 'engano' },
  juntos: { postura: 'ayudar', cohesionMin: 1 }, solo: { solo: true }, alarma: { alarmaMin: 3 }, heridos: { heridos: true }, preparados: { objeto: true },
};
const PRIORIDAD = { calma: 0, sigilo: 1, fuerza: 1, engano: 1, juntos: 2, preparados: 2, heridos: 3, alarma: 4, solo: 5 };
export function crearHistoriaLegacy() {
  const nodos = [];
  for (let ronda = 1; ronda <= RONDAS; ronda++) {
    const fase = FASES[Math.floor((ronda - 1) / 3)].id;
    for (const ruta of ronda === 1 ? ['calma'] : Object.keys(RUTAS)) {
      const disponibles = CATALOGO.filter((s) => s.fase === fase);
      const preferidas = disponibles.filter((s) => s.mejor === ruta);
      const escenas = [...preferidas, ...disponibles.filter((s) => !preferidas.includes(s))].slice(0, 5).map((s) => s.id);
      nodos.push({ id: `r${ronda}-${ruta}`, ronda, fase, ruta, escenas, contexto: RUTAS[ruta],
        salidas: ronda === RONDAS ? [] : Object.keys(RUTAS).map((r) => ({ a: `r${ronda + 1}-${r}`, si: CONDICIONES[r], prioridad: PRIORIDAD[r], peso: 1 })) });
    }
  }
  return { nombre: 'La Fuga - historias ramificadas', version: 'fuga-2.0.0', ifid: '75B93F65-74CB-41CB-A972-958925566F40', inicio: 'r1-calma', nodos };
}

const texto = (t) => typeof t === 'string' && t.trim().length > 0 && t.length <= 600 && !/[\r\n<>]/.test(t);
export function validarHistoria(h) {
  const error = (m) => { throw new Error(`Historia de La Fuga: ${m}`); };
  if (!h || !/^fuga-\d+\.\d+\.\d+$/.test(h.version ?? '') || !texto(h.nombre)) error('nombre o version invalida');
  if (!/^[A-F0-9]{8}-(?:[A-F0-9]{4}-){3}[A-F0-9]{12}$/.test(h.ifid ?? '')) error('IFID invalido');
  if (!Array.isArray(h.nodos) || h.nodos.length > 300 || !h.nodos.length) error('nodos invalidos');
  const ids = new Map();
  const claves = (x, permitidas) => x && typeof x === 'object' && !Array.isArray(x) && Object.keys(x).every((k) => permitidas.includes(k));
  const hechos = (si) => (!si.hecho || HECHOS.includes(si.hecho)) && (!si.sinHecho || HECHOS.includes(si.sinHecho));
  const metodos = ['sigilo', 'fuerza', 'engano', 'esperar'];
  const ident = (id) => /^[a-z0-9-]{1,60}$/.test(id ?? '');
  for (const n of h.nodos) {
    if (!/^[a-z0-9-]{1,60}$/.test(n.id ?? '') || ids.has(n.id)) error('id duplicado o invalido');
    ids.set(n.id, n);
    if (!Number.isInteger(n.ronda) || n.ronda < 1 || n.ronda > RONDAS || n.fase !== FASES[Math.floor((n.ronda - 1) / 3)].id) error(`${n.id}: fase o ronda invalida`);
    if (!Array.isArray(n.escenas) || n.escenas.length < 3 || new Set(n.escenas).size !== n.escenas.length || n.escenas.some((id) => porId.get(id)?.fase !== n.fase)) error(`${n.id}: requiere tres escenas distintas de su fase`);
    if (!Array.isArray(n.contexto) || !n.contexto.length || n.contexto.some((t) => !texto(t))) error(`${n.id}: contexto invalido`);
    if (!Array.isArray(n.salidas) || n.salidas.length > 20 || (n.ronda === RONDAS ? n.salidas.length !== 0 : !n.salidas.some((s) => s.si && Object.keys(s.si).length === 0 && s.prioridad === 0))) error(`${n.id}: falta salida por defecto o final invalido`);
    if (n.lugar !== undefined && !texto(n.lugar) || n.objetivo !== undefined && n.objetivo !== '' && !texto(n.objetivo)) error(`${n.id}: lugar u objetivo invalido`);
    for (const campo of ['reglas', 'modificadores']) if (n[campo] !== undefined && (!Array.isArray(n[campo]) || n[campo].length > 10 || new Set(n[campo].map((r) => r?.id)).size !== n[campo].length)) error(`${n.id}: ${campo} invalidos`);
    for (const r of n.reglas ?? []) {
      if (!claves(r, ['id', 'si', 'efecto', 'texto', 'duracion']) || !ident(r.id) || !HECHOS.includes(r.efecto) || !texto(r.texto)
        || !Number.isInteger(r.duracion) || r.duracion < 0 || r.duracion > 9
        || !claves(r.si, ['metodo', 'postura', 'resultado', 'hecho', 'sinHecho']) || !hechos(r.si)
        || r.si.metodo !== undefined && !metodos.includes(r.si.metodo)
        || r.si.postura !== undefined && !['ayudar', 'avanzar', 'sacrificarse', 'separarse'].includes(r.si.postura)
        || !['limpio', 'fallo'].includes(r.si.resultado)) error(`${n.id}: regla de consecuencia invalida`);
    }
    for (const m of n.modificadores ?? []) {
      if (!claves(m, ['id', 'si', 'alcance', 'delta', 'metodos', 'texto']) || !ident(m.id) || !texto(m.texto)
        || !['grupo', 'actor'].includes(m.alcance) || !Number.isFinite(m.delta) || Math.abs(m.delta) > 0.1
        || !claves(m.si, ['hecho', 'sinHecho']) || !HECHOS.includes(m.si.hecho) || !hechos(m.si)
        || m.metodos !== undefined && (!Array.isArray(m.metodos) || !m.metodos.length || m.metodos.some((x) => !metodos.includes(x)))) error(`${n.id}: modificador invalido`);
    }
    if ((n.modificadores ?? []).reduce((s, m) => s + Math.abs(m.delta), 0) > 0.15) error(`${n.id}: ajustes acumulados excesivos`);
  }
  if (ids.get(h.inicio)?.ronda !== 1) error('inicio invalido');
  const permitidas = { alarmaMin: (v) => Number.isInteger(v) && v >= 0 && v <= 5, cohesionMin: (v) => Number.isInteger(v) && v >= -3 && v <= 3,
    metodo: (v) => ['sigilo', 'fuerza', 'engano', 'esperar'].includes(v), postura: (v) => ['ayudar', 'avanzar', 'sacrificarse', 'separarse'].includes(v),
    solo: (v) => typeof v === 'boolean', heridos: (v) => typeof v === 'boolean', objeto: (v) => typeof v === 'boolean',
    exito: (v) => typeof v === 'boolean', hecho: (v) => HECHOS.includes(v), sinHecho: (v) => HECHOS.includes(v) };
  for (const n of h.nodos) for (const s of n.salidas) {
    if (ids.get(s.a)?.ronda !== n.ronda + 1) error(`${n.id}: enlace ausente, ciclo o salto de ronda`);
    if (!Number.isInteger(s.prioridad) || s.prioridad < 0 || s.prioridad > 9 || !Number.isFinite(s.peso) || s.peso <= 0 || s.peso > 100) error(`${n.id}: prioridad o peso invalido`);
    if (!s.si || typeof s.si !== 'object' || Array.isArray(s.si) || Object.entries(s.si).some(([k, v]) => !Object.hasOwn(permitidas, k) || !permitidas[k](v))) error(`${n.id}: condicion no permitida`);
  }
  const vistos = new Set(), visitar = (id) => { if (vistos.has(id)) return; vistos.add(id); ids.get(id).salidas.forEach((s) => visitar(s.a)); };
  visitar(h.inicio);
  if (vistos.size !== ids.size) error('hay nodos inalcanzables');
  return h;
}

export function cumpleCondicion(si, E) {
  const registro = E.historial.at(-1), ultimas = registro?.jugadas ?? [];
  if (!cumpleHechos(si, E)) return false;
  if (si.exito !== undefined && !ultimas.some((j, i) => j && !registro.invalidas[i] && E.libres[i] && (!si.metodo || j.metodo === si.metodo)
    && (!si.postura || j.postura === si.postura) && (registro.resultados[i] === 'limpio') === si.exito)) return false;
  return Object.entries(si).every(([k, v]) => ({
    alarmaMin: () => E.alarma >= v, cohesionMin: () => E.cohesion >= v,
    metodo: () => ultimas.some((j) => j?.metodo === v), postura: () => ultimas.some((j) => j?.postura === v),
    solo: () => (E.libres.filter(Boolean).length === 1) === v,
    heridos: () => E.heridas.some((n, i) => E.libres[i] && n > 0) === v,
    objeto: () => E.objeto.some((o, i) => E.libres[i] && o && o.restan > 0) === v,
    hecho: () => true, sinHecho: () => true, exito: () => true,
  }[k]?.() ?? false));
}
