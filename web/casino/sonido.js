// Sonido de las escenas de casino. Cada efecto tiene MUESTRAS grabadas (web/audio/, CC0: ver web/audio/LEEME.md) y un respaldo SINTETIZADO con
// WebAudio que suena solo si faltan los archivos, asi la escena nunca queda muda ni se rompe. El audio sale por la fuente Navegador de OBS junto
// con la voz; los efectos van unos 12 dB debajo de ella. Nada de esto toca el DOM ni el audio al importarse (se prueba en Node).

export const VOLUMEN = 0.25; // ganancia maestra: 20 * log10(0.25) = -12 dB

// muestras: archivos opcionales de web/audio/ (si hay varios se elige uno con el azar con seed de la escena).
// sintetico: el respaldo. vol va de 0 a 1 (el maestro lo baja); ruidos y tonos son los de la maqueta aprobada, con `retraso` en segundos.
export const EVENTOS = {
  carta:   { muestras: ['audio/carta-2.ogg'], sintetico: { ruidos: [{ dur: 0.09, f0: 5000, f1: 1800, vol: 0.9 }] } },
  voltear: { muestras: ['audio/voltear-1.ogg'], sintetico: { ruidos: [{ dur: 0.14, f0: 3500, f1: 900, vol: 1 }] } },
  ficha:   { muestras: ['audio/ficha-3.ogg'], sintetico: { tonos: [
    { freq: 1800, dur: 0.06, tipo: 'triangle', vol: 0.6, f1: 1200 }, { freq: 2300, dur: 0.07, tipo: 'triangle', vol: 0.5, f1: 1500, retraso: 0.055 }] } },
  tic:     { muestras: ['audio/tic-1.ogg'], sintetico: { ruidos: [{ dur: 0.02, f0: 4000, f1: 3000, vol: 0.5, q: 6 }] } },
  anuncio: { muestras: ['audio/anuncio-1.ogg'], sintetico: { tonos: [
    { freq: 1320, dur: 0.35, tipo: 'sine', vol: 0.6, f1: 1100 }, { freq: 1760, dur: 0.3, tipo: 'sine', vol: 0.35, retraso: 0.06 }] } },
  duda:    { muestras: ['audio/duda-1.ogg'], sintetico: { tonos: [{ freq: 110, dur: 0.25, tipo: 'square', vol: 0.8, f1: 55 }], ruidos: [{ dur: 0.08, f0: 800, f1: 300, vol: 1 }] } },
  // GANA y PIERDE son grabaciones REALES de multitudes (Freesound, CC0; ver web/audio/LEEME.md), no sonidos sintetizados: un aplauso, un vitoreo o una ovacion; un suspiro, un trombon o un abucheo. Si hay varias, se elige una con el azar de la escena.
  gana:    { muestras: ['audio/gana-aplauso.ogg', 'audio/gana-vitoreo.ogg', 'audio/gana-ovacion.ogg'], sintetico: { tonos: [523, 659, 784, 1047].map((freq, i) => ({ freq, dur: 0.28, tipo: 'triangle', vol: 0.65, retraso: i * 0.11 })) } },
  dado:    { muestras: ['audio/dado-1.ogg', 'audio/dado-2.ogg'], sintetico: { ruidos: [
    { dur: 0.05, f0: 2500, f1: 900, vol: 0.9 }, { dur: 0.04, f0: 2000, f1: 800, vol: 0.7, retraso: 0.09 }, { dur: 0.05, f0: 1800, f1: 700, vol: 0.6, retraso: 0.19 }] } },
  pierde:  { muestras: ['audio/pierde-suspiro.ogg', 'audio/pierde-trombon.ogg', 'audio/pierde-abucheo.ogg'], sintetico: { tonos: [
    { freq: 330, dur: 0.3, tipo: 'sawtooth', vol: 0.5, f1: 200 }, { freq: 247, dur: 0.4, tipo: 'sawtooth', vol: 0.5, f1: 140, retraso: 0.18 }] } },
  // Guerra de territorios (grabaciones reales escogidas por el usuario el 28-10-2026). BATALLA es un PAISAJE, no un golpe: durante el zoom de una disputa de regiones suenan A LA VEZ las cinco muestras: dos CAMAS que
  // se repiten (con cruce, sin huecos) todo el zoom —la carga de una tropa gritando (florianreichelt) y una multitud (Jofae)— y tres ESPADAZOS (JohnBuhr, Christopherderp, spycrah) que caen al azar y NUNCA a la
  // vez, sin ir al compas de las espadas dibujadas: cerca de uno por segundo (6 o 7 en 6 s: `golpesPorSegundo`, como el choque de espadas de Age of Empires II), por turnos entre los tres y con una pausa de al menos `pausaMin`. `paisaje` dice el papel de cada muestra (indices de `muestras`). OBRA: el cuerno de guerra lejano (DeVern) suena cada turno que la Maravilla esta
  // en obra; CONSTRUIDA: el gong (JensZygar) suena cuando la obra termina. Los respaldos sintetizados son solo para que nunca quede mudo.
  batalla: { muestras: ['audio/batalla-grito.ogg', 'audio/batalla-multitud.ogg', 'audio/choque-1.ogg', 'audio/choque-2.ogg', 'audio/choque-3.ogg'],
    paisaje: { camas: [0, 1], volumenCamas: [1.35, 0.55], golpes: [2, 3, 4], golpesPorSegundo: [1, 1.15], pausaMin: 0.08 }, // volumenCamas: el grito (1.35) manda y la multitud (0.55) queda de fondo; el usuario queria oir mas el grito que la multitud
    sintetico: { ruidos: [{ dur: 1.4, f0: 1100, f1: 500, vol: 0.45, q: 0.8 }, { dur: 0.12, f0: 6500, f1: 2500, vol: 1, q: 6, retraso: 0.2 }, { dur: 0.12, f0: 6500, f1: 2500, vol: 0.8, q: 6, retraso: 0.7 }] } },
  obra:    { muestras: ['audio/maravilla-cuerno.ogg'], sintetico: { tonos: [{ freq: 196, dur: 1.4, tipo: 'sawtooth', vol: 0.4, f1: 180 }] } },
  construida: { muestras: ['audio/maravilla-gong.ogg'], sintetico: { tonos: [
    { freq: 196, dur: 1.8, tipo: 'sine', vol: 0.7, f1: 180 }, { freq: 294, dur: 1.5, tipo: 'sine', vol: 0.4, f1: 270, retraso: 0.05 }] } },
};

