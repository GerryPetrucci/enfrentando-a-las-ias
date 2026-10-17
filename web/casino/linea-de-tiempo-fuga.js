// Linea de tiempo de la escena de La Fuga (sala de control con camaras de vigilancia): convierte los registros guardados de una partida (uno por situacion, 9 como maximo) en BEATS,
// lo que se ve y se dice en orden. La mesa (mesa-fuga.js) los ejecuta; aqui no se decide nada que el motor no haya registrado.
//
// Un beat: { id, mano, tipo, registro, asiento, camara, texto, lineas, minMs, reemplazo, pasos }   (mano es el numero de situacion: asi se llama la unidad de un clip en todas las escenas)
//   tipo      apertura | decisiones | verdad | resultado | consecuencia (solo si la situacion trae alguna) | final
//   camara    siempre vacia: aqui no hay camara oculta (lo que el publico ve y las IAs no son la alarma, la cohesion y el riesgo real de cada paso)
//   reemplazo alguna jugada de ese beat la puso el juego por una respuesta ilegible (la linea ya no se la atribuye a la IA)
//   pasos     los movimientos de la animacion (vocabulario fijado en el plan, tarea E1):
//     estado {alarma, cohesion, puntos[], libres[], heridas[], salieron[]}  (libres: sigue en el cuadro; salieron: escapo por su cuenta; libre=false y salio=false: capturado)
//     armar {situacion, fase, titulo, corto}  · decidir {jugadas[{postura, metodo}|null], promesasRotas[], mensajes[], razones[], reemplazadas[], ilegibles[]}
//     riesgo {fallo[], pistaFiable, mejorMetodo} · actuar {asiento, resultado: 'limpio'|'tropezo'|'cayo', sale}
//     tentacion {clase: 'botin'|'oferta', tomo, delataron[], objeto?} · medidor {alarma, cohesion} · final {final, finales[], bono[], perdidos[], puntos[]}
//
// Las decisiones de los dos salen TODAS JUNTAS en su beat (nunca antes; y sin decir quien quiere la tentacion). La alarma, la cohesion y los puntos de DESPUES llegan en el ultimo beat de la
// situacion, no en el resultado: la alarma sube con el botin y la cohesion baja con la oferta aceptada, y eso no se sabe hasta la consecuencia. Una partida cortada no inventa final.
// Sin DOM ni `window`: lo importan la mesa (navegador), el generador de voz y las pruebas (Node).

import { nombrar, duracion } from './linea-comun.js';

export const RONDAS_TOPE = 9; // el tope de situaciones del motor (RONDAS en src/juegos/fuga/constantes.js): una prueba los compara
export const JUGADORES_TOPE = 2;
export const CAMARA_POR_DEFECTO = 0;
export const MIN_MS = { apertura: 2600, decisiones: 3800, verdad: 3400, resultado: 3800, consecuencia: 3000, final: 9000 };
// Lo que vale cada final (PUNTOS en src/juegos/fuga/constantes.js; una prueba los compara). La escena final los muestra y marca el que se cumplio.
export const REGLA_OCULTA = { conjunto: 10, solo: 7, abandonado: 9, anticipada: 7, capturado: 0 };

export const ALARMA_MAX = 5; // ALARMA_MAX y COHESION_MAX del motor (una prueba los compara)
export const COHESION_MAX = 3;
const NIVELES = ['tranquila', 'tranquila', 'inquieta', 'en alerta', 'en alerta', 'desatada']; // NIVELES_ALERTA del motor
const SEATS = [0, 1];

// Si la jugada de un asiento la puso el juego (postura o metodo ilegibles: el motor pone "avanzar con sigilo"), la linea no dice que la eligio: "X ayuda..." pasa a decir que la puso el juego.
function sinAtribuir(linea, reemplazadas) {
  const m = linea.tipo === 'decision' ? /^\{([01])\} (.+)$/.exec(linea.texto) : null;
  if (m && reemplazadas[Number(m[1])]) return { ...linea, texto: `El juego elige por {${m[1]}}: ${m[2]}` };
  return linea;
}

