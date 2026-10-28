import { MesaBase, el, poner } from './mesa-base.js';
import { colocarLobo, ordenarPorVotos } from './layout-lobo.js';
import { ALDEANO_PIXEL } from './personajes-pixel-lobo.js';
import { fotogramasDe, nombreRol, PERSONAJES_ANIMADOS, ENTRADAS } from './lobo-arte.js';
import { textoDeComprobacion } from './narracion-lobo.js';
import { nombresDeEscena, etiquetaAsiento } from './lobo-nombres.js';
import { estiloJugador } from './kit.js';
import { LOBO_AMBIENTE } from '../paleta.js';

export class Mesa extends MesaBase {
  static METODOS = Object.fromEntries(['preparacion', 'noche', 'enamorados', 'amanecer', 'muerte', 'disparo', 'mensaje', 'votacion', 'final', 'identidad', 'elenco'].map((t) => [t, 'contarMomento']));

  constructor(formato, partida, opciones = {}) {
    // La mesa solo retiene metadatos de asientos, nunca registros privados.
    const nombres = nombresDeEscena(partida.jugadores.map((j) => j.nombre)); // el mismo nombre que dice la voz: el modelo, con letra si ocupa varios asientos
    const jugadores = partida.jugadores.map(({ id, color }, i) => ({ id, nombre: nombres[i], color }));
    super(formato, { jugadores }, opciones, colocarLobo(formato, jugadores.length));
    this.generacion = 0;
    this.cacheImagenes = new Map();
    this.armar();
  }

  armar() {
    const { L } = this;
    this.armarBase('Lobo en la aldea');
    this.raiz.classList.add('mesa-lobo');
    for (const [k, v] of Object.entries(LOBO_AMBIENTE)) this.raiz.style.setProperty(`--la-${k}`, v);
    this.escenario = el('fijo escenario-lobo'); poner(this.escenario, L.escenario);
    this.fotograma = document.createElement('img');
    this.fotograma.className = 'fotograma-lobo'; this.fotograma.alt = '';
    this.sobretitulo = el('rotulo-lobo');
    this.escenaTexto = el('relato-lobo');
    this.escenario.append(this.fotograma, this.sobretitulo, this.escenaTexto);
    this.panorama = el('fijo panorama-lobo'); poner(this.panorama, L.panorama);
    this.asientos = L.asientos.map((r, i) => {
      const nodo = el('fijo asiento-lobo'); poner(nodo, r);
      nodo.style.cssText += `;${estiloJugador(this.partida.jugadores[i])}`;
      nodo.dataset.asiento = String(i);
      // El SVG contiene el catálogo común, sin seleccionar ninguna identidad secreta.
      nodo.innerHTML = `<div class="personaje-lobo">${ALDEANO_PIXEL}</div><div class="identidad-lobo"><small>${etiquetaAsiento(i)}</small><strong></strong><span class="voto-lobo"></span><span class="rol-publico-lobo"></span><span class="rol-afirmado-lobo"></span></div>`;
      const nombre = nodo.querySelector('strong'); nombre.textContent = this.nombre(i); nombre.title = this.nombre(i);
      return { nodo, retrato: nodo.querySelector('.personaje-lobo'), rol: nodo.querySelector('.rol-publico-lobo'), afirmado: nodo.querySelector('.rol-afirmado-lobo'), voto: nodo.querySelector('.voto-lobo') };
    });
    this.raiz.dataset.jugadores = String(this.asientos.length);
    this.raiz.append(this.escenario, ...this.asientos.map((a) => a.nodo), this.panorama, this.cabecera, this.subtitulos, this.etiqueta, this.capa);
  }

  aplicarEstado(estado) {
    if (!estado?.jugadores) return;
    this.estado = structuredClone(estado);
    for (const j of estado.jugadores) {
      const a = this.asientos[j.asiento];
      if (!a) continue;
      const rol = j.rol;
      a.retrato.className = `personaje-lobo${rol ? ` revelado-${rol}` : ''}${j.vivo ? '' : ' muerto'}${estado.enamorados?.includes(j.asiento) ? ' enamorado' : ''}`;
      a.nodo.classList.toggle('caido-lobo', !j.vivo);
      a.nodo.classList.toggle('rol-conocido-lobo', !!rol);
      a.rol.textContent = `${j.vivo ? '' : '† '}${nombreRol(rol)}`;
      a.nodo.dataset.rol = rol ?? '';
      a.nodo.dataset.vivo = String(j.vivo);
      if (a.afirmado) a.afirmado.textContent = j.afirmaRol ? `Declaró: ${nombreRol(j.afirmaRol)}` : '';
      if (estado.fin && Number.isFinite(estado.puntos?.[j.asiento])) a.rol.textContent += ` · ${estado.puntos[j.asiento]} pts`;
    }
  }
  fijarEstado(e) { this.aplicarEstado(e); }

