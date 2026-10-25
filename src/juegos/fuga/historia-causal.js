// Un arco completo: lugares concretos, reconvergencias y consecuencias locales.
const salida = (a, si = {}, prioridad = 0) => ({ a, si, prioridad, peso: 1 });
const regla = (id, si, efecto, texto, duracion = 9) => ({ id, si, efecto, texto, duracion });
const puerta = regla('abrir', { metodo: 'fuerza', resultado: 'limpio' }, 'puerta_forzada', 'La puerta forzada abre mantenimiento, pero deja un rastro que pueden descubrir los guardias.');
const credencial = regla('credencial', { metodo: 'engano', resultado: 'limpio' }, 'credencial', 'Consigue una credencial: facilita controles hasta la situación 6, mientras no la descubran.', 4);
const borrar = regla('borrar-rastro', { metodo: 'sigilo', resultado: 'limpio', hecho: 'puerta_forzada' }, 'rastro_borrado', 'Borra el rastro de la puerta forzada: la patrulla pierde esa pista.');
const patrulla = { id: 'patrulla', si: { hecho: 'puerta_forzada', sinHecho: 'rastro_borrado' }, alcance: 'grupo', delta: 0.06,
  texto: 'Los guardias encontraron la puerta forzada: cruzar este tramo resulta más peligroso.' };