export function construirLineaDeTiempo(partida) {
  const rondas = Array.isArray(partida?.rondas) ? partida.rondas : [];
  if (!rondas.length) return [];
  const beats = [];
  let puntos = [0, 0], heridas = [0, 0], salieron = [false, false]; // lo de antes de la situacion en curso

  rondas.forEach((r, i) => {
    const reemplazadas = SEATS.map((s) => r.invalidas?.[s] === true);
    const lineasDe = (...tipos) => (r.narracion ?? []).filter((l) => tipos.includes(l.tipo));
    const crear = (tipo, { lineas = [], pasos = [], reemplazo = false } = {}) => {
      const dichas = lineas.map((l) => sinAtribuir(l, reemplazadas)).map((l) => ({ tipo: l.tipo, texto: nombrar(l.texto, partida.jugadores) }));
      const texto = dichas.map((l) => l.texto).join(' ');
      beats.push({ id: `r${r.ronda}-${beats.length}-${tipo}`, mano: r.ronda, tipo, registro: i, asiento: null, camara: [], texto, lineas: dichas, minMs: duracion(MIN_MS[tipo], texto), reemplazo, pasos });
    };
    const jugadas = Array.isArray(r.jugadas) ? r.jugadas : [null, null];
    const resultados = Array.isArray(r.resultados) ? r.resultados : [null, null];
    const salen = SEATS.map((s) => r.salieron?.[s] === true);
    const libresAntes = SEATS.map((s) => jugadas[s] !== null && jugadas[s] !== undefined);

    // lo que deja la situacion (igual que el motor: tropiezo = una herida mas; la oferta aceptada agrava a quien ya venia herido)
    const heridasDespues = [...heridas];
    SEATS.forEach((s) => { if (resultados[s] === 'tropezo') heridasDespues[s]++; });
    for (const d of r.tentacion?.delataron ?? []) if (heridas[1 - d] > 0) heridasDespues[1 - d]++;
    const salieronDespues = SEATS.map((s) => salieron[s] || salen[s]);
    // el ultimo registro ya trae sumado el final (bonos) y descontado lo que pierden los capturados: la situacion se muestra con lo de antes de eso
    const puntosDespues = r.final ? r.puntosAcumulados.map((v, s) => v - r.final.bono[s] + r.final.perdidos[s]) : [...(r.puntosAcumulados ?? puntos)];
    const estadoAntes = { tipo: 'estado', alarma: r.oculto?.alarmaAntes ?? 0, cohesion: r.oculto?.cohesionAntes ?? 0, puntos: [...puntos], libres: libresAntes, heridas: [...heridas], salieron: [...salieron] };
    const estadoDespues = { tipo: 'estado', alarma: r.oculto?.alarma ?? 0, cohesion: r.oculto?.cohesion ?? 0, puntos: puntosDespues, libres: SEATS.map((s) => libresAntes[s] && resultados[s] !== 'cayo' && !salen[s]), heridas: heridasDespues, salieron: salieronDespues };
    const medidor = { tipo: 'medidor', alarma: estadoDespues.alarma, cohesion: estadoDespues.cohesion };

    crear('apertura', { lineas: lineasDe('apertura'), pasos: [{ tipo: 'armar', situacion: r.situacion?.id ?? null, fase: r.situacion?.fase ?? null, titulo: r.situacion?.titulo ?? '', corto: r.situacion?.corto ?? '' }, estadoAntes] });
    crear('decisiones', {
      lineas: lineasDe('decision'), reemplazo: reemplazadas.some(Boolean),
      pasos: [{
        tipo: 'decidir',
        jugadas: jugadas.map((j) => (j ? { postura: j.postura, metodo: j.metodo } : null)),
        promesasRotas: SEATS.map((s) => r.promesaRota?.[s] === true),
        mensajes: SEATS.map((s) => r.mensajes?.[s] ?? null),
        razones: SEATS.map((s) => r.razones?.[s] ?? null),
        reemplazadas,
        ilegibles: SEATS.map((s) => r.ilegibles?.[s] ?? []),
      }],
    });
    crear('verdad', { lineas: lineasDe('verdad'), pasos: [{ tipo: 'riesgo', fallo: r.oculto?.fallo ?? [null, null], pistaFiable: r.oculto?.pistaFiable ?? null, mejorMetodo: r.oculto?.mejorMetodo ?? null }] });
    const consecuencias = lineasDe('consecuencia');
    const actuar = SEATS.filter((s) => libresAntes[s]).map((s) => ({ tipo: 'actuar', asiento: s, resultado: resultados[s], sale: salen[s] }));
    crear('resultado', { lineas: lineasDe('resultado'), pasos: consecuencias.length ? actuar : [...actuar, medidor, estadoDespues] });
    if (consecuencias.length) crear('consecuencia', { lineas: consecuencias, pasos: [...(r.tentacion ? [{ tipo: 'tentacion', clase: r.tentacion.tipo, tomo: r.tentacion.tomo, delataron: r.tentacion.delataron, ...(r.tentacion.objeto ? { objeto: r.tentacion.objeto } : {}) }] : []), medidor, estadoDespues] });

    puntos = puntosDespues; heridas = heridasDespues; salieron = salieronDespues;
  });

  // El final solo existe si la partida termino: una partida cortada se reproduce hasta donde llego, sin final inventado.
  const ultimo = rondas.at(-1);
  if (partida.truncada !== true && Array.isArray(partida.epilogo) && partida.epilogo.length && ultimo.final) {
    const lineas = partida.epilogo.map((l) => ({ tipo: l.tipo, texto: nombrar(l.texto, partida.jugadores) }));
    const texto = lineas.map((l) => l.texto).join(' ');
    beats.push({
      id: `final-${beats.length}`, mano: ultimo.ronda, tipo: 'final', registro: rondas.length - 1, asiento: null, camara: [], texto, lineas, minMs: duracion(MIN_MS.final, texto), reemplazo: false,
      pasos: [{ tipo: 'final', final: ultimo.final, finales: ultimo.final.finales, bono: ultimo.final.bono, perdidos: ultimo.final.perdidos, puntos: partida.puntos ?? ultimo.puntosAcumulados ?? null }],
    });
  }
  return beats;
}

