// Linea de tiempo de la escena de La Fuga: convierte los registros guardados (uno por situacion) en beats. Funcion pura sobre partidas REALES jugadas por bots: sin DOM, sin red y sin API.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RONDAS, PUNTOS, ALARMA_MAX as ALARMA_MOTOR, COHESION_MAX as COHESION_MOTOR, NIVELES_ALERTA, nivelAlerta } from '../../juegos/fuga/constantes.js';
import { resolverNombres } from '../../juegos/fuga/narracion.js';
import { construirLineaDeTiempo, puntuarRondas, mejoresRondas, beatsDeEstado, erroresDeEstado, MIN_MS, RONDAS_TOPE, JUGADORES_TOPE, CAMARA_POR_DEFECTO, REGLA_OCULTA, ALARMA_MAX, COHESION_MAX, nivelDeAlerta, textoDeSello, horaDeBeat, textoDeRiesgo, avisosDeTentacion, reglasDeFinal } from '../../../web/casino/linea-de-tiempo-fuga.js';
import { jugarFuga, jugarFugaConCaido, muchasFuga } from './ayudas-fuga.js';

const nombres = (p) => (t) => resolverNombres(t, p.jugadores);
const TIPOS_BASE = ['apertura', 'decisiones', 'verdad', 'resultado'];
const LINEAS_DE = { apertura: ['apertura'], decisiones: ['decision'], verdad: ['verdad'], resultado: ['resultado'], consecuencia: ['consecuencia'], final: ['epilogo'] };
const PASOS = ['armar', 'estado', 'decidir', 'riesgo', 'actuar', 'tentacion', 'medidor', 'razones', 'final'];
const PASOS_DE = { apertura: ['armar', 'estado'], decisiones: ['decidir'], verdad: ['riesgo'], resultado: ['actuar', 'medidor', 'estado', 'razones'], consecuencia: ['tentacion', 'medidor', 'estado', 'razones'], final: ['final'] };
const porRonda = (beats) => beats.reduce((m, b) => m.set(b.mano, [...(m.get(b.mano) ?? []), b]), new Map());
const pasosDe = (beats, tipo) => beats.flatMap((b) => b.pasos.filter((x) => x.tipo === tipo));
const hayConsecuencia = (r) => (r.narracion ?? []).some((l) => l.tipo === 'consecuencia');

test('las constantes que muestra la escena son las del motor (la web no puede importarlo)', () => {
  assert.equal(RONDAS_TOPE, RONDAS);
  assert.equal(JUGADORES_TOPE, 2);
  assert.equal(CAMARA_POR_DEFECTO, 0);
  // la regla oculta se copia a la web: salen los dos 10, sale uno solo 7, el que se queda atras y sale 9, capturado 0
  assert.deepEqual(REGLA_OCULTA, { conjunto: PUNTOS.escapeConjunto, solo: PUNTOS.escapeSolo, abandonado: PUNTOS.escapeAbandonado, anticipada: PUNTOS.escapeSolo, capturado: 0 });
});

test('cada situacion cuenta su historia en orden: apertura, decisiones, verdad, resultado y, si hay, consecuencia; el final solo al terminar', async () => {
  for (const p of await muchasFuga()) {
    const beats = construirLineaDeTiempo(p);
    for (const [n, bs] of porRonda(beats.filter((b) => b.tipo !== 'final'))) {
      const r = p.rondas[n - 1];
      assert.deepEqual(bs.map((b) => b.tipo), [...TIPOS_BASE, ...(hayConsecuencia(r) ? ['consecuencia'] : [])], `${p.seed} situacion ${n}`);
    }
    const finales = beats.filter((b) => b.tipo === 'final');
    assert.equal(finales.length, p.truncada ? 0 : 1);
    if (finales.length) assert.equal(beats.at(-1).tipo, 'final');
    assert.equal(new Set(beats.map((b) => b.id)).size, beats.length, 'ids unicos');
    assert.deepEqual(beats.map((b) => b.id), construirLineaDeTiempo(p).map((b) => b.id), 'ids estables');
    for (const b of beats) assert.ok(Number.isFinite(b.minMs) && b.minMs >= MIN_MS[b.tipo], `${b.id}: minMs`);
  }
  assert.deepEqual(Object.keys(MIN_MS).sort(), [...TIPOS_BASE, 'consecuencia', 'final'].sort());
});

