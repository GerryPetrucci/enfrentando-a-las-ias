import { CATALOGO_ERA, PRESUPUESTO_PUNTOS } from '../reglas-era.js';
import { clavesEsperadas, accesoRespuestas, LETRA } from './almacen.js';
import { extraerJson } from './extraer-json.js';
import { estadoIntervencionInicial, validarEtapa, validarIntervencion } from './validar-respuesta.js';

// Revisión PREVIA de las respuestas guardadas (sin juego, sin red): ¿cada una pasa el MISMO validador del motor? Así el usuario ve el error
// exacto y accionable antes de lanzar la partida y puede pedirle a su modelo una corrección (regla del reglamento: una corrección sin costo).
// Es una aproximación en las intervenciones (el motor las valida con el estado real del juego, p. ej. unidades confirmadas): el veredicto
// definitivo siempre es el de la partida.

// Texto -> { extraccion, validacion, resumen } para una clave concreta.
export function evaluarTexto(clave, texto, { cat = CATALOGO_ERA, previos = [], maxFuertes = 1, estado = estadoIntervencionInicial(), rivalId = null } = {}) {
  const ex = extraerJson(texto);
  if (!ex.ok) return { extraccion: ex, validacion: { ok: false, errores: [{ codigo: ex.error.codigo, mensaje: ex.error.mensaje, campo: '(texto)' }] }, resumen: null };
  const m = /^etapa([123])$/.exec(clave);
  if (m) {
    const v = validarEtapa(Number(m[1]), ex.valor, { cat, previos, maxFuertes });
    return { extraccion: ex, validacion: v, resumen: v.ok ? resumenEtapa(Number(m[1]), v, cat) : null };
  }
  const fase = clave.startsWith('guerra') ? 'guerra' : 'desarrollo';
  const v = validarIntervencion(fase, ex.valor, estado, { cat, rivalId });
  return { extraccion: ex, validacion: v, resumen: v.ok ? v.acciones.map(a => a.action === 'esperar' ? 'esperar' : `${a.action} ${JSON.stringify(a.parameters)}`).join(' + ') : null };
}
function resumenEtapa(etapa, v, cat) {
  if (etapa === 1) { const e = v.eleccion; return `${e.raza}, ${e.mineral}, ${e.bioma ?? 'sin bioma'} (costo ${v.costo} de ${PRESUPUESTO_PUNTOS.etapa1})`; }
  const ids = Object.values(v.eleccion.rasgos);
  return ids.length ? `${ids.join(', ')} (costo ${v.costo} de ${PRESUPUESTO_PUNTOS[`etapa${etapa}`]})` : 'sin rasgos';
}

