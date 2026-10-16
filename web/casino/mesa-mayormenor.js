// La mesa de casino de Mayor o menor (navegador): dibuja y anima los beats de linea-de-tiempo-mayormenor.js con dos asientos y un escenario al centro. Aqui no se decide nada del
// juego: cada beat trae lo que hay que mostrar. Lo que comparten todas las mesas vive en mesa-base.js. Se verifica mirando (herramientas/capturar-escena.mjs).
//
// Lo que el publico ve y cuando: el crupier voltea su carta (publica); el activo deja la suya BOCA ABAJO (solo la camara la muestra de antemano); el predictor apuesta sin verla;
// se voltea, se compara (▲ mayor, ▼ menor, = igual) y se pagan las fichas con la banca. En la tira de numeros de cada jugador solo se marca la carta jugada al revelarla.

import { colocarMayorMenor } from './layout-mayormenor.js';
import { htmlCartaNumero, htmlFrenteNumero, htmlPlaca, htmlPila, htmlTira, esc } from './kit.js';
import { RONDAS_TOPE } from './linea-de-tiempo-mayormenor.js';
import { etiquetaDeApuesta } from './escena-config.js';
import { MesaBase, el, poner, centro } from './mesa-base.js';

const NUMEROS = Array.from({ length: 11 }, (_, i) => i);
const SELLOS = { acierta: { texto: 'Acierta', clase: 'ganar' }, falla: { texto: 'Falla', clase: 'perder' }, igual: { texto: 'Igual', clase: 'ganar' } };
const FLECHAS = { mayor: ['▲', 'mayor'], menor: ['▼', 'menor'], igual: ['＝', 'igual'] };

const carta = (n = null) => Object.assign(document.createElement('div'), { innerHTML: htmlCartaNumero(n) }).firstElementChild;

// Los metodos se llaman con verbos distintos de los campos (this.apuesta, this.sello... son piezas del DOM): un campo con el mismo nombre taparia al metodo.
export class Mesa extends MesaBase {
  static METODOS = { apertura: 'nuevaRonda', crupier: 'mostrarCrupier', jugada: 'jugarCarta', apuesta: 'apostar', revelado: 'revelarCarta', resultado: 'pagar', final: 'terminar' };

  constructor(formato, partida, opciones) {
    super(formato, partida, opciones, colocarMayorMenor(formato));
    this.activo = 0;
    this.armar();
  }

  armar() {
    const { L } = this;
    this.armarBase('Mayor o menor');
    this.asientos = L.asientos.map((a, s) => {
      const placa = el('fijo placa-grande'); poner(placa, a.placa);
      const tira = el('fijo tira-caja'); poner(tira, a.tira);
      tira.style.setProperty('--tw', `${a.tiraForma.ancho}px`); tira.style.setProperty('--th', `${a.tiraForma.alto}px`);
      return { placa, tira, fichas: 0, disponibles: [...NUMEROS], ahora: null, rol: `Jugador ${s + 1}`, reemplazo: false, turno: false };
    });
    const C = L.centro;
    this.rotuloCrupier = el('fijo rotulo', 'Crupier'); poner(this.rotuloCrupier, C.rotuloCrupier);
    this.rotuloJugada = el('fijo rotulo', 'Carta jugada'); poner(this.rotuloJugada, C.rotuloJugada);
    this.ranuraCrupier = el('fijo ranura'); poner(this.ranuraCrupier, C.cartaCrupier);
    this.ranuraJugada = el('fijo ranura'); poner(this.ranuraJugada, C.cartaJugada);
    for (const ranura of [this.ranuraCrupier, this.ranuraJugada]) ranura.style.setProperty('--cw', `${L.carta.ancho}px`);
    this.indicador = el('fijo indic'); poner(this.indicador, C.indicador);
    this.apuesta = el('fijo apuesta-caja'); poner(this.apuesta, C.apuesta);
    this.sello = el('sello');
    this.banca = el('fijo banca', '<span>Banca</span><div class="pila-p"></div>'); poner(this.banca, C.banca);
    this.banca.querySelector('.pila-p').innerHTML = Array.from({ length: 6 }, (_, i) => `<div class="ficha juego" style="left:${i * 18 + 10}px;top:${26 - (i % 2) * 5}px"></div>`).join('');
    this.mazo = el('fijo mazo mazo-centro', `<div class="pila-mazo">${[0, 1].map(() => htmlCartaNumero(null)).join('')}</div><span class="quedan"></span>`); poner(this.mazo, C.mazo);
    this.mazo.querySelectorAll('.carta').forEach((c, i) => Object.assign(c.style, { left: `${i * 3}px`, top: `${-i * 3}px` }));
    this.raiz.append(this.cabecera, this.etiqueta, ...this.asientos.flatMap((a) => [a.placa, a.tira]), this.rotuloCrupier, this.rotuloJugada, this.ranuraCrupier, this.ranuraJugada,
      this.indicador, this.apuesta, this.sello, this.banca, this.mazo, this.subtitulos, this.capa);
    this.ocultarIndicador();
    this.asientos.forEach((_, s) => { this.pintarPlaca(s); this.pintarTira(s); });
  }

