// Lo que comparten las mesas de casino de todos los juegos (mesa-duda.js, mesa-mayormenor.js, mesa-solitario.js): el fondo y las piezas fijas, los tiempos con la velocidad,
// el sonido, los subtitulos, el volteo de cartas y las fichas que viajan. Cada mesa agrega lo suyo (asientos, escenario, como se anima cada tipo de beat) y cumple el contrato que
// espera la pagina (escena.js): `raiz`, `L`, `rapido`, `vel`, `sfx`, `ejecutar(beat, ms)`, `estadoVisible()`, `mostrarEstadoInicial(beat)`.
//
// Todos los tiempos de la clase estan en milisegundos a velocidad 1; `vel` los acorta por igual (animaciones, esperas y temporizadores).
// Se puede importar en Node (no toca el DOM hasta que una mesa se arma en el navegador).

import { htmlLogo, htmlPlaca, esc } from './kit.js';
import { eventosDePaso } from './sonido.js';

export const el = (clase, html = '') => Object.assign(document.createElement('div'), { className: clase, innerHTML: html });
export const poner = (nodo, r) => Object.assign(nodo.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.ancho}px`, height: `${r.alto}px` });
export const centro = (r, fx = 0.5) => ({ x: r.x + r.ancho * fx, y: r.y + r.alto / 2 });

export class MesaBase {
  constructor(formato, partida, { sfx, razon = false, vel = 1 }, L) {
    this.formato = formato;
    this.vel = vel;
    this.partida = partida;
    this.sfx = sfx;
    this.razon = razon;
    this.rapido = false; // true: todo termina al instante (para capturas)
    this.L = L;
  }

  // El fondo y las piezas fijas de toda mesa. No agrega al DOM las piezas fijas (cabecera, etiqueta, subtitulos, capa): cada mesa las agrega en su orden.
  armarBase(titulo) {
    const { L } = this;
    const raiz = this.raiz = el(`escena f-${this.formato}`);
    Object.assign(raiz.style, { width: `${L.ancho}px`, height: `${L.alto}px` });
    raiz.append(el('fieltro'), el('riel'), el('luz'), el('marca-agua', htmlLogo('')));
    this.cabecera = el('fijo cabecera', `${htmlLogo('logo')}<div class="tit">${esc(titulo)}</div><div class="mano"></div>`);
    poner(this.cabecera, L.cabecera);
    this.etiqueta = el('fijo etiqueta-ia', 'Contenido generado por IA · Proyecto independiente');
    poner(this.etiqueta, L.etiqueta);
    this.subtitulos = el('fijo subtitulos');
    poner(this.subtitulos, L.subtitulos);
    this.capa = el('capa-volar');
  }

  // ---- tiempos ----
  anim(nodo, frames, opciones) {
    const v = this.vel;
    return nodo.animate(frames, this.rapido ? { ...opciones, duration: 1, delay: 0 } : { ...opciones, duration: (opciones.duration ?? 0) / v, delay: (opciones.delay ?? 0) / v });
  }
  esperar(ms) { return this.rapido || ms <= 0 ? Promise.resolve() : new Promise((ok) => setTimeout(ok, ms / this.vel)); }
  programar(ms, fn) { if (this.rapido) fn(); else setTimeout(fn, ms / this.vel); }

  // ---- sonido, nombres y texto ----
  sonar(paso) { for (const e of eventosDePaso(paso)) this.sfx[e](); }
  nombre(s) { return this.partida.jugadores[s]?.nombre ?? `Jugador ${s + 1}`; }
  mostrarSubtitulos(beat) {
    const dichas = beat.lineas.map((l) => (l.tipo === 'comentario' ? `<em>${esc(l.texto)}</em>` : esc(l.texto))).join(' ');
    const razon = this.razon && beat.razon ? `<div class="razon"><small>${esc(this.nombre(beat.asiento))} piensa</small>${esc(beat.razon)}</div>` : '';
    this.subtitulos.innerHTML = `${dichas}${razon}`;
    this.ajustarSubtitulos();
  }
  // El texto se achica de dos en dos hasta caber en su caja (minimo 20 px).
  ajustarSubtitulos() {
    this.subtitulos.style.fontSize = '';
    let tam = parseFloat(getComputedStyle(this.subtitulos).fontSize);
    while (this.subtitulos.scrollHeight > this.subtitulos.clientHeight + 1 && tam > 20) { tam -= 2; this.subtitulos.style.fontSize = `${tam}px`; }
  }

  // ---- piezas ----
  // Voltea una carta: si `frente` trae el HTML de su cara, se pone antes de girar (una carta oculta no lleva su cara en el DOM hasta este momento).
  voltear(carta, frente = null, retraso = 0) {
    if (frente) carta.querySelector('.cara').outerHTML = frente;
    const giro = carta.querySelector('.giro');
    const a = this.anim(giro, [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }], { duration: 520, delay: retraso, fill: 'forwards', easing: 'ease-in-out' });
    const brillo = carta.querySelector('.cara .brillo');
    if (brillo) this.anim(brillo, [{ transform: 'translateX(-120%)' }, { transform: 'translateX(120%)' }], { duration: 600, delay: retraso + 300, fill: 'both' });
    a.onfinish = () => { carta.classList.add('volteada'); a.cancel(); };
  }

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

  // La placa de un jugador dentro de su caja (cada mesa dice como se llama el grupo de fichas de cada juego).
  pintarPlacaEn(caja, jugador, rol, fichas, espacios, reemplazo) { caja.innerHTML = htmlPlaca(jugador, rol, fichas, espacios, reemplazo); }

  // ---- el beat ----
  async ejecutar(beat, ms) {
    const t0 = performance.now();
    this.mostrarSubtitulos(beat);
    const metodo = this.constructor.METODOS?.[beat.tipo]; // cada mesa declara METODOS: tipo de beat -> nombre del metodo que lo anima
    if (metodo) await this[metodo](beat, ms);
    await this.esperar(ms - (performance.now() - t0) * this.vel); // lo que ya paso, a velocidad 1
  }

  // Lo que cada mesa tiene que dar (para quien la use sin saberlo): estadoVisible() y mostrarEstadoInicial(beat).
  estadoVisible() { throw new Error('la mesa debe definir estadoVisible()'); }
  mostrarEstadoInicial() { throw new Error('la mesa debe definir mostrarEstadoInicial(beat)'); }
  fijarEstado() { throw new Error('la mesa debe definir fijarEstado(...)'); }
}
