// Un narrador por partida, llamado en el orden de los eventos públicos.
// Sin DOM, azar ni acceso a roles privados o instantáneas de fin de turno.
import { nombreRol } from './lobo-arte.js';

export const CITAS_POR_DIA = 3;
export function textoDeComprobacion(nombre, c) {
  if (!c) return '';
  return c.coincide ? `${nombre} decía la verdad: era ${nombreRol(c.rolReal)}.`
    : `${nombre} había mentido: decía ser ${nombreRol(c.rolDeclarado)}, pero era ${nombreRol(c.rolReal)}.`;
}
const NOCHES = [
  'Cae la noche. La aldea duerme mientras alguien recorre sus calles.',
  'La oscuridad cubre la aldea. Tras las ventanas cerradas, nadie sabe qué traerá el amanecer.',
  'La aldea apaga sus luces. En las calles, el silencio guarda secretos.',
  'Otra noche envuelve las casas. La aldea duerme entre sospechas.',
  'Las sombras regresan a la aldea. Hay secretos que solo la mañana descubrirá.',
  'Se cierran las puertas. La aldea espera que llegue la primera luz.',
];

export function crearNarrador({ nombre = (i) => `Jugador ${i + 1}`, nombres = [] } = {}) {
  let citados = new Set(), resumenPendiente = false;
  const declaracionesDichas = new Map(), declaracionesPendientes = new Map();
  // Priorizar acusaciones que identifican a otra persona por nombre o asiento.
  // Leer una afirmación no la convierte en confirmación de su contenido.
  function prepararDia(eventos) {
    const mensajes = eventos.filter((e) => e?.tipo === 'mensaje' && typeof e.mensaje === 'string' && e.mensaje.trim());
    const acusa = (e) => nombres.some((n, i) => i !== e.asiento && n && e.mensaje.toLocaleLowerCase('es').includes(n.toLocaleLowerCase('es')))
      || /\basiento\s+\d+\b/iu.test(e.mensaje);
    const elegidos = [...mensajes.filter(acusa), ...mensajes.filter((e) => !acusa(e))].slice(0, CITAS_POR_DIA);
    citados = new Set(elegidos.map((e) => e.asiento));
    resumenPendiente = mensajes.some((e) => !citados.has(e.asiento));
  }

  function contar({ tipo, ronda, paso, texto }) {
    let voz = texto, comentario = false;
    switch (tipo) {
      case 'preparacion': voz = 'La aldea se prepara para dormir. Cada habitante vuelve a su casa; las identidades permanecen ocultas.'; break;
      case 'noche': voz = NOCHES[(ronda - 1) % NOCHES.length]; break;
      case 'enamorados': voz = `${Number.isInteger(paso.cupido) ? `${nombre(paso.cupido)} se revela como Cupido. ` : ''}Cupido une a ${nombre(paso.asientos[0])} y a ${nombre(paso.asientos[1])}: si uno cae, el otro cae con él.`; break;
      case 'amanecer': voz = paso.hayMuertes ? 'Amanece en la aldea.' : 'Amanece, y para sorpresa de todos, nadie falta hoy.'; break;
      case 'muerte': {
        const causa = { noche: 'ya no despierta', veneno: 'ya no despierta', amor: 'cae por su vínculo de amor',
          voto: 'recibe más votos y es expulsado', disparo: 'cae por el disparo del cazador' }[paso.causa] ?? 'muere';
        voz = `${nombre(paso.asiento)} ${causa}: era ${nombreRol(paso.rol)}.${paso.comprobacion ? ` ${textoDeComprobacion(nombre(paso.asiento), paso.comprobacion)}` : ''}`; break;
      }
      case 'disparo': voz = `${nombre(paso.asiento)}, con su último aliento, se lleva a ${nombre(paso.objetivo)} con él.`; break;
      case 'mensaje':
        voz = '';
        if (citados.has(paso.asiento)) voz = texto; // fragmentos literales, sin cortar ni reescribir la cita
        else if (paso.mensaje && resumenPendiente) {
          voz = 'El resto de la aldea comparte sus sospechas.';
          comentario = true; resumenPendiente = false;
        }
        // La declaración de rol llega con la primera tarjeta del mensaje, pero se dice al terminarlo: no se mete entre dos tarjetas de la misma frase.
        if (paso.afirmaRol && paso.total > 1 && paso.parte < paso.total) declaracionesPendientes.set(paso.asiento, paso.afirmaRol);
        if (!(paso.total > 1) || paso.parte >= paso.total) {
          const declarado = paso.afirmaRol ?? declaracionesPendientes.get(paso.asiento);
          declaracionesPendientes.delete(paso.asiento);
          if (declarado && declaracionesDichas.get(paso.asiento) !== declarado) {
            voz = `${voz ? `${voz} ` : ''}${nombre(paso.asiento)} afirma ser ${nombreRol(declarado)}.`;
            declaracionesDichas.set(paso.asiento, declarado);
          }
        }
        break;
      case 'identidad': voz = textoDeComprobacion(nombre(paso.asiento), paso.comprobacion); break;
      case 'elenco': voz = 'Este es el elenco completo de la aldea, con todas sus identidades reveladas.'; break;
      case 'votacion':
        // La identidad se dice en el siguiente evento de muerte, nunca antes.
        voz = paso.empate ? 'La votación empata: nadie es expulsado hoy.' : 'La aldea vota.'; break;
      case 'final': {
        voz = paso.ganadorBando === 'aldea' ? 'Victoria de la aldea: no quedan lobos.'
          : paso.ganadorBando === 'lobos' ? 'Victoria de los lobos: no quedan otros habitantes.'
            : paso.motivo === 'extincion' ? 'La aldea queda vacía. Empate por extinción.'
              : paso.motivo === 'llamadas' ? 'Se alcanza el límite de llamadas. Empate entre bandos.'
                : 'Se alcanza el tope de rondas. Empate entre bandos.';
        voz += ` Se revelan todas las identidades.${paso.parejaViva ? ' Los dos enamorados sobreviven y ganan su bono.' : ''}`;
        break;
      }
    }
    return { dicho: voz ? [{ tipo: comentario ? 'comentario' : 'hecho', texto: voz }] : [], mudas: voz ? [] : [tipo] };
  }
  return { prepararDia, contar };
}
