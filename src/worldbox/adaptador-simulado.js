import { crearRng } from '../rng.js';
import { CATALOGO, validarAccion } from './contrato-acciones.js';
import { copiar, exigir, entero, hash, PROTOCOLO, RULES_VERSION, SEMILLA_MAX } from './util.js';
import { construirObservacion } from './observacion.js';

export function crearAdaptadorSimulado() {
  let mundo, rng, puntos = {}, maxPuntos = 3;
  const listo = () => exigir(mundo, 'no_listo');
  const libres = () => mundo.tamano_mapa - mundo.facciones.reduce((s, f) => s + f.territorio, 0);
  const buscar = id => { listo(); const f = mundo.facciones.find(f => f.id === id); exigir(f, 'solicitud_invalida'); return f; };
  return {
    async info() { return { protocolo: PROTOCOLO, origen: 'simulado', puente: { nombre: 'simulador', version: RULES_VERSION }, juego: { nombre: 'Auge de reinos (simulado)', version: RULES_VERSION }, estado: 'listo',
      capacidades: { reiniciar: true, semilla: true, avanzar: true, terminal: true, multi_faccion: true },
      acciones: copiar(CATALOGO.acciones.map(a => ({ ...a, verificada: true }))), limites: { max_segundos_avance: 1, max_acciones_por_turno: 10 } }; },
    async reiniciarEscenario({ semilla, tamano_mapa = 64, facciones, opciones = {} }) {
      exigir(entero(semilla, 0, SEMILLA_MAX) && entero(tamano_mapa, 12, 10000) && Array.isArray(facciones) && entero(facciones.length, 2, 4));
      exigir(facciones.every(f => f && typeof f.id === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(f.id)) && new Set(facciones.map(f => f.id)).size === facciones.length);
      // Puntos de accion por turno: `puntos_por_turno` si el orquestador lo envia; si no, el tope de acciones.
      const puntosTurno = opciones.puntos_por_turno ?? opciones.max_acciones ?? 3;
      exigir(entero(puntosTurno, 1, 10));
      // Todo validado: recien ahora se toca el estado (un reinicio fallido no deja nada a medias).
      maxPuntos = puntosTurno;
      rng = crearRng(semilla); puntos = {};
      mundo = { origen: 'simulado', semilla, tamano_mapa, turno_juego: 0, tiempo_juego_s: 0,
        facciones: facciones.map(f => ({ id: f.id, vivo: true, poblacion: 20, ciudades: 1, territorio: 3, recursos: 20, objetivos: 0, cooldowns: {} })) };
      return { escenario_id: `simulado-${semilla}`, hash_mundo: hash(mundo), semilla_usada: semilla, facciones: copiar(mundo.facciones) };
    },
    async observar(id) {
      const f = buscar(id);
      return construirObservacion({ ...mundo, faccion: f, rivales: mundo.facciones.filter(r => r.id !== id), mundo: { tamano_mapa: mundo.tamano_mapa, libres: libres() } }).observation;
    },
    async ejecutar({ faccion, accion, parametros }) {
      const f = buscar(faccion), turno = mundo.turno_juego + 1;
      const v = validarAccion({ action: accion, parameters: parametros }, { acciones: CATALOGO.acciones, turno, cooldowns: f.cooldowns, puntos: puntos[faccion] ?? maxPuntos });
      const rechazar = codigo => ({ resultado: 'rechazada', codigo });
      if (!v.ok) return rechazar(v.error);
      if (!f.vivo) return rechazar('eliminado');
      const costos = { esperar: 0, recolectar: 0, expandir: 6 * parametros.cantidad, fundar: 15, reclutar: 5, atacar: 8 };
      if (f.recursos < costos[accion]) return rechazar('recursos_insuficientes');
      if (accion === 'expandir' && libres() < parametros.cantidad) return rechazar('sin_territorio');
      if (accion === 'fundar' && f.territorio <= f.ciudades) return rechazar('sin_territorio');
      const rival = accion === 'atacar' ? mundo.facciones.find(r => r.id === parametros.objetivo && r.id !== f.id && r.vivo) : null;
      if (accion === 'atacar' && (!rival || f.poblacion < 5)) return rechazar('objetivo_invalido');
      f.recursos -= costos[accion];
      if (accion === 'recolectar') f.recursos += 8;
      if (accion === 'expandir') f.territorio += parametros.cantidad;
      if (accion === 'fundar') { f.ciudades++; f.objetivos++; }
      if (accion === 'reclutar') f.poblacion += 3;
      if (accion === 'atacar') {
        f.poblacion -= 2; rival.poblacion = Math.max(0, rival.poblacion - 4);
        if (rival.poblacion === 0) { rival.vivo = false; rival.ciudades = 0; rival.territorio = 0; }
      }
      puntos[faccion] = (puntos[faccion] ?? maxPuntos) - v.regla.puntos;
      if (v.regla.cooldown) f.cooldowns[accion] = turno + v.regla.cooldown + 1;
      return { resultado: accion === 'esperar' ? 'sin_efecto' : 'ejecutada', codigo: 'ok' };
    },
    async avanzar({ segundos_juego = 1 } = {}) {
      listo(); exigir(segundos_juego === 1);
      // Un evento compartido; todas las facciones vivas reciben el mismo cambio.
      const evento = Math.floor(rng() * 3) - 1;
      for (const f of mundo.facciones.filter(f => f.vivo)) {
        f.recursos = Math.max(0, f.recursos + 2 * f.ciudades + f.territorio + 2 * evento);
        f.poblacion += f.ciudades;
      }
      mundo.turno_juego++; mundo.tiempo_juego_s++; puntos = {};
      return { tiempo_juego_s: mundo.tiempo_juego_s, terminal: mundo.facciones.filter(f => f.vivo).length <= 1 };
    },
    async estadoTerminal() { listo(); const terminal = mundo.facciones.filter(f => f.vivo).length <= 1;
      return { terminal, razon: terminal ? 'supervivencia' : 'ninguna', resumen_por_faccion: copiar(mundo.facciones) }; },
    async cerrar() { mundo = null; return { cerrado: true }; },
  };
}
