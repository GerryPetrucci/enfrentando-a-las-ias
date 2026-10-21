// Los textos del paquete de publicacion (web/casino/paquete-textos.js): lo que se graba, y el texto de cada red para cada pieza. Partidas REALES jugadas por bots; sin DOM, sin red
// y sin API. Lo que NO puede pasar: un privado o una razon en un texto, un modelo que no juega, un texto mas largo que su red, o un resultado suelto presentado como veredicto.
//
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirPaquete, ventanaDeClip, hashtagsDe, LIMITES } from '../../../web/casino/paquete-textos.js';
import { armarLinea, destacadasDe } from '../../../web/casino/lineas.js';
import { dividirEnDos, duracionDeBeat, planDeGrabacion, momentosSinVoz } from '../../../web/casino/escena-config.js';
import { textoDeJuego } from '../../../web/casino/textos-juego.js';
import { jugar as jugarDuda } from './ayudas.js';
import { jugarMM } from './ayudas-mm.js';
import { jugarSol } from './ayudas-sol.js';
import { jugarTD } from './ayudas-td.js';
import { jugarSub } from './ayudas-sub.js';
import { jugarFuga } from './ayudas-fuga.js';
import { jugarConqBots, ESCENARIOS } from './ayudas-conq.js';

const ENLACE = 'https://gerrypetrucci.github.io/enfrentando-a-las-ias/';
const PARTIDAS = {
  dudaapuesta: await jugarDuda(1), mayormenor: await jugarMM(1), solitario: await jugarSol(1), tripledado: await jugarTD(1), subasta: await jugarSub(1),
  fuga: await jugarFuga(1), conquista: await jugarConqBots(ESCENARIOS[0].seed, ESCENARIOS[0].bots),
};

async function paqueteDe(id, partida, extra = {}) {
  const beats = await armarLinea(id, partida), destacadas = await destacadasDe(id, partida, 10);
  return { beats, paquete: construirPaquete({ partida, beats, destacadas, archivo: `pruebas/${id}.json`, partidaNumero: 1, enlace: ENLACE, ...extra }) };
}
const textosPlanos = (pieza) => [pieza.textos.tiktok, pieza.textos.instagram, pieza.textos.facebook, pieza.textos.x, pieza.textos.youtube.titulo, pieza.textos.youtube.descripcion, pieza.comentarioFijado ?? ''];
const params = (url) => Object.fromEntries(new URL(url, 'http://x/').searchParams);

test('destacadasDe da, para cada uno de los 7 juegos, las unidades de sus mejores momentos (las mismas que usan sus beats)', async () => {
  for (const [id, partida] of Object.entries(PARTIDAS)) {
    const beats = await armarLinea(id, partida), manos = new Set(beats.map((b) => b.mano));
    const d = await destacadasDe(id, partida, 4);
    assert.ok(d.length >= 1 && d.length <= 4, `${id}: ${d.length} destacadas`);
    for (const x of d) { assert.ok(manos.has(x.unidad), `${id}: la unidad ${x.unidad} no existe`); assert.ok(Number.isFinite(x.puntos)); }
    assert.ok(d.every((x, i) => i === 0 || d[i - 1].puntos >= x.puntos), `${id}: de mayor a menor`);
  }
  assert.deepEqual(await destacadasDe('conquista', PARTIDAS.conquista, 0), []);
  assert.deepEqual(await destacadasDe('conquista', null, 3), []);
});

