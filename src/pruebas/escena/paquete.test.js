// Integración editorial con Lobo real y ventanas sintéticas para las utilidades de clips.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirPaquete, ventanaDeClip, hashtagsDe } from '../../../web/casino/paquete-textos.js';
import { armarLinea, destacadasDe } from '../../../web/casino/lineas.js';
import { dividirEnDos, planDeGrabacion } from '../../../web/casino/escena-config.js';
import { MAX_TITULO, MAX_DESCRIPCION } from '../../../web/casino/editorial-paquete.js';
import { textoDeJuego } from '../../../web/casino/textos-juego.js';
import { jugarLobo } from './ayudas-lobo.js';
const partida = jugarLobo(3);
const beats = await armarLinea('lobo', partida);
const crear = (extra = {}) => construirPaquete({ partida, beats, destacadas: [], archivo: 'pruebas/lobo.json', partidaNumero: 1, juegoNumero: 7, enlace: 'https://ejemplo.test/', ...extra });
test('dos partes cubren Lobo y el episodio completo se publica al final', () => {
  const p = crear(), partes = p.piezas.filter(x => x.tipo === 'parte'), d = dividirEnDos(beats);
  assert.equal(partes.length, 2);
  assert.deepEqual(partes.map(x => [x.grabar.desde, x.grabar.hasta]), [[d.parte1.mano, d.parte1.hasta], [d.parte2.mano, d.parte2.hasta]]);
  assert.deepEqual(partes.map(x => x.cierre), ['parte', 'final']);
  assert.equal(p.ordenPublicacion.at(-1), 'episodio-completo');
  for (const x of p.piezas.filter(x => x.tipo !== 'gancho-imagen')) assert.deepEqual(x.grabar.plan, planDeGrabacion(x.grabar.ms));
});
test('Lobo sin suficientes cortes tiene un gancho de imagen fija por parte y conserva su arte y jN', async () => {
  assert.ok((await destacadasDe('lobo', partida, 10)).every(d => d.unidad >= 1));
  const p = crear(), g = p.piezas.filter(x => x.tipo === 'gancho-imagen');
  assert.equal(g.length, 2); assert.deepEqual(g.map(x => x.parte), [1, 2]);
  assert.ok(!p.piezas.some(x => x.tipo === 'gancho'));
  for (const x of g) assert.ok(JSON.stringify(x).includes('lobo'));
});
test('títulos y descripciones de todas las piezas llevan identificación y hashtags dentro de los topes', () => {
  for (const p of crear().piezas) {
    assert.match(p.publicacion.titulo, /^Lobo en la aldea J7 - /);
    assert.match(p.publicacion.descripcion, /^Lobo en la aldea J7 - /);
    assert.ok(p.publicacion.titulo.length <= MAX_TITULO);
    assert.ok(p.publicacion.descripcion.length <= MAX_DESCRIPCION);
    assert.match(p.publicacion.descripcion.split('\n').at(-1), /^#IAvsIA( #\S+){0,4}$/);
    for (const texto of [p.textos.tiktok, p.textos.instagram, p.textos.facebook, p.textos.x, p.textos.youtube.descripcion]) assert.match(texto.split('\n').at(-1), /^#IAvsIA( #\S+){0,4}$/);
  }
});
test('solo la parte final y el episodio anuncian el bando ganador; las piezas previas no adelantan el resultado', () => {
  assert.ok(partida.ganadorBando);
  for (const p of crear().piezas) {
    if (p.tipo === 'episodio' || p.id === 'parte-2') {
      assert.match(p.publicacion.descripcion, /aldea gana|Ganó el bando aldea/);
      assert.doesNotMatch(p.publicacion.descripcion, /empate/);
    } else assert.doesNotMatch(p.publicacion.descripcion, /Ganó el bando|Terminó en empate/);
  }
});
test('cada grabación lleva jN, número de partida, formato y cierre correspondientes', () => {
  for (const p of crear({ partidaNumero: 2, formato: '16x9' }).piezas.filter(x => x.tipo !== 'gancho-imagen')) {
    const q = new URL(p.grabar.url, 'http://local/').searchParams;
    assert.equal(q.get('numero'), '7'); assert.equal(q.get('partida'), '2');
    assert.equal(q.get('formato'), '16x9'); assert.equal(q.get('cierre'), p.cierre);
    if (p.tipo === 'parte') { assert.equal(q.get('parte'), String(p.parte)); assert.equal(q.get('de'), '2'); }
  }
});
test('la voz cambia duración y una narración incompleta produce aviso', () => {
  const voz = Object.fromEntries(beats.filter(b => b.texto).map(b => [b.id, { fuente: b.texto, archivo: `data/voz/prueba/${b.id}.ogg`, ms: 30000 }]));
  const con = crear({ voz, rutaVoz: 'data/voz/prueba/voz.json' });
  assert.ok(con.piezas[0].grabar.ms > crear().piezas[0].grabar.ms);
  assert.match(con.piezas[0].grabar.url, /voz=/);
  delete voz[Object.keys(voz)[1]];
  assert.match(crear({ voz }).advertencias.join(' '), /no cubre 1 momento/);
});
// Advertencia editorial (web/casino/paquete-textos.js, MAX_INVALIDAS = 0.25): se recuperan los dos casos que cubria la prueba eliminada.
const conModelos = (invalidas, llamadas = 20, extra = {}) => {
  const p = structuredClone(partida);
  p.jugadores.forEach((j, i) => { j.tipo = 'modelo'; p.metricas[i].jugadasInvalidas = 0; });
  p.usoPorJugador = p.jugadores.map(() => ({ llamadas }));
  p.metricas[0].jugadasInvalidas = invalidas;
  return Object.assign(p, extra);
};
const avisos = (p) => crear({ partida: p }).advertencias.join(' | ');
test('modelo sano: pocas jugadas inválidas no generan la advertencia editorial', () => {
  const texto = avisos(conModelos(4)); // 4 de 20 = 0.20, por debajo del umbral de 0.25
  assert.doesNotMatch(texto, /jugadas inválidas/); assert.doesNotMatch(texto, /controles? \(bots\)|control \(bots\)/, 'son modelos, no bots');
  assert.doesNotMatch(avisos(conModelos(0)), /jugadas inválidas/);
});
test('modelo que supera el umbral de jugadas inválidas: la advertencia nombra al modelo, sus cifras y no bloquea el paquete', () => {
  const p = conModelos(5), sano = crear({ partida: conModelos(0) }); // 5 de 20 = 0.25: justo en el umbral, ya avisa
  const r = crear({ partida: p });
  assert.match(r.advertencias.join(' | '), /Claude A tuvo 5 jugadas inválidas en 20 llamadas: un modelo caído o que no responde bien/);
  assert.equal(r.advertencias.filter(a => /jugadas inválidas/.test(a)).length, 1, 'solo el modelo afectado');
  assert.deepEqual(r.piezas.map(x => x.id), sano.piezas.map(x => x.id), 'se avisa pero las piezas se generan igual: los fallos se publican tal cual');
  p.metricas[3].jugadasInvalidas = 10; // otro modelo peor: aviso propio
  assert.equal(crear({ partida: p }).advertencias.filter(a => /jugadas inválidas/.test(a)).length, 2);
});
test('la advertencia de jugadas inválidas solo aplica a modelos con llamadas: ni bots, ni sin llamadas, ni sin datos', () => {
  const bots = conModelos(15); bots.jugadores[0].tipo = 'bot';
  assert.doesNotMatch(avisos(bots), /jugadas inválidas/);
  assert.doesNotMatch(avisos(conModelos(15, 0)), /jugadas inválidas/, 'sin llamadas no hay proporción');
  const sinDatos = conModelos(15); delete sinDatos.usoPorJugador; assert.doesNotMatch(avisos(sinDatos), /jugadas inválidas/);
});
test('no se filtran acciones privadas ni razonamientos a los textos del paquete', () => {
  const copia = structuredClone(partida);
  for (const r of copia.rondas) { r.privado = { secreto: 'CENTINELA-PRIVADO', razon: 'CENTINELA-RAZON' }; }
  const p = crear({ partida: copia });
  assert.doesNotMatch(JSON.stringify(p), /CENTINELA/);
  assert.equal(hashtagsDe(textoDeJuego('lobo'), [{ id: 'grok' }])[0], '#IAvsIA');
});
test('partidas cortadas, vacías o desconocidas no producen piezas', () => {
  for (const p of [null, {}, { ...partida, truncada: true }, { ...partida, juego: { id: 'ausente' } }]) {
    const r = crear({ partida: p }); assert.deepEqual(r.piezas, []); assert.ok(r.advertencias.length);
  }
  assert.deepEqual(crear({ beats: [] }).piezas, []);
});
test('la construcción del paquete es determinista', () => { assert.deepEqual(crear(), crear()); });
test('ventanas de clips respetan duración, límites y unidades sin incluir intro ni final', () => {
  const b = Array.from({ length: 12 }, (_, i) => ({ id: `r${i}`, mano: i + 1, minMs: 10000, pasos: [] }));
  const w = ventanaDeClip(b, 5, { minMs: 20000, maxMs: 40000, desdeIndice: 1, hastaIndice: 10 });
  assert.ok(w.mano <= 5 && w.hasta >= 5); assert.ok(w.mano >= 2 && w.hasta <= 11);
  assert.ok(w.ms >= 20000 && w.ms <= 40000);
  assert.equal(ventanaDeClip(b, 12, { hastaIndice: 10 }), null);
  assert.equal(ventanaDeClip(null, 1), null);
});
