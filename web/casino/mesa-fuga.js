// La mesa de La Fuga (navegador): una sala de control con una camara por prisionero. Dibuja y anima los beats de linea-de-tiempo-fuga.js: arriba la barra de la alarma y la cohesion, en medio las
// dos camaras (cada una con la mini escena de la situacion y la silueta de su prisionero) y abajo los subtitulos. Aqui no se decide nada del juego: cada beat trae lo que hay que mostrar.
// Lo que comparten todas las mesas vive en mesa-base.js. Se verifica mirando (herramientas/capturar-escena.mjs).
//
// Lo que el publico ve y cuando: las situaciones se abren con su obstaculo en los dos cuadros; las decisiones de los dos salen TODAS JUNTAS como sellos (nunca antes); la verdad (el riesgo real
// de cada paso) despues; las siluetas pasan limpias, tropiezan, caen ("SIN SEÑAL") o salen por su cuenta ("SALIDA"); la tentacion (botin u oferta del guardia) se avisa solo en la consecuencia,
// y la alarma y la cohesion se mueven al terminar la situacion.

import { colocarFuga } from './layout-fuga.js';
import { estiloJugador, esc } from './kit.js';
import { RONDAS_TOPE, ALARMA_MAX, COHESION_MAX, nivelDeAlerta, textoDeSello, horaDeBeat, textoDeRiesgo, avisosDeTentacion, reglasDeFinal } from './linea-de-tiempo-fuga.js';
import { MesaBase, el, poner } from './mesa-base.js';
import { PIEZAS, escenaDe } from './escenarios-fuga.js';
import { ACCIONES, accionDeResultado } from './siluetas.js';
import { colorDe } from '../paleta.js';

const SIL = '<svg class="sil-svg" viewBox="0 0 60 120"><circle cx="30" cy="16" r="13"/><path d="M12 40 q0-9 10-9 h16 q10 0 10 9 v34 h-36z"/><path class="brazo" d="M46 36 l10 20 h-7 l-9 -15z"/><path class="pierna pi" d="M15 74 h14 v42 h-10z"/><path class="pierna pd" d="M31 74 h14 v42 h-10z"/></svg>';
const pips = (n) => Array.from({ length: n }, () => '<i></i>').join('');
const signo = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const MS_CAMINO = 1700;

// Los metodos se llaman con verbos distintos de los campos (this.panel, this.medidores... son piezas del DOM): un campo con el mismo nombre taparia al metodo.
export class Mesa extends MesaBase {
  static METODOS = { apertura: 'abrirSituacion', decisiones: 'mostrarDecisiones', verdad: 'mostrarRiesgo', resultado: 'actuar', consecuencia: 'mostrarConsecuencia', final: 'revelarRegla' };

