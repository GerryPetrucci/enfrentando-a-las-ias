# Enfrentando a las IAs

Juegos reproducibles entre modelos, videos y sitio de resultados. Node 20+, ES
modules, cero dependencias, sin build. Espanol; textos publicos con acentos.

## Contrato

- Respetar la instruccion actual del usuario y los cambios ajenos (`git status`).
- No leer `.env` ni llaves. Sin API pagada, commit, push, PR o fusion sin orden.
  Al avisar una subida, aplicar `docs/politica-publicacion.md` (solo entonces).
- No publicar `privado/`, datos completos, voz ni grabaciones. Los planes y
  resultados ineditos van en privado. No invocar otros asistentes sin autorizacion.
- Motor valida acciones; la IA no modifica estado. Azar solo mediante RNG con seed.
  Reglas/prompts se versionan: revisar spec antes de tocarlos. No retocar partidas.
- La web no importa src/herramientas. Paleta en `web/paleta.js`, fuentes locales,
  zonas seguras; verificar capturas antes de afirmar una mejora grafica.
- Paginas de revision/prueba generadas (REVISAR.html, `ver-piloto.mjs` y similares,
  cualquier juego) usan los tokens de marca del sitio publico (tipografia y paleta
  de `web/sitio.css`: Barlow Condensed en titulos, Inter en texto, `--oro/--noche/
  --panel/--hueso/--borde`), no un estilo generico aparte. Si muestran una
  grabacion/reproduccion, incluyen velocidad ajustable y una barra de avance con
  retroceso/adelanto, no solo Reproducir/Reiniciar. Regla decidida 24-10-2026.
- Ninguna parte se queda sin gancho «Próximamente»: en video si hay al menos 2 cortes buenos (`web/casino/gancho.js`); si no (Lobo, o cualquier juego sin momentos
  con puntos) el paquete genera un **gancho en imagen** (`herramientas/gancho-imagen.mjs`, página `web/gancho-imagen.html`): «Próximamente», nombre del juego,
  «Juego N · Parte M de K» (N = el jN del paquete) y la etiqueta de IA, con el arte del juego si está en `ARTE_GANCHO` (`web/casino/gancho-imagen.js`; sin él, solo la
  marca), dentro de la zona segura. Al agregar un juego, registrar su arte allí (ver `docs/produccion-videos.md`). Regla decidida 25-10-2026.
- Narración (voz y subtítulos): nunca se lee el número de jugador/asiento. Se dice el nombre del modelo («Grok»); si un modelo ocupa varios asientos lleva letra por
  orden de asiento («Grok A», «Grok B», «Grok C»). El número solo se escribe en pantalla, desde 1 y sin cero a la izquierda. Lo que un modelo cita de otro en su mensaje («asiento 5»,
  «al 0», «Lobo 4», «entre 3,6,7») se traduce al nombre en voz, subtítulos y tarjeta. Un mensaje de varias tarjetas (1/4, 2/4...) dice «X dice» solo en la primera. Regla decidida
  25-10-2026 (Lobo: `web/casino/lobo-nombres.js`; el motor y el prompt siguen contando asientos desde 0: es solo presentación).
- Cierre de cada video (`web/casino/cierre.js`): la frase depende de la pieza. `final` (la parte que llega al último turno: seguir para ver más juegos), `parte` (deja el juego a medias:
  «no te pierdas la siguiente parte»), `clip` (ver la partida completa) y `gancho` (estar al pendiente). No todas piden «síguenos». La dirección de grabación lo lleva en `cierre=parte|final|clip|gancho`.
- Título y descripción de cada pieza, en todas las redes, empiezan igual: `Juego JN - Parte 1/2 - Seed S` (clip: `Clip 2 (Parte 1/2)`; gancho: `Próximamente Parte 2/2`). Regla decidida 25-10-2026 (`web/casino/editorial-paquete.js`).
- Tests funcionales con bots/mocks. Pruebas afectadas primero; suite completa al
  cerrar cambios de codigo. `npm.cmd test` funciona en PowerShell. No repetirla
  si no hay nuevos cambios, fallos o dudas que lo justifiquen.

- Sin sondeos al otro asistente: esperar su entrega y aviso final; no revisar archivos durante su trabajo ni duplicar sus comprobaciones sin un hallazgo concreto.

## Contexto por tarea

No cargar CLAUDE.md ni el historial completo por rutina. Buscar con `rg -n` y
leer solo la seccion necesaria. Estado actual unico:
`privado/planes/estado-compartido.md`; confirmar con codigo y pruebas. El relevo
historico sigue en `privado/planes/relevo-asistentes.md`, solo bajo demanda.

Trabajo conjunto autorizado: aplicar `docs/colaboracion-asistentes.md` y la skill
`colaboracion-por-lotes`. Un coordinador actualiza el estado; encargos por archivos,
una entrega y una revision por lote. El usuario elige el primer lote antes de
iniciar producto. No duplicar reglas ni estado operativo en CLAUDE.md.

| Tarea | Entrada |
|---|---|
| Videos, archivos, audio, guion | `docs/produccion-videos.md` |
| Juego y balance | `src/juegos/<id>/`, spec en `privado/spec/` |
| Escena y diseno | `web/casino/mesa-<id>.js`, layout y CSS del juego |
| API y costos | `src/modelos.js`, `parametros.js`, `docs/metodologia.md` |
| Redes y perfiles | `web/redes.js`, `marca/perfiles.md` |
| Publicacion al avisar subida | `docs/politica-publicacion.md` |
| Decisiones antiguas | buscar tema en `docs/contexto-historico.md` y `docs/decisiones-detalle.md` |

Relevo breve en `privado/planes/relevo-asistentes.md`, sin copiar conversaciones.
Para reducir exploracion repetida usar la skill local `contexto-proyecto`.
