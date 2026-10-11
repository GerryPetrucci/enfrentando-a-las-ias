// Limitador de ritmo: reparte las llamadas a la API en el tiempo para no pasar del tope por minuto de OpenRouter
// (20 por minuto en los modelos gratis). Las llamadas que llegan juntas se escalonan; ninguna se descarta.

export function crearLimitador({ porMinuto, ahora = () => Date.now(), pausa = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  if (!(porMinuto > 0)) throw new Error(`porMinuto debe ser un numero mayor que 0 (llego: ${porMinuto})`);
  const intervalo = 60000 / porMinuto;
  let proximo = 0;
  return {
    intervalo,
    async esperar() {
      const t = ahora();
      const turno = Math.max(t, proximo);
      proximo = turno + intervalo;
      if (turno > t) await pausa(turno - t);
    },
  };
}