const pase = { id: 'pase', si: { hecho: 'credencial' }, alcance: 'actor', delta: -0.07, metodos: ['engano'], texto: 'La credencial obtenida antes facilita pasar el control.' };
const detectar = regla('detectar', { metodo: 'engano', resultado: 'fallo', hecho: 'credencial' }, 'credencial_detectada', 'El control descubre la credencial: ya no servirá en otro puesto.');
const cuerda = regla('cuerda', { postura: 'ayudar', resultado: 'limpio' }, 'cuerda', 'Al cubrir al compañero recupera una cuerda: facilitará un paso difícil y después quedará atrás.');
const usarCuerda = { id: 'cuerda', si: { hecho: 'cuerda' }, alcance: 'actor', delta: -0.06, metodos: ['sigilo', 'fuerza'], texto: 'Usa la cuerda recuperada al cooperar: facilita este paso y después se pierde.' };
const exito = (metodo) => ({ metodo, exito: true });
export function crearHistoriaCausal() {
  const nodos = [];
  function nodo(id, lugar, escenas, contexto, salidas, reglas = [], modificadores = [], objetivo = '') {
    const ronda = Number(id.match(/^r(\d+)/)[1]), fase = ronda <= 3 ? 'interior' : ronda <= 6 ? 'patio' : 'perimetro';
    nodos.push({ id, ronda, fase, lugar, escenas, contexto: [contexto], objetivo, salidas, reglas, modificadores });
  }
  nodo('r1-celda', 'Bloque de celdas', ['celda', 'panel', 'camara'], 'La salida del bloque conduce a accesos diferentes según cómo consigan superar el cierre.',
    [salida('r2-mantenimiento', exito('fuerza'), 2), salida('r2-control', exito('engano'), 1), salida('r2-galeria')], [puerta], [],
    'Fuerza con éxito abre mantenimiento y deja rastro. Engaño con éxito lleva al control. Si ambos accesos se abren, seguirán por mantenimiento. En otro caso seguirán por la galería.');
  nodo('r2-mantenimiento', 'Acceso de mantenimiento', ['lavanderia', 'panel', 'escalera'], 'La puerta abierta les da acceso al área de mantenimiento.',
    [salida('r3-ductos', exito('sigilo'), 1), salida('r3-taller')], [], [], 'Sigilo con éxito permite entrar en los ductos; en otro caso deberán cruzar el taller.');
  nodo('r2-control', 'Control del personal', ['ronda', 'cocina', 'enfermeria'], 'El engaño del bloque les permitió acercarse al control del personal.',
    [salida('r3-archivo', { hecho: 'credencial' }, 1), salida('r3-pasillo')], [credencial], [], 'Engaño con éxito consigue una credencial y abre el archivo. Si falla, queda el pasillo de vigilancia.');
  nodo('r2-galeria', 'Galería interior', ['camara', 'escalera', 'ronda'], 'La galería conserva un acceso discreto hacia los ductos.',
    [salida('r3-ductos', exito('sigilo'), 1), salida('r3-pasillo')], [], [], 'Sigilo con éxito abre los ductos; en otro caso seguirán por el pasillo.');
  nodo('r3-ductos', 'Ductos de servicio', ['escalera', 'camara', 'lavanderia'], 'Los ductos desembocan en el patio de servicio.', [salida('r4-servicio')], [borrar], [], 'Si dejaron la puerta forzada, sigilo con éxito borra su rastro antes de llegar al patio.');
  nodo('r3-taller', 'Taller interior', ['panel', 'lavanderia', 'cocina'], 'El taller comunica con el patio de servicio.', [salida('r4-servicio')], [borrar], [], 'Sigilo con éxito permite borrar el rastro de una puerta forzada.');
  nodo('r3-archivo', 'Archivo del personal', ['ronda', 'enfermeria', 'cocina'], 'El archivo ofrece un paso hacia el patio principal.', [salida('r4-patio')], [detectar], [pase], 'Engaño aprovecha la credencial. Si falla al usarla, el control la detectará y dejará de servir.');
  nodo('r3-pasillo', 'Pasillo de vigilancia', ['ronda', 'camara', 'escalera'], 'El pasillo vigilado termina en el patio principal.', [salida('r4-patio')], [borrar], [], 'Sigilo con éxito borra el rastro de una puerta forzada, si lo dejaron.');
  nodo('r4-servicio', 'Patio de servicio', ['taller', 'reja', 'zanja'], 'Desde servicio pueden abrir el almacén o atravesar la zona de patrulla.',
    [salida('r5-almacen', exito('fuerza'), 1), salida('r5-patrulla')], [], [patrulla], 'Fuerza con éxito abre el almacén. Si queda rastro de la puerta del bloque, la patrulla hace este cruce más peligroso.');
  nodo('r4-patio', 'Patio principal', ['patio', 'foco', 'turno'], 'El patio conduce al control de carga o a la zona de patrulla.',
    [salida('r5-control', { hecho: 'credencial' }, 1), salida('r5-patrulla')], [], [patrulla], 'Una credencial vigente en manos de alguien que siga dentro abre el control de carga; sin ella queda la patrulla.');
  nodo('r5-almacen', 'Almacén de carga', ['taller', 'basura', 'reja'], 'El almacén contiene material para superar los últimos obstáculos.',
    [salida('r6-desague', exito('sigilo'), 1), salida('r6-reja')], [cuerda], [], 'Cubrir al compañero y pasar sin tropiezos permite recuperar una cuerda. Sigilo con éxito abre el desagüe; en otro caso queda la reja.');
  nodo('r5-control', 'Control de carga', ['patio', 'perros', 'basura'], 'Llegaron al control gracias a la credencial obtenida dentro.',
    [salida('r6-porton', { hecho: 'credencial' }, 1), salida('r6-reja')], [detectar], [pase], 'La credencial facilita engaño, pero si falla la detectarán y deberán pasar por la reja.');
  nodo('r5-patrulla', 'Zona de patrulla', ['perros', 'foco', 'turno'], 'La patrulla ocupa el paso hacia el perímetro.',
    [salida('r6-desague', exito('sigilo'), 1), salida('r6-reja')], [borrar], [], 'Sigilo con éxito abre el desagüe y permite borrar un rastro pendiente. Si falla queda la reja.');
  nodo('r6-desague', 'Desagüe del patio', ['zanja', 'reja', 'basura'], 'El desagüe permite alcanzar el foso exterior.', [salida('r7-foso')], [], [usarCuerda]);
  nodo('r6-reja', 'Reja del perímetro', ['reja', 'zanja', 'taller'], 'Tras la reja todavía queda atravesar el foso.', [salida('r7-foso')], [], [usarCuerda]);
  nodo('r6-porton', 'Portón de carga', ['patio', 'basura', 'turno'], 'El portón conecta con el acceso de vehículos del perímetro.', [salida('r7-puerta')], [], [pase]);
  nodo('r7-foso', 'Foso exterior', ['foso', 'alambre', 'alcantarilla'], 'Al otro lado del foso pueden buscar una alcantarilla o escalar el muro.',
    [salida('r8-alcantarilla', exito('sigilo'), 1), salida('r8-muro')], [], [usarCuerda], 'Sigilo con éxito abre la alcantarilla. En otro caso deberán superar el muro.');
  nodo('r7-puerta', 'Acceso exterior de vehículos', ['vehiculos', 'final', 'camioneta'], 'La credencial interior ya caducó: este control requiere un engaño nuevo.',
    [salida('r8-vehiculos', exito('engano'), 1), salida('r8-muro')], [], [], 'Engaño con éxito abre el paso de vehículos; en otro caso deberán superar el muro.');
  nodo('r8-alcantarilla', 'Alcantarilla exterior', ['alcantarilla', 'foso', 'reflectores'], 'El túnel desemboca fuera del recinto.', [salida('r9-exterior')], [], [usarCuerda]);
  nodo('r8-muro', 'Muro exterior', ['muro', 'alambre', 'reflectores'], 'La última barrera separa el muro del exterior.', [salida('r9-exterior')], [], [usarCuerda]);
  nodo('r8-vehiculos', 'Paso de vehículos', ['vehiculos', 'camioneta', 'final'], 'Superado el control, queda alcanzar el exterior.', [salida('r9-exterior')]);
  nodo('r9-exterior', 'Último tramo', ['final', 'foso', 'camioneta'], 'Los accesos vuelven a encontrarse en el último tramo de la fuga.', [], [], [usarCuerda]);
  return { nombre: 'La Fuga - decisiones y consecuencias', version: 'fuga-2.1.0', ifid: '75B93F65-74CB-41CB-A972-958925566F40', inicio: 'r1-celda', nodos };
}
