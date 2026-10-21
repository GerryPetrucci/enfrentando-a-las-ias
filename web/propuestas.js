// Propuestas de juegos y de enfrentamientos. El sitio es estatico y no tiene servidor: cada propuesta se manda como un Issue de GitHub (publico, con su contador de apoyos 👍).
// Este modulo es puro (sin DOM): valida el formulario, arma la direccion del Issue y lee la lista que devuelve la API publica de GitHub.

export const REPO = 'GerryPetrucci/enfrentando-a-las-ias';
export const TIPOS = { juego: 'Juego', enfrentamiento: 'Enfrentamiento' };

const LIMITES = { titulo: [3, 100], descripcion: [10, 3000], otros: 200 };
const texto = (t, max) => String(t ?? '').replace(/\r/g, '').trim().slice(0, max);

export function validarPropuesta(p) {
  const errores = [];
  if (!Object.hasOwn(TIPOS, p?.tipo)) errores.push('Elige el tipo de propuesta.');
  const titulo = texto(p?.titulo, 1000);
  if (titulo.length < LIMITES.titulo[0] || titulo.length > LIMITES.titulo[1]) errores.push(`El título debe tener entre ${LIMITES.titulo[0]} y ${LIMITES.titulo[1]} caracteres.`);
  if (texto(p?.descripcion, 100000).length < LIMITES.descripcion[0]) errores.push(`Cuéntanos la idea en la descripción (al menos ${LIMITES.descripcion[0]} caracteres).`);
  return errores;
}

// La direccion que abre un Issue nuevo con todo prellenado: quien propone solo revisa y pulsa «Submit new issue» (necesita una cuenta de GitHub).
export function urlDePropuesta(p) {
  const tipo = Object.hasOwn(TIPOS, p?.tipo) ? p.tipo : 'juego';
  const filas = [
    ['Tipo', TIPOS[tipo]],
    p?.juego ? ['Juego', texto(p.juego, LIMITES.otros)] : null,
    p?.ias ? ['IAs', texto(p.ias, LIMITES.otros)] : null,
    p?.nombre ? ['Propone', texto(p.nombre, LIMITES.otros)] : null,
  ].filter(Boolean);
  const cuerpo = `${filas.map(([k, v]) => `**${k}:** ${v}`).join('\n')}\n\n${texto(p?.descripcion, LIMITES.descripcion[1])}\n\n---\nPropuesta enviada desde el sitio. Pon un 👍 en esta propuesta si también quieres verla.`;
  const q = new URLSearchParams({ title: `[${TIPOS[tipo]}] ${texto(p?.titulo, LIMITES.titulo[1])}`, body: cuerpo });
  return `https://github.com/${REPO}/issues/new?${q}`;
}

export const urlDeLista = () => `https://api.github.com/repos/${REPO}/issues?${new URLSearchParams({ state: 'open', per_page: '60', sort: 'created', direction: 'desc' })}`;

// De los Issues abiertos solo cuentan las propuestas (titulo marcado [Juego] o [Enfrentamiento]); las que mas apoyos tienen, primero.
export function propuestasDeIssues(issues) {
  const marcas = Object.entries(TIPOS).map(([tipo, nombre]) => [tipo, `[${nombre}] `]);
  return (Array.isArray(issues) ? issues : []).flatMap((i) => {
    if (!i || typeof i !== 'object' || i.pull_request || typeof i.title !== 'string') return [];
    const marca = marcas.find(([, m]) => i.title.startsWith(m));
    if (!marca) return [];
    return [{ numero: i.number, tipo: marca[0], titulo: i.title.slice(marca[1].length).trim(), url: i.html_url, fecha: i.created_at ?? null, apoyos: i.reactions?.['+1'] ?? 0, comentarios: i.comments ?? 0 }];
  }).sort((a, b) => b.apoyos - a.apoyos || b.numero - a.numero);
}