export function verificarRespuestas({ almacen, partida, cat = CATALOGO_ERA, ids = ['f1', 'f2'] }) {
  const esperadas = clavesEsperadas(partida);
  const salida = { participantes: {}, errores: 0, faltan: 0, corregidas: 0, avisos: [...almacen.avisos] };
  ids.forEach(id => {
    const acceso = accesoRespuestas(almacen, id), rival = ids.find(x => x !== id);
    const filas = [];
    let previosRasgos = [], estado = estadoIntervencionInicial();
    for (const clave of [...esperadas.borrador, ...esperadas.intervenciones]) {
      const esEtapa = esperadas.borrador.includes(clave);
      const base = acceso.obtener(clave, 0);
      if (!base) {
        if (esEtapa) { filas.push({ clave, estado: 'falta', mensaje: `No hay respuesta guardada para ${clave}. Es obligatoria: pega la respuesta del modelo en ${LETRA[id].toLowerCase()}/${clave}.txt (o en ${LETRA[id].toLowerCase()}/borrador.txt con las tres etapas).` }); salida.faltan++; }
        else filas.push({ clave, estado: 'sin_respuesta', mensaje: 'Sin respuesta guardada: el participante esperará (es opcional).' });
        continue;
      }
      const ctx = { cat, previos: clave === 'etapa3' ? previosRasgos : [], maxFuertes: partida.maxFuertes, estado, rivalId: rival };
      const r0 = evaluarTexto(clave, base.texto, ctx);
      let final = r0, estadoFila = r0.validacion.ok ? 'ok' : 'error', correccion = null;
      if (!r0.validacion.ok) {
        const cor = acceso.obtener(clave, 1);
        if (cor) {
          const r1 = evaluarTexto(clave, cor.texto, ctx);
          correccion = { archivo: cor.archivo, ok: r1.validacion.ok, errores: r1.validacion.errores, avisos: r1.extraccion.avisos ?? [], resumen: r1.resumen };
          if (r1.validacion.ok) { final = r1; estadoFila = 'corregida'; salida.corregidas++; }
        }
      }
      if (estadoFila === 'error') salida.errores++;
      if (final.validacion.ok) {
        if (clave === 'etapa2') previosRasgos = Object.values(final.validacion.eleccion.rasgos);
        if (clave === 'etapa3') previosRasgos = [...previosRasgos, ...Object.values(final.validacion.eleccion.rasgos)];
        if (!esEtapa && final.validacion.usoFinal) estado = final.validacion.usoFinal;
        if (esEtapa && clave !== 'etapa1') estado = { ...estado, propios: [...estado.propios, ...Object.values(final.validacion.eleccion.rasgos)] };
      }
      filas.push({ clave, estado: estadoFila, archivo: base.archivo, avisos: r0.extraccion.avisos ?? [], errores: r0.validacion.errores, resumen: final.resumen, razon: final.validacion.ok ? final.validacion.razon : null, correccion });
    }
    salida.participantes[id] = filas;
  });
  salida.ok = salida.errores === 0 && salida.faltan === 0;
  return salida;
}

const ICONO = { ok: 'OK      ', corregida: 'OK (corregida)', error: 'ERROR   ', falta: 'FALTA   ', sin_respuesta: 'espera  ' };
export function informeTexto(r, { etiqueta = id => LETRA[id], nombre = () => '' } = {}) {
  const l = [];
  for (const [id, filas] of Object.entries(r.participantes)) {
    l.push(`Participante ${etiqueta(id)}${nombre(id) ? ` (${nombre(id)})` : ''}`);
    for (const f of filas) {
      l.push(`  ${ICONO[f.estado] ?? f.estado} ${f.clave}${f.resumen ? ` -> ${f.resumen}` : ''}${f.estado === 'falta' || f.estado === 'sin_respuesta' ? ` - ${f.mensaje}` : ''}`);
      for (const a of f.avisos ?? []) l.push(`      aviso: ${a}`);
      if (f.estado === 'error' || f.estado === 'corregida') for (const e of f.errores) l.push(`      ${f.estado === 'corregida' ? 'primer intento: ' : ''}${e.mensaje}`);
      if (f.correccion) {
        l.push(`      corrección (${f.correccion.archivo}): ${f.correccion.ok ? 'válida' : 'TAMBIÉN inválida'}`);
        if (!f.correccion.ok) for (const e of f.correccion.errores) l.push(`        ${e.mensaje}`);
      }
      if (f.estado === 'error') {
        const deBorrador = /borrador/.test(f.archivo ?? '');
        l.push(`      Qué hacer: pega estas líneas en el chat del modelo ("tu respuesta fue inválida: ...") y guarda su respuesta corregida en ${etiqueta(id).toLowerCase()}/${deBorrador ? 'borrador' : f.clave}.correccion.txt${deBorrador ? ' (con las tres etapas en un solo JSON, como el borrador)' : ''}`);
      }
    }
  }
  for (const a of r.avisos) l.push(`Aviso: ${a}`);
  l.push(r.ok ? `Todo en orden${r.corregidas ? ` (${r.corregidas} respuesta(s) se aceptan por su corrección)` : ''}.` : `Hay ${r.errores} respuesta(s) inválida(s) y ${r.faltan} que faltan.`);
  return l.join('\n');
}
