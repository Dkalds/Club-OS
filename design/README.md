CLUB OS es el sistema operativo digital de un club de baloncesto de formación: mobile-first, oscuro, deportivo. Debe sentirse **premium, atlético, moderno, serio y rápido**. Nunca escolar, nunca ERP, nunca recargado.

## Plataforma y club (white-label)

CLUB OS es multi-club. Este sistema separa lo que es de la plataforma de lo que pone cada club.

- Los tokens que empiezan por `brand-` son del club: `brand-accent`, `brand-accent-pressed`, `brand-on-accent`, `brand-accent-soft`. Se cargan desde `organization_branding` en el layout de `/c/[club]` como variables CSS. Todo lo demás es plataforma y no cambia.
- El tema `CB Arcángel` es el primer club (acento dorado). El tema `Club demo (white-label)` existe para comprobar que nada depende del dorado: cualquier pantalla tiene que verse bien en los dos.
- Nunca escribas en el código «Arcángel», «The Arcángel Way», sus colores, su logo, sus categorías ni sus Standards. Nombres de secciones y colecciones salen de la terminología del club (`organization_branding.terminology`).
- Al configurar un club, valida su acento: `brand-accent` con al menos 4.5:1 sobre `bg`, `surface-1` y `surface-2`, y `brand-on-accent` con al menos 4.5:1 sobre `brand-accent`. Si no llega, la herramienta de configuración propone el tono más cercano que sí cumple.
- Logo del club: si existe, se muestra en `TopNavigation`; si no, el nombre del club en `font-display` en texto plano. No hay logo de CLUB OS todavía: la marca de plataforma se escribe «CLUB OS» en `font-display`.

## Contenido y voz

- Interfaz en español, tuteando: «Crea la primera sesión», «Abrir entrenamiento». Frases cortas, verbos al principio, sin exclamaciones ni emoji.
- Los términos de marca de cada club se respetan tal cual, en su idioma: The Way, Standards, Coaching Points.
- Títulos de pantalla, de card y de sección en MAYÚSCULAS con `font-display`. El texto corrido, nunca en mayúsculas.
- Formatos fijos: fecha «Martes 8 oct», hora «18:00–19:15», duración «75 min» en texto y «15'» en el Practice Builder, metadatos de ejercicio «U12+ · 6–12 jug. · 10–15 min», dorsal «#4».
- Datos de ejemplo siempre ficticios. Nunca nombres reales de menores en mockups, demos o seeds.

## Qué y por qué

Principio de producto: *Everyone knows what's next. Everyone knows why.* El QUÉ es calendario, entrenamiento, partido, convocatoria y comunicación; el POR QUÉ es metodología, identidad, objetivos y desarrollo.

- Todo QUÉ (sesión, ejercicio, objetivo y, más adelante, convocatoria) muestra su POR QUÉ: el Standard o principio que trabaja, con `StandardBadge`.
- Si un elemento no tiene Standard ni principio enlazado, no se inventa uno: se muestra sin badge y cuenta como hueco en la vista de cobertura de dirección.

## Color

- Fondo `bg`; contenido en `surface-1`; elementos dentro de una card en `surface-2`; pulsado o seleccionado `surface-3`.
- Texto: `ink` para lo principal, `ink-2` para descripciones, `ink-3` para metadatos. `ink-3` no va sobre `surface-3`.
- El acento del club se usa con moderación: el CTA principal (uno por pantalla), la pestaña activa, dorsales y números de bloque, Standards y la barra de progreso del Live Mode. Nunca para bloques de texto ni fondos grandes.
- Una sola card `spotlight` por pantalla: lo que el usuario necesita hoy. Dentro, el CTA es `on-spotlight` con texto `brand-accent`.
- Estados: `success` (hecho, guardado) y `danger` (error, borrar, EN DIRECTO), siempre acompañados de palabra o icono, nunca solo color.
- Bordes de controles en `line-strong` (3:1 o más); `line` solo separa.
- Foco de teclado: `focus-ring` (alias de `ink`), 2px sólido con 2px de separación, sobre cualquier superficie.
- Sin degradados, sin glassmorphism, sin sombras en cards. `shadow-sheet` solo en hojas inferiores y en los controles del Live Mode.

