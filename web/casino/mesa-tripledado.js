// La mesa de casino de Triple dado (navegador): dibuja y anima los beats de linea-de-tiempo-tripledado.js con una fila por jugador (cuatro filas en 9:16, cuatro columnas en 16:9).
// Aqui no se decide ni se sortea nada del juego: cada beat trae lo que hay que mostrar y los dados llegan con su cara FIJADA (dados.js solo calcula el camino). Lo que comparten
// todas las mesas vive en mesa-base.js. Se verifica mirando (herramientas/capturar-escena.mjs).
//
// Lo que el publico ve y cuando: cada jugador deja su tarjeta boca abajo (solo la camara muestra la de 2); los nueve dados blancos de cada uno ruedan hasta su bandeja; en cada
// enfrentamiento suben tres dados a la fila grande (los rojo y azul se abren al entrar, no antes) y se nombra la combinacion; al cierre se voltean las tarjetas y los dados ocultos
// que no se usaron, y se premia a quien acerto.

import { colocarTripleDado } from './layout-tripledado.js';
import { htmlDado, htmlInfoPuntos, estiloJugador, esc } from './kit.js';
import { RONDAS_TOPE, bannerDe, puntosTexto, textoDeFinal } from './linea-de-tiempo-tripledado.js';
import { trayectoria } from './dados.js';
import { MesaBase, el, poner, centro } from './mesa-base.js';

const TARJETAS = ['ZERO', 'MIN', 'MORE', 'MAX'];
const COLOR_DE = (id) => (id === 'rojo' ? 'rojo' : id === 'azul' ? 'azul' : 'blanco');
const HUECO_BANDEJA = 3; // px entre dados de la bandeja (el mismo gap de .bandeja en mesa.css)
const posicionEnBandeja = (id) => (id === 'rojo' ? 9 : id === 'azul' ? 10 : Number(String(id).slice(1)) - 1);

// Los metodos se llaman con verbos distintos de los campos (this.panel, this.banner... son piezas del DOM): un campo con el mismo nombre taparia al metodo.
export class Mesa extends MesaBase {
  static METODOS = { apertura: 'nuevaRonda', prediccion: 'dejarTarjetas', lanzamiento: 'lanzarDados', enfrentamiento: 'jugarEnfrentamiento', cierre: 'cerrarRonda', final: 'terminar' };

  constructor(formato, partida, opciones) {
    super(formato, partida, opciones, colocarTripleDado(formato));
    this.armar();
  }

  armar() {
    const { L } = this;
    this.armarBase('Triple dado');
    this.raiz.classList.add('mesa-azul'); // el verde es de las cartas: los dados van sobre azul
    this.banner = el('fijo banner-sol'); poner(this.banner, L.banner);
    this.filas = L.filas.map((f, s) => {
      const estilo = `;${estiloJugador(this.partida.jugadores[s])}`;
      const caja = el('fijo fila-sol'); poner(caja, f.fila); caja.style.cssText += estilo;
      const info = el('fijo caja-info info-td'); poner(info, f.placa);
      const tarjetas = el('fijo tarjetas-td'); poner(tarjetas, f.tarjetas);
      const bandeja = el('fijo bandeja bandeja-td'); poner(bandeja, f.bandeja); bandeja.style.setProperty('--lado-bandeja', `${L.bandejaLado}px`);
      const dados = f.dados.map((r) => { const x = el('fijo ranura-dado'); poner(x, r); x.style.setProperty('--lado-grande', `${L.dado.lado}px`); return x; });
      const combinacion = el('fijo etq-comb'); poner(combinacion, f.combinacion);
      const puntos = el('fijo pts-comb'); poner(puntos, f.puntos);
      const barra = el('fijo barra-ronda', '<i></i>'); poner(barra, f.barra); barra.style.cssText += estilo;
      return { caja, info, tarjetas, bandeja, dados, combinacion, puntos, barra, st: { puntosD: 0, usadas: [], ganadora: false, reemplazo: false } };
    });
    this.panel = el('fijo panel-sol'); poner(this.panel, L.panel);
    this.raiz.append(this.cabecera, this.etiqueta, this.banner, ...this.filas.flatMap((f) => [f.caja, f.info, f.tarjetas, f.bandeja, ...f.dados, f.combinacion, f.puntos, f.barra]), this.panel, this.subtitulos, this.capa);
    this.filas.forEach((_, s) => { this.pintarFila(s); this.pintarTarjetas(s); });
  }

