// Entrada explicita para `node --test src/pruebas/worldbox/` (en Node 22+ un directorio se resuelve a su index.js).
// La suite global descubre los *.test.js directamente, sin ejecutar este indice.
// No incluye ensamblado.test.js (lote W2), puente-csharp.test.js (lote W4) ni puente-vivo.test.js (lote W5): cada lote corre los suyos;
// las pruebas en vivo se saltan salvo con WORLDBOX_VIVO=1.
import './contrato.test.js';
import './observacion.test.js';
import './puntuacion.test.js';
import './bots.test.js';
import './simulado.test.js';
import './pasarela.test.js';
import './telemetria.test.js';
import './reporte.test.js';
import './orquestador.test.js';
import './http.test.js';
import './real.test.js';
import './auditar.test.js';
import './estimar.test.js';
import './analisis-pesos.test.js';
import './x1.test.js';
import './cli.test.js';
import './vivo.test.js';
import './manual.test.js';
import './zoom.test.js';
import './preparacion.test.js';
import './era-reglas.test.js';
import './era-orquestador.test.js';
import './era-cortes.test.js';
import './era-mantenimiento.test.js';
import './era-respuestas-parser.test.js';
import './era-respuestas.test.js';
import './era-control.test.js';
import './era-presentacion.test.js';
