# Arte de Guerra de territorios

## PNG utilizados (25 de octubre de 2026)

Todos salen de UNA hoja de iconos en cuadrícula de 3 × 3 (fondo transparente, 1254 × 1254 px) que entregó el usuario: `Iconos RPG en cuadrícula pixel art.png`, guardada sin tocar en `privado/prototipos/conquista-iconos/hoja-iconos.png`. `herramientas/recortar-iconos-conquista.mjs` la recorta a un PNG por icono (caja del dibujo + 2 px, sin el velo casi invisible del fondo) y reduce los que pasan de 128 px (la Maravilla, de 256 px) promediando el área; no se retoca ni se redibuja nada. Es la única fuente de estos archivos: no se editan a mano (una prueba guarda su huella).

| Archivo | Lo que dibuja | Dónde se usa |
|---|---|---|
| comida.png | filete de carne | recurso Comida |
| madera.png | tres troncos apilados | recurso Madera |
| oro.png | pepitas de oro | recurso Oro |
| hierro.png | lingotes de metal | recurso Hierro |
| caballos.png | herradura | recurso Caballos |
| tropas.png | maza con bola de picos | total de tropas del marcador |
| maravilla.png | castillo con cúpula azul y cascadas | la Maravilla sobre su región |

La hoja trae además un **arco** y una **espada** que todavía no tienen lugar en la escena: se quedan en `privado/` (`herramientas/recortar-iconos-conquista.mjs --todos` los recorta cuando se decida dónde van).

Procedencia: el usuario aportó la hoja; el archivo no dice con qué herramienta ni bajo qué condiciones se hizo, y aquí no se inventa un autor, un generador ni una licencia. Si la hoja es contenido generado con IA, la etiqueta «Contenido generado por IA» de cada video ya lo cubre.

## Dibujos por código

**Roca** no viene en la hoja: se dibuja con bloques Canvas en `recursos-pixel-conquista.js`, con materiales de `web/paleta.js`. Los demás recursos conservan allí su dibujo anterior como alternativa si su PNG no carga (y la Maravilla, su monumento de bloques en `mapa-dibujo.js`).

## Pack anterior

Los PNG de la leña partida y la maza que se usaban antes (paquete Fantasy Survival RPG Inventory Icons — 128 Free Sample, con su licencia) ya no se usan y se movieron a `privado/papelera-imagenes-2026-10-25/conquista-paquete-anterior/`.
