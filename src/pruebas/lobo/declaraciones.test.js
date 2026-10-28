import test from 'node:test';
import assert from 'node:assert/strict';
import juego from '../../juegos/lobo.js';
import { crearRng } from '../../rng.js';
import { vistaDe, vistaCamara } from '../../juegos/lobo/vista.js';

function crear() {
  const E = juego.crear(crearRng(41));
  E.roles = ['lobo','lobo','vidente','bruja','cazador','cupido','aldeano','aldeano'];
  return E;
}
const paso = (E, fn) => juego.aplicar(E, juego.activos(E).map((a, i) => a ? fn(i) : null));
function noche(E, victima = null) {
  paso(E, (i) => ({ accion:'matar', objetivo:victima ?? (i === 0 ? 6 : 7) }));
  paso(E, () => ({ salvar:false, matar:null }));
  paso(E, () => ({ accion:'inspeccionar', objetivo:0 }));
}
function dia(E, declaraciones = {}, expulsar = null) {
  return paso(E, (i) => ({ mensaje:'Soy vidente.', voto:expulsar === null ? (i+1)%8 : i === expulsar ? 1 : expulsar,
    ...(Object.hasOwn(declaraciones, i) ? { afirmaRol:declaraciones[i] } : {}) }));
}
function abrir() { const E = crear(); paso(E, () => ({ enamorados:[6,7] })); noche(E); return E; }

test('en el modo «ambos» la cámara ve a Cupido al elegir, antes no; las IAs nunca lo ven', () => {
  const E = crear(); E.modoCupido = 'ambos'; assert.ok(vistaCamara(E).jugadores.every((j) => !j.rol));
  const r = paso(E, () => ({ enamorados:[6,7] }));
  assert.deepEqual(r.publico.eventos[0], { ronda:1, tipo:'enamorados', asientos:[6,7], cupido:5, revela:'ambos' });
  assert.equal(vistaCamara(E).jugadores[5].rol,'cupido');
  assert.ok(vistaCamara(E).jugadores.filter((j) => j.asiento !== 5).every((j) => !j.rol));
  for (const i of [0, 5, 7]) assert.ok(vistaDe(E, i).jugadores.every((j) => !j.rol), 'ninguna vista de IA trae roles de vivos');
});

test('afirmaRol opcional: mensaje libre no declara; mentira viva no revela ni verifica rol', () => {
  const E = abrir(); dia(E, {0:'vidente',2:'vidente'});
  assert.deepEqual(E.declaraciones,[{asiento:0,ronda:1,rol:'vidente'},{asiento:2,ronda:1,rol:'vidente'}]);
  const mensaje = E.eventos.find((e) => e.tipo === 'mensaje' && e.asiento === 0);
  assert.equal(mensaje.afirmaRol,'vidente'); assert.equal(mensaje.comprobacion,undefined); assert.equal(mensaje.rol,undefined);
  assert.equal(E.eventos.find((e) => e.tipo === 'mensaje' && e.asiento === 1).afirmaRol,undefined);
  for (const v of [vistaCamara(E),vistaDe(E,7)]) {
    assert.equal(v.jugadores[0].rol,undefined); assert.equal(v.jugadores[2].rol,undefined);
    assert.deepEqual(v.declaraciones,E.declaraciones);
    v.declaraciones[0].rol='lobo'; assert.equal(E.declaraciones[0].rol,'vidente');
  }
});

test('guarda todas las declaraciones y contrasta la última, solo en la muerte', () => {
  const E=abrir();dia(E,{0:'vidente'});noche(E);dia(E,{0:'aldeano'},0);
  assert.deepEqual(E.declaraciones.filter((d)=>d.asiento===0).map((d)=>[d.ronda,d.rol]),[[1,'vidente'],[2,'aldeano']]);
  const muerte=E.eventos.find((e)=>e.tipo==='muerte'&&e.asiento===0);
  assert.deepEqual(muerte.comprobacion,{ronda:2,rolDeclarado:'aldeano',rolReal:'lobo',coincide:false});
  assert.equal(E.eventos.filter((e)=>e.tipo==='mensaje').some((e)=>e.comprobacion),false);
});

test('la declaración verdadera se confirma en la muerte y la superviviente en el final', () => {
  const E=abrir();dia(E,{0:'vidente',2:'vidente'});noche(E,2);
  assert.equal(E.eventos.find((e)=>e.tipo==='muerte'&&e.asiento===2).comprobacion.coincide,true);
  const r=juego.cerrarPorLimiteLlamadas(E,{limite:100,llamadas:99,necesarias:2});
  assert.equal(r.publico.eventos.at(-1).tipo,'final');
  assert.deepEqual(r.publico.eventos.at(-1).comprobaciones.find((c)=>c.asiento===0),{asiento:0,ronda:1,rolDeclarado:'vidente',rolReal:'lobo',coincide:false});
});

test('roles declarados fuera del contrato se invalidan sin registrar datos arbitrarios', () => {
  for(const rol of [null,'rey','Vidente',{},1]) {
    const E=abrir(),r=dia(E,{0:rol});assert.equal(r.invalidas[0],true);
    assert.deepEqual(E.declaraciones,[]);assert.equal(r.privado.acciones.find((a)=>a.asiento===0).afirmaRol,undefined);
  }
});

test('declaraciones deterministas, sin cambiar reparto, votos, puntos ni número de decisiones', () => {
  const simular=(declara)=>{const E=abrir();dia(E,declara?{0:'vidente',2:'vidente'}:{},0);return E;};
  const a=simular(true),b=simular(true),c=simular(false);
  assert.deepEqual(a,b);
  for(const k of ['roles','vivos','puntos','stats','reemplazos','ronda','fase'])assert.deepEqual(a[k],c[k]);
  assert.deepEqual(a.eventos.find((e)=>e.tipo==='votacion'),c.eventos.find((e)=>e.tipo==='votacion'));
  assert.match(juego.formatoRespuesta,/afirmaRol.*opcional/);assert.match(juego.reglas,/No se interpreta el texto libre/);
});