test('ventanaDeClip extiende la unidad elegida con sus vecinas hasta pasar el minimo sin pasar el maximo, y respeta la primera unidad (la del intro)', async () => {
  const beats = await armarLinea('conquista', PARTIDAS.conquista), manos = [...new Set(beats.map((b) => b.mano))];
  const mitad = manos[Math.floor(manos.length / 2)];
  const w = ventanaDeClip(beats, mitad, { minMs: 20000, maxMs: 40000, desdeIndice: 1 });
  assert.ok(w.mano <= mitad && w.hasta >= mitad);
  assert.ok(w.ms >= 20000 && w.ms <= 40000 && w.ajustada === true, JSON.stringify(w));
  const suma = beats.filter((b) => b.mano >= w.mano && b.mano <= w.hasta).reduce((s, b) => s + duracionDeBeat(b, null, 1), 0);
  assert.equal(w.ms, suma, 'ms = lo que dura el clip');
  assert.ok(w.mano >= manos[1], 'no entra la primera unidad (lleva el intro)');
  assert.equal(ventanaDeClip(beats, 9999, {}), null, 'una unidad que no existe');
  assert.equal(ventanaDeClip(null, 1, {}), null);
  const largo = ventanaDeClip(beats, mitad, { minMs: 10, maxMs: 11, desdeIndice: 1 });
  assert.equal(largo.ajustada, false, 'una sola unidad ya pasa del maximo: se dice');
  assert.deepEqual([largo.mano, largo.hasta], [mitad, mitad]);
  const hastaIndice = manos.length - 2;
  assert.equal(ventanaDeClip(beats, manos.at(-1), { desdeIndice: 1, hastaIndice }), null, 'la ultima unidad (trae el final) no puede ser un clip');
  const casi = ventanaDeClip(beats, manos[hastaIndice], { minMs: 10 ** 9, maxMs: 10 ** 9 + 1, desdeIndice: 1, hastaIndice });
  assert.ok(casi.hasta <= manos[hastaIndice], 'la ventana no se extiende hasta la ultima unidad');
  const sinTope = ventanaDeClip(beats, manos[1], { minMs: 20000, maxMs: 40000, desdeIndice: 1 });
  assert.ok(sinTope.mano >= manos[1], 'no se pasa de la segunda unidad hacia atras');
});

test('el paquete de cada juego: dos partes que cubren la partida y de 1 a 3 clips de 20 a 40 s que no se encimen ni lleven la tarjeta de arranque', async () => {
  for (const [id, partida] of Object.entries(PARTIDAS)) {
    const { beats, paquete } = await paqueteDe(id, partida);
    const ids = paquete.piezas.map((p) => p.id);
    assert.deepEqual(ids.slice(0, 2), ['parte-1', 'parte-2'], id);
    assert.equal(new Set(ids).size, ids.length, `${id}: ids unicos`);
    const clips = paquete.piezas.filter((p) => p.tipo === 'clip');
    const unidades = new Set(beats.map((b) => b.mano)), ultima = beats.at(-1).mano;
    assert.ok(clips.length <= 3 && (unidades.size < 6 || clips.length >= 1), `${id}: ${clips.length} clips de ${unidades.size} unidades`);
    for (const c of clips) {
      assert.ok(c.grabar.hasta < ultima, `${id}: ${c.id} llega a la ultima unidad y trae el final de la partida (adelanta el resultado)`);
      assert.ok(beats.filter((b) => b.mano >= c.grabar.desde && b.mano <= c.grabar.hasta).every((b) => b.tipo !== 'final'), `${id}: ${c.id} lleva el beat final`);
    }
    const d = dividirEnDos(beats);
    const [p1, p2] = paquete.piezas;
    assert.deepEqual([p1.grabar.desde, p1.grabar.hasta, p2.grabar.desde, p2.grabar.hasta], [d.parte1.mano, d.parte1.hasta, d.parte2.mano, d.parte2.hasta]);
    assert.equal(p1.grabar.ms, d.parte1.ms);
    const ocupadas = [];
    for (const c of clips) {
      assert.ok(c.grabar.desde > beats[0].mano, `${id}: un clip no lleva el intro`);
      assert.ok(c.grabar.ms >= 20000 && c.grabar.ms <= 40000 || /fuera de/.test(c.grabar.nota), `${id}: ${c.id} dura ${c.grabar.ms}`);
      for (const [a, z] of ocupadas) assert.ok(c.grabar.hasta < a || c.grabar.desde > z, `${id}: ${c.id} se encima con otro clip`);
      ocupadas.push([c.grabar.desde, c.grabar.hasta]);
    }
    for (const pieza of paquete.piezas) {
      const q = params(pieza.grabar.url);
      assert.match(pieza.grabar.url, /^escena\.html\?/);
      assert.deepEqual([q.archivo, q.partida, q.ronda, q.hasta, q.formato, q.auto, q.limpio, q.grabar], [`pruebas/${id}.json`, '1', String(pieza.grabar.desde), String(pieza.grabar.hasta), 'hoja', '1', '1', '1'], `${id}: ${pieza.id}`);
    }
  }
});