test('cubre todos los registros en orden y no pierde ni repite una sola linea; cada beat dice solo las lineas de su tipo', async () => {
  for (const p of [...await muchasFuga(), await jugarFuga(3, undefined, { maxRondas: 4 })]) {
    const beats = construirLineaDeTiempo(p);
    assert.deepEqual([...new Set(beats.map((b) => b.registro))], p.rondas.map((_, i) => i), `seed ${p.seed}: todos los registros, en orden`);
    const dichas = beats.filter((b) => b.tipo !== 'final').flatMap((b) => b.lineas.map((l) => l.texto)).sort();
    assert.deepEqual(dichas, p.rondas.flatMap((r) => r.narracion.map((l) => { const m = l.tipo === 'decision' ? /^\{([01])\} (.+)$/.exec(l.texto) : null; return nombres(p)(m && r.invalidas[Number(m[1])] === true ? `El juego elige por {${m[1]}}: ${m[2]}` : l.texto); })).sort(), `seed ${p.seed}: se pierde o se repite una linea`);
    const final = beats.find((b) => b.tipo === 'final');
    if (final) assert.deepEqual(final.lineas.map((l) => l.texto), p.epilogo.map((l) => nombres(p)(l.texto)));
    for (const b of beats) {
      assert.ok(b.lineas.every((l) => LINEAS_DE[b.tipo].includes(l.tipo)), `${b.id}: dice una linea que no es de ${b.tipo}`);
      assert.ok(b.lineas.every((l) => !/\{\d\}/.test(l.texto)), 'ningun {n} sin resolver');
      assert.equal(b.texto, b.lineas.map((l) => l.texto).join(' '));
      assert.deepEqual(b.camara, [], 'La Fuga no tiene camara oculta');
    }
  }
});

test('las lineas de las jugadas que puso el juego no se atribuyen a la IA (se reescriben), y la respuesta ilegible se marca por separado', async () => {
  let vistas = 0;
  for (const p of [await jugarFugaConCaido(1, 0), await jugarFugaConCaido(2, 1)]) {
    const beats = construirLineaDeTiempo(p);
    for (const b of beats.filter((x) => x.tipo === 'decisiones')) {
      const r = p.rondas[b.registro];
      const paso = b.pasos.find((x) => x.tipo === 'decidir');
      assert.deepEqual(paso.reemplazadas, r.invalidas.map((x) => x === true));
      assert.equal(b.reemplazo, r.invalidas.some((x) => x === true));
      r.invalidas.forEach((inv, s) => {
        if (inv !== true) return;
        vistas++;
        const nombre = p.jugadores[s].nombre;
        const suyas = b.lineas.filter((l) => l.texto.startsWith(`El juego elige por ${nombre}`));
        assert.equal(suyas.length, 1, `${b.id}: la jugada del juego se dice como del juego`);
        assert.ok(!b.lineas.some((l) => l.texto.startsWith(nombre) && l.tipo === 'decision'), `${b.id}: se le atribuye la jugada a ${nombre}`);
      });
    }
  }
  assert.ok(vistas > 5, `cobertura: ${vistas} jugadas del juego`);
  // un campo escrito pero ilegible (promesa, aprovechar) se anota sin cambiar la jugada
  let ilegibles = 0;
  for (const p of await muchasFuga()) for (const b of construirLineaDeTiempo(p).filter((x) => x.tipo === 'decisiones')) {
    const paso = b.pasos.find((x) => x.tipo === 'decidir');
    assert.deepEqual(paso.ilegibles, p.rondas[b.registro].ilegibles.map((l) => l.filter((c) => c === 'promesa')), 'en decisiones solo se anota la promesa ilegible: lo de la tentacion se descubre en la consecuencia');
    ilegibles += paso.ilegibles.filter((l) => l.length).length;
  }
  assert.ok(ilegibles > 5, `cobertura: ${ilegibles} campos ilegibles`);
});

