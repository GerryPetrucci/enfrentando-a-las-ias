// Linea de tiempo de la escena de la Guerra de territorios: convierte los registros guardados de una partida (uno por turno) en BEATS, lo que se ve y se dice en orden. La mesa
// (mesa-conquista.js) los ejecuta; aqui no se decide ni se recalcula nada que el motor no haya registrado: las fuerzas de cada tarjeta son las de `registro.combates[].bandos`.
//
// Un beat: { id, mano, tipo, registro, asiento, camara, texto, lineas, dicho?, mudas?, minMs, reemplazo, pasos }   (mano es el numero de turno: asi se llama la unidad de un clip en todas las escenas)
//   tipo      apertura (solo el turno 1) | ordenes | traicion (una por ruptura del turno) | batalla (0 a 3, la de mayor importancia primero) | resolucion | final (solo si la partida termino)
//   camara    siempre vacia: no hay camara oculta (el publico lo ve todo); lo secreto (los mensajes privados) se RETRASA: se revela con la traicion, el pacto cumplido o el final
//   lineas    [{ tipo: 'hecho', texto, clave }]: los hechos los escribe el codigo y son siempre verdaderos; `clave` identifica el hecho (las pruebas cuentan que ninguno se pierda ni se repita)
//   dicho     (solo ordenes y resolucion) lo que de verdad se dice y se subtitula, elegido por narracion-conquista.js: [{ tipo: 'hecho' | 'comentario', texto, clave?, cubre?, datos? }]; un hecho de
//             `lineas` se dice, lo cubre una frase de contexto (`cubre`) o queda en `mudas` (claves de lo que no se dice: sigue en el feed). `texto` es `dicho` unido (lo que lee la voz); sin `dicho`, `lineas`.
//   reemplazo alguna respuesta de ese beat no se pudo leer (el reino pasa el turno: no es una decision de la IA)
//   pasos     (vocabulario fijado en el plan, tarea 4; lo que no esta aqui no suena ni se anima):
//     estado {dueno,tropas,fort,edif,dan,stock,armas,honor,vivo,pactos,maravilla,notas} (la foto del mapa: ordenes la lleva del INICIO del turno y resolucion del CIERRE)
//     mapa {bioma, regiones} (apertura) · flechas {lista:[{de,a,n,k,ataque}]} (todos los ataques y capturas mas los 5 movimientos de mas tropas, maximo 10)
//     mensajes {lista:[{k,texto}]} (publicos) · privados {pares:[{k,a}]} (SOLO quien le escribio a quien: el texto no sale hasta que toca)
//     cartel {k,contra,perdida,honorAntes,honorDespues} · flashback {de,a,turnoDelMensaje,texto} (el ultimo privado de quien rompe hacia su victima)
//     tarjeta {variante:'A'|'C',d,nombre,terr,fort,resultado,quedan,decisiva,motivos,diferencia,ganador,bandos,cubre}
//     conquistas {lista:[{k,contra,r,sinLucha}]} · pacto {k,con} · cumplido {k,con,textos:[{turno,k,a,texto}]} · feed {lista:[{icono,partes,alerta}]}
//     razones {lista:[{k,texto}]} (solo en la resolucion: salen junto a la consecuencia, nunca antes) · final {ranking,momentos,sinRevelar,ganoPorMaravilla,bioma}
//
// Sin DOM ni `window`: lo importan la mesa (navegador), el generador de voz y las pruebas (Node).

import { duracion } from './linea-comun.js';
import { TURNOS_TOPE, HONOR_ROTURA, NOMBRES_BIOMA, estadoInicial, leerMapa } from './conquista-datos.js';
import { crearNarrador } from './narracion-conquista.js';

export { TURNOS_TOPE };
export const JUGADORES_TOPE = 5;
export const CAMARA_POR_DEFECTO = 0;
// Tiempos minimos a velocidad 1 (sin voz): el turno tranquilo dura 2.5 s, el normal 5 s y el que tiene una batalla decisiva 7.5 s; la voz o la lectura lo alargan si hace falta.
export const MIN_MS = { apertura: 4000, ordenes: 1500, traicion: 4000, batalla: 2000, vs: 4500, resolucion: 1500, final: 8000 };
export const MOTIVOS = { diferencia: 'diferencia menor al 10 %', tres: 'tres bandos', capital: 'cae una capital', ruptura: 'ataque tras romper un pacto' };
const MAX_TARJETAS = 3, MAX_FLECHAS = 10, MAX_FLECHAS_QUE_NO_ATACAN = 5, MAX_SIN_REVELAR = 3, MOMENTOS_MAX = 6;

