#!/usr/bin/env node
// Inspección estática ECMA-335: no carga ni ejecuta código del ensamblado.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ARCHIVO_PREDETERMINADO = 'C:/Program Files (x86)/Steam/steamapps/common/worldbox/worldbox_Data/Managed/Assembly-CSharp.dll';
const CODIFICADOS = {
  TypeDefOrRef: [2, [2, 1, 27]], HasConstant: [2, [4, 8, 23]],
  HasCustomAttribute: [5, [6, 4, 1, 2, 8, 9, 10, 0, 14, 23, 20, 17, 26, 27, 32, 35, 38, 39, 40, 42, 44, 43]],
  HasFieldMarshal: [1, [4, 8]], HasDeclSecurity: [2, [2, 6, 32]],
  MemberRefParent: [3, [2, 1, 26, 6, 27]], HasSemantics: [1, [20, 23]],
  MethodDefOrRef: [1, [6, 10]], MemberForwarded: [1, [4, 6]],
  Implementation: [2, [38, 35, 39]], CustomAttributeType: [3, [null, null, 6, 10]],
  ResolutionScope: [2, [0, 26, 35, 1]], TypeOrMethodDef: [1, [2, 6]],
};
// s/b/g = índices a heaps; enteros = índices a tablas; u2/u4 = valores.
const ESQUEMAS = [
  ['u2','s','g','g','g'], ['ResolutionScope','s','s'],
  ['u4','s','s','TypeDefOrRef',4,6], [4], ['u2','s','b'], [6],
  ['u4','u2','u2','s','b',8], [8], ['u2','u2','s'], [2,'TypeDefOrRef'],
  ['MemberRefParent','s','b'], ['u2','HasConstant','b'],
  ['HasCustomAttribute','CustomAttributeType','b'], ['HasFieldMarshal','b'],
  ['u2','HasDeclSecurity','b'], ['u2','u4',2], ['u4',4], ['b'], [2,20], [20],
  ['u2','s','TypeDefOrRef'], [2,23], [23], ['u2','s','b'],
  ['u2',6,'HasSemantics'], [2,'MethodDefOrRef','MethodDefOrRef'], ['s'], ['b'],
  ['u2','MemberForwarded','s',26], ['u4',4], ['u4','u4'], ['u4'],
  ['u4','u2','u2','u2','u2','u4','b','s','s'], ['u4'], ['u4','u4','u4'],
  ['u2','u2','u2','u2','u4','b','s','s','b'], ['u4',35], ['u4','u4','u4',35],
  ['u4','s','b'], ['u4','u4','s','s','Implementation'],
  ['u4','u4','s','Implementation'], [2,2], ['u2','u2','TypeOrMethodDef','s'],
  ['MethodDefOrRef','b'], [42,'TypeDefOrRef'],
];
const PRIMITIVOS = {1:'void',2:'bool',3:'char',4:'sbyte',5:'byte',6:'short',7:'ushort',8:'int',9:'uint',10:'long',11:'ulong',12:'float',13:'double',14:'string',22:'TypedReference',24:'nint',25:'nuint',28:'object'};
const acceso = flags => ['privatescope','private','famandassem','internal','protected','famorassem','public'][flags & 7] ?? 'desconocido';
const token = (tabla, fila) => `0x${((tabla * 0x1000000) + fila).toString(16).padStart(8,'0')}`;

