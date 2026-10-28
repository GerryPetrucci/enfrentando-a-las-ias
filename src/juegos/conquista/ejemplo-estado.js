// Fragmento de estado de EJEMPLO para «COMO LEER TU ESTADO» del prompt de Guerra de territorios. Texto FIJO (parte del contrato: la huella del prompt no debe depender de los bots):
// lo generó herramientas/ejemplo-estado-conquista.mjs con el motor y src/pruebas/conquista/ejemplo-estado.test.js avisa si la vista del motor cambia y este ejemplo queda viejo.
// Los numeros son inventados (una partida de bots); sin acentos, como todo el prompt.

export const FRAGMENTO_DE_ESTADO = `MAPA (terreno, recurso y vecinas por numero: 5 = R05):
R01 ll+Comida: 3 6 8
R02 ll+Oro: 4 5 7
...(una linea por region)...

Turno 9 de 30. Eres Ambar. Hay 4 reinos y 52 regiones. Reinos vivos: Azur, Ambar, Marfil, Iris.
Capitales: Azur R13 | Ambar R10 | Marfil R39 | Iris R41
Honor: Azur 8 | Ambar 7 | Marfil 7 | Iris 8
Maravilla: ninguna
Tu almacen (cierre del turno anterior): Comida 9 | Madera 0 | Roca 2 | Hierro 18 | Oro 16 | Caballos 0 | mejoras L0 A0 J0 I0
Disponible al gastar (con la produccion y el hambre de este turno ya aplicadas): Comida 13 | Madera 0 | Roca 2 | Hierro 20 | Oro 18 | Caballos 0 (produccion +7 Comida +2 Hierro +2 Oro; hambre -3 Comida)
Puedes reclutar hasta (sin cuartel): L 13.
Pactos vigentes: ninguno.
Hegemon: Azur (14 de 38 regiones con dueno): los demas lo atacan con +50%
Evento de este turno: Caravana.
Tu nota del turno anterior: "Plan: tomar R20 y reforzar R10."
Mensajes publicos: Marfil: "Propongo paz a quien no me ataque."

OCUPACION (region(unidades, fN, edificio; - = danado); +Reino L2 = tropas de visita):
Azur: R01(L1,g) R06(L2) R08(L1,g) R12(L1) R13(L1,f1) R15(L4A3) R16(L1) R18(L1) R19(L2) R23(L1A2) R26(L1) R27(L1A1) R31(L1) R34(L1)
Ambar (tu): R02(L3) R04(L1) R05(L3) R07(L1,g) R09(L1) R10(L1,f1) R11(L2)
...

FRENTES (tu ataque con lo que puedes mover contra la defensa visible, sin mejoras ajenas):
R20 Iris desde R11: ataque 0.8 vs defensa 1.3 (x0.68)
R10 amenazada por Azur desde R15: ataque 12.8 vs tu defensa 1.5 (x8.50)

Sucedio el turno anterior: Iris ataco R11 de Ambar y fue repelido. Azur conquisto R15 de Ambar. Azur conquisto R34 de Marfil. Azur es ahora el Hegemon.`;
