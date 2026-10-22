// La mesa de casino de Mayor o menor (navegador): dibuja y anima los beats de linea-de-tiempo-mayormenor.js con dos asientos y un escenario al centro. Aqui no se decide nada del
// juego: cada beat trae lo que hay que mostrar. Lo que comparten todas las mesas vive en mesa-base.js. Se verifica mirando (herramientas/capturar-escena.mjs).
//
// Lo que el publico ve y cuando: el crupier voltea su carta (publica); el activo deja la suya BOCA ABAJO (solo la camara la muestra de antemano); el predictor apuesta sin verla;
// se voltea, se compara (▲ mayor, ▼ menor, = igual) y se pagan las fichas con la banca. En la tira de numeros de cada jugador solo se marca la carta jugada al revelarla.

import { colocarMayorMenor } from './layout-mayormenor.js';
import { htmlCartaNumero, htmlFrenteNumero, htmlPlaca, htmlPila, htmlTiraMano, esc } from './kit.js';
import { RONDAS_TOPE } from './linea-de-tiempo-mayormenor.js';
import { etiquetaDeApuesta } from './escena-config.js';
import { MesaBase, el, poner, centro } from './mesa-base.js';

const NUMEROS = Array.from({ length: 11 }, (_, i) => i);
const SELLOS = { acierta: { texto: 'Acierta', clase: 'ganar' }, falla: { texto: 'Falla', clase: 'perder' }, igual: { texto: 'Igual', clase: 'neutro' } };
const FLECHAS = { mayor: ['▲', 'mayor'], menor: ['▼', 'menor'], igual: ['＝', 'igual'] };
// El estado de cada jugador en la ronda: la pastilla verde en el centro de su barra (kit.js: htmlEstado). El `rol` de cada asiento guarda la clave de este objeto, o '' si no tiene papel (el reparto, el final).
// `accionJuego`: lo que dice la pastilla (ahora dorada) cuando esa jugada la puso el juego porque la respuesta de la IA no sirvio: el papel se conserva y nunca se le atribuye la jugada a la IA.
export const ESTADOS = {
  activo: { papel: 'Activo', accion: 'juega una carta', accionJuego: 'carta del juego' },
  predictor: { papel: 'Predictor', accion: 'apuesta', accionJuego: 'apuesta del juego' },
};
// `ahora`: es quien actua en este momento (juega su carta o apuesta) y su pastilla brilla.
const estadoDe = (a) => { const e = ESTADOS[a.rol]; return e ? { papel: e.papel, accion: a.reemplazo ? e.accionJuego : e.accion, juego: a.reemplazo === true, ahora: a.actua === true } : null; };

const carta = (n = null) => Object.assign(document.createElement('div'), { innerHTML: htmlCartaNumero(n) }).firstElementChild;