test('una partida cortada no inventa final; con entrada ilegible no hay beats', async () => {
  const corta = await jugarFuga(3, undefined, { maxRondas: 4 });
  assert.equal(corta.truncada, true);
  assert.ok(construirLineaDeTiempo(corta).every((b) => b.tipo !== 'final'));
  const forzada = structuredClone(await jugarFuga(3)); // una partida marcada como cortada no tiene final aunque traiga epilogo
  forzada.truncada = true;
  assert.ok(construirLineaDeTiempo(forzada).every((b) => b.tipo !== 'final'));
  for (const basura of [null, undefined, {}, { rondas: [] }, { rondas: 'x' }, 7]) {
    assert.deepEqual(construirLineaDeTiempo(basura), []);
    assert.deepEqual(puntuarRondas(basura), []);
    assert.deepEqual(mejoresRondas(basura, 3), []);
  }
});

test('ninguna decision aparece antes de decisiones, ningun riesgo antes de verdad ni ningun resultado antes de resultado; cada tipo de beat usa solo sus pasos', async () => {
  for (const p of await muchasFuga()) {
    const beats = construirLineaDeTiempo(p);
    for (const b of beats) {
      for (const paso of b.pasos) {
        assert.ok(PASOS.includes(paso.tipo), `${b.id}: paso ${paso.tipo} fuera del vocabulario`);
        assert.ok(PASOS_DE[b.tipo].includes(paso.tipo), `${b.id}: ${paso.tipo} no va en ${b.tipo}`);
      }
      if (b.tipo === 'decisiones') for (const paso of b.pasos) assert.ok(!('aprovechar' in (paso.jugadas.find(Boolean) ?? {})), 'la decision no dice si aprovecha la tentacion');
    }
    for (const b of beats.filter((x) => x.tipo === 'apertura')) {
      assert.ok(!/ayuda|se ofrece|toma su propio camino|sigue adelante|Probabilidad real/.test(b.texto), `${b.id}: la apertura adelanta una decision`);
    }
    for (const b of beats.filter((x) => x.tipo === 'resultado' || x.tipo === 'decisiones' || x.tipo === 'verdad')) {
      assert.ok(!/oferta del guardia|se queda con |Nadie se atreve|La alerta|confianza/.test(b.texto), `${b.id}: dice una consecuencia antes de su beat`);
    }
  }
});

test('la alarma, la cohesion, los puntos, los libres y las heridas salen del registro: antes en la apertura y despues solo al terminar la situacion', async () => {
  for (const p of await muchasFuga()) {
    const beats = construirLineaDeTiempo(p);
    let puntos = [0, 0], heridas = [0, 0], salieron = [false, false];
    for (const [n, bs] of porRonda(beats.filter((b) => b.tipo !== 'final'))) {
      const r = p.rondas[n - 1];
      const antes = bs[0].pasos.find((x) => x.tipo === 'estado');
      assert.deepEqual([antes.alarma, antes.cohesion], [r.oculto.alarmaAntes, r.oculto.cohesionAntes], `situacion ${n}: antes`);
      assert.deepEqual(antes.puntos, puntos);
      assert.deepEqual(antes.heridas, heridas);
      assert.deepEqual(antes.salieron, salieron);
      assert.deepEqual(antes.libres, r.jugadas.map((j) => j !== null), `situacion ${n}: libres antes`);
      // lo que cambia el resultado (tropiezo, delacion a quien ya estaba herido) y lo que salio
      const nuevas = [...heridas];
      r.resultados.forEach((x, s) => { if (x === 'tropezo') nuevas[s]++; });
      for (const d of r.tentacion?.delataron ?? []) if (heridas[1 - d] > 0) nuevas[1 - d]++;
      heridas = nuevas; salieron = salieron.map((x, s) => x || r.salieron[s] === true);
      puntos = r.final ? r.puntosAcumulados.map((v, s) => v - r.final.bono[s] + r.final.perdidos[s]) : [...r.puntosAcumulados];
      // el estado de despues vive en el ultimo beat de la situacion y en ningun otro
      const ultimo = bs.at(-1);
      const despues = ultimo.pasos.find((x) => x.tipo === 'estado');
      assert.deepEqual([despues.alarma, despues.cohesion], [r.oculto.alarma, r.oculto.cohesion], `situacion ${n}: despues`);
      assert.deepEqual(despues.puntos, puntos);
      assert.deepEqual(despues.heridas, heridas);
      assert.deepEqual(despues.salieron, salieron);
      assert.deepEqual(despues.libres, r.jugadas.map((j, s) => j !== null && r.resultados[s] !== 'cayo' && r.salieron[s] !== true));
      const medidor = ultimo.pasos.find((x) => x.tipo === 'medidor');
      assert.deepEqual([medidor.alarma, medidor.cohesion], [r.oculto.alarma, r.oculto.cohesion]);
      for (const b of bs.slice(0, -1)) assert.ok(!b.pasos.some((x) => x.tipo === 'medidor') && b.pasos.filter((x) => x.tipo === 'estado').length === (b.tipo === 'apertura' ? 1 : 0), `${b.id}: el estado de despues llega antes de tiempo`);
    }
  }
});

