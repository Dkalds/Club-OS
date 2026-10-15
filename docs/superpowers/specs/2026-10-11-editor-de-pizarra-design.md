# Editor de pizarra · Diseño

Fecha: 11 oct 2026. Estado: alcance aprobado por el propietario en conversación el 11 oct 2026 («La pizarra de un ejercicio» y «Completo por pasos»). Es la pieza 4 de la «Propuesta de evolución para CLUB OS» (§4, «Editor para crear jugadas propias»); la tabla de las diez piezas está en `2026-10-10-uso-diario-design.md`. Va encima de la pieza 3 (Dkalds/Club-OS#18).

## Propósito

Que quien entrena dibuje sus propias pizarras, en el móvil y sin exportar capturas:

- Colocar y mover jugadores, defensores, balón y conos.
- Al tocar un jugador, elegir qué hace: cortar, botar, bloquear; al tocar el balón, pasarlo.
- Construir la jugada por pasos, con duplicar paso, deshacer y rehacer.
- Verla reproducida antes de guardar.

## Decisiones tomadas

Con el propietario, el 11 oct 2026:

1. **Una jugada es un ejercicio con pizarra.** El editor dibuja la pizarra de un ejercicio de la biblioteca. Así una jugada ya se busca, se añade a una sesión y se ve en el directo. La jugada como entidad propia (con situación, biblioteca por equipo y preparación de partidos) queda para cuando exista la estructura del club (pieza 5).
2. **El editor es completo por pasos**: fichas, las cuatro acciones, varios pasos con duplicar, deshacer y rehacer, y vista previa. Sin plantillas de partida.

Las demás las toma este diseño; las que el propietario podría querer distintas están en «Decisiones a confirmar».

## Dónde está

Una pantalla nueva, `/c/{club}/drills/{id}/board`, a la que se llega desde la ficha del ejercicio («Dibujar pizarra» si no tiene, «Editar pizarra» si tiene) y desde el campo «Diagrama» de su formulario. La abre quien puede editar el ejercicio: la dirección, y quien entrena en un borrador propio (lo mismo que «Editar»). Los demás, el 404 de siempre.

## Cómo se dibuja

La pantalla es la pista (la del visor, con el mismo dibujo) y, debajo, lo que se puede hacer.

- **Los pasos.** Una fila con «Inicio», «Paso 1», «Paso 2»… e «+ Paso». «Inicio» es dónde empieza cada ficha. Un paso enseña las fichas donde están al empezarlo y los movimientos de ese paso.
- **Colocar fichas** (solo en «Inicio»). Cuatro botones: «Atacante», «Defensor», «Balón» y «Cono». La ficha nueva aparece en un sitio libre y se arrastra a su sitio. Los atacantes y los defensores se numeran solos (el menor número libre, del 1 al 9).
- **Mover una ficha** (solo en «Inicio»). Se arrastra con el dedo (el arrastre empieza al mover 6 px; menos es un toque). Sin arrastrar: se elige la ficha y se mueve con cuatro botones de flecha. Quien lleva el balón se lo lleva consigo.
- **Tocar una ficha** la elige y enseña lo que puede hacer:
  - Un jugador, en un paso: «Cortar», «Botar» y «Bloquear». El balón: «Pasar». A quien lleva el balón también se le ofrece «Pasar» (el movimiento es del balón), y tocar a un jugador como destino del pase le deja el balón a él.
  - Elegida la acción, se toca la pista donde acaba: ahí queda dibujado el movimiento. Sin tocar la pista, el destino se mueve con los botones de flecha y «Confirmar». Un destino tan cerca que el movimiento no se dibujaría no se guarda, y se dice.
  - Si la ficha ya se mueve en ese paso: «Quitar movimiento». Elegir otra acción lo sustituye.
  - En «Inicio»: «Quitar ficha» (y con ella sus movimientos).
- **Pasos.** «+ Paso» añade uno detrás del que se ve; «Duplicar paso» lo copia detrás, repitiendo el gesto de cada ficha desde donde quedó; «Quitar paso» lo quita. Cada paso tiene su nota (140 caracteres). Un paso sin movimientos no se guarda: al guardar se descartan los vacíos.
- **Pista.** «Media pista» o «Pista completa». Cambiarla no mueve las fichas de sitio en sus coordenadas: se recolocan a mano.
- **Deshacer y rehacer**, de todo lo anterior, hasta 50 cambios.
- **Vista previa.** Enseña la pizarra en el visor (`Board`), con sus controles, tal como se verá.
- **Guardar.** Guarda la pizarra del ejercicio y vuelve a su ficha. Con cambios sin guardar, salir pregunta. «Quitar pizarra» la borra, con confirmación; guardar sin fichas una pizarra que existía pasa por la misma confirmación.

Los topes son los de la pieza 3 (24 fichas, 12 pasos, 12 movimientos por paso): al llegar, el botón se desactiva y dice por qué.

## El modelo no cambia

La pizarra que se guarda es la de la versión 1 (`Board`), la misma que lee el visor. El editor trabaja sobre ella con un reductor puro (`src/modules/board/editor.ts`): cada cambio es una función de pizarra a pizarra, fácil de probar y de deshacer. Lo que el editor no deja hacer (un pase que no es del balón, mover dos veces la misma ficha en un paso) ya lo rechazaba `parseBoard`.

Al quitar una ficha se van sus movimientos. Al quitar un movimiento o un paso, las posiciones de los pasos siguientes se recalculan solas: no se guardan, se calculan (`boardFrames`).

## Base de datos

Una migración:

- `grant update (board) on drills to authenticated` (C17): lo que la app escribe se concede.
- `save_drill_board(p_drill uuid, p_expected_updated_at timestamptz, p_board jsonb default null) returns timestamptz`, `security invoker`: `NOT_FOUND` si el ejercicio no se ve o no se puede editar (`private.can_edit_drill`); `STALE_COPY` si alguien lo guardó antes; `INVALID` si la pizarra no pasa el `check`. Con `p_board` ausente, la quita. Devuelve el `updated_at` nuevo. Mueve la copia del ejercicio: el formulario abierto en otro móvil recibe `STALE_COPY`.
- La forma entera la valida la acción con `parseBoard` antes de llamar, y la sigue validando quien lee.
- pgTAP: quién guarda (dirección; autor de su borrador) y quién no (otro entrenador, otro club, un publicado ajeno, un jugador); la copia obsoleta; quitarla; que `save_drill` sigue sin tocarla. `posture.test.sql` al día.

## Qué no cambia

- El aislamiento entre clubes y las reglas de `CLAUDE.md`. Quién edita una pizarra es quién edita su ejercicio.
- El visor (`Board`, `BoardThumb`) y las pantallas que lo usan.
- La imagen subida como diagrama: sigue valiendo para los ejercicios sin pizarra.

## Pruebas

- **Unidad:** el reductor entero (cada acción, los topes, la numeración, quitar en cascada, deshacer y rehacer, que lo que produce siempre pasa `parseBoard`); el paso de la pantalla a unidades de pista (`fromBox`); la acción (permiso, club, validación, errores); el editor (colocar, arrastrar, elegir acción y destino, pasos, teclado, vista previa, guardar, salir con cambios).
- **pgTAP:** lo de arriba.
- **E2E (375×812):** dibujar una pizarra desde cero en un ejercicio propio (fichas, pase, corte, dos pasos), previsualizarla, guardarla y verla en la ficha; editarla y deshacer; quitarla; otra persona sin permiso no entra.
- **Cierre:** la suite entera desde una base vacía, repaso visual y revisión de la rama.

## Fuera de esta pieza

- La jugada como entidad propia: situación (saque de fondo, banda…), biblioteca por equipo, preparación de partidos, compartir en lectura con jugadores (pieza 5 en adelante).
- Plantillas de partida (5 abiertos, saque de fondo…).
- Trayectorias curvas, zonas, texto libre sobre la pista y entrenador como ficha.
- Notas de voz, recorrido de un jugador, exportar a PDF o vídeo.

## Decisiones a confirmar

- Las fichas solo se colocan y se mueven en «Inicio»; en un paso, una ficha cambia de sitio dibujándole un movimiento.
- La acción se elige primero y el destino después (dos toques), en vez de arrastrar una flecha.
- Un paso vacío se descarta al guardar, sin avisar.
- Quien edita la pizarra es quien edita el ejercicio; un publicado solo lo cambia la dirección.
