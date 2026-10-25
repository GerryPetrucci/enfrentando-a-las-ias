import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearEstado } from '../../juegos/fuga/estado.js';
import { crearRng } from '../../rng.js';
import { aplicarTurno } from '../../juegos/fuga/turno.js';
import { normalizarRespuesta } from '../../juegos/fuga/ordenes.js';
import { probFallo } from '../../juegos/fuga/riesgo.js';
import { hechosActivos, modificadoresTrama, resolverTrama } from '../../juegos/fuga/trama.js';
import { crearHistoriaInicial, validarHistoria } from '../../juegos/fuga/historia-datos.js';
import { vistaTexto } from '../../juegos/fuga/vista.js';

const jugada = (metodo, postura = 'avanzar') => normalizarRespuesta({ metodo, postura, aprovechar: false });
function mundo(seed = 73) {
  const rng = crearRng(seed); let creado = false;
  const E = crearEstado(() => { assert.equal(creado, false, 'no se consume RNG despues de crear'); return rng(); }, { ramificada: true });
  creado = true;
  E.dados = E.dados.map(() => [0.999, 0.999]); E.salidas = E.salidas.map(() => [1, 1]);
  return E;
}
const paso = (E, metodo, otro = metodo, postura = 'avanzar') => aplicarTurno(E, [jugada(metodo, postura), jugada(otro)]);

test('lugares conectados: no existe un conjunto universal de salidas y los accesos dependen de resultados', () => {
  const h = crearHistoriaInicial();
  assert.equal(h.nodos.length, 22);
  assert.ok(h.nodos.every((n) => n.salidas.length <= 3));
  const vecinos = (id) => h.nodos.find((n) => n.id === id).salidas.map((s) => s.a);
  assert.deepEqual(vecinos('r2-mantenimiento'), ['r3-ductos', 'r3-taller']);
  assert.deepEqual(vecinos('r2-control'), ['r3-archivo', 'r3-pasillo']);
  const E = mundo(); E.dados[0] = [0, 0.999];
  const r = paso(E, 'fuerza', 'sigilo');
  assert.equal(r.resultados[0], 'tropezo');
  assert.equal(E.historia.actual, 'r2-galeria', 'el exito del otro jugador no convierte en exitoso el intento de fuerza');
  assert.equal(hechosActivos(E, 'puerta_forzada').length, 0);
});

test('la puerta deja una consecuencia diferida y borrar el rastro la contrarresta', () => {
  const a = mundo(), b = mundo();
  for (const E of [a, b]) { paso(E, 'fuerza'); paso(E, 'fuerza'); }
  paso(a, 'fuerza'); paso(b, 'sigilo');
  assert.equal(a.historia.actual, 'r4-servicio'); assert.equal(b.historia.actual, a.historia.actual);
  assert.ok(modificadoresTrama(a, 0, jugada('sigilo')).some((m) => m.id === 'patrulla'));
  assert.equal(modificadoresTrama(b, 0, jugada('sigilo')).length, 0);
  const sinRastro = structuredClone(a); sinRastro.historia.memoria = [];
  // Mantener todos los demas factores iguales para aislar el costo diferido.
  const J = [jugada('sigilo'), jugada('engano')], sit = a.situaciones[a.ronda];
  const delta = probFallo(sit, J, 0, a) - probFallo(sit, J, 0, sinRastro);
  assert.ok(Math.abs(delta - 0.06) < 1e-10);
  const r = paso(a, 'sigilo');
  assert.ok(r.trama.eventos.some((e) => e.causa === 'puerta_forzada'));
  assert.ok(r.narracion.some((n) => /puerta forzada/.test(n.texto)));
});

test('la credencial pertenece a quien la consigue; beneficia engano, se descubre al fallar y caduca', () => {
  const E = mundo(); paso(E, 'engano'); paso(E, 'engano', 'sigilo');
  assert.equal(E.historia.actual, 'r3-archivo');
  assert.equal(hechosActivos(E, 'credencial', 0).length, 1);
  assert.equal(hechosActivos(E, 'credencial', 1).length, 0);
  assert.equal(modificadoresTrama(E, 0, jugada('sigilo')).length, 0);
  assert.equal(modificadoresTrama(E, 0, jugada('engano'))[0].delta, -0.07);
  assert.equal(modificadoresTrama(E, 1, jugada('engano')).length, 0);
  const expirada = structuredClone(E); expirada.ronda = 6;
  assert.equal(hechosActivos(expirada, 'credencial').length, 0);
  E.dados[2][0] = 0; paso(E, 'engano', 'sigilo');
  assert.equal(hechosActivos(E, 'credencial').length, 0);
  assert.equal(hechosActivos(E, 'credencial_detectada', 0).length, 1);
  paso(E, 'sigilo');
  assert.equal(E.historia.actual, 'r5-patrulla', 'el control de carga ya no esta disponible');
});

