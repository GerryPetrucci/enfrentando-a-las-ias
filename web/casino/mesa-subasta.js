// La mesa de casino de Subasta de tiempo (navegador): dibuja y anima los beats de linea-de-tiempo-subasta.js con una consola (el contador grande y la luz "EN VIVO") y una fila por
// jugador (cinco en 9:16 y en 16:9). Aqui no se decide nada del juego: cada beat trae lo que hay que mostrar, y el contador sale SOLO de reloj.js (funcion pura del tiempo de
// pantalla). Lo que comparten todas las mesas vive en mesa-base.js. Se verifica mirando (herramientas/capturar-escena.mjs).
//
// Lo que el publico ve y cuando: todos los botones empiezan oprimidos; el contador sube (normal al principio, acelerado en el medio y normal al final) y cada boton se suelta cuando el
// contador pasa por la apuesta de su dueno; el que aguanta mas queda azul y se lleva la ficha; todos pagan lo que apostaron y sus bancos bajan.

import { colocarSubasta } from './layout-subasta.js';
import { htmlAvatarJugador, estiloJugador, esc } from './kit.js';
import { RONDAS_TOPE, BANCO_S, textoDeFinal } from './linea-de-tiempo-subasta.js';
import { tiempoDeReloj, instanteDeCruce } from './reloj.js';
import { MesaBase, el, poner, centro } from './mesa-base.js';

const seg = (x) => (Number.isFinite(x) ? x.toFixed(1) : '0.0');

// Los metodos se llaman con verbos distintos de los campos (this.panel, this.contador... son piezas del DOM): un campo con el mismo nombre taparia al metodo.
export class Mesa extends MesaBase {
  static METODOS = { apertura: 'nuevaSubasta', reloj: 'correrReloj', apuestas: 'mostrarApuestas', resultado: 'resolver', final: 'terminar' };

  constructor(formato, partida, opciones) {
    super(formato, partida, opciones, colocarSubasta(formato));
    this.armar();
  }

  armar() {
    const { L } = this;
    this.armarBase('Subasta de tiempo');
    this.raiz.classList.add('mesa-consola');
    this.consola = el('fijo consola-sub'); poner(this.consola, L.consola.marco);
    this.rotulo = el('fijo rotulo-sub', 'Tiempo apostado'); poner(this.rotulo, L.consola.rotulo);
    this.luz = el('fijo luz-sub', 'En espera'); poner(this.luz, L.consola.luz);
    this.contador = el('fijo contador-sub', '0.0'); poner(this.contador, L.consola.contador);
    this.filas = L.filas.map((f, s) => {
      const estilo = `;${estiloJugador(this.partida.jugadores[s])}`;
      const caja = el('fijo fila-sol'); poner(caja, f.fila); caja.style.cssText += estilo;
      const avatar = el('fijo avatar-sub', htmlAvatarJugador(this.partida.jugadores[s])); poner(avatar, f.avatar);
      const nombre = el('fijo nombre-sub'); nombre.textContent = this.nombre(s); poner(nombre, f.nombre); nombre.style.cssText += estilo;
      const estado = el('fijo estado-sub'); poner(estado, f.estado);
      const boton = el('fijo boton-sub oprimido', '<i></i>'); poner(boton, f.boton);
      const banco = el('fijo banco-sub'); poner(banco, f.banco);
      const barra = el('fijo barra-banco', '<i></i>'); poner(barra, f.barra); barra.style.cssText += estilo;
      const fichas = el('fijo fichas-sub'); poner(fichas, f.fichas);
      return { caja, avatar, nombre, estado, boton, banco, barra, fichas, st: { banco: BANCO_S, fichas: 0, ganadora: false } };
    });
    this.tira = el('fijo tira-sub', Array.from({ length: RONDAS_TOPE }, (_, k) => `<span class="cas">${k + 1}</span>`).join('')); poner(this.tira, L.tira);
    this.tira.style.setProperty('--cas', `${L.casillaTira.lado}px`); this.tira.style.setProperty('--hueco', `${L.casillaTira.hueco}px`);
    this.sello = el('sello');
    this.panel = el('fijo panel-sol'); poner(this.panel, L.panel);
    this.raiz.append(this.cabecera, this.etiqueta, this.consola, this.rotulo, this.luz, this.contador, ...this.filas.flatMap((f) => [f.caja, f.avatar, f.nombre, f.estado, f.boton, f.banco, f.barra, f.fichas]), this.tira, this.sello, this.panel, this.subtitulos, this.capa);
    this.filas.forEach((_, s) => { this.pintarFila(s); this.ajustarNombre(s); });
  }

