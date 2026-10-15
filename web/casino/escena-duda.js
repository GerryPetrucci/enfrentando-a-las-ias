// Escena de Duda y apuesta (navegador): lee una partida ya guardada, construye su linea de tiempo y la reproduce como una mesa de casino.
// Aqui no se decide nada del juego: cada beat trae lo que hay que mostrar (linea-de-tiempo-duda.js) y esta pagina solo lo anima.
// Lo puro (parametros, duraciones, linea de tiempo, camara, diseno, sonido) vive en modulos que se prueban en Node; esta pagina se verifica mirando
// (herramientas/capturar-escena.mjs).
//
// Uso: escena.html?archivo=NOMBRE.json&partida=1&mano=1&hasta=16&formato=9x16|16x9|hoja&camara=2&vel=1&razon=1&sonido=0&voz=voz.json&auto=1&limpio=1

import { colocar, abanico, POSICION_EN_HOJA } from './layout.js';
import { htmlDefs, htmlLogo, htmlCarta, htmlFrente, htmlPlaca, htmlFicha, CARTAS, esc } from './kit.js';
import { construirLineaDeTiempo, conRazones, MANOS_TOPE } from './linea-de-tiempo-duda.js';
import { leerParametros, recortarClip, duracionDeBeat, marcarTiempos } from './escena-config.js';
import { crearSonido, eventosDePaso } from './sonido.js';
import { crearAzar, seedDeTexto } from './azar.js';