export const f2 = (n) => String(Math.round(Number(n) * 100) / 100);
export const tropas = (n) => `${n} ${n === 1 ? 'tropa' : 'tropas'}`;

// Cuanto duran el beat de ordenes y el de resolucion segun lo que pasa en el turno (el de cada batalla sale de MIN_MS.batalla o MIN_MS.vs).
export function ritmoDeTurno({ batallas = 0, actividad = false } = {}) {
  if (batallas > 0) return { ordenes: MIN_MS.ordenes, resolucion: MIN_MS.resolucion };
  return actividad ? { ordenes: 2000, resolucion: 3000 } : { ordenes: 1250, resolucion: 1250 };
}

// Una batalla es decisiva (pantalla VS) si: cae una capital, las dos fuerzas mas altas difieren menos del 10 %, hay tres o mas bandos, o el atacante rompio un pacto con el defensor ese turno.
export function esDecisiva(combate, { eventos = [], capitales = [] } = {}) {
  const bandos = Array.isArray(combate?.bandos) ? combate.bandos : [];
  const fuerzas = bandos.map((b) => b?.f).filter(Number.isFinite).sort((a, b) => b - a);
  const diferencia = fuerzas.length >= 2 && fuerzas[0] > 0 ? (fuerzas[0] - fuerzas[1]) / fuerzas[0] : null;
  const motivos = [];
  if (eventos.some((e) => e?.tipo === 'caida' && capitales[e.k] === combate.d && e.por === combate.k)) motivos.push(MOTIVOS.capital);
  if (diferencia !== null && diferencia < 0.10) motivos.push(MOTIVOS.diferencia);
  if (bandos.length >= 3) motivos.push(MOTIVOS.tres);
  if (eventos.some((e) => e?.tipo === 'ruptura' && bandos.some((b) => !b.defensor && b.k === e.k) && bandos.some((b) => b.defensor && b.k === e.contra))) motivos.push(MOTIVOS.ruptura);
  return { decisiva: motivos.length > 0, motivos, diferencia };
}

// Lo que se dice de una batalla, con las fuerzas del registro: "Ana (13.75) ataca R17 de Beto (13.5). Gana Ana: conquista R17 y le queda 1 tropa."
export function textoDeBatalla(combate, nombre, nombreDeRegion = (d) => `R${d + 1}`) {
  const bandos = combate?.bandos ?? [];
  const defensor = bandos.find((b) => b.defensor), atacantes = bandos.filter((b) => !b.defensor);
  const region = nombreDeRegion(combate.d);
  const unidos = atacantes.map((b) => `${nombre(b.k)} (${f2(b.f)})`);
  const quienes = unidos.length <= 1 ? unidos.join('') : `${unidos.slice(0, -1).join(', ')} y ${unidos.at(-1)}`;
  const inicio = defensor
    ? `${quienes} ${atacantes.length > 1 ? 'atacan' : 'ataca'} ${region} de ${nombre(defensor.k)} (${f2(defensor.f)}).`
    : `${quienes} se disputan ${region}, que no tiene dueño.`;
  const q = combate.quedan;
  if (combate.resultado === 'captura') return `${inicio} Gana ${nombre(combate.k)}: ${defensor ? 'conquista' : 'toma'} ${region} y le ${q === 1 ? 'queda' : 'quedan'} ${tropas(q)}.`;
  if (combate.resultado === 'repelido') return `${inicio} ${nombre(combate.k)} resiste y se queda con ${tropas(q)}.`;
  return defensor ? `${inicio} Empate de fuerzas: ${nombre(defensor.k)} resiste con ${tropas(q)}.` : `${inicio} Empate de fuerzas: nadie se queda con ${region}.`;
}

const claveDeEvento = (e) => `ev:${e.tipo}:${e.t}:${e.k}:${e.con ?? e.contra ?? e.por ?? e.de ?? ''}:${e.r ?? ''}`;