export class Ensamblado {
  constructor(bytes) {
    this.bytes = bytes;
    this.flujos = {};
    this.tablas = [];
    this.leerPE();
    this.leerTablas();
    this.constantes = new Map(this.filas(11).map(r => {
      const padre = this.decodificar('HasConstant', r[1]);
      return [`${padre.tabla}:${padre.fila}`, r];
    }));
    this.propietariosMetodos = new Map();
    this.propietariosCampos = new Map();
    this.anidados = new Map(this.filas(41).map(r => [r[0], r[1]]));
    for (let i = 1; i <= this.cantidad(2); i++) {
      for (const n of this.rango(i, 5, 6)) this.propietariosMetodos.set(n, i);
      for (const n of this.rango(i, 4, 4)) this.propietariosCampos.set(n, i);
    }
  }
  comprobar(offset, largo) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(largo) || offset < 0 || largo < 0 || offset + largo > this.bytes.length) throw new Error('Ensamblado truncado o desplazamiento inválido');
  }
  u2(p) { this.comprobar(p, 2); return this.bytes.readUInt16LE(p); }
  u4(p) { this.comprobar(p, 4); return this.bytes.readUInt32LE(p); }
  rva(rva) {
    const seccion = this.secciones.find(s => rva >= s.virtual && rva < s.virtual + Math.max(s.tamano, s.crudo));
    if (!seccion || rva - seccion.virtual >= seccion.crudo) throw new Error(`RVA sin datos: ${rva.toString(16)}`);
    return seccion.archivo + rva - seccion.virtual;
  }
  leerPE() {
    if (this.u2(0) !== 0x5a4d) throw new Error('No es un PE (falta MZ)');
    const pe = this.u4(0x3c);
    if (this.u4(pe) !== 0x4550) throw new Error('Firma PE inválida');
    const opt = pe + 24, magic = this.u2(opt);
    if (![0x10b, 0x20b].includes(magic)) throw new Error('Formato PE opcional desconocido');
    const directorios = opt + (magic === 0x10b ? 96 : 112);
    if (this.u4(directorios - 4) < 15) throw new Error('PE sin directorio CLI');
    this.secciones = [];
    const inicio = opt + this.u2(pe + 20);
    for (let i = 0; i < this.u2(pe + 6); i++) {
      const p = inicio + i * 40;
      this.secciones.push({virtual:this.u4(p+12), tamano:this.u4(p+8), crudo:this.u4(p+16), archivo:this.u4(p+20)});
    }
    const cli = this.rva(this.u4(directorios + 14 * 8));
    const raiz = this.rva(this.u4(cli + 8));
    if (this.u4(raiz) !== 0x424a5342) throw new Error('Firma de metadatos CLI inválida');
    const largoVersion = this.u4(raiz+12);
    this.comprobar(raiz+16, largoVersion);
    this.versionMetadatos = this.bytes.subarray(raiz+16, raiz+16+largoVersion).toString('utf8').replace(/\0+$/, '');
    let p = raiz + 16 + Math.ceil(largoVersion / 4) * 4;
    const cuantos = this.u2(p+2); p += 4;
    for (let i=0; i<cuantos; i++) {
      const desplazamiento=this.u4(p), tamano=this.u4(p+4), fin=this.bytes.indexOf(0,p+8);
      if (fin < 0 || fin-p > 40) throw new Error('Nombre de flujo inválido');
      this.comprobar(raiz+desplazamiento,tamano);
      this.flujos[this.bytes.toString('ascii',p+8,fin)] = {offset:raiz+desplazamiento,tamano};
      p = p+8+Math.ceil((fin-(p+8)+1)/4)*4;
    }
  }
  leerTablas() {
    const flujo=this.flujos['#~'] ?? this.flujos['#-'];
    if (!flujo) throw new Error('No hay tablas #~/#-');
    let p=flujo.offset;
    this.heaps=this.bytes[p+6];
    this.comprobar(p,24);
    const validas=this.bytes.readBigUInt64LE(p+8);
    p+=24;
    for (let i=0; i<64; i++) {
      const n=(validas & (1n << BigInt(i))) ? this.u4(p) : 0;
      if (validas & (1n << BigInt(i))) p+=4;
      this.tablas[i]={cantidad:n};
    }
    if (this.heaps & 0x40) p+=4; // ExtraData, usado por algunos productores de #-
    for (let i=0; i<64; i++) {
      const tabla=this.tablas[i];
      if (!tabla.cantidad) continue;
      if (!ESQUEMAS[i]) throw new Error(`Tabla no soportada: ${i}`);
      tabla.anchos=ESQUEMAS[i].map(c=>this.ancho(c));
      tabla.tamano=tabla.anchos.reduce((a,b)=>a+b,0);
      tabla.offset=p;
      p+=tabla.tamano*tabla.cantidad;
      if (p>flujo.offset+flujo.tamano) throw new Error(`Tabla ${i} fuera del flujo`);
    }
    // Las tablas pointer de #- requieren otra indirection: no fingir soporte.
    if ([3,5,7,19,22].some(t=>this.cantidad(t))) throw new Error('Tablas pointer de #- no soportadas');
  }
  cantidad(t) { return this.tablas[t]?.cantidad ?? 0; }
  ancho(c) {
    if (c==='u2') return 2;
    if (c==='u4') return 4;
    if (typeof c==='number') return this.cantidad(c)<65536 ? 2 : 4;
    if ('sbg'.includes(c) && c.length===1) return this.heaps & {s:1,g:2,b:4}[c] ? 4 : 2;
    const [bits, tablas]=CODIFICADOS[c];
    return Math.max(...tablas.map(t=>t===null ? 0 : this.cantidad(t))) < 2**(16-bits) ? 2 : 4;
  }
  fila(t, n) {
    if (n<1 || n>this.cantidad(t)) throw new Error(`Fila inválida: ${t}:${n}`);
    const tabla=this.tablas[t]; let p=tabla.offset+(n-1)*tabla.tamano;
    return tabla.anchos.map(a=>{const valor=a===2 ? this.u2(p) : this.u4(p); p+=a; return valor;});
  }
  filas(t) { return Array.from({length:this.cantidad(t)},(_,i)=>this.fila(t,i+1)); }
  string(n) {
    if (!n) return '';
    const f=this.flujos['#Strings'];
    if (!f || n>=f.tamano) throw new Error('Índice #Strings inválido');
    const fin=this.bytes.indexOf(0,f.offset+n);
    if (fin<0 || fin>=f.offset+f.tamano) throw new Error('Cadena sin terminador');
    return this.bytes.toString('utf8',f.offset+n,fin);
  }
  comprimido(buffer, cursor) {
    const leer=()=>{if(cursor.p>=buffer.length) throw new Error('Firma truncada'); return buffer[cursor.p++];};
    const a=leer();
    if (!(a&0x80)) return a;
    if ((a&0xc0)===0x80) return ((a&0x3f)<<8)|leer();
    if ((a&0xe0)===0xc0) return ((a&0x1f)*0x1000000)+(leer()<<16)+(leer()<<8)+leer();
    throw new Error('Entero comprimido inválido');
  }
  blob(n, flujo='#Blob') {
    if (!n) return Buffer.alloc(0);
    const f=this.flujos[flujo];
    if (!f || n>=f.tamano) throw new Error(`Índice ${flujo} inválido`);
    const buffer=this.bytes.subarray(f.offset,f.offset+f.tamano), cursor={p:n};
    const largo=this.comprimido(buffer,cursor);
    if(cursor.p+largo>buffer.length) throw new Error('Blob truncado');
    return buffer.subarray(cursor.p,cursor.p+largo);
  }
  decodificar(c, valor) {
    const [bits, tablas]=CODIFICADOS[c];
    return {tabla:tablas[valor & ((1<<bits)-1)], fila:valor>>>bits};
  }
  nombreTipo(t,n,profundidad=0) {
    if (!n) return null;
    if (profundidad>30) throw new Error('Referencia de tipo cíclica');
    if (t===27) return this.tipoFirma(this.blob(this.fila(27,n)[0]),{p:0},profundidad+1);
    if (t!==1 && t!==2) throw new Error(`Referencia de tipo no soportada: ${t}`);
    const r=this.fila(t,n), nombre=this.string(r[1]), espacio=this.string(r[2]);
    if (t===2 && this.anidados.has(n)) return `${this.nombreTipo(2,this.anidados.get(n),profundidad+1)}+${nombre}`;
    if (t===1) {
      const padre=this.decodificar('ResolutionScope',r[0]);
      if (padre.tabla===1) return `${this.nombreTipo(1,padre.fila,profundidad+1)}+${nombre}`;
    }
    return espacio ? `${espacio}.${nombre}` : nombre;
  }
  tipoCodificado(n,profundidad=0) {const r=this.decodificar('TypeDefOrRef',n); return this.nombreTipo(r.tabla,r.fila,profundidad+1);}
  tipoFirma(b,c,profundidad=0) {
    if(profundidad>40 || c.p>=b.length) throw new Error('Firma de tipo inválida');
    const e=b[c.p++], numero=()=>this.comprimido(b,c), tipo=()=>this.tipoFirma(b,c,profundidad+1);
    if(PRIMITIVOS[e]) return PRIMITIVOS[e];
    switch(e) {
      case 15: return `${tipo()}*`;
      case 16: return `${tipo()}&`;
      case 17: case 18: return this.tipoCodificado(numero(),profundidad);
      case 19: return `!${numero()}`;
      case 30: return `!!${numero()}`;
      case 29: return `${tipo()}[]`;
      case 20: {
        const elemento=tipo(), rango=numero(), tamanos=numero();
        for(let i=0;i<tamanos;i++) numero();
        const limites=numero(); for(let i=0;i<limites;i++) numero();
        return `${elemento}[${','.repeat(Math.max(0,rango-1))}]`;
      }
      case 21: {const base=tipo(), n=numero(), args=[]; for(let i=0;i<n;i++) args.push(tipo()); return `${base}<${args.join(', ')}>`;}
      case 27: {const f=this.firmaMetodo(b,c); return `methodptr ${f.retorno}(${f.tipos.join(', ')})`;}
      case 31: case 32: {const mod=this.tipoCodificado(numero(),profundidad); return `${tipo()} ${e===31?'modreq':'modopt'}(${mod})`;}
      case 69: return `${tipo()} pinned`;
      default: throw new Error(`Elemento de firma no soportado: 0x${e.toString(16)}`);
    }
  }
  firmaMetodo(b,c={p:0}) {
    if(c.p>=b.length) throw new Error('Firma de método vacía');
    const convencion=b[c.p++], genericos=convencion&0x10 ? this.comprimido(b,c) : 0;
    const n=this.comprimido(b,c), retorno=this.tipoFirma(b,c), tipos=[];
    for(let i=0;i<n;i++) {if(b[c.p]===0x41) c.p++; tipos.push(this.tipoFirma(b,c));}
    return {retorno,tipos,genericos,instancia:!!(convencion&0x20)};
  }
  rango(tipo,columna,tabla) {
    const inicio=this.fila(2,tipo)[columna];
    const fin=tipo<this.cantidad(2) ? this.fila(2,tipo+1)[columna] : this.cantidad(tabla)+1;
    return Array.from({length:fin-inicio},(_,i)=>inicio+i);
  }
  constante(tabla,n) {
    const valor=this.constantes.get(`${tabla}:${n}`);
    if(!valor) return undefined;
    const b=this.blob(valor[2]);
    switch(valor[0]&255) {
      case 2: return !!b[0]; case 3: return String.fromCharCode(b.readUInt16LE());
      case 4: return b.readInt8(); case 5: return b.readUInt8(); case 6: return b.readInt16LE(); case 7: return b.readUInt16LE();
      case 8: return b.readInt32LE(); case 9: return b.readUInt32LE();
      case 10: case 11: {
        const entero=(valor[0]&255)===10 ? b.readBigInt64LE() : b.readBigUInt64LE();
        return entero>=BigInt(Number.MIN_SAFE_INTEGER) && entero<=BigInt(Number.MAX_SAFE_INTEGER) ? Number(entero) : entero.toString();
      }
      case 12: return b.readFloatLE(); case 13: return b.readDoubleLE();
      case 14: return b.toString('utf16le'); case 18: return null;
      default: throw new Error('Constante de tipo no soportado');
    }
  }
  metodo(n) {
    const r=this.fila(6,n), firma=this.firmaMetodo(this.blob(r[4]));
    const fin=n<this.cantidad(6) ? this.fila(6,n+1)[5] : this.cantidad(8)+1;
    const parametros=[];
    for(let i=r[5];i<fin;i++) {const p=this.fila(8,i); if(p[1]) parametros[p[1]-1]={nombre:this.string(p[2]),flags:p[0],opcional:!!(p[0]&16),defecto:this.constante(8,i)};}
    const resultado={token:token(6,n),nombre:this.string(r[3]),acceso:acceso(r[2]),publico:(r[2]&7)===6,estatico:!!(r[2]&16),virtual:!!(r[2]&64),rva:r[0],retorno:firma.retorno,genericos:firma.genericos,parametros:firma.tipos.map((tipo,i)=>({tipo,...(parametros[i]??{nombre:`arg${i}`,sinNombre:true})}))};
    resultado.firma=`${resultado.acceso}${resultado.estatico?' static':''} ${resultado.retorno} ${resultado.nombre}${firma.genericos?`<${Array.from({length:firma.genericos},(_,i)=>`!!${i}`).join(', ')}>`:''}(${resultado.parametros.map(p=>`${p.tipo} ${p.nombre}${p.opcional?` = ${['long','ulong'].includes(p.tipo)?p.defecto:JSON.stringify(p.defecto)}`:''}`).join(', ')})`;
    return resultado;
  }
  campo(n) {
    const r=this.fila(4,n), b=this.blob(r[2]);
    if(b[0]!==6) throw new Error('Firma de campo inválida');
    return {token:token(4,n),nombre:this.string(r[1]),tipo:this.tipoFirma(b,{p:1}),acceso:acceso(r[0]),publico:(r[0]&7)===6,estatico:!!(r[0]&16),literal:!!(r[0]&64),soloLectura:!!(r[0]&32),constante:this.constante(4,n)};
  }
  tipos() {
    return this.filas(2).map((r,i)=>({token:token(2,i+1),nombre:this.nombreTipo(2,i+1),publico:[1,2].includes(r[0]&7),base:this.tipoCodificado(r[3]),metodos:this.rango(i+1,5,6).map(n=>this.metodo(n)),campos:this.rango(i+1,4,4).map(n=>this.campo(n))}));
  }
  identidad() {
    const r=this.cantidad(32) ? this.fila(32,1) : null;
    return {nombre:r?this.string(r[7]):null,version:r?r.slice(1,5).join('.'):null,versionMetadatos:this.versionMetadatos,referencias:this.filas(35).map(a=>({nombre:this.string(a[6]),version:a.slice(0,4).join('.')}))};
  }
  referencia(t,n) {
    if(t===1 || t===2 || t===27) return this.nombreTipo(t,n);
    if(t===6) return `${this.nombreTipo(2,this.propietariosMetodos.get(n))}::${this.metodo(n).firma}`;
    if(t===4) {const f=this.campo(n); return `${this.nombreTipo(2,this.propietariosCampos.get(n))}::${f.tipo} ${f.nombre}`;}
    if(t===43) {const r=this.fila(43,n), ref=this.decodificar('MethodDefOrRef',r[0]); return this.referencia(ref.tabla,ref.fila);}
    if(t===10) {
      const r=this.fila(10,n), padre=this.decodificar('MemberRefParent',r[0]);
      const nombre=padre.tabla===26 ? this.string(this.fila(26,padre.fila)[0]) : this.referencia(padre.tabla,padre.fila);
      const b=this.blob(r[2]), miembro=this.string(r[1]);
      if(b[0]===6) return `${nombre}::${this.tipoFirma(b,{p:1})} ${miembro}`;
      const f=this.firmaMetodo(b); return `${nombre}::${f.retorno} ${miembro}(${f.tipos.join(', ')})`;
    }
    return token(t,n);
  }
  // Solo referencias y literales de IL, sin descompilar ni guardar cuerpos de juego.
  evidenciasIL(n) {
    const rva=this.fila(6,n)[0]; if(!rva) return [];
    const p=this.rva(rva), cab=this.bytes[p]; let inicio,largo;
    if((cab&3)===2) {inicio=p+1;largo=cab>>>2;}
    else if((cab&3)===3) {inicio=p+((this.u2(p)>>>12)*4);largo=this.u4(p+4);}
    else throw new Error('Cabecera IL desconocida');
    this.comprobar(inicio,largo);
    const salida=[]; let pos=inicio;
    const tokens=new Set([0x27,0x28,0x29,0x6f,0x70,0x71,0x72,0x73,0x74,0x75,0x79,0x7b,0x7c,0x7d,0x7e,0x7f,0x80,0x81,0x8c,0x8d,0x8f,0xa3,0xa4,0xa5,0xc2,0xc6,0xd0,0xfe06,0xfe07,0xfe15,0xfe16,0xfe1c]);
    while(pos<inicio+largo) {
      const desplazamiento=pos-inicio; let op=this.bytes[pos++];
      if(op===0xfe) op=0xfe00|this.bytes[pos++];
      let ancho=0;
      if(tokens.has(op)) ancho=4;
      else if((op>=0x0e&&op<=0x13)||op===0x1f||(op>=0x2b&&op<=0x37)||op===0xde||op===0xfe12||op===0xfe19) ancho=1;
      else if((op>=0x38&&op<=0x44)||op===0x20||op===0x22||op===0xdd) ancho=4;
      else if(op===0x21||op===0x23) ancho=8;
      else if(op>=0xfe09&&op<=0xfe0e) ancho=2;
      else if(op===0x45) ancho=4+this.u4(pos)*4;
      else if(!((op<=0x0d)||(op>=0x14&&op<=0x1e)||(op>=0x25&&op<=0x26)||op===0x2a||(op>=0x46&&op<=0x6e)||op===0x76||op===0x7a||(op>=0x82&&op<=0x8b)||op===0x8e||(op>=0x90&&op<=0xa2)||(op>=0xb3&&op<=0xba)||op===0xc3||(op>=0xd1&&op<=0xdc)||op===0xdf||op===0xe0||(op>=0xfe00&&op<=0xfe05)||[0xfe0f,0xfe11,0xfe13,0xfe14,0xfe17,0xfe18,0xfe1a,0xfe1d,0xfe1e].includes(op))) throw new Error(`Opcode IL no soportado: ${op.toString(16)}`);
      if(pos+ancho>inicio+largo) throw new Error('Operando IL truncado');
      if(tokens.has(op)) {
        const valor=this.u4(pos), t=valor>>>24, fila=valor&0xffffff;
        if(op===0x72) {const b=this.blob(fila,'#US'); salida.push({offset:desplazamiento,operacion:'ldstr',cadena:b.subarray(0,-1).toString('utf16le')});}
        else salida.push({offset:desplazamiento,operacion:`0x${op.toString(16)}`,token:token(t,fila),referencia:this.referencia(t,fila)});
      } else if(op===0x20) salida.push({offset:desplazamiento,operacion:'ldc.i4',numero:this.bytes.readInt32LE(pos)});
      else if(op===0x1f) salida.push({offset:desplazamiento,operacion:'ldc.i4.s',numero:this.bytes.readInt8(pos)});
      else if(op>=0x15&&op<=0x1e) salida.push({offset:desplazamiento,operacion:'ldc.i4',numero:op-0x16});
      pos+=ancho;
    }
    return salida;
  }
}

