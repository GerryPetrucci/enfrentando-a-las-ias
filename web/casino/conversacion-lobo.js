// La conversacion PUBLICA de una partida de Lobo en la aldea para la pagina de la partida (web/partida.html): lo que dijo cada IA y lo que paso, ronda por ronda, leido de los eventos
// publicos del registro (lo unico que sale mientras la partida esta por publicarse: src/publicacion.js, `registroPublicoDeLobo`). Nunca lee `privado`, `invalidas` ni nada que delate un rol vivo.
// Puro: sin DOM ni red (se prueba en Node). Las IAs se llaman como en la voz y en el video (el modelo, con letra si ocupa varios asientos) y los asientos que citan en sus mensajes
// («asiento 5», «al 0») se vuelven nombres: el sitio no tiene numeros de asiento que los expliquen (misma regla que la narracion, AGENTS.md).

import { nombreRol, ROLES_LOBO } from './lobo-arte.js';
import { nombresDeEscena, traducirAsientos } from './lobo-nombres.js';

const CAUSAS = { noche: 'muere durante la noche', veneno: 'muere por el veneno', amor: 'muere por su vínculo de amor', voto: 'es expulsado por la aldea', disparo: 'cae por el disparo del cazador' };
const lista = (x) => (Array.isArray(x) ? x : []);

// -> [{ ronda, hechos: [...] }]. Cada hecho es una de estas formas:
//   { tipo: 'mensaje', asiento, quien, texto, nota? }   lo que dijo una IA (nota: «afirma ser Vidente»)
//   { tipo: 'silencio', asiento, quien }                una IA que no dijo nada
//   { tipo: 'votos', filas: [{ de, a }], recibidos: [{ quien, votos }], empate }   la votacion, y cuantos votos recibio cada uno
//   { tipo: 'hecho', texto }                            todo lo demas: amanecer, enamorados, muertes, disparo
// Una fase sin eventos (la noche, que no muestra nada) no aparece. Un registro raro no lanza: se salta.
export function conversacionDeLobo(partida) {
  const jugadores = lista(partida?.jugadores), n = jugadores.length;
  const nombres = nombresDeEscena(jugadores.map((j) => j?.nombre));
  const nombre = (i) => nombres[i] ?? 'Jugador';
  const valido = (i) => Number.isInteger(i) && i >= 0 && i < n;
  const rondas = [];
  for (const registro of lista(partida?.rondas)) {
    const eventos = lista(registro?.publico?.eventos);
    if (!eventos.length || !Number.isInteger(registro?.ronda)) continue;
    let actual = rondas.find((r) => r.ronda === registro.ronda);
    if (!actual) { actual = { ronda: registro.ronda, hechos: [] }; rondas.push(actual); }
    for (const e of eventos) {
      const hechos = actual.hechos;
      switch (e?.tipo) {
        case 'enamorados': {
          // Lobo 1.3.0: el evento trae solo lo que revela el modo del seed (la pareja, a Cupido, las dos cosas o ninguna); sin `revela` es de lobo 1.2.0 y trae las dos.
          const conPareja = lista(e.asientos).length === 2 && e.asientos.every(valido), conCupido = valido(e.cupido);
          if (e.asientos !== undefined && !conPareja) break;
          const unidos = conPareja ? `${nombre(e.asientos[0])} y ${nombre(e.asientos[1])} quedan unidos: si uno muere, el otro también.` : '';
          const texto = conCupido ? (conPareja ? `${nombre(e.cupido)} se revela como Cupido. ${unidos}` : `${nombre(e.cupido)} se revela como Cupido y ha elegido a sus enamorados en secreto.`)
            : conPareja ? `Cupido une a ${nombre(e.asientos[0])} y a ${nombre(e.asientos[1])}: si uno muere, el otro también.`
              : e.revela === 'nada' ? 'Cupido ha elegido a dos enamorados. Nadie sabe quiénes son.' : '';
          if (texto) hechos.push({ tipo: 'hecho', texto });
          break;
        }
        case 'amanecer': hechos.push({ tipo: 'hecho', texto: 'Amanece en la aldea.' }); break;
        case 'mensaje': {
          if (!valido(e.asiento)) break;
          const texto = traducirAsientos(typeof e.mensaje === 'string' ? e.mensaje.trim() : '', nombre, n);
          if (!texto) { hechos.push({ tipo: 'silencio', asiento: e.asiento, quien: nombre(e.asiento) }); break; }
          hechos.push({ tipo: 'mensaje', asiento: e.asiento, quien: nombre(e.asiento), texto, ...(Object.hasOwn(ROLES_LOBO, e.afirmaRol) ? { nota: `afirma ser ${nombreRol(e.afirmaRol)}` } : {}) });
          break;
        }
        case 'votacion': {
          const filas = lista(e.votos).filter((v) => valido(v?.asiento) && valido(v?.voto)).map((v) => ({ de: nombre(v.asiento), a: nombre(v.voto) }));
          const recibidos = lista(e.conteo).slice(0, n).map((votos, i) => ({ quien: nombre(i), votos })).filter((x) => x.votos > 0).sort((a, b) => b.votos - a.votos);
          hechos.push({ tipo: 'votos', filas, recibidos, empate: e.empate === true });
          break;
        }
        case 'muerte': {
          if (!valido(e.asiento)) break;
          const c = e.comprobacion, verdad = c ? (c.coincide ? ` Decía la verdad: era ${nombreRol(c.rolReal)}.` : ` Había mentido: decía ser ${nombreRol(c.rolDeclarado)}, pero era ${nombreRol(c.rolReal)}.`) : '';
          const enamorado = valido(e.pareja) ? ` Era uno de los enamorados: su pareja era ${nombre(e.pareja)}.` : ''; // la primera muerte de un enamorado descubre la pareja oculta (lobo 1.3.0)
          hechos.push({ tipo: 'hecho', texto: `${nombre(e.asiento)} ${CAUSAS[e.causa] ?? 'muere'}: su rol era ${nombreRol(e.rol)}.${verdad}${enamorado}` });
          break;
        }
        case 'disparo':
          if (valido(e.asiento) && valido(e.objetivo)) hechos.push({ tipo: 'hecho', texto: `${nombre(e.asiento)}, el cazador, dispara a ${nombre(e.objetivo)}.` });
          break;
        default: break; // `final` y cualquier evento nuevo no se publica a medias
      }
    }
  }
  return rondas.filter((r) => r.hechos.length);
}
