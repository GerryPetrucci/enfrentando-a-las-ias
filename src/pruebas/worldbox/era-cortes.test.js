import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calcularTramos, cadenaAtempo, construirFiltro, construirComando, VENTANAS } from '../../../herramientas/worldbox-cortes.mjs';
import { crearAdaptadorEraSimulado } from '../../worldbox/era/adaptador-era-simulado.js';
import { correrEra } from '../../worldbox/era/orquestador-era.js';
import { crearBotEra } from '../../worldbox/era/bots-era.js';
import { crearLineaTiempo, describirEventoJuego } from '../../worldbox/era/linea-tiempo.js';

// Linea de tiempo -> tramos con velocidad sugerida y comando ffmpeg (herramientas/worldbox-cortes.mjs).
const linea = eventos => ({ eventos: eventos.map((e, i) => ({ i, importancia: 'alta', tipo: 'x', descripcion: 'e', ...e })) });

test('tramos: ventanas alrededor de los eventos importantes a velocidad normal y la calma acelerada; cubren todo el video sin huecos ni solapes', () => {
  const l = linea([{ t_real_s: 30, tipo: 'llamada' }, { t_real_s: 300, tipo: 'llamada' }, { t_real_s: 500, tipo: 'muro_cae', descripcion: 'Cae el muro' }, { t_real_s: 505, tipo: 'guerra' }, { t_real_s: 700, importancia: 'baja' }]);
  const r = calcularTramos(l, { duracion: 900, calma: 8, calmaGuerra: 3 });
  assert.equal(r.duracion_origen, 900);
  assert.equal(r.tramos[0].inicio, 0);
  for (let i = 1; i < r.tramos.length; i++) assert.equal(r.tramos[i].inicio, r.tramos[i - 1].fin, `tramo ${i} contiguo`);
  assert.equal(r.tramos.at(-1).fin, 900);
  const calma = r.tramos.filter(t => t.motivo === 'calma');
  assert.ok(calma.length >= 3 && calma.every(t => t.factor === 8 || t.factor === 3));
  assert.ok(calma.filter(t => t.inicio < 500).every(t => t.factor === 8) && calma.filter(t => t.inicio >= 500).every(t => t.factor === 3), 'la calma de la guerra se acelera menos');
  const conEvento = r.tramos.find(t => t.inicio <= 30 && t.fin >= 30); assert.equal(conEvento.factor, 1);
  const alta = VENTANAS.alta, v = r.tramos.find(t => t.inicio === 500 - alta.antes); assert.ok(v && v.factor === 1 && v.fin >= 505 + alta.despues, 'las ventanas de muro y guerra se funden');
  assert.ok(r.duracion_salida < r.duracion_origen / 2, `salida ${r.duracion_salida} s de ${r.duracion_origen} s`);
  assert.equal(r.tramos.filter(t => t.motivo === 'inicio' || t.motivo.startsWith('inicio')).length >= 1, true);
  const total = r.tramos.reduce((s, t) => s + t.duracion_salida, 0); assert.ok(Math.abs(total - r.duracion_salida) < 0.5);
});

test('los eventos de baja importancia o anteriores a la grabacion no abren ventanas', () => {
  const r = calcularTramos(linea([{ t_real_s: null, tipo: 'fundacion' }, { t_real_s: 400, importancia: 'baja' }]), { duracion: 600 });
  assert.equal(r.tramos.filter(t => t.factor === 1).length, 2, 'solo el inicio y el final');
});

test('filtro ffmpeg: un trim por tramo, setpts con el factor, atempo encadenado (maximo 2 por filtro) y concat', () => {
  assert.equal(cadenaAtempo(1), ''); assert.equal(cadenaAtempo(2), ',atempo=2'); assert.equal(cadenaAtempo(8), ',atempo=2,atempo=2,atempo=2'); assert.equal(cadenaAtempo(3), ',atempo=2,atempo=1.5');
  const r = calcularTramos(linea([{ t_real_s: 100 }]), { duracion: 200 });
  const f = construirFiltro(r.tramos);
  assert.match(f, /\[0:v\]trim=start=0:end=20/); assert.match(f, /setpts=\(PTS-STARTPTS\)\/8/); assert.match(f, new RegExp(`concat=n=${r.tramos.length}:v=1:a=1\\[v\\]\\[a\\]`));
  assert.equal((f.match(/\[0:v\]trim/g) ?? []).length, r.tramos.length);
  const c = construirComando('C:/v/grabacion.mkv', 'filtro.txt', 'salida.mp4');
  assert.match(c, /^ffmpeg -i "C:\/v\/grabacion\.mkv" -filter_complex_script "filtro\.txt" -map "\[v\]" -map "\[a\]"/);
});

