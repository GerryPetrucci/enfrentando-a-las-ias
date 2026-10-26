// Seleccion editorial basada solo en hechos que la escena ya muestra.
// No usa privados, razones, mensajes ni modelos externos.
export const CLIPS_POR_PARTE = { conquista: [2, 2], fuga: [1, 1], mayormenor: [1, 1], dudaapuesta: [2, 1], tripledado: [1, 1], solitario: [1, 1], subasta: [1, 1] };
const TIPOS = new Set(['resultado', 'resolucion', 'batalla', 'revelado', 'consecuencia', 'final', 'cierre', 'comentarios', 'enfrentamiento']);
const LINEAS = new Set(['hecho', 'resultado', 'comentario', 'revelacion', 'consecuencia', 'cierre', 'enfrentamiento']);
const limpio = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
// Corta en una palabra entera (si hay una espacio en el ultimo 40 %) y sin dejar un signo colgando antes de los puntos suspensivos: «8 IAs frente a frente…», no «8 IAs frente a frente: l…».
const acotar = (t, n) => {
  if (t.length <= n) return t;
  const corte = t.slice(0, n - 1), espacio = corte.lastIndexOf(' ');
  return `${(espacio >= (n - 1) * 0.6 ? corte.slice(0, espacio) : corte).replace(/[\s.,;:¿¡!?-]+$/u, '')}…`;
};

// Un gancho puede ser un video (`gancho`: cortes de la partida) o, si la parte no tiene momentos buenos para uno, una imagen fija (`gancho-imagen`, gancho-imagen.js).
const esGancho = (pieza) => pieza.tipo === 'gancho' || pieza.tipo === 'gancho-imagen';

export function hechosDePieza(beats, pieza, destacadas = []) {
  if (esGancho(pieza)) return [];
  const elegibles = (beats ?? []).filter((b) => b.mano >= pieza.grabar.desde && b.mano <= pieza.grabar.hasta && TIPOS.has(b.tipo));
  // Los comentarios del resultado suelen describir cambios de lider y giros.
  const destacada = destacadas.find((d) => d.puntos > 0 && d.unidad >= pieza.grabar.desde && d.unidad <= pieza.grabar.hasta)?.unidad;
  const hechos = elegibles.flatMap((b) => (b.lineas ?? []).filter((l) => LINEAS.has(l.tipo) && limpio(l.texto)).map((l) => ({ unidad: b.mano, texto: limpio(l.texto), prioridad: (b.mano === destacada ? 10 : 0) + (l.tipo === 'comentario' ? 4 : l.tipo === 'resultado' ? 2 : 0) + (/pasa al frente|remonta|pierde|acierta|gana \d/i.test(l.texto) ? 1 : 0) })));
  return hechos.sort((a, b) => b.prioridad - a.prioridad).filter((h, i, a) => a.findIndex((x) => x.texto === h.texto) === i);
}

// Lo primero de CADA titulo y descripcion, igual en todas las redes y facil de reconocer (decidido por el usuario el 25 de octubre de 2026):
//   «Guerra de territorios J3 - Parte 1/2 - Seed 1704202488»   (parte)
//   «Guerra de territorios J3 - Clip 2 (Parte 1/2) - Seed 1704202488»   (clip)
//   «Guerra de territorios J3 - Próximamente Parte 2/2 - Seed 1704202488»   (gancho, en video o en imagen)
// `juegoNumero` es el jN del juego (el que lleva el nombre de sus videos); sin el, se omite. Nunca se recorta: lo demas se acota para que quepa.
export function identificadorDePieza(pieza, { juego, juegoNumero = null, seed, partes = 2 }) {
  const n = pieza.parte ?? Number(pieza.id.split('-').at(-1));
  const tramo = esGancho(pieza) ? `Próximamente Parte ${n}/${partes}` : pieza.tipo === 'parte' ? `Parte ${n}/${partes}` : `Clip ${pieza.id.split('-').at(-1)} (Parte ${n}/${partes})`;
  return `${juego}${Number.isInteger(juegoNumero) ? ` J${juegoNumero}` : ''} - ${tramo} - Seed ${seed}`;
}

