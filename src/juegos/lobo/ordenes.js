export function normalizarRespuesta(respuesta) {
  try {
    const r = typeof respuesta === 'string' ? JSON.parse(respuesta) : respuesta;
    if (!r || typeof r !== 'object' || Array.isArray(r)) return { invalida: true };
    return { ...r, invalida: r.invalida === true };
  } catch { return { invalida: true }; }
}