// Lo que se lee de un registro guardado puede venir roto (JSON editado a mano o de un motor anterior): de una lista solo valen sus objetos; de un estado, el que trae duenos y tropas.
const objetos = (x) => (Array.isArray(x) ? x.filter((e) => e && typeof e === 'object') : []);
const estadoLegible = (e) => e && typeof e === 'object' && Array.isArray(e.dueno) && Array.isArray(e.tropas);

export function construirLineaDeTiempo(partida, { camara } = {}) {
  void camara; // sin camara oculta
  const mapa = leerMapa(partida?.mapa), rondas = Array.isArray(partida?.rondas) ? partida.rondas : [];
  if (!mapa || !rondas.length || rondas.some((r) => !r || typeof r !== 'object')) return [];
  const nombre = (k) => partida.jugadores?.[k]?.nombre ?? `Jugador ${Number(k) + 1}`;
  const region = (d) => mapa.regs[d]?.nombre ?? `R${d + 1}`;
  const capitales = mapa.inicio.capitales;
  const beats = [];
  let previo = estadoInicial(partida);
  const privadosVistos = [], reveladas = new Set(), pactos = [];
  const idDe = (m) => `${m.turno}:${m.k}:${m.a}:${m.i}`;

  // `dicho` (opcional): lo que se dice si no son los hechos tal cual (el narrador lo elige); `mudas`: claves de hechos que no se dicen. `texto` es siempre lo que se dice.
  const crear = (turno, tipo, registro, { lineas = [], dicho = null, mudas = [], pasos = [], reemplazo = false, asiento = null, minMs = MIN_MS[tipo] } = {}) => {
    const hechos = lineas.map((l) => ({ tipo: 'hecho', texto: l.texto, clave: l.clave }));
    const habladas = dicho ? dicho.map((l) => ({ tipo: l.tipo, texto: l.texto, ...(l.clave ? { clave: l.clave } : {}), ...(l.cubre ? { cubre: l.cubre } : {}), ...(l.datos ? { datos: l.datos } : {}) })) : null;
    const texto = (habladas ?? hechos).map((l) => l.texto).join(' ');
    beats.push({ id: `t${turno}-${beats.length}-${tipo}`, mano: turno, tipo, registro, asiento, camara: [], texto, lineas: hechos, ...(habladas ? { dicho: habladas, mudas } : {}), minMs: duracion(minMs, texto), reemplazo, pasos });
  };
  const narrador = crearNarrador({ nombre, reinos: mapa.k });

  if (previo) {
    const ks = Array.from({ length: mapa.k }, (_, k) => nombre(k));
    crear(rondas[0].turno ?? 1, 'apertura', 0, {
      lineas: [{ texto: `Empieza la guerra: ${ks.join(', ')}. Mapa: ${NOMBRES_BIOMA[mapa.bioma] ?? NOMBRES_BIOMA.continente}.`, clave: 'apertura' }],
      pasos: [{ tipo: 'estado', ...previo }, { tipo: 'mapa', bioma: mapa.bioma, regiones: mapa.regs.length }],
    });
  }

  rondas.forEach((r, i) => {
    const turno = Number.isInteger(r.turno) ? r.turno : i + 1;
    const eventos = objetos(r.eventos), movs = objetos(r.movs);
    const combates = objetos(r.combates).filter((c) => Array.isArray(c.bandos) && c.bandos.every((b) => b && typeof b === 'object'));
    const mensajes = objetos(r.mensajes), privados = objetos(r.privados);
    const respuestas = Array.isArray(r.respuestas) ? r.respuestas : [];
    const antes = previo, despues = estadoLegible(r.estado) ? r.estado : previo;
    privados.forEach((m, n) => privadosVistos.push({ turno, k: m.k, a: m.a, texto: m.texto, i: n }));

    // ---- ordenes ----
    const flechasTodas = movs.map((m) => ({ de: m.f, a: m.d, n: m.n, k: m.k, ataque: antes?.dueno?.[m.d] !== m.k }));
    const ataques = flechasTodas.filter((f) => f.ataque).sort((a, b) => b.n - a.n || a.a - b.a).slice(0, MAX_FLECHAS);
    const otras = flechasTodas.filter((f) => !f.ataque).sort((a, b) => b.n - a.n || a.a - b.a).slice(0, Math.min(MAX_FLECHAS_QUE_NO_ATACAN, MAX_FLECHAS - ataques.length));
    const flechas = [...ataques, ...otras];
    const ilegibles = respuestas.flatMap((x, s) => (x && x.invalida === true ? [s] : []));
    const lineasOrdenes = [
      ...ataques.slice(0, 2).map((f) => ({ tipo: 'ataque', texto: `${nombre(f.k)} manda ${tropas(f.n)} de ${region(f.de)} a ${region(f.a)}.`, clave: `ord:${turno}:${f.k}:${f.de}:${f.a}` })),
      ...privados.slice(0, 2).map((m, n) => ({ tipo: 'privado', texto: `${nombre(m.k)} le escribe en privado a ${nombre(m.a)}.`, clave: `priv:${turno}:${m.k}:${m.a}:${n}` })),
      ...ilegibles.map((s) => ({ tipo: 'ilegible', texto: `${nombre(s)} no respondió bien: pasa el turno.`, clave: `ilegible:${turno}:${s}` })),
    ];
    // lo que se dice de las ordenes: el narrador resume los ataques (TODOS, no solo los 10 que se dibujan), cita un mensaje publico y deja literales los privados y los avisos
    const vivosAntes = Array.isArray(antes?.vivo) ? antes.vivo.filter((v) => v !== false).length : mapa.k;
    const narrado = narrador.ordenes({
      turno, literales: lineasOrdenes, mensajes, vivos: vivosAntes,
      ataques: flechasTodas.filter((f) => f.ataque).map((f) => ({ k: f.k, n: f.n, libre: antes?.dueno?.[f.a] === -1, contra: antes?.dueno?.[f.a] })),
    });
    const feedOrdenes = [
      ...mensajes.map((m) => ({ icono: 'msg', partes: [{ k: m.k }, `: «${m.texto}»`], alerta: false })),
      ...privados.map((m) => ({ icono: 'candado', partes: [{ k: m.k }, ' le escribió en privado a ', { k: m.a }], alerta: false })),
    ];
    const actividad = eventos.length > 0 || ataques.length > 0 || mensajes.length > 0 || privados.length > 0 || ilegibles.length > 0;
    const ritmo = ritmoDeTurno({ batallas: combates.length, actividad });
    crear(turno, 'ordenes', i, {
      lineas: [...lineasOrdenes, ...narrado.extras], dicho: narrado.dicho, mudas: narrado.mudas, reemplazo: ilegibles.length > 0, minMs: ritmo.ordenes,
      pasos: [
        { tipo: 'estado', ...(antes ?? {}) }, { tipo: 'flechas', lista: flechas }, { tipo: 'mensajes', lista: mensajes.map((m) => ({ k: m.k, texto: m.texto })) },
        { tipo: 'privados', pares: privados.map((m) => ({ k: m.k, a: m.a })) }, { tipo: 'feed', lista: feedOrdenes },
      ],
    });

    // ---- traiciones: una por ruptura, con el ultimo privado de quien rompe hacia su victima (se revela AQUI) ----
    for (const e of eventos.filter((x) => x.tipo === 'ruptura')) {
      const previoMensaje = privadosVistos.filter((m) => m.k === e.k && m.a === e.contra).at(-1);
      const lineas = [{ texto: `${nombre(e.k)} rompe su pacto con ${nombre(e.contra)} y pierde ${HONOR_ROTURA} de honor.`, clave: claveDeEvento(e) }];
      const pasosT = [{ tipo: 'cartel', k: e.k, contra: e.contra, perdida: HONOR_ROTURA, honorAntes: antes?.honor?.[e.k] ?? null, honorDespues: despues?.honor?.[e.k] ?? null }];
      if (previoMensaje) {
        reveladas.add(idDe(previoMensaje));
        lineas.push({ texto: `Turno ${previoMensaje.turno}, en privado, ${nombre(previoMensaje.k)} le escribió a ${nombre(previoMensaje.a)}: «${previoMensaje.texto}»`, clave: `flash:${turno}:${e.k}:${e.contra}` });
        pasosT.push({ tipo: 'flashback', de: e.k, a: e.contra, turnoDelMensaje: previoMensaje.turno, texto: previoMensaje.texto });
      }
      pasosT.push({ tipo: 'feed', lista: [{ icono: 'ruptura', partes: [{ k: e.k }, ' rompió su pacto con ', { k: e.contra }], alerta: true }] });
      crear(turno, 'traicion', i, { lineas, pasos: pasosT, asiento: e.k });
    }

    // ---- batallas: las 3 de mayor importancia (decisiva, luego con conquista, luego con mas tropas en juego, luego la de menor numero de region) ----
    const analisis = combates.map((c) => ({ c, ...esDecisiva(c, { eventos, capitales }) }));
    const importancia = (a) => [a.decisiva ? 1 : 0, a.c.resultado === 'captura' ? 1 : 0, a.c.bandos.reduce((s, b) => s + b.n, 0), -a.c.d];
    const mostradas = [...analisis].sort((a, b) => { const x = importancia(a), y = importancia(b); for (let n = 0; n < x.length; n++) if (x[n] !== y[n]) return y[n] - x[n]; return 0; }).slice(0, MAX_TARJETAS);
    const cubiertas = new Set();
    for (const a of mostradas) {
      const { c } = a;
      const cubre = eventos.filter((e) => (e.tipo === 'conquista' || e.tipo === 'repelido') && e.r === c.d);
      cubre.forEach((e) => cubiertas.add(e));
      const nombreDeRegion = region(c.d);
      const resumen = c.resultado === 'captura' ? { icono: 'bandera', partes: [{ k: c.k }, ` conquistó ${nombreDeRegion}`] }
        : c.resultado === 'repelido' ? { icono: 'espada', partes: [{ k: c.k }, ` resistió en ${nombreDeRegion}`] } : { icono: 'espada', partes: [`Empate en ${nombreDeRegion}`] };
      crear(turno, 'batalla', i, {
        asiento: c.k >= 0 ? c.k : null, minMs: a.decisiva ? MIN_MS.vs : MIN_MS.batalla,
        lineas: [{ texto: textoDeBatalla(c, nombre, region), clave: `bat:${turno}:${c.d}` }],
        pasos: [
          { tipo: 'tarjeta', variante: a.decisiva ? 'C' : 'A', d: c.d, nombre: nombreDeRegion, terr: c.terr, fort: c.fort, resultado: c.resultado, quedan: c.quedan, decisiva: a.decisiva, motivos: a.motivos, diferencia: a.diferencia, ganador: c.k, bandos: c.bandos, cubre: cubre.map(claveDeEvento) },
          { tipo: 'feed', lista: [{ ...resumen, alerta: a.decisiva }] },
        ],
      });
    }

    // ---- resolucion: lo que no tiene tarjeta (tomas sin lucha, batallas sin tarjeta, pactos, hambre, caidas...) y el estado al cierre ----
    const cubiertasDe = (e) => cubiertas.has(e);
    const hechos = [];
    const regionesConCombate = new Set(combates.map((c) => c.d));
    const regionesConTarjeta = new Set(mostradas.map((a) => a.c.d));
    const empujar = (e, h) => hechos.push({ ...h, tipo: e.tipo, k: e.k, n: e.n }); // el narrador necesita saber de que tipo es cada hecho (y de quien, y cuanto)
    for (const e of eventos) {
      const clave = claveDeEvento(e);
      if (e.tipo === 'ruptura' || cubiertasDe(e)) continue;
      if (e.tipo === 'conquista') empujar(e, { clave, texto: `${nombre(e.k)} conquista ${region(e.r)} de ${nombre(e.contra)}.`, feed: { icono: 'bandera', partes: [{ k: e.k }, ` conquistó ${region(e.r)}`] }, conquista: { k: e.k, contra: e.contra, r: e.r, sinLucha: !regionesConCombate.has(e.r) } });
      else if (e.tipo === 'repelido') empujar(e, { clave, texto: `${nombre(e.k)} ataca ${region(e.r)} de ${nombre(e.contra)} y es repelido.`, feed: { icono: 'espada', partes: [{ k: e.k }, ' atacó ', { k: e.contra }, ` en ${region(e.r)} y fue repelido`] } });
      else if (e.tipo === 'pacto') {
        pactos.push({ a: e.k, b: e.con, turno });
        empujar(e, { clave, texto: `${nombre(e.k)} y ${nombre(e.con)} firman un pacto.`, feed: { icono: 'pacto', partes: [{ k: e.k }, ' y ', { k: e.con }, ' firmaron un pacto'] }, pacto: { k: e.k, con: e.con } });
      } else if (e.tipo === 'pacto_cumplido') {
        const ultimo = pactos.filter((p) => (p.a === e.k && p.b === e.con) || (p.a === e.con && p.b === e.k)).at(-1);
        const entre = privadosVistos.filter((m) => ((m.k === e.k && m.a === e.con) || (m.k === e.con && m.a === e.k)) && m.turno >= (ultimo?.turno ?? turno) && m.turno < turno && !reveladas.has(idDe(m))).slice(-2);
        entre.forEach((m) => reveladas.add(idDe(m)));
        empujar(e, { clave, texto: `${nombre(e.k)} y ${nombre(e.con)} cumplieron su pacto.`, feed: { icono: 'pacto', partes: [{ k: e.k }, ' y ', { k: e.con }, ' cumplieron su pacto'] }, cumplido: { k: e.k, con: e.con, textos: entre.map((m) => ({ turno: m.turno, k: m.k, a: m.a, texto: m.texto })) } });
      } else if (e.tipo === 'hambre') empujar(e, { clave, texto: `${nombre(e.k)} pasa hambre: -${tropas(e.n)}.`, feed: { icono: 'hambre', partes: [{ k: e.k }, ` pasa hambre: -${tropas(e.n)}`] } });
      else if (e.tipo === 'comercio') empujar(e, { clave, texto: `${nombre(e.k)} y ${nombre(e.con)} comercian.`, feed: { icono: 'regalo', partes: [{ k: e.k }, ' y ', { k: e.con }, ' comerciaron'] } });
      else if (e.tipo === 'caida') empujar(e, { clave, texto: `${nombre(e.k)} cae: su capital fue tomada por ${nombre(e.por)}.`, feed: { icono: 'caida', partes: [{ k: e.k }, ' cayó: su capital fue tomada por ', { k: e.por }], alerta: true } });
      else if (e.tipo === 'maravilla') empujar(e, { clave, texto: `${nombre(e.k)} construye la Maravilla en ${region(e.r)}.`, feed: { icono: 'bandera', partes: [{ k: e.k }, ` construyó la Maravilla en ${region(e.r)}`] } });
      else if (e.tipo === 'maravilla_cae') empujar(e, { clave, texto: `${nombre(e.k)} conquista la Maravilla de ${nombre(e.de)}.`, feed: { icono: 'bandera', partes: [{ k: e.k }, ' conquistó la Maravilla de ', { k: e.de }], alerta: true } });
      else if (e.tipo === 'maravilla_gana') empujar(e, { clave, texto: `${nombre(e.k)} completa la Maravilla y gana la partida.`, feed: { icono: 'bandera', partes: [{ k: e.k }, ' completó la Maravilla y ganó'], alerta: true } });
      else if (e.tipo === 'deshonra') empujar(e, { clave, texto: `${nombre(e.k)} queda deshonrado.`, feed: { icono: 'ruptura', partes: [{ k: e.k }, ' quedó deshonrado'] } });
    }
    // tomas de una region libre (el motor no emite evento): las que no tienen tarjeta salen aqui, con los movimientos y el cambio de dueno
    const tomadas = new Set();
    for (const m of movs) {
      const d = m.d;
      if (tomadas.has(d) || regionesConTarjeta.has(d) || antes?.dueno?.[d] !== -1 || !(despues?.dueno?.[d] >= 0)) continue;
      tomadas.add(d);
      const k = despues.dueno[d];
      hechos.push({ tipo: 'toma', k, clave: `toma:${turno}:${d}`, texto: `${nombre(k)} toma ${region(d)}.`, feed: { icono: 'bandera', partes: [{ k }, ` tomó ${region(d)}`] }, conquista: { k, contra: -1, r: d, sinLucha: !regionesConCombate.has(d) } });
    }
    const razones = respuestas.flatMap((x, s) => (x && typeof x.razon === 'string' && x.razon.trim() ? [{ k: s, texto: x.razon.trim() }] : []));
    // lo que se dice de la resolucion: las tomas sin lucha, el hambre repetida y los comercios se cuentan; lo demas (pactos, caidas, conquistas, Maravilla...) tal cual; y cada 5 turnos un panorama
    const esUltimo = partida.truncada !== true && Array.isArray(partida.orden) && Array.isArray(partida.puntos) && i === rondas.length - 1; // el turno que cierra una partida terminada: viene el final
    const narradoResolucion = narrador.resolucion({ turno, hechos, combates: combates.length, despues, ultimo: esUltimo });
    crear(turno, 'resolucion', i, {
      lineas: hechos.map((h) => ({ texto: h.texto, clave: h.clave })), dicho: narradoResolucion.dicho, mudas: narradoResolucion.mudas, minMs: ritmo.resolucion,
      pasos: [
        { tipo: 'conquistas', lista: hechos.filter((h) => h.conquista).map((h) => h.conquista) },
        ...hechos.filter((h) => h.pacto).map((h) => ({ tipo: 'pacto', ...h.pacto })),
        ...hechos.filter((h) => h.cumplido).map((h) => ({ tipo: 'cumplido', ...h.cumplido })),
        { tipo: 'feed', lista: hechos.map((h) => ({ ...h.feed, alerta: h.feed.alerta === true })) },
        { tipo: 'estado', ...(despues ?? {}) },
        { tipo: 'razones', lista: razones },
      ],
    });
    previo = despues;
  });

  // ---- final: solo si la partida termino (una partida cortada se reproduce hasta donde llego) ----
  const ultimo = rondas.at(-1);
  if (partida.truncada !== true && Array.isArray(partida.orden) && Array.isArray(partida.puntos)) {
    const metricas = partida.metricas ?? [];
    const ranking = partida.orden.map((k, pos) => ({
      k, posicion: pos + 1, puntos: partida.puntos[k] ?? 0, regiones: metricas[k]?.regiones ?? 0, honor: metricas[k]?.honor ?? null, cayoEn: metricas[k]?.cayoEn ?? null,
      tropas: (previo?.dueno ?? []).reduce((s, d, r) => s + (d === k ? (previo.tropas[r] ?? 0) : 0), 0),
    }));
    const candidatos = [];
    let primera = true;
    for (const r of rondas) for (const e of objetos(r.eventos)) {
      const t = e.t ?? r.turno;
      if (e.tipo === 'conquista' && primera) { primera = false; candidatos.push({ peso: 1, turno: t, texto: `Primera conquista: ${nombre(e.k)} toma ${region(e.r)} de ${nombre(e.contra)}.` }); }
      else if (e.tipo === 'ruptura') candidatos.push({ peso: 2, turno: t, texto: `${nombre(e.k)} rompe su pacto con ${nombre(e.contra)}.` });
      else if (e.tipo === 'caida') candidatos.push({ peso: 3, turno: t, texto: `${nombre(e.k)} cae ante ${nombre(e.por)}.` });
      else if (e.tipo === 'maravilla') candidatos.push({ peso: 2, turno: t, texto: `${nombre(e.k)} construye la Maravilla.` });
      else if (e.tipo === 'maravilla_cae') candidatos.push({ peso: 3, turno: t, texto: `${nombre(e.k)} conquista la Maravilla de ${nombre(e.de)}.` });
      else if (e.tipo === 'maravilla_gana') candidatos.push({ peso: 3, turno: t, texto: `${nombre(e.k)} completa la Maravilla.` });
    }
    const momentos = candidatos.sort((a, b) => b.peso - a.peso || a.turno - b.turno).slice(0, MOMENTOS_MAX).sort((a, b) => a.turno - b.turno || b.peso - a.peso).map(({ turno, texto }) => ({ turno, texto }));
    const sinRevelar = privadosVistos.filter((m) => !reveladas.has(idDe(m))).slice(-MAX_SIN_REVELAR).map((m) => ({ turno: m.turno, k: m.k, a: m.a, texto: m.texto }));
    const ganador = partida.ganador ?? partida.orden[0];
    const lineas = [{ texto: `${nombre(ganador)} gana la partida${partida.ganoPorMaravilla === true ? ' por la Maravilla' : ''}.`, clave: 'final:ganador' }];
    crear(ultimo.turno ?? rondas.length, 'final', rondas.length - 1, {
      lineas, asiento: Number.isInteger(ganador) ? ganador : null,
      pasos: [{ tipo: 'final', ranking, momentos, sinRevelar, ganoPorMaravilla: partida.ganoPorMaravilla === true, bioma: mapa.bioma }],
    });
  }
  return beats;
}

