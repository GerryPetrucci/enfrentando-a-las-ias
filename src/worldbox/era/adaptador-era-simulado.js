import { crearRng } from '../../rng.js';
import { copiar, exigir, entero, hash, ErrorArena, PROTOCOLO, SEMILLA_MAX } from '../util.js';
import { ACCIONES_REAL } from '../reglas.js';
import { CATALOGO_ERA, biomaCompatible } from './reglas-era.js';
import { normalizarEstadoEra, normalizarRespuestaRasgos } from './observacion-era.js';

// Adaptador SIMULADO del formato «era» (pruebas, ensayos y bots sin abrir WorldBox). NO reproduce WorldBox: es un modelo grueso de crecimiento,
// muro, guerra y rasgos con la forma EXACTA de las respuestas del puente (docs/worldbox-protocolo.md, «Formato era»). Todo lo que devuelve
// lleva origen «simulado». Determinista: misma semilla + mismas ordenes = mismo resultado.
const VELOCIDADES = ['x1', 'x2', 'x3', 'x4', 'x5', 'x10', 'x15', 'x20', 'x40'];
const RECURSO_DE = { mineral_stone: 'stone', mineral_metals: 'common_metals', mineral_silver: 'silver', mineral_gold: 'gold', mineral_gems: 'gems', mineral_mythril: 'mythril', mineral_adamantine: 'adamantine', mineral_bones: 'bones' };
const TIPOS = ['reino', 'cultura', 'idioma', 'clan', 'subespecie', 'religion'];
const TOPE = 6;
// Efecto de cada rasgo en el modelo grueso (no en el juego real): bono de natalidad, dano y armadura.
const BONOS = { high_fecundity: { nat: 0.6 }, elegant_words: { nat: 0.2 }, long_lifespan: { nat: 0.1 }, stonefists: { dano: 1.5 }, enhanced_strength: { dano: 1.2 }, bonebreakers: { dano: 0.4 }, combat_instincts: { dano: 0.3 }, strict_spelling: { dano: 0.2 },
  gods_chosen: { arm: 1 }, gaia_shield: { arm: 0.5 }, exoskeleton: { arm: 0.5 }, flesh_weavers: { arm: 0.3 }, hyper_intelligence: { nat: 0.15 } };

