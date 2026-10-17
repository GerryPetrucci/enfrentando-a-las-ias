// La mesa de La Fuga (navegador): una sala de control con una camara por prisionero. Dibuja y anima los beats de linea-de-tiempo-fuga.js: arriba la barra de la alarma y la cohesion, en medio las
// dos camaras (cada una con la mini escena de la situacion y la silueta de su prisionero) y abajo los subtitulos. Aqui no se decide nada del juego: cada beat trae lo que hay que mostrar.
// Lo que comparten todas las mesas vive en mesa-base.js. Se verifica mirando (herramientas/capturar-escena.mjs).
//
// Lo que el publico ve y cuando: las situaciones se abren con su obstaculo en los dos cuadros; las decisiones de los dos salen TODAS JUNTAS como sellos (nunca antes); la verdad (el riesgo real
// de cada paso) despues; las siluetas pasan limpias, tropiezan, caen ("SIN SEÑAL") o salen por su cuenta ("SALIDA"); la tentacion (botin u oferta del guardia) se avisa solo en la consecuencia,
// y la alarma y la cohesion se mueven al terminar la situacion.

import { colocarFuga } from './layout-fuga.js';
import { estiloJugador, esc } from './kit.js';
import { RONDAS_TOPE, ALARMA_MAX, COHESION_MAX, nivelDeAlerta, textoDeSello, horaDeBeat, textoDeRiesgo, avisosDeTentacion, textoDeFichaFinal } from './linea-de-tiempo-fuga.js';
import { MesaBase, el, poner } from './mesa-base.js';

const SIL = '<svg class="sil-svg" viewBox="0 0 60 120"><circle cx="30" cy="16" r="13"/><path d="M12 40 q0-9 10-9 h16 q10 0 10 9 v36 h-9 v40 h-9 v-32 h-4 v32 h-9 v-40 h-9z"/></svg>';
const pips = (n) => Array.from({ length: n }, () => '<i></i>').join('');
const signo = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const INICIO = 0.12, META = 0.8, SALIDA = 1.12; // donde camina la silueta: de INICIO a META (o hasta fuera del cuadro), como fraccion del ancho de la imagen
const MS_CAMINO = 1700;

// Los metodos se llaman con verbos distintos de los campos (this.panel, this.medidores... son piezas del DOM): un campo con el mismo nombre taparia al metodo.
export class Mesa extends MesaBase {
  static METODOS = { apertura: 'abrirSituacion', decisiones: 'mostrarDecisiones', verdad: 'mostrarRiesgo', resultado: 'actuar', consecuencia: 'mostrarConsecuencia', final: 'revelarRegla' };

  constructor(formato, partida, opciones) {
    super(formato, partida, opciones, colocarFuga(formato));
    this.armar();
  }

  armar() {
    const { L } = this;
    this.armarBase('La Fuga');
    this.raiz.classList.add('mesa-vigilancia');
    this.medidores = el('fijo medidores-fuga'); poner(this.medidores, L.panel.marco);
    this.alarma = { rotulo: el('fijo rotulo-med'), barra: el('fijo barra-med alarma', pips(ALARMA_MAX)), previa: 0 };
    poner(this.alarma.rotulo, L.panel.alarma.rotulo); poner(this.alarma.barra, L.panel.alarma.barra);
    this.cohesion = { rotulo: el('fijo rotulo-med'), barra: el('fijo barra-med cohesion', '<i></i>') };
    poner(this.cohesion.rotulo, L.panel.cohesion.rotulo); poner(this.cohesion.barra, L.panel.cohesion.barra);
    this.camaras = L.camaras.map((c, s) => {
      const estilo = `;${estiloJugador(this.partida.jugadores[s])}`;
      const hacer = (clase, r, html = '') => { const n = el(`fijo ${clase}`, html); poner(n, r); n.style.cssText += estilo; return n; };
      return {
        cuadro: hacer('cam-fuga', c.cuadro), escena: hacer('escena-fuga', c.escena), senal: hacer('senal-fuga', c.escena),
        rotulo: hacer('rotulo-cam', c.rotulo), puntos: hacer('puntos-cam', c.puntos), rec: hacer('rec-cam', c.rec), sello: hacer('sello-fuga', c.sello), hora: hacer('hora-cam', c.hora),
        mensaje: hacer('mensaje-cam', c.mensaje), riesgo: hacer('riesgo-cam', c.riesgo), aviso: hacer('aviso-cam', c.aviso),
        sil: null, st: { libre: true, salio: false, heridas: 0, puntos: 0 },
      };
    });
    this.panel = el('fijo panel-fuga'); poner(this.panel, L.regla);
    this.raiz.append(this.cabecera, this.etiqueta, this.medidores, this.alarma.rotulo, this.alarma.barra, this.cohesion.rotulo, this.cohesion.barra,
      ...this.camaras.flatMap((c) => [c.cuadro, c.escena, c.senal, c.rotulo, c.puntos, c.rec, c.sello, c.hora, c.mensaje, c.riesgo, c.aviso]), this.panel, this.subtitulos, this.capa);
    this.camaras.forEach((_, s) => this.pintarCamara(s));
    this.ponerMedidores(0, 0);
  }