  limpiar() {
    this.generacion++;
    this.raiz.classList.remove('mostrando-panorama-lobo');
    this.panorama.replaceChildren();
    this.escenaTexto.replaceChildren();
    this.escenario.className = 'fijo escenario-lobo';
    for (const [i, a] of this.asientos.entries()) {
      poner(a.nodo, this.L.asientos[i]);
      a.voto.textContent = '';
      a.nodo.classList.remove('habla-lobo', 'objetivo-lobo', 'sale-lobo');
      a.nodo.getAnimations().forEach((x) => x.cancel());
    }
    this.votos = 0; this.mensaje = false; this.ordenVotos = [];
  }

  mostrarEstadoInicial(beat) {
    this.limpiar();
    this.aplicarEstado(beat?.pasos?.find((p) => p.tipo === 'estado'));
    this.cabecera.querySelector('.mano').textContent = `Ronda ${beat?.mano ?? 1}`;
    this.sobretitulo.textContent = 'La aldea · identidades ocultas';
    this.fotograma.src = 'arte/lobo/noche-misteriosa-01.png';
  }

  imagenLista(ruta) {
    if (!this.cacheImagenes.has(ruta)) {
      const imagen = new Image(); imagen.src = ruta;
      this.cacheImagenes.set(ruta, imagen.decode());
    }
    return this.cacheImagenes.get(ruta);
  }

  async secuencia(paso, ms, ficha) {
    const archivos = fotogramasDe(paso);
    await Promise.all(archivos.map((ruta) => this.imagenLista(ruta)));
    if (ficha !== this.generacion) return;
    // En las capturas (`rapido`) queda el cuadro de la accion: la noche con la puerta abierta y el figurante (4.o), Cupido entrando (el 1.o de los de noche) o el ultimo.
    this.fotograma.src = archivos[this.rapido ? (paso.tipo === 'noche' ? 3 : paso.tipo === 'enamorados' ? 0 : archivos.length - 1) : 0];
    if (this.rapido) return;
    // Pasos vinculados al beat; no quedan intervalos vivos al saltar o reiniciar.
    for (const ruta of archivos) {
      if (ficha !== this.generacion) return;
      this.fotograma.src = ruta;
      await this.esperar(Math.min(ms * 0.78, 4200) / archivos.length);
    }
  }

  rotular(titulo, detalle = '', clase = '') {
    this.escenaTexto.className = `relato-lobo ${clase}`;
    const h = document.createElement('strong'); h.textContent = titulo;
    this.escenaTexto.append(h);
    if (detalle) { const p = document.createElement('p'); p.textContent = detalle; this.escenaTexto.append(p); }
  }

  async mostrarPreparacion(reparto, ms, ficha) {
    this.raiz.classList.add('mostrando-panorama-lobo');
    this.panorama.className = 'fijo panorama-lobo entrada-aldea-lobo';
    const titulo = el('titulo-panorama-lobo'); titulo.textContent = 'La aldea se prepara para dormir';
    const casas = el('casas-lobo');
    // En las capturas (`rapido`) solo se ve el cuadro 4 (el personaje entra de noche): no se precargan los otros cinco de cada rol.
    const cuadros = this.rapido ? [3] : [0, 1, 2, 3, 4, 5];
    for (const rol of reparto) {
      const casa = el('casa-anonima-lobo');
      const imagen = document.createElement('img'); imagen.className = 'habitante-anonimo'; imagen.alt = '';
      imagen.src = ENTRADAS[rol][cuadros[0]]; casa.append(imagen);
      casas.append(casa);
    }
    this.panorama.append(titulo, casas);
    await Promise.all([...new Set(reparto)].flatMap((rol) => cuadros.map((c) => ENTRADAS[rol][c])).map((ruta) => this.imagenLista(ruta)));
    if (ficha !== this.generacion) return;
    const imagenes = casas.querySelectorAll('img');
    for (const cuadro of cuadros) {
      if (ficha !== this.generacion) return;
      imagenes.forEach((imagen, i) => { imagen.src = ENTRADAS[reparto[i]][cuadro]; });
      if (!this.rapido) await this.esperar(ms * .78 / cuadros.length);
    }
  }

