import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Ensamblado, leerEnsamblado, ARCHIVO_PREDETERMINADO } from '../../../herramientas/worldbox-ensamblado.mjs';

// PE/CLI sintético, construido en memoria. Ningún byte procede del juego.
function fixture({pe64=false, heapsGrandes=false}={}) {
  const strings=[Buffer.from([0])], blobs=[Buffer.from([0])];
  const agregar=(heap,b)=>{const n=heap.reduce((s,x)=>s+x.length,0);heap.push(b);return n;};
  const s=t=>agregar(strings,Buffer.from(t+'\0'));
  const blob=b=>agregar(blobs,Buffer.from([b.length,...b]));
  const nombres=Object.fromEntries(['System','Object','<Module>','Ejemplo','Demo','Interno','version','Crear','nombre','cantidad','Registrar'].map(n=>[n,s(n)]));
  const fString=blob([6,14]), fCrear=blob([0,2,0x12,8,14,8]), fRegistrar=blob([0,0,1]);
  const version=blob([...Buffer.from('0.1','utf16le')]), defecto=blob([7,0,0,0]);
  const filas=new Map([
    [1,[[0,nombres.Object,nombres.System]]],
    [2,[[0,nombres['<Module>'],0,0,1,1],[1,nombres.Ejemplo,nombres.Demo,5,1,1],[3,nombres.Interno,0,5,2,2]]],
    [4,[[0x56,nombres.version,fString]]],
    [6,[[0x2400,0,0x16,nombres.Crear,fCrear,1]]],
    [8,[[0,1,nombres.nombre],[0x1010,2,nombres.cantidad]]],
    [10,[[9,nombres.Registrar,fRegistrar]]],
    [11,[[14,4,version],[8,9,defecto]]],
    [41,[[3,2]]],
  ]);
  const h=heapsGrandes?4:2;
  const anchos={1:[2,h,h],2:[4,h,h,2,2,2],4:[2,h,h],6:[4,2,2,h,h,2],8:[2,2,h],10:[2,h,h],11:[2,2,h],41:[2,2]};
  const cab=Buffer.alloc(24+filas.size*4);cab[4]=2;cab[6]=heapsGrandes?5:0;cab[7]=1;
  let mascara=0n,pos=24;
  const cuerpos=[];
  for(const [t,rs] of filas) {
    mascara|=1n<<BigInt(t);cab.writeUInt32LE(rs.length,pos);pos+=4;
    for(const r of rs) {const b=Buffer.alloc(anchos[t].reduce((a,b)=>a+b));let p=0;r.forEach((v,i)=>{b.writeUIntLE(v,p,anchos[t][i]);p+=anchos[t][i];});cuerpos.push(b);}
  }
  cab.writeBigUInt64LE(mascara,8);
  const us=Buffer.concat([Buffer.from([0,9]),Buffer.from('hola','utf16le'),Buffer.from([0])]);
  const flujos=[['#~',Buffer.concat([cab,...cuerpos])],['#Strings',Buffer.concat(strings)],['#Blob',Buffer.concat(blobs)],['#US',us]];
  const raiz=Buffer.alloc(32);raiz.writeUInt32LE(0x424a5342);raiz.writeUInt16LE(1,4);raiz.writeUInt16LE(1,6);raiz.writeUInt32LE(12,12);raiz.write('v4.0.30319',16);raiz.writeUInt16LE(flujos.length,30);
  const headers=flujos.map(([n])=>Buffer.alloc(8+Math.ceil((n.length+1)/4)*4));
  let offset=32+headers.reduce((a,b)=>a+b.length,0);
  flujos.forEach(([n,b],i)=>{headers[i].writeUInt32LE(offset);headers[i].writeUInt32LE(b.length,4);headers[i].write(n,8);offset+=b.length;});
  const metadata=Buffer.concat([raiz,...headers,...flujos.map(f=>f[1])]);
  const pe=Buffer.alloc(0x800);pe.write('MZ');pe.writeUInt32LE(0x80,0x3c);pe.write('PE\0\0',0x80);pe.writeUInt16LE(1,0x86);pe.writeUInt16LE(pe64?240:224,0x94);
  const opt=0x98;pe.writeUInt16LE(pe64?0x20b:0x10b,opt);
  const dirs=opt+(pe64?112:96);pe.writeUInt32LE(16,dirs-4);pe.writeUInt32LE(0x2000,dirs+112);pe.writeUInt32LE(72,dirs+116);
  const sec=opt+(pe64?240:224);pe.write('.text',sec);pe.writeUInt32LE(0x600,sec+8);pe.writeUInt32LE(0x2000,sec+12);pe.writeUInt32LE(0x600,sec+16);pe.writeUInt32LE(0x200,sec+20);
  pe.writeUInt32LE(72,0x200);pe.writeUInt32LE(0x2080,0x208);pe.writeUInt32LE(metadata.length,0x20c);metadata.copy(pe,0x280);
  // tiny: ldstr #US:1, call MemberRef:1, ret (solo inspección, no ejecución).
  Buffer.from([0x2e,0x72,1,0,0,0x70,0x28,1,0,0,0x0a,0x2a]).copy(pe,0x600);
  return pe;
}