  // ---- ayudas ----
  pintarFila(s) {
    const f = this.filas[s], { st } = f;
    f.info.innerHTML = htmlInfoPuntos(this.partida.jugadores[s], puntosTexto(st.puntosD));
    // un nombre largo se achica hasta caber antes de caer en la elipsis (igual que en Solitario); sin pagina todavia no hay medidas y no hace nada
    const nom = f.info.querySelector('.nom');
    let tam = parseFloat(getComputedStyle(nom).fontSize);
    const hueco = nom.parentElement.getBoundingClientRect().width;
    nom.style.width = 'max-content';
    while (nom.getBoundingClientRect().width > hueco + 0.25 && tam > 22) { tam -= 2; nom.style.fontSize = `${tam}px`; }
    nom.style.width = '';
    f.caja.classList.toggle('ganadora', st.ganadora);
    f.caja.classList.toggle('reemplazo', st.reemplazo);
  }
  // Las cuatro tarjetas de un jugador: las ya gastadas tachadas; la elegida en dorado (solo cuando se sabe); una tarjeta boca abajo mientras nadie la ve.
  pintarTarjetas(s, { elegida = null, oculta = null, sello = null, camara = false } = {}) {
    const f = this.filas[s];
    const chips = TARJETAS.map((t) => `<span class="tj${f.st.usadas.includes(t) ? ' usada' : ''}${t === elegida ? ' elegida' : ''}">${t}${t === elegida && sello ? `<span class="sello-tj ${sello === 'acierta' ? 'acierta' : 'falla'}">${sello === 'acierta' ? 'Acierta' : 'No acierta'}</span>` : ''}</span>`).join('');
    f.tarjetas.innerHTML = `${chips}${oculta ? `<span class="tj oculta">${esc(oculta)}</span>` : ''}${camara ? '<span class="pastilla-camara">Cámara</span>' : ''}`;
  }
  // Puntos y tarjetas gastadas de cada jugador. Las casillas de tarjetas no se repintan aqui (al cierre conservan el sello de la ronda hasta que empieza la siguiente).
  aplicarEstado(e) {
    this.filas.forEach((f, s) => { Object.assign(f.st, { puntosD: e.puntosD[s], usadas: [...e.tarjetasUsadas[s]] }); this.pintarFila(s); });
  }
  ponerBanner(beat) {
    const b = bannerDe(beat);
    this.banner.innerHTML = `<b>${esc(b.fase)}</b>`;
  }
  // Quita todo lo de la ronda anterior: dados, bandejas, etiquetas, tarjetas boca abajo, sellos, brillo de premio y el panel.
  limpiarRonda() {
    for (const f of this.filas) {
      f.dados.forEach((d) => { d.innerHTML = ''; d.getAnimations().forEach((x) => x.cancel()); });
      f.bandeja.innerHTML = '';
      f.combinacion.textContent = ''; f.puntos.textContent = '';
      f.barra.firstElementChild.style.width = '0';
      f.caja.getAnimations().forEach((x) => x.cancel());
      Object.assign(f.st, { ganadora: false, reemplazo: false });
    }
    this.raiz.querySelectorAll('.pastilla-camara').forEach((x) => x.remove());
    this.panel.getAnimations().forEach((x) => x.cancel());
    this.panel.style.opacity = 0;
    this.raiz.classList.remove('con-panel');
  }
  mostrarEstadoInicial(beat) {
    this.limpiarRonda();
    const e = beat.pasos.find((p) => p.tipo === 'estado');
    if (e) { this.filas.forEach((f, s) => { Object.assign(f.st, { puntosD: e.puntosD[s], usadas: [...e.tarjetasUsadas[s]] }); this.pintarFila(s); this.pintarTarjetas(s); }); }
    this.cabecera.querySelector('.mano').textContent = `Ronda ${beat.mano} / ${RONDAS_TOPE}`;
    this.ponerBanner(beat);
  }
  fijarEstado(e) { this.aplicarEstado(e); this.filas.forEach((_, s) => this.pintarTarjetas(s)); }

  // Lo que la escena informa de si misma (para la herramienta de capturas): que no quede nada de la ronda anterior.
  estadoVisible() {
    return {
      cartas: this.raiz.querySelectorAll('.tj.oculta, .sello-tj').length,
      dados: this.raiz.querySelectorAll('.ranura-dado .dado, .bandeja-td .dado').length,
      etiquetas: [...this.raiz.querySelectorAll('.etq-comb, .pts-comb')].filter((x) => x.textContent !== '').length,
      pastillas: this.raiz.querySelectorAll('.pastilla-camara').length,
      premio: this.raiz.querySelectorAll('.fila-sol.ganadora').length,
      panel: Number(getComputedStyle(this.panel).opacity),
    };
  }