test('el resultado de cada prisionero sale del registro: pasa limpio, tropieza, cae o sale por su cuenta; el capturado y el que salio ya no actuan ni deciden', async () => {
  const vistos = { limpio: 0, tropezo: 0, cayo: 0, sale: 0 };
  for (const p of await muchasFuga()) {
    const beats = construirLineaDeTiempo(p);
    let fuera = [false, false];
    for (const b of beats.filter((x) => x.tipo === 'resultado')) {
      const r = p.rondas[b.registro];
      const actuar = b.pasos.filter((x) => x.tipo === 'actuar');
      assert.deepEqual(actuar.map((x) => x.asiento), [0, 1].filter((s) => r.jugadas[s] !== null), `${b.id}: quien actua`);
      for (const x of actuar) {
        assert.equal(x.resultado, r.resultados[x.asiento]);
        assert.equal(x.sale, r.salieron[x.asiento] === true);
        vistos[x.resultado]++; if (x.sale) vistos.sale++;
        assert.ok(!fuera[x.asiento], `${b.id}: actua alguien que ya cayo o salio`);
      }
      const dec = beats.find((x) => x.registro === b.registro && x.tipo === 'decisiones').pasos[0];
      assert.deepEqual(dec.jugadas.map((j) => j !== null), r.jugadas.map((j) => j !== null));
      r.resultados.forEach((x, s) => { if (x === 'cayo' || r.salieron[s]) fuera[s] = true; });
    }
  }
  for (const [k, v] of Object.entries(vistos)) assert.ok(v > 3, `cobertura: ${k} ${v}`);
});

test('las decisiones salen todas juntas en su beat con postura, metodo, promesa rota y mensaje tal cual (vacio o de 140 caracteres)', async () => {
  let rotas = 0, largos = 0, vacios = 0;
  for (const p of await muchasFuga()) {
    for (const b of construirLineaDeTiempo(p).filter((x) => x.tipo === 'decisiones')) {
      const r = p.rondas[b.registro];
      const d = b.pasos.find((x) => x.tipo === 'decidir');
      assert.deepEqual(d.jugadas, r.jugadas.map((j) => (j ? { postura: j.postura, metodo: j.metodo } : null)));
      assert.deepEqual(d.promesasRotas, r.promesaRota.map((x, s) => x === true && r.invalidas[s] !== true), 'una jugada que puso el juego nunca se marca como promesa rota de la IA');
      assert.deepEqual(d.mensajes, r.mensajes);
      assert.ok(!('razones' in d), 'las razones no salen en las decisiones: podrian decir lo que se descubre en la consecuencia');
      rotas += d.promesasRotas.filter(Boolean).length;
      largos += d.mensajes.filter((m) => m && m.length === 140).length;
      vacios += d.mensajes.filter((m) => m === null).length;
    }
  }
  assert.ok(rotas > 20 && largos > 5 && vacios > 5, `cobertura: ${rotas} promesas rotas, ${largos} mensajes largos, ${vacios} vacios`);
});

test('la verdad (riesgo real y pista) sale del registro y solo en su beat', async () => {
  for (const p of await muchasFuga()) {
    for (const b of construirLineaDeTiempo(p).filter((x) => x.tipo === 'verdad')) {
      const r = p.rondas[b.registro];
      assert.deepEqual(b.pasos, [{ tipo: 'riesgo', fallo: r.oculto.fallo, pistaFiable: r.oculto.pistaFiable, mejorMetodo: r.oculto.mejorMetodo }]);
    }
  }
});

