// Armazon de la pagina de escenas de casino (navegador): parametros, lista de partidas de los archivos abiertos, reproduccion, voz y sonido. Sirve a TODOS los juegos con escena:
// cada partida lleva su juego y el registro (lineas.js) dice cual es su linea de tiempo y su mesa. Aqui no se decide nada del juego: cada beat trae lo que hay que mostrar y la mesa
// del juego lo anima. Lo puro (parametros, duraciones, lineas de tiempo, camara, diseno, sonido) vive en modulos que se prueban en Node; esta pagina se verifica mirando
// (herramientas/capturar-escena.mjs).
//
// Uso: escena.html?archivo=a.json,b.json&partida=1&mano=1&hasta=16&formato=9x16|16x9|hoja&camara=2&vel=1&razon=1&sonido=0&voz=data/voz/x-p1/voz.json&auto=1&limpio=1

import { POSICION_EN_HOJA } from './layout.js';
import { htmlDefs } from './kit.js';
import { escenaDe, juegosConEscena } from './lineas.js';
import { leerParametros, recortarClip, duracionDeBeat, marcarTiempos, listaDeArchivos, catalogarPartidas, primeraValida, esRutaRelativa } from './escena-config.js';
import { crearSonido } from './sonido.js';
import { crearAzar, seedDeTexto } from './azar.js';

