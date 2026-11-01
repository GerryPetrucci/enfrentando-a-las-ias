// Estados de EJEMPLO para «COMO LEER TU ESTADO» del prompt de Lobo en la aldea. Texto FIJO (parte del contrato: la huella del prompt no debe depender del motor):
// lo generó herramientas/ejemplo-estado-lobo.mjs con el motor (una mesa de 12 jugada a mano, sin bots) y src/pruebas/lobo/ejemplo-estado.test.js avisa si la vista del motor
// cambia y estos ejemplos quedan viejos. Los numeros son inventados; sin acentos, como todo el prompt.

// La bruja en la fase bruja de la ronda 1: ve a la victima de los lobos.
export const ESTADO_BRUJA = `{"asiento":8,"rol":"bruja","ronda":1,"fase":"bruja","activo":true,"jugadores":[{"asiento":0,"vivo":true},{"asiento":1,"vivo":true},{"asiento":2,"vivo":true},{"asiento":3,"vivo":true},{"asiento":4,"vivo":true},{"asiento":5,"vivo":true},{"asiento":6,"vivo":true},{"asiento":7,"vivo":true},{"asiento":8,"vivo":true},{"asiento":9,"vivo":true},{"asiento":10,"vivo":true},{"asiento":11,"vivo":true}],"declaraciones":[],"pareja":null,"inspecciones":[],"pociones":{"salvar":true,"matar":true},"victima":10,"eventos":[]}`;

// Un aldeano al empezar el dia de la ronda 1: el asiento 10 murio en la noche y se revelo su rol.
export const ESTADO_DIA = `{"asiento":11,"rol":"aldeano","ronda":1,"fase":"dia","activo":true,"jugadores":[{"asiento":0,"vivo":true},{"asiento":1,"vivo":true},{"asiento":2,"vivo":true},{"asiento":3,"vivo":true},{"asiento":4,"vivo":true},{"asiento":5,"vivo":true},{"asiento":6,"vivo":true},{"asiento":7,"vivo":true},{"asiento":8,"vivo":true},{"asiento":9,"vivo":true},{"asiento":10,"vivo":false,"rol":"aldeano"},{"asiento":11,"vivo":true}],"declaraciones":[],"pareja":null,"inspecciones":[],"eventos":[{"ronda":1,"tipo":"amanecer"},{"ronda":1,"tipo":"muerte","asiento":10,"rol":"aldeano","causa":"noche"}]}`;

// Un evento de cada forma que puede aparecer en "eventos", en el orden en que ocurrieron en esa mesa.
export const EVENTOS = `{"ronda":1,"tipo":"amanecer"}
{"ronda":1,"tipo":"muerte","asiento":10,"rol":"aldeano","causa":"noche"}
{"ronda":1,"tipo":"mensaje","asiento":0,"mensaje":"Mensaje de ejemplo."}
{"ronda":1,"tipo":"mensaje","asiento":3,"mensaje":"Mensaje de ejemplo.","afirmaRol":"vidente"}
{"ronda":1,"tipo":"votacion","votos":[{"asiento":0,"voto":1},{"asiento":1,"voto":0},{"asiento":2,"voto":1},{"asiento":3,"voto":1},{"asiento":4,"voto":1},{"asiento":5,"voto":1},{"asiento":6,"voto":1},{"asiento":7,"voto":1},{"asiento":8,"voto":1},{"asiento":9,"voto":1},{"asiento":11,"voto":1}],"conteo":[1,10,0,0,0,0,0,0,0,0,0,0],"empate":false,"expulsado":1}
{"ronda":1,"tipo":"muerte","asiento":1,"rol":"lobo","causa":"voto"}
{"ronda":2,"tipo":"muerte","asiento":3,"rol":"vidente","causa":"noche","comprobacion":{"ronda":1,"rolDeclarado":"vidente","rolReal":"vidente","coincide":true}}
{"ronda":2,"tipo":"disparo","asiento":5,"objetivo":0}
{"ronda":2,"tipo":"muerte","asiento":0,"rol":"aldeano","causa":"disparo","pareja":4}
{"ronda":2,"tipo":"muerte","asiento":4,"rol":"aldeano","causa":"amor"}`;

// Los campos que solo ven algunos roles, tal como los entrega el motor.
export const CAMPOS_DE_ROL = `"declaraciones":[{"asiento":3,"ronda":1,"rol":"vidente"}]
"inspecciones":[{"ronda":1,"objetivo":11,"esLobo":false},{"ronda":2,"objetivo":7,"esLobo":true}]
"pareja":0
"enamoradosElegidos":[0,4]
"manada":[1,7,9]`;
