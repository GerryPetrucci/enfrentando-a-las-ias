// Prueba EN VIVO del puente DENTRO de WorldBox (lote W5). Se salta siempre salvo con WORLDBOX_VIVO=1:
// nunca corre en la suite normal ni sin el juego abierto con PuenteWorldBox.dll instalado.
//
//   $env:WORLDBOX_VIVO = '1'; node --test src/pruebas/worldbox/puente-vivo.test.js
//
// Variables opcionales: WORLDBOX_PUENTE_URL (por defecto http://127.0.0.1:47600) y WORLDBOX_PUENTE_TOKEN
// (si falta, se lee puente-token.txt de la carpeta de datos del juego). No usa API de modelos ni lee .env.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { crearAdaptadorHttp } from '../../worldbox/adaptador-http.js';
import { comprobarAdaptador } from '../../worldbox/adaptador.js';

const VIVO = process.env.WORLDBOX_VIVO === '1';
const URL_BASE = process.env.WORLDBOX_PUENTE_URL ?? 'http://127.0.0.1:47600';

function leerToken() {
  if (process.env.WORLDBOX_PUENTE_TOKEN) return process.env.WORLDBOX_PUENTE_TOKEN.trim();
  const ruta = join(process.env.USERPROFILE ?? '', 'AppData', 'LocalLow', 'mkarpenko', 'WorldBox', 'puente-token.txt');
  return existsSync(ruta) ? readFileSync(ruta, 'utf8').trim() : '';
}

