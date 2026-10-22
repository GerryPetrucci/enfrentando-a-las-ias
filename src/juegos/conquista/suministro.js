// Suministro de la Guerra de territorios: una region tuya esta AISLADA si no hay camino hasta tu capital pasando por regiones tuyas, libres o de un aliado con pacto vigente.
// Funcion pura sobre el estado y sin imports (estado.js la usa en `instantanea`). La capital nunca esta aislada.

// Los ids de las regiones del reino `s` sin camino a su capital, con los pactos vigentes en el turno `t`. [] si el reino cayo o ya no tiene su capital.
export function regionesAisladas(E, s, t) {
  const reino = E.reinos[s], regs = E.mapa.regs;
  if (!reino?.vivo || E.dueno[reino.capital] !== s) return [];
  const pasa = (r) => E.dueno[r] === s || E.dueno[r] < 0 || reino.pactos[E.dueno[r]] >= t;
  const visto = new Uint8Array(regs.length), cola = [reino.capital];
  visto[reino.capital] = 1;
  for (let i = 0; i < cola.length; i++) for (const v of regs[cola[i]].vecinos) if (!visto[v] && pasa(v)) { visto[v] = 1; cola.push(v); }
  const out = [];
  for (let r = 0; r < regs.length; r++) if (E.dueno[r] === s && !visto[r]) out.push(r);
  return out;
}

// 1 en cada region aislada de su dueno (de cualquier reino), 0 en las demas. Se calcula al empezar el turno `t`, con lo que vieron las IAs.
export function marcarAisladas(E, t) {
  const marca = new Uint8Array(E.mapa.regs.length);
  for (let s = 0; s < E.k; s++) for (const r of regionesAisladas(E, s, t)) marca[r] = 1;
  return marca;
}

// Los ids de todas las regiones aisladas (de cualquier reino), de menor a mayor.
export function listaDeAisladas(E, t) {
  const marca = marcarAisladas(E, t), out = [];
  for (let r = 0; r < marca.length; r++) if (marca[r]) out.push(r);
  return out;
}
