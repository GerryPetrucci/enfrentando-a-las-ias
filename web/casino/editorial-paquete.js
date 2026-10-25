// Seleccion editorial basada solo en hechos que la escena ya muestra.
// No usa privados, razones, mensajes ni modelos externos.
export const CLIPS_POR_PARTE = { conquista: [2, 2], fuga: [1, 1], mayormenor: [1, 1], dudaapuesta: [2, 1], tripledado: [1, 1], solitario: [1, 1], subasta: [1, 1] };
const TIPOS = new Set(['resultado', 'resolucion', 'batalla', 'revelado', 'consecuencia', 'final', 'cierre', 'comentarios', 'enfrentamiento']);
const LINEAS = new Set(['hecho', 'resultado', 'comentario', 'revelacion', 'consecuencia', 'cierre', 'enfrentamiento']);
const limpio = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
const acotar = (t, n) => t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;

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

// Un mismo titulo/descripcion para todas las redes: 100/280 caracteres como
// presupuestos editoriales conservadores. El contenido cambia con los hechos.
export function publicacionDePieza(pieza, { beats, nombres, seed, juego, enlace = '', destacadas = [] }) {
  const hechos = hechosDePieza(beats, pieza, destacadas), n = pieza.parte ?? Number(pieza.id.split('-').at(-1));
  const rivales = nombres.map((s) => acotar(s, 22)).join(' vs ');
  const ventana = esGancho(pieza) ? `Próximamente · Parte ${n} de 2` : `Rondas ${pieza.grabar.desde}–${pieza.grabar.hasta}`;
  const cortes = new URL(pieza.grabar.url, 'http://local').searchParams.get('cortes');
  // Con muchos participantes la lista de nombres no cabe en el titulo del gancho en imagen: se dice cuantos son.
  const quien = pieza.tipo === 'gancho-imagen' && nombres.length > 4 ? `${nombres.length} IAs frente a frente` : rivales;
  const detalle = hechos[0] ? `Ronda ${hechos[0].unidad}: ${hechos[0].texto}`
    : pieza.tipo === 'gancho-imagen' ? `${quien}: la partida llega pronto.` : `${quien}. ${pieza.tipo === 'gancho' ? `Un adelanto de las rondas ${cortes ?? ''}.` : ventana}`;
  const etiqueta = esGancho(pieza) ? `Próximamente · Parte ${n}` : pieza.tipo === 'parte' ? `Parte ${n}` : `Clip ${pieza.id.split('-').at(-1)}`;
  const titulo = acotar(`${juego} · ${etiqueta} · ${detalle}`, 100);
  const cola = `\n${ventana} · Seed ${seed}\nGenerado por IA · Proyecto independiente${enlace ? `\n${enlace}` : ''}`;
  const descripcion = `${acotar(detalle, Math.max(0, 280 - cola.length))}${cola}`.slice(0, 280);
  return { titulo, descripcion, evidencia: hechos.slice(0, 3) };
}

export function ordenDePublicacion(piezas) {
  const rango = { gancho: 0, 'gancho-imagen': 0, parte: 1, clip: 2 };
  return [...piezas].sort((a, b) => (a.parte ?? 1) - (b.parte ?? 1) || (rango[a.tipo] - rango[b.tipo]) || a.grabar.desde - b.grabar.desde);
}
