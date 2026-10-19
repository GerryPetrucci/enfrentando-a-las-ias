// Lo que pasa en el disco cuando se sube una parte de un video (politica en src/publicacion.js y en CLAUDE.md): se guarda en el registro, se arma el archivo PUBLICO de la serie (data/publicas/) segun el estado de
// cada partida, se respalda el archivo completo en privado/ y se regenera el marcador del sitio. Nunca hace commit ni push: eso lo decide quien lo corre.

import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { obtenerJuego } from './juegos/index.js';
import { construirSistema } from './prompt.js';
import { armarSeriePublica, registrarParte, esParteFinal, ultimaRonda, PUBLICADA } from './publicacion.js';
import { armarMarcador, leerEpisodios } from './marcador.js';

const entero = (x) => Number.isInteger(x) && x >= 1;

export function publicarParte({ raiz, archivo, partida, parte = null, hasta, final = null, fecha = new Date().toISOString().slice(0, 10), forzar = false }) {
  if (!entero(partida)) throw new Error('--partida debe ser el numero de la partida (1 o mas).');
  if (!entero(hasta)) throw new Error('--hasta debe ser el numero del ultimo turno que cubre la parte (1 o mas).');
  const ruta = resolve(raiz, 'data', archivo);
  if (!existsSync(ruta)) throw new Error(`No encuentro ${join('data', archivo)}.`);
  const crudo = JSON.parse(readFileSync(ruta, 'utf8'));
  const p = crudo.partidas?.[partida - 1];
  if (!p) throw new Error(`La serie no tiene la partida ${partida} (tiene ${crudo.partidas?.length ?? 0}).`);

  const juego = obtenerJuego(crudo.juego?.id), avisos = [];
  const sistema = construirSistema(juego);
  const coincide = !crudo.prompt?.hash || createHash('sha256').update(sistema).digest('hex') === crudo.prompt.hash;
  if (!coincide) {
    if (!forzar) throw new Error('Las reglas del juego cambiaron desde esa corrida (el prompt de sistema ya no es el mismo): los prompts publicados no serian los que vieron las IAs. Usa --forzar si aun asi quieres publicar.');
    avisos.push('Las reglas del juego cambiaron desde esa corrida: se publica SIN el prompt de sistema y sin prompts reconstruidos.');
  }

  const ultima = ultimaRonda(p);
  const turno = Math.min(hasta, ultima || hasta);
  const esFinal = esParteFinal(p, turno);
  if (final === true && !esFinal) throw new Error(`La parte no llega al ultimo turno de la partida (${turno} de ${ultima}): no es la final. Si lo es, revisa --hasta.`);
  if (final === false && esFinal) throw new Error(`La parte llega al ultimo turno de la partida (${ultima}): es la final y dice el resultado.`);

  const rutaRegistro = join(raiz, 'data', 'publicas', 'registro.json');
  const registro = existsSync(rutaRegistro) ? JSON.parse(readFileSync(rutaRegistro, 'utf8')) : { series: {} };
  const previas = registro.series?.[crudo.etiqueta]?.partidas?.[partida]?.partes ?? [];
  const numeroDeParte = Number.isInteger(parte) && parte >= 1 ? parte : Math.max(0, ...previas.map((x) => x.parte)) + 1;
  const nuevo = registrarParte(registro, { etiqueta: crudo.etiqueta, partida, parte: numeroDeParte, hastaTurno: turno, final: esFinal, fecha });

  const porPartida = (n, hastaN) => {
    if (!coincide || typeof juego.reconstruirPrompts !== 'function') return null;
    const r = juego.reconstruirPrompts(crudo.partidas[n - 1], hastaN ?? Infinity);
    if (!r.fiel) { avisos.push(`La rejugada de la partida ${n} no coincide con lo guardado: los prompts NO se publican.`); return null; }
    return { turnos: r.turnos };
  };
  const publica = armarSeriePublica(crudo, nuevo.series[crudo.etiqueta], { sistema: coincide ? sistema : null, porPartida });

  mkdirSync(join(raiz, 'data', 'publicas'), { recursive: true });
  const rutaPublica = join(raiz, 'data', 'publicas', `${crudo.etiqueta}.json`);
  writeFileSync(rutaPublica, JSON.stringify(publica));
  writeFileSync(rutaRegistro, JSON.stringify(nuevo, null, 2));

  // los datos completos (con el resultado) se respaldan en privado/, que tiene su propio repo: hasta publicarse no estan en ningun lado del repo publico
  const respaldo = existsSync(join(raiz, 'privado'));
  if (respaldo) {
    mkdirSync(join(raiz, 'privado', 'datos-oficiales'), { recursive: true });
    copyFileSync(ruta, join(raiz, 'privado', 'datos-oficiales', basename(ruta)));
  }

  mkdirSync(join(raiz, 'web'), { recursive: true });
  writeFileSync(join(raiz, 'web', 'marcador.json'), JSON.stringify(armarMarcador(leerEpisodios(join(raiz, 'data', 'publicas'))), null, 2));

  return {
    etiqueta: crudo.etiqueta, partida, parte: numeroDeParte, hasta: turno, final: esFinal, detectada: final === null, seed: p.seed ?? crudo.seedBase,
    estadoPartida: nuevo.series[crudo.etiqueta].partidas[partida].estado, estadoSerie: publica.publicacion.estado, archivoPublico: join('data', 'publicas', `${crudo.etiqueta}.json`), respaldo, avisos,
    publicadaEntera: publica.publicacion.estado === PUBLICADA,
  };
}
