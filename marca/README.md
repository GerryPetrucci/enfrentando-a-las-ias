# Marca · Enfrentando a las IAs

Guía de identidad. Decisiones tomadas el 8 de octubre de 2026: logo **A · Duelo**, paleta actual, español primero.
(Los identificadores y comentarios del código van sin acentos; los textos que ve el público, como estos, sí.)

## Esencia

**El marcador honesto de las IAs.** Las ponemos a jugar entre sí, con el mismo prompt para todas, y llevamos la cuenta.

- **Promesa:** lo que ves es lo que decidió cada IA. Nada de "esta es la mejor".
- **Eslogan:** *Mismo juego. Mismo prompt. A ver quién gana.*
- **Descriptor corto:** marcador de IAs en juegos de confianza y traición.

## Logo

Dos discos que se cruzan: **confianza** (verde) contra **traición** (rojo). Donde se cruzan, en oro, queda la tensión de cada ronda.

| Archivo | Uso |
|---|---|
| [`logo/icono.svg`](logo/icono.svg) | Icono circular con fondo. Apps y fichas. |
| [`logo/icono-sin-fondo.svg`](logo/icono-sin-fondo.svg) | Solo los discos. Es la base de todas las plantillas. |
| [`logo/favicon.svg`](logo/favicon.svg) | Cuadrado redondeado para la pestaña del navegador. |
| [`exportados/logo-horizontal-1600x500.png`](exportados/logo-horizontal-1600x500.png) | Icono + nombre. Presentaciones y prensa. |
| [`exportados/avatar-1080.png`](exportados/avatar-1080.png) | Foto de perfil, la misma en todas las redes. |

- **Espacio libre:** medio disco (un radio, la mitad del diámetro) por cada lado.
- **Tamaño mínimo:** icono 24 px; favicon 16 px; logo horizontal con discos de al menos 32 px de alto.
- **Fondo:** siempre Noche o un fondo muy oscuro. Sobre claro, ponlo dentro de una caja Noche; no lo recolores.
- **No hagas:** estirarlo, girarlo, ponerle sombras, cambiar los colores, ni ponerlo junto a logos de proveedores de IA.

Los colores significan **jugadas**, no modelos: verde = cooperar, rojo = traicionar, oro = tensión o marca. Nunca pintes a una IA de rojo para decir que es "la mala".

## Paleta

| Rol | Nombre | Hex | Contraste sobre Noche | Uso |
|---|---|---|---|---|
| Fondo | Noche | `#101014` | — | Fondos |
| Superficie | Panel | `#17171c` | — | Tarjetas |
| Borde | Borde | `#2a2a33` | — | Líneas |
| Texto | Hueso | `#f2f0ed` | 16.69 : 1 | Títulos y texto |
| Texto suave | Suave | `#9a9aa6` | 6.82 : 1 | Subtítulos, notas |
| Texto mínimo | Aviso | `#8a8a96` | 5.57 : 1 | Letra chica y avisos legales |
| Marca | Oro | `#e0b25c` | 9.67 : 1 | Marca, etiquetas, acentos |
| Traición | Rojo | `#d8584e` | 4.90 : 1 | Promesa rota, traicionar |
| Confianza | Verde | `#5fa877` | 6.65 : 1 | Palabra cumplida, cooperar |

Contrastes medidos con la fórmula WCAG. Todos superan 4.5 : 1, el mínimo para texto chico. Texto Noche sobre Oro: 9.67 : 1 (botones).
El rojo es el más justo (4.90 : 1): úsalo en letra mediana o grande y en negrita, no en texto de pie de página.

## Tipografía

- **Títulos:** Barlow Condensed 800, en mayúsculas. Etiquetas pequeñas: 700 con espaciado amplio.
- **Texto:** Inter 400 y 600.
- Ambas son gratuitas (licencia SIL OFL). Las plantillas las cargan de Google Fonts.

## Voz

Directa, con humor seco, sin hablar como robot. Tuteo neutro, comprensible en todo Latinoamérica (poca jerga local).

- **Se dice:** *"En este juego, con estas reglas, en estas 8 partidas, ganó X."*
- **No se dice:** *"X es la mejor IA."* Nunca se publica un duelo suelto como veredicto.
- **Fórmulas de título que funcionan con el formato:**
  - *[IA] prometió [A] y hizo [B].*
  - *Se traicionaron las dos.*
  - *¿Le gana a Toma y Daca?* (el control como vara de medir)
  - *Ronda 7: ahí se rompió todo.*
- **Evita:** insultar a un proveedor, declarar ganadoras absolutas, prometer resultados que no se han medido.

## Reglas editoriales (propuestas, tú decides)

1. **Las jugadas no se retocan.** Lo que se ve es lo que registró el motor; los errores de API se muestran, no se esconden.
2. **El prompt es público** y está versionado. Si cambia, empieza una temporada nueva (v1.0.0 = Temporada 1).
3. **Seed y número de partidas visibles** en cada resultado.
4. **Los controles** (`tomaydaca`, `siempre-c`, `siempre-t`, `azar`) aparecen en el marcador como referencia.

## Proveedores de IA: qué sí y qué no

Resumen de una revisión hecha el 8 de octubre de 2026. **No es asesoría legal**; confírmalo con un abogado antes de monetizar.

- **Logos:** no se usan, ni en el logo ni en portadas ni en imágenes para compartir. Anthropic, OpenAI y Google exigen permiso previo; Meta lo regula en la licencia de Llama. DeepSeek no se revisó.
- **Nombres:** se pueden usar de forma descriptiva ("en esta partida jugó Claude"). No pueden formar parte del nombre del canal, los usuarios ni el dominio, y no se debe sugerir patrocinio.
- **Aviso estándar** (cuando haya espacio): *Proyecto independiente, sin afiliación con los proveedores de los modelos.*
- **Cada IA se identifica con un disco de color y su inicial**, como en el reproductor. Los colores actuales de `src/modelos.js` se parecen a los de cada proveedor; conviene cambiarlos a una gama propia.
- **Pendiente:** revisar los términos de uso de cada proveedor sobre publicar comparativas.

Fuentes: [Anthropic](https://www.anthropic.com/legal/trademark-guidelines) · [OpenAI](https://openai.com/brand/) · [Google](https://about.google/brand-resource-center/brand-elements) · [licencia de Llama](https://huggingface.co/meta-llama/Llama-3.2-1B-Instruct/blob/main/LICENSE.txt).

## Archivos y cómo regenerarlos

```
marca/
  logo/         SVG (vectores puros, sin fuentes)
  plantillas/   HTML editables (base.css + una pieza por archivo)
  exportados/   PNG listos para subir
  exportar.ps1  genera los PNG con Edge o Chrome
  perfiles.md   nombres, bios y descripciones por red
```

```powershell
powershell -File marca\exportar.ps1              # todas las piezas
powershell -File marca\exportar.ps1 -Pieza og    # solo una
```

| Pieza | Tamaño | Dónde |
|---|---|---|
| `avatar` | 1080×1080 | Foto de perfil (las redes la recortan en círculo) |
| `banner-youtube` | 2560×1440 | Banner del canal. Todo el contenido está en la zona segura (1546×423) |
| `banner-x` | 1500×500 | Encabezado de X. El contenido evita la esquina del avatar |
| `og` | 1200×630 | Vista previa al pegar el link del sitio |
| `teaser` | 1080×1350 | Publicación de lanzamiento para el feed (4:5) |
| `portada` | 1080×1920 | Portada de Reels y TikTok. Se edita el texto en el HTML y se regenera |
| `logo-horizontal` | 1600×500 | Presentaciones y prensa |