  // ---- ayudas ----
  pintarPlaca(s) {
    const a = this.asientos[s];
    a.placa.innerHTML = htmlPlaca(this.partida.jugadores[s], a.rol, a.fichas, null, a.reemplazo);
    a.placa.classList.toggle('turno', a.turno);
  }
  // La tira de numeros: los que ya no tiene (usados) tachados; el que se juega ahora, en dorado, solo desde que se revela.
  pintarTira(s) {
    const a = this.asientos[s];
    a.tira.innerHTML = htmlTira(NUMEROS, NUMEROS.filter((n) => !a.disponibles.includes(n)), a.ahora);
  }
  mostrarMazo(n) { this.mazo.querySelector('.quedan').innerHTML = `Mazo<br>quedan ${n}`; }
  ocultarIndicador() { this.indicador.innerHTML = '<div class="flecha" style="opacity:.35">?</div><div class="txt" style="color:#9a9aa6;font-size:.7em">¿mayor<br>o menor?</div>'; this.indicador.style.opacity = 0; }
  centroPlaca(s) { const p = this.L.asientos[s].placa; return { x: p.x + p.ancho - 110, y: p.y + p.alto / 2 }; }
  // Pone fichas, cartas disponibles y mazo con el estado que trae el beat (antes o despues de la ronda).
  aplicarEstado(e) {
    this.asientos.forEach((a, s) => { a.fichas = e.fichas[s]; a.disponibles = e.disponibles[s]; this.pintarPlaca(s); this.pintarTira(s); });
    this.mostrarMazo(e.crupierQuedan[this.activo]);
  }
  aplicarRoles({ activo, predictor }) {
    this.activo = activo;
    this.asientos.forEach((a, s) => { a.turno = s === activo; a.reemplazo = false; a.ahora = null; a.rol = s === activo ? 'Activo · juega una carta' : s === predictor ? 'Predictor · apuesta' : ''; });
  }
  mostrarEstadoInicial(beat) {
    this.aplicarRoles(beat.pasos.find((p) => p.tipo === 'roles'));
    this.aplicarEstado(beat.pasos.find((p) => p.tipo === 'estado'));
    this.cabecera.querySelector('.mano').textContent = `Ronda ${beat.mano} / ${RONDAS_TOPE}`;
  }
  fijarEstado(e) { this.aplicarEstado(e); }

  // Lo que la escena informa de si misma (para la herramienta de capturas): que no quede nada de la ronda anterior.
  estadoVisible() {
    const opacidad = (nodo) => Number(getComputedStyle(nodo).opacity);
    return { sello: opacidad(this.sello), apuesta: opacidad(this.apuesta), cartas: this.ranuraCrupier.children.length + this.ranuraJugada.children.length, pastillas: this.raiz.querySelectorAll('.pastilla-camara').length };
  }

