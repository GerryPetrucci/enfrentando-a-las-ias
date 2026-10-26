import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {PNG_RECURSOS,encajarSprite,pintarArte,arteListo,suavizarAlReducir} from '../../../web/casino/arte-conquista.js';
import {pintarRecursoPixel} from '../../../web/casino/recursos-pixel-conquista.js';
import {ICONOS,bloquesDeLaHoja,recortarBloque,reducir} from '../../../herramientas/recortar-iconos-conquista.mjs';
import {decodificarPNG,codificarPNG} from '../../../herramientas/recortar-elenco-lobo.mjs';

const CARPETA='../../../web/arte/conquista/';
test('los iconos de la hoja del usuario son los PNG de comida, madera, oro, hierro, caballos, tropas y la Maravilla; Roca sigue dibujada por código',()=>{
  assert.deepEqual(PNG_RECURSOS,{Comida:'comida.png',Madera:'madera.png',Oro:'oro.png',Hierro:'hierro.png',Caballos:'caballos.png',Tropas:'tropas.png',Maravilla:'maravilla.png'});
  assert.ok(!('Roca' in PNG_RECURSOS),'la hoja no trae Roca');
  const hashes={'comida.png':'2c92f5b8852c69317b012e9ebd897df865a062813298b48a36c258057cc7800c','madera.png':'42a67cd7a8bcecb56a747bc9126448c98d685b031be384d65379f2bfa73814d1','oro.png':'ec04819c8a1bfa8d0ed32aaf13ec9e23dbb448a5b2e2cd4f91384e182cbdcac0','hierro.png':'266873227ae8079df23d154bba08ddc11bb3a1d22573b6ce6b3f8c3af12829f1','caballos.png':'a2bf38ea3518d2e98337298137ad5d908be7d8746ddc984f1c970a42d937b3c9','tropas.png':'37f8dc98b039d22818b5ce2c82b4442c86cce6f73a70a4eb26531510799802cd','maravilla.png':'12d8b77bef76071edf365ef52523370e331d2a2f3acd9f9cec15bdb31e7ddd57'};
  for(const archivo of Object.values(PNG_RECURSOS)){
    const png=readFileSync(new URL(CARPETA+archivo,import.meta.url)), {ancho,alto,datos}=decodificarPNG(png);
    assert.equal(createHash('sha256').update(png).digest('hex'),hashes[archivo],archivo+': es el que sale de la hoja con herramientas/recortar-iconos-conquista.mjs (si se cambia la hoja, se regenera y se actualiza este hash)');
    assert.equal(png[25],6,archivo+': conserva transparencia RGBA');
    assert.ok(Math.max(ancho,alto)<=(archivo==='maravilla.png'?256:128),archivo+': no pasa del tamaño que se dibuja');
    assert.equal(datos[3],0,archivo+': la esquina es transparente (se recortó al dibujo)');
    assert.ok(datos.filter((v,i)=>i%4===3&&v>=250).length>ancho*alto*0.08,archivo+': trae dibujo opaco');
  }
  assert.deepEqual(Object.keys(hashes).sort(),Object.values(PNG_RECURSOS).sort());
});
test('la carpeta del arte solo guarda los PNG que se usan (arco y espada de la hoja esperan en privado/)',()=>{
  const png=readdirSync(new URL(CARPETA,import.meta.url)).filter(n=>n.endsWith('.png')).sort();
  assert.deepEqual(png,Object.values(PNG_RECURSOS).sort());
  assert.ok(ICONOS.filter(i=>i.tipo===null).map(i=>i.nombre).join()==='arco,espada');
});
test('los sprites conservan proporciones y encajan en el marcador sin estirarse',()=>{
  assert.deepEqual(encajarSprite({ancho:100,alto:200},80,120,60,60),{x:65,y:90,ancho:30,alto:60});
});
test('un icono que se dibuja mucho más chico que su PNG se suaviza y uno que se agranda o queda parecido conserva los píxeles duros',()=>{
  const escala=a=>({getTransform:()=>({a})});
  assert.equal(suavizarAlReducir({},28,128),true,'marcador: 28 px desde 128');
  assert.equal(suavizarAlReducir({},100,128),false,'casi del mismo tamaño');
  assert.equal(suavizarAlReducir({},200,128),false,'agrandado');
  assert.equal(suavizarAlReducir(escala(0.5),58,256),true,'la escala del contexto cuenta: 58 unidades a la mitad son 29 px');
  assert.equal(suavizarAlReducir(escala(4),58,256),false,'un contexto ampliado la deja con pixeles duros');
  assert.equal(suavizarAlReducir(null,10,128),true,'sin contexto utilizable no lanza');
});
test('Caballos dibuja una herradura abierta arriba y cerrada en su base',()=>{
  const puntos=new Set();const ctx={save(){},restore(){},translate(){},scale(){},fillRect(x,y,w,h){for(let dy=y;dy<y+h;dy++)for(let dx=x;dx<x+w;dx++)puntos.add(dx+','+dy);}};
  pintarRecursoPixel(ctx,'Caballos',0,0,9);
  assert.ok(!puntos.has('0,-5'),'abertura superior');
  assert.ok(puntos.has('-5,-5')&&puntos.has('4,-5'),'dos brazos');
  assert.ok(puntos.has('0,5'),'base cerrada');
});
test('sin imágenes cargadas (Node) todos los recursos conservan su dibujo por código como alternativa',async()=>{
  await arteListo;
  for(const tipo of ['Comida','Madera','Caballos','Roca','Hierro','Oro','Tropas','Maravilla'])assert.equal(pintarArte(null,tipo,0,0,20,20),false);
});

