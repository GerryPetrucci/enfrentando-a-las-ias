// La mesa de casino de El numero solitario (navegador): dibuja y anima los beats de linea-de-tiempo-solitario.js con una fila por jugador (cinco filas en 9:16, cinco columnas en 16:9). Aqui no
// se decide nada del juego: cada beat trae lo que hay que mostrar. Lo que comparten todas las mesas vive en mesa-base.js. Se verifica mirando (herramientas/capturar-escena.mjs).
//
// Lo que el publico ve y cuando: las cartas llegan boca abajo a cada fila y se voltean TODAS JUNTAS (las parejas se eligen en secreto); cada quien marca cual de sus dos juega (en secreto: solo la
// camara le ve la marca a 2 de los que juegan); se revelan todas las marcas, las que chocan se tachan "Anulada", gana el numero mas bajo que quedo solo (puntos y ficha de victoria) y, en las
// rondas 3 y 6, un panel anuncia quien queda a salvo. Quien ya esta a salvo queda atenuado en su fila.

import { colocarSolitario } from './layout-solitario.js';
import { htmlCartaNumero, htmlFrenteNumero, htmlInfoFila, estiloJugador, esc } from './kit.js';
import { RONDAS_TOPE, bannerDe, textoDeFinal } from './linea-de-tiempo-solitario.js';
import { MesaBase, el, poner, centro } from './mesa-base.js';

const CRITERIOS = { puntos: 'puntos', fichas: 'fichas', 'ultima victoria': 'última victoria', sorteo: 'sorteo' };

const carta = (n = null) => Object.assign(document.createElement('div'), { innerHTML: htmlCartaNumero(n) }).firstElementChild;

// Los metodos se llaman con verbos distintos de los campos (this.panel, this.banner... son piezas del DOM): un campo con el mismo nombre taparia al metodo.
export class Mesa extends MesaBase {
  static METODOS = { apertura: 'nuevaRonda', parejas: 'repartirParejas', marcas: 'eligenMarcas', revelado: 'revelarMarcas', resultado: 'darResultado', corte: 'anunciarCorte', final: 'terminar' };

  constructor(formato, partida, opciones) {
    super(formato, partida, opciones, colocarSolitario(formato));
    this.armar();
  }

  armar() {
    const { L } = this;
    this.armarBase('El número solitario');
    this.banner = el('fijo banner-sol'); poner(this.banner, L.banner);
    this.filas = L.filas.map((f, s) => {
      const caja = el('fijo fila-sol'); poner(caja, f.fila);
      caja.style.cssText += `;${estiloJugador(this.partida.jugadores[s])}`;
      const info = el('fijo caja-info'); poner(info, f.placa);
      const ranuras = f.cartas.map((r) => { const x = el('fijo ranura'); poner(x, r); x.style.setProperty('--cw', `${L.carta.ancho}px`); return x; });
      const estado = el('fijo estado-sol espera'); poner(estado, f.estado);
      return { caja, info, ranuras, estado, st: { puntos: 0, fichas: 0, jugando: true, salvo: 0, reemplazo: false, ganadora: false, pareja: null } };
    });
    this.panel = el('fijo panel-sol'); poner(this.panel, L.panel);
    this.raiz.append(this.cabecera, this.etiqueta, this.banner, ...this.filas.flatMap((f) => [f.caja, f.info, ...f.ranuras, f.estado]), this.panel, this.subtitulos, this.capa);
    this.filas.forEach((_, s) => this.pintarFila(s));
  }

