# Fuentes de la marca

La marca usa **Barlow Condensed** (titulos, nombres, numeros) e **Inter** (texto). Los archivos de esta carpeta las llevan con el repo para que la escena de casino
se vea igual en cualquier equipo, tambien en el sitio publicado, y sin descargar nada de internet (la grabacion puede hacerse sin red).

| Archivo | Que es |
|---|---|
| `barlow-condensed-600.woff2`, `-700.woff2`, `-800.woff2` | Barlow Condensed SemiBold, Bold y ExtraBold (subconjunto latino: cubre el espanol completo) |
| `inter-variable.woff2` | Inter variable (todos los pesos, subconjunto latino) |
| `OFL-barlow-condensed.txt`, `OFL-inter.txt` | las licencias |

## Licencia

Las dos son **SIL Open Font License 1.1 (OFL)**: se pueden usar gratis, tambien en proyectos comerciales y en videos, y se pueden redistribuir con el repo siempre que
se conserve su texto de licencia (por eso estan aqui los dos `OFL-*.txt`). Lo unico que la OFL no permite es vender las fuentes por si solas.
Revision: 16 de octubre de 2026, contra los archivos de licencia de Google Fonts (github.com/google/fonts, carpetas `ofl/barlowcondensed` y `ofl/inter`).

## De donde salen

- Los `.woff2` vienen de Fontsource (`@fontsource/barlow-condensed` y `@fontsource-variable/inter`, via jsDelivr), que empaqueta las mismas fuentes de Google Fonts.
- Los `.ttf` (los que se instalan en Windows) vienen de `github.com/google/fonts`: `BarlowCondensed-SemiBold.ttf`, `-Bold.ttf`, `-ExtraBold.ttf` e `Inter[opsz,wght].ttf`.
  No estan en el repo (pesan casi 1 MB) y no hacen falta para la escena, que carga los `.woff2` con `@font-face` en `web/casino/mesa.css`.

## En el equipo que graba

Instaladas el 16 de octubre de 2026 para el usuario de Windows (sin permisos de administrador): los `.ttf` en `%LOCALAPPDATA%\Microsoft\Windows\Fonts` y su registro en
`HKCU\Software\Microsoft\Windows NT\CurrentVersion\Fonts`. Sirven para todo lo que no sea la escena (plantillas de `marca/`, textos de OBS, otros programas). Para
reinstalarlas en otro equipo basta bajar esos `.ttf` y abrirlos con "Instalar para todos los usuarios" o "Instalar".

## Lo que no cubren

El simbolo de estrella de la carta arcoiris (la letra de su esquina) no esta en estas fuentes: el navegador usa la del sistema.