// ---- Lo que escribe la escena (etiquetas, sellos, avisos): vocabulario suave, nunca delatar, abandonar ni traicion ----
export const nivelDeAlerta = (alarma) => NIVELES[Number.isFinite(alarma) ? Math.max(0, Math.min(ALARMA_MAX, Math.trunc(alarma))) : 0];

const POSTURA_TEXTO = { ayudar: 'Ayudar', avanzar: 'Avanzar', sacrificarse: 'Sacrificarse', separarse: 'Por su cuenta' };
const METODO_TEXTO = { sigilo: 'Sigilo', fuerza: 'Fuerza', engano: 'Engaño', esperar: 'Esperar' };
const CAMPO_TEXTO = { promesa: 'promesa', aprovechar: 'tentación' };

// El sello que cada camara pone sobre la decision: "Ayudar · Engaño". Una jugada que puso el juego lo dice (nunca se le atribuye a la IA) y un campo escrito pero ilegible se anota.
export function textoDeSello(jugada, { reemplazada = false, ilegibles = [] } = {}) {
  const p = POSTURA_TEXTO[jugada?.postura], m = METODO_TEXTO[jugada?.metodo];
  if (!p || !m) return '';
  const base = reemplazada ? `Jugada del juego: ${p} · ${m}` : `${p} · ${m}`;
  const campos = (Array.isArray(ilegibles) ? ilegibles : []).map((c) => CAMPO_TEXTO[c]).filter(Boolean);
  return campos.length ? `${base} · ${campos.join(' y ')} ${campos.length > 1 ? 'ilegibles' : 'ilegible'}` : base;
}