test('el paquete avisa si la voz no cubre los momentos con texto de la partida (se narro antes de un cambio del texto): se grabaria sin voz sin que nada lo diga', async () => {
  const beats = await armarLinea('conquista', PARTIDAS.conquista);
  const alDia = Object.fromEntries(beats.filter((b) => b.texto).map((b) => [b.id, { archivo: `data/voz/x-p1/${b.id}.ogg`, ms: 5000, fuente: b.texto }]));
  assert.equal(momentosSinVoz(beats, alDia), 0);
  const avisos = async (voz) => (await paqueteDe('conquista', PARTIDAS.conquista, { voz, rutaVoz: 'data/voz/x-p1/voz.json' })).paquete.advertencias;
  assert.ok(!(await avisos(alDia)).some((a) => /voz/i.test(a)), 'una voz al dia no avisa de nada');
  // una voz vieja: le falta un momento (los ids cambian cuando cambia el numero de beats) y otro dice otra cosa
  const [a, b] = beats.filter((x) => x.texto && x.tipo !== 'intro').map((x) => x.id);
  const vieja = { ...alDia, [b]: { ...alDia[b], fuente: 'otro texto' } };
  delete vieja[a];
  assert.equal(momentosSinVoz(beats, vieja), 2);
  assert.match((await avisos(vieja)).join(' '), /La voz[\s\S]*?no cubre 2 momentos[\s\S]*?narrar\.mjs/i);
  // sin voz (nada o vacia) no hay de que avisar: se graba sin voz a proposito
  for (const nada of [null, undefined, {}]) assert.equal(momentosSinVoz(beats, nada), 0);
  assert.equal(momentosSinVoz(null, alDia), 0);
});

test('un formato que no es la hoja se avisa: el LEEME y el recorte suponen la hoja maestra de 3840 x 2160', async () => {
  const avisos = async (formato) => (await paqueteDe('conquista', PARTIDAS.conquista, { formato })).paquete.advertencias.join(' ');
  assert.doesNotMatch(await avisos('hoja'), /formato/i);
  for (const f of ['9x16', '16x9']) assert.match(await avisos(f), new RegExp(`formato es ${f}[^.]*hoja`, "i"));
});

test('la direccion de cada pieza lleva el numero de partida del archivo (una serie trae varias) y el formato que se pida', async () => {
  const { paquete } = await paqueteDe('conquista', PARTIDAS.conquista, { partidaNumero: 2, totalPartidas: 3, formato: '16x9' });
  assert.ok(paquete.piezas.length >= 2);
  for (const p of paquete.piezas) assert.deepEqual([params(p.grabar.url).partida, params(p.grabar.url).formato], ['2', '16x9'], p.id);
});

test('cada pieza trae lo que dura todo lo grabado: margen de negro + fundido + la pieza + fundido + cola, que es lo que se espera ante OBS', async () => {
  for (const [id, partida] of Object.entries(PARTIDAS)) {
    const { paquete } = await paqueteDe(id, partida);
    for (const p of paquete.piezas) {
      assert.deepEqual(p.grabar.plan, planDeGrabacion(p.grabar.ms), `${id} ${p.id}: el plan de grabacion de la pieza`);
      assert.equal(p.grabar.plan.totalMs - p.grabar.ms, 5000, `${id} ${p.id}: 2 s + 0.5 s + 0.5 s + 2 s de margenes y fundidos`);
      assert.equal(p.grabar.plan.contenidoMs, p.grabar.ms, `${id} ${p.id}: el contenido es la pieza`);
    }
  }
});

test('la direccion de grabacion lleva la voz cuando hay y la duracion se mide con ella', async () => {
  const partida = PARTIDAS.conquista, beats = await armarLinea('conquista', partida);
  const voz = Object.fromEntries(beats.map((b) => [b.id, { archivo: `a-${b.id}.mp3`, ms: 20000 }]));
  const sin = (await paqueteDe('conquista', partida)).paquete, con = (await paqueteDe('conquista', partida, { voz, rutaVoz: 'data/voz/x-p1/voz.json' })).paquete;
  assert.equal(params(con.piezas[0].grabar.url).voz, 'data/voz/x-p1/voz.json');
  assert.equal(params(sin.piezas[0].grabar.url).voz, undefined);
  assert.ok(con.piezas[0].grabar.ms > sin.piezas[0].grabar.ms, 'con voz dura mas');
});

