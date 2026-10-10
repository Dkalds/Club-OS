# Pizarra visual · Diseño

Fecha: 11 oct 2026. Estado: alcance aprobado por el propietario en conversación el 10 oct 2026 («Con pasos y animación»). Es la pieza 3 de la «Propuesta de evolución para CLUB OS» (§4 y parte de §5); la tabla de las diez piezas está en `2026-10-10-uso-diario-design.md`. Va encima de la pieza 2 (Dkalds/Club-OS#16). El editor para dibujarlas es la pieza 4.

## Propósito

Que un ejercicio se entienda en pista sin leerlo entero:

- La pizarra de un ejercicio deja de ser una imagen subida y pasa a ser **datos**: jugadores identificables, balón, conos y movimientos, que la app dibuja.
- Cuando la acción lo necesita, va **por pasos**, con reproducir, pausar, reiniciar y avanzar paso a paso.
- El mismo recurso se ve igual en la **ficha**, en la **sesión** y en el **directo**.
- La ficha no enseña una pista vacía como si fuese una pizarra terminada.

## Cómo está hoy

- Un ejercicio puede llevar un diagrama: una imagen subida a Storage (`drills.diagram_media_id`), que se enseña con una URL firmada de 10 minutos. Ninguno del seed lo tiene.
- Sin diagrama, la ficha y el directo pintan la pista vacía (`CourtThumb` a tamaño completo, «Pista sin diagrama»).
- En el directo la imagen no está disponible sin conexión, y `diagram-cache.ts` no está conectado.
- El directo enseña del ejercicio su título, su fase, sus puntos clave y sus Standards; no cómo se organiza.
- El dibujo del producto ya está definido (`design/README.md`, «Diagramas de pista») y hay una pizarra decorativa en el acceso (`CourtPlay`), con una jugada fija.

## Decisiones tomadas

Con el propietario, el 10 oct 2026: la pizarra lleva **pasos y animación** desde esta pieza. Las pizarras de ejemplo salen del seed hasta que exista el editor (pieza 4).

Las demás las toma este diseño; las que el propietario podría querer distintas están en «Decisiones a confirmar».

## La pizarra como dato

Una columna nueva, `drills.board jsonb`, nula mientras el ejercicio no tenga pizarra. Su forma (versión 1):

```ts
type BoardPoint = { x: number; y: number };
type BoardToken = { id: string; kind: "attacker" | "defender" | "ball" | "cone"; label?: string; at: BoardPoint };
type BoardMove = { token: string; kind: "cut" | "dribble" | "pass" | "screen"; to: BoardPoint };
type BoardStep = { note?: string; moves: BoardMove[] };
type Board = { version: 1; court: "half" | "full"; tokens: BoardToken[]; steps: BoardStep[] };
```

- **Coordenadas.** De 0 a 100 en los dos ejes, enteras, en unidades de pista y no de pantalla: `x` a lo ancho y `y` a lo largo, con el aro de ataque en `y = 0`. En media pista, `y = 100` es el centro del campo; en pista completa, la otra línea de fondo.
- **Fichas** (`tokens`). Dónde está cada una al empezar. Un atacante o un defensor llevan una etiqueta de uno o dos caracteres («1», «5», «A»); el balón y los conos, no.
- **Pasos** (`steps`). Cada paso es lo que pasa a la vez: quién se mueve, cómo y hasta dónde, y una nota corta que lo cuenta («El 1 pasa al 2 y corta»). Una pizarra sin pasos es una foto fija.
- **Movimientos.** `cut` (el jugador se desplaza sin balón), `dribble` (con balón), `pass` (se mueve el balón) y `screen` (el jugador va a bloquear). El balón acompaña a quien bota: si al empezar el paso está pegado a ese jugador, se mueve con él.
- **Fotogramas.** Dónde está cada ficha tras cada paso no se guarda: se calcula (`boardFrames`), aplicando los movimientos de cada paso sobre el anterior.
- **Límites.** 24 fichas, 12 pasos, 12 movimientos por paso, notas de 140 caracteres. Los ids de ficha no se repiten y todo movimiento es de una ficha que existe.

Quién valida: la base solo comprueba que es un objeto, que dice `version: 1` y que no pasa de 32 kB. La forma entera la comprueba la app con Zod, **al leer**: una pizarra que no la cumple se trata como si no hubiera (`parseBoard` devuelve `null`), nunca rompe la pantalla.

En esta pieza la app no escribe la columna: no se concede a `authenticated` (C27), `save_drill` no la toca y editar un ejercicio la conserva. La escribe el seed, con la clave de servicio. Escribirla llega con el editor.

## Cómo se dibuja

Un componente, `Board`, que pinta la pizarra en SVG con el dibujo del producto:

- Líneas de pista en `ink-3`. Media pista en la caja 4:3 de siempre; pista completa apaisada.
- Atacantes: círculos en `ink` con su etiqueta. Defensores: X en `brand-accent` con su etiqueta. Balón: punto relleno en `ink`. Conos: triángulos en `ink-3`.
- Movimientos en `brand-accent`, con punta de flecha: continuo el corte, ondulado el bote, discontinuo el pase y continuo acabado en una barra el bloqueo.
- En cada paso se ven las fichas donde están al empezarlo y los movimientos de ese paso.

Con más de un fotograma lleva controles, de 44 px:

- **Reproducir / Pausar.** Reproduce desde el paso en el que está: las fichas se desplazan a su sitio siguiente (unos 900 ms), hay una pausa corta y sigue. Al llegar al final se para; reproducir otra vez empieza desde el principio.
- **Paso anterior** y **paso siguiente**, sin animación.
- **Reiniciar.** Vuelve al primer paso y para.
- «Paso 2 de 4» y, debajo, la nota del paso.

Con «reducir movimiento», reproducir avanza de paso en paso sin desplazamiento. La pizarra tiene nombre para quien no la ve («Pizarra de 3 calles, paso 2 de 4») y la nota del paso se anuncia al cambiar.

`BoardThumb` es la misma pizarra en miniatura: el primer fotograma, sin etiquetas, controles ni movimientos.

## Dónde se ve

- **Ficha de un ejercicio.** Con pizarra, `Board`. Sin pizarra y con imagen subida, la imagen, como hoy. Sin ninguna de las dos, nada: se quita la pista vacía.
- **Sesión.** En la ficha de una sesión, la fila de un ejercicio con pizarra lleva su miniatura.
- **Directo.** Con pizarra, `Board`, que funciona sin conexión porque viaja con la sesión. Sin pizarra, la imagen o nada, como en la ficha. Además, bajo los puntos clave, **cómo se organiza** el ejercicio (`setup_md`), plegado por defecto.
- **Biblioteca.** La tarjeta de un ejercicio con pizarra enseña su miniatura en vez de la pista vacía.

## Seed

Pizarras ficticias para ocho ejercicios de Arcángel y uno de Club Demo, que cubren los cuatro movimientos, la media pista y la pista completa, una foto fija y una secuencia de cuatro pasos. Los demás ejercicios siguen sin pizarra, para que se vea también ese caso.

## Base de datos

Una migración:

- `alter table drills add column board jsonb`, con `check (board is null or (jsonb_typeof(board) = 'object' and board @> '{"version": 1}' and octet_length(board::text) <= 32768))`.
- Sin `grant` nuevo: `authenticated` la lee como el resto del ejercicio (la misma fila, la misma política) y no la escribe.
- `search_drills` devuelve `setof drills`: la columna llega sola.
- pgTAP: el `check` (ni un texto, ni otra versión, ni 40 kB), que `authenticated` no puede escribirla ni por la API directa, que `save_drill` la conserva, y que quien no ve el ejercicio tampoco ve su pizarra (otro club; un borrador ajeno). `posture.test.sql` al día.

## Qué no cambia

- El aislamiento entre clubes y las reglas de `CLAUDE.md`. La pizarra es una columna del ejercicio: la ve quien ve el ejercicio.
- El diagrama como imagen subida: sigue valiendo para los ejercicios que no tienen pizarra.
- `CourtPlay`, la portada del acceso.

## Pruebas

- **Unidad:** `parseBoard` (forma, límites, ids repetidos, movimiento de una ficha que no existe, coordenadas fuera de rango, lo que no es un objeto), `boardFrames` (cada movimiento, el balón que acompaña al bote, varios a la vez, sin pasos), `Board` (qué pinta en cada paso, controles, reproducir con temporizadores, final y reinicio, reducir movimiento, nombres accesibles, sin controles en una foto fija), `BoardThumb`, y las lecturas y pantallas que la reciben.
- **pgTAP:** lo de arriba.
- **E2E (375×812):** la ficha de un ejercicio con pizarra por pasos (reproducir, pausar, paso a paso, reiniciar); uno sin pizarra no enseña pista vacía; la miniatura en la biblioteca y en la sesión; el directo con pizarra, también sin conexión.
- **Cierre:** la suite entera desde una base vacía, repaso visual y revisión de la rama.

## Fuera de esta pieza

- El editor: crear, mover, dibujar, deshacer, duplicar (pieza 4). Hasta entonces un club solo tiene las pizarras del seed.
- Jugadas propias como entidad aparte de un ejercicio, y su biblioteca por situación (pieza 4).
- Metadatos nuevos de un ejercicio que pide la propuesta: nivel, fase, reglas, progresión y errores frecuentes.
- Notas de voz, recorrido de un jugador, exportar a PDF o vídeo (la propuesta lo deja para una segunda fase).
- Un reproductor de vídeo dentro del directo.

## Decisiones a confirmar

- Los cuatro movimientos y los cuatro tipos de ficha de la versión 1. No hay entrenador, zonas ni texto libre sobre la pista.
- La pista completa se dibuja apaisada.
- Sin pizarra ni imagen, la ficha y el directo no enseñan nada en ese hueco.
- La imagen subida se conserva como alternativa; si un ejercicio tiene las dos cosas, manda la pizarra.
- En el directo, cómo se organiza el ejercicio va plegado.
