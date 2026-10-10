# Board

La pizarra de un ejercicio: la pista con sus jugadores, el balón, los conos y los movimientos, por pasos. Es el diagrama de pista del producto con contenido, y se dibuja a partir de datos, no de una imagen.

**Intentional addition:** no está en la lista del brief; sustituye a la pista vacía y a la imagen subida allí donde un ejercicio tiene pizarra.

**Qué aporta quien lo usa:** la pizarra (pista, fichas y pasos) y el título del ejercicio, que le da nombre para quien no la ve.

- El dibujo es el de «Diagramas de pista»: líneas de pista en `ink-3`, atacantes como círculos en `ink` con su número dentro, defensores como X en `brand-accent` con el suyo al lado, balón como punto relleno en `ink` y conos como triángulos en `ink-3`.
- Movimientos en `brand-accent`: continuo con punta el corte, en onda con punta el bote, discontinuo con punta el pase y continuo acabado en una barra el bloqueo.
- Trazos: 1.2 la pista y los conos, 1.6 atacantes y movimientos, 1.8 las X. No engordan al agrandar la caja.
- Media pista en la caja 4:3 de siempre, con el aro arriba. Pista completa apaisada (25:14), con el aro de ataque a la izquierda. Fondo `surface-1`, borde `line`, `radius-lg`.
- El balón que lleva un jugador se pinta pegado a él, abajo a la derecha: nunca le tapa el número.
- Cada paso enseña las fichas donde están al empezarlo y los movimientos de ese paso. Tras el último queda el final, sin movimientos.
- Controles, de 44 px, bajo la pista y solo si la pizarra tiene pasos: reiniciar, paso anterior, reproducir o pausar, paso siguiente. Son solo icono, y su nombre dice «la pizarra» («Reproducir la pizarra»): en el directo conviven con los controles de la sesión. A la derecha, «Paso 2 de 4» (o «Final») en `body-s`. Debajo, la nota del paso en `body` e `ink-2`.
- Movimiento: al reproducir, cada paso se enseña 700 ms y las fichas se desplazan en 900 ms. Con «reducir movimiento», saltan a su sitio. Es movimiento con función, no decorativo: explica la acción.
- Una pizarra sin pasos es una foto fija: solo el dibujo, sin controles.
- Miniatura (`BoardThumb`): el primer momento de la pizarra en 80×60, `surface-2`, `radius-sm`, sin números, movimientos ni controles. Ocupa el sitio de la pista vacía en la tarjeta de un ejercicio y en la fila de una sesión.
- Un ejercicio sin pizarra no enseña una pista vacía a tamaño completo: no enseña nada en ese hueco.

## En el editor

El editor dibuja sobre la misma pista, con el mismo dibujo. Lo que añade:

- La ficha elegida lleva un anillo discontinuo en `brand-accent`. Cada ficha es un botón con nombre («Atacante 1», «Balón») y un área táctil de 44 px, salvo el balón que lleva un jugador: su área es solo el balón, para no tapar la del jugador.
- El movimiento que se está decidiendo se ve atenuado, con su destino en un círculo discontinuo, hasta que se confirma tocando la pista.
- Bajo la pista, los pasos como píldoras («Inicio», «Paso 1»…, «+ Paso»), con la activa en `brand-accent-soft`; después, lo que se puede hacer con lo elegido, en botones `secondary` (y `danger` para quitar); y al final «Deshacer», «Rehacer», «Vista previa» y el `primary` de la pantalla, «Guardar pizarra».
- Mover sin arrastrar: cuatro botones de flecha de 44 px, redondos, con borde `line`.