describe('puente dentro de WorldBox (WORLDBOX_VIVO=1)', { skip: !VIVO && 'se ejecuta solo con WORLDBOX_VIVO=1 y el juego abierto' }, () => {
  let token, a;
  before(() => {
    token = leerToken();
    assert.ok(token, 'falta el token del puente (puente-token.txt o WORLDBOX_PUENTE_TOKEN)');
    a = crearAdaptadorHttp({ url: URL_BASE, token, timeoutMs: 60000 });
  });

  it('exige token y rechaza Origin ajeno', async () => {
    const sinToken = await fetch(`${URL_BASE}/v1/info`);
    assert.equal(sinToken.status, 401);
    const conOrigin = await fetch(`${URL_BASE}/v1/info`, { headers: { 'X-Puente-Token': token, Origin: 'http://ejemplo.invalido' } });
    assert.equal(conOrigin.status, 403);
    assert.equal(conOrigin.headers.get('access-control-allow-origin'), null);
  });

  it('/v1/info anuncia capacidades honestas y solo acciones verificadas', async () => {
    const info = await a.info();
    assert.equal(info.estado, 'listo');
    assert.equal(info.capacidades.semilla, false, 'la semilla no controla el mundo de WorldBox');
    assert.equal(info.determinista, false);
    for (const k of ['reiniciar', 'avanzar', 'terminal', 'multi_faccion']) assert.equal(info.capacidades[k], true, k);
    assert.ok(info.acciones.length > 0);
    assert.ok(info.acciones.every(x => x.verificada === true && !/EN PRUEBA/.test(x.descripcion)));
  });

  it('contrato del adaptador: reinicio, observacion, avance y estado terminal', async () => {
    const info = await comprobarAdaptador(a, { escenario: { semilla: 3, tamano_mapa: 192, facciones: [{ id: 'a' }, { id: 'b' }], opciones: { max_acciones: 3 } } });
    assert.equal(info.estado, 'listo');
  });

  it('crear_unidades sube la poblacion; avanzar corre el tiempo pedido (+ un cuadro) y la pausa congela', async () => {
    const r = await a.reiniciarEscenario({ semilla: 5, tamano_mapa: 192, facciones: [{ id: 'a' }, { id: 'b' }], opciones: { max_acciones: 3 } });
    assert.equal(r.facciones.length, 2);
    const antes = await a.observar('a');
    assert.equal(antes.tiempo_juego_s, 0);
    assert.ok(antes.faccion.vivo && antes.faccion.ciudades >= 1 && antes.faccion.poblacion >= 1);
    const x = await a.ejecutar({ faccion: 'a', accion: 'crear_unidades', parametros: { cantidad: 2 } });
    assert.equal(x.resultado, 'ejecutada');
    const despues = await a.observar('a');
    assert.equal(despues.faccion.poblacion, antes.faccion.poblacion + 2);
    const av = await a.avanzar({ segundos_juego: 5 });
    assert.ok(av.tiempo_juego_s >= 5 && av.tiempo_juego_s < 5.6, `tiempo_juego_s=${av.tiempo_juego_s}`);
    const p1 = await a.observar('a');
    await new Promise(res => setTimeout(res, 1500));
    const p2 = await a.observar('a');
    assert.deepEqual(p2, p1, 'entre turnos la simulacion esta pausada');
  });

  it('rechaza parametros fuera de rango y acciones desconocidas sin tocar el juego', async () => {
    const mal = await a.ejecutar({ faccion: 'a', accion: 'crear_unidades', parametros: { cantidad: 99 } });
    assert.equal(mal.resultado, 'rechazada');
    const desc = await a.ejecutar({ faccion: 'a', accion: 'borrar_mundo', parametros: {} });
    assert.equal(desc.resultado, 'rechazada');
  });

  it('cerrar libera el escenario', async () => {
    assert.deepEqual(await a.cerrar(), { cerrado: true });
  });

  // --- X2: arreglos tras la revision independiente R1 (un caso por arreglo) ----------------------
  describe('X2: objetivo invalido, idempotencia, todo o nada, topes, costos y semilla', () => {
    let n = 0;
    async function crudo(metodo, ruta, datos) {
      const cuerpo = datos === undefined ? undefined : JSON.stringify({ protocolo: 1, id_solicitud: `x2-${++n}-${Date.now()}`, ...datos });
      const res = await fetch(URL_BASE + ruta, {
        method: metodo, body: cuerpo, signal: AbortSignal.timeout(120000),
        headers: { 'X-Puente-Token': token, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) },
      });
      const texto = await res.text();
      let json; try { json = JSON.parse(texto); } catch { /* no es JSON */ }
      return { estado: res.status, json, texto, cab: res.headers };
    }
    const escenario = (opciones = {}, semilla = 1) => crudo('POST', '/v1/escenario/reiniciar',
      { semilla, tamano_mapa: 192, facciones: [{ id: 'a' }, { id: 'b' }], opciones: { velocidad: 'x20', ...opciones } });
    const accion = (faccion, nombre, parametros = {}) => crudo('POST', '/v1/accion', { faccion, accion: nombre, parametros });
    const observacion = async f => { const r = await crudo('GET', `/v1/observacion?faccion=${f}`); assert.equal(r.estado, 200, r.texto); return r.json; };
    const avanzar = async s => { const r = await crudo('POST', '/v1/avanzar', { segundos_juego: s }); assert.equal(r.estado, 200, r.texto); return r.json; };

    it('hallazgo 9: /v1/info anuncia puntos y cooldown del reglamento y el cliente de W3 los conserva', async () => {
      const esperado = { crear_unidades: [2, 1], bendecir: [1, 1], maldecir: [2, 2], incendiar: [2, 2], donar_recursos: [1, 0], declarar_guerra: [3, 5], pedir_paz: [1, 0] };
      const crudoInfo = await crudo('GET', '/v1/info');
      assert.equal(crudoInfo.estado, 200);
      const real = Object.fromEntries(crudoInfo.json.acciones.map(x => [x.nombre, [x.puntos, x.cooldown]]));
      assert.deepEqual(real, esperado);
      const viaCliente = await a.info();
      assert.deepEqual(Object.fromEntries(viaCliente.acciones.map(x => [x.nombre, [x.puntos, x.cooldown]])), esperado);
      assert.ok(crudoInfo.json.acciones.every(x => !/EN PRUEBA/.test(x.descripcion)), 'solo acciones verificadas');
    });

    it('hallazgo 11: semilla entera de 0 a 2147483647; -1 y 2147483648 son 400', async () => {
      for (const semilla of [-1, 2 ** 31, -(2 ** 31), 1.5]) {
        const r = await escenario({}, semilla);
        assert.equal(r.estado, 400, `${semilla}: ${r.texto}`);
        assert.equal(r.json.error.codigo, 'solicitud_invalida');
        assert.match(r.json.error.mensaje, /semilla/);
      }
      for (const semilla of [0, 2 ** 31 - 1]) {
        const r = await escenario({}, semilla);
        assert.equal(r.estado, 200, `${semilla}: ${r.texto}`);
      }
    });

    it('hallazgo 1: objetivo inexistente o propio -> rechazada (HTTP 200) sin tocar el mundo; nombre de accion raro -> accion_desconocida', async () => {
      assert.equal((await escenario()).estado, 200);
      const antes = await observacion('a');
      const casos = [['maldecir', { gotas: 1 }], ['incendiar', { gotas: 1 }], ['declarar_guerra', {}], ['pedir_paz', {}]];
      for (const [nombre, extra] of casos) {
        for (const objetivo of ['fantasma', 'Z', 'a b', 'x'.repeat(40)]) {
          const r = await accion('a', nombre, { objetivo, ...extra });
          assert.equal(r.estado, 200, `${nombre} ${objetivo}: ${r.texto}`);
          assert.equal(r.json.resultado, 'rechazada');
          assert.equal(r.json.codigo, 'objetivo_invalido', r.texto);
        }
        const propio = await accion('a', nombre, { objetivo: 'a', ...extra });
        assert.equal(propio.estado, 200);
        assert.equal(propio.json.codigo, 'objetivo_propio', propio.texto);
      }
      for (const nombre of ['', 'x'.repeat(81), 'x'.repeat(5000), 'bendecir\u0001', 'bendecir\n']) {
        const r = await accion('a', nombre, { gotas: 1 });
        assert.equal(r.estado, 200, `${JSON.stringify(nombre.slice(0, 12))}: ${r.texto.slice(0, 160)}`);
        assert.equal(r.json.codigo, 'accion_desconocida');
      }
      assert.deepEqual(await observacion('a'), antes, 'ningun rechazo modifico el mundo');
      assert.equal((await crudo('POST', '/v1/accion', { faccion: 'a', accion: 5, parametros: {} })).estado, 400, 'accion que no es texto sigue siendo solicitud rota');
    });

    it('hallazgo 7: crear_unidades sin espacio -> rechazada/sin_espacio y el mundo queda igual (todo o nada)', async () => {
      assert.equal((await escenario({ radio_creacion: 0 })).estado, 200);
      const antes = await observacion('a');
      const r = await accion('a', 'crear_unidades', { cantidad: 3 });
      assert.equal(r.estado, 200, r.texto);
      assert.equal(r.json.resultado, 'rechazada', r.texto);
      assert.equal(r.json.codigo, 'sin_espacio');
      assert.deepEqual(await observacion('a'), antes, 'sin espacio no crea ninguna unidad ni consume cupo');
      assert.equal((await escenario()).estado, 200);
      const normal = await accion('a', 'crear_unidades', { cantidad: 3 });
      assert.equal(normal.json.resultado, 'ejecutada', normal.texto);
      assert.deepEqual([normal.json.efecto.pedidas, normal.json.efecto.creadas], [3, 3], 'efecto exacto');
    });

    it('hallazgo 9: topes por faccion y partida de 10 unidades, 10 poderes y 100 recursos (cupos visibles; mecanismo con topes bajados)', async () => {
      assert.equal((await escenario()).estado, 200);
      const y0 = (await observacion('a')).faccion;
      assert.deepEqual([y0.unidades_creables_restantes, y0.poderes_restantes, y0.donacion_restante], [10, 10, 100], 'cupos por defecto del reglamento');

      // unidades: 5 + 5 y la tercera se rechaza
      assert.equal((await accion('a', 'crear_unidades', { cantidad: 5 })).json.resultado, 'ejecutada');
      assert.equal((await accion('a', 'crear_unidades', { cantidad: 5 })).json.resultado, 'ejecutada');
      const tope = await accion('a', 'crear_unidades', { cantidad: 1 });
      assert.equal(tope.json.resultado, 'rechazada');
      assert.equal(tope.json.codigo, 'tope_unidades');
      const yo = (await observacion('a')).faccion;
      assert.equal(yo.unidades_creadas, 10);
      assert.equal(yo.unidades_creables_restantes, 0);

      // poderes: cada uso con gotas cuesta un cupo; sin objetivos (todas benditas) NO lo consume
      const b1 = await accion('a', 'bendecir', { gotas: 1 });
      assert.equal(b1.json.resultado, 'ejecutada', b1.texto);
      assert.equal((await observacion('a')).faccion.poderes_restantes, 9);
      let saturado = null;
      for (let i = 0; i < 12 && !saturado; i++) {
        const r = await accion('a', 'bendecir', { gotas: 1 });
        if (r.json.resultado !== 'ejecutada') saturado = r;
      }
      assert.ok(saturado, 'tarde o temprano todas las unidades quedan benditas');
      assert.equal(saturado.json.codigo, 'sin_objetivos');
      const usados = 10 - (await observacion('a')).faccion.poderes_restantes;
      assert.ok(usados >= 1 && usados <= 10);
      assert.equal((await accion('a', 'bendecir', { gotas: 1 })).json.codigo, 'sin_objetivos');
      assert.equal(10 - (await observacion('a')).faccion.poderes_restantes, usados, 'un poder sin objetivos no gasta cupo');

      // el mecanismo de los topes de poderes y de recursos, con topes BAJADOS (solo pueden bajar) para que sea rapido
      assert.equal((await escenario({ tope_poderes: 2, tope_donado: 30 })).estado, 200);
      const c = await observacion('a');
      assert.deepEqual([c.faccion.poderes_restantes, c.faccion.donacion_restante], [2, 30]);
      assert.equal((await accion('a', 'maldecir', { objetivo: 'b', gotas: 1 })).json.resultado, 'ejecutada');
      assert.equal((await accion('a', 'incendiar', { objetivo: 'b', gotas: 1 })).json.resultado, 'ejecutada');
      const topePoder = await accion('a', 'maldecir', { objetivo: 'b', gotas: 1 });
      assert.equal(topePoder.json.resultado, 'rechazada');
      assert.equal(topePoder.json.codigo, 'tope_poderes');
      assert.equal((await observacion('a')).faccion.poderes_restantes, 0);

      // donar: hace falta un almacen en la ciudad (aparece tras algunos segundos de juego)
      let donado = 0, codigo = null;
      for (let i = 0; i < 40 && codigo !== 'tope_donacion'; i++) {
        const r = await accion('a', 'donar_recursos', { recurso: 'wood', cantidad: 10 });
        if (r.json.resultado === 'ejecutada') { donado += r.json.efecto.agregados; continue; }
        codigo = r.json.codigo;
        if (codigo === 'sin_almacen') { await avanzar(60); codigo = null; } else assert.equal(codigo, 'tope_donacion', r.texto);
      }
      assert.equal(codigo, 'tope_donacion', 'se llego al tope de recursos donados');
      assert.equal(donado, 30, 'tres donaciones de 10 llegan justo al tope bajado; la cuarta se rechaza');
      assert.equal((await observacion('a')).faccion.donacion_restante, 30 - donado);
    });
    it('hallazgo 4: seis solicitudes identicas a la vez ejecutan una vez (la poblacion sube una sola vez)', async () => {
      assert.equal((await escenario()).estado, 200);
      const antes = (await observacion('a')).faccion.poblacion;
      const cuerpo = JSON.stringify({ protocolo: 1, id_solicitud: `x2-conc-${Date.now()}`, faccion: 'a', accion: 'crear_unidades', parametros: { cantidad: 2 } });
      const res = await Promise.all(Array.from({ length: 6 }, () => fetch(`${URL_BASE}/v1/accion`, {
        method: 'POST', body: cuerpo, headers: { 'X-Puente-Token': token, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000),
      }).then(async r => ({ estado: r.status, texto: await r.text(), repetida: r.headers.get('x-puente-idempotente') === 'repetida' }))));
      for (const r of res) { assert.equal(r.estado, 200, r.texto); assert.equal(r.texto, res[0].texto); }
      assert.equal(res.filter(r => r.repetida).length, 5, 'una ejecucion y cinco respuestas guardadas');
      assert.equal((await observacion('a')).faccion.poblacion, antes + 2);
    });
  });

  // --- V1: controles de presentacion para grabar video (camara e interfaz; no son acciones del juego) ----------
  describe('V1: camara e interfaz', () => {
    let n = 0;
    async function crudo(ruta, datos, metodo = 'POST') {
      const cuerpo = metodo === 'POST' ? JSON.stringify({ protocolo: 1, id_solicitud: `v1-${++n}-${Date.now()}`, ...datos }) : undefined;
      const res = await fetch(URL_BASE + ruta, { method: metodo, body: cuerpo, signal: AbortSignal.timeout(60000),
        headers: { 'X-Puente-Token': token, ...(cuerpo ? { 'Content-Type': 'application/json' } : {}) } });
      const texto = await res.text();
      let json; try { json = JSON.parse(texto); } catch { /* no es JSON */ }
      return { estado: res.status, json, texto };
    }

    it('/v1/info anuncia capacidades.camara e interfaz (verificadas en vivo) y ninguna es una accion', async () => {
      const r = await crudo('/v1/info', undefined, 'GET');
      assert.equal(r.json.capacidades.camara, true);
      assert.equal(r.json.capacidades.interfaz, true);
      assert.ok(!r.json.acciones.some(x => /camara|interfaz|zoom/.test(x.nombre)), 'el modelo nunca ve controles de presentacion');
    });

    it('camara: enfoca al rey de cada faccion (modo juego y limpio), aplica zoom, valida y se libera', async () => {
      const e = await crudo('/v1/escenario/reiniciar', { semilla: 1, tamano_mapa: 192, facciones: [{ id: 'a' }, { id: 'b' }], opciones: { velocidad: 'x2' } });
      assert.equal(e.estado, 200, e.texto);
      const vistos = new Set();
      for (const [faccion, modo] of [['a', 'juego'], ['b', 'juego'], ['a', 'limpio'], ['b', undefined]]) {
        const r = await crudo('/v1/camara', { faccion, zoom: 35, ...(modo ? { modo } : {}) });
        assert.equal(r.estado, 200, r.texto);
        assert.equal(r.json.liberada, false);
        assert.equal(r.json.faccion, faccion);
        assert.equal(r.json.modo, modo ?? 'juego');
        assert.equal(r.json.zoom, 35);
        assert.equal(r.json.enfocada.rol, 'rey');
        assert.ok(Number.isInteger(r.json.enfocada.id) && r.json.enfocada.nombre);
        vistos.add(r.json.enfocada.id);
      }
      assert.equal(vistos.size, 2, 'cada faccion enfoca a su propio rey');
      for (const malo of [{}, { faccion: 'a', zoom: 0 }, { faccion: 'a', zoom: 1001 }, { faccion: 'a', zoom: 'x' }, { faccion: 'a b' }, { faccion: 'a', modo: 'x' }, { liberar: 'si' }, { faccion: 'zzz' }]) {
        const r = await crudo('/v1/camara', malo);
        assert.equal(r.estado, 400, `${JSON.stringify(malo)}: ${r.texto}`);
      }
      const l = await crudo('/v1/camara', { liberar: true, zoom: 200 });
      assert.equal(l.estado, 200, l.texto);
      assert.deepEqual([l.json.liberada, l.json.enfocada, l.json.zoom], [true, null, 200]);
      assert.equal((await crudo('/v1/camara', { faccion: 'a' }, 'POST')).estado, 200, 'se puede volver a enfocar');
      await crudo('/v1/camara', { liberar: true });
    });

    it('interfaz: se oculta y se muestra; visible debe ser booleano', async () => {
      for (const visible of [false, true, false, true]) {
        const r = await crudo('/v1/interfaz', { visible });
        assert.equal(r.estado, 200, r.texto);
        assert.equal(r.json.visible, visible);
      }
      assert.equal((await crudo('/v1/interfaz', { visible: 'no' })).estado, 400);
      assert.equal((await crudo('/v1/interfaz', {})).estado, 400);
      const sinToken = await fetch(`${URL_BASE}/v1/interfaz`, { method: 'POST', body: JSON.stringify({ protocolo: 1, id_solicitud: 'x', visible: false }) });
      assert.equal(sinToken.status, 401);
    });
  });

  // --- E1 (fase 0 del formato era): cualquier especie civilizada del juego (ActorAsset.civ), no solo las 4 clasicas ----------
  describe('E1: especies civilizadas', () => {
    let n = 0;
    async function reiniciar(especies, opciones = {}) {
      const cuerpo = JSON.stringify({ protocolo: 1, id_solicitud: `e1-${++n}-${Date.now()}`, semilla: 1, tamano_mapa: 192,
        facciones: especies.map((especie, i) => ({ id: `f${i + 1}`, especie })), opciones: { velocidad: 'x20', ...opciones } });
      const res = await fetch(URL_BASE + '/v1/escenario/reiniciar', { method: 'POST', body: cuerpo, signal: AbortSignal.timeout(120000),
        headers: { 'X-Puente-Token': token, 'Content-Type': 'application/json' } });
      const texto = await res.text();
      let json; try { json = JSON.parse(texto); } catch { /* no es JSON */ }
      return { estado: res.status, json, texto };
    }

    it('acepta especies civ_* y funda su reino', async () => {
      for (const especie of ['civ_cat', 'civ_crab', 'orc']) {
        const r = await reiniciar([especie, 'human']);
        assert.equal(r.estado, 200, `${especie}: ${r.texto}`);
        assert.equal(r.json.facciones[0].especie, especie);
        const o = await a.observar('f1');
        assert.ok(o.faccion.vivo && o.faccion.ciudades >= 1 && o.faccion.poblacion >= 1, especie);
        assert.equal(o.faccion.especie, especie);
      }
    });

    const carpetaMapa = nombre => join(process.env.USERPROFILE ?? '', 'AppData', 'LocalLow', 'mkarpenko', 'WorldBox', 'era-mapas', nombre);

    it('opciones.mapa: rechaza nombres con forma invalida o inexistentes (400)', async () => {
      for (const mapa of ['../x', 'A B', 'slot0', 'slot999', 'no-existe-e1']) {
        const cuerpo = JSON.stringify({ protocolo: 1, id_solicitud: `e1m-${++n}-${Date.now()}`, semilla: 1, tamano_mapa: 192, facciones: [{ id: 'f1' }, { id: 'f2' }], opciones: { mapa } });
        const res = await fetch(URL_BASE + '/v1/escenario/reiniciar', { method: 'POST', body: cuerpo, headers: { 'X-Puente-Token': token, 'Content-Type': 'application/json' } });
        assert.equal(res.status, 400, mapa);
      }
    });

    // Necesita un mapa guardado a mano en <datos del juego>\era-mapas\prueba-fase0\ (map.wbox); se salta si no esta.
    it('opciones.mapa: el mismo mapa guardado da el mismo mundo en cada reinicio', { skip: !existsSync(join(carpetaMapa('prueba-fase0'), 'map.wbox')) && 'falta era-mapas\\prueba-fase0' }, async () => {
      const hashes = [], sitios = [];
      for (let i = 0; i < 2; i++) {
        const r = await reiniciar(['human', 'orc'], { mapa: 'prueba-fase0' });
        assert.equal(r.estado, 200, r.texto);
        assert.equal(r.json.mundo.mapa, 'prueba-fase0');
        hashes.push(r.json.hash_mundo); sitios.push(JSON.stringify(r.json.facciones.map(f => [f.sitio_x, f.sitio_y])));
        const o = await a.observar('f1');
        assert.ok(o.faccion.vivo && o.faccion.ciudades === 1, 'una sola ciudad: el guardado no deja civilizaciones');
      }
      assert.equal(hashes[0], hashes[1]);
      assert.equal(sitios[0], sitios[1]);
    });

    it('rechaza una especie que no existe o no es civilizada (400, sin tocar el mundo)', async () => {
      for (const especie of ['zzz', 'sheep', 'dragon', '']) {
        const r = await reiniciar([especie, 'human']);
        assert.equal(r.estado, 400, `${especie}: ${r.texto}`);
      }
    });
  });

  // --- E2 (formato era): mapa espejo, muro, biomas, depositos, rasgos y linaje de reinos ----------------------------------
  describe('E2: formato era', () => {
    let n = 0;
    const llamar = async (metodo, ruta, datos) => {
      const init = { method: metodo, headers: { 'X-Puente-Token': token, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(120000) };
      if (metodo === 'POST') init.body = JSON.stringify({ protocolo: 1, id_solicitud: `e2-${++n}-${Date.now()}`, ...datos });
      const res = await fetch(URL_BASE + ruta, init);
      const texto = await res.text();
      let json; try { json = JSON.parse(texto); } catch { /* no es JSON */ }
      return { estado: res.status, json, texto };
    };
    const reiniciarEra = (era, especies = ['human', 'orc']) => llamar('POST', '/v1/escenario/reiniciar', { semilla: 1, tamano_mapa: 'small',
      facciones: especies.map((especie, i) => ({ id: `f${i + 1}`, especie })), opciones: { velocidad: 'x20', era } });

    it('/v1/info anuncia capacidades.era y el catalogo trae los tipos, minerales y biomas', async () => {
      const info = await llamar('GET', '/v1/info');
      assert.equal(info.json.capacidades.era, true);
      const c = await llamar('GET', '/v1/era/catalogo');
      assert.equal(c.estado, 200, c.texto);
      assert.deepEqual(Object.keys(c.json.rasgos).sort(), ['clan', 'cultura', 'idioma', 'reino', 'religion', 'subespecie']);
      assert.equal(c.json.minerales.length, 8);
      assert.ok(c.json.biomas.length >= 20);
    });

    it('espejo: mismas casillas en las dos mitades, sitios en espejo con la misma calidad y muro en el centro', async () => {
      const r = await reiniciarEra({ espejo: true, muro: { ancho: 4 } });
      assert.equal(r.estado, 200, r.texto);
      assert.equal(r.json.era.preparacion.espejo.diferencias_restantes, 0);
      const [f1, f2] = r.json.facciones;
      assert.equal(f1.sitio_x + f2.sitio_x, r.json.mundo.ancho - 1);
      assert.equal(f1.sitio_y, f2.sitio_y);
      assert.equal(f1.calidad_sitio, f2.calidad_sitio);
      assert.deepEqual([r.json.era.preparacion.muro.x0, r.json.era.preparacion.muro.x1], [94, 97]);
      const e = await llamar('GET', '/v1/era/estado');
      assert.equal(e.json.muro.puesto, true);
    });

    it('quitar el muro lo deja registrado y no cambia nada mas; rasgos: aplicar, medir y quitar', async () => {
      const r = await reiniciarEra({ espejo: true, muro: { ancho: 4 }, leyes: { world_law_rebellions: false }, edad: 'age_hope', pausar_edades: true });
      assert.equal(r.estado, 200, r.texto);
      const a = await llamar('POST', '/v1/era/rasgos', { faccion: 'f1', tipo: 'clan', agregar: ['stonefists'] });
      assert.equal(a.json.resultado, 'ejecutada', a.texto);
      const rechazo = await llamar('POST', '/v1/era/rasgos', { faccion: 'f1', tipo: 'clan', agregar: ['no_existe_xyz'] });
      assert.equal(rechazo.json.resultado, 'rechazada');
      assert.equal(rechazo.json.rechazados[0].codigo, 'rasgo_desconocido');
      const q = await llamar('POST', '/v1/era/rasgos', { faccion: 'f1', tipo: 'clan', quitar: ['stonefists'] });
      assert.deepEqual(q.json.quitados, ['stonefists']);
      const m = await llamar('POST', '/v1/era/muro', { operacion: 'quitar' });
      assert.equal(m.json.muro_puesto, false);
      assert.equal(m.json.casillas_restauradas, 768);
      const e = await llamar('GET', '/v1/era/estado');
      assert.ok(e.json.eventos.some(x => x.tipo === 'muro_quitado'));
      assert.equal(e.json.edad.id, 'age_hope');
      assert.equal(e.json.edad.pausada, true);
      assert.equal(e.json.leyes.world_law_rebellions, false);
      // el siguiente reinicio sin era devuelve las leyes y las edades a como estaban
      const r2 = await reiniciarEra(undefined);
      assert.equal(r2.estado, 200, r2.texto);
      const e2 = await llamar('GET', '/v1/era/estado');
      assert.equal(e2.json.hay_era, false);
      assert.equal(e2.json.leyes.world_law_rebellions, true, 'la ley se restauro');
      assert.equal(e2.json.edad.pausada, false, 'las edades se reanudaron');
    });

    it('depositos de mineral: se colocan simetricos y la ciudad con deposito los explota (uno solo uso)', async () => {
      const r = await reiniciarEra({ espejo: true, muro: { ancho: 4 }, minerales: [{ faccion: 'f1', mineral: 'mineral_mythril', cantidad: 6, radio: 14 }], leyes: { world_law_rebellions: false } });
      assert.equal(r.estado, 200, r.texto);
      const dep = r.json.era.resultado.depositos;
      assert.equal(dep.length, 6);
      assert.ok(dep.every(d => d.colocado && d.faccion === 'f1'));
      for (let i = 0; i < 8; i++) await llamar('POST', '/v1/avanzar', { segundos_juego: 60 });
      const e = await llamar('GET', '/v1/era/estado');
      assert.ok(e.json.civilizaciones[0].almacen.mythril >= 1, 'f1 obtuvo mythril de sus depositos');
      assert.equal(e.json.civilizaciones[1].almacen.mythril, 0, 'f2 no tenia depositos');
    });

    it('opciones.era invalidas son 400 sin tocar el mundo', async () => {
      for (const era of [{ espejo: true, biomas: { f1: 'biome_singularity' } }, { biomas: { f1: 'biome_grass' } }, { espejo: true, muro: { ancho: 99 } },
        { espejo: true, minerales: [{ faccion: 'f1', mineral: 'oro', cantidad: 1 }] }, { leyes: { world_law_inventada: true } }, { edad: 'age_x' }, 'texto']) {
        const r = await reiniciarEra(era);
        assert.equal(r.estado, 400, JSON.stringify(era) + ' ' + r.texto);
      }
    });
  });
});