test('de punta a punta: la linea de tiempo de una partida simulada produce tramos coherentes (el muro y la guerra a velocidad normal)', async () => {
  let ahora = 0;
  const linea_ = crearLineaTiempo({ ahora: () => ahora });
  const presentacion = { lecturaMs: 4000, finMs: 0, dormir: async ms => { ahora += ms; }, preludio: async ({ listo }) => { listo(); ahora += 15000; } };
  const adaptador = crearAdaptadorEraSimulado({ sim: { letalidad: 0.005 } }); // guerra lenta: nadie cae antes del limite
  const avanzar = adaptador.avanzar;
  adaptador.avanzar = async d => { ahora += 400; return avanzar(d); }; // cada anio simulado tarda 0,4 s reales
  await correrEra({ adaptador, participantes: [{ id: 'f1', modelo: 'bot-era-militar', decidir: crearBotEra('bot-era-militar', 1) }, { id: 'f2', modelo: 'bot-era-economico', decidir: crearBotEra('bot-era-economico', 2) }],
    semilla: 7, partida: { anioMuro: 400, anioLimite: 600, intervencionesDesarrollo: [100, 200, 300], intervencionesGuerra: [10, 30] }, lineaTiempo: linea_, presentacion, ahora: () => ahora });
  const doc = linea_.documento();
  const caida = doc.eventos.find(e => e.tipo === 'muro_cae');
  const r = calcularTramos(doc, {});
  const t = r.tramos.find(x => x.inicio <= caida.t_real_s && x.fin >= caida.t_real_s);
  assert.equal(t.factor, 1); assert.ok(r.duracion_salida < r.duracion_origen);
  assert.ok(r.tramos.some(x => x.factor === 8) && r.tramos.some(x => x.factor === 3), 'calma de desarrollo y de guerra');
});

test('descripciones de los eventos del juego: nombres de modelo en vez de f1/f2 y las importancias esperadas', () => {
  const n = id => ({ f1: 'Claude Haiku', f2: 'GPT Luna' })[id];
  assert.equal(describirEventoJuego({ tipo: 'guerra_declarada', faccion_a: 'f1', faccion_b: 'f2' }, n).descripcion, 'Empieza la guerra entre Claude Haiku y GPT Luna');
  assert.equal(describirEventoJuego({ tipo: 'guerra_declarada', faccion_a: 'f1', faccion_b: 'f1', guerra_civil: true }, n).tipo, 'guerra_civil');
  assert.equal(describirEventoJuego({ tipo: 'civilizacion_eliminada', faccion: 'f2' }, n).importancia, 'alta');
  assert.equal(describirEventoJuego({ tipo: 'ciudad_conquistada', a: 'f1', de: 'f2' }, n).descripcion, 'Claude Haiku conquista una ciudad de GPT Luna');
  assert.equal(describirEventoJuego({ tipo: 'reino_nuevo', faccion: 'f1' }, n).tipo, 'reino_partido');
  assert.equal(describirEventoJuego({ tipo: 'rasgos_aplicados' }, n), null);
  assert.ok(!/f[12]\b/.test(describirEventoJuego({ tipo: 'ciudad_fundada', faccion: 'f1' }, n).descripcion));
});

test('web/worldbox-vivo.html: muestra el anio, la fase, las elecciones y el subtitulo de la era, en 16:9 y 9:16, sin animaciones ni transiciones (problemas conocidos del CEF de OBS)', async () => {
  const html = await readFile(new URL('../../../web/worldbox-vivo.html', import.meta.url), 'utf8');
  assert.ok(!/@keyframes|animation\s*:|transition\s*:|requestAnimationFrame/.test(html), 'sin animaciones CSS');
  for (const s of ["e.formato === 'era'", 'e.anio', 'e.anio_muro', 'e.etapa', "'elegido'", "'rasgos'", 'e.pensando', "demo') === 'era'", 'f16x9', 'f9x16', '.f9x16 .faccion .elegido']) assert.ok(html.includes(s), s);
  assert.match(html, /name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/);
});
