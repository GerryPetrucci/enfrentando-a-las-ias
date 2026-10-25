import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { paginaDeRevision, generarRevision, validarRevision, servidorPiloto } from '../../herramientas/ver-piloto.mjs';
import { reconstruirHasta, instalarRevision } from '../../web/casino/revision-escena.js';
import { limitarVelocidad, limitarPosicion, tiempoDeRevision } from '../../web/revision-piloto-modelo.js';

const config = {titulo:'Prueba <local>',muestras:[{titulo:'Escena',tipo:'escena',url:'http://127.0.0.1:4321/escena.html?archivo=pruebas/x.json'},{titulo:'Video',tipo:'video',archivo:'revision/muestra.mp4'}]};

test('generador común de revisión usa sitio.css, fuentes/tokens y navegación para escenas y videos',async(t)=>{
  const carpeta=await mkdtemp(join(tmpdir(),'revision-marca-'));t.after(()=>rm(carpeta,{recursive:true}));
  await generarRevision(carpeta,config);const html=await readFile(join(carpeta,'REVISAR.html'),'utf8');
  assert.equal(html,paginaDeRevision(config));assert.match(html,/sitio\.css/);assert.match(html,/Prueba &lt;local&gt;/);
  for(const id of ['velocidad','avance','anterior','siguiente','inicio','final','reproducir','video','escena'])assert.ok(html.includes(`id="${id}"`));
  assert.ok(!html.includes('Prueba <local>'));
  const inyeccion=paginaDeRevision({...config,descripcion:'</script><img onerror=alert(1)>',titulo:'</title><script>malo()</script>'});
  assert.ok(!inyeccion.includes('<script>malo()'));
  const s=await servidorPiloto(carpeta);await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));
  const base=`http://127.0.0.1:${s.address().port}`;
  for(const recurso of ['sitio.css','revision-piloto.css','revision-piloto.js','revision-piloto-modelo.js','fonts/inter-variable.woff2','fonts/barlow-condensed-800.woff2']){
    const r=await fetch(`${base}/_revision/${recurso}`);assert.equal(r.status,200,recurso);assert.ok(Number(r.headers.get('content-length'))>0);
  }
  const css=await(await fetch(base+'/_revision/revision-piloto.css')).text();
  for(const token of ['oro','noche','panel','hueso','borde','titulos','texto'])assert.ok(css.includes(`var(--${token})`));
  assert.equal((await fetch(base+'/_revision/../.env')).status,404);
  assert.equal((await fetch(base+'/_revision/casino/escena.js')).status,404);
});

test('configuración de revisión rechaza rutas fuera del piloto y escenas remotas',()=>{
  for(const m of [{tipo:'escena',url:'https://externo.test/escena.html'},{tipo:'escena',url:'http://127.0.0.1:4321/otro.html'},...['../secreto.mp4','/secreto.mp4','C:\\secreto.mp4','http://externo.test/video.mp4'].map(archivo=>({tipo:'video',archivo}))])assert.throws(()=>validarRevision({titulo:'X',muestras:[{titulo:'X',...m}]}));
});

test('velocidad, barra y tiempos tienen límites válidos',()=>{
  assert.deepEqual([0,.1,.5,2,100].map(limitarVelocidad),[1,.25,.5,2,8]);
  assert.equal(limitarPosicion(-1,50),0);assert.equal(limitarPosicion(100,50),50);
  assert.equal(tiempoDeRevision(125000),'2:05');
});

test('reconstrucción para cualquier escena ejecuta solo el prefijo, sin voz/efectos y restaura modo',async()=>{
  const llamadas=[],sonido={},mudo={};const mesa={sfx:sonido,rapido:false,async ejecutar(b){assert.equal(this.sfx,mudo);assert.equal(this.rapido,true);llamadas.push(b.id);}};
  assert.equal(await reconstruirHasta([mesa],[{id:'noche'},{id:'muerte'},{id:'final'}],1,mudo),1);
  assert.deepEqual(llamadas,['noche','muerte']);assert.equal(mesa.sfx,sonido);assert.equal(mesa.rapido,false);
});

test('canal de revisión solo acepta comandos del padre local, ordenados, y no se activa fuera de revisión',async()=>{
  let listener;const recibidos=[],respuestas=[];
  const padre={postMessage:(m)=>respuestas.push(m)},v={parent:padre,location:{search:'?revision=1'},document:{referrer:'http://127.0.0.1:4323/'},addEventListener:(_,fn)=>{listener=fn;}};
  instalarRevision({estado:()=>({total:3}),comando:async(a)=>{recibidos.push(a);}},v);
  listener({source:{},origin:'http://127.0.0.1:4323',data:{tipo:'revision-comando',accion:'buscar'}});
  listener({source:padre,origin:'https://externo.test',data:{tipo:'revision-comando',accion:'buscar'}});
  listener({source:padre,origin:'http://127.0.0.1:4323',data:{tipo:'revision-comando',sesion:'vista-anterior',accion:'buscar'}});
  for(const accion of ['buscar','velocidad'])listener({source:padre,origin:'http://127.0.0.1:4323',data:{tipo:'revision-comando',accion}});
  await new Promise(r=>setTimeout(r,0));assert.deepEqual(recibidos,['buscar','velocidad']);assert.equal(respuestas.at(-1).tipo,'revision-estado');
  instalarRevision({estado:()=>({}),comando:()=>{}},{parent:padre,location:{search:''},addEventListener(){throw new Error('No debe activarse');}});
});
