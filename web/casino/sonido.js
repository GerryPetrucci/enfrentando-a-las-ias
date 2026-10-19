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
  gana:    { muestras: ['audio/gana-1.ogg'], sintetico: { tonos: [523, 659, 784, 1047].map((freq, i) => ({ freq, dur: 0.28, tipo: 'triangle', vol: 0.65, retraso: i * 0.11 })) } },
  dado:    { muestras: ['audio/dado-1.ogg', 'audio/dado-2.ogg'], sintetico: { ruidos: [
    { dur: 0.05, f0: 2500, f1: 900, vol: 0.9 }, { dur: 0.04, f0: 2000, f1: 800, vol: 0.7, retraso: 0.09 }, { dur: 0.05, f0: 1800, f1: 700, vol: 0.6, retraso: 0.19 }] } },
  pierde:  { muestras: ['audio/pierde-1.ogg'], sintetico: { tonos: [
    { freq: 330, dur: 0.3, tipo: 'sawtooth', vol: 0.5, f1: 200 }, { freq: 247, dur: 0.4, tipo: 'sawtooth', vol: 0.5, f1: 140, retraso: 0.18 }] } },
};

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
    case 'tarjeta': return ['anuncio'];
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
export function crearSonido({ activo = true, azar = () => 0, base = '' } = {}) {
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
      if (!maestro) { maestro = ctx.createGain(); maestro.gain.value = VOLUMEN; maestro.connect(ctx.destination); }
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