test('las tentaciones salen del registro y su aviso solo llega en la consecuencia: el botin cambia de manos y la oferta se acepta sin decir antes quien', async () => {
  const vistos = { botin: 0, botinNadie: 0, oferta: 0, ofertaNadie: 0 };
  for (const p of await muchasFuga()) {
    const beats = construirLineaDeTiempo(p);
    for (const b of beats.filter((x) => x.tipo === 'consecuencia')) {
      const r = p.rondas[b.registro];
      const t = b.pasos.find((x) => x.tipo === 'tentacion');
      if (!r.tentacion) { assert.equal(t, undefined); continue; }
      assert.deepEqual(t, { tipo: 'tentacion', clase: r.tentacion.tipo, tomo: r.tentacion.tomo, delataron: r.tentacion.delataron, ...(r.tentacion.objeto ? { objeto: r.tentacion.objeto } : {}) });
      if (r.tentacion.tipo === 'botin') r.tentacion.tomo === null ? vistos.botinNadie++ : vistos.botin++;
      else r.tentacion.delataron.length ? vistos.oferta++ : vistos.ofertaNadie++;
    }
    for (const b of beats.filter((x) => x.tipo !== 'consecuencia')) assert.ok(!b.pasos.some((x) => x.tipo === 'tentacion'), `${b.id}: tentacion fuera de su beat`);
  }
  for (const [k, v] of Object.entries(vistos)) assert.ok(v > 3, `cobertura: ${k} ${v}`);
});

test('el final se lee de final.finales (conjunto, solo, abandonado, anticipada, capturado) y de sus bonos; las partidas que terminan antes de la situacion 9 lo traen en su ultimo registro', async () => {
  const vistos = new Set();
  let cortas = 0;
  for (const p of await muchasFuga()) {
    const beats = construirLineaDeTiempo(p);
    const fin = beats.find((b) => b.tipo === 'final');
    const ultimo = p.rondas.at(-1);
    assert.equal(Boolean(fin), p.truncada !== true && Boolean(ultimo.final));
    if (!fin) continue;
    assert.deepEqual(fin.pasos, [{ tipo: 'final', final: ultimo.final, finales: ultimo.final.finales, bono: ultimo.final.bono, perdidos: ultimo.final.perdidos, puntos: p.puntos }]);
    assert.equal(fin.mano, ultimo.ronda);
    ultimo.final.finales.forEach((f) => vistos.add(f));
    if (p.rondas.length < RONDAS) cortas++;
  }
  assert.ok(cortas > 0, 'cobertura: partidas que terminan antes de la situacion 9');
  for (const f of ['conjunto', 'solo', 'abandonado', 'anticipada', 'capturado']) assert.ok(vistos.has(f), `cobertura: final ${f}`);
});

test('ningun texto que escribe la linea de tiempo dice delatar, abandonar ni traicion (los mensajes de las IAs y el catalogo del motor quedan fuera)', async () => {
  for (const p of [...await muchasFuga(), await jugarFugaConCaido(1, 0)]) {
    for (const b of construirLineaDeTiempo(p)) {
      const sin = b.texto.replaceAll('una mochila abandonada', ''); // objeto del catalogo del motor
      assert.doesNotMatch(sin, /delat|abandon|traici|traidor/i, `${b.id}: ${sin}`);
    }
  }
});

