// Los nombres de reino de la Guerra de territorios (Azur, Ámbar, Violeta, Rosa, Marfil). Los modelos los ven en su prompt y los usan en sus mensajes y razones («Azur propone paz a Violeta»); la escena
// nombra a cada reino con el modelo que lo juega, asi que el marcador pone los dos juntos para que el publico entienda de quien se habla. Son los mismos de src/juegos/conquista/constantes.js (la web no
// puede importar de src/: src/pruebas/escena/reinos-conq.test.js los ata), con acentos porque es texto publico. El asiento k es siempre el reino NOMBRES_REINOS[k], aunque la serie rote quien se sienta ahi.

export const NOMBRES_REINOS = ['Azur', 'Ámbar', 'Violeta', 'Rosa', 'Marfil'];

// El reino del asiento k; '' si el asiento no existe (un dato raro nunca rompe el marcador).
export const nombreDeReino = (k) => (Number.isInteger(k) ? NOMBRES_REINOS[k] ?? '' : '');
