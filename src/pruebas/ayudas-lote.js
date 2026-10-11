// Ayudas compartidas por las pruebas del lote. No es un archivo de pruebas.
//
// clienteFalso() imita al cliente de src/lote.js (enviar / esperar) sin red ni gasto. `responder(cuerpo, modelo)` decide que
// contesta a cada peticion: { texto } o { error }. Los resultados salen en orden inverso, a proposito: se casan por custom_id.

export function clienteFalso({
  responder = (c) => ({ texto: `eco:${c.messages[1].content}` }),
  costoPorLote = 0.01,
  estado = 'completed',
  falloDeEnvio = null,
  sinResultadoPara = () => false,
  saldo = 10,
  falloDeCredito = null,
} = {}) {
  const enviados = [], lotes = new Map();
  return {
    enviados,
    async credito() {
      if (falloDeCredito) throw new Error(falloDeCredito);
      return { total: saldo, usado: 0, restante: saldo };
    },
    async enviar({ modelo, peticiones }) {
      if (falloDeEnvio) throw new Error(falloDeEnvio);
      const id = `lote-${enviados.length + 1}`;
      enviados.push({ modelo, ids: peticiones.map((p) => p.id), n: peticiones.length });
      lotes.set(id, { modelo, peticiones });
      return { id, status: 'validating' };
    },
    async esperar(id, { alCambiar = () => {} } = {}) {
      const { modelo, peticiones } = lotes.get(id);
      alCambiar('in_progress');
      const resultados = peticiones.filter((p) => !sinResultadoPara(p)).map((p) => {
        const r = responder(p.cuerpo, modelo);
        return r.error
          ? { custom_id: p.id, response: null, error: { message: r.error } }
          : { custom_id: p.id, error: null, response: { status_code: 200, body: { choices: [{ message: { content: r.texto }, finish_reason: 'stop' }] } } };
      }).reverse();
      const ok = resultados.filter((r) => !r.error).length;
      return {
        id, status: estado,
        request_counts: { total: peticiones.length, completed: ok, failed: resultados.length - ok },
        usage: { prompt_tokens: 100 * ok, completion_tokens: 50 * ok, total_tokens: 150 * ok, cost: costoPorLote },
        results: resultados,
      };
    },
  };
}