  // Centro de la casilla `i` de la bandeja de la fila `s` (en pixeles del lienzo): para saber de donde sale y adonde llega un dado.
  centroEnBandeja(s, i) {
    const b = this.L.filas[s].bandeja, lado = this.L.bandejaLado;
    return { x: b.x + i * (lado + HUECO_BANDEJA) + lado / 2, y: b.y + lado / 2 };
  }

  // ---- los beats ----
  async ejecutar(beat, ms) {
    this.ponerBanner(beat);
    return super.ejecutar(beat, ms);
  }

  async nuevaRonda(beat) {
    this.raiz.querySelectorAll('.ranura-dado .dado, .bandeja-td .dado').forEach((d) => this.anim(d, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }));
    await this.esperar(320);
    this.mostrarEstadoInicial(beat); // cancela lo que quedaba (las animaciones con fill:'forwards' le ganan a un estilo en linea) y pone el estado de la ronda
  }

  async dejarTarjetas(beat) {
    for (const p of beat.pasos.filter((x) => x.tipo === 'elegir')) {
      const f = this.filas[p.asiento];
      f.st.reemplazo = f.st.reemplazo || p.reemplazada;
      this.pintarFila(p.asiento);
      const marca = p.reemplazada ? 'El juego elige' : p.forzada ? 'Se pone sola' : 'Tarjeta ?';
      this.pintarTarjetas(p.asiento, p.tarjeta !== null ? { elegida: p.tarjeta, camara: true } : { oculta: marca });
      if (p.tarjeta !== null) f.tarjetas.querySelector('.elegida')?.classList.add('camara');
    }
    this.sonar({ tipo: 'elegir' });
    await this.esperar(800);
  }

  async lanzarDados(beat, ms) {
    const lanzar = beat.pasos.find((x) => x.tipo === 'lanzar');
    this.sonar(lanzar);
    const origen = { x: this.L.ancho / 2, y: this.L.alto / 2 };
    const duracion = Math.min(ms * 0.6, 1500);
    this.filas.forEach((f, s) => {
      // la bandeja se arma con los once dados: los nueve blancos ruedan hasta su casilla; el rojo y el azul esperan cerrados
      f.bandeja.innerHTML = [...Array(11)].map((_, i) => `<span class="en-bandeja" data-id="${i < 9 ? `b${i + 1}` : i === 9 ? 'rojo' : 'azul'}">${htmlDado(null, i === 9 ? 'rojo' : 'azul')}</span>`).join('');
      (lanzar.blancos[s] ?? []).forEach((cara, i) => {
        const hueco = f.bandeja.children[i];
        const t = trayectoria(this.partida.seed, `b${i + 1}:${s}`, cara, { ancho: 300, alto: 200 });
        const centroDestino = this.centroEnBandeja(s, i);
        const dx = origen.x - centroDestino.x, dy = origen.y - centroDestino.y;
        const demora = s * 90 + i * 25;
        // rebote (escala) y giro salen de la trayectoria; el recorrido hasta la casilla frena al llegar, como el de dados.js
        const cuadros = t.cuadros.map((c) => {
          const p = 1 - (1 - c.t) ** 3;
          return { transform: `translate(${(1 - p) * dx}px, ${(1 - p) * dy}px) rotate(${c.giro}deg) scale(${c.escala * (1 + 0.6 * (1 - p))})`, offset: c.t };
        });
        hueco.innerHTML = htmlDado(t.cuadros[0].cara);
        // mientras rueda muestra caras distintas (las de la trayectoria) y la animacion mueve la casilla entera
        t.cuadros.forEach((c, k) => { if (k > 0 && c.cara !== t.cuadros[k - 1].cara) this.programar(demora + duracion * c.t, () => { hueco.innerHTML = htmlDado(c.cara); }); });
        this.anim(hueco, cuadros, { duration: duracion, delay: demora, fill: 'both', easing: 'linear' });
        this.programar(demora + duracion, () => { hueco.innerHTML = htmlDado(cara); });
      });
    });
    await this.esperar(duracion + 600);
  }

  async jugarEnfrentamiento(beat, ms) {
    // lo del enfrentamiento anterior se va (las barras de la ronda se quedan)
    this.filas.forEach((f) => { f.dados.forEach((d) => { d.innerHTML = ''; }); f.combinacion.textContent = ''; f.puntos.textContent = ''; });
    this.filas.forEach((f) => f.bandeja.querySelectorAll('.en-bandeja.reciente').forEach((x) => x.classList.remove('reciente')));
    let retraso = 0;
    for (const p of beat.pasos.filter((x) => x.tipo === 'subir')) {
      const f = this.filas[p.asiento];
      f.st.reemplazo = f.st.reemplazo || p.reemplazada;
      this.pintarFila(p.asiento);
      p.dados.forEach((id, i) => {
        const hueco = f.bandeja.children[posicionEnBandeja(id)];
        const destino = centro(this.L.filas[p.asiento].dados[i]);
        const desde = this.centroEnBandeja(p.asiento, posicionEnBandeja(id));
        const dado = el('', htmlDado(p.valores[i], COLOR_DE(id))).firstElementChild; // abierto: aqui es donde el publico conoce un dado rojo o azul
        dado.classList.add('combo');
        f.dados[i].append(dado);
        this.programar(retraso, () => this.anim(dado, [{ transform: `translate(${desde.x - destino.x}px, ${desde.y - destino.y}px) scale(${this.L.bandejaLado / this.L.dado.lado})`, opacity: 0.4 }, { opacity: 1, offset: 0.2 }, { transform: 'none', opacity: 1 }], { duration: 560, fill: 'both', easing: 'cubic-bezier(.2,.9,.3,1)' }));
        hueco?.classList.add('usado', 'reciente');
        retraso += 40;
      });
      retraso += 60;
    }
    this.sonar({ tipo: 'subir' });
    await this.esperar(Math.min(ms * 0.3, 900));
    for (const p of beat.pasos.filter((x) => x.tipo === 'combinar')) {
      const f = this.filas[p.asiento];
      f.combinacion.textContent = p.categoria;
      f.puntos.textContent = `+${puntosTexto(p.puntosD)}`;
    }
    const barra = beat.pasos.find((x) => x.tipo === 'barra');
    barra?.puntosRondaD.forEach((d, s) => { this.filas[s].barra.firstElementChild.style.width = `${Math.min(100, (100 * d) / (18 * 12))}%`; });
    await this.esperar(Math.min(ms * 0.3, 900));
  }

  async cerrarRonda(beat, ms) {
    const v = beat.pasos.find((x) => x.tipo === 'voltear');
    this.sonar(v);
    this.raiz.querySelectorAll('.pastilla-camara').forEach((x) => x.remove());
    this.filas.forEach((f, s) => {
      this.pintarTarjetas(s, { elegida: v.tarjetas[s], sello: v.aciertos[s] ? 'acierta' : 'falla' });
      for (const d of v.sinUsar[s] ?? []) { // los dados ocultos que no se usaron se voltean ahora
        const hueco = f.bandeja.children[posicionEnBandeja(d.color)];
        if (hueco) { hueco.innerHTML = htmlDado(d.valor, d.color); hueco.classList.add('sin-usar'); }
      }
    });
    await this.esperar(Math.min(ms * 0.3, 1200));
    for (const p of beat.pasos.filter((x) => x.tipo === 'premio')) {
      this.sonar(p);
      const f = this.filas[p.asiento];
      f.st.ganadora = true;
      this.pintarFila(p.asiento);
      f.combinacion.textContent = p.tarjeta;
      f.puntos.textContent = `+${puntosTexto(p.puntosD)}`;
    }
    const e = beat.pasos.find((x) => x.tipo === 'estado');
    this.programar(900, () => { if (e) this.aplicarEstado(e); });
    await this.esperar(Math.min(ms * 0.4, 1600));
  }

  mostrarPanel() { this.raiz.classList.add('con-panel'); this.anim(this.panel, [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 420, fill: 'forwards', easing: 'cubic-bezier(.2,1.2,.4,1)' }); }

  terminar(beat) {
    const f = beat.pasos[0]?.final;
    this.cabecera.querySelector('.mano').textContent = 'Final';
    if (!f) return;
    const texto = textoDeFinal(f, (s) => this.nombre(s));
    const orden = Array.isArray(f.ranking) ? f.ranking : [0, 1, 2, 3];
    this.panel.innerHTML = `<div class="titulo">Final</div><div class="grande">${esc(texto.grande)}</div><div class="detalle">${esc(texto.detalle)}</div>`
      + `<div class="tabla">${orden.map((s, i) => `<div class="linea${s === f.pieza ? ' primero' : ''}"><span>${esc(this.nombre(s))}</span><span>${esc(puntosTexto(this.filas[s].st.puntosD))} pts</span></div>`).join('')}</div>`;
    this.mostrarPanel();
    if (Number.isInteger(f.pieza)) { this.filas[f.pieza].st.ganadora = true; this.pintarFila(f.pieza); }
  }
}
