#!/usr/bin/env node
// Mide cuanto ocupa el prompt de la Guerra de territorios con el texto REAL del juego (reglas, formato y vista), de 2 a 5
// reinos y en el peor caso, contra el tope aprobado de tokens de entrada. No llama a la API: cuenta caracteres y los divide
// entre los que Claude gasta por token en espanol (1.97; los demas modelos cuentan menos tokens).
//
//   node herramientas/medir-prompt.mjs
//
// Salida 0 si el peor caso cabe en el tope, 1 si no. Correrlo antes de agregar reglas al juego: el tope se sube solo con
// aprobacion expresa (CLAUDE.md). La prueba src/pruebas/conquista/prompt.test.js vigila lo mismo en `npm test`.

import { construirSistema } from '../src/prompt.js';
import conquista from '../src/juegos/conquista.js';
import { nuevoEstado, estadoPeorCaso, tokensDelPrompt, TOPE_TOKENS_ENTRADA, CARACTERES_POR_TOKEN } from '../src/pruebas/conquista/ayudas.js';

const fijo = Math.round(construirSistema(conquista).length / CARACTERES_POR_TOKEN);

console.log(`\n  Prompt de ${conquista.nombre} (texto real del juego; tokens de Claude = caracteres / ${CARACTERES_POR_TOKEN}; sin llamadas a la API)\n`);
console.log(`  texto fijo (reglas + formato): ${fijo} tokens\n`);
console.log('  inicio de la partida (turno 1):');
for (const k of [2, 3, 4, 5]) console.log(`    ${k} reinos  ${String(tokensDelPrompt(nuevoEstado(k))).padStart(5)} tokens`);

const peor = tokensDelPrompt(estadoPeorCaso());
const cabe = peor <= TOPE_TOKENS_ENTRADA;
console.log(`\n  peor caso, 5 reinos (4 mensajes + 4 privados + nota al largo maximo, mapa lleno): ${peor} tokens (tope ${TOPE_TOKENS_ENTRADA}: ${cabe ? 'cabe' : 'SE PASA'}, margen ${TOPE_TOKENS_ENTRADA - peor})\n`);
process.exit(cabe ? 0 : 1);
