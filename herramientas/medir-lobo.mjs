// Medición puntual privada, cero API. Ejecutar: node herramientas/medir-lobo.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import juego from '../src/juegos/lobo.js';
import { crearRng } from '../src/rng.js';
import { decidirBot } from '../src/juegos/lobo-bots.js';
import { vistaDe } from '../src/juegos/lobo/vista.js';
import { comprobarPresupuestoLlamadas } from '../src/arena.js';

export function simular({ jugadores, seed, perfil, rondas12 = null, videntes12 = null, limiteLlamadasDuro = juego.limiteLlamadasDuro }) {
  const E = juego.crear(crearRng(seed), { jugadores });
  if (videntes12 !== null && (![1, 2].includes(videntes12) || jugadores !== 12 || rondas12 !== null)) {
    throw new Error('La comparación histórica de Videntes solo admite doce jugadores a seis rondas.');
  }
  let segundaVidente = null;
  if (videntes12 !== null) {
    // Reproducir el reparto emparejado del experimento antiguo solo cuando
    // se lo pide explícitamente. Por defecto se usa el reparto de producción.
    const roles = [...Array(3).fill('lobo'), 'vidente', 'bruja', 'cazador', 'cupido', ...Array(5).fill('aldeano')];
    const rngReparto = crearRng(seed);
    for (let i = roles.length - 1; i > 0; i--) {
      const j = Math.floor(rngReparto() * (i + 1));
      [roles[i], roles[j]] = [roles[j], roles[i]];
    }
    E.roles = roles;
  }
  if (videntes12 === 2) {
    // Mantener idénticos los asientos de todos los roles originales y promover
    // un aldeano al azar con un RNG independiente: no sesgar al primer asiento
    // (al que apunta el lobo agresivo) ni consumir azar de las decisiones.
    const candidatos = E.roles.flatMap((rol, i) => rol === 'aldeano' ? [i] : []);
    const rngPromocion = crearRng(seed ^ 0x76d2a931);
    segundaVidente = candidatos[Math.floor(rngPromocion() * candidatos.length)];
    E.roles[segundaVidente] = 'vidente';
  }
  // Variante exclusiva de esta herramienta: no cambiar CONFIGURACIONES ni
  // ofrecer un override del límite duro a las partidas reales de la arena.
  if (rondas12 !== null) {
    if (jugadores !== 12 || rondas12 !== 8) throw new Error('La variante experimental es solo mesa de 12 a ocho rondas.');
    E.maxRondas = rondas12;
  }
  const rngs = E.roles.map((_, i) => crearRng(seed ^ Math.imul(i + 1, 0x9e3779b1)));
  let llamadas = 0, cortePorLlamadas = null;
  while (!E.fin) {
    const activos = juego.activos(E);
    cortePorLlamadas = comprobarPresupuestoLlamadas({ limiteLlamadasDuro }, llamadas, activos);
    if (cortePorLlamadas) { juego.cerrarPorLimiteLlamadas(E, cortePorLlamadas); break; }
    const respuestas = activos.map((activo, i) => {
      if (!activo) return null;
      llamadas++;
      return decidirBot(vistaDe(E, i), perfil[E.roles[i]] ?? 'mayoria', rngs[i]);
    });
    juego.aplicar(E, respuestas);
    if (E.historial.length > juego.rondas) throw new Error('Motor estancado.');
  }
  const votos = E.eventos.filter((e) => e.tipo === 'votacion');
  const inspecciones = E.inspecciones.flat();
  const porVidente = E.roles.flatMap((rol, i) => rol === 'vidente' ? [{ asiento: i, inspecciones: E.inspecciones[i].length,
    aciertos: E.inspecciones[i].filter((x) => x.esLobo).length }] : []);
  // Todas las inspecciones las resuelve el motor, también al comparar el
  // reparto histórico: no duplicar la segunda inspección ni sus puntos aquí.
  if (porVidente.some((v) => v.inspecciones !== E.stats[v.asiento].acciones - E.historial.filter((r) => r.fase === 'dia' && r.privado.acciones.some((a) => a.asiento === v.asiento)).length)) {
    throw new Error('Una Vidente no resolvió exactamente sus propias llamadas nocturnas.');
  }
  return { seed, ganador: E.ganadorBando ?? 'empate', motivo: E.motivoFin, rondas: E.ronda, llamadas,
    videntes: porVidente.length, segundaVidente, porVidente,
    lobosDetectadosDistintos: new Set(inspecciones.filter((x) => x.esLobo).map((x) => x.objetivo)).size,
    objetivosInspeccionadosDistintos: new Set(inspecciones.map((x) => x.objetivo)).size,
    pasos: E.historial.length, cortePorLlamadas,
    votaciones: votos.length, empatesVoto: votos.filter((v) => v.empate).length,
    inspecciones: inspecciones.length, aciertosVidente: inspecciones.filter((v) => v.esLobo).length,
    invalidas: E.stats.reduce((n, s) => n + s.invalidas, 0),
    pareja: E.enamorados.map((i) => E.roles[i] === 'lobo' ? 'lobo' : 'aldea').sort().join('+'),
    puntos: [...E.puntos],
  };
}

