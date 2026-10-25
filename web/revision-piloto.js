import { limitarVelocidad, limitarPosicion, tiempoDeRevision } from './revision-piloto-modelo.js';
const config = JSON.parse(document.getElementById('configuracion').textContent);
const $ = (id) => document.getElementById(id);
const iframe = $('escena'), video = $('video'), avance = $('avance'), velocidad = $('velocidad');
let muestra, estado = null, carga = 0, arrastrando = false;
const enviar = (accion, valor) => iframe.contentWindow.postMessage({ tipo:'revision-comando', accion, valor, sesion:String(carga) }, new URL(iframe.src).origin);
function pintar() {
  const escena = muestra.tipo === 'escena';
  const max = escena ? Math.max(0, (estado?.total ?? 1) - 1) : Number.isFinite(video.duration) ? video.duration : 0;
  avance.max = String(max); avance.step = escena ? '1' : '.1';
  if(!arrastrando)avance.value = String(escena ? estado?.indice ?? 0 : video.currentTime);
  $('reproducir').textContent = (escena ? estado?.reproduciendo : !video.paused) ? 'Pausar' : 'Reproducir';
  $('anterior').textContent = escena ? 'Anterior' : '−10 s'; $('siguiente').textContent = escena ? 'Siguiente' : '+10 s';
  $('tiempo').textContent = escena ? `${tiempoDeRevision(estado?.tiempoMs ?? 0)} / ${tiempoDeRevision(estado?.duracionMs ?? 0)} · momento ${(estado?.indice ?? 0)+1}/${estado?.total ?? '…'}` : `${tiempoDeRevision(video.currentTime*1000)} / ${tiempoDeRevision(max*1000)}`;
  for (const id of ['inicio','anterior','reproducir','siguiente','final','avance','velocidad']) $(id).disabled = escena && !estado;
  if (escena && estado) velocidad.value = String(estado.velocidad);
}
function cargar() {
  video.pause(); video.removeAttribute('src'); video.load();
  muestra = config.muestras[Number($('muestra').value)]; estado = null;
  iframe.hidden = muestra.tipo !== 'escena'; video.hidden = muestra.tipo !== 'video';
  if (muestra.tipo === 'escena') {
    const url = new URL(muestra.url); url.searchParams.set('revision','1'); url.searchParams.set('revisionId',String(++carga)); url.searchParams.set('auto','0'); url.searchParams.set('limpio','1');
    iframe.src = url.href; $('abrir').href = muestra.url;
    $('estado').textContent = 'Cargando escena. La barra navega por momentos públicos; Ir al final muestra el último momento.';
  } else {
    iframe.src = 'about:blank'; video.src = muestra.archivo; video.playbackRate = limitarVelocidad(velocidad.value); $('abrir').href = muestra.archivo;
    $('estado').textContent = 'Video grabado. La barra navega por segundos.';
  }
  pintar();
}
config.muestras.forEach((m, i) => $('muestra').append(new Option(m.titulo, String(i))));
$('muestra').onchange = cargar;
window.addEventListener('message', (e) => {
  if (muestra.tipo !== 'escena' || e.source !== iframe.contentWindow || e.origin !== new URL(iframe.src).origin) return;
  if(e.data?.sesion!==String(carga))return;
  if (e.data?.tipo === 'revision-estado') { estado = e.data.estado; pintar(); }
  if (e.data?.tipo === 'revision-error') $('estado').textContent = e.data.error;
});
iframe.onload = () => { if (muestra.tipo === 'escena') enviar('estado'); };
const buscar = (n) => { if (muestra.tipo === 'escena') enviar('buscar', Math.round(limitarPosicion(n, Number(avance.max)))); else { video.currentTime = limitarPosicion(n, Number(avance.max)); pintar(); } };
avance.onpointerdown = () => { arrastrando = true; };
avance.onpointerup = () => { arrastrando = false; };
avance.onpointercancel = () => { arrastrando = false; pintar(); };
avance.onchange = () => { arrastrando = false; buscar(avance.value); };
$('inicio').onclick = () => buscar(0); $('final').onclick = () => buscar(Number(avance.max));
const posicionActual = () => muestra.tipo==='escena' ? estado?.indice ?? 0 : video.currentTime;
$('anterior').onclick = () => buscar(posicionActual()-(muestra.tipo==='escena'?1:10));
$('siguiente').onclick = () => buscar(posicionActual()+(muestra.tipo==='escena'?1:10));
$('reproducir').onclick = () => { if (muestra.tipo==='escena') enviar(estado?.reproduciendo?'pausar':'reproducir'); else if(video.paused) video.play().catch((e)=>{$('estado').textContent=e.message;}); else video.pause(); };
velocidad.onchange = () => { if (muestra.tipo==='escena') enviar('velocidad', limitarVelocidad(velocidad.value)); else video.playbackRate=limitarVelocidad(velocidad.value); };
for(const evento of ['loadedmetadata','timeupdate','play','pause','ratechange','ended'])video.addEventListener(evento,()=>{if(muestra?.tipo==='video')pintar();});
cargar();
