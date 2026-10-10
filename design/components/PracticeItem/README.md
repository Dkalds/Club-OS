# PracticeItem

Un ítem de una sesión en el Practice Builder: fase, ejercicio y duración, reordenable.

**Intentional addition:** no está en la lista del brief; es la pieza que repite el Practice Builder y su ausencia obligaría a improvisarla.

**Qué aporta quien lo usa:** orden, fase (Activación, Técnica…: taxonomía del club), ejercicio (o un título libre), minutos y los callbacks de mover, cambiar duración y eliminar (deslizar o menú).

- Asa de arrastre a la izquierda (dnd-kit); los botones −/+ cambian la duración en pasos de 5 minutos y el total se recalcula al momento.
- Mientras se arrastra: `surface-3` + `shadow-sheet`.
- Accesible sin arrastrar: el menú del ítem ofrece «Subir» y «Bajar».
- Fila de total al final en `numeral`; la suma no se guarda, se calcula.
- Una fila que llega de una propuesta lleva una tercera línea en `body-s` e `ink-2`, bajo el título: por qué está ahí («Transición · 2 puntos clave · 1 variante»). Con ella la fila crece; no se guarda.
- Junto al total de la barra de guardado, en `body-s`, si lo montado no encaja con la franja: «Te sobran 10 min» o «Te pasas 10 min». Solo avisa.