// ---- la herramienta que recorta la hoja ----
const hojaDePrueba=()=>{ // 3 x 3 dibujos opacos de 40 x 40 en una hoja de 400 x 400, con velo casi invisible de fondo
  const ancho=400,alto=400,datos=new Uint8Array(ancho*alto*4);
  for(let i=0;i<ancho*alto;i++)datos[i*4+3]=5;
  const lugares=[];
  for(let f=0;f<3;f++)for(let c=0;c<3;c++){
    const x0=30+c*130+f*4,y0=40+f*120+c*3;lugares.push({x0,y0});
    for(let y=y0;y<y0+40;y++)for(let x=x0;x<x0+40;x++){const o=(y*ancho+x)*4;datos[o]=200;datos[o+1]=100+f*40;datos[o+2]=50+c*60;datos[o+3]=255;}
  }
  return {hoja:{ancho,alto,datos},lugares};
};
test('bloquesDeLaHoja halla los 9 dibujos separados, por filas y de izquierda a derecha, y recortarBloque los deja sin el velo del fondo',()=>{
  const {hoja,lugares}=hojaDePrueba(), bloques=bloquesDeLaHoja(hoja);
  assert.equal(bloques.length,9);
  bloques.forEach((b,i)=>{assert.ok(b.x0<=lugares[i].x0&&b.x1>=lugares[i].x0+39&&b.y0<=lugares[i].y0&&b.y1>=lugares[i].y0+39,'bloque '+i);});
  const r=recortarBloque(hoja,bloques[4]);
  assert.equal(r.ancho,44);assert.equal(r.alto,44);
  assert.equal(r.datos[3],0,'el margen es transparente');
  assert.equal(r.datos[(2*44+2)*4+3],255,'el dibujo queda intacto');
  const casiVacia={ancho:50,alto:50,datos:new Uint8Array(50*50*4)};
  assert.throws(()=>bloquesDeLaHoja(casiVacia),/se esperaban 9/);
});
test('reducir promedia el area sin teñir los bordes y no toca una imagen que ya cabe',()=>{
  const dato=new Uint8Array(8*8*4);for(let y=0;y<8;y++)for(let x=0;x<4;x++){const o=(y*8+x)*4;dato[o]=255;dato[o+3]=255;} // mitad izquierda roja opaca, derecha transparente
  const img={ancho:8,alto:8,datos:dato};
  assert.equal(reducir(img,16),img,'ya cabe: la misma imagen');
  const r=reducir(img,4);
  assert.deepEqual([r.ancho,r.alto],[4,4]);
  assert.deepEqual([...r.datos.subarray(0,4)],[255,0,0,255],'izquierda: rojo opaco');
  assert.deepEqual([...r.datos.subarray(12,16)].map((v,i)=>i===3?v:0),[0,0,0,0],'derecha: transparente');
  const redonda=codificarPNG(r);assert.equal(redonda[25],6);
});
