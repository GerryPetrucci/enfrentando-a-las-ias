// Formatos de salida de la grabacion multiformato con OBS (plan: privado/planes/plan-obs-grabacion-multiformato.md).
// OBS graba UNA hoja maestra de 3840x2160 en la que la escena dibuja cada formato en su lugar; despues se recorta.
// Todas las medidas son pixeles de esa hoja. Si cambias algo aqui, cambia tambien la escena (plan 3) y la carta de ajuste.

export const HOJA = { ancho: 3840, alto: 2160, fps: 30 };

// Cada formato: tamano final, donde esta en la hoja (x, y) y para que red sirve.
export const FORMATOS = {
  '9x16': { ancho: 1080, alto: 1920, x: 0, y: 0, uso: 'TikTok, Reels, Shorts y Facebook Reels' },
  // y=284 y no 285: con video yuv420p el desplazamiento tiene que ser par o ffmpeg lo redondea en silencio.
  '4x5': { ancho: 1080, alto: 1350, x: 0, y: 284, uso: 'Instagram (feed): recorte central del 9x16 (2 px menos arriba que abajo)' },
  '16x9': { ancho: 1920, alto: 1080, x: 1080, y: 0, uso: 'YouTube, X, Facebook y el sitio' },
};

// Zona segura del 9x16 (en pixeles de la hoja): lo importante (marcador, avisos, caras) va aqui. Sale de los margenes mas
// estrictos de las redes (arriba 250, abajo 420, izquierda 60, derecha 130; cifras aproximadas de guias de 2026, hay que
// confirmarlas con las plantillas oficiales) y queda dentro del recorte 4x5, asi que el mismo diseno sirve para los dos.
export const ZONA_SEGURA = { x: 60, y: 285, ancho: 890, alto: 1215 };
