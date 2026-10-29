import { arteListo } from './arte-conquista.js';
// La mesa de la escena de la Guerra de territorios (navegador): dibuja y anima los beats de linea-de-tiempo-conquista.js sobre el mapa de pixel art. Aqui no se decide nada del juego:
// cada beat trae lo que hay que mostrar (fuerzas de las tarjetas, flechas, privados que se revelan...) y el mapa sale de lo guardado en la partida. Lo comun de las mesas vive en
// mesa-base.js; el dibujo del mapa en mapa-dibujo.js. Se verifica mirando (herramientas/capturar-escena.mjs).
//
// Lo que el publico ve y cuando: el mapa con la ocupacion de cada reino; cada turno empieza con las flechas de las ordenes y los mensajes (los privados solo como "X le escribio en
// privado a Y"); si alguien rompe un pacto, el cartel de traicion y el flashback de lo que le habia dicho en privado; cada batalla con su tarjeta (o la pantalla VS si es decisiva);
// y la resolucion actualiza el mapa, el marcador y el feed. Al final, el ranking, los momentos clave y los privados que nunca salieron.

import { colocarConquista } from './layout-conquista.js';
import { leerMapa, paletaDe, NOMBRES_BIOMA, TURNOS_TOPE, TERRENO, RECURSOS, multiplicadorDeArmas, multiplicadorDeFortaleza, tropasDeReino, LETRAS_DE_UNIDAD } from './conquista-datos.js';
import { geometriaDelMapa, centroDeRegion, pintarTerreno, pintarReinos, pintarFichas, pintarFlecha, pintarContorno, pintarIcono, pintarCorona, pintarLeyendaUnidades, colorSolido, COLOR_DE_TIPO } from './mapa-dibujo.js';
import { f2, tropas } from './linea-de-tiempo-conquista.js';
import { nombreDeReino } from './reinos-conquista.js';
import { FEED, msVisibleDelFeed, colaDeFeed } from './feed-conquista.js';
import { estiloJugador, esc } from './kit.js';
import { ESPADAS, cuadrosDeEspada, cuadrosDeChispa, cuadrosDeEspadas, htmlDeEspadas } from './espadas.js';
import { sonidoDeMaravilla } from './sonido-conquista.js';
import { crearAnimador, EASING } from './animador-estilo.js';
import { SUBTITULO } from './subtitulos-vertical.js';
import { colorDe, franjasDe } from '../paleta.js';
import { MesaBase, el, poner } from './mesa-base.js';

const MAX_FEED = 7;
const ZOOM_BATALLA = 3.4, ZOOM_MARAVILLA = 3.8; // cuanto se acerca el mapa al territorio disputado o a la region de la Maravilla (prefers-reduced-motion: no se anima)
const SVG = (cuerpo) => `<svg class="ico" viewBox="0 0 24 24">${cuerpo}</svg>`;
const ICONOS = {
  espada: SVG('<path d="M5 19L19 5M19 19L5 5"/>'),
  bandera: SVG('<path d="M6 21V3M6 4h12l-3 4 3 4H6"/>'),
  pacto: SVG('<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>'),
  ruptura: SVG('<circle cx="7" cy="12" r="4"/><circle cx="17" cy="12" r="4"/><path d="M11 20L13 4"/>'),
  msg: SVG('<path d="M4 5h16v11H9l-4 4v-4H4z"/>'),
  candado: SVG('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>'),
  regalo: SVG('<rect x="4" y="9" width="16" height="11"/><path d="M12 9v11M4 14h16M12 9c-3-5-6-2-3 0M12 9c3-5 6-2 3 0"/>'),
  hambre: SVG('<path d="M6 21V8M12 21V4M18 21V8"/><path d="M4 8l2-3 2 3M10 4l2-3 2 3M16 8l2-3 2 3"/>'),
  caida: SVG('<path d="M4 20V8l4 4 4-7 4 7 4-4v12z"/><path d="M3 3l18 18" stroke="#d8584e"/>'),
  corona: SVG('<path d="M4 20V8l4 4 4-7 4 7 4-4v12z"/>'), // el Hegemon
  evento: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>'), // un evento del mundo (Sequia, Peste, Cosecha, Caravana)
};

// El zoom del mapa son tres numeros (translate x, translate y y escala): lo que se escribe en linea es SIEMPRE el estado final (animador-estilo.js), nunca una animacion del navegador.
const ZOOM_NINGUNO = Object.freeze({ tx: 0, ty: 0, f: 1 });
const esZoomNinguno = (z) => !z || (z.f === 1 && z.tx === 0 && z.ty === 0);
const estiloDeZoom = (z) => (esZoomNinguno(z) ? 'none' : `translate(${z.tx}px, ${z.ty}px) scale(${z.f})`);
const mezclarZoom = (a, b, p) => (p >= 1 ? { ...b } : { tx: a.tx + (b.tx - a.tx) * p, ty: a.ty + (b.ty - a.ty) * p, f: a.f + (b.f - a.f) * p });

// Los metodos se llaman con verbos distintos de los campos (this.feedEl, this.tarjetaEl... son piezas del DOM): un campo con el mismo nombre taparia al metodo.
export class Mesa extends MesaBase {
  static METODOS = { apertura: 'abrir', ordenes: 'mostrarOrdenes', traicion: 'mostrarTraicion', batalla: 'mostrarBatalla', resolucion: 'resolver', rasgos: 'mostrarRasgos', final: 'terminar' };

  constructor(formato, partida, opciones) {
    const mapa = leerMapa(partida?.mapa);
    super(formato, partida, opciones, colocarConquista(formato, mapa));
    this.mapa = mapa;
    this.geom = geometriaDelMapa(mapa, this.L.mapa);
    this.colores = (partida.jugadores ?? []).map((j) => franjasDe(j.id) ?? colorDe(j.id, j.color));
    this.turno = 1; this.flechasPintadas = 0;
    this.animador = crearAnimador(); this.zoomVisto = undefined; // lo que se apaga, se enciende y se acerca lo mueve el animador (animador-estilo.js), no Web Animations
    this.armar();
    arteListo.then(()=>{if(this.raiz.isConnected && this.estadoMapa)this.pintarMapa(this.estadoMapa);});
  }