export async function iniciar() {
  const params = leerParametros(location.search);
  document.body.classList.toggle('limpio', params.limpio);
  const aviso = (t) => { document.getElementById('estado').textContent = t; };
  const marco = document.getElementById('marco');
  const selector = document.getElementById('selPartida');
  const botones = ['btnPlay', 'btnReiniciar', 'btnTiempos'].map((id) => document.getElementById(id));
  const habilitar = (si) => botones.forEach((b) => { b.disabled = !si; });
  habilitar(false);

  document.body.insertAdjacentHTML('afterbegin', htmlDefs());
  // las fuentes se cargan al usarse: se piden antes de montar nada, porque los subtitulos se miden (y se achican si no caben) con la fuente ya puesta
  await Promise.all(['600 20px "Barlow Condensed"', '700 20px "Barlow Condensed"', '800 20px "Barlow Condensed"', '500 20px Inter', '600 20px Inter', '700 20px Inter'].map((f) => document.fonts.load(f).catch(() => [])));
  let azarSonido = crearAzar(1); // se cambia al montar cada partida: asi el mismo archivo suena siempre igual
  const sfx = crearSonido({ activo: params.sonido, azar: () => azarSonido() });
  const mudo = crearSonido({ activo: false });
  const detenerEn = new URLSearchParams(location.search).get('detener'); // para capturas: avanza al instante hasta ese beat y se queda ahi
  let voz = null;
  let avisoVoz = ''; // se queda en la barra: grabar sin voz sin enterarse seria peor que un aviso
  if (params.voz) { try { voz = await (await fetch(params.voz)).json(); } catch { avisoVoz = ' · No pude leer la voz: se usan los tiempos mínimos.'; } }

  let catalogo = [];
  let actual = null; // la partida montada: { entrada, partida, beats, marcas, mesas, ancho, alto }
  let generacion = 0; // cada vez que se monta otra partida sube: una reproduccion vieja se da cuenta y se retira
  let corriendo = false;

  const ajustar = () => {
    if (!actual) return;
    const escala = params.escala === 'ajustar' ? Math.min(innerWidth / actual.ancho, (innerHeight - (params.limpio ? 0 : 64)) / actual.alto) : params.escala;
    marco.style.transform = `scale(${escala})`;
    document.getElementById('hueco').style.cssText = `width:${actual.ancho * escala}px;height:${actual.alto * escala}px`;
  };
  addEventListener('resize', ajustar);

  // Monta la escena de una partida (la que sea de la lista, de cualquier juego con escena): reemplaza la anterior por completo.
  async function montar(entrada) {
    actual?.mesas.forEach((m) => { m.sfx = mudo; }); // la escena que se abandona deja de sonar
    const miGeneracion = ++generacion;
    corriendo = false;
    for (const k of ['terminada', 'detenida', 'estado', 'error', 'duracionMs', 'esperadaMs']) delete document.body.dataset[k];
    const partida = entrada.partida;
    const escena = escenaDe(entrada.juego);
    const [linea, { Mesa }] = await Promise.all([escena.linea(), escena.mesa()]);
    if (miGeneracion !== generacion) return; // mientras se cargaban los modulos se abrio otra partida
    const camara = params.camara ?? escena.camaraPorDefecto;
    let beats = recortarClip(linea.construirLineaDeTiempo(partida, { camara }), params.mano, params.hasta);
    if (params.razon && linea.conRazones) beats = linea.conRazones(beats, partida);
    marco.innerHTML = '';
    if (!beats.length) { actual = null; habilitar(false); return aviso(`La partida no tiene esa ${escena.unidad === 'mano' ? 'mano' : 'ronda'}.`); }
    azarSonido = crearAzar(seedDeTexto(`sonido:${partida.seed}`));
    const formatos = params.formato === 'hoja' ? ['9x16', '16x9'] : [params.formato];
    const mesas = formatos.map((f, i) => new Mesa(f, partida, { sfx: i === 0 ? sfx : mudo, razon: params.razon, vel: params.vel }));
    const [ancho, alto] = params.formato === 'hoja' ? [3840, 2160] : [mesas[0].L.ancho, mesas[0].L.alto];
    Object.assign(marco.style, { width: `${ancho}px`, height: `${alto}px` });
    mesas.forEach((m) => {
      const sitio = params.formato === 'hoja' ? POSICION_EN_HOJA[m.formato] : { x: 0, y: 0 };
      Object.assign(m.raiz.style, { left: `${sitio.x}px`, top: `${sitio.y}px` });
      marco.append(m.raiz);
    });
    mesas.forEach((m) => m.mostrarEstadoInicial(beats[0])); // antes de reproducir, la mesa ya muestra el estado con el que empieza el clip
    const marcas = marcarTiempos(beats, voz, params.vel);
    actual = { entrada, partida, beats, marcas, mesas, ancho, alto };
    window.escena = { beats, marcas, mesas, partida };
    ajustar();
    habilitar(true);
    selector.value = entrada.clave;
    aviso(`${entrada.titulo} — ${beats.length} momentos, ${(marcas.at(-1).finMs / 1000).toFixed(0)} s a velocidad ${params.vel}${avisoVoz}`);
  }
  const montarSeguro = (entrada) => montar(entrada).catch((e) => { console.error('escena: no se pudo armar', e); document.body.dataset.error = String(e); aviso(`No pude armar la escena: ${e.message}`); });

  async function reproducir() {
    if (corriendo || !actual) return;
    const { beats, marcas, mesas } = actual;
    const miGeneracion = generacion;
    corriendo = true;
    window.escenaTerminada = false;
    const inicio = performance.now();
    try {
      for (const [i, beat] of beats.entries()) {
        const rapido = detenerEn !== null && i <= Number(detenerEn);
        mesas.forEach((m) => { m.rapido = rapido; });
        const audio = voz?.[beat.id]?.archivo;
        if (audio && params.sonido && esRutaRelativa(audio)) {
          try { const voz1 = new Audio(audio); voz1.playbackRate = params.vel; voz1.play().catch(() => {}); } catch { /* sin voz */ }
        }
        await Promise.all(mesas.map((m) => m.ejecutar(beat, duracionDeBeat(beat, voz, 1)))); // los beats trabajan a velocidad 1; la mesa aplica vel
        if (miGeneracion !== generacion) return; // mientras tanto se abrio otra partida
        if (detenerEn !== null && i === Number(detenerEn)) {
          // en modo rapido las animaciones de 1 ms aun no corrieron: se terminan a la fuerza antes de informar el estado (si no, el estado sale "limpio" aunque no lo este)
          document.getAnimations().forEach((x) => { try { x.finish(); } catch { /* una animacion sin fin no cuenta */ } });
          window.escenaDetenida = true; document.body.dataset.detenida = '1'; document.body.dataset.estado = JSON.stringify(mesas[0].estadoVisible()); corriendo = false; return;
        }
      }
      window.escenaTerminada = true;
      document.body.dataset.duracionMs = (performance.now() - inicio).toFixed(1); // medido contra lo que dice la linea de tiempo exportada
      document.body.dataset.esperadaMs = String(marcas.at(-1).finMs);
      document.body.dataset.terminada = '1'; // la herramienta de capturas lo busca para saber que la partida llego al final
    } catch (e) {
      console.error('escena: la reproduccion se detuvo', e);
      document.body.dataset.error = String(e);
    }
    if (miGeneracion === generacion) corriendo = false;
  }

  // La lista de partidas de todos los archivos abiertos; las de un juego sin escena salen apagadas y dicen por que.
  function llenarLista() {
    selector.innerHTML = '';
    for (const e of catalogo) {
      const o = Object.assign(document.createElement('option'), { value: e.clave, textContent: e.valida ? e.titulo : `${e.titulo} (${e.motivo})` });
      o.disabled = !e.valida;
      selector.append(o);
    }
    selector.disabled = !catalogo.some((e) => e.valida);
  }

  async function abrir(cargados, preferida = null) {
    catalogo = catalogarPartidas(cargados);
    llenarLista();
    const elegida = primeraValida(catalogo, preferida);
    if (!elegida) {
      actual = null; marco.innerHTML = ''; habilitar(false);
      return aviso(`Ninguna partida sirve: ${catalogo.slice(0, 3).map((e) => `${e.archivo} (${e.motivo})`).join('; ')}`);
    }
    await montarSeguro(elegida);
    if (preferida && (elegida.archivo !== preferida.archivo || elegida.numero !== preferida.numero)) aviso(`La partida ${preferida.numero} de ${preferida.archivo} no sirve: se abrió ${elegida.titulo}`);
  }

  selector.onchange = () => { const e = catalogo.find((x) => x.clave === selector.value); if (e?.valida) montarSeguro(e); };
  document.getElementById('archivo').onchange = async (ev) => {
    const archivos = [...ev.target.files];
    if (!archivos.length) return;
    const cargados = await Promise.all(archivos.map(async (f) => {
      try { return { nombre: f.name, datos: JSON.parse(await f.text()) }; } catch { return { nombre: f.name, datos: null, error: 'no es un JSON válido' }; }
    }));
    await abrir(cargados);
    ev.target.value = ''; // asi se pueden volver a elegir los mismos archivos
  };
  document.getElementById('btnPlay').onclick = async () => { await sfx.preparar(); reproducir(); };
  document.getElementById('btnReiniciar').onclick = () => { if (actual) montarSeguro(actual.entrada); };
  document.getElementById('btnTiempos').onclick = () => {
    if (!actual) return;
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([JSON.stringify(actual.marcas, null, 2)], { type: 'application/json' })), download: 'linea-de-tiempo.json' });
    a.click();
  };

  const nombres = listaDeArchivos(params.archivo);
  if (!nombres.length) {
    const juegos = juegosConEscena().map((id) => escenaDe(id).nombre).join(', ');
    return aviso(`Elige uno o varios JSON con «Abrir JSON» (partidas guardadas de ${juegos} en data/ o data/pruebas/), o abre la página con ?archivo=a.json,b.json. Parámetros: partida, mano o ronda, hasta, formato (9x16, 16x9 o hoja), camara (0 a 9), vel, razon, sonido, voz, auto, limpio.`);
  }
  const cargados = await Promise.all(nombres.map(async (nombre) => {
    try {
      const r = await fetch(`data/${nombre}`);
      if (!r.ok) throw new Error(String(r.status));
      return { nombre, datos: await r.json() };
    } catch { return { nombre, datos: null, error: `no pude leer data/${nombre}` }; }
  }));
  await abrir(cargados, { archivo: nombres[0], numero: params.partida });
  if (params.auto && actual) { await sfx.preparar(); reproducir(); }
}
