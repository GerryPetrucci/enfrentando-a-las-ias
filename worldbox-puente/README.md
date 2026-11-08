# worldbox-puente

Puente entre el orquestador Node (`src/worldbox/`) y WorldBox: un servidor HTTP de bucle local que
corre dentro del juego y habla el **protocolo v1** (`privado/worldbox/protocolo-puente-v1.md`).
Esta carpeta tiene la parte que **no toca el API de WorldBox** (servidor, protocolo, cola del hilo
principal, seguridad), un anfitrion de pruebas con un mundo simulado y la **integracion real con
WorldBox 0.51.2** (`integracion/`, probada en vivo; ver `privado/revisiones/W5-entrega.md` y `X2-entrega.md`).

Sin SDK de .NET: se compila con el `csc.exe` de .NET Framework (C# 5, nada de `$""`, `?.`, `nameof`...).
Sin dependencias externas.

## Construir y probar

```powershell
# biblioteca + anfitrion en worldbox-puente\salida\ (ignorada por git)
powershell -NoProfile -ExecutionPolicy Bypass -File worldbox-puente\construir.ps1

# ademas: comprueba la biblioteca contra el mscorlib/System del Mono del juego y genera
# salida\mod\PuenteWorldBox.dll (biblioteca + integracion, UNA DLL)
powershell -NoProfile -ExecutionPolicy Bypass -File worldbox-puente\construir.ps1 -Referencias "C:\Program Files (x86)\Steam\steamapps\common\worldbox\worldbox_Data\Managed"

# lo mismo para el mod, y operar el juego (compilar | instalar | cerrar | abrir | reiniciar | token)
powershell -NoProfile -ExecutionPolicy Bypass -File worldbox-puente\integracion.ps1 compilar

# prueba EN VIVO (el juego abierto con la DLL instalada); se salta sin WORLDBOX_VIVO=1
$env:WORLDBOX_VIVO = '1'; node --test src/pruebas/worldbox/puente-vivo.test.js

# pruebas: autoprueba en C# + extremo a extremo por HTTP (se omiten sin csc.exe)
node --test src/pruebas/worldbox/puente-csharp.test.js

# anfitrion a mano (puerto efimero; imprime "LISTO puerto=N token_archivo=RUTA")
worldbox-puente\salida\Anfitrion.exe --verboso
worldbox-puente\salida\Anfitrion.exe --autoprueba
```

## Estructura

```
worldbox-puente/
  construir.ps1        compila con csc.exe (PowerShell 5.1)
  src/                 biblioteca PuenteWorldBox.dll (sin UnityEngine)
    Contrato.cs          IMundo, DTOs, registro de acciones anunciadas   <- lo que implementa la integracion
    ServidorPuente.cs    TcpListener solo 127.0.0.1, un hilo por conexion con tope
    Protocolo.cs         rutas exactas, autenticacion, validacion, idempotencia
    ColaPrincipal.cs     cola hacia el hilo principal (Bombear)
    Http.cs, Json.cs, Seguridad.cs, CacheIdempotencia.cs, Registro.cs, Configuracion.cs, Errores.cs
  anfitrion/           Anfitrion.exe: el mismo servidor con un MundoSimulado + --autoprueba
  integracion/         capa con UnityEngine: WorldBoxMod, MundoWorldBox (IMundo real) y Juego; ver su README
  integracion.ps1      compilar / instalar / cerrar / abrir / reiniciar el juego con la DLL del mod
  salida/              binarios (git los ignora)
```

## Como se integra en el juego

```csharp
var cfg = new ConfiguracionPuente { CarpetaToken = carpetaDelMod, Log = UnityEngine.Debug.Log };
var servidor = new ServidorPuente(cfg);
servidor.Mundo = mundoDeWorldBox;   // IMundo; antes de tenerlo el puente responde estado "cargando"
servidor.Iniciar();                 // Awake
/* en Update(): */ servidor.Bombear();
/* al salir:    */ servidor.Detener();
```

## Garantias

- Solo `127.0.0.1`; un token de 32 bytes aleatorios en `puente-token.txt`, comparado en tiempo
  constante y nunca registrado. Se rechaza con 403 cualquier peticion con `Origin` o con `Host`
  distinto de `127.0.0.1:<puerto>`/`localhost:<puerto>`; no hay cabeceras CORS.
- Ninguna logica del juego corre en un hilo de red: todo `IMundo` se ejecuta en el hilo que llama a
  `Bombear()`, uno a la vez (`juego_ocupado` si llega otra). Las propiedades `Info`, `Capacidades` y
  `Acciones` son datos inmutables.
- Cuerpos con tope (64 KB), plazos de lectura, tope de conexiones, JSON estricto con limite de
  profundidad, idempotencia por `id_solicitud` (solo se guardan respuestas de exito).
- Solo se anuncian acciones `verificada` (el registro rechaza las que no lo estan).

## Controles de presentacion (para grabar video; no son acciones)

- `POST /v1/camara` `{faccion, zoom?:1..1000, modo?:"juego"|"limpio"}` enfoca el rey (o una unidad de la capital) de esa faccion; `{liberar:true}` la suelta. `modo:"limpio"` sigue a la unidad sin el panel del juego.
- `POST /v1/interfaz` `{visible:bool}` oculta/muestra la interfaz (bandera `Config.ui_main_hidden`, la del poder `hide_ui`). Siguen visibles la lista de noticias, el boton del ojo y el texto de version: recortarlos en OBS.
- Se anuncian en `capacidades.camara` / `capacidades.interfaz`; el modelo nunca los ve ni son acciones. Ver `privado/revisiones/V1-entrega.md`.

## Que garantiza cada capa (importante)

| Regla | Quien la hace cumplir |
|---|---|
| Autenticacion, solo loopback, sin CORS, forma de la solicitud (400), lista blanca de acciones, tipos y rangos de parametros | **Este puente** (siempre) |
| Rechazos estructurados de jugadas invalidas del modelo: accion desconocida, parametro invalido, `objetivo_invalido`, `objetivo_propio`, `objetivo_eliminado`, `sin_espacio`, `sin_guerra`... (HTTP 200, `resultado:"rechazada"`) | **Este puente** |
| Topes de seguridad por faccion y partida: 10 unidades creadas, 10 poderes, 100 recursos donados; `crear_unidades` todo o nada | **Este puente** |
| Idempotencia por `id_solicitud` (una solicitud igual, aunque sea simultanea, se ejecuta una sola vez) | **Este puente** |
| Semilla: entero 0..2147483647 (la misma regla en el cliente Node) | **Este puente y el cliente** |
| **Puntos de accion, cooldowns y "desde_turno"** (p. ej. `declarar_guerra` desde el turno 6) | **El orquestador Node** (`src/worldbox/contrato-acciones.js`). El puente los **anuncia** en `/v1/info` (`puntos`, `cooldown`, opcionales, solo informativos) pero **NO los aplica**: un cliente autenticado que se salte el orquestador no queda limitado por ellos. |

Un modelo nunca habla con este puente: solo lo hace el orquestador, despues de validar la accion contra su propio contrato.

## Que falta

Ver `privado/revisiones/W5-entrega.md` (pendientes: acciones sin verificar, equilibrio de especies, terreno
simetrico) y `privado/revisiones/X2-entrega.md`.