  armar() {
    const { L } = this;
    this.armarBase('Guerra de territorios');
    this.raiz.classList.add('mesa-conquista');
    const lienzo = (clase) => { const c = Object.assign(document.createElement('canvas'), { width: L.ancho, height: L.alto, className: `lienzo ${clase}` }); return c; };
    this.cTerreno = lienzo('l-terreno'); this.cReinos = lienzo('l-reinos'); this.cFlechas = lienzo('l-flechas');
    // El mapa (los 3 lienzos) va dentro de un envoltorio: el zoom de una batalla o de la Maravilla escala ESTE envoltorio (aplicarZoom/quitarZoomMapa), nunca el resto de la pantalla.
    this.mapaZoom = el('fijo mapa-zoom'); poner(this.mapaZoom, { x: 0, y: 0, ancho: L.ancho, alto: L.alto }); this.mapaZoom.append(this.cTerreno, this.cReinos, this.cFlechas);
    this.mapaMarco = el('fijo mapa-marco'); poner(this.mapaMarco, { x:0, y:0, ancho:L.ancho, alto:L.alto }); this.mapaMarco.append(this.mapaZoom);
    this.cMarcador = Object.assign(document.createElement('canvas'), { width: L.marcador.ancho, height: L.marcador.alto, className: 'lienzo l-marcador' });
    poner(this.cMarcador, L.marcador); this.cMarcador.style.width = `${L.marcador.ancho}px`; this.cMarcador.style.height = `${L.marcador.alto}px`;
    pintarTerreno(this.cTerreno.getContext('2d'), this.mapa, this.geom, paletaDe(this.mapa.bioma));
    this.vela = el('fijo vela'); poner(this.vela, L.mapa);
    this.feedEl = el('fijo feed-conq'); poner(this.feedEl, L.feed);
    this.cartelEl = el('fijo cartel-conq'); poner(this.cartelEl, L.cartel);
    this.flashEl = el('fijo flash-conq'); poner(this.flashEl, L.flashback);
    this.tarjetaEl = el('fijo tarjeta-conq zoom-tarjeta'); poner(this.tarjetaEl, L.tarjeta);
    this.vsEl = el('fijo tarjeta-conq tarjeta-vs zoom-tarjeta'); poner(this.vsEl, L.vs);
    this.finalEl = el('fijo panel-conq'); poner(this.finalEl, L.panelFinal);
    this.raiz.append(this.mapaMarco, this.vela, this.cMarcador, this.feedEl, this.cabecera, this.etiqueta, this.cartelEl, this.flashEl, this.tarjetaEl, this.vsEl, this.finalEl, this.subtitulos, this.capa);
  }