  async mostrarElenco(jugadores, ficha) {
    await Promise.all([...new Set(jugadores.map((j) => j.rol))].map((rol) => this.imagenLista(PERSONAJES_ANIMADOS[rol].archivo)));
    if (ficha !== this.generacion) return;
    this.raiz.classList.add('mostrando-panorama-lobo');
    this.panorama.className = 'fijo panorama-lobo elenco-lobo';
    const titulo = el('titulo-panorama-lobo'); titulo.textContent = 'El elenco completo de la aldea';
    const reparto = el('reparto-lobo');
    // Cada rol trae su propio tamaño de cuadro: todos comparten escala y apoyan los pies en el mismo suelo (hueco de la altura mayor).
    reparto.style.setProperty('--alto-hueco', String(Math.max(...Object.values(PERSONAJES_ANIMADOS).map((a) => a.alto))));
    for (const j of jugadores) {
      const tarjeta = el('integrante-elenco-lobo');
      tarjeta.dataset.asiento = String(j.asiento); tarjeta.dataset.rol = j.rol;
      const animacion = PERSONAJES_ANIMADOS[j.rol];
      const hueco = el('hueco-figura-lobo');
      const figura = el('figura-atlas-lobo'); figura.style.backgroundImage = `url("${animacion.archivo}")`;
      figura.style.setProperty('--cuadros', String(animacion.cuadros));
      figura.style.setProperty('--ancho-cuadro', String(animacion.ancho));
      figura.style.setProperty('--alto-cuadro', String(animacion.alto));
      figura.style.setProperty('--ciclo-atlas',`${Math.max(1.2, animacion.cuadros*.25) / this.vel}s`);
      hueco.append(figura);
      const nombre = el('nombre-elenco-lobo'); nombre.textContent = this.nombre(j.asiento);
      const rol = el('rol-elenco-lobo'); rol.textContent = nombreRol(j.rol);
      tarjeta.append(hueco, nombre, rol);
      if (j.afirmaRol) { const declarado = el('declaracion-elenco-lobo'); declarado.textContent = j.afirmaRol === j.rol ? 'Declaración confirmada' : `Decía: ${nombreRol(j.afirmaRol)}`; tarjeta.append(declarado); }
      reparto.append(tarjeta);
    }
    this.panorama.append(titulo, reparto);
  }