const PLURAL = { rojo: 'rojas', amarillo: 'amarillas', azul: 'azules', verde: 'verdes', morado: 'moradas', arcoiris: 'arcoíris' };
const SELLOS = {
  farol: { texto: 'Farol descubierto', clase: 'perder' }, incumplido: { texto: 'No se cumplió', clase: 'perder' }, cumplido: { texto: 'Se cumplió', clase: 'ganar' },
  justo: { texto: '¡Justo!', clase: 'ganar' }, retirada: { texto: 'Se retiró', clase: 'perder' },
};
const ROL = { anuncio: 'Anuncia', acepta: 'Acepta', duda: 'Duda', iguala: 'Iguala', pliega: 'Se retira' };
const el = (clase, html = '') => Object.assign(document.createElement('div'), { className: clase, innerHTML: html });
const poner = (nodo, r) => Object.assign(nodo.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.ancho}px`, height: `${r.alto}px` });
const centro = (r, fx = 0.5) => ({ x: r.x + r.ancho * fx, y: r.y + r.alto / 2 });

class Mesa {
  constructor(formato, partida, { sfx, razon }) {
    this.formato = formato;
    this.partida = partida;
    this.sfx = sfx;
    this.razon = razon;
    this.rapido = false; // true: todo termina al instante (para capturas)
    this.L = colocar(formato);
    this.pozoFichas = 0;
    this.armar();
  }

  armar() {
    const { L } = this;
    const raiz = this.raiz = el(`escena f-${this.formato}`);
    Object.assign(raiz.style, { width: `${L.ancho}px`, height: `${L.alto}px` });
    raiz.append(el('fieltro'), el('riel'), el('luz'), el('marca-agua', htmlLogo('')));
    this.cabecera = el('fijo cabecera', `${htmlLogo('logo')}<div class="tit">Duda y apuesta</div><div class="mano"></div>`);
    poner(this.cabecera, L.cabecera);
    this.etiqueta = el('fijo etiqueta-ia', 'Contenido generado por IA · Proyecto independiente');
    poner(this.etiqueta, L.etiqueta);
    this.asientos = L.asientos.map((a, s) => {
      const caja = el('fijo asiento'); poner(caja, a.caja);
      caja.style.setProperty('--placa-h', `${a.placa.alto}px`);
      const placa = el('placa-caja'); Object.assign(placa.style, { position: 'absolute', left: '0', top: '0', width: `${a.caja.ancho}px`, height: `${a.placa.alto}px` });
      const mano = el('mano-cartas'); Object.assign(mano.style, { position: 'absolute', left: '0', top: `${a.cartas.y - a.caja.y}px`, width: `${a.cartas.ancho}px`, height: `${a.cartas.alto}px` });
      caja.append(placa, mano);
      return { caja, placa, mano, cartas: [], fichas: 0, espacios: 0, rol: `Jugador ${s + 1}`, reemplazo: false };
    });
    this.mazo = el('fijo mazo', `<div class="pila-mazo">${[0, 1, 2].map(() => htmlCarta(null)).join('')}</div><span>Mazo · 60</span>`);
    poner(this.mazo, L.mazo);
    this.mazo.querySelectorAll('.carta').forEach((c, i) => Object.assign(c.style, { left: `${i * 2}px`, top: `${-i * 2}px` }));
    this.pozo = el('fijo pozo', '<span>Banca</span><div class="pila-p"></div>');
    poner(this.pozo, L.pozo);
    this.anuncio = el('fijo anuncio'); poner(this.anuncio, L.anuncio);
    this.sello = el('sello');
    this.subtitulos = el('fijo subtitulos'); poner(this.subtitulos, L.subtitulos);
    this.capa = el('capa-volar');
    raiz.append(this.cabecera, this.etiqueta, ...this.asientos.map((a) => a.caja), this.mazo, this.pozo, this.anuncio, this.sello, this.subtitulos, this.capa);
    for (let s = 0; s < 4; s++) this.pintarPlaca(s);
  }

  // ---- ayudas ----
  anim(nodo, frames, opciones) { return nodo.animate(frames, this.rapido ? { ...opciones, duration: 1, delay: 0 } : opciones); }
  esperar(ms) { return this.rapido || ms <= 0 ? Promise.resolve() : new Promise((ok) => setTimeout(ok, ms)); }
  programar(ms, fn) { if (this.rapido) fn(); else setTimeout(fn, ms); }
  sonar(paso) { for (const e of eventosDePaso(paso)) this.sfx[e](); }
  nombre(s) { return this.partida.jugadores[s]?.nombre ?? `Jugador ${s + 1}`; }
  pintarPlaca(s) {
    const a = this.asientos[s];
    a.placa.innerHTML = htmlPlaca(this.partida.jugadores[s], a.rol, a.fichas, a.espacios, a.reemplazo);
  }
  fijarEstado(fichas, espacios) {
    this.asientos.forEach((a, s) => {
      a.fichas = fichas[s]; a.espacios = espacios[s];
      a.caja.classList.toggle('fuera', fichas[s] <= 0);
      this.pintarPlaca(s);
    });
  }
  centroPlaca(s) { const a = this.L.asientos[s]; return { x: a.caja.x + a.caja.ancho - 100, y: a.caja.y + a.placa.alto / 2 }; }
  centroPozo() { return centro(this.L.pozo, 0.6); }
  volarFichas(de, a, cuantas, tipo = 'juego', alLlegar = () => {}) {
    const n = Math.max(1, Math.min(6, cuantas));
    for (let i = 0; i < n; i++) {
      const f = el(`ficha volar ${tipo}`);
      f.style.left = `${de.x - 17}px`; f.style.top = `${de.y - 17}px`;
      this.capa.append(f);
      this.anim(f, [{ transform: 'scale(.8)', opacity: 0.2 }, { opacity: 1, offset: 0.2 }, { transform: `translate(${a.x - de.x}px, ${a.y - de.y}px) scale(1)`, opacity: 1 }], { duration: 650, delay: i * 90, fill: 'forwards', easing: 'cubic-bezier(.3,.7,.3,1)' });
      this.programar(650 + i * 90, () => { f.remove(); alLlegar(); });
    }
  }
  fichasAlPozo(n) {
    const pila = this.pozo.querySelector('.pila-p');
    for (let i = 0; i < n && this.pozoFichas < 12; i++, this.pozoFichas++) {
      const f = el('ficha juego'); Object.assign(f.style, { left: `${(this.pozoFichas % 6) * 16 + 10}px`, top: `${20 + Math.floor(this.pozoFichas / 6) * 14 - (this.pozoFichas % 2) * 4}px` });
      pila.append(f);
    }
  }
  vaciarPozo() { this.pozo.querySelector('.pila-p').innerHTML = ''; this.pozoFichas = 0; }
  mostrarSubtitulos(beat) {
    const dichas = beat.lineas.map((l) => (l.tipo === 'comentario' ? `<em>${esc(l.texto)}</em>` : esc(l.texto))).join(' ');
    const razon = this.razon && beat.razon ? `<div class="razon"><small>${esc(this.nombre(beat.asiento))} piensa</small>${esc(beat.razon)}</div>` : '';
    this.subtitulos.innerHTML = `${dichas}${razon}`;
    this.subtitulos.style.fontSize = '';
    let tam = parseFloat(getComputedStyle(this.subtitulos).fontSize);
    while (this.subtitulos.scrollHeight > this.subtitulos.clientHeight + 1 && tam > 20) { tam -= 2; this.subtitulos.style.fontSize = `${tam}px`; }
  }
  voltear(carta, color = null, retraso = 0) {
    if (color) carta.querySelector('.cara').outerHTML = htmlFrente(color);
    carta.dataset.color = carta.dataset.color ?? color ?? '';
    const giro = carta.querySelector('.giro');
    const a = this.anim(giro, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }], { duration: 520, delay: retraso, fill: 'forwards', easing: 'ease-in-out' });
    const brillo = carta.querySelector('.cara .brillo');
    if (brillo) this.anim(brillo, [{ transform: 'translateX(-120%)' }, { transform: 'translateX(120%)' }], { duration: 600, delay: retraso + 300, fill: 'both' });
    a.onfinish = () => { carta.classList.add('volteada'); a.cancel(); };
  }

  // ---- los beats ----
  async ejecutar(beat, ms) {
    const t0 = performance.now();
    this.mostrarSubtitulos(beat);
    const metodo = { apertura: 'nuevaMano', reparto: 'repartir', anuncio: 'jugada', acepta: 'jugada', duda: 'jugada', defensa: 'jugada', revelado: 'desenlace', retirada: 'desenlace', cierre: 'cerrar', final: 'terminar' }[beat.tipo];
    if (metodo) await this[metodo](beat, ms);
    await this.esperar(ms - (performance.now() - t0));
  }

  async nuevaMano(beat) {
    const viejas = this.asientos.flatMap((a) => a.cartas);
    viejas.forEach((c) => this.anim(c, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }));
    await this.esperar(320);
    this.asientos.forEach((a) => { a.mano.innerHTML = ''; a.cartas = []; });
    this.vaciarPozo();
    this.anuncio.style.opacity = 0; this.sello.style.opacity = 0; this.anuncio.innerHTML = '';
    const r = this.partida.rondas[beat.registro];
    this.asientos.forEach((a, s) => { a.rol = `Jugador ${s + 1}`; a.reemplazo = false; });
    this.fijarEstado(r.fichas, r.fichasEspacio);
    this.cabecera.querySelector('.mano').textContent = `Mano ${beat.mano} / ${MANOS_TOPE}`;
  }

  async repartir(beat, ms) {
    const pasos = beat.pasos.filter((p) => p.tipo === 'repartir');
    const porCarta = Math.min(260, (ms * 0.7) / Math.max(1, pasos.length));
    const cuantas = [0, 1, 2, 3].map((s) => pasos.filter((p) => p.asiento === s).length);
    const abanicos = cuantas.map((n, s) => abanico({ x: 6, y: 0, ancho: this.L.asientos[s].cartas.ancho - 12, alto: this.L.asientos[s].cartas.alto }, this.L.asientos[s].carta, n));
    const origen = centro(this.L.mazo, 0);
    origen.x = this.L.mazo.x + 60;
    pasos.forEach((p, i) => {
      const a = this.asientos[p.asiento];
      const r = abanicos[p.asiento][p.indice];
      const caja = this.L.asientos[p.asiento];
      const carta = Object.assign(document.createElement('div'), { innerHTML: htmlCarta(p.color) }).firstElementChild;
      Object.assign(carta.style, { left: `${r.x}px`, top: `${r.y}px` });
      const n = cuantas[p.asiento];
      const angulo = (p.indice - (n - 1) / 2) * 1.5; // poca inclinacion: con mas, las esquinas se salen de la zona segura
      carta.style.transform = `rotate(${angulo}deg)`;
      a.mano.append(carta);
      a.cartas.push(carta);
      const dx = origen.x - (caja.cartas.x + r.x + r.ancho / 2), dy = origen.y - (caja.cartas.y + r.y + r.alto / 2);
      this.anim(carta, [{ transform: `translate(${dx}px, ${dy}px) scale(.5) rotate(-14deg)`, opacity: 0 }, { opacity: 1, offset: 0.15 }, { transform: `rotate(${angulo}deg)`, opacity: 1 }], { duration: 420, delay: i * porCarta, fill: 'both', easing: 'cubic-bezier(.2,.9,.3,1)' });
      this.programar(i * porCarta, () => this.sonar(p));
      if (p.color) this.programar(i * porCarta + 440, () => this.voltear(carta));
    });
    for (const s of beat.camara) {
      if (!this.asientos[s].cartas.length) continue;
      this.asientos[s].caja.querySelector('.pastilla-camara')?.remove();
      this.asientos[s].caja.append(el('pastilla-camara', 'Cámara'));
    }
    await this.esperar(pasos.length * porCarta + 500);
  }

  jugada(beat, ms) {
    const s = beat.asiento;
    const a = this.asientos[s];
    a.reemplazo = beat.reemplazo;
    a.rol = beat.reemplazo ? 'Jugada del juego' : ROL[beat.pasos.find((p) => ROL[p.tipo])?.tipo] ?? ROL[beat.tipo];
    this.pintarPlaca(s);
    this.anim(a.placa, [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 500 });
    for (const p of beat.pasos) {
      this.sonar(p);
      if (p.tipo === 'apuesta') this.volarFichas(this.centroPlaca(s), this.centroPozo(), p.fichas + p.espacios, 'juego', () => this.fichasAlPozo(1));
      if (p.tipo === 'anuncio') this.mostrarAnuncio(p, beat.tipo === 'acepta' ? 'acepta y sube' : 'anuncia');
      if (p.tipo === 'duda') this.textoAnuncio(`${this.nombre(s)} duda`, true);
      if (p.tipo === 'iguala') this.textoAnuncio(`${this.nombre(s)} iguala la subida`);
      if (p.tipo === 'pliega') this.textoAnuncio(`${this.nombre(s)} se retira`, true);
    }
  }

  mostrarAnuncio(paso, verbo) {
    const c = CARTAS[paso.color];
    this.anuncio.innerHTML = `<svg class="gema" viewBox="0 0 80 80">${c.gema}</svg><div class="txt"><span class="quien">${esc(this.nombre(paso.asiento))} ${verbo}</span><span class="frase">Al menos ${esc(paso.cantidad)} ${PLURAL[paso.color] ?? esc(paso.color)}</span></div><div class="hay"></div>`;
    this.anim(this.anuncio, [{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 380, fill: 'forwards', easing: 'cubic-bezier(.2,1.3,.4,1)' });
  }

  textoAnuncio(texto, alerta = false) {
    const quien = this.anuncio.querySelector('.quien');
    if (!quien) return;
    quien.textContent = texto;
    quien.classList.toggle('alerta', alerta);
  }

  async desenlace(beat, ms) {
    const p = (tipo) => beat.pasos.find((x) => x.tipo === tipo);
    const revelar = p('revelar'), contar = p('contar'), sello = p('sello'), fichas = p('fichas');
    if (revelar) {
      this.sonar(revelar);
      revelar.cartas.forEach((fila, s) => fila.forEach((color, k) => {
        const carta = this.asientos[s].cartas[k];
        if (carta && !carta.classList.contains('volteada') && !carta.querySelector('.giro').getAnimations().length) this.voltear(carta, color, s * 240 + k * 70);
        else if (carta && !carta.dataset.color) this.voltear(carta, color, s * 240 + k * 70);
      }));
      await this.esperar(ms * 0.35);
      revelar.brillan.forEach((fila, s) => fila.forEach((si, k) => {
        const cara = si && this.asientos[s].cartas[k]?.querySelector('.cara');
        if (cara) { cara.classList.add('cuenta-si'); this.anim(cara, [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 500 }); }
      }));
    }
    if (contar) {
      const hay = this.anuncio.querySelector('.hay');
      if (hay) {
        hay.style.opacity = 1;
        const cada = Math.max(120, Math.min(420, (ms * 0.3) / Math.max(1, contar.real)));
        for (let n = 0; n <= contar.real; n++) { hay.textContent = `Hay ${n}`; if (n > 0) this.sonar(contar); await this.esperar(cada); }
      }
    }
    if (sello) {
      const info = SELLOS[sello.sello];
      this.sello.textContent = info.texto;
      this.sello.className = `sello ${info.clase}`;
      const c = centro(this.L.anuncio);
      Object.assign(this.sello.style, { left: `${c.x}px`, top: `${this.L.anuncio.y + this.L.anuncio.alto * 0.92}px` });
      this.sonar(sello);
      const base = 'translate(-50%, -50%) rotate(-5deg)';
      this.anim(this.sello, [{ opacity: 0, transform: `${base} scale(2.4)` }, { opacity: 1, transform: `${base} scale(1)` }], { duration: 320, fill: 'forwards', easing: 'cubic-bezier(.2,1.2,.4,1)' });
    }
    if (fichas) {
      await this.esperar(ms * 0.12);
      const total = fichas.ganado.fichas + fichas.ganado.espacios;
      this.sonar(fichas);
      this.volarFichas(this.centroPlaca(fichas.de), this.centroPlaca(fichas.a), total, 'juego');
      this.pozo.querySelector('.pila-p').childNodes.forEach((f) => this.anim(f, [{ opacity: 1 }, { opacity: 0 }], { duration: 500, fill: 'forwards' }));
    }
  }

  cerrar(beat) {
    for (const p of beat.pasos) {
      this.sonar(p);
      if (p.tipo === 'pago') this.asientos.forEach((_, s) => this.volarFichas(this.centroPlaca(s), this.centroPozo(), 1));
      if (p.tipo === 'compra') this.anim(this.asientos[p.asiento].placa, [{ filter: 'brightness(1)' }, { filter: 'brightness(1.8) saturate(1.5)' }, { filter: 'brightness(1)' }], { duration: 700 });
      if (p.tipo === 'estado') this.fijarEstado(p.fichas, p.fichasEspacio);
    }
    this.vaciarPozo();
  }

  terminar(beat) {
    const f = beat.pasos[0]?.final;
    this.cabecera.querySelector('.mano').textContent = 'Final';
    this.asientos.forEach((a, s) => {
      a.caja.classList.toggle('fuera', !!f?.eliminados?.includes(s));
      a.caja.querySelector('.medalla')?.remove();
    });
    if (f && f.pieza !== null && f.pieza !== undefined) {
      const medalla = el('medalla', 'Pieza');
      this.asientos[f.pieza].caja.append(medalla);
      this.anim(medalla, [{ opacity: 0, transform: 'translateY(-40px) scale(2)' }, { opacity: 1, transform: 'none' }], { duration: 520, fill: 'both', easing: 'cubic-bezier(.2,1.4,.4,1)' });
    }
  }
}

// ---------------------------------------------------------------------------------------------------------------------------------------
export async function iniciar() {
  const params = leerParametros(location.search);
  document.body.classList.toggle('limpio', params.limpio);
  const estado = document.getElementById('estado');
  const aviso = (t) => { estado.textContent = t; };
  if (!params.archivo) return aviso('Abre esta pagina con ?archivo=NOMBRE.json (una partida de Duda y apuesta guardada en data/). Parametros: partida, mano, hasta, formato (9x16, 16x9 o hoja), camara (0 a 4), vel, razon, sonido, voz, auto, limpio.');
  let datos;
  try { datos = await (await fetch(`data/${params.archivo}`)).json(); } catch { return aviso(`No pude leer data/${params.archivo}`); }
  const partida = datos?.partidas?.[params.partida - 1];
  if (!partida) return aviso(`El archivo no tiene la partida ${params.partida}.`);
  if ((partida.juego?.id ?? datos.juego?.id) !== 'dudaapuesta') return aviso('Esta escena es solo para partidas de Duda y apuesta.');
  let voz = null;
  if (params.voz) { try { voz = await (await fetch(params.voz)).json(); } catch { aviso('No pude leer la voz: se usan los tiempos minimos.'); } }

  let beats = recortarClip(construirLineaDeTiempo(partida, { camara: params.camara }), params.mano, params.hasta);
  if (params.razon) beats = conRazones(beats, partida);
  if (!beats.length) return aviso('La partida no tiene esas manos.');

  document.body.insertAdjacentHTML('afterbegin', htmlDefs());
  const sfx = crearSonido({ activo: params.sonido, azar: crearAzar(seedDeTexto(`sonido:${partida.seed}`)) });
  const mudo = crearSonido({ activo: false });
  const formatos = params.formato === 'hoja' ? ['9x16', '16x9'] : [params.formato];
  const mesas = formatos.map((f, i) => new Mesa(f, partida, { sfx: i === 0 ? sfx : mudo, razon: params.razon }));
  const [ancho, alto] = params.formato === 'hoja' ? [3840, 2160] : [mesas[0].L.ancho, mesas[0].L.alto];
  const marco = document.getElementById('marco');
  marco.innerHTML = '';
  Object.assign(marco.style, { width: `${ancho}px`, height: `${alto}px` });
  mesas.forEach((m) => {
    const sitio = params.formato === 'hoja' ? POSICION_EN_HOJA[m.formato] : { x: 0, y: 0 };
    Object.assign(m.raiz.style, { left: `${sitio.x}px`, top: `${sitio.y}px` });
    marco.append(m.raiz);
  });
  const ajustar = () => {
    const escala = params.escala === 'ajustar' ? Math.min(innerWidth / ancho, (innerHeight - (params.limpio ? 0 : 64)) / alto) : params.escala;
    marco.style.transform = `scale(${escala})`;
    document.getElementById('hueco').style.cssText = `width:${ancho * escala}px;height:${alto * escala}px`;
  };
  ajustar();
  addEventListener('resize', ajustar);

  const marcas = marcarTiempos(beats, voz, params.vel);
  window.escena = { beats, marcas, mesas, partida };
  let corriendo = false;
  const detenerEn = new URLSearchParams(location.search).get('detener'); // para capturas: avanza al instante hasta ese beat y se queda ahi
  const reproducir = async () => {
    if (corriendo) return;
    corriendo = true;
    window.escenaTerminada = false;
    try {
    for (const [i, beat] of beats.entries()) {
      const rapido = detenerEn !== null && i <= Number(detenerEn);
      mesas.forEach((m) => { m.rapido = rapido; });
      const audio = voz?.[beat.id]?.archivo;
      if (audio && params.sonido) { try { new Audio(audio).play(); } catch { /* sin voz */ } }
      await Promise.all(mesas.map((m) => m.ejecutar(beat, duracionDeBeat(beat, voz, params.vel))));
      if (detenerEn !== null && i === Number(detenerEn)) { window.escenaDetenida = true; document.body.dataset.detenida = '1'; corriendo = false; return; }
    }
    window.escenaTerminada = true;
    document.body.dataset.terminada = '1'; // la herramienta de capturas lo busca para saber que la partida llego al final
    } catch (e) {
      console.error('escena: la reproduccion se detuvo', e);
      document.body.dataset.error = String(e);
    }
    corriendo = false;
  };
  document.getElementById('btnPlay').onclick = async () => { await sfx.preparar(); reproducir(); };
  document.getElementById('btnReiniciar').onclick = () => location.reload();
  document.getElementById('btnTiempos').onclick = () => {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(marcas, null, 2)], { type: 'application/json' })), download: 'linea-de-tiempo.json' });
    a.click();
  };
  aviso(`${beats.length} momentos · ${(marcas.at(-1).finMs / 1000).toFixed(0)} s a velocidad ${params.vel}`);
  if (params.auto) { await sfx.preparar(); reproducir(); }
}