export function leerEnsamblado(archivo=ARCHIVO_PREDETERMINADO) { return new Ensamblado(readFileSync(archivo)); }

export function ejecutarCLI(args=process.argv.slice(2)) {
  const opciones={};
  for(const arg of args) {
    const m=/^--(archivo|tipos|metodos|campos|buscar|il)=(.+)$/.exec(arg);
    if(m) opciones[m[1]]=m[2];
    else if(arg==='--json') opciones.json=true;
    else if(arg==='--ayuda') {
      console.log('Inspección .NET sin ejecutar el juego.\n--archivo=<DLL> (por defecto Assembly-CSharp de WorldBox)\n--tipos=<regex> --metodos=<tipo> --campos=<tipo> --buscar=<texto> --json\n--il=<Tipo::método> muestra referencias/literales de IL, no código fuente.\nSin filtro: identidad y lista de tipos. Los nombres de tipo son exactos.'); return;
    } else throw new Error(`Opción desconocida: ${arg}`);
  }
  const e=leerEnsamblado(opciones.archivo), todos=e.tipos();
  let tipos=todos;
  if(opciones.tipos) {const re=new RegExp(opciones.tipos); tipos=tipos.filter(t=>re.test(t.nombre));}
  if(opciones.metodos || opciones.campos) tipos=tipos.filter(t=>t.nombre===(opciones.metodos??opciones.campos));
  if(opciones.buscar) {const texto=opciones.buscar.toLowerCase(); tipos=tipos.filter(t=>JSON.stringify(t).toLowerCase().includes(texto));}
  let evidencias;
  if(opciones.il) {
    const [tipo,metodo]=opciones.il.split('::');
    tipos=tipos.filter(t=>t.nombre===tipo);
    evidencias=tipos.flatMap(t=>t.metodos.filter(m=>m.nombre===metodo).map(m=>({tipo:t.nombre,firma:m.firma,evidencias:e.evidenciasIL(parseInt(m.token,16)&0xffffff)})));
    if(!evidencias.length) throw new Error(`Método no encontrado: ${opciones.il}`);
  }
  if(opciones.json) console.log(JSON.stringify({archivo:resolve(opciones.archivo??ARCHIVO_PREDETERMINADO),...e.identidad(),tipos,evidencias},null,2));
  else if(evidencias) console.log(JSON.stringify(evidencias,null,2));
  else for(const t of tipos) {
    console.log(`${t.publico?'public':'internal'} ${t.nombre}${t.base?` : ${t.base}`:''} [${t.token}]`);
    if(opciones.metodos || opciones.buscar) for(const m of t.metodos) if(!opciones.buscar || `${t.nombre} ${m.firma}`.toLowerCase().includes(opciones.buscar.toLowerCase())) console.log(`  ${m.firma} [${m.token}]`);
    if(opciones.campos || opciones.buscar) for(const f of t.campos) if(!opciones.buscar || `${t.nombre} ${f.nombre} ${f.tipo} ${f.constante??''}`.toLowerCase().includes(opciones.buscar.toLowerCase())) console.log(`  ${f.acceso}${f.estatico?' static':''}${f.literal?' const':''} ${f.tipo} ${f.nombre}${f.constante!==undefined?` = ${JSON.stringify(f.constante)}`:''} [${f.token}]`);
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {ejecutarCLI();} catch(error) {console.error(`Error: ${error.message}`);process.exitCode=1;}
}