  async contarMomento(beat, ms) {
    this.limpiar();
    const ficha = this.generacion;
    const antes = beat.pasos.find((p) => p.tipo === 'estado');
    const despues = beat.pasos.find((p) => p.tipo === 'estado-final');
    const paso = beat.pasos.find((p) => p.tipo !== 'estado' && p.tipo !== 'estado-final');
    this.aplicarEstado(antes);
    this.cabecera.querySelector('.mano').textContent = ['final', 'identidad', 'elenco'].includes(beat.tipo) ? 'Final' : `Ronda ${beat.mano}`;
    this.escenario.classList.toggle('dia-lobo', !['noche', 'enamorados'].includes(paso.tipo));
    const n = (i) => `${etiquetaAsiento(i)} · ${this.nombre(i)}`;
    this.sobretitulo.textContent = ({ preparacion: 'La aldea se prepara', noche: 'La aldea duerme', enamorados: 'El vínculo de Cupido', amanecer: 'La primera luz', muerte: 'Una identidad revelada', identidad: 'Una declaración al descubierto', disparo: 'El último disparo', mensaje: 'La asamblea · afirmación pública', votacion: 'Votos al descubierto', final: 'Todas las identidades', elenco: 'Elenco completo' })[paso.tipo];
    switch (paso.tipo) {
      case 'preparacion': await this.mostrarPreparacion(paso.casas, ms, ficha); break;
      case 'noche': this.rotular(`Noche ${beat.mano}`, 'Las identidades siguen ocultas.'); break;
      case 'enamorados': {
        // Lobo 1.3.0: el paso trae solo lo que el modo del seed revela (la pareja, a Cupido, las dos cosas o ninguna).
        const unidos = Array.isArray(paso.asientos);
        this.rotular(Number.isInteger(paso.cupido) ? `${n(paso.cupido)} · Cupido` : unidos ? 'Unidos por el destino' : 'Cupido ha elegido', unidos ? paso.asientos.map(n).join('  ♥  ') : 'Sus enamorados son un secreto');
        if (unidos) paso.asientos.forEach((i) => this.asientos[i].nodo.classList.add('objetivo-lobo'));
        break;
      }
      case 'amanecer': this.rotular('Amanece', beat.texto); break;
      case 'muerte':
      case 'identidad':
        this.rotular(paso.comprobacion?.coincide === false ? '¡Había mentido!' : n(paso.asiento), paso.comprobacion ? textoDeComprobacion(this.nombre(paso.asiento), paso.comprobacion) : `Era ${nombreRol(paso.rol)}`, `revelacion-lobo${paso.comprobacion?.coincide === false ? ' mentira-lobo' : ''}`);
        this.asientos[paso.asiento].nodo.classList.add('sale-lobo');
        if (Number.isInteger(paso.pareja)) { // la primera muerte de un enamorado descubre la pareja oculta
          const enamorado = document.createElement('small'); enamorado.textContent = `Era uno de los enamorados · pareja: ${n(paso.pareja)}`; this.escenaTexto.append(enamorado);
          this.asientos[paso.pareja].nodo.classList.add('objetivo-lobo');
        }
        break;
      case 'disparo':
        this.rotular('La venganza del cazador', `${n(paso.asiento)}  →  ${n(paso.objetivo)}`);
        this.asientos[paso.objetivo].nodo.classList.add('objetivo-lobo'); break;
      case 'mensaje':
        this.mensaje = true;
        this.asientos[paso.asiento].nodo.classList.add('habla-lobo');
        this.rotular(n(paso.asiento), paso.mensaje ? `«${paso.mensaje}»` : 'Guarda silencio.', 'declaracion-lobo');
        if (paso.afirmaRol) { const afirmacion = document.createElement('small'); afirmacion.textContent = `Afirma ser ${nombreRol(paso.afirmaRol)} · sin verificar`; this.escenaTexto.append(afirmacion); }
        if (paso.total > 1) {
          const contador = document.createElement('small'); contador.textContent = `${paso.parte} / ${paso.total}`; this.escenaTexto.append(contador);
        }
        break;
      case 'votacion':
        this.votos = paso.votos.length;
        this.ordenVotos = ordenarPorVotos(paso.conteo, this.asientos.length);
        for (const [posicion, asiento] of this.ordenVotos.entries()) {
          const a = this.asientos[asiento], votos = paso.conteo[asiento] ?? 0;
          poner(a.nodo, this.L.asientos[posicion]);
          a.voto.textContent = `${votos} ${votos === 1 ? 'voto' : 'votos'}`;
        }
        if (paso.expulsado !== null) this.asientos[paso.expulsado].nodo.classList.add('objetivo-lobo');
        this.rotular(paso.empate ? 'Empate en la votación' : 'La aldea ha decidido', paso.empate ? 'Nadie es expulsado.' : paso.expulsado === null ? '' : `${n(paso.expulsado)} será expulsado.`); break;
      case 'final': this.rotular(paso.ganadorBando === 'aldea' ? 'Victoria de la aldea' : paso.ganadorBando === 'lobos' ? 'Victoria de los lobos' : 'Empate entre bandos', paso.parejaViva ? (Array.isArray(paso.pareja) ? `Los enamorados eran ${paso.pareja.map(n).join('  ♥  ')} · bono +5 cada uno` : 'Los enamorados sobreviven · bono +5 cada uno') : 'Se revelan todas las identidades.'); break;
      case 'elenco': await this.mostrarElenco(paso.jugadores, ficha); break;
    }
    // La identidad se hace visible exactamente en su beat, no antes durante
    // el resto del turno. En cámara rápida también queda el estado completo.
    this.aplicarEstado(despues);
    if (paso.tipo === 'muerte' && !this.rapido) this.anim(this.asientos[paso.asiento].nodo, [{ opacity: 0.35 }, { opacity: 1 }], { duration: 700 });
    if (!['preparacion', 'elenco'].includes(paso.tipo)) await this.secuencia(paso, ms, ficha);
  }

  estadoVisible() {
    return { jugadores: structuredClone(this.estado?.jugadores ?? []), votos: this.votos ?? 0, mensaje: this.mensaje ?? false,
      imagen: this.fotograma.getAttribute('src'),
      rolesDOM: this.asientos.map((a) => a.nodo.dataset.rol || null),
      enamorados: [...(this.estado?.enamorados ?? [])], fin: this.estado?.fin ?? false, ordenVotos: [...(this.ordenVotos ?? [])] };
  }
}