  // ---- ayudas ----
  pintarFila(s) {
    const f = this.filas[s], { st } = f;
    f.info.innerHTML = htmlInfoFila(this.partida.jugadores[s], st.puntos, st.fichas);
    // un nombre largo ("Gemini Flash-Lite") se achica hasta caber antes de caer en la elipsis (igual que los subtitulos); sin pagina todavia (Node, mesa sin montar) no hay medidas y no hace nada
    const nom = f.info.querySelector('.nom');
    let tam = parseFloat(getComputedStyle(nom).fontSize);
    const hueco = nom.parentElement.getBoundingClientRect().width;
    nom.style.width = 'max-content'; // el ancho real del texto (scrollWidth redondea y deja pasar medio pixel de mas, que ya cae en la elipsis)
    while (nom.getBoundingClientRect().width > hueco + 0.25 && tam > 22) { tam -= 2; nom.style.fontSize = `${tam}px`; }
    nom.style.width = '';
    f.caja.classList.toggle('fuera', !st.jugando);
    f.info.classList.toggle('fuera', !st.jugando);
    f.ranuras.forEach((r) => r.classList.toggle('fuera', !st.jugando));
    f.caja.classList.toggle('reemplazo', st.reemplazo);
    f.caja.classList.toggle('ganadora', st.ganadora);
  }
  // El estado de la derecha de la fila (o al pie de la columna): un titulo y, debajo, un detalle chico. clase: espera | ok | mal.
  decir(s, titulo, detalle = '', clase = 'espera') {
    const e = this.filas[s].estado;
    e.className = `fijo estado-sol ${clase}${this.filas[s].st.jugando ? '' : ' fuera'}`;
    e.innerHTML = `${esc(titulo)}${detalle ? `<small>${esc(detalle)}</small>` : ''}`;
  }
  decirFuera(s) {
    const { st } = this.filas[s];
    if (st.salvo) this.decir(s, 'A salvo', `Corte ${st.salvo}`, 'ok');
  }
  aplicarEstado(e) {
    this.filas.forEach((f, s) => {
      Object.assign(f.st, { puntos: e.puntos[s], fichas: e.fichas[s], jugando: e.jugando[s], salvo: e.salvos[s] });
      this.pintarFila(s);
      if (!f.st.jugando) this.decirFuera(s);
    });
  }
  ponerBanner(beat) {
    const b = bannerDe(beat);
    this.banner.innerHTML = `Ciclo ${b.ciclo} · <b>${esc(b.fase)}</b>${b.corte ? ` · ${esc(b.corte)}` : ''}`;
  }
  // Quita todo lo de la ronda anterior: cartas, sellos, etiquetas de camara, brillo del ganador y el panel del corte o del final.
  limpiarRonda() {
    for (const f of this.filas) {
      f.ranuras.forEach((r) => { r.innerHTML = ''; });
      f.caja.getAnimations().forEach((x) => x.cancel());
      Object.assign(f.st, { reemplazo: false, ganadora: false, pareja: null });
    }
    this.raiz.querySelectorAll('.pastilla-camara').forEach((x) => x.remove());
    this.panel.getAnimations().forEach((x) => x.cancel());
    this.panel.style.opacity = 0;
    this.raiz.classList.remove('con-panel');
  }
  mostrarEstadoInicial(beat) {
    this.limpiarRonda();
    const e = beat.pasos.find((p) => p.tipo === 'estado');
    if (e) this.aplicarEstado(e);
    this.filas.forEach((f, s) => { if (f.st.jugando) this.decir(s, 'Elige pareja', 'En secreto', 'espera'); });
    this.cabecera.querySelector('.mano').textContent = `Ronda ${beat.mano} / ${RONDAS_TOPE}`;
    this.ponerBanner(beat);
  }
  fijarEstado(e) { this.aplicarEstado(e); }

  // Lo que la escena informa de si misma (para la herramienta de capturas): que no quede nada de la ronda anterior.
  estadoVisible() {
    return {
      cartas: this.raiz.querySelectorAll('.ranura .carta').length,
      sellos: this.raiz.querySelectorAll('.pill-carta').length,
      premio: this.raiz.querySelectorAll('.fila-sol.ganadora').length,
      pastillas: this.raiz.querySelectorAll('.pastilla-camara').length,
      panel: Number(getComputedStyle(this.panel).opacity),
    };
  }

  // La marca de un jugador: "Juega" sobre la carta que juega y la otra atenuada. Idempotente (la camara la pone antes; el revelado la confirma).
  senalarMarca(s, numero) {
    const f = this.filas[s];
    const k = Math.max(0, (f.st.pareja ?? []).indexOf(numero));
    const juega = f.ranuras[k], otra = f.ranuras[1 - k];
    if (!juega.querySelector('.pill-carta')) juega.append(el('pill-carta', 'Juega'));
    otra.querySelector('.carta')?.classList.add('fade');
    return juega;
  }

  // ---- los beats ----
  async ejecutar(beat, ms) {
    this.ponerBanner(beat);
    return super.ejecutar(beat, ms);
  }

