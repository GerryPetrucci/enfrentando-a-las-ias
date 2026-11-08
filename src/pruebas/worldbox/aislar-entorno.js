// Preload opcional para correr la suite general sin leer credenciales locales.
import fs from 'node:fs';
import { basename } from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
const existe = fs.existsSync;
fs.existsSync = function (ruta) {
  if (basename(String(ruta)) === '.env') return false;
  return existe.call(this, ruta);
};
syncBuiltinESMExports();
delete process.env.OPENROUTER_API_KEY;
const fetchOriginal = globalThis.fetch;
globalThis.fetch = (url, opciones) => {
  const destino = new URL(typeof url === 'string' || url instanceof URL ? url : url.url);
  if (!['127.0.0.1', '[::1]', 'localhost'].includes(destino.hostname)) throw new Error('Pruebas W3: red externa prohibida');
  return fetchOriginal(url, opciones);
};
