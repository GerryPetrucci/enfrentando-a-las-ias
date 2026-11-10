#!/usr/bin/env node
// «Solo mirar el mapa»: crea el mundo de la era (espejo, muro, biomas, minerales) con los parámetros que elijas, SIN jugar la partida, y lo deja
// pausado para que lo explores en el juego con tu ratón y tu interfaz. Mide cuánto tarda en generarse y, si pides años, cuánto cuesta avanzarlos.
// Sin modelos, sin API. Para el juego real necesita las variables del puente (las pone worldbox-puente/grabar-era.ps1 -Modo mundo).
//
//   node herramientas/worldbox-era-mundo.mjs --adaptador=http --tamano=large --plantilla=pancake --ancho-muro=8
//   node herramientas/worldbox-era-mundo.mjs --adaptador=http --mapa-guardado=simetrico-prueba --anios=30 --velocidad-desarrollo=x40
//   Opciones: --tamano=tiny|small|standard|large|huge  (o --mapa=N)  --plantilla=continent|boring_plains|pancake  --mapa-guardado=NOMBRE|slotN
//             --ancho-muro=0 (sin muro)|2..16  --cantidad-minerales=1..24  --velocidad-desarrollo=xN  --anios=N  --zoom=N  --sin-esperar  --espera-ms=N (queda pausado N ms y suelta solo)
//             --respuestas=<carpeta> (toma raza, mineral y bioma de a/ y b/ etapa1)  --raza-a --raza-b --mineral-a --mineral-b --bioma-a --bioma-b
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';
import { crearAdaptadorHttp } from '../src/worldbox/adaptador-http.js';
import { crearAdaptadorEraSimulado } from '../src/worldbox/era/adaptador-era-simulado.js';
import { partidaDesdeCli } from '../src/worldbox/era/correr-era.js';
import { validarPartida, opcionesControlEra } from '../src/worldbox/era/reglas-era.js';
import { cargarAlmacen, accesoRespuestas } from '../src/worldbox/era/respuestas/almacen.js';
import { evaluarTexto } from '../src/worldbox/era/respuestas/verificar.js';
import { leerArgumentos } from './worldbox-era-verificar.mjs';
import { resolverPresentacion } from '../src/worldbox/era/presentacion-era.js';

const mediana = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