  // ---- ayudas ----
  pintarCamara(s) {
    const c = this.camaras[s], { st } = c;
    c.rotulo.textContent = `Cam ${s + 1} · ${this.nombre(s)}`;
    c.puntos.textContent = `${st.puntos} pts${st.heridas ? ` ${'✚'.repeat(Math.min(st.heridas, 5))}` : ''}`;
    const caido = !st.libre && !st.salio;
    c.cuadro.classList.toggle('sin-senal', caido);
    c.cuadro.classList.toggle('salida', st.salio);
    c.senal.textContent = caido ? 'Sin señal' : st.salio ? 'Salida' : '';
    c.senal.classList.toggle('on', caido || st.salio);
    c.senal.classList.toggle('dorada', st.salio);
    c.rec.className = `fijo rec-cam${caido ? ' sin-senal' : st.salio ? ' salida' : ''}`;
    c.rec.textContent = caido ? 'Sin señal' : st.salio ? 'Salida' : '● REC';
    c.sil?.classList.toggle('oculta', !st.libre);
  }
  ponerMedidores(alarma, cohesion) {
    this.alarma.rotulo.innerHTML = `Alarma · <b>${esc(nivelDeAlerta(alarma))}</b>`;
    [...this.alarma.barra.children].forEach((p, k) => p.classList.toggle('on', k < alarma));
    this.alarma.barra.classList.toggle('sube', alarma > this.alarma.previa);
    this.alarma.previa = alarma;
    this.cohesion.rotulo.innerHTML = `Cohesión · <b>${esc(signo(cohesion))}</b>`;
    this.cohesion.barra.firstElementChild.style.width = `${Math.max(0, Math.min(100, (100 * (cohesion + COHESION_MAX)) / (2 * COHESION_MAX)))}%`;
    this.cohesion.barra.classList.toggle('negativa', cohesion < 0);
  }
  aplicarEstado(e) {
    this.camaras.forEach((c, s) => { Object.assign(c.st, { libre: e.libres[s], salio: e.salieron[s], heridas: e.heridas[s], puntos: e.puntos[s] }); this.pintarCamara(s); });
    this.ponerMedidores(e.alarma, e.cohesion);
  }
  // La imagen de la camara: el suelo, el obstaculo de la situacion (por ahora solo su titulo: las mini escenas dibujadas llegan en la tarea E4) y la silueta del prisionero.
  dibujarEscena(s, armar) {
    const c = this.camaras[s];
    c.escena.innerHTML = `<div class="suelo"></div><div class="obstaculo"><b>${esc(armar?.titulo ?? '')}</b><small>${esc(armar?.fase ?? '')}</small></div><div class="sil-fuga">${SIL}</div>`;
    c.sil = c.escena.querySelector('.sil-fuga');
    c.sil.style.left = `${this.L.camaras[s].escena.ancho * INICIO}px`;
  }
  // Quita todo lo de la situacion anterior: sellos, mensajes, riesgo, avisos, animaciones de las siluetas y el panel del final.
  limpiar() {
    for (const c of this.camaras) {
      for (const nodo of [c.sello, c.mensaje, c.riesgo, c.aviso]) { nodo.classList.remove('on', 'juego', 'rota'); nodo.textContent = ''; nodo.getAnimations().forEach((x) => x.cancel()); }
      c.escena.classList.remove('tropiezo', 'caida');
      c.cuadro.getAnimations().forEach((x) => x.cancel());
      c.sil?.getAnimations().forEach((x) => x.cancel());
    }
    this.panel.getAnimations().forEach((x) => x.cancel());
    this.panel.style.opacity = 0;
    this.raiz.classList.remove('con-panel');
  }
  mostrarEstadoInicial(beat) {
    this.limpiar();
    const armar = beat.pasos.find((p) => p.tipo === 'armar'), e = beat.pasos.find((p) => p.tipo === 'estado');
    this.camaras.forEach((_, s) => this.dibujarEscena(s, armar));
    if (e) this.aplicarEstado(e);
    this.ponerHora(beat);
    this.cabecera.querySelector('.mano').textContent = `Situación ${beat.mano} / ${RONDAS_TOPE}`;
  }
  fijarEstado(e) { this.aplicarEstado(e); }
  ponerHora(beat) { for (const c of this.camaras) c.hora.textContent = horaDeBeat(beat); }
  mostrarSubtitulos(beat) {
    super.mostrarSubtitulos(beat);
    if (!this.razon || beat.tipo !== 'decisiones') return;
    const razones = beat.pasos.find((p) => p.tipo === 'decidir')?.razones ?? [];
    const bloques = razones.map((r, s) => (r ? `<div class="razon"><small>${esc(this.nombre(s))} piensa</small>${esc(r)}</div>` : '')).join('');
    if (!bloques) return;
    this.subtitulos.insertAdjacentHTML('beforeend', bloques);
    this.ajustarSubtitulos();
  }

