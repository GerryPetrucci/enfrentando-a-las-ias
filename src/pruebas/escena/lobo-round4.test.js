import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIGURACIONES } from '../../juegos/lobo/constantes.js';
import { crearEstado } from '../../juegos/lobo/estado.js';
import { crearRng } from '../../rng.js';
import { repartosPublicos } from '../../../herramientas/generar-repartos-lobo.mjs';
import { REPARTOS_PUBLICOS } from '../../../web/casino/lobo-repartos-publicos.js';
import { mezclarCasas } from '../../../web/casino/lobo-casas.js';
import { construirLineaDeTiempo } from '../../../web/casino/linea-de-tiempo-lobo.js';
import { crearNarrador } from '../../../web/casino/narracion-lobo.js';
import { NOCHES } from '../../../web/casino/lobo-arte.js';

test('reparto público derivado del motor: no queda una tabla paralela desactualizada',()=>{
  assert.deepEqual(REPARTOS_PUBLICOS,repartosPublicos());
  assert.deepEqual(Object.keys(REPARTOS_PUBLICOS),Object.keys(CONFIGURACIONES));
  for(const n of Object.keys(CONFIGURACIONES)){
    const real=crearEstado(crearRng(917),{jugadores:Number(n)}).roles.sort();
    assert.deepEqual([...REPARTOS_PUBLICOS[n]].sort(),real);
  }
});

test('casas mezcladas deterministas con composición exacta, usando otro RNG que el reparto de asientos',()=>{
  for(const n of [8,12]){
    const distintos=new Set();
    for(let seed=0;seed<40;seed++){
      const casas=mezclarCasas(n,seed);
      assert.deepEqual(casas,mezclarCasas(n,seed));assert.deepEqual([...casas].sort(),REPARTOS_PUBLICOS[n]);
      assert.ok(casas.every(r=>NOCHES[r].length===6));distintos.add(JSON.stringify(casas));
    }
    assert.ok(distintos.size>20);
    const p={seed:107,jugadores:Array.from({length:n},(_,i)=>({nombre:`Nombre ${i}`,rol:'lobo'})),rondas:[{fase:'cupido',ronda:1,publico:{eventos:[]}}]};
    Object.defineProperty(p,'roles',{get(){throw new Error('Secreto');}});
    const a=construirLineaDeTiempo(p)[0];p.jugadores.reverse();
    const b=construirLineaDeTiempo(p)[0];assert.deepEqual(a.pasos[1],b.pasos[1]);
    assert.ok(a.pasos[0].jugadores.every(j=>j.rol===undefined));assert.ok(!JSON.stringify(a.pasos[1]).includes('asiento'));
    assert.deepEqual(a.pasos[1].casas,mezclarCasas(n,107));
  }
});

test('declaración se anuncia solo al estrenarla o cambiarla: silencio/omisión/repetición no la renuevan',()=>{
  const eventos=[{afirmaRol:'vidente'},{},{afirmaRol:'vidente'},{afirmaRol:'bruja'},{}];
  const p={seed:5,jugadores:Array.from({length:8},(_,i)=>({nombre:`Bot ${i}`})),rondas:eventos.map((e,i)=>({fase:'dia',ronda:i+1,publico:{eventos:[{tipo:'mensaje',ronda:i+1,asiento:0,mensaje:'',...e}]}}))};
  const mensajes=construirLineaDeTiempo(p).filter(b=>b.tipo==='mensaje');
  assert.match(mensajes[0].texto,/afirma ser Vidente/);assert.match(mensajes[3].texto,/afirma ser Bruja/);
  for(const i of [1,2,4]){assert.equal(mensajes[i].texto,'');assert.equal(mensajes[i].pasos[1].afirmaRol,undefined);}
  const estado=mensajes.at(-1).pasos[2];assert.equal(estado.declaraciones.length,3);assert.equal(estado.jugadores[0].afirmaRol,'bruja');assert.equal(estado.jugadores[0].rol,undefined);
  assert.deepEqual(construirLineaDeTiempo(p),construirLineaDeTiempo(structuredClone(p)));
});

test('narrador también evita reiterar una declaración recibida dos veces y no infiere mensajes libres',()=>{
  const n=crearNarrador();
  const decir=(afirmaRol)=>n.contar({tipo:'mensaje',ronda:1,paso:{asiento:0,mensaje:'',...(afirmaRol?{afirmaRol}:{})},texto:''}).dicho.map(l=>l.texto).join(' ');
  assert.match(decir('vidente'),/afirma ser Vidente/);assert.equal(decir(), '');assert.equal(decir('vidente'),'');assert.match(decir('bruja'),/afirma ser Bruja/);
});

