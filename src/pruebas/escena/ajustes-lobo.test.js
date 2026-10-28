import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { jugarLobo } from './ayudas-lobo.js';
import { construirLineaDeTiempo } from '../../../web/casino/linea-de-tiempo-lobo.js';
import { crearNarrador, textoDeComprobacion } from '../../../web/casino/narracion-lobo.js';
import { ordenarPorVotos, colocarLobo } from '../../../web/casino/layout-lobo.js';
import { ROLES_LOBO, ASAMBLEA, fotogramasDe } from '../../../web/casino/lobo-arte.js';

test('preparación anónima antes de primera noche y elenco separado después de todas las revelaciones',()=>{
  for(const n of [8,12]){
    const beats=construirLineaDeTiempo(jugarLobo(n===8?107:4,n,{declaraciones:true}));
    assert.equal(beats[0].tipo,'preparacion');assert.equal(beats[0].pasos[1].habitantes,n);assert.equal(beats[0].pasos[1].casas.length,n);
    assert.equal(beats[1].tipo,'noche');assert.equal(beats.at(-1).tipo,'elenco');
    assert.equal(beats.at(-1).pasos[1].jugadores.length,n);
    assert.ok(beats.at(-1).pasos[1].jugadores.every((j)=>ROLES_LOBO[j.rol]));
    assert.ok(beats.findIndex((b)=>b.tipo==='final')<beats.length-1);
    assert.equal(beats.filter((b)=>b.tipo==='preparacion').length,1);
  }
});

test('Cupido se revela en su evento, declaraciones vivas no certifican identidad; mentira al morir/final',()=>{
  for(const [n,seed] of [[8,107],[12,4]]){
    const p=jugarLobo(seed,n,{declaraciones:true,modoCupido:'ambos'}),beats=construirLineaDeTiempo(p); // 'ambos': la camara ve a Cupido en su evento (los otros modos: cupido-oculto-lobo.test.js)
    assert.deepEqual(beats,construirLineaDeTiempo(structuredClone(p)));
    assert.ok(beats.some((b)=>b.pasos[1].comprobacion?.coincide===false));
    assert.ok(beats.some((b)=>b.pasos[1].comprobacion?.coincide===true));
    for(const b of beats){
      const [antes,paso,despues]=b.pasos;
      if(b.tipo==='enamorados'){
        assert.equal(antes.jugadores[paso.cupido].rol,undefined);
        assert.equal(despues.jugadores[paso.cupido].rol,'cupido');assert.match(b.texto,/se revela como Cupido/);
      }
      if(paso.afirmaRol){assert.match(b.texto,/afirma ser Vidente/);assert.equal(despues.jugadores[paso.asiento].rol,undefined);assert.doesNotMatch(b.texto,/había mentido|decía la verdad/);}
      if(paso.comprobacion){assert.ok(['muerte','identidad'].includes(b.tipo));assert.ok(!despues.jugadores[paso.asiento].vivo||despues.fin);assert.match(b.texto,paso.comprobacion.coincide?/decía la verdad/:/había mentido: decía ser Vidente, pero era Lobo/);}
      for(const j of despues.jugadores.filter(j=>j.vivo&&!despues.fin&&j.rol!=='cupido'))assert.equal(j.rol,undefined);
    }
    const q=structuredClone(p);q.truncada=true;
    assert.ok(!construirLineaDeTiempo(q).some((b)=>['elenco','identidad','final'].includes(b.tipo)));
  }
});

test('narrador compara literalmente: confirmación/mentira y mensaje libre no infiere rol',()=>{
  assert.match(textoDeComprobacion('Ana',{coincide:false,rolDeclarado:'bruja',rolReal:'aldeano'}),/Ana había mentido: decía ser Bruja, pero era Aldeano/);
  assert.equal(textoDeComprobacion('Ana',{coincide:true,rolReal:'vidente'}),'Ana decía la verdad: era Vidente.');
  const n=crearNarrador();n.prepararDia([{tipo:'mensaje',asiento:0,mensaje:'Soy lobo.'}]);
  assert.equal(n.contar({tipo:'mensaje',paso:{asiento:0,mensaje:'Soy lobo.'},texto:'Jugador 1 dice: «Soy lobo.»'}).dicho[0].texto,'Jugador 1 dice: «Soy lobo.»');
});

test('votos ordenados por conteo y desempate de asiento; todas las posiciones caben en ambos formatos',()=>{
  const conteo=[2,0,4,4,1,0,0,0];assert.deepEqual(ordenarPorVotos(conteo,8),[2,3,0,4,1,5,6,7]);
  for(const n of [8,12])for(const f of ['9x16','16x9']){
    const L=colocarLobo(f,n),orden=ordenarPorVotos(Array.from({length:n},(_,i)=>i%3),n);
    assert.equal(new Set(orden).size,n);assert.equal(L.asientos.length,n);
    assert.ok(L.panorama.x>=L.zona.x&&L.panorama.y>=L.zona.y);
    assert.ok(L.panorama.x+L.panorama.ancho<=L.zona.x+L.zona.ancho);
    assert.ok(L.panorama.y+L.panorama.alto<=L.subtitulos.y);
  }
});

test('seis roles autorizados; la asamblea usa un solo plano estable de mayor resolución',()=>{
  assert.deepEqual(Object.keys(ROLES_LOBO),['lobo','vidente','bruja','cazador','cupido','aldeano']);
  assert.deepEqual(ASAMBLEA,['arte/lobo/dia-asamblea-01.png']);
  assert.deepEqual(fotogramasDe({tipo:'mensaje'}),[ASAMBLEA[0]]);
  const png=readFileSync(new URL('../../../web/'+ASAMBLEA[0],import.meta.url));assert.equal(png.readUInt32BE(16),516);assert.equal(png.readUInt32BE(20),288);
});