  // Lo que la escena informa de si misma (para la herramienta de capturas): que no quede nada de la situacion anterior y que cada cuadro muestre lo que dice el estado.
  estadoVisible() {
    const cuenta = (sel) => this.raiz.querySelectorAll(sel).length;
    return {
      siluetas: cuenta('.sil-fuga:not(.oculta)'),
      sellos: cuenta('.sello-fuga.on'),
      avisos: cuenta('.aviso-cam.on'),
      sinSenal: cuenta('.cam-fuga.sin-senal'),
      salidas: cuenta('.cam-fuga.salida'),
      panel: Number(getComputedStyle(this.panel).opacity),
    };
  }

  // ---- los beats ----
  async ejecutar(beat, ms) {
    this.ponerHora(beat);
    return super.ejecutar(beat, ms);
  }

  async abrirSituacion(beat) {
    this.mostrarEstadoInicial(beat); // cancela lo que quedaba (las animaciones con fill:'forwards' le ganan a un estilo en linea) y pone el estado de la situacion
    this.sonar(beat.pasos.find((p) => p.tipo === 'armar'));
    await this.esperar(500);
  }

  async mostrarDecisiones(beat, ms) {
    const d = beat.pasos.find((p) => p.tipo === 'decidir');
    this.sonar(d);
    d.jugadas.forEach((j, s) => {
      if (!j) return; // un prisionero capturado ya no decide
      const c = this.camaras[s];
      const texto = textoDeSello(j, { reemplazada: d.reemplazadas[s], ilegibles: d.ilegibles[s] });
      c.sello.innerHTML = `<span>${esc(texto)}</span>${d.promesasRotas[s] ? '<span class="rota-cam">Promesa rota</span>' : ''}`;
      c.sello.classList.toggle('juego', d.reemplazadas[s]);
      c.sello.classList.add('on');
      if (d.mensajes[s]) { c.mensaje.textContent = `“${d.mensajes[s]}”`; c.mensaje.classList.add('on'); }
    });
    await this.esperar(ms * 0.4);
  }

  async mostrarRiesgo(beat, ms) {
    const r = beat.pasos.find((p) => p.tipo === 'riesgo');
    this.sonar(r);
    r.fallo.forEach((f, s) => {
      const texto = textoDeRiesgo(f);
      if (!texto) return;
      const c = this.camaras[s];
      c.riesgo.textContent = texto;
      c.riesgo.classList.add('on');
      c.riesgo.classList.toggle('alto', f >= 0.3);
    });
    await this.esperar(ms * 0.4);
  }