test('los textos de cada red caben en su limite, llevan el aviso de IA y de independencia, y la linea de gancho esta marcada para que alguien la confirme', async () => {
  for (const [id, partida] of Object.entries(PARTIDAS)) {
    const { paquete } = await paqueteDe(id, partida);
    assert.ok(paquete.piezas.length >= 2, id); // las dos partes (una partida muy corta puede no tener clips: el final no se puede adelantar)
    for (const p of paquete.piezas) {
      const t = p.textos;
      for (const red of ['tiktok', 'instagram', 'facebook', 'x']) assert.ok(typeof t[red] === 'string' && t[red].length > 0, `${id} ${p.id} ${red}`);
      assert.ok(t.facebook.includes(ENLACE), `${id} ${p.id}: el texto de Facebook lleva el enlace al marcador (una pagina si puede ponerlo)`);
      assert.ok(t.x.length <= LIMITES.x, `${id} ${p.id}: X con ${t.x.length}`);
      assert.ok(t.tiktok.length <= LIMITES.tiktok, `${id} ${p.id}: TikTok con ${t.tiktok.length}`);
      assert.ok(t.instagram.length <= LIMITES.instagram, `${id} ${p.id}: Instagram con ${t.instagram.length}`);
      assert.ok(t.youtube.titulo.length <= LIMITES.youtubeTitulo && !t.youtube.titulo.includes('\n'), `${id} ${p.id}: titulo de YouTube de ${t.youtube.titulo.length}`);
      assert.ok(t.youtube.descripcion.length <= LIMITES.youtubeDescripcion, `${id} ${p.id}: descripcion de YouTube`);
      const ig = t.instagram.match(/#[\p{L}\p{N}_]+/gu) ?? [];
      assert.ok(ig.length >= 3 && ig.length <= 5, `${id} ${p.id}: ${ig.length} hashtags en Instagram`);
      for (const [red, texto] of [['tiktok', t.tiktok], ['instagram', t.instagram], ['facebook', t.facebook], ['x', t.x], ['youtube', t.youtube.descripcion]]) {
        assert.match(texto, /generad[oa] por IA/i, `${id} ${p.id} ${red}: falta el aviso de IA`);
        assert.match(texto, /independiente/i, `${id} ${p.id} ${red}: falta el aviso de independencia`);
      }
      for (const [red, texto] of [['tiktok', t.tiktok], ['instagram', t.instagram], ['facebook', t.facebook], ['x', t.x], ['titulo de YouTube', t.youtube.titulo]]) assert.match(texto, /\[GANCHO: .+\]/, `${id} ${p.id} ${red}: el gancho va marcado`);
    }
  }
});

test('el resultado solo sale en la parte 2 y dice "en esta partida"; las partes y los clips no lo adelantan; el comentario fijado solo va en las partes', async () => {
  for (const [id, partida] of Object.entries(PARTIDAS)) {
    const { paquete } = await paqueteDe(id, partida);
    const gan = partida.jugadores[partida.ganador]?.nombre, [p1, p2, ...clips] = paquete.piezas;
    const todo = (p) => textosPlanos(p).join('\n');
    assert.ok(!/Puntos:|Orden final:|En esta partida ganó/.test(todo(p1)), `${id}: la parte 1 adelanta el resultado`);
    for (const c of clips) assert.ok(!/Puntos:|Orden final:|En esta partida ganó/.test(todo(c)), `${id}: un clip adelanta el resultado`);
    if (gan && partida.empate !== true) assert.match(p2.textos.instagram, new RegExp(`En esta partida ganó ${gan.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `${id}: la parte 2 dice quien gano`);
    if (gan && partida.empate !== true) assert.match(p2.textos.facebook, new RegExp(`En esta partida ganó ${gan.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), `${id}: la parte 2 de Facebook dice quien gano`);
    // solo se escriben cifras que el video muestra: los puntos del juego en La Fuga y en Guerra de territorios; en los demas, el orden final (los puntos del marcador no salen en pantalla)
    assert.match(p2.textos.instagram, id === 'fuga' || id === 'conquista' ? /Puntos: / : /Orden final: /, id);
    if (id !== 'fuga' && id !== 'conquista') assert.doesNotMatch(p2.textos.instagram, /Puntos: /, `${id}: puntos del marcador que no se ven en el video`);
    assert.match(p2.textos.youtube.descripcion, /no es un ranking/i, `${id}: una partida suelta no es un ranking`);
    assert.ok(p1.comentarioFijado && p2.comentarioFijado && clips.every((c) => c.comentarioFijado === null), id);
    assert.match(p1.comentarioFijado, /sin retoques|no se retocan/);
    assert.ok(p1.comentarioFijado.includes(ENLACE));
    assert.ok(p1.textos.youtube.descripcion.includes(ENLACE), 'la descripcion de YouTube lleva el enlace');
    assert.ok(!p1.textos.x.includes('http'), 'el enlace no va en el post de X (va en el comentario)');
    assert.ok(p1.textos.youtube.descripcion.includes(textoDeJuego(id).regla), `${id}: la descripcion de YouTube explica la regla`);
  }
});

test('ningun texto del paquete lleva un mensaje privado ni la razon de una IA, y los hashtags de modelos son solo de quien juega', async () => {
  const q = structuredClone(PARTIDAS.conquista);
  q.rondas.forEach((r) => { r.privados.forEach((m, i) => { m.texto = `CENTINELA-PRIVADO-${r.turno}-${i}`; }); (r.respuestas ?? []).forEach((x) => { if (x) x.razon = 'CENTINELA-RAZON'; }); (r.mensajes ?? []).forEach((m) => { m.texto = 'mensaje publico'; }); });
  const { paquete } = await paqueteDe('conquista', q);
  assert.ok(!JSON.stringify(paquete).includes('CENTINELA'), 'un privado o una razon se filtro al paquete');
  const conModelos = structuredClone(PARTIDAS.mayormenor);
  conModelos.jugadores = [{ ...conModelos.jugadores[0], id: 'claude', tipo: 'modelo' }, { ...conModelos.jugadores[1], id: 'gpt', tipo: 'modelo' }];
  const { paquete: pm } = await paqueteDe('mayormenor', conModelos);
  const tags = (pq) => new Set(pq.piezas.flatMap((p) => textosPlanos(p).join(' ').match(/#[\p{L}\p{N}_]+/gu) ?? []));
  assert.ok(tags(pm).has('#Claude') && tags(pm).has('#ChatGPT'));
  for (const ausente of ['#Gemini', '#DeepSeek', '#Llama']) assert.ok(!tags(pm).has(ausente), `${ausente} no juega`);
  for (const bot of [paquete]) for (const ausente of ['#Claude', '#ChatGPT', '#Gemini', '#DeepSeek', '#Llama']) assert.ok(!tags(bot).has(ausente), `bots: ${ausente}`);
  assert.deepEqual(hashtagsDe(textoDeJuego('mayormenor'), conModelos.jugadores).slice(0, 1), ['#IAvsIA']);
  assert.ok(hashtagsDe(textoDeJuego('conquista'), [{ id: 'claude' }, { id: 'gpt' }, { id: 'gemini' }, { id: 'deepseek' }, { id: 'llama' }]).length <= 5, 'nunca mas de 5');
});

test('las advertencias: partida cortada, de bots, de La Fuga (siempre en serie), empate; y lo que no se puede publicar da piezas vacias con su motivo, sin lanzar', async () => {
  const cortada = { ...structuredClone(PARTIDAS.conquista), truncada: true };
  const a = (await paqueteDe('conquista', cortada)).paquete;
  assert.deepEqual(a.piezas, []);
  assert.match(a.advertencias.join(' '), /cortada|truncada/i);
  const b = (await paqueteDe('conquista', PARTIDAS.conquista)).paquete;
  assert.match(b.advertencias.join(' '), /bots|control/i, 'una partida de bots no es un episodio');
  const f = (await paqueteDe('fuga', PARTIDAS.fuga)).paquete;
  assert.match(f.advertencias.join(' '), /serie/i, 'La Fuga nunca se publica suelta');
  const serie = (await paqueteDe('fuga', PARTIDAS.fuga, { totalPartidas: 2 })).paquete;
  assert.match(serie.piezas[0].textos.instagram, /Partida 1 de 2/);
  const empate = structuredClone(PARTIDAS.mayormenor); empate.empate = true;
  assert.match((await paqueteDe('mayormenor', empate)).paquete.piezas[1].textos.instagram, /empate/i);
  for (const raro of [null, undefined, {}, { juego: { id: 'dilema' }, jugadores: [], rondas: [] }]) {
    const r = construirPaquete({ partida: raro, beats: [], destacadas: [], archivo: 'x.json', partidaNumero: 1, enlace: ENLACE });
    assert.deepEqual(r.piezas, [], JSON.stringify(raro));
    assert.ok(r.advertencias.length >= 1);
  }
  const sinBeats = construirPaquete({ partida: PARTIDAS.fuga, beats: [], destacadas: [], archivo: 'x.json', partidaNumero: 1, enlace: ENLACE });
  assert.deepEqual(sinBeats.piezas, []);
});

test('una parte que pasa de 3 minutos (el limite de los Shorts y de los Reels recomendados) se avisa; las que no, no', async () => {
  const largo = (await paqueteDe('tripledado', PARTIDAS.tripledado)).paquete;
  assert.ok(largo.piezas[0].grabar.ms > 180000, 'precondicion: Triple dado dura mas de 3 minutos por parte');
  assert.match(largo.advertencias.join(' '), /parte 1 dura \d+:\d\d: pasa de 3 minutos/);
  const corto = (await paqueteDe('conquista', PARTIDAS.conquista)).paquete;
  assert.ok(corto.piezas.every((p) => p.grabar.ms <= 180000));
  assert.doesNotMatch(corto.advertencias.join(' '), /3 minutos/);
});

test('con nombres larguisimos de jugadores el texto de X y el titulo de YouTube se acortan por el gancho y siguen dentro de su limite', async () => {
  const q = structuredClone(PARTIDAS.conquista);
  q.jugadores.forEach((j, i) => { j.nombre = `Jugador con un nombre exageradamente largo número ${i} ${'x'.repeat(220)}`; });
  const { paquete } = await paqueteDe('conquista', q);
  assert.ok(paquete.piezas.length >= 3);
  for (const p of paquete.piezas) {
    assert.ok(p.textos.x.length <= LIMITES.x, `${p.id}: X con ${p.textos.x.length}`);
    assert.ok(p.textos.youtube.titulo.length <= LIMITES.youtubeTitulo, `${p.id}: titulo con ${p.textos.youtube.titulo.length}`);
    assert.match(p.textos.x, /\[GANCHO: .+\]/);
    assert.match(p.textos.x, /generad[oa] por IA/i, 'el aviso de IA sobrevive al recorte');
  }
});

test('el orden final sigue el orden real de la partida (con sus desempates), no el de los puntos del marcador', async () => {
  const td = PARTIDAS.tripledado, nombres = td.jugadores.map((j) => j.nombre);
  const { paquete } = await paqueteDe('tripledado', td);
  assert.ok(paquete.piezas[1].textos.instagram.includes(`Orden final: ${td.orden.map((i) => nombres[i]).join(' · ')}.`));
  const revuelto = { ...structuredClone(td), orden: [...td.orden].reverse() };
  assert.ok((await paqueteDe('tripledado', revuelto)).paquete.piezas[1].textos.instagram.includes(`Orden final: ${revuelto.orden.map((i) => nombres[i]).join(' · ')}.`));
});

test('se avisa de un modelo que casi no respondio (caido o ilegible): una partida asi sirve para ver el fallo, no como episodio; una sana no avisa', async () => {
  const { jugarConqConCaido } = await import('./ayudas-conq.js');
  const caida = await jugarConqConCaido(18, 3, 1);
  const a = (await paqueteDe('conquista', caida)).paquete;
  assert.match(a.advertencias.join(' '), /Caido tuvo 30 jugadas inválidas en 30 llamadas/);
  const sana = structuredClone(PARTIDAS.mayormenor);
  sana.jugadores.forEach((j) => { j.tipo = 'modelo'; });
  sana.metricas.forEach((m) => { m.jugadasInvalidas = 1; });
  const b = (await paqueteDe('mayormenor', sana)).paquete;
  assert.doesNotMatch(b.advertencias.join(' '), /inválidas/, 'una jugada invalida de 18 no es un modelo caido');
  const bots = (await paqueteDe('conquista', PARTIDAS.conquista)).paquete;
  assert.doesNotMatch(bots.advertencias.join(' '), /inválidas/, 'los bots no cuentan');
});

test('el paquete es determinista: dos construcciones iguales dan lo mismo', async () => {
  const a = await paqueteDe('solitario', PARTIDAS.solitario), b = await paqueteDe('solitario', PARTIDAS.solitario);
  assert.deepEqual(a.paquete, b.paquete);
});