  async nuevaRonda(beat) {
    this.raiz.querySelectorAll('.ranura .carta').forEach((c) => this.anim(c, [{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }));
    await this.esperar(320);
    this.mostrarEstadoInicial(beat); // cancela lo que quedaba (las animaciones con fill:'forwards' le ganan a un estilo en linea) y pone el estado de la ronda
  }

  async repartirParejas(beat, ms) {
    const jugar = beat.pasos.find((p) => p.tipo === 'jugar'), rev = beat.pasos.find((p) => p.tipo === 'revelar');
    const origen = { x: this.L.ancho / 2, y: this.L.alto / 2 };
    this.sonar(jugar);
    jugar.asientos.forEach((s, i) => this.filas[s].ranuras.forEach((r, k) => {
      const c = carta(null);
      r.append(c);
      const d = centro(this.L.filas[s].cartas[k]);
      this.anim(c, [{ transform: `translate(${origen.x - d.x}px, ${origen.y - d.y}px) scale(.45)`, opacity: 0 }, { opacity: 1, offset: 0.15 }, { transform: 'none', opacity: 1 }], { duration: 480, delay: i * 110 + k * 60, fill: 'backwards', easing: 'cubic-bezier(.2,.9,.3,1)' });
    }));
    this.filas.forEach((f, s) => { if (rev.parejas[s]) this.decir(s, 'Eligió', 'Cartas boca abajo', 'espera'); });
    await this.esperar(Math.min(ms * 0.3, 1500));
    // se voltean todas juntas: ninguna pareja se adelanta
    this.sonar(rev);
    jugar.asientos.forEach((s) => {
      this.filas[s].st.pareja = rev.parejas[s];
      this.filas[s].ranuras.forEach((r, k) => this.voltear(r.firstElementChild, htmlFrenteNumero(rev.parejas[s][k])));
    });
    this.filas.forEach((f, s) => {
      if (!rev.parejas[s]) return;
      if (rev.reemplazadas[s]) { f.st.reemplazo = true; this.pintarFila(s); this.decir(s, 'Jugada del juego', 'Pareja elegida por el juego', 'mal'); }
      else this.decir(s, 'Pareja lista', '', 'espera');
    });
  }

  async eligenMarcas(beat, ms) {
    this.filas.forEach((f, s) => { if (f.st.jugando) this.decir(s, 'Eligiendo…', 'Nadie lo ve', 'espera'); });
    for (const p of beat.pasos.filter((x) => x.tipo === 'marcar')) { // la camara: el publico ve la marca de 2 jugadores antes del reveal
      this.sonar(p);
      this.senalarMarca(p.asiento, p.carta);
      const e = this.filas[p.asiento].estado;
      e.className = `fijo estado-sol ${p.reemplazada ? 'mal' : 'espera'}`;
      e.innerHTML = `<span class="pastilla-camara">Cámara</span><small>${p.reemplazada ? 'Jugada del juego' : 'Ya eligió'}</small>`;
    }
    await this.esperar(ms * 0.3);
  }

  async revelarMarcas(beat, ms) {
    const rev = beat.pasos.find((p) => p.tipo === 'revelar');
    this.sonar(rev);
    this.raiz.querySelectorAll('.pastilla-camara').forEach((x) => x.remove());
    this.filas.forEach((f, s) => {
      if (rev.marcas[s] === null || rev.marcas[s] === undefined) return;
      this.senalarMarca(s, rev.marcas[s]);
      if (rev.reemplazadas[s]) { f.st.reemplazo = true; this.pintarFila(s); this.decir(s, 'Jugada del juego', `Marca el ${rev.marcas[s]}`, 'mal'); }
      else this.decir(s, `Juega el ${rev.marcas[s]}`, '', 'espera');
    });
    await this.esperar(ms * 0.3);
    let retraso = 0;
    for (const a of beat.pasos.filter((p) => p.tipo === 'anula')) { // un tachado por numero repetido
      this.programar(retraso, () => {
        this.sonar(a);
        for (const s of a.asientos) {
          const f = this.filas[s], k = Math.max(0, (f.st.pareja ?? []).indexOf(a.numero));
          const pill = f.ranuras[k].querySelector('.pill-carta');
          pill.textContent = 'Anulada'; pill.classList.add('anulada');
          if (f.st.reemplazo) this.decir(s, 'Jugada del juego', `Se anula · jugó el ${a.numero}`, 'mal');
          else this.decir(s, 'Se anula', `Jugó el ${a.numero}`, 'mal');
        }
      });
      retraso += 550;
    }
    await this.esperar(retraso + 300);
  }

  async darResultado(beat, ms) {
    let retraso = 0;
    for (const p of beat.pasos) {
      if (p.tipo === 'premio') {
        this.programar(retraso, () => {
          this.sonar(p);
          this.filas[p.asiento].st.ganadora = true;
          this.pintarFila(p.asiento);
          this.decir(p.asiento, `Gana +${p.puntos}`, `Con el ${p.numero} · ficha de victoria`, 'ok');
        });
        retraso += 600;
      } else if (p.tipo === 'cobra') {
        this.programar(retraso, () => { this.sonar(p); this.volarFichas(centro(this.L.filas[p.asiento].estado), centro(this.L.filas[p.asiento].placa, 0.85), 1, 'juego'); });
        retraso += 500;
      } else if (p.tipo === 'blanco') {
        this.programar(retraso, () => { this.banner.innerHTML = '<b>Ronda en blanco</b> · nadie gana'; });
        retraso += 600;
      } else if (p.tipo === 'estado') {
        this.programar(retraso + 200, () => this.aplicarEstado(p));
      }
    }
    await this.esperar(Math.min(ms * 0.6, retraso + 800));
  }

  mostrarPanel() { this.raiz.classList.add('con-panel'); this.anim(this.panel, [{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 420, fill: 'forwards', easing: 'cubic-bezier(.2,1.2,.4,1)' }); }

  async anunciarCorte(beat, ms) {
    const c = beat.pasos.find((p) => p.tipo === 'corte'), e = beat.pasos.find((p) => p.tipo === 'estado');
    this.sonar(c);
    const detalle = c.criterio === 'puntos' ? '' : ` · Desempate por ${CRITERIOS[c.criterio] ?? c.criterio}`;
    this.panel.innerHTML = `<div class="titulo">Corte ${esc(c.numero)}</div><div class="grande">${esc(this.nombre(c.jugador))} queda a salvo</div><div class="detalle">${esc(c.puntos)} ${c.puntos === 1 ? 'punto' : 'puntos'}${esc(detalle)}</div>`
      + `<div class="tabla">${c.ranking.map((x, i) => `<div class="linea${i === 0 ? ' primero' : ''}"><span>${esc(this.nombre(x.s))}</span><span>${esc(x.puntos)} pts · ${esc(x.fichas)} ●</span></div>`).join('')}</div>`;
    this.mostrarPanel();
    this.programar(1200, () => this.aplicarEstado(e)); // detras del panel, quien queda a salvo se atenua
    await this.esperar(ms * 0.8);
  }

  terminar(beat) {
    const f = beat.pasos[0]?.final;
    this.cabecera.querySelector('.mano').textContent = 'Final';
    if (!f) return;
    const PUESTOS = [['pieza', f.pieza, 'Gana la pieza'], ['medio', f.medio, 'Sobrevive'], ['eliminado', f.eliminado, 'Eliminado']];
    const texto = textoDeFinal(f, (s) => this.nombre(s));
    this.panel.innerHTML = `<div class="titulo">Final</div><div class="grande">${esc(texto.grande)}</div><div class="detalle">${esc(texto.detalle)}</div>`
      + `<div class="tabla">${f.ranking.map((x, i) => `<div class="linea${i === 0 ? ' primero' : ''}"><span>${esc(this.nombre(x.s))}</span><span>${esc(x.puntos)} pts · ${esc(x.fichas)} ●</span></div>`).join('')}</div>`;
    this.mostrarPanel();
    for (const [puesto, s, frase] of PUESTOS) {
      const fila = this.filas[s];
      fila.st.ganadora = puesto === 'pieza';
      fila.st.jugando = puesto !== 'eliminado';
      this.pintarFila(s);
      this.decir(s, frase, '', puesto === 'pieza' ? 'ok' : puesto === 'eliminado' ? 'mal' : 'espera');
    }
  }
}