// Lo de la apuesta (la caja «X apuesta N fichas a que sera M», el sello y la flecha) se apaga cuando la ronda se resuelve, no se queda hasta la ronda siguiente (grabacion del 21 de octubre de 2026).
export const APAGADO_MS = 350; // lo que tarda el fundido de apagado
export const LECTURA_MS = 1100; // lo que se deja leer el resultado (fichas ya pagadas y contadores al dia) antes de apagar el sello y la flecha
export const APUESTA_MS = 900; // cuando (ms desde que se juega la carta del activo) sale la caja de la apuesta: al terminar de aparecer el «¿mayor o menor?» (500 ms de espera y 400 de entrada)
// Cuando (ms desde que empieza el beat de resultado) se apaga: despues de pagar y de actualizar los contadores (a los 700 ms del ultimo pago) y de dejarlos leer, y con tiempo de que el fundido termine antes del final
// del beat; si el beat es cortisimo, justo despues de actualizar los contadores.
export const momentoDeLimpieza = (retrasoMs, beatMs) => Math.min(retrasoMs + 700 + LECTURA_MS, Math.max(beatMs - APAGADO_MS - 250, retrasoMs + 700));

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
    this.visibles = new Set(); // lo de la apuesta que esta a la vista ahora: 'apuesta' (la caja), 'sello' e 'indicador' (la flecha); quitarResolucion lo apaga
    this.asientos = L.asientos.map((a, s) => {
      const placa = el('fijo placa-grande'); poner(placa, a.placa);
      const tira = el('fijo tira-caja'); poner(tira, a.tira);
      tira.style.setProperty('--tw', `${a.tiraForma.ancho}px`); tira.style.setProperty('--th', `${a.tiraForma.alto}px`);
      return { placa, tira, fichas: 0, inicial: [...NUMEROS], disponibles: [...NUMEROS], ahora: null, rol: '', reemplazo: false, turno: false, actua: false };
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
    a.placa.innerHTML = htmlPlaca(this.partida.jugadores[s], '', a.fichas, null, a.reemplazo, estadoDe(a));
    a.placa.classList.toggle('turno', a.turno);
  }
  // La tira de la mano: una casilla por carta repartida (con las reglas 2.0.0 puede haber repetidas); las ya jugadas, tachadas; la que se juega ahora, en dorado, solo desde que se revela.
  pintarTira(s) {
    const a = this.asientos[s];
    a.tira.innerHTML = htmlTiraMano(a.inicial, a.disponibles, a.ahora);
  }
  mostrarMazo(n) { this.mazo.querySelector('.quedan').innerHTML = `Mazo<br>quedan ${n}`; }
  ocultarIndicador() { this.indicador.innerHTML = '<div class="flecha" style="opacity:.35">?</div><div class="txt" style="color:#9a9aa6;font-size:.7em">¿mayor<br>o menor?</div>'; this.indicador.style.opacity = 0; }
  centroPlaca(s) { const p = this.L.asientos[s].placa; return { x: p.x + p.ancho - 110, y: p.y + p.alto / 2 }; }
  // Pone fichas, cartas disponibles y mazo con el estado que trae el beat (antes o despues de la ronda).
  aplicarEstado(e) {
    this.asientos.forEach((a, s) => { a.fichas = e.fichas[s]; a.disponibles = e.disponibles[s]; a.inicial = e.manoInicial?.[s] ?? NUMEROS; this.pintarPlaca(s); this.pintarTira(s); });
    this.mostrarMazo(e.crupierQuedan[this.activo]);
  }
  aplicarRoles({ activo, predictor, doble = false }) {
    this.activo = activo;
    this.rondaDoble = doble;
    this.asientos.forEach((a, s) => { a.turno = s === activo; a.reemplazo = false; a.ahora = null; a.actua = false; a.rol = s === activo ? 'activo' : s === predictor ? 'predictor' : ''; });
  }
  mostrarEstadoInicial(beat) {
    this.aplicarRoles(beat.pasos.find((p) => p.tipo === 'roles'));
    this.aplicarEstado(beat.pasos.find((p) => p.tipo === 'estado'));
    const mano = this.cabecera.querySelector('.mano');
    mano.textContent = `Ronda ${beat.mano} / ${RONDAS_TOPE}${this.rondaDoble ? ' · DOBLE ×2' : ''}`; // una ronda doble paga al doble las ganancias (reglas 2.0.0)
    mano.classList.toggle('doble', this.rondaDoble === true);
  }
  fijarEstado(e) { this.aplicarEstado(e); }

  // Lo que la escena informa de si misma (para la herramienta de capturas): que no quede nada de la ronda anterior.
  estadoVisible() {
    const opacidad = (nodo) => Number(getComputedStyle(nodo).opacity);
    const desborda = (nodo) => Boolean(nodo) && nodo.scrollWidth > nodo.clientWidth; // el contenido es mas ancho que su caja: se corta (con puntos suspensivos) o se sale
    // tituloCortado: le pasaba a «MAYOR O MENOR» en las rondas dobles de dos cifras, en vertical. papeles: barras que muestran su papel (activo o predictor). nombreCortado y barraDesbordada: un nombre largo o una pastilla que no cabe.
    return {
      sello: opacidad(this.sello), apuesta: opacidad(this.apuesta), cartas: this.ranuraCrupier.children.length + this.ranuraJugada.children.length, pastillas: this.raiz.querySelectorAll('.pastilla-camara').length,
      tituloCortado: desborda(this.cabecera.querySelector('.tit')),
      papeles: this.asientos.filter((a) => a.placa.querySelector('.estado-pill')).length,
      brillos: this.asientos.filter((a) => a.placa.querySelector('.estado-pill.ahora')).length, // pastillas brillando (quien actua ahora): al empezar una ronda no hay ninguna
      nombreCortado: this.asientos.some((a) => desborda(a.placa.querySelector('.nom'))),
      barraDesbordada: this.asientos.some((a) => desborda(a.placa.querySelector('.placa'))),
    };
  }

  // Una carta vuela de un punto de la mesa a su ranura (el centro de la ranura es su destino).
  volarCarta(c, ranura, desde, retraso = 0) {
    const r = centro(ranura === this.ranuraCrupier ? this.L.centro.cartaCrupier : this.L.centro.cartaJugada);
    const dx = desde.x - r.x, dy = desde.y - r.y;
    this.anim(c, [{ transform: `translate(${dx}px, ${dy}px) scale(.45)`, opacity: 0 }, { opacity: 1, offset: 0.15 }, { transform: 'none', opacity: 1 }], { duration: 480, delay: retraso, fill: 'both', easing: 'cubic-bezier(.2,.9,.3,1)' });
  }

  // ---- los beats ----
  // Lo de la apuesta se apaga cuando la ronda se resuelve (pagar -> quitarResolucion): la caja se va en cuanto salen de ella las fichas, y el sello y la flecha despues de dejar leer los contadores; ya no esperan a la ronda
  // siguiente. `solo` son las piezas a apagar ('apuesta', 'sello', 'indicador'); sin ella, todas las que esten a la vista.
  quitarResolucion(solo = null) {
    for (const nombre of [...(this.visibles ?? [])].filter((n) => solo === null || solo.includes(n))) {
      const nodo = nombre === 'apuesta' ? this.apuesta : nombre === 'sello' ? this.sello : this.indicador; // solo se apaga lo que estaba a la vista: un fundido de 1 a 0 encenderia por un instante lo que ya estaba apagado
      const a = this.anim(nodo, [{ opacity: 1 }, { opacity: 0 }], { duration: APAGADO_MS, easing: 'ease-in', fill: 'forwards' });
      // al terminar se cancelan TODAS las animaciones del nodo, no solo esta: la de entrada sigue «forwards» en opacidad 1 y le gana al estilo en linea (la caja volveria a verse despues del fundido)
      a.onfinish = () => { nodo.getAnimations().forEach((x) => x.cancel()); nodo.style.opacity = 0; };
      this.visibles.delete(nombre);
    }
  }
  apagarYa() {
    // Las animaciones con fill:'forwards' le ganan a un estilo en linea: se cancelan o el sello y la apuesta de la ronda anterior siguen visibles.
    for (const nodo of [this.sello, this.apuesta, this.indicador]) { nodo.getAnimations().forEach((x) => x.cancel()); nodo.style.opacity = 0; }
    this.ocultarIndicador();
    this.raiz.querySelectorAll('.pastilla-camara').forEach((x) => x.remove());
    this.visibles?.clear();
  }
  // Las cartas de la ronda que termino se apagan con un fundido y se quitan.
  async retirarCartas() {
    const viejas = [...this.ranuraCrupier.children, ...this.ranuraJugada.children];
    viejas.forEach((c) => this.anim(c, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }));
    await this.esperar(320);
    this.ranuraCrupier.innerHTML = ''; this.ranuraJugada.innerHTML = '';
  }

  // La ronda nueva cambia TODO a la vez: lo que quedara de la apuesta se corta, la cabecera («Ronda N»), los papeles y las fichas salen en el mismo instante en que la voz dice «Ronda N» (antes esperaban 320 ms y
  // se veia la ronda vieja debajo de la voz de la nueva), y las cartas viejas se apagan con un fundido.
  async nuevaRonda(beat) {
    this.apagarYa();
    this.mostrarEstadoInicial(beat);
    await this.retirarCartas();
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

  // Quien actua ahora (juega su carta o apuesta): su pastilla de papel brilla mientras dura su jugada y hace un destello al encenderse; en el resto de la ronda nadie brilla (s = null). Repinta la barra de quien actua
  // (su papel pudo cambiar) y la de quien deja de brillar.
  actuaAhora(s) {
    this.asientos.forEach((a, i) => {
      const brillaba = a.actua === true;
      a.actua = i === s;
      if (a.actua || brillaba) this.pintarPlaca(i);
    });
    const pastilla = this.asientos[s]?.placa.querySelector('.estado-pill');
    if (pastilla) this.anim(pastilla, [{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }], { duration: 480, easing: 'cubic-bezier(.2,1.4,.4,1)' });
  }

  async jugarCarta(beat) {
    const s = beat.asiento;
    const a = this.asientos[s];
    a.reemplazo = beat.reemplazo;
    a.rol = 'activo';
    this.actuaAhora(s); // brilla su pastilla mientras juega su carta
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
        this.anim(this.indicador, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 500, fill: 'forwards' }); // este «?» se cambia por la flecha de verdad al revelar: ahi (revelarCarta) se marca para apagarse
        if (p.apuesta) this.programar(APUESTA_MS, () => this.mostrarApuesta(p.apuesta, p.apuesta.reemplazo)); // ahi es cuando el predictor tiene que adivinar: sale su apuesta (la voz la dice despues, en el beat de la apuesta)
      }
    }
  }

  // La caja «X apuesta N fichas a que sera M»: sale cuando se juega la carta del activo (ahi es cuando el predictor tiene que adivinar) y se va cuando se reparten las fichas (pagar). `p` es la apuesta (asiento, fichas,
  // lado, todo, maximo) y `reemplazo` dice si la puso el juego. Si ya salio con la carta no se repite: el beat de la apuesta, que es cuando la voz la dice, no la dibuja ni mueve las fichas otra vez.
  mostrarApuesta(p, reemplazo = false) {
    if (this.visibles.has('apuesta')) return;
    const a = this.asientos[p.asiento];
    a.reemplazo = reemplazo;
    a.rol = 'predictor';
    this.actuaAhora(p.asiento); // brilla su pastilla mientras apuesta (y se apaga la del activo)
    this.apuesta.innerHTML = `<div class="pila" style="width:var(--fw);height:60px;transform:scale(1.5);transform-origin:left center;margin-right:30px">${htmlPila(p.fichas, 'juego')}</div><div><div class="t1">${esc(etiquetaDeApuesta({ reemplazo }, this.nombre(p.asiento)).titulo)}${p.todo ? ` <span class="todo">${p.maximo ? '¡Máximo!' : '¡Todo!'}</span>` : ''}</div><div class="t2">${esc(p.fichas)} ${p.fichas === 1 ? 'ficha' : 'fichas'} · a que será <span class="lado">${esc(p.lado)}</span></div></div>`;
    this.anim(this.apuesta, [{ opacity: 0, transform: 'scale(.85)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 380, fill: 'forwards', easing: 'cubic-bezier(.2,1.3,.4,1)' });
    this.visibles.add('apuesta');
    this.sonar({ ...p, tipo: 'apuesta' });
    this.volarFichas(this.centroPlaca(p.asiento), centro(this.L.centro.apuesta, 0.12), p.fichas, 'juego');
  }

  async apostar(beat) {
    this.mostrarApuesta(beat.pasos.find((x) => x.tipo === 'apuesta'), beat.reemplazo);
    await this.esperar(900);
  }

  async revelarCarta(beat, ms) {
    const rev = beat.pasos.find((x) => x.tipo === 'revelar'), cmp = beat.pasos.find((x) => x.tipo === 'comparar'), sello = beat.pasos.find((x) => x.tipo === 'sello');
    this.actuaAhora(null); // ya nadie actua: se apaga el brillo de quien apostaba
    const c = this.ranuraJugada.firstElementChild;
    if (c && c.dataset.visible !== '1') this.voltear(c, htmlFrenteNumero(rev.carta)); // si la camara ya la mostro, no se voltea otra vez
    this.raiz.querySelectorAll('.pastilla-camara').forEach((x) => x.remove()); // la pastilla «Camara» ya no hace falta: la carta se ve para todos
    this.sonar(rev);
    const a = this.asientos[this.activo];
    a.ahora = rev.carta;
    this.pintarTira(this.activo);
    await this.esperar(ms * 0.45);
    // con las reglas 2.0.0 la carta igual cuenta como menor: se ve la flecha de menor y se dice por que
    const [flecha, texto] = cmp.igual && cmp.veredicto !== 'igual' ? ['＝', 'igual = menor'] : FLECHAS[cmp.veredicto] ?? ['?', ''];
    this.indicador.innerHTML = `<div class="flecha">${flecha}</div><div class="txt" style="color:var(--oro)">${esc(texto)}</div>`;
    this.anim(this.indicador, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 360, fill: 'forwards', easing: 'cubic-bezier(.2,1.3,.4,1)' });
    this.visibles.add('indicador');
    await this.esperar(ms * 0.2);
    const info = SELLOS[sello.sello];
    this.sello.textContent = info.texto;
    this.sello.className = `sello ${info.clase}`;
    const s = centro(this.L.centro.sello);
    Object.assign(this.sello.style, { left: `${s.x}px`, top: `${s.y}px` });
    this.sonar(sello);
    const base = 'translate(-50%, -50%) rotate(-4deg)';
    this.anim(this.sello, [{ opacity: 0, transform: `${base} scale(2.2)` }, { opacity: 1, transform: `${base} scale(1)` }], { duration: 320, fill: 'forwards', easing: 'cubic-bezier(.2,1.2,.4,1)' });
    this.visibles.add('sello');
  }

  async pagar(beat, ms) {
    const banca = centro(this.L.centro.banca), caja = centro(this.L.centro.apuesta, 0.12);
    let retraso = 0, cajaSale = null; // cajaSale: cuando salen las fichas de la caja de la apuesta (se devuelven o se pagan a la banca): ahi la caja se va
    for (const p of beat.pasos) {
      if (p.tipo === 'estado') { this.programar(retraso + 700, () => this.aplicarEstado(p)); continue; }
      this.programar(retraso, () => this.sonar(p));
      if (p.tipo === 'cobra') this.programar(retraso, () => this.volarFichas(banca, this.centroPlaca(p.asiento), p.fichas, 'juego'));
      if (p.tipo === 'devuelve') this.programar(retraso, () => this.volarFichas(caja, this.centroPlaca(p.asiento), p.fichas, 'juego'));
      if (p.tipo === 'paga') this.programar(retraso, () => this.volarFichas(caja, banca, p.fichas, 'juego'));
      if ((p.tipo === 'devuelve' || p.tipo === 'paga') && cajaSale === null) cajaSale = retraso;
      retraso += 450;
    }
    // La ronda ya esta resuelta: la caja de la apuesta se va en cuanto salen de ella las fichas (a quien acerto o a la banca); el sello y la flecha, cuando se pagaron las fichas y los contadores muestran el resultado (y se
    // alcanzan a leer). En las capturas que se detienen en un beat (rapido) no se apaga nada: la captura del resultado conserva lo que se ve, y la ronda siguiente lo corta.
    if (!this.rapido) {
      this.programar(cajaSale ?? 0, () => this.quitarResolucion(['apuesta']));
      this.programar(momentoDeLimpieza(retraso, ms), () => this.quitarResolucion(['sello', 'indicador']));
    }
    await this.esperar(Math.min(ms * 0.5, retraso + 900));
  }

  async terminar(beat) {
    const f = beat.pasos[0]?.final;
    this.cabecera.querySelector('.mano').textContent = 'Final';
    this.cabecera.querySelector('.mano').classList.remove('doble');
    // el final no deja los papeles de la ultima ronda («Predictor · apuesta», «Activo · juega una carta») ni la carta dorada de la tira
    this.asientos.forEach((a, s) => { Object.assign(a, { turno: false, rol: '', reemplazo: false, ahora: null, actua: false }); this.pintarPlaca(s); this.pintarTira(s); a.placa.classList.remove('turno'); a.placa.querySelector('.medalla')?.remove(); });
    const ganadores = f ? (f.empate ? [0, 1] : [f.ganador]) : [];
    for (const s of ganadores) {
      const medalla = el('medalla', f.empate ? 'Empate' : 'Gana');
      this.asientos[s].placa.append(medalla);
      this.anim(medalla, [{ opacity: 0, transform: 'translateY(-40px) scale(2)' }, { opacity: 1, transform: 'none' }], { duration: 520, fill: 'both', easing: 'cubic-bezier(.2,1.4,.4,1)' });
    }
    // el final no deja sobre la mesa nada de la ultima ronda (ni la apuesta ni las cartas)
    this.apagarYa();
    await this.retirarCartas();
  }
}