  // ---- ayudas ----
  // Un nombre largo se achica hasta caber antes de caer en la elipsis (igual que en Solitario); sin pagina todavia no hay medidas y no hace nada.
  ajustarNombre(s) {
    const nom = this.filas[s].nombre;
    let tam = parseFloat(getComputedStyle(nom).fontSize);
    const hueco = nom.getBoundingClientRect().width;
    nom.style.width = 'max-content'; nom.style.maxWidth = 'none';
    const ancho = () => nom.getBoundingClientRect().width;
    while (ancho() > hueco + 0.25 && tam > 22 && hueco > 0) { tam -= 2; nom.style.fontSize = `${tam}px`; }
    nom.style.width = ''; nom.style.maxWidth = '';
  }
  pintarFila(s) {
    const f = this.filas[s], { st } = f;
    f.banco.innerHTML = `<span class="rot">Banco</span><span>${seg(st.banco)} s</span>`;
    f.barra.firstElementChild.style.width = `${Math.max(0, Math.min(100, (100 * st.banco) / BANCO_S))}%`;
    f.fichas.innerHTML = `${st.fichas} ${st.fichas === 1 ? 'ficha' : 'fichas'} ${'<span class="vic">●</span>'.repeat(Math.min(5, st.fichas))}${st.fichas > 5 ? ` +${st.fichas - 5}` : ''}`;
    f.caja.classList.toggle('ganadora', st.ganadora);
  }
  decir(s, texto, clase = '') { const e = this.filas[s].estado; e.className = `fijo estado-sub ${clase}`; e.textContent = texto; }
  pintarTira(ganadas) {
    this.tira.querySelectorAll('.cas').forEach((c, k) => {
      const g = ganadas[k];
      c.className = `cas${g === null || g === undefined ? '' : g === -1 ? ' anulada' : ' ganada'}`;
      if (Number.isInteger(g) && g >= 0) c.style.cssText = estiloJugador(this.partida.jugadores[g]); else c.style.cssText = '';
    });
  }
  aplicarEstado(e) {
    this.filas.forEach((f, s) => { Object.assign(f.st, { banco: e.bancos[s], fichas: e.fichas[s] }); this.pintarFila(s); });
    this.pintarTira(e.ganadas);
  }
  // Quita todo lo de la subasta anterior: botones, sello, estados, brillo del ganador, contador y el panel del final.
  limpiar() {
    for (const f of this.filas) { f.caja.classList.remove('reemplazo'); f.st.ganadora = false; f.caja.getAnimations().forEach((x) => x.cancel()); }
    for (const nodo of [this.sello, this.panel]) { nodo.getAnimations().forEach((x) => x.cancel()); nodo.style.opacity = 0; }
    this.raiz.classList.remove('con-panel');
    this.contador.textContent = '0.0';
    this.luz.textContent = 'En espera'; this.luz.classList.remove('vivo');
  }
  oprimir(asientos) {
    this.filas.forEach((f, s) => {
      const participa = asientos.includes(s);
      f.boton.className = `fijo boton-sub ${participa ? 'oprimido' : 'fuera'}`;
      this.decir(s, participa ? 'Oprimido' : 'Sin tiempo');
    });
  }
  mostrarEstadoInicial(beat) {
    this.limpiar();
    const e = beat.pasos.find((p) => p.tipo === 'estado'), o = beat.pasos.find((p) => p.tipo === 'oprimir');
    if (e) this.aplicarEstado(e);
    if (o) this.oprimir(o.asientos);
    this.cabecera.querySelector('.mano').textContent = `Subasta ${beat.mano} / ${RONDAS_TOPE}`;
  }
  fijarEstado(e) { this.aplicarEstado(e); }

  // Lo que la escena informa de si misma (para la herramienta de capturas): que no quede nada de la subasta anterior.
  estadoVisible() {
    return {
      botones: this.raiz.querySelectorAll('.boton-sub.suelto, .boton-sub.gana').length,
      sellos: Number(getComputedStyle(this.sello).opacity) > 0.01 ? 1 : 0,
      premio: this.raiz.querySelectorAll('.fila-sol.ganadora').length,
      contador: Number(this.contador.textContent) || 0,
      panel: Number(getComputedStyle(this.panel).opacity),
    };
  }

  // ---- los beats ----
  async nuevaSubasta(beat) {
    this.mostrarEstadoInicial(beat);
    this.sonar(beat.pasos.find((p) => p.tipo === 'oprimir'));
    await this.esperar(400);
  }

