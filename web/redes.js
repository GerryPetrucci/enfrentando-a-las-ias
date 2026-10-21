// Las redes del proyecto, en un solo lugar: las usan la landing y el pie de todas las paginas (menu.js). Los iconos son dibujos propios y sencillos, no los logos oficiales.
// Las siglas (`id`) son las mismas de herramientas/nombres.mjs (REDES) y de los nombres de los videos; una prueba (sitio-redes.test.js) falla si una red del paquete falta aqui o en marca/perfiles.md.
// `usuario` es lo que se muestra en el cierre de los videos (el @ de cada red; Facebook no tiene todavia, se muestra el nombre de la pagina).
// Al crear una cuenta nueva: agregala aqui (con su icono), en marca/perfiles.md y en REDES de herramientas/nombres.mjs.

const trazo = (cuerpo) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${cuerpo}</svg>`;
const relleno = (cuerpo) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true" focusable="false">${cuerpo}</svg>`;

export const REDES = [
  { id: 'tk', nombre: 'TikTok', usuario: '@enfrentandoalasias', url: 'https://www.tiktok.com/@enfrentandoalasias', icono: trazo('<path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 4c.4 2.6 2.1 4.1 5 4.3"/>') },
  { id: 'ig', nombre: 'Instagram', usuario: '@enfrentandoalasias', url: 'https://www.instagram.com/enfrentandoalasias', icono: trazo('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".6" fill="currentColor"/>') },
  { id: 'yt', nombre: 'YouTube', usuario: '@enfrentandoalasias', url: 'https://www.youtube.com/@enfrentandoalasias', icono: trazo('<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10 9.5v5l4.5-2.5z" fill="currentColor"/>') },
  { id: 'fb', nombre: 'Facebook', usuario: 'Enfrentando a las IAs', url: 'https://www.facebook.com/profile.php?id=61595387681724', icono: relleno('<path d="M14.5 21v-8h2.7l.5-3.3h-3.2V7.6c0-1 .4-1.6 1.7-1.6h1.6V3.1C17.2 3 16.3 3 15.3 3c-2.6 0-4.1 1.5-4.1 4.2v2.5H8.5V13h2.7v8z"/>') },
  { id: 'x', nombre: 'X', usuario: '@enfrentandoias', url: 'https://x.com/enfrentandoias', icono: trazo('<path d="M5 4.5h3.5l10.5 15h-3.5z"/><path d="M18.5 4.5 13 10.8M5.5 19.5l5.7-6.5"/>') },
];

// La pagina donde se publican los resultados (el cierre de cada video la nombra). `texto` es como se lee en pantalla.
export const SITIO = { url: 'https://gerrypetrucci.github.io/enfrentando-a-las-ias/', texto: 'gerrypetrucci.github.io/enfrentando-a-las-ias' };

// Los enlaces con su icono y su nombre (el nombre siempre se lee: el icono es solo adorno).
export const redesHtml = (clase = 'redes') => `<div class="${clase}" aria-label="Redes">${REDES.map((r) => `<a href="${r.url}" target="_blank" rel="noopener">${r.icono}<span>${r.nombre}</span></a>`).join('')}</div>`;
