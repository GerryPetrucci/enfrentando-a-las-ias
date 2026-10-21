// Formatos de salida de la grabacion multiformato con OBS (plan: privado/planes/plan-obs-grabacion-multiformato.md).
// OBS graba UNA hoja maestra de 3840x2160 en la que la escena dibuja cada formato en su lugar; despues se recorta.
// Todas las medidas son pixeles de esa hoja. Si cambias algo aqui, cambia tambien la escena (plan 3) y la carta de ajuste.

export const HOJA = { ancho: 3840, alto: 2160, fps: 30 };

// Cada formato: tamano final, donde esta en la hoja (x, y) y para que redes sirve. `redes` son las siglas de nombres.mjs (fb, ig, tk, x, yt) en orden alfabetico: el nombre de cada
// archivo que se sube las copia, y asi el nombre dice donde se sube (decidido el 20 de octubre de 2026). Las cifras de cada red salen de guias de 2026 que no coinciden entre si
// (no hay una pagina oficial que las junte): confirmalas en la pantalla de subida de cada red.
export const FORMATOS = {
  '9x16': { ancho: 1080, alto: 1920, x: 0, y: 0, redes: ['fb', 'ig', 'tk', 'yt'], uso: 'Reels de Facebook e Instagram, TikTok y Shorts de YouTube' },
  // y=284 y no 285: con video yuv420p el desplazamiento tiene que ser par o ffmpeg lo redondea en silencio.
  // Opcional: Instagram publica hoy todo video como Reels (9:16), asi que el 4x5 solo sirve para el feed; ninguna red lo necesita.
  '4x5': { ancho: 1080, alto: 1350, x: 0, y: 284, redes: ['ig'], opcional: true, uso: 'feed de Instagram (opcional): recorte central del 9x16 (2 px menos arriba que abajo)' },
  '16x9': { ancho: 1920, alto: 1080, x: 1080, y: 0, redes: ['fb', 'x', 'yt'], uso: 'X, YouTube (versión larga) y Facebook' },
};

// Zona segura del 9x16 (en pixeles de la hoja): lo importante (marcador, avisos, caras) va aqui. Sale de los margenes mas
// estrictos de las redes (arriba 250, abajo 420, izquierda 60, derecha 130; cifras aproximadas de guias de 2026, hay que
// confirmarlas con las plantillas oficiales) y queda dentro del recorte 4x5, asi que el mismo diseno sirve para los dos.
export const ZONA_SEGURA = { x: 60, y: 285, ancho: 890, alto: 1215 };
