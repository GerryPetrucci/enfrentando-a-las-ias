# integracion

Capa que depende de UnityEngine y del juego (WorldBox 0.51.2): el `IMundo` real y el punto de entrada del mod. Se compila **junto con**
`../src/*.cs` en una sola `PuenteWorldBox.dll` (el cargador oficial de mods lee `StreamingAssets\mods\<Nombre>.dll` y espera la clase
`<Nombre>.WorldBoxMod : MonoBehaviour`, o sea `PuenteWorldBox.WorldBoxMod`).

| Archivo | Contenido |
|---|---|
| `WorldBoxMod.cs` | `MonoBehaviour`: arranca el servidor, crea el mundo cuando el juego termino de cargar, bombea la cola. |
| `MundoWorldBox.cs` | `IMundo` real: reiniciar (genera mapa y funda facciones), observar, acciones, avanzar, terminal. |
| `Juego.cs` | Acceso al API del juego (pausa, sitios, metricas, `Estabilizar`). |

Cada nombre del juego sale del binario (`node herramientas/worldbox-ensamblado.mjs ...`) y se comprobo en vivo; las acciones se anuncian
solo si estan en `MundoWorldBox.Verificadas`. Evidencia y mediciones: `privado/revisiones/W5-entrega.md` y `X2-entrega.md`.

## Reglas para quien toque esta capa

1. Implementar `IMundo` (`../src/Contrato.cs`) sin cambiar su forma. Si hace falta cambiarla, avisar.
2. **Nada del juego se lee ni se toca fuera de `ServidorPuente.Bombear()`**. `Info`, `Capacidades` y `Acciones` se calculan una vez, en el
   constructor, y son inmutables.
3. Anunciar solo acciones `verificada: true` que se implementaron y se comprobaron contra el juego real.
4. `Avanzar` no bloquea el hilo principal: despausa y llama `alTerminar` exactamente una vez, desde `Tick()`. Entre turnos la simulacion
   queda pausada. (`Reiniciar` si lo bloquea 0.4-1.0 s: avanza el cargador del juego hasta que el mapa nuevo esta listo.)
5. Mismos campos y mismo metodo de observacion para todas las facciones (equidad).
6. Lo que un MODELO puede equivocar (objetivo que no existe, pedir mas de lo que cabe, nombre de accion raro) se responde con
   `ResultadoAccion` **rechazada** (HTTP 200), nunca lanzando `ErrorPuente`. Solo la estructura rota de la solicitud es 400. Las reglas que
   no dependen del juego viven en `ReglasAccion` (`../src/Contrato.cs`) para probarlas sin abrir WorldBox.
7. **El puente no aplica puntos, cooldowns ni "desde_turno"**: los anuncia (`ConCosto`) para el cliente. Ver `../README.md`, "Que garantiza cada capa".
8. `Application.runInBackground = true`.

## Construir y operar

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File worldbox-puente\integracion.ps1 compilar   # -> salida\mod\PuenteWorldBox.dll
powershell -NoProfile -ExecutionPolicy Bypass -File worldbox-puente\integracion.ps1 reiniciar   # compilar + cerrar + instalar + abrir
$env:WORLDBOX_VIVO = '1'; node --test src/pruebas/worldbox/puente-vivo.test.js                  # prueba en vivo
```

Sin abrir el juego, el protocolo se ejerce contra `Anfitrion.exe` (`node --test src/pruebas/worldbox/puente-csharp.test.js`).
Opciones de `reiniciar` propias de este mundo: `tamano_mapa`, `facciones[].especie`, `opciones.plantilla|velocidad|unidades_iniciales|radio_creacion`
y, para pruebas, `opciones.tope_poderes|tope_donado` (solo pueden BAJAR los topes).
## Formato «era» (E2)

| Archivo | Contenido |
|---|---|
| `Era.cs` | `EraConfig` (valida `opciones.era`), `EraJuego` (espejo, biomas, muro, flora, depositos, rasgos, leyes, edades, compatibilidad especie x bioma) y `R` (reflexion: varios miembros del juego no son publicos). |
| `MundoWorldBoxEra.cs` | `IEra` del mundo real: catalogo, estado con seguimiento de linaje de reinos y eventos, `EraRasgos`, `EraMuro`, `EraMinerales`; y `IEraVelocidad.EraVelocidad` (E4, aditivo: `Config.setWorldSpeed` entre avances); `IEraMantenimiento.EraRasgosMantenidos` y `EraMantener()` (E5, aditivo: reaplica cada 0,25 s los rasgos que el juego pierde al reemplazar cultura, idioma o religion). |
| `MundoWorldBoxEraVigilancia.cs` | E9: vigilante del muro (devuelve a su lado o elimina las unidades del otro lado / sobre el muro; repara el muro) y unidad de reino (reune los reinos derivados al principal con `City.joinAnotherKingdom`); ambos activos por omision en era, bloques `vigilante` y `unico_reino` del estado. La logica pura vive en `src/ControlEra.cs` (autoprueba). |

Reglas propias: nada se anuncia sin probarlo en vivo (`privado/worldbox/era-fase0/e2/`); las leyes y la edad que fija una era se restauran en el
siguiente `reiniciar` y en `cerrar`; el muro guarda el tipo principal y superior de cada casilla y los restaura.