for(const opciones of [{},{pe64:true},{heapsGrandes:true}]) {
  test(`PE sintético: tipos, firmas, parámetros, constantes, IL ${JSON.stringify(opciones)}`,()=>{
    const e=new Ensamblado(fixture(opciones)), ts=e.tipos();
    assert.equal(e.versionMetadatos,'v4.0.30319');
    assert.equal(ts[1].nombre,'Demo.Ejemplo');assert.equal(ts[1].base,'System.Object');
    assert.equal(ts[2].nombre,'Demo.Ejemplo+Interno');assert.equal(ts[2].publico,false);
    const m=ts[1].metodos[0];
    assert.equal(m.retorno,'Demo.Ejemplo');assert.equal(m.publico,true);assert.equal(m.estatico,true);
    assert.deepEqual(m.parametros.map(p=>[p.tipo,p.nombre]),[['string','nombre'],['int','cantidad']]);
    assert.equal(m.parametros[1].defecto,7);assert.equal(m.parametros[1].opcional,true);
    assert.equal(ts[1].campos[0].constante,'0.1');assert.equal(ts[1].campos[0].literal,true);
    assert.deepEqual(e.evidenciasIL(1).map(x=>x.cadena??x.referencia),['hola','System.Object::void Registrar()']);
  });
}
test('rechaza archivos inválidos y truncados sin ejecutar nada',()=>{
  assert.throws(()=>new Ensamblado(Buffer.alloc(128)),/PE/);
  assert.throws(()=>new Ensamblado(fixture().subarray(0,600)),/truncado|desplazamiento/);
});
test('firmas genéricas, por referencia, arrays y enteros comprimidos',()=>{
  const e=new Ensamblado(fixture());
  assert.equal(e.tipoFirma(Buffer.from([0x15,0x12,8,1,0x1d,0x1e,0]),{p:0}),'Demo.Ejemplo<!!0[]>');
  assert.equal(e.tipoFirma(Buffer.from([0x10,8]),{p:0}),'int&');
  assert.equal(e.tipoFirma(Buffer.from([0x14,8,2,0,0]),{p:0}),'int[,]');
  assert.equal(e.comprimido(Buffer.from([0x80,0x80]),{p:0}),128);
  assert.equal(e.comprimido(Buffer.from([0xc0,0,0x40,0]),{p:0}),16384);
  assert.throws(()=>e.comprimido(Buffer.from([0xff]),{p:0}),/inválido/);
  assert.throws(()=>e.tipoFirma(Buffer.from([0xff]),{p:0}),/no soportado/);
});
test('CLI informa opciones inválidas con salida no exitosa',()=>{
  const cli=fileURLToPath(new URL('../../../herramientas/worldbox-ensamblado.mjs',import.meta.url));
  const r=spawnSync(process.execPath,[cli,'--no-existe'],{encoding:'utf8'});
  assert.equal(r.status,1);assert.match(r.stderr,/Opción desconocida/);
});
test('integración opcional con el ensamblado instalado', {skip:!existsSync(ARCHIVO_PREDETERMINADO)},()=>{
  const e=leerEnsamblado(), ts=e.tipos();
  for(const nombre of ['MapBox','World','Actor','Kingdom','City']) assert.ok(ts.some(t=>t.nombre===nombre),nombre);
  const crear=ts.find(t=>t.nombre==='ActorManager').metodos.find(m=>m.nombre==='createNewUnit');
  assert.equal(crear.retorno,'Actor');assert.equal(crear.publico,true);
  assert.deepEqual(crear.parametros.slice(0,2).map(p=>p.nombre),['pStatsID','pTile']);
  const loader=ts.find(t=>t.nombre==='ModLoader').metodos.find(m=>m.nombre==='Initialize');
  assert.ok(e.evidenciasIL(parseInt(loader.token,16)&0xffffff).some(x=>x.referencia?.includes('System.Reflection.Assembly::System.Reflection.Assembly LoadFile(string)')));
});