export function medir(partidasPorPerfil = 100, { mesas = [8, 12], ...experimento } = {}) {
  if (!Number.isInteger(partidasPorPerfil) || partidasPorPerfil < 1) throw new Error('Cantidad inválida.');
  const grupos = [];
  // Factorial completo de los cuatro pares: 16 cruces, mismos seeds entre perfiles.
  for (const jugadores of mesas) for (const lobo of ['agresivo', 'silencioso']) for (const vidente of ['revela', 'calla']) for (const bruja of ['rapida', 'guarda']) for (const aldeano of ['mayoria', 'contradice']) {
    const perfil = { lobo, vidente, bruja, aldeano, cazador: aldeano, cupido: aldeano };
    const partidas = Array.from({ length: partidasPorPerfil }, (_, i) => simular({ jugadores, seed: 20261024 + i, perfil, ...experimento }));
    grupos.push({ jugadores, perfil, partidas });
  }
  return grupos;
}

export function resumir(partidas) {
  const n = partidas.length, suma = (k) => partidas.reduce((s, p) => s + p[k], 0);
  const con = partidas.filter((p) => p.aciertosVidente > 0), sin = partidas.filter((p) => !p.aciertosVidente);
  const tasaAldea = (lista) => lista.length ? lista.filter((p) => p.ganador === 'aldea').length / lista.length : null;
  return { partidas: n, aldea: tasaAldea(partidas), lobos: partidas.filter((p) => p.ganador === 'lobos').length / n,
    empate: partidas.filter((p) => p.ganador === 'empate').length / n,
    tope: partidas.filter((p) => p.motivo === 'tope').length / n,
    corteLlamadas: partidas.filter((p) => p.motivo === 'llamadas').length / n,
    maxPasos: Math.max(...partidas.map((p) => p.pasos ?? 0)),
    rondas: suma('rondas') / n, llamadas: suma('llamadas') / n, maxLlamadas: Math.max(...partidas.map((p) => p.llamadas)),
    empatesVoto: suma('empatesVoto') / suma('votaciones'),
    aciertoInspeccion: suma('aciertosVidente') / suma('inspecciones'),
    conHallazgo: con.length, aldeaConHallazgo: tasaAldea(con), aldeaSinHallazgo: tasaAldea(sin), invalidas: suma('invalidas') };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cantidad = Number(process.argv.find((a) => a.startsWith('--partidas='))?.split('=')[1] ?? 100);
  const comparar = process.argv.find((a) => a.startsWith('--comparar-12='))?.split('=')[1];
  const compararVidentes = process.argv.find((a) => a.startsWith('--comparar-videntes='))?.split('=')[1];
  if (compararVidentes !== undefined && (compararVidentes !== '2' || comparar !== undefined)) throw new Error('Usar --comparar-videntes=2 sin mezclar --comparar-12.');
  if (comparar !== undefined && comparar !== '8') throw new Error('Usar --comparar-12=8.');
  if (compararVidentes) {
    const variantes = [1, 2].map((videntes12) => {
      const grupos = medir(cantidad, { mesas: [12], videntes12 });
      const partidas = grupos.flatMap((g) => g.partidas);
      const resumen = resumir(partidas);
      const inspecciones = partidas.reduce((s, p) => s + p.inspecciones, 0);
      const aciertos = partidas.reduce((s, p) => s + p.aciertosVidente, 0);
      return { videntes: videntes12, rondas: 6, limiteLlamadasDuro: juego.limiteLlamadasDuro,
        resumen: { ...resumen, inspecciones, aciertos,
          inspeccionesMedias: inspecciones / partidas.length,
          lobosDetectadosDistintosMedios: partidas.reduce((s, p) => s + p.lobosDetectadosDistintos, 0) / partidas.length,
          objetivosInspeccionadosDistintosMedios: partidas.reduce((s, p) => s + p.objetivosInspeccionadosDistintos, 0) / partidas.length },
        grupos: grupos.map((g) => ({ ...g, resumen: resumir(g.partidas) })) };
    });
    const ruta = 'privado/entregas/lobo/medicion.json';
    const aceptada = JSON.parse(await readFile(ruta, 'utf8'));
    aceptada.comparacionVidentes12 = { seedInicial: 20261024, partidasPorPerfil: cantidad,
      promocion: 'Aldeano sorteado con RNG independiente seed XOR 0x76d2a931; demás roles conservan asiento', variantes };
    await writeFile(ruta, JSON.stringify(aceptada, null, 2) + '\n');
    console.log(JSON.stringify(variantes.map(({ videntes, resumen }) => ({ videntes, ...resumen })), null, 2));
  } else if (comparar) {
    const variantes = [
      { nombre: '6 rondas, corte 100', opciones: {} },
      { nombre: '8 rondas, corte 100', opciones: { rondas12: 8 } },
      { nombre: '8 rondas, diagnóstico sin corte (solo bots)', opciones: { rondas12: 8, limiteLlamadasDuro: null } },
    ].map(({ nombre, opciones }) => {
      const grupos = medir(cantidad, { mesas: [12], ...opciones });
      return { nombre, opciones, resumen: resumir(grupos.flatMap((g) => g.partidas)), grupos: grupos.map((g) => ({ ...g, resumen: resumir(g.partidas) })) };
    });
    const ruta = 'privado/entregas/lobo/medicion.json';
    const aceptada = JSON.parse(await readFile(ruta, 'utf8'));
    // Conservar exactamente los datos aceptados de 8 y 12 a seis rondas.
    aceptada.comparacionRondas12 = { seedInicial: 20261024, partidasPorPerfil: cantidad, variantes };
    await writeFile(ruta, JSON.stringify(aceptada, null, 2) + '\n');
    console.log(JSON.stringify(variantes.map(({ nombre, resumen }) => ({ nombre, ...resumen })), null, 2));
  } else {
    const grupos = medir(cantidad);
    const salida = { version: juego.versionReglas, seedInicial: 20261024, partidasPorPerfil: cantidad,
      resumen: [8, 12].map((jugadores) => ({ jugadores, ...resumir(grupos.filter((g) => g.jugadores === jugadores).flatMap((g) => g.partidas)) })),
      grupos: grupos.map((g) => ({ ...g, resumen: resumir(g.partidas) })) };
    await mkdir('privado/entregas/lobo', { recursive: true });
    await writeFile('privado/entregas/lobo/medicion.json', JSON.stringify(salida, null, 2) + '\n');
    console.log(JSON.stringify({ resumen: salida.resumen, perfiles: grupos.length }, null, 2));
  }
}
