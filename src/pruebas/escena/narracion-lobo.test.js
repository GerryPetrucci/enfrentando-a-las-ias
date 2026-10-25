import test from 'node:test';
import assert from 'node:assert/strict';
import { crearNarrador, CITAS_POR_DIA } from '../../../web/casino/narracion-lobo.js';
import { construirLineaDeTiempo } from '../../../web/casino/linea-de-tiempo-lobo.js';
import { armarLinea } from '../../../web/casino/lineas.js';
import { planDeNarracion } from '../../../herramientas/narrar.mjs';
import { jugarLobo } from './ayudas-lobo.js';

const nombres = ['Ana', 'Beto', 'Cira', 'Dani', 'Eli', 'Fede', 'Gala', 'Hugo'];
const nuevo = () => crearNarrador({ nombre: (i) => nombres[i], nombres });
const contar = (n, tipo, paso = {}, ronda = 1, texto = '') => n.contar({ tipo, paso, ronda, texto }).dicho.map((x) => x.texto).join(' ');

test('Lobo: narración determinista para 8/12, sin modificar el historial', async () => {
  for (const n of [8, 12]) {
    const p = jugarLobo(3, n), copia = structuredClone(p);
    const a = await armarLinea('lobo', p), b = await armarLinea('lobo', p);
    assert.deepEqual(a, b); assert.deepEqual(p, copia);
    const plan = planDeNarracion(a);
    assert.ok(plan.length > 0);
    for (const beat of a.filter((x) => x.tipo !== 'intro')) {
      assert.equal(beat.texto, beat.dicho.map((x) => x.texto).join(' '));
      assert.equal(plan.some((x) => x.id === beat.id), Boolean(beat.texto));
    }
  }
});

test('Lobo: seis noches distintas, genéricas, sin nombrar actores ni roles', () => {
  const narrador = nuevo();
  const noches = Array.from({ length: 6 }, (_, i) => contar(narrador, 'noche', {}, i + 1));
  assert.equal(new Set(noches).size, 6);
  for (const texto of noches) {
    assert.doesNotMatch(texto, /lobo|vidente|bruja|cazador|cupido/i);
    for (const nombre of nombres) assert.ok(!texto.includes(nombre));
  }
});

test('Lobo: enamorados literales, amanecer con/sin muertes y disparo', () => {
  const n = nuevo();
  assert.match(contar(n, 'enamorados', { asientos: [0, 1] }), /Cupido une a Ana y a Beto/);
  assert.match(contar(n, 'amanecer', { hayMuertes: false }), /nadie falta hoy/);
  assert.doesNotMatch(contar(n, 'amanecer', { hayMuertes: true }), /nadie|Vidente/);
  assert.equal(contar(n, 'muerte', { asiento: 0, causa: 'noche', rol: 'vidente' }), 'Ana ya no despierta: era Vidente.');
  assert.match(contar(n, 'disparo', { asiento: 0, objetivo: 1 }), /Ana, con su último aliento, se lleva a Beto/);
});

test('Lobo: prioriza tres acusaciones literales, resume el resto una vez y calla silencios', () => {
  const n = nuevo();
  const mensajes = ['No sé.', 'Cira es lobo.', 'Sospecho de Ana.', 'Detecté lobo en asiento 7.', 'Cira parece sospechosa.', ''];
  n.prepararDia(mensajes.map((mensaje, asiento) => ({ tipo: 'mensaje', mensaje, asiento })));
  const textos = mensajes.map((mensaje, asiento) => contar(n, 'mensaje', { asiento, mensaje, parte: 1 }, 1, `${nombres[asiento]} dice: «${mensaje}»`));
  assert.equal(CITAS_POR_DIA, 3);
  assert.equal(textos.filter((x) => x.includes('dice:')).length, 3);
  for (const i of [1, 2, 3]) assert.equal(textos[i], `${nombres[i]} dice: «${mensajes[i]}»`);
  assert.equal(textos.filter((x) => x.includes('El resto')).length, 1);
  assert.equal(textos[5], '');
  n.prepararDia([{ tipo: 'mensaje', asiento: 0, mensaje: 'Soy vidente; Beto es lobo.' }]);
  assert.equal(contar(n, 'mensaje', { asiento: 0, mensaje: 'Soy vidente; Beto es lobo.' }, 2, 'Ana dice: «Soy vidente; Beto es lobo.»'), 'Ana dice: «Soy vidente; Beto es lobo.»');
});

test('Lobo: conserva las citas largas en sus fragmentos y reinicia selección cada día', () => {
  const p = jugarLobo();
  const dia = p.rondas.find((r) => r.fase === 'dia');
  const mensajes = dia.publico.eventos.filter((e) => e.tipo === 'mensaje');
  mensajes.forEach((e) => { e.mensaje = ''; });
  mensajes[0].mensaje = 'Sospecho del asiento 7. '.repeat(25).trim();
  const beats = construirLineaDeTiempo(p).filter((b) => b.registro === p.rondas.indexOf(dia) && b.tipo === 'mensaje' && b.asiento === mensajes[0].asiento);
  assert.ok(beats.length > 1);
  assert.equal(beats.map((b) => b.pasos[1].mensaje).join(' '), mensajes[0].mensaje);
  assert.ok(beats.every((b) => b.texto === b.lineas[0].texto));
});

test('Lobo: ningún rol vivo se confirma antes de su muerte o del final; privados inaccesibles', () => {
  for (const jugadores of [8, 12]) for (let seed = 0; seed < 12; seed++) {
    const p = jugarLobo(seed, jugadores);
    for (const r of p.rondas) {
      Object.defineProperty(r, 'privado', { get() { throw new Error('Secreto'); } });
      Object.defineProperty(r.publico, 'camara', { get() { throw new Error('Instantánea futura'); } });
    }
    Object.defineProperty(p, 'metricas', { get() { throw new Error('Roles finales'); } });
    for (const b of construirLineaDeTiempo(p)) {
      const paso = b.pasos[1];
      if (b.tipo === 'muerte') assert.match(b.texto, /: era /);
      else if (b.tipo !== 'final') assert.doesNotMatch(b.texto, /: era |Su rol era |el cazador,|es realmente/i);
      if (b.tipo === 'mensaje' && b.texto.includes('dice:')) assert.equal(b.texto, b.lineas[0].texto);
      if (b.tipo === 'votacion') assert.ok(!b.texto.includes('era '));
      if (b.tipo === 'noche') assert.equal(paso.asiento, undefined);
    }
  }
});

test('Lobo: voto empatado/expulsión y finales por bando, extinción, rondas o llamadas', () => {
  const n = nuevo();
  assert.match(contar(n, 'votacion', { empate: true }), /nadie es expulsado/);
  assert.equal(contar(n, 'votacion', { empate: false, expulsado: 0 }), 'La aldea vota.');
  assert.match(contar(n, 'muerte', { asiento: 0, rol: 'lobo', causa: 'voto' }), /Ana recibe más votos y es expulsado: era Lobo/);
  for (const [paso, patron] of [
    [{ ganadorBando: 'aldea' }, /Victoria de la aldea/], [{ ganadorBando: 'lobos' }, /Victoria de los lobos/],
    [{ motivo: 'extincion' }, /Empate por extinción/], [{ motivo: 'rondas' }, /tope de rondas/],
    [{ motivo: 'llamadas', parejaViva: true }, /límite de llamadas.*ganan su bono/],
  ]) assert.match(contar(n, 'final', paso), patron);
});
