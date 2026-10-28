// Memoria mecanica privada del ultimo turno; nunca copia respuestas crudas ni al rival.
import { MAX_ORDENES } from './constantes.js';

export function resumenOrdenes(registro, turno) {
  const exceso = `mas de ${MAX_ORDENES} ordenes`;
  const descartadas = [...(registro.descartadas ?? []),
    ...registro.ordenes.filter((o) => o.estado === 'descartada')];
  return {
    turno, invalida: !!registro.invalida, motivo: registro.motivo,
    aplicadas: registro.ordenes.filter((o) => o.estado === 'aplicada').length,
    descartadas: descartadas.filter((o) => o.motivo !== exceso).map(({ texto, motivo }) => ({ texto, motivo })),
    exceso: descartadas.filter((o) => o.motivo === exceso).length,
  };
}