// ---- Que turnos valen la pena para un clip de redes -----------------------------------------------------------------------------------------
// Cada turno suma puntos por lo que paso en el (todo sale de los registros). Los pesos son editoriales.
const PESOS = { 'batalla decisiva': 5, traicion: 5, caida: 6, maravilla: 4, conquista: 2, batalla: 2, pacto: 1 };

export function puntuarTurnos(partida) {
  const rondas = Array.isArray(partida?.rondas) ? partida.rondas : [];
  const capitales = leerMapa(partida?.mapa)?.inicio.capitales ?? [];
  return rondas.map((r, i) => {
    const eventos = objetos(r?.eventos), combates = objetos(r?.combates).filter((c) => Array.isArray(c.bandos) && c.bandos.every((b) => b && typeof b === 'object'));
    const cuenta = {};
    const suma = (m, n = 1) => { cuenta[m] = (cuenta[m] ?? 0) + n; };
    for (const c of combates) suma(esDecisiva(c, { eventos, capitales }).decisiva ? 'batalla decisiva' : 'batalla');
    for (const e of eventos) {
      if (e.tipo === 'ruptura') suma('traicion');
      else if (e.tipo === 'caida') suma('caida');
      else if (e.tipo === 'conquista') suma('conquista');
      else if (e.tipo === 'pacto') suma('pacto');
      else if (String(e.tipo).startsWith('maravilla')) suma('maravilla');
    }
    const motivos = Object.keys(cuenta);
    return { turno: Number.isInteger(r?.turno) ? r.turno : i + 1, puntos: motivos.reduce((t, m) => t + PESOS[m] * cuenta[m], 0), motivos, registros: [i, i] };
  });
}

