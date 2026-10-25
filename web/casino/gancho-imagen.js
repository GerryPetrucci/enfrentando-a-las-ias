// El gancho en IMAGEN (decidido el 25 de octubre de 2026): cuando una parte no puede tener gancho en video (gancho.js: menos de 2 momentos buenos que ensenar, como pasa
// en Lobo en la aldea), el paquete genera en su lugar una imagen fija con «PRÓXIMAMENTE», el nombre del juego, su numero de juego (jN) y el numero de parte, y el arte del juego si lo tiene
// (Lobo: la aldea y sus seis personajes). La pagina que la dibuja es web/gancho-imagen.html; herramientas/gancho-imagen.mjs la captura. Aqui solo hay funciones puras (sin DOM ni red).
//
// Para dar arte a otro juego: agregarlo a ARTE_GANCHO con su id. Sin arte, la imagen lleva solo la marca (logo, texto y avisos).
// Todo lo que se lee queda dentro de la zona segura del formato (layout.js: FORMATOS_ESCENA), igual que las tarjetas del gancho en video.

import { textoDeJuego } from './textos-juego.js';
import { FORMATOS_ESCENA } from './layout.js';
import { PERSONAJES_ANIMADOS } from './lobo-personajes-animados.js';
import { LOBO_AMBIENTE } from '../paleta.js';
import { esc } from './kit.js';

// El cuadro de la animacion que se usa en la imagen: el 4.o (indice 3) es la pose de accion de los seis (disparo del Cazador, orbe de la Vidente, flecha de Cupido, aura de la Bruja...).
const CUADRO_DE_ACCION = 3;
const PLANTEL_LOBO = ['aldeano', 'bruja', 'vidente', 'cupido', 'cazador', 'lobo'];

export const ARTE_GANCHO = {
  lobo: {
    ambiente: { fondo: LOBO_AMBIENTE.cielo, luz: LOBO_AMBIENTE.luz, panel: LOBO_AMBIENTE.pared },
    panel: { archivo: 'arte/lobo/dia-asamblea-01.png', ancho: 516, alto: 288 },
    plantel: PLANTEL_LOBO.map((rol) => ({ rol, ...PERSONAJES_ANIMADOS[rol], cuadro: CUADRO_DE_ACCION })),
  },
};

export const FORMATOS_IMAGEN = Object.keys(FORMATOS_ESCENA);
export const NOMBRE_DE_MARCA = 'Enfrentando a las IAs';
const AVISO = 'Contenido generado por IA · Proyecto independiente';

// Lo que dice la imagen. `de` = cuantas partes tiene el juego (con una sola no se habla de partes). La parte que cierra pide seguir «para ver el desenlace», como el gancho en video.
export function textosDeGanchoImagen({ juegoId = null, juegoNumero = 1, parte = 1, de = 2 } = {}) {
  const t = textoDeJuego(juegoId);
  const varias = Number.isInteger(de) && de > 1;
  return {
    kicker: 'PRÓXIMAMENTE',
    nombre: t?.nombre ?? NOMBRE_DE_MARCA,
    detalle: varias ? `Juego ${juegoNumero} · Parte ${parte} de ${de}` : `Juego ${juegoNumero}`,
    cta: varias && parte >= de ? 'Síguenos para ver el desenlace' : 'Síguenos para no perdértela',
    aviso: AVISO,
  };
}

// El modelo completo de una imagen: textos, arte del juego (o null), tamano y zona segura del formato. Un formato desconocido lanza (nunca se dibuja una imagen que se saldria de la zona).
export function modeloDeGanchoImagen({ juegoId = null, juegoNumero = 1, parte = 1, de = 2, formato = '9x16' } = {}) {
  const f = FORMATOS_ESCENA[formato];
  if (!f) throw new Error(`Formato desconocido: "${formato}". Usa ${FORMATOS_IMAGEN.join(' o ')}.`);
  for (const [nombre, v] of Object.entries({ juegoNumero, parte, de })) if (!Number.isInteger(v) || v < 1) throw new Error(`${nombre} debe ser un entero de 1 en adelante (recibió ${v}).`);
  if (parte > de) throw new Error(`La parte ${parte} no existe en un juego de ${de} partes.`);
  return { ...textosDeGanchoImagen({ juegoId, juegoNumero, parte, de }), formato, ancho: f.ancho, alto: f.alto, zona: { ...f.zona }, arte: ARTE_GANCHO[juegoId] ?? null, juegoId };
}

// La direccion de la pagina (relativa a web/): la misma que usa la herramienta para capturarla y que sirve para verla en el navegador.
export function direccionDeGanchoImagen({ juegoId, juegoNumero = 1, parte = 1, de = 2, formato = '9x16' }) {
  const q = new URLSearchParams({ juego: juegoId ?? '', numero: String(juegoNumero), parte: String(parte), de: String(de), formato });
  return `gancho-imagen.html?${q}`;
}

// Lo que la pagina pone en pantalla. Todo texto pasa por `esc`.
export function htmlDeGanchoImagen(m) {
  const arte = m.arte;
  const plantel = (arte?.plantel ?? []).map((p) => `<span class="gi-figura" data-rol="${esc(p.rol)}" style="--archivo:url('${esc(p.archivo)}');--ancho:${Number(p.ancho)};--alto:${Number(p.alto)};--cuadros:${Number(p.cuadros)};--cuadro:${Number(p.cuadro)}"></span>`).join('');
  return `<div class="gi-fondo"></div>
<div class="gi-zona">
  <header class="gi-marca"><img src="logo.svg" alt="" width="54" height="36"><span>${esc(NOMBRE_DE_MARCA)}</span></header>
  <div class="gi-texto"><div class="gi-kicker">${esc(m.kicker)}</div><h1 class="gi-nombre">${esc(m.nombre)}</h1><div class="gi-detalle">${esc(m.detalle)}</div></div>
  ${arte?.panel ? `<figure class="gi-panel"><img src="${esc(arte.panel.archivo)}" alt="" width="${Number(arte.panel.ancho)}" height="${Number(arte.panel.alto)}"></figure>` : ''}
  ${plantel ? `<div class="gi-plantel">${plantel}</div>` : ''}
  <div class="gi-cta">${esc(m.cta)}</div>
  <footer class="gi-pie">${esc(m.aviso)}</footer>
</div>`;
}
