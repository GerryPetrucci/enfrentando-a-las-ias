// La barra de arriba que comparten todas las paginas del sitio: marca, Inicio, Juegos (desplegable), Cómo se mide y Proponer. En el celular se pliega en un boton «Menú».
// `menuHtml` y `cargarMarcador` son puros (se prueban en Node); `montarMenu` es lo unico que toca el DOM. Si falta el marcador, la barra sigue entera, solo sin la lista de juegos.

import { redesHtml } from './redes.js?v=__V__';

export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const vacio = () => ({ juegos: [], partidas: [], error: true });

// El marcador que arma src/marcador.js. Con `?t=` para que un video recien publicado no se quede en la cache del navegador.
export async function cargarMarcador(pedir = fetch) {
  try {
    const r = await pedir(`marcador.json?t=${Date.now()}`);
    if (!r.ok) return vacio();
    return await r.json();
  } catch {
    return vacio();
  }
}

const enlace = (href, texto, actual, clase = '') => `<a${clase ? ` class="${clase}"` : ''} href="${href}"${actual ? ' aria-current="page"' : ''}>${texto}</a>`;

// pagina: 'inicio' | 'juego' | 'partida' | 'metodo' | 'proponer'; juegoId marca el juego abierto en el desplegable.
export function menuHtml(juegos, { pagina = '', juegoId = '' } = {}) {
  const lista = Array.isArray(juegos) ? juegos.filter((j) => j?.id) : [];
  const items = lista.length
    ? lista.map((j) => `<li>${enlace(`juego.html?id=${encodeURIComponent(j.id)}`, esc(j.nombre ?? j.id), pagina === 'juego' && j.id === juegoId)}</li>`).join('')
    : '<li class="vacio-menu">Todavía no hay juegos publicados.</li>';
  return `<div class="barra-dentro">
    <a class="marca" href="./"><img src="logo.svg" alt="" width="54" height="36"><span class="nombre">Enfrentando a las IAs</span></a>
    <button class="menu-boton" type="button" aria-expanded="false" aria-controls="menu-nav">Menú</button>
    <nav id="menu-nav" class="menu" aria-label="Principal">
      ${enlace('./', 'Inicio', pagina === 'inicio')}
      <div class="menu-juegos">
        <button class="juegos-boton" type="button" aria-expanded="false" aria-controls="lista-juegos">Juegos <span aria-hidden="true">▾</span></button>
        <ul id="lista-juegos" class="lista-juegos" hidden>${items}</ul>
      </div>
      ${enlace('./#buscar', 'Buscar', false)}
      ${enlace('metodo.html', 'Cómo se mide', pagina === 'metodo')}
      ${enlace('proponer.html', 'Proponer', pagina === 'proponer', 'menu-cta')}
    </nav>
  </div>`;
}

export function pieHtml(generado = '') {
  return `<p>Contenido generado por IA · Proyecto independiente, sin afiliación con los proveedores de los modelos. Los nombres de los modelos se usan de forma descriptiva; no se usan sus logos.</p>
    ${redesHtml('redes-pie')}
    <p><a href="proponer.html">Proponer un juego o un enfrentamiento</a></p>
    ${generado ? `<p>${esc(generado)}</p>` : ''}`;
}

// Pinta la barra (y el pie, si la pagina lo tiene) y le da vida a los botones. `datos` es el marcador.
export function montarMenu(datos, opciones = {}) {
  const barra = document.getElementById('barra');
  if (!barra) return;
  const juegos = (datos?.juegos ?? []).map((j) => ({ id: j.id, nombre: j.nombre }));
  barra.innerHTML = menuHtml(juegos, opciones);
  const pie = document.getElementById('pie');
  if (pie) pie.innerHTML = pieHtml(opciones.generado);

  const botonMenu = barra.querySelector('.menu-boton');
  const botonJuegos = barra.querySelector('.juegos-boton');
  const listaJuegos = barra.querySelector('#lista-juegos');
  const cerrarJuegos = () => { listaJuegos.hidden = true; botonJuegos.setAttribute('aria-expanded', 'false'); };
  const cerrarTodo = () => { cerrarJuegos(); barra.classList.remove('abierto'); botonMenu.setAttribute('aria-expanded', 'false'); };
  botonMenu.addEventListener('click', () => {
    const abrir = !barra.classList.contains('abierto');
    barra.classList.toggle('abierto', abrir);
    botonMenu.setAttribute('aria-expanded', String(abrir));
    if (!abrir) cerrarJuegos();
  });
  botonJuegos.addEventListener('click', () => {
    const abrir = listaJuegos.hidden;
    listaJuegos.hidden = !abrir;
    botonJuegos.setAttribute('aria-expanded', String(abrir));
  });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') { cerrarTodo(); botonMenu.focus(); } });
  document.addEventListener('click', (ev) => { if (!barra.contains(ev.target)) cerrarTodo(); });
  barra.querySelectorAll('nav a').forEach((a) => a.addEventListener('click', cerrarTodo));
}