  constructor(formato, partida, opciones) {
    super(formato, partida, opciones, colocarFuga(formato));
    this.ficha = 0; // cada limpiar() cambia la ficha: una accion de la silueta que sigue corriendo de la situacion anterior se detiene
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
  // La imagen de la camara: el suelo, la mini escena de la situacion (sus piezas, detras) y la silueta del prisionero. Una situacion sin dibujar muestra su titulo sobre el cuadro.
  dibujarEscena(s, armar) {
    const c = this.camaras[s], { ancho, alto } = this.L.camaras[s].escena;
    const e = escenaDe(armar?.situacion);
    const piezas = e.piezas.map((p) => { const h = p.alto * alto, w = h * PIEZAS[p.pieza].ratio; return `<div class="pieza-fuga" style="left:${p.x * ancho - w / 2}px;top:${p.y * alto - h}px;width:${w}px;height:${h}px">${PIEZAS[p.pieza].svg()}</div>`; }).join('');
    const titulo = e.generica ? `<div class="obstaculo"><b>${esc(armar?.titulo ?? '')}</b><small>${esc(armar?.fase ?? '')}</small></div>` : '';
    c.escena.innerHTML = `<div class="suelo"></div>${titulo}${piezas}<div class="sil-fuga">${SIL}</div>`;
    c.sil = c.escena.querySelector('.sil-fuga');
    c.carril = e.carril;
    c.color = colorDe(this.partida.jugadores[s]?.id, this.partida.jugadores[s]?.color);
    this.ponerSilueta(s, ACCIONES.pasa(0, { desde: c.carril.desde, hasta: c.carril.hasta, color: c.color }));
  }
  // Pone la silueta como dice una accion (siluetas.js): su sitio, su pose y su color. La silueta mide la mitad del alto de la imagen y la cuarta parte de ese alto de ancho.
  ponerSilueta(s, r) {
    const c = this.camaras[s], { ancho, alto } = this.L.camaras[s].escena;
    c.x = r.x;
    Object.assign(c.sil.style, { left: `${r.x * ancho - alto * 0.125}px`, transform: `translateY(${r.y * alto}px) rotate(${r.pose.rot}deg) scaleY(${1 - 0.15 * r.pose.agacha})` });
    c.sil.style.setProperty('--sw', Math.sin(r.pose.paso * 2 * Math.PI).toFixed(3));
    c.sil.style.setProperty('--br', r.pose.brazo.toFixed(3));
    c.sil.style.setProperty('--sc', r.color);
  }
  // Corre una accion de la silueta con el reloj de pantalla (nunca decide nada del juego): termina en su pose final. En modo rapido (capturas) llega al instante.
  correrAccion(s, nombre, ms, extra = {}) {
    const c = this.camaras[s], f = ACCIONES[nombre], ficha = this.ficha;
    const ctx = { desde: c.x ?? c.carril.desde, hasta: c.carril.hasta, color: c.color, colorCaido: '#ff5a4d', ...extra };
    if (this.rapido) { this.ponerSilueta(s, f(1, ctx)); return Promise.resolve(); }
    return new Promise((fin) => {
      const t0 = performance.now();
      const paso = () => {
        if (ficha !== this.ficha) return fin(); // se abrio otra situacion: esta accion ya no pinta
        const t = Math.min(((performance.now() - t0) / ms) * this.vel, 1);
        this.ponerSilueta(s, f(t, ctx));
        if (t >= 1) fin(); else setTimeout(paso, 16);
      };
      paso();
    });
  }
  // Quita todo lo de la situacion anterior: sellos, mensajes, riesgo, avisos, animaciones de las siluetas y el panel del final.
  limpiar() {
    this.ficha++;
    for (const c of this.camaras) {
      for (const nodo of [c.sello, c.mensaje, c.riesgo, c.aviso]) { nodo.classList.remove('on', 'juego', 'rota'); nodo.textContent = ''; nodo.style.fontSize = ''; nodo.getAnimations().forEach((x) => x.cancel()); }
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
  // Un texto de una sola linea se achica de dos en dos hasta caber en su caja (minimo 16 px): un nombre largo o una marca de mas no se cortan.
  encajar(nodo, minimo = 16) {
    nodo.style.fontSize = '';
    let tam = parseFloat(getComputedStyle(nodo).fontSize);
    while (nodo.scrollWidth > nodo.clientWidth + 1 && tam > minimo) { tam -= 2; nodo.style.fontSize = `${tam}px`; }
  }
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
      this.encajar(c.sello, 18);
      if (d.mensajes[s]) { c.mensaje.textContent = `“${d.mensajes[s]}”`; c.mensaje.classList.add('on'); }
      const postura = { ayudar: 'ayuda', sacrificarse: 'ayuda', separarse: 'separa' }[j.postura]; // avanzar no se actua: la silueta espera de pie
      if (postura) this.correrAccion(s, postura, postura === 'ayuda' ? 1100 : 1300);
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
    const c = this.camaras[p.asiento];
    this.sonar(p);
    this.correrAccion(p.asiento, accionDeResultado(p), MS_CAMINO);
    if (p.sale) this.programar(MS_CAMINO, () => { c.st.salio = true; c.st.libre = false; this.pintarCamara(p.asiento); });
    else if (p.resultado === 'cayo') {
      c.escena.classList.add('caida');
      this.programar(MS_CAMINO, () => { c.st.libre = false; this.pintarCamara(p.asiento); });
    } else if (p.resultado === 'tropezo') {
      c.escena.classList.add('tropiezo');
      this.programar(MS_CAMINO * 0.65, () => { c.st.heridas += 1; this.pintarCamara(p.asiento); });
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
      this.actuarTentacion(t);
      for (const a of avisosDeTentacion(t, (s) => this.nombre(s))) {
        const c = this.camaras[a.asiento];
        c.aviso.textContent = a.texto;
        c.aviso.className = `fijo aviso-cam on ${a.clase}`;
        this.encajar(c.aviso, 16);
      }
    }
    this.aplicarFinDeSituacion(beat, 900);
    await this.esperar(Math.min(ms * 0.8, 1600));
  }

  // El botin aparece en el camino y quien lo toma se agacha a levantarlo; quien acepta la oferta del guardia se lleva la mano al oido.
  actuarTentacion(t) {
    if (t.clase === 'botin') {
      for (const [s, c] of this.camaras.entries()) {
        if (!c.st.libre) continue; // una camara sin prisionero (SIN SEÑAL o SALIDA) no muestra el botin
        const { ancho, alto } = this.L.camaras[s].escena, h = 0.16 * alto;
        c.escena.insertAdjacentHTML('afterbegin', `<div class="pieza-fuga botin" style="left:${0.55 * ancho - h / 2}px;top:${0.8 * alto - h}px;width:${h}px;height:${h}px">${PIEZAS.botin.svg()}</div>`);
      }
      if (Number.isInteger(t.tomo)) this.correrAccion(t.tomo, 'toma', 1300, { objeto: 0.55 });
    } else if (t.clase === 'oferta') {
      for (const d of t.delataron ?? []) this.correrAccion(d, 'acepta', 1100);
    }
  }

  mostrarPanel() { this.raiz.classList.add('con-panel'); this.anim(this.panel, [{ opacity: 0, transform: 'scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 420, fill: 'forwards', easing: 'cubic-bezier(.2,1.2,.4,1)' }); }

  // El final: la regla oculta. Las cuatro reglas fijas de puntaje (lo que ninguno sabia) y, en la que se cumplio para cada IA, su nombre con su color; abajo el marcador final.
  revelarRegla(beat) {
    const f = beat.pasos[0];
    this.cabecera.querySelector('.mano').textContent = 'Final';
    if (!f?.finales) return;
    const filas = reglasDeFinal(f.finales).map((r) => {
      const chips = r.cumplen.map((s) => `<span class="chip-regla" style="${estiloJugador(this.partida.jugadores[s])}">${esc(this.nombre(s))}</span>`).join('');
      return `<div class="fila-regla${r.cumplen.length ? ' cumple' : ''}"><span class="texto-regla">${esc(r.texto)}</span><span class="chips-regla">${chips}</span><span class="puntos-regla">${esc(r.puntos)}</span></div>`;
    }).join('');
    const puntos = Array.isArray(f.puntos) ? `<div class="marcador-regla">${f.puntos.map((p, s) => `<span>${esc(this.nombre(s))} · ${esc(p)}</span>`).join('')}</div>` : '';
    this.panel.innerHTML = `<div class="titulo">Lo que ninguno sabía</div><div class="reglas">${filas}</div>${puntos}`;
    this.mostrarPanel();
  }
}
