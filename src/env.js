// Cargador minimo de .env (sin dependencias).
import { readFileSync, existsSync } from 'node:fs';

export function cargarEnv(ruta = '.env') {
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const l = linea.trim();
    if (!l || l.startsWith('#')) continue;
    const i = l.indexOf('=');
    if (i < 0) continue;
    const clave = l.slice(0, i).trim();
    const valor = l.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (!(clave in process.env)) process.env[clave] = valor;
  }
}