test('puntuarRondas elige lo que se cuenta bien: caida, escape anticipado, oferta aceptada, botin, promesa rota y final, calculado del registro y de acuerdo con la narracion del motor', async () => {
  const vistos = {};
  for (const p of await muchasFuga()) {
    const pun = puntuarRondas(p);
    assert.deepEqual(pun.map((x) => x.ronda), p.rondas.map((r) => r.ronda));
    p.rondas.forEach((r, i) => {
      const dice = (re) => r.narracion.some((l) => re.test(l.texto));
      const esperados = [];
      if (r.resultados.includes('cayo')) esperados.push('caida');
      if (r.salieron.some(Boolean)) esperados.push('escape anticipado');
      if (r.tentacion?.tipo === 'oferta' && r.tentacion.delataron.length) esperados.push('oferta aceptada');
      if (r.tentacion?.tipo === 'botin' && r.tentacion.tomo !== null) esperados.push('botin');
      if (r.promesaRota.some((x, s) => x === true && r.invalidas[s] !== true)) esperados.push('promesa rota');
      if (r.final) esperados.push('final');
      assert.deepEqual([...pun[i].motivos].sort(), [...esperados].sort(), `situacion ${r.ronda}`);
      // de acuerdo con lo que cuenta el motor
      assert.equal(pun[i].motivos.includes('caida'), dice(/cae en manos|atrapan|queda capturado/));
      assert.equal(pun[i].motivos.includes('escape anticipado'), dice(/escapa por su cuenta|escapan por separado/));
      assert.equal(pun[i].motivos.includes('oferta aceptada'), dice(/\{\d\} acepta la oferta del guardia/));
      assert.equal(pun[i].motivos.includes('botin'), Boolean(r.tentacion?.tipo === 'botin' && dice(/se queda con /)));
      assert.deepEqual(pun[i].registros, [i, i]);
      for (const m of pun[i].motivos) vistos[m] = (vistos[m] ?? 0) + 1;
    });
    const top = mejoresRondas(p, 3);
    assert.ok(top.length <= 3 && top.every((x, k) => k === 0 || top[k - 1].puntos >= x.puntos));
  }
  for (const m of ['caida', 'escape anticipado', 'oferta aceptada', 'botin', 'promesa rota', 'final']) assert.ok(vistos[m] > 3, `cobertura: ${m} ${vistos[m]}`);
  assert.deepEqual(mejoresRondas(await jugarFuga(1), 0), []);
});

test('para la herramienta de capturas: los comienzos de situacion desde la segunda y lo que la mesa informa de si misma contra lo que debe mostrar', async () => {
  const p = await jugarFuga(2, ['azar', 'azar']);
  const beats = construirLineaDeTiempo(p);
  const idx = beatsDeEstado(beats, 4);
  assert.equal(idx.length, 4);
  assert.ok(idx.every((i) => beats[i].tipo === 'apertura' && beats[i].mano >= 2));
  assert.deepEqual(beatsDeEstado(null), []);
  const b = beats[idx[0]];
  const e = b.pasos.find((x) => x.tipo === 'estado');
  const libres = e.libres.filter(Boolean).length;
  const bueno = { siluetas: libres, sellos: 0, avisos: 0, sinSenal: e.libres.filter((l, s) => !l && !e.salieron[s]).length, salidas: e.salieron.filter(Boolean).length, panel: 0 };
  assert.deepEqual(erroresDeEstado(bueno, b), []);
  assert.ok(erroresDeEstado(null, b).length > 0);
  for (const [campo, valor] of [['siluetas', libres + 1], ['sellos', 1], ['avisos', 1], ['sinSenal', bueno.sinSenal + 1], ['salidas', bueno.salidas + 1], ['panel', 1]]) {
    assert.ok(erroresDeEstado({ ...bueno, [campo]: valor }, b).some((m) => m.includes(campo === 'panel' ? 'panel' : campo)), `no detecta ${campo}`);
  }
});

test('los medidores usan las constantes del motor y la misma palabra de alerta (la web no puede importarlo)', () => {
  assert.equal(ALARMA_MAX, ALARMA_MOTOR);
  assert.equal(COHESION_MAX, COHESION_MOTOR);
  for (let a = 0; a <= ALARMA_MOTOR; a++) assert.equal(nivelDeAlerta(a), nivelAlerta(a), `alarma ${a}`);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(nivelDeAlerta), NIVELES_ALERTA);
  for (const raro of [-3, 99, NaN, null, undefined, 'x']) assert.equal(typeof nivelDeAlerta(raro), 'string');
});

test('el sello de una decision dice la postura y el metodo con el vocabulario suave ("Por su cuenta", nunca separarse), y una jugada del juego o un campo ilegible se dicen como tales', () => {
  assert.equal(textoDeSello({ postura: 'ayudar', metodo: 'engano' }), 'Ayudar · Engaño');
  assert.equal(textoDeSello({ postura: 'separarse', metodo: 'sigilo' }), 'Por su cuenta · Sigilo');
  assert.equal(textoDeSello({ postura: 'sacrificarse', metodo: 'fuerza' }), 'Sacrificarse · Fuerza');
  assert.equal(textoDeSello({ postura: 'avanzar', metodo: 'esperar' }), 'Avanzar · Esperar');
  assert.equal(textoDeSello({ postura: 'avanzar', metodo: 'sigilo' }, { reemplazada: true }), 'Jugada del juego: Avanzar · Sigilo');
  assert.equal(textoDeSello({ postura: 'ayudar', metodo: 'sigilo' }, { ilegibles: ['promesa'] }), 'Ayudar · Sigilo · promesa ilegible');
  assert.equal(textoDeSello(null), '');
  for (const raro of [undefined, {}, { postura: 'x', metodo: 'y' }, 7]) assert.equal(typeof textoDeSello(raro), 'string');
  for (const post of ['ayudar', 'avanzar', 'sacrificarse', 'separarse']) for (const met of ['sigilo', 'fuerza', 'engano', 'esperar']) assert.doesNotMatch(textoDeSello({ postura: post, metodo: met }), /delat|abandon|traici|separ/i);
});