// El calendario de los espadazos de la batalla (puro: se prueba sin audio). `duraciones`: lo que dura cada golpe distinto (s). Devuelve [{ indice, inicio, tasa, vol, dur }] en orden, con `inicio` en segundos desde que
// empieza el zoom. De 6 a 7 espadazos en 6 s (`golpesPorSegundo`, al azar: unas veces 6 y otras 7); los tres suenan POR TURNOS (se sortea el orden y no se repite uno hasta usar los tres, ni dos seguidos); NUNCA dos a la vez:
// cada uno empieza despues de que acabo el anterior, mas una pausa de al menos `pausaMin`; y el tiempo que sobra se reparte AL AZAR entre los huecos (antes del primero, entre ellos y despues del ultimo), asi la
// cadencia es irregular. Si no caben (un zoom corto), se quitan los ultimos. Deterministico con el `azar` de la escena.
export function calendarioDeGolpes({ ms, duraciones, azar, golpesPorSegundo = [1, 1.15], pausaMin = 0.08, margen = 0.15 } = {}) {
  const seg = ms / 1000, n = Array.isArray(duraciones) ? duraciones.length : 0;
  if (!(seg > 0.6) || !n || typeof azar !== 'function') return [];
  const [g0, g1] = golpesPorSegundo;
  let bolsa = [];
  const sacar = (anterior) => { // los n golpes por turnos, en orden al azar, sin repetir el ultimo al cambiar de turno
    if (!bolsa.length) {
      bolsa = Array.from({ length: n }, (_, i) => i);
      for (let i = bolsa.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [bolsa[i], bolsa[j]] = [bolsa[j], bolsa[i]]; }
      if (n > 1 && bolsa.at(-1) === anterior) [bolsa[0], bolsa[bolsa.length - 1]] = [bolsa.at(-1), bolsa[0]];
    }
    return bolsa.pop();
  };
  const golpes = [];
  for (let i = 0, cuantos = Math.round(seg * (g0 + azar() * (g1 - g0))); i < cuantos; i++) {
    const indice = sacar(golpes.at(-1)?.indice), tasa = 0.94 + azar() * 0.12;
    golpes.push({ indice, tasa, vol: 0.75 + azar() * 0.25, dur: duraciones[indice] / tasa });
  }
  const util = seg - 2 * margen, ocupado = () => golpes.reduce((s, g) => s + g.dur, 0) + Math.max(0, golpes.length - 1) * pausaMin;
  while (golpes.length && ocupado() > util) golpes.pop();
  if (!golpes.length) return [];
  const holgura = util - ocupado(), pesos = Array.from({ length: golpes.length + 1 }, () => 0.15 + azar()), total = pesos.reduce((s, p) => s + p, 0);
  let t = margen + (holgura * pesos[0]) / total;
  return golpes.map((g, k) => { const salida = { ...g, inicio: t }; t += g.dur + pausaMin + (holgura * pesos[k + 1]) / total; return salida; });
}

