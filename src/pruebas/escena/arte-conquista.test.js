import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PNG_RECURSOS,encajarSprite,pintarArte,arteListo} from '../../../web/casino/arte-conquista.js';
import {pintarRecursoPixel} from '../../../web/casino/recursos-pixel-conquista.js';

test('solo leña partida y maza usan los PNG elegidos; la Maravilla no admite sustitución por atlas',()=>{
  assert.deepEqual(PNG_RECURSOS,{Madera:'madera-haz-lena.png',Tropas:'tropas-maza.png'});
  const hashes={'madera-haz-lena.png':'a95fcd370230384c6642dcf002bc6e23b554d438cb3f9a57c425009eb5a37be5','tropas-maza.png':'4fd800b068911d3c1166372b4099142dc10800f87ea84009656db64520b2d41a'};
  for(const [archivo,sha]of Object.entries(hashes)){
    const png=readFileSync(new URL('../../../web/arte/conquista/'+archivo,import.meta.url));
    assert.equal(createHash('sha256').update(png).digest('hex'),sha,'debe conservar el PNG acordado sin modificaciones');
    assert.equal(png[25],6,'conserva transparencia RGBA');
  }
});
test('los sprites conservan proporciones y encajan en el marcador sin estirarse',()=>{
  assert.deepEqual(encajarSprite({ancho:100,alto:200},80,120,60,60),{x:65,y:90,ancho:30,alto:60});
});
test('Caballos dibuja una herradura abierta arriba y cerrada en su base',()=>{
  const puntos=new Set();const ctx={save(){},restore(){},translate(){},scale(){},fillRect(x,y,w,h){for(let dy=y;dy<y+h;dy++)for(let dx=x;dx<x+w;dx++)puntos.add(dx+','+dy);}};
  pintarRecursoPixel(ctx,'Caballos',0,0,9);
  assert.ok(!puntos.has('0,-5'),'abertura superior');
  assert.ok(puntos.has('-5,-5')&&puntos.has('4,-5'),'dos brazos');
  assert.ok(puntos.has('0,5'),'base cerrada');
});
test('los recursos dibujados por código no necesitan imágenes y conservan alternativa ante fallos',async()=>{
  await arteListo;
  for(const tipo of ['Comida','Caballos','Roca','Hierro','Oro','Maravilla'])assert.equal(pintarArte(null,tipo,0,0,20,20),false);
});
