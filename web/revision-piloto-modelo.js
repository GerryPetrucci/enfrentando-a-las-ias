export const limitarVelocidad = (n) => Math.max(.25, Math.min(8, Number(n) || 1));
export const limitarPosicion = (n, max) => Math.max(0, Math.min(Math.max(0, max), Number(n) || 0));
export const tiempoDeRevision = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
