// La mesa de casino de Duda y apuesta (navegador): dibuja y anima los beats de linea-de-tiempo-duda.js sobre cuatro asientos. Aqui no se decide nada del juego:
// cada beat trae lo que hay que mostrar. Lo que comparten todas las mesas vive en mesa-base.js. Se verifica mirando (herramientas/capturar-escena.mjs).

import { colocar, abanico } from './layout.js';
import { htmlCarta, htmlFrente, htmlPlaca, gemaDe, esc } from './kit.js';
import { MANOS_TOPE } from './linea-de-tiempo-duda.js';
import { rolDeJugada, etiquetaDeJugada } from './escena-config.js';
import { MesaBase, el, poner, centro } from './mesa-base.js';

const PLURAL = { rojo: 'rojas', amarillo: 'amarillas', azul: 'azules', verde: 'verdes', morado: 'moradas', arcoiris: 'arcoíris' };
const SELLOS = {
  farol: { texto: 'Farol descubierto', clase: 'perder' }, incumplido: { texto: 'No se cumplió', clase: 'perder' }, cumplido: { texto: 'Se cumplió', clase: 'ganar' },
  justo: { texto: '¡Justo!', clase: 'ganar' }, retirada: { texto: 'Se retiró', clase: 'perder' },
};

export class Mesa extends MesaBase {
  constructor(formato, partida, opciones) {
    super(formato, partida, opciones, colocar(formato));
    this.metodos = { apertura: 'nuevaMano', reparto: 'repartir', anuncio: 'jugada', acepta: 'jugada', duda: 'jugada', defensa: 'jugada', revelado: 'desenlace', retirada: 'desenlace', cierre: 'cerrar', final: 'terminar' };
    this.pozoFichas = 0;
    this.armar();
  }

  armar() {
    const { L } = this;
    this.armarBase('Duda y apuesta');
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
    this.pozo = el('fijo pozo', '<span>Apuestas</span><div class="pila-p"></div>');
    poner(this.pozo, L.pozo);
    this.anuncio = el('fijo anuncio'); poner(this.anuncio, L.anuncio);
    this.sello = el('sello');
    this.raiz.append(this.cabecera, this.etiqueta, ...this.asientos.map((a) => a.caja), this.mazo, this.pozo, this.anuncio, this.sello, this.subtitulos, this.capa);
    for (let s = 0; s < 4; s++) this.pintarPlaca(s);
  }

  // ---- ayudas ----
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
  // Antes de reproducir, las placas ya muestran las fichas con las que empieza el clip.
  mostrarEstadoInicial(beat) {
    const r = this.partida.rondas[beat.registro];
    this.fijarEstado(r.fichas, r.fichasEspacio);
    this.cabecera.querySelector('.mano').textContent = `Mano ${beat.mano} / ${MANOS_TOPE}`;
  }
  centroPlaca(s) { const a = this.L.asientos[s]; return { x: a.caja.x + a.caja.ancho - 100, y: a.caja.y + a.placa.alto / 2 }; }
  centroPozo() { return centro(this.L.pozo, 0.6); }
  fichasAlPozo(n) {
    const pila = this.pozo.querySelector('.pila-p');
    for (let i = 0; i < n && this.pozoFichas < 12; i++, this.pozoFichas++) {
      const f = el('ficha juego'); Object.assign(f.style, { left: `${(this.pozoFichas % 6) * 16 + 10}px`, top: `${20 + Math.floor(this.pozoFichas / 6) * 14 - (this.pozoFichas % 2) * 4}px` });
      pila.append(f);
    }
  }
  vaciarPozo() { this.pozo.querySelector('.pila-p').innerHTML = ''; this.pozoFichas = 0; }
  // Una carta de color: el frente sale del color; el color queda anotado en la carta para saber que ya se vio.
  voltear(carta, color = null, retraso = 0) {
    carta.dataset.color = carta.dataset.color ?? color ?? '';
    super.voltear(carta, color ? htmlFrente(color) : null, retraso);
  }

  // Lo que la escena informa de si misma (para la herramienta de capturas): que no quede nada de la mano anterior.
  estadoVisible() {
    const opacidad = (nodo) => Number(getComputedStyle(nodo).opacity);
    return { sello: opacidad(this.sello), anuncio: opacidad(this.anuncio), pastillas: this.raiz.querySelectorAll('.pastilla-camara').length, medallas: this.raiz.querySelectorAll('.medalla').length };
  }

  // ---- los beats ----
  async nuevaMano(beat) {
    const viejas = this.asientos.flatMap((a) => a.cartas);
    viejas.forEach((c) => this.anim(c, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }));
    await this.esperar(320);
    this.asientos.forEach((a) => { a.mano.innerHTML = ''; a.cartas = []; });
    this.vaciarPozo();
    // Las animaciones con fill:'forwards' le ganan a un estilo en linea: hay que cancelarlas o el sello y el anuncio de la mano anterior siguen visibles.
    for (const nodo of [this.sello, this.anuncio]) { nodo.getAnimations().forEach((x) => x.cancel()); nodo.style.opacity = 0; }
    this.anuncio.innerHTML = '';
    this.asientos.forEach((a) => a.caja.querySelectorAll('.pastilla-camara, .medalla').forEach((x) => x.remove()));
    this.asientos.forEach((a, s) => { a.rol = `Jugador ${s + 1}`; a.reemplazo = false; });
    this.mostrarEstadoInicial(beat);
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

  jugada(beat) {
    const s = beat.asiento;
    const a = this.asientos[s];
    a.reemplazo = beat.reemplazo;
    a.rol = rolDeJugada(beat);
    this.pintarPlaca(s);
    this.anim(a.placa, [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: 500 });
    const etiqueta = etiquetaDeJugada(beat, this.nombre(s)); // si la jugada la puso el juego, no se le atribuye a la IA
    for (const p of beat.pasos) {
      this.sonar(p);
      if (p.tipo === 'recupera') this.devolverApuesta(p);
      if (p.tipo === 'apuesta') this.volarFichas(this.centroPlaca(s), this.centroPozo(), p.fichas + p.espacios, 'juego', () => this.fichasAlPozo(1));
      if (p.tipo === 'anuncio') this.mostrarAnuncio(p, etiqueta);
      if (p.tipo === 'duda' || p.tipo === 'iguala' || p.tipo === 'pliega') this.textoAnuncio(etiqueta.texto, etiqueta.alerta);
    }
  }

  // Al aceptar un anuncio, su dueno recupera su apuesta: esas fichas salen del pozo y vuelven a su placa.
  devolverApuesta({ asiento, fichas, espacios }) {
    const n = Math.max(1, fichas + espacios);
    this.volarFichas(this.centroPozo(), this.centroPlaca(asiento), n);
    const pila = this.pozo.querySelector('.pila-p');
    for (let i = 0; i < n && pila.lastChild; i++) { pila.lastChild.remove(); this.pozoFichas = Math.max(0, this.pozoFichas - 1); }
  }

  mostrarAnuncio(paso, etiqueta) {
    this.anuncio.innerHTML = `<svg class="gema" viewBox="0 0 80 80">${gemaDe(paso.color)}</svg><div class="txt"><span class="quien${etiqueta.alerta ? ' alerta' : ''}">${esc(etiqueta.texto)}</span><span class="frase">Al menos ${esc(paso.cantidad)} ${PLURAL[paso.color] ?? esc(paso.color)}</span></div><div class="hay"></div>`;
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