// Los n turnos con mas puntos (empata el mas temprano), de mayor a menor.
export function mejoresTurnos(partida, n) {
  if (!Number.isInteger(n) || n < 1) return [];
  return puntuarTurnos(partida).sort((a, b) => b.puntos - a.puntos || a.turno - b.turno).slice(0, n);
}

// ---- Para la herramienta de capturas: comprobar que la escena no arrastra nada de un turno al siguiente -------------------------------------------
// El comienzo (beat de ordenes) de cada turno desde el segundo, hasta `max` turnos.
export function beatsDeEstado(beats, max = 6) {
  if (!Array.isArray(beats)) return [];
  const turnos = [...new Set(beats.map((b) => b.mano))].slice(1, 1 + max);
  return turnos.map((m) => beats.findIndex((b) => b.mano === m && b.tipo === 'ordenes')).filter((i) => i >= 0);
}

// Lo que la mesa informa de si misma al detenerse (data-estado) justo despues del beat de ordenes de un turno: ahi SI estan a la vista las flechas de ese turno, pero no puede quedar
// nada del anterior (flechas de mas, tarjetas, carteles, flashbacks ni el panel del final).
export function erroresDeEstado(estado, beat) {
  if (!estado) return ['la escena no informo su estado (data-estado)'];
  const errores = [];
  const propias = beat?.pasos?.find((p) => p.tipo === 'flechas')?.lista?.length ?? 0;
  if (estado.tarjetas !== 0) errores.push(`quedan ${estado.tarjetas} tarjetas de batalla visibles al empezar ${beat.id}: son del turno anterior`);
  if (estado.carteles !== 0) errores.push(`quedan ${estado.carteles} carteles de traicion visibles al empezar ${beat.id}: son del turno anterior`);
  if (estado.flashbacks !== 0) errores.push(`quedan ${estado.flashbacks} flashbacks visibles al empezar ${beat.id}: son del turno anterior`);
  if (estado.flechas !== propias) errores.push(`hay ${estado.flechas} flechas de ordenes visibles al empezar ${beat.id} y este turno tiene ${propias}: ${estado.flechas > propias ? 'sobran las del turno anterior' : 'faltan'}`);
  if (!Number.isInteger(estado.filasMarcador) || !Number.isInteger(estado.reinos)) errores.push(`la escena no informo su marcador al empezar ${beat.id}`);
  else if (estado.filasMarcador !== estado.reinos) errores.push(`el marcador tiene ${estado.filasMarcador} filas con tinta al empezar ${beat.id} y la partida tiene ${estado.reinos} reinos`);
  if (estado.panel > 0.01) errores.push(`panel visible (${estado.panel}) al empezar ${beat.id}: es del final anterior`);
  return errores;
}