// La hora que marca la camara: una funcion PURA del beat (nunca el reloj del equipo): cada situacion avanza 47 s y cada beat suma lo suyo.
const SEGUNDOS_DE_BEAT = { apertura: 0, decisiones: 9, verdad: 18, resultado: 27, consecuencia: 36, final: 45 };
export function horaDeBeat(beat) {
  const mano = Number.isInteger(beat?.mano) && beat.mano >= 1 ? beat.mano : 1;
  const total = 3 * 3600 + 12 * 60 + (mano - 1) * 47 + (SEGUNDOS_DE_BEAT[beat?.tipo] ?? 0);
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(Math.floor(total / 3600) % 24)}:${dos(Math.floor(total / 60) % 60)}:${dos(total % 60)}`;
}

export const textoDeRiesgo = (fallo) => (Number.isFinite(fallo) ? `Riesgo real ${Math.round(fallo * 100)} %` : '');

// Los avisos de la tentacion (solo se muestran en el beat de la consecuencia): el botin en el cuadro de quien lo toma; la oferta aceptada en el cuadro del OTRO.
export function avisosDeTentacion(t, nombre) {
  if (!t || typeof t !== 'object') return [];
  if (t.clase === 'botin' && Number.isInteger(t.tomo)) return [{ asiento: t.tomo, clase: 'botin', texto: `Se queda con ${t.objeto ?? 'el botín'}` }];
  if (t.clase === 'oferta' && Array.isArray(t.delataron)) return t.delataron.map((d) => ({ asiento: 1 - d, clase: 'oferta', texto: `${nombre(d)} aceptó la oferta del guardia` }));
  return [];
}

// La linea de cada prisionero en la escena de la regla oculta: lo que ocurrio y lo que valio (lo lee de final.finales y final.bono; no calcula ningun "habria pasado").
const FIN_TEXTO = { conjunto: 'escapa junto a su compañero', solo: 'escapa solo', abandonado: 'se quedó atrás y aun así escapa', anticipada: 'escapa por su cuenta a mitad de camino', capturado: 'queda capturado' };
export const textoDeFichaFinal = (final, puntos, nombre, asiento) => `${nombre(asiento)} ${FIN_TEXTO[final] ?? 'termina la partida'}: ${puntos} ${puntos === 1 ? 'punto' : 'puntos'}`;

// Las cuatro reglas fijas de puntaje que la escena final revela (lo que ninguno sabia), cada una con las IAs a las que les toco segun final.finales. Quien escapo por su cuenta a mitad de camino
// cobra como quien escapa solo. Lo que se muestra es lo que se cobro (una prueba lo compara con final.bono); no se calcula ningun "habria pasado".
const FILAS_REGLA = [
  { clave: 'conjunto', texto: 'Escapan los dos juntos', finales: ['conjunto'] },
  { clave: 'solo', texto: 'Uno escapa solo o por su cuenta', finales: ['solo', 'anticipada'] },
  { clave: 'abandonado', texto: 'Se queda atrás y aun así escapa', finales: ['abandonado'] },
  { clave: 'capturado', texto: 'Queda capturado', finales: ['capturado'] },
];
export function reglasDeFinal(finales) {
  const lista = Array.isArray(finales) ? finales : [];
  return FILAS_REGLA.map((f) => ({ clave: f.clave, texto: f.texto, puntos: REGLA_OCULTA[f.clave], cumplen: SEATS.filter((s) => f.finales.includes(lista[s])) }));
}

// ---- Que situaciones valen la pena para un clip de redes ---------------------------------------------------------------------------------------
// Cada situacion suma puntos por lo que paso en ella (todo sale del registro y refleja lo que cuenta la narracion del motor). Los pesos son editoriales.
const PESOS = { final: 5, caida: 4, 'escape anticipado': 4, 'oferta aceptada': 4, 'promesa rota': 3, botin: 2 };

export function puntuarRondas(partida) {
  const rondas = Array.isArray(partida?.rondas) ? partida.rondas : [];
  return rondas.map((r, i) => {
    const motivos = [];
    if (r.resultados?.includes('cayo')) motivos.push('caida');
    if (r.salieron?.some(Boolean)) motivos.push('escape anticipado');
    if (r.tentacion?.tipo === 'oferta' && r.tentacion.delataron?.length) motivos.push('oferta aceptada');
    if (r.tentacion?.tipo === 'botin' && r.tentacion.tomo !== null && r.tentacion.tomo !== undefined) motivos.push('botin');
    if (r.promesaRota?.some(Boolean)) motivos.push('promesa rota');
    if (r.final) motivos.push('final');
    return { ronda: r.ronda, puntos: motivos.reduce((t, m) => t + PESOS[m], 0), motivos, registros: [i, i] };
  });
}

// Las n situaciones con mas puntos (empata la mas temprana), de mayor a menor.
export function mejoresRondas(partida, n) {
  if (!Number.isInteger(n) || n < 1) return [];
  return puntuarRondas(partida).sort((a, b) => b.puntos - a.puntos || a.ronda - b.ronda).slice(0, n);
}

// ---- Para la herramienta de capturas: comprobar que la escena no arrastra nada de una situacion a la siguiente ---------------------------------

// El comienzo de cada situacion desde la segunda (hasta `max` situaciones): en ese momento no debe quedar nada visible de la anterior.
export function beatsDeEstado(beats, max = 6) {
  if (!Array.isArray(beats)) return [];
  const situaciones = [...new Set(beats.map((b) => b.mano))].slice(1, 1 + max);
  return situaciones.map((m) => beats.findIndex((b) => b.mano === m && b.tipo === 'apertura')).filter((i) => i >= 0);
}

// Lo que la mesa informa de si misma al detenerse (data-estado): siluetas en los cuadros, sellos de decision, avisos, cuadros "SIN SEÑAL", cuadros "SALIDA" y el panel del final.
// Al empezar una situacion cada cuadro muestra lo que dice el estado de ese beat (quien sigue libre, quien cayo, quien salio) y nada de la situacion anterior.
export function erroresDeEstado(estado, beat) {
  if (!estado) return ['la escena no informo su estado (data-estado)'];
  const errores = [];
  const e = beat?.pasos?.find((p) => p.tipo === 'estado');
  if (e) {
    const libres = e.libres.filter(Boolean).length;
    const caidos = e.libres.filter((l, s) => !l && !e.salieron[s]).length;
    const salidos = e.salieron.filter(Boolean).length;
    if (estado.siluetas !== libres) errores.push(`siluetas: hay ${estado.siluetas} al empezar ${beat.id} y deben ser ${libres}`);
    if (estado.sinSenal !== caidos) errores.push(`sinSenal: hay ${estado.sinSenal} cuadros sin senal al empezar ${beat.id} y deben ser ${caidos}`);
    if (estado.salidas !== salidos) errores.push(`salidas: hay ${estado.salidas} cuadros con salida al empezar ${beat.id} y deben ser ${salidos}`);
  }
  if (estado.sellos > 0) errores.push(`sellos: quedan ${estado.sellos} sellos de decision visibles al empezar ${beat.id}: son de la situacion anterior`);
  if (estado.avisos > 0) errores.push(`avisos: queda ${estado.avisos} aviso visible al empezar ${beat.id}: es de la situacion anterior`);
  if (estado.panel > 0.01) errores.push(`panel: visible (${estado.panel}) al empezar ${beat.id}: es del final anterior`);
  return errores;
}