## Tipografía

- Dos familias: `font-display` (Barlow Condensed) para títulos, números y botones; `font-text` (Barlow) para todo lo demás. Ambas de Google Fonts.
- Estilos de display: `timer` solo para el cronómetro; `display-xl` saludo y nombre de jugador; `display-l` título de pantalla; `display-m` título destacado; `title` títulos de card y sección; `numeral` números de bloque, dorsales y duraciones.
- Estilos de texto: `body-l` objetivos y The Way; `body` por defecto; `body-strong` nombres en listas; `body-s` metadatos; `label` kickers en mayúsculas; `caption` navegación inferior.
- Cifras tabulares (`font-variant-numeric: tabular-nums`) en cronómetro, horas, dorsales y duraciones.

## Espaciado y layout

- Rejilla de 4px. Margen lateral de pantalla `space-4`; padding de card `space-4`; entre cards `space-3`; entre secciones `space-6`.
- Radios: `radius-lg` cards, `radius-md` botones e inputs, `radius-sm` chips y miniaturas, `radius-xl` card destacada y hojas, `radius-pill` avatares y filtros.
- Áreas táctiles de `target-min` (44px) como mínimo; `target-live` (72px) en el Live Mode.
- Contenido móvil hasta `content-max`. La gestión (admin) usa un layout de escritorio con los mismos tokens: desde `lg` (1024px), columna de navegación de `admin-nav` y contenido hasta `admin-content-max`; debajo, pestañas desplazables encima del contenido.
- Pocas acciones por pantalla: una principal, como mucho dos secundarias.

## Imagen y menores

- Fotografía deportiva en blanco y negro, con `scrim` cuando lleva texto encima. Nada de fotos de stock corporativas.
- Un jugador menor solo aparece en foto si su consentimiento de imagen está registrado. Por defecto, `Avatar` con iniciales o dorsal.
- Ninguna imagen de un menor por URL pública: siempre URLs firmadas de corta duración.

## Diagramas de pista

- El diagrama de pista es el dibujo propio del producto: líneas de pista en `ink-3`, jugadores atacantes como círculos en `ink`, defensores como X en `brand-accent`, movimientos en `brand-accent` (continuo = jugador, discontinuo = pase).
- Fondo `surface-2` en miniatura (80×60, `radius-sm`) y `surface-1` a tamaño completo.

## Iconografía

- Iconos de línea, trazo 1.75px, extremos redondeados, 20px por defecto (16 y 28 como variantes), en `currentColor`. Los de esta vista previa están dibujados para el sistema; en código, usa un set de línea abierto con el mismo trazo y sustituye uno a uno.
- La pestaña activa engrosa el trazo a 2.25px.
- Nunca emoji ni iconos rellenos mezclados con los de línea.

## Componentes y estados

- Monta cada pantalla con `AppShell`, `TopNavigation` y `BottomNavigation`; no crees contenedores propios.
- Listas: `Card` `flush` con `ListRow`, `PlayerCard`, `DrillCard` o `PracticeItem`.
- Toda vista con datos tiene sus tres estados: `LoadingState` (esqueleto con la forma real), `EmptyState` (con una salida) y `ErrorState` (con reintento).
- `PracticeItem` y `ListRow` son adiciones al inventario del brief: los repiten varias pantallas.

## Live Mode

- Pantalla completa, sin navegación inferior, pantalla siempre encendida.
- Arriba: salir, EN DIRECTO, «3 / 5» y la barra de progreso. En medio: fase, ejercicio, `timer`, diagrama y 3 coaching points clave. Abajo, al alcance del pulgar: anterior, pausa (el único `primary`) y siguiente, a `target-live`.
- El cronómetro se calcula desde marcas de tiempo para sobrevivir al bloqueo de pantalla.
- Al pasar de ejercicio se registra si se completó y sus minutos reales: es el dato de lo que el equipo entrenó de verdad, base de la cobertura y de la futura IA.
