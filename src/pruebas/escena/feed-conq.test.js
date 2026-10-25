import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FEED,msVisibleDelFeed,colaDeFeed,extenderMinMs,espaciadoDeAviso} from '../../../web/casino/feed-conquista.js';

test('cada aviso conserva un intervalo de lectura acotado',()=>{
  assert.equal(msVisibleDelFeed(1),4000);
  for(const n of [0,1,2,7,100,NaN,undefined])assert.ok(msVisibleDelFeed(n)>=4000&&msVisibleDelFeed(n)<=7000);
  assert.ok(espaciadoDeAviso('Un aviso largo '.repeat(20))>=espaciadoDeAviso('Pacto'));
});
test('los avisos mantienen el orden y llegan en instantes distintos',()=>{
  const lista=[{partes:['Primer movimiento']},{partes:[{k:1},' conquistó R09']},{partes:['Último evento']}];
  const cola=colaDeFeed(lista);
  assert.deepEqual(cola.map(c=>c.aviso),lista);
  assert.equal(cola[0].demora,0);
  for(let i=1;i<cola.length;i++)assert.ok(cola[i].demora>cola[i-1].demora);
});
test('el beat reserva lectura y fundido para el último aviso, incluso si solo hay uno',()=>{
  for(const n of[1,2,8]){
    const lista=Array.from({length:n},()=>({partes:['Noticia del turno']}));
    const cola=colaDeFeed(lista),duracion=extenderMinMs(1500,lista);
    assert.ok(duracion>=cola.at(-1).demora+FEED.MIN_MS+FEED.FUNDIDO_MS);
    assert.equal(extenderMinMs(duracion+1000,lista),duracion+1000);
  }
  assert.equal(extenderMinMs(1500,[]),1500);
});