  // Una silueta actua: camina por la imagen y pasa limpia, tropieza, cae o sale. Los cambios de estado (la herida, "SIN SEÑAL", "SALIDA") caen al terminar de caminar.
  accion(p) {
    const c = this.camaras[p.asiento], ancho = this.L.camaras[p.asiento].escena.ancho;
    const x = (f) => `${ancho * f}px`;
    const sil = c.sil;
    this.sonar(p);
    const camina = (hasta, extra = {}) => this.anim(sil, [{ left: x(INICIO) }, { left: x(hasta) }], { duration: MS_CAMINO, fill: 'forwards', easing: 'ease-in-out', ...extra });
    if (p.sale) {
      camina(SALIDA);
      this.programar(MS_CAMINO, () => { c.st.salio = true; c.st.libre = false; this.pintarCamara(p.asiento); });
    } else if (p.resultado === 'cayo') {
      const a = this.anim(sil, [{ left: x(INICIO), transform: 'none', offset: 0 }, { left: x(0.5), transform: 'none', offset: 0.7 }, { left: x(0.56), transform: 'rotate(88deg) translateX(-30px)', offset: 1 }], { duration: MS_CAMINO, fill: 'forwards', easing: 'ease-in' });
      void a;
      c.escena.classList.add('caida');
      this.programar(MS_CAMINO, () => { c.st.libre = false; this.pintarCamara(p.asiento); });
    } else if (p.resultado === 'tropezo') {
      this.anim(sil, [{ left: x(INICIO), transform: 'none', offset: 0 }, { left: x(0.5), transform: 'none', offset: 0.55 }, { left: x(0.55), transform: 'rotate(-14deg) translateY(10px)', offset: 0.65 }, { left: x(0.6), transform: 'none', offset: 0.8 }, { left: x(META), transform: 'none', offset: 1 }], { duration: MS_CAMINO, fill: 'forwards', easing: 'ease-in-out' });
      c.escena.classList.add('tropiezo');
      this.programar(MS_CAMINO * 0.65, () => { c.st.heridas += 1; this.pintarCamara(p.asiento); });
    } else {
      camina(META);
    }
  }

  async actuar(beat, ms) {
    let retraso = 0;
    for (const p of beat.pasos.filter((x) => x.tipo === 'actuar')) {
      this.programar(retraso, () => this.accion(p));
      retraso += 450;
    }
    this.aplicarFinDeSituacion(beat, retraso + MS_CAMINO + 300);
    await this.esperar(Math.min(ms * 0.9, retraso + MS_CAMINO + 600));
  }

  // Si este es el ultimo beat de la situacion (trae el estado de despues), la alarma, la cohesion y los puntos se mueven al final.
  aplicarFinDeSituacion(beat, cuando) {
    const medidor = beat.pasos.find((x) => x.tipo === 'medidor'), estado = beat.pasos.find((x) => x.tipo === 'estado');
    if (medidor) this.programar(cuando, () => { this.sonar(medidor); this.ponerMedidores(medidor.alarma, medidor.cohesion); });
    if (estado) this.programar(cuando + 150, () => this.aplicarEstado(estado));
  }

  async mostrarConsecuencia(beat, ms) {
    const t = beat.pasos.find((p) => p.tipo === 'tentacion');
    if (t) {
      this.sonar(t);
      for (const a of avisosDeTentacion(t, (s) => this.nombre(s))) {
        const c = this.camaras[a.asiento];
        c.aviso.textContent = a.texto;
        c.aviso.className = `fijo aviso-cam on ${a.clase}`;
      }
    }
    this.aplicarFinDeSituacion(beat, 900);
    await this.esperar(Math.min(ms * 0.8, 1600));
  }

  mostrarPanel() { this.raiz.classList.add('con-panel'); this.anim(this.panel, [{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 420, fill: 'forwards', easing: 'cubic-bezier(.2,1.2,.4,1)' }); }

  // El final: por ahora una linea por prisionero con lo que ocurrio y lo que valio (la escena de las cuatro reglas llega en la tarea E6).
  revelarRegla(beat) {
    const f = beat.pasos[0];
    this.cabecera.querySelector('.mano').textContent = 'Final';
    if (!f?.finales) return;
    this.panel.innerHTML = `<div class="titulo">Final</div>${f.finales.map((fin, s) => `<div class="linea-final"><span>${esc(textoDeFichaFinal(fin, f.bono[s], (k) => this.nombre(k), s))}</span></div>`).join('')}`;
    this.mostrarPanel();
  }
}