  // Una carta vuela de un punto de la mesa a su ranura (el centro de la ranura es su destino).
  volarCarta(c, ranura, desde, retraso = 0) {
    const r = centro(ranura === this.ranuraCrupier ? this.L.centro.cartaCrupier : this.L.centro.cartaJugada);
    const dx = desde.x - r.x, dy = desde.y - r.y;
    this.anim(c, [{ transform: `translate(${dx}px, ${dy}px) scale(.45)`, opacity: 0 }, { opacity: 1, offset: 0.15 }, { transform: 'none', opacity: 1 }], { duration: 480, delay: retraso, fill: 'both', easing: 'cubic-bezier(.2,.9,.3,1)' });
  }

  // ---- los beats ----
  async nuevaRonda(beat) {
    const viejas = [...this.ranuraCrupier.children, ...this.ranuraJugada.children];
    viejas.forEach((c) => this.anim(c, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }));
    await this.esperar(320);
    this.ranuraCrupier.innerHTML = ''; this.ranuraJugada.innerHTML = '';
    // Las animaciones con fill:'forwards' le ganan a un estilo en linea: se cancelan o el sello y la apuesta de la ronda anterior siguen visibles.
    for (const nodo of [this.sello, this.apuesta, this.indicador]) { nodo.getAnimations().forEach((x) => x.cancel()); nodo.style.opacity = 0; }
    this.ocultarIndicador();
    this.raiz.querySelectorAll('.pastilla-camara').forEach((x) => x.remove());
    this.mostrarEstadoInicial(beat);
  }

  async mostrarCrupier(beat) {
    const p = beat.pasos.find((x) => x.tipo === 'crupier');
    const c = carta(null);
    this.ranuraCrupier.append(c);
    this.volarCarta(c, this.ranuraCrupier, centro(this.L.centro.mazo));
    this.sonar(p);
    this.programar(480, () => { this.voltear(c, htmlFrenteNumero(p.carta)); this.mostrarMazo(p.quedan); });
    await this.esperar(1100);
  }

  async jugarCarta(beat) {
    const s = beat.asiento;
    const a = this.asientos[s];
    a.reemplazo = beat.reemplazo;
    a.rol = beat.reemplazo ? 'Jugada del juego' : 'Activo · juega una carta';
    this.pintarPlaca(s);
    for (const p of beat.pasos) {
      this.sonar(p);
      if (p.tipo === 'jugar') {
        const c = carta(null);
        this.ranuraJugada.append(c);
        this.volarCarta(c, this.ranuraJugada, centro(this.L.asientos[s].tira));
        if (p.carta !== null) { // la camara: el publico ve la carta antes que el predictor
          c.dataset.visible = '1'; c.classList.add('cam');
          this.programar(520, () => this.voltear(c, htmlFrenteNumero(p.carta)));
          this.raiz.append(Object.assign(el('pastilla-camara libre', 'Cámara'), { style: `left:${this.L.centro.pastilla.x}px;top:${this.L.centro.pastilla.y}px` }));
        }
      }
      if (p.tipo === 'pregunta') {
        this.indicador.innerHTML = '<div class="flecha" style="opacity:.35">?</div><div class="txt" style="color:#9a9aa6;font-size:.7em">¿mayor<br>o menor?</div>';
        this.anim(this.indicador, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 500, fill: 'forwards' });
      }
    }
  }

  async apostar(beat) {
    const p = beat.pasos.find((x) => x.tipo === 'apuesta');
    const a = this.asientos[p.asiento];
    a.reemplazo = beat.reemplazo;
    a.rol = beat.reemplazo ? 'Jugada del juego' : 'Predictor · apuesta';
    this.pintarPlaca(p.asiento);
    this.apuesta.innerHTML = `<div class="pila" style="width:var(--fw);height:60px;transform:scale(1.5);transform-origin:left center;margin-right:30px">${htmlPila(p.fichas, 'juego')}</div><div><div class="t1">${esc(etiquetaDeApuesta(beat, this.nombre(p.asiento)).titulo)}${p.todo ? ' <span class="todo">¡Todo!</span>' : ''}</div><div class="t2">${esc(p.fichas)} ${p.fichas === 1 ? 'ficha' : 'fichas'} · a que será <span class="lado">${esc(p.lado)}</span></div></div>`;
    this.anim(this.apuesta, [{ opacity: 0, transform: 'scale(.85)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 380, fill: 'forwards', easing: 'cubic-bezier(.2,1.3,.4,1)' });
    this.sonar(p);
    this.volarFichas(this.centroPlaca(p.asiento), centro(this.L.centro.apuesta, 0.12), p.fichas, 'juego');
    await this.esperar(900);
  }

  async revelarCarta(beat, ms) {
    const rev = beat.pasos.find((x) => x.tipo === 'revelar'), cmp = beat.pasos.find((x) => x.tipo === 'comparar'), sello = beat.pasos.find((x) => x.tipo === 'sello');
    const c = this.ranuraJugada.firstElementChild;
    if (c && c.dataset.visible !== '1') this.voltear(c, htmlFrenteNumero(rev.carta)); // si la camara ya la mostro, no se voltea otra vez
    this.sonar(rev);
    const a = this.asientos[this.activo];
    a.ahora = rev.carta;
    this.pintarTira(this.activo);
    await this.esperar(ms * 0.45);
    const [flecha, texto] = FLECHAS[cmp.veredicto] ?? ['?', ''];
    this.indicador.innerHTML = `<div class="flecha">${flecha}</div><div class="txt" style="color:var(--oro)">${esc(texto)}</div>`;
    this.anim(this.indicador, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 360, fill: 'forwards', easing: 'cubic-bezier(.2,1.3,.4,1)' });
    await this.esperar(ms * 0.2);
    const info = SELLOS[sello.sello];
    this.sello.textContent = info.texto;
    this.sello.className = `sello ${info.clase}`;
    const s = centro(this.L.centro.sello);
    Object.assign(this.sello.style, { left: `${s.x}px`, top: `${s.y}px` });
    this.sonar(sello);
    const base = 'translate(-50%, -50%) rotate(-4deg)';
    this.anim(this.sello, [{ opacity: 0, transform: `${base} scale(2.2)` }, { opacity: 1, transform: `${base} scale(1)` }], { duration: 320, fill: 'forwards', easing: 'cubic-bezier(.2,1.2,.4,1)' });
  }

  async pagar(beat, ms) {
    const banca = centro(this.L.centro.banca), caja = centro(this.L.centro.apuesta, 0.12);
    let retraso = 0;
    for (const p of beat.pasos) {
      if (p.tipo === 'estado') { this.programar(retraso + 700, () => this.aplicarEstado(p)); continue; }
      this.programar(retraso, () => this.sonar(p));
      if (p.tipo === 'cobra') this.programar(retraso, () => this.volarFichas(banca, this.centroPlaca(p.asiento), p.fichas, 'juego'));
      if (p.tipo === 'devuelve') this.programar(retraso, () => this.volarFichas(caja, this.centroPlaca(p.asiento), p.fichas, 'juego'));
      if (p.tipo === 'paga') this.programar(retraso, () => this.volarFichas(caja, banca, p.fichas, 'juego'));
      retraso += 450;
    }
    await this.esperar(Math.min(ms * 0.5, retraso + 900));
  }

  terminar(beat) {
    const f = beat.pasos[0]?.final;
    this.cabecera.querySelector('.mano').textContent = 'Final';
    this.asientos.forEach((a) => { a.turno = false; a.placa.classList.remove('turno'); a.placa.querySelector('.medalla')?.remove(); });
    const ganadores = f ? (f.empate ? [0, 1] : [f.ganador]) : [];
    for (const s of ganadores) {
      const medalla = el('medalla', f.empate ? 'Empate' : 'Gana');
      this.asientos[s].placa.append(medalla);
      this.anim(medalla, [{ opacity: 0, transform: 'translateY(-40px) scale(2)' }, { opacity: 1, transform: 'none' }], { duration: 520, fill: 'both', easing: 'cubic-bezier(.2,1.4,.4,1)' });
    }
  }
}