// Que suena con cada paso de la linea de tiempo (lista vacia = silencio). Un paso desconocido o ilegible no suena.
export function eventosDePaso(paso) {
  switch (paso?.tipo) {
    case 'repartir': case 'crupier': case 'jugar': case 'elegir': case 'subir': return ['carta'];
    case 'revelar': case 'voltear': return ['voltear'];
    case 'lanzar': return ['dado'];
    case 'anuncio': return ['anuncio'];
    case 'duda': return ['duda'];
    case 'apuesta': case 'recupera': case 'fichas': case 'pago': case 'compra': case 'cobra': case 'paga': case 'devuelve': case 'ficha': case 'pagar': return ['ficha'];
    case 'contar': case 'marcar': case 'anula': case 'oprimir': return ['tic'];
    case 'pregunta': case 'nadie': return ['duda'];
    case 'premio': case 'ganar': return ['gana'];
    case 'anular': return ['pierde'];
    case 'corte': return ['anuncio'];
    case 'armar': return ['anuncio'];
    case 'decidir': return ['carta'];
    case 'riesgo': return ['duda'];
    case 'actuar': return paso.sale === true ? ['gana'] : paso.resultado === 'tropezo' ? ['tic'] : paso.resultado === 'cayo' ? ['pierde'] : [];
    case 'tentacion': return paso.clase === 'oferta' ? ['duda'] : ['ficha'];
    case 'medidor': return ['tic'];
    // Guerra de territorios (mapa, mensajes, privados, feed, razones, estado, rasgos y final son mudos a proposito: el texto y el mapa hablan solos)
    case 'flechas': return paso.lista?.length ? ['carta'] : [];
    case 'tarjeta': return []; // la batalla no suena por su paso: la mesa lanza el paisaje de guerra (sfx.batalla) con lo que dure el zoom
    case 'cartel': return ['duda'];
    case 'flashback': return ['voltear'];
    case 'conquistas': return paso.lista?.length ? ['gana'] : [];
    case 'pacto': case 'cumplido': return ['ficha'];
    case 'sello': return paso.sello === 'igual' ? [] : [['justo', 'cumplido', 'acierta'].includes(paso.sello) ? 'gana' : 'pierde'];
    default: return [];
  }
}