test('el companero puede borrar el rastro de una puerta que no forzo el mismo', () => {
  const E = mundo(); paso(E, 'fuerza', 'engano'); paso(E, 'fuerza');
  assert.equal(hechosActivos(E, 'puerta_forzada', 1).length, 0);
  paso(E, 'fuerza', 'sigilo');
  assert.equal(hechosActivos(E, 'rastro_borrado', 1).length, 1);
  assert.equal(modificadoresTrama(E, 0, jugada('fuerza')).length, 0);
});

test('cooperar en el almacen consigue cuerda para el actor y se consume una sola vez', () => {
  const E = mundo();
  for (const m of ['fuerza', 'fuerza', 'sigilo', 'fuerza']) paso(E, m);
  assert.equal(E.historia.actual, 'r5-almacen');
  const r = paso(E, 'fuerza', 'fuerza', 'ayudar');
  assert.equal(hechosActivos(E, 'cuerda', 0).length, 1);
  assert.equal(hechosActivos(E, 'cuerda', 1).length, 0);
  assert.equal(modificadoresTrama(E, 0, jugada('fuerza'))[0].id, 'cuerda');
  assert.equal(modificadoresTrama(E, 1, jugada('fuerza')).length, 0);
  const memoria = structuredClone(E.historia.memoria);
  // El registro ya aplicado no vuelve a entregar una recompensa en el mismo nodo.
  const previo = E.historia.actual; E.historia.actual = 'r5-almacen';
  resolverTrama(E, r, [[], []]);
  assert.deepEqual(E.historia.memoria, memoria); E.historia.actual = previo;
  paso(E, 'fuerza');
  assert.equal(hechosActivos(E, 'cuerda', 0).length, 0);
  assert.equal(hechosActivos(E, 'cuerda_gastada', 0).length, 1);
  assert.equal(modificadoresTrama(E, 0, jugada('fuerza')).length, 0);
});

test('soledad, heridas y alarma coexisten con lugar y memoria; objetos de un capturado no abren rutas', () => {
  const E = mundo(); paso(E, 'engano'); paso(E, 'engano', 'sigilo');
  E.libres[0] = false; E.heridas[1] = 1; E.alarma = 4;
  assert.equal(hechosActivos(E, 'credencial').length, 0);
  const vista = vistaTexto(E, 1);
  assert.match(vista, /Lugar: Archivo del personal/);
  assert.match(vista, /Sigues solo/); assert.match(vista, /Tus heridas: 1/);
  assert.doesNotMatch(vista, /huella|delta|r[1-9]-|memoria|puerta_forzada/);
  assert.equal(E.historia.actual, 'r3-archivo');
});

test('elegir ayudar cuando ya no hay companero no concede una recompensa por cooperar', () => {
  const E = mundo();
  for (const m of ['fuerza', 'fuerza', 'sigilo', 'fuerza']) paso(E, m);
  E.libres[1] = false;
  aplicarTurno(E, [jugada('sigilo', 'ayudar'), null]);
  assert.equal(hechosActivos(E, 'cuerda').length, 0);
});

test('importar consecuencias rechaza efectos desconocidos, ajustes excesivos y condiciones ejecutables', () => {
  for (const alterar of [
    (h) => { h.nodos[0].reglas[0].efecto = 'ejecutar'; },
    (h) => { h.nodos[0].reglas[0].si.evaluar = 'process.exit()'; },
    (h) => { h.nodos[0].reglas[0].duracion = 999; },
    (h) => { h.nodos.find((n) => n.modificadores.length).modificadores[0].delta = 10; },
    (h) => { h.nodos[0].salidas[0].si.hecho = 'hecho_inventado'; },
  ]) { const h = crearHistoriaInicial(); alterar(h); assert.throws(() => validarHistoria(h)); }
});