  // ---- ayudas ----
  nombreHTML(k) { return `<span class="n" style="${estiloJugador(this.partida.jugadores[k])}">${esc(this.nombre(k))}</span>`; }
  partesHTML(partes) { return partes.map((p) => (typeof p === 'string' ? esc(p) : this.nombreHTML(p.k))).join(''); }
  centro(r) { return centroDeRegion(this.mapa, r, this.geom); }
  radioFicha() { return Math.max(13, this.geom.T * 0.62); }
  limpiarLienzo(canvas) { canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height); }
  opacidad(nodo) { return Number(getComputedStyle(nodo).opacity); }
  mostrar(nodo, ms = 350, frames = [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'translateY(0)' }]) { this.animador.cancelar(nodo); nodo.getAnimations().forEach((x) => x.cancel()); nodo.style.opacity = 1; this.anim(nodo, frames, { duration: ms, easing: 'ease-out' }); }
  // Apagar: baja la opacidad en linea con el animador hasta 0 EXACTO (nada de animaciones con fill que despues haya que cancelar: ver hud-conquista.test.js).
  ocultar(nodo, ms = 250) {
    this.animador.cancelar(nodo); nodo.getAnimations().forEach((x) => x.cancel());
    const desde = this.opacidad(nodo);
    if (this.rapido || !(ms > 0) || !(desde >= 0.01)) { nodo.style.opacity = 0; return; }
    this.animador.animar(nodo, { ms: ms / this.vel, alCuadro: (p) => { nodo.style.opacity = desde * (1 - p); } });
  }

  // ---- zoom al mapa (batalla o Maravilla): acerca solo el envoltorio del mapa (mapaZoom) y lo recorta dentro de la ventana grande de L.zoomVentana (nunca el resto de piezas).
  // `destino` queda centrado en esa ventana (translate+scale con origen 0 0, nunca scale(origin=destino): asi no se sale del marco). Respeta prefers-reduced-motion (sin animar). ----
  reducido() { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  transformDeZoom(destino, factor) { return estiloDeZoom(this.valoresDeZoom(destino, factor)); }
  clipDeVentana() {
    const L = this.L, v = L.zoomVentana ?? { x: 0, y: 0, ancho: L.ancho, alto: L.alto };
    return `inset(${v.y}px ${Math.max(0, L.ancho - v.x - v.ancho)}px ${Math.max(0, L.alto - v.y - v.alto)}px ${v.x}px)`;
  }
  // El zoom lo mueve el animador, no Web Animations (en OBS una animacion cancelada dejo el mapa con el zoom puesto, grabacion del 28 de octubre de 2026): `zoomVisto` es lo ultimo que se escribio en linea.
  valoresDeZoom(destino, factor) { const L = this.L, v = L.zoomVentana ?? { x: 0, y: 0, ancho: L.ancho, alto: L.alto }; return { tx: v.x + v.ancho / 2 - factor * destino.x, ty: v.y + v.alto / 2 - factor * destino.y, f: factor }; }
  fijarZoom(z) { this.zoomVisto = z; this.mapaZoom.style.transform = estiloDeZoom(z); }
  irAlZoom(hasta, ms, ease, alTerminar) {
    const desde = this.zoomVisto ?? ZOOM_NINGUNO;
    if (this.reducido() || this.rapido) { this.animador.cancelar('zoom'); this.fijarZoom(hasta); alTerminar?.(); return; }
    this.animador.animar('zoom', { ms: ms / this.vel, ease, alCuadro: (p) => this.fijarZoom(mezclarZoom(desde, hasta, p)), alTerminar });
  }
  aplicarZoom(destino, factor) {
    if (!destino || !this.mapaZoom) return;
    this.mapaZoom.style.transformOrigin = '0 0';
    this.mapaMarco.style.clipPath = this.clipDeVentana();
    this.irAlZoom(this.valoresDeZoom(destino, factor), 650, EASING.salida);
  }
  quitarZoomMapa() {
    this.destelloEl?.getAnimations().forEach(a=>a.cancel()); if(this.destelloEl) this.destelloEl.style.opacity=0;
    if (!this.mapaZoom) return;
    const fin = () => { this.fijarZoom(ZOOM_NINGUNO); this.mapaMarco.style.clipPath = 'none'; };
    if (esZoomNinguno(this.zoomVisto) || this.reducido() || this.rapido) { this.animador.cancelar('zoom'); fin(); return; }
    this.irAlZoom(ZOOM_NINGUNO, 450, EASING.entrada, fin);
  }
  // Al pausar, reanudar o cambiar de beat no debe quedar nada del zoom anterior: se limpia al instante, sin animar (igual que el resto de limpiarTurno).
  restablecerZoomInstante() { if (!this.mapaZoom) return; this.animador.cancelar('zoom'); this.fijarZoom(ZOOM_NINGUNO); this.mapaMarco.style.clipPath = 'none'; }
  // Cabecera, aviso, marcador, feed y subtitulos se ocultan mientras dura el zoom de una batalla o la Maravilla: solo quedan el zoom y la tarjeta, sobre fondo oscuro (clase cinematica-conq).
  // La cabecera, el aviso y el marcador se desvanecen con el animador (opacidad en linea, hasta 0 o 1 EXACTOS). Antes eran animate(opacity, fill:'forwards') + cancel(): en OBS (Chromium 150, 4K) la animacion
  // de salida, ya cancelada, reaparecia y los dejaba invisibles (con el feed y los subtitulos) durante turnos enteros (hud-conquista.test.js). El feed y los subtitulos quedan en opacidad 0: vuelven con el siguiente aviso.
  fundirHud(hasta, ms) {
    const nodos = [this.cabecera, this.etiqueta, this.cMarcador], actual = (n) => (n.style.opacity === '' || n.style.opacity === undefined ? 1 : Number(n.style.opacity));
    const desde = actual(this.cabecera), poner = (v) => { for (const n of nodos) n.style.opacity = v; };
    if (this.rapido || !(ms > 0) || desde === hasta) { this.animador.cancelar('hud'); poner(hasta); return; }
    this.animador.animar('hud', { ms: ms / this.vel, alCuadro: (p) => poner(p >= 1 ? hasta : desde + (hasta - desde) * p) });
  }
  ocultarUIDeMapa() {
    this.enCinematica = true; clearTimeout(this.feedTimer); this.cancelarFeedCola();
    this.ocultar(this.flashEl, 0);
    this.raiz.classList.add('cinematica-conq');
    for (const n of [this.feedEl, this.subtitulos]) { this.animador.cancelar(n); n.style.opacity = 0; }
    this.fundirHud(0, 250);
  }
  restaurarUIDeMapa() {
    this.enCinematica = false;
    this.raiz.classList.remove('cinematica-conq');
    if (this.feedPendiente) { const lista = this.feedPendiente; this.feedPendiente = null; this.agregarFeed(lista); }
    this.fundirHud(1, 250);
  }
  restaurarUIDeMapaInstante() { this.enCinematica = false; this.raiz.classList.remove('cinematica-conq'); this.fundirHud(1, 0); }

  // ---- marcador: una fila por reino con sus recursos, regiones, tropas y honor ----
  pintarMarcador(estado) {
    const c = this.cMarcador, g = c.getContext('2d'), k = this.mapa.k, { width: ancho, height: alto } = c;
    g.clearRect(0, 0, ancho, alto);
    const fam = getComputedStyle(this.raiz).fontFamily, fila = alto / k, tam = Math.min(26, fila * 0.55), compacto = this.formato === '16x9';
    for (let s = 0; s < k; s++) {
      const y = s * fila + fila / 2, vivo = estado.vivo?.[s] !== false;
      g.globalAlpha = vivo ? 1 : 0.4;
      const col = this.colores[s];
      g.fillStyle = Array.isArray(col) ? (() => { const gr = g.createLinearGradient(0, y - fila * 0.4, 0, y + fila * 0.4); col.forEach((x, i) => gr.addColorStop(i / (col.length - 1), x)); return gr; })() : col;
      g.beginPath(); g.roundRect(8, y - fila * 0.38, 8, fila * 0.76, 4); g.fill();
      g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = `800 ${tam}px ${fam}`;
      g.fillStyle = colorDe(this.partida.jugadores[s]?.id, colorSolido(this.colores, s)); g.fillText(this.nombre(s), 26, y - (compacto ? 0 : fila * 0.12), compacto ? 150 : 180);
      const x0 = compacto ? 240 : 230, paso = compacto ? 112 : Math.min(118, Math.floor((ancho - 14 - 120 - x0) / RECURSOS.length)); // donde empieza la columna de recursos y lo que mide cada una (en 9:16 el marcador mide 890: dejan sitio a «NN reg.»)
      // el reino del asiento junto al nombre del modelo (las IAs hablan de «Azur» o «Rosa» en sus mensajes): en gris y solo si cabe antes de los recursos
      const reino = nombreDeReino(s, this.partida.reinos), xReino = 26 + Math.min(g.measureText(this.nombre(s)).width, compacto ? 150 : 180) + 8;
      g.font = `600 ${Math.round(tam * 0.6)}px ${fam}`;
      if (reino && xReino + g.measureText(reino).width < x0 - 8) { g.fillStyle = '#9a9aa6'; g.fillText(reino, xReino, y - (compacto ? 0 : fila * 0.12)); }
      const regiones = (estado.dueno ?? []).filter((d) => d === s).length, tr = tropasDeReino(estado, s); // todas sus unidades, tambien las que tiene de visita en tierra de otros
      const pactos = (estado.pactos?.[s] ?? []).flatMap((v, j) => (j !== s && v >= this.turno ? [this.nombre(j)] : []));
      g.font = `600 ${Math.round(tam * 0.62)}px ${fam}`; g.fillStyle = vivo ? '#6fbf8a' : '#d8584e';
      if (!compacto) g.fillText(vivo ? (pactos.length ? `pacto con ${pactos.join(', ')}` : 'sin pactos') : 'cayó', 26, y + fila * 0.26, 200);
      RECURSOS.forEach((r, j) => {
        const x = x0 + j * paso;
        pintarIcono(g, r, x, y, tam * 0.5);
        g.fillStyle = '#f2f0ed'; g.font = `800 ${tam}px ${fam}`; g.textAlign = 'left'; g.fillText(String(estado.stock?.[s]?.[r] ?? 0), x + tam * 0.9, y + 1);
      });
      g.textAlign = 'right'; g.fillStyle = '#f2f0ed'; g.font = `700 ${Math.round(tam * 0.92)}px ${fam}`;
      g.fillText(`${regiones} reg.`, ancho - 14, y - (compacto ? 0 : fila * 0.14));
      if (vivo && estado.hegemon === s) pintarCorona(g, ancho - 14 - g.measureText(`${regiones} reg.`).width - 22, y - (compacto ? 0 : fila * 0.14) + 1, tam / 30); // el Hegemon: los demas lo atacan con +50 %
      // Total de tropas: maza + número; no cambia las letras de composición de unidades.
      g.font = `600 ${Math.round(tam * 0.62)}px ${fam}`; g.fillStyle = '#9a9aa6';
      const total = `${tr} · honor ${estado.honor?.[s] ?? 0}`, ty = y + fila * (compacto ? .34 : .26);
      const tx = ancho - 14 - g.measureText(total).width;
      pintarIcono(g,'Tropas',tx-tam*.8,ty,tam*.55);
      g.textAlign='right'; g.fillStyle='#9a9aa6'; g.fillText(total,ancho-14,ty);
      g.globalAlpha = 1;
    }
  }

  pintarMapa(estado) {
    this.estadoMapa=structuredClone(estado);
    this.limpiarLienzo(this.cReinos);
    const g = this.cReinos.getContext('2d');
    pintarReinos(g, this.mapa, this.geom, estado.dueno, this.colores);
    pintarFichas(g, this.mapa, this.geom, estado, this.colores);
    if (Array.isArray(estado.uni)) pintarLeyendaUnidades(g, this.geom.ox + 8, this.geom.oy + 8, Math.max(14, this.radioFicha() * 0.9)); // los colores de la barra de cada ficha (solo en partidas con unidades por tipo)
    this.pintarMarcador(estado);
  }

  // ---- feed tipo lobby: maximo 7 avisos, el mas nuevo abajo, los viejos se apagan. Se encolan uno detras de otro (colaDeFeed) para que de tiempo a leerlos y para que el
  // narrador (mostrarSubtitulos) no los adelante antes de que el feed los muestre. ----
  cancelarFeedCola() { (this.feedCola ?? []).forEach((id) => clearTimeout(id)); this.feedCola = []; }
  pintarAvisoFeed(e) {
    const quien = e.partes.find((p) => typeof p !== 'string');
    const nodo = el(`it${e.alerta ? ' alerta' : ''}`, `<span class="barra"></span>${ICONOS[e.icono] ?? ICONOS.espada}<span class="txt">${this.partesHTML(e.partes)}</span>`);
    if (quien) nodo.style.cssText = estiloJugador(this.partida.jugadores[quien.k]);
    this.feedEl.append(nodo);
    this.anim(nodo, [{ opacity: 0, transform: 'translateX(-30px)' }, { opacity: 1, transform: 'translateX(0)' }], { duration: 320, easing: 'ease-out' });
    while (this.feedEl.children.length > MAX_FEED) this.feedEl.firstElementChild.remove();
    [...this.feedEl.children].forEach((n, i, todos) => { n.style.opacity = Math.max(0.55, 1 - (todos.length - 1 - i) * 0.07); });
  }
  agregarFeed(lista) {
    if (this.enCinematica) { this.feedPendiente=lista; return; }
    this.cancelarFeedCola();
    const cola = colaDeFeed(lista);
    if (!cola.length) return;
    cola.forEach(({ aviso, demora }, i) => {
      const mostrar = () => { this.pintarAvisoFeed(aviso); this.mostrarFeed(1); };
      if (this.rapido || demora <= 0) mostrar();
      else this.feedCola.push(setTimeout(mostrar, demora / this.vel));
    });
  }

  // El feed no se queda tapando el mapa: aparece con lo nuevo, se apaga solo a los pocos segundos (feed-conquista.js) y con lo siguiente vuelve a entrar sin lo viejo. En las capturas (`rapido`) no se apaga.
  mostrarFeed(nuevos) {
    clearTimeout(this.feedTimer);
    if (this.enCinematica) return;
    this.feedEl.dataset.feed = 'visible';
    for (const n of [this.feedEl, this.subtitulos]) {
      this.animador.cancelar(n); n.getAnimations().forEach(a => a.cancel());
      n.style.opacity = n === this.subtitulos && !n.textContent.trim() ? 0 : 1;
    }
    if (!this.rapido) this.feedTimer = setTimeout(() => this.apagarFeed(), msVisibleDelFeed(nuevos) / this.vel);
  }
  apagarFeed() {
    this.feedEl.dataset.feed = 'oculto';
    for (const n of [this.feedEl, this.subtitulos]) this.ocultar(n, FEED.FUNDIDO_MS);
  }
  // Los subtitulos de la base (mesa-base.js) se apagaban con una animacion con fill: aqui los apaga el animador, igual que el feed.
  aparecerSubtitulos(ms) { this.animador.cancelar(this.subtitulos); super.aparecerSubtitulos(ms); }
  apagarSubtitulos() { this.ocultar(this.subtitulos, SUBTITULO.FUNDIDO_MS); }

  // Todos los callbacks transitorios pertenecen a un beat: no pueden alterar el siguiente.
  programar(ms, fn) {
    if (this.rapido) return fn();
    const id = setTimeout(() => { this.temporizadores?.delete(id); fn(); }, Math.max(0, ms) / this.vel);
    (this.temporizadores ??= new Set()).add(id);
  }
  async ejecutar(beat, ms) {
    for (const id of this.temporizadores ?? []) clearTimeout(id);
    this.temporizadores = new Set();
    this.cancelarFeedCola(); clearTimeout(this.feedTimer); clearTimeout(this.subTimer);
    this.feedPendiente = null;
    this.feedEl.innerHTML = ''; this.feedEl.dataset.feed = 'oculto';
    for (const n of [this.feedEl,this.subtitulos]) { this.animador.cancelar(n); n.getAnimations().forEach(a=>a.cancel()); n.style.opacity=0; }
    this.destelloEl?.getAnimations().forEach(a=>a.cancel()); if(this.destelloEl) this.destelloEl.style.opacity=0;
    this.restablecerZoomInstante(); this.restaurarUIDeMapaInstante();
    await super.ejecutar(beat, ms);
  }

  // Quita lo transitorio de la batalla, la traicion o el final (no el feed ni el mapa).
  ocultarTransitorios() { for (const n of [this.cartelEl, this.flashEl, this.tarjetaEl, this.vsEl, this.finalEl, this.vela]) this.ocultar(n); this.restablecerZoomInstante(); this.restaurarUIDeMapaInstante(); }
  limpiarTurno() {
    this.cancelarFeedCola();
    clearTimeout(this.subTimer);
    for (const n of [this.cartelEl, this.flashEl, this.tarjetaEl, this.vsEl, this.finalEl, this.vela, this.cFlechas]) { this.animador.cancelar(n); n.getAnimations().forEach((x) => x.cancel()); }
    for (const n of [this.cartelEl, this.flashEl, this.tarjetaEl, this.vsEl, this.finalEl, this.vela]) n.style.opacity = 0;
    this.limpiarLienzo(this.cFlechas); this.cFlechas.style.opacity = 1; this.flechasPintadas = 0;
    this.restablecerZoomInstante(); this.restaurarUIDeMapaInstante(); // nada de un zoom o una UI oculta de la batalla/Maravilla anterior sigue al cambiar de beat
  }

  mostrarEstadoInicial(beat) {
    this.limpiarTurno();
    this.turno = beat.mano;
    this.cancelarFeedCola();
    clearTimeout(this.feedTimer);
    this.feedEl.getAnimations().forEach((x) => x.cancel());
    this.feedEl.style.opacity = 1; this.feedEl.dataset.feed = ''; this.feedEl.innerHTML = '';
    const e = beat.pasos.find((p) => p.tipo === 'estado');
    if (e) this.pintarMapa(e);
    this.cabecera.querySelector('.mano').textContent = `Turno ${beat.mano} / ${TURNOS_TOPE}`;
    this.cabecera.querySelector('.tit').textContent = 'Guerra de territorios';
  }
  fijarEstado(e) { this.pintarMapa(e); }

  // Lo que la escena informa de si misma (para la herramienta de capturas): que no quede nada del turno anterior.
  estadoVisible() {
    return {
      tarjetas: [this.tarjetaEl, this.vsEl].filter((n) => this.opacidad(n) > 0.01).length,
      carteles: this.opacidad(this.cartelEl) > 0.01 ? 1 : 0,
      flashbacks: this.opacidad(this.flashEl) > 0.01 ? 1 : 0,
      flechas: this.flechasPintadas,
      panel: this.opacidad(this.finalEl),
      reinos: this.mapa.k,
      filasMarcador: this.filasConTinta(),
    };
  }

  // Cuantas de las filas del marcador (una por reino) tienen algo dibujado: un marcador vacio se vio en las primeras capturas y ninguna prueba de Node lo veia.
  filasConTinta() {
    const { width, height } = this.cMarcador, k = this.mapa.k, pix = this.cMarcador.getContext('2d').getImageData(0, 0, width, height).data;
    let filas = 0;
    for (let s = 0; s < k; s++) {
      const desde = Math.floor((s * height) / k), hasta = Math.floor(((s + 1) * height) / k);
      for (let y = desde, hay = false; y < hasta && !hay; y++) for (let x = 0; x < width && !hay; x++) if (pix[(y * width + x) * 4 + 3] > 0) { hay = true; filas++; }
    }
    return filas;
  }

  // ---- los beats ----
  async abrir(beat, ms) {
    this.mostrarEstadoInicial(beat);
    for (const c of [this.cTerreno, this.cReinos]) this.anim(c, [{ opacity: 0 }, { opacity: 1 }], { duration: Math.min(900, ms * 0.4) });
    this.cabecera.querySelector('.tit').textContent = `Guerra de territorios · ${NOMBRES_BIOMA[this.mapa.bioma] ?? ''}`;
    await this.esperar(ms * 0.4);
  }

  async mostrarOrdenes(beat, ms) {
    this.limpiarTurno();
    this.turno = beat.mano;
    this.cabecera.querySelector('.mano').textContent = `Turno ${beat.mano} / ${TURNOS_TOPE}`;
    const e = beat.pasos.find((p) => p.tipo === 'estado');
    if (e) this.pintarMapa(e);
    const fl = beat.pasos.find((p) => p.tipo === 'flechas');
    if (fl?.lista?.length) {
      const g = this.cFlechas.getContext('2d');
      for (const f of fl.lista) { const a = this.centro(f.de), b = this.centro(f.a); if (a && b) pintarFlecha(g, a, b, colorSolido(this.colores, f.k), f.n, this.radioFicha()); }
      this.flechasPintadas = fl.lista.length;
      this.anim(this.cFlechas, [{ opacity: 0 }, { opacity: 1 }], { duration: 450 });
      this.sonar(fl);
    }
    this.agregarFeed(beat.pasos.find((p) => p.tipo === 'feed')?.lista);
    await this.esperar(ms * 0.5);
  }

  async mostrarTraicion(beat, ms) {
    this.ocultarTransitorios();
    this.cartelEl.classList.remove('dorado'); // por si quedo del cartel de la Maravilla (resolver)
    const cartel = beat.pasos.find((p) => p.tipo === 'cartel'), flash = beat.pasos.find((p) => p.tipo === 'flashback');
    this.cartelEl.innerHTML = `<div>${this.nombreHTML(cartel.k)} rompió su pacto con ${this.nombreHTML(cartel.contra)}</div>`;
    this.mostrar(this.cartelEl, 400, [{ opacity: 0, transform: 'scale(.8)' }, { opacity: 1, transform: 'scale(1)' }]);
    this.sonar(cartel);
    this.agregarFeed(beat.pasos.find((p) => p.tipo === 'feed')?.lista);
    await this.esperar(ms * 0.3);
    if (flash) {
      this.flashEl.innerHTML = `<div class="cab">${ICONOS.candado}Turno ${esc(flash.turnoDelMensaje)} · en privado</div><div class="quien">${this.nombreHTML(flash.de)} le escribió a ${this.nombreHTML(flash.a)}:</div><div class="cita">«${esc(flash.texto)}»</div>`;
      this.mostrar(this.flashEl, 450);
      this.sonar(flash);
    }
    await this.esperar(ms * 0.4);
  }

  // «L5 A3» con la letra de cada tipo en su color (el de la barra de las fichas).
  composicionHTML(pila) { return (pila ?? []).map((n, t) => (n > 0 ? `<i style="color:${COLOR_DE_TIPO[t]}">${LETRAS_DE_UNIDAD[t]}${n}</i>` : '')).filter(Boolean).join(' '); }
  htmlColumna(t, b, tipo) {
    const chips = [];
    // 2.0.0: con mas de un tipo de unidad (o uno que no es Lancero) la tarjeta dice la mezcla; y si el bando es una coalicion, quienes lo acompanan (con sus tropas de visita)
    if (Array.isArray(b.uni) && (b.uni.filter((n) => n > 0).length > 1 || b.uni[0] === 0)) chips.push(`<span>${this.composicionHTML(b.uni)}</span>`);
    for (const m of (b.miembros ?? []).filter((x) => x.k !== b.k)) chips.push(`<span class="alia">con ${esc(this.nombre(m.k))} ${this.composicionHTML(m.uni)}</span>`);
    if (!b.defensor && b.armas > 0) chips.push(`<span class="oro">Armas ×${f2(multiplicadorDeArmas(b.armas))}</span>`);
    if (b.defensor) {
      if (t.fort > 0) chips.push(`<span class="oro">Fortaleza ×${f2(multiplicadorDeFortaleza(t.fort))}</span>`);
      chips.push(`<span>${{ ll: 'Llanura', bo: 'Bosque', mo: 'Montaña' }[t.terr] ?? 'Terreno'} ×${f2(TERRENO[t.terr] ?? 1)}</span>`);
    }
    const rol = b.defensor ? 'Defiende' : 'Ataca';
    const estilo = estiloJugador(this.partida.jugadores[b.k]);
    if (tipo === 'vs') return `<div class="vs-col" style="${estilo}"><div class="vs-rol">${rol}</div><div class="vs-nom">${esc(this.nombre(b.k))}</div><div class="vs-trp">${b.n}</div><div class="vs-lbl">${b.n === 1 ? 'tropa' : 'tropas'}</div><div class="vs-chips">${chips.join('')}</div><div class="vs-f">${f2(b.f)}</div></div>`;
    return `<div class="tc-col" style="${estilo}"><div class="tc-rol">${rol}</div><div class="tc-nom">${esc(this.nombre(b.k))}</div><div class="tc-trp"><b>${b.n}</b>${b.n === 1 ? 'tropa' : 'tropas'}</div><div class="tc-chips">${chips.join('')}</div><div class="tc-f"><small>Fuerza</small>${f2(b.f)}</div></div>`;
  }
  htmlVeredicto(t) {
    const def = t.bandos.find((b) => b.defensor), q = t.quedan, nom = this.nombreHTML(t.ganador);
    if (t.resultado === 'captura') return `Gana ${nom} · ${def ? 'conquista' : 'toma'} ${esc(t.nombre)} · le ${q === 1 ? 'queda' : 'quedan'} ${tropas(q)}`;
    if (t.resultado === 'repelido') return `${nom} resiste en ${esc(t.nombre)} · le ${q === 1 ? 'queda' : 'quedan'} ${tropas(q)}`;
    return def ? `Empate · ${this.nombreHTML(def.k)} resiste con ${tropas(q)}` : `Empate · nadie se queda con ${esc(t.nombre)}`;
  }

  async mostrarBatalla(beat, ms) {
    this.ocultarTransitorios();
    const t = beat.pasos.find((p) => p.tipo === 'tarjeta');
    const movs = this.partida.rondas[beat.registro]?.movs ?? [];
    // zoom suave al territorio disputado y se oculta el resto de la UI fija (cabecera, aviso, marcador): se resaltan las dos regiones, con las flechas de quienes atacan y el estallido
    this.limpiarLienzo(this.cFlechas);
    const g = this.cFlechas.getContext('2d'), destino = this.centro(t.d);
    this.ocultarUIDeMapa();
    this.aplicarZoom(destino, ZOOM_BATALLA);
    pintarContorno(g, this.mapa, this.geom, t.d, '#ffffff', 5);
    for (const m of movs.filter((x) => x.d === t.d)) { pintarContorno(g, this.mapa, this.geom, m.f, '#e0b25c', 3); const a = this.centro(m.f); if (a && destino) pintarFlecha(g, a, destino, colorSolido(this.colores, m.k), m.n, this.radioFicha()); }
    if (destino) this.destelloBatalla(destino);
    this.flechasPintadas = movs.filter((x) => x.d === t.d).length;
    // con la ventana de zoom fija, la tarjeta siempre va en su banda compacta debajo (L.zoomTarjeta): nunca se sale de la zona segura
    const vs = t.variante === 'C', nodo = vs ? this.vsEl : this.tarjetaEl;
    poner(nodo, this.L.zoomTarjeta);
    const tipo = vs ? 'vs' : 'a', veredicto = `<div class="tc-veredicto${t.resultado === 'captura' ? '' : ' mal'}">${this.htmlVeredicto(t)}</div>`;
    const barra = `<div class="tc-barra">${t.bandos.map((b) => `<i style="${estiloJugador(this.partida.jugadores[b.k])}"></i>`).join('')}</div>`;
    const titulo = `${vs ? 'vs-titulo' : 'tc-titulo'}`;
    nodo.innerHTML = vs
      ? `<div class="${titulo}">Batalla por ${esc(t.nombre)}</div><div class="vs-cols">${t.bandos.map((b) => this.htmlColumna(t, b, tipo)).join('')}${t.bandos.length === 2 ? '<div class="vs-medio">VS</div>' : ''}</div>${barra}${veredicto}`
      : `<div class="${titulo}">Batalla por ${esc(t.nombre)}</div><div class="tc-cols">${t.bandos.map((b) => this.htmlColumna(t, b, tipo)).join('')}</div>${barra}${veredicto}`;
    nodo.style.display = 'flex';
    this.mostrar(nodo, vs ? 500 : 420, vs ? [{ opacity: 0, transform: 'scale(1.06)' }, { opacity: 1, transform: 'scale(1)' }] : undefined);
    // la barra de fuerzas se reparte, y al final el veredicto con su sonido
    const segmentos = [...nodo.querySelectorAll('.tc-barra i')];
    segmentos.forEach((s) => { s.style.flexGrow = 1; });
    this.programar(500, () => segmentos.forEach((s, i) => { s.style.flexGrow = Math.max(0.05, t.bandos[i].f); }));
    const v = nodo.querySelector('.tc-veredicto');
    const cineMs = Math.min(6500, Math.max(4000, ms - 4500));
    // el zoom de la disputa suena a guerra todo el tiempo que dura: las cinco grabaciones a la vez (gritos y multitud repetidos; espadazos al azar), en tiempo real (el zoom dura cineMs a la velocidad de la escena)
    this.sfx.batalla(Math.max(0, cineMs - 300) / this.vel);
    this.programar(cineMs - 2200, () => { v.style.opacity = 1; if (t.resultado === 'captura') this.sfx.gana(); else this.sfx.pierde(); });
    this.agregarFeed(beat.pasos.find((p) => p.tipo === 'feed')?.lista);
    // antes de que termine el beat, se deja ver el veredicto con el zoom puesto y luego se vuelve al mapa completo (nunca se queda zoom de una batalla encima de la siguiente); en
    // capturas (`rapido`) el beat se detiene con el zoom a la vista, para poder revisarlo, y el beat siguiente lo limpia (ocultarTransitorios/limpiarTurno)
    if (!this.rapido) this.programar(cineMs - 500, () => { this.ocultar(nodo); this.quitarZoomMapa(); this.programar(500, () => { this.actualizarTerritorioDeBatalla(t); this.restaurarUIDeMapa(); }); });
    await this.esperar(cineMs);
  }

  actualizarTerritorioDeBatalla(t) {
    if (!this.estadoMapa || !Number.isInteger(t.d)) return;
    const e=structuredClone(this.estadoMapa);
    if(t.resultado==='captura') e.dueno[t.d]=t.ganador;
    if(e.tropas) e.tropas[t.d]=t.quedan;
    // La composición completa se actualiza con el cierre guardado; no se adivinan bajas por tipo.
    delete e.uni;
    this.pintarMapa(e);
  }

  // Dos espadas REALES (la de la hoja de iconos, espadas.js) que chocan en el punto de la batalla, dentro del mapa acercado: se mueven y escalan con el zoom porque viven dentro de mapaZoom. No llevan sonido propio: la
  // batalla suena como paisaje aparte (sfx.batalla), con los espadazos al azar. Las espadas terminan en el reposo donde el CSS las deja (centradas con su translate): ya no se mueve la imagen en el ultimo cuadro.
  // En capturas (`rapido`) y con movimiento reducido se ven quietas y cruzadas.
  destelloBatalla(destino) {
    if (!this.mapaZoom) return;
    if (!this.destelloEl) { this.destelloEl = el('destello-conq'); this.mapaZoom.append(this.destelloEl); }
    const d = this.destelloEl;
    d.getAnimations({ subtree: true }).forEach((a) => a.cancel()); // nada de la batalla anterior sigue animandose
    d.style.left = `${destino.x}px`; d.style.top = `${destino.y - 28}px`;
    d.innerHTML = htmlDeEspadas();
    if (this.rapido || this.reducido()) { d.style.opacity = 1; return; }
    d.style.opacity = ''; // la opacidad la lleva la animacion: al terminar vuelve a la de reposo (apagada)
    const duracion = ESPADAS.cicloMs * ESPADAS.vueltas, [izq, der] = d.querySelectorAll('.par'), chispa = d.querySelector('.chispa');
    this.anim(d, cuadrosDeEspadas(), { duration: duracion });
    this.anim(izq, cuadrosDeEspada(-1), { duration: ESPADAS.cicloMs, iterations: ESPADAS.vueltas });
    this.anim(der, cuadrosDeEspada(1), { duration: ESPADAS.cicloMs, iterations: ESPADAS.vueltas });
    this.anim(chispa, cuadrosDeChispa(), { duration: ESPADAS.cicloMs, iterations: ESPADAS.vueltas });
  }

  async resolver(beat, ms) {
    this.ocultarTransitorios();
    this.limpiarLienzo(this.cFlechas); this.flechasPintadas = 0;
    const conq = beat.pasos.find((p) => p.tipo === 'conquistas'), estado = beat.pasos.find((p) => p.tipo === 'estado');
    // la Maravilla en obra: suena el cuerno (DeVern) cada turno que su cuenta avanza y el gong (JensZygar) cuando la obra termina y queda construida (sonido-conquista.js); se mira antes de repintar el mapa
    const sonidoDeObra = sonidoDeMaravilla(this.estadoMapa?.maravilla, estado?.maravilla);
    if (estado) this.pintarMapa(estado);
    if (sonidoDeObra === 'obra') this.sfx.obra(); else if (sonidoDeObra === 'construida') this.sfx.construida();
    if (conq?.lista?.length) {
      const g = this.cFlechas.getContext('2d');
      for (const c of conq.lista) pintarContorno(g, this.mapa, this.geom, c.r, '#ffffff', 4);
      this.sonar(conq);
      this.cFlechas.style.opacity = 1;
      this.programar(Math.min(1400, ms * 0.6), () => { this.limpiarLienzo(this.cFlechas); });
    }
    for (const c of beat.pasos.filter((p) => p.tipo === 'pacto')) this.sonar(c);
    for (const c of beat.pasos.filter((p) => p.tipo === 'cumplido')) {
      this.sonar(c);
      if (c.textos.length) {
        this.flashEl.innerHTML = `<div class="cab">${ICONOS.candado}Pacto cumplido · lo que se dijeron en privado</div>${c.textos.map((x) => `<div class="quien">${this.nombreHTML(x.k)} a ${this.nombreHTML(x.a)} (turno ${esc(x.turno)}):</div><div class="cita">«${esc(x.texto)}»</div>`).join('')}`;
        this.mostrar(this.flashEl, 450);
      }
    }
    // zoom tambien al construir la Maravilla: un cartel dorado sobre la region, con el resto de la UI oculta igual que en una batalla
    // 2.0.0: resolver puede traer mas de un paso 'maravilla' en el mismo turno (dos reinos la completan en el mismo cierre); se muestran en orden, cada uno con su propio zoom.
    const maravillas = beat.pasos.filter((p) => p.tipo === 'maravilla');
    if (maravillas.length) {
      poner(this.cartelEl, this.L.zoomTarjeta);
      this.ocultar(this.flashEl, 0);
      for (const maravilla of maravillas) {
        this.ocultarUIDeMapa();
        const centro=this.centro(maravilla.r); this.aplicarZoom({x:centro.x,y:centro.y-this.radioFicha()*2.3}, ZOOM_MARAVILLA);
        this.cartelEl.classList.add('dorado');
        this.cartelEl.innerHTML = '<div>' + this.nombreHTML(maravilla.k) + ' construye la Maravilla</div>';
        this.mostrar(this.cartelEl,400); this.sfx.obra(); // la Maravilla empieza a construirse: el cuerno de guerra (DeVern); suena otra vez cada turno de obra y el gong cuando queda construida (arriba)
        await this.esperar(4800);
        this.ocultar(this.cartelEl); this.quitarZoomMapa();
        await this.esperar(600);
        this.cartelEl.classList.remove('dorado'); this.restaurarUIDeMapa();
      }
    }
    this.agregarFeed(beat.pasos.find((p) => p.tipo === 'feed')?.lista);
    await this.esperar(ms * 0.6);
  }

  // La ficha de una IA antes del ranking: su nombre, su puesto y sus cinco caracteristicas (las notables resaltadas), en la pantalla del final; cada ficha reemplaza a la anterior.
  async mostrarRasgos(beat, ms) {
    for (const n of [this.cartelEl, this.flashEl, this.tarjetaEl, this.vsEl, this.vela]) this.ocultar(n); // el panel del final lo ocupa la ficha: nada de batalla, traicion ni flashback encima
    this.restablecerZoomInstante(); this.restaurarUIDeMapaInstante(); this.cartelEl.classList.remove('dorado');
    const r = beat.pasos.find((p) => p.tipo === 'rasgos');
    const reino = nombreDeReino(r.k, this.partida.reinos);
    const filas = r.filas.map((f) => `<div class="rg-fila${f.notable ? ' nota' : ''}"><b>${esc(f.etiqueta)}</b><span>${esc(f.frase)}</span></div>`).join('');
    this.finalEl.innerHTML = `<div class="pf-titulo">Cómo jugó</div><div class="rg-cab" style="${estiloJugador(this.partida.jugadores[r.k])}"><span class="rg-pos">${esc(r.posicion)}º</span><span class="rg-nom">${esc(this.nombre(r.k))}</span>${reino ? `<span class="rg-reino">${esc(reino)}</span>` : ''}</div>${filas}`;
    this.mostrar(this.finalEl, 450);
    await this.esperar(ms * 0.5);
  }

  async terminar(beat, ms) {
    this.limpiarTurno();
    const f = beat.pasos.find((p) => p.tipo === 'final');
    const filas = f.ranking.map((x) => `<div class="pf-fila${x.cayoEn ? ' cayo' : ''}" style="${estiloJugador(this.partida.jugadores[x.k])}"><div class="pf-pos">${x.posicion}</div><div class="pf-nom">${esc(this.nombre(x.k))}</div><div class="pf-datos">${x.regiones} reg. · ${x.tropas} tropas${x.cayoEn ? ` · cayó en el turno ${esc(x.cayoEn)}` : ''}</div><div class="pf-pts">${x.puntos} pts</div></div>`).join('');
    const momentos = f.momentos.length ? `<h3>Momentos clave</h3>${f.momentos.map((m) => `<div class="pf-mom"><b>Turno ${esc(m.turno)}</b>${esc(m.texto)}</div>`).join('')}` : '';
    const privados = f.sinRevelar.length ? `<h3>Lo que se dijeron en privado</h3>${f.sinRevelar.map((m) => `<div class="pf-priv"><small>${this.nombreHTML(m.k)} a ${this.nombreHTML(m.a)} · turno ${esc(m.turno)}</small>«${esc(m.texto)}»</div>`).join('')}` : '';
    this.finalEl.innerHTML = `<div class="pf-titulo">Fin de la guerra</div><div class="pf-sub">Mapa ${esc(NOMBRES_BIOMA[f.bioma] ?? '')}</div>${f.ganoPorMaravilla ? '<div class="pf-marca">Victoria por la Maravilla</div>' : ''}${filas}${momentos}${privados}`;
    this.finalEl.classList.remove('apretado');
    if (this.finalEl.scrollHeight > this.finalEl.clientHeight + 1) this.finalEl.classList.add('apretado'); // en vertical la zona segura deja menos alto: el panel se aprieta (letra y espacios mas chicos) antes de cortar los privados
    this.mostrar(this.finalEl, 600);
    await this.esperar(ms * 0.5);
  }

  // El narrador no puede adelantar lo que el feed todavia no mostro: en vertical los subtitulos entran y se apagan con el mismo fundido y el mismo ciclo que el feed (FEED.FUNDIDO_MS),
  // en vez del timer propio de MesaBase (msVisibleDeSubtitulo), que no sabe de la cola de avisos encolados.
  mostrarSubtitulos(beat, ms) {
    this.pintarSubtitulos(beat);
    this.subtitulos.style.opacity = 0;
    const cine = beat.tipo === 'batalla' || beat.pasos?.some(p=>p.tipo==='maravilla');
    if (!cine && !beat.pasos?.some(p=>p.tipo==='feed' && p.lista?.length)) this.mostrarFeed(1);
  }

  // Los subtitulos son lo que se dice del beat (`dicho`: hechos tal cual y frases de contexto en cursiva); con razon=1 la resolucion agrega lo que pensaba cada IA (junto a la consecuencia, nunca antes).
  pintarSubtitulos(beat) {
    super.pintarSubtitulos(beat);
    const r = beat.pasos?.find((p) => p.tipo === 'razones');
    if (this.razon && r?.lista?.length) {
      this.subtitulos.insertAdjacentHTML('beforeend', r.lista.map((x) => `<div class="razon"><small>${esc(this.nombre(x.k))} piensa</small>${esc(x.texto)}</div>`).join(''));
      this.ajustarSubtitulos();
    }
  }
}