  async correrReloj(beat, ms) {
    const c = beat.pasos.find((p) => p.tipo === 'correr');
    for (const p of beat.pasos.filter((x) => x.tipo === 'retirar')) {
      const f = this.filas[p.asiento];
      if (p.motivo !== 'sin tiempo') f.boton.className = 'fijo boton-sub suelto'; // un retirado suelta de entrada; quien no tiene banco ya estaba apagado
      if (p.motivo === 'ilegible') f.caja.classList.add('reemplazo');
      this.decir(p.asiento, p.motivo === 'ilegible' ? 'No respondió bien: se retira' : p.motivo === 'sin tiempo' ? 'Sin tiempo' : 'Se retira', p.motivo === 'ilegible' ? 'mal' : '');
    }
    if (!c.orden.length) { await this.esperar(ms); return; }
    const max = c.max, D = c.duracionS;
    const empate = c.orden.filter((o) => o.apuesta === max).length > 1;
    // los que se sueltan: todos los de apuesta menor a su tiempo; si hay empate en lo mas alto, esos tambien (a la vez, al final); el unico que aguanta mas se queda oprimido
    const sueltan = c.orden.filter((o) => o.apuesta < max || empate).map((o) => ({ ...o, t: o.apuesta < max ? instanteDeCruce(o.apuesta, max) : D })).sort((a, b) => a.t - b.t);
    const soltar = (o) => { const f = this.filas[o.asiento]; f.boton.className = 'fijo boton-sub suelto'; this.decir(o.asiento, `Soltó a los ${seg(o.apuesta)} s`, o.apuesta === max ? 'mal' : ''); };
    for (const o of c.orden) this.decir(o.asiento, o.todo ? 'Aguanta… ¡todo su banco!' : 'Aguanta…');
    this.luz.textContent = 'En vivo'; this.luz.classList.add('vivo');
    if (this.rapido) {
      this.contador.textContent = seg(max);
      for (const o of sueltan) soltar(o);
      this.luz.classList.remove('vivo'); this.luz.textContent = 'Fin';
      return;
    }
    await new Promise((fin) => {
      const t0 = performance.now();
      let ultimoTic = -1, ultimoMs = -1e9;
      const paso = () => {
        const ahora = performance.now();
        const t = Math.min(((ahora - t0) / 1000) * this.vel, D); // segundos de PANTALLA: el contador es una funcion pura de este numero
        const marca = tiempoDeReloj(t, max);
        this.contador.textContent = seg(marca);
        let solto = false;
        while (sueltan.length && sueltan[0].t <= t) { soltar(sueltan.shift()); solto = true; }
        if (solto) this.sfx.tic(); // dos botones que se sueltan a la vez suenan un solo clic
        else if (Math.floor(marca) !== ultimoTic && ahora - ultimoMs >= 110) { this.sfx.tic(); ultimoTic = Math.floor(marca); ultimoMs = ahora; }
        if (t >= D) { this.contador.textContent = seg(max); fin(); return; }
        setTimeout(paso, 16);
      };
      paso();
    });
    this.luz.classList.remove('vivo'); this.luz.textContent = 'Fin';
  }

  async mostrarApuestas(beat, ms) { await this.esperar(ms); } // solo cambian los subtitulos: la mesa se queda como esta

  async resolver(beat, ms) {
    const marcar = (texto, clase) => {
      const c = centro(this.L.consola.sello); // su sitio lo da el diseno: no tapa el numero del contador ni la tira
      this.sello.textContent = texto; this.sello.className = `sello sello-sub ${clase}`;
      Object.assign(this.sello.style, { left: `${c.x}px`, top: `${c.y}px` });
      const base = 'translate(-50%, -50%) rotate(-4deg)';
      this.anim(this.sello, [{ opacity: 0, transform: `${base} scale(2.2)` }, { opacity: 1, transform: `${base} scale(1)` }], { duration: 320, fill: 'forwards', easing: 'cubic-bezier(.2,1.2,.4,1)' });
    };
    for (const p of beat.pasos) {
      if (p.tipo === 'ganar') {
        this.sonar(p);
        const f = this.filas[p.asiento];
        f.boton.className = 'fijo boton-sub gana'; f.st.ganadora = true; this.pintarFila(p.asiento);
        this.decir(p.asiento, `Gana con ${seg(p.apuesta)} s`, 'ok');
        marcar('Gana la ficha', 'ganar');
      } else if (p.tipo === 'anular') {
        this.sonar(p);
        for (const s of p.asientos) this.decir(s, 'Empate: se anula', 'mal');
        marcar('Empate · se anula', 'perder');
      } else if (p.tipo === 'nadie') {
        this.sonar(p);
        marcar('Nadie apuesta', 'neutro');
      } else if (p.tipo === 'ficha') {
        this.sonar(p);
      } else if (p.tipo === 'pagar') {
        this.sonar(p);
        this.filas.forEach((f, s) => { f.st.banco = p.bancos[s]; this.pintarFila(s); });
      } else if (p.tipo === 'estado') {
        this.programar(500, () => this.aplicarEstado(p));
      }
    }
    await this.esperar(Math.min(ms * 0.5, 1200));
  }

  mostrarPanel() { this.raiz.classList.add('con-panel'); this.anim(this.panel, [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 420, fill: 'forwards', easing: 'cubic-bezier(.2,1.2,.4,1)' }); }

  terminar(beat) {
    const f = beat.pasos[0]?.final;
    this.cabecera.querySelector('.mano').textContent = 'Final';
    if (!f) return;
    const texto = textoDeFinal(f, (s) => this.nombre(s));
    const orden = Array.isArray(f.ranking) ? f.ranking : [];
    this.panel.innerHTML = `<div class="titulo">Final</div><div class="grande">${esc(texto.grande)}</div><div class="detalle">${esc(texto.detalle)}</div>`
      + `<div class="tabla">${orden.map((x) => `<div class="linea${x.s === f.pieza ? ' primero' : ''}"><span>${esc(this.nombre(x.s))}</span><span>${esc(x.fichas)} fichas · ${esc(seg(x.banco))} s</span></div>`).join('')}</div>`;
    this.mostrarPanel();
    if (Number.isInteger(f.pieza)) { this.filas[f.pieza].st.ganadora = true; this.pintarFila(f.pieza); }
  }
}