test('la hora de la camara es una funcion pura del beat: la misma para los dos cuadros, sube con la situacion y con el beat y nunca mira el reloj del equipo', async () => {
  const p = await jugarFuga(1);
  const beats = construirLineaDeTiempo(p);
  const horas = beats.map(horaDeBeat);
  assert.ok(horas.every((h) => /^\d\d:\d\d:\d\d$/.test(h)), 'formato HH:MM:SS');
  assert.deepEqual(horas, beats.map(horaDeBeat), 'misma entrada, misma salida');
  const seg = (h) => h.split(':').reduce((t, x) => t * 60 + Number(x), 0);
  for (let i = 1; i < beats.length; i++) assert.ok(seg(horas[i]) > seg(horas[i - 1]), `beat ${i}: la hora no sube (${horas[i - 1]} -> ${horas[i]})`);
  for (const raro of [null, undefined, {}, { mano: 'x', tipo: 'y' }]) assert.match(horaDeBeat(raro), /^\d\d:\d\d:\d\d$/);
});

test('el riesgo real se dice en porcentaje redondeado y solo para quien juega; los avisos de la tentacion van al cuadro que corresponde y no dicen quien acepto antes de la consecuencia', () => {
  assert.equal(textoDeRiesgo(0.24), 'Riesgo real 24 %');
  assert.equal(textoDeRiesgo(0.063135), 'Riesgo real 6 %');
  assert.equal(textoDeRiesgo(null), '');
  assert.equal(textoDeRiesgo(undefined), '');
  const nombre = (s) => ['Ana', 'Beto'][s];
  assert.deepEqual(avisosDeTentacion(null, nombre), []);
  assert.deepEqual(avisosDeTentacion({ tipo: 'tentacion', clase: 'botin', tomo: 1, delataron: [], objeto: 'una caja de herramientas' }, nombre), [{ asiento: 1, clase: 'botin', texto: 'Se queda con una caja de herramientas' }]);
  assert.deepEqual(avisosDeTentacion({ tipo: 'tentacion', clase: 'botin', tomo: null, delataron: [], objeto: 'x' }, nombre), []);
  assert.deepEqual(avisosDeTentacion({ tipo: 'tentacion', clase: 'oferta', tomo: null, delataron: [0], objeto: undefined }, nombre), [{ asiento: 1, clase: 'oferta', texto: 'Ana aceptó la oferta del guardia' }]);
  assert.deepEqual(avisosDeTentacion({ tipo: 'tentacion', clase: 'oferta', tomo: null, delataron: [0, 1] }, nombre), [{ asiento: 1, clase: 'oferta', texto: 'Ana aceptó la oferta del guardia' }, { asiento: 0, clase: 'oferta', texto: 'Beto aceptó la oferta del guardia' }]);
  assert.deepEqual(avisosDeTentacion({ tipo: 'tentacion', clase: 'oferta', tomo: null, delataron: [] }, nombre), []);
  for (const raro of [{}, 7, { clase: 'x' }]) assert.ok(Array.isArray(avisosDeTentacion(raro, nombre)));
});