// sim: { letalidad (0.12), escision: {faccion, anio}, cae_original: {faccion, anio}, presentes: {faccion: {tipo: [ids]}}, mineralesPorAnio,
//        objetoAusenteHasta: {tipo: anio}  (el reino no tiene cultura/idioma/... antes de ese anio: lo que se aplica sin mantener se rechaza, con mantener queda pendiente),
//        reemplazos: [{tipo, cadaAnios}]   (el juego reemplaza el objeto cada N anios y los rasgos del tipo se pierden; el mantenimiento los reaplica) }
export function crearAdaptadorEraSimulado({ sim = {} } = {}) {
  let mundo = null, rng, escenarioN = 0;
  const listo = () => exigir(mundo, 'no_listo');
  const f = id => { listo(); const x = mundo.facs.find(y => y.id === id); exigir(x, 'solicitud_invalida'); return x; };
  const anio = () => 1 + Math.floor(mundo.t / 60);
  const evento = (tipo, extra = {}) => { mundo.eventos.push({ i: mundo.eventos.length, tipo, anio: anio(), t_juego_s: Math.round(mundo.t * 10) / 10, t_real_s: Math.round(mundo.tReal * 10) / 10, ...extra }); };
  const bono = (x, k) => TIPOS.flatMap(t => x.rasgos[t]).reduce((s, id) => s + (BONOS[id]?.[k] ?? 0), 0);
  const recalcular = x => {
    x.ciudades = x.vivo ? Math.min(10, 1 + Math.floor(x.pob / 150)) : 0;
    x.territorio = x.vivo ? 12 + 4 * (x.ciudades - 1) + Math.floor(x.pob / 25) : 0;
    x.edificios = x.vivo ? Math.floor(x.pob * 0.9) + 1 : 0;
    x.ejercito = x.vivo ? Math.floor(x.pob * 0.18) : 0;
  };
  const resumen = x => ({ id: x.id, vivo: x.vivo, especie: x.especie, poblacion: x.pob, ciudades: x.ciudades, territorio: x.territorio, recursos: 0, objetivos: x.ciudades, cooldowns: {}, ejercito: x.ejercito, edificios: x.edificios });
  const vivas = () => mundo.facs.filter(x => x.vivo);
  function pasoAnio() {
    mundo.t += 60;
    const letalidad = sim.letalidad ?? 0.12;
    for (const x of mundo.facs.filter(y => y.vivo)) {
      const ciudadesAntes = x.ciudades, K = 80 * x.ciudades + 6 * x.territorio, tasa = 0.05 * (1 + bono(x, 'nat'));
      x.pob = Math.max(1, x.pob + Math.round(x.pob * tasa * Math.max(0, 1 - x.pob / K) * (0.9 + 0.2 * rng())) + (x.pob < 20 ? 1 : 0));
      if (x.depositos > 0 && mundo.t / 60 % 2 === 0) { x.depositos--; x.almacen[RECURSO_DE[x.mineral]]++; }
      recalcular(x);
      if (x.ciudades > ciudadesAntes) evento('ciudad_fundada', { faccion: x.id });
    }
    if (mundo.guerra && !mundo.muro) {
      const [a, b] = mundo.facs;
      if (a.vivo && b.vivo) {
        const golpe = (x, y) => Math.round(x.ejercito * (1 + bono(x, 'dano')) * letalidad * (0.8 + 0.4 * rng()) / (1 + 0.1 * bono(y, 'arm')));
        const da = golpe(b, a), db = golpe(a, b);
        a.pob = Math.max(0, a.pob - da); b.pob = Math.max(0, b.pob - db);
        for (const x of [a, b]) { if (x.pob === 0) { x.vivo = false; evento('civilizacion_eliminada', { faccion: x.id }); } recalcular(x); }
      }
    }
    for (const r of sim.reemplazos ?? []) if (anio() % r.cadaAnios === 0) for (const x of mundo.facs) { x.rasgos[r.tipo] = []; x.propios[r.tipo] = []; }
    mantener();
    for (const [clave, tipo] of [['escision', 'reino_nuevo'], ['cae_original', 'reino_eliminado']]) {
      const c = sim[clave];
      if (c && anio() === c.anio) { const x = f(c.faccion); if (clave === 'escision') { x.reinos++; } else x.originalVivo = false; evento(tipo, { faccion: x.id, origen: clave === 'escision' ? 'escision' : 'original' }); }
    }
  }
  // E5: mantenimiento de rasgos (como el del puente: reaplica lo perdido y aplica lo pendiente en cuanto el objeto existe).
  const existeObjeto = tipo => !((sim.objetoAusenteHasta?.[tipo] ?? 0) > anio());
  const registroMant = (x, tipo) => (x.mant[tipo] ??= []);
  function mantener() {
    if (!mundo.mantCuenta) mundo.mantCuenta = { perdidas: 0, reaplicaciones: 0, aplicados_tarde: 0, comprobaciones: 0 };
    mundo.mantCuenta.comprobaciones++;
    for (const x of mundo.facs) for (const tipo of Object.keys(x.mant)) {
      const existe = existeObjeto(tipo);
      for (const d of x.mant[tipo]) {
        if (x.rasgos[tipo].includes(d.id)) { d.estado = 'activo'; delete d.motivo; continue; }
        if (d.estado === 'activo') { d.estado = 'pendiente'; d.perdidas++; mundo.mantCuenta.perdidas++; evento('rasgo_perdido', { faccion: x.id, categoria: tipo, id: d.id }); }
        if (!existe) { d.motivo = 'objeto_ausente'; continue; }
        const r = CATALOGO_ERA.rasgos.find(y => y.id === d.id && y.tipo === tipo);
        if (r?.opuestos.some(o => x.rasgos[tipo].includes(o))) { d.motivo = 'rasgo_opuesto'; continue; }
        x.rasgos[tipo].push(d.id);
        const eraPerdido = d.perdidas > d.reaplicaciones;
        d.estado = 'activo'; delete d.motivo;
        if (eraPerdido) { d.reaplicaciones++; mundo.mantCuenta.reaplicaciones++; evento('rasgo_reaplicado', { faccion: x.id, categoria: tipo, id: d.id }); }
        else { mundo.mantCuenta.aplicados_tarde++; evento('rasgo_aplicado_tarde', { faccion: x.id, categoria: tipo, id: d.id }); }
      }
    }
  }
  const validarTipoFaccion = (x, tipo) => { exigir(TIPOS.includes(tipo), 'solicitud_invalida'); return x; };
  return {
    async info() {
      return { protocolo: PROTOCOLO, origen: 'simulado', puente: { nombre: 'simulador-era', version: 'era-1.0' }, juego: { nombre: 'WorldBox (era simulada)', version: 'simulado' }, estado: 'listo',
        capacidades: { reiniciar: true, semilla: true, avanzar: true, terminal: true, multi_faccion: true, era: true, era_velocidad: true, era_mantener: true },
        acciones: Object.entries(ACCIONES_REAL).map(([nombre, a]) => ({ nombre, descripcion: a.texto, verificada: true, parametros: copiar(a.parametros) })),
        limites: { max_segundos_avance: 120, max_acciones_por_turno: 3 } };
    },
    async reiniciarEscenario({ semilla, tamano_mapa = 192, facciones, opciones = {} }) {
      exigir(entero(semilla, 0, SEMILLA_MAX) && entero(tamano_mapa, 12, 10000) && Array.isArray(facciones) && facciones.length === 2 && new Set(facciones.map(x => x.id)).size === 2);
      const era = opciones.era ?? {};
      exigir(era.espejo === true, 'solicitud_invalida');
      const razas = new Set(CATALOGO_ERA.razas.map(r => r.id));
      for (const x of facciones) exigir(typeof x.id === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(x.id) && razas.has(x.especie ?? 'human'), 'solicitud_invalida');
      for (const [id, bioma] of Object.entries(era.biomas ?? {})) {
        const fac = facciones.find(x => x.id === id);
        exigir(fac && CATALOGO_ERA.biomas.some(b => b.id === bioma), 'solicitud_invalida');
        if (!biomaCompatible(fac.especie ?? 'human', bioma)) throw new ErrorArena('error_interno'); // el juego real: «no se encontraron sitios validos»
      }
      for (const m of era.minerales ?? []) exigir(RECURSO_DE[m.mineral] && facciones.some(x => x.id === m.faccion) && entero(m.cantidad, 1, 24), 'solicitud_invalida');
      const vel = opciones.velocidad ?? 'x5';
      exigir(VELOCIDADES.includes(vel), 'solicitud_invalida');
      rng = crearRng(semilla); escenarioN++;
      const facs = facciones.map(x => {
        const m = (era.minerales ?? []).find(y => y.faccion === x.id);
        const nueva = { id: x.id, especie: x.especie ?? 'human', bioma: era.biomas?.[x.id] ?? null, mineral: m?.mineral ?? null, depositos: m?.cantidad ?? 0, pob: opciones.unidades_iniciales ?? 4, vivo: true, reinos: 1, originalVivo: true,
          almacen: Object.fromEntries(Object.values(RECURSO_DE).concat('wood', 'leather').map(k => [k, 0])), rasgos: Object.fromEntries(TIPOS.map(t => [t, [...(sim.presentes?.[x.id]?.[t] ?? [])]])), propios: Object.fromEntries(TIPOS.map(t => [t, []])), creadas: 0, poderes: 0, donado: 0, mant: {} };
        recalcular(nueva); return nueva;
      });
      mundo = { semilla, facs, t: 0, tReal: 0, vel, muro: era.muro != null, guerra: false, eventos: [], leyes: era.leyes ?? {}, edad: era.edad ?? 'age_hope' };
      evento('era_iniciada', { facciones: 2, muro: mundo.muro, espejo: true });
      if (mundo.muro) evento('muro_puesto');
      const mundoInfo = { ancho: 192, alto: 192, plantilla: opciones.plantilla ?? 'continent', tamano: 'small', velocidad: vel, unidades_iniciales: opciones.unidades_iniciales ?? 4 };
      return { escenario_id: `era-sim-${escenarioN}`, hash_mundo: hash({ semilla, escenarioN, razas: facs.map(x => x.especie) }), semilla_usada: semilla, mundo: mundoInfo,
        facciones: facs.map(x => ({ id: x.id, especie: x.especie, calidad_sitio: 400 })), era: { preparacion: { espejo: { diferencias_restantes: 0 }, biomas: era.biomas ?? {}, muro: era.muro ?? null, depositos: facs.map(x => ({ faccion: x.id, mineral: x.mineral, cantidad: x.depositos })) } } };
    },
    async observar(id) { const x = f(id); return { origen: 'simulado', turno_juego: Math.floor(mundo.t / 60), tiempo_juego_s: mundo.t, faccion: resumen(x), rivales: mundo.facs.filter(y => y.id !== id).map(resumen), mundo: { tamano_mapa: 576, libres: 100 } }; },
    async ejecutar({ faccion, accion, parametros }) {
      const x = f(faccion);
      if (!x.vivo) return { resultado: 'rechazada', codigo: 'eliminado' };
      const objetivo = () => mundo.facs.find(y => y.id === parametros.objetivo && y.id !== x.id && y.vivo);
      if (accion === 'crear_unidades') {
        const n = Math.min(parametros.cantidad, 10 - x.creadas); x.creadas += n; x.pob += n; recalcular(x);
        return { resultado: n > 0 ? 'ejecutada' : 'sin_efecto', codigo: n === parametros.cantidad ? 'ok' : 'parcial', efecto: { pedidas: parametros.cantidad, creadas: n } };
      }
      if (accion === 'donar_recursos') { x.donado += parametros.cantidad; x.almacen[parametros.recurso] = (x.almacen[parametros.recurso] ?? 0) + parametros.cantidad; return { resultado: 'ejecutada', codigo: 'ok', efecto: { donados: parametros.cantidad } }; }
      if (accion === 'bendecir') { x.poderes++; x.pob += parametros.gotas; recalcular(x); return { resultado: 'ejecutada', codigo: 'ok', efecto: { gotas: parametros.gotas } }; }
      if (accion === 'maldecir' || accion === 'incendiar') {
        const o = objetivo(); if (!o) return { resultado: 'rechazada', codigo: 'objetivo_invalido' };
        x.poderes++; o.pob = Math.max(1, o.pob - parametros.gotas * 2); recalcular(o); return { resultado: 'ejecutada', codigo: 'ok', efecto: { gotas: parametros.gotas } };
      }
      if (accion === 'declarar_guerra') {
        const o = objetivo(); if (!o) return { resultado: 'rechazada', codigo: 'objetivo_invalido' };
        if (mundo.guerra) return { resultado: 'rechazada', codigo: 'ya_en_guerra' };
        mundo.guerra = true; evento('guerra_declarada', { faccion_a: x.id, faccion_b: o.id, guerra_civil: false });
        return { resultado: 'ejecutada', codigo: 'ok', efecto: { objetivo: o.id, en_guerra_despues: true } };
      }
      if (accion === 'pedir_paz') { if (!mundo.guerra) return { resultado: 'rechazada', codigo: 'sin_guerra' }; mundo.guerra = false; evento('guerra_terminada', { clave: `${x.id}-paz` }); return { resultado: 'ejecutada', codigo: 'ok' }; }
      return { resultado: 'rechazada', codigo: 'accion_desconocida' };
    },
    async avanzar({ segundos_juego = 60 } = {}) {
      listo(); exigir(Number.isFinite(segundos_juego) && segundos_juego > 0 && segundos_juego <= 120);
      const factor = Number(/^x(\d+)$/.exec(mundo.vel)[1]);
      mundo.tReal += segundos_juego / (1.2 * factor);
      const fin = mundo.t + segundos_juego;
      while (Math.floor(fin / 60) > Math.floor(mundo.t / 60) && vivas().length > 1) pasoAnio();
      mundo.t = Math.max(mundo.t, fin);
      return { tiempo_juego_s: mundo.t, terminal: vivas().length <= 1 };
    },
    async estadoTerminal() { listo(); const terminal = vivas().length <= 1; return { terminal, razon: terminal ? 'supervivencia' : 'ninguna', resumen_por_faccion: mundo.facs.map(resumen) }; },
    async cerrar() { mundo = null; return { cerrado: true }; },
    async camara() { return { hecho: true }; },
    async interfaz() { return { hecho: true }; },
    era: {
      async estado(desde = 0) { return normalizarEstadoEra(this._crudo.estado(desde)); },
      // Respuestas CRUDAS con la forma exacta del puente (las usa el servidor falso de las pruebas HTTP).
      _crudo: {
      estado(desde = 0) {
        listo();
        const civs = mundo.facs.map(x => ({ faccion: x.id, especie: x.especie, vivo: x.vivo, poblacion: x.pob, ciudades: x.ciudades, territorio: x.territorio, ejercito: x.ejercito, edificios: x.edificios, almacen: copiar(x.almacen),
          rey: {}, reinos: Array.from({ length: x.reinos }, (_, i) => ({ nombre: `Reino ${x.id}${i}`, id: i, vivo: x.vivo && (i > 0 || x.originalVivo), original: i === 0, poblacion: i === 0 ? x.pob : 0 })), rasgos_era: copiar(x.propios),
          rasgos_mantenidos: Object.fromEntries(Object.entries(x.mant).map(([t, l]) => [t, l.map(d => copiar(d))])) }));
        return ({ hay_era: true, version: 1, anio: anio(), tiempo_juego_s: mundo.t, tiempo_real_s: mundo.tReal, edad: { id: mundo.edad, pausada: true }, muro: { puesto: mundo.muro }, civilizaciones: civs, reinos_sin_origen: [],
          leyes: mundo.leyes, eventos: mundo.eventos.filter(e => e.i >= desde), siguiente_evento: mundo.eventos.length, depositos: mundo.facs.map(x => ({ faccion: x.id, mineral: x.mineral, colocado: true, presente: x.depositos > 0 })),
          mantenimiento: { ...(mundo.mantCuenta ?? { perdidas: 0, reaplicaciones: 0, aplicados_tarde: 0, comprobaciones: 0 }), deseados_activos: mundo.facs.reduce((s, x) => s + Object.values(x.mant).flat().filter(d => d.estado === 'activo').length, 0),
            deseados_pendientes: mundo.facs.reduce((s, x) => s + Object.values(x.mant).flat().filter(d => d.estado !== 'activo').length, 0) } });
      } },
      async rasgos(datos) { return normalizarRespuestaRasgos(this._rasgosCrudo(datos)); },
      _rasgosCrudo({ faccion, tipo, agregar = [], quitar = [], soltar = [], reemplazar = false, parcial = false, mantener: mant = false }) {
        const x = validarTipoFaccion(f(faccion), tipo);
        exigir(agregar.length + quitar.length <= 12, 'solicitud_invalida');
        const soltados = soltar.filter(id => { const l = registroMant(x, tipo), i = l.findIndex(d => d.id === id); if (i >= 0) l.splice(i, 1); return i >= 0; });
        const cat = CATALOGO_ERA.rasgos.filter(r => r.tipo === tipo), tiene = new Set(x.rasgos[tipo]), propios = x.propios[tipo];
        const rechazados = [], aplicar = [], quitarOk = [], pendientes = [], dePresente = [];
        const aQuitar = [...quitar, ...(reemplazar ? propios.filter(p => !quitar.includes(p)) : [])];
        for (const id of aQuitar) { if (!tiene.has(id)) { if (!reemplazar || quitar.includes(id)) rechazados.push({ id, codigo: 'no_presente', mensaje: 'El rasgo no esta en la faccion.' }); continue; } quitarOk.push(id); }
        const despues = new Set([...tiene].filter(id => !quitarOk.includes(id)));
        let propiosDespues = propios.length - quitarOk.filter(id => propios.includes(id)).length + registroMant(x, tipo).filter(d => d.estado !== 'activo' && !propios.includes(d.id)).length;
        for (const id of agregar) {
          const r = cat.find(y => y.id === id);
          if (!r) { rechazados.push({ id, codigo: 'rasgo_desconocido', mensaje: 'No existe en el catalogo de este tipo.' }); continue; }
          if (!r.ofrecible) { rechazados.push({ id, codigo: 'rasgo_no_ofrecido', mensaje: 'No se ofrece.' }); continue; }
          if (aplicar.includes(id)) { rechazados.push({ id, codigo: 'repetido', mensaje: 'Repetido.' }); continue; }
          if (despues.has(id)) { if (mant) dePresente.push(id); else rechazados.push({ id, codigo: 'ya_presente', mensaje: 'La faccion ya lo tiene.' }); continue; }
          const choque = r.opuestos.find(o => despues.has(o) || aplicar.includes(o));
          if (choque) { rechazados.push({ id, codigo: 'rasgo_opuesto', mensaje: `Opuesto a ${choque}.` }); continue; }
          if (propiosDespues + aplicar.length + 1 > TOPE) { rechazados.push({ id, codigo: 'tope_rasgos', mensaje: `Tope de ${TOPE}.` }); continue; }
          aplicar.push(id);
        }
        const seAplica = rechazados.length === 0 || (parcial && aplicar.length + quitarOk.length + dePresente.length > 0);
        let resultado = 'rechazada';
        if (seAplica) {
          for (const id of quitarOk) { x.rasgos[tipo] = x.rasgos[tipo].filter(y => y !== id); x.propios[tipo] = x.propios[tipo].filter(y => y !== id); const l = registroMant(x, tipo), i = l.findIndex(d => d.id === id); if (i >= 0) l.splice(i, 1); }
          const existe = existeObjeto(tipo), puestos = [];
          for (const id of aplicar) {
            if (existe) { x.rasgos[tipo].push(id); x.propios[tipo].push(id); puestos.push(id); if (mant) registroMant(x, tipo).push({ id, estado: 'activo', perdidas: 0, reaplicaciones: 0 }); }
            else if (mant) { registroMant(x, tipo).push({ id, estado: 'pendiente', perdidas: 0, reaplicaciones: 0, motivo: 'objeto_ausente' }); pendientes.push({ id, codigo: 'objeto_ausente', mensaje: 'El reino aun no tiene este objeto.' }); }
            else rechazados.push({ id, codigo: 'no_aplicado', mensaje: 'El juego no aplico el rasgo.' });
          }
          for (const id of dePresente) { puestos.push(id); if (!x.propios[tipo].includes(id)) x.propios[tipo].push(id); registroMant(x, tipo).push({ id, estado: 'activo', perdidas: 0, reaplicaciones: 0 }); }
          aplicar.length = 0; aplicar.push(...puestos);
          resultado = rechazados.length === 0 && pendientes.length === 0 ? 'ejecutada' : (aplicar.length + quitarOk.length + pendientes.length > 0 ? 'parcial' : 'rechazada');
          evento('rasgos_aplicados', { faccion: x.id, categoria: tipo, cantidad: aplicar.length });
        }
        return { resultado, tipo, faccion, aplicados: seAplica ? aplicar : [], quitados: seAplica ? quitarOk : [], rechazados, pendientes, soltados, tope: TOPE, mantener: mant };
      },
      async muro({ operacion }) { listo(); exigir(['quitar', 'poner'].includes(operacion)); mundo.muro = operacion === 'poner'; evento(mundo.muro ? 'muro_puesto' : 'muro_quitado'); return { muro_puesto: mundo.muro }; },
      async velocidad({ velocidad }) { listo(); exigir(VELOCIDADES.includes(velocidad)); const anterior = mundo.vel; mundo.vel = velocidad; evento('velocidad_cambiada', { de: anterior, a: velocidad }); return { velocidad }; },
    },
    // Solo pruebas: inspeccion del mundo simulado.
    _mundo: () => mundo,
  };
}