// Los topes de lo que se escribe para subir (decididos por el usuario el 26 de octubre de 2026 el del titulo; el de la descripcion es el de X): una prueba los exige en todas las piezas de todos los juegos.
export const MAX_TITULO = 90, MAX_DESCRIPCION = 280, MAX_HASHTAGS = 5;
const MIN_DETALLE = 12; // si no queda lugar para decir algo ademas de lo obligatorio, se omite

// Un mismo titulo/descripcion para todas las redes. Empiezan siempre con el identificador (arriba); el resto cambia con los hechos. TODA descripcion lleva hashtags (decidido por el usuario
// el 26 de octubre de 2026): `hashtags` son los que arma el paquete (#IAvsIA, los del juego y los de los modelos que juegan) y, si no llegan, al menos #IAvsIA. Si no cabe todo en
// MAX_DESCRIPCION, primero se quita la linea de la ventana, luego hashtags (nunca el primero) y por ultimo se acota el detalle.
export function publicacionDePieza(pieza, { beats, nombres, seed, juego, juegoNumero = null, unidad = 'Ronda', enlace = '', destacadas = [], hashtags = [] }) {
  const hechos = hechosDePieza(beats, pieza, destacadas), n = pieza.parte ?? Number(pieza.id.split('-').at(-1));
  const identificador = identificadorDePieza(pieza, { juego, juegoNumero, seed });
  const rivales = nombres.map((s) => acotar(s, 22)).join(' vs ');
  const ventana = esGancho(pieza) ? `Próximamente · Parte ${n} de 2` : pieza.grabar.desde === pieza.grabar.hasta ? `${unidad} ${pieza.grabar.desde}` : `${unidad}s ${pieza.grabar.desde}–${pieza.grabar.hasta}`;
  const cortes = new URL(pieza.grabar.url, 'http://local').searchParams.get('cortes');
  // Con muchos participantes la lista de nombres no cabe en el titulo (se cortaria a media palabra): se dice cuantos son. La descripcion trae la lista si cabe.
  const detalleCon = (quien) => hechos[0] ? `${unidad} ${hechos[0].unidad}: ${hechos[0].texto}`
    : pieza.tipo === 'gancho-imagen' ? `${quien}: la partida llega pronto.` : pieza.tipo === 'gancho' ? `${quien}. Un adelanto de las ${unidad.toLowerCase()}s ${cortes ?? ''}.` : `${quien}.`;
  const detalle = detalleCon(nombres.length > 4 ? `${nombres.length} IAs frente a frente` : rivales);
  const lugarTitulo = MAX_TITULO - identificador.length - ' | '.length;
  const titulo = acotar(lugarTitulo >= MIN_DETALLE ? `${identificador} | ${acotar(detalle.replace(/\.$/, ''), lugarTitulo)}` : identificador, MAX_TITULO); // solo el identificador de un juego de nombre absurdo se corta
  const etiquetas = [...new Set(['#IAvsIA', ...(Array.isArray(hashtags) ? hashtags : []).filter((h) => /^#\S+$/.test(h))])].slice(0, MAX_HASHTAGS); // #IAvsIA siempre, y primero
  const conNombres = detalleCon(rivales);
  const aviso = 'Generado por IA · Proyecto independiente';
  for (const cuantas of Array.from({ length: etiquetas.length }, (_, i) => etiquetas.length - i)) {
    for (const conVentana of [true, false]) {
      const fijo = [identificador, ...(conVentana ? [ventana] : []), aviso, ...(enlace ? [enlace] : []), etiquetas.slice(0, cuantas).join(' ')];
      const lugar = MAX_DESCRIPCION - fijo.join('\n').length - '\n'.length;
      if (lugar < MIN_DETALLE) continue;
      const cuerpo = conNombres.length <= lugar ? conNombres : detalle;
      fijo.splice(1, 0, acotar(cuerpo, lugar));
      return { titulo, descripcion: fijo.join('\n'), evidencia: hechos.slice(0, 3) };
    }
  }
  return { titulo, descripcion: [identificador, aviso, etiquetas[0]].join('\n').slice(0, MAX_DESCRIPCION), evidencia: hechos.slice(0, 3) };
}

export function ordenDePublicacion(piezas) {
  const rango = { gancho: 0, 'gancho-imagen': 0, parte: 1, clip: 2 };
  return [...piezas].sort((a, b) => (a.parte ?? 1) - (b.parte ?? 1) || (rango[a.tipo] - rango[b.tipo]) || a.grabar.desde - b.grabar.desde);
}