// Motor de audio: sfx.preparar() (con un gesto del usuario, o solo en OBS) abre el audio y carga las muestras que existan; sfx.carta(), sfx.ficha()...
// suenan el efecto. Donde no hay AudioContext (Node), con el sonido apagado o ante cualquier fallo, todo es silencio y nada lanza.
export function crearSonido({ activo = true, azar = () => 0, base = '', separado = false } = {}) {
  const AC = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  const sfx = { disponible: false };
  const muestras = {};
  let ctx = null;
  let maestro = null;

  const ruido = ({ dur, f0, f1, vol, q = 1, retraso = 0 }) => {
    const t0 = ctx.currentTime + retraso;
    const n = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, n, ctx.sampleRate);
    const datos = buffer.getChannelData(0);
    for (let i = 0; i < n; i++) datos[i] = (azar() * 2 - 1) * (1 - i / n);
    const fuente = ctx.createBufferSource();
    fuente.buffer = buffer;
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.Q.value = q;
    filtro.frequency.setValueAtTime(f0, t0);
    filtro.frequency.exponentialRampToValueAtTime(Math.max(50, f1), t0 + dur);
    const ganancia = ctx.createGain();
    ganancia.gain.value = vol;
    fuente.connect(filtro); filtro.connect(ganancia); ganancia.connect(maestro);
    fuente.start(t0);
  };
  const tono = ({ freq, dur, tipo = 'sine', vol, f1 = null, retraso = 0 }) => {
    const t0 = ctx.currentTime + retraso;
    const osc = ctx.createOscillator();
    const ganancia = ctx.createGain();
    osc.type = tipo;
    osc.frequency.setValueAtTime(freq, t0);
    if (f1) osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    ganancia.gain.setValueAtTime(vol, t0);
    ganancia.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(ganancia); ganancia.connect(maestro);
    osc.start(t0); osc.stop(t0 + dur);
  };

  sfx.preparar = async () => {
    if (!activo || typeof AC !== 'function') return;
    try {
      ctx ??= new AC();
      if (!maestro) {
        maestro = ctx.createGain(); maestro.gain.value = VOLUMEN;
        if (separado) { const canal = ctx.createStereoPanner(); canal.pan.value = 1; maestro.connect(canal); canal.connect(ctx.destination); }
        else maestro.connect(ctx.destination);
      }
      await ctx.resume?.();
      sfx.disponible = true;
    } catch { return; }
    await Promise.all(Object.entries(EVENTOS).map(async ([nombre, ev]) => {
      muestras[nombre] = [];
      for (const archivo of ev.muestras) {
        try {
          const r = await fetch(base + archivo);
          if (r.ok) muestras[nombre].push(await ctx.decodeAudioData(await r.arrayBuffer()));
        } catch { /* sin ese archivo: se usa el respaldo sintetizado */ }
      }
    }));
  };

  const tocar = (buffer) => { const fuente = ctx.createBufferSource(); fuente.buffer = buffer; fuente.connect(maestro); fuente.start(); };
  const sintetizar = (ev) => { for (const r of ev.sintetico.ruidos ?? []) ruido(r); for (const t of ev.sintetico.tonos ?? []) tono(t); };

  for (const [nombre, ev] of Object.entries(EVENTOS)) {
    sfx[nombre] = () => {
      if (!activo || !sfx.disponible) return;
      try {
        const grabadas = muestras[nombre] ?? [];
        if (grabadas.length) tocar(grabadas[Math.min(grabadas.length - 1, Math.floor(azar() * grabadas.length))]);
        else sintetizar(ev);
      } catch { /* un fallo de audio nunca tumba la escena */ }
    };
  }

  // ---- el paisaje de la batalla: sfx.batalla(ms) hace sonar las cinco muestras a la vez durante `ms` (lo que dura el zoom, en tiempo real) ----
  // Una cama se repite con cruce: cada vuelta entra con un fundido, se queda y sale con otro mientras empieza la siguiente (nunca hay un hueco ni un corte); la primera arranca en un punto al azar de la muestra
  // (que no empiece siempre igual) y la ultima se apaga justo cuando termina el zoom. Los espadazos van a intervalos al azar entre cadaMin y cadaMax, cada uno con una muestra y una tasa (0.92 a 1.08) al azar.
  const tocarEn = (buffer, t, { vol = 1, tasa = 1, desfase = 0, hasta = null, cruce = 0 } = {}) => {
    const fuente = ctx.createBufferSource(), g = ctx.createGain();
    fuente.buffer = buffer; fuente.playbackRate.value = tasa;
    const fin = Math.min(t + (buffer.duration - desfase) / tasa, hasta ?? Infinity);
    if (cruce > 0) { // fundido de entrada y de salida: la repeticion se mezcla con la anterior y con la siguiente
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + cruce);
      g.gain.setValueAtTime(vol, Math.max(t + cruce, fin - cruce)); g.gain.linearRampToValueAtTime(0, fin);
    } else g.gain.value = vol;
    fuente.connect(g); g.connect(maestro);
    fuente.start(t, desfase);
    if (cruce > 0) fuente.stop(fin + 0.02);
    return fin;
  };
  sfx.batalla = (ms = 4000) => {
    if (!activo || !sfx.disponible || !(ms > 0)) return;
    try {
      const grabadas = muestras.batalla ?? [], { camas, volumenCamas = [], golpes, golpesPorSegundo, pausaMin } = EVENTOS.batalla.paisaje;
      if (grabadas.length < EVENTOS.batalla.muestras.length) { sintetizar(EVENTOS.batalla); return; } // sin todos los archivos: el respaldo
      const t0 = ctx.currentTime, fin = t0 + ms / 1000;
      for (const [k, i] of camas.entries()) {
        const b = grabadas[i], cruce = Math.min(0.6, b.duration / 4), vol = volumenCamas[k] ?? 1;
        let t = t0, desfase = azar() * b.duration * 0.4;
        while (t < fin - 0.05) {
          const termina = tocarEn(b, t, { vol, desfase, hasta: fin, cruce });
          t = termina - cruce; desfase = 0; // la siguiente vuelta entra mientras esta se apaga
          if (termina >= fin) break;
        }
      }
      const calendario = calendarioDeGolpes({ ms, duraciones: golpes.map((i) => grabadas[i].duration), azar, golpesPorSegundo, pausaMin });
      for (const g of calendario) tocarEn(grabadas[golpes[g.indice]], t0 + g.inicio, { vol: g.vol, tasa: g.tasa });
    } catch { /* un fallo de audio nunca tumba la escena */ }
  };

  // Para web/sonidos.html (escuchar cada muestra): cuantas muestras grabadas cargaron de cada efecto, y tocar una en concreto (indice -1 = el respaldo sintetizado).
  sfx.cuantas = () => Object.fromEntries(Object.keys(EVENTOS).map((n) => [n, (muestras[n] ?? []).length]));
  sfx.probar = (nombre, indice = 0) => {
    if (!activo || !sfx.disponible || !EVENTOS[nombre]) return;
    try {
      if (indice < 0) sintetizar(EVENTOS[nombre]);
      else if (muestras[nombre]?.[indice]) tocar(muestras[nombre][indice]);
    } catch { /* un fallo de audio nunca tumba la escena */ }
  };
  return sfx;
}