export async function main(args = process.argv.slice(2), { salida = t => console.log(t), env = process.env, entrada = process.stdin, adaptador: inyectado = null } = {}) {
  const o = leerArgumentos(args);
  const partida = partidaDesdeCli({ ...o, respuestas: undefined, anios: undefined, 'sin-esperar': undefined, 'espera-ms': undefined, zoom: undefined });
  validarPartida(partida);
  const eleccion = { f1: { raza: o['raza-a'] ?? 'human', mineral: o['mineral-a'] ?? 'mineral_stone', bioma: o['bioma-a'] ?? null }, f2: { raza: o['raza-b'] ?? 'human', mineral: o['mineral-b'] ?? 'mineral_stone', bioma: o['bioma-b'] ?? null } };
  if (o.respuestas) {
    const almacen = await cargarAlmacen(resolve(o.respuestas));
    for (const id of ['f1', 'f2']) {
      const r = accesoRespuestas(almacen, id).obtener('etapa1', 0);
      const v = r ? evaluarTexto('etapa1', r.texto).validacion : null;
      if (!v?.ok) { salida(`No puedo leer una etapa 1 válida de ${id === 'f1' ? 'a' : 'b'}/ en ${o.respuestas}; revisa con worldbox-era-verificar.mjs.`); return 1; }
      eleccion[id] = v.eleccion;
    }
  }
  const adaptador = inyectado ?? (o.adaptador === 'http' ? crearAdaptadorHttp({ url: env.WORLDBOX_PUENTE_URL, token: env.WORLDBOX_PUENTE_TOKEN, timeoutMs: 120000 }) : crearAdaptadorEraSimulado());
  const info = await adaptador.info();
  const ids = ['f1', 'f2'];
  const era = { espejo: true, ...opcionesControlEra(partida), ...(partida.muroAncho > 0 ? { muro: { ancho: partida.muroAncho } } : {}), leyes: partida.leyes, edad: partida.edad, pausar_edades: true,
    biomas: Object.fromEntries(ids.filter(id => eleccion[id].bioma).map(id => [id, eleccion[id].bioma])),
    minerales: ids.map(id => ({ faccion: id, mineral: eleccion[id].mineral, cantidad: partida.cantidadMinerales, radio: partida.radioMinerales })) };
  // E10: --modelo-a/-b, --nombre-reino-a/-b, --color-a/-b, --colores-juego (los mismos que la partida): nombre y color de cada reino.
  if (['modelo-a', 'modelo-b', 'nombre-reino-a', 'nombre-reino-b', 'color-a', 'color-b', 'colores-juego', 'sin-capa-reinos'].some(k => o[k] !== undefined)) {
    era.facciones = resolverPresentacion({ participantes: [{ id: 'f1', modelo: o['modelo-a'] ?? 'modelo-a' }, { id: 'f2', modelo: o['modelo-b'] ?? 'modelo-b' }], o }).facciones;
    if (o['sin-capa-reinos'] === true) era.mapa_reinos = false;
  }
  const opciones = { velocidad: partida.velocidadDesarrollo, plantilla: partida.plantilla, unidades_iniciales: partida.unidadesIniciales, era, ...(partida.mapaGuardado ? { mapa: partida.mapaGuardado } : {}) };
  salida(`Creando el mundo: tamaño ${partida.tamanoMapa}, plantilla ${partida.plantilla ?? 'continent (por omisión)'}${partida.mapaGuardado ? `, mapa guardado ${partida.mapaGuardado}` : ''}, muro ${partida.muroAncho > 0 ? `${partida.muroAncho} casillas` : 'ninguno'}, minerales ${partida.cantidadMinerales} por lado, velocidad ${partida.velocidadDesarrollo}...`);
  const t0 = Date.now();
  let r, intentos = 0, ultimo;
  while (!r && intentos < partida.intentosMundo) { intentos++; try { r = await adaptador.reiniciarEscenario({ semilla: Number(o.semilla ?? 1), tamano_mapa: partida.tamanoMapa, facciones: ids.map(id => ({ id, especie: eleccion[id].raza })), opciones }); } catch (e) { ultimo = e; if (e.codigo !== 'error_interno') throw e; } }
  if (!r) throw ultimo;
  const generacionMs = Date.now() - t0;
  const resumen = { generacion_ms: generacionMs, intentos, mundo: r.mundo ?? null, hash_mundo: r.hash_mundo, era: r.era ?? null, calidad_sitio: Object.fromEntries((r.facciones ?? []).filter(f => f.calidad_sitio !== undefined).map(f => [f.id, f.calidad_sitio])) };
  salida(`Mundo creado en ${(generacionMs / 1000).toFixed(1)} s (${intentos} intento(s)).`);
  salida(JSON.stringify(resumen, null, 2));
  if (info.capacidades?.interfaz && typeof adaptador.interfaz === 'function') { try { await adaptador.interfaz({ visible: true }); } catch { /* sin interfaz */ } }
  if (o.zoom !== undefined && typeof adaptador.camara === 'function') { try { await adaptador.camara({ faccion: 'f1', zoom: Number(o.zoom) }); salida(`Cámara en zoom ${o.zoom} sobre la civilización A.`); } catch (e) { salida(`La cámara no respondió (${e.codigo ?? e.message}).`); } }
  let estado = await adaptador.era.estado(0);
  salida(`Año ${estado.anio}: ${estado.civilizaciones.map(c => `${c.id} ${c.especie} población ${c.poblacion}, ciudades ${c.ciudades}`).join(' | ')}; muro ${estado.muro.puesto ? 'puesto' : 'no hay'}.`);
  const anios = Number(o.anios ?? 0);
  if (anios > 0) {
    const tiempos = [], ini = Date.now();
    for (let i = 0; i < anios; i++) { const t = Date.now(); await adaptador.avanzar({ segundos_juego: partida.segundosAvance }); tiempos.push(Date.now() - t); }
    estado = await adaptador.era.estado(0);
    salida(`Avanzados ${anios} años a ${partida.velocidadDesarrollo} en ${((Date.now() - ini) / 1000).toFixed(1)} s (mediana ${mediana(tiempos)} ms por año, máx ${Math.max(...tiempos)} ms). Año ${estado.anio}: ${estado.civilizaciones.map(c => `${c.id} población ${c.poblacion}, ciudades ${c.ciudades}, territorio ${c.territorio}`).join(' | ')}.`);
  }
  if (o['espera-ms'] !== undefined) {
    salida(`El mundo queda pausado ${Number(o['espera-ms']) / 1000} s (para capturas o pruebas)...`);
    await new Promise(res => setTimeout(res, Number(o['espera-ms'])));
  } else if (o['sin-esperar'] !== true) {
    salida('El mundo está PAUSADO y es tuyo: explóralo en el juego (cámara, ventanas, mapa político...). Pulsa Enter aquí para soltar el juego.');
    await new Promise(res => { const rl = createInterface({ input: entrada, terminal: false }); rl.once('line', () => { rl.close(); res(); }); rl.once('close', res); });
  }
  try { await adaptador.cerrar(); } catch { /* ya estaba cerrado */ }
  return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().then(c => { process.exitCode = c; }).catch(e => { console.error(`worldbox-era-mundo: ${e.codigo ?? e.message}`); process.exitCode = 1; });
}