test('la escena de la regla oculta muestra las cuatro reglas fijas (10, 7, 9 y 0) con los valores del motor y marca la que se cumplio para cada IA segun final.finales; lo que muestra es lo que cobro', async () => {
  const vistas = new Set();
  for (const p of await muchasFuga()) {
    const fin = p.rondas.at(-1).final;
    if (!fin) continue;
    const filas = reglasDeFinal(fin.finales);
    assert.deepEqual(filas.map((f) => f.clave), ['conjunto', 'solo', 'abandonado', 'capturado']);
    assert.deepEqual(filas.map((f) => f.puntos), [PUNTOS.escapeConjunto, PUNTOS.escapeSolo, PUNTOS.escapeAbandonado, 0], 'los valores son los del motor');
    for (const s of [0, 1]) {
      const donde = filas.filter((f) => f.cumplen.includes(s));
      assert.equal(donde.length, 1, `el prisionero ${s} se marca en una sola regla`);
      assert.equal(donde[0].puntos, fin.bono[s], `la regla marcada vale lo que cobro el prisionero ${s} (${fin.finales[s]})`);
      vistas.add(donde[0].clave);
    }
    for (const f of filas) assert.doesNotMatch(f.texto, /habr|delat|abandon|traici/i, f.texto);
  }
  assert.equal(vistas.size, 4, 'cobertura: las cuatro reglas se marcaron en alguna partida');
  assert.deepEqual(reglasDeFinal(null).map((f) => f.cumplen), [[], [], [], []], 'sin final no se marca nada');
  assert.deepEqual(reglasDeFinal(['anticipada', 'abandonado']).map((f) => f.cumplen), [[], [0], [1], []], 'quien escapo por su cuenta a mitad de camino cobra como quien escapa solo');
});

test('si la IA promete ayudar y escribe una postura ilegible, el juego pone la jugada y la promesa NO se marca como rota ni cuenta para los clips', async () => {
  let casos = 0;
  for (const seed of [1, 2, 3]) {
    const p = await jugarFuga(seed, ['torpe', 'tomaydaca']);
    const beats = construirLineaDeTiempo(p);
    const pun = puntuarRondas(p);
    p.rondas.forEach((r, i) => {
      if (!(r.invalidas[0] === true && r.promesaRota[0] === true)) return;
      casos++;
      const d = beats.find((b) => b.registro === i && b.tipo === 'decisiones').pasos[0];
      assert.equal(d.promesasRotas[0], false, `seed ${seed} situacion ${r.ronda}: se acusa de romper la promesa a una IA cuya jugada puso el juego`);
      assert.ok(d.reemplazadas[0]);
      if (r.promesaRota[1] !== true || r.invalidas[1] === true) assert.ok(!pun[i].motivos.includes('promesa rota'), `situacion ${r.ronda}: cuenta una promesa rota que no fue de la IA`);
    });
  }
  assert.ok(casos >= 3, `cobertura: ${casos} situaciones con promesa rota por jugada del juego`);
});

test('el sello no menciona la tentacion ilegible (un "aprovechar" ilegible vale "no" y se descubriria antes de la consecuencia)', () => {
  assert.equal(textoDeSello({ postura: 'ayudar', metodo: 'sigilo' }, { ilegibles: ['aprovechar'] }), 'Ayudar · Sigilo');
  assert.equal(textoDeSello({ postura: 'ayudar', metodo: 'sigilo' }, { ilegibles: ['promesa', 'aprovechar'] }), 'Ayudar · Sigilo · promesa ilegible');
});

test('una partida guardada con el motor anterior (sin final.perdidos) no hace tronar la linea de tiempo', async () => {
  const p = structuredClone(await jugarFuga(1));
  delete p.rondas.at(-1).final.perdidos;
  delete p.rondas.at(-1).final.bono;
  assert.doesNotThrow(() => construirLineaDeTiempo(p));
});

test('las razones de las IAs salen solo en el ultimo beat de la situacion (con la consecuencia), tal cual y nunca antes', async () => {
  let con = 0;
  for (const p of await muchasFuga()) {
    const beats = construirLineaDeTiempo(p);
    for (const [n, bs] of porRonda(beats.filter((b) => b.tipo !== 'final'))) {
      const r = p.rondas[n - 1];
      const dondeHay = bs.filter((b) => b.pasos.some((x) => x.tipo === 'razones'));
      assert.deepEqual(dondeHay.map((b) => b.id), [bs.at(-1).id], `situacion ${n}: las razones van en el ultimo beat y en ninguno mas`);
      assert.deepEqual(dondeHay[0].pasos.find((x) => x.tipo === 'razones'), { tipo: 'razones', razones: r.razones });
      con += r.razones.filter(Boolean).length;
    }
  }
  assert.ok(con > 20, `cobertura: ${con} razones`);
});
